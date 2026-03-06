import { motion } from 'motion/react';
import { X, Eye, EyeOff, Check, Zap, Info, ChevronDown, BookOpen, Settings, ToggleLeft, ToggleRight } from 'lucide-react';
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  AISettings, ProviderType, loadAISettings, saveAISettings,
  DEFAULT_PROVIDERS, PROVIDER_MODELS, OPENAI_COMPATIBLE_PRESETS,
  ANTHROPIC_MODELS, loadContextTier, saveContextTier,
  loadContextToggles, saveContextToggles, ContextToggles,
  ConversationMessage,
} from '../utils/ai-provider';
import {
  type ContextTier, TIER_INFO, getContextBudget,
  estimateTokens, getKnowledgeBaseText,
} from '../utils/ai-context-manager';

// ── Types ────────────────────────────────────────────────────────

type SettingsTab = 'provider' | 'context';

interface AISettingsPopupProps {
  onClose: () => void;
  onSettingsSaved?: (settings: AISettings, contextTier: ContextTier, contextToggles: ContextToggles) => void;
  projectContext?: string;
  currentConversationMessages?: ConversationMessage[];
}

const PROVIDER_ORDER: ProviderType[] = ['openai', 'anthropic'];

const PROVIDER_INFO: Record<ProviderType, { desc: string; keyHint: string; keyUrl: string }> = {
  openai: {
    desc: 'Works with OpenAI, Groq, Perplexity, OpenRouter, Together AI, Mistral, DeepSeek, Railway, and any OpenAI-compatible API.',
    keyHint: 'Enter your provider API key',
    keyUrl: '',
  },
  anthropic: {
    desc: 'Direct Anthropic API for Claude models. Requires an API key from console.anthropic.com.',
    keyHint: 'Enter your Anthropic API key (sk-ant-...)',
    keyUrl: 'https://console.anthropic.com/settings/keys',
  },
};

const TIER_COLORS: Record<ContextTier, string> = {
  small: '#E93D82',
  medium: '#E5A336',
  large: '#45B36B',
};

// ── Helpers ──────────────────────────────────────────────────────

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  return `${n}`;
}

// ── Toggle Switch Component ─────────────────────────────────────

function ToggleSwitch({ enabled, onChange, label }: { enabled: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      onClick={() => onChange(!enabled)}
      className="flex items-center gap-1.5 cursor-pointer group"
      title={label}
    >
      {enabled ? (
        <ToggleRight size={18} className="text-[#45B36B] group-hover:text-[#5AC97F]" />
      ) : (
        <ToggleLeft size={18} className="text-[#333] group-hover:text-[#555]" />
      )}
    </button>
  );
}

// ═════════════════════════════════════════════════════════════════
// Main Component
// ═════════════════════════════════════════════════════════════════

export function AISettingsPopup({ onClose, onSettingsSaved, projectContext, currentConversationMessages }: AISettingsPopupProps) {
  const [settings, setSettings] = useState<AISettings>(loadAISettings);
  const [showKey, setShowKey] = useState<Record<ProviderType, boolean>>({
    openai: false, anthropic: false,
  });
  const [saved, setSaved] = useState(false);
  const [customModel, setCustomModel] = useState<Record<ProviderType, string>>({
    openai: '', anthropic: '',
  });
  const [contextTier, setContextTier] = useState<ContextTier>(loadContextTier);
  const [contextToggles, setContextToggles] = useState<ContextToggles>(loadContextToggles);
  const [activeTab, setActiveTab] = useState<SettingsTab>('provider');

  const sectionRefs = useRef<Record<ProviderType, HTMLDivElement | null>>({
    openai: null, anthropic: null,
  });
  const contentRef = useRef<HTMLDivElement>(null);

  // ── Token calculations (live) ─────────────────────────────────
  const tokenBreakdown = useMemo(() => {
    const budget = getContextBudget(contextTier);

    // Knowledge base
    const kbText = getKnowledgeBaseText(contextTier);
    const kbTokens = estimateTokens(kbText);
    const kbLabel = budget.useCompactKB ? 'Compact' : 'Full';

    // Project context (raw, before truncation by tier)
    const projectRawTokens = estimateTokens(projectContext || '');
    const projectBudget = budget.projectContext;
    const projectEffective = Math.min(projectRawTokens, projectBudget);

    // Conversation history
    const convTokens = (currentConversationMessages || []).reduce(
      (sum, m) => sum + estimateTokens(m.content) + 4,
      0,
    );
    const convBudget = budget.conversationHistory;
    const convEffective = Math.min(convTokens, convBudget);
    const convMessageCount = (currentConversationMessages || []).length;

    // System instruction (tail)
    const tailTokens = estimateTokens(
      budget.useCompactKB
        ? 'Use the project context above to give specific answers. Reference actual node/token names. Be concise.'
        : 'IMPORTANT: You have full context of the user\'s current project above. Use it to give specific, actionable answers. Reference their actual node names, token names, and settings when relevant. Be concise and helpful.'
    );

    // Calculate totals based on toggles
    const activeKB = contextToggles.knowledgeBase ? kbTokens : 0;
    const activeProject = contextToggles.projectContext ? projectEffective : 0;
    const activeConv = contextToggles.conversationHistory ? convEffective : 0;
    const totalInput = activeKB + activeProject + activeConv + tailTokens;
    const totalWithResponse = totalInput + budget.maxResponseTokens;

    return {
      kbTokens, kbLabel,
      projectRawTokens, projectEffective, projectBudget,
      convTokens, convEffective, convBudget, convMessageCount,
      tailTokens,
      maxResponse: budget.maxResponseTokens,
      totalBudget: budget.totalBudget,
      totalInput,
      totalWithResponse,
      activeKB, activeProject, activeConv,
    };
  }, [contextTier, contextToggles, projectContext, currentConversationMessages]);

  const handleSave = useCallback(() => {
    saveAISettings(settings);
    saveContextTier(contextTier);
    saveContextToggles(contextToggles);
    onSettingsSaved?.(settings, contextTier, contextToggles);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [settings, contextTier, contextToggles, onSettingsSaved]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const updateProvider = (type: ProviderType, updates: Partial<AISettings['providers'][ProviderType]>) => {
    setSettings(prev => ({
      ...prev,
      providers: {
        ...prev.providers,
        [type]: { ...prev.providers[type], ...updates },
      },
    }));
  };

  const selectProvider = (type: ProviderType) => {
    setSettings(prev => ({ ...prev, activeProvider: type }));
    setTimeout(() => {
      sectionRefs.current[type]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };

  const applyPreset = (preset: typeof OPENAI_COMPATIBLE_PRESETS[0]) => {
    updateProvider('openai', { baseUrl: preset.baseUrl, model: preset.models[0].id });
    setCustomModel(prev => ({ ...prev, openai: '' }));
  };

  const getCurrentPreset = () => {
    const baseUrl = settings.providers.openai.baseUrl;
    if (!baseUrl) return null;
    return OPENAI_COMPATIBLE_PRESETS.find(p => {
      try {
        if (baseUrl.includes('.up.railway.app')) return p.baseUrl.includes('.up.railway.app');
        return baseUrl.includes(new URL(p.baseUrl).hostname);
      } catch { return false; }
    }) || null;
  };

  const updateToggle = (key: keyof ContextToggles, value: boolean) => {
    setContextToggles(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ zIndex: 100000 }}>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0"
        style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 8 }}
        transition={{ duration: 0.2 }}
        className="relative rounded-xl overflow-hidden flex flex-col"
        style={{
          width: 'min(580px, 92vw)',
          maxHeight: 'min(740px, 90vh)',
          background: '#111',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
        }}
      >
        {/* ── Header ── */}
        <div className="shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-center justify-between px-5 py-3">
            <div>
              <h2 className="text-[14px] text-[#ddd] font-medium">AI Settings</h2>
              <p className="text-[10px] text-[#444] mt-0.5">Bring your own API key — stored locally, never sent to our servers</p>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-md hover:bg-white/5 cursor-pointer" style={{ color: '#555' }}>
              <X size={14} />
            </button>
          </div>

          {/* ── Tab Bar ── */}
          <div className="flex px-5 gap-0">
            {([
              { id: 'provider' as SettingsTab, label: 'Provider', icon: Settings },
              { id: 'context' as SettingsTab, label: 'Context Tier', icon: BookOpen },
            ]).map(tab => {
              const isActive = activeTab === tab.id;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className="flex items-center gap-1.5 px-3.5 py-2 text-[11px] transition-all cursor-pointer relative"
                  style={{ color: isActive ? '#ddd' : '#555' }}
                >
                  <Icon size={12} />
                  {tab.label}
                  {isActive && (
                    <motion.div
                      layoutId="settings-tab-indicator"
                      className="absolute bottom-0 left-1 right-1 h-[2px] rounded-full"
                      style={{ background: '#E5A336' }}
                      transition={{ duration: 0.2 }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Content ── */}
        <div ref={contentRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {activeTab === 'provider' ? (
            /* ═══════════════════════════════════════════════════════════
               PROVIDER TAB
               ═══════════════════════════════════════════════════════════ */
            <>
              {/* Active Provider Tabs */}
              <div>
                <label className="text-[10px] text-[#555] uppercase tracking-wider block mb-2">Provider</label>
                <div className="flex gap-2">
                  {PROVIDER_ORDER.map(type => {
                    const isActive = settings.activeProvider === type;
                    const isConfigured = !!settings.providers[type].apiKey
                      || (type === 'openai' && settings.providers[type].baseUrl.includes('.up.railway.app'));
                    return (
                      <button
                        key={type}
                        onClick={() => selectProvider(type)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-[12px] transition-all cursor-pointer"
                        style={{
                          background: isActive ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.02)',
                          border: `1px solid ${isActive ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.04)'}`,
                          color: isActive ? '#ededed' : '#666',
                        }}
                      >
                        {isConfigured && <div className="w-1.5 h-1.5 rounded-full" style={{ background: isActive ? '#45B36B' : '#333' }} />}
                        {DEFAULT_PROVIDERS[type].label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Provider Sections */}
              {PROVIDER_ORDER.map(type => {
                const provider = settings.providers[type];
                const isActive = settings.activeProvider === type;
                const info = PROVIDER_INFO[type];
                const currentPreset = type === 'openai' ? getCurrentPreset() : null;

                return (
                  <div
                    key={type}
                    ref={el => { sectionRefs.current[type] = el; }}
                    className="rounded-lg overflow-hidden transition-all"
                    style={{
                      background: 'rgba(255,255,255,0.02)',
                      border: `1px solid ${isActive ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.04)'}`,
                    }}
                  >
                    <div className="px-3.5 py-2.5 flex items-center justify-between cursor-pointer"
                      style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                      onClick={() => selectProvider(type)}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-[12px]" style={{ color: isActive ? '#ddd' : '#888' }}>
                          {DEFAULT_PROVIDERS[type].label}
                        </span>
                        {isActive && (
                          <span className="text-[9px] text-[#45B36B] bg-[#45B36B]/10 px-1.5 py-0.5 rounded">Active</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {(!!provider.apiKey || (type === 'openai' && provider.baseUrl.includes('.up.railway.app'))) && (
                          <span className="text-[9px] text-[#555] bg-white/[0.03] px-1.5 py-0.5 rounded">
                            {provider.baseUrl.includes('.up.railway.app') ? 'Self-hosted' : 'Key set'}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="px-3.5 py-3 space-y-3">
                      <p className="text-[9px] text-[#444] leading-relaxed">{info.desc}</p>

                      {/* Quick-fill presets */}
                      {type === 'openai' && (
                        <div>
                          <label className="text-[10px] text-[#555] block mb-1.5">Quick Fill</label>
                          <div className="flex flex-wrap gap-1">
                            {OPENAI_COMPATIBLE_PRESETS.map(preset => {
                              const isSelected = (() => {
                                try {
                                  if (provider.baseUrl.includes('.up.railway.app')) return preset.baseUrl.includes('.up.railway.app');
                                  return provider.baseUrl.includes(new URL(preset.baseUrl).hostname);
                                } catch { return false; }
                              })();
                              return (
                                <button
                                  key={preset.label}
                                  onClick={() => applyPreset(preset)}
                                  className="flex items-center gap-1 px-2 py-1 rounded text-[10px] transition-all cursor-pointer"
                                  style={{
                                    background: isSelected ? 'rgba(229,163,54,0.15)' : 'rgba(255,255,255,0.04)',
                                    border: `1px solid ${isSelected ? 'rgba(229,163,54,0.3)' : 'rgba(255,255,255,0.06)'}`,
                                    color: isSelected ? '#E5A336' : '#888',
                                  }}
                                >
                                  <Zap size={8} />
                                  {preset.label}
                                  {preset.hasFreeTier && (
                                    <span className="text-[8px] px-1 py-[1px] rounded"
                                      style={{ background: 'rgba(69,179,107,0.15)', color: '#45B36B' }}
                                    >
                                      free
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                          {currentPreset?.freeNote && (
                            <p className="text-[9px] text-[#45B36B]/70 mt-1.5 flex items-start gap-1">
                              <Info size={9} className="shrink-0 mt-[1px]" />
                              {currentPreset.freeNote}
                            </p>
                          )}
                        </div>
                      )}

                      {/* API Key */}
                      <div>
                        <label className="text-[10px] text-[#555] block mb-1">API Key</label>
                        <div className="flex gap-1.5">
                          <input
                            type={showKey[type] ? 'text' : 'password'}
                            value={provider.apiKey}
                            onChange={e => updateProvider(type, { apiKey: e.target.value })}
                            placeholder={info.keyHint}
                            className="flex-1 h-8 px-2.5 rounded-md text-[11px] text-[#ccc] placeholder:text-[#2a2a2a] outline-none"
                            style={{
                              background: 'rgba(0,0,0,0.3)',
                              border: `1px solid ${provider.apiKey ? 'rgba(69,179,107,0.2)' : 'rgba(255,255,255,0.06)'}`,
                            }}
                          />
                          <button
                            onClick={() => setShowKey(prev => ({ ...prev, [type]: !prev[type] }))}
                            className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-white/5 cursor-pointer"
                            style={{ color: '#555', border: '1px solid rgba(255,255,255,0.06)' }}
                          >
                            {showKey[type] ? <EyeOff size={12} /> : <Eye size={12} />}
                          </button>
                        </div>
                        {info.keyUrl && (
                          <a href={info.keyUrl} target="_blank" rel="noopener noreferrer"
                            className="text-[9px] text-[#555] hover:text-[#888] mt-1 inline-block"
                          >
                            Get your API key &rarr;
                          </a>
                        )}
                      </div>

                      {/* Base URL */}
                      {type === 'openai' && (
                        <div>
                          <label className="text-[10px] text-[#555] block mb-1">Base URL</label>
                          <input
                            type="text"
                            value={provider.baseUrl}
                            onChange={e => updateProvider(type, { baseUrl: e.target.value })}
                            className="w-full h-8 px-2.5 rounded-md text-[11px] text-[#ccc] placeholder:text-[#2a2a2a] outline-none"
                            style={{
                              background: 'rgba(0,0,0,0.3)',
                              border: '1px solid rgba(255,255,255,0.06)',
                            }}
                          />
                        </div>
                      )}

                      {/* Model selector */}
                      <div>
                        <label className="text-[10px] text-[#555] block mb-1">Model</label>
                        <div className="flex gap-1.5">
                          <div className="flex-1 relative">
                            <select
                              value={(() => {
                                if (type === 'openai' && currentPreset) {
                                  if (currentPreset.models.some(m => m.id === provider.model)) return provider.model;
                                }
                                const models = PROVIDER_MODELS[type];
                                if (models.some(m => m.id === provider.model)) return provider.model;
                                return '__custom__';
                              })()}
                              onChange={e => {
                                if (e.target.value !== '__custom__') {
                                  updateProvider(type, { model: e.target.value });
                                  setCustomModel(prev => ({ ...prev, [type]: '' }));
                                }
                              }}
                              className="w-full h-8 px-2 pr-7 rounded-md text-[11px] text-[#ccc] outline-none cursor-pointer appearance-none"
                              style={{
                                background: 'rgba(0,0,0,0.3)',
                                border: '1px solid rgba(255,255,255,0.06)',
                              }}
                            >
                              {type === 'openai' && currentPreset && currentPreset.models.map(m => (
                                <option key={m.id} value={m.id}>{m.label}</option>
                              ))}
                              {type === 'openai' && !currentPreset && PROVIDER_MODELS.openai.map(m => (
                                <option key={m.id} value={m.id}>{m.label}</option>
                              ))}
                              {type === 'anthropic' && ANTHROPIC_MODELS.map(m => (
                                <option key={m.id} value={m.id}>{m.label}</option>
                              ))}
                              {!(() => {
                                if (type === 'openai' && currentPreset) {
                                  return currentPreset.models.some(m => m.id === provider.model);
                                }
                                return PROVIDER_MODELS[type].some(m => m.id === provider.model);
                              })() && provider.model && (
                                <option value={provider.model}>{provider.model} (custom)</option>
                              )}
                              <option value="__custom__">Custom model...</option>
                            </select>
                            <ChevronDown size={10} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-[#555]" />
                          </div>
                        </div>

                        <input
                          type="text"
                          value={customModel[type]}
                          onChange={e => {
                            setCustomModel(prev => ({ ...prev, [type]: e.target.value }));
                            if (e.target.value.trim()) {
                              updateProvider(type, { model: e.target.value.trim() });
                            }
                          }}
                          placeholder="Or type any model ID..."
                          className="w-full h-7 px-2.5 mt-1.5 rounded-md text-[10px] text-[#aaa] placeholder:text-[#2a2a2a] outline-none"
                          style={{
                            background: 'rgba(0,0,0,0.2)',
                            border: '1px solid rgba(255,255,255,0.04)',
                          }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </>
          ) : (
            /* ═══════════════════════════════════════════════════════════
               CONTEXT TIER TAB
               ═══════════════════════════════════════════════════════════ */
            <>
              {/* Tier Selector */}
              <div>
                <label className="text-[10px] text-[#555] uppercase tracking-wider block mb-2">Context Tier</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['small', 'medium', 'large'] as ContextTier[]).map(tier => {
                    const isSelected = contextTier === tier;
                    const color = TIER_COLORS[tier];
                    const info = TIER_INFO[tier];
                    return (
                      <button
                        key={tier}
                        onClick={() => setContextTier(tier)}
                        className="relative flex flex-col items-start p-3 rounded-lg text-left transition-all cursor-pointer"
                        style={{
                          background: isSelected ? `${color}10` : 'rgba(255,255,255,0.02)',
                          border: `1px solid ${isSelected ? `${color}40` : 'rgba(255,255,255,0.05)'}`,
                        }}
                      >
                        <div className="flex items-center gap-1.5 mb-1">
                          <div className="w-2 h-2 rounded-full" style={{ background: isSelected ? color : '#333' }} />
                          <span className="text-[12px] font-medium" style={{ color: isSelected ? color : '#888' }}>
                            {info.label}
                          </span>
                        </div>
                        <p className="text-[9px] leading-relaxed" style={{ color: isSelected ? '#999' : '#555' }}>
                          {info.description}
                        </p>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[9px] text-[#444] mt-2 leading-relaxed px-0.5">
                  {TIER_INFO[contextTier].detail}
                </p>
              </div>

              {/* ── Context Sources Breakdown ── */}
              <div>
                <label className="text-[10px] text-[#555] uppercase tracking-wider block mb-2">Context Sources</label>
                <div className="rounded-lg overflow-hidden" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>

                  {/* Knowledge Base */}
                  <div className="px-3.5 py-2.5 flex items-center justify-between"
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px]" style={{ color: contextToggles.knowledgeBase ? '#ccc' : '#555' }}>
                          Knowledge Base
                        </span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded" style={{
                          background: 'rgba(255,255,255,0.04)',
                          color: '#666',
                        }}>
                          {tokenBreakdown.kbLabel}
                        </span>
                      </div>
                      <p className="text-[9px] text-[#444] mt-0.5">
                        0colors features, concepts, and usage guide
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-[11px] font-mono tabular-nums" style={{
                        color: contextToggles.knowledgeBase ? TIER_COLORS[contextTier] : '#333',
                      }}>
                        {contextToggles.knowledgeBase ? formatTokens(tokenBreakdown.kbTokens) : '0'}
                      </span>
                      <ToggleSwitch enabled={contextToggles.knowledgeBase} onChange={v => updateToggle('knowledgeBase', v)} />
                    </div>
                  </div>

                  {/* Project Context */}
                  <div className="px-3.5 py-2.5 flex items-center justify-between"
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px]" style={{ color: contextToggles.projectContext ? '#ccc' : '#555' }}>
                          Project Data
                        </span>
                        {tokenBreakdown.projectRawTokens > tokenBreakdown.projectBudget && contextToggles.projectContext && (
                          <span className="text-[8px] px-1 py-[1px] rounded" style={{ background: 'rgba(229,163,54,0.15)', color: '#E5A336' }}>
                            truncated
                          </span>
                        )}
                      </div>
                      <p className="text-[9px] text-[#444] mt-0.5">
                        {projectContext
                          ? `Current project: nodes, tokens, themes, logic (${formatTokens(tokenBreakdown.projectRawTokens)} raw)`
                          : 'No project context available'
                        }
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-[11px] font-mono tabular-nums" style={{
                        color: contextToggles.projectContext ? TIER_COLORS[contextTier] : '#333',
                      }}>
                        {contextToggles.projectContext ? formatTokens(tokenBreakdown.projectEffective) : '0'}
                      </span>
                      <ToggleSwitch enabled={contextToggles.projectContext} onChange={v => updateToggle('projectContext', v)} />
                    </div>
                  </div>

                  {/* Conversation History */}
                  <div className="px-3.5 py-2.5 flex items-center justify-between"
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px]" style={{ color: contextToggles.conversationHistory ? '#ccc' : '#555' }}>
                          Conversation History
                        </span>
                        {tokenBreakdown.convTokens > tokenBreakdown.convBudget && contextToggles.conversationHistory && (
                          <span className="text-[8px] px-1 py-[1px] rounded" style={{ background: 'rgba(229,163,54,0.15)', color: '#E5A336' }}>
                            truncated
                          </span>
                        )}
                      </div>
                      <p className="text-[9px] text-[#444] mt-0.5">
                        {tokenBreakdown.convMessageCount > 0
                          ? `${tokenBreakdown.convMessageCount} messages in current chat (${formatTokens(tokenBreakdown.convTokens)} raw)`
                          : 'No active conversation'
                        }
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-[11px] font-mono tabular-nums" style={{
                        color: contextToggles.conversationHistory ? TIER_COLORS[contextTier] : '#333',
                      }}>
                        {contextToggles.conversationHistory ? formatTokens(tokenBreakdown.convEffective) : '0'}
                      </span>
                      <ToggleSwitch enabled={contextToggles.conversationHistory} onChange={v => updateToggle('conversationHistory', v)} />
                    </div>
                  </div>

                  {/* System Instruction (always on, not toggleable) */}
                  <div className="px-3.5 py-2.5 flex items-center justify-between"
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                  >
                    <div className="flex-1 min-w-0">
                      <span className="text-[11px] text-[#666]">System Instruction</span>
                      <p className="text-[9px] text-[#333] mt-0.5">
                        Always included — guides AI behavior
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-[11px] font-mono tabular-nums text-[#555]">
                        {formatTokens(tokenBreakdown.tailTokens)}
                      </span>
                      <div className="w-[18px]" /> {/* spacer to align with toggles */}
                    </div>
                  </div>

                  {/* Max Response */}
                  <div className="px-3.5 py-2.5 flex items-center justify-between"
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                  >
                    <div className="flex-1 min-w-0">
                      <span className="text-[11px] text-[#666]">Max Response</span>
                      <p className="text-[9px] text-[#333] mt-0.5">
                        Reserved for AI output generation
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-[11px] font-mono tabular-nums text-[#555]">
                        {formatTokens(tokenBreakdown.maxResponse)}
                      </span>
                      <div className="w-[18px]" />
                    </div>
                  </div>

                  {/* ── Total ── */}
                  <div className="px-3.5 py-2.5 flex items-center justify-between"
                    style={{ background: 'rgba(255,255,255,0.02)' }}
                  >
                    <div className="flex-1">
                      <span className="text-[11px] text-[#999] font-medium">Total Estimated</span>
                      <p className="text-[9px] text-[#444] mt-0.5">
                        Input: {formatTokens(tokenBreakdown.totalInput)} + Response: {formatTokens(tokenBreakdown.maxResponse)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-[12px] font-mono tabular-nums font-medium" style={{ color: TIER_COLORS[contextTier] }}>
                        {formatTokens(tokenBreakdown.totalWithResponse)}
                      </span>
                      <div className="w-[18px]" />
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Budget bar visualization ── */}
              <div className="rounded-lg px-3.5 py-2.5" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[9px] text-[#555]">Token budget usage</span>
                  <span className="text-[9px] font-mono tabular-nums" style={{ color: TIER_COLORS[contextTier] }}>
                    {formatTokens(tokenBreakdown.totalWithResponse)} / {formatTokens(tokenBreakdown.totalBudget)}
                  </span>
                </div>
                <div className="h-2 rounded-full overflow-hidden flex" style={{ background: 'rgba(255,255,255,0.04)' }}>
                  {/* KB segment */}
                  {tokenBreakdown.activeKB > 0 && (
                    <div
                      className="h-full"
                      style={{
                        width: `${(tokenBreakdown.activeKB / tokenBreakdown.totalBudget) * 100}%`,
                        background: '#7C66DC',
                      }}
                      title={`Knowledge Base: ${formatTokens(tokenBreakdown.activeKB)}`}
                    />
                  )}
                  {/* Project segment */}
                  {tokenBreakdown.activeProject > 0 && (
                    <div
                      className="h-full"
                      style={{
                        width: `${(tokenBreakdown.activeProject / tokenBreakdown.totalBudget) * 100}%`,
                        background: '#E5A336',
                      }}
                      title={`Project: ${formatTokens(tokenBreakdown.activeProject)}`}
                    />
                  )}
                  {/* Conversation segment */}
                  {tokenBreakdown.activeConv > 0 && (
                    <div
                      className="h-full"
                      style={{
                        width: `${(tokenBreakdown.activeConv / tokenBreakdown.totalBudget) * 100}%`,
                        background: '#45B36B',
                      }}
                      title={`Conversation: ${formatTokens(tokenBreakdown.activeConv)}`}
                    />
                  )}
                  {/* System + Response segment */}
                  <div
                    className="h-full"
                    style={{
                      width: `${((tokenBreakdown.tailTokens + tokenBreakdown.maxResponse) / tokenBreakdown.totalBudget) * 100}%`,
                      background: 'rgba(255,255,255,0.08)',
                    }}
                    title={`System + Response: ${formatTokens(tokenBreakdown.tailTokens + tokenBreakdown.maxResponse)}`}
                  />
                </div>
                {/* Legend */}
                <div className="flex flex-wrap gap-3 mt-2">
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-sm" style={{ background: '#7C66DC' }} />
                    <span className="text-[8px] text-[#555]">KB</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-sm" style={{ background: '#E5A336' }} />
                    <span className="text-[8px] text-[#555]">Project</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-sm" style={{ background: '#45B36B' }} />
                    <span className="text-[8px] text-[#555]">Conversation</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-sm" style={{ background: 'rgba(255,255,255,0.15)' }} />
                    <span className="text-[8px] text-[#555]">System + Response</span>
                  </div>
                </div>
              </div>

              {/* ── How It Works ── */}
              <div className="rounded-lg px-3.5 py-2.5" style={{ background: 'rgba(229,163,54,0.04)', border: '1px solid rgba(229,163,54,0.08)' }}>
                <p className="text-[10px] text-[#E5A336]/70 leading-relaxed">
                  <strong>How it works:</strong> The Context Tier sets a total token budget. Each source (KB, project, conversation)
                  gets a share of that budget. Toggle sources off to reduce token usage or free up budget for other sources.
                  If the total exceeds what your model can handle, you'll see an error in chat — just switch to a smaller tier or
                  disable some sources.
                </p>
              </div>
            </>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="shrink-0 px-5 py-3 flex items-center justify-between"
          style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
        >
          <p className="text-[9px] text-[#333]">
            Keys encrypted locally before cloud sync
          </p>
          <button
            onClick={handleSave}
            className="flex items-center gap-1.5 h-8 px-4 rounded-lg text-[12px] cursor-pointer transition-colors"
            style={{
              background: saved ? '#45B36B' : 'rgba(255,255,255,0.08)',
              color: saved ? '#fff' : '#ccc',
              border: `1px solid ${saved ? '#45B36B' : 'rgba(255,255,255,0.1)'}`,
            }}
          >
            {saved ? <><Check size={12} /> Saved</> : 'Save Settings'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}