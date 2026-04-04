import { useState, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  X, Copy, Check, Eye, EyeOff, ChevronDown, Play, TestTube,
  Webhook, Github, Globe, Clock, AlertCircle, CheckCircle2,
  Send, Terminal, Code2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { DevConfig, ColorNode, Theme, TokenProject } from '../types';
import { encryptPAT, decryptPAT } from '../utils/crypto';
import { SERVER_BASE } from '../utils/supabase/client';
import './DevModePanel.css';

interface DevModePanelProps {
  devConfig: DevConfig;
  onUpdateDevConfig: (config: DevConfig) => void;
  nodes: ColorNode[];
  themes: Theme[];
  activeProjectId: string;
  activeProject?: TokenProject;
  userId?: string; // Required for PAT encryption
  onClose: () => void;
  onRunNow: () => void;
  onTestWebhook: () => void;
}

const BASE_URL = SERVER_BASE;

// Geist-style input component
function GeistInput({
  value, onChange, placeholder, type = 'text', mono = false, disabled = false, className = ''
}: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string; mono?: boolean; disabled?: boolean; className?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className={`dev-mode-input ${mono ? 'dev-mode-input--mono' : ''} ${className}`}
    />
  );
}

// Geist-style select
function GeistSelect({ value, onChange, options, disabled = false }: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; disabled?: boolean;
}) {
  return (
    <div className="dev-mode-select-wrapper">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="dev-mode-select"
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      <ChevronDown className="dev-mode-select-chevron" />
    </div>
  );
}

// Geist-style toggle
function GeistToggle({ checked, onChange, disabled = false }: {
  checked: boolean; onChange: (v: boolean) => void; disabled?: boolean;
}) {
  return (
    <button
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`dev-mode-toggle ${checked ? 'dev-mode-toggle--on' : 'dev-mode-toggle--off'}`}
    >
      <div className={`dev-mode-toggle-knob ${checked ? 'dev-mode-toggle-knob--on' : 'dev-mode-toggle-knob--off'}`} />
    </button>
  );
}

// Copy button component
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text]);
  return (
    <button onClick={handleCopy} className="dev-mode-copy-btn">
      {copied ? <Check className="dev-mode-copy-icon--success" /> : <Copy className="dev-mode-copy-icon" />}
      <span className="dev-mode-copy-text">{copied ? 'Copied' : 'Copy'}</span>
    </button>
  );
}

// Section header
function SectionHeader({ icon: Icon, title, badge, children }: {
  icon: any; title: string; badge?: string; children?: React.ReactNode;
}) {
  return (
    <div className="dev-mode-section-header">
      <div className="dev-mode-section-header-left">
        <Icon className="dev-mode-section-header-icon" />
        <span className="dev-mode-section-header-title">{title}</span>
        {badge && (
          <span className="dev-mode-section-header-badge">{badge}</span>
        )}
      </div>
      {children}
    </div>
  );
}

// Field row
function FieldRow({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="dev-mode-field">
      <label className="dev-mode-field-label">{label}</label>
      {children}
      {hint && <p className="dev-mode-field-hint">{hint}</p>}
    </div>
  );
}

export function DevModePanel({
  devConfig,
  onUpdateDevConfig,
  nodes,
  themes,
  activeProjectId,
  activeProject,
  userId,
  onClose,
  onRunNow,
  onTestWebhook,
}: DevModePanelProps) {
  const [showSecret, setShowSecret] = useState(false);
  const [showPAT, setShowPAT] = useState(false);
  const [patInput, setPatInput] = useState('');
  const [activeTab, setActiveTab] = useState<'input' | 'output'>('output');

  // Derived values
  const webhookUrl = `${BASE_URL}/webhook/${activeProjectId}`;
  const pullApiUrl = `${BASE_URL}/tokens/${activeProjectId}`;

  // Get selectable nodes for target node dropdown
  const allSelectableNodes = useMemo(() =>
    nodes.filter(n => n.projectId === activeProjectId && !n.isPalette && !n.isSpacing),
    [nodes, activeProjectId]
  );

  const update = useCallback((partial: Partial<DevConfig>) => {
    onUpdateDevConfig({ ...devConfig, ...partial });
  }, [devConfig, onUpdateDevConfig]);

  // Format last run time
  const lastRunDisplay = useMemo(() => {
    if (!devConfig.lastRunAt) return null;
    const diff = Date.now() - devConfig.lastRunAt;
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return new Date(devConfig.lastRunAt).toLocaleDateString();
  }, [devConfig.lastRunAt]);

  const projectName = activeProject?.name || 'Project';

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="dev-mode-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="dev-mode-backdrop"
        style={{ backgroundColor: 'color-mix(in srgb, var(--grey-950) 70%, transparent)' }}
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div
          key="dev-mode-panel"
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.98 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="dev-mode-panel"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="dev-mode-header">
            <div className="dev-mode-header-left">
              <div className="dev-mode-header-title-group">
                <Terminal className="dev-mode-header-icon" />
                <span className="dev-mode-header-title">Dev Mode</span>
              </div>
              <span className="dev-mode-header-separator">&mdash;</span>
              <span className="dev-mode-header-project-name">{projectName}</span>
            </div>
            <div className="dev-mode-header-right">
              {/* Last run status */}
              {devConfig.lastRunAt && (
                <div className="dev-mode-last-run">
                  {devConfig.lastRunStatus === 'success' ? (
                    <CheckCircle2 className="dev-mode-last-run-icon--success" />
                  ) : devConfig.lastRunStatus === 'error' ? (
                    <AlertCircle className="dev-mode-last-run-icon--error" />
                  ) : null}
                  <span className="dev-mode-last-run-text">{lastRunDisplay}</span>
                </div>
              )}
              <button onClick={onClose} className="dev-mode-close-btn">
                <X className="dev-mode-close-icon" />
              </button>
            </div>
          </div>

          {/* Tab Switcher */}
          <div className="dev-mode-tabs">
            <button
              onClick={() => setActiveTab('output')}
              className={`dev-mode-tab ${activeTab === 'output' ? 'dev-mode-tab--active' : 'dev-mode-tab--inactive'}`}
            >
              Code Sync
              {activeTab === 'output' && (
                <motion.div layoutId="dev-tab" className="dev-mode-tab-indicator" />
              )}
            </button>
            <button
              onClick={() => setActiveTab('input')}
              className={`dev-mode-tab ${activeTab === 'input' ? 'dev-mode-tab--active' : 'dev-mode-tab--inactive'}`}
            >
              Webhook Input
              {activeTab === 'input' && (
                <motion.div layoutId="dev-tab" className="dev-mode-tab-indicator" />
              )}
            </button>
          </div>

          {/* Content */}
          <div className="dev-mode-content">
            {activeTab === 'output' ? (
              <OutputTab
                devConfig={devConfig}
                update={update}
                themes={themes}
                activeProjectId={activeProjectId}
                pullApiUrl={pullApiUrl}
                showPAT={showPAT}
                setShowPAT={setShowPAT}
                patInput={patInput}
                setPatInput={setPatInput}
                userId={userId}
              />
            ) : (
              <InputTab
                devConfig={devConfig}
                update={update}
                nodes={allSelectableNodes}
                webhookUrl={webhookUrl}
                showSecret={showSecret}
                setShowSecret={setShowSecret}
              />
            )}
          </div>

          {/* Footer */}
          <div className="dev-mode-footer">
            <div className="dev-mode-footer-left">
              {devConfig.lastRunStatus === 'error' && devConfig.lastRunError && (
                <div className="dev-mode-footer-error">
                  <AlertCircle className="dev-mode-footer-error-icon" />
                  <span className="dev-mode-footer-error-text">{devConfig.lastRunError}</span>
                </div>
              )}
            </div>
            <div className="dev-mode-footer-right">
              <button
                onClick={onTestWebhook}
                className="dev-mode-test-btn"
              >
                <TestTube className="dev-mode-test-icon" />
                Test
              </button>
              <button
                onClick={onRunNow}
                className="dev-mode-run-btn"
              >
                <Play className="dev-mode-run-icon" />
                Run Now
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}

// ── OUTPUT TAB ─────────────────────────────────────────────────────
function OutputTab({ devConfig, update, themes, activeProjectId, pullApiUrl, showPAT, setShowPAT, patInput, setPatInput, userId }: {
  devConfig: DevConfig;
  update: (p: Partial<DevConfig>) => void;
  themes: Theme[];
  activeProjectId: string;
  pullApiUrl: string;
  showPAT: boolean;
  setShowPAT: (v: boolean) => void;
  patInput: string;
  setPatInput: (v: string) => void;
  userId?: string; // Required for PAT encryption
}) {
  const projectThemes = themes.filter(t => t.projectId === activeProjectId);
  const formatOptions = [
    { value: 'css', label: 'CSS Variables' },
    { value: 'dtcg', label: 'DTCG JSON' },
    { value: 'tailwind', label: 'Tailwind Config' },
    { value: 'figma', label: 'Figma Variables JSON' },
  ];
  const themeOptions = [
    { value: '_all', label: 'All Themes' },
    ...projectThemes.map(t => ({ value: t.id, label: t.name + (t.isPrimary ? ' (Primary)' : '') })),
  ];

  return (
    <div className="dev-mode-sections">
      {/* Format & Theme */}
      <div className="dev-mode-section">
        <SectionHeader icon={Code2} title="Output Format" />
        <div className="dev-mode-grid-2col">
          <FieldRow label="Format">
            <GeistSelect
              value={devConfig.outputFormat}
              onChange={(v) => update({ outputFormat: v as DevConfig['outputFormat'] })}
              options={formatOptions}
            />
          </FieldRow>
          <FieldRow label="Theme">
            <GeistSelect
              value={devConfig.outputTheme || '_all'}
              onChange={(v) => update({ outputTheme: v === '_all' ? null : v })}
              options={themeOptions}
            />
          </FieldRow>
        </div>
      </div>

      {/* GitHub */}
      <div className="dev-mode-section">
        <SectionHeader icon={Github} title="GitHub" badge="Push">
          <GeistToggle checked={devConfig.githubEnabled} onChange={(v) => update({ githubEnabled: v })} />
        </SectionHeader>
        {devConfig.githubEnabled && (
          <div>
            <div className="dev-mode-grid-2col">
              <FieldRow label="Repository">
                <GeistInput
                  value={devConfig.githubRepo}
                  onChange={(v) => update({ githubRepo: v })}
                  placeholder="owner/repo"
                  mono
                />
              </FieldRow>
              <FieldRow label="Branch">
                <GeistInput
                  value={devConfig.githubBranch}
                  onChange={(v) => update({ githubBranch: v })}
                  placeholder="main"
                  mono
                />
              </FieldRow>
            </div>
            <FieldRow label="File Path">
              <GeistInput
                value={devConfig.githubPath}
                onChange={(v) => update({ githubPath: v })}
                placeholder="src/tokens.css"
                mono
              />
            </FieldRow>
            <FieldRow label="Personal Access Token" hint="Encrypted client-side (AES-256-GCM). Never sent to our server in plaintext.">
              <div className="dev-mode-pat-row">
                <div className="dev-mode-pat-input-wrapper">
                  <GeistInput
                    value={patInput}
                    onChange={setPatInput}
                    type={showPAT ? 'text' : 'password'}
                    placeholder={devConfig.githubPATEncrypted ? '••••••••••••••••' : 'ghp_xxxxxxxxxxxx'}
                    mono
                  />
                </div>
                <button
                  onClick={async () => {
                    if (!patInput || !userId) return;
                    try {
                      const encrypted = await encryptPAT(patInput, userId);
                      update({ githubPATEncrypted: encrypted });
                      setPatInput('');
                    } catch (e: any) {
                      console.log(`[Dev] PAT encryption failed: ${e?.message}`);
                    }
                  }}
                  disabled={!patInput || !userId}
                  className="dev-mode-pat-set-btn"
                >
                  Set
                </button>
                <button
                  onClick={() => setShowPAT(!showPAT)}
                  className="dev-mode-pat-toggle-btn"
                >
                  {showPAT ? <EyeOff className="dev-mode-pat-toggle-icon" /> : <Eye className="dev-mode-pat-toggle-icon" />}
                </button>
              </div>
              {devConfig.githubPATEncrypted && (
                <p className="dev-mode-pat-saved">
                  <CheckCircle2 className="dev-mode-pat-saved-icon" /> PAT encrypted and saved
                </p>
              )}
            </FieldRow>
          </div>
        )}
      </div>

      {/* Webhook Output */}
      <div className="dev-mode-section">
        <SectionHeader icon={Send} title="Webhook" badge="Push">
          <GeistToggle checked={devConfig.webhookOutputEnabled} onChange={(v) => update({ webhookOutputEnabled: v })} />
        </SectionHeader>
        {devConfig.webhookOutputEnabled && (
          <FieldRow label="POST URL" hint="Token data is POSTed as JSON body after each computation.">
            <GeistInput
              value={devConfig.webhookOutputUrl}
              onChange={(v) => update({ webhookOutputUrl: v })}
              placeholder="https://myapp.com/api/tokens"
              mono
            />
          </FieldRow>
        )}
      </div>

      {/* Pull API */}
      <div className="dev-mode-section">
        <SectionHeader icon={Globe} title="Pull API" badge="Cached">
          <GeistToggle checked={devConfig.pullApiEnabled} onChange={(v) => update({ pullApiEnabled: v })} />
        </SectionHeader>
        {devConfig.pullApiEnabled && (
          <div>
            <FieldRow label="Endpoint" hint="Returns cached token output. Responses include Cache-Control headers (5 min default). Rate limited to 100 req/hr per project.">
              <div className="dev-mode-secret-row">
                <div className="dev-mode-secret-input-wrapper">
                  <GeistInput
                    value={`${pullApiUrl}/${devConfig.outputFormat}`}
                    onChange={() => {}}
                    disabled
                    mono
                  />
                </div>
                <CopyButton text={`${pullApiUrl}/${devConfig.outputFormat}`} />
              </div>
            </FieldRow>
            <div className="dev-mode-recommended-note">
              <p className="dev-mode-recommended-note-text">
                <span className="dev-mode-recommended-note-label">Recommended:</span> Use webhook push instead of polling.
                Pull API is rate-limited and consumes Supabase invocations. For real-time updates,
                enable webhook output above and receive tokens on your server.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── INPUT TAB ──────────────────────────────────────────────────────
function InputTab({ devConfig, update, nodes, webhookUrl, showSecret, setShowSecret }: {
  devConfig: DevConfig;
  update: (p: Partial<DevConfig>) => void;
  nodes: ColorNode[];
  webhookUrl: string;
  showSecret: boolean;
  setShowSecret: (v: boolean) => void;
}) {
  const nodeOptions = [
    { value: '_none', label: 'Select a node...' },
    ...nodes.map(n => ({
      value: n.id,
      label: n.referenceName || `Node ${n.id.slice(0, 6)}`,
    })),
  ];

  const webhookInputNodes = nodes.filter(n => n.isWebhookInput);

  const formatLabels: Record<string, string> = {
    hex: 'HEX', hsl: 'HSL', rgb: 'RGB', oklch: 'OKLCH', hct: 'HCT',
  };

  return (
    <div className="dev-mode-sections">
      {/* Webhook Input */}
      <div className="dev-mode-section">
        <SectionHeader icon={Webhook} title="Webhook Input">
          <GeistToggle checked={devConfig.webhookEnabled} onChange={(v) => update({ webhookEnabled: v })} />
        </SectionHeader>
        {devConfig.webhookEnabled && (
          <div>
            <FieldRow label="Webhook URL">
              <div className="dev-mode-secret-row">
                <div className="dev-mode-secret-input-wrapper">
                  <GeistInput value={webhookUrl} onChange={() => {}} disabled mono />
                </div>
                <CopyButton text={webhookUrl} />
              </div>
            </FieldRow>

            <FieldRow label="Secret" hint="Include as X-Webhook-Secret header in your POST requests.">
              <div className="dev-mode-secret-row">
                <div className="dev-mode-secret-input-wrapper">
                  <GeistInput
                    value={showSecret ? devConfig.webhookSecret : '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'}
                    onChange={() => {}}
                    disabled
                    mono
                  />
                </div>
                <button
                  onClick={() => setShowSecret(!showSecret)}
                  className="dev-mode-secret-toggle-btn"
                >
                  {showSecret ? <EyeOff className="dev-mode-secret-toggle-icon" /> : <Eye className="dev-mode-secret-toggle-icon" />}
                </button>
                <CopyButton text={devConfig.webhookSecret} />
              </div>
            </FieldRow>

            <FieldRow label="Target Node" hint="Incoming color values will be applied to this node.">
              <GeistSelect
                value={devConfig.webhookTargetNodeId || '_none'}
                onChange={(v) => update({ webhookTargetNodeId: v === '_none' ? null : v })}
                options={nodeOptions}
              />
            </FieldRow>

            <FieldRow label="Accepted Formats">
              <div className="dev-mode-formats-row">
                {(['hex', 'hsl', 'rgb', 'oklch', 'hct'] as const).map(fmt => {
                  const isActive = devConfig.webhookAcceptFormats.includes(fmt);
                  return (
                    <button
                      key={fmt}
                      onClick={() => {
                        const formats = isActive
                          ? devConfig.webhookAcceptFormats.filter(f => f !== fmt)
                          : [...devConfig.webhookAcceptFormats, fmt];
                        if (formats.length > 0) update({ webhookAcceptFormats: formats });
                      }}
                      className={`dev-mode-format-chip ${isActive ? 'dev-mode-format-chip--active' : 'dev-mode-format-chip--inactive'}`}
                    >
                      {formatLabels[fmt]}
                    </button>
                  );
                })}
              </div>
            </FieldRow>

            {/* Example cURL */}
            <div className="dev-mode-example">
              <p className="dev-mode-example-title">Example Request</p>
              <pre className="dev-mode-example-code">
{`curl -X POST ${webhookUrl} \\
  -H "Content-Type: application/json" \\
  -H "X-Webhook-Secret: ${showSecret ? devConfig.webhookSecret : '<secret>'}" \\
  -d '{"value": "#FF5500", "format": "hex"}'`}
              </pre>
            </div>

            {/* Per-Node Webhook URLs (Option B) */}
            {webhookInputNodes.length > 0 && (
              <div className="dev-mode-per-node-section">
                <p className="dev-mode-per-node-title">
                  <span>{'\u26A1'}</span> Per-Node Webhook URLs
                </p>
                <div className="dev-mode-per-node-list">
                  {webhookInputNodes.map(node => {
                    const nodeUrl = `${webhookUrl}/${node.id}`;
                    return (
                      <div key={node.id} className="dev-mode-per-node-row">
                        <span className="dev-mode-per-node-name">
                          {node.referenceName || `Node ${node.id.slice(0, 6)}`}
                        </span>
                        <div className="dev-mode-per-node-input-wrapper">
                          <GeistInput value={nodeUrl} onChange={() => {}} disabled mono className="dev-mode-per-node-input" />
                        </div>
                        <CopyButton text={nodeUrl} />
                      </div>
                    );
                  })}
                </div>
                <p className="dev-mode-per-node-hint">
                  Mark nodes as webhook inputs on the canvas (click the badge in Dev Mode). Each gets a unique URL.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Schedule */}
      <div className="dev-mode-section">
        <SectionHeader icon={Clock} title="Schedule" badge="Cron">
          <GeistToggle checked={devConfig.scheduleEnabled} onChange={(v) => update({ scheduleEnabled: v })} />
        </SectionHeader>
        {devConfig.scheduleEnabled && (
          <div>
            <FieldRow label="Interval">
              <div className="dev-mode-interval-row">
                <span className="dev-mode-interval-label">Every</span>
                <div className="dev-mode-interval-input-wrapper">
                  <GeistInput
                    value={String(devConfig.scheduleIntervalMinutes)}
                    onChange={(v) => {
                      const num = parseInt(v) || 1;
                      update({ scheduleIntervalMinutes: Math.max(1, Math.min(1440, num)) });
                    }}
                    type="number"
                  />
                </div>
                <span className="dev-mode-interval-label">minute(s)</span>
              </div>
            </FieldRow>

            <FieldRow label="Source">
              <div className="dev-mode-source-row">
                <button
                  onClick={() => update({ scheduleSource: 'values' })}
                  className={`dev-mode-source-btn ${devConfig.scheduleSource === 'values' ? 'dev-mode-source-btn--active' : 'dev-mode-source-btn--inactive'}`}
                >
                  Value List
                </button>
                <button
                  onClick={() => update({ scheduleSource: 'api' })}
                  className={`dev-mode-source-btn ${devConfig.scheduleSource === 'api' ? 'dev-mode-source-btn--active' : 'dev-mode-source-btn--inactive'}`}
                >
                  API Endpoint
                </button>
              </div>
            </FieldRow>

            {devConfig.scheduleSource === 'values' ? (
              <FieldRow label="Values" hint="Comma-separated hex codes. Cycles through the list on each interval.">
                <GeistInput
                  value={devConfig.scheduleValues.join(', ')}
                  onChange={(v) => update({ scheduleValues: v.split(',').map(s => s.trim()).filter(Boolean) })}
                  placeholder="#FF0000, #00FF00, #0000FF"
                  mono
                />
              </FieldRow>
            ) : (
              <FieldRow label="API URL" hint="GET request returning JSON with a 'value' field containing a hex color.">
                <GeistInput
                  value={devConfig.scheduleApiUrl}
                  onChange={(v) => update({ scheduleApiUrl: v })}
                  placeholder="https://api.example.com/color"
                  mono
                />
              </FieldRow>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
