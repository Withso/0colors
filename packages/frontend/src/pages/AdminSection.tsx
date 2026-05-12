// ============================================================================
// AdminSection — admin-only settings panel rendered inside ProjectsPage when
// activeSection === 'admin'. Five tabs: Users / Branding / General / Email /
// Security. Email + Security are v1.2 placeholders for now.
// ============================================================================

import { useCallback, useEffect, useState, FormEvent, ChangeEvent } from 'react';
import {
  Users as UsersIcon, Palette, Settings as SettingsIcon, Mail, ShieldCheck,
  MoreHorizontal, Copy, Check, RefreshCw, KeyRound, UserMinus, UserCheck, Trash2, ShieldOff, Shield, ImagePlus, Loader2,
} from 'lucide-react';
import {
  listAdminUsers, updateAdminUser, deleteAdminUser,
  resendInviteForUser, generateResetLinkForUser,
  getAdminSettings, patchAdminSettings,
  type AdminUser, type AdminSettings,
} from '../api/admin';
import { createInvite } from '../api/auth';
import './AdminSection.css';

type AdminTab = 'users' | 'branding' | 'general' | 'email' | 'security';

const TABS: { id: AdminTab; label: string; icon: any }[] = [
  { id: 'users', label: 'Users', icon: UsersIcon },
  { id: 'branding', label: 'Branding', icon: Palette },
  { id: 'general', label: 'General', icon: SettingsIcon },
  { id: 'email', label: 'Email', icon: Mail },
  { id: 'security', label: 'Security', icon: ShieldCheck },
];

export function AdminSection({ currentUserId }: { currentUserId: string }) {
  const [activeTab, setActiveTab] = useState<AdminTab>('users');

  return (
    <div className="admin-section">
      <div className="admin-section-header">
        <h1 className="admin-section-title">Admin</h1>
        <p className="admin-section-subtitle">Manage users, branding, and the way this install runs.</p>
      </div>

      <nav className="admin-tabs" role="tablist">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={activeTab === id}
            className={`admin-tab${activeTab === id ? ' is-active' : ''}`}
            onClick={() => setActiveTab(id)}
            data-testid={`admin-tab-${id}`}
          >
            <Icon size={14} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <div className="admin-tab-body">
        {activeTab === 'users' && <UsersTab currentUserId={currentUserId} />}
        {activeTab === 'branding' && <BrandingTab />}
        {activeTab === 'general' && <GeneralTab />}
        {activeTab === 'email' && <PlaceholderTab title="Email" body="SMTP integration is planned for v1.2. Until then, the admin shares invite and password-reset links manually — both flows generate copyable URLs from the Users tab." />}
        {activeTab === 'security' && <PlaceholderTab title="Security" body="Rate limiting on login + signup, scheduled session cleanup, and an audit log will land in v1.2. Sessions today expire after 30 days of inactivity." />}
      </div>
    </div>
  );
}

// ── Users tab ────────────────────────────────────────────────────────────────

function UsersTab({ currentUserId }: { currentUserId: string }) {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [pendingLink, setPendingLink] = useState<{ kind: 'invite' | 'reset' | 'new-invite'; userId: string; url: string; expiresAt: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError('');
    listAdminUsers()
      .then((u) => { if (!cancelled) setUsers(u); })
      .catch((e) => { if (!cancelled) setError(e?.message || 'Failed to load users'); });
    return () => { cancelled = true; };
  }, [reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  const buildLink = (token: string) => `${window.location.origin}/accept-invite/${token}`;

  const onResend = async (u: AdminUser) => {
    try {
      const { inviteToken, expiresAt } = await resendInviteForUser(u.id);
      setPendingLink({ kind: 'invite', userId: u.id, url: buildLink(inviteToken), expiresAt });
      reload();
    } catch (e: any) { setError(e?.message || 'Failed to regenerate invite'); }
  };

  const onResetLink = async (u: AdminUser) => {
    if (!window.confirm(`Generate a password-reset link for ${u.email}? Their current password will stop working immediately.`)) return;
    try {
      const { inviteToken, expiresAt } = await generateResetLinkForUser(u.id);
      setPendingLink({ kind: 'reset', userId: u.id, url: buildLink(inviteToken), expiresAt });
      reload();
    } catch (e: any) { setError(e?.message || 'Failed to generate reset link'); }
  };

  const onToggleAdmin = async (u: AdminUser) => {
    try {
      await updateAdminUser(u.id, { isAdmin: !u.isAdmin });
      reload();
    } catch (e: any) { setError(e?.message || 'Failed to update role'); }
  };

  const onToggleActive = async (u: AdminUser) => {
    const next = !u.isActive;
    const msg = next ? `Reactivate ${u.email}?` : `Deactivate ${u.email}? They will be signed out everywhere and unable to sign in until reactivated.`;
    if (!window.confirm(msg)) return;
    try {
      await updateAdminUser(u.id, { isActive: next });
      reload();
    } catch (e: any) { setError(e?.message || 'Failed to update user'); }
  };

  const onDelete = async (u: AdminUser) => {
    const allUsers = users ?? [];
    const others = allUsers.filter(x => x.id !== u.id && x.isActive);
    const transferTo = window.prompt(`Delete ${u.email}? Their projects will be ${others.length ? 'transferred to another user.\n\nEnter the destination user email (or leave blank to delete projects too):' : 'permanently deleted (no other users to transfer to).\n\nType DELETE to confirm:'}`);
    if (transferTo === null) return;
    if (!others.length && transferTo !== 'DELETE') return;
    let transferId: string | undefined;
    if (others.length && transferTo.trim()) {
      const match = others.find(x => x.email.toLowerCase() === transferTo.trim().toLowerCase());
      if (!match) {
        setError(`No active user with email "${transferTo.trim()}"`);
        return;
      }
      transferId = match.id;
    }
    try {
      await deleteAdminUser(u.id, transferId);
      reload();
    } catch (e: any) { setError(e?.message || 'Failed to delete user'); }
  };

  return (
    <div className="admin-tab-content">
      <div className="admin-users-header">
        <h2 className="admin-h2">Users</h2>
        <InviteForm onCreated={(token, expiresAt, userId) => {
          setPendingLink({ kind: 'new-invite', userId, url: buildLink(token), expiresAt });
          reload();
        }} />
      </div>

      {pendingLink && (
        <LinkBanner
          kind={pendingLink.kind}
          url={pendingLink.url}
          expiresAt={pendingLink.expiresAt}
          onDismiss={() => setPendingLink(null)}
        />
      )}

      {error && <div className="admin-error">{error}</div>}

      {!users && !error && <div className="admin-loading">Loading users…</div>}

      {users && (
        <div className="admin-user-list" data-testid="admin-users-list">
          {users.map((u) => (
            <UserRow
              key={u.id}
              user={u}
              isSelf={u.id === currentUserId}
              onResend={() => onResend(u)}
              onResetLink={() => onResetLink(u)}
              onToggleAdmin={() => onToggleAdmin(u)}
              onToggleActive={() => onToggleActive(u)}
              onDelete={() => onDelete(u)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function InviteForm({ onCreated }: { onCreated: (token: string, expiresAt: string, userId: string) => void }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [asAdmin, setAsAdmin] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await createInvite({ email: email.trim(), name: name.trim(), isAdmin: asAdmin });
      onCreated(res.inviteToken, res.expiresAt, res.userId);
      setEmail(''); setName(''); setAsAdmin(false); setOpen(false);
    } catch (e: any) { setError(e?.message || 'Failed to create invite'); }
    finally { setSubmitting(false); }
  }

  if (!open) {
    return <button className="admin-primary-btn" onClick={() => setOpen(true)} data-testid="admin-invite-open">Invite user</button>;
  }
  return (
    <form className="admin-invite-inline" onSubmit={onSubmit}>
      <input type="email" className="admin-input" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
      <input type="text" className="admin-input" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required />
      <label className="admin-inline-check">
        <input type="checkbox" checked={asAdmin} onChange={(e) => setAsAdmin(e.target.checked)} />
        Admin
      </label>
      {error && <span className="admin-inline-error">{error}</span>}
      <button type="submit" className="admin-primary-btn" disabled={submitting}>{submitting ? '…' : 'Create'}</button>
      <button type="button" className="admin-ghost-btn" onClick={() => { setOpen(false); setError(''); }}>Cancel</button>
    </form>
  );
}

function LinkBanner({ kind, url, expiresAt, onDismiss }: { kind: 'invite' | 'reset' | 'new-invite'; url: string; expiresAt: string; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false);
  const heading =
    kind === 'reset' ? 'Password-reset link generated' :
    kind === 'new-invite' ? 'Invite created' :
    'Invite re-issued';
  const blurb =
    kind === 'reset' ? 'Share this link with the user. They\'ll set a new password and be signed in. Their previous password no longer works.' :
    'Share this link with the user. They\'ll set their password and be signed in.';
  async function copy() {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  }
  return (
    <div className="admin-link-banner" role="status">
      <div className="admin-link-banner-text">
        <div className="admin-link-banner-heading">{heading}</div>
        <div className="admin-link-banner-blurb">{blurb} Expires {new Date(expiresAt).toLocaleDateString()}.</div>
      </div>
      <div className="admin-link-banner-row">
        <code className="admin-link-banner-url">{url}</code>
        <button type="button" className="admin-ghost-btn" onClick={copy} aria-label="Copy link">
          {copied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
        </button>
        <button type="button" className="admin-ghost-btn" onClick={onDismiss}>Dismiss</button>
      </div>
    </div>
  );
}

function UserRow({ user: u, isSelf, onResend, onResetLink, onToggleAdmin, onToggleActive, onDelete }: {
  user: AdminUser;
  isSelf: boolean;
  onResend: () => void;
  onResetLink: () => void;
  onToggleAdmin: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    if (!menuOpen) return;
    const handler = () => setMenuOpen(false);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [menuOpen]);

  const statusLabel = u.status === 'active' ? 'Active' : u.status === 'pending' ? 'Pending invite' : 'Deactivated';

  return (
    <div className="admin-user-row" data-testid={`admin-user-${u.id}`}>
      <div className="admin-user-row-main">
        <div className="admin-user-row-name">
          {u.name}
          {u.isAdmin && <span className="admin-badge admin-badge-admin">Admin</span>}
          {isSelf && <span className="admin-badge admin-badge-self">You</span>}
        </div>
        <div className="admin-user-row-email">{u.email}</div>
      </div>
      <div className={`admin-user-row-status admin-user-row-status-${u.status}`}>{statusLabel}</div>
      <div className="admin-user-row-meta">
        {u.lastSeenAt ? `Active ${new Date(u.lastSeenAt).toLocaleDateString()}` : u.status === 'pending' && u.inviteExpiresAt ? `Invite expires ${new Date(u.inviteExpiresAt).toLocaleDateString()}` : '—'}
      </div>
      <div className="admin-user-row-menu" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="admin-icon-btn" onClick={() => setMenuOpen((v) => !v)} aria-label="User actions">
          <MoreHorizontal size={14} />
        </button>
        {menuOpen && (
          <div className="admin-menu" role="menu">
            {u.status === 'pending' && (
              <button role="menuitem" className="admin-menu-item" onClick={() => { setMenuOpen(false); onResend(); }}>
                <RefreshCw size={12} /> Re-issue invite
              </button>
            )}
            {u.status !== 'pending' && (
              <button role="menuitem" className="admin-menu-item" onClick={() => { setMenuOpen(false); onResetLink(); }}>
                <KeyRound size={12} /> Generate reset link
              </button>
            )}
            <button role="menuitem" className="admin-menu-item" onClick={() => { setMenuOpen(false); onToggleAdmin(); }} disabled={isSelf}>
              {u.isAdmin ? <><ShieldOff size={12} /> Demote from admin</> : <><Shield size={12} /> Promote to admin</>}
            </button>
            <button role="menuitem" className="admin-menu-item" onClick={() => { setMenuOpen(false); onToggleActive(); }} disabled={isSelf}>
              {u.isActive ? <><UserMinus size={12} /> Deactivate</> : <><UserCheck size={12} /> Reactivate</>}
            </button>
            <div className="admin-menu-divider" />
            <button role="menuitem" className="admin-menu-item admin-menu-item-danger" onClick={() => { setMenuOpen(false); onDelete(); }} disabled={isSelf}>
              <Trash2 size={12} /> Delete account
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Branding tab ─────────────────────────────────────────────────────────────

function BrandingTab() {
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [error, setError] = useState('');
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [bust, setBust] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getAdminSettings().then((s) => { if (!cancelled) setSettings(s); })
      .catch((e) => { if (!cancelled) setError(e?.message || 'Failed to load settings'); });
    return () => { cancelled = true; };
  }, []);

  async function onUpload(key: 'branding_favicon' | 'branding_logo', file: File) {
    setError('');
    if (file.size > 512 * 1024) {
      setError('Image must be 512 KB or less');
      return;
    }
    const allowed = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp', 'image/x-icon'];
    if (!allowed.includes(file.type)) {
      setError('Only PNG, JPEG, SVG, WebP, or ICO supported');
      return;
    }
    setSavingKey(key);
    try {
      const data = await fileToBase64(file);
      await patchAdminSettings({ [key]: { data, contentType: file.type } });
      setSettings((prev) => prev ? { ...prev, [key]: { data, contentType: file.type } } : prev);
      setBust((n) => n + 1);
      // Force-refresh the live favicon link element so the tab icon updates.
      if (key === 'branding_favicon') {
        const link = document.querySelector('link[rel="icon"]') as HTMLLinkElement | null;
        if (link) link.href = `/api/branding/favicon?v=${Date.now()}`;
      }
    } catch (e: any) {
      setError(e?.message || 'Upload failed');
    } finally {
      setSavingKey(null);
    }
  }

  async function onClear(key: 'branding_favicon' | 'branding_logo') {
    if (!window.confirm('Restore the default asset?')) return;
    setSavingKey(key);
    try {
      await patchAdminSettings({ [key]: null });
      setSettings((prev) => prev ? { ...prev, [key]: undefined } : prev);
      setBust((n) => n + 1);
      if (key === 'branding_favicon') {
        const link = document.querySelector('link[rel="icon"]') as HTMLLinkElement | null;
        if (link) link.href = `/api/branding/favicon?v=${Date.now()}`;
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to clear');
    } finally {
      setSavingKey(null);
    }
  }

  async function onToggleAttribution() {
    if (!settings) return;
    const next = !(settings.attribution_enabled !== false);
    setSavingKey('attribution_enabled');
    try {
      await patchAdminSettings({ attribution_enabled: next });
      setSettings({ ...settings, attribution_enabled: next });
    } catch (e: any) {
      setError(e?.message || 'Failed to update');
    } finally {
      setSavingKey(null);
    }
  }

  if (!settings) return <div className="admin-loading">Loading…</div>;

  return (
    <div className="admin-tab-content">
      <h2 className="admin-h2">Branding</h2>
      <p className="admin-blurb">Override the default 0colors logo and favicon. Stored in your database — survives redeploys and never leaves your install. PNG / JPEG / SVG / WebP, max 512 KB.</p>

      {error && <div className="admin-error">{error}</div>}

      <BrandingAsset
        label="Favicon"
        helper="Square. Shown in browser tabs. SVG recommended."
        endpoint={`/api/branding/favicon?v=${bust}`}
        hasCustom={!!settings.branding_favicon}
        saving={savingKey === 'branding_favicon'}
        onUpload={(f) => onUpload('branding_favicon', f)}
        onClear={() => onClear('branding_favicon')}
      />

      <BrandingAsset
        label="Logo"
        helper="Square or wide. Used as the in-app brand mark when present."
        endpoint={`/api/branding/logo?v=${bust}`}
        hasCustom={!!settings.branding_logo}
        saving={savingKey === 'branding_logo'}
        onUpload={(f) => onUpload('branding_logo', f)}
        onClear={() => onClear('branding_logo')}
      />

      <div className="admin-divider" />

      <div className="admin-row-toggle">
        <div>
          <div className="admin-row-toggle-label">Powered by 0colors footer</div>
          <div className="admin-row-toggle-helper">Small attribution shown in the sidebar. Turning this off is fine — attribution is appreciated, not required.</div>
        </div>
        <Toggle
          checked={settings.attribution_enabled !== false}
          onChange={onToggleAttribution}
          loading={savingKey === 'attribution_enabled'}
        />
      </div>
    </div>
  );
}

function BrandingAsset({ label, helper, endpoint, hasCustom, saving, onUpload, onClear }: {
  label: string;
  helper: string;
  endpoint: string;
  hasCustom: boolean;
  saving: boolean;
  onUpload: (f: File) => void;
  onClear: () => void;
}) {
  const inputId = `admin-branding-${label.toLowerCase()}`;
  function onChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) onUpload(file);
    e.target.value = ''; // allow re-uploading the same file
  }
  return (
    <div className="admin-branding-asset">
      <div className="admin-branding-asset-preview">
        <img src={endpoint} alt={`${label} preview`} />
      </div>
      <div className="admin-branding-asset-meta">
        <div className="admin-branding-asset-label">{label} {hasCustom && <span className="admin-badge admin-badge-custom">Custom</span>}</div>
        <div className="admin-branding-asset-helper">{helper}</div>
        <div className="admin-branding-asset-actions">
          <label htmlFor={inputId} className="admin-primary-btn">
            {saving ? <><Loader2 size={12} className="admin-spin" /> Uploading…</> : <><ImagePlus size={12} /> Upload</>}
          </label>
          <input id={inputId} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp,image/x-icon" onChange={onChange} hidden disabled={saving} />
          {hasCustom && (
            <button type="button" className="admin-ghost-btn" onClick={onClear} disabled={saving}>Restore default</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── General tab ──────────────────────────────────────────────────────────────

function GeneralTab() {
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [error, setError] = useState('');
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [instanceNameDraft, setInstanceNameDraft] = useState('');

  useEffect(() => {
    let cancelled = false;
    getAdminSettings().then((s) => {
      if (cancelled) return;
      setSettings(s);
      setInstanceNameDraft(s.instance_name ?? '');
    }).catch((e) => { if (!cancelled) setError(e?.message || 'Failed to load settings'); });
    return () => { cancelled = true; };
  }, []);

  async function saveInstanceName(e: FormEvent) {
    e.preventDefault();
    setSavingKey('instance_name');
    try {
      const next = instanceNameDraft.trim() || null;
      await patchAdminSettings({ instance_name: next ?? undefined });
      setSettings((prev) => prev ? { ...prev, instance_name: next ?? undefined } : prev);
    } catch (e: any) { setError(e?.message || 'Failed to save'); }
    finally { setSavingKey(null); }
  }

  async function toggleSignup() {
    if (!settings) return;
    const next = !(settings.allow_public_signup !== false);
    setSavingKey('allow_public_signup');
    try {
      await patchAdminSettings({ allow_public_signup: next });
      setSettings({ ...settings, allow_public_signup: next });
    } catch (e: any) { setError(e?.message || 'Failed to update'); }
    finally { setSavingKey(null); }
  }

  if (!settings) return <div className="admin-loading">Loading…</div>;

  return (
    <div className="admin-tab-content">
      <h2 className="admin-h2">General</h2>
      {error && <div className="admin-error">{error}</div>}

      <form onSubmit={saveInstanceName} className="admin-row-form">
        <div className="admin-row-toggle-label">Instance name</div>
        <div className="admin-row-toggle-helper">Shown in the sidebar and the browser tab title. Defaults to "0colors".</div>
        <div className="admin-row-form-row">
          <input
            className="admin-input"
            value={instanceNameDraft}
            onChange={(e) => setInstanceNameDraft(e.target.value)}
            placeholder="0colors"
          />
          <button type="submit" className="admin-primary-btn" disabled={savingKey === 'instance_name'}>Save</button>
        </div>
      </form>

      <div className="admin-divider" />

      <div className="admin-row-toggle">
        <div>
          <div className="admin-row-toggle-label">Allow public signup</div>
          <div className="admin-row-toggle-helper">When on, anyone with the URL can create an account at /signup. When off, only invited users can join.</div>
        </div>
        <Toggle
          checked={settings.allow_public_signup !== false}
          onChange={toggleSignup}
          loading={savingKey === 'allow_public_signup'}
        />
      </div>
    </div>
  );
}

// ── Placeholder tabs ─────────────────────────────────────────────────────────

function PlaceholderTab({ title, body }: { title: string; body: string }) {
  return (
    <div className="admin-tab-content">
      <h2 className="admin-h2">{title}</h2>
      <div className="admin-placeholder">{body}</div>
    </div>
  );
}

// ── Shared toggle ────────────────────────────────────────────────────────────

function Toggle({ checked, onChange, loading }: { checked: boolean; onChange: () => void; loading: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={`admin-toggle${checked ? ' is-on' : ''}`}
      onClick={onChange}
      disabled={loading}
    >
      <span className="admin-toggle-knob" />
    </button>
  );
}

// ── Utils ────────────────────────────────────────────────────────────────────

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const idx = result.indexOf('base64,');
      resolve(idx >= 0 ? result.slice(idx + 'base64,'.length) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
