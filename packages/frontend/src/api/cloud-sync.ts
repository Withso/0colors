// Cloud sync API — re-exports from supabase cloud-sync module
export {
  initCloudSync,
  destroyCloudSync,
  updateAccessToken,
  markDirty,
  removeDirty,
  forceSyncNow,
  isDirty,
  hasDirtyProjects,
  getDirtyProjectIds,
  registerCloudProject,
  unregisterCloudProject,
  loadCloudProjects,
  getCloudMeta,
  loadPublicTemplates,
} from '../utils/supabase/cloud-sync';
export type { ProjectSnapshot } from '../utils/supabase/cloud-sync';
