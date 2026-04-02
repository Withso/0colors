// ═══════════════════════════════════════════════════════════════════
// AI Build Mode — Agentic Loop
// Orchestrates multi-turn tool calling: stream a response, execute
// tool calls (with optional user confirmation), send results back
// to the AI, and repeat until the AI produces a final text response.
// ═══════════════════════════════════════════════════════════════════

import type { AIProviderConfig } from './ai-provider';
import { streamBuildTurn, type BuildMessage, type StreamTurnResult, type BuildStreamCallbacks } from './ai-build-stream';
import { getAnthropicTools, getOpenAITools, describeToolCall, type ToolCall, type ToolResult } from './ai-build-tools';
import { executeToolCall, type MutationContext } from './ai-build-executor';

// ── Loop configuration ─────────────────────────────────────────────

const MAX_ITERATIONS = 10;

// ── Loop callbacks (for UI updates) ────────────────────────────────

export interface BuildLoopCallbacks {
  /** Text token streamed from the AI */
  onToken: (token: string) => void;
  /** AI wants to execute these tool calls — shown as preview */
  onToolCallsPending: (toolCalls: ToolCall[], descriptions: string[]) => void;
  /** A tool call started streaming */
  onToolCallStart: (id: string, name: string) => void;
  /** A tool call was executed — result shown in action log */
  onToolCallExecuted: (toolCall: ToolCall, result: ToolResult) => void;
  /** The full turn (text + executed tools) completed */
  onTurnComplete: (text: string, toolResults: ToolResult[]) => void;
  /** The entire loop is done — final response */
  onDone: (fullText: string) => void;
  /** Error during the loop */
  onError: (error: string) => void;
  /** Rate limit retry */
  onRetry?: (waitSeconds: number, attempt: number, maxAttempts: number) => void;
  /** Request user confirmation for pending tool calls.
   *  Returns true if user approved, false if skipped/cancelled.
   *  If not provided, tool calls execute immediately. */
  onRequestConfirmation?: (toolCalls: ToolCall[], descriptions: string[]) => Promise<'apply' | 'skip' | 'cancel'>;
  /** Called when project context needs refreshing between iterations */
  onRefreshContext?: () => string;
}

// ── Main loop function ─────────────────────────────────────────────

export async function runBuildConversation(
  messages: BuildMessage[],
  config: AIProviderConfig,
  mutationCtx: MutationContext,
  callbacks: BuildLoopCallbacks,
  abortSignal: AbortSignal,
  maxTokens?: number,
): Promise<void> {
  // Select tool format based on provider
  const tools = config.type === 'anthropic' ? getAnthropicTools() : getOpenAITools();

  // Working copy of messages — grows with each tool call round
  const conversationMessages: BuildMessage[] = [...messages];
  let fullResponseText = '';
  let iteration = 0;

  while (iteration < MAX_ITERATIONS) {
    if (abortSignal.aborted) return;
    iteration++;

    // ── Stream one turn ──
    const streamCallbacks: BuildStreamCallbacks = {
      onToken: callbacks.onToken,
      onToolCallStart: callbacks.onToolCallStart,
      onToolCallComplete: () => {}, // handled after turn completes
      onError: callbacks.onError,
      onRetry: callbacks.onRetry,
    };

    let turnResult: StreamTurnResult;
    try {
      turnResult = await streamBuildTurn(
        conversationMessages,
        tools,
        config,
        streamCallbacks,
        abortSignal,
        maxTokens,
      );
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      callbacks.onError(err?.message || 'Unknown error during streaming');
      return;
    }

    if (abortSignal.aborted) return;

    fullResponseText += turnResult.text;

    // ── No tool calls → done ──
    if (turnResult.toolCalls.length === 0) {
      callbacks.onDone(fullResponseText);
      return;
    }

    // ── Tool calls present → process them ──
    const descriptions = turnResult.toolCalls.map(tc => describeToolCall(tc.name, tc.arguments));
    callbacks.onToolCallsPending(turnResult.toolCalls, descriptions);

    // ── User confirmation (if callback provided) ──
    if (callbacks.onRequestConfirmation) {
      const decision = await callbacks.onRequestConfirmation(turnResult.toolCalls, descriptions);
      if (abortSignal.aborted) return;

      if (decision === 'cancel') {
        callbacks.onDone(fullResponseText);
        return;
      }

      if (decision === 'skip') {
        // Tell the AI the user skipped these tool calls
        const assistantMsg = buildAssistantMessage(turnResult, config.type);
        conversationMessages.push(assistantMsg);

        for (const tc of turnResult.toolCalls) {
          conversationMessages.push(buildToolResultMessage(tc.id, {
            toolCallId: tc.id,
            success: false,
            error: 'User declined this action.',
          }, config.type));
        }
        // Continue loop — AI will respond to the skip
        continue;
      }
    }

    // ── Execute tool calls ──
    const toolResults: ToolResult[] = [];

    // Add assistant message with tool_use blocks to conversation
    const assistantMsg = buildAssistantMessage(turnResult, config.type);
    conversationMessages.push(assistantMsg);

    for (const tc of turnResult.toolCalls) {
      if (abortSignal.aborted) return;

      const result = executeToolCall(tc, mutationCtx);
      toolResults.push(result);
      callbacks.onToolCallExecuted(tc, result);

      // Add tool result to conversation
      conversationMessages.push(buildToolResultMessage(tc.id, result, config.type));
    }

    callbacks.onTurnComplete(turnResult.text, toolResults);

    // ── Refresh project context for next iteration ──
    if (callbacks.onRefreshContext) {
      // Small delay to let React state settle
      await new Promise(resolve => setTimeout(resolve, 50));
      const freshContext = callbacks.onRefreshContext();
      // Update the system message with fresh context
      const systemIdx = conversationMessages.findIndex(m => m.role === 'system');
      if (systemIdx >= 0 && typeof conversationMessages[systemIdx].content === 'string') {
        // Replace the project context section in the system prompt
        const currentSystem = conversationMessages[systemIdx].content as string;
        const contextMarker = '--- NODES';
        const markerIdx = currentSystem.indexOf(contextMarker);
        if (markerIdx >= 0) {
          const newMarkerIdx = freshContext.indexOf(contextMarker);
          if (newMarkerIdx >= 0) {
            conversationMessages[systemIdx] = {
              ...conversationMessages[systemIdx],
              content: currentSystem.slice(0, markerIdx) + freshContext.slice(newMarkerIdx),
            };
          }
        }
      }
    }

    // ── If stop reason was not tool_use, we're done ──
    if (turnResult.stopReason !== 'tool_use') {
      callbacks.onDone(fullResponseText);
      return;
    }

    // Otherwise, loop continues — AI will see tool results and respond
  }

  // Max iterations reached
  callbacks.onDone(fullResponseText + '\n\n(Reached maximum number of build steps)');
}

// ── Message builders ───────────────────────────────────────────────

function buildAssistantMessage(turn: StreamTurnResult, providerType: string): BuildMessage {
  if (providerType === 'anthropic') {
    // Anthropic expects content as an array of blocks
    const content: any[] = [];
    if (turn.text) {
      content.push({ type: 'text', text: turn.text });
    }
    for (const tc of turn.toolCalls) {
      content.push({
        type: 'tool_use',
        id: tc.id,
        name: tc.name,
        input: tc.arguments,
      });
    }
    return { role: 'assistant', content };
  } else {
    // OpenAI format
    return {
      role: 'assistant',
      content: turn.text || '',
      tool_calls: turn.toolCalls.map(tc => ({
        id: tc.id,
        type: 'function',
        function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
      })),
    };
  }
}

function buildToolResultMessage(toolCallId: string, result: ToolResult, providerType: string): BuildMessage {
  const content = result.success
    ? JSON.stringify(result.result || { success: true })
    : JSON.stringify({ error: result.error });

  if (providerType === 'anthropic') {
    // Anthropic: tool results are sent as user messages with tool_result content
    return {
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: toolCallId, content }],
    };
  } else {
    return {
      role: 'tool',
      tool_call_id: toolCallId,
      content,
    };
  }
}
