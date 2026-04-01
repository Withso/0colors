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
      className={`w-full h-8 px-3 bg-background border border-secondary rounded-md text-[12px] text-foreground placeholder:text-ghost focus:outline-none focus:border-border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${mono ? 'font-mono' : ''} ${className}`}
    />
  );
}

// Geist-style select
function GeistSelect({ value, onChange, options, disabled = false }: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; disabled?: boolean;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full h-8 px-3 pr-8 bg-background border border-secondary rounded-md text-[12px] text-foreground focus:outline-none focus:border-border transition-colors appearance-none cursor-pointer disabled:opacity-40"
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-dim pointer-events-none" />
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
      className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
        checked ? 'bg-[#ededed]' : 'bg-border'
      }`}
    >
      <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full transition-transform ${
        checked ? 'translate-x-4 bg-background' : 'translate-x-0 bg-faint'
      }`} />
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
    <button onClick={handleCopy} className="h-8 px-2.5 bg-background border border-secondary rounded-md text-faint hover:text-foreground hover:border-border transition-colors cursor-pointer flex items-center gap-1.5">
      {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
      <span className="text-[11px]">{copied ? 'Copied' : 'Copy'}</span>
    </button>
  );
}

// Section header
function SectionHeader({ icon: Icon, title, badge, children }: {
  icon: any; title: string; badge?: string; children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-faint" />
        <span className="text-[12px] font-medium text-subtle uppercase tracking-wider">{title}</span>
        {badge && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary border border-secondary text-faint">{badge}</span>
        )}
      </div>
      {children}
    </div>
  );
}

// Field row
function FieldRow({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-3 last:mb-0">
      <label className="block text-[11px] text-faint mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-ghost mt-1">{hint}</p>}
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
        className="fixed inset-0 z-[80] flex items-center justify-center"
        style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div
          key="dev-mode-panel"
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.98 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="w-[580px] max-h-[85vh] bg-card border border-secondary rounded-xl shadow-xl overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 h-12 border-b border-[#141414] shrink-0">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Terminal className="h-4 w-4 text-faint" />
                <span className="text-[13px] font-medium text-foreground">Dev Mode</span>
              </div>
              <span className="text-[11px] text-ghost">—</span>
              <span className="text-[11px] text-dim truncate max-w-[200px]">{projectName}</span>
            </div>
            <div className="flex items-center gap-2">
              {/* Last run status */}
              {devConfig.lastRunAt && (
                <div className="flex items-center gap-1.5 text-[11px]">
                  {devConfig.lastRunStatus === 'success' ? (
                    <CheckCircle2 className="h-3 w-3 text-success" />
                  ) : devConfig.lastRunStatus === 'error' ? (
                    <AlertCircle className="h-3 w-3 text-destructive" />
                  ) : null}
                  <span className="text-dim">{lastRunDisplay}</span>
                </div>
              )}
              <button onClick={onClose} className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-secondary text-dim hover:text-foreground transition-colors cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Tab Switcher */}
          <div className="flex px-5 border-b border-[#141414] shrink-0">
            <button
              onClick={() => setActiveTab('output')}
              className={`relative px-4 py-2.5 text-[12px] font-medium transition-colors cursor-pointer ${
                activeTab === 'output' ? 'text-foreground' : 'text-dim hover:text-subtle'
              }`}
            >
              Code Sync
              {activeTab === 'output' && (
                <motion.div layoutId="dev-tab" className="absolute bottom-0 left-0 right-0 h-[1px] bg-[#ededed]" />
              )}
            </button>
            <button
              onClick={() => setActiveTab('input')}
              className={`relative px-4 py-2.5 text-[12px] font-medium transition-colors cursor-pointer ${
                activeTab === 'input' ? 'text-foreground' : 'text-dim hover:text-subtle'
              }`}
            >
              Webhook Input
              {activeTab === 'input' && (
                <motion.div layoutId="dev-tab" className="absolute bottom-0 left-0 right-0 h-[1px] bg-[#ededed]" />
              )}
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-5 py-4">
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
          <div className="flex items-center justify-between px-5 h-14 border-t border-[#141414] shrink-0 bg-[#0d0d0d]">
            <div className="flex items-center gap-2">
              {devConfig.lastRunStatus === 'error' && devConfig.lastRunError && (
                <div className="flex items-center gap-1.5 text-[11px] text-destructive max-w-[250px] truncate">
                  <AlertCircle className="h-3 w-3 shrink-0" />
                  <span className="truncate">{devConfig.lastRunError}</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={onTestWebhook}
                className="h-8 px-3 bg-background border border-secondary rounded-md text-[11px] text-subtle hover:text-foreground hover:border-border transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <TestTube className="h-3 w-3" />
                Test
              </button>
              <button
                onClick={onRunNow}
                className="h-8 px-4 bg-[#ededed] hover:bg-white rounded-md text-[11px] font-medium text-[#0a0a0a] transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Play className="h-3 w-3" />
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
    <div className="space-y-5">
      {/* Format & Theme */}
      <div className="p-4 rounded-lg border border-[#141414] bg-[#0d0d0d]">
        <SectionHeader icon={Code2} title="Output Format" />
        <div className="grid grid-cols-2 gap-3">
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
      <div className="p-4 rounded-lg border border-[#141414] bg-[#0d0d0d]">
        <SectionHeader icon={Github} title="GitHub" badge="Push">
          <GeistToggle checked={devConfig.githubEnabled} onChange={(v) => update({ githubEnabled: v })} />
        </SectionHeader>
        {devConfig.githubEnabled && (
          <div className="space-y-0">
            <div className="grid grid-cols-2 gap-3">
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
              <div className="flex gap-2">
                <div className="flex-1 relative">
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
                  className="h-8 px-2.5 bg-[#2BBD68]/10 border border-[#2BBD68]/30 rounded-md text-[11px] text-success hover:bg-[#2BBD68]/20 hover:border-[#2BBD68]/40 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Set
                </button>
                <button
                  onClick={() => setShowPAT(!showPAT)}
                  className="h-8 px-2 bg-background border border-secondary rounded-md text-dim hover:text-foreground hover:border-border transition-colors cursor-pointer"
                >
                  {showPAT ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                </button>
              </div>
              {devConfig.githubPATEncrypted && (
                <p className="text-[10px] text-success/60 mt-1 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> PAT encrypted and saved
                </p>
              )}
            </FieldRow>
          </div>
        )}
      </div>

      {/* Webhook Output */}
      <div className="p-4 rounded-lg border border-[#141414] bg-[#0d0d0d]">
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
      <div className="p-4 rounded-lg border border-[#141414] bg-[#0d0d0d]">
        <SectionHeader icon={Globe} title="Pull API" badge="Cached">
          <GeistToggle checked={devConfig.pullApiEnabled} onChange={(v) => update({ pullApiEnabled: v })} />
        </SectionHeader>
        {devConfig.pullApiEnabled && (
          <div>
            <FieldRow label="Endpoint" hint="Returns cached token output. Responses include Cache-Control headers (5 min default). Rate limited to 100 req/hr per project.">
              <div className="flex gap-2">
                <div className="flex-1">
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
            <div className="mt-2 p-2.5 rounded-md bg-background border border-[#141414]">
              <p className="text-[10px] text-dim leading-relaxed">
                <span className="text-faint font-medium">Recommended:</span> Use webhook push instead of polling. 
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
    <div className="space-y-5">
      {/* Webhook Input */}
      <div className="p-4 rounded-lg border border-[#141414] bg-[#0d0d0d]">
        <SectionHeader icon={Webhook} title="Webhook Input">
          <GeistToggle checked={devConfig.webhookEnabled} onChange={(v) => update({ webhookEnabled: v })} />
        </SectionHeader>
        {devConfig.webhookEnabled && (
          <div className="space-y-0">
            <FieldRow label="Webhook URL">
              <div className="flex gap-2">
                <div className="flex-1">
                  <GeistInput value={webhookUrl} onChange={() => {}} disabled mono />
                </div>
                <CopyButton text={webhookUrl} />
              </div>
            </FieldRow>

            <FieldRow label="Secret" hint="Include as X-Webhook-Secret header in your POST requests.">
              <div className="flex gap-2">
                <div className="flex-1">
                  <GeistInput
                    value={showSecret ? devConfig.webhookSecret : '••••••••••••••••••••••••••••••••'}
                    onChange={() => {}}
                    disabled
                    mono
                  />
                </div>
                <button
                  onClick={() => setShowSecret(!showSecret)}
                  className="h-8 px-2 bg-background border border-secondary rounded-md text-dim hover:text-foreground hover:border-border transition-colors cursor-pointer"
                >
                  {showSecret ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
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
              <div className="flex flex-wrap gap-1.5">
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
                      className={`h-6 px-2 rounded text-[10px] font-mono font-medium transition-colors cursor-pointer ${
                        isActive
                          ? 'bg-elevated text-foreground border border-elevated'
                          : 'bg-background text-ghost border border-[#141414] hover:text-faint hover:border-secondary'
                      }`}
                    >
                      {formatLabels[fmt]}
                    </button>
                  );
                })}
              </div>
            </FieldRow>

            {/* Example cURL */}
            <div className="mt-3 p-3 rounded-md bg-background border border-[#141414]">
              <p className="text-[10px] text-dim mb-2 font-medium">Example Request</p>
              <pre className="text-[10px] text-faint font-mono leading-relaxed whitespace-pre-wrap break-all">
{`curl -X POST ${webhookUrl} \\
  -H "Content-Type: application/json" \\
  -H "X-Webhook-Secret: ${showSecret ? devConfig.webhookSecret : '<secret>'}" \\
  -d '{"value": "#FF5500", "format": "hex"}'`}
              </pre>
            </div>

            {/* Per-Node Webhook URLs (Option B) */}
            {webhookInputNodes.length > 0 && (
              <div className="mt-3 p-3 rounded-md bg-[#0a0a0a] border border-[#FBBF24]/20">
                <p className="text-[10px] text-[#FBBF24]/80 mb-2 font-medium flex items-center gap-1.5">
                  <span>{'\u26A1'}</span> Per-Node Webhook URLs
                </p>
                <div className="space-y-2">
                  {webhookInputNodes.map(node => {
                    const nodeUrl = `${webhookUrl}/${node.id}`;
                    return (
                      <div key={node.id} className="flex items-center gap-2">
                        <span className="text-[10px] text-subtle truncate min-w-[80px] max-w-[120px]">
                          {node.referenceName || `Node ${node.id.slice(0, 6)}`}
                        </span>
                        <div className="flex-1">
                          <GeistInput value={nodeUrl} onChange={() => {}} disabled mono className="!text-[10px] !h-6" />
                        </div>
                        <CopyButton text={nodeUrl} />
                      </div>
                    );
                  })}
                </div>
                <p className="text-[9px] text-ghost mt-2">
                  Mark nodes as webhook inputs on the canvas (click the badge in Dev Mode). Each gets a unique URL.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Schedule */}
      <div className="p-4 rounded-lg border border-[#141414] bg-[#0d0d0d]">
        <SectionHeader icon={Clock} title="Schedule" badge="Cron">
          <GeistToggle checked={devConfig.scheduleEnabled} onChange={(v) => update({ scheduleEnabled: v })} />
        </SectionHeader>
        {devConfig.scheduleEnabled && (
          <div className="space-y-0">
            <FieldRow label="Interval">
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-dim">Every</span>
                <div className="w-20">
                  <GeistInput
                    value={String(devConfig.scheduleIntervalMinutes)}
                    onChange={(v) => {
                      const num = parseInt(v) || 1;
                      update({ scheduleIntervalMinutes: Math.max(1, Math.min(1440, num)) });
                    }}
                    type="number"
                  />
                </div>
                <span className="text-[11px] text-dim">minute(s)</span>
              </div>
            </FieldRow>

            <FieldRow label="Source">
              <div className="flex gap-2 mb-3">
                <button
                  onClick={() => update({ scheduleSource: 'values' })}
                  className={`flex-1 h-8 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                    devConfig.scheduleSource === 'values'
                      ? 'bg-elevated text-foreground border border-elevated'
                      : 'bg-background text-dim border border-[#141414] hover:border-secondary'
                  }`}
                >
                  Value List
                </button>
                <button
                  onClick={() => update({ scheduleSource: 'api' })}
                  className={`flex-1 h-8 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                    devConfig.scheduleSource === 'api'
                      ? 'bg-elevated text-foreground border border-elevated'
                      : 'bg-background text-dim border border-[#141414] hover:border-secondary'
                  }`}
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