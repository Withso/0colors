/**
 * PublishPopup — Modal dialog for publishing / editing / unpublishing
 * a cloud project to the 0colors community.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { X, Globe, Loader2, Trash2, Check, Shuffle, Link2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  publishProject,
  updatePublishSettings,
  unpublishProject,
  getPublishStatus,
  type CommunityProjectMeta,
} from '../utils/community-api';
import { generateThumbnail } from '../utils/thumbnail-generator';
import type { ProjectSnapshot } from '../utils/supabase/cloud-sync';
import type { ColorNode } from '../types';

interface PublishPopupProps {
  projectId: string;
  projectName: string;
  accessToken: string;
  /** All project nodes (for thumbnail generation) */
  nodes: ColorNode[];
  /** Active page ID (thumbnail uses first page) */
  firstPageId: string;
  /** Builds and returns a full project snapshot for publishing */
  getSnapshot: () => ProjectSnapshot;
  onClose: () => void;
  /** Called after successful publish/unpublish to update local state */
  onPublishChange: (projectId: string, published: boolean, slug?: string) => void;
}

export function PublishPopup({
  projectId,
  projectName,
  accessToken,
  nodes,
  firstPageId,
  getSnapshot,
  onClose,
  onPublishChange,
}: PublishPopupProps) {
  const [title, setTitle] = useState(projectName);
  const [description, setDescription] = useState('');
  const [allowRemix, setAllowRemix] = useState(true);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [existingMeta, setExistingMeta] = useState<CommunityProjectMeta | null>(null);
  const [showUnpublishConfirm, setShowUnpublishConfirm] = useState(false);
  const [mounted, setMounted] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // Animate in
  useEffect(() => {
    requestAnimationFrame(() => setMounted(true));
  }, []);

  // Check if already published
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setChecking(true);
      const status = await getPublishStatus(projectId, accessToken);
      if (cancelled) return;
      if (status) {
        setExistingMeta(status);
        setTitle(status.title);
        setDescription(status.description);
        setAllowRemix(status.allowRemix);
      }
      setChecking(false);
    })();
    return () => { cancelled = true; };
  }, [projectId, accessToken]);

  // Escape to close
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // Click outside to close
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  const handlePublish = useCallback(async () => {
    if (!title.trim() || title.trim().length < 2) {
      toast.error('Title must be at least 2 characters');
      return;
    }
    setLoading(true);
    try {
      // Generate thumbnail
      const thumbnailDataUrl = generateThumbnail(nodes, firstPageId);
      // Build snapshot
      const snapshot = getSnapshot();

      if (existingMeta) {
        // Update existing
        const result = await updatePublishSettings(
          projectId,
          { title: title.trim(), description: description.trim(), allowRemix, thumbnailDataUrl, snapshot },
          accessToken,
        );
        if ('error' in result) {
          toast.error(`Update failed: ${result.error}`);
        } else {
          toast.success('Community project updated');
          onPublishChange(projectId, true, existingMeta.slug);
          onClose();
        }
      } else {
        // New publish
        const result = await publishProject(
          {
            projectId,
            title: title.trim(),
            description: description.trim(),
            allowRemix,
            snapshot,
            thumbnailDataUrl,
          },
          accessToken,
        );
        if ('error' in result) {
          toast.error(`Publish failed: ${result.error}`);
        } else {
          toast.success('Project published to community!');
          onPublishChange(projectId, true, result.slug);
          onClose();
        }
      }
    } catch (err: any) {
      toast.error(`Failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [title, description, allowRemix, nodes, firstPageId, getSnapshot, projectId, accessToken, existingMeta, onPublishChange, onClose]);

  const handleUnpublish = useCallback(async () => {
    setLoading(true);
    try {
      const result = await unpublishProject(projectId, accessToken);
      if ('error' in result) {
        toast.error(`Unpublish failed: ${result.error}`);
      } else {
        toast.success('Project removed from community');
        onPublishChange(projectId, false);
        onClose();
      }
    } catch (err: any) {
      toast.error(`Failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [projectId, accessToken, onPublishChange, onClose]);

  const isEditing = !!existingMeta;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{
        zIndex: 200000,
        background: mounted ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0)',
        backdropFilter: mounted ? 'blur(8px)' : 'none',
        transition: 'background 0.3s ease, backdrop-filter 0.3s ease',
      }}
    >
      <div
        ref={cardRef}
        className="w-full max-w-[480px] rounded-2xl bg-card shadow-2xl"
        style={{
          opacity: mounted ? 1 : 0,
          transform: mounted ? 'translateY(0) scale(1)' : 'translateY(20px) scale(0.97)',
          transition: 'opacity 0.3s ease, transform 0.3s ease',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-brand/10">
              <Globe className="h-4 w-4 text-brand" />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-foreground">
                {isEditing ? 'Edit Community Listing' : 'Publish to Community'}
              </h2>
              <p className="text-[11px] text-dim">
                {isEditing ? 'Update your published project' : 'Share your color system with others'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-elevated text-faint hover:text-white transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {checking ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 text-dim animate-spin" />
          </div>
        ) : (
          <div className="px-6 pb-6">
            {/* Title */}
            <div className="mb-4">
              <label className="block text-[11px] font-medium text-subtle uppercase tracking-wider mb-1.5">
                Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={80}
                placeholder="My Color System"
                className="w-full h-10 px-3 rounded-lg bg-background border border-elevated text-[13px] text-foreground placeholder-ghost outline-none focus:border-brand/40 transition-colors"
              />
            </div>

            {/* Description */}
            <div className="mb-4">
              <label className="block text-[11px] font-medium text-subtle uppercase tracking-wider mb-1.5">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={500}
                rows={3}
                placeholder="A brief description of your color system..."
                className="w-full px-3 py-2.5 rounded-lg bg-background border border-elevated text-[13px] text-foreground placeholder-ghost outline-none focus:border-brand/40 transition-colors resize-none"
              />
              <div className="text-right mt-1">
                <span className="text-[10px] text-ghost">{description.length}/500</span>
              </div>
            </div>

            {/* Allow Remix checkbox */}
            <div className="mb-6">
              <label className="flex items-start gap-3 cursor-pointer group">
                <div
                  className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${allowRemix
                      ? 'bg-brand border-brand'
                      : 'bg-transparent border-[#444] group-hover:border-[#666]'
                    }`}
                  onClick={() => setAllowRemix(!allowRemix)}
                >
                  {allowRemix && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                </div>
                <div onClick={() => setAllowRemix(!allowRemix)}>
                  <div className="flex items-center gap-1.5">
                    <Shuffle className="h-3.5 w-3.5 text-brand" />
                    <span className="text-[13px] text-foreground font-medium">Anyone can remix</span>
                  </div>
                  <p className="text-[11px] text-faint mt-0.5">
                    Others can duplicate this project to their own workspace. If unchecked, the project is view-only.
                  </p>
                </div>
              </label>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2">
              {isEditing && (
                <>
                  {showUnpublishConfirm ? (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleUnpublish}
                        disabled={loading}
                        className="h-9 px-4 rounded-lg bg-[#FF4D6A]/10 border border-[#FF4D6A]/20 text-destructive text-[12px] font-medium hover:bg-[#FF4D6A]/20 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Confirm Unpublish'}
                      </button>
                      <button
                        onClick={() => setShowUnpublishConfirm(false)}
                        className="h-9 px-3 rounded-lg text-[12px] text-faint hover:text-muted-foreground transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowUnpublishConfirm(true)}
                      className="h-9 px-3 rounded-lg text-destructive/60 hover:text-destructive text-[12px] transition-colors cursor-pointer flex items-center gap-1.5"
                    >
                      <Trash2 className="h-3 w-3" />
                      Unpublish
                    </button>
                  )}
                </>
              )}

              <div className="flex-1" />

              <button
                onClick={onClose}
                className="h-9 px-4 rounded-lg text-[12px] text-subtle hover:text-white transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handlePublish}
                disabled={loading || !title.trim()}
                className="h-9 px-5 rounded-lg bg-brand text-white text-[12px] font-semibold hover:bg-[#3548CC] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {loading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Globe className="h-3.5 w-3.5" />
                )}
                {isEditing ? 'Update' : 'Publish'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}