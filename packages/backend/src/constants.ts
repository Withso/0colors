// ===========================================================================
//  Constants & Configuration
// ===========================================================================

export const CLOUD_PROJECT_LIMIT = 20;
export const AI_CONVERSATION_LIMIT = 50;
export const AI_MESSAGE_LIMIT = 250;
export const AI_PAYLOAD_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
export const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;  // 1 hour
export const RATE_LIMIT_MAX = 100;                     // 100 req/hr per project
export const SYNC_BATCH_MAX = 50;
export const VALID_TOKEN_FORMATS = ['css', 'dtcg', 'tailwind', 'figma'] as const;
export const TOKEN_CONTENT_TYPES: Record<string, string> = {
    css: 'text/css',
    dtcg: 'application/json',
    figma: 'application/json',
    tailwind: 'application/javascript',
};
