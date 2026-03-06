import { useState, useEffect, useRef, useMemo } from 'react';
import { Plus, Upload, MoreHorizontal, Download, Copy, Trash2, Cloud, HardDrive, LogOut, LayoutTemplate, RefreshCw, Sparkles } from 'lucide-react';
import { Button } from './ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';

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
  cloudSyncStatus?: string;
  onForceCloudRefresh?: () => void;
  onOpenAISettings?: () => void;
}

/* ═══════════════════════════════════════════════════════════════
   Color helpers
   ═══════════════════════════════════════════════════════════════ */

function getTextColors(hue: number) {
  const isYellow = hue >= 40 && hue <= 70;
  if (isYellow) {
    return {
      primary: 'rgba(0,0,0,0.88)',
      secondary: 'rgba(0,0,0,0.58)',
      badge: 'rgba(0,0,0,0.55)',
      menuBtn: 'rgba(0,0,0,0.12)',
      menuIcon: 'rgba(0,0,0,0.55)',
      menuBorder: 'rgba(0,0,0,0.12)',
      isYellow: true,
    };
  }
  return {
    primary: '#fff',
    secondary: 'rgba(255,255,255,0.72)',
    badge: 'rgba(255,255,255,0.65)',
    menuBtn: 'rgba(255,255,255,0.18)',
    menuIcon: 'rgba(255,255,255,0.75)',
    menuBorder: 'rgba(255,255,255,0.15)',
    isYellow: false,
  };
}

/* ═══════════════════════════════════════════════════════════════
   Folder Card Component
   ═══════════════════════════════════════════════════════════════ */

function FolderCard({
  project,
  tokenCount,
  nodeCount,
  isHighlighted,
  onClick,
  onExport,
  onDuplicate,
  onDelete,
  innerRef,
}: {
  project: Project;
  tokenCount: number;
  nodeCount: number;
  isHighlighted: boolean;
  onClick: () => void;
  onExport: (e: React.MouseEvent) => void;
  onDuplicate: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
  innerRef: (el: HTMLDivElement | null) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const hue = project.folderColor ?? 145;
  const tc = getTextColors(hue);

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

  const detailText = tokenCount > 0
    ? `${tokenCount} token${tokenCount !== 1 ? 's' : ''}`
    : nodeCount > 0
      ? `${nodeCount} node${nodeCount !== 1 ? 's' : ''}`
      : 'Empty project';

  // ── Derived palette ──
  const backDark    = `hsl(${hue}, 42%, 22%)`;
  const backMid     = `hsl(${hue}, 40%, 18%)`;
  const frontTop    = `hsla(${hue}, 58%, 52%, 0.82)`;
  const frontBot    = `hsla(${hue}, 48%, 38%, 0.88)`;
  const glassEdge   = `hsla(${hue}, 60%, 82%, 0.55)`;
  const glassBorder = `hsla(${hue}, 45%, 68%, 0.30)`;
  const badgeBg     = `hsla(${hue}, 30%, 88%, 0.18)`;
  const badgeBorder = `hsla(${hue}, 35%, 76%, 0.22)`;

  // Unique gradient id to avoid SVG conflicts when multiple cards render
  const gradId = `bg-${hue}-${project.id.slice(-6)}`;

  const folderPath = [
    'M 0 12',
    'C 0 5, 5 0, 12 0',
    'L 88 0',
    'C 96 0, 100 3, 102 8',
    'L 108 17',
    'C 111 21, 116 24, 124 24',
    'L 228 24',
    'C 235 24, 240 29, 240 36',
    'L 240 188',
    'C 240 195, 235 200, 228 200',
    'L 12 200',
    'C 5 200, 0 195, 0 188',
    'L 0 12',
    'Z',
  ].join(' ');

  return (
    <div
      ref={innerRef}
      className={`group relative cursor-pointer transition-all duration-300 ease-out select-none ${
        isHighlighted ? 'scale-[1.04]' : 'hover:scale-[1.03] hover:-translate-y-1'
      }`}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* ── Ambient glow ── */}
      <div
        className="absolute -inset-4 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse at 50% 65%, hsla(${hue}, 35%, 30%, 0.12) 0%, transparent 55%)`,
          opacity: isHighlighted ? 0.7 : isHovered ? 0.4 : 0,
          transition: 'opacity 0.5s ease-out',
        }}
      />

      {/* ── Card wrapper (fixed size) ── */}
      <div className="relative" style={{ width: '100%', aspectRatio: '1.35 / 1', perspective: '600px' }}>
        {/* ── SVG BACK PANEL ── */}
        <svg
          viewBox="0 0 240 200"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="absolute inset-0 w-full h-full"
          preserveAspectRatio="xMidYMid meet"
          style={{ filter: `drop-shadow(0 6px 20px hsla(${hue}, 50%, 12%, 0.6))` }}
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={backDark} />
              <stop offset="100%" stopColor={backMid} />
            </linearGradient>
          </defs>
          <path d={folderPath} fill={`url(#${gradId})`} />
        </svg>

        {/* ── WHITE DOCUMENT CARD ── */}
        <div
          className="absolute pointer-events-none"
          style={{
            top: '14%',
            left: '4%',
            right: '4%',
            height: '75%',
            borderRadius: '8px 8px 6px 6px',
            background: 'linear-gradient(180deg, #f5f5f7 0%, #eaeaec 4%, #e8e8ea 100%)',
            boxShadow: isHovered
              ? '0 -2px 12px rgba(0,0,0,0.15), 0 1px 3px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.9)'
              : 'none',
            opacity: isHovered ? 1 : 0,
            transform: isHovered ? 'translateY(-18%)' : 'translateY(0%)',
            transition: 'opacity 0.4s cubic-bezier(0.23, 1, 0.32, 1), transform 0.5s cubic-bezier(0.23, 1, 0.32, 1), box-shadow 0.4s ease',
            zIndex: 1,
          }}
        >
          <div className="px-[10%] pt-[4%] flex flex-col gap-[4px]">
            <div style={{ height: '3px', width: '65%', borderRadius: '2px', background: 'rgba(0,0,0,0.13)' }} />
            <div style={{ height: '3px', width: '42%', borderRadius: '2px', background: 'rgba(0,0,0,0.08)' }} />
            <div style={{ height: '3px', width: '55%', borderRadius: '2px', background: 'rgba(0,0,0,0.06)' }} />
          </div>
        </div>

        {/* ── FRONT PANEL (glassmorphism) ── */}
        <div
          className="absolute overflow-hidden"
          style={{
            top: '14%',
            left: '0%',
            right: '0%',
            bottom: '0%',
            borderRadius: '12px',
            background: `linear-gradient(178deg, ${frontTop} 0%, ${frontBot} 100%)`,
            backdropFilter: 'blur(28px) saturate(1.6)',
            WebkitBackdropFilter: 'blur(28px) saturate(1.6)',
            border: `1px solid ${glassBorder}`,
            boxShadow: isHovered
              ? `inset 0 1px 0 0 ${glassEdge}, inset 0 -12px 28px -8px hsla(${hue}, 38%, 14%, 0.35), 0 12px 32px -4px hsla(${hue}, 40%, 8%, 0.55), 0 4px 12px -2px rgba(0,0,0,0.3)`
              : `inset 0 1px 0 0 ${glassEdge}, inset 0 -12px 28px -8px hsla(${hue}, 38%, 14%, 0.35)`,
            transformOrigin: 'bottom center',
            transform: isHovered ? 'rotateX(-14deg)' : 'rotateX(0deg)',
            transition: 'transform 0.5s cubic-bezier(0.23, 1, 0.32, 1), box-shadow 0.5s cubic-bezier(0.23, 1, 0.32, 1)',
            zIndex: 2,
          }}
        >
          {/* ── Top bright edge ── */}
          <div
            className="absolute top-0 left-0 right-0 pointer-events-none"
            style={{
              height: '2px',
              background: `linear-gradient(90deg, transparent 0%, ${glassEdge} 15%, hsla(${hue}, 70%, 92%, 0.7) 50%, ${glassEdge} 85%, transparent 100%)`,
            }}
          />

          {/* ── Radial highlight ── */}
          <div
            className="absolute pointer-events-none"
            style={{
              top: '-30%', left: '-15%', width: '80%', height: '70%',
              background: `radial-gradient(ellipse at 40% 60%, hsla(${hue}, 55%, 75%, 0.28) 0%, transparent 65%)`,
            }}
          />

          {/* ── Subtle horizontal divider ── */}
          <div
            className="absolute left-[6%] right-[6%] pointer-events-none"
            style={{ top: '1px', height: '1px', background: `linear-gradient(90deg, transparent, hsla(${hue}, 50%, 90%, 0.15), transparent)` }}
          />

          {/* ── Content ── */}
          <div className="relative z-10 flex flex-col justify-between h-full px-[12%] py-[8%]">
            {/* Top row */}
            <div className="flex items-start justify-between gap-1.5">
              <div className="flex-1 min-w-0">
                <h3
                  className="truncate"
                  style={{ color: tc.primary, fontSize: '14px', letterSpacing: '-0.01em', textShadow: tc.isYellow ? 'none' : '0 1px 4px rgba(0,0,0,0.35)' }}
                  title={project.name}
                >
                  {project.name}
                </h3>
                <p
                  className="mt-0.5 truncate"
                  style={{ color: tc.secondary, fontSize: '11px', textShadow: tc.isYellow ? 'none' : '0 1px 2px rgba(0,0,0,0.25)' }}
                >
                  {detailText}
                </p>
              </div>

              {/* ⋯ menu button */}
              <div className="relative flex-shrink-0" ref={menuRef}>
                <button
                  onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
                  className="flex items-center justify-center rounded-full transition-all duration-150"
                  style={{ width: '26px', height: '26px', background: tc.menuBtn, backdropFilter: 'blur(8px)', border: `1px solid ${tc.menuBorder}` }}
                >
                  <MoreHorizontal className="w-[14px] h-[14px]" style={{ color: tc.menuIcon }} />
                </button>

                {menuOpen && (
                  <div
                    className="absolute right-0 top-full mt-2 w-[156px] rounded-xl overflow-hidden z-50"
                    style={{ background: 'rgba(18,18,18,0.96)', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 16px 48px rgba(0,0,0,0.75)', backdropFilter: 'blur(20px)' }}
                  >
                    <button className="flex items-center gap-2.5 w-full px-4 py-2.5 text-left text-[13px] text-[#bbb] hover:bg-white/[0.06] transition-colors" onClick={(e) => { e.stopPropagation(); onExport(e); setMenuOpen(false); }}>
                      <Download className="w-3.5 h-3.5 opacity-50" /> Export
                    </button>
                    <button className="flex items-center gap-2.5 w-full px-4 py-2.5 text-left text-[13px] text-[#bbb] hover:bg-white/[0.06] transition-colors" onClick={(e) => { e.stopPropagation(); onDuplicate(e); setMenuOpen(false); }}>
                      <Copy className="w-3.5 h-3.5 opacity-50" /> Duplicate
                    </button>
                    <div className="mx-3 h-px bg-white/[0.06]" />
                    <button className="flex items-center gap-2.5 w-full px-4 py-2.5 text-left text-[13px] text-red-400 hover:bg-red-500/10 transition-colors" onClick={(e) => { e.stopPropagation(); onDelete(e); setMenuOpen(false); }}>
                      <Trash2 className="w-3.5 h-3.5 opacity-50" /> Delete
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Bottom stat badges */}
            <div className="flex items-center gap-1.5 flex-wrap mt-auto">
              {tokenCount > 0 && (
                <span className="inline-flex items-center rounded-full" style={{ padding: '2px 8px', fontSize: '10px', color: tc.badge, background: badgeBg, border: `1px solid ${badgeBorder}`, backdropFilter: 'blur(6px)', textShadow: tc.isYellow ? 'none' : '0 1px 1px rgba(0,0,0,0.18)' }}>
                  {tokenCount} token{tokenCount !== 1 ? 's' : ''}
                </span>
              )}
              {nodeCount > 0 && (
                <span className="inline-flex items-center rounded-full" style={{ padding: '2px 8px', fontSize: '10px', color: tc.badge, background: badgeBg, border: `1px solid ${badgeBorder}`, backdropFilter: 'blur(6px)', textShadow: tc.isYellow ? 'none' : '0 1px 1px rgba(0,0,0,0.18)' }}>
                  {nodeCount} node{nodeCount !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Projects Page
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
  cloudSyncStatus,
  onForceCloudRefresh,
  onOpenAISettings,
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

  // Split projects into template, cloud, and local
  const templateProjects = useMemo(() => projects.filter(p => p.isTemplate), [projects]);
  const cloudProjects = useMemo(() => projects.filter(p => p.isCloud && !p.isTemplate), [projects]);
  const localProjects = useMemo(() => projects.filter(p => !p.isCloud && !p.isTemplate), [projects]);
  const canCreateCloudProject = isAuthenticated && (isAdmin || cloudProjects.length < 2);

  const renderProjectGrid = (projectList: typeof projects) => (
    <div
      className="grid"
      style={{
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '36px 28px',
      }}
    >
      {projectList.map((project) => {
        const stats = projectStats.get(project.id) || { tokenCount: 0, nodeCount: 0 };
        return (
          <FolderCard
            key={project.id}
            project={project}
            tokenCount={stats.tokenCount}
            nodeCount={stats.nodeCount}
            isHighlighted={highlightedProjectId === project.id}
            onClick={() => onSelectProject(project.id)}
            onExport={(e) => { e.stopPropagation(); onExportProject(project.id); }}
            onDuplicate={(e) => { e.stopPropagation(); onDuplicateProject(project.id); }}
            onDelete={(e) => handleDeleteClick(project.id, e)}
            innerRef={(el) => {
              if (el) projectRefs.current.set(project.id, el);
              else projectRefs.current.delete(project.id);
            }}
          />
        );
      })}
    </div>
  );

  return (
    <div className="h-screen bg-[#0a0a0a] text-white overflow-auto">
      <div className="max-w-[1200px] mx-auto px-10 py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-10">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 style={{ fontSize: '22px', color: '#e5e5e5' }}>
                0<span className="text-[#666]">colors</span>
              </h1>
              {isAdmin && (
                <span
                  className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded"
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
            <p className="mt-1" style={{ fontSize: '13px', color: '#555' }}>
              {projects.length} project{projects.length !== 1 ? 's' : ''}
              {isAuthenticated && userEmail && (
                <span className="text-[#444]"> · {userEmail}</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={onImportProject}
              className="bg-[#161616] hover:bg-[#1e1e1e] text-[#999] hover:text-white gap-2 border border-[#282828] transition-colors"
            >
              <Upload className="w-4 h-4" />
              Import
            </Button>
            {isAuthenticated && onOpenAISettings && (
              <Button
                onClick={onOpenAISettings}
                className="bg-[#161616] hover:bg-[#1e1e1e] text-[#E5A336] hover:text-[#f0b84a] gap-2 border border-[#2a2210] hover:border-[#3d3318] transition-colors"
              >
                <Sparkles className="w-4 h-4" />
                AI Settings
              </Button>
            )}
            {isAuthenticated && onSignOut && (
              <Button
                onClick={onSignOut}
                className="bg-[#161616] hover:bg-[#1e1e1e] text-[#666] hover:text-white gap-2 border border-[#282828] transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>

        {/* ═══ TEMPLATES SECTION (Template Admin only) ═══ */}
        {isAuthenticated && isTemplateAdmin && (
          <div className="mb-12">
            {/* Section header */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2.5">
                <LayoutTemplate className="w-4 h-4 text-[#d4a044]" />
                <h2 className="text-[15px] text-[#ccc] font-medium">Templates</h2>
                <span
                  className="text-[11px] px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(212, 160, 68, 0.12)', color: '#d4a044', border: '1px solid rgba(212, 160, 68, 0.18)' }}
                >
                  {templateProjects.length}
                </span>
                <span
                  className="text-[11px] px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(212, 160, 68, 0.08)', color: '#b8923c', border: '1px solid rgba(212, 160, 68, 0.12)' }}
                >
                  Template Admin
                </span>
                {cloudSyncStatus === 'syncing' && (
                  <span className="text-[11px] text-[#d4a044] animate-pulse">Syncing...</span>
                )}
              </div>
              <Button
                onClick={() => onCreateProject('template')}
                className="bg-[#161616] hover:bg-[#1e1e1e] text-[#d4a044] hover:text-[#e8b84e] gap-2 border border-[#2a2210] hover:border-[#3d3318] transition-colors text-[13px] h-8 px-3"
              >
                <Plus className="w-3.5 h-3.5" />
                New template
              </Button>
            </div>
            {/* Template projects grid or empty state */}
            {templateProjects.length === 0 ? (
              <div
                className="flex items-center justify-center py-10 rounded-xl"
                style={{ background: '#0d0d0a', border: '1px dashed rgba(212, 160, 68, 0.2)' }}
              >
                <div className="text-center">
                  <LayoutTemplate className="w-8 h-8 text-[#3d3318] mx-auto mb-2" />
                  <p className="text-[13px] text-[#444]">No templates yet</p>
                  <p className="text-[11px] text-[#333] mt-1">Create template projects synced to Supabase</p>
                </div>
              </div>
            ) : (
              renderProjectGrid(templateProjects)
            )}

            {/* Divider */}
            <div className="mt-10 border-t border-[#1a1a1a]" />
          </div>
        )}

        {/* ═══ CLOUD PROJECTS SECTION ═══ */}
        {isAuthenticated && (
          <div className="mb-12">
            {/* Section header */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2.5">
                <Cloud className="w-4 h-4 text-[#4488ff]" />
                <h2 className="text-[15px] text-[#ccc] font-medium">Supabase Cloud</h2>
                <span
                  className="text-[11px] px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(68, 136, 255, 0.12)', color: '#6699ff', border: '1px solid rgba(68, 136, 255, 0.15)' }}
                >
                  {isAdmin
                    ? `${cloudProjects.length}`
                    : `${cloudProjects.length}/2`}
                </span>
                {cloudSyncStatus === 'syncing' && (
                  <span className="text-[11px] text-[#4488ff] animate-pulse">Syncing...</span>
                )}
                {onForceCloudRefresh && (
                  <button
                    onClick={onForceCloudRefresh}
                    className="text-[11px] text-[#666] hover:text-[#4488ff] flex items-center gap-1 transition-colors ml-1"
                    title="Force re-download all cloud projects from server"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Refresh
                  </button>
                )}
              </div>
              {canCreateCloudProject && (
                <Button
                  onClick={() => onCreateProject('cloud')}
                  className="bg-[#161616] hover:bg-[#1e1e1e] text-[#6699ff] hover:text-[#88bbff] gap-2 border border-[#1a2a44] hover:border-[#2a3a55] transition-colors text-[13px] h-8 px-3"
                >
                  <Plus className="w-3.5 h-3.5" />
                  New cloud project
                </Button>
              )}
            </div>
            {/* Cloud projects grid */}
            {cloudProjects.length === 0 ? (
              <div
                className="flex items-center justify-center py-10 rounded-xl"
                style={{ background: '#0a0d14', border: '1px dashed rgba(68, 136, 255, 0.15)' }}
              >
                <div className="text-center">
                  <Cloud className="w-8 h-8 text-[#1a2a44] mx-auto mb-2" />
                  <p className="text-[13px] text-[#444]">No cloud projects</p>
                  <p className="text-[11px] text-[#333] mt-1">Cloud projects sync across devices</p>
                </div>
              </div>
            ) : (
              renderProjectGrid(cloudProjects)
            )}

            {/* Divider */}
            <div className="mt-10 border-t border-[#1a1a1a]" />
          </div>
        )}

        {/* ═══ LOCAL PROJECTS SECTION ═══ */}
        <div>
          {/* Section header */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2.5">
              <HardDrive className="w-4 h-4 text-[#666]" />
              <h2 className="text-[15px] text-[#ccc] font-medium">Local Projects</h2>
              <span
                className="text-[11px] px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(255,255,255,0.05)', color: '#666', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                {localProjects.length}
              </span>
            </div>
            <Button
              onClick={() => onCreateProject('local')}
              className="bg-[#161616] hover:bg-[#1e1e1e] text-[#999] hover:text-white gap-2 border border-[#282828] transition-colors text-[13px] h-8 px-3"
            >
              <Plus className="w-3.5 h-3.5" />
              New local project
            </Button>
          </div>
          {/* Local projects grid or empty state */}
          {localProjects.length === 0 ? (
            <div
              className="flex items-center justify-center py-10 rounded-xl"
              style={{ background: '#0d0d0d', border: '1px dashed #1e1e1e' }}
            >
              <div className="text-center">
                <HardDrive className="w-8 h-8 text-[#2a2a2a] mx-auto mb-2" />
                <p className="text-[13px] text-[#444]">No local projects</p>
                <p className="text-[11px] text-[#333] mt-1">Local projects are stored in your browser</p>
              </div>
            </div>
          ) : (
            renderProjectGrid(localProjects)
          )}
        </div>
      </div>

      {/* Delete dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="bg-[#111111] border-[#252525] text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Project</AlertDialogTitle>
            <AlertDialogDescription className="text-[#878787]">
              Are you sure you want to delete this project? This action cannot be undone.
              All nodes and tokens in this project will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-[#1a1a1a] hover:bg-[#222] border-[#252525] text-white">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
