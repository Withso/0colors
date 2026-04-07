import { useState, useRef, useCallback, useEffect } from 'react';
import { X, GripHorizontal, Keyboard, Lightbulb, MousePointerClick } from 'lucide-react';
import { Tip } from '../Tip';
import './ShortcutsPanel.css';

interface ShortcutsPanelProps {
  onClose: () => void;
}

// Detect macOS for modifier key display
const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
const MOD = isMac ? '\u2318' : 'Ctrl';
const SHIFT = isMac ? '\u21E7' : 'Shift';
const ALT = isMac ? '\u2325' : 'Alt';

// ───── Shortcuts Data ─────

interface Shortcut {
  keys: string[];
  description: string;
}

interface ShortcutCategory {
  title: string;
  shortcuts: Shortcut[];
}

const shortcutCategories: ShortcutCategory[] = [
  {
    title: 'Global',
    shortcuts: [
      { keys: [MOD, 'Z'], description: 'Undo' },
      { keys: [MOD, SHIFT, 'Z'], description: 'Redo' },
      { keys: [MOD, 'C'], description: 'Copy node' },
      { keys: [MOD, 'V'], description: 'Paste node' },
      { keys: [MOD, 'D'], description: 'Duplicate node' },
      { keys: ['Del', '/', 'Bksp'], description: 'Delete selected node(s)' },
      { keys: ['Esc'], description: 'Deselect all' },
      { keys: ['O'], description: 'Toggle show all visible' },
      { keys: [ALT, 'T'], description: 'Open auto-assign tokens' },
      { keys: ['1', '–', '9'], description: 'Switch to theme 1–9' },
    ],
  },
  {
    title: 'Canvas',
    shortcuts: [
      { keys: [MOD, '+'], description: 'Zoom in' },
      { keys: [MOD, '\u2212'], description: 'Zoom out' },
      { keys: [SHIFT, '1'], description: 'Zoom to fit all nodes' },
      { keys: [SHIFT, '0'], description: 'Reset view' },
      { keys: ['\u2190'], description: 'Navigate to parent node' },
      { keys: ['\u2192'], description: 'Navigate to first child' },
      { keys: ['\u2191', '/', '\u2193'], description: 'Navigate between siblings' },
      { keys: ['Space'], description: 'Hold to pan' },
    ],
  },
  {
    title: 'Nodes',
    shortcuts: [
      { keys: ['C'], description: 'Open / close color picker' },
      { keys: [SHIFT, 'C'], description: 'Close color picker' },
      { keys: ['Tab'], description: 'Focus navigation in picker' },
      { keys: ['Enter'], description: 'Commit input value' },
      { keys: ['H', 'S', 'L', 'A'], description: 'Focus HSL property' },
      { keys: ['R', 'G', 'B', 'A'], description: 'Focus RGB property' },
      { keys: ['L', 'C', 'H', 'A'], description: 'Focus OKLCH property' },
      { keys: ['H', 'C', 'T', 'A'], description: 'Focus HCT property' },
    ],
  },
  {
    title: 'Advanced Logic',
    shortcuts: [
      { keys: [ALT, 'F'], description: 'Open advanced logic popup' },
      { keys: ['E'], description: 'Expand popup (when minimized)' },
      { keys: ['M'], description: 'Minimize popup (when expanded)' },
      { keys: ['Esc'], description: 'Close popup' },
    ],
  },
  {
    title: 'Tokens Panel',
    shortcuts: [
      { keys: ['Esc'], description: 'Deselect all tokens' },
      { keys: [MOD, 'A'], description: 'Select all tokens' },
      { keys: [ALT, '\u2191', '/', '\u2193'], description: 'Reorder selected tokens' },
      { keys: [SHIFT, '\u2191', '/', '\u2193'], description: 'Extend / shrink selection' },
    ],
  },
];

// ───── Tips Data ─────

interface Tip {
  action: string;
  description: string;
}

interface TipCategory {
  title: string;
  tips: Tip[];
}

const tipCategories: TipCategory[] = [
  {
    title: 'Canvas',
    tips: [
      { action: 'Double-click node', description: 'Select the node and all its descendants \u2014 useful for moving entire hierarchies' },
      { action: 'Drag on empty canvas', description: 'Draw a selection rectangle to multi-select nodes' },
      { action: SHIFT + ' + click node', description: 'Toggle the node in/out of multi-selection' },
      { action: SHIFT + ' + drag on canvas', description: 'Additive rectangle selection \u2014 toggles nodes without losing existing selection' },
      { action: 'Scroll / trackpad', description: 'Pan the canvas in any direction' },
      { action: MOD + ' + scroll or pinch', description: 'Zoom in/out centered on cursor position' },
      { action: 'Drag connection button', description: 'Draw a wire to link nodes in a parent\u2013child relationship' },
      { action: 'Drag selected nodes', description: 'Move all multi-selected nodes together as a group' },
    ],
  },
  {
    title: 'Nodes',
    tips: [
      { action: 'Hover hex value', description: 'Reveals a copy button \u2014 click to copy the hex code to clipboard' },
      { action: 'Drag scrubber inputs', description: 'Drag horizontally on any value input to scrub the value up/down' },
      { action: 'Click scrubber input', description: 'Click to type a precise value directly' },
      { action: 'Lock icon on property', description: 'Locks a color channel so children inherit the exact value from the parent' },
      { action: 'Diff icon on property', description: 'Maintains the offset from parent rather than inheriting the absolute value' },
      { action: 'Arrow keys with picker open', description: 'Navigate to adjacent nodes \u2014 the color picker auto-opens on the new node' },
    ],
  },
  {
    title: 'Advanced Logic',
    tips: [
      { action: 'Click green fx button', description: 'Open the Advanced Logic popup focused on that channel' },
      { action: 'Click Advanced island badge', description: 'Open the Advanced Logic popup for that node' },
      { action: ALT + ' + F with node selected', description: 'Open the Advanced Logic popup via keyboard' },
    ],
  },
  {
    title: 'Tokens Panel',
    tips: [
      { action: 'Click token', description: 'Navigate to the token\u2019s assigned node on the canvas and zoom to it' },
      { action: MOD + ' + click token', description: 'Toggle individual token selection without clearing others' },
      { action: SHIFT + ' + click token', description: 'Range-select all tokens between the anchor and the clicked token' },
      { action: MOD + ' + ' + SHIFT + ' + click', description: 'Toggle an entire range within the existing selection' },
      { action: 'Double-click token name', description: 'Rename the token inline (primary theme only)' },
      { action: 'Right-click token', description: 'Context menu with rename, move to group, reorder, and delete options' },
      { action: 'Drag token', description: 'Reorder tokens within a group or move between groups' },
    ],
  },
  {
    title: 'General',
    tips: [
      { action: 'Double-click page name', description: 'Rename the current page inline in the header bar' },
      { action: 'Double-click theme name', description: 'Rename the current theme inline in the header bar' },
      { action: 'Double-click group name', description: 'Rename a token group inline in the tokens panel' },
      { action: 'Double-click project name', description: 'Rename the active project in the tokens panel header' },
    ],
  },
];

// ───── Sub-components ─────

function KeyBadge({ k }: { k: string }) {
  if (k === '/' || k === '–') {
    return <span className="shortcuts-key-separator">{k}</span>;
  }
  return (
    <kbd className="shortcuts-key">
      {k}
    </kbd>
  );
}

function ActionBadge({ text }: { text: string }) {
  return (
    <span className="shortcuts-action-badge">
      {text}
    </span>
  );
}

// ───── Main Component ─────

export function ShortcutsPanel({ onClose }: ShortcutsPanelProps) {
  const [activeTab, setActiveTab] = useState<'shortcuts' | 'tips'>('shortcuts');

  // ───── Position & size (localStorage persisted) ─────
  const [position, setPosition] = useState(() => {
    try {
      const saved = localStorage.getItem('shortcutsPanelLayout');
      if (saved) {
        const p = JSON.parse(saved);
        if (typeof p.x === 'number' && typeof p.y === 'number') return { x: p.x, y: p.y };
      }
    } catch {}
    return { x: 0, y: 0 };
  });
  const [size, setSize] = useState(() => {
    try {
      const saved = localStorage.getItem('shortcutsPanelLayout');
      if (saved) {
        const p = JSON.parse(saved);
        if (typeof p.width === 'number' && typeof p.height === 'number') return { width: p.width, height: p.height };
      }
    } catch {}
    return { width: 420, height: 560 };
  });
  const [initialized, setInitialized] = useState(() => {
    try {
      const saved = localStorage.getItem('shortcutsPanelLayout');
      if (saved) {
        const p = JSON.parse(saved);
        return typeof p.x === 'number' && typeof p.y === 'number';
      }
    } catch {}
    return false;
  });

  // ───── Drag state ─────
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });

  // ───── Resize state ─────
  const [isResizing, setIsResizing] = useState(false);
  const [resizeEdge, setResizeEdge] = useState('');
  const resizeStart = useRef({ x: 0, y: 0, width: 0, height: 0, posX: 0, posY: 0 });

  const popupRef = useRef<HTMLDivElement>(null);

  // ───── Active / inactive ─────
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      requestAnimationFrame(() => {
        if (popupRef.current && popupRef.current.contains(e.target as Node)) {
          setIsActive(true);
        } else {
          setIsActive(false);
        }
      });
    };
    window.addEventListener('mousedown', handleMouseDown);
    return () => window.removeEventListener('mousedown', handleMouseDown);
  }, []);

  // Center on mount
  useEffect(() => {
    if (!initialized) {
      const w = window.innerWidth;
      const h = window.innerHeight;
      setPosition({
        x: Math.max(16, (w - size.width) / 2),
        y: Math.max(16, (h - size.height) / 2),
      });
      setInitialized(true);
    }
  }, [initialized, size.width, size.height]);

  // Escape to close
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isActive) {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose, isActive]);

  // ───── Drag handlers ─────
  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest('button')) return;
      e.preventDefault();
      setIsDragging(true);
      dragStart.current = { x: e.clientX - position.x, y: e.clientY - position.y };
    },
    [position],
  );

  useEffect(() => {
    if (!isDragging) return;
    const move = (e: MouseEvent) => {
      setPosition({
        x: Math.max(0, Math.min(window.innerWidth - 100, e.clientX - dragStart.current.x)),
        y: Math.max(0, Math.min(window.innerHeight - 40, e.clientY - dragStart.current.y)),
      });
    };
    const up = () => setIsDragging(false);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
  }, [isDragging]);

  // Persist after drag
  const prevIsDragging = useRef(isDragging);
  useEffect(() => {
    if (prevIsDragging.current && !isDragging) {
      localStorage.setItem(
        'shortcutsPanelLayout',
        JSON.stringify({ x: position.x, y: position.y, width: size.width, height: size.height }),
      );
    }
    prevIsDragging.current = isDragging;
  }, [isDragging, position, size]);

  // ───── Resize handlers ─────
  const handleResizeStart = useCallback(
    (e: React.MouseEvent, edgeName: string) => {
      e.preventDefault();
      e.stopPropagation();
      setIsResizing(true);
      setResizeEdge(edgeName);
      resizeStart.current = {
        x: e.clientX,
        y: e.clientY,
        width: size.width,
        height: size.height,
        posX: position.x,
        posY: position.y,
      };
    },
    [size, position],
  );

  useEffect(() => {
    if (!isResizing) return;
    const move = (e: MouseEvent) => {
      const dx = e.clientX - resizeStart.current.x;
      const dy = e.clientY - resizeStart.current.y;
      let w = resizeStart.current.width;
      let h = resizeStart.current.height;
      let px = resizeStart.current.posX;
      let py = resizeStart.current.posY;
      if (resizeEdge.includes('e')) w = Math.max(320, resizeStart.current.width + dx);
      if (resizeEdge.includes('w')) {
        w = Math.max(320, resizeStart.current.width - dx);
        px = resizeStart.current.posX + (resizeStart.current.width - w);
      }
      if (resizeEdge.includes('s')) h = Math.max(280, resizeStart.current.height + dy);
      if (resizeEdge.includes('n')) {
        h = Math.max(280, resizeStart.current.height - dy);
        py = resizeStart.current.posY + (resizeStart.current.height - h);
      }
      setSize({ width: w, height: h });
      setPosition({ x: px, y: py });
    };
    const up = () => {
      setIsResizing(false);
      setResizeEdge('');
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
  }, [isResizing, resizeEdge]);

  // Persist after resize
  const prevIsResizing = useRef(isResizing);
  useEffect(() => {
    if (prevIsResizing.current && !isResizing) {
      localStorage.setItem(
        'shortcutsPanelLayout',
        JSON.stringify({ x: position.x, y: position.y, width: size.width, height: size.height }),
      );
    }
    prevIsResizing.current = isResizing;
  }, [isResizing, position, size]);

  // Resize-edge helper
  const edgeStyle = (cursor: string, pos: React.CSSProperties): React.CSSProperties => ({
    position: 'absolute',
    zIndex: 10,
    cursor,
    ...pos,
  });

  return (
    <div
      ref={popupRef}
      className={`shortcuts-panel${isActive ? ' shortcuts-panel--active' : ''}`}
      data-testid="shortcuts-panel-container"
      style={{
        left: position.x,
        top: position.y,
        width: size.width,
        height: size.height,
      }}
    >
      {/* Resize handles */}
      <div style={edgeStyle('ew-resize', { top: 0, right: -3, bottom: 0, width: 6 })} onMouseDown={(e) => handleResizeStart(e, 'e')} />
      <div style={edgeStyle('ew-resize', { top: 0, left: -3, bottom: 0, width: 6 })} onMouseDown={(e) => handleResizeStart(e, 'w')} />
      <div style={edgeStyle('ns-resize', { bottom: -3, left: 0, right: 0, height: 6 })} onMouseDown={(e) => handleResizeStart(e, 's')} />
      <div style={edgeStyle('ns-resize', { top: -3, left: 0, right: 0, height: 6 })} onMouseDown={(e) => handleResizeStart(e, 'n')} />
      <div style={edgeStyle('nwse-resize', { bottom: -4, right: -4, width: 14, height: 14 })} onMouseDown={(e) => handleResizeStart(e, 'se')} />
      <div style={edgeStyle('nesw-resize', { bottom: -4, left: -4, width: 14, height: 14 })} onMouseDown={(e) => handleResizeStart(e, 'sw')} />
      <div style={edgeStyle('nesw-resize', { top: -4, right: -4, width: 14, height: 14 })} onMouseDown={(e) => handleResizeStart(e, 'ne')} />
      <div style={edgeStyle('nwse-resize', { top: -4, left: -4, width: 14, height: 14 })} onMouseDown={(e) => handleResizeStart(e, 'nw')} />

      {/* ─── Header ─── */}
      <div
        className="shortcuts-header"
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
        onMouseDown={handleDragStart}
      >
        <div className="shortcuts-header-left">
          <GripHorizontal size={14} className="shortcuts-header-icon" />
          <span className="shortcuts-header-title">Shortcuts & Tips</span>
        </div>
        <Tip label="Close Panel" side="bottom">
        <button
          onClick={onClose}
          className="shortcuts-close-btn"
          data-testid="shortcuts-panel-close-button"
        >
          <X size={14} />
        </button>
        </Tip>
      </div>

      {/* ─── Tab Bar ─── */}
      <div className="shortcuts-tabs">
        <button
          onClick={() => setActiveTab('shortcuts')}
          className={`shortcuts-tab ${
            activeTab === 'shortcuts' ? 'shortcuts-tab--active' : 'shortcuts-tab--inactive'
          }`}
        >
          <Keyboard size={12} />
          Shortcuts
        </button>
        <button
          onClick={() => setActiveTab('tips')}
          className={`shortcuts-tab ${
            activeTab === 'tips' ? 'shortcuts-tab--active' : 'shortcuts-tab--inactive'
          }`}
        >
          <Lightbulb size={12} />
          Tips
        </button>
      </div>

      {/* ─── Body ─── */}
      <div className="shortcuts-body">
        {activeTab === 'shortcuts' && (
          <>
            {shortcutCategories.map((cat, ci) => (
              <div key={cat.title}>
                {/* Category header */}
                <div className="shortcuts-category-header">
                  <div className="shortcuts-category-inner">
                    <span className="shortcuts-category-title">{cat.title}</span>
                    <div className="shortcuts-category-line" />
                  </div>
                </div>

                {/* Shortcut rows */}
                <div>
                  {cat.shortcuts.map((sc, si) => (
                    <div
                      key={si}
                      className="shortcuts-row"
                    >
                      <span className="shortcuts-row-desc">
                        {sc.description}
                      </span>
                      <div className="shortcuts-row-keys">
                        {sc.keys.map((k, ki) => (
                          <KeyBadge key={ki} k={k} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Divider */}
                {ci < shortcutCategories.length - 1 && <div className="shortcuts-divider" />}
              </div>
            ))}
            <div className="shortcuts-spacer" />
          </>
        )}

        {activeTab === 'tips' && (
          <>
            {tipCategories.map((cat, ci) => (
              <div key={cat.title}>
                {/* Category header */}
                <div className="shortcuts-category-header">
                  <div className="shortcuts-category-inner">
                    <span className="shortcuts-category-title">{cat.title}</span>
                    <div className="shortcuts-category-line" />
                  </div>
                </div>

                {/* Tip rows */}
                <div>
                  {cat.tips.map((tip, ti) => (
                    <div
                      key={ti}
                      className="shortcuts-tip-row"
                    >
                      <div className="shortcuts-tip-action-wrap">
                        <MousePointerClick size={12} className="shortcuts-tip-icon" />
                        <ActionBadge text={tip.action} />
                      </div>
                      <span className="shortcuts-tip-desc">
                        {tip.description}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Divider */}
                {ci < tipCategories.length - 1 && <div className="shortcuts-divider" />}
              </div>
            ))}
            <div className="shortcuts-spacer" />
          </>
        )}
      </div>
    </div>
  );
}
