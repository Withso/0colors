// ═══════════════════════════════════════════════════════════════════
// AI Build Mode — Tool-Aware Streaming
// Extends the base streaming to handle tool_use (Anthropic) and
// tool_calls (OpenAI) in the SSE stream. Used by the agentic loop.
// ═══════════════════════════════════════════════════════════════════

import type { AIProviderConfig, ChatMessage } from './ai-provider';
import type { ToolCall } from './ai-build-tools';

// ── Types ──────────────────────────────────────────────────────────

/** Result of a single streaming turn — text content + any tool calls */
export interface StreamTurnResult {
  text: string;
  toolCalls: ToolCall[];
  stopReason: 'end_turn' | 'tool_use' | 'stop' | 'length' | 'unknown';
}

export interface BuildStreamCallbacks {
  onToken: (token: string) => void;
  onToolCallStart: (id: string, name: string) => void;
  onToolCallComplete: (toolCall: ToolCall) => void;
  onError: (error: string) => void;
  onRetry?: (waitSeconds: number, attempt: number, maxAttempts: number) => void;
}

// ── Anthropic tool definitions format ──────────────────────────────

interface AnthropicTool {
  name: string;
  description: string;
  input_schema: Record<string, any>;
}

// ── OpenAI tool definitions format ─────────────────────────────────

interface OpenAITool {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, any> };
}

// ── Message format helpers ─────────────────────────────────────────
// Build Mode messages can contain tool_use and tool_result blocks in
// addition to plain text. These helpers convert between our internal
// ChatMessage format and the provider-specific API formats.

export interface BuildMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string | any[];
  // OpenAI-specific
  tool_calls?: any[];
  tool_call_id?: string;
}

/** Convert ChatMessage[] to Anthropic message format (supports tool blocks) */
function toAnthropicMessages(messages: BuildMessage[]): { system: string; messages: any[] } {
  const systemMsg = messages.find(m => m.role === 'system')?.content as string || '';
  const chatMsgs: any[] = [];

  for (const m of messages) {
    if (m.role === 'system') continue;

    if (m.role === 'tool') {
      // Tool result → Anthropic format
      chatMsgs.push({
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: m.tool_call_id,
          content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
        }],
      });
    } else if (m.role === 'assistant' && Array.isArray(m.content)) {
      // Assistant message with tool_use blocks
      chatMsgs.push({ role: 'assistant', content: m.content });
    } else if (m.role === 'assistant' && m.tool_calls) {
      // Convert from our internal format to Anthropic content blocks
      const content: any[] = [];
      if (typeof m.content === 'string' && m.content) {
        content.push({ type: 'text', text: m.content });
      }
      for (const tc of m.tool_calls) {
        content.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.function?.name || tc.name,
          input: typeof tc.function?.arguments === 'string'
            ? JSON.parse(tc.function.arguments)
            : (tc.arguments || tc.function?.arguments || {}),
        });
      }
      chatMsgs.push({ role: 'assistant', content });
    } else {
      chatMsgs.push({ role: m.role, content: m.content });
    }
  }

  return { system: systemMsg, messages: chatMsgs };
}

/** Convert ChatMessage[] to OpenAI message format (supports tool_calls) */
function toOpenAIMessages(messages: BuildMessage[]): any[] {
  const result: any[] = [];
  for (const m of messages) {
    if (m.role === 'tool') {
      result.push({
        role: 'tool',
        tool_call_id: m.tool_call_id,
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
      });
    } else if (m.role === 'assistant' && m.tool_calls) {
      result.push({
        role: 'assistant',
        content: typeof m.content === 'string' ? m.content : null,
        tool_calls: m.tool_calls.map(tc => ({
          id: tc.id,
          type: 'function',
          function: {
            name: tc.function?.name || tc.name,
            arguments: typeof tc.function?.arguments === 'string'
              ? tc.function.arguments
              : JSON.stringify(tc.arguments || tc.function?.arguments || {}),
          },
        })),
      });
    } else {
      result.push({ role: m.role, content: m.content });
    }
  }
  return result;
}

// ── Rate limit helpers (shared with ai-provider.ts) ────────────────

const MAX_RETRIES = 3;

function parseRetryAfter(response: Response): number {
  const retryAfter = response.headers.get('retry-after');
  if (retryAfter) {
    const seconds = parseFloat(retryAfter);
    if (!isNaN(seconds) && seconds > 0) return Math.min(seconds, 60);
  }
  return 0;
}

async function sleepMs(ms: number, signal?: AbortSignal): Promise<boolean> {
  return new Promise(resolve => {
    if (signal?.aborted) { resolve(false); return; }
    const timer = setTimeout(() => resolve(true), ms);
    signal?.addEventListener('abort', () => { clearTimeout(timer); resolve(false); }, { once: true });
  });
}

// ═══════════════════════════════════════════════════════════════════
// streamBuildTurn — one streaming API call that handles both text
// and tool calls. Returns a StreamTurnResult.
// ═══════════════════════════════════════════════════════════════════

export async function streamBuildTurn(
  messages: BuildMessage[],
  tools: AnthropicTool[] | OpenAITool[],
  config: AIProviderConfig,
  callbacks: BuildStreamCallbacks,
  abortSignal?: AbortSignal,
  maxTokens?: number,
): Promise<StreamTurnResult> {
  const responseMax = maxTokens ?? 4096;

  if (config.type === 'anthropic') {
    return streamAnthropicWithTools(messages, tools as AnthropicTool[], config, callbacks, abortSignal, responseMax);
  } else {
    return streamOpenAIWithTools(messages, tools as OpenAITool[], config, callbacks, abortSignal, responseMax);
  }
}

// ═══════════════════════════════════════════════════════════════════
// Anthropic Tool-Aware Streaming
// Parses: content_block_start (tool_use), input_json_delta,
//         content_block_delta (text), message_delta (stop_reason)
// ═══════════════════════════════════════════════════════════════════

async function streamAnthropicWithTools(
  messages: BuildMessage[],
  tools: AnthropicTool[],
  config: AIProviderConfig,
  callbacks: BuildStreamCallbacks,
  abortSignal?: AbortSignal,
  maxTokens?: number,
): Promise<StreamTurnResult> {
  const { system, messages: apiMsgs } = toAnthropicMessages(messages);

  const response = await fetch(`${config.baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: maxTokens ?? 4096,
      system,
      messages: apiMsgs,
      tools,
      stream: true,
    }),
    signal: abortSignal,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    const errMsg = tryParseProviderError(response.status, body);
    callbacks.onError(errMsg);
    return { text: '', toolCalls: [], stopReason: 'unknown' };
  }

  const reader = response.body?.getReader();
  if (!reader) {
    callbacks.onError('No response body');
    return { text: '', toolCalls: [], stopReason: 'unknown' };
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  let stopReason: StreamTurnResult['stopReason'] = 'end_turn';

  // Tool call accumulation
  const toolCalls: ToolCall[] = [];
  let currentToolId = '';
  let currentToolName = '';
  let currentToolArgsJson = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ')) continue;
      const data = trimmed.slice(6);

      try {
        const event = JSON.parse(data);

        switch (event.type) {
          case 'content_block_start':
            if (event.content_block?.type === 'tool_use') {
              currentToolId = event.content_block.id;
              currentToolName = event.content_block.name;
              currentToolArgsJson = '';
              callbacks.onToolCallStart(currentToolId, currentToolName);
            }
            break;

          case 'content_block_delta':
            if (event.delta?.type === 'text_delta' && event.delta.text) {
              fullText += event.delta.text;
              callbacks.onToken(event.delta.text);
            } else if (event.delta?.type === 'input_json_delta' && event.delta.partial_json) {
              currentToolArgsJson += event.delta.partial_json;
            }
            break;

          case 'content_block_stop':
            if (currentToolId && currentToolName) {
              let args: Record<string, any> = {};
              try { args = JSON.parse(currentToolArgsJson); } catch {}
              const tc: ToolCall = { id: currentToolId, name: currentToolName, arguments: args };
              toolCalls.push(tc);
              callbacks.onToolCallComplete(tc);
              currentToolId = '';
              currentToolName = '';
              currentToolArgsJson = '';
            }
            break;

          case 'message_delta':
            if (event.delta?.stop_reason) {
              stopReason = event.delta.stop_reason === 'tool_use' ? 'tool_use'
                : event.delta.stop_reason === 'end_turn' ? 'end_turn'
                : event.delta.stop_reason === 'max_tokens' ? 'length'
                : 'stop';
            }
            break;
        }
      } catch {}
    }
  }

  return { text: fullText, toolCalls, stopReason };
}

// ═══════════════════════════════════════════════════════════════════
// OpenAI Tool-Aware Streaming
// Parses: choices[0].delta.tool_calls (incremental),
//         choices[0].delta.content (text),
//         choices[0].finish_reason
// ═══════════════════════════════════════════════════════════════════

async function streamOpenAIWithTools(
  messages: BuildMessage[],
  tools: OpenAITool[],
  config: AIProviderConfig,
  callbacks: BuildStreamCallbacks,
  abortSignal?: AbortSignal,
  maxTokens?: number,
): Promise<StreamTurnResult> {
  const apiMsgs = toOpenAIMessages(messages);

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (abortSignal?.aborted) return { text: '', toolCalls: [], stopReason: 'unknown' };

    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey ? { 'Authorization': `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: config.model,
        messages: apiMsgs,
        tools,
        stream: true,
        max_tokens: maxTokens ?? 4096,
      }),
      signal: abortSignal,
    });

    if (response.status === 429 && attempt < MAX_RETRIES) {
      const retryAfterSec = parseRetryAfter(response) || (Math.pow(2, attempt) * 5);
      const waitSeconds = Math.ceil(retryAfterSec);
      callbacks.onRetry?.(waitSeconds, attempt + 1, MAX_RETRIES);
      const continued = await sleepMs(waitSeconds * 1000, abortSignal);
      if (!continued) return { text: '', toolCalls: [], stopReason: 'unknown' };
      continue;
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      callbacks.onError(tryParseProviderError(response.status, body));
      return { text: '', toolCalls: [], stopReason: 'unknown' };
    }

    const reader = response.body?.getReader();
    if (!reader) {
      callbacks.onError('No response body');
      return { text: '', toolCalls: [], stopReason: 'unknown' };
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';
    let stopReason: StreamTurnResult['stopReason'] = 'stop';

    // OpenAI streams tool_calls as incremental chunks indexed by position
    const toolCallMap: Map<number, { id: string; name: string; argsJson: string }> = new Map();
    const announcedTools = new Set<number>();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') break;

        try {
          const parsed = JSON.parse(data);
          const choice = parsed.choices?.[0];
          if (!choice) continue;

          // Text content
          const textDelta = choice.delta?.content;
          if (textDelta) {
            fullText += textDelta;
            callbacks.onToken(textDelta);
          }

          // Tool calls (incremental)
          const deltaToolCalls = choice.delta?.tool_calls;
          if (deltaToolCalls && Array.isArray(deltaToolCalls)) {
            for (const dtc of deltaToolCalls) {
              const idx = dtc.index ?? 0;
              let entry = toolCallMap.get(idx);
              if (!entry) {
                entry = { id: dtc.id || '', name: '', argsJson: '' };
                toolCallMap.set(idx, entry);
              }
              if (dtc.id) entry.id = dtc.id;
              if (dtc.function?.name) entry.name = dtc.function.name;
              if (dtc.function?.arguments) entry.argsJson += dtc.function.arguments;

              // Announce tool call start when we first see the name
              if (entry.name && !announcedTools.has(idx)) {
                announcedTools.add(idx);
                callbacks.onToolCallStart(entry.id, entry.name);
              }
            }
          }

          // Finish reason
          if (choice.finish_reason) {
            stopReason = choice.finish_reason === 'tool_calls' ? 'tool_use'
              : choice.finish_reason === 'stop' ? 'stop'
              : choice.finish_reason === 'length' ? 'length'
              : 'end_turn';
          }
        } catch {}
      }
    }

    // Finalize tool calls
    const toolCalls: ToolCall[] = [];
    for (const [, entry] of toolCallMap) {
      let args: Record<string, any> = {};
      try { args = JSON.parse(entry.argsJson); } catch {}
      const tc: ToolCall = { id: entry.id, name: entry.name, arguments: args };
      toolCalls.push(tc);
      callbacks.onToolCallComplete(tc);
    }

    return { text: fullText, toolCalls, stopReason };
  }

  return { text: '', toolCalls: [], stopReason: 'unknown' };
}

// ── Error helper ───────────────────────────────────────────────────

function tryParseProviderError(status: number, body: string): string {
  try {
    const json = JSON.parse(body);
    const msg = json.error?.message || json.message || body.slice(0, 200);
    return `API error ${status}: ${msg}`;
  } catch {
    return `API error ${status}: ${body.slice(0, 200)}`;
  }
}
