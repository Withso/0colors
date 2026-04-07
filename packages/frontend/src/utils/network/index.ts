/**
 * Network utilities — side effects (fetch, WebSocket, etc.).
 * Browser-only, not portable to server without polyfills.
 */

// Cloud sync (Supabase-backed project persistence)
export {
  initCloudSync, destroyCloudSync, updateAccessToken,
  markDirty, removeDirty, forceSyncNow,
  isDirty, hasDirtyProjects, getDirtyProjectIds,
  registerCloudProject, unregisterCloudProject,
  loadCloudProjects, getCloudMeta, loadPublicTemplates,
} from '../supabase/cloud-sync';
export type { ProjectSnapshot } from '../supabase/cloud-sync';

// Community API (publish/browse/remix)
export {
  publishProject, updatePublishSettings, unpublishProject,
  fetchCommunityProjects, fetchCommunityProject, getPublishStatus,
} from '../community-api';
export type { CommunityProjectDetail } from '../community-api';

// Supabase client
export { getSupabaseClient, SERVER_BASE } from '../supabase/client';

// Encryption (GitHub PAT)
export { decryptPAT } from '../crypto';

// Clipboard
export { copyTextToClipboard } from '../clipboard';
