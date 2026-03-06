# Token System

## Overview

The token system provides a Figma-like design token experience where tokens can be:
- Created and organized in groups
- Assigned to multiple nodes
- Displayed in the Tokens Panel
- Exported and imported

## Token Structure

### DesignToken

```typescript
interface DesignToken {
  id: string;                      // Unique identifier
  name: string;                    // Display name (e.g., "primary/500")
  type?: TokenType;                // 'color' | 'spacing' | etc.
  groupId: string | null;          // Parent group (null = ungrouped)
  projectId: string;               // Project reference
  pageId: string;                  // Page reference
  
  // Color-specific properties
  hue?: number;                    // 0-360
  saturation?: number;             // 0-100
  lightness?: number;              // 0-100
  alpha?: number;                  // 0-100
  
  // Other token types (future expansion)
  value?: number;
  unit?: 'px' | 'rem' | 'em' | '%';
  fontWeight?: number;
  // ... more properties
}
```

### TokenGroup

```typescript
interface TokenGroup {
  id: string;
  name: string;
  projectId: string;
  pageId: string;
  isExpanded: boolean;             // Collapsed or expanded in UI
  isColorPaletteGroup?: boolean;   // Special "Color Palettes" group
  isPaletteEntry?: boolean;        // Generated from palette node
  paletteNodeId?: string;          // Reference to palette node
  createdAt?: number;              // Timestamp for sorting
}
```

## Token Types

### Color Tokens
Most common token type.

**Properties**:
- `type: 'color'`
- `hue`, `saturation`, `lightness`, `alpha`

**Display**: Color swatch + hex value + name

**Usage**: Assigned to color nodes

### Spacing Tokens (Future)
For spacing values.

**Properties**:
- `type: 'spacing'`
- `value`, `unit`

**Usage**: Assigned to spacing nodes

### Other Token Types (Future)
- `radius`: Border radius values
- `fontSize`: Typography sizes
- `lineHeight`: Line height values
- `fontWeight`: Font weights (100-900)
- `shadow`: Box shadow values
- `opacity`: Opacity values (0-100)

## Token Panel

**Location**: `/components/TokensPanel.tsx`

**Layout**:
```
┌─────────────────────────────┐
│ Project Selector            │
├─────────────────────────────┤
│ Page Tabs                   │
├─────────────────────────────┤
│ Search Box                  │
├─────────────────────────────┤
│ + New Token                 │
│ + New Group                 │
├─────────────────────────────┤
│ Scroll Area:                │
│   ▼ Group 1                 │
│     Token 1.1               │
│     Token 1.2               │
│   ► Group 2 (collapsed)     │
│   Ungrouped Tokens          │
│     Token 3                 │
└─────────────────────────────┘
```

### Token Display

Each token shows:
- **Color swatch** (16x16px)
- **Token name** (truncated with tooltip if too long)
- **Hex value** (e.g., "#FF5733")
- **Chevron** to expand/collapse (shows assigned nodes)
- **Copy button** (copies hex value)

**Expanded Token**:
Shows all nodes assigned to this token:
- Node color swatch
- "Navigate to node" button (focuses canvas on node)

### Group Display

Each group shows:
- **Chevron icon** (expand/collapse)
- **Group name** (editable on double-click)
- **Token count** in the group
- **Context menu** (right-click):
  - Rename group
  - Delete group (moves tokens to ungrouped)

### Special Groups

**Color Palettes Group** (`isColorPaletteGroup: true`):
- Created automatically
- Cannot be deleted
- Contains palette entry groups

**Palette Entry Groups** (`isPaletteEntry: true`):
- Generated from palette nodes
- Name matches palette name
- Deleted when palette node is deleted
- Contains palette shade tokens

## Token Operations

### Creating Tokens

**Method 1: New Token Button**
```typescript
onAddToken(name?: string, groupId?: string, projectId?: string)
```

**Default values**:
- `name`: "Untitled Token"
- `type`: `undefined` (set when assigned to node)
- `groupId`: `null` (ungrouped)
- Color values: Same as first node if assigned, or HSL(0, 0, 0, 100)

**Method 2: From Palette Node**
Tokens are auto-generated when palette node is created or updated.

### Updating Tokens

```typescript
onUpdateToken(id: string, updates: Partial<DesignToken>)
```

**Editable properties**:
- `name`: Double-click token name to edit
- `hue`, `saturation`, `lightness`, `alpha`: Using sliders in token details
- `groupId`: Drag token to different group

**Not editable**:
- `id`: Immutable identifier
- `projectId`, `pageId`: Determined by context
- `type`: Set automatically when assigned

### Deleting Tokens

```typescript
onDeleteToken(id: string)
```

**Behavior**:
1. Remove token from all nodes' `tokenIds` arrays
2. Delete token from tokens array
3. If it's a palette token, the entire palette entry group is deleted when palette node is deleted

**Cascade**:
- Deleting a palette node → deletes all its shade tokens
- Deleting a group → moves tokens to ungrouped

### Token Assignment

#### Assigning to Nodes

**Method 1: Dropdown in Node**
1. Click "Select token..." dropdown in node
2. Select token from list
3. Token is added to node's `tokenIds` array

**Method 2: Drag and Drop** (Future)
1. Drag token from panel
2. Drop on node
3. Token is assigned

**Multiple Assignment**:
- A token can be assigned to multiple nodes
- A node can have multiple tokens assigned

**Assignment Logic**:
```typescript
assignTokenToNode(nodeId: string, tokenId: string, isAssigned: boolean)
```

**When assigning**:
```typescript
// Add tokenId to node's tokenIds array
node.tokenIds = [...(node.tokenIds || []), tokenId];
```

**When unassigning**:
```typescript
// Remove tokenId from node's tokenIds array
node.tokenIds = (node.tokenIds || []).filter(id => id !== tokenId);
```

#### Syncing Token Values

**Current behavior**: Tokens display color values but DO NOT sync with nodes

**Example**:
- Token "primary" assigned to Node A (hue: 200)
- Token shows hue: 200
- User changes Node A hue to 250
- Token STILL shows hue: 200 (no auto-sync)

**Future enhancement**: Bidirectional sync between tokens and nodes

### Token Display in Nodes

**Location**: Inside ColorNodeCard, below sliders

**Display**:
```
┌─────────────────────────────┐
│ Assigned Tokens:            │
│ ■ primary/500  #3B82F6  ✕   │
│ ■ accent/blue  #60A5FA  ✕   │
└─────────────────────────────┘
```

Each assigned token shows:
- Color swatch
- Token name
- Hex value
- Remove button (✕)

**Interaction**:
- Click remove button to unassign token
- Tokens are clickable (future: could navigate to token in panel)

## Token Groups

### Creating Groups

**Method 1: New Group Button**
```typescript
// Triggered by "+" button in panel
const newGroup: TokenGroup = {
  id: Date.now().toString(),
  name: "New Group",
  projectId: activeProjectId,
  pageId: activePageId,
  isExpanded: true,
  createdAt: Date.now()
};
```

**Method 2: Auto-generated for Palettes**
When a palette node is created, a palette entry group is auto-generated.

### Updating Groups

```typescript
onUpdateGroups(groups: TokenGroup[])
```

**Editable properties**:
- `name`: Double-click to edit
- `isExpanded`: Click chevron to toggle

**Operations**:
- **Rename**: Double-click group name
- **Expand/Collapse**: Click chevron icon
- **Delete**: Right-click → Delete (moves tokens to ungrouped)

### Group Organization

**Default Groups**:
1. **Color Palettes** (`isColorPaletteGroup: true`)
   - Auto-created
   - Cannot be deleted
   - Contains palette entry groups

**User Groups**:
- Created by user
- Can be renamed, deleted
- Can contain any tokens

**Ungrouped Tokens**:
- Tokens with `groupId: null`
- Displayed after all groups
- Can be dragged into groups

### Moving Tokens Between Groups

**Drag and Drop** (Future):
1. Drag token from one group
2. Drop on another group
3. Token's `groupId` is updated

**Current Method**:
- No UI for moving tokens
- Must edit token's `groupId` property directly

## Token Search

**Location**: Search box at top of token panel

**Behavior**:
- Filters tokens by name (case-insensitive)
- Shows only matching tokens and their groups
- Hides groups with no matching tokens
- Highlights search term in token names

**Implementation**:
```typescript
const filteredTokens = tokens.filter(token => 
  token.name.toLowerCase().includes(searchTerm.toLowerCase())
);
```

## Token Export/Import

### Export Project

**Trigger**: Export button in project dropdown

**Format**: JSON file
```json
{
  "projectName": "My Design System",
  "tokens": [
    {
      "id": "token-1",
      "name": "primary/500",
      "type": "color",
      "hue": 220,
      "saturation": 80,
      "lightness": 50,
      "alpha": 100,
      "groupId": "group-1"
    }
  ],
  "groups": [
    {
      "id": "group-1",
      "name": "Primary Colors",
      "isExpanded": true
    }
  ],
  "nodes": [ /* all color nodes */ ]
}
```

**Filename**: `{projectName}-export.json`

### Import Project

**Trigger**: Import button in project dropdown

**Process**:
1. User selects JSON file
2. System reads file
3. Validates JSON structure
4. Creates new project with imported data
5. Generates new IDs for all entities
6. Preserves relationships (parent-child, token assignments)

**ID Remapping**:
- All IDs are regenerated
- References are updated (parentId, groupId, tokenIds)
- Original IDs are not preserved

## Token Panel Interactions

### Resizing Panel

**Current**: Fixed width (320px)

**Future**: Draggable resize handle

### Scrolling

**Behavior**:
- Panel header is fixed (project selector, search, buttons)
- Token list scrolls independently
- Smooth scroll to navigate to tokens

### Keyboard Navigation

**Current**: Limited support

**Future**:
- Arrow keys to navigate tokens
- Enter to select/edit
- Delete to remove
- Escape to cancel editing

## Token Value Display

### Color Format

Tokens display hex values by default:
```typescript
const hex = hslToHex(token.hue, token.saturation, token.lightness);
// Example: "#3B82F6"
```

**Future formats**:
- HSLA: `hsla(220, 80%, 50%, 1)`
- OKLCH: `oklch(60% 0.15 220)`
- RGBA: `rgba(59, 130, 246, 1)`

### Copy to Clipboard

**Behavior**:
- Click copy button next to token
- Hex value is copied to clipboard
- Check icon shows briefly (2 seconds)
- Toast notification: "Copied to clipboard"

**Implementation**:
```typescript
navigator.clipboard.writeText(hexValue);
```

## Token Validation

### Name Validation

**Rules**:
- Cannot be empty (defaults to "Untitled Token")
- Can contain any characters
- Recommended: Use `/` for namespacing (e.g., "primary/500")

**Auto-naming**:
- Palette tokens use pattern: `{paletteName}/{shadeName}`
- Example: `"blue/100"`, `"blue/200"`, etc.

### Value Validation

**Color values**:
- Hue: 0-360
- Saturation: 0-100
- Lightness: 0-100
- Alpha: 0-100

**Invalid values**:
- Clamped to valid range
- No error messages shown

## Performance Considerations

### Rendering Optimization

**Virtualization** (Future):
- Only render visible tokens
- Improves performance with 1000+ tokens

**Memoization**:
- Token components are memoized
- Prevents unnecessary re-renders

### Search Performance

**Current**: Linear search (O(n))

**Future**: Indexed search for large token sets

## Token Panel Width Calculation

Dynamic width calculation for token names:

```typescript
// Fixed widths
const fixedWidth = 
  16 +  // color swatch
  70 +  // hex value
  24 +  // chevron button
  24 +  // padding
  24;   // gaps (3 * 8px)

// Dynamic max width
const dynamicMaxWidth = Math.max(60, panelWidth - fixedWidth);
```

**Overflow behavior**:
- Name truncates with ellipsis
- Tooltip shows full name on hover

## Multi-Project and Multi-Page Support

### Project Filtering

**Behavior**:
- Panel shows only tokens for active project
- Switching projects updates panel immediately

**Implementation**:
```typescript
const projectTokens = tokens.filter(t => t.projectId === activeProjectId);
```

### Page Filtering

**Behavior**:
- Panel shows only tokens for active page
- Page tabs allow switching between pages

**Implementation**:
```typescript
const pageTokens = tokens.filter(t => 
  t.projectId === activeProjectId && t.pageId === activePageId
);
```

### Cross-Page Tokens (Future)

**Concept**: Global tokens shared across all pages
- `pageId: null` for global tokens
- Displayed in all pages
- Cannot be deleted from individual pages

## Token Panel State

**Local State**:
- `editingTokenId`: Currently edited token
- `editingGroupId`: Currently edited group
- `searchTerm`: Current search query
- `copiedTokenId`: Recently copied token (for UI feedback)

**Persisted State**:
- `groups.isExpanded`: Saved to localStorage
- `projects.isExpanded`: Saved to localStorage

## Future Enhancements

### Token Aliases
```typescript
{
  name: "background",
  aliasOf: "primary/500"  // References another token
}
```

### Token Formulas
```typescript
{
  name: "primary/400",
  formula: "lighten(primary/500, 10%)"
}
```

### Token Documentation
```typescript
{
  name: "primary/500",
  description: "Main brand color for buttons and links",
  usage: "Use for primary CTAs and interactive elements"
}
```

### Token History
- Track changes to token values
- Undo/redo token edits
- Version history

### Token Validation Rules
- Min/max constraints
- Accessibility contrast checks
- Naming conventions enforcement
