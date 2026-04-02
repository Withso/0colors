import { motion } from 'motion/react';
import { X, Eye, EyeOff, Check, Info, ChevronDown, BookOpen, Settings, ToggleLeft, ToggleRight } from 'lucide-react';
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  AISettingsV2, ServiceId, ServiceConfig, ServiceDefinition,
  SERVICE_DEFINITIONS, SERVICE_MAP,
  loadAISettings, saveAISettings,
  loadContextTier, saveContextTier,
  loadContextToggles, saveContextToggles, ContextToggles,
  ConversationMessage,
  getModelContextWindow, getConfiguredModelsWithContext,
} from '../../utils/ai-provider';
import {
  type ContextTier, TIER_INFO, getContextBudget,
  estimateTokens, getKnowledgeBaseText,
} from '../../utils/ai-context-manager';

// ── Types ────────────────────────────────────────────────────────

type SettingsTab = 'provider' | 'context';

export interface AISettingsContentProps {
  onSettingsSaved?: (settings: AISettingsV2, contextTier?: ContextTier, contextToggles?: ContextToggles) => void;
  projectContext?: string;
  currentConversationMessages?: ConversationMessage[];
  onClose?: () => void;
  inline?: boolean;
}

interface AISettingsPopupProps {
  onClose: () => void;
  onSettingsSaved?: (settings: AISettingsV2, contextTier: ContextTier, contextToggles: ContextToggles) => void;
  projectContext?: string;
  currentConversationMessages?: ConversationMessage[];
}

const TIER_COLORS: Record<ContextTier, string> = {
  small: '#FF4D6A',
  medium: '#8B8FFF',
  large: '#2BBD68',
};

// ── Helpers ──────────────────────────────────────────────────────

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  return `${n}`;
}

function maskKey(key: string): string {
  if (!key || key.length < 8) return key ? '••••••••' : '';
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
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
        <ToggleRight size={18} className="text-success group-hover:text-[#5CD88E]" />
      ) : (
        <ToggleLeft size={18} className="text-ghost group-hover:text-dim" />
      )}
    </button>
  );
}

// ── Service Section Component ───────────────────────────────────

function ServiceSection({
  definition,
  config,
  isActiveService,
  showKey,
  onToggleShowKey,
  onUpdateConfig,
  onSetActive,
}: {
  definition: ServiceDefinition;
  config: ServiceConfig | undefined;
  isActiveService: boolean;
  showKey: boolean;
  onToggleShowKey: () => void;
  onUpdateConfig: (updates: Partial<ServiceConfig>) => void;
  onSetActive: (modelId: string) => void;
}) {
  const hasKey = !!config?.apiKey;
  const [customModelInput, setCustomModelInput] = useState('');

  const currentModel = config?.model || definition.models[0]?.id || '';
  const isKnownModel = definition.models.some(m => m.id === currentModel);

  return (
    <div
      className="transition-all"
      style={{
        background: isActiveService ? 'rgba(139,143,255,0.04)' : 'transparent',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
      }}
    >
      {/* Header */}
      <div className="px-3.5 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-medium" style={{ color: hasKey ? 'var(--foreground)' : 'var(--subtle)' }}>
            {definition.label}
          </span>
          {hasKey && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-full flex items-center gap-1"
              style={{ background: 'rgba(43,189,104,0.08)', color: '#2BBD68' }}
            >
              <span className="w-1 h-1 rounded-full inline-block" style={{ background: '#2BBD68' }} />
              Active
            </span>
          )}
          {definition.hasFreeTier && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-full"
              style={{ background: 'rgba(43,189,104,0.08)', color: '#2BBD68' }}
            >
              Free tier
            </span>
          )}
        </div>
        {hasKey && !isActiveService && (
          <button
            onClick={() => onSetActive(currentModel)}
            className="text-[10px] px-2 py-0.5 rounded cursor-pointer transition-colors hover:bg-white/5"
            style={{ color: 'var(--dim)' }}
          >
            Set as active
          </button>
        )}
      </div>

      <div className="px-3.5 pb-3 space-y-2.5">
        <p className="text-[11px] text-ghost leading-relaxed">{definition.description}</p>

        {/* API Key */}
        <div>
          <label className="text-[10px] text-dim uppercase tracking-wider block mb-1">API Key</label>
          <div className="flex gap-1.5">
            <div className="flex-1 relative">
              {showKey ? (
                <input
                  type="text"
                  value={config?.apiKey || ''}
                  onChange={e => onUpdateConfig({ apiKey: e.target.value })}
                  placeholder={definition.keyHint}
                  className="w-full h-7 px-2.5 rounded-md text-[11px] text-foreground placeholder:text-[#444] outline-none"
                  autoComplete="off"
                  data-lpignore="true"
                  data-1p-ignore
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                />
              ) : (
                <div
                  className="w-full h-7 px-2.5 rounded-md text-[11px] flex items-center cursor-text"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: hasKey ? 'var(--dim)' : '#444',
                  }}
                  onClick={onToggleShowKey}
                >
                  {hasKey ? maskKey(config!.apiKey) : definition.keyHint}
                </div>
              )}
            </div>
            <button
              onClick={onToggleShowKey}
              className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-white/5 cursor-pointer transition-colors"
              style={{ color: '#555' }}
            >
              {showKey ? <EyeOff size={11} /> : <Eye size={11} />}
            </button>
          </div>
          {definition.keyUrl && (
            <a href={definition.keyUrl} target="_blank" rel="noopener noreferrer"
              className="text-[10px] text-dim hover:text-subtle mt-1 inline-block transition-colors"
            >
              Get your API key &rarr;
            </a>
          )}
          {definition.freeNote && hasKey && (
            <p className="text-[10px] text-[#2BBD68]/60 mt-1 flex items-start gap-1">
              <Info size={8} className="shrink-0 mt-[2px]" />
              {definition.freeNote}
            </p>
          )}
        </div>

        {/* Model selector — only show when key is set */}
        {hasKey && (
          <div>
            <label className="text-[10px] text-dim uppercase tracking-wider block mb-1">Model</label>
            <div className="relative">
              <select
                value={isKnownModel ? currentModel : '__custom__'}
                onChange={e => {
                  if (e.target.value === '__custom__') return;
                  const newModel = e.target.value;
                  onUpdateConfig({ model: newModel });
                  if (isActiveService) onSetActive(newModel);
                }}
                className="w-full h-7 px-2 pr-7 rounded-md text-[11px] text-foreground outline-none cursor-pointer appearance-none"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                {definition.models.map(m => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
                {!isKnownModel && currentModel && (
                  <option value={currentModel}>{currentModel} (custom)</option>
                )}
                {definition.supportsCustomModel && (
                  <option value="__custom__">Custom model...</option>
                )}
              </select>
              <ChevronDown size={9} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-dim" />
            </div>

            {definition.supportsCustomModel && (
              <input
                type="text"
                value={customModelInput}
                onChange={e => {
                  setCustomModelInput(e.target.value);
                  if (e.target.value.trim()) {
                    onUpdateConfig({ model: e.target.value.trim() });
                    if (isActiveService) onSetActive(e.target.value.trim());
                  }
                }}
                placeholder="Or paste any model ID..."
                className="w-full h-6 px-2.5 mt-1.5 rounded-md text-[11px] text-muted-foreground placeholder:text-[#444] outline-none"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════
// AISettingsContent — reusable settings UI (inline or inside modal)
// ═════════════════════════════════════════════════════════════════

export function AISettingsContent({ onSettingsSaved, projectContext, currentConversationMessages, onClose, inline }: AISettingsContentProps) {
  const [settings, setSettings] = useState<AISettingsV2>(loadAISettings);
  const [showKey, setShowKey] = useState<Partial<Record<ServiceId, boolean>>>({});
  const [contextTier, setContextTier] = useState<ContextTier>(loadContextTier);
  const [contextToggles, setContextToggles] = useState<ContextToggles>(loadContextToggles);
  const [activeTab, setActiveTab] = useState<SettingsTab>('provider');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const isInitialMount = useRef(true);

  const contentRef = useRef<HTMLDivElement>(null);

  // ── Auto-save with debounce ───────────────────────────────────
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    setSaveState('saving');
    const timer = setTimeout(() => {
      saveAISettings(settings);
      saveContextTier(contextTier);
      saveContextToggles(contextToggles);
      onSettingsSaved?.(settings, contextTier, contextToggles);
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 1500);
    }, 500);
    return () => clearTimeout(timer);
  }, [settings, contextTier, contextToggles]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Token calculations (live) ─────────────────────────────────
  const tokenBreakdown = useMemo(() => {
    const budget = getContextBudget(contextTier);
    const kbText = getKnowledgeBaseText(contextTier);
    const kbTokens = estimateTokens(kbText);
    const kbLabel = budget.useCompactKB ? 'Compact' : 'Full';
    const projectRawTokens = estimateTokens(projectContext || '');
    const projectBudget = budget.projectContext;
    const projectEffective = Math.min(projectRawTokens, projectBudget);
    const convTokens = (currentConversationMessages || []).reduce(
      (sum, m) => sum + estimateTokens(m.content) + 4, 0,
    );
    const convBudget = budget.conversationHistory;
    const convEffective = Math.min(convTokens, convBudget);
    const convMessageCount = (currentConversationMessages || []).length;
    const tailTokens = estimateTokens(
      budget.useCompactKB
        ? 'Use the project context above to give specific answers. Reference actual node/token names. Be concise.'
        : 'IMPORTANT: You have full context of the user\'s current project above. Use it to give specific, actionable answers. Reference their actual node names, token names, and settings when relevant. Be concise and helpful.'
    );
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
      totalInput, totalWithResponse,
      activeKB, activeProject, activeConv,
    };
  }, [contextTier, contextToggles, projectContext, currentConversationMessages]);

  // ── Service update helpers ────────────────────────────────────

  const updateService = useCallback((serviceId: ServiceId, updates: Partial<ServiceConfig>) => {
    setSettings(prev => {
      const existing = prev.services[serviceId] || { apiKey: '', model: SERVICE_MAP[serviceId].models[0]?.id || '' };
      const updated = { ...existing, ...updates };

      const newSettings = {
        ...prev,
        services: { ...prev.services, [serviceId]: updated },
      };

      // Auto-activate: if this is the first service with a key and no active service has a key
      if (updates.apiKey && updates.apiKey.length > 0) {
        const currentActive = prev.services[prev.activeModel.serviceId];
        if (!currentActive?.apiKey) {
          newSettings.activeModel = { serviceId, modelId: updated.model };
        }
      }

      return newSettings;
    });
  }, []);

  const setActiveModel = useCallback((serviceId: ServiceId, modelId: string) => {
    setSettings(prev => ({ ...prev, activeModel: { serviceId, modelId } }));
  }, []);

  const updateToggle = (key: keyof ContextToggles, value: boolean) => {
    setContextToggles(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className={`flex flex-col ${inline ? '' : 'h-full'}`}>
      {/* ── Header ── */}
      <div className="shrink-0" style={inline ? { borderBottom: '1px solid rgba(255,255,255,0.04)' } : { borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        {!inline && (
          <div className="flex items-center justify-between px-5 py-3">
            <div>
              <h2 className="text-[14px] text-foreground font-medium">AI Settings</h2>
              <p className="text-[11px] text-ghost mt-0.5">Bring your own API key — stored locally, never sent to our servers</p>
            </div>
            {onClose && (
              <button onClick={onClose} className="p-1.5 rounded-md hover:bg-white/5 cursor-pointer" style={{ color: 'var(--dim)' }}>
                <X size={14} />
              </button>
            )}
          </div>
        )}
        {inline && (
          <p className="text-[11px] text-ghost mb-3">Bring your own API key — stored locally, never sent to our servers</p>
        )}

        {/* ── Tab Bar ── */}
        <div className={`flex ${inline ? '' : 'px-5'} gap-0`}>
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
                style={{ color: isActive ? 'var(--foreground)' : 'var(--dim)' }}
              >
                <Icon size={12} />
                {tab.label}
                {isActive && (
                  <motion.div
                    layoutId={inline ? 'settings-tab-indicator-inline' : 'settings-tab-indicator'}
                    className="absolute bottom-0 left-1 right-1 h-[2px] rounded-full"
                    style={{ background: 'var(--ai)' }}
                    transition={{ duration: 0.2 }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Content ── */}
      <div ref={contentRef} className={`flex-1 min-h-0 overflow-y-auto ${inline ? 'py-2' : 'px-0 py-2'}`}>

        {activeTab === 'provider' ? (
            /* ═══════════════════════════════════════════════════════════
               PROVIDER TAB — Per-service sections
               ═══════════════════════════════════════════════════════════ */
            <div>
              {SERVICE_DEFINITIONS.map(def => {
                const cfg = settings.services[def.id];
                const isActive = settings.activeModel.serviceId === def.id;
                return (
                  <ServiceSection
                    key={def.id}
                    definition={def}
                    config={cfg}
                    isActiveService={isActive}
                    showKey={!!showKey[def.id]}
                    onToggleShowKey={() => setShowKey(prev => ({ ...prev, [def.id]: !prev[def.id] }))}
                    onUpdateConfig={updates => updateService(def.id, updates)}
                    onSetActive={modelId => setActiveModel(def.id, modelId)}
                  />
                );
              })}
            </div>
          ) : (
            /* ═══════════════════════════════════════════════════════════
               CONTEXT TIER TAB
               ═══════════════════════════════════════════════════════════ */
            <div className={`${inline ? '' : 'px-5'} space-y-4`}>
              {/* Active Model Context Info */}
              {(() => {
                const configuredModels = getConfiguredModelsWithContext(settings);
                const activeCtx = getModelContextWindow(settings.activeModel.serviceId, settings.activeModel.modelId);
                const activeDef = SERVICE_MAP[settings.activeModel.serviceId];
                const activeModelLabel = activeDef?.models.find(m => m.id === settings.activeModel.modelId)?.label || settings.activeModel.modelId;
                return configuredModels.length > 0 ? (
                  <div className="rounded-lg overflow-hidden" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div className="px-3.5 py-2.5">
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-[10px] text-dim uppercase tracking-wider">Active Model</label>
                        {activeCtx && (
                          <span className="text-[11px] font-mono tabular-nums" style={{ color: 'var(--ai)' }}>
                            {formatTokens(activeCtx)} context
                          </span>
                        )}
                      </div>
                      {configuredModels.length > 1 ? (
                        <div className="relative">
                          <select
                            value={`${settings.activeModel.serviceId}:${settings.activeModel.modelId}`}
                            onChange={e => {
                              const [sid, ...rest] = e.target.value.split(':');
                              const mid = rest.join(':');
                              setSettings(prev => ({ ...prev, activeModel: { serviceId: sid as ServiceId, modelId: mid } }));
                            }}
                            className="w-full h-7 px-2 pr-7 rounded-md text-[11px] text-foreground outline-none cursor-pointer appearance-none"
                            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                          >
                            {configuredModels.map(m => (
                              <option key={`${m.serviceId}:${m.modelId}`} value={`${m.serviceId}:${m.modelId}`}>
                                {m.serviceLabel}: {m.modelLabel}{m.contextWindow ? ` (${formatTokens(m.contextWindow)})` : ''}
                              </option>
                            ))}
                          </select>
                          <ChevronDown size={9} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-dim" />
                        </div>
                      ) : (
                        <div className="text-[11px] text-foreground">
                          {activeDef?.label}: {activeModelLabel}
                        </div>
                      )}
                      {activeCtx && (
                        <div className="mt-2">
                          <div className="flex items-center justify-between text-[10px] text-ghost mb-1">
                            <span>Context usage</span>
                            <span className="font-mono tabular-nums">
                              {formatTokens(tokenBreakdown.totalWithResponse)} / {formatTokens(activeCtx)}
                            </span>
                          </div>
                          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)' }}>
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${Math.min((tokenBreakdown.totalWithResponse / activeCtx) * 100, 100)}%`,
                                background: tokenBreakdown.totalWithResponse > activeCtx ? '#FF4D6A' : 'var(--ai)',
                              }}
                            />
                          </div>
                          {tokenBreakdown.totalWithResponse > activeCtx && (
                            <p className="text-[10px] mt-1" style={{ color: '#FF4D6A' }}>
                              Exceeds model context — reduce tier or disable sources
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ) : null;
              })()}

              {/* Tier Selector */}
              <div>
                <label className="text-[11px] text-dim uppercase tracking-wider block mb-2">Context Tier</label>
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
                          <span className="text-[12px] font-medium" style={{ color: isSelected ? color : 'var(--subtle)' }}>
                            {info.label}
                          </span>
                        </div>
                        <p className="text-[11px] leading-relaxed" style={{ color: isSelected ? 'var(--subtle)' : 'var(--dim)' }}>
                          {info.description}
                        </p>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-ghost mt-2 leading-relaxed px-0.5">
                  {TIER_INFO[contextTier].detail}
                </p>
              </div>

              {/* ── Context Sources Breakdown ── */}
              <div>
                <label className="text-[11px] text-dim uppercase tracking-wider block mb-2">Context Sources</label>
                <div className="rounded-lg overflow-hidden" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>

                  {/* Knowledge Base */}
                  <div className="px-3.5 py-2.5 flex items-center justify-between"
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px]" style={{ color: contextToggles.knowledgeBase ? 'var(--foreground)' : 'var(--dim)' }}>
                          Knowledge Base
                        </span>
                        <span className="text-[11px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.04)', color: '#666' }}>
                          {tokenBreakdown.kbLabel}
                        </span>
                      </div>
                      <p className="text-[11px] text-ghost mt-0.5">0colors features, concepts, and usage guide</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-[11px] font-mono tabular-nums" style={{
                        color: contextToggles.knowledgeBase ? TIER_COLORS[contextTier] : 'var(--ghost)',
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
                        <span className="text-[11px]" style={{ color: contextToggles.projectContext ? 'var(--foreground)' : 'var(--dim)' }}>
                          Project Data
                        </span>
                        {tokenBreakdown.projectRawTokens > tokenBreakdown.projectBudget && contextToggles.projectContext && (
                          <span className="text-[11px] px-1 py-[1px] rounded" style={{ background: 'rgba(139,143,255,0.15)', color: 'var(--ai)' }}>
                            truncated
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-ghost mt-0.5">
                        {projectContext
                          ? `Current project: nodes, tokens, themes, logic (${formatTokens(tokenBreakdown.projectRawTokens)} raw)`
                          : 'No project context available'
                        }
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-[11px] font-mono tabular-nums" style={{
                        color: contextToggles.projectContext ? TIER_COLORS[contextTier] : 'var(--ghost)',
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
                        <span className="text-[11px]" style={{ color: contextToggles.conversationHistory ? 'var(--foreground)' : 'var(--dim)' }}>
                          Conversation History
                        </span>
                        {tokenBreakdown.convTokens > tokenBreakdown.convBudget && contextToggles.conversationHistory && (
                          <span className="text-[11px] px-1 py-[1px] rounded" style={{ background: 'rgba(139,143,255,0.15)', color: 'var(--ai)' }}>
                            truncated
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-ghost mt-0.5">
                        {tokenBreakdown.convMessageCount > 0
                          ? `${tokenBreakdown.convMessageCount} messages in current chat (${formatTokens(tokenBreakdown.convTokens)} raw)`
                          : 'No active conversation'
                        }
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-[11px] font-mono tabular-nums" style={{
                        color: contextToggles.conversationHistory ? TIER_COLORS[contextTier] : 'var(--ghost)',
                      }}>
                        {contextToggles.conversationHistory ? formatTokens(tokenBreakdown.convEffective) : '0'}
                      </span>
                      <ToggleSwitch enabled={contextToggles.conversationHistory} onChange={v => updateToggle('conversationHistory', v)} />
                    </div>
                  </div>

                  {/* System Instruction */}
                  <div className="px-3.5 py-2.5 flex items-center justify-between"
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                  >
                    <div className="flex-1 min-w-0">
                      <span className="text-[11px] text-faint">System Instruction</span>
                      <p className="text-[11px] text-ghost mt-0.5">Always included — guides AI behavior</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-[11px] font-mono tabular-nums text-dim">{formatTokens(tokenBreakdown.tailTokens)}</span>
                      <div className="w-[18px]" />
                    </div>
                  </div>

                  {/* Max Response */}
                  <div className="px-3.5 py-2.5 flex items-center justify-between"
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                  >
                    <div className="flex-1 min-w-0">
                      <span className="text-[11px] text-faint">Max Response</span>
                      <p className="text-[11px] text-ghost mt-0.5">Reserved for AI output generation</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-[11px] font-mono tabular-nums text-dim">{formatTokens(tokenBreakdown.maxResponse)}</span>
                      <div className="w-[18px]" />
                    </div>
                  </div>

                  {/* Total */}
                  <div className="px-3.5 py-2.5 flex items-center justify-between"
                    style={{ background: 'rgba(255,255,255,0.02)' }}
                  >
                    <div className="flex-1">
                      <span className="text-[11px] text-subtle font-medium">Total Estimated</span>
                      <p className="text-[11px] text-ghost mt-0.5">
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
                  <span className="text-[11px] text-dim">Token budget usage</span>
                  <span className="text-[11px] font-mono tabular-nums" style={{ color: TIER_COLORS[contextTier] }}>
                    {formatTokens(tokenBreakdown.totalWithResponse)} / {formatTokens(tokenBreakdown.totalBudget)}
                  </span>
                </div>
                <div className="h-2 rounded-full overflow-hidden flex" style={{ background: 'rgba(255,255,255,0.04)' }}>
                  {tokenBreakdown.activeKB > 0 && (
                    <div className="h-full" style={{ width: `${(tokenBreakdown.activeKB / tokenBreakdown.totalBudget) * 100}%`, background: '#7C66DC' }}
                      title={`Knowledge Base: ${formatTokens(tokenBreakdown.activeKB)}`} />
                  )}
                  {tokenBreakdown.activeProject > 0 && (
                    <div className="h-full" style={{ width: `${(tokenBreakdown.activeProject / tokenBreakdown.totalBudget) * 100}%`, background: 'var(--ai)' }}
                      title={`Project: ${formatTokens(tokenBreakdown.activeProject)}`} />
                  )}
                  {tokenBreakdown.activeConv > 0 && (
                    <div className="h-full" style={{ width: `${(tokenBreakdown.activeConv / tokenBreakdown.totalBudget) * 100}%`, background: '#2BBD68' }}
                      title={`Conversation: ${formatTokens(tokenBreakdown.activeConv)}`} />
                  )}
                  <div className="h-full"
                    style={{ width: `${((tokenBreakdown.tailTokens + tokenBreakdown.maxResponse) / tokenBreakdown.totalBudget) * 100}%`, background: 'rgba(255,255,255,0.08)' }}
                    title={`System + Response: ${formatTokens(tokenBreakdown.tailTokens + tokenBreakdown.maxResponse)}`} />
                </div>
                <div className="flex flex-wrap gap-3 mt-2">
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-sm" style={{ background: '#7C66DC' }} />
                    <span className="text-[11px] text-dim">KB</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-sm" style={{ background: 'var(--ai)' }} />
                    <span className="text-[11px] text-dim">Project</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-sm" style={{ background: '#2BBD68' }} />
                    <span className="text-[11px] text-dim">Conversation</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-sm" style={{ background: 'rgba(255,255,255,0.15)' }} />
                    <span className="text-[11px] text-dim">System + Response</span>
                  </div>
                </div>
              </div>

              {/* ── How It Works ── */}
              <div className="rounded-lg px-3.5 py-2.5" style={{ background: 'rgba(139,143,255,0.04)', border: '1px solid rgba(139,143,255,0.08)' }}>
                <p className="text-[11px] text-ai/70 leading-relaxed">
                  <strong>How it works:</strong> The Context Tier sets a total token budget. Each source (KB, project, conversation)
                  gets a share of that budget. Toggle sources off to reduce token usage or free up budget for other sources.
                  If the total exceeds what your model can handle, you'll see an error in chat — just switch to a smaller tier or
                  disable some sources.
                </p>
              </div>
            </div>
          )}
        </div>

      {/* ── Footer ── */}
      <div className={`shrink-0 ${inline ? '' : 'px-5'} py-3 flex items-center justify-between`}
        style={{ borderTop: `1px solid rgba(255,255,255,${inline ? '0.04' : '0.06'})` }}
      >
        <p className="text-[11px] text-ghost">
          Keys encrypted locally before cloud sync
        </p>
        <div className="flex items-center gap-1.5 text-[11px]" style={{ color: saveState === 'saved' ? '#2BBD68' : 'var(--ghost)' }}>
          {saveState === 'saved' && <><Check size={10} /> Saved</>}
          {saveState === 'saving' && 'Saving...'}
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════
// AISettingsPopup — modal wrapper around AISettingsContent
// ═════════════════════════════════════════════════════════════════

export function AISettingsPopup({ onClose, ...contentProps }: AISettingsPopupProps) {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ zIndex: 100000 }}>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0"
        style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
        onClick={onClose}
      />
      {/* Card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 8 }}
        transition={{ duration: 0.2 }}
        className="relative rounded-xl overflow-hidden flex flex-col"
        style={{
          width: 'min(580px, 92vw)',
          height: 'min(740px, 90vh)',
          background: 'var(--card)',
          boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
        }}
      >
        <AISettingsContent {...contentProps} onClose={onClose} />
      </motion.div>
    </div>
  );
}
