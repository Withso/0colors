import './AISettingsPopup.css';
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
  small: 'var(--red-500)',
  medium: '#8B8FFF',
  large: 'var(--green-500)',
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
      className="ai-settings-toggle-btn"
      title={label}
    >
      {enabled ? (
        <ToggleRight size={18} className="ai-settings-toggle-icon-on" />
      ) : (
        <ToggleLeft size={18} className="ai-settings-toggle-icon-off" />
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
      className="ai-settings-service"
      style={{
        background: isActiveService ? 'rgba(139,143,255,0.04)' : 'transparent',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
      }}
    >
      {/* Header */}
      <div className="ai-settings-service-header">
        <div className="ai-settings-service-header-left">
          <span className="ai-settings-service-label" style={{ color: hasKey ? 'var(--grey-100)' : 'var(--grey-500)' }}>
            {definition.label}
          </span>
          {hasKey && (
            <span className="ai-settings-service-badge">
              <span className="ai-settings-service-badge-dot" />
              Active
            </span>
          )}
          {definition.hasFreeTier && (
            <span className="ai-settings-service-free-tier">
              Free tier
            </span>
          )}
        </div>
        {hasKey && !isActiveService && (
          <button
            onClick={() => onSetActive(currentModel)}
            className="ai-settings-service-set-active"
          >
            Set as active
          </button>
        )}
      </div>

      <div className="ai-settings-service-body">
        <p className="ai-settings-service-description">{definition.description}</p>

        {/* API Key */}
        <div>
          <label className="ai-settings-key-label">API Key</label>
          <div className="ai-settings-key-row">
            <div className="ai-settings-key-input-wrap">
              {showKey ? (
                <input
                  type="text"
                  value={config?.apiKey || ''}
                  onChange={e => onUpdateConfig({ apiKey: e.target.value })}
                  placeholder={definition.keyHint}
                  className="ai-settings-key-input"
                  autoComplete="off"
                  data-lpignore="true"
                  data-1p-ignore
                />
              ) : (
                <div
                  className="ai-settings-key-mask"
                  style={{ color: hasKey ? 'var(--grey-600)' : 'var(--grey-600)' }}
                  onClick={onToggleShowKey}
                >
                  {hasKey ? maskKey(config!.apiKey) : definition.keyHint}
                </div>
              )}
            </div>
            <button
              onClick={onToggleShowKey}
              className="ai-settings-key-toggle"
            >
              {showKey ? <EyeOff size={11} /> : <Eye size={11} />}
            </button>
          </div>
          {definition.keyUrl && (
            <a href={definition.keyUrl} target="_blank" rel="noopener noreferrer"
              className="ai-settings-key-url"
            >
              Get your API key &rarr;
            </a>
          )}
          {definition.freeNote && hasKey && (
            <p className="ai-settings-key-free-note">
              <Info size={8} className="ai-settings-key-free-note-icon" />
              {definition.freeNote}
            </p>
          )}
        </div>

        {/* Model selector — only show when key is set */}
        {hasKey && (
          <div>
            <label className="ai-settings-model-label">Model</label>
            <div className="ai-settings-model-select-wrap">
              <select
                value={isKnownModel ? currentModel : '__custom__'}
                onChange={e => {
                  if (e.target.value === '__custom__') return;
                  const newModel = e.target.value;
                  onUpdateConfig({ model: newModel });
                  if (isActiveService) onSetActive(newModel);
                }}
                className="ai-settings-model-select"
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
              <ChevronDown size={9} className="ai-settings-model-chevron" />
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
                className="ai-settings-model-custom-input"
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
    <div className={`ai-settings-content ${inline ? '' : 'ai-settings-content--modal'}`}>
      {/* ── Header ── */}
      <div className={`ai-settings-header ${inline ? 'ai-settings-header--inline' : 'ai-settings-header--modal'}`}>
        {!inline && (
          <div className="ai-settings-header-top">
            <div>
              <h2 className="ai-settings-header-title">AI Settings</h2>
              <p className="ai-settings-header-subtitle">Bring your own API key — stored locally, never sent to our servers</p>
            </div>
            {onClose && (
              <button onClick={onClose} className="ai-settings-close-btn">
                <X size={14} />
              </button>
            )}
          </div>
        )}
        {inline && (
          <p className="ai-settings-header-subtitle--inline">Bring your own API key — stored locally, never sent to our servers</p>
        )}

        {/* ── Tab Bar ── */}
        <div className={`ai-settings-tab-bar ${inline ? '' : 'ai-settings-tab-bar--modal'}`}>
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
                className="ai-settings-tab"
                style={{ color: isActive ? 'var(--grey-100)' : 'var(--grey-600)' }}
              >
                <Icon size={12} />
                {tab.label}
                {isActive && (
                  <motion.div
                    layoutId={inline ? 'settings-tab-indicator-inline' : 'settings-tab-indicator'}
                    className="ai-settings-tab-indicator"
                    transition={{ duration: 0.2 }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Content ── */}
      <div ref={contentRef} className={`ai-settings-body ${inline ? 'ai-settings-body--inline' : ''}`}>

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
            <div className={`ai-settings-context-tab ${inline ? '' : 'ai-settings-context-tab--modal'}`}>
              {/* Active Model Context Info */}
              {(() => {
                const configuredModels = getConfiguredModelsWithContext(settings);
                const activeCtx = getModelContextWindow(settings.activeModel.serviceId, settings.activeModel.modelId);
                const activeDef = SERVICE_MAP[settings.activeModel.serviceId];
                const activeModelLabel = activeDef?.models.find(m => m.id === settings.activeModel.modelId)?.label || settings.activeModel.modelId;
                return configuredModels.length > 0 ? (
                  <div className="ai-settings-active-model-card">
                    <div className="ai-settings-active-model-inner">
                      <div className="ai-settings-active-model-header">
                        <label className="ai-settings-active-model-label">Active Model</label>
                        {activeCtx && (
                          <span className="ai-settings-active-model-context">
                            {formatTokens(activeCtx)} context
                          </span>
                        )}
                      </div>
                      {configuredModels.length > 1 ? (
                        <div className="ai-settings-active-model-select-wrap">
                          <select
                            value={`${settings.activeModel.serviceId}:${settings.activeModel.modelId}`}
                            onChange={e => {
                              const [sid, ...rest] = e.target.value.split(':');
                              const mid = rest.join(':');
                              setSettings(prev => ({ ...prev, activeModel: { serviceId: sid as ServiceId, modelId: mid } }));
                            }}
                            className="ai-settings-active-model-select"
                          >
                            {configuredModels.map(m => (
                              <option key={`${m.serviceId}:${m.modelId}`} value={`${m.serviceId}:${m.modelId}`}>
                                {m.serviceLabel}: {m.modelLabel}{m.contextWindow ? ` (${formatTokens(m.contextWindow)})` : ''}
                              </option>
                            ))}
                          </select>
                          <ChevronDown size={9} className="ai-settings-active-model-chevron" />
                        </div>
                      ) : (
                        <div className="ai-settings-active-model-name">
                          {activeDef?.label}: {activeModelLabel}
                        </div>
                      )}
                      {activeCtx && (
                        <div className="ai-settings-context-usage">
                          <div className="ai-settings-context-usage-header">
                            <span>Context usage</span>
                            <span className="ai-settings-mono">
                              {formatTokens(tokenBreakdown.totalWithResponse)} / {formatTokens(activeCtx)}
                            </span>
                          </div>
                          <div className="ai-settings-context-usage-bar">
                            <div
                              className="ai-settings-context-usage-fill"
                              style={{
                                width: `${Math.min((tokenBreakdown.totalWithResponse / activeCtx) * 100, 100)}%`,
                                background: tokenBreakdown.totalWithResponse > activeCtx ? 'var(--red-500)' : 'var(--indigo-400)',
                              }}
                            />
                          </div>
                          {tokenBreakdown.totalWithResponse > activeCtx && (
                            <p className="ai-settings-context-usage-warning">
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
                <label className="ai-settings-tier-label">Context Tier</label>
                <div className="ai-settings-tier-grid">
                  {(['small', 'medium', 'large'] as ContextTier[]).map(tier => {
                    const isSelected = contextTier === tier;
                    const color = TIER_COLORS[tier];
                    const info = TIER_INFO[tier];
                    return (
                      <button
                        key={tier}
                        onClick={() => setContextTier(tier)}
                        className="ai-settings-tier-btn"
                        style={{
                          background: isSelected ? `${color}10` : 'rgba(255,255,255,0.02)',
                          border: `1px solid ${isSelected ? `${color}40` : 'rgba(255,255,255,0.05)'}`,
                        }}
                      >
                        <div className="ai-settings-tier-btn-header">
                          <div className="ai-settings-tier-dot" style={{ background: isSelected ? color : 'var(--grey-700)' }} />
                          <span className="ai-settings-tier-name" style={{ color: isSelected ? color : 'var(--grey-500)' }}>
                            {info.label}
                          </span>
                        </div>
                        <p className="ai-settings-tier-desc" style={{ color: isSelected ? 'var(--grey-500)' : 'var(--grey-600)' }}>
                          {info.description}
                        </p>
                      </button>
                    );
                  })}
                </div>
                <p className="ai-settings-tier-detail">
                  {TIER_INFO[contextTier].detail}
                </p>
              </div>

              {/* ── Context Sources Breakdown ── */}
              <div>
                <label className="ai-settings-sources-label">Context Sources</label>
                <div className="ai-settings-sources-card">

                  {/* Knowledge Base */}
                  <div className="ai-settings-source-row">
                    <div className="ai-settings-source-info">
                      <div className="ai-settings-source-name-row">
                        <span className="ai-settings-source-name" style={{ color: contextToggles.knowledgeBase ? 'var(--grey-100)' : 'var(--grey-600)' }}>
                          Knowledge Base
                        </span>
                        <span className="ai-settings-source-kb-badge">
                          {tokenBreakdown.kbLabel}
                        </span>
                      </div>
                      <p className="ai-settings-source-desc">0colors features, concepts, and usage guide</p>
                    </div>
                    <div className="ai-settings-source-right">
                      <span className="ai-settings-source-token-count" style={{
                        color: contextToggles.knowledgeBase ? TIER_COLORS[contextTier] : 'var(--grey-700)',
                      }}>
                        {contextToggles.knowledgeBase ? formatTokens(tokenBreakdown.kbTokens) : '0'}
                      </span>
                      <ToggleSwitch enabled={contextToggles.knowledgeBase} onChange={v => updateToggle('knowledgeBase', v)} />
                    </div>
                  </div>

                  {/* Project Context */}
                  <div className="ai-settings-source-row">
                    <div className="ai-settings-source-info">
                      <div className="ai-settings-source-name-row">
                        <span className="ai-settings-source-name" style={{ color: contextToggles.projectContext ? 'var(--grey-100)' : 'var(--grey-600)' }}>
                          Project Data
                        </span>
                        {tokenBreakdown.projectRawTokens > tokenBreakdown.projectBudget && contextToggles.projectContext && (
                          <span className="ai-settings-source-truncated">
                            truncated
                          </span>
                        )}
                      </div>
                      <p className="ai-settings-source-desc">
                        {projectContext
                          ? `Current project: nodes, tokens, themes, logic (${formatTokens(tokenBreakdown.projectRawTokens)} raw)`
                          : 'No project context available'
                        }
                      </p>
                    </div>
                    <div className="ai-settings-source-right">
                      <span className="ai-settings-source-token-count" style={{
                        color: contextToggles.projectContext ? TIER_COLORS[contextTier] : 'var(--grey-700)',
                      }}>
                        {contextToggles.projectContext ? formatTokens(tokenBreakdown.projectEffective) : '0'}
                      </span>
                      <ToggleSwitch enabled={contextToggles.projectContext} onChange={v => updateToggle('projectContext', v)} />
                    </div>
                  </div>

                  {/* Conversation History */}
                  <div className="ai-settings-source-row">
                    <div className="ai-settings-source-info">
                      <div className="ai-settings-source-name-row">
                        <span className="ai-settings-source-name" style={{ color: contextToggles.conversationHistory ? 'var(--grey-100)' : 'var(--grey-600)' }}>
                          Conversation History
                        </span>
                        {tokenBreakdown.convTokens > tokenBreakdown.convBudget && contextToggles.conversationHistory && (
                          <span className="ai-settings-source-truncated">
                            truncated
                          </span>
                        )}
                      </div>
                      <p className="ai-settings-source-desc">
                        {tokenBreakdown.convMessageCount > 0
                          ? `${tokenBreakdown.convMessageCount} messages in current chat (${formatTokens(tokenBreakdown.convTokens)} raw)`
                          : 'No active conversation'
                        }
                      </p>
                    </div>
                    <div className="ai-settings-source-right">
                      <span className="ai-settings-source-token-count" style={{
                        color: contextToggles.conversationHistory ? TIER_COLORS[contextTier] : 'var(--grey-700)',
                      }}>
                        {contextToggles.conversationHistory ? formatTokens(tokenBreakdown.convEffective) : '0'}
                      </span>
                      <ToggleSwitch enabled={contextToggles.conversationHistory} onChange={v => updateToggle('conversationHistory', v)} />
                    </div>
                  </div>

                  {/* System Instruction */}
                  <div className="ai-settings-source-row">
                    <div className="ai-settings-source-info">
                      <span className="ai-settings-source-name ai-settings-text-faint">System Instruction</span>
                      <p className="ai-settings-source-desc">Always included — guides AI behavior</p>
                    </div>
                    <div className="ai-settings-source-right">
                      <span className="ai-settings-source-token-count ai-settings-text-dim">{formatTokens(tokenBreakdown.tailTokens)}</span>
                      <div className="ai-settings-source-spacer" />
                    </div>
                  </div>

                  {/* Max Response */}
                  <div className="ai-settings-source-row">
                    <div className="ai-settings-source-info">
                      <span className="ai-settings-source-name ai-settings-text-faint">Max Response</span>
                      <p className="ai-settings-source-desc">Reserved for AI output generation</p>
                    </div>
                    <div className="ai-settings-source-right">
                      <span className="ai-settings-source-token-count ai-settings-text-dim">{formatTokens(tokenBreakdown.maxResponse)}</span>
                      <div className="ai-settings-source-spacer" />
                    </div>
                  </div>

                  {/* Total */}
                  <div className="ai-settings-source-row--total">
                    <div className="ai-settings-source-info">
                      <span className="ai-settings-total-label">Total Estimated</span>
                      <p className="ai-settings-total-detail">
                        Input: {formatTokens(tokenBreakdown.totalInput)} + Response: {formatTokens(tokenBreakdown.maxResponse)}
                      </p>
                    </div>
                    <div className="ai-settings-source-right">
                      <span className="ai-settings-total-value" style={{ color: TIER_COLORS[contextTier] }}>
                        {formatTokens(tokenBreakdown.totalWithResponse)}
                      </span>
                      <div className="ai-settings-source-spacer" />
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Budget bar visualization ── */}
              <div className="ai-settings-budget-card">
                <div className="ai-settings-budget-header">
                  <span className="ai-settings-budget-label">Token budget usage</span>
                  <span className="ai-settings-budget-value" style={{ color: TIER_COLORS[contextTier] }}>
                    {formatTokens(tokenBreakdown.totalWithResponse)} / {formatTokens(tokenBreakdown.totalBudget)}
                  </span>
                </div>
                <div className="ai-settings-budget-bar">
                  {tokenBreakdown.activeKB > 0 && (
                    <div className="ai-settings-budget-segment" style={{ width: `${(tokenBreakdown.activeKB / tokenBreakdown.totalBudget) * 100}%`, background: '#7C66DC' }}
                      title={`Knowledge Base: ${formatTokens(tokenBreakdown.activeKB)}`} />
                  )}
                  {tokenBreakdown.activeProject > 0 && (
                    <div className="ai-settings-budget-segment" style={{ width: `${(tokenBreakdown.activeProject / tokenBreakdown.totalBudget) * 100}%`, background: 'var(--indigo-400)' }}
                      title={`Project: ${formatTokens(tokenBreakdown.activeProject)}`} />
                  )}
                  {tokenBreakdown.activeConv > 0 && (
                    <div className="ai-settings-budget-segment" style={{ width: `${(tokenBreakdown.activeConv / tokenBreakdown.totalBudget) * 100}%`, background: 'var(--green-500)' }}
                      title={`Conversation: ${formatTokens(tokenBreakdown.activeConv)}`} />
                  )}
                  <div className="ai-settings-budget-segment"
                    style={{ width: `${((tokenBreakdown.tailTokens + tokenBreakdown.maxResponse) / tokenBreakdown.totalBudget) * 100}%`, background: 'rgba(255,255,255,0.08)' }}
                    title={`System + Response: ${formatTokens(tokenBreakdown.tailTokens + tokenBreakdown.maxResponse)}`} />
                </div>
                <div className="ai-settings-budget-legend">
                  <div className="ai-settings-budget-legend-item">
                    <div className="ai-settings-budget-legend-swatch" style={{ background: '#7C66DC' }} />
                    <span className="ai-settings-budget-legend-text">KB</span>
                  </div>
                  <div className="ai-settings-budget-legend-item">
                    <div className="ai-settings-budget-legend-swatch" style={{ background: 'var(--indigo-400)' }} />
                    <span className="ai-settings-budget-legend-text">Project</span>
                  </div>
                  <div className="ai-settings-budget-legend-item">
                    <div className="ai-settings-budget-legend-swatch" style={{ background: 'var(--green-500)' }} />
                    <span className="ai-settings-budget-legend-text">Conversation</span>
                  </div>
                  <div className="ai-settings-budget-legend-item">
                    <div className="ai-settings-budget-legend-swatch" style={{ background: 'rgba(255,255,255,0.15)' }} />
                    <span className="ai-settings-budget-legend-text">System + Response</span>
                  </div>
                </div>
              </div>

              {/* ── How It Works ── */}
              <div className="ai-settings-how-it-works">
                <p className="ai-settings-how-it-works-text">
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
      <div className={`ai-settings-footer ${inline ? '' : 'ai-settings-footer--modal'}`}
        style={{ borderTop: `1px solid rgba(255,255,255,${inline ? '0.04' : '0.06'})` }}
      >
        <p className="ai-settings-footer-text">
          Keys encrypted locally before cloud sync
        </p>
        <div className="ai-settings-footer-status" style={{ color: saveState === 'saved' ? 'var(--green-500)' : 'var(--grey-700)' }}>
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
    <div className="ai-settings-popup-overlay">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="ai-settings-popup-backdrop"
        onClick={onClose}
      />
      {/* Card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 8 }}
        transition={{ duration: 0.2 }}
        className="ai-settings-popup-card"
      >
        <AISettingsContent {...contentProps} onClose={onClose} />
      </motion.div>
    </div>
  );
}
