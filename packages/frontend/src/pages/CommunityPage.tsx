/**
 * CommunityPage — Browse all published community projects.
 *
 * Two-column grid with thumbnails, titles, descriptions, remix & share buttons.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ArrowLeft,
  Globe,
  Shuffle,
  Share2,
  Loader2,
  Search,
  Users,
  Sparkles,
  ChevronDown,
  ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import { fetchCommunityProjects, type CommunityProjectMeta } from '../utils/community-api';
import { ImageWithFallback } from '../components/ImageWithFallback';
import { copyTextToClipboard } from '../utils/clipboard';

interface CommunityPageProps {
  onBack: () => void;
  onOpenProject: (slug: string) => void;
  onRemixProject: (slug: string) => void;
}

function DescriptionPopup({
  title,
  description,
  onClose,
}: {
  title: string;
  description: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: 200000, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[500px] rounded-2xl bg-card shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-[16px] font-semibold text-foreground mb-3">{title}</h3>
        <p className="text-[13px] text-muted-foreground leading-relaxed whitespace-pre-wrap">{description}</p>
        <div className="flex justify-end mt-5">
          <button
            onClick={onClose}
            className="h-8 px-4 rounded-lg text-[12px] text-subtle hover:text-white bg-secondary hover:bg-elevated transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function ProjectCard({
  project,
  onOpen,
  onRemix,
}: {
  project: CommunityProjectMeta;
  onOpen: () => void;
  onRemix: () => void;
}) {
  const [showFullDesc, setShowFullDesc] = useState(false);
  const descTruncated = project.description && project.description.length > 100;

  const handleShare = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const url = `${window.location.origin}/community/${project.slug}`;
      copyTextToClipboard(url);
      toast.success('Link copied to clipboard');
    },
    [project.slug],
  );

  return (
    <>
      <div className="group rounded-xl bg-card border border-[#141414] hover:border-border transition-all overflow-hidden">
        {/* Thumbnail */}
        <div
          className="relative w-full aspect-[16/9] bg-background cursor-pointer overflow-hidden"
          onClick={onOpen}
        >
          {project.thumbnailUrl ? (
            <ImageWithFallback
              src={project.thumbnailUrl}
              alt={project.title}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Globe className="h-10 w-10 text-[#222]" />
            </div>
          )}
          {/* Hover overlay */}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
            <div className="opacity-0 group-hover:opacity-100 transition-opacity">
              <ExternalLink className="h-6 w-6 text-white drop-shadow-lg" />
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-4 py-3.5">
          {/* Title */}
          <h3
            className="text-[14px] font-semibold text-foreground truncate cursor-pointer hover:text-white transition-colors"
            onClick={onOpen}
            title={project.title}
          >
            {project.title}
          </h3>

          {/* Description */}
          {project.description && (
            <div className="mt-1.5">
              <p className="text-[12px] text-faint leading-relaxed line-clamp-2">
                {project.description}
              </p>
              {descTruncated && (
                <button
                  onClick={() => setShowFullDesc(true)}
                  className="text-[11px] text-dim hover:text-brand transition-colors mt-0.5 cursor-pointer"
                >
                  Read more
                </button>
              )}
            </div>
          )}

          {/* Author */}
          <div className="flex items-center gap-1.5 mt-2.5">
            <div className="w-4 h-4 rounded-full bg-elevated flex items-center justify-center">
              <Users className="h-2.5 w-2.5 text-faint" />
            </div>
            <span className="text-[11px] text-dim truncate">{project.userName}</span>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[#141414]">
            {project.allowRemix && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemix();
                }}
                className="flex items-center gap-1.5 h-7 px-3 rounded-md bg-[#465BFE]/10 border border-[#465BFE]/20 text-[#465BFE] text-[11px] font-medium hover:bg-[#465BFE]/20 transition-colors cursor-pointer"
              >
                <Shuffle className="h-3 w-3" />
                Remix
              </button>
            )}
            <button
              onClick={handleShare}
              className="flex items-center gap-1.5 h-7 px-3 rounded-md bg-secondary text-subtle text-[11px] hover:text-white hover:border-border transition-colors cursor-pointer"
            >
              <Share2 className="h-3 w-3" />
              Share
            </button>
            <div className="flex-1" />
            <span className="text-[10px] text-ghost">
              {project.nodeCount} node{project.nodeCount !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      </div>

      {showFullDesc && (
        <DescriptionPopup
          title={project.title}
          description={project.description}
          onClose={() => setShowFullDesc(false)}
        />
      )}
    </>
  );
}

export function CommunityPage({ onBack, onOpenProject, onRemixProject }: CommunityPageProps) {
  const [projects, setProjects] = useState<CommunityProjectMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const data = await fetchCommunityProjects();
      if (!cancelled) {
        setProjects(data);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const filteredProjects = useMemo(() => {
    if (!search.trim()) return projects;
    const q = search.toLowerCase();
    return projects.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.userName.toLowerCase().includes(q),
    );
  }, [projects, search]);

  return (
    <div className="h-screen bg-background text-white overflow-auto">
      {/* Hero Banner */}
      <div className="relative overflow-hidden">
        {/* Background gradient */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(135deg, rgba(34,197,94,0.08) 0%, rgba(59,130,246,0.06) 50%, rgba(168,85,247,0.08) 100%)',
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background: 'radial-gradient(ellipse at 50% 0%, rgba(34,197,94,0.12) 0%, transparent 60%)',
          }}
        />

        <div className="relative max-w-[1100px] mx-auto px-8 pt-8 pb-12">
          {/* Top nav */}
          <div className="flex items-center justify-between mb-10">
            <button
              onClick={onBack}
              className="flex items-center gap-2 h-9 px-4 rounded-lg text-[13px] text-subtle hover:text-white bg-card/80 hover:border-border backdrop-blur-sm transition-all cursor-pointer"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              All Projects
            </button>
            <div className="flex items-center gap-2">
              <span className="text-[22px] text-foreground">
                0<span className="text-faint">colors</span>
              </span>
            </div>
          </div>

          {/* Hero text */}
          <div className="text-center max-w-[600px] mx-auto">
            <div className="flex items-center justify-center gap-2 mb-3">
              <div className="w-10 h-10 rounded-xl bg-brand/10 border border-brand/20 flex items-center justify-center">
                <Globe className="h-5 w-5 text-brand" />
              </div>
            </div>
            <h1 className="text-[28px] font-bold text-foreground mb-2">
              Community
            </h1>
            <p className="text-[14px] text-faint leading-relaxed">
              Explore color systems shared by the community. Find inspiration, remix projects, and build on the work of others.
            </p>
          </div>

          {/* Search */}
          <div className="max-w-[400px] mx-auto mt-8">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ghost" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search projects..."
                className="w-full h-10 pl-10 pr-4 rounded-xl bg-card/80 text-[13px] text-foreground placeholder-ghost outline-none focus:border-brand/30 backdrop-blur-sm transition-colors"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Projects Grid */}
      <div className="max-w-[1100px] mx-auto px-8 pb-16">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 text-dim animate-spin" />
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-16 h-16 rounded-2xl bg-card border border-[#141414] flex items-center justify-center mb-4">
              <Sparkles className="h-7 w-7 text-[#222]" />
            </div>
            <h3 className="text-[15px] text-dim font-medium mb-1">
              {search ? 'No matching projects' : 'No community projects yet'}
            </h3>
            <p className="text-[12px] text-ghost">
              {search ? 'Try a different search term' : 'Be the first to publish a project!'}
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-5">
              <span className="text-[12px] text-ghost">
                {filteredProjects.length} project{filteredProjects.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-6">
              {filteredProjects.map((project) => (
                <ProjectCard
                  key={project.projectId}
                  project={project}
                  onOpen={() => onOpenProject(project.slug)}
                  onRemix={() => onRemixProject(project.slug)}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}