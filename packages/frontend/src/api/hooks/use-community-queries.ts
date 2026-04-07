// React Query hooks for community API operations
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchCommunityProjects,
  fetchCommunityProject,
  getPublishStatus,
  publishProject,
  updatePublishSettings,
  unpublishProject,
} from '../../utils/community-api';

/** Fetch all published community projects */
export function useCommunityProjects() {
  return useQuery({
    queryKey: ['communityProjects'],
    queryFn: fetchCommunityProjects,
    staleTime: 5 * 60 * 1000,
  });
}

/** Fetch a single community project by slug */
export function useCommunityProject(slug: string | null) {
  return useQuery({
    queryKey: ['communityProject', slug],
    queryFn: () => fetchCommunityProject(slug!),
    enabled: !!slug,
    staleTime: 30 * 60 * 1000, // 30 min (project content rarely changes)
  });
}

/** Check publish status for a project */
export function usePublishStatus(projectId: string | null, accessToken: string | undefined) {
  return useQuery({
    queryKey: ['publishStatus', projectId],
    queryFn: () => getPublishStatus(projectId!, accessToken!),
    enabled: !!projectId && !!accessToken,
    staleTime: 60 * 1000, // 1 min
  });
}

/** Publish a project to the community */
export function usePublishProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ payload, token }: { payload: any; token: string }) =>
      publishProject(payload, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['communityProjects'] });
    },
  });
}

/** Update publish settings */
export function useUpdatePublishSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, updates, token }: { projectId: string; updates: any; token: string }) =>
      updatePublishSettings(projectId, updates, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['communityProjects'] });
    },
  });
}

/** Unpublish a project */
export function useUnpublishProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, token }: { projectId: string; token: string }) =>
      unpublishProject(projectId, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['communityProjects'] });
    },
  });
}
