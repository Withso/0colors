import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Send, Plus, Menu, Trash2, MessageSquare, Settings, Sparkles, StopCircle, Copy, Check, ArrowDown, PanelRight, Maximize2, Move, Download, ChevronDown, Hammer, Diamond } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Conversation, ConversationMessage, generateId, generateConversationTitle,
  loadAISettings, getActiveProvider, isProviderConfigured, streamChat, ChatMessage,
  AISettingsV2, ServiceId, SERVICE_DEFINITIONS, SERVICE_MAP,
  getActiveServiceConfig, getConfiguredServices, buildLegacyConfig, saveAISettings,
  loadContextTier, loadContextToggles, ContextToggles,
  MAX_CONVERSATIONS, MAX_MESSAGES_PER_CONVERSATION,
} from '../../utils/ai-provider';
type AISettings = AISettingsV2;
import type { ContextTier } from '../../utils/ai-context-manager';
import { AISettingsPopup } from './AISettingsPopup';
import { PendingActionsCard, ExecutedActionsSummary, BuildModeBadge } from './BuildActionPreview';
import { copyTextToClipboard } from '../../utils/clipboard';
import { prepareAPIMessages } from '../../utils/ai-context-manager';
import { runBuildConversation, type BuildLoopCallbacks } from '../../utils/ai-build-loop';
import { describeToolCall, type ToolCall, type ToolResult } from '../../utils/ai-build-tools';
import type { BuildMessage } from '../../utils/ai-build-stream';
import type { MutationContext } from '../../utils/ai-build-executor';
import { toast } from 'sonner';
import './AskAIChat.css';

// ── Constants ───────────────────────────────────────────────────
const CHAT_WIDTH = 380;
const DOCKED_WIDTH = 360;
const MIN_HEIGHT = 320;
const MAX_HEIGHT_RATIO = 0.85;
const MAX_INPUT_CHARS = 12000;
const TEXTAREA_MIN_H = 40;
const TEXTAREA_MAX_H = 160;
const POSITION_KEY = '0colors-ai-chat-pos';
const DOCK_KEY = '0colors-ai-chat-docked';
const HEIGHT_KEY = '0colors-ai-chat-height';
const VIEWPORT_MARGIN = 8; // Min px from viewport edge

// ── Position/Dock persistence ───────────────────────────────────
export function loadDocked(): boolean {
  try { return localStorage.getItem(DOCK_KEY) === 'true'; } catch { return false; }
}
export function saveDocked(v: boolean) {
  try { localStorage.setItem(DOCK_KEY, String(v)); } catch { }
}
function loadPosition(): { x: number; y: number } | null {
  try {
    const raw = localStorage.getItem(POSITION_KEY);
    if (raw) return JSON.parse(raw);
  } catch { }
  return null;
}
function savePosition(pos: { x: number; y: number }) {
  try { localStorage.setItem(POSITION_KEY, JSON.stringify(pos)); } catch { }
}
function loadHeight(): number {
  try {
    const saved = localStorage.getItem(HEIGHT_KEY);
    if (saved) return Math.max(MIN_HEIGHT, Math.min(parseInt(saved), window.innerHeight * MAX_HEIGHT_RATIO));
  } catch { }
  return 520;
}
function saveHeight(h: number) {
  try { localStorage.setItem(HEIGHT_KEY, String(h)); } catch { }
}

/** Clamp a position so the chat popup stays fully inside the viewport */
function clampPosition(x: number, y: number, w: number, h: number): { x: number; y: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  return {
    x: Math.max(VIEWPORT_MARGIN, Math.min(x, vw - w - VIEWPORT_MARGIN)),
    y: Math.max(VIEWPORT_MARGIN, Math.min(y, vh - h - VIEWPORT_MARGIN)),
  };
}

/** Compute a good default position (bottom-right, above any bottom toolbar) */
function defaultPosition(h: number): { x: number; y: number } {
  return clampPosition(
    window.innerWidth - CHAT_WIDTH - 24,
    window.innerHeight - h - 80,
    CHAT_WIDTH,
    h,
  );
}

// ── Props ───────────────────────────────────────────────────────
type AIMode = 'ask' | 'build';

interface AskAIChatProps {
  isOpen: boolean;
  onClose: () => void;
  conversations: Conversation[];
  onConversationsChange: (conversations: Conversation[] | ((prev: Conversation[]) => Conversation[])) => void;
  isCloudProject: boolean;
  isTemplate: boolean;
  projectContext?: string;  // Raw project context from buildProjectContext (context manager handles KB + budgeting)
  isDocked: boolean;
  onDockChange: (docked: boolean) => void;
  onSettingsSaved?: (settings: AISettings, contextTier: ContextTier, contextToggles: ContextToggles) => void;
  /** Mutation context for Build Mode — if not provided, Build Mode is disabled */
  mutationContext?: MutationContext;
  /** Pause/resume undo tracking for Build Mode batch operations */
  onPauseUndo?: () => void;
  onResumeUndo?: () => void;
}

// ── Markdown-lite renderer (no deps) ────────────────────────────
function renderContent(text: string): JSX.Element {
  const parts = text.split(/(```[\s\S]*?```)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('```') && part.endsWith('```')) {
          const inner = part.slice(3, -3);
          const nlIndex = inner.indexOf('\n');
          const code = nlIndex >= 0 ? inner.slice(nlIndex + 1) : inner;
          return (
            <pre key={i} className="ai-chat-code-block">
              <code>{code}</code>
            </pre>
          );
        }
        // Bold
        const bolded = part.replace(/\*\*(.*?)\*\*/g, '<b class="ai-chat-inline-bold">$1</b>');
        // Inline code
        const coded = bolded.replace(/`([^`]+)`/g, '<code class="ai-chat-inline-code">$1</code>');
        return <span key={i} dangerouslySetInnerHTML={{ __html: coded }} />;
      })}
    </>
  );
}

// ── Structured error parser & renderer ──────────────────────────
interface StructuredError {
  code: number;
  errorCode: string;
  title: string;
  message: string;
  suggestion?: string;
}

function parseStructuredError(content: string): StructuredError | null {
  // Check for __ERR__ prefix (with or without "Error: " wrapper)
  let raw = content;
  if (raw.startsWith('Error: ')) raw = raw.slice(7);
  if (!raw.startsWith('__ERR__')) return null;
  try {
    return JSON.parse(raw.slice(7));
  } catch {
    return null;
  }
}

const ERROR_ICON_COLORS: Record<string, string> = {
  'rate_limit_exceeded': 'var(--text-warning)',
  'rate_limited': 'var(--text-warning)',
  '429': 'var(--text-warning)',
  'authentication_error': 'var(--text-critical)',
  '401': 'var(--text-critical)',
  '403': 'var(--text-critical)',
  'not_found': 'var(--utility-knowledge)',
  '404': 'var(--utility-knowledge)',
  'network_error': 'var(--text-critical)',
  '0': 'var(--text-critical)',
};

function getErrorColor(err: StructuredError): string {
  return ERROR_ICON_COLORS[err.errorCode] ||
    ERROR_ICON_COLORS[String(err.code)] ||
    'var(--text-critical)';
}

function ErrorBubble({ error }: { error: StructuredError }) {
  const accent = getErrorColor(error);
  return (
    <div
      className="ai-chat-error-bubble"
      style={{ '--ai-chat-error-accent': accent } as React.CSSProperties}
    >
      {/* Header */}
      <div className="ai-chat-error-header">
        <div className="ai-chat-error-icon">
          <X size={10} className="ai-chat-error-icon-svg" />
        </div>
        <div className="ai-chat-error-header-inner">
          <div className="ai-chat-error-header-row">
            <span className="ai-chat-error-title">
              {error.title}
            </span>
            <span className="ai-chat-error-code">
              {error.code || error.errorCode}
            </span>
          </div>
        </div>
      </div>
      {/* Body */}
      <div className="ai-chat-error-body">
        <p className="ai-chat-error-message">
          {error.message}
        </p>
        {error.suggestion && (
          <p className="ai-chat-error-suggestion">
            {error.suggestion}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Copy button for messages ────────────────────────────────────
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="ai-chat-copy-btn"
      style={{ color: copied ? 'var(--text-success)' : 'var(--text-disabled)' }}
      onClick={() => {
        copyTextToClipboard(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check size={11} /> : <Copy size={11} />}
    </button>
  );
}

// ── Relative time helper ────────────────────────────────────────
function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ── Export conversation as Markdown ──────────────────────────────
function exportConversation(conv: Conversation) {
  const dateStr = new Date(conv.createdAt).toLocaleString();
  const lines: string[] = [
    `# ${conv.title}`,
    `> Exported from 0colors Ask AI — ${dateStr}`,
    `> ${conv.messages.length} messages`,
    '',
  ];
  for (const msg of conv.messages) {
    const ts = new Date(msg.timestamp).toLocaleString();
    const role = msg.role === 'user' ? 'You' : 'AI';
    lines.push(`## ${role}  *(${ts})*`);
    lines.push('');
    // Check for structured errors — render them cleanly
    let raw = msg.content;
    if (raw.startsWith('Error: ')) raw = raw.slice(7);
    if (raw.startsWith('__ERR__')) {
      try {
        const err = JSON.parse(raw.slice(7));
        lines.push(`**Error ${err.code}: ${err.title}**`);
        lines.push(err.message);
        if (err.suggestion) lines.push(`> ${err.suggestion}`);
      } catch {
        lines.push(msg.content);
      }
    } else {
      lines.push(msg.content);
    }
    lines.push('');
    lines.push('---');
    lines.push('');
  }
  const markdown = lines.join('\n');
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeTitle = conv.title.replace(/[^a-zA-Z0-9_\- ]/g, '').trim().replace(/\s+/g, '_') || 'conversation';
  a.href = url;
  a.download = `${safeTitle}_${new Date(conv.createdAt).toISOString().slice(0, 10)}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ═════════════════════════════════════════════════════════════════
// Main Component
// ═════════════════════════════════════════════════════════════════

export function AskAIChat({
  isOpen, onClose,
  conversations, onConversationsChange,
  isCloudProject, isTemplate,
  projectContext,
  isDocked, onDockChange,
  onSettingsSaved,
  mutationContext,
  onPauseUndo, onResumeUndo,
}: AskAIChatProps) {
  // ── State ─────────────────────────────────────────────────────
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [showSidebar, setShowSidebar] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [height, setHeight] = useState(loadHeight);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [aiSettings, setAISettings] = useState<AISettings>(loadAISettings);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const modelPickerRef = useRef<HTMLDivElement>(null);

  // ── Build Mode state ──
  const [aiMode, setAIMode] = useState<AIMode>(() => {
    try { return (localStorage.getItem('0colors-ai-mode') as AIMode) || 'ask'; } catch { return 'ask'; }
  });
  const [pendingToolCalls, setPendingToolCalls] = useState<{ toolCalls: ToolCall[]; descriptions: string[] } | null>(null);
  const [executedActions, setExecutedActions] = useState<{ description: string; result: ToolResult }[]>([]);
  const pendingResolveRef = useRef<((decision: 'apply' | 'skip' | 'cancel') => void) | null>(null);
  const buildModeAvailable = !!mutationContext;
  const [position, setPosition] = useState<{ x: number; y: number }>(
    () => {
      const saved = loadPosition();
      if (saved) {
        const h = loadHeight();
        return clampPosition(saved.x, saved.y, CHAT_WIDTH, h);
      }
      return defaultPosition(loadHeight());
    }
  );

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const resizeRef = useRef<{ startY: number; startH: number } | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number } | null>(null);
  const positionRef = useRef(position);
  const heightRef = useRef(height);

  // Keep refs in sync
  useEffect(() => { positionRef.current = position; }, [position]);
  useEffect(() => { heightRef.current = height; }, [height]);

  // Persist AI mode
  useEffect(() => {
    try { localStorage.setItem('0colors-ai-mode', aiMode); } catch {}
  }, [aiMode]);

  // Close model picker on outside click
  useEffect(() => {
    if (!showModelPicker) return;
    const onClick = (e: MouseEvent) => {
      if (modelPickerRef.current && !modelPickerRef.current.contains(e.target as Node)) {
        setShowModelPicker(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [showModelPicker]);

  // ── Clamp position on open + on window resize ─────────────────
  useEffect(() => {
    if (!isOpen || isDocked) return;
    // Clamp on open
    const h = heightRef.current;
    const clamped = clampPosition(positionRef.current.x, positionRef.current.y, CHAT_WIDTH, h);
    if (clamped.x !== positionRef.current.x || clamped.y !== positionRef.current.y) {
      setPosition(clamped);
    }
    // Clamp on resize
    const onResize = () => {
      const cur = positionRef.current;
      const cH = heightRef.current;
      const next = clampPosition(cur.x, cur.y, CHAT_WIDTH, cH);
      if (next.x !== cur.x || next.y !== cur.y) setPosition(next);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [isOpen, isDocked]);

  // ── Active conversation ───────────────────────────────────────
  const activeConversation = useMemo(
    () => conversations.find(c => c.id === activeConvId) || null,
    [conversations, activeConvId],
  );

  // ── Reload settings when popup opens ──────────────────────────
  useEffect(() => {
    if (isOpen) setAISettings(loadAISettings());
  }, [isOpen]);

  // ── Auto-scroll to bottom ─────────────────────────────────────
  const scrollToBottom = useCallback((smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'instant' });
  }, []);

  useEffect(() => {
    if (activeConversation?.messages.length || streamingText) {
      scrollToBottom();
    }
  }, [activeConversation?.messages.length, streamingText, scrollToBottom]);

  // ── Scroll detection for "scroll down" button ─────────────────
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const onScroll = () => {
      const distFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
      setShowScrollDown(distFromBottom > 100);
    };
    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
  }, [activeConvId]);

  // ── Textarea auto-resize ──────────────────────────────────────
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = `${TEXTAREA_MIN_H}px`;
    const newH = Math.min(ta.scrollHeight, TEXTAREA_MAX_H);
    ta.style.height = `${Math.max(TEXTAREA_MIN_H, newH)}px`;
  }, [input]);

  // ── Focus input when opening / switching conversations ────────
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [isOpen, activeConvId]);

  // ── Height resize (for floating mode) ─────────────────────────
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    if (isDocked) return;
    e.preventDefault();
    resizeRef.current = { startY: e.clientY, startH: heightRef.current };
    const onMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return;
      const delta = resizeRef.current.startY - ev.clientY;
      const newH = Math.max(MIN_HEIGHT, Math.min(resizeRef.current.startH + delta, window.innerHeight * MAX_HEIGHT_RATIO));
      setHeight(newH);
      // Re-clamp position so popup doesn't go off-screen when growing taller
      const cur = positionRef.current;
      const clamped = clampPosition(cur.x, cur.y, CHAT_WIDTH, newH);
      if (clamped.x !== cur.x || clamped.y !== cur.y) setPosition(clamped);
    };
    const onUp = () => {
      saveHeight(heightRef.current);
      resizeRef.current = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [isDocked]);

  // ── Drag handling (for floating mode) ─────────────────────────
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if (isDocked) return;
    e.preventDefault();
    const startPos = positionRef.current;
    dragRef.current = { startX: e.clientX, startY: e.clientY, startPosX: startPos.x, startPosY: startPos.y };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = ev.clientX - dragRef.current.startX;
      const dy = ev.clientY - dragRef.current.startY;
      const rawX = dragRef.current.startPosX + dx;
      const rawY = dragRef.current.startPosY + dy;
      const clamped = clampPosition(rawX, rawY, CHAT_WIDTH, heightRef.current);
      setPosition(clamped);
    };
    const onUp = () => {
      savePosition(positionRef.current);
      dragRef.current = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [isDocked]);

  // Save position when it changes (floating mode only)
  useEffect(() => {
    if (!isDocked) savePosition(position);
  }, [position, isDocked]);

  // ── Toggle dock/float ─────────────────────────────────────────
  const toggleDock = useCallback(() => {
    const next = !isDocked;
    onDockChange(next);
    if (!next) {
      // Going to floating: reset position to a visible default
      const h = heightRef.current;
      setPosition(defaultPosition(h));
    }
  }, [isDocked, onDockChange]);

  // ── New conversation ──────────────────────────────────────────
  const startNewConversation = useCallback(() => {
    // Notify when approaching or at the conversation limit
    const currentCount = conversations.length;
    if (currentCount >= MAX_CONVERSATIONS) {
      toast.warning(`Conversation limit reached (${MAX_CONVERSATIONS}). The oldest conversation will be removed.`, { duration: 4000 });
    } else if (currentCount >= MAX_CONVERSATIONS - 5) {
      toast.info(`${currentCount + 1}/${MAX_CONVERSATIONS} conversations used`, { duration: 3000 });
    }

    const newConv: Conversation = {
      id: generateId(),
      title: 'New Chat',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    // If at the limit, the trimConversations in handleAIConversationsChange
    // will auto-remove the oldest conversation(s)
    onConversationsChange([newConv, ...conversations]);
    setActiveConvId(newConv.id);
    setShowSidebar(false);
    setInput('');
    setStreamingText('');
  }, [conversations, onConversationsChange]);

  // ── Delete conversation ───────────────────────────────────────
  const deleteConversation = useCallback((id: string) => {
    const updated = conversations.filter(c => c.id !== id);
    onConversationsChange(updated);
    if (activeConvId === id) {
      setActiveConvId(updated[0]?.id || null);
    }
  }, [conversations, onConversationsChange, activeConvId]);

  // ── Send message ──────────────────────────────────────────────
  const sendMessage = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;

    const activeService = getActiveServiceConfig(aiSettings);
    if (!activeService) {
      setShowSettings(true);
      return;
    }
    const provider = buildLegacyConfig(activeService.definition, activeService.config);

    // Create conversation if none active
    let convId = activeConvId;
    let updatedConvs = [...conversations];

    if (!convId) {
      const newConv: Conversation = {
        id: generateId(),
        title: generateConversationTitle(trimmed),
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      updatedConvs = [newConv, ...updatedConvs];
      convId = newConv.id;
      setActiveConvId(convId);
    }

    // Add user message
    const userMsg: ConversationMessage = {
      id: generateId(),
      role: 'user',
      content: trimmed,
      timestamp: Date.now(),
    };

    updatedConvs = updatedConvs.map(c => {
      if (c.id !== convId) return c;
      const isFirst = c.messages.length === 0;
      return {
        ...c,
        messages: [...c.messages, userMsg],
        title: isFirst ? generateConversationTitle(trimmed) : c.title,
        updatedAt: Date.now(),
      };
    });
    onConversationsChange(updatedConvs);
    setInput('');
    setIsStreaming(true);
    setStreamingText('');

    // Build message history for API — uses context manager for:
    // - User-selected tier (small/medium/large)
    // - Knowledge base selection (compact vs full)
    // - Project context truncation to fit budget
    // - Conversation history sliding window
    // - Adaptive max_tokens for response
    const conv = updatedConvs.find(c => c.id === convId)!;
    const conversationMsgs: ChatMessage[] = conv.messages.map(m => ({
      role: m.role,
      content: m.content,
    }));
    const prepared = prepareAPIMessages({
      projectContext: projectContext || '',
      conversationMessages: conversationMsgs,
      tier: loadContextTier(),
      toggles: loadContextToggles(),
    });

    // Log context stats for debugging
    console.log(`[AI Context] Tier: ${prepared.stats.tier} | Total input: ${prepared.stats.totalInputTokens} tokens`);
    console.log(`[AI Context] System prompt: ${prepared.stats.totalSystemPromptTokens} tokens (KB: ${prepared.stats.knowledgeBaseTokens}, Project: ${prepared.stats.projectContextTokens})`);
    console.log(`[AI Context] Conversation: ${prepared.stats.conversationTokens} tokens (${prepared.stats.finalMessageCount}/${prepared.stats.originalMessageCount} messages${prepared.stats.historyTruncated ? ', TRUNCATED' : ''})`);
    console.log(`[AI Context] Max response: ${prepared.maxResponseTokens} tokens | Budget remaining: ${prepared.stats.budgetRemaining} tokens`);

    const apiMessages = prepared.messages;

    // Stream response
    const abortCtrl = new AbortController();
    abortRef.current = abortCtrl;
    let fullResponse = '';

    await streamChat(apiMessages, provider, {
      onToken: (token) => {
        fullResponse += token;
        setStreamingText(fullResponse);
      },
      onRetry: (waitSeconds, attempt, maxAttempts) => {
        setStreamingText(`\u23f3 Rate limited — retrying in ${waitSeconds}s (attempt ${attempt}/${maxAttempts})...\nTip: Try a smaller Context Tier in AI Settings if this keeps happening.`);
      },
      onDone: (text) => {
        const assistantMsg: ConversationMessage = {
          id: generateId(),
          role: 'assistant',
          content: text,
          timestamp: Date.now(),
        };
        onConversationsChange(prev =>
          (Array.isArray(prev) ? prev : updatedConvs).map(c => {
            if (c.id !== convId) return c;
            const updated = { ...c, messages: [...c.messages, assistantMsg], updatedAt: Date.now() };
            // Notify when approaching message limit
            const msgCount = updated.messages.length;
            if (msgCount >= MAX_MESSAGES_PER_CONVERSATION) {
              toast.warning(`Message limit reached (${MAX_MESSAGES_PER_CONVERSATION}). Older messages will be trimmed to make room.`, { duration: 5000 });
            } else if (msgCount >= MAX_MESSAGES_PER_CONVERSATION - 10 && msgCount % 10 === 0) {
              toast.info(`${msgCount}/${MAX_MESSAGES_PER_CONVERSATION} messages in this conversation`, { duration: 3000 });
            }
            return updated;
          }),
        );
        setIsStreaming(false);
        setStreamingText('');
        abortRef.current = null;
      },
      onError: (error) => {
        const errorMsg: ConversationMessage = {
          id: generateId(),
          role: 'assistant',
          content: error,
          timestamp: Date.now(),
        };
        onConversationsChange(prev =>
          (Array.isArray(prev) ? prev : updatedConvs).map(c => {
            if (c.id !== convId) return c;
            return { ...c, messages: [...c.messages, errorMsg], updatedAt: Date.now() };
          }),
        );
        setIsStreaming(false);
        setStreamingText('');
        abortRef.current = null;
      },
    }, abortCtrl.signal, prepared.maxResponseTokens);
  }, [input, isStreaming, activeConvId, conversations, onConversationsChange, aiSettings, projectContext]);

  // ── Send message (Build Mode) ────────────────────────────────
  const sendBuildMessage = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming || !mutationContext) return;

    const activeService = getActiveServiceConfig(aiSettings);
    if (!activeService) { setShowSettings(true); return; }
    const provider = buildLegacyConfig(activeService.definition, activeService.config);

    // Create conversation if none active
    let convId = activeConvId;
    let updatedConvs = [...conversations];
    if (!convId) {
      const newConv: Conversation = {
        id: generateId(), title: generateConversationTitle(trimmed),
        messages: [], createdAt: Date.now(), updatedAt: Date.now(),
      };
      updatedConvs = [newConv, ...updatedConvs];
      convId = newConv.id;
      setActiveConvId(convId);
    }

    // Add user message
    const userMsg: ConversationMessage = { id: generateId(), role: 'user', content: trimmed, timestamp: Date.now() };
    updatedConvs = updatedConvs.map(c => {
      if (c.id !== convId) return c;
      const isFirst = c.messages.length === 0;
      return { ...c, messages: [...c.messages, userMsg], title: isFirst ? generateConversationTitle(trimmed) : c.title, updatedAt: Date.now() };
    });
    onConversationsChange(updatedConvs);
    setInput('');
    setIsStreaming(true);
    setStreamingText('');
    setExecutedActions([]);

    // Build messages for the API
    const conv = updatedConvs.find(c => c.id === convId)!;
    const conversationMsgs: ChatMessage[] = conv.messages.map(m => ({ role: m.role, content: m.content }));
    const prepared = prepareAPIMessages({
      projectContext: projectContext || '',
      conversationMessages: conversationMsgs,
      tier: loadContextTier(),
      toggles: loadContextToggles(),
    });

    // Add Build Mode instruction to system prompt
    const buildSystemPrompt = prepared.messages[0]?.content
      ? prepared.messages[0].content + '\n\nYou are in BUILD MODE. You can create and modify the user\'s design system using the provided tools. Explain what you plan to do, then use tools to execute. Be precise with color values and naming.'
      : 'You are in BUILD MODE for 0colors. Use the provided tools to create and modify the design system.';

    const buildMessages: BuildMessage[] = [
      { role: 'system', content: buildSystemPrompt },
      ...prepared.messages.slice(1).map(m => ({ role: m.role as any, content: m.content })),
    ];

    const abortCtrl = new AbortController();
    abortRef.current = abortCtrl;
    let fullResponse = '';

    // Pause undo tracking for batch
    onPauseUndo?.();

    const loopCallbacks: BuildLoopCallbacks = {
      onToken: (token) => {
        fullResponse += token;
        setStreamingText(fullResponse);
      },
      onToolCallStart: (id, name) => {
        console.log(`[Build] Tool call started: ${name} (${id})`);
      },
      onToolCallsPending: (toolCalls, descriptions) => {
        setPendingToolCalls({ toolCalls, descriptions });
      },
      onToolCallExecuted: (toolCall, result) => {
        const desc = describeToolCall(toolCall.name, toolCall.arguments);
        setExecutedActions(prev => [...prev, { description: desc, result }]);
      },
      onTurnComplete: (text, results) => {
        setPendingToolCalls(null);
      },
      onDone: (text) => {
        // Resume undo (commits all AI mutations as one batch)
        onResumeUndo?.();
        // Save assistant response
        const assistantMsg: ConversationMessage = { id: generateId(), role: 'assistant', content: text, timestamp: Date.now() };
        onConversationsChange(prev =>
          (Array.isArray(prev) ? prev : updatedConvs).map(c => {
            if (c.id !== convId) return c;
            return { ...c, messages: [...c.messages, assistantMsg], updatedAt: Date.now() };
          }),
        );
        setIsStreaming(false);
        setStreamingText('');
        setPendingToolCalls(null);
        abortRef.current = null;
      },
      onError: (error) => {
        onResumeUndo?.();
        const errorMsg: ConversationMessage = { id: generateId(), role: 'assistant', content: `Build error: ${error}`, timestamp: Date.now() };
        onConversationsChange(prev =>
          (Array.isArray(prev) ? prev : updatedConvs).map(c => {
            if (c.id !== convId) return c;
            return { ...c, messages: [...c.messages, errorMsg], updatedAt: Date.now() };
          }),
        );
        setIsStreaming(false);
        setStreamingText('');
        setPendingToolCalls(null);
        abortRef.current = null;
      },
      onRetry: (waitSeconds, attempt, maxAttempts) => {
        setStreamingText(`\u23f3 Rate limited — retrying in ${waitSeconds}s (attempt ${attempt}/${maxAttempts})...`);
      },
      onRequestConfirmation: (toolCalls, descriptions) => {
        return new Promise<'apply' | 'skip' | 'cancel'>((resolve) => {
          setPendingToolCalls({ toolCalls, descriptions });
          pendingResolveRef.current = resolve;
        });
      },
      onRefreshContext: () => {
        return mutationContext.getCurrentProjectContext();
      },
    };

    try {
      await runBuildConversation(buildMessages, provider, mutationContext, loopCallbacks, abortCtrl.signal, prepared.maxResponseTokens);
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        onResumeUndo?.();
        loopCallbacks.onError(err?.message || 'Unknown build error');
      }
    }
  }, [input, isStreaming, activeConvId, conversations, onConversationsChange, aiSettings, projectContext, mutationContext, onPauseUndo, onResumeUndo]);

  // ── Handle Build Mode confirmation ────────────────────────────
  const handleBuildApply = useCallback(() => {
    pendingResolveRef.current?.('apply');
    pendingResolveRef.current = null;
  }, []);

  const handleBuildSkip = useCallback(() => {
    pendingResolveRef.current?.('skip');
    pendingResolveRef.current = null;
    setPendingToolCalls(null);
  }, []);

  const handleBuildCancel = useCallback(() => {
    pendingResolveRef.current?.('cancel');
    pendingResolveRef.current = null;
    setPendingToolCalls(null);
  }, []);

  // ── Stop streaming ────────────────────────────────────────────
  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
    if (streamingText) {
      const assistantMsg: ConversationMessage = {
        id: generateId(),
        role: 'assistant',
        content: streamingText + '\n\n*(Stopped)*',
        timestamp: Date.now(),
      };
      onConversationsChange(conversations.map(c => {
        if (c.id !== activeConvId) return c;
        return { ...c, messages: [...c.messages, assistantMsg], updatedAt: Date.now() };
      }));
    }
    setIsStreaming(false);
    setStreamingText('');
    abortRef.current = null;
  }, [streamingText, activeConvId, conversations, onConversationsChange]);

  // ── Keyboard: Enter to send, Shift+Enter for newline ──────────
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (aiMode === 'build') sendBuildMessage();
      else sendMessage();
    }
  }, [sendMessage, sendBuildMessage, aiMode]);

  // ── Access check ──────────────────────────────────────────────
  // All projects have AI access (templates are just projects with isTemplate flag)
  const hasAccess = !useStore.getState().projects.find(p => p.id === useStore.getState().activeProjectId)?.isSample;

  if (!isOpen) return null;

  const charCount = input.length;
  const isOverLimit = charCount > MAX_INPUT_CHARS;

  // ── Shared header buttons ─────────────────────────────────────
  const headerLeft = (
    <div className="ai-chat-header-left">
      {!isDocked && (
        <div className="ai-chat-drag-icon">
          <Move size={11} />
        </div>
      )}
      <button
        onClick={(e) => { e.stopPropagation(); setShowSidebar(prev => !prev); }}
        className="ai-chat-header-btn"
        style={{ color: showSidebar ? 'var(--text-primary)' : 'var(--icon-disabled)' }}
      >
        <Menu size={14} />
      </button>
      <div className="ai-chat-title-group">
        <Sparkles size={13} className="ai-chat-title-icon" />
        <span className="ai-chat-title-text">{aiMode === 'build' ? 'Build AI' : 'Ask AI'}</span>
        {aiMode === 'build' && <BuildModeBadge />}
      </div>
    </div>
  );

  const headerRight = (
    <div className="ai-chat-header-right">
      <button
        onClick={(e) => { e.stopPropagation(); startNewConversation(); }}
        className="ai-chat-header-btn"
        style={{ color: 'var(--icon-disabled)' }}
        title="New Chat"
      >
        <Plus size={14} />
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); toggleDock(); }}
        className="ai-chat-header-btn"
        style={{ color: isDocked ? 'var(--accent-primary-hover)' : 'var(--icon-disabled)' }}
        title={isDocked ? 'Undock (floating popup)' : 'Dock to right panel'}
        data-testid="ai-chat-dock-toggle-button"
      >
        {isDocked ? <Maximize2 size={14} /> : <PanelRight size={14} />}
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); setShowSettings(true); }}
        className="ai-chat-header-btn"
        style={{ color: 'var(--icon-disabled)' }}
        title="AI Settings"
      >
        <Settings size={14} />
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        className="ai-chat-header-btn"
        style={{ color: 'var(--icon-disabled)' }}
      >
        <X size={14} />
      </button>
    </div>
  );

  // ── Shared body + input content ───────────────────────────────
  const chatBody = (
    <>
      {/* ── Body — full-page toggle between Conversations List and Chat View ── */}
      <div className="ai-chat-body-wrapper">
        <AnimatePresence mode="wait" initial={false}>
          {showSidebar ? (
            /* ═══════════════════════════════════════════════════════════
               CONVERSATIONS PAGE — full-width list replacing the chat
               ═══════════════════════════════════════════════════════════ */
            <motion.div
              key="conversations-page"
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              className="ai-chat-page-slide"
            >
              {/* Conversations header bar */}
              <div className="ai-chat-convos-header">
                <div className="ai-chat-convos-header-left">
                  <MessageSquare size={13} style={{ color: 'var(--icon-disabled)' }} />
                  <span className="ai-chat-convos-title">Conversations</span>
                  {conversations.length > 0 && (
                    <span className="ai-chat-convos-count"
                      style={{ color: conversations.length >= MAX_CONVERSATIONS ? 'var(--accent-primary-hover)' : 'var(--text-disabled)' }}
                      title={`${conversations.length} of ${MAX_CONVERSATIONS} max conversations`}
                    >
                      {conversations.length}/{MAX_CONVERSATIONS}
                    </span>
                  )}
                </div>
                <button
                  onClick={startNewConversation}
                  className="ai-chat-convos-new-btn"
                >
                  <Plus size={12} />
                  New Chat
                </button>
              </div>

              {/* Conversation items */}
              <div className="ai-chat-convos-list">
                {conversations.length === 0 ? (
                  <div className="ai-chat-convos-empty">
                    <MessageSquare size={24} className="ai-chat-convos-empty-icon" />
                    <p className="ai-chat-convos-empty-title">No conversations yet</p>
                    <p className="ai-chat-convos-empty-desc">
                      Start a new chat to begin exploring with AI.
                    </p>
                  </div>
                ) : (
                  <div className="ai-chat-convos-items">
                    {conversations.map(conv => {
                      const isActive = conv.id === activeConvId;
                      const msgCount = conv.messages.length;
                      const lastMsg = conv.messages[msgCount - 1];
                      const lastMsgErr = lastMsg ? parseStructuredError(lastMsg.content) : null;
                      const preview = lastMsg
                        ? (lastMsgErr ? `Error: ${lastMsgErr.title}` : lastMsg.content.length > 60 ? lastMsg.content.slice(0, 60) + '...' : lastMsg.content)
                        : 'No messages yet';
                      return (
                        <div
                          key={conv.id}
                          className={`ai-chat-convo-item${isActive ? ' is-active' : ''}`}
                          onClick={() => { setActiveConvId(conv.id); setShowSidebar(false); }}
                          onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--surface-hover)'; }}
                          onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = ''; } }}
                        >
                          <div className="ai-chat-convo-item-icon">
                            <MessageSquare size={12} style={{ color: isActive ? 'var(--icon-brand)' : 'var(--icon-disabled)' }} />
                          </div>
                          <div className="ai-chat-convo-item-body">
                            <div className="ai-chat-convo-item-top">
                              <span className="ai-chat-convo-item-title" style={{ color: isActive ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
                                {conv.title}
                              </span>
                              <div className="ai-chat-convo-item-actions">
                                <button
                                  className="ai-chat-convo-action-btn"
                                  onClick={e => { e.stopPropagation(); exportConversation(conv); }}
                                  title="Export as Markdown"
                                >
                                  <Download size={11} />
                                </button>
                                <button
                                  className="ai-chat-convo-action-btn"
                                  onClick={e => { e.stopPropagation(); deleteConversation(conv.id); }}
                                  title="Delete conversation"
                                >
                                  <Trash2 size={11} />
                                </button>
                              </div>
                            </div>
                            <p className="ai-chat-convo-item-preview">
                              {preview}
                            </p>
                            <div className="ai-chat-convo-item-meta">
                              <span className="ai-chat-convo-item-count" style={{ color: msgCount >= MAX_MESSAGES_PER_CONVERSATION ? 'var(--accent-primary-hover)' : 'var(--text-disabled)' }}
                                title={msgCount >= MAX_MESSAGES_PER_CONVERSATION - 5 ? `${msgCount}/${MAX_MESSAGES_PER_CONVERSATION} max messages` : undefined}
                              >
                                {msgCount >= MAX_MESSAGES_PER_CONVERSATION - 5
                                  ? `${msgCount}/${MAX_MESSAGES_PER_CONVERSATION} msgs`
                                  : `${msgCount} message${msgCount !== 1 ? 's' : ''}`}
                              </span>
                              <span className="ai-chat-convo-item-time">
                                {timeAgo(conv.updatedAt)}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          ) : (
            /* ═══════════════════════════════════════════════════════════
               CHAT VIEW — messages + input
               ═══════════════════════════════════════════════════════════ */
            <motion.div
              key="chat-view"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 12 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              className="ai-chat-page-slide"
            >
              {/* Messages */}
              <div ref={messagesContainerRef} className="ai-chat-messages">
                {!hasAccess ? (
                  /* ── No access message ── */
                  <div className="ai-chat-no-access">
                    <Sparkles size={28} className="ai-chat-no-access-icon" />
                    <p className="ai-chat-no-access-title">Ask AI is available for Cloud and Template projects</p>
                    <p className="ai-chat-no-access-desc">Switch to a Cloud project or open a Template to use Ask AI.</p>
                  </div>
                ) : !activeConversation || activeConversation.messages.length === 0 ? (
                  /* ── Empty state ── */
                  <div className="ai-chat-empty-state">
                    <Sparkles size={28} className="ai-chat-empty-icon" />
                    <p className="ai-chat-empty-title">Ask anything about 0colors</p>
                    <p className="ai-chat-empty-desc">
                      How to create palettes, use advanced logic,<br />
                      set up themes, build token systems, and more.
                    </p>
                    <p className="ai-chat-empty-context">
                      The AI has full context of your current project — nodes, tokens, themes, logic, and more.
                    </p>
                    {!getActiveServiceConfig(aiSettings) && (
                      <button
                        onClick={() => setShowSettings(true)}
                        className="ai-chat-empty-configure"
                      >
                        Configure your AI provider first
                      </button>
                    )}
                  </div>
                ) : (
                  /* ── Messages list ── */
                  <>
                    {activeConversation.messages.map(msg => {
                      const structuredErr = msg.role === 'assistant' ? parseStructuredError(msg.content) : null;
                      return (
                        <div key={msg.id} className={`group/msg ai-chat-msg-row ${msg.role === 'user' ? 'is-user' : 'is-assistant'}`}>
                          {structuredErr ? (
                            /* ── Structured error bubble ── */
                            <div className="ai-chat-msg-error-wrap">
                              <ErrorBubble error={structuredErr} />
                            </div>
                          ) : (
                            <div className={`ai-chat-msg-bubble ${msg.role === 'user' ? 'is-user' : 'is-assistant'}`}>
                              <div className={`ai-chat-msg-text ${msg.role === 'user' ? 'is-user' : 'is-assistant'}`}>
                                {msg.role === 'assistant' ? renderContent(msg.content) : msg.content}
                              </div>
                              {/* Copy button */}
                              <div className="ai-chat-msg-copy-pos">
                                <CopyButton text={msg.content} />
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {/* Streaming message */}
                    {isStreaming && streamingText && (
                      <div className="ai-chat-streaming-row">
                        <div className="ai-chat-streaming-bubble">
                          <div className="ai-chat-streaming-text">
                            {renderContent(streamingText)}
                            <span className="ai-chat-streaming-cursor" />
                          </div>
                        </div>
                      </div>
                    )}
                    {/* Streaming indicator (no text yet) */}
                    {isStreaming && !streamingText && (
                      <div className="ai-chat-streaming-dots">
                        <div className="ai-chat-streaming-dots-inner">
                          <div className="ai-chat-streaming-dots-row">
                            <div className="ai-chat-dot" style={{ animationDelay: '0ms' }} />
                            <div className="ai-chat-dot" style={{ animationDelay: '150ms' }} />
                            <div className="ai-chat-dot" style={{ animationDelay: '300ms' }} />
                          </div>
                        </div>
                      </div>
                    )}
                    {/* Build Mode: executed actions summary */}
                    {aiMode === 'build' && executedActions.length > 0 && (
                      <ExecutedActionsSummary actions={executedActions} />
                    )}
                    {/* Build Mode: pending actions preview */}
                    {pendingToolCalls && (
                      <PendingActionsCard
                        toolCalls={pendingToolCalls.toolCalls}
                        descriptions={pendingToolCalls.descriptions}
                        onApply={handleBuildApply}
                        onSkip={handleBuildSkip}
                        onCancel={handleBuildCancel}
                        disabled={!isStreaming}
                      />
                    )}
                    <div ref={messagesEndRef} />
                  </>
                )}

                {/* Scroll-to-bottom button */}
                {showScrollDown && (
                  <button
                    className="ai-chat-scroll-btn"
                    onClick={() => scrollToBottom()}
                  >
                    <ArrowDown size={14} />
                  </button>
                )}
              </div>

              {/* ── Conversation full banner ── */}
              {hasAccess && activeConversation && activeConversation.messages.length >= MAX_MESSAGES_PER_CONVERSATION && !isStreaming && (
                <div className="ai-chat-conv-full-banner">
                  <MessageSquare size={13} className="ai-chat-conv-full-icon" />
                  <div className="ai-chat-conv-full-body">
                    <p className="ai-chat-conv-full-text">
                      Conversation full ({activeConversation.messages.length}/{MAX_MESSAGES_PER_CONVERSATION}). Older messages will be trimmed.
                    </p>
                  </div>
                  <div className="ai-chat-conv-full-actions">
                    <button
                      onClick={() => exportConversation(activeConversation)}
                      className="ai-chat-conv-full-export-btn"
                      title="Export this conversation before starting a new one"
                    >
                      <Download size={9} />
                      Export
                    </button>
                    <button
                      onClick={startNewConversation}
                      className="ai-chat-conv-full-new-btn"
                    >
                      <Plus size={9} />
                      New Chat
                    </button>
                  </div>
                </div>
              )}

              {/* ── Input area ── */}
              {hasAccess && (
                <div className="ai-chat-input-wrap">
                  <div className="ai-chat-input-box">
                    <textarea
                      ref={textareaRef}
                      value={input}
                      onChange={e => {
                        if (e.target.value.length <= MAX_INPUT_CHARS + 100) {
                          setInput(e.target.value);
                        }
                      }}
                      onKeyDown={handleKeyDown}
                      placeholder={isStreaming ? 'AI is responding...' : (aiMode === 'build' ? 'Describe what to build...' : 'Ask about 0colors...')}
                      disabled={isStreaming}
                      className="ai-chat-textarea"
                      style={{ minHeight: TEXTAREA_MIN_H, maxHeight: TEXTAREA_MAX_H }}
                      data-testid="ai-chat-message-input"
                    />
                    <div className="ai-chat-input-footer">
                      <div className="ai-chat-input-left">
                        {/* Mode toggle */}
                        {buildModeAvailable && (
                          <>
                            <button
                              onClick={() => setAIMode('ask')}
                              className={`ai-chat-mode-btn ${aiMode === 'ask' ? 'is-active-ask' : 'is-inactive'}`}
                            >
                              <Sparkles size={10} />
                              Ask
                            </button>
                            <button
                              onClick={() => setAIMode('build')}
                              className={`ai-chat-mode-btn ${aiMode === 'build' ? 'is-active-build' : 'is-inactive'}`}
                            >
                              <Hammer size={10} />
                              Build
                            </button>
                          </>
                        )}
                        {/* Model picker */}
                        <div ref={modelPickerRef}>
                          <button
                            onClick={() => setShowModelPicker(prev => !prev)}
                            className="ai-chat-model-picker-btn"
                          >
                            <Diamond size={9} className="ai-chat-model-picker-diamond" />
                            {(() => {
                              const active = getActiveServiceConfig(aiSettings);
                              if (!active) return 'No model';
                              const modelLabel = active.definition.models.find(m => m.id === active.config.model)?.label || active.config.model;
                              return modelLabel.length > 16 ? modelLabel.slice(0, 14) + '...' : modelLabel;
                            })()}
                            <ChevronDown size={8} />
                          </button>
                          {showModelPicker && createPortal(
                            <div
                              className="ai-chat-model-dropdown"
                              style={{
                                ...((() => {
                                  const rect = modelPickerRef.current?.getBoundingClientRect();
                                  if (!rect) return {};
                                  return { bottom: window.innerHeight - rect.top + 4, left: rect.left };
                                })()),
                              }}
                            >
                              {getConfiguredServices(aiSettings).map(({ definition: def, config: cfg }) => (
                                <div key={def.id}>
                                  <div className="ai-chat-model-group-label">
                                    {def.label}
                                    {def.hasFreeTier && (
                                      <span className="ai-chat-model-free-tag">free</span>
                                    )}
                                  </div>
                                  {def.models.map(model => {
                                    const isActive = aiSettings.activeModel.serviceId === def.id && aiSettings.activeModel.modelId === model.id;
                                    return (
                                      <button
                                        key={`${def.id}-${model.id}`}
                                        onClick={() => {
                                          const newSettings = {
                                            ...aiSettings,
                                            activeModel: { serviceId: def.id, modelId: model.id },
                                          };
                                          setAISettings(newSettings);
                                          saveAISettings(newSettings);
                                          setShowModelPicker(false);
                                        }}
                                        className="ai-chat-model-option"
                                        style={{ color: isActive ? 'var(--text-primary)' : 'var(--text-tertiary)' }}
                                      >
                                        <span className={`ai-chat-model-dot ${isActive ? 'is-active' : 'is-inactive'}`} />
                                        {model.label}
                                      </button>
                                    );
                                  })}
                                </div>
                              ))}
                              {getConfiguredServices(aiSettings).length === 0 && (
                                <div className="ai-chat-model-empty">
                                  No providers configured
                                </div>
                              )}
                            </div>,
                            document.body,
                          )}
                        </div>
                        {charCount > 500 && (
                          <span className={`ai-chat-char-count ${isOverLimit ? 'is-over' : 'is-normal'}`}>
                            {charCount.toLocaleString()} / {MAX_INPUT_CHARS.toLocaleString()}
                          </span>
                        )}
                      </div>
                      <div className="ai-chat-input-right">
                        {isStreaming ? (
                          <button
                            onClick={stopStreaming}
                            className="ai-chat-stop-btn"
                          >
                            <StopCircle size={12} />
                            Stop
                          </button>
                        ) : (
                          <button
                            onClick={aiMode === 'build' ? sendBuildMessage : sendMessage}
                            disabled={!input.trim() || isOverLimit}
                            className="ai-chat-send-btn"
                            data-testid="ai-chat-send-button"
                            style={{
                              background: input.trim() && !isOverLimit
                                ? (aiMode === 'build' ? 'var(--utility-build)' : 'var(--accent-primary)')
                                : 'var(--surface-hover)',
                              color: input.trim() && !isOverLimit ? 'var(--on-primary)' : 'var(--text-disabled)',
                            }}
                          >
                            {aiMode === 'build' ? <Hammer size={13} /> : <Send size={13} />}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Settings popup ── */}
      <AnimatePresence>
        {showSettings && (
          <AISettingsPopup
            onClose={() => {
              setShowSettings(false);
              setAISettings(loadAISettings());
            }}
            projectContext={projectContext}
            currentConversationMessages={activeConversation?.messages}
            onSettingsSaved={(settings, tier, toggles) => {
              setAISettings(settings);
              onSettingsSaved?.(settings, tier!, toggles!);
            }}
          />
        )}
      </AnimatePresence>
    </>
  );

  // ═══════════════════════════════════════════════════════════════
  // DOCKED MODE — two-island layout (header island + body island)
  // Matches the TokensPanel / canvas top-bar island pattern
  // ═══════════════════════════════════════════════════════════════
  if (isDocked) {
    return (
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 20 }}
        transition={{ duration: 0.2 }}
        className="ai-chat-docked"
        data-testid="ai-chat-panel-docked"
        style={{ width: DOCKED_WIDTH, zIndex: 50 }}
        onWheel={e => e.stopPropagation()}
      >
        {/* ── Header Island ── */}
        <div className="ai-chat-docked-header">
          {headerLeft}
          {headerRight}
        </div>

        {/* ── Chat Body Island ── */}
        <div className="ai-chat-docked-body">
          {chatBody}
        </div>
      </motion.div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // FLOATING MODE — single container via portal
  // ═══════════════════════════════════════════════════════════════
  return createPortal(
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.97 }}
      transition={{ duration: 0.2 }}
      className="ai-chat-floating"
      data-testid="ai-chat-panel-floating"
      style={{
        width: CHAT_WIDTH,
        height,
        left: position.x,
        top: position.y,
        zIndex: 99999,
      }}
      onClick={e => e.stopPropagation()}
    >
      {/* ── Resize handle (top edge) ── */}
      <div
        className="ai-chat-resize-handle"
        onMouseDown={handleResizeStart}
      >
        <div className="ai-chat-resize-bar" />
      </div>

      {/* ── Header (inside the single container) ── */}
      <div
        className="ai-chat-floating-header"
        onMouseDown={handleDragStart}
      >
        {headerLeft}
        {headerRight}
      </div>

      {chatBody}
    </motion.div>,
    document.body,
  );
}
