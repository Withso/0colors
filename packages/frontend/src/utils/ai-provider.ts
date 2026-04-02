// ═══════════════════════════════════════════════════════════════════
// AI Provider Abstraction Layer
// Supports: Anthropic, OpenAI, Google Gemini, Groq, Mistral,
//           DeepSeek, Perplexity, OpenRouter — each as a distinct
//           service with its own API key and model selection.
// API keys are stored in localStorage only — never sent to our server.
// AI calls happen directly from the frontend to the provider's API.
// ═══════════════════════════════════════════════════════════════════

import type { ContextTier } from './ai-context-manager';

// ── Service-based architecture (V2) ────────────────────────────────

export type ServiceId = 'anthropic' | 'openai' | 'google' | 'groq' | 'mistral' | 'deepseek' | 'perplexity' | 'openrouter';

export interface PresetModel {
  id: string;
  label: string;
  contextWindow?: number; // max context tokens (e.g., 200000)
}

export interface ServiceDefinition {
  id: ServiceId;
  label: string;
  description: string;
  streamType: 'openai' | 'anthropic';
  baseUrl: string;
  models: PresetModel[];
  keyHint: string;
  keyUrl: string;
  supportsCustomModel: boolean;
  hasFreeTier?: boolean;
  freeNote?: string;
}

export interface ServiceConfig {
  apiKey: string;
  model: string;
}

export interface AISettingsV2 {
  version: 2;
  activeModel: { serviceId: ServiceId; modelId: string };
  services: Partial<Record<ServiceId, ServiceConfig>>;
}

export const SERVICE_DEFINITIONS: ServiceDefinition[] = [
  {
    id: 'anthropic',
    label: 'Anthropic',
    description: 'Claude models via console.anthropic.com',
    streamType: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    models: [
      { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4', contextWindow: 200000 },
      { id: 'claude-opus-4-20250514', label: 'Claude Opus 4', contextWindow: 200000 },
      { id: 'claude-3-7-sonnet-20250219', label: 'Claude 3.7 Sonnet', contextWindow: 200000 },
      { id: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku', contextWindow: 200000 },
    ],
    keyHint: 'sk-ant-...',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    supportsCustomModel: false,
  },
  {
    id: 'openai',
    label: 'OpenAI',
    description: 'GPT-4o, o3, o4 models',
    streamType: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    models: [
      { id: 'gpt-4o', label: 'GPT-4o', contextWindow: 128000 },
      { id: 'gpt-4o-mini', label: 'GPT-4o Mini', contextWindow: 128000 },
      { id: 'o3-mini', label: 'o3 Mini', contextWindow: 200000 },
      { id: 'o4-mini', label: 'o4 Mini', contextWindow: 200000 },
      { id: 'gpt-4.1', label: 'GPT-4.1', contextWindow: 1047576 },
      { id: 'gpt-4.1-mini', label: 'GPT-4.1 Mini', contextWindow: 1047576 },
      { id: 'gpt-4.1-nano', label: 'GPT-4.1 Nano', contextWindow: 1047576 },
    ],
    keyHint: 'sk-...',
    keyUrl: 'https://platform.openai.com/api-keys',
    supportsCustomModel: true,
  },
  {
    id: 'google',
    label: 'Google Gemini',
    description: 'Gemini models with generous free tier',
    streamType: 'openai',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    models: [
      { id: 'gemini-2.5-flash-preview-05-20', label: 'Gemini 2.5 Flash', contextWindow: 1048576 },
      { id: 'gemini-2.5-pro-preview-05-06', label: 'Gemini 2.5 Pro', contextWindow: 1048576 },
      { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', contextWindow: 1048576 },
      { id: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite', contextWindow: 1048576 },
    ],
    keyHint: 'AIza...',
    keyUrl: 'https://aistudio.google.com/apikey',
    supportsCustomModel: false,
    hasFreeTier: true,
    freeNote: 'Generous free tier available. Get your key at aistudio.google.com',
  },
  {
    id: 'groq',
    label: 'Groq',
    description: 'Ultra-fast inference — Llama, Qwen, DeepSeek',
    streamType: 'openai',
    baseUrl: 'https://api.groq.com/openai/v1',
    models: [
      { id: 'compound-beta', label: 'Compound Beta (Agentic)', contextWindow: 128000 },
      { id: 'compound-beta-mini', label: 'Compound Beta Mini', contextWindow: 128000 },
      { id: 'meta-llama/llama-4-scout-17b-16e-instruct', label: 'Llama 4 Scout 17B', contextWindow: 131072 },
      { id: 'meta-llama/llama-4-maverick-17b-128e-instruct', label: 'Llama 4 Maverick 17B', contextWindow: 131072 },
      { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B', contextWindow: 128000 },
      { id: 'deepseek-r1-distill-llama-70b', label: 'DeepSeek R1 Distill 70B', contextWindow: 128000 },
      { id: 'qwen-qwq-32b', label: 'Qwen QwQ 32B (Reasoning)', contextWindow: 131072 },
      { id: 'mistral-saba-24b', label: 'Mistral Saba 24B', contextWindow: 32768 },
      { id: 'gemma2-9b-it', label: 'Gemma 2 9B', contextWindow: 8192 },
      { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B', contextWindow: 131072 },
    ],
    keyHint: 'gsk_...',
    keyUrl: 'https://console.groq.com/keys',
    supportsCustomModel: true,
    hasFreeTier: true,
    freeNote: 'Free tier with rate limits. Get your key at console.groq.com',
  },
  {
    id: 'mistral',
    label: 'Mistral',
    description: 'Mistral Large, Small, and Codestral',
    streamType: 'openai',
    baseUrl: 'https://api.mistral.ai/v1',
    models: [
      { id: 'mistral-large-latest', label: 'Mistral Large', contextWindow: 128000 },
      { id: 'mistral-small-latest', label: 'Mistral Small', contextWindow: 32000 },
      { id: 'codestral-latest', label: 'Codestral', contextWindow: 256000 },
      { id: 'open-mistral-nemo', label: 'Mistral Nemo', contextWindow: 128000 },
    ],
    keyHint: 'Enter your Mistral API key',
    keyUrl: 'https://console.mistral.ai/api-keys',
    supportsCustomModel: false,
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    description: 'DeepSeek Chat (V3) and Reasoner (R1)',
    streamType: 'openai',
    baseUrl: 'https://api.deepseek.com/v1',
    models: [
      { id: 'deepseek-chat', label: 'DeepSeek Chat (V3)', contextWindow: 64000 },
      { id: 'deepseek-reasoner', label: 'DeepSeek Reasoner (R1)', contextWindow: 64000 },
    ],
    keyHint: 'sk-...',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    supportsCustomModel: false,
  },
  {
    id: 'perplexity',
    label: 'Perplexity',
    description: 'Sonar models with web search built-in',
    streamType: 'openai',
    baseUrl: 'https://api.perplexity.ai',
    models: [
      { id: 'sonar', label: 'Sonar', contextWindow: 127000 },
      { id: 'sonar-pro', label: 'Sonar Pro', contextWindow: 127000 },
      { id: 'sonar-reasoning', label: 'Sonar Reasoning', contextWindow: 127000 },
    ],
    keyHint: 'pplx-...',
    keyUrl: 'https://www.perplexity.ai/settings/api',
    supportsCustomModel: false,
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    description: 'Access 200+ models with one API key',
    streamType: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    models: [
      { id: 'anthropic/claude-sonnet-4', label: 'Claude Sonnet 4', contextWindow: 200000 },
      { id: 'openai/gpt-4o', label: 'GPT-4o', contextWindow: 128000 },
      { id: 'google/gemini-2.5-flash-preview', label: 'Gemini 2.5 Flash', contextWindow: 1048576 },
      { id: 'meta-llama/llama-4-scout', label: 'Llama 4 Scout', contextWindow: 131072 },
      { id: 'deepseek/deepseek-r1', label: 'DeepSeek R1', contextWindow: 64000 },
    ],
    keyHint: 'sk-or-...',
    keyUrl: 'https://openrouter.ai/keys',
    supportsCustomModel: true,
  },
];

export const SERVICE_MAP: Record<ServiceId, ServiceDefinition> = Object.fromEntries(
  SERVICE_DEFINITIONS.map(d => [d.id, d]),
) as Record<ServiceId, ServiceDefinition>;

// ── Legacy types (kept for backward compatibility) ──────────────

/** @deprecated Use ServiceId instead */
export type ProviderType = 'openai' | 'anthropic';

/** @deprecated Use ServiceDefinition + ServiceConfig instead */
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

// ── Legacy defaults (kept for migration) ────────────────────────

/** @deprecated Use SERVICE_DEFINITIONS instead */
export const DEFAULT_PROVIDERS: Record<ProviderType, Omit<AIProviderConfig, 'apiKey'>> = {
  openai: { type: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', label: 'OpenAI-Compatible' },
  anthropic: { type: 'anthropic', baseUrl: 'https://api.anthropic.com', model: 'claude-sonnet-4-20250514', label: 'Anthropic' },
};

/** @deprecated Use SERVICE_DEFINITIONS instead */
export interface ProviderPreset { label: string; baseUrl: string; models: PresetModel[]; hasFreeTier?: boolean; freeNote?: string; }
/** @deprecated Use SERVICE_DEFINITIONS instead */
export const OPENAI_COMPATIBLE_PRESETS: ProviderPreset[] = [];
/** @deprecated Use SERVICE_MAP.anthropic.models instead */
export const ANTHROPIC_MODELS: PresetModel[] = SERVICE_MAP.anthropic.models;
/** @deprecated Use SERVICE_DEFINITIONS instead */
export const PROVIDER_MODELS: Record<ProviderType, PresetModel[]> = {
  openai: SERVICE_MAP.openai.models,
  anthropic: SERVICE_MAP.anthropic.models,
};

// ── LocalStorage persistence ────────────────────────────────────

const AI_CONFIG_KEY = '0colors-ai-config';
const AI_CONTEXT_TIER_KEY = '0colors-ai-context-tier';
const AI_CONTEXT_TOGGLES_KEY = '0colors-ai-context-toggles';

/** @deprecated Use AISettingsV2 instead. Kept as alias for backward compat. */
export type AISettings = AISettingsV2;

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

// ── V1 → V2 migration helper ──────────────────────────────────

const HOSTNAME_TO_SERVICE: Record<string, ServiceId> = {
  'api.openai.com': 'openai',
  'api.groq.com': 'groq',
  'api.perplexity.ai': 'perplexity',
  'openrouter.ai': 'openrouter',
  'api.together.xyz': 'openrouter', // map Together to OpenRouter
  'api.mistral.ai': 'mistral',
  'api.deepseek.com': 'deepseek',
  'generativelanguage.googleapis.com': 'google',
};

function migrateV1ToV2(raw: any): AISettingsV2 {
  const services: Partial<Record<ServiceId, ServiceConfig>> = {};

  // Migrate OpenAI-compatible provider
  const openaiP = raw.providers?.openai;
  if (openaiP?.apiKey) {
    let serviceId: ServiceId = 'openai';
    try {
      const hostname = new URL(openaiP.baseUrl).hostname;
      serviceId = HOSTNAME_TO_SERVICE[hostname] || 'openai';
    } catch {}
    services[serviceId] = { apiKey: openaiP.apiKey, model: openaiP.model || SERVICE_MAP[serviceId].models[0].id };
  }

  // Migrate Anthropic provider
  const anthropicP = raw.providers?.anthropic;
  if (anthropicP?.apiKey) {
    services.anthropic = { apiKey: anthropicP.apiKey, model: anthropicP.model || 'claude-sonnet-4-20250514' };
  }

  // Determine active model
  const activeProvider = raw.activeProvider as string;
  let activeServiceId: ServiceId = 'anthropic';
  let activeModelId = 'claude-sonnet-4-20250514';

  if (activeProvider === 'anthropic' && services.anthropic) {
    activeServiceId = 'anthropic';
    activeModelId = services.anthropic.model;
  } else {
    // Find which service was mapped from the openai provider
    const mappedService = Object.keys(services).find(k => k !== 'anthropic') as ServiceId | undefined;
    if (mappedService && services[mappedService]) {
      activeServiceId = mappedService;
      activeModelId = services[mappedService]!.model;
    } else if (services.anthropic) {
      activeServiceId = 'anthropic';
      activeModelId = services.anthropic.model;
    }
  }

  return { version: 2, activeModel: { serviceId: activeServiceId, modelId: activeModelId }, services };
}

// ── Load / Save ────────────────────────────────────────────────

const DEFAULT_SETTINGS: AISettingsV2 = {
  version: 2,
  activeModel: { serviceId: 'anthropic', modelId: 'claude-sonnet-4-20250514' },
  services: {},
};

export function loadAISettings(): AISettingsV2 {
  try {
    const raw = localStorage.getItem(AI_CONFIG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // V2 format
      if (parsed.version === 2) return parsed as AISettingsV2;
      // V1 format → migrate
      const migrated = migrateV1ToV2(parsed);
      saveAISettings(migrated);
      return migrated;
    }
  } catch {}
  return { ...DEFAULT_SETTINGS };
}

export function saveAISettings(settings: AISettingsV2): void {
  try {
    localStorage.setItem(AI_CONFIG_KEY, JSON.stringify(settings));
  } catch {}
}

// ── Active service helpers ─────────────────────────────────────

export function getActiveServiceConfig(settings: AISettingsV2): { definition: ServiceDefinition; config: ServiceConfig } | null {
  const { serviceId, modelId } = settings.activeModel;
  const def = SERVICE_MAP[serviceId];
  if (!def) return null;
  const cfg = settings.services[serviceId];
  if (!cfg?.apiKey) return null;
  return { definition: def, config: { ...cfg, model: modelId } };
}

export function getConfiguredServices(settings: AISettingsV2): { definition: ServiceDefinition; config: ServiceConfig }[] {
  const result: { definition: ServiceDefinition; config: ServiceConfig }[] = [];
  for (const def of SERVICE_DEFINITIONS) {
    const cfg = settings.services[def.id];
    if (cfg?.apiKey) {
      result.push({ definition: def, config: cfg });
    }
  }
  return result;
}

/** Build a legacy AIProviderConfig from the new service-based config.
 *  Used as an adapter for the existing streamChat() function. */
export function buildLegacyConfig(def: ServiceDefinition, cfg: ServiceConfig): AIProviderConfig {
  return {
    type: def.streamType === 'anthropic' ? 'anthropic' : 'openai',
    apiKey: cfg.apiKey,
    baseUrl: def.baseUrl,
    model: cfg.model,
    label: def.label,
  };
}

/** Get the context window (in tokens) for a specific model.
 *  Returns undefined if the model is custom / not found. */
export function getModelContextWindow(serviceId: ServiceId, modelId: string): number | undefined {
  const def = SERVICE_MAP[serviceId];
  if (!def) return undefined;
  return def.models.find(m => m.id === modelId)?.contextWindow;
}

/** Get all configured models with their context windows (for context tier display). */
export function getConfiguredModelsWithContext(settings: AISettingsV2): { serviceId: ServiceId; serviceLabel: string; modelId: string; modelLabel: string; contextWindow: number | undefined; isActive: boolean }[] {
  const result: { serviceId: ServiceId; serviceLabel: string; modelId: string; modelLabel: string; contextWindow: number | undefined; isActive: boolean }[] = [];
  for (const def of SERVICE_DEFINITIONS) {
    const cfg = settings.services[def.id];
    if (!cfg?.apiKey) continue;
    const modelId = cfg.model || def.models[0]?.id;
    const modelDef = def.models.find(m => m.id === modelId);
    result.push({
      serviceId: def.id,
      serviceLabel: def.label,
      modelId,
      modelLabel: modelDef?.label || modelId,
      contextWindow: modelDef?.contextWindow,
      isActive: settings.activeModel.serviceId === def.id && settings.activeModel.modelId === modelId,
    });
  }
  return result;
}

/** @deprecated Use getActiveServiceConfig + buildLegacyConfig instead */
export function getActiveProvider(settings: AISettingsV2): AIProviderConfig {
  const active = getActiveServiceConfig(settings);
  if (active) return buildLegacyConfig(active.definition, active.config);
  return { ...DEFAULT_PROVIDERS.openai, apiKey: '' };
}

/** @deprecated Use getActiveServiceConfig instead */
export function isProviderConfigured(settings: AISettingsV2): boolean {
  return getActiveServiceConfig(settings) !== null;
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

// ── Cloud settings bundle (V2) ─────────────────────────────────
// Bundles AI settings + context preferences into one envelope for cloud sync.
// API keys are encrypted; everything else is plaintext.

const AI_SETTINGS_UPDATED_KEY = '0colors-ai-settings-updated';

export interface CloudAISettingsBundle {
  version?: 2;
  settings: {
    activeModel?: { serviceId: ServiceId; modelId: string };
    // V2 format: per-service entries
    services?: Record<string, { model: string; encryptedKey: string }>;
    // V1 legacy fields (read during migration, never written)
    activeProvider?: ProviderType;
    providers?: Record<string, { type: string; baseUrl: string; model: string; label: string; encryptedKey: string }>;
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

/** Build a V2 cloud-ready settings bundle with encrypted API keys */
export async function buildCloudSettingsBundle(
  settings: AISettingsV2,
  contextTier: ContextTier,
  contextToggles: ContextToggles,
  userId: string,
): Promise<CloudAISettingsBundle> {
  const key = await deriveEncryptionKey(userId);
  const services: Record<string, { model: string; encryptedKey: string }> = {};
  for (const [sid, cfg] of Object.entries(settings.services)) {
    if (cfg?.apiKey) {
      services[sid] = {
        model: cfg.model,
        encryptedKey: await encryptString(cfg.apiKey, key),
      };
    }
  }
  const now = Date.now();
  setLocalSettingsUpdatedAt(now);
  return {
    version: 2,
    settings: { activeModel: settings.activeModel, services },
    contextTier,
    contextToggles,
    updatedAt: now,
  };
}

/** Restore AISettingsV2 from a cloud bundle (decrypts API keys) */
export async function restoreSettingsFromCloud(
  bundle: CloudAISettingsBundle,
  userId: string,
): Promise<{ settings: AISettingsV2; contextTier: ContextTier; contextToggles: ContextToggles }> {
  const key = await deriveEncryptionKey(userId);

  // V2 cloud format
  if (bundle.settings.services && bundle.settings.activeModel) {
    const services: Partial<Record<ServiceId, ServiceConfig>> = {};
    for (const [sid, entry] of Object.entries(bundle.settings.services)) {
      if (SERVICE_MAP[sid as ServiceId]) {
        services[sid as ServiceId] = {
          apiKey: await decryptString(entry.encryptedKey, key),
          model: entry.model,
        };
      }
    }
    return {
      settings: { version: 2, activeModel: bundle.settings.activeModel, services },
      contextTier: bundle.contextTier || 'medium',
      contextToggles: bundle.contextToggles || DEFAULT_TOGGLES,
    };
  }

  // V1 cloud format — migrate
  const v1Data: any = { providers: {} };
  if (bundle.settings.providers) {
    for (const [pt, cp] of Object.entries(bundle.settings.providers)) {
      v1Data.providers[pt] = { ...cp, apiKey: await decryptString(cp.encryptedKey, key) };
    }
  }
  v1Data.activeProvider = bundle.settings.activeProvider || 'openai';
  const migrated = migrateV1ToV2(v1Data);
  return {
    settings: migrated,
    contextTier: bundle.contextTier || 'medium',
    contextToggles: bundle.contextToggles || DEFAULT_TOGGLES,
  };
}

/** Merge local and cloud settings — cloud wins if newer, but
 *  local API keys are preserved if cloud keys are empty (decryption failure). */
export async function mergeSettingsBundles(
  localSettings: AISettingsV2,
  localTier: ContextTier,
  localToggles: ContextToggles,
  cloudBundle: CloudAISettingsBundle,
  userId: string,
): Promise<{ settings: AISettingsV2; contextTier: ContextTier; contextToggles: ContextToggles; changed: boolean }> {
  const localUpdated = getLocalSettingsUpdatedAt();
  if (cloudBundle.updatedAt <= localUpdated) {
    return { settings: localSettings, contextTier: localTier, contextToggles: localToggles, changed: false };
  }
  const restored = await restoreSettingsFromCloud(cloudBundle, userId);
  // Preserve local API keys if cloud decryption returned empty
  for (const sid of Object.keys(localSettings.services) as ServiceId[]) {
    const localCfg = localSettings.services[sid];
    const cloudCfg = restored.settings.services[sid];
    if (localCfg?.apiKey && (!cloudCfg || !cloudCfg.apiKey)) {
      restored.settings.services[sid] = { model: cloudCfg?.model || localCfg.model, apiKey: localCfg.apiKey };
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

/** @deprecated Use saveCloudSettingsBundle instead */
export async function saveCloudAISettings(accessToken: string, settings: AISettingsV2): Promise<boolean> {
  console.log('[AI] Warning: saveCloudAISettings called — use saveCloudSettingsBundle for encrypted sync');
  return false;
}