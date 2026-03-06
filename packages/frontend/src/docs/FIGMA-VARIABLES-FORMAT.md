# Figma Variables Export Format

## Overview

The Figma Variables export generates a DTCG (Design Tokens Community Group) compliant JSON file that can be directly imported into Figma using the Variables panel. This format follows Figma's official variables import/export specification.

## Format Specification

### References
- **Figma Plugin Samples:** [variables-import-export](https://github.com/figma/plugin-samples/tree/main/variables-import-export)
- **DTCG Specification:** [Design Tokens Format](https://www.designtokens.org/tr/drafts/format/#design-token)

### Structure

The export format follows the DTCG standard with Figma-specific extensions:

```json
{
  "group-name": {
    "token-name": {
      "$type": "color",
      "$value": {
        "colorSpace": "srgb",
        "components": [0.0, 1.0, 0.937],
        "alpha": 1.0,
        "hex": "#00FFEA"
      },
      "$extensions": {
        "com.figma.variableId": "VariableID:123:456",
        "com.figma.scopes": ["ALL_SCOPES"]
      }
    }
  },
  "$extensions": {
    "com.figma.modeName": "Page 1"
  }
}
```

## Token Types

### Color Tokens

Color tokens use the DTCG color type with sRGB color space:

```json
{
  "$type": "color",
  "$value": {
    "colorSpace": "srgb",
    "components": [
      0.00392156862745098,    // Red (0-1 normalized)
      1.0,                     // Green (0-1 normalized)
      0.9372549019607843      // Blue (0-1 normalized)
    ],
    "alpha": 1.0,             // Alpha (0-1)
    "hex": "#00FFEA"          // Hex for convenience
  },
  "$extensions": {
    "com.figma.variableId": "VariableID:239:216",
    "com.figma.scopes": ["ALL_SCOPES"]
  }
}
```

#### Color Value Precision
- RGB components are normalized to 0-1 range
- Full precision (17 decimal places) for accurate color representation
- Hex value included for human readability

### Dimension Tokens

For spacing, radius, and fontSize tokens:

```json
{
  "$type": "dimension",
  "$value": "16px",
  "$extensions": {
    "com.figma.variableId": "VariableID:240:217",
    "com.figma.scopes": ["ALL_SCOPES"]
  }
}
```

### Number Tokens

For fontWeight, lineHeight, and opacity tokens:

```json
{
  "$type": "number",
  "$value": 400,
  "$extensions": {
    "com.figma.variableId": "VariableID:241:218",
    "com.figma.scopes": ["ALL_SCOPES"]
  }
}
```

## Nested Token Structure

Tokens are automatically organized into hierarchical groups based on their names:

### Slash Separator (`/`)
```
Token Name: "bg/primary"
```
Results in:
```json
{
  "bg": {
    "primary": { /* token definition */ }
  }
}
```

### Hyphen Separator (`-`)
```
Token Name: "text-primary"
```
Results in:
```json
{
  "text": {
    "primary": { /* token definition */ }
  }
}
```

### Example Hierarchy
```json
{
  "bg": {
    "primary": { "$type": "color", /* ... */ },
    "secondary": { "$type": "color", /* ... */ },
    "tertiary": { "$type": "color", /* ... */ }
  },
  "text": {
    "primary": { "$type": "color", /* ... */ },
    "secondary": { "$type": "color", /* ... */ }
  },
  "border": {
    "primary": { "$type": "color", /* ... */ }
  }
}
```

## Figma Extensions

### Variable ID
```json
"com.figma.variableId": "VariableID:239:216"
```
- Unique identifier for the variable in Figma
- Auto-generated using token ID and random component
- Format: `VariableID:{tokenId}:{random}`

### Scopes
```json
"com.figma.scopes": ["ALL_SCOPES"]
```
Defines where the variable can be used in Figma:
- `ALL_SCOPES`: Can be used anywhere (default)
- Other options: `TEXT_FILL`, `STROKE_COLOR`, `SHAPE_FILL`, etc.

### Mode Name
```json
"$extensions": {
  "com.figma.modeName": "Page 1"
}
```
- Collection-level metadata
- Uses the active page name as the theme/mode name
- Appears at the root level of the JSON

## Color Space Conversion

### HSL to RGB Conversion

The system converts internal HSL values to RGB for Figma compatibility:

1. **Source:** HSL values from color nodes (H: 0-360, S: 0-100, L: 0-100)
2. **Process:** Mathematical conversion to RGB
3. **Normalization:** RGB values divided by 255 to get 0-1 range
4. **Output:** Precise floating-point values

Example:
```
HSL(180, 100%, 50%) → RGB(0, 255, 234) → [0.0, 1.0, 0.937]
```

### Precision Requirements

Figma requires high precision for color values:
- **17 decimal places** for color components
- Ensures accurate color reproduction
- Prevents color drift on round-trip import/export

## Import Process

### Step-by-Step Guide

1. **Export from App:**
   - Switch to Code mode
   - Select "Figma Variables" format
   - Click "Download" button
   - Save the `.json` file

2. **Import to Figma:**
   - Open Figma file
   - Open Variables panel (`⌥⌘K` or `Alt+Ctrl+K`)
   - Click import icon in Variables panel
   - Select downloaded JSON file
   - Review variables in import dialog
   - Click "Import" to confirm

3. **Result:**
   - Variables created in Figma
   - Organized by groups (matching token structure)
   - Ready to apply to design elements

## Empty Token Handling

Empty tokens (not assigned to nodes) are automatically filtered out:

```typescript
// These tokens are SKIPPED in export:
- Color tokens without hue, saturation, or lightness
- Dimension tokens without value
- Number tokens without their respective values
```

See [Code Export: Empty Token Filtering](./code-export-empty-tokens.md) for details.

## Example Export

### Input Tokens
```
Token: "bg/primary" → HSL(180, 100%, 50%)
Token: "bg/secondary" → HSL(0, 0%, 10%)
Token: "text/primary" → HSL(0, 0%, 95%)
```

### Generated JSON
```json
{
  "bg": {
    "primary": {
      "$type": "color",
      "$value": {
        "colorSpace": "srgb",
        "components": [0.0, 1.0, 0.9372549019607843],
        "alpha": 1.0,
        "hex": "#00FFEA"
      },
      "$extensions": {
        "com.figma.variableId": "VariableID:1:100",
        "com.figma.scopes": ["ALL_SCOPES"]
      }
    },
    "secondary": {
      "$type": "color",
      "$value": {
        "colorSpace": "srgb",
        "components": [0.1, 0.1, 0.1],
        "alpha": 1.0,
        "hex": "#1A1A1A"
      },
      "$extensions": {
        "com.figma.variableId": "VariableID:2:101",
        "com.figma.scopes": ["ALL_SCOPES"]
      }
    }
  },
  "text": {
    "primary": {
      "$type": "color",
      "$value": {
        "colorSpace": "srgb",
        "components": [0.95, 0.95, 0.95],
        "alpha": 1.0,
        "hex": "#F2F2F2"
      },
      "$extensions": {
        "com.figma.variableId": "VariableID:3:102",
        "com.figma.scopes": ["ALL_SCOPES"]
      }
    }
  },
  "$extensions": {
    "com.figma.modeName": "Page 1"
  }
}
```

## Limitations

### Current Limitations
1. **Single Mode:** Currently exports one mode per file (based on active page)
2. **No Aliases:** Token references/aliases not yet supported
3. **Color Space:** Only sRGB color space supported
4. **Scopes:** All variables use ALL_SCOPES (not customizable)

### Future Enhancements
1. Multi-mode support (multiple themes in one export)
2. Token aliasing (variable references)
3. Custom scope configuration
4. Additional color spaces (P3, HSL, etc.)

## Validation

The export format is validated by:
1. **DTCG Compliance:** Follows DTCG specification
2. **Figma Import:** Successfully imports into Figma
3. **Type Safety:** TypeScript ensures correct data types
4. **Empty Token Filter:** Prevents invalid/undefined values

## Troubleshooting

### Import Fails in Figma
- **Check:** Are all tokens assigned to nodes?
- **Fix:** Empty tokens are auto-filtered, but ensure valid tokens exist

### Colors Look Different
- **Check:** Color space and precision
- **Fix:** System uses full precision - should match exactly

### Variables Not Organized Correctly
- **Check:** Token naming convention (use `/` or `-` separators)
- **Fix:** Rename tokens to create desired hierarchy

## Related Files

- `/utils/tokenFormatters.ts` - Export generation logic
- `/components/CodePreview.tsx` - UI for code export
- `/docs/code-export-empty-tokens.md` - Empty token handling
- `/docs/TOKEN-SYSTEM.md` - Token system overview

## See Also

- [DTCG Format Specification](https://www.designtokens.org/tr/drafts/format/)
- [Figma Variables Documentation](https://help.figma.com/hc/en-us/articles/15339657135383)
- [Figma Plugin Samples - Variables](https://github.com/figma/plugin-samples/tree/main/variables-import-export)
