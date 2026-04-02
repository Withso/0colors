// ═══════════════════════════════════════════════════════════════════
// AI Build Mode — Tool Schema Definitions
// Defines the tools the AI can call in Build Mode to create and
// modify design system entities (nodes, tokens, themes, etc.)
// Supports both Anthropic and OpenAI tool formats.
// ═══════════════════════════════════════════════════════════════════

// ── Tool call types ────────────────────────────────────────────────

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
}

export interface ToolResult {
  toolCallId: string;
  success: boolean;
  result?: Record<string, any>;
  error?: string;
}

export type ToolName =
  | 'create_node'
  | 'update_node'
  | 'delete_node'
  | 'create_token'
  | 'update_token'
  | 'delete_token'
  | 'assign_token_to_node'
  | 'create_theme'
  | 'create_page'
  | 'set_advanced_logic'
  | 'get_project_state';

// ── Schema definitions (provider-agnostic) ─────────────────────────

interface ToolParam {
  type: string;
  description: string;
  enum?: string[];
  properties?: Record<string, ToolParam>;
  items?: ToolParam;
  required?: string[];
  default?: any;
}

interface ToolSchema {
  name: ToolName;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, ToolParam>;
    required: string[];
  };
}

const TOOL_SCHEMAS: ToolSchema[] = [
  {
    name: 'create_node',
    description: 'Create a new node on the canvas. Supports color nodes, palette nodes (auto-generates shades with tokens), spacing nodes, and token nodes. Returns the new node ID.',
    parameters: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          description: 'Node type to create',
          enum: ['color', 'palette', 'spacing', 'token_prefix', 'token_child'],
        },
        colorSpace: {
          type: 'string',
          description: 'Color space for the node (required for color and palette types)',
          enum: ['hsl', 'rgb', 'oklch', 'hct'],
        },
        color: {
          type: 'object',
          description: 'Color values. Use the channels matching the colorSpace. For HSL: hue (0-360), saturation (0-100), lightness (0-100), alpha (0-100).',
          properties: {
            hue: { type: 'number', description: 'HSL hue (0-360)' },
            saturation: { type: 'number', description: 'HSL saturation (0-100)' },
            lightness: { type: 'number', description: 'HSL lightness (0-100)' },
            alpha: { type: 'number', description: 'Alpha/opacity (0-100, default 100)' },
            red: { type: 'number', description: 'RGB red (0-255)' },
            green: { type: 'number', description: 'RGB green (0-255)' },
            blue: { type: 'number', description: 'RGB blue (0-255)' },
            oklchL: { type: 'number', description: 'OKLCH lightness (0-100)' },
            oklchC: { type: 'number', description: 'OKLCH chroma (0-100)' },
            oklchH: { type: 'number', description: 'OKLCH hue (0-360)' },
            hctH: { type: 'number', description: 'HCT hue (0-360)' },
            hctC: { type: 'number', description: 'HCT chroma (0-120)' },
            hctT: { type: 'number', description: 'HCT tone (0-100)' },
          },
        },
        parentId: {
          type: 'string',
          description: 'Parent node ID to create this as a child node. If omitted, creates a root node.',
        },
        name: {
          type: 'string',
          description: 'Display name for the node (referenceName). If omitted, auto-generated from color values.',
        },
        palette: {
          type: 'object',
          description: 'Palette configuration (only for type "palette")',
          properties: {
            shadeCount: { type: 'number', description: 'Number of shades (5-20, default 10)' },
            lightnessStart: { type: 'number', description: 'Lightest shade lightness (0-100, default 95)' },
            lightnessEnd: { type: 'number', description: 'Darkest shade lightness (0-100, default 10)' },
            curveType: {
              type: 'string',
              description: 'Lightness distribution curve',
              enum: ['linear', 'ease-in', 'ease-out', 'ease-in-out', 'sine', 'exponential', 'material'],
            },
            namingPattern: {
              type: 'string',
              description: 'How shades are numbered',
              enum: ['1-9', '10-90', '100-900', 'a-z'],
            },
            hueShift: { type: 'number', description: 'Hue rotation across shades (-30 to 30, default 0)' },
            saturationMode: {
              type: 'string',
              description: 'How saturation varies across shades',
              enum: ['constant', 'auto', 'manual'],
            },
          },
        },
        spacing: {
          type: 'object',
          description: 'Spacing configuration (only for type "spacing")',
          properties: {
            value: { type: 'number', description: 'Spacing value (e.g., 16)' },
            unit: { type: 'string', description: 'CSS unit', enum: ['px', 'rem', 'em'] },
          },
        },
      },
      required: ['type'],
    },
  },
  {
    name: 'update_node',
    description: 'Update properties of an existing node. Can change color values, name, color space, lock/diff flags, palette settings, or spacing values.',
    parameters: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'ID of the node to update' },
        color: {
          type: 'object',
          description: 'New color values (only the channels you want to change)',
          properties: {
            hue: { type: 'number', description: 'HSL hue (0-360)' },
            saturation: { type: 'number', description: 'HSL saturation (0-100)' },
            lightness: { type: 'number', description: 'HSL lightness (0-100)' },
            alpha: { type: 'number', description: 'Alpha/opacity (0-100)' },
            red: { type: 'number', description: 'RGB red (0-255)' },
            green: { type: 'number', description: 'RGB green (0-255)' },
            blue: { type: 'number', description: 'RGB blue (0-255)' },
          },
        },
        name: { type: 'string', description: 'New display name (referenceName)' },
        colorSpace: { type: 'string', description: 'Change color space', enum: ['hsl', 'rgb', 'oklch', 'hct'] },
        locks: {
          type: 'object',
          description: 'Lock flags — locked channels stay fixed when parent changes',
          properties: {
            hue: { type: 'boolean', description: 'Lock hue channel' },
            saturation: { type: 'boolean', description: 'Lock saturation channel' },
            lightness: { type: 'boolean', description: 'Lock lightness channel' },
            alpha: { type: 'boolean', description: 'Lock alpha channel' },
          },
        },
        diffs: {
          type: 'object',
          description: 'Diff flags — when enabled, child value = parent + offset',
          properties: {
            hue: { type: 'boolean', description: 'Enable hue offset from parent' },
            saturation: { type: 'boolean', description: 'Enable saturation offset from parent' },
            lightness: { type: 'boolean', description: 'Enable lightness offset from parent' },
            alpha: { type: 'boolean', description: 'Enable alpha offset from parent' },
          },
        },
        spacing: {
          type: 'object',
          description: 'Update spacing values (only for spacing nodes)',
          properties: {
            value: { type: 'number', description: 'New spacing value' },
            unit: { type: 'string', description: 'CSS unit', enum: ['px', 'rem', 'em'] },
          },
        },
      },
      required: ['nodeId'],
    },
  },
  {
    name: 'delete_node',
    description: 'Delete a node and all its descendants. Also cleans up associated tokens and advanced logic.',
    parameters: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'ID of the node to delete' },
      },
      required: ['nodeId'],
    },
  },
  {
    name: 'create_token',
    description: 'Create a new design token. Supports 8 types: color, spacing, radius, fontSize, lineHeight, fontWeight, shadow, opacity. Returns the token ID.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Token name (e.g., "primary-500", "spacing-lg")' },
        type: {
          type: 'string',
          description: 'Token type',
          enum: ['color', 'spacing', 'radius', 'fontSize', 'lineHeight', 'fontWeight', 'shadow', 'opacity'],
        },
        groupName: {
          type: 'string',
          description: 'Name of the token group. Creates the group if it doesn\'t exist.',
        },
        value: {
          type: 'object',
          description: 'Initial value for the token. Structure depends on type: color={hue,saturation,lightness,alpha}, spacing/radius/fontSize={value,unit}, fontWeight={fontWeight}, lineHeight={lineHeight}, shadow={shadowValue}, opacity={opacity}',
          properties: {
            hue: { type: 'number', description: 'HSL hue (for color tokens)' },
            saturation: { type: 'number', description: 'HSL saturation (for color tokens)' },
            lightness: { type: 'number', description: 'HSL lightness (for color tokens)' },
            alpha: { type: 'number', description: 'Alpha (for color tokens, default 100)' },
            value: { type: 'number', description: 'Numeric value (for spacing/radius/fontSize tokens)' },
            unit: { type: 'string', description: 'CSS unit (for spacing/radius/fontSize tokens)' },
            fontWeight: { type: 'number', description: 'Font weight (100-900, for fontWeight tokens)' },
            lineHeight: { type: 'number', description: 'Line height (for lineHeight tokens)' },
            shadowValue: { type: 'string', description: 'CSS shadow value (for shadow tokens)' },
            opacity: { type: 'number', description: 'Opacity 0-100 (for opacity tokens)' },
          },
        },
      },
      required: ['name', 'type'],
    },
  },
  {
    name: 'update_token',
    description: 'Update an existing design token\'s name, type, or values.',
    parameters: {
      type: 'object',
      properties: {
        tokenId: { type: 'string', description: 'ID of the token to update' },
        name: { type: 'string', description: 'New token name' },
        value: {
          type: 'object',
          description: 'New values (structure depends on token type)',
          properties: {
            hue: { type: 'number', description: 'HSL hue' },
            saturation: { type: 'number', description: 'HSL saturation' },
            lightness: { type: 'number', description: 'HSL lightness' },
            alpha: { type: 'number', description: 'Alpha' },
            value: { type: 'number', description: 'Numeric value' },
            unit: { type: 'string', description: 'CSS unit' },
          },
        },
      },
      required: ['tokenId'],
    },
  },
  {
    name: 'delete_token',
    description: 'Delete a design token and remove all references to it from nodes.',
    parameters: {
      type: 'object',
      properties: {
        tokenId: { type: 'string', description: 'ID of the token to delete' },
      },
      required: ['tokenId'],
    },
  },
  {
    name: 'assign_token_to_node',
    description: 'Assign or unassign a token to a node. When assigning, the token\'s value is updated to match the node\'s current color. One token can only be assigned to one node per theme.',
    parameters: {
      type: 'object',
      properties: {
        tokenId: { type: 'string', description: 'ID of the token' },
        nodeId: { type: 'string', description: 'ID of the node' },
        assign: { type: 'boolean', description: 'true to assign, false to unassign' },
      },
      required: ['tokenId', 'nodeId', 'assign'],
    },
  },
  {
    name: 'create_theme',
    description: 'Create a new non-primary theme. The new theme inherits from the primary theme. Returns the new theme ID.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Theme name (e.g., "Dark", "High Contrast"). Auto-generated if omitted.' },
      },
      required: [],
    },
  },
  {
    name: 'create_page',
    description: 'Create a new page in the current project. Returns the new page ID.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Page name. Auto-generated if omitted.' },
      },
      required: [],
    },
  },
  {
    name: 'set_advanced_logic',
    description: 'Set advanced logic expressions for a node\'s color channels. Each channel can have a mathematical expression that computes the channel value based on references to other nodes, tokens, and functions like clamp, lerp, contrast. The expression syntax supports: numbers, operators (+,-,*,/,>,<,>=,<=,==,!=), references (@NodeName.H, @Parent.S), functions (clamp, lerp, min, max, abs, round, contrast), conditionals (if/then/else), and boolean logic (AND, OR, NOT).',
    parameters: {
      type: 'object',
      properties: {
        nodeId: { type: 'string', description: 'ID of the node to set logic for' },
        channels: {
          type: 'object',
          description: 'Map of channel name to expression. Channel names: hue, saturation, lightness, alpha, red, green, blue, oklchL, oklchC, oklchH, hctH, hctC, hctT.',
          properties: {
            hue: { type: 'string', description: 'Expression for hue channel (e.g., "@Parent.H + 30")' },
            saturation: { type: 'string', description: 'Expression for saturation channel' },
            lightness: { type: 'string', description: 'Expression for lightness channel' },
            alpha: { type: 'string', description: 'Expression for alpha channel' },
          },
        },
      },
      required: ['nodeId', 'channels'],
    },
  },
  {
    name: 'get_project_state',
    description: 'Get the current project state including all nodes, tokens, themes, and advanced logic. Use this to refresh your understanding of the project after making changes.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
];

// ── Format converters ──────────────────────────────────────────────

/** Get tool definitions in Anthropic format */
export function getAnthropicTools(): Array<{
  name: string;
  description: string;
  input_schema: Record<string, any>;
}> {
  return TOOL_SCHEMAS.map(t => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }));
}

/** Get tool definitions in OpenAI format */
export function getOpenAITools(): Array<{
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, any> };
}> {
  return TOOL_SCHEMAS.map(t => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

// ── Human-readable action descriptions ─────────────────────────────

export function describeToolCall(name: string, args: Record<string, any>): string {
  switch (name) {
    case 'create_node': {
      const type = args.type || 'color';
      const cs = args.colorSpace || 'hsl';
      const c = args.color || {};
      const nm = args.name ? `"${args.name}"` : '';
      if (type === 'palette') {
        const shades = args.palette?.shadeCount || 10;
        return `Create palette ${nm} (${cs.toUpperCase()}, ${shades} shades)`.trim();
      }
      if (type === 'spacing') {
        const v = args.spacing?.value || 0;
        const u = args.spacing?.unit || 'px';
        return `Create spacing node ${nm} (${v}${u})`.trim();
      }
      if (type === 'token_prefix' || type === 'token_child') {
        return `Create token node ${nm}`.trim();
      }
      const colorStr = cs === 'hsl' ? `hsl(${c.hue ?? 0}, ${c.saturation ?? 70}%, ${c.lightness ?? 50}%)` : cs.toUpperCase();
      return `Create color node ${nm} (${colorStr})`.trim();
    }
    case 'update_node':
      return `Update node ${args.nodeId}${args.name ? ` → "${args.name}"` : ''}${args.color ? ' (color change)' : ''}`;
    case 'delete_node':
      return `Delete node ${args.nodeId} and descendants`;
    case 'create_token':
      return `Create ${args.type || 'color'} token "${args.name}"${args.groupName ? ` in group "${args.groupName}"` : ''}`;
    case 'update_token':
      return `Update token ${args.tokenId}${args.name ? ` → "${args.name}"` : ''}`;
    case 'delete_token':
      return `Delete token ${args.tokenId}`;
    case 'assign_token_to_node':
      return `${args.assign ? 'Assign' : 'Unassign'} token ${args.tokenId} ${args.assign ? 'to' : 'from'} node ${args.nodeId}`;
    case 'create_theme':
      return `Create theme${args.name ? ` "${args.name}"` : ''}`;
    case 'create_page':
      return `Create page${args.name ? ` "${args.name}"` : ''}`;
    case 'set_advanced_logic': {
      const channels = Object.keys(args.channels || {});
      return `Set advanced logic on node ${args.nodeId} (${channels.join(', ')})`;
    }
    case 'get_project_state':
      return 'Refresh project state';
    default:
      return `${name}(${JSON.stringify(args).slice(0, 60)}...)`;
  }
}

export { TOOL_SCHEMAS };
