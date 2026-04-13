export interface ColorNode {
  id: string;
  colorSpace: 'hsl' | 'rgb' | 'oklch' | 'hct' | 'hex'; // Color space mode
  hue: number; // 0-360
  saturation: number; // 0-100
  lightness: number; // 0-100
  alpha: number; // 0-100 (percentage)
  position: { x: number; y: number };
  parentId: string | null;
  hueOffset: number; // Difference from parent's hue
  saturationOffset: number; // Difference from parent's saturation
  lightnessOffset: number; // Difference from parent's lightness
  alphaOffset: number; // Difference from parent's alpha
  tokenId: string | null; // Reference to assigned design token (legacy)
  tokenIds?: string[]; // References to assigned design tokens (legacy - theme-agnostic)
  tokenAssignments?: { [themeId: string]: string[] }; // Theme-specific token assignments
  themeOverrides?: { [themeId: string]: {
    hue: number;
    saturation: number;
    lightness: number;
    alpha: number;
    red?: number;
    green?: number;
    blue?: number;
    oklchL?: number;
    oklchC?: number;
    oklchH?: number;
    hctH?: number;
    hctC?: number;
    hctT?: number;
    hexValue?: string;
  }}; // Theme-specific color overrides (when unlinked from primary)
  width?: number; // Custom width in pixels (default: 240)
  projectId: string; // Reference to parent project
  pageId: string; // Reference to parent page
  
  // RGB properties (for colorSpace === 'rgb')
  red?: number; // 0-255
  green?: number; // 0-255
  blue?: number; // 0-255
  redOffset?: number; // Difference from parent's red
  greenOffset?: number; // Difference from parent's green
  blueOffset?: number; // Difference from parent's blue
  
  // OKLCH properties (for colorSpace === 'oklch')
  oklchL?: number; // 0-100 (lightness)
  oklchC?: number; // 0-100 (chroma, scaled from 0-0.4)
  oklchH?: number; // 0-360 (hue)
  oklchLOffset?: number; // Difference from parent's oklchL
  oklchCOffset?: number; // Difference from parent's oklchC
  oklchHOffset?: number; // Difference from parent's oklchH
  
  // HCT properties (for colorSpace === 'hct')
  hctH?: number; // 0-360 (hue)
  hctC?: number; // 0-100 (chroma, scaled)
  hctT?: number; // 0-100 (tone)
  hctHOffset?: number; // Difference from parent's hctH
  hctCOffset?: number; // Difference from parent's hctC
  hctTOffset?: number; // Difference from parent's hctT
  
  // Lock states - when locked, property doesn't change with parent
  lockHue?: boolean;
  lockSaturation?: boolean;
  lockLightness?: boolean;
  lockAlpha?: boolean;
  lockRed?: boolean;
  lockGreen?: boolean;
  lockBlue?: boolean;
  lockOklchL?: boolean;
  lockOklchC?: boolean;
  lockOklchH?: boolean;
  lockHctH?: boolean;
  lockHctC?: boolean;
  lockHctT?: boolean;
  
  // Hex lock state - when locked, hex value is manual; when unlocked, inherits from parent
  hexLocked?: boolean;
  hexValue?: string; // Stored hex value for hex nodes (e.g., "#FF5733" or "#FF5733FF")
  
  // Diff states - when enabled (default), maintains offset; when disabled, matches parent exactly
  diffHue?: boolean;
  diffSaturation?: boolean;
  diffLightness?: boolean;
  diffAlpha?: boolean;
  diffRed?: boolean;
  diffGreen?: boolean;
  diffBlue?: boolean;
  diffOklchL?: boolean;
  diffOklchC?: boolean;
  diffOklchH?: boolean;
  diffHctH?: boolean;
  diffHctC?: boolean;
  diffHctT?: boolean;
  
  // UI state
  isExpanded?: boolean; // Whether the node details are expanded or collapsed
  
  // Reference name properties
  referenceName?: string; // The user-visible prefix name (auto-generated from color or manually set)
  referenceNameLocked?: boolean; // True when user has manually renamed (prevents auto-update from color changes and parent propagation)

  // Auto-assign token properties (for a parent node to auto-create tokens for its direct children)
  autoAssignEnabled?: boolean; // Whether auto-assign is active on this node's direct children
  autoAssignPrefix?: string; // Token name prefix (defaults to node's reference name at time of enabling)
  autoAssignSuffix?: string; // Suffix numbering pattern: '1-9', '10-90', '100-900', 'a-z', or 'custom-N' where N is the increment
  autoAssignStartFrom?: number; // Starting value for numeric suffix sequences (e.g. 0 for 0,10,20... or 50 for 50,60,70...). Defaults to the increment value for backward compatibility.
  autoAssignGroupId?: string | null; // Group ID where auto-assigned tokens are placed
  autoAssignedTokenId?: string; // Token ID that was auto-assigned to THIS node (set on child nodes by the parent's auto-assign)
  autoAssignExcluded?: boolean; // When true, this child node is excluded from its parent's auto-assign (user opted out via delete confirmation)

  // Palette node properties
  isPalette?: boolean; // Whether this is a palette generator node
  paletteName?: string; // Name of the palette
  paletteNameLocked?: boolean; // Whether the palette name is locked from auto-updates
  paletteColorFormat?: 'HEX' | 'HSLA' | 'OKLCH' | 'RGBA'; // Display format
  paletteLightnessMode?: 'linear' | 'curve'; // Lightness distribution mode
  paletteLightnessStart?: number; // Starting lightness (0-100)
  paletteLightnessEnd?: number; // Ending lightness (0-100)
  paletteNamingPattern?: '1-9' | '10-90' | '100-900' | 'a-z'; // Naming pattern for shades
  paletteShadeCount?: number; // Number of shades (5-20)
  paletteCurveType?: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'sine' | 'exponential' | 'material' | 'custom'; // Distribution curve type
  paletteCustomCurvePoints?: number[]; // Custom per-shade lightness values (0-1 normalized), length = shadeCount
  paletteSaturationMode?: 'constant' | 'auto' | 'manual'; // Saturation distribution mode
  paletteSaturationStart?: number; // Starting saturation (0-100) for manual mode
  paletteSaturationEnd?: number; // Ending saturation (0-100) for manual mode
  paletteHueShift?: number; // Hue rotation across scale (-30 to 30)
  paletteExpandedSections?: Record<string, boolean>; // Accordion expand/collapse state per section
  
  // Spacing node properties
  isSpacing?: boolean; // Whether this is a spacing value node
  spacingValue?: number; // Numeric spacing value
  spacingUnit?: 'px' | 'rem' | 'em'; // Unit for spacing
  spacingName?: string; // Optional name for the spacing value

  // Token node properties
  isTokenNode?: boolean; // Whether this is a token node (a node that IS a token itself)
  isTokenPrefix?: boolean; // Whether this token node is a prefix/root node (no token section, acts as namespace)
  tokenNodeSuffix?: string; // Editable suffix for child token nodes (e.g., "primary", "text")
  tokenGroupId?: string; // Reference to the token group created for this prefix node
  ownTokenId?: string; // For token node children: the ID of the auto-created token this node represents
  valueTokenId?: string; // For token node children: the ID of the token providing the value (alias/reference) — legacy / primary fallback
  valueTokenAssignments?: { [themeId: string]: string }; // Theme-specific value token assignments for token nodes (mirrors tokenAssignments pattern)

  // Visibility per theme: false=hidden, true=visible override, undefined=inherit from primary
  themeVisibility?: Record<string, boolean>;

  // Dev Mode: webhook input flag — when true, this node accepts incoming webhook color values
  isWebhookInput?: boolean;

  // Sync metadata — foundation for per-entity sync and future multi-user collaboration
  updatedAt?: number;  // Timestamp of last modification (ms since epoch)
  updatedBy?: string;  // userId or clientId of who made the change
}

// Token type enumeration
export type TokenType = 'color' | 'spacing' | 'radius' | 'fontSize' | 'lineHeight' | 'fontWeight' | 'shadow' | 'opacity';

// Base token interface
export interface DesignToken {
  id: string;
  name: string;
  type?: TokenType; // Type of token - optional until assigned to a node
  groupId: string | null; // Reference to parent group
  projectId: string; // Reference to parent project
  pageId: string; // Reference to parent page
  themeId?: string; // DEPRECATED - for backward compatibility only
  
  // Theme-specific values - new architecture where tokens are shared across themes
  themeValues?: {
    [themeId: string]: {
      // Color-specific properties (only for type === 'color')
      hue?: number; // 0-360
      saturation?: number; // 0-100
      lightness?: number; // 0-100
      alpha?: number; // 0-100 (percentage)
      
      // Spacing/Radius/FontSize properties (for numeric values)
      value?: number; // Numeric value
      unit?: 'px' | 'rem' | 'em' | '%'; // Unit for spacing, radius, fontSize
      
      // Font weight (for type === 'fontWeight')
      fontWeight?: 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;
      
      // Line height (for type === 'lineHeight')
      lineHeight?: number; // Can be unitless or with unit
      
      // Shadow (for type === 'shadow')
      shadowValue?: string; // CSS shadow string
      
      // Opacity (for type === 'opacity')
      opacity?: number; // 0-100
    };
  };
  
  // Legacy properties (for backward compatibility - use themeValues instead)
  // Color-specific properties (only for type === 'color')
  hue?: number; // 0-360
  saturation?: number; // 0-100
  lightness?: number; // 0-100
  alpha?: number; // 0-100 (percentage)
  
  // Spacing/Radius/FontSize properties (for numeric values)
  value?: number; // Numeric value
  unit?: 'px' | 'rem' | 'em' | '%'; // Unit for spacing, radius, fontSize
  
  // Font weight (for type === 'fontWeight')
  fontWeight?: 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;
  
  // Line height (for type === 'lineHeight')
  lineHeight?: number; // Can be unitless or with unit
  
  // Shadow (for type === 'shadow')
  shadowValue?: string; // CSS shadow string
  
  // Opacity (for type === 'opacity')
  opacity?: number; // 0-100
  
  // Ordering & timestamps
  sortOrder?: number; // Explicit sort position within group (ascending); undefined = legacy createdAt order
  createdAt?: number; // Timestamp for default sorting when sortOrder is absent

  // Visibility per theme: false=hidden, true=visible override, undefined=inherit from primary
  themeVisibility?: Record<string, boolean>;

  // Sync metadata — foundation for per-entity sync and future multi-user collaboration
  updatedAt?: number;
  updatedBy?: string;
}

export interface TokenGroup {
  id: string;
  name: string;
  projectId: string; // Reference to parent project
  pageId: string; // Reference to parent page
  isExpanded: boolean;
  isColorPaletteGroup?: boolean; // Special group for color palettes that cannot be deleted
  isPaletteEntry?: boolean; // Marks this as a palette entry (not a regular group)
  paletteNodeId?: string; // Reference to the palette node
  isAutoAssignCreated?: boolean; // True if this group was created by the auto-assign tokens flow
  isTokenNodeGroup?: boolean; // True if this group was created by a token prefix node (tokens are managed on the canvas)
  sortOrder?: number; // Explicit sort position within its list (ascending); undefined = legacy createdAt order
  createdAt?: number; // Timestamp for sorting

  // Sync metadata
  updatedAt?: number;
  updatedBy?: string;
}

export interface TokenProject {
  id: string;
  name: string;
  isExpanded: boolean;
  isSample?: boolean; // True for the default "Sample Project" that cannot be renamed/deleted
  folderColor?: number; // Random hue (0-360) assigned at creation, used for folder card color
  isCloud?: boolean; // DEPRECATED — all projects are cloud-backed. Kept for backward compat with stored data.
  isTemplate?: boolean; // True for template projects (template admin only, cloud-backed, no limit)
  lastSyncedAt?: number; // Timestamp of last successful cloud sync

  // Sync metadata
  updatedAt?: number;
  updatedBy?: string;
}

export interface Page {
  id: string;
  name: string;
  projectId: string; // Reference to parent project
  createdAt: number; // Timestamp for sorting
  updatedAt?: number;
  updatedBy?: string;
}

export interface Theme {
  id: string;
  name: string;
  projectId: string; // Reference to parent project
  createdAt: number; // Timestamp for sorting
  isPrimary?: boolean; // Whether this is the primary theme (default: false)
  updatedAt?: number;
  updatedBy?: string;
}

export interface CanvasState {
  projectId: string;
  pageId: string; // Add page reference
  pan: { x: number; y: number };
  zoom: number;
}

export interface ComponentStateNode {
  id: string;
  componentId: string;
  stateName: string; // 'default', 'hover', 'pressed', etc.
  position: { x: number; y: number };
  properties: ComponentProperty[]; // All properties (color, spacing, radius, etc.)
}

// Generic property interface that can handle any token type
export interface ComponentProperty {
  name: string; // Display name: 'Background', 'Padding', 'Border Radius', etc.
  property: string; // CSS property name: 'backgroundColor', 'padding', 'borderRadius'
  type: TokenType; // Type of property
  currentValue: string | number; // Current value (can be color string, number, etc.)
  tokenId: string | null; // Assigned token ID
  category?: 'fill' | 'stroke' | 'spacing' | 'sizing' | 'typography' | 'effects'; // UI grouping
}

// Legacy support - will be migrated
export interface ColorProperty {
  name: string;
  property: string;
  currentValue: string;
  tokenId: string | null;
}

// ═══════════════════════════════════════════════════════════════════
// Advanced Logic Layer — Types
// Stored SEPARATELY from ColorNode so removing logic restores
// the node's original values and lock/diff behavior seamlessly.
// ═══════════════════════════════════════════════════════════════════

/** A single token/pill inside an expression row. */
export interface ExpressionToken {
  id: string;
  type: 'keyword' | 'operator' | 'reference' | 'function' | 'literal' | 'boolean' | 'property' | 'paren' | 'comma' | 'local' | 'tokenRef';
  value: string;           // Raw value: 'if', '>', '@Parent', 'clamp', '50', '.H', '{Yellow-3}', etc.
  displayLabel?: string;   // Rich display label (e.g., node referenceName for @Node)
  refNodeId?: string;      // For reference tokens — the node being referenced
  refProperty?: string;    // For property tokens — the channel key (hue, oklchL, etc.)
  refTokenId?: string;     // For tokenRef tokens — the design token ID being referenced
  refTokenColor?: string;  // For tokenRef tokens — CSS color string for swatch display
}

/** AST node for expression evaluation. */
export type ExpressionAST =
  | { type: 'Literal'; value: number }
  | { type: 'Boolean'; value: boolean }
  | { type: 'Reference'; nodeId: string; property: string }
  | { type: 'Parent'; property: string }
  | { type: 'Self'; property: string }
  | { type: 'NodeRef'; target: 'parent' | 'self' | 'node'; nodeId?: string }
  | { type: 'BinaryOp'; op: string; left: ExpressionAST; right: ExpressionAST }
  | { type: 'LogicalOp'; op: 'AND' | 'OR'; left: ExpressionAST; right: ExpressionAST }
  | { type: 'Call'; fn: string; args: ExpressionAST[] }
  | { type: 'Conditional'; condition: ExpressionAST; consequent: ExpressionAST; alternate: ExpressionAST }
  | { type: 'Local'; name: string }
  | { type: 'Locked' }
  | { type: 'TokenRef'; tokenId: string; property?: string; tokenValue?: string };

/** A single condition row in a channel column. */
export interface ConditionRow {
  id: string;
  tokens: ExpressionToken[];
  enabled: boolean;
  outputName?: string; // Renameable output variable name (acts as a local variable for subsequent rows)
}

/** Logic for a single channel (Hue / Saturation / etc.). */
export interface ChannelLogic {
  rows: ConditionRow[];
  fallbackValue?: number;        // Custom fallback; undefined = parent's channel value (or node's own if root)
  fallbackMode: 'default' | 'custom'; // 'default' inherits from parent's corresponding channel value
  finalOutputVar?: string;       // Which output variable to use as the final value (e.g. 'out_1'); undefined = last valid
  autoConstrain?: boolean;       // Whether to auto-constrain final output to channel range (default: true; undefined = true)
}

/** Per-channel Node View configuration (UI-only: hide channels or constrain slider range). */
export interface NodeViewChannelConfig {
  hidden?: boolean;       // When true, hide this channel's slider in the node popup & expand view
  sliderMin?: number;     // Custom minimum for the slider (must be >= channel's absolute min)
  sliderMax?: number;     // Custom maximum for the slider (must be <= channel's absolute max)
}

/** Node View config map: channelKey → config */
export type NodeViewConfig = Record<string, NodeViewChannelConfig>;

/** The complete advanced logic for one node. */
export interface NodeAdvancedLogic {
  nodeId: string;
  channels: Record<string, ChannelLogic>;
  baseValues?: Record<string, number>; // Pre-logic channel values for `locked` keyword (snapshot at save time)
  // Keys are channel keys: 'hue','saturation','lightness','alpha',
  // 'red','green','blue','oklchL','oklchC','oklchH','hctH','hctC','hctT'
  tokenAssignment?: TokenAssignmentLogic; // For token nodes: conditional token assignment logic

  // ── Node View (UI-only) ──
  // Controls what sliders are visible and their min/max range in the color node popup & expand view.
  // Does NOT affect the underlying data — purely a UI presentation layer.
  nodeViewConfig?: NodeViewConfig;
  themeNodeViewConfig?: { [themeId: string]: NodeViewConfig };

  // ── Theme-specific overrides (non-primary themes only) ──
  // When a node is unlinked from primary in a non-primary theme, its logic
  // is stored here.  If absent, the node inherits the primary theme's logic
  // (channels / tokenAssignment above).  Toggling inheritance ON deletes the entry.
  themeChannels?: { [themeId: string]: Record<string, ChannelLogic> };
  themeTokenAssignment?: { [themeId: string]: TokenAssignmentLogic };
  themeBaseValues?: { [themeId: string]: Record<string, number> };
}

/** Logic for conditional token assignment (token nodes only). */
export interface TokenAssignmentLogic {
  rows: ConditionRow[];
  fallbackMode: 'default' | 'custom'; // 'default' = current manual assignment; 'custom' = specific fallback token
  fallbackTokenId?: string;            // Custom fallback token ID
  finalOutputVar?: string;             // Which output variable to use as final token (e.g. 'out_1'); undefined = last valid
  autoConstrain?: boolean;             // Auto-constrain computed color channels to valid ranges (default true)
}

// Legacy support - will be migrated

// ═══════════════════════════════════════════════════════════════════
// Dev Mode — Configuration Types
// Stores webhook input, output destinations, and schedule settings
// for the Code Sync + Webhook Workflows features.
// ═══════════════════════════════════════════════════════════════════

/** Dev Mode configuration for a project */
export interface DevConfig {
  // ── Input Configuration ──
  webhookEnabled: boolean;
  webhookSecret: string; // Auto-generated secret for validating incoming webhooks
  webhookTargetNodeId: string | null; // Which node receives incoming color values
  webhookAcceptFormats: ('hex' | 'hsl' | 'rgb' | 'oklch' | 'hct')[];

  // ── Schedule Configuration ──
  scheduleEnabled: boolean;
  scheduleIntervalMinutes: number; // e.g. 60 = every hour
  scheduleSource: 'values' | 'api'; // Cycle through a list or fetch from API
  scheduleValues: string[]; // List of hex codes to cycle through
  scheduleApiUrl: string; // External API URL to fetch color from
  scheduleCurrentIndex: number; // Current position in values list
  scheduleLastRun: number | null; // Timestamp of last scheduled run

  // ── Output Configuration ──
  outputFormat: 'css' | 'dtcg' | 'tailwind' | 'figma';
  outputTheme: string | null; // Theme ID to export, null = all themes

  // ── GitHub Destination ──
  githubEnabled: boolean;
  githubRepo: string; // "owner/repo"
  githubPath: string; // "src/tokens.css"
  githubBranch: string; // "main"
  githubPATEncrypted: string; // AES-256-GCM encrypted PAT (encrypted client-side)

  // ── Webhook Output Destination ──
  webhookOutputEnabled: boolean;
  webhookOutputUrl: string; // POST URL for outgoing token data
  webhookOutputHeaders: Record<string, string>; // Custom headers

  // ── Pull API ──
  pullApiEnabled: boolean;

  // ── Run Metadata ──
  lastRunAt: number | null;
  lastRunStatus: 'success' | 'error' | null;
  lastRunError: string | null;
}

/** Default DevConfig for new projects */
export function createDefaultDevConfig(): DevConfig {
  return {
    webhookEnabled: false,
    webhookSecret: generateWebhookSecret(),
    webhookTargetNodeId: null,
    webhookAcceptFormats: ['hex', 'hsl', 'rgb', 'oklch', 'hct'],
    scheduleEnabled: false,
    scheduleIntervalMinutes: 60,
    scheduleSource: 'values',
    scheduleValues: [],
    scheduleApiUrl: '',
    scheduleCurrentIndex: 0,
    scheduleLastRun: null,
    outputFormat: 'css',
    outputTheme: null,
    githubEnabled: false,
    githubRepo: '',
    githubPath: '',
    githubBranch: 'main',
    githubPATEncrypted: '',
    webhookOutputEnabled: false,
    webhookOutputUrl: '',
    webhookOutputHeaders: {},
    pullApiEnabled: false,
    lastRunAt: null,
    lastRunStatus: null,
    lastRunError: null,
  };
}

/** Generate a random webhook secret (32 hex chars) */
function generateWebhookSecret(): string {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
}