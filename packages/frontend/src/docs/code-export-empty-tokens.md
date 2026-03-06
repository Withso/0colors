# Code Export: Empty Token Filtering

## Overview

The code export system automatically filters out "empty" tokens - tokens that have been created but not currently assigned to any color nodes. This ensures that only tokens with active node assignments are exported across all formats (CSS Variables, DTCG JSON, Tailwind CSS, and Figma Variables).

## Why Filter Empty Tokens?

When tokens are created in the token panel but not assigned to any nodes, they exist in an "unassigned" state. Even if they have stored color values from previous assignments, exporting these unassigned tokens would:

1. **Pollute the exported code** with unused/orphaned token values
2. **Break imports** in systems expecting only active tokens (especially Figma)
3. **Cause confusion** about which tokens are actually in use
4. **Generate invalid code** with orphaned values that don't reflect the current design system

## Empty Token Detection Logic

A token is considered **empty** (and filtered out) if it is **not currently assigned to any node**.

### Assignment Check

```typescript
// A token is valid/exportable if it exists in any node's tokenIds array
function isTokenAssignedToNode(token: DesignToken, nodes: ColorNode[]): boolean {
  return nodes.some(node => {
    const tokenIds = node.tokenIds || [];
    return tokenIds.includes(token.id);
  });
}
```

### Key Points

- **Assignment matters, not values:** A token may have stored HSL values (hue, saturation, lightness) from previous assignments, but if it's not currently assigned to a node, it's filtered out
- **Visual indicator:** Unassigned tokens show with a dashed border in the token panel
- **Dynamic filtering:** Tokens are re-evaluated on every export based on current node assignments

## Implementation

### Token Validation Function

Located in `/utils/tokenFormatters.ts`:

```typescript
function isTokenAssignedToNode(token: DesignToken, nodes: ColorNode[]): boolean {
  return nodes.some(node => {
    const tokenIds = node.tokenIds || [];
    return tokenIds.includes(token.id);
  });
}
```

### Export Functions

All export functions filter tokens before processing:

```typescript
// CSS Variables Export
export function generateCSSVariables(tokens: DesignToken[], nodes: ColorNode[]): string {
  const validTokens = tokens.filter(token => isTokenAssignedToNode(token, nodes));
  // ... process only validTokens
}

// DTCG JSON Export
export function generateDTCGJSON(tokens: DesignToken[], nodes: ColorNode[]): string {
  const validTokens = tokens.filter(token => isTokenAssignedToNode(token, nodes));
  // ... process only validTokens
}

// Tailwind CSS Export
export function generateTailwindConfig(tokens: DesignToken[], nodes: ColorNode[]): string {
  const validTokens = tokens.filter(token => isTokenAssignedToNode(token, nodes));
  // ... process only validTokens
}

// Figma Variables Export
export function generateFigmaVariablesJSON(tokens: DesignToken[], nodes: ColorNode[], collectionName: string): string {
  const validTokens = tokens.filter(token => isTokenAssignedToNode(token, nodes));
  // ... process only validTokens
}
```

## User Interface Feedback

The Code Preview component provides clear feedback about empty tokens:

### When All Tokens Are Empty
```
No tokens to export
X token(s) created but not assigned to any nodes
```

### When Some Tokens Are Empty
```
ℹ️ X empty token(s) skipped (not assigned to any nodes)
```

This feedback helps users understand:
- Why certain tokens don't appear in the export
- How many tokens need to be assigned to nodes
- That this is expected behavior, not an error

## Example Scenario

Given these tokens:

| Token Name | Type  | Assigned to Node? | Has Value? | Exported? |
|------------|-------|-------------------|------------|-----------|
| Variable 5 | color | ❌ No             | ❌ No      | ❌ No     |
| Variable 6 | color | ✅ Yes            | ✅ Yes     | ✅ Yes    |
| Variable 9 | color | ❌ No             | ❌ No      | ❌ No     |
| Variable 11| color | ✅ Yes            | ✅ Yes     | ✅ Yes    |

**Result:** Only Variable 6 and Variable 11 appear in the exported code.

### Before Filtering (INCORRECT)
```css
:root {
  --variable-5: #000000;  /* ❌ Wrong - has no actual value */
  --variable-6: #00FFEA;  /* ✅ Correct */
  --variable-9: #000000;  /* ❌ Wrong - has no actual value */
  --variable-11: #00FFEA; /* ✅ Correct */
}
```

### After Filtering (CORRECT)
```css
:root {
  --variable-6: #00FFEA;  /* ✅ Only valid tokens exported */
  --variable-11: #00FFEA; /* ✅ Only valid tokens exported */
}
```

## Workflow Implications

### Creating Tokens
1. Create token in token panel
2. Token exists but is **empty** (not exportable)
3. Assign token to a color node
4. Node's color values populate the token
5. Token is now **valid** (exportable)

### Code Export Process
1. User switches to Code mode
2. System filters all tokens to find valid ones
3. Only valid tokens are processed by formatters
4. User sees clean, valid code output
5. UI shows how many empty tokens were skipped

## Benefits

1. **Clean Exports:** Only meaningful, usable tokens in output
2. **Figma Compatibility:** Prevents import errors from undefined values
3. **User Clarity:** Clear feedback about token state
4. **Proper Workflow:** Encourages proper token → node assignment
5. **Error Prevention:** Avoids runtime errors from undefined values

## Related Files

- `/utils/tokenFormatters.ts` - Token validation and export logic
- `/components/CodePreview.tsx` - UI feedback and filtering
- `/components/types.ts` - Token type definitions

## See Also

- [Code Export Overview](./code-export.md) (if exists)
- [Token Management](./token-management.md) (if exists)
- [Figma Variables Format](./figma-variables-format.md) (if exists)