import { useState, useEffect, useRef, useMemo } from 'react';
import { Plus, Upload, MoreHorizontal, Download, Copy, Trash2, LogOut, RefreshCw, Sparkles, Eye, LogIn, Globe, Folder, User } from 'lucide-react';
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

type DashboardSection = 'projects' | 'community' | 'ai-settings' | 'profile';

interface ProjectsPageProps {
  projects: Project[];
  allNodes: ColorNode[];
  tokens: DesignToken[];
  collections: TokenCollection[];
  groups: TokenGroup[];
  onSelectProject: (projectId: string) => void;
  onCreateProject: (type: 'local' | 'cloud' | 'template') => void;
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
}

/* ═══════════════════════════════════════════════════════════════
   NavItem — sidebar navigation item
   ═══════════════════════════════════════════════════════════════ */

function NavItem({ icon: Icon, label, active, onClick }: {
  icon: any; label: string; active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 h-8 px-3 rounded-md text-[13px] transition-colors cursor-pointer ${
        active
          ? 'bg-[#ffffff]/[0.06] text-foreground'
          : 'text-subtle hover:bg-[#ffffff]/[0.04] hover:text-foreground'
      }`}
    >
      <Icon className="h-4 w-4" />
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
      className={`flex items-center h-10 px-3 hover:bg-[#ffffff]/[0.03] cursor-pointer transition-colors border-b border-[#ffffff]/[0.04] last:border-b-0 ${
        isHighlighted ? 'bg-[#ffffff]/[0.06]' : ''
      }`}
      onClick={onClick}
    >
      {/* Colored dot */}
      <div
        className="w-2.5 h-2.5 rounded-full mr-3 flex-shrink-0"
        style={{ background: `hsl(${project.folderColor ?? 200}, 55%, 50%)` }}
      />
      {/* Project name */}
      <span className="text-[13px] font-medium text-foreground truncate flex-1">
        {project.name}
      </span>
      {/* Badges */}
      {isSample && (
        <span className="text-[11px] text-dim mr-3 flex items-center gap-1">
          <Eye className="h-3 w-3" />
          Read-only
        </span>
      )}
      {isPublished && (
        <Globe className="h-3 w-3 text-dim mr-2" />
      )}
      <span className="text-[12px] text-ghost mr-3 tabular-nums">
        {tokenCount > 0 && `${tokenCount} tokens`}
        {tokenCount > 0 && nodeCount > 0 && ' \u00b7 '}
        {nodeCount > 0 && `${nodeCount} nodes`}
      </span>
      {/* Menu */}
      {!isSample && (
        <div className="relative" ref={menuRef} onClick={e => e.stopPropagation()}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="h-7 w-7 rounded-md flex items-center justify-center text-ghost hover:text-foreground hover:bg-[#ffffff]/[0.06] transition-colors"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 w-[160px] rounded-lg bg-card border border-[#ffffff]/[0.06] shadow-lg py-1 z-50">
              <button className="flex items-center gap-2.5 w-full px-3 py-1.5 text-left text-[13px] text-foreground hover:bg-[#ffffff]/[0.06] transition-colors" onClick={(e) => { onExport(e); setMenuOpen(false); }}>
                <Download className="h-3.5 w-3.5 text-dim" /> Export
              </button>
              <button className="flex items-center gap-2.5 w-full px-3 py-1.5 text-left text-[13px] text-foreground hover:bg-[#ffffff]/[0.06] transition-colors" onClick={(e) => { onDuplicate(e); setMenuOpen(false); }}>
                <Copy className="h-3.5 w-3.5 text-dim" /> Duplicate
              </button>
              <div className="my-1 border-t border-[#ffffff]/[0.04]" />
              <button className="flex items-center gap-2.5 w-full px-3 py-1.5 text-left text-[13px] text-destructive hover:bg-destructive/10 transition-colors" onClick={(e) => { onDelete(e); setMenuOpen(false); }}>
                <Trash2 className="h-3.5 w-3.5" /> Delete
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

function ProfileSection({ userEmail, isAdmin, isTemplateAdmin }: { userEmail?: string; isAdmin?: boolean; isTemplateAdmin?: boolean }) {
  return (
    <div className="max-w-[680px] mx-auto px-8 py-8">
      <h1 className="text-[20px] font-semibold text-foreground mb-6">Profile</h1>
      <div className="rounded-lg border border-[#ffffff]/[0.06] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5">
          <span className="text-[13px] text-subtle">Email</span>
          <span className="text-[13px] text-foreground">{userEmail || 'Not signed in'}</span>
        </div>
        {isAdmin && (
          <>
            <div className="border-t border-[#ffffff]/[0.04]" />
            <div className="flex items-center justify-between px-5 py-3.5">
              <span className="text-[13px] text-subtle">Role</span>
              <span className="text-[13px] text-foreground">Admin{isTemplateAdmin ? ' + Template Admin' : ''}</span>
            </div>
          </>
        )}
      </div>
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
  onCreateProject: (type: 'local' | 'cloud' | 'template') => void;
  onImportProject: () => void;
  onExportProject: (projectId: string) => void;
  onDuplicateProject: (projectId: string) => void;
  onDeleteClick: (projectId: string, e: React.MouseEvent) => void;
  onForceCloudRefresh?: () => void;
  sampleProjects: Project[];
}) {
  const renderSection = (
    label: string,
    projectList: Project[],
    createType: 'local' | 'cloud' | 'template',
    showCreate: boolean,
    createLabel: string = 'New project',
  ) => {
    if (projectList.length === 0 && !showCreate) return null;
    return (
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2 px-1">
          <div className="flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-wider text-dim font-medium">{label}</span>
            <span className="text-[11px] text-ghost">{projectList.length}</span>
            {label.toLowerCase().includes('cloud') && cloudSyncStatus === 'syncing' && (
              <span className="text-[11px] text-brand animate-pulse">Syncing...</span>
            )}
            {label.toLowerCase().includes('cloud') && onForceCloudRefresh && (
              <button
                onClick={onForceCloudRefresh}
                className="text-[11px] text-ghost hover:text-brand flex items-center gap-1 transition-colors ml-1"
                title="Force re-download all cloud projects from server"
              >
                <RefreshCw className="w-3 h-3" />
              </button>
            )}
          </div>
          {showCreate && (
            <button onClick={() => onCreateProject(createType)} className="h-7 px-2.5 rounded-md text-[12px] text-dim hover:text-foreground hover:bg-[#ffffff]/[0.04] transition-colors flex items-center gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              {createLabel}
            </button>
          )}
        </div>
        {projectList.length === 0 ? (
          <div className="rounded-lg overflow-hidden" style={{ border: '1px dashed rgba(255,255,255,0.06)' }}>
            <div className="flex items-center justify-center py-8 text-[13px] text-ghost">
              No projects yet
            </div>
          </div>
        ) : (
          <div>
            {projectList.map(p => {
              const stats = projectStats.get(p.id) || { tokenCount: 0, nodeCount: 0 };
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

  return (
    <div className="max-w-[800px] mx-auto px-8 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-[20px] font-semibold text-foreground">Projects</h1>
        <div className="flex items-center gap-2">
          <button onClick={onImportProject} className="h-8 px-3 rounded-md text-[13px] text-subtle hover:text-foreground hover:bg-[#ffffff]/[0.04] transition-colors flex items-center gap-2">
            <Upload className="h-3.5 w-3.5" />
            Import
          </button>
        </div>
      </div>

      {/* Templates section (if template admin) */}
      {isAuthenticated && isTemplateAdmin && renderSection(
        'Templates',
        templateProjects,
        'template',
        true,
        'New template',
      )}

      {/* Cloud section (authenticated) */}
      {isAuthenticated && renderSection(
        'Cloud Projects',
        cloudSectionProjects,
        'cloud',
        !!canCreateCloudProject,
        'New cloud project',
      )}

      {/* Cloud section for unauthenticated — show sample projects */}
      {!isAuthenticated && sampleProjects.length > 0 && renderSection(
        'Cloud Projects',
        sampleProjects,
        'cloud',
        false,
      )}

      {/* Local section */}
      {renderSection(
        'Local Projects',
        localProjects,
        'local',
        true,
        'New local project',
      )}
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
}: ProjectsPageProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<string | null>(null);
  const projectRefs = useRef<Map<string, HTMLDivElement>>(new Map());

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
  const cloudProjects = useMemo(() => projects.filter(p => p.isCloud && !p.isTemplate), [projects]);
  const sampleProjects = useMemo(() => projects.filter(p => p.isSample), [projects]);
  const localProjects = useMemo(() => projects.filter(p => !p.isCloud && !p.isTemplate && !p.isSample), [projects]);
  // Combine sample + cloud projects for display (sample first)
  const cloudSectionProjects = useMemo(() => [...sampleProjects, ...cloudProjects], [sampleProjects, cloudProjects]);
  const canCreateCloudProject = isAuthenticated && (isAdmin || cloudProjects.length < 20);

  return (
    <div className="h-screen flex bg-background">
      {/* Sidebar */}
      <div className="w-[220px] flex-shrink-0 flex flex-col bg-[#0a0a0a] border-r border-[#ffffff]/[0.06]">
        {/* Logo area */}
        <div className="px-4 pt-5 pb-4">
          <div className="flex items-center gap-2.5">
            <h1 className="text-[14px] font-semibold text-foreground">
              0<span className="text-faint">colors</span>
            </h1>
            {isAdmin && (
              <span
                className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
                style={{
                  background: 'rgba(168, 130, 255, 0.1)',
                  color: '#a882ff',
                  border: '1px solid rgba(168, 130, 255, 0.2)',
                  letterSpacing: '0.06em',
                }}
              >
                Admin
              </span>
            )}
          </div>
          <p className="text-[11px] text-dim mt-0.5">
            {projects.length} projects
            {userEmail && <span className="text-ghost"> &middot; {userEmail}</span>}
          </p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-2 py-1">
          <NavItem icon={Folder} label="Projects" active={activeSection === 'projects'} onClick={() => onSectionChange?.('projects')} />
          <NavItem icon={Globe} label="Community" active={activeSection === 'community'} onClick={() => onSectionChange?.('community')} />

          <div className="my-2 mx-2 border-t border-[#ffffff]/[0.04]" />

          {isAuthenticated && (
            <NavItem icon={Sparkles} label="AI Settings" active={activeSection === 'ai-settings'} onClick={() => onSectionChange?.('ai-settings')} />
          )}
          {isAuthenticated && (
            <NavItem icon={User} label="Profile" active={activeSection === 'profile'} onClick={() => onSectionChange?.('profile')} />
          )}
        </nav>

        {/* Bottom */}
        <div className="px-2 pb-3">
          {isAuthenticated && onSignOut ? (
            <button onClick={onSignOut} className="w-full flex items-center gap-2.5 h-8 px-3 rounded-md text-[13px] text-dim hover:text-foreground hover:bg-[#ffffff]/[0.04] transition-colors">
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          ) : !isAuthenticated && onSignIn ? (
            <button onClick={onSignIn} className="w-full flex items-center gap-2.5 h-8 px-3 rounded-md text-[13px] text-brand hover:bg-[#ffffff]/[0.04] transition-colors">
              <LogIn className="h-4 w-4" />
              Sign in
            </button>
          ) : null}
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
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
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-[680px] mx-auto px-8 py-8">
              <h1 className="text-[20px] font-semibold text-foreground mb-6">AI Settings</h1>
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
            isTemplateAdmin={isTemplateAdmin}
          />
        )}
      </main>

      {/* Delete dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="bg-card text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Project</AlertDialogTitle>
            <AlertDialogDescription className="text-[#878787]">
              Are you sure you want to delete this project? This action cannot be undone.
              All nodes and tokens in this project will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-secondary hover:bg-[#222] text-white">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-[#EA0B2D] hover:bg-[#C00924] text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
