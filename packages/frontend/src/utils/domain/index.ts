/**
 * Domain logic — depends on types only, portable to server.
 * Business rules, computations, and transformations for the 0colors domain model.
 * No browser APIs, no React, no network calls.
 */

// Advanced logic expression evaluation engine
export {
  evaluateChannelLogic,
  evaluateChannelLogicDetailed,
  nodeToChannelMap,
  nodeToChannelMapThemeAware,
  evaluateAST,
  parseTokensToAST,
  constrainChannelValue,
  getEffectiveChannels,
  getEffectiveBaseValues,
  CHANNEL_CONSTRAINTS,
} from '../advanced-logic-engine';
export type { EvalContext } from '../advanced-logic-engine';

// Computed token resolution per project/theme
export { computeAllProjectTokens } from '../computed-tokens';
export type { ProjectComputedTokens } from '../computed-tokens';

// Theme-aware visibility checks
export { isNodeHiddenInTheme } from '../visibility';

// Token export formatters (CSS, DTCG, Tailwind, Figma)
export {
  generateCSSVariables,
  generateDTCGJSON,
  generateTailwindConfig,
  generateFigmaVariablesJSON,
} from '../tokenFormatters';

// Schema migrations
export { migrateToLatest, migrateSnapshot, migrateAdvancedLogic, CURRENT_SCHEMA_VERSION } from '../migrations';

// Node helpers (color conversions, palette regeneration, spacing, token paths)
export {
  hslToOklchUpper, rgbToOklch, oklchToRgb, hslToHex, oklchToHex,
  hexToRgb, hexToHsl, getNodeEffectiveHSL, isInFigma,
  regeneratePaletteShades, findTokenPrefixNode, computeTokenPath,
  computeAncestorPath, getNextTokenChildSuffix, collectTokenDescendants,
  getNodeHeight, adjustNodeSpacing, MIN_GAP,
} from '../app-helpers';

// Sample/built-in templates
export { getBuiltInTemplates } from '../sample-templates';
export type { SampleTemplate } from '../sample-templates';
