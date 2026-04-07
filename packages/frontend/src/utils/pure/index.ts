/**
 * Pure utility functions — zero external dependencies, portable to server.
 * These functions are pure math/string operations with no side effects.
 * Safe to use in Node.js, Web Workers, or any JavaScript runtime.
 */

// Color space conversions (HSL, RGB, OKLCH)
export { hslToRgb, rgbToHex, rgbToHsl, hslToOklch, oklchToHsl, oklchToSrgb } from '../color-conversions';

// HCT (Material Design 3) color space
export { hctToRgb, rgbToHct, hctToHex } from '../hct-utils';

// Name validation (unique names for tokens/nodes)
export { getUniqueTokenName, getUniqueNodeName } from '../nameValidation';

// URL-friendly slugs
export { slugify, findProjectBySlug } from '../slugify';

// Text/token limits
export { TOKEN_LIMITS, estimateTokenCount } from '../textLimits';
