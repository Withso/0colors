// ═══════════════════════════════════════════════════════════════════
// Computation Types — Server-side mirror of client types
// Minimal subset needed for headless pipeline execution.
// MUST stay in sync with /components/types.ts
// ═══════════════════════════════════════════════════════════════════

export interface ColorNode {
  id: string;
  colorSpace: 'hsl' | 'rgb' | 'oklch' | 'hct' | 'hex';
  hue: number;
  saturation: number;
  lightness: number;
  alpha: number;
  position: { x: number; y: number };
  parentId: string | null;
  hueOffset: number;
  saturationOffset: number;
  lightnessOffset: number;
  alphaOffset: number;
  tokenId: string | null;
  tokenIds?: string[];
  tokenAssignments?: { [themeId: string]: string[] };
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
  }};
  width?: number;
  projectId: string;
  pageId: string;
  red?: number;
  green?: number;
  blue?: number;
  redOffset?: number;
  greenOffset?: number;
  blueOffset?: number;
  oklchL?: number;
  oklchC?: number;
  oklchH?: number;
  oklchLOffset?: number;
  oklchCOffset?: number;
  oklchHOffset?: number;
  hctH?: number;
  hctC?: number;
  hctT?: number;
  hctHOffset?: number;
  hctCOffset?: number;
  hctTOffset?: number;
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
  hexLocked?: boolean;
  hexValue?: string;
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
  isExpanded?: boolean;
  referenceName?: string;
  referenceNameLocked?: boolean;
  autoAssignEnabled?: boolean;
  autoAssignPrefix?: string;
  autoAssignSuffix?: string;
  autoAssignStartFrom?: number;
  autoAssignGroupId?: string | null;
  autoAssignedTokenId?: string;
  autoAssignExcluded?: boolean;
  isPalette?: boolean;
  paletteName?: string;
  paletteNameLocked?: boolean;
  paletteColorFormat?: 'HEX' | 'HSLA' | 'OKLCH' | 'RGBA';
  paletteLightnessMode?: 'linear' | 'curve';
  paletteLightnessStart?: number;
  paletteLightnessEnd?: number;
  paletteNamingPattern?: '1-9' | '10-90' | '100-900' | 'a-z';
  paletteShadeCount?: number;
  paletteCurveType?: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'sine' | 'exponential' | 'material' | 'custom';
  paletteCustomCurvePoints?: number[];
  paletteSaturationMode?: 'constant' | 'auto' | 'manual';
  paletteSaturationStart?: number;
  paletteSaturationEnd?: number;
  paletteHueShift?: number;
  paletteExpandedSections?: Record<string, boolean>;
  isSpacing?: boolean;
  spacingValue?: number;
  spacingUnit?: 'px' | 'rem' | 'em';
  spacingName?: string;
  isTokenNode?: boolean;
  isTokenPrefix?: boolean;
  tokenNodeSuffix?: string;
  tokenGroupId?: string;
  ownTokenId?: string;
  valueTokenId?: string;
  valueTokenAssignments?: { [themeId: string]: string };
  themeVisibility?: Record<string, boolean>;
  isWebhookInput?: boolean;
}

export type TokenType = 'color' | 'spacing' | 'radius' | 'fontSize' | 'lineHeight' | 'fontWeight' | 'shadow' | 'opacity';

export interface DesignToken {
  id: string;
  name: string;
  type?: TokenType;
  groupId: string | null;
  projectId: string;
  pageId: string;
  themeId?: string;
  themeValues?: {
    [themeId: string]: {
      hue?: number;
      saturation?: number;
      lightness?: number;
      alpha?: number;
      value?: number;
      unit?: 'px' | 'rem' | 'em' | '%';
      fontWeight?: 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;
      lineHeight?: number;
      shadowValue?: string;
      opacity?: number;
    };
  };
  hue?: number;
  saturation?: number;
  lightness?: number;
  alpha?: number;
  value?: number;
  unit?: 'px' | 'rem' | 'em' | '%';
  fontWeight?: 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;
  lineHeight?: number;
  shadowValue?: string;
  opacity?: number;
  sortOrder?: number;
  createdAt?: number;
  themeVisibility?: Record<string, boolean>;
}

export interface TokenGroup {
  id: string;
  name: string;
  projectId: string;
  pageId: string;
  isExpanded: boolean;
  isColorPaletteGroup?: boolean;
  isPaletteEntry?: boolean;
  paletteNodeId?: string;
  isAutoAssignCreated?: boolean;
  isTokenNodeGroup?: boolean;
  sortOrder?: number;
  createdAt?: number;
}

export interface TokenProject {
  id: string;
  name: string;
  isExpanded: boolean;
  isSample?: boolean;
  folderColor?: number;
  isCloud?: boolean;
  isTemplate?: boolean;
  lastSyncedAt?: number;
}

export interface Page {
  id: string;
  name: string;
  projectId: string;
  createdAt: number;
}

export interface Theme {
  id: string;
  name: string;
  projectId: string;
  createdAt: number;
  isPrimary?: boolean;
}

export interface ExpressionToken {
  id: string;
  type: 'keyword' | 'operator' | 'reference' | 'function' | 'literal' | 'boolean' | 'property' | 'paren' | 'comma' | 'local' | 'tokenRef';
  value: string;
  displayLabel?: string;
  refNodeId?: string;
  refProperty?: string;
  refTokenId?: string;
  refTokenColor?: string;
}

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

export interface ConditionRow {
  id: string;
  tokens: ExpressionToken[];
  enabled: boolean;
  outputName?: string;
}

export interface ChannelLogic {
  rows: ConditionRow[];
  fallbackValue?: number;
  fallbackMode: 'default' | 'custom';
  finalOutputVar?: string;
  autoConstrain?: boolean;
}

export interface NodeViewChannelConfig {
  hidden?: boolean;
  sliderMin?: number;
  sliderMax?: number;
}

export type NodeViewConfig = Record<string, NodeViewChannelConfig>;

export interface NodeAdvancedLogic {
  nodeId: string;
  channels: Record<string, ChannelLogic>;
  baseValues?: Record<string, number>;
  tokenAssignment?: TokenAssignmentLogic;
  nodeViewConfig?: NodeViewConfig;
  themeNodeViewConfig?: { [themeId: string]: NodeViewConfig };
  themeChannels?: { [themeId: string]: Record<string, ChannelLogic> };
  themeTokenAssignment?: { [themeId: string]: TokenAssignmentLogic };
  themeBaseValues?: { [themeId: string]: Record<string, number> };
}

export interface TokenAssignmentLogic {
  rows: ConditionRow[];
  fallbackMode: 'default' | 'custom';
  fallbackTokenId?: string;
  finalOutputVar?: string;
  autoConstrain?: boolean;
}

export interface DevConfig {
  webhookEnabled: boolean;
  webhookSecret: string;
  webhookTargetNodeId: string | null;
  webhookAcceptFormats: ('hex' | 'hsl' | 'rgb' | 'oklch' | 'hct')[];
  scheduleEnabled: boolean;
  scheduleIntervalMinutes: number;
  scheduleSource: 'values' | 'api';
  scheduleValues: string[];
  scheduleApiUrl: string;
  scheduleCurrentIndex: number;
  scheduleLastRun: number | null;
  outputFormat: 'css' | 'dtcg' | 'tailwind' | 'figma';
  outputTheme: string | null;
  githubEnabled: boolean;
  githubRepo: string;
  githubPath: string;
  githubBranch: string;
  githubPATEncrypted: string;
  webhookOutputEnabled: boolean;
  webhookOutputUrl: string;
  webhookOutputHeaders: Record<string, string>;
  pullApiEnabled: boolean;
  lastRunAt: number | null;
  lastRunStatus: 'success' | 'error' | null;
  lastRunError: string | null;
}

/** Project snapshot as stored in KV */
export interface ProjectSnapshot {
  nodes: ColorNode[];
  tokens: DesignToken[];
  groups: TokenGroup[];
  themes: Theme[];
  pages: Page[];
  advancedLogic: NodeAdvancedLogic[];
  devConfig?: DevConfig;
}
