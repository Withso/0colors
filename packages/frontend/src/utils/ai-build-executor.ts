// ═══════════════════════════════════════════════════════════════════
// AI Build Mode — Tool Execution Bridge
// Receives parsed tool calls from the AI and executes them by
// calling the appropriate App.tsx mutation functions.
// ═══════════════════════════════════════════════════════════════════

import type { ToolCall, ToolResult, ToolName } from './ai-build-tools';
import type { ColorNode, DesignToken, TokenGroup, Theme, Page, NodeAdvancedLogic } from '../types';

// ── Mutation Context ───────────────────────────────────────────────
// Provided by App.tsx — references to all mutation functions and
// read-only state for validation.

export interface MutationContext {
  // ── Programmatic creation (return new entity ID) ──
  createNodeProgrammatic: (params: {
    type: 'color' | 'palette' | 'spacing' | 'token_prefix' | 'token_child';
    colorSpace?: 'hsl' | 'rgb' | 'oklch' | 'hct';
    color?: Partial<Pick<ColorNode, 'hue' | 'saturation' | 'lightness' | 'alpha' | 'red' | 'green' | 'blue' | 'oklchL' | 'oklchC' | 'oklchH' | 'hctH' | 'hctC' | 'hctT'>>;
    parentId?: string;
    name?: string;
    palette?: {
      shadeCount?: number;
      lightnessStart?: number;
      lightnessEnd?: number;
      curveType?: string;
      namingPattern?: string;
      hueShift?: number;
      saturationMode?: string;
    };
    spacing?: { value?: number; unit?: string };
  }) => string; // returns nodeId

  // ── Node mutations ──
  updateNode: (id: string, updates: Partial<ColorNode>) => void;
  deleteNode: (id: string) => void;

  // ── Token mutations ──
  addToken: (name?: string, groupId?: string | null, projectId?: string, tokenType?: string, pageId?: string) => string;
  updateToken: (id: string, updates: Partial<DesignToken>) => void;
  deleteToken: (id: string) => void;
  assignTokenToNode: (nodeId: string, tokenId: string, isAssigned: boolean) => void;

  // ── Theme/Page mutations ──
  createThemeProgrammatic: (name?: string) => string; // returns themeId
  createPageProgrammatic: (name?: string) => string;  // returns pageId

  // ── Advanced Logic ──
  setAdvancedLogic: (logic: NodeAdvancedLogic[]) => void;

  // ── Context ──
  getCurrentProjectContext: () => string;

  // ── Read-only state (for validation) ──
  allNodes: ColorNode[];
  tokens: DesignToken[];
  groups: TokenGroup[];
  themes: Theme[];
  pages: Page[];
  advancedLogic: NodeAdvancedLogic[];
  activeProjectId: string;
  activePageId: string;
  activeThemeId: string;
}

// ── Tool Execution ─────────────────────────────────────────────────

export function executeToolCall(
  toolCall: ToolCall,
  ctx: MutationContext,
): ToolResult {
  const { id, name, arguments: args } = toolCall;

  try {
    switch (name as ToolName) {
      case 'create_node':
        return executeCreateNode(id, args, ctx);
      case 'update_node':
        return executeUpdateNode(id, args, ctx);
      case 'delete_node':
        return executeDeleteNode(id, args, ctx);
      case 'create_token':
        return executeCreateToken(id, args, ctx);
      case 'update_token':
        return executeUpdateToken(id, args, ctx);
      case 'delete_token':
        return executeDeleteToken(id, args, ctx);
      case 'assign_token_to_node':
        return executeAssignToken(id, args, ctx);
      case 'create_theme':
        return executeCreateTheme(id, args, ctx);
      case 'create_page':
        return executeCreatePage(id, args, ctx);
      case 'set_advanced_logic':
        return executeSetAdvancedLogic(id, args, ctx);
      case 'get_project_state':
        return executeGetProjectState(id, ctx);
      default:
        return { toolCallId: id, success: false, error: `Unknown tool: ${name}` };
    }
  } catch (err: any) {
    return { toolCallId: id, success: false, error: err?.message || 'Unknown error during tool execution' };
  }
}

// ── Individual tool executors ──────────────────────────────────────

function executeCreateNode(id: string, args: any, ctx: MutationContext): ToolResult {
  const type = args.type || 'color';
  if (!['color', 'palette', 'spacing', 'token_prefix', 'token_child'].includes(type)) {
    return { toolCallId: id, success: false, error: `Invalid node type: ${type}` };
  }

  const nodeId = ctx.createNodeProgrammatic({
    type,
    colorSpace: args.colorSpace || 'hsl',
    color: args.color,
    parentId: args.parentId,
    name: args.name,
    palette: args.palette,
    spacing: args.spacing,
  });

  return {
    toolCallId: id,
    success: true,
    result: { nodeId, message: `Created ${type} node${args.name ? ` "${args.name}"` : ''}` },
  };
}

function executeUpdateNode(id: string, args: any, ctx: MutationContext): ToolResult {
  const { nodeId } = args;
  if (!nodeId) return { toolCallId: id, success: false, error: 'nodeId is required' };

  const node = ctx.allNodes.find(n => n.id === nodeId);
  if (!node) return { toolCallId: id, success: false, error: `Node not found: ${nodeId}` };

  const updates: Partial<ColorNode> = {};

  // Color values
  if (args.color) {
    if (args.color.hue !== undefined) updates.hue = args.color.hue;
    if (args.color.saturation !== undefined) updates.saturation = args.color.saturation;
    if (args.color.lightness !== undefined) updates.lightness = args.color.lightness;
    if (args.color.alpha !== undefined) updates.alpha = args.color.alpha;
    if (args.color.red !== undefined) updates.red = args.color.red;
    if (args.color.green !== undefined) updates.green = args.color.green;
    if (args.color.blue !== undefined) updates.blue = args.color.blue;
    if (args.color.oklchL !== undefined) updates.oklchL = args.color.oklchL;
    if (args.color.oklchC !== undefined) updates.oklchC = args.color.oklchC;
    if (args.color.oklchH !== undefined) updates.oklchH = args.color.oklchH;
    if (args.color.hctH !== undefined) updates.hctH = args.color.hctH;
    if (args.color.hctC !== undefined) updates.hctC = args.color.hctC;
    if (args.color.hctT !== undefined) updates.hctT = args.color.hctT;
  }

  // Name
  if (args.name !== undefined) {
    updates.referenceName = args.name;
    updates.referenceNameLocked = true;
  }

  // Color space
  if (args.colorSpace) updates.colorSpace = args.colorSpace;

  // Lock flags
  if (args.locks) {
    if (args.locks.hue !== undefined) updates.lockHue = args.locks.hue;
    if (args.locks.saturation !== undefined) updates.lockSaturation = args.locks.saturation;
    if (args.locks.lightness !== undefined) updates.lockLightness = args.locks.lightness;
    if (args.locks.alpha !== undefined) updates.lockAlpha = args.locks.alpha;
  }

  // Diff flags
  if (args.diffs) {
    if (args.diffs.hue !== undefined) updates.diffHue = args.diffs.hue;
    if (args.diffs.saturation !== undefined) updates.diffSaturation = args.diffs.saturation;
    if (args.diffs.lightness !== undefined) updates.diffLightness = args.diffs.lightness;
    if (args.diffs.alpha !== undefined) updates.diffAlpha = args.diffs.alpha;
  }

  // Spacing
  if (args.spacing) {
    if (args.spacing.value !== undefined) updates.spacingValue = args.spacing.value;
    if (args.spacing.unit !== undefined) updates.spacingUnit = args.spacing.unit;
  }

  ctx.updateNode(nodeId, updates);
  return { toolCallId: id, success: true, result: { message: `Updated node ${nodeId}` } };
}

function executeDeleteNode(id: string, args: any, ctx: MutationContext): ToolResult {
  const { nodeId } = args;
  if (!nodeId) return { toolCallId: id, success: false, error: 'nodeId is required' };

  const node = ctx.allNodes.find(n => n.id === nodeId);
  if (!node) return { toolCallId: id, success: false, error: `Node not found: ${nodeId}` };

  // Count descendants
  const descendants = ctx.allNodes.filter(n => {
    let current = n;
    while (current.parentId) {
      if (current.parentId === nodeId) return true;
      current = ctx.allNodes.find(p => p.id === current.parentId) as ColorNode;
      if (!current) break;
    }
    return false;
  });

  ctx.deleteNode(nodeId);
  return { toolCallId: id, success: true, result: { deletedCount: 1 + descendants.length } };
}

function executeCreateToken(id: string, args: any, ctx: MutationContext): ToolResult {
  const { name, type, groupName, value } = args;
  if (!name) return { toolCallId: id, success: false, error: 'Token name is required' };
  if (!type) return { toolCallId: id, success: false, error: 'Token type is required' };

  // Find or create group
  let groupId: string | null = null;
  if (groupName) {
    const existingGroup = ctx.groups.find(
      g => g.name === groupName && g.projectId === ctx.activeProjectId && g.pageId === ctx.activePageId,
    );
    groupId = existingGroup?.id || null;
    // If group doesn't exist, addToken will need to handle group creation
    // For now, pass null and let the token be ungrouped if group not found
  }

  const tokenId = ctx.addToken(name, groupId, ctx.activeProjectId, type, ctx.activePageId);

  // Set initial values if provided
  if (value && tokenId) {
    const themeValues: Record<string, any> = {};
    for (const theme of ctx.themes) {
      themeValues[theme.id] = { ...value };
    }
    ctx.updateToken(tokenId, { themeValues });
  }

  return {
    toolCallId: id,
    success: true,
    result: { tokenId, message: `Created ${type} token "${name}"` },
  };
}

function executeUpdateToken(id: string, args: any, ctx: MutationContext): ToolResult {
  const { tokenId } = args;
  if (!tokenId) return { toolCallId: id, success: false, error: 'tokenId is required' };

  const token = ctx.tokens.find(t => t.id === tokenId);
  if (!token) return { toolCallId: id, success: false, error: `Token not found: ${tokenId}` };

  const updates: Partial<DesignToken> = {};
  if (args.name !== undefined) updates.name = args.name;

  if (args.value) {
    // Update themeValues for active theme
    const currentThemeValues = token.themeValues || {};
    updates.themeValues = {
      ...currentThemeValues,
      [ctx.activeThemeId]: { ...(currentThemeValues[ctx.activeThemeId] || {}), ...args.value },
    };
  }

  ctx.updateToken(tokenId, updates);
  return { toolCallId: id, success: true, result: { message: `Updated token ${tokenId}` } };
}

function executeDeleteToken(id: string, args: any, ctx: MutationContext): ToolResult {
  const { tokenId } = args;
  if (!tokenId) return { toolCallId: id, success: false, error: 'tokenId is required' };

  const token = ctx.tokens.find(t => t.id === tokenId);
  if (!token) return { toolCallId: id, success: false, error: `Token not found: ${tokenId}` };

  ctx.deleteToken(tokenId);
  return { toolCallId: id, success: true, result: { message: `Deleted token "${token.name}"` } };
}

function executeAssignToken(id: string, args: any, ctx: MutationContext): ToolResult {
  const { tokenId, nodeId, assign } = args;
  if (!tokenId || !nodeId) return { toolCallId: id, success: false, error: 'tokenId and nodeId are required' };
  if (assign === undefined) return { toolCallId: id, success: false, error: 'assign (true/false) is required' };

  const token = ctx.tokens.find(t => t.id === tokenId);
  if (!token) return { toolCallId: id, success: false, error: `Token not found: ${tokenId}` };

  const node = ctx.allNodes.find(n => n.id === nodeId);
  if (!node) return { toolCallId: id, success: false, error: `Node not found: ${nodeId}` };

  ctx.assignTokenToNode(nodeId, tokenId, assign);
  return {
    toolCallId: id,
    success: true,
    result: { message: `${assign ? 'Assigned' : 'Unassigned'} token "${token.name}" ${assign ? 'to' : 'from'} node` },
  };
}

function executeCreateTheme(id: string, args: any, ctx: MutationContext): ToolResult {
  const themeId = ctx.createThemeProgrammatic(args.name);
  return {
    toolCallId: id,
    success: true,
    result: { themeId, message: `Created theme${args.name ? ` "${args.name}"` : ''}` },
  };
}

function executeCreatePage(id: string, args: any, ctx: MutationContext): ToolResult {
  const pageId = ctx.createPageProgrammatic(args.name);
  return {
    toolCallId: id,
    success: true,
    result: { pageId, message: `Created page${args.name ? ` "${args.name}"` : ''}` },
  };
}

function executeSetAdvancedLogic(id: string, args: any, ctx: MutationContext): ToolResult {
  const { nodeId, channels } = args;
  if (!nodeId) return { toolCallId: id, success: false, error: 'nodeId is required' };
  if (!channels || Object.keys(channels).length === 0) {
    return { toolCallId: id, success: false, error: 'At least one channel expression is required' };
  }

  const node = ctx.allNodes.find(n => n.id === nodeId);
  if (!node) return { toolCallId: id, success: false, error: `Node not found: ${nodeId}` };

  // Build logic entry — for now, store raw expression strings
  // The AdvancedPopup's expression parser will need to be used to convert
  // string expressions to ExpressionToken arrays. This is a Phase 2 task.
  // For now, we create a placeholder structure.
  const channelLogic: Record<string, any> = {};
  for (const [channel, expression] of Object.entries(channels)) {
    channelLogic[channel] = {
      rows: [{
        id: `row-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        tokens: [], // Will be populated by expression parser in Phase 2
        enabled: true,
        _rawExpression: expression, // Temporary: raw string for Phase 2 parsing
      }],
      fallbackMode: 'default' as const,
    };
  }

  // Update or create logic entry for this node
  const existingIdx = ctx.advancedLogic.findIndex(l => l.nodeId === nodeId);
  const newLogic = [...ctx.advancedLogic];
  if (existingIdx >= 0) {
    newLogic[existingIdx] = {
      ...newLogic[existingIdx],
      channels: { ...(newLogic[existingIdx].channels || {}), ...channelLogic },
    };
  } else {
    newLogic.push({ nodeId, channels: channelLogic });
  }
  ctx.setAdvancedLogic(newLogic);

  return {
    toolCallId: id,
    success: true,
    result: { message: `Set advanced logic on ${Object.keys(channels).length} channels for node ${nodeId}` },
  };
}

function executeGetProjectState(id: string, ctx: MutationContext): ToolResult {
  const context = ctx.getCurrentProjectContext();
  return {
    toolCallId: id,
    success: true,
    result: { context },
  };
}
