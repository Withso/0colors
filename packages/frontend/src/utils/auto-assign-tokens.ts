// ============================================================================
// reconstructAutoAssignedTokens
//
// Auto-assigned tokens are derived state — they live on the parent node's
// metadata, not in the explicit tokens array. When loading a project snapshot
// from an external source (cloud sync, community import) the tokens array
// may not include them yet. This helper walks every node with
// `autoAssignEnabled` and synthesizes the missing token rows + groups +
// patches the children's `tokenAssignments` so the project loads consistently.
//
// Previously lived under hooks/useSampleTemplates.ts; lifted out during the
// Phase-7 sample-projects removal because community-project loading also uses it.
// ============================================================================

import { getAutoAssignSuffixValue } from '../components/canvas/AutoAssignTokenMenu';

export function reconstructAutoAssignedTokens(
  nodes: any[],
  tokens: any[],
  groups: any[],
  themes: any[],
  projectId: string,
): { tokens: any[]; groups: any[]; nodes: any[] } {
  const existingTokenIds = new Set(tokens.map((t: any) => t.id));
  const existingGroupIds = new Set(groups.map((g: any) => g.id));
  const newTokens: any[] = [];
  const newGroups: any[] = [];
  const nodePatches = new Map<string, any>();

  const autoParents = nodes.filter((n: any) => n.autoAssignEnabled);

  for (const parent of autoParents) {
    const prefix = parent.autoAssignPrefix || parent.referenceName || 'color';
    const suffixPattern = parent.autoAssignSuffix || '1-9';
    const startFrom = parent.autoAssignStartFrom;
    const targetGroupId = parent.autoAssignGroupId || null;

    if (targetGroupId && !existingGroupIds.has(targetGroupId)) {
      newGroups.push({
        id: targetGroupId,
        name: prefix,
        projectId,
        pageId: parent.pageId,
        isAutoAssignCreated: true,
      });
      existingGroupIds.add(targetGroupId);
    }

    const children = nodes
      .filter((n: any) => n.parentId === parent.id && !n.isSpacing)
      .sort((a: any, b: any) => a.id.localeCompare(b.id));

    let assignIndex = 0;
    for (const child of children) {
      if (child.autoAssignExcluded) continue;

      const suffixValue = getAutoAssignSuffixValue(suffixPattern as any, assignIndex, startFrom);
      const tokenName = `${prefix}-${suffixValue}`;
      assignIndex++;

      const tokenId = child.autoAssignedTokenId;
      if (!tokenId || existingTokenIds.has(tokenId)) continue;

      const themeValues: any = {};
      for (const theme of themes) {
        const themeOverride = child.themeOverrides?.[theme.id];
        const h = themeOverride?.hue !== undefined ? themeOverride.hue : child.hue;
        const s = themeOverride?.saturation !== undefined ? themeOverride.saturation : child.saturation;
        const l = themeOverride?.lightness !== undefined ? themeOverride.lightness : child.lightness;
        const a = themeOverride?.alpha !== undefined ? themeOverride.alpha : (child.alpha ?? 100);
        themeValues[theme.id] = { hue: h, saturation: s, lightness: l, alpha: a };
      }

      newTokens.push({
        id: tokenId,
        name: tokenName,
        type: 'color',
        groupId: targetGroupId,
        projectId,
        pageId: parent.pageId || child.pageId,
        themeValues,
        hue: child.hue,
        saturation: child.saturation,
        lightness: child.lightness,
        alpha: child.alpha ?? 100,
        createdAt: Date.now(),
      });
      existingTokenIds.add(tokenId);

      const existingAssignments = child.tokenAssignments || {};
      const patchedAssignments = { ...existingAssignments };
      let needsPatch = false;
      for (const theme of themes) {
        const themeTokens = patchedAssignments[theme.id] || [];
        if (!themeTokens.includes(tokenId)) {
          patchedAssignments[theme.id] = [...themeTokens, tokenId];
          needsPatch = true;
        }
      }
      if (needsPatch) {
        nodePatches.set(child.id, { tokenAssignments: patchedAssignments });
      }
    }
  }

  const patchedNodes = nodePatches.size > 0
    ? nodes.map((n: any) => {
      const patch = nodePatches.get(n.id);
      return patch ? { ...n, ...patch } : n;
    })
    : nodes;

  if (newTokens.length > 0) {
    console.log(`🔧 Reconstructed ${newTokens.length} auto-assigned token(s) from node metadata`);
    if (newGroups.length > 0) {
      console.log(`🔧 Reconstructed ${newGroups.length} auto-assign group(s)`);
    }
  }

  return {
    tokens: [...tokens, ...newTokens],
    groups: [...groups, ...newGroups],
    nodes: patchedNodes,
  };
}
