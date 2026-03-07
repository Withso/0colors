// ═══════════════════════════════════════════════════════════════════
// AI Provider Abstraction Layer
// Supports: OpenAI-compatible (OpenAI, Perplexity, Groq, OpenRouter,
//           Together, Mistral, DeepSeek, Railway/Ollama, and any
//           /v1/chat/completions), Anthropic (direct API)
// API keys are stored in localStorage only — never sent to our server.
// AI calls happen directly from the frontend to the provider's API.
// ═══════════════════════════════════════════════════════════════════

import type { ContextTier } from './ai-context-manager';

export type ProviderType = 'openai' | 'anthropic';

export interface AIProviderConfig {
  type: ProviderType;
  apiKey: string;
  baseUrl: string;
  model: string;
  label: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface StreamCallbacks {
  onToken: (token: string) => void;
  onDone: (fullText: string) => void;
  onError: (error: string) => void;
  onRetry?: (waitSeconds: number, attempt: number, maxAttempts: number) => void;
}

// ── Default provider configs ────────────────────────────────────

export const DEFAULT_PROVIDERS: Record<ProviderType, Omit<AIProviderConfig, 'apiKey'>> = {
  openai: {
    type: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    label: 'OpenAI-Compatible',
  },
  anthropic: {
    type: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-3-5-sonnet-20241022',
    label: 'Anthropic',
  },
};

// ── Quick-fill presets for OpenAI-compatible providers ───────────
// Clean model lists — no context window info displayed to user.

export interface PresetModel {
  id: string;
  label: string;
}

export interface ProviderPreset {
  label: string;
  baseUrl: string;
  models: PresetModel[];
  hasFreeTier?: boolean;
  freeNote?: string;
}

export const OPENAI_COMPATIBLE_PRESETS: ProviderPreset[] = [
  {
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: [
      { id: 'gpt-4o-mini', label: 'GPT-4o Mini' },
      { id: 'gpt-4o', label: 'GPT-4o' },
      { id: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
      { id: 'o1-mini', label: 'o1 Mini' },
      { id: 'o1', label: 'o1' },
      { id: 'o3-mini', label: 'o3 Mini' },
    ],
  },
  {
    label: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    hasFreeTier: true,
    freeNote: 'Free tier available with rate limits. Get your key at console.groq.com',
    models: [
      { id: 'compound-beta', label: 'Compound Beta (Agentic)' },
      { id: 'compound-beta-mini', label: 'Compound Beta Mini (Agentic)' },
      { id: 'meta-llama/llama-4-scout-17b-16e-instruct', label: 'Llama 4 Scout 17B' },
      { id: 'meta-llama/llama-4-maverick-17b-128e-instruct', label: 'Llama 4 Maverick 17B' },
      { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B' },
      { id: 'deepseek-r1-distill-llama-70b', label: 'DeepSeek R1 Distill 70B' },
      { id: 'qwen-qwq-32b', label: 'Qwen QwQ 32B (Reasoning)' },
      { id: 'mistral-saba-24b', label: 'Mistral Saba 24B' },
      { id: 'gemma2-9b-it', label: 'Gemma 2 9B' },
      { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B' },
    ],
  },
  {
    label: 'Perplexity',
    baseUrl: 'https://api.perplexity.ai',
    models: [
      { id: 'sonar', label: 'Sonar' },
      { id: 'sonar-pro', label: 'Sonar Pro' },
      { id: 'sonar-reasoning', label: 'Sonar Reasoning' },
    ],
  },
  {
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    models: [
      { id: 'openai/gpt-4o-mini', label: 'GPT-4o Mini' },
      { id: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet' },
      { id: 'google/gemini-2.0-flash-exp', label: 'Gemini 2.0 Flash' },
      { id: 'meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B' },
      { id: 'deepseek/deepseek-r1', label: 'DeepSeek R1' },
    ],
  },
  {
    label: 'Together',
    baseUrl: 'https://api.together.xyz/v1',
    models: [
      { id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', label: 'Llama 3.3 70B Turbo' },
      { id: 'mistralai/Mixtral-8x7B-Instruct-v0.1', label: 'Mixtral 8x7B' },
      { id: 'Qwen/Qwen2.5-72B-Instruct-Turbo', label: 'Qwen 2.5 72B' },
      { id: 'deepseek-ai/DeepSeek-R1', label: 'DeepSeek R1' },
    ],
  },
  {
    label: 'Mistral',
    baseUrl: 'https://api.mistral.ai/v1',
    models: [
      { id: 'mistral-large-latest', label: 'Mistral Large' },
      { id: 'mistral-small-latest', label: 'Mistral Small' },
      { id: 'open-mistral-nemo', label: 'Mistral Nemo' },
      { id: 'codestral-latest', label: 'Codestral' },
    ],
  },
  {
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    models: [
      { id: 'deepseek-chat', label: 'DeepSeek Chat (V3)' },
      { id: 'deepseek-reasoner', label: 'DeepSeek Reasoner (R1)' },
    ],
  },
  {
    label: 'Railway (Self-hosted)',
    baseUrl: 'https://your-service.up.railway.app/v1',
    freeNote: 'Self-hosted Ollama on Railway. No API key needed — leave blank. Replace URL with your Railway service URL.',
    models: [
      { id: 'qwen2.5:14b', label: 'Qwen 2.5 14B' },
      { id: 'qwen2.5:32b', label: 'Qwen 2.5 32B' },
      { id: 'deepseek-r1:14b', label: 'DeepSeek R1 14B' },
      { id: 'deepseek-r1:32b', label: 'DeepSeek R1 32B' },
      { id: 'llama3.1:8b', label: 'Llama 3.1 8B' },
    ],
  },
];

// ── Anthropic models ────────────────────────────────────────────

export const ANTHROPIC_MODELS: PresetModel[] = [
  { id: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet v2' },
  { id: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku' },
  { id: 'claude-3-opus-20240229', label: 'Claude 3 Opus' },
  { id: 'claude-3-sonnet-20240229', label: 'Claude 3 Sonnet' },
  { id: 'claude-3-haiku-20240307', label: 'Claude 3 Haiku' },
];

// ── Available models per provider (for dropdown) ────────────────

export const PROVIDER_MODELS: Record<ProviderType, { id: string; label: string }[]> = {
  openai: [
    { id: 'gpt-4o-mini', label: 'GPT-4o Mini' },
    { id: 'gpt-4o', label: 'GPT-4o' },
    { id: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
    { id: 'o1-mini', label: 'o1 Mini' },
    { id: 'o1', label: 'o1' },
    { id: 'o3-mini', label: 'o3 Mini' },
  ],
  anthropic: ANTHROPIC_MODELS.map(m => ({ id: m.id, label: m.label })),
};

// ── LocalStorage persistence ────────────────────────────────────

const AI_CONFIG_KEY = '0colors-ai-config';
const AI_CONTEXT_TIER_KEY = '0colors-ai-context-tier';
const AI_CONTEXT_TOGGLES_KEY = '0colors-ai-context-toggles';

export interface AISettings {
  activeProvider: ProviderType;
  providers: Record<ProviderType, AIProviderConfig>;
}

/** Context source toggles — which context sources are included */
export interface ContextToggles {
  knowledgeBase: boolean;
  projectContext: boolean;
  conversationHistory: boolean;
}

const DEFAULT_TOGGLES: ContextToggles = {
  knowledgeBase: true,
  projectContext: true,
  conversationHistory: true,
};

/** Load context source toggles */
export function loadContextToggles(): ContextToggles {
  try {
    const raw = localStorage.getItem(AI_CONTEXT_TOGGLES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_TOGGLES, ...parsed };
    }
  } catch {}
  return { ...DEFAULT_TOGGLES };
}

/** Save context source toggles */
export function saveContextToggles(toggles: ContextToggles): void {
  try {
    localStorage.setItem(AI_CONTEXT_TOGGLES_KEY, JSON.stringify(toggles));
  } catch {}
}

/** Load the user-selected context tier (defaults to 'medium') */
export function loadContextTier(): ContextTier {
  try {
    const val = localStorage.getItem(AI_CONTEXT_TIER_KEY);
    if (val === 'small' || val === 'medium' || val === 'large') return val;
  } catch {}
  return 'medium';
}

/** Save the user-selected context tier */
export function saveContextTier(tier: ContextTier): void {
  try {
    localStorage.setItem(AI_CONTEXT_TIER_KEY, tier);
  } catch {}
}

export function loadAISettings(): AISettings {
  try {
    const raw = localStorage.getItem(AI_CONFIG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AISettings;
      if (!parsed.providers.openai) {
        parsed.providers.openai = { ...DEFAULT_PROVIDERS.openai, apiKey: '' };
      }
      if (!parsed.providers.anthropic) {
        parsed.providers.anthropic = { ...DEFAULT_PROVIDERS.anthropic, apiKey: '' };
      }
      if ((parsed.activeProvider as string) === 'ollama') {
        parsed.activeProvider = 'openai';
      }
      // Migrate stale Groq compound model IDs (groq/ prefix → compound-beta)
      const openaiProvider = parsed.providers.openai;
      if (openaiProvider) {
        if (openaiProvider.model === 'groq/compound') openaiProvider.model = 'compound-beta';
        if (openaiProvider.model === 'groq/compound-mini') openaiProvider.model = 'compound-beta-mini';
      }
      const cleaned: AISettings = {
        activeProvider: parsed.activeProvider,
        providers: {
          openai: parsed.providers.openai,
          anthropic: parsed.providers.anthropic,
        },
      };
      return cleaned;
    }
  } catch {}
  return {
    activeProvider: 'openai',
    providers: {
      openai: { ...DEFAULT_PROVIDERS.openai, apiKey: '' },
      anthropic: { ...DEFAULT_PROVIDERS.anthropic, apiKey: '' },
    },
  };
}

export function saveAISettings(settings: AISettings): void {
  try {
    localStorage.setItem(AI_CONFIG_KEY, JSON.stringify(settings));
  } catch {}
}

export function getActiveProvider(settings: AISettings): AIProviderConfig {
  return settings.providers[settings.activeProvider];
}

export function isProviderConfigured(settings: AISettings): boolean {
  const provider = getActiveProvider(settings);
  // Railway/Ollama self-hosted doesn't require an API key
  if (provider.baseUrl && provider.baseUrl.includes('.up.railway.app')) {
    return !!provider.baseUrl && !!provider.model;
  }
  return !!provider.apiKey;
}

// ── Rate limit retry helper ─────────────────────────────────────

const MAX_RATE_LIMIT_RETRIES = 3;

function parseRetryAfter(response: Response): number {
  const retryAfter = response.headers.get('retry-after');
  if (retryAfter) {
    const seconds = parseFloat(retryAfter);
    if (!isNaN(seconds) && seconds > 0) return Math.min(seconds, 60);
  }
  const resetAt = response.headers.get('x-ratelimit-reset-tokens')
    || response.headers.get('x-ratelimit-reset');
  if (resetAt) {
    const resetTime = parseFloat(resetAt);
    if (!isNaN(resetTime)) {
      if (resetTime > 1577836800) {
        const delta = resetTime - Date.now() / 1000;
        if (delta > 0) return Math.min(Math.ceil(delta), 60);
      }
      if (resetTime > 0) return Math.min(Math.ceil(resetTime), 60);
    }
  }
  return 0;
}

async function sleepMs(ms: number, abortSignal?: AbortSignal): Promise<boolean> {
  return new Promise(resolve => {
    if (abortSignal?.aborted) { resolve(false); return; }
    const timer = setTimeout(() => resolve(true), ms);
    const onAbort = () => { clearTimeout(timer); resolve(false); };
    abortSignal?.addEventListener('abort', onAbort, { once: true });
  });
}

// ── Streaming chat implementation ───────────────────────────────

// ── Clean error formatting ──────────────────────────────────────
// Parses raw API error responses and returns a structured, user-friendly
// error message. Never exposes raw JSON to the user.

interface ParsedAPIError {
  code: number | string;
  title: string;
  message: string;
  suggestion?: string;
}

function tryParseErrorBody(body: string): { message?: string; code?: string; type?: string } {
  if (!body) return {};
  try {
    const json = JSON.parse(body);
    // OpenAI / Groq / OpenRouter / Together / Mistral / DeepSeek / Perplexity format
    if (json.error?.message) {
      return { message: json.error.message, code: json.error.code, type: json.error.type };
    }
    // Anthropic format
    if (json.error?.type) {
      return { message: json.error.message || json.message, code: json.error.type, type: json.error.type };
    }
    if (json.message) {
      return { message: json.message, code: json.code, type: json.type };
    }
  } catch {}
  // If not JSON, return the raw text (but we won't show it to the user)
  return { message: body.slice(0, 200) };
}

function formatAPIError(status: number, body: string, provider: string): string {
  const parsed = tryParseErrorBody(body);
  const errorCode = parsed.code || String(status);

  const ERROR_MAP: Record<number, ParsedAPIError> = {
    400: {
      code: errorCode,
      title: 'Bad Request',
      message: detectContextSizeError(body)
        ? 'The request is too large for this model\'s context window.'
        : 'The API could not process this request.',
      suggestion: detectContextSizeError(body)
        ? 'Switch to a smaller Context Tier or disable some context sources in AI Settings.'
        : 'Check your model selection and try again.',
    },
    401: {
      code: errorCode,
      title: 'Authentication Failed',
      message: 'Your API key is invalid, expired, or missing.',
      suggestion: 'Check your API key in AI Settings → Provider tab.',
    },
    403: {
      code: errorCode,
      title: 'Access Denied',
      message: 'Your account doesn\'t have permission to use this model or endpoint.',
      suggestion: 'Verify your API plan supports this model, or try a different one.',
    },
    404: {
      code: errorCode,
      title: 'Model Not Found',
      message: `The model "${provider}" could not be found at this endpoint.`,
      suggestion: 'Check that the model ID and base URL are correct in AI Settings.',
    },
    413: {
      code: errorCode,
      title: 'Request Too Large',
      message: 'The request exceeds this model\'s size or rate limits.',
      suggestion: 'Switch to a smaller Context Tier or disable some context sources in AI Settings.',
    },
    422: {
      code: errorCode,
      title: 'Invalid Request',
      message: 'The request format was not accepted by the API.',
      suggestion: 'Try a different model or check your provider configuration.',
    },
    429: {
      code: errorCode,
      title: 'Rate Limited',
      message: 'Too many requests — you\'ve hit the provider\'s rate limit.',
      suggestion: 'Wait a moment before retrying, or switch to a smaller Context Tier to reduce token usage.',
    },
    500: {
      code: errorCode,
      title: 'Server Error',
      message: 'The AI provider encountered an internal error.',
      suggestion: 'This is usually temporary. Wait a moment and try again.',
    },
    502: {
      code: errorCode,
      title: 'Bad Gateway',
      message: 'The AI provider is temporarily unreachable.',
      suggestion: 'This is usually temporary. Wait a moment and try again.',
    },
    503: {
      code: errorCode,
      title: 'Service Unavailable',
      message: 'The AI provider or model is currently overloaded or loading.',
      suggestion: 'Wait a moment and try again. If using a cold-start model, it may need time to warm up.',
    },
    529: {
      code: errorCode,
      title: 'Overloaded',
      message: 'The AI provider is overloaded with requests.',
      suggestion: 'Wait a moment and try again.',
    },
  };

  const mapped = ERROR_MAP[status];
  if (mapped) {
    // Use a structured format that AskAIChat can parse
    return `__ERR__${JSON.stringify({
      code: status,
      errorCode: mapped.code,
      title: mapped.title,
      message: mapped.message,
      suggestion: mapped.suggestion,
    })}`;
  }

  // Fallback for unknown status codes
  return `__ERR__${JSON.stringify({
    code: status,
    errorCode: errorCode,
    title: `Error ${status}`,
    message: parsed.message ? 'The API returned an unexpected error.' : 'An unknown error occurred.',
    suggestion: 'Try again, or check your provider settings.',
  })}`;
}

function detectContextSizeError(body: string): boolean {
  const lower = body.toLowerCase();
  return lower.includes('context') || lower.includes('token') || lower.includes('length')
    || lower.includes('too large') || lower.includes('maximum') || lower.includes('limit');
}

function formatNetworkError(error: string): string {
  return `__ERR__${JSON.stringify({
    code: 0,
    errorCode: 'network_error',
    title: 'Connection Failed',
    message: error.includes('fetch') || error.includes('network') || error.includes('Failed to fetch')
      ? 'Could not reach the AI provider. Check your internet connection and base URL.'
      : error.includes('timeout') || error.includes('Timeout')
      ? 'The request timed out. The provider may be slow or unreachable.'
      : `An unexpected error occurred.`,
    suggestion: 'Check your internet connection and provider settings.',
  })}`;
}

export async function streamChat(
  messages: ChatMessage[],
  config: AIProviderConfig,
  callbacks: StreamCallbacks,
  abortSignal?: AbortSignal,
  maxTokens?: number,
): Promise<void> {
  try {
    const responseMax = maxTokens ?? 4096;
    switch (config.type) {
      case 'openai':
        return await streamOpenAI(messages, config, callbacks, abortSignal, responseMax);
      case 'anthropic':
        return await streamAnthropic(messages, config, callbacks, abortSignal, responseMax);
      default:
        callbacks.onError(formatNetworkError(`Unknown provider: ${config.type}`));
    }
  } catch (err: any) {
    if (err?.name === 'AbortError') return;
    callbacks.onError(formatNetworkError(err?.message || 'Unknown error'));
  }
}

// ── OpenAI-compatible streaming ─────────────────────────────────

async function streamOpenAI(
  messages: ChatMessage[],
  config: AIProviderConfig,
  callbacks: StreamCallbacks,
  abortSignal?: AbortSignal,
  maxTokens?: number,
): Promise<void> {
  const responseMax = maxTokens ?? 4096;

  for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt++) {
    if (abortSignal?.aborted) return;

    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey ? { 'Authorization': `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: config.model,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        stream: true,
        max_tokens: responseMax,
      }),
      signal: abortSignal,
    });

    // Handle rate limits with retry
    if (response.status === 429 && attempt < MAX_RATE_LIMIT_RETRIES) {
      const retryAfterSec = parseRetryAfter(response) || (Math.pow(2, attempt) * 5);
      const waitSeconds = Math.ceil(retryAfterSec);
      console.log(`[AI Rate Limit] 429 received. Retrying in ${waitSeconds}s (attempt ${attempt + 1}/${MAX_RATE_LIMIT_RETRIES})`);
      callbacks.onRetry?.(waitSeconds, attempt + 1, MAX_RATE_LIMIT_RETRIES);
      const continued = await sleepMs(waitSeconds * 1000, abortSignal);
      if (!continued) return;
      continue;
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      callbacks.onError(formatAPIError(response.status, body, config.model));
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) { callbacks.onError(formatNetworkError('No response body')); return; }

    const decoder = new TextDecoder();
    let fullText = '';
    let buffer = '';

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
          const token = parsed.choices?.[0]?.delta?.content;
          if (token) {
            fullText += token;
            callbacks.onToken(token);
          }
        } catch {}
      }
    }
    callbacks.onDone(fullText);
    return;
  }
}

// ── Anthropic streaming ─────────────────────────────────────────

async function streamAnthropic(
  messages: ChatMessage[],
  config: AIProviderConfig,
  callbacks: StreamCallbacks,
  abortSignal?: AbortSignal,
  maxTokens?: number,
): Promise<void> {
  const responseMax = maxTokens ?? 4096;
  const systemMsg = messages.find(m => m.role === 'system')?.content || '';
  const chatMsgs = messages.filter(m => m.role !== 'system');

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
      max_tokens: responseMax,
      system: systemMsg,
      messages: chatMsgs.map(m => ({ role: m.role, content: m.content })),
      stream: true,
    }),
    signal: abortSignal,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    callbacks.onError(formatAPIError(response.status, body, config.model));
    return;
  }

  const reader = response.body?.getReader();
  if (!reader) { callbacks.onError(formatNetworkError('No response body')); return; }

  const decoder = new TextDecoder();
  let fullText = '';
  let buffer = '';

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
        const parsed = JSON.parse(data);
        if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
          fullText += parsed.delta.text;
          callbacks.onToken(parsed.delta.text);
        }
      } catch {}
    }
  }
  callbacks.onDone(fullText);
}

// ── Conversation data types ─────────────────────────────────────

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface Conversation {
  id: string;
  title: string;
  messages: ConversationMessage[];
  createdAt: number;
  updatedAt: number;
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function generateConversationTitle(firstMessage: string): string {
  const clean = firstMessage.trim().replace(/\n/g, ' ');
  if (clean.length <= 40) return clean;
  return clean.slice(0, 37) + '...';
}

// ── Conversation limits & localStorage persistence ──────────────
// Offline-first: conversations always persist to localStorage.
// Cloud sync is a secondary layer for authenticated users.

const AI_CONVERSATIONS_KEY = '0colors-ai-conversations';
export const MAX_CONVERSATIONS = 50;
export const MAX_MESSAGES_PER_CONVERSATION = 250;

/** Trim a single conversation's messages to the limit.
 *  Keeps the first message (for title context) and the most recent messages. */
function trimMessages(messages: ConversationMessage[]): ConversationMessage[] {
  if (messages.length <= MAX_MESSAGES_PER_CONVERSATION) return messages;
  // Keep first message + the most recent (limit - 1) messages
  const first = messages[0];
  const recent = messages.slice(-(MAX_MESSAGES_PER_CONVERSATION - 1));
  return [first, ...recent];
}

/** Trim conversations array: enforce per-conversation message limits
 *  and cap total conversation count (oldest removed first). */
export function trimConversations(convs: Conversation[]): Conversation[] {
  // Sort by updatedAt descending (newest first) so we keep the most recent ones
  const sorted = [...convs].sort((a, b) => b.updatedAt - a.updatedAt);
  // Cap total conversations
  const capped = sorted.slice(0, MAX_CONVERSATIONS);
  // Trim messages in each conversation
  return capped.map(c => ({
    ...c,
    messages: trimMessages(c.messages),
  }));
}

/** Load conversations from localStorage (offline-first). */
export function loadLocalConversations(): Conversation[] {
  try {
    const raw = localStorage.getItem(AI_CONVERSATIONS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e: any) {
    console.log(`[AI] Failed to load local conversations: ${e?.message}`);
  }
  return [];
}

/** Save conversations to localStorage (immediate, not debounced). */
export function saveLocalConversations(convs: Conversation[]): void {
  try {
    const trimmed = trimConversations(convs);
    localStorage.setItem(AI_CONVERSATIONS_KEY, JSON.stringify(trimmed));
  } catch (e: any) {
    // localStorage quota exceeded — try saving with fewer conversations
    if (e?.name === 'QuotaExceededError') {
      console.log('[AI] localStorage quota exceeded, trimming to 15 conversations');
      try {
        const aggressive = trimConversations(convs).slice(0, 15);
        localStorage.setItem(AI_CONVERSATIONS_KEY, JSON.stringify(aggressive));
      } catch {
        console.log('[AI] Failed to save even with aggressive trim');
      }
    } else {
      console.log(`[AI] Failed to save local conversations: ${e?.message}`);
    }
  }
}

/** Merge local and cloud conversations, keeping the newest version of each
 *  (by updatedAt) and deduplicating by id. */
export function mergeConversations(local: Conversation[], cloud: Conversation[]): Conversation[] {
  const map = new Map<string, Conversation>();
  // Add local first
  for (const c of local) map.set(c.id, c);
  // Cloud wins if newer (or if not in local)
  for (const c of cloud) {
    const existing = map.get(c.id);
    if (!existing || c.updatedAt > existing.updatedAt) {
      map.set(c.id, c);
    }
  }
  // Sort newest first, apply limits
  const merged = Array.from(map.values()).sort((a, b) => b.updatedAt - a.updatedAt);
  return trimConversations(merged);
}

// ── Cloud sync helpers ──────────────────────────────────────────
// These sync conversations and AI settings to the cloud via the
// Supabase edge function backend (KV store).
// API keys are AES-256-GCM encrypted client-side before cloud storage.

import { SERVER_BASE } from './supabase/client';

// ── API key encryption (AES-256-GCM via Web Crypto) ─────────────
// Key is derived from userId + app salt using PBKDF2. This ensures:
// - Same user on any device → same encryption key (cross-device sync)
// - Different users → different keys (isolation)
// - Database breach → encrypted blobs, not plaintext keys

const ENCRYPTION_APP_SALT = '0colors-ai-key-encryption-v1-salt';

async function deriveEncryptionKey(userId: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(userId + ENCRYPTION_APP_SALT), 'PBKDF2', false, ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode('0colors-pbkdf2-fixed-salt'), iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function encryptString(plaintext: string, key: CryptoKey): Promise<string> {
  if (!plaintext) return '';
  const enc = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, key, enc.encode(plaintext),
  );
  // Combine iv + ciphertext → base64
  const combined = new Uint8Array(iv.length + new Uint8Array(ciphertext).length);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return btoa(String.fromCharCode(...combined));
}

async function decryptString(encrypted: string, key: CryptoKey): Promise<string> {
  if (!encrypted) return '';
  try {
    const raw = Uint8Array.from(atob(encrypted), c => c.charCodeAt(0));
    const iv = raw.slice(0, 12);
    const ciphertext = raw.slice(12);
    const plainBuf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv }, key, ciphertext,
    );
    return new TextDecoder().decode(plainBuf);
  } catch (e: any) {
    console.log(`[AI] Decryption failed (key may have changed): ${e?.message}`);
    return ''; // Return empty — user will need to re-enter keys
  }
}

// ── Cloud settings bundle ───────────────────────────────────────
// Bundles AI settings + context preferences into one envelope for cloud sync.
// API keys are encrypted; everything else is plaintext.

const AI_SETTINGS_UPDATED_KEY = '0colors-ai-settings-updated';

export interface CloudAISettingsBundle {
  settings: {
    activeProvider: ProviderType;
    providers: Record<ProviderType, {
      type: ProviderType;
      baseUrl: string;
      model: string;
      label: string;
      encryptedKey: string; // AES-GCM encrypted API key
    }>;
  };
  contextTier: ContextTier;
  contextToggles: ContextToggles;
  updatedAt: number;
}

export function getLocalSettingsUpdatedAt(): number {
  try {
    const v = localStorage.getItem(AI_SETTINGS_UPDATED_KEY);
    return v ? parseInt(v, 10) : 0;
  } catch { return 0; }
}

export function setLocalSettingsUpdatedAt(ts: number): void {
  try { localStorage.setItem(AI_SETTINGS_UPDATED_KEY, String(ts)); } catch {}
}

/** Build a cloud-ready settings bundle with encrypted API keys */
export async function buildCloudSettingsBundle(
  settings: AISettings,
  contextTier: ContextTier,
  contextToggles: ContextToggles,
  userId: string,
): Promise<CloudAISettingsBundle> {
  const key = await deriveEncryptionKey(userId);
  const providers: CloudAISettingsBundle['settings']['providers'] = {} as any;
  for (const pt of ['openai', 'anthropic'] as ProviderType[]) {
    const p = settings.providers[pt];
    providers[pt] = {
      type: p.type,
      baseUrl: p.baseUrl,
      model: p.model,
      label: p.label,
      encryptedKey: await encryptString(p.apiKey, key),
    };
  }
  const now = Date.now();
  setLocalSettingsUpdatedAt(now);
  return {
    settings: { activeProvider: settings.activeProvider, providers },
    contextTier,
    contextToggles,
    updatedAt: now,
  };
}

/** Restore local AISettings from a cloud bundle (decrypts API keys) */
export async function restoreSettingsFromCloud(
  bundle: CloudAISettingsBundle,
  userId: string,
): Promise<{ settings: AISettings; contextTier: ContextTier; contextToggles: ContextToggles }> {
  const key = await deriveEncryptionKey(userId);
  const providers: Record<ProviderType, AIProviderConfig> = {} as any;
  for (const pt of ['openai', 'anthropic'] as ProviderType[]) {
    const cp = bundle.settings.providers[pt];
    if (cp) {
      providers[pt] = {
        type: cp.type,
        baseUrl: cp.baseUrl,
        model: cp.model,
        label: cp.label,
        apiKey: await decryptString(cp.encryptedKey, key),
      };
    } else {
      providers[pt] = { ...DEFAULT_PROVIDERS[pt], apiKey: '' };
    }
  }
  return {
    settings: { activeProvider: bundle.settings.activeProvider, providers },
    contextTier: bundle.contextTier || 'medium',
    contextToggles: bundle.contextToggles || { knowledgeBase: true, projectContext: true, conversationHistory: true },
  };
}

/** Merge local and cloud settings — cloud wins if newer, but
 *  local API keys are preserved if cloud keys are empty (decryption failure). */
export async function mergeSettingsBundles(
  localSettings: AISettings,
  localTier: ContextTier,
  localToggles: ContextToggles,
  cloudBundle: CloudAISettingsBundle,
  userId: string,
): Promise<{ settings: AISettings; contextTier: ContextTier; contextToggles: ContextToggles; changed: boolean }> {
  const localUpdated = getLocalSettingsUpdatedAt();
  if (cloudBundle.updatedAt <= localUpdated) {
    // Local is newer or same — no changes needed
    return { settings: localSettings, contextTier: localTier, contextToggles: localToggles, changed: false };
  }
  // Cloud is newer — restore it
  const restored = await restoreSettingsFromCloud(cloudBundle, userId);
  // Preserve local API keys if cloud decryption returned empty
  for (const pt of ['openai', 'anthropic'] as ProviderType[]) {
    if (!restored.settings.providers[pt].apiKey && localSettings.providers[pt]?.apiKey) {
      restored.settings.providers[pt].apiKey = localSettings.providers[pt].apiKey;
    }
  }
  setLocalSettingsUpdatedAt(cloudBundle.updatedAt);
  return { ...restored, changed: true };
}

// ── Cloud sync functions ────────────────────────────────────────

export async function loadCloudConversations(accessToken: string): Promise<Conversation[] | null> {
  try {
    const res = await fetch(`${SERVER_BASE}/ai-conversations`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.conversations || null;
  } catch (e: any) {
    console.log(`[AI] Failed to load cloud conversations: ${e?.message}`);
    return null;
  }
}

export async function saveCloudConversations(accessToken: string, conversations: Conversation[]): Promise<boolean> {
  try {
    const res = await fetch(`${SERVER_BASE}/ai-conversations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ conversations }),
    });
    return res.ok;
  } catch (e: any) {
    console.log(`[AI] Failed to save cloud conversations: ${e?.message}`);
    return false;
  }
}

export async function loadCloudSettingsBundle(accessToken: string): Promise<CloudAISettingsBundle | null> {
  try {
    const res = await fetch(`${SERVER_BASE}/ai-settings`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.settings || null;
  } catch (e: any) {
    console.log(`[AI] Failed to load cloud settings: ${e?.message}`);
    return null;
  }
}

export async function saveCloudSettingsBundle(accessToken: string, bundle: CloudAISettingsBundle): Promise<boolean> {
  try {
    const res = await fetch(`${SERVER_BASE}/ai-settings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ settings: bundle }),
    });
    return res.ok;
  } catch (e: any) {
    console.log(`[AI] Failed to save cloud settings: ${e?.message}`);
    return false;
  }
}

// Keep the old function name as an alias for backwards compatibility
export async function saveCloudAISettings(accessToken: string, settings: AISettings): Promise<boolean> {
  // Legacy: this is now handled by saveCloudSettingsBundle with encryption.
  // This function is kept for any remaining callers but should be migrated.
  console.log('[AI] Warning: saveCloudAISettings called — use saveCloudSettingsBundle for encrypted sync');
  return saveCloudSettingsBundle(accessToken, {
    settings: {
      activeProvider: settings.activeProvider,
      providers: {
        openai: { ...settings.providers.openai, encryptedKey: '' },
        anthropic: { ...settings.providers.anthropic, encryptedKey: '' },
      },
    },
    contextTier: loadContextTier(),
    contextToggles: loadContextToggles(),
    updatedAt: Date.now(),
  });
}