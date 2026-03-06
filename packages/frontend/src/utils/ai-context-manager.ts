// ═══════════════════════════════════════════════════════════════════
// AI Context Manager
// User-selected tier (Small / Medium / Large) controls how much
// context we send: knowledge base size, project detail, conversation
// history depth, and max response tokens.
//
// We do NOT auto-detect model context windows or provider rate limits.
// If the chosen tier exceeds the model's capacity, the API will
// return an error — which is shown clearly in the chat UI.
// ═══════════════════════════════════════════════════════════════════

import { AI_KNOWLEDGE_BASE, AI_KNOWLEDGE_BASE_COMPACT } from './ai-knowledge-base';
import type { ChatMessage, ContextToggles } from './ai-provider';

// ── Token estimation ────────────────────────────────────────────
// Rough heuristic: ~4 chars per token for English text.
// Intentionally conservative (overestimates slightly).

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 3.8);
}

export function estimateCharsFromTokens(tokens: number): number {
  return Math.floor(tokens * 3.8);
}

/** Get the raw knowledge base text for a given tier (for token counting in UI) */
export function getKnowledgeBaseText(tier: ContextTier): string {
  const budget = getContextBudget(tier);
  return budget.useCompactKB ? AI_KNOWLEDGE_BASE_COMPACT : AI_KNOWLEDGE_BASE;
}

// ── Context Tiers ───────────────────────────────────────────────
// The user picks one of three tiers. Each defines a fixed budget
// for knowledge base, project context, conversation history, and
// max response tokens. Simple. No auto-detection.

export type ContextTier = 'small' | 'medium' | 'large';

export interface ContextBudget {
  tier: ContextTier;
  totalBudget: number;             // Total tokens we'll send (input + output)
  knowledgeBase: number;           // Budget for knowledge base
  projectContext: number;          // Budget for project context
  conversationHistory: number;     // Budget for conversation history
  maxResponseTokens: number;       // max_tokens for response generation
  useCompactKB: boolean;           // Whether to use compact knowledge base
}

/**
 * Fixed budgets per tier.
 *
 * Small  (~4K input)   — compact KB, minimal project, short conversations
 * Medium (~16K input)  — full KB, standard project, good conversation memory
 * Large  (~48K input)  — full KB, detailed project, long conversation memory
 */
export function getContextBudget(tier: ContextTier): ContextBudget {
  switch (tier) {
    case 'small':
      return {
        tier,
        totalBudget: 5000,
        knowledgeBase: 500,
        projectContext: 800,
        conversationHistory: 2700,
        maxResponseTokens: 1024,
        useCompactKB: true,
      };
    case 'medium':
      return {
        tier,
        totalBudget: 18000,
        knowledgeBase: 1300,
        projectContext: 2500,
        conversationHistory: 12200,
        maxResponseTokens: 2048,
        useCompactKB: false,
      };
    case 'large':
      return {
        tier,
        totalBudget: 52000,
        knowledgeBase: 1300,
        projectContext: 5000,
        conversationHistory: 41600,
        maxResponseTokens: 4096,
        useCompactKB: false,
      };
  }
}

/** Human-readable tier descriptions for the UI */
export const TIER_INFO: Record<ContextTier, { label: string; description: string; detail: string }> = {
  small: {
    label: 'Small',
    description: 'Minimal context for lightweight models',
    detail: 'Compact knowledge base, brief project info, short conversation memory. ~5K tokens. Best for models with small context windows or strict rate limits.',
  },
  medium: {
    label: 'Medium',
    description: 'Balanced for most models',
    detail: 'Full knowledge base, standard project context, good conversation history. ~18K tokens. Works well with most modern models.',
  },
  large: {
    label: 'Large',
    description: 'Maximum context for powerful models',
    detail: 'Full knowledge base, detailed project info, long conversation memory. ~52K tokens. Use with models that have large context windows (64K+).',
  },
};

// ── Progressive system prompt builder ───────────────────────────

export interface SystemPromptInput {
  projectContext: string;
  tier: ContextTier;
  includeKnowledgeBase?: boolean;
}

export interface ContextStats {
  tier: ContextTier;
  knowledgeBaseTokens: number;
  projectContextTokens: number;
  tailInstructionTokens: number;
  totalSystemPromptTokens: number;
  budgetRemaining: number;
}

/**
 * Build the system prompt with appropriate knowledge base and
 * project context, respecting the tier's budget.
 */
export function buildSystemPrompt(input: SystemPromptInput): {
  systemPrompt: string;
  budget: ContextBudget;
  stats: ContextStats;
} {
  const budget = getContextBudget(input.tier);
  const includeKB = input.includeKnowledgeBase !== false;

  // Select knowledge base variant (or skip if toggled off)
  let kb = '';
  let kbTokens = 0;
  if (includeKB) {
    kb = budget.useCompactKB ? AI_KNOWLEDGE_BASE_COMPACT : AI_KNOWLEDGE_BASE;
    kbTokens = estimateTokens(kb);
  }

  // Truncate project context to budget
  const maxProjectChars = estimateCharsFromTokens(budget.projectContext);
  let projectContext = input.projectContext;
  if (projectContext.length > maxProjectChars) {
    projectContext = truncateProjectContext(projectContext, maxProjectChars);
  }
  const projectTokens = estimateTokens(projectContext);

  // Tail instruction (only if we have some context)
  let tailInstruction = '';
  if (includeKB || projectContext) {
    tailInstruction = budget.useCompactKB
      ? 'Use the project context above to give specific answers. Reference actual node/token names. Be concise.'
      : 'IMPORTANT: You have full context of the user\'s current project above. Use it to give specific, actionable answers. Reference their actual node names, token names, and settings when relevant. Be concise and helpful.';
  } else {
    tailInstruction = 'You are a helpful AI assistant for 0colors, a node-based color design token tool. Be concise and helpful.';
  }
  const tailTokens = estimateTokens(tailInstruction);

  // Assemble — only include non-empty parts
  const parts = [kb, projectContext, tailInstruction].filter(Boolean);
  const systemPrompt = parts.join('\n\n');
  const totalTokens = kbTokens + projectTokens + tailTokens;

  return {
    systemPrompt,
    budget,
    stats: {
      tier: budget.tier,
      knowledgeBaseTokens: kbTokens,
      projectContextTokens: projectTokens,
      tailInstructionTokens: tailTokens,
      totalSystemPromptTokens: totalTokens,
      budgetRemaining: budget.totalBudget - totalTokens - budget.maxResponseTokens,
    },
  };
}

// ── Project context truncation ──────────────────────────────────
// Progressively drops detail sections to fit within maxChars.

function truncateProjectContext(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;

  let result = text;

  // Step 1: Remove "OTHER PAGES" section
  if (result.length > maxChars) {
    result = removeSectionByHeader(result, '--- OTHER PAGES ---');
  }

  // Step 2: Remove "ADVANCED LOGIC" section
  if (result.length > maxChars) {
    result = removeSectionByHeader(result, '--- ADVANCED LOGIC');
  }

  // Step 3: Compress TOKENS section
  if (result.length > maxChars) {
    result = compressTokensSection(result);
  }

  // Step 4: Compress NODES section
  if (result.length > maxChars) {
    result = compressNodesSection(result, 15);
  }

  // Step 5: Hard truncate as last resort
  if (result.length > maxChars) {
    result = result.slice(0, maxChars - 40) + '\n... [context truncated for tier limits]';
  }

  return result;
}

function removeSectionByHeader(text: string, headerPrefix: string): string {
  const lines = text.split('\n');
  const result: string[] = [];
  let skipping = false;

  for (const line of lines) {
    if (line.startsWith(headerPrefix)) {
      skipping = true;
      continue;
    }
    if (skipping && line.startsWith('---') && line.endsWith('---')) {
      skipping = false;
    }
    if (skipping && line.startsWith('== ')) {
      skipping = false;
    }
    if (!skipping) {
      result.push(line);
    }
  }

  return result.join('\n');
}

function compressTokensSection(text: string): string {
  const lines = text.split('\n');
  const result: string[] = [];
  let inTokens = false;
  let tokenCount = 0;
  const maxTokenLines = 20;

  for (const line of lines) {
    if (line.startsWith('--- TOKENS')) {
      inTokens = true;
      result.push(line);
      tokenCount = 0;
      continue;
    }
    if (inTokens && (line.startsWith('---') || line.startsWith('=='))) {
      inTokens = false;
      result.push(line);
      continue;
    }
    if (inTokens) {
      if (line.trimStart().startsWith('Group "')) {
        result.push(line);
        tokenCount = 0;
        continue;
      }
      if (line.trimStart().startsWith('Ungrouped')) {
        result.push(line);
        tokenCount = 0;
        continue;
      }
      if (tokenCount < maxTokenLines) {
        const colonIdx = line.lastIndexOf(':');
        if (colonIdx > 0 && line.trim().startsWith('{') === false) {
          const name = line.slice(0, colonIdx).trim();
          result.push(`    ${name}`);
        } else {
          result.push(line);
        }
        tokenCount++;
      }
      continue;
    }
    result.push(line);
  }

  return result.join('\n');
}

function compressNodesSection(text: string, maxLines: number): string {
  const lines = text.split('\n');
  const result: string[] = [];
  let inNodes = false;
  let nodeLineCount = 0;
  let totalNodeLines = 0;

  for (const line of lines) {
    if (line.startsWith('--- NODES')) {
      inNodes = true;
      result.push(line);
      nodeLineCount = 0;
      const rest = lines.slice(lines.indexOf(line) + 1);
      totalNodeLines = 0;
      for (const r of rest) {
        if (r.startsWith('---') || r.startsWith('==') || r === '') break;
        totalNodeLines++;
      }
      continue;
    }
    if (inNodes && (line === '' || line.startsWith('---') || line.startsWith('=='))) {
      if (nodeLineCount < totalNodeLines) {
        result.push(`  ... and ${totalNodeLines - nodeLineCount} more nodes (truncated for tier limits)`);
      }
      inNodes = false;
      result.push(line);
      continue;
    }
    if (inNodes) {
      if (nodeLineCount < maxLines) {
        result.push(line);
      }
      nodeLineCount++;
      continue;
    }
    result.push(line);
  }

  return result.join('\n');
}

// ── Conversation history truncation ─────────────────────────────

export function truncateConversationHistory(
  messages: ChatMessage[],
  budgetTokens: number,
): { messages: ChatMessage[]; wasTruncated: boolean; originalCount: number } {
  if (messages.length === 0) {
    return { messages: [], wasTruncated: false, originalCount: 0 };
  }

  const originalCount = messages.length;

  let totalTokens = 0;
  const msgTokens = messages.map(m => {
    const t = estimateTokens(m.content) + 4;
    totalTokens += t;
    return t;
  });

  if (totalTokens <= budgetTokens) {
    return { messages: [...messages], wasTruncated: false, originalCount };
  }

  const result: ChatMessage[] = [];
  let usedTokens = 0;

  for (let i = messages.length - 1; i >= 0; i--) {
    const tokens = msgTokens[i];

    if (usedTokens + tokens <= budgetTokens) {
      result.unshift(messages[i]);
      usedTokens += tokens;
    } else if (i === messages.length - 1) {
      const maxChars = estimateCharsFromTokens(budgetTokens - 20);
      if (messages[i].content.length > maxChars) {
        result.unshift({
          ...messages[i],
          content: messages[i].content.slice(0, maxChars) + '\n\n[message truncated due to tier limits]',
        });
      } else {
        result.unshift(messages[i]);
      }
      usedTokens += Math.min(tokens, budgetTokens);
    } else {
      if (result.length > 0 && result[0].role !== 'system') {
        result.unshift({
          role: 'system',
          content: `[${i + 1} earlier message(s) omitted to fit context tier. The conversation continues from the messages below.]`,
        });
        usedTokens += 25;
      }
      break;
    }
  }

  return { messages: result, wasTruncated: result.length < originalCount, originalCount };
}

// ── Prepare full API messages ───────────────────────────────────

export interface PrepareMessagesInput {
  projectContext: string;
  conversationMessages: ChatMessage[];
  tier: ContextTier;
  toggles?: ContextToggles;
}

export interface PrepareMessagesResult {
  messages: ChatMessage[];
  stats: ContextStats & {
    conversationTokens: number;
    historyTruncated: boolean;
    originalMessageCount: number;
    finalMessageCount: number;
    totalInputTokens: number;
  };
  maxResponseTokens: number;
}

/**
 * Main entry point for preparing API messages.
 * Uses the user-selected tier to control all budget decisions.
 * Respects context toggles — disabled sources are excluded.
 */
export function prepareAPIMessages(input: PrepareMessagesInput): PrepareMessagesResult {
  const toggles = input.toggles ?? { knowledgeBase: true, projectContext: true, conversationHistory: true };
  
  // 1. Build system prompt with tier-appropriate knowledge base
  const { systemPrompt, budget, stats } = buildSystemPrompt({
    projectContext: toggles.projectContext ? input.projectContext : '',
    tier: input.tier,
    includeKnowledgeBase: toggles.knowledgeBase,
  });

  // 2. Calculate remaining budget for conversation history
  const historyBudget = Math.max(
    200,
    budget.totalBudget - stats.totalSystemPromptTokens - budget.maxResponseTokens,
  );

  // 3. Truncate conversation history (or skip if toggled off)
  const conversationMsgs = toggles.conversationHistory ? input.conversationMessages : [];
  const { messages: truncatedHistory, wasTruncated, originalCount } =
    truncateConversationHistory(conversationMsgs, historyBudget);

  // 4. Assemble final messages array
  const finalMessages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...truncatedHistory,
  ];

  // 5. Calculate final stats
  const conversationTokens = truncatedHistory.reduce(
    (sum, m) => sum + estimateTokens(m.content) + 4,
    0,
  );
  const totalInputTokens = stats.totalSystemPromptTokens + conversationTokens;

  return {
    messages: finalMessages,
    stats: {
      ...stats,
      conversationTokens,
      historyTruncated: wasTruncated,
      originalMessageCount: originalCount,
      finalMessageCount: truncatedHistory.length,
      totalInputTokens,
    },
    maxResponseTokens: budget.maxResponseTokens,
  };
}