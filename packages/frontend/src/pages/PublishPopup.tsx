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
import './PublishPopup.css';

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
      className="publish-overlay"
      style={{
        zIndex: 200000,
        background: mounted
          ? 'var(--surface-overlay)'
          : 'transparent',
        backdropFilter: mounted ? 'blur(8px)' : 'none',
        transition: 'background 0.3s ease, backdrop-filter 0.3s ease',
      }}
    >
      <div
        ref={cardRef}
        className="publish-card"
        style={{
          opacity: mounted ? 1 : 0,
          transform: mounted ? 'translateY(0) scale(1)' : 'translateY(20px) scale(0.97)',
          transition: 'opacity 0.3s ease, transform 0.3s ease',
        }}
      >
        {/* Header */}
        <div className="publish-header">
          <div className="publish-header-left">
            <div className="publish-header-icon-wrapper">
              <Globe className="publish-header-icon" />
            </div>
            <div>
              <h2 className="publish-header-title">
                {isEditing ? 'Edit Community Listing' : 'Publish to Community'}
              </h2>
              <p className="publish-header-subtitle">
                {isEditing ? 'Update your published project' : 'Share your color system with others'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="publish-close-btn"
          >
            <X className="publish-close-icon" />
          </button>
        </div>

        {checking ? (
          <div className="publish-loading">
            <Loader2 className="publish-loading-icon animate-spin" />
          </div>
        ) : (
          <div className="publish-body">
            {/* Title */}
            <div className="publish-field">
              <label className="publish-label">
                Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={80}
                placeholder="My Color System"
                className="publish-input"
              />
            </div>

            {/* Description */}
            <div className="publish-field">
              <label className="publish-label">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={500}
                rows={3}
                placeholder="A brief description of your color system..."
                className="publish-textarea"
              />
              <div className="publish-char-count">
                <span className="publish-char-count-text">{description.length}/500</span>
              </div>
            </div>

            {/* Allow Remix checkbox */}
            <div className="publish-remix-field">
              <label className="publish-remix-label">
                <div
                  className={`publish-checkbox ${allowRemix ? 'publish-checkbox--checked' : 'publish-checkbox--unchecked'}`}
                  onClick={() => setAllowRemix(!allowRemix)}
                >
                  {allowRemix && <Check className="publish-checkbox-icon" />}
                </div>
                <div onClick={() => setAllowRemix(!allowRemix)}>
                  <div className="publish-remix-info">
                    <Shuffle className="publish-remix-info-icon" />
                    <span className="publish-remix-info-text">Anyone can remix</span>
                  </div>
                  <p className="publish-remix-description">
                    Others can duplicate this project to their own workspace. If unchecked, the project is view-only.
                  </p>
                </div>
              </label>
            </div>

            {/* Action buttons */}
            <div className="publish-actions">
              {isEditing && (
                <>
                  {showUnpublishConfirm ? (
                    <div className="publish-unpublish-confirm-group">
                      <button
                        onClick={handleUnpublish}
                        disabled={loading}
                        className="publish-unpublish-confirm-btn"
                      >
                        {loading ? <Loader2 className="publish-unpublish-confirm-spinner animate-spin" /> : 'Confirm Unpublish'}
                      </button>
                      <button
                        onClick={() => setShowUnpublishConfirm(false)}
                        className="publish-unpublish-cancel-btn"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowUnpublishConfirm(true)}
                      className="publish-unpublish-btn"
                    >
                      <Trash2 className="publish-unpublish-icon" />
                      Unpublish
                    </button>
                  )}
                </>
              )}

              <div className="publish-spacer" />

              <button
                onClick={onClose}
                className="publish-cancel-btn"
              >
                Cancel
              </button>
              <button
                onClick={handlePublish}
                disabled={loading || !title.trim()}
                className="publish-submit-btn"
              >
                {loading ? (
                  <Loader2 className="publish-submit-icon animate-spin" />
                ) : (
                  <Globe className="publish-submit-icon" />
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
