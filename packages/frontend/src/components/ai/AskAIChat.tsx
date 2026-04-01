import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Send, Plus, Menu, Trash2, MessageSquare, Settings, Sparkles, StopCircle, Copy, Check, ArrowDown, PanelRight, Maximize2, Move, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Conversation, ConversationMessage, generateId, generateConversationTitle,
  loadAISettings, getActiveProvider, isProviderConfigured, streamChat, ChatMessage, AISettings,
  loadContextTier, loadContextToggles, ContextToggles,
  MAX_CONVERSATIONS, MAX_MESSAGES_PER_CONVERSATION,
} from '../../utils/ai-provider';
import type { ContextTier } from '../../utils/ai-context-manager';
import { AISettingsPopup } from './AISettingsPopup';
import { copyTextToClipboard } from '../../utils/clipboard';
import { prepareAPIMessages } from '../../utils/ai-context-manager';
import { toast } from 'sonner';

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
            <pre key={i} className="my-2 rounded-md text-[11px] leading-[1.5] overflow-x-auto whitespace-pre-wrap break-all"
              style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.05)', padding: '8px 10px' }}
            >
              <code className="text-foreground">{code}</code>
            </pre>
          );
        }
        // Bold
        const bolded = part.replace(/\*\*(.*?)\*\*/g, '<b class="text-foreground font-medium">$1</b>');
        // Inline code
        const coded = bolded.replace(/`([^`]+)`/g, '<code class="px-1 py-[1px] rounded text-[10.5px] text-foreground" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.05)">$1</code>');
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
  'rate_limit_exceeded': '#FBBF24',
  'rate_limited': '#FBBF24',
  '429': '#FBBF24',
  'authentication_error': '#FF4D6A',
  '401': '#FF4D6A',
  '403': '#FF4D6A',
  'not_found': '#7C66DC',
  '404': '#7C66DC',
  'network_error': '#FF4D6A',
  '0': '#FF4D6A',
};

function getErrorColor(err: StructuredError): string {
  return ERROR_ICON_COLORS[err.errorCode] ||
    ERROR_ICON_COLORS[String(err.code)] ||
    '#FF4D6A';
}

function ErrorBubble({ error }: { error: StructuredError }) {
  const color = getErrorColor(error);
  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: `${color}08`,
        border: `1px solid ${color}20`,
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2"
        style={{ borderBottom: `1px solid ${color}15` }}
      >
        <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0"
          style={{ background: `${color}15` }}
        >
          <X size={10} style={{ color }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-medium" style={{ color }}>
              {error.title}
            </span>
            <span className="text-[9px] px-1.5 py-[1px] rounded font-mono"
              style={{ background: `${color}12`, color: `${color}` }}
            >
              {error.code || error.errorCode}
            </span>
          </div>
        </div>
      </div>
      {/* Body */}
      <div className="px-3 py-2 space-y-1.5">
        <p className="text-[11px] leading-relaxed text-subtle">
          {error.message}
        </p>
        {error.suggestion && (
          <p className="text-[10px] leading-relaxed" style={{ color: `${color}90` }}>
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
      className="opacity-0 group-hover/msg:opacity-100 p-1 rounded hover:bg-white/5 transition-all cursor-pointer"
      style={{ color: copied ? 'var(--success)' : 'var(--ghost)' }}
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

    const provider = getActiveProvider(aiSettings);
    if (!isProviderConfigured(aiSettings)) {
      setShowSettings(true);
      return;
    }

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
      sendMessage();
    }
  }, [sendMessage]);

  // ── Access check ──────────────────────────────────────────────
  const hasAccess = isCloudProject || isTemplate;

  if (!isOpen) return null;

  const charCount = input.length;
  const isOverLimit = charCount > MAX_INPUT_CHARS;

  // ── Shared header buttons ─────────────────────────────────────
  const headerLeft = (
    <div className="flex items-center gap-2">
      {!isDocked && (
        <div className="text-ghost mr-0.5">
          <Move size={11} />
        </div>
      )}
      <button
        onClick={(e) => { e.stopPropagation(); setShowSidebar(prev => !prev); }}
        className="p-1.5 rounded-md hover:bg-white/5 transition-colors cursor-pointer"
        style={{ color: showSidebar ? 'var(--foreground)' : 'var(--dim)' }}
      >
        <Menu size={14} />
      </button>
      <div className="flex items-center gap-1.5">
        <Sparkles size={13} className="text-brand-pink" />
        <span className="text-[13px] text-foreground">Ask AI</span>
      </div>
    </div>
  );

  const headerRight = (
    <div className="flex items-center gap-1">
      <button
        onClick={(e) => { e.stopPropagation(); startNewConversation(); }}
        className="p-1.5 rounded-md hover:bg-white/5 transition-colors cursor-pointer"
        style={{ color: 'var(--dim)' }}
        title="New Chat"
      >
        <Plus size={14} />
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); toggleDock(); }}
        className="p-1.5 rounded-md hover:bg-white/5 transition-colors cursor-pointer"
        style={{ color: isDocked ? '#FD7DEE' : '#555' }}
        title={isDocked ? 'Undock (floating popup)' : 'Dock to right panel'}
      >
        {isDocked ? <Maximize2 size={14} /> : <PanelRight size={14} />}
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); setShowSettings(true); }}
        className="p-1.5 rounded-md hover:bg-white/5 transition-colors cursor-pointer"
        style={{ color: 'var(--dim)' }}
        title="AI Settings"
      >
        <Settings size={14} />
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        className="p-1.5 rounded-md hover:bg-white/5 transition-colors cursor-pointer"
        style={{ color: 'var(--dim)' }}
      >
        <X size={14} />
      </button>
    </div>
  );

  // ── Shared body + input content ───────────────────────────────
  const chatBody = (
    <>
      {/* ── Body — full-page toggle between Conversations List and Chat View ── */}
      <div className="flex-1 flex flex-col min-h-0 relative overflow-hidden">
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
              className="absolute inset-0 flex flex-col"
            >
              {/* Conversations header bar */}
              <div className="shrink-0 flex items-center justify-between px-3.5 py-2.5"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
              >
                <div className="flex items-center gap-2">
                  <MessageSquare size={13} style={{ color: 'var(--faint)' }} />
                  <span className="text-[12px] text-subtle">Conversations</span>
                  {conversations.length > 0 && (
                    <span className="text-[9px] bg-white/[0.04] px-1.5 py-0.5 rounded-full"
                      style={{ color: conversations.length >= MAX_CONVERSATIONS ? '#FD7DEE' : '#444' }}
                      title={`${conversations.length} of ${MAX_CONVERSATIONS} max conversations`}
                    >
                      {conversations.length}/{MAX_CONVERSATIONS}
                    </span>
                  )}
                </div>
                <button
                  onClick={startNewConversation}
                  className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-[11px] cursor-pointer transition-colors"
                  style={{
                    background: 'rgba(253,125,238,0.1)',
                    color: '#FD7DEE',
                    border: '1px solid rgba(253,125,238,0.15)',
                  }}
                >
                  <Plus size={12} />
                  New Chat
                </button>
              </div>

              {/* Conversation items */}
              <div className="flex-1 overflow-y-auto">
                {conversations.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center px-6">
                    <MessageSquare size={24} className="text-[#222] mb-3" />
                    <p className="text-[12px] text-dim mb-1">No conversations yet</p>
                    <p className="text-[10px] text-ghost">
                      Start a new chat to begin exploring with AI.
                    </p>
                  </div>
                ) : (
                  <div className="py-1.5 px-1.5 space-y-0.5">
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
                          className="group flex items-start gap-2.5 px-3 py-2.5 rounded-lg cursor-pointer transition-all"
                          style={{
                            background: isActive ? 'rgba(253,125,238,0.08)' : 'transparent',
                            border: `1px solid ${isActive ? 'rgba(253,125,238,0.12)' : 'transparent'}`,
                          }}
                          onClick={() => { setActiveConvId(conv.id); setShowSidebar(false); }}
                          onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
                          onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = 'transparent'; } }}
                        >
                          <div className="shrink-0 mt-0.5">
                            <MessageSquare size={12} style={{ color: isActive ? '#FD7DEE' : 'var(--ghost)' }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[12px] truncate" style={{ color: isActive ? 'var(--foreground)' : 'var(--subtle)' }}>
                                {conv.title}
                              </span>
                              <div className="flex items-center shrink-0">
                                <button
                                  className="opacity-0 group-hover:opacity-100 p-1 rounded-md hover:bg-white/10 transition-all cursor-pointer"
                                  style={{ color: 'var(--dim)' }}
                                  onClick={e => { e.stopPropagation(); exportConversation(conv); }}
                                  title="Export as Markdown"
                                >
                                  <Download size={11} />
                                </button>
                                <button
                                  className="opacity-0 group-hover:opacity-100 p-1 rounded-md hover:bg-white/10 transition-all cursor-pointer"
                                  style={{ color: 'var(--dim)' }}
                                  onClick={e => { e.stopPropagation(); deleteConversation(conv.id); }}
                                  title="Delete conversation"
                                >
                                  <Trash2 size={11} />
                                </button>
                              </div>
                            </div>
                            <p className="text-[10px] truncate mt-0.5" style={{ color: 'var(--dim)' }}>
                              {preview}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[9px]" style={{ color: msgCount >= MAX_MESSAGES_PER_CONVERSATION ? '#FD7DEE' : '#333' }}
                                title={msgCount >= MAX_MESSAGES_PER_CONVERSATION - 5 ? `${msgCount}/${MAX_MESSAGES_PER_CONVERSATION} max messages` : undefined}
                              >
                                {msgCount >= MAX_MESSAGES_PER_CONVERSATION - 5
                                  ? `${msgCount}/${MAX_MESSAGES_PER_CONVERSATION} msgs`
                                  : `${msgCount} message${msgCount !== 1 ? 's' : ''}`}
                              </span>
                              <span className="text-[9px]" style={{ color: 'var(--ghost)' }}>
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
              className="absolute inset-0 flex flex-col"
            >
              {/* Messages */}
              <div ref={messagesContainerRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3 relative">
                {!hasAccess ? (
                  /* ── No access message ── */
                  <div className="flex flex-col items-center justify-center h-full text-center px-4">
                    <Sparkles size={28} className="text-ghost mb-3" />
                    <p className="text-[13px] text-faint mb-1">Ask AI is available for Cloud and Template projects</p>
                    <p className="text-[10px] text-ghost">Switch to a Cloud project or open a Template to use Ask AI.</p>
                  </div>
                ) : !activeConversation || activeConversation.messages.length === 0 ? (
                  /* ── Empty state ── */
                  <div className="flex flex-col items-center justify-center h-full text-center px-4">
                    <Sparkles size={28} className="text-[#FD7DEE]/30 mb-3" />
                    <p className="text-[13px] text-faint mb-1">Ask anything about 0colors</p>
                    <p className="text-[10px] text-ghost leading-relaxed">
                      How to create palettes, use advanced logic,<br />
                      set up themes, build token systems, and more.
                    </p>
                    <p className="text-[9px] text-ghost mt-3 leading-relaxed max-w-[260px]">
                      The AI has full context of your current project — nodes, tokens, themes, logic, and more.
                    </p>
                    {!isProviderConfigured(aiSettings) && (
                      <button
                        onClick={() => setShowSettings(true)}
                        className="mt-3 text-[10px] text-[#FD7DEE] hover:underline cursor-pointer"
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
                        <div key={msg.id} className={`group/msg flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                          {structuredErr ? (
                            /* ── Structured error bubble ── */
                            <div className="max-w-[92%]">
                              <ErrorBubble error={structuredErr} />
                            </div>
                          ) : (
                            <div
                              className="max-w-[92%] relative"
                              style={{
                                background: msg.role === 'user' ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.02)',
                                border: `1px solid ${msg.role === 'user' ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)'}`,
                                borderRadius: msg.role === 'user' ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                                padding: '8px 12px',
                              }}
                            >
                              <div className="text-[12px] leading-[1.6] text-[#bbb] whitespace-pre-wrap break-words"
                                style={{ color: msg.role === 'user' ? 'var(--foreground)' : 'var(--muted-foreground)' }}
                              >
                                {msg.role === 'assistant' ? renderContent(msg.content) : msg.content}
                              </div>
                              {/* Copy button */}
                              <div className="absolute -top-2 right-1">
                                <CopyButton text={msg.content} />
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {/* Streaming message */}
                    {isStreaming && streamingText && (
                      <div className="flex justify-start">
                        <div className="max-w-[92%]"
                          style={{
                            background: 'rgba(255,255,255,0.02)',
                            border: '1px solid rgba(255,255,255,0.04)',
                            borderRadius: '12px 12px 12px 4px',
                            padding: '8px 12px',
                          }}
                        >
                          <div className="text-[12px] leading-[1.6] text-muted-foreground whitespace-pre-wrap break-words">
                            {renderContent(streamingText)}
                            <span className="inline-block w-1.5 h-3.5 bg-[#FD7DEE] ml-0.5 animate-pulse rounded-sm" />
                          </div>
                        </div>
                      </div>
                    )}
                    {/* Streaming indicator (no text yet) */}
                    {isStreaming && !streamingText && (
                      <div className="flex justify-start">
                        <div className="px-3 py-2 rounded-xl"
                          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}
                        >
                          <div className="flex items-center gap-1">
                            <div className="w-1.5 h-1.5 rounded-full bg-[#FD7DEE] animate-bounce" style={{ animationDelay: '0ms' }} />
                            <div className="w-1.5 h-1.5 rounded-full bg-[#FD7DEE] animate-bounce" style={{ animationDelay: '150ms' }} />
                            <div className="w-1.5 h-1.5 rounded-full bg-[#FD7DEE] animate-bounce" style={{ animationDelay: '300ms' }} />
                          </div>
                        </div>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </>
                )}

                {/* Scroll-to-bottom button */}
                {showScrollDown && (
                  <button
                    className="sticky bottom-2 left-1/2 -translate-x-1/2 p-1.5 rounded-full shadow-lg cursor-pointer z-10"
                    style={{ background: '#222', border: '1px solid rgba(255,255,255,0.1)', color: '#888' }}
                    onClick={() => scrollToBottom()}
                  >
                    <ArrowDown size={14} />
                  </button>
                )}
              </div>

              {/* ── Conversation full banner ── */}
              {hasAccess && activeConversation && activeConversation.messages.length >= MAX_MESSAGES_PER_CONVERSATION && !isStreaming && (
                <div className="shrink-0 mx-3 mb-1 rounded-lg px-3 py-2 flex items-center gap-2.5"
                  style={{
                    background: 'rgba(253,125,238,0.06)',
                    border: '1px solid rgba(253,125,238,0.12)',
                  }}
                >
                  <MessageSquare size={13} style={{ color: '#FD7DEE', flexShrink: 0 }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-[#FD7DEE] leading-tight">
                      Conversation full ({activeConversation.messages.length}/{MAX_MESSAGES_PER_CONVERSATION}). Older messages will be trimmed.
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => exportConversation(activeConversation)}
                      className="flex items-center gap-1 h-6 px-2 rounded-md text-[9px] cursor-pointer transition-colors"
                      style={{ background: 'rgba(253,125,238,0.1)', color: '#FD7DEE', border: '1px solid rgba(253,125,238,0.15)' }}
                      title="Export this conversation before starting a new one"
                    >
                      <Download size={9} />
                      Export
                    </button>
                    <button
                      onClick={startNewConversation}
                      className="flex items-center gap-1 h-6 px-2 rounded-md text-[9px] cursor-pointer transition-colors"
                      style={{ background: 'rgba(253,125,238,0.15)', color: '#FD7DEE', border: '1px solid rgba(253,125,238,0.2)' }}
                    >
                      <Plus size={9} />
                      New Chat
                    </button>
                  </div>
                </div>
              )}

              {/* ── Input area ── */}
              {hasAccess && (
                <div className="shrink-0 px-3 pb-3 pt-1">
                  <div className="rounded-xl overflow-hidden"
                    style={{
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.06)',
                    }}
                  >
                    <textarea
                      ref={textareaRef}
                      value={input}
                      onChange={e => {
                        if (e.target.value.length <= MAX_INPUT_CHARS + 100) {
                          setInput(e.target.value);
                        }
                      }}
                      onKeyDown={handleKeyDown}
                      placeholder={isStreaming ? 'AI is responding...' : 'Ask about 0colors...'}
                      disabled={isStreaming}
                      className="w-full px-3 pt-2.5 pb-1 text-[12px] text-foreground placeholder:text-ghost bg-transparent outline-none resize-none"
                      style={{ minHeight: TEXTAREA_MIN_H, maxHeight: TEXTAREA_MAX_H }}
                    />
                    <div className="flex items-center justify-between px-2.5 pb-2">
                      <div className="flex items-center gap-2">
                        {charCount > 500 && (
                          <span className={`text-[9px] ${isOverLimit ? 'text-destructive' : 'text-ghost'}`}>
                            {charCount.toLocaleString()} / {MAX_INPUT_CHARS.toLocaleString()}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {isStreaming ? (
                          <button
                            onClick={stopStreaming}
                            className="flex items-center gap-1 h-7 px-2.5 rounded-lg text-[11px] cursor-pointer transition-colors"
                            style={{ background: 'rgba(255,77,106,0.15)', color: '#FF4D6A', border: '1px solid rgba(255,77,106,0.2)' }}
                          >
                            <StopCircle size={12} />
                            Stop
                          </button>
                        ) : (
                          <button
                            onClick={sendMessage}
                            disabled={!input.trim() || isOverLimit}
                            className="flex items-center justify-center h-7 w-7 rounded-lg cursor-pointer transition-colors disabled:cursor-default"
                            style={{
                              background: input.trim() && !isOverLimit ? '#FD7DEE' : 'rgba(255,255,255,0.04)',
                              color: input.trim() && !isOverLimit ? '#000' : '#333',
                            }}
                          >
                            <Send size={13} />
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
            onSettingsSaved={onSettingsSaved}
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
        className="shrink-0 flex flex-col h-full gap-2 relative"
        style={{ width: DOCKED_WIDTH, zIndex: 50 }}
        onWheel={e => e.stopPropagation()}
      >
        {/* ── Header Island ── */}
        <div
          className="shrink-0 rounded-2xl h-12 px-3 flex items-center justify-between select-none border border-secondary"
          style={{ backgroundColor: 'var(--card)' }}
        >
          {headerLeft}
          {headerRight}
        </div>

        {/* ── Chat Body Island ── */}
        <div
          className="flex-1 rounded-2xl flex flex-col overflow-hidden min-h-0 border border-secondary"
          style={{ backgroundColor: 'var(--card)' }}
        >
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
      className="flex flex-col"
      style={{
        position: 'fixed',
        width: CHAT_WIDTH,
        height,
        left: position.x,
        top: position.y,
        zIndex: 99999,
        backgroundColor: 'var(--card)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 16,
        boxShadow: '0 24px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.03)',
        overflow: 'hidden',
      }}
      onClick={e => e.stopPropagation()}
    >
      {/* ── Resize handle (top edge) ── */}
      <div
        className="absolute top-0 left-4 right-4 h-1.5 cursor-ns-resize z-10 group"
        onMouseDown={handleResizeStart}
      >
        <div className="w-8 h-1 mx-auto mt-1 rounded-full bg-border group-hover:bg-[#555] transition-colors" />
      </div>

      {/* ── Header (inside the single container) ── */}
      <div
        className="flex items-center justify-between px-3 py-2.5 shrink-0 cursor-grab active:cursor-grabbing"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
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