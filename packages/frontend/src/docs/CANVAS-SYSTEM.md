# Canvas System

## Overview

The canvas is an infinite, zoomable workspace where color nodes are positioned and connected. It supports pan, zoom, selection, dragging, and visual wire connections.

## Canvas Component

**Location**: `/components/ColorCanvas.tsx`

**Responsibilities**:
- Render all nodes for active project/page
- Handle pan and zoom interactions
- Manage node selection and multi-selection
- Draw connection wires between parent-child nodes
- Handle node dragging and positioning
- Collision detection and auto-positioning
- Wire drag-to-connect interactions

## Pan and Zoom

### State

```typescript
const [zoom, setZoom] = useState(1);  // 0.1 to 3.0
const [pan, setPan] = useState({ x: 0, y: 0 });
const [isPanning, setIsPanning] = useState(false);
```

### Zoom Controls

**Mouse Wheel Zoom**:
- Scroll up: Zoom in (multiply by 1.1)
- Scroll down: Zoom out (divide by 1.1)
- Zoom limits: 0.1x (10%) to 3.0x (300%)

**Zoom to Point**:
- Zooms towards cursor position
- Adjusts pan to keep cursor over the same canvas position

**Implementation**:
```typescript
const handleWheel = (e: WheelEvent) => {
  e.preventDefault();
  
  const delta = e.deltaY > 0 ? 0.9 : 1.1;  // Zoom in/out
  const newZoom = Math.min(3, Math.max(0.1, zoom * delta));
  
  // Calculate cursor position in canvas coordinates
  const rect = canvasRef.current.getBoundingClientRect();
  const cursorX = (e.clientX - rect.left - pan.x) / zoom;
  const cursorY = (e.clientY - rect.top - pan.y) / zoom;
  
  // Adjust pan to zoom towards cursor
  const newPan = {
    x: pan.x - cursorX * (newZoom - zoom),
    y: pan.y - cursorY * (newZoom - zoom)
  };
  
  setZoom(newZoom);
  setPan(newPan);
};
```

### Pan Controls

**Space + Drag**:
1. Hold Space key
2. Click and drag on canvas
3. Canvas pans in drag direction
4. Release Space to stop panning

**Middle Mouse Button** (Future):
- Click middle mouse button and drag to pan

**Trackpad Gestures** (Future):
- Two-finger drag to pan
- Pinch to zoom

**Implementation**:
```typescript
// Space key detection
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.code === 'Space' && !e.repeat) {
      setIsSpacePressed(true);
    }
  };
  
  const handleKeyUp = (e: KeyboardEvent) => {
    if (e.code === 'Space') {
      setIsSpacePressed(false);
      setIsPanning(false);
    }
  };
  
  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);
  
  return () => {
    window.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('keyup', handleKeyUp);
  };
}, []);

// Pan dragging
const handleMouseDown = (e: MouseEvent) => {
  if (isSpacePressed) {
    setIsPanning(true);
    setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  }
};

const handleMouseMove = (e: MouseEvent) => {
  if (isPanning) {
    setPan({
      x: e.clientX - panStart.x,
      y: e.clientY - panStart.y
    });
  }
};
```

### Canvas State Persistence

**Per Project/Page**:
- Each project/page combination has its own canvas state
- State includes: `zoom`, `pan`, `projectId`, `pageId`

**Storage**:
```typescript
const canvasStates: CanvasState[] = [
  {
    projectId: "project-1",
    pageId: "page-1",
    pan: { x: 100, y: 50 },
    zoom: 1.0
  }
];
```

**Auto-Save**:
- Canvas state saves to localStorage on every pan/zoom change
- Debounced using requestAnimationFrame for performance

**Restore**:
- When switching projects/pages, canvas state is restored
- If no saved state exists, canvas centers on first node

### Initial View Centering

When opening a project for the first time:

**Process**:
1. Check if canvas state exists for this project/page
2. If no saved state:
   - Find all nodes for this project/page
   - Calculate center point of all nodes
   - Set pan to center the nodes in viewport
   - Set zoom to 1.0
3. If saved state exists:
   - Restore saved pan and zoom

**Implementation**:
```typescript
useEffect(() => {
  if (!hasInitializedView && nodes.length > 0) {
    // Calculate bounding box of all nodes
    const xs = nodes.map(n => n.position.x);
    const ys = nodes.map(n => n.position.y);
    
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    
    // Center in viewport
    const viewportCenterX = window.innerWidth / 2;
    const viewportCenterY = window.innerHeight / 2;
    
    setPan({
      x: viewportCenterX - centerX,
      y: viewportCenterY - centerY
    });
    
    setHasInitializedView(true);
  }
}, [nodes, hasInitializedView]);
```

## Canvas Transform

All canvas content is transformed using CSS:

```typescript
<div
  style={{
    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
    transformOrigin: '0 0'
  }}
>
  {/* All nodes and wires */}
</div>
```

**Benefits**:
- Hardware-accelerated rendering
- Smooth pan and zoom
- Simple coordinate system (nodes use absolute positions)

## Node Selection

### Single Selection

**Click to Select**:
```typescript
const handleNodeClick = (nodeId: string) => {
  setSelectedNodeId(nodeId);
  setSelectedNodeIds([nodeId]);
};
```

**Visual Feedback**:
- Selected node shows blue border
- Border width: 2px
- Border color: `#3B82F6` (blue-500)

### Multi-Selection

**Selection Rectangle**:
1. Click and drag on empty canvas (not on a node)
2. Selection rectangle appears (blue border, light blue fill)
3. All nodes within rectangle are selected when drag ends

**Implementation**:
```typescript
const [isSelecting, setIsSelecting] = useState(false);
const [selectionStart, setSelectionStart] = useState({ x: 0, y: 0 });
const [selectionEnd, setSelectionEnd] = useState({ x: 0, y: 0 });

const handleCanvasMouseDown = (e: MouseEvent) => {
  if (!isSpacePressed && e.target === canvasRef.current) {
    setIsSelecting(true);
    setSelectionStart({ x: e.clientX, y: e.clientY });
    setSelectionEnd({ x: e.clientX, y: e.clientY });
  }
};

const handleMouseMove = (e: MouseEvent) => {
  if (isSelecting) {
    setSelectionEnd({ x: e.clientX, y: e.clientY });
  }
};

const handleMouseUp = () => {
  if (isSelecting) {
    const selectedNodes = calculateSelectedNodes(
      selectionStart.x,
      selectionStart.y,
      selectionEnd.x,
      selectionEnd.y
    );
    setSelectedNodeIds(selectedNodes.map(n => n.id));
    setIsSelecting(false);
  }
};
```

**Calculate Selected Nodes**:
```typescript
const calculateSelectedNodes = (x1, y1, x2, y2) => {
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);
  
  return nodes.filter(node => {
    const nodeScreenX = node.position.x * zoom + pan.x;
    const nodeScreenY = node.position.y * zoom + pan.y;
    const nodeScreenWidth = (node.width || 240) * zoom;
    const nodeScreenHeight = getNodeHeight(node, tokens) * zoom;
    
    return nodeScreenX >= minX &&
           nodeScreenX + nodeScreenWidth <= maxX &&
           nodeScreenY >= minY &&
           nodeScreenY + nodeScreenHeight <= maxY;
  });
};
```

### Select with Children

**Double-Click Node**:
- Selects the node AND all its descendants
- Useful for moving entire hierarchies

**Implementation**:
```typescript
const selectNodeWithChildren = (nodeId: string) => {
  const descendants = getAllDescendants(nodeId);
  setSelectedNodeIds([nodeId, ...descendants]);
};

const getAllDescendants = (nodeId: string): string[] => {
  const children = nodes.filter(n => n.parentId === nodeId);
  const descendants = children.flatMap(child => 
    [child.id, ...getAllDescendants(child.id)]
  );
  return descendants;
};
```

### Clear Selection

**Click Empty Canvas**:
- Clears all selections
- Resets selectedNodeId and selectedNodeIds

**Escape Key** (Future):
- Press Escape to clear selection

## Node Dragging

### Single Node Drag

**Process**:
1. Mouse down on node drag handle (6-dot icon)
2. Set `draggedNode` state to node ID
3. Calculate drag offset (mouse position relative to node position)
4. On mouse move: Update node position
5. On mouse up: Clear drag state, save position

**Implementation**:
```typescript
const handleNodeMouseDown = (nodeId: string, e: MouseEvent) => {
  setDraggedNode(nodeId);
  
  const node = nodes.find(n => n.id === nodeId);
  setDragOffset({
    x: e.clientX / zoom - node.position.x,
    y: e.clientY / zoom - node.position.y
  });
  
  setHasDragged(false);
};

const handleMouseMove = (e: MouseEvent) => {
  if (draggedNode) {
    const newX = e.clientX / zoom - dragOffset.x;
    const newY = e.clientY / zoom - dragOffset.y;
    
    onUpdateNode(draggedNode, {
      position: { x: newX, y: newY }
    });
    
    setHasDragged(true);
  }
};
```

### Multi-Node Drag

When multiple nodes are selected and one is dragged:

**Process**:
1. Calculate delta (change in position of dragged node)
2. Apply same delta to all selected nodes
3. Maintains relative positions between nodes

**Implementation**:
```typescript
const handleMultiNodeDrag = (draggedNodeId: string, deltaX: number, deltaY: number) => {
  selectedNodeIds.forEach(nodeId => {
    const node = nodes.find(n => n.id === nodeId);
    if (node) {
      onUpdateNode(nodeId, {
        position: {
          x: node.position.x + deltaX,
          y: node.position.y + deltaY
        }
      });
    }
  });
};
```

### Drag Threshold

**Purpose**: Prevent accidental drags when clicking

**Implementation**:
```typescript
const DRAG_THRESHOLD = 5; // pixels

const hasDragged = Math.abs(deltaX) > DRAG_THRESHOLD || 
                   Math.abs(deltaY) > DRAG_THRESHOLD;
```

Only after moving more than 5 pixels does it count as a drag.

## Connection Wires

### Visual Representation

**Wire**: A curved line connecting parent to child node

**Style**:
- Color: White (`#FFFFFF`)
- Width: 2px
- Curve: Cubic Bezier curve

**Drawing**:
```typescript
<svg>
  <path
    d={`M ${parentX} ${parentY} 
        C ${parentX + 100} ${parentY}, 
          ${childX - 100} ${childY}, 
          ${childX} ${childY}`}
    stroke="#FFFFFF"
    strokeWidth="2"
    fill="none"
  />
</svg>
```

**Curve Shape**:
```
Parent ─────╮
            │
            ╰───── Child
```

Horizontal curves for better visual flow.

### Connection Points

**Parent Node**:
- Right side connection point
- Circle button (12x12px)
- Position: Center-right of node

**Child Node**:
- Left side connection point
- Circle button (12x12px)
- Position: Center-left of node

### Wire Drag Interaction

**Drag from Right Button (Create Child)**:
1. Mouse down on parent's right button
2. Wire draws from parent to cursor
3. On mouse up:
   - If dropped on empty space: Create child at cursor position
   - If dropped on another node: Connect as parent-child

**Drag from Left Button (Change Parent)**:
1. Mouse down on child's left button
2. Wire draws from child to cursor
3. On mouse up:
   - If dropped on empty space: Unlink child (becomes root)
   - If dropped on another node: Relink to new parent

**Visual Feedback**:
- Active wire: Animated, brighter color
- Hover on valid target: Target node highlights
- Hover on invalid target (circular ref): Red error state

**Implementation**:
```typescript
const handleWireDragStart = (nodeId: string, buttonType: 'left' | 'right') => {
  setIsDraggingWire(true);
  setWireStartNodeId(nodeId);
  setWireStartButtonType(buttonType);
};

const handleWireDragMove = (e: MouseEvent) => {
  if (isDraggingWire) {
    setWireMousePosition({
      x: (e.clientX - pan.x) / zoom,
      y: (e.clientY - pan.y) / zoom
    });
  }
};

const handleWireDragEnd = (targetNodeId: string | null) => {
  if (wireStartButtonType === 'right') {
    // Creating child or connecting as parent
    if (targetNodeId) {
      linkNode(targetNodeId, wireStartNodeId);
    } else {
      addChildNode(wireStartNodeId, wireMousePosition);
    }
  } else if (wireStartButtonType === 'left') {
    // Changing parent or unlinking
    if (targetNodeId) {
      linkNode(wireStartNodeId, targetNodeId);
    } else {
      unlinkNode(wireStartNodeId);
    }
  }
  
  setIsDraggingWire(false);
  setWireStartNodeId(null);
  setWireStartButtonType(null);
};
```

### Circular Reference Prevention

When attempting to connect nodes:

**Check**:
```typescript
const wouldCreateCircularRef = (childId: string, parentId: string): boolean => {
  if (childId === parentId) return true;
  
  // Check if parent is a descendant of child
  const isDescendant = (nodeId: string, ancestorId: string): boolean => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node || !node.parentId) return false;
    if (node.parentId === ancestorId) return true;
    return isDescendant(node.parentId, ancestorId);
  };
  
  return isDescendant(parentId, childId);
};
```

**Error Display**:
If circular reference detected:
```typescript
setConnectionError({
  nodeId: targetNodeId,
  message: "Cannot create circular reference"
});

// Auto-dismiss after 2 seconds
setTimeout(() => {
  setConnectionError(null);
}, 2000);
```

Error shows as red border and message on target node.

## Collision Detection

### Purpose

Prevent nodes from overlapping when auto-positioning.

### Detection Algorithm

```typescript
const checkCollision = (nodeA, nodeB) => {
  const MIN_GAP = 30; // Minimum spacing between nodes
  
  const aLeft = nodeA.position.x;
  const aRight = nodeA.position.x + nodeA.width;
  const aTop = nodeA.position.y;
  const aBottom = nodeA.position.y + getNodeHeight(nodeA, tokens);
  
  const bLeft = nodeB.position.x;
  const bRight = nodeB.position.x + nodeB.width;
  const bTop = nodeB.position.y;
  const bBottom = nodeB.position.y + getNodeHeight(nodeB, tokens);
  
  const horizontalOverlap = !(aRight + MIN_GAP <= bLeft || bRight + MIN_GAP <= aLeft);
  const verticalOverlap = !(aBottom + MIN_GAP <= bTop || bBottom + MIN_GAP <= aTop);
  
  return horizontalOverlap && verticalOverlap;
};
```

### Collision Resolution

**Strategies based on relationship**:

**Siblings** (same parent):
- Push vertically (downward)
- Maintains horizontal alignment

**Parent-Child**:
- Maintain horizontal offset (child to right of parent)
- Adjust vertically if needed

**Unrelated Nodes**:
- Push in spiral pattern
- Find nearest free space

**Implementation**:
```typescript
const resolveCollisions = (nodes) => {
  let hadCollision = true;
  let iterations = 0;
  const maxIterations = 15;
  
  while (hadCollision && iterations < maxIterations) {
    hadCollision = false;
    
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        if (checkCollision(nodes[i], nodes[j])) {
          hadCollision = true;
          
          // Determine relationship
          const isSiblings = nodes[i].parentId === nodes[j].parentId;
          const isParentChild = nodes[i].parentId === nodes[j].id || 
                                nodes[j].parentId === nodes[i].id;
          
          // Apply appropriate resolution
          if (isSiblings) {
            // Push lower node down
            const lower = nodes[i].position.y > nodes[j].position.y ? i : j;
            nodes[lower].position.y += MIN_GAP;
          } else if (isParentChild) {
            // Maintain horizontal offset
            // ...
          } else {
            // Push horizontally
            nodes[j].position.x += MIN_GAP;
          }
        }
      }
    }
    
    iterations++;
  }
  
  return nodes;
};
```

## Grid Snapping (Future)

### Grid Display

Optional grid overlay:
- Grid spacing: 10px or 20px
- Color: Subtle gray (#333)
- Only visible at zoom > 0.5

### Snap to Grid

When enabled:
- Node positions snap to nearest grid point
- Grid size: 10px or 20px
- Snap on drag end (not during drag)

**Implementation**:
```typescript
const snapToGrid = (position: { x: number; y: number }, gridSize: number) => {
  return {
    x: Math.round(position.x / gridSize) * gridSize,
    y: Math.round(position.y / gridSize) * gridSize
  };
};
```

## Keyboard Shortcuts

### Current Shortcuts

- **Space + Drag**: Pan canvas
- **Mouse Wheel**: Zoom in/out

### Future Shortcuts

- **Cmd/Ctrl + A**: Select all nodes
- **Cmd/Ctrl + D**: Duplicate selected nodes
- **Delete/Backspace**: Delete selected nodes
- **Cmd/Ctrl + Z**: Undo
- **Cmd/Ctrl + Shift + Z**: Redo
- **Arrow Keys**: Nudge selected nodes (1px or 10px with Shift)
- **Cmd/Ctrl + Plus**: Zoom in
- **Cmd/Ctrl + Minus**: Zoom out
- **Cmd/Ctrl + 0**: Reset zoom to 100%
- **Escape**: Clear selection

## Canvas Context Menu (Future)

Right-click on canvas:
```
┌───────────────────────┐
│ Add Color Node        │
│ Add Palette Node      │
│ Add Spacing Node      │
├───────────────────────┤
│ Paste                 │
├───────────────────────┤
│ Select All            │
│ Clear Selection       │
└───────────────────────┘
```

Right-click on node:
```
┌───────────────────────┐
│ Add Child             │
│ Duplicate             │
│ Delete                │
├───────────────────────┤
│ Copy                  │
│ Paste                 │
├───────────────────────┤
│ Expand                │
│ Collapse              │
├───────────────────────┤
│ Bring to Front        │
│ Send to Back          │
└───────────────────────┘
```

## Performance Optimizations

### Render Optimization

**Virtualization** (Future):
- Only render nodes visible in viewport
- Off-screen nodes are not rendered
- Improves performance with 1000+ nodes

**Memoization**:
- ColorNodeCard is memoized
- Prevents re-renders when props don't change

**RAF Batching**:
- Pan/zoom updates batched with requestAnimationFrame
- Smooth 60fps animations

### Debounced Saves

**Canvas State**:
- Saves to localStorage on every pan/zoom
- Batched using RAF to prevent excessive writes

**Node Positions**:
- Saves on drag end, not during drag
- Prevents localStorage spam during dragging

## Canvas Measurements

### Viewport

**Size**: Full browser window minus header/sidebar

**Calculation**:
```typescript
const viewportWidth = window.innerWidth - sidebarWidth;
const viewportHeight = window.innerHeight - headerHeight;
```

### Canvas Coordinates

**Screen to Canvas**:
```typescript
const canvasX = (screenX - pan.x) / zoom;
const canvasY = (screenY - pan.y) / zoom;
```

**Canvas to Screen**:
```typescript
const screenX = canvasX * zoom + pan.x;
const screenY = canvasY * zoom + pan.y;
```

### Node Dimensions

**Default Width**: 240px

**Height**: Calculated dynamically based on:
- Expanded/collapsed state
- Number of assigned tokens
- Color space (number of sliders)

**Calculation**: See `getNodeHeight()` in `/App.tsx`
