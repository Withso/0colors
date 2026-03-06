# System Architecture

## Overview

This is a node-based color design token tool for UI design featuring:
- **Hierarchical inheritance** between parent and child nodes
- **Infinite zoomable canvas** with pan and zoom controls
- **Figma-like design token system** with grouping
- **Multi-theme support** where node structure is synchronized but color values are unique per theme (planned feature)
- **Multiple color spaces** (HSL, RGB, OKLCH, HEX)
- **Palette generation** with automatic shade creation
- **Multi-page projects** for organizing design systems

## Tech Stack

- **React** with TypeScript
- **State Management**: React useState and useCallback hooks
- **UI Components**: Custom component library in `/components/ui/`
- **LocalStorage**: For persisting projects, pages, nodes, tokens, groups, and canvas states
- **Color Conversion**: Custom color space conversion utilities

## Core Data Models

### ColorNode
Represents a color value node on the canvas.

**Location**: `/components/types.ts`

**Key Properties**:
```typescript
interface ColorNode {
  id: string;
  colorSpace: 'hsl' | 'rgb' | 'oklch' | 'hex';
  
  // HSL properties
  hue: number;         // 0-360
  saturation: number;  // 0-100
  lightness: number;   // 0-100
  alpha: number;       // 0-100
  
  // RGB properties (for colorSpace === 'rgb')
  red?: number;        // 0-255
  green?: number;      // 0-255
  blue?: number;       // 0-255
  
  // OKLCH properties (for colorSpace === 'oklch')
  oklchL?: number;     // 0-100 (lightness)
  oklchC?: number;     // 0-100 (chroma, scaled from 0-0.4)
  oklchH?: number;     // 0-360 (hue)
  
  // Hex properties (for colorSpace === 'hex')
  hexLocked?: boolean;
  hexValue?: string;   // e.g., "#FF5733" or "#FF5733FF"
  
  // Hierarchy
  parentId: string | null;
  
  // Offset values (for diff-based inheritance)
  hueOffset: number;
  saturationOffset: number;
  lightnessOffset: number;
  alphaOffset: number;
  redOffset?: number;
  greenOffset?: number;
  blueOffset?: number;
  oklchLOffset?: number;
  oklchCOffset?: number;
  oklchHOffset?: number;
  
  // Lock states (prevents inheritance)
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
  
  // Diff states (enables offset-based inheritance)
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
  
  // Position and UI
  position: { x: number; y: number };
  width?: number;           // Default: 240
  isExpanded?: boolean;     // Collapsed or expanded state
  
  // Token references
  tokenIds?: string[];      // Array of assigned token IDs
  
  // Project and page references
  projectId: string;
  pageId: string;
  
  // Palette properties (if isPalette === true)
  isPalette?: boolean;
  paletteName?: string;
  paletteNameLocked?: boolean;
  paletteColorFormat?: 'HEX' | 'HSLA' | 'OKLCH' | 'RGBA';
  paletteLightnessMode?: 'linear' | 'curve';
  paletteLightnessStart?: number;   // 0-100
  paletteLightnessEnd?: number;     // 0-100
  paletteNamingPattern?: '1-9' | '10-90' | '100-900' | 'a-z';
  paletteShadeCount?: number;       // 5-20
  
  // Spacing properties (if isSpacing === true)
  isSpacing?: boolean;
  spacingValue?: number;
  spacingUnit?: 'px' | 'rem' | 'em';
  spacingName?: string;
}
```

### DesignToken
Represents a design token that can be assigned to nodes.

**Key Properties**:
```typescript
interface DesignToken {
  id: string;
  name: string;                    // e.g., "primary/500"
  type?: TokenType;                // 'color' | 'spacing' | etc.
  groupId: string | null;          // Reference to parent group
  projectId: string;
  pageId: string;
  
  // Color-specific (for type === 'color')
  hue?: number;
  saturation?: number;
  lightness?: number;
  alpha?: number;
  
  // Other token types
  value?: number;
  unit?: 'px' | 'rem' | 'em' | '%';
  fontWeight?: number;
  // ... other token properties
}
```

### TokenGroup
Organizes tokens into collapsible groups.

```typescript
interface TokenGroup {
  id: string;
  name: string;
  projectId: string;
  pageId: string;
  isExpanded: boolean;
  isColorPaletteGroup?: boolean;   // Special group that can't be deleted
  isPaletteEntry?: boolean;        // Marks as palette entry group
  paletteNodeId?: string;          // Reference to palette node
  createdAt?: number;
}
```

### TokenProject
Top-level organization for design systems.

```typescript
interface TokenProject {
  id: string;
  name: string;
  isExpanded: boolean;
  isSample?: boolean;              // Can't be renamed/deleted
}
```

### Page
Represents a page within a project.

```typescript
interface Page {
  id: string;
  name: string;
  projectId: string;
  createdAt: number;
}
```

### CanvasState
Stores pan and zoom state per project/page.

```typescript
interface CanvasState {
  projectId: string;
  pageId: string;
  pan: { x: number; y: number };
  zoom: number;
}
```

## Application Structure

### Entry Point: `/App.tsx`

The main application component manages:
- **State Management**: All nodes, tokens, groups, projects, pages, canvas states
- **LocalStorage Persistence**: Saves and loads state from localStorage
- **Color Space Conversion**: Utilities for converting between HSL, RGB, OKLCH
- **Node Operations**: Create, update, delete, link, unlink nodes
- **Token Operations**: Create, update, delete, assign tokens
- **Project/Page Management**: Create, switch, delete projects and pages

### Main Components

1. **ColorCanvas** (`/components/ColorCanvas.tsx`)
   - Infinite canvas with pan and zoom
   - Renders all color nodes and spacing nodes
   - Handles node dragging, selection, wire connections
   - Manages collision detection and auto-positioning

2. **ColorNodeCard** (`/components/ColorNodeCard.tsx`)
   - Individual node UI
   - Color sliders (HSL, RGB, or OKLCH)
   - Lock and diff controls
   - Token assignment
   - Parent/child connection buttons

3. **TokensPanel** (`/components/TokensPanel.tsx`)
   - Displays all tokens in groups
   - Token creation and editing
   - Drag and drop to assign tokens
   - Group management

4. **ModeSidebar** (`/components/ModeSidebar.tsx`)
   - Mode selection (Color, Variables, etc.)
   - Project and page navigation
   - Quick actions

5. **PaletteShadesGrid** (`/components/PaletteShadesGrid.tsx`)
   - Displays palette shades in a grid
   - Auto-generated from palette nodes

6. **SpacingNodeCard** (`/components/SpacingNodeCard.tsx`)
   - Spacing value nodes
   - Similar to ColorNodeCard but for spacing tokens

## State Flow

### Node Creation Flow
1. User clicks "+" button or drags from connection button
2. `addNode()` or `addChildNode()` is called
3. New ColorNode is created with default values
4. If child: inherits parent's color values, offsets set to 0
5. Node is added to `allNodes` state
6. Canvas re-renders with new node

### Node Update Flow
1. User adjusts a slider or input
2. `updateNode(id, updates)` is called
3. Node's properties are updated
4. **No automatic child updates** - children only update when parent changes AND diff is enabled
5. State is persisted to localStorage

### Parent-Child Inheritance Flow
1. Parent node's color is changed
2. System finds all children of that parent
3. For each child:
   - If property is **locked**: child's value doesn't change
   - If property is **not locked AND diff is disabled**: child matches parent exactly
   - If property is **not locked AND diff is enabled**: child value = parent value + offset (TO BE IMPLEMENTED)
4. Children re-render with new values

### Token Assignment Flow
1. User selects token from dropdown or drags token to node
2. `assignTokenToNode(nodeId, tokenId, isAssigned)` is called
3. If assigning: tokenId is added to node's `tokenIds` array
4. If unassigning: tokenId is removed from array
5. Node re-renders showing assigned token(s)

## LocalStorage Schema

Data is stored in localStorage with these keys:

- `color-nodes-v4`: Array of ColorNode objects
- `design-tokens-v4`: Array of DesignToken objects
- `token-groups-v4`: Array of TokenGroup objects
- `token-projects-v4`: Array of TokenProject objects
- `pages-v4`: Array of Page objects
- `canvas-states-v4`: Array of CanvasState objects
- `active-project-id-v4`: Currently active project ID
- `active-page-id-v4`: Currently active page ID

All data is automatically saved on every state change.

## Key Constants

```typescript
const MIN_GAP = 30;              // Minimum gap between nodes for collision detection
const ANIMATION_DURATION = 300;  // Canvas animation duration in ms
```

## Future Architecture Considerations

### Theme System (Planned)
- Each theme will have its own color values for nodes
- Node structure (parent-child relationships) will be shared across themes
- Switching themes will load different color values but maintain the same hierarchy
- Storage will need to be refactored to support per-theme color values
