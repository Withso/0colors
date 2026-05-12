import { useState, useEffect, useRef, useMemo, useCallback, lazy, Suspense, FormEvent } from 'react';
import { Plus, Upload, MoreHorizontal, Download, Copy, Trash2, LogOut, Sparkles, Eye, LogIn, Globe, Folder, User, FlaskConical, UserPlus, Check, Settings as SettingsIcon, Monitor } from 'lucide-react';
import { getPublicSettings } from '../api/admin';
import { listSessions, revokeSession, revokeAllOtherSessions, type AuthSession } from '../api/auth';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';
import { CommunityPage } from './CommunityPage';
import { AISettingsContent } from '../components/ai/AISettingsPopup';
import "./ProjectsPage.css";
import type { DashboardSection } from '../store/slices/auth-slice';
const AdminQaDashboard = lazy(async () => {
  const mod = await import('../components/admin/AdminQaDashboard');
  return { default: mod.AdminQaDashboard };
});

const AdminSection = lazy(async () => {
  const mod = await import('./AdminSection');
  return { default: mod.AdminSection };
});

interface ColorNode {
  id: string;
  projectId: string;
  hue: number;
  saturation: number;
  lightness: number;
  alpha: number;
  position: { x: number; y: number };
  parentId: string | null;
  colorSpace: 'hsl' | 'rgb' | 'oklch';
  red?: number;
  green?: number;
  blue?: number;
}

interface Project {
  id: string;
  name: string;
  folderColor?: number;
  isCloud?: boolean;
  isTemplate?: boolean;
  isSample?: boolean;
  lastSyncedAt?: number;
}

interface DesignToken {
  id: string;
  name: string;
  value: string;
  nodeId: string | null;
  collectionId: string;
  groupId: string | null;
  projectId: string;
}

interface TokenCollection {
  id: string;
  name: string;
  projectId: string;
}

interface TokenGroup {
  id: string;
  name: string;
  collectionId: string;
  projectId: string;
}

interface ProjectsPageProps {
  projects: Project[];
  allNodes: ColorNode[];
  tokens: DesignToken[];
  collections: TokenCollection[];
  groups: TokenGroup[];
  onSelectProject: (projectId: string) => void;
  onCreateProject: (type: 'cloud' | 'template') => void;
  onDuplicateProject: (projectId: string) => void;
  onDeleteProject: (projectId: string) => void;
  onImportProject: () => void;
  onExportProject: (projectId: string) => void;
  highlightedProjectId: string | null;
  isAuthenticated?: boolean;
  isAdmin?: boolean;
  isTemplateAdmin?: boolean;
  userEmail?: string;
  onSignOut?: () => void;
  onSignIn?: () => void;
  cloudSyncStatus?: string;
  onForceCloudRefresh?: () => void;
  publishedProjectIds?: Set<string>;

  // NEW props
  activeSection?: DashboardSection;
  onSectionChange?: (section: DashboardSection) => void;
  // AI Settings (inline)
  onAISettingsSaved?: (settings: any, contextTier?: any, contextToggles?: any) => void;
  aiProjectContext?: string;
  // Community (inline)
  onOpenCommunityProject?: (slug: string) => void;
  onRemixCommunityProject?: (slug: string) => void;
  // Sample projects (individual template cards)
  sampleTemplates?: Array<{ id: string; name: string; description: string; folderColor?: number; nodes?: any[]; _origIdx?: number }>;
  onSelectSampleProject?: (templateIdx: number) => void;
  starredTemplateId?: string | null;
  onStarTemplate?: (projectId: string) => void;
  // Admin panel (Phase 8)
  currentUserId?: string;
}

/* ═══════════════════════════════════════════════════════════════
   NavItem — sidebar navigation item
   ═══════════════════════════════════════════════════════════════ */

function NavItem({ icon: Icon, label, active, onClick, testId }: {
  icon: any; label: string; active: boolean; onClick: () => void; testId?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`projects-nav-item${active ? ' is-active' : ''}`}
      data-testid={testId}
    >
      <Icon className="projects-nav-item-icon" />
      {label}
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════════
   ProjectRow — replaces FolderCard
   ═══════════════════════════════════════════════════════════════ */

function ProjectRow({ project, tokenCount, nodeCount, isHighlighted, isPublished, onClick, onExport, onDuplicate, onDelete, innerRef }: {
  project: Project;
  tokenCount: number;
  nodeCount: number;
  isHighlighted: boolean;
  isPublished?: boolean;
  onClick: () => void;
  onExport: (e: React.MouseEvent) => void;
  onDuplicate: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
  innerRef: (el: HTMLDivElement | null) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const isSample = project.isSample;

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  return (
    <div
      ref={innerRef}
      className={`projects-row${isHighlighted ? ' when-highlighted' : ''}`}
      onClick={onClick}
      data-testid={`projects-card-${project.id}`}
    >
      {/* Colored dot */}
      <div
        className="projects-row-dot"
        style={{ background: `hsl(${project.folderColor ?? 200}, 55%, 50%)` }}
      />
      {/* Project name */}
      <span className="projects-row-name">
        {project.name}
      </span>
      {/* Badges */}
      {isSample && (
        <span className="projects-row-badge-sample">
          <Eye className="projects-row-badge-sample-icon" />
          Read-only
        </span>
      )}
      {isPublished && (
        <Globe className="projects-row-published-icon" />
      )}
      <span className="projects-row-stats">
        {tokenCount > 0 && `${tokenCount} tokens`}
        {tokenCount > 0 && nodeCount > 0 && ' \u00b7 '}
        {nodeCount > 0 && `${nodeCount} nodes`}
      </span>
      {/* Menu */}
      {!isSample && (
        <div className="projects-row-menu-wrapper" ref={menuRef} onClick={e => e.stopPropagation()}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="projects-row-menu-trigger"
            data-testid={`projects-card-menu-${project.id}`}
          >
            <MoreHorizontal className="projects-row-menu-trigger-icon" />
          </button>
          {menuOpen && (
            <div className="projects-row-menu-dropdown">
              <button className="projects-row-menu-item" onClick={(e) => { onExport(e); setMenuOpen(false); }} data-testid={`projects-card-export-${project.id}`}>
                <Download className="projects-row-menu-item-icon" /> Export
              </button>
              <button className="projects-row-menu-item" onClick={(e) => { onDuplicate(e); setMenuOpen(false); }} data-testid={`projects-card-duplicate-${project.id}`}>
                <Copy className="projects-row-menu-item-icon" /> Duplicate
              </button>
              <div className="projects-row-menu-divider" />
              <button className="projects-row-menu-item projects-row-menu-item-destructive" onClick={(e) => { onDelete(e); setMenuOpen(false); }} data-testid={`projects-card-delete-${project.id}`}>
                <Trash2 className="projects-row-menu-item-icon" /> Delete
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   ProfileSection
   ═══════════════════════════════════════════════════════════════ */

function ProfileSection({ userEmail, isAdmin, isAuthenticated }: { userEmail?: string; isAdmin?: boolean; isAuthenticated?: boolean }) {
  // Invite UI moved to the Admin section (Users tab) in Phase 8.
  return (
    <div className="projects-profile">
      <h1 className="projects-section-title">Profile</h1>
      <div className="projects-profile-card">
        <div className="projects-profile-row">
          <span className="projects-profile-label">Email</span>
          <span className="projects-profile-value">{userEmail || 'Not signed in'}</span>
        </div>
        {isAdmin && (
          <>
            <div className="projects-profile-divider" />
            <div className="projects-profile-row">
              <span className="projects-profile-label">Role</span>
              <span className="projects-profile-value">Admin</span>
            </div>
          </>
        )}
      </div>

      {isAuthenticated && <ActiveSessionsCard />}
    </div>
  );
}

function ActiveSessionsCard() {
  const [sessions, setSessions] = useState<AuthSession[] | null>(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError('');
    listSessions()
      .then((s) => { if (!cancelled) setSessions(s); })
      .catch((e) => { if (!cancelled) setError(e?.message || 'Failed to load sessions'); });
    return () => { cancelled = true; };
  }, [reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  async function onRevoke(id: string) {
    setBusyId(id);
    try {
      await revokeSession(id);
      reload();
    } catch (e: any) { setError(e?.message || 'Failed to revoke session'); }
    finally { setBusyId(null); }
  }

  async function onRevokeAll() {
    if (!window.confirm('Sign out of every other device and browser?')) return;
    setBusyId('all');
    try {
      await revokeAllOtherSessions();
      reload();
    } catch (e: any) { setError(e?.message || 'Failed to revoke sessions'); }
    finally { setBusyId(null); }
  }

  const others = sessions?.filter(s => !s.isCurrent) ?? [];

  return (
    <div className="projects-sessions-card" data-testid="profile-active-sessions">
      <div className="projects-sessions-header">
        <Monitor size={14} />
        <span>Active sessions</span>
        {others.length > 0 && (
          <button className="projects-sessions-revoke-all" onClick={onRevokeAll} disabled={busyId === 'all'}>
            Sign out everywhere else
          </button>
        )}
      </div>
      <p className="projects-sessions-hint">
        Each browser or device you sign in from creates a session. Sessions expire after 30 days of inactivity.
      </p>
      {error && <div className="projects-sessions-error">{error}</div>}
      {!sessions && !error && <div className="projects-sessions-loading">Loading…</div>}
      {sessions && sessions.length === 0 && <div className="projects-sessions-empty">No active sessions.</div>}
      {sessions && sessions.length > 0 && (
        <ul className="projects-sessions-list">
          {sessions.map((s) => (
            <li key={s.id} className="projects-sessions-row">
              <div className="projects-sessions-row-main">
                <div className="projects-sessions-row-ua">
                  {summarizeUserAgent(s.userAgent)}
                  {s.isCurrent && <span className="projects-sessions-row-current">This session</span>}
                </div>
                <div className="projects-sessions-row-meta">
                  Last active {formatRelative(s.lastSeenAt)} · started {new Date(s.createdAt).toLocaleDateString()}
                </div>
              </div>
              {!s.isCurrent && (
                <button
                  className="projects-sessions-row-revoke"
                  onClick={() => onRevoke(s.id)}
                  disabled={busyId === s.id}
                  data-testid={`profile-session-revoke-${s.id}`}
                >
                  {busyId === s.id ? 'Signing out…' : 'Sign out'}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function summarizeUserAgent(ua: string | null): string {
  if (!ua) return 'Unknown device';
  const browser =
    /Edg\//.test(ua) ? 'Edge' :
    /Chrome\//.test(ua) ? 'Chrome' :
    /Firefox\//.test(ua) ? 'Firefox' :
    /Safari\//.test(ua) ? 'Safari' :
    'Browser';
  const os =
    /Windows/.test(ua) ? 'Windows' :
    /Mac OS X|Macintosh/.test(ua) ? 'macOS' :
    /Linux/.test(ua) ? 'Linux' :
    /iPhone|iPad/.test(ua) ? 'iOS' :
    /Android/.test(ua) ? 'Android' :
    'Unknown';
  return `${browser} on ${os}`;
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function InviteUserCard() {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [makeAdmin, setMakeAdmin] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [inviteUrl, setInviteUrl] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [copied, setCopied] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setInviteUrl('');
    setSubmitting(true);
    try {
      const res = await createInvite({ email: email.trim(), name: name.trim(), isAdmin: makeAdmin });
      setInviteUrl(`${window.location.origin}/accept-invite/${res.inviteToken}`);
      setExpiresAt(res.expiresAt);
      setEmail('');
      setName('');
      setMakeAdmin(false);
    } catch (err: any) {
      setError(err?.message || 'Failed to send invite');
    } finally {
      setSubmitting(false);
    }
  }

  async function copyInviteUrl() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore — older browsers / non-secure contexts
    }
  }

  return (
    <div className="projects-invite-card" data-testid="invite-user-card">
      <div className="projects-invite-header">
        <UserPlus size={14} />
        <span>Invite a user</span>
      </div>
      <p className="projects-invite-hint">
        Share the generated link with someone you want to add. They'll set their own password
        on first use. Invites expire after 7 days.
      </p>

      <form onSubmit={onSubmit} className="projects-invite-form">
        <input
          type="email"
          className="projects-invite-input"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="text"
          className="projects-invite-input"
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <label className="projects-invite-admin-toggle">
          <input
            type="checkbox"
            checked={makeAdmin}
            onChange={(e) => setMakeAdmin(e.target.checked)}
          />
          <span>Grant admin role</span>
        </label>
        {error && <div className="projects-invite-error">{error}</div>}
        <button
          type="submit"
          className="projects-invite-submit"
          disabled={submitting || !email || !name}
          data-testid="invite-user-submit"
        >
          {submitting ? 'Creating invite…' : 'Create invite'}
        </button>
      </form>

      {inviteUrl && (
        <div className="projects-invite-result" data-testid="invite-user-result">
          <div className="projects-invite-result-label">
            Invite link {expiresAt && <span className="projects-invite-result-expiry">· expires {new Date(expiresAt).toLocaleDateString()}</span>}
          </div>
          <div className="projects-invite-result-row">
            <code className="projects-invite-url">{inviteUrl}</code>
            <button
              type="button"
              className="projects-invite-copy"
              onClick={copyInviteUrl}
              aria-label="Copy invite link"
            >
              {copied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   ProjectList — replaces folder grid
   ═══════════════════════════════════════════════════════════════ */

function ProjectList({
  projects,
  projectStats,
  templateProjects,
  cloudSectionProjects,
  cloudProjects,
  localProjects,
  highlightedProjectId,
  isAuthenticated,
  isAdmin,
  isTemplateAdmin,
  canCreateCloudProject,
  cloudSyncStatus,
  publishedProjectIds,
  projectRefs,
  onSelectProject,
  onCreateProject,
  onImportProject,
  onExportProject,
  onDuplicateProject,
  onDeleteClick,
  onForceCloudRefresh,
  sampleProjects,
  sampleTemplates,
  onSelectSampleProject,
  starredTemplateId,
  onStarTemplate,
}: {
  projects: Project[];
  projectStats: Map<string, { tokenCount: number; nodeCount: number }>;
  templateProjects: Project[];
  cloudSectionProjects: Project[];
  cloudProjects: Project[];
  localProjects: Project[];
  highlightedProjectId: string | null;
  isAuthenticated?: boolean;
  isAdmin?: boolean;
  isTemplateAdmin?: boolean;
  canCreateCloudProject: boolean;
  cloudSyncStatus?: string;
  publishedProjectIds?: Set<string>;
  projectRefs: React.MutableRefObject<Map<string, HTMLDivElement>>;
  onSelectProject: (projectId: string) => void;
  onCreateProject: (type: 'cloud' | 'template') => void;
  onImportProject: () => void;
  onExportProject: (projectId: string) => void;
  onDuplicateProject: (projectId: string) => void;
  onDeleteClick: (projectId: string, e: React.MouseEvent) => void;
  onForceCloudRefresh?: () => void;
  sampleProjects: Project[];
  sampleTemplates?: Array<{ id: string; name: string; description: string; folderColor?: number; nodes?: any[]; _origIdx?: number }>;
  onSelectSampleProject?: (templateIdx: number) => void;
  starredTemplateId?: string | null;
  onStarTemplate?: (projectId: string) => void;
}) {
  const renderSection = (
    label: string,
    projectList: Project[],
    createType: 'cloud' | 'template',
    showCreate: boolean,
    createLabel: string = 'New project',
  ) => {
    if (projectList.length === 0 && !showCreate) return null;
    return (
      <div className="projects-section">
        <div className="projects-section-header">
          <div className="projects-section-header-left">
            <span className="projects-section-label">{label}</span>
            <span className="projects-section-count">{projectList.length}</span>
          </div>
          {showCreate && (
            <button
              onClick={() => onCreateProject(createType)}
              className="projects-section-create-btn"
              data-testid={
                createType === 'template'
                  ? 'projects-create-template'
                  : createType === 'cloud'
                    ? 'projects-create-cloud'
                    : 'projects-create-local'
              }
            >
              <Plus className="projects-section-create-icon" />
              {createLabel}
            </button>
          )}
        </div>
        {projectList.length === 0 ? (
          <div className="projects-section-empty">
            <div className="projects-section-empty-text">
              No projects yet
            </div>
          </div>
        ) : (
          <div>
            {projectList.map(p => {
              const stats = projectStats.get(p.id) || { tokenCount: 0, nodeCount: 0 };
              const isTemplateRow = createType === 'template';
              return (
                <ProjectRow
                  key={p.id}
                  project={p}
                  tokenCount={stats.tokenCount}
                  nodeCount={stats.nodeCount}
                  isHighlighted={highlightedProjectId === p.id}
                  isPublished={publishedProjectIds?.has(p.id)}
                  onClick={() => onSelectProject(p.id)}
                  onExport={(e) => { e.stopPropagation(); onExportProject(p.id); }}
                  onDuplicate={(e) => { e.stopPropagation(); onDuplicateProject(p.id); }}
                  onDelete={(e) => onDeleteClick(p.id, e)}
                  isStarred={isTemplateRow ? starredTemplateId === p.id : undefined}
                  onStar={isTemplateRow && onStarTemplate ? () => onStarTemplate(p.id) : undefined}
                  innerRef={(el) => {
                    if (el) projectRefs.current.set(p.id, el);
                    else projectRefs.current.delete(p.id);
                  }}
                />
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const isLoading = cloudSyncStatus === 'syncing' || cloudSyncStatus === 'loading';

  const renderSkeleton = (count = 3) => (
    <div className="projects-section-skeleton">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="projects-row-skeleton">
          <div className="projects-row-skeleton-dot" />
          <div className="projects-row-skeleton-text" />
          <div className="projects-row-skeleton-stats" />
        </div>
      ))}
    </div>
  );

  return (
    <div className="projects-list" data-testid="projects-list-container">
      <div className="projects-list-header">
        <h1 className="projects-list-title">Projects</h1>
        <div className="projects-list-actions">
          <button onClick={onImportProject} className="projects-import-btn" data-testid="projects-import-button">
            <Upload className="projects-import-btn-icon" />
            Import
          </button>
        </div>
      </div>

      {/* Projects section (authenticated) */}
      {isAuthenticated && (
        cloudSectionProjects.length > 0 || !!canCreateCloudProject ? renderSection(
          'Projects',
          cloudSectionProjects,
          'cloud',
          !!canCreateCloudProject,
          'New project',
        ) : (
          <div className="projects-section">
            <div className="projects-section-header">
              <div className="projects-section-header-left">
                <span className="projects-section-label">Projects</span>
              </div>
            </div>
            {renderSkeleton(2)}
          </div>
        )
      )}

      {/* Sample Projects section removed in Phase 7 — self-host has no curated
          template marketplace, so the section header + skeleton loaders that
          used to live here are gone. */}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Projects Page — Linear-style sidebar + main content
   ═══════════════════════════════════════════════════════════════ */

export function ProjectsPage({
  projects,
  allNodes,
  tokens,
  collections,
  groups,
  onSelectProject,
  onCreateProject,
  onDuplicateProject,
  onDeleteProject,
  onImportProject,
  onExportProject,
  highlightedProjectId,
  isAuthenticated,
  isAdmin,
  isTemplateAdmin,
  userEmail,
  onSignOut,
  onSignIn,
  cloudSyncStatus,
  onForceCloudRefresh,
  publishedProjectIds,
  activeSection = 'projects',
  onSectionChange,
  onAISettingsSaved,
  aiProjectContext,
  onOpenCommunityProject,
  onRemixCommunityProject,
  sampleTemplates,
  onSelectSampleProject,
  starredTemplateId,
  onStarTemplate,
  currentUserId,
}: ProjectsPageProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<string | null>(null);
  const projectRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const [attributionEnabled, setAttributionEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    getPublicSettings()
      .then((s) => { if (!cancelled) setAttributionEnabled(s.attributionEnabled); })
      .catch(() => { if (!cancelled) setAttributionEnabled(true); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (highlightedProjectId) {
      const element = projectRefs.current.get(highlightedProjectId);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [highlightedProjectId]);

  const handleDeleteClick = (projectId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setProjectToDelete(projectId);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (projectToDelete) {
      onDeleteProject(projectToDelete);
      setProjectToDelete(null);
      setDeleteDialogOpen(false);
    }
  };

  const projectStats = useMemo(() => {
    const map = new Map<string, { tokenCount: number; nodeCount: number }>();
    projects.forEach((p) => {
      map.set(p.id, {
        tokenCount: tokens.filter((t) => t.projectId === p.id).length,
        nodeCount: allNodes.filter((n) => n.projectId === p.id).length,
      });
    });
    return map;
  }, [projects, tokens, allNodes]);

  // Split projects into template, cloud, sample, and local
  const templateProjects = useMemo(() => projects.filter(p => p.isTemplate), [projects]);
  // Regular projects = all non-template, non-sample projects
  const cloudProjects = useMemo(() => projects.filter(p => !p.isTemplate && !p.isSample), [projects]);
  const sampleProjects = useMemo(() => projects.filter(p => p.isSample), [projects]);
  // Local projects removed — all projects are cloud-backed
  const localProjects = useMemo(() => [] as Project[], []);
  // Cloud section shows only actual cloud projects (not samples)
  const cloudSectionProjects = useMemo(() => cloudProjects, [cloudProjects]);
  const canCreateCloudProject = isAuthenticated && (isAdmin || cloudProjects.length < 20);
  // Note: "Cloud Projects" label will be renamed to "Projects" in a future update

  return (
    <div className="projects-page" data-testid="page-projects">
      {/* Sidebar */}
      <div className="projects-sidebar" data-testid="projects-sidebar">
        {/* Logo area */}
        <div className="projects-sidebar-logo">
          <div className="projects-sidebar-logo-row">
            <h1 className="projects-sidebar-title">
              0<span className="projects-sidebar-title-faint">colors</span>
            </h1>
            {isAdmin && (
              <span
                className="projects-sidebar-admin-badge"
                style={{
                  background: 'color-mix(in srgb, var(--utility-knowledge) 10%, transparent)',
                  color: 'var(--utility-knowledge)',
                  border: '1px solid color-mix(in srgb, var(--utility-knowledge) 20%, transparent)',
                }}
              >
                Admin
              </span>
            )}
          </div>
          <p className="projects-sidebar-subtitle">
            {projects.length} projects
            {userEmail && <span className="projects-sidebar-subtitle-ghost"> &middot; {userEmail}</span>}
          </p>
        </div>

        {/* Navigation */}
        <nav className="projects-sidebar-nav">
          <NavItem icon={Folder} label="Projects" active={activeSection === 'projects'} onClick={() => onSectionChange?.('projects')} testId="projects-nav-projects" />
          <NavItem icon={Globe} label="Community" active={activeSection === 'community'} onClick={() => onSectionChange?.('community')} testId="projects-nav-community" />

          <div className="projects-sidebar-divider" />

          {isAuthenticated && (
            <NavItem icon={Sparkles} label="AI Settings" active={activeSection === 'ai-settings'} onClick={() => onSectionChange?.('ai-settings')} testId="projects-nav-ai-settings" />
          )}
          {isAuthenticated && (
            <NavItem icon={User} label="Profile" active={activeSection === 'profile'} onClick={() => onSectionChange?.('profile')} testId="projects-nav-profile" />
          )}

          {isAdmin && (
            <>
              <div className="projects-sidebar-divider" />
              <NavItem
                icon={SettingsIcon}
                label="Admin"
                active={activeSection === 'admin'}
                onClick={() => onSectionChange?.('admin')}
                testId="projects-nav-admin"
              />
            </>
          )}

          {isAdmin && import.meta.env.DEV && (
            <NavItem
              icon={FlaskConical}
              label="QA hub"
              active={activeSection === 'qa-hub'}
              onClick={() => onSectionChange?.('qa-hub')}
              testId="projects-nav-qa-hub"
            />
          )}
        </nav>

        {/* Bottom */}
        <div className="projects-sidebar-bottom">
          {isAuthenticated && onSignOut ? (
            <button onClick={onSignOut} className="projects-sidebar-auth-btn" data-testid="projects-auth-signout-button">
              <LogOut className="projects-sidebar-auth-btn-icon" />
              Sign out
            </button>
          ) : !isAuthenticated && onSignIn ? (
            <button onClick={onSignIn} className="projects-sidebar-auth-btn projects-sidebar-auth-btn-signin" data-testid="projects-auth-signin-button">
              <LogIn className="projects-sidebar-auth-btn-icon" />
              Sign in
            </button>
          ) : null}
          {attributionEnabled && (
            <a
              href="https://github.com/Withso/0colors"
              target="_blank"
              rel="noopener noreferrer"
              className="projects-sidebar-attribution"
              data-testid="projects-powered-by"
            >
              Powered by 0colors
            </a>
          )}
        </div>
      </div>

      {/* Main Content */}
      <main className="projects-main" data-testid="projects-main-content">
        {activeSection === 'projects' && (
          <ProjectList
            projects={projects}
            projectStats={projectStats}
            templateProjects={templateProjects}
            cloudSectionProjects={cloudSectionProjects}
            cloudProjects={cloudProjects}
            localProjects={localProjects}
            highlightedProjectId={highlightedProjectId}
            isAuthenticated={isAuthenticated}
            isAdmin={isAdmin}
            isTemplateAdmin={isTemplateAdmin}
            canCreateCloudProject={!!canCreateCloudProject}
            cloudSyncStatus={cloudSyncStatus}
            publishedProjectIds={publishedProjectIds}
            projectRefs={projectRefs}
            onSelectProject={onSelectProject}
            onCreateProject={onCreateProject}
            onImportProject={onImportProject}
            onExportProject={onExportProject}
            onDuplicateProject={onDuplicateProject}
            onDeleteClick={handleDeleteClick}
            onForceCloudRefresh={onForceCloudRefresh}
            sampleProjects={sampleProjects}
            sampleTemplates={sampleTemplates}
            onSelectSampleProject={onSelectSampleProject}
            starredTemplateId={starredTemplateId}
            onStarTemplate={onStarTemplate}
          />
        )}
        {activeSection === 'community' && onOpenCommunityProject && onRemixCommunityProject && (
          <CommunityPage
            inline
            onOpenProject={onOpenCommunityProject}
            onRemixProject={onRemixCommunityProject}
          />
        )}
        {activeSection === 'ai-settings' && (
          <div className="projects-ai-settings-wrapper">
            <div className="projects-ai-settings-inner">
              <h1 className="projects-section-title">AI Settings</h1>
              <AISettingsContent
                inline
                onSettingsSaved={onAISettingsSaved}
                projectContext={aiProjectContext}
              />
            </div>
          </div>
        )}
        {activeSection === 'profile' && (
          <ProfileSection
            userEmail={userEmail}
            isAdmin={isAdmin}
            isAuthenticated={isAuthenticated}
          />
        )}
        {activeSection === 'admin' && isAdmin && currentUserId && (
          <Suspense fallback={<div className="projects-section-text">Loading admin…</div>}>
            <AdminSection currentUserId={currentUserId} />
          </Suspense>
        )}
        {activeSection === 'qa-hub' && isAdmin && import.meta.env.DEV && (
          <Suspense fallback={<div className="projects-section-text">Loading QA hub...</div>}>
            <AdminQaDashboard />
          </Suspense>
        )}
      </main>

      {/* Delete dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="projects-delete-dialog" data-testid="projects-delete-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Project</AlertDialogTitle>
            <AlertDialogDescription className="projects-delete-dialog-description">
              Are you sure you want to delete this project? This action cannot be undone.
              All nodes and tokens in this project will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="projects-delete-dialog-cancel" data-testid="projects-delete-dialog-cancel">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="projects-delete-dialog-confirm"
              data-testid="projects-delete-dialog-confirm"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
