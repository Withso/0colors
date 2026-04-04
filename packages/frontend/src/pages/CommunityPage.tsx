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
import './CommunityPage.css';

interface CommunityPageProps {
  onBack?: () => void;
  onOpenProject: (slug: string) => void;
  onRemixProject: (slug: string) => void;
  /** When true, renders a compact version suitable for embedding in a sidebar layout. */
  inline?: boolean;
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
      className="community-desc-overlay"
      style={{
        zIndex: 200000,
        background: 'color-mix(in srgb, var(--grey-950) 70%, transparent)',
        backdropFilter: 'blur(6px)',
      }}
      onClick={onClose}
    >
      <div
        className="community-desc-card"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="community-desc-title">{title}</h3>
        <p className="community-desc-body">{description}</p>
        <div className="community-desc-footer">
          <button
            onClick={onClose}
            className="community-desc-close-btn"
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
      <div className="community-card">
        {/* Thumbnail */}
        <div
          className="community-card-thumbnail"
          onClick={onOpen}
        >
          {project.thumbnailUrl ? (
            <ImageWithFallback
              src={project.thumbnailUrl}
              alt={project.title}
              className="community-card-thumbnail-img"
            />
          ) : (
            <div className="community-card-thumbnail-empty">
              <Globe className="community-card-thumbnail-empty-icon" />
            </div>
          )}
          {/* Hover overlay */}
          <div className="community-card-hover-overlay">
            <div className="community-card-hover-icon-wrapper">
              <ExternalLink className="community-card-hover-icon" />
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="community-card-content">
          {/* Title */}
          <h3
            className="community-card-title"
            onClick={onOpen}
            title={project.title}
          >
            {project.title}
          </h3>

          {/* Description */}
          {project.description && (
            <div className="community-card-description-wrapper">
              <p className="community-card-description">
                {project.description}
              </p>
              {descTruncated && (
                <button
                  onClick={() => setShowFullDesc(true)}
                  className="community-card-read-more"
                >
                  Read more
                </button>
              )}
            </div>
          )}

          {/* Author */}
          <div className="community-card-author">
            <div className="community-card-author-avatar">
              <Users className="community-card-author-avatar-icon" />
            </div>
            <span className="community-card-author-name">{project.userName}</span>
          </div>

          {/* Actions */}
          <div className="community-card-actions">
            {project.allowRemix && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemix();
                }}
                className="community-card-remix-btn"
              >
                <Shuffle className="community-card-remix-icon" />
                Remix
              </button>
            )}
            <button
              onClick={handleShare}
              className="community-card-share-btn"
            >
              <Share2 className="community-card-share-icon" />
              Share
            </button>
            <div className="community-card-actions-spacer" />
            <span className="community-card-node-count">
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

export function CommunityPage({ onBack, onOpenProject, onRemixProject, inline = false }: CommunityPageProps) {
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

  /* ---------- Shared grid / loading / empty content ---------- */
  const gridContent = (
    <div className={inline ? 'community-grid-wrapper--inline' : 'community-grid-wrapper'}>
      {loading ? (
        <div className="community-loading">
          <Loader2 className="community-loading-icon community-spin" />
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="community-empty">
          <div className="community-empty-icon-wrapper">
            <Sparkles className="community-empty-icon" />
          </div>
          <h3 className="community-empty-title">
            {search ? 'No matching projects' : 'No community projects yet'}
          </h3>
          <p className="community-empty-subtitle">
            {search ? 'Try a different search term' : 'Be the first to publish a project!'}
          </p>
        </div>
      ) : (
        <>
          <div className="community-count-row">
            <span className="community-count-text">
              {filteredProjects.length} project{filteredProjects.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="community-grid">
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
  );

  /* ---------- Inline mode: compact header, no hero, no full-page wrapper ---------- */
  if (inline) {
    return (
      <div className="community-inline-wrapper">
        {/* Compact header */}
        <div className="community-inline-header">
          <div className="community-inline-title-row">
            <h1 className="community-inline-title">Community</h1>
          </div>
          <div className="community-inline-search-wrapper">
            <Search className="community-inline-search-icon" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search projects..."
              className="community-inline-search-input"
            />
          </div>
        </div>

        {/* Projects grid */}
        {gridContent}
      </div>
    );
  }

  /* ---------- Full-page mode (default): unchanged behaviour ---------- */
  return (
    <div className="community-page">
      {/* Hero Banner */}
      <div className="community-hero">
        {/* Background gradient */}
        <div
          className="community-hero-gradient"
          style={{
            background:
              'linear-gradient(135deg, color-mix(in srgb, var(--green-500) 8%, transparent) 0%, color-mix(in srgb, var(--blue-500) 6%, transparent) 50%, color-mix(in srgb, var(--purple-500) 8%, transparent) 100%)',
          }}
        />
        <div
          className="community-hero-gradient"
          style={{
            background:
              'radial-gradient(ellipse at 50% 0%, color-mix(in srgb, var(--green-500) 12%, transparent) 0%, transparent 60%)',
          }}
        />

        <div className="community-hero-inner">
          {/* Top nav */}
          <div className="community-top-nav">
            <button
              onClick={onBack}
              className="community-back-btn"
            >
              <ArrowLeft className="community-back-icon" />
              All Projects
            </button>
            <div className="community-logo">
              <span className="community-logo-text">
                0<span className="community-logo-text-dim">colors</span>
              </span>
            </div>
          </div>

          {/* Hero text */}
          <div className="community-hero-text">
            <div className="community-hero-icon-row">
              <div className="community-hero-icon-wrapper">
                <Globe className="community-hero-icon" />
              </div>
            </div>
            <h1 className="community-hero-heading">
              Community
            </h1>
            <p className="community-hero-description">
              Explore color systems shared by the community. Find inspiration, remix projects, and build on the work of others.
            </p>
          </div>

          {/* Search */}
          <div className="community-search-wrapper">
            <div className="community-search-inner">
              <Search className="community-search-icon" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search projects..."
                className="community-search-input"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Projects Grid */}
      {gridContent}
    </div>
  );
}
