/**
 * AI utilities — provider integration, context management, build mode.
 * Mixed: some pure (context building), some with side effects (streaming, storage).
 */

// AI provider & settings management
export {
  loadAISettings, saveAISettings,
  loadLocalConversations, saveLocalConversations,
  loadCloudConversations, saveCloudConversations,
  loadCloudSettingsBundle, saveCloudSettingsBundle,
  buildCloudSettingsBundle, mergeSettingsBundles,
  mergeConversations, trimConversations,
  loadContextTier, saveContextTier,
  loadContextToggles, saveContextToggles,
  setLocalSettingsUpdatedAt,
} from '../ai-provider';
export type { Conversation, AISettings, ContextToggles } from '../ai-provider';

// AI context management
export type { ContextTier } from '../ai-context-manager';

// AI project context builder (pure)
export { buildProjectContext } from '../ai-project-context';

// AI Build Mode execution
export type { MutationContext } from '../ai-build-executor';
