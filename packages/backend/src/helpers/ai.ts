// ===========================================================================
//  AI Trimming
// ===========================================================================

import { AI_CONVERSATION_LIMIT, AI_MESSAGE_LIMIT } from '../constants.js';

/** Trim AI conversations: keep most recent N conversations, cap messages per conversation */
export function trimAIConversations(convs: any[]): any[] {
    const sorted = convs
        .filter((c) => c && typeof c === 'object' && c.id)
        .sort((a: any, b: any) => (b.updatedAt || 0) - (a.updatedAt || 0))
        .slice(0, AI_CONVERSATION_LIMIT);
    return sorted.map((c: any) => {
        if (!Array.isArray(c.messages) || c.messages.length <= AI_MESSAGE_LIMIT) return c;
        const first = c.messages[0];
        const recent = c.messages.slice(-(AI_MESSAGE_LIMIT - 1));
        return { ...c, messages: [first, ...recent] };
    });
}
