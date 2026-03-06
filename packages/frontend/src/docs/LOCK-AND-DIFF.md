# Lock and Diff System

## Overview

The lock and diff system controls how child nodes inherit color values from their parent nodes. This system provides fine-grained control over which properties inherit and how they inherit.

## System Components

### Lock System
**Purpose**: Prevents a specific property from inheriting any changes from the parent.

**Behavior**: When a property is locked, the child's value for that property stays fixed and doesn't change when the parent's value changes.

### Diff System
**Purpose**: Controls whether a property maintains an offset (diff) from the parent or matches the parent exactly.

**Behavior**: 
- **Diff enabled**: Child maintains a calculated offset from parent (e.g., parent hue + 25)
- **Diff disabled**: Child matches parent exactly (e.g., if parent hue is 0, child hue is also 0)

## Lock States

### Property-Specific Locks

Each color property can be independently locked:

**HSL Locks**:
```typescript
lockHue?: boolean;
lockSaturation?: boolean;
lockLightness?: boolean;
lockAlpha?: boolean;
```

**RGB Locks**:
```typescript
lockRed?: boolean;
lockGreen?: boolean;
lockBlue?: boolean;
```

**OKLCH Locks**:
```typescript
lockOklchL?: boolean;
lockOklchC?: boolean;
lockOklchH?: boolean;
```

### Lock Behavior

**When a property is LOCKED** (`lockHue: true`):
- The child's value for that property **does not change** when parent changes
- User can manually adjust the locked property
- The lock icon shows as **blue/active**

**When a property is UNLOCKED** (`lockHue: false` or `undefined`):
- The child's value **inherits from parent** based on diff state
- If diff enabled: child value = parent value + offset
- If diff disabled: child value = parent value
- The lock icon shows as **gray/inactive**

**Example**:
```
Parent: hue = 180
Child: hue = 200, lockHue = false, hueOffset = 20, diffHue = true

When parent hue changes to 200:
  Child hue = 200 + 20 = 220

If lockHue is set to true:
  Child hue stays at 200 (no change even when parent changes)
```

## Diff States

### Property-Specific Diffs

Each color property can have diff enabled or disabled:

**HSL Diffs**:
```typescript
diffHue?: boolean;
diffSaturation?: boolean;
diffLightness?: boolean;
diffAlpha?: boolean;
```

**RGB Diffs**:
```typescript
diffRed?: boolean;
diffGreen?: boolean;
diffBlue?: boolean;
```

**OKLCH Diffs**:
```typescript
diffOklchL?: boolean;
diffOklchC?: boolean;
diffOklchH?: boolean;
```

### Diff Behavior

**When diff is ENABLED** (`diffHue: true`):
- Child maintains an **offset** from parent
- Offset is stored in offset properties (e.g., `hueOffset`)
- Formula: `child value = parent value + offset`
- Diff icon shows as **blue/active**

**When diff is DISABLED** (`diffHue: false` or `undefined`):
- Child **matches parent exactly**
- Offset is ignored
- Formula: `child value = parent value`
- Diff icon shows as **gray with strikethrough**

**Example**:
```
Parent: hue = 0
Child: hue = 25, hueOffset = 25, diffHue = true

When parent hue changes to 50:
  Child hue = 50 + 25 = 75

If diffHue is disabled (diffHue = false):
  Child hue = 50 (matches parent exactly, offset ignored)
```

## Offset Properties

Offsets store the difference between parent and child values:

**HSL Offsets**:
```typescript
hueOffset: number;           // -360 to 360
saturationOffset: number;    // -100 to 100
lightnessOffset: number;     // -100 to 100
alphaOffset: number;         // -100 to 100
```

**RGB Offsets**:
```typescript
redOffset?: number;          // -255 to 255
greenOffset?: number;        // -255 to 255
blueOffset?: number;         // -255 to 255
```

**OKLCH Offsets**:
```typescript
oklchLOffset?: number;       // -100 to 100
oklchCOffset?: number;       // -100 to 100
oklchHOffset?: number;       // -360 to 360
```

### Offset Calculation

**When creating a child**:
```typescript
// Child is created matching parent exactly
childNode.hue = parentNode.hue;
childNode.hueOffset = 0;
childNode.diffHue = false;
```

**When user adjusts child slider WITH diff enabled**:
```typescript
// Offset is recalculated
const newOffset = childValue - parentValue;
childNode.hueOffset = newOffset;
// e.g., if parent hue = 100 and user sets child hue to 125
// hueOffset = 125 - 100 = 25
```

**When user adjusts child slider WITH diff disabled**:
```typescript
// Child value is set directly, offset may be stored but is not used
childNode.hue = newValue;
// Offset might be updated for future diff enabling, but not applied
```

**When parent changes WITH diff enabled**:
```typescript
// Child value updates based on offset
childNode.hue = parentNode.hue + childNode.hueOffset;
// e.g., if parent changes to 150 and offset is 25
// child hue = 150 + 25 = 175
```

**When parent changes WITH diff disabled**:
```typescript
// Child matches parent exactly
childNode.hue = parentNode.hue;
// Offset is ignored
```

## Lock and Diff Interaction

### Priority Matrix

| Lock State | Diff State | Behavior |
|------------|-----------|----------|
| Locked | Enabled | **Lock takes precedence** - value doesn't change |
| Locked | Disabled | **Lock takes precedence** - value doesn't change |
| Unlocked | Enabled | **Inherits with offset** - child = parent + offset |
| Unlocked | Disabled | **Matches parent exactly** - child = parent |

**Key Rule**: **Lock always takes priority**. If a property is locked, diff state is irrelevant.

### Use Cases

**Case 1: Independent child color**
```typescript
lockHue: true
lockSaturation: true
lockLightness: true
lockAlpha: true
```
Child has completely independent color that never changes with parent.

**Case 2: Exact match with parent**
```typescript
lockHue: false
diffHue: false
diffSaturation: false
diffLightness: false
diffAlpha: false
```
Child always matches parent exactly for all properties.

**Case 3: Offset-based variation**
```typescript
lockHue: false
diffHue: true
hueOffset: 30
```
Child hue is always 30 degrees offset from parent.

**Case 4: Mixed control**
```typescript
lockHue: true        // Hue is independent
diffSaturation: true // Saturation maintains offset
diffLightness: false // Lightness matches parent exactly
diffAlpha: false     // Alpha matches parent exactly
```
Fine-grained control over which properties inherit and how.

## UI Components

### Lock/Diff Controls

**Location**: Each property label in expanded node view

**Interaction**:
1. **Hover over property label** (e.g., "Hue", "Saturation")
2. **Popup appears** with two buttons:
   - **Lock button** (lock/unlock icon)
   - **Diff button** (diff icon with optional strikethrough)

**Visual States**:

**Lock Button**:
- **Unlocked** (gray): Property inherits from parent
- **Locked** (blue): Property is independent

**Diff Button**:
- **Enabled** (blue): Maintains offset from parent
- **Disabled** (gray with strikethrough): Matches parent exactly

### Property Labels

Properties with active lock or diff show **colored backgrounds**:

```typescript
// Background color adapts to node color for contrast
backgroundColor = nodeLightness > 50 ? '#60A5FA' : '#3B83F6'
```

**Adjacent properties with active states merge visually**:
- First in sequence: Left rounded corners
- Middle in sequence: No rounded corners
- Last in sequence: Right rounded corners

**Example**: If H, S, and L all have diff enabled, they appear as one continuous blue bar.

## Auto-Enable Diff Logic (REMOVED)

**Previous Behavior (DEPRECATED)**:
When a user adjusted a child node's slider, diff would automatically enable for that property.

**Current Behavior**:
- Users must **manually toggle diff** using the diff button
- Adjusting a slider does NOT automatically enable diff
- This gives users explicit control over inheritance behavior

**Note**: The auto-enable logic was removed from all color change handlers in ColorNodeCard.tsx to prevent unintended diff activation.

## Implementation Status

### Currently Working

✅ **Lock system**: Fully functional
- Locking prevents inheritance
- Visual feedback with lock icons
- Works across all color spaces

✅ **Diff UI**: Fully functional
- Diff buttons visible and interactive
- Visual state shows enabled/disabled
- Manual toggle works

✅ **Offset storage**: Working
- Offsets are stored in node properties
- Offsets are updated when child values change

### Needs Implementation

❌ **Offset-based inheritance calculation**: NOT IMPLEMENTED
- When parent changes, children with diff enabled don't apply offset
- Children currently match parent exactly regardless of diff state
- Offset calculation in change handlers needs implementation

❌ **Diff recalculation on child change**: PARTIAL
- When child slider changes with diff enabled, offset should recalculate
- Current implementation may not recalculate offset correctly

❌ **Parent change propagation**: NOT IMPLEMENTED
- When parent node changes, system should:
  1. Find all children
  2. For each property:
     - If locked: no change
     - If unlocked + diff enabled: child = parent + offset
     - If unlocked + diff disabled: child = parent
  3. Update all children nodes
- This logic is NOT in the current `updateNode` function

## Implementation Guidelines

### Where to Implement

**File**: `/App.tsx` - `updateNode` function

**Logic**:
```typescript
const updateNode = useCallback((id: string, updates: Partial<ColorNode>) => {
  setAllNodes((prev) => {
    // 1. Update the target node
    const updatedNodes = prev.map(n => n.id === id ? { ...n, ...updates } : n);
    const updatedNode = updatedNodes.find(n => n.id === id);
    
    // 2. Find all children of the updated node
    const children = updatedNodes.filter(n => n.parentId === id);
    
    // 3. Check if any color properties changed
    const colorPropertiesChanged = 
      updates.hue !== undefined ||
      updates.saturation !== undefined ||
      updates.lightness !== undefined ||
      updates.alpha !== undefined ||
      updates.red !== undefined ||
      updates.green !== undefined ||
      updates.blue !== undefined ||
      updates.oklchL !== undefined ||
      updates.oklchC !== undefined ||
      updates.oklchH !== undefined;
    
    // 4. If color changed, update all children
    if (colorPropertiesChanged && children.length > 0) {
      return updatedNodes.map(node => {
        if (node.parentId !== id) return node;
        
        // This is a child of the updated node
        const updates: Partial<ColorNode> = {};
        
        // For each property, check lock and diff
        if (updatedNode.hue !== undefined) {
          if (!node.lockHue) {
            if (node.diffHue) {
              updates.hue = updatedNode.hue + (node.hueOffset || 0);
            } else {
              updates.hue = updatedNode.hue;
            }
          }
        }
        
        // ... repeat for all properties
        
        return { ...node, ...updates };
      });
    }
    
    return updatedNodes;
  });
}, []);
```

### Offset Recalculation

When a child node's slider changes:

```typescript
// In ColorNodeCard.tsx, when slider changes
const handleHueChange = (newValue: number) => {
  const updates: Partial<ColorNode> = {
    hue: newValue
  };
  
  // If diff is enabled and node has parent, recalculate offset
  if (node.diffHue && node.parentId) {
    const parent = nodes.find(n => n.id === node.parentId);
    if (parent) {
      updates.hueOffset = newValue - parent.hue;
    }
  }
  
  onUpdateNode(node.id, updates);
};
```

## Testing Scenarios

### Test 1: Basic Offset Inheritance
1. Create parent node (hue = 0)
2. Create child node (hue = 0, hueOffset = 0, diffHue = false)
3. Manually adjust child hue to 25
4. Enable diff for hue
5. Expected: hueOffset should be 25
6. Change parent hue to 50
7. Expected: child hue should be 75 (50 + 25)

### Test 2: Lock Prevents Inheritance
1. Create parent node (hue = 0)
2. Create child node (hue = 25, diffHue = true, hueOffset = 25)
3. Lock child hue
4. Change parent hue to 100
5. Expected: child hue stays at 25 (locked)

### Test 3: Diff Disabled Matches Parent
1. Create parent node (hue = 0)
2. Create child node (hue = 25, diffHue = false, hueOffset = 25)
3. Change parent hue to 100
4. Expected: child hue should be 100 (matches parent, offset ignored)

### Test 4: Multi-Level Hierarchy
1. Create parent A (hue = 0)
2. Create child B of A (hue = 25, diffHue = true, hueOffset = 25)
3. Create child C of B (hue = 50, diffHue = true, hueOffset = 25)
4. Change parent A hue to 100
5. Expected: B hue = 125 (100 + 25), C hue = 150 (125 + 25)

### Test 5: Mixed Properties
1. Create parent (hue = 0, saturation = 50)
2. Create child (hue = 30, saturation = 50, diffHue = true, diffSaturation = false)
3. Change parent: hue = 100, saturation = 80
4. Expected: child hue = 130 (100 + 30), child saturation = 80 (matches)
