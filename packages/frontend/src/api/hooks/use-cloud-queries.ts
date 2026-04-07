// React Query hooks for cloud sync operations
import { useQuery } from '@tanstack/react-query';
import { loadCloudProjects, getCloudMeta, loadPublicTemplates } from '../../utils/supabase/cloud-sync';

/** Fetch all cloud projects for the authenticated user */
export function useCloudProjects(accessToken: string | undefined) {
  return useQuery({
    queryKey: ['cloudProjects', accessToken],
    queryFn: () => loadCloudProjects(accessToken!),
    enabled: !!accessToken,
    staleTime: 5 * 60 * 1000, // 5 min
  });
}

/** Fetch cloud metadata (project IDs, admin flags, limits) */
export function useCloudMeta(accessToken: string | undefined) {
  return useQuery({
    queryKey: ['cloudMeta', accessToken],
    queryFn: () => getCloudMeta(accessToken!),
    enabled: !!accessToken,
    staleTime: 5 * 60 * 1000,
  });
}

/** Fetch public template gallery */
export function usePublicTemplates() {
  return useQuery({
    queryKey: ['publicTemplates'],
    queryFn: () => loadPublicTemplates(),
    staleTime: 10 * 60 * 1000, // 10 min
  });
}
