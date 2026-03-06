# Color Nodes System

## Overview

Color nodes are the fundamental building blocks of the design system. Each node represents a color value that can:
- Exist independently (root node)
- Inherit from a parent node (child node)
- Have its own children (parent node)
- Be assigned to one or multiple design tokens

## Node Types

### Regular Color Nodes
Standard color nodes that can be connected in a parent-child hierarchy.

### Palette Nodes
Special nodes (`isPalette: true`) that automatically generate multiple shade variations as child nodes.

### Spacing Nodes
Nodes for spacing values (`isSpacing: true`) instead of colors.

## Color Spaces

### HSL (Hue, Saturation, Lightness)
**Default color space**

- **Hue**: 0-360 degrees (color wheel position)
- **Saturation**: 0-100% (color intensity)
- **Lightness**: 0-100% (brightness)
- **Alpha**: 0-100% (opacity)

**UI Display**: Four sliders (H, S, L, A)

**Storage**: All nodes store HSL values as base properties

### RGB (Red, Green, Blue)
- **Red**: 0-255
- **Green**: 0-255
- **Blue**: 0-255
- **Alpha**: 0-100%

**UI Display**: Four sliders (R, G, B, A)

**Storage**: When `colorSpace === 'rgb'`, the node has `red`, `green`, `blue` properties

### OKLCH (Lightness, Chroma, Hue)
Perceptually uniform color space.

- **L (Lightness)**: 0-100
- **C (Chroma)**: 0-100 (internally 0-0.4, scaled for UI)
- **H (Hue)**: 0-360 degrees

**UI Display**: Three sliders (L, C, H) plus Alpha

**Storage**: When `colorSpace === 'oklch'`, the node has `oklchL`, `oklchC`, `oklchH` properties

### HEX
Manual hex color input.

- **Hex Value**: String like "#FF5733" or "#FF5733FF"
- **Locked State**: When unlocked, inherits from parent; when locked, uses manual value

**UI Display**: Hex input field with lock button

**Storage**: When `colorSpace === 'hex'`, the node has `hexValue` and `hexLocked` properties

## Node Properties

### Core Properties

```typescript
id: string;                      // Unique identifier (timestamp-based)
colorSpace: 'hsl' | 'rgb' | 'oklch' | 'hex';
parentId: string | null;         // Parent node ID (null for root nodes)
position: { x: number; y: number };
width?: number;                  // Default: 240px
isExpanded?: boolean;            // UI state: collapsed or expanded
tokenIds?: string[];             // Assigned design tokens
projectId: string;               // Project this node belongs to
pageId: string;                  // Page this node belongs to
```

### Color Values

Depending on `colorSpace`, different properties are active:

**HSL (always present)**:
```typescript
hue: number;
saturation: number;
lightness: number;
alpha: number;
```

**RGB (when colorSpace === 'rgb')**:
```typescript
red?: number;
green?: number;
blue?: number;
```

**OKLCH (when colorSpace === 'oklch')**:
```typescript
oklchL?: number;
oklchC?: number;
oklchH?: number;
```

**HEX (when colorSpace === 'hex')**:
```typescript
hexLocked?: boolean;
hexValue?: string;
```

## Node Hierarchy

### Root Nodes
Nodes with `parentId: null` are root nodes.
- Independent color values
- No inheritance behavior
- Can have children

### Child Nodes
Nodes with a `parentId` value.
- Inherit color values from parent (unless locked)
- Can have their own children (multi-level hierarchy)
- Support offset-based inheritance with diff system

### Parent-Child Connections

**Visual Representation**:
- Parent node has a **right connection button** (circle)
- Child node has a **left connection button** (circle)
- A line is drawn between parent and child when connected

**Connection Methods**:
1. **Drag from right button**: Creates a child at cursor position
2. **Drag between nodes**: Connects existing nodes
3. **Plus button on node**: Creates child with auto-positioning

## Node Creation

### Creating Root Nodes

```typescript
// User clicks "+" in canvas header
addNode(position)
```

**Default Values**:
- Random hue (0-360)
- 80% saturation
- 50% lightness
- 100% alpha
- No parent
- All offsets = 0
- All locks = false
- All diffs = false (TO BE CHANGED - see Implementation Status)

### Creating Child Nodes

```typescript
// User clicks "+" on a node or drags from right connection button
addChildNode(parentId, manualPosition?)
```

**Inherited Values**:
- **Inherits parent's color values** (hue, saturation, lightness, alpha, etc.)
- **Inherits parent's color space**
- All offsets initialized to **0** (child starts matching parent exactly)
- All locks = false
- All diffs = false (child will match parent exactly when parent changes)

**Positioning**:
- **Auto-positioning**: Placed to the right of parent, below siblings
- **Manual positioning**: If `manualPosition` provided, placed exactly there
- **Collision detection**: Spiral search for free space if overlapping

## Node Display

### Collapsed State (`isExpanded: false`)
- Color preview swatch
- Lock icons row (if has parent)
- Assigned tokens section
- Token selector dropdown

**Height**: ~200px (varies with token count)

### Expanded State (`isExpanded: true`)
- Color preview swatch with auto-generated name
- All sliders for the active color space
- Lock icons row (if has parent)
- Property labels with lock/diff controls on hover
- Assigned tokens section
- Token selector dropdown

**Height**: ~400px (varies with color space and token count)

### Node Header

**Components**:
- **Drag handle** (6 dots icon) - for moving the node
- **Auto-generated name** (e.g., "Sunset Orange") based on color
- **Color space indicator** (HSL, RGB, OKLCH, HEX)
- **Expand/collapse toggle** (chevron icon)
- **Connection buttons** (left and right circles)
- **Delete button** (trash icon)

### Color Preview

- Large color swatch showing the current color
- Checkerboard pattern background for transparency
- Auto-generated color name using `color-namer` library
- Hex value display

## Node Positioning

### Auto-Positioning Logic

When creating a child node without manual position:

1. **Calculate initial position**:
   - X: Parent X + 350px (horizontal offset)
   - Y: Parent Y (aligned with parent)

2. **Sibling adjustment**:
   - If siblings exist, use first sibling's X position
   - Find bottommost sibling (highest Y + height)
   - Place new child below with MIN_GAP (30px)

3. **Collision detection**:
   - Check if initial position overlaps existing nodes
   - If collision, spiral search for free space
   - Maximum 50 attempts

4. **Sibling pushing**:
   - If new child overlaps existing siblings in same column
   - Push overlapping siblings down by (child height + MIN_GAP)

### Manual Positioning

When dragging from right connection button:
- Node is placed exactly at cursor position
- No auto-positioning or sibling adjustment
- Allows precise placement

### Collision Detection

**Check for overlap**:
```typescript
horizontalOverlap = !(nodeA.right + MIN_GAP <= nodeB.left || 
                      nodeB.right + MIN_GAP <= nodeA.left)
verticalOverlap = !(nodeA.bottom + MIN_GAP <= nodeB.top || 
                    nodeB.bottom + MIN_GAP <= nodeA.top)
collision = horizontalOverlap && verticalOverlap
```

**Collision Resolution**:
- **Siblings**: Push vertically (downward)
- **Parent-child**: Maintain horizontal offset
- **Unrelated**: Push in any direction to resolve

## Node Height Calculation

Node height varies based on state and content:

```typescript
function getNodeHeight(node: ColorNode, tokens: DesignToken[]): number {
  const colorPreviewHeight = 80;
  const tokenRowHeight = 28;
  const tokenCount = (node.tokenIds || []).length;
  const tokenSectionHeight = tokenCount > 0 ? tokenCount * tokenRowHeight : 0;
  const tokenSelectorHeight = 40;
  
  if (!node.isExpanded) {
    const lockIconsHeight = node.parentId ? 48 : 0;
    return colorPreviewHeight + lockIconsHeight + tokenSectionHeight + tokenSelectorHeight + 16;
  }
  
  const slidersHeight = 4 * 70; // HSL has 4 properties (H, S, L, A)
  const lockIconsHeight = node.parentId ? 48 : 0;
  const paddingAndSpacing = 60;
  
  return colorPreviewHeight + slidersHeight + lockIconsHeight + tokenSectionHeight + tokenSelectorHeight + paddingAndSpacing;
}
```

## Node Selection

### Single Selection
- Click on a node to select it
- Selected node shows blue border
- Only one node can be selected at a time (single selection mode)

### Multi-Selection
- Drag selection rectangle on canvas
- All nodes within rectangle are selected
- Selected nodes show blue borders
- Can drag multiple selected nodes together

### Selection with Children
- Double-click a node to select it and all descendants
- Useful for moving entire hierarchies

## Node Operations

### Update Node
```typescript
updateNode(id: string, updates: Partial<ColorNode>)
```
Updates any properties of a node. Does not automatically propagate to children.

### Delete Node
```typescript
deleteNode(id: string)
```
- Deletes the node and all descendants
- Removes token assignments
- Deletes palette entry groups if it's a palette node

### Unlink Node
```typescript
unlinkNode(id: string)
```
- Removes the parent relationship (`parentId` set to null)
- Node becomes a root node
- Keeps current color values (no change)

### Link Node
```typescript
linkNode(nodeId: string, newParentId: string | null)
```
- Creates or changes parent relationship
- **Circular reference check**: Prevents linking to own descendant
- Displays error message if circular reference detected

### Duplicate Node
Duplicates a node and all its descendants:
1. Creates new IDs for all nodes
2. Offsets position by 100px diagonally
3. Finds free space using collision detection
4. Preserves hierarchy structure

## Color Space Conversion

The system automatically converts between color spaces when switching:

### HSL to RGB
Standard HSL → RGB conversion algorithm

### RGB to HSL
Standard RGB → HSL conversion algorithm

### HSL to OKLCH
HSL → RGB → Linear RGB → XYZ → OKLab → OKLCH

### OKLCH to HSL
OKLCH → OKLab → XYZ → Linear RGB → RGB → HSL

### To/From HEX
HEX ↔ RGB ↔ HSL (as needed)

**Note**: All conversions are in `/App.tsx` as utility functions

## Node Validation

### Name Validation
- Auto-generated from color using `color-namer` library
- Examples: "Sunset Orange", "Ocean Blue", "Forest Green"

### Value Validation
- Hue: Clamped to 0-360
- Saturation: Clamped to 0-100
- Lightness: Clamped to 0-100
- Alpha: Clamped to 0-100
- RGB: Clamped to 0-255
- OKLCH L: Clamped to 0-100
- OKLCH C: Clamped to 0-100
- OKLCH H: Clamped to 0-360

## Performance Optimizations

### Memoization
- `useCallback` for all update functions
- Prevents unnecessary re-renders

### Lazy Rendering
- Only visible nodes are rendered (within viewport)
- Improves performance with large node graphs

### Debounced Updates
- Color slider changes are immediate (no debounce)
- LocalStorage saves are debounced (auto-save on change)
