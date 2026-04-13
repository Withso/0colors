// Auth & cloud sync state slice
import type { StateCreator } from 'zustand';
import type { DevConfig } from '../../types';
import type { SetStateAction } from '../types';
import type { Conversation } from '../../utils/ai-provider';

function resolve<T>(action: SetStateAction<T>, current: T): T {
  return typeof action === 'function' ? (action as (prev: T) => T)(current) : action;
}

export interface AuthSession {
  accessToken: string;
  userId: string;
  email: string;
  name: string;
  isAdmin?: boolean;
  isTemplateAdmin?: boolean;
}

export type CloudSyncStatus = 'local' | 'idle' | 'dirty' | 'syncing' | 'synced' | 'error' | 'offline';
export type DashboardSection = 'projects' | 'community' | 'ai-settings' | 'profile' | 'qa-hub';

export interface AuthState {
  authSession: AuthSession | null;
  authChecking: boolean;
  authSkipped: boolean;
  cloudSyncStatus: CloudSyncStatus;
  lastSyncError: string | undefined;
  isOnline: boolean;

  // Navigation/view (URL-derived initial values set during hydration)
  viewingProjects: boolean;
  dashboardSection: DashboardSection;
  isCommunityMode: boolean;
  communitySlug: string | null;
  viewMode: 'canvas' | 'code' | 'export';

  // Sample templates
  activeSampleTemplateId: string;
  sampleTemplateSearch: string;
  cloudTemplates: { templateId: string; snapshot: any; name: string; description: string }[];
  cloudTemplatesLoaded: boolean;
  starredTemplateId: string | null; // Backend-persisted: determines default sample for first-time users

  // Share dialog
  shareDialogOpen: boolean;
  shareLink: string;
  copied: boolean;

  // Export state
  codePreviewHexByPage: Record<string, Set<string>>;
  multiExportPageIds: Set<string> | null;
  multiExportThemeIds: Set<string> | null;
  multiExportHexSpaces: Set<string>;
  tokenTableHexSpaces: Set<string>;

  // Dev mode
  devConfigs: Record<string, DevConfig>;

  // AI
  aiConversations: Conversation[];
  aiChatDocked: boolean;
}

export interface AuthActions {
  setAuthSession: (action: SetStateAction<AuthSession | null>) => void;
  setAuthChecking: (action: SetStateAction<boolean>) => void;
  setAuthSkipped: (action: SetStateAction<boolean>) => void;
  setCloudSyncStatus: (action: SetStateAction<CloudSyncStatus>) => void;
  setLastSyncError: (action: SetStateAction<string | undefined>) => void;
  setIsOnline: (action: SetStateAction<boolean>) => void;

  setViewingProjects: (action: SetStateAction<boolean>) => void;
  setDashboardSection: (action: SetStateAction<DashboardSection>) => void;
  setIsCommunityMode: (action: SetStateAction<boolean>) => void;
  setCommunitySlug: (action: SetStateAction<string | null>) => void;
  setViewMode: (action: SetStateAction<'canvas' | 'code' | 'export'>) => void;

  setActiveSampleTemplateId: (action: SetStateAction<string>) => void;
  setSampleTemplateSearch: (action: SetStateAction<string>) => void;
  setCloudTemplates: (action: SetStateAction<{ templateId: string; snapshot: any; name: string; description: string }[]>) => void;
  setCloudTemplatesLoaded: (action: SetStateAction<boolean>) => void;

  setShareDialogOpen: (action: SetStateAction<boolean>) => void;
  setShareLink: (action: SetStateAction<string>) => void;
  setCopied: (action: SetStateAction<boolean>) => void;

  setCodePreviewHexByPage: (action: SetStateAction<Record<string, Set<string>>>) => void;
  setMultiExportPageIds: (action: SetStateAction<Set<string> | null>) => void;
  setMultiExportThemeIds: (action: SetStateAction<Set<string> | null>) => void;
  setMultiExportHexSpaces: (action: SetStateAction<Set<string>>) => void;
  setTokenTableHexSpaces: (action: SetStateAction<Set<string>>) => void;

  setDevConfigs: (action: SetStateAction<Record<string, DevConfig>>) => void;

  setAIConversations: (action: SetStateAction<Conversation[]>) => void;
  setAIChatDocked: (action: SetStateAction<boolean>) => void;
}

export type AuthSlice = AuthState & AuthActions;

export const createAuthSlice: StateCreator<any, [], [], AuthSlice> = (set) => ({
  // Auth
  authSession: null,
  authChecking: true,
  authSkipped: false,
  cloudSyncStatus: 'local' as CloudSyncStatus,
  lastSyncError: undefined,
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,

  // Navigation (URL-derived defaults — overwritten during hydration in mount effect)
  viewingProjects: false,
  dashboardSection: 'projects' as DashboardSection,
  isCommunityMode: false,
  communitySlug: null,
  viewMode: 'canvas' as const,

  // Sample templates
  activeSampleTemplateId: 'starter',
  sampleTemplateSearch: '',
  cloudTemplates: [],
  cloudTemplatesLoaded: false,
  starredTemplateId: null,

  // Share dialog
  shareDialogOpen: false,
  shareLink: '',
  copied: false,

  // Export state
  codePreviewHexByPage: {},
  multiExportPageIds: null,
  multiExportThemeIds: null,
  multiExportHexSpaces: new Set<string>(),
  tokenTableHexSpaces: new Set<string>(),

  // Dev mode
  devConfigs: {},

  // AI
  aiConversations: [],
  aiChatDocked: false,

  // Setters
  setAuthSession: (a) => set((s: any) => ({ authSession: resolve(a, s.authSession) })),
  setAuthChecking: (a) => set((s: any) => ({ authChecking: resolve(a, s.authChecking) })),
  setAuthSkipped: (a) => set((s: any) => ({ authSkipped: resolve(a, s.authSkipped) })),
  setCloudSyncStatus: (a) => set((s: any) => ({ cloudSyncStatus: resolve(a, s.cloudSyncStatus) })),
  setLastSyncError: (a) => set((s: any) => ({ lastSyncError: resolve(a, s.lastSyncError) })),
  setIsOnline: (a) => set((s: any) => ({ isOnline: resolve(a, s.isOnline) })),

  setViewingProjects: (a) => set((s: any) => ({ viewingProjects: resolve(a, s.viewingProjects) })),
  setDashboardSection: (a) => set((s: any) => ({ dashboardSection: resolve(a, s.dashboardSection) })),
  setIsCommunityMode: (a) => set((s: any) => ({ isCommunityMode: resolve(a, s.isCommunityMode) })),
  setCommunitySlug: (a) => set((s: any) => ({ communitySlug: resolve(a, s.communitySlug) })),
  setViewMode: (a) => set((s: any) => ({ viewMode: resolve(a, s.viewMode) })),

  setActiveSampleTemplateId: (a) => set((s: any) => ({ activeSampleTemplateId: resolve(a, s.activeSampleTemplateId) })),
  setSampleTemplateSearch: (a) => set((s: any) => ({ sampleTemplateSearch: resolve(a, s.sampleTemplateSearch) })),
  setCloudTemplates: (a) => set((s: any) => ({ cloudTemplates: resolve(a, s.cloudTemplates) })),
  setCloudTemplatesLoaded: (a) => set((s: any) => ({ cloudTemplatesLoaded: resolve(a, s.cloudTemplatesLoaded) })),

  setShareDialogOpen: (a) => set((s: any) => ({ shareDialogOpen: resolve(a, s.shareDialogOpen) })),
  setShareLink: (a) => set((s: any) => ({ shareLink: resolve(a, s.shareLink) })),
  setCopied: (a) => set((s: any) => ({ copied: resolve(a, s.copied) })),

  setCodePreviewHexByPage: (a) => set((s: any) => ({ codePreviewHexByPage: resolve(a, s.codePreviewHexByPage) })),
  setMultiExportPageIds: (a) => set((s: any) => ({ multiExportPageIds: resolve(a, s.multiExportPageIds) })),
  setMultiExportThemeIds: (a) => set((s: any) => ({ multiExportThemeIds: resolve(a, s.multiExportThemeIds) })),
  setMultiExportHexSpaces: (a) => set((s: any) => ({ multiExportHexSpaces: resolve(a, s.multiExportHexSpaces) })),
  setTokenTableHexSpaces: (a) => set((s: any) => ({ tokenTableHexSpaces: resolve(a, s.tokenTableHexSpaces) })),

  setDevConfigs: (a) => set((s: any) => ({ devConfigs: resolve(a, s.devConfigs) })),

  setAIConversations: (a) => set((s: any) => ({ aiConversations: resolve(a, s.aiConversations) })),
  setAIChatDocked: (a) => set((s: any) => ({ aiChatDocked: resolve(a, s.aiChatDocked) })),
});
