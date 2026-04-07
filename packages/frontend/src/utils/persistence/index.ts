/**
 * Persistence utilities — localStorage helpers.
 * Browser-only, handles data serialization/deserialization.
 */

// Main app state persistence
export {
  saveToLocalStorage, loadFromLocalStorage,
  STORAGE_KEY, getDefaultData,
  saveGroupExpandStates, loadGroupExpandStates, mergeGroupExpandStates,
  migrateTokens,
} from '../app-helpers';

// Advanced logic draft registry
export { isAdvancedDraft } from '../advanced-draft-registry';
