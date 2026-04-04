import { useRef, useEffect, useState, useCallback } from 'react';
import { ColorNode, DesignToken, TokenGroup } from '../../types';
import { ColorNodeCard } from './ColorNodeCard';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { ScrubberInput } from './ScrubberInput';
import { Label } from '../ui/label';
import { Lock, Unlock, Diff, Plus } from 'lucide-react';
import './PaletteShadesGrid.css';

interface PaletteShadesGridProps {
  paletteNode: ColorNode;
  shadeNodes: ColorNode[];
  allNodes: ColorNode[];
  tokens: DesignToken[];
  groups: TokenGroup[];
  activeProjectId: string;
  onUpdateNode: (id: string, updates: Partial<ColorNode>) => void;
  onAddChild: (parentId: string) => void;
  onAddParent: (nodeId: string) => void;
  onDeleteNode: (id: string) => void;
  onUnlinkNode: (id: string) => void;
  onLinkNode: (nodeId: string, newParentId: string | null) => void;
  onAssignToken: (nodeId: string, tokenId: string, isAssigned: boolean) => void;
  onNavigateToNode: (nodeId: string) => void;
  onWireDragStart: (nodeId: string, buttonType: 'left' | 'right') => void;
  onWireHoverStart: (nodeId: string) => void;
  onWireHoverEnd: () => void;
  wireHoverNodeId: string | null;
  wireStartButtonType: 'left' | 'right' | null;
  isDraggingWire: boolean;
  selectedNodeId: string | null;
  selectedNodeIds: string[];
  onSelect: (id: string, e?: React.MouseEvent) => void;
  onDoubleClick: (id: string) => void;
  onColorPickerOpenChange: (nodeId: string, isOpen: boolean) => void;
  nodeToAutoOpenColorPicker: string | null;
  onColorPickerAutoOpened: () => void;
  handleMouseDown: (e: React.MouseEvent, nodeId: string) => void;
  zoom: number;
  pan: { x: number; y: number };
  connectionError: { nodeId: string; message: string } | null;
}

// Property control buttons component
interface PropertyControlsProps {
  property: 'Hue' | 'Saturation' | 'Lightness' | 'Alpha' | 'Red' | 'Green' | 'Blue' | 'Light' | 'Chroma';
  isDiffEnabled: boolean;
  isLocked: boolean;
  onToggleDiff: () => void;
  onToggleLock: () => void;
  hasParent: boolean;
  hideControls?: boolean;
}

function PropertyControls({ property, isDiffEnabled, isLocked, onToggleDiff, onToggleLock, hasParent, hideControls }: PropertyControlsProps) {
  return (
    <div className="psg-property-controls">
      {hasParent && !hideControls && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleLock();
          }}
          className={`psg-control-btn ${
            isLocked
              ? 'psg-toggle-active'
              : 'psg-toggle-inactive'
          }`}
          title={isLocked ? 'Locked - will not change with parent' : 'Unlocked - will change with parent'}
        >
          {isLocked ? <Lock className="psg-icon-3-5" /> : <Unlock className="psg-icon-3-5" />}
        </button>
      )}
      <Label className="psg-label-foreground">{property}</Label>
      {hasParent && !hideControls && (
        <div className="psg-controls-right">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleDiff();
            }}
            className={`psg-control-btn ${
              isDiffEnabled
                ? 'psg-toggle-active'
                : 'psg-toggle-inactive'
            }`}
            title={isDiffEnabled ? 'Diff enabled - maintains offset from parent' : 'Diff disabled - matches parent exactly'}
          >
            <span className="psg-diff-wrapper">
              <Diff className="psg-icon-3-5" />
              {!isDiffEnabled && (
                <span className="psg-diff-strikethrough-overlay">
                  <span className="psg-diff-strikethrough-line" />
                </span>
              )}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}

export function PaletteShadesGrid({
  paletteNode,
  shadeNodes,
  allNodes,
  tokens,
  groups,
  activeProjectId,
  onUpdateNode,
  onAddChild,
  onAddParent,
  onDeleteNode,
  onUnlinkNode,
  onLinkNode,
  onAssignToken,
  onNavigateToNode,
  onWireDragStart,
  onWireHoverStart,
  onWireHoverEnd,
  wireHoverNodeId,
  wireStartButtonType,
  isDraggingWire,
  selectedNodeId,
  selectedNodeIds,
  onSelect,
  onDoubleClick,
  onColorPickerOpenChange,
  nodeToAutoOpenColorPicker,
  onColorPickerAutoOpened,
  handleMouseDown,
  zoom,
  pan,
  connectionError,
}: PaletteShadesGridProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [connectionPoint, setConnectionPoint] = useState<{ x: number; y: number } | null>(null);
  const [openColorPickerId, setOpenColorPickerId] = useState<string | null>(null);
  const [popoverSide, setPopoverSide] = useState<'top' | 'right' | 'bottom' | 'left'>('right');
  const paletteButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  
  // Refs for input fields (keyed by node ID)
  const hueInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const saturationInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const lightnessInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const alphaInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const redInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const greenInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const blueInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const chromaInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Calculate optimal popover position based on viewport
  const calculatePopoverPosition = useCallback((nodeId: string) => {
    const buttonRef = paletteButtonRefs.current[nodeId];
    if (!buttonRef) return;
    
    const buttonRect = buttonRef.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    
    // Use 50% of viewport as threshold for both directions
    const bottomThreshold = viewportHeight * 0.5;
    const rightThreshold = viewportWidth * 0.5;
    
    // Calculate distances from viewport edges
    const distanceFromBottom = viewportHeight - buttonRect.bottom;
    const distanceFromRight = viewportWidth - buttonRect.right;
    
    const isInBottomHalf = distanceFromBottom < bottomThreshold;
    const isInRightHalf = distanceFromRight < rightThreshold;
    
    // Priority: Bottom threshold takes precedence (always show on top when in bottom half)
    if (isInBottomHalf) {
      setPopoverSide('top');
    } else if (isInRightHalf) {
      // Only right threshold reached, position on left
      setPopoverSide('left');
    } else {
      // Default to right side
      setPopoverSide('right');
    }
  }, []);

  // Track previous open color picker to notify when it closes
  const prevOpenColorPickerId = useRef<string | null>(null);

  // Notify parent when color picker opens/closes
  useEffect(() => {
    // If there was a previously open picker and now it's different (or null), close the old one
    if (prevOpenColorPickerId.current && prevOpenColorPickerId.current !== openColorPickerId) {
      onColorPickerOpenChange(prevOpenColorPickerId.current, false);
    }
    
    // If there's a currently open picker, notify parent
    if (openColorPickerId) {
      onColorPickerOpenChange(openColorPickerId, true);
    }
    
    // Update the ref for next time
    prevOpenColorPickerId.current = openColorPickerId;
  }, [openColorPickerId, onColorPickerOpenChange]);

  // Handle keyboard shortcuts for color picker
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only trigger if a shade node is selected
      const selectedShade = shadeNodes.find(n => n.id === selectedNodeId);
      if (!selectedShade) return;
      
      // Check if user is typing in an input field
      const target = e.target as HTMLElement;
      const isTyping = target.tagName === 'INPUT' || 
                      target.tagName === 'TEXTAREA' || 
                      target.isContentEditable;
      
      // If user is typing in an input, only handle Enter to blur
      if (isTyping) {
        if (e.key === 'Enter') {
          e.preventDefault();
          (target as HTMLInputElement).blur();
        }
        return;
      }
      
      // Allow Tab to work normally for focus navigation when popup is open
      if (openColorPickerId === selectedShade.id && e.key === 'Tab') {
        return; // Don't prevent default, let Tab work naturally
      }
      
      // If color picker is open, handle property shortcuts
      if (openColorPickerId === selectedShade.id) {
        let handled = false;
        
        // HSL shortcuts
        if (selectedShade.colorSpace === 'hsl') {
          if (e.key === 'h' || e.key === 'H') {
            hueInputRefs.current[selectedShade.id]?.focus();
            hueInputRefs.current[selectedShade.id]?.select();
            handled = true;
          } else if (e.key === 's' || e.key === 'S') {
            saturationInputRefs.current[selectedShade.id]?.focus();
            saturationInputRefs.current[selectedShade.id]?.select();
            handled = true;
          } else if (e.key === 'l' || e.key === 'L') {
            lightnessInputRefs.current[selectedShade.id]?.focus();
            lightnessInputRefs.current[selectedShade.id]?.select();
            handled = true;
          } else if (e.key === 'a' || e.key === 'A') {
            alphaInputRefs.current[selectedShade.id]?.focus();
            alphaInputRefs.current[selectedShade.id]?.select();
            handled = true;
          } else if ((e.key === 'c' || e.key === 'C' || e.code === 'KeyC') && e.shiftKey && !e.metaKey && !e.ctrlKey) {
            // Shift + C closes color picker
            setOpenColorPickerId(null);
            handled = true;
          } else if ((e.key === 'c' || e.key === 'C' || e.code === 'KeyC') && !e.metaKey && !e.ctrlKey) {
            // C closes color picker for HSL (but not Cmd+C/Ctrl+C)
            setOpenColorPickerId(null);
            handled = true;
          }
        }
        
        // RGB shortcuts
        if (selectedShade.colorSpace === 'rgb') {
          if (e.key === 'r' || e.key === 'R') {
            redInputRefs.current[selectedShade.id]?.focus();
            redInputRefs.current[selectedShade.id]?.select();
            handled = true;
          } else if (e.key === 'g' || e.key === 'G') {
            greenInputRefs.current[selectedShade.id]?.focus();
            greenInputRefs.current[selectedShade.id]?.select();
            handled = true;
          } else if (e.key === 'b' || e.key === 'B') {
            blueInputRefs.current[selectedShade.id]?.focus();
            blueInputRefs.current[selectedShade.id]?.select();
            handled = true;
          } else if (e.key === 'a' || e.key === 'A') {
            alphaInputRefs.current[selectedShade.id]?.focus();
            alphaInputRefs.current[selectedShade.id]?.select();
            handled = true;
          } else if ((e.key === 'c' || e.key === 'C' || e.code === 'KeyC') && e.shiftKey && !e.metaKey && !e.ctrlKey) {
            // Shift + C closes color picker
            setOpenColorPickerId(null);
            handled = true;
          } else if ((e.key === 'c' || e.key === 'C' || e.code === 'KeyC') && !e.metaKey && !e.ctrlKey) {
            // C closes color picker for RGB (but not Cmd+C/Ctrl+C)
            setOpenColorPickerId(null);
            handled = true;
          }
        }
        
        // OKLCH shortcuts
        if (selectedShade.colorSpace === 'oklch') {
          if (e.key === 'l' || e.key === 'L') {
            lightnessInputRefs.current[selectedShade.id]?.focus();
            lightnessInputRefs.current[selectedShade.id]?.select();
            handled = true;
          } else if ((e.key === 'c' || e.key === 'C' || e.code === 'KeyC') && e.shiftKey && !e.metaKey && !e.ctrlKey) {
            // Shift + C closes color picker for OKLCH
            setOpenColorPickerId(null);
            handled = true;
          } else if ((e.key === 'c' || e.key === 'C' || e.code === 'KeyC') && !e.metaKey && !e.ctrlKey) {
            // C focuses Chroma for OKLCH (but not Cmd+C/Ctrl+C)
            chromaInputRefs.current[selectedShade.id]?.focus();
            chromaInputRefs.current[selectedShade.id]?.select();
            handled = true;
          } else if (e.key === 'h' || e.key === 'H') {
            hueInputRefs.current[selectedShade.id]?.focus();
            hueInputRefs.current[selectedShade.id]?.select();
            handled = true;
          } else if (e.key === 'a' || e.key === 'A') {
            alphaInputRefs.current[selectedShade.id]?.focus();
            alphaInputRefs.current[selectedShade.id]?.select();
            handled = true;
          }
        }
        
        if (handled) {
          e.preventDefault();
          e.stopPropagation();
        }
      } else {
        // Toggle color picker when 'C' is pressed when popup is closed
        // Don't trigger if Cmd/Ctrl is pressed (to allow copy/paste)
        if ((e.key === 'c' || e.key === 'C' || e.code === 'KeyC') && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
          e.preventDefault();
          e.stopPropagation();
          calculatePopoverPosition(selectedShade.id);
          setOpenColorPickerId(selectedShade.id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [selectedNodeId, shadeNodes, openColorPickerId, calculatePopoverPosition]);

  // Close color picker when node loses selection
  useEffect(() => {
    if (openColorPickerId) {
      const isStillSelected = selectedNodeId === openColorPickerId || selectedNodeIds.includes(openColorPickerId);
      if (!isStillSelected) {
        setOpenColorPickerId(null);
      }
    }
  }, [selectedNodeId, selectedNodeIds, openColorPickerId]);

  // Calculate the connection point (left center of the grid container)
  useEffect(() => {
    if (!gridRef.current) return;

    const updateConnectionPoint = () => {
      const gridElement = gridRef.current?.querySelector('[data-connection-point="left"]');
      if (!gridElement) return;

      const rect = gridElement.getBoundingClientRect();
      if (!rect) return;

      // Get the canvas container
      const canvasContainer = document.querySelector('.canvas-background')?.parentElement;
      const canvasRect = canvasContainer?.getBoundingClientRect();
      if (!canvasRect) return;

      // Calculate center point of the connection element
      const screenX = rect.left + rect.width / 2;
      const screenY = rect.top + rect.height / 2;

      // Convert to canvas coordinates (accounting for pan and zoom)
      const canvasX = (screenX - canvasRect.left - pan.x) / zoom;
      const canvasY = (screenY - canvasRect.top - pan.y) / zoom;

      setConnectionPoint({ x: canvasX, y: canvasY });
      
      // Update the data attribute for the ColorCanvas to read
      if (gridRef.current) {
        gridRef.current.setAttribute('data-connection-point', `${canvasX},${canvasY}`);
      }
    };

    updateConnectionPoint();

    // Update on zoom/pan changes and when shadeNodes change
    const timer = setTimeout(updateConnectionPoint, 50);
    const interval = setInterval(updateConnectionPoint, 100); // Regular updates for smooth animation

    // Set up ResizeObserver to detect size changes
    const resizeObserver = new ResizeObserver(updateConnectionPoint);
    if (gridRef.current) {
      resizeObserver.observe(gridRef.current);
    }

    return () => {
      clearTimeout(timer);
      clearInterval(interval);
      resizeObserver.disconnect();
    };
  }, [zoom, pan, shadeNodes.length]);

  const GRID_COLUMNS = 4;
  const NODE_WIDTH = 240;
  const NODE_HEIGHT = 280;
  const GAP = 16;

  // Calculate grid dimensions
  const gridWidth = GRID_COLUMNS * NODE_WIDTH + (GRID_COLUMNS - 1) * GAP;

  return (
    <div
      ref={gridRef}
      className="psg-outer"
      style={{
        left: paletteNode.position.x + 260 + 60, // Position to the right of palette node + gap
        top: paletteNode.position.y - 16, // Align with palette node vertically
      }}
      data-palette-grid={paletteNode.id}
      data-connection-point={connectionPoint ? `${connectionPoint.x},${connectionPoint.y}` : ''}
    >
      {/* Grid Container */}
      <div
        className="psg-container"
        style={{
          backgroundColor: 'var(--grey-800)',
          backdropFilter: 'blur(4px)',
          width: '360px',
          zIndex: 5,
        }}
      >
        {/* Connection point indicator (invisible but tracked) */}
        <div
          className="psg-connection-dot"
          data-connection-point="left"
          style={{
            transform: 'translateY(-50%)',
          }}
        />

        {/* List Layout */}
        <div className="psg-shade-list">
          {shadeNodes.map((node, index) => {
            // Calculate color for display
            const getShadeColor = () => {
              if (node.colorSpace === 'hsl') {
                return `hsla(${node.hue}, ${node.saturation}%, ${node.lightness}%, ${node.alpha / 100})`;
              } else if (node.colorSpace === 'rgb') {
                return `rgba(${node.red || 0}, ${node.green || 0}, ${node.blue || 0}, ${node.alpha / 100})`;
              } else {
                return `oklch(${node.oklchL}% ${(node.oklchC || 0) / 100 * 0.4} ${node.oklchH || 0})`;
              }
            };

            // Get shade name based on palette naming pattern
            const getShadeName = () => {
              const pattern = paletteNode.paletteNamingPattern || '100-900';
              switch (pattern) {
                case '1-9':
                  return (index + 1).toString();
                case '10-90':
                  return ((index + 1) * 10).toString();
                case '100-900':
                  return ((index + 1) * 100).toString();
                case 'a-z':
                  return String.fromCharCode(97 + index);
                default:
                  return (index + 1).toString();
              }
            };

            const shadeColor = getShadeColor();
            const shadeName = getShadeName();
            const isSelected = selectedNodeId === node.id || selectedNodeIds.includes(node.id);

            return (
              <div
                key={node.id}
                className="psg-shade-row"
                style={{
                  backgroundColor: shadeColor,
                  borderWidth: '2px',
                  borderStyle: 'solid',
                  borderColor: isSelected ? 'var(--blue-500)' : 'transparent',
                  filter: isSelected ? 'brightness(1.1)' : 'none',
                }}
                tabIndex={0}
                onMouseEnter={(e) => {
                  e.currentTarget.style.filter = isSelected ? 'brightness(1.15)' : 'brightness(1.05)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.filter = isSelected ? 'brightness(1.1)' : 'none';
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(node.id, e);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'c' || e.key === 'C') {
                    e.preventDefault();
                    e.stopPropagation();
                    onColorPickerOpenChange(node.id, true);
                  }
                }}
              >
                {/* Connection error message */}
                {connectionError?.nodeId === node.id && (
                  <div
                    className="psg-connection-error"
                    style={{
                      backgroundColor: shadeColor,
                      width: '336px',
                      height: '36px',
                    }}
                  >
                    {connectionError.message}
                  </div>
                )}
                
                {(() => {
                  // Calculate relative luminance for contrast
                  const getLuminance = (color: string): number => {
                    // Parse RGB values from the color string
                    let r = 0, g = 0, b = 0;
                    
                    if (node.colorSpace === 'hsl') {
                      // Convert HSL to RGB for luminance calculation
                      const h = node.hue / 360;
                      const s = node.saturation / 100;
                      const l = node.lightness / 100;
                      
                      const hue2rgb = (p: number, q: number, t: number) => {
                        if (t < 0) t += 1;
                        if (t > 1) t -= 1;
                        if (t < 1/6) return p + (q - p) * 6 * t;
                        if (t < 1/2) return q;
                        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
                        return p;
                      };
                      
                      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
                      const p = 2 * l - q;
                      r = hue2rgb(p, q, h + 1/3) * 255;
                      g = hue2rgb(p, q, h) * 255;
                      b = hue2rgb(p, q, h - 1/3) * 255;
                    } else if (node.colorSpace === 'rgb') {
                      r = node.red || 0;
                      g = node.green || 0;
                      b = node.blue || 0;
                    } else {
                      // For OKLCH, use lightness directly as approximation
                      return node.oklchL / 100;
                    }
                    
                    // Calculate relative luminance
                    const rsRGB = r / 255;
                    const gsRGB = g / 255;
                    const bsRGB = b / 255;
                    
                    const rLin = rsRGB <= 0.03928 ? rsRGB / 12.92 : Math.pow((rsRGB + 0.055) / 1.055, 2.4);
                    const gLin = gsRGB <= 0.03928 ? gsRGB / 12.92 : Math.pow((gsRGB + 0.055) / 1.055, 2.4);
                    const bLin = bsRGB <= 0.03928 ? bsRGB / 12.92 : Math.pow((bsRGB + 0.055) / 1.055, 2.4);
                    
                    return 0.2126 * rLin + 0.7152 * gLin + 0.0722 * bLin;
                  };
                  
                  const luminance = getLuminance(shadeColor);
                  const isDark = luminance < 0.5;
                  const textColor = isDark ? 'color-mix(in srgb, var(--grey-50) 90%, transparent)' : 'color-mix(in srgb, var(--grey-950) 80%, transparent)';
                  const secondaryTextColor = isDark ? 'color-mix(in srgb, var(--grey-50) 60%, transparent)' : 'color-mix(in srgb, var(--grey-950) 50%, transparent)';
                  const badgeBgColor = isDark ? 'color-mix(in srgb, var(--grey-50) 15%, transparent)' : 'color-mix(in srgb, var(--grey-950) 10%, transparent)';
                  const buttonBgColor = isDark ? 'color-mix(in srgb, var(--grey-50) 15%, transparent)' : 'color-mix(in srgb, var(--grey-950) 10%, transparent)';
                  const buttonHoverBgColor = isDark ? 'color-mix(in srgb, var(--grey-50) 25%, transparent)' : 'color-mix(in srgb, var(--grey-950) 20%, transparent)';
                  
                  return (
                    <>
                      {/* Shade name */}
                      <span className="psg-shade-name" style={{ color: textColor }}>{shadeName}</span>

                      {/* Color picker button with popup */}
                      <Popover open={openColorPickerId === node.id} onOpenChange={(open) => {
                        if (open) {
                          calculatePopoverPosition(node.id);
                          setOpenColorPickerId(node.id);
                        } else {
                          setOpenColorPickerId(null);
                        }
                      }}>
                        <PopoverTrigger asChild>
                          <button
                            ref={(el) => paletteButtonRefs.current[node.id] = el}
                            className="psg-color-picker-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelect(node.id, e);
                              if (openColorPickerId !== node.id) {
                                calculatePopoverPosition(node.id);
                              }
                            }}
                            title="Edit color (C)"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: textColor }}>
                              <circle cx="13.5" cy="6.5" r=".5" fill="currentColor"></circle>
                              <circle cx="17.5" cy="10.5" r=".5" fill="currentColor"></circle>
                              <circle cx="8.5" cy="7.5" r=".5" fill="currentColor"></circle>
                              <circle cx="6.5" cy="12.5" r=".5" fill="currentColor"></circle>
                              <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"></path>
                            </svg>
                          </button>
                        </PopoverTrigger>
                        <PopoverContent 
                          className="psg-popover-content"
                          onClick={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                          onOpenAutoFocus={(e) => e.preventDefault()}
                          onCloseAutoFocus={(e) => e.preventDefault()}
                          side={popoverSide}
                          align="start"
                          sideOffset={5}
                        >
                          <div className="psg-picker-stack-3">
                            {/* HSL Format */}
                            {node.colorSpace === 'hsl' && (
                              <>
                                <div className="psg-picker-stack-2">
                                  <div className="psg-picker-row">
                                    <PropertyControls
                                      property="Hue"
                                      isDiffEnabled={node.diffHue !== false}
                                      isLocked={node.lockHue === true}
                                      onToggleDiff={() => {
                                        onUpdateNode(node.id, { diffHue: node.diffHue === false ? true : false });
                                      }}
                                      onToggleLock={() => {
                                        onUpdateNode(node.id, { lockHue: node.lockHue === true ? false : true });
                                      }}
                                      hasParent={node.parentId !== null}
                                    />
                                    <ScrubberInput
                                      ref={(el) => hueInputRefs.current[node.id] = el}
                                      value={node.hue}
                                      min={0}
                                      max={360}
                                      onChange={(value) => onUpdateNode(node.id, { hue: value })}
                                      onMouseDown={(e) => e.stopPropagation()}
                                      className="psg-scrubber-input"
                                    />
                                  </div>
                                  <input
                                    type="range"
                                    min="0"
                                    max="360"
                                    value={node.hue}
                                    onChange={(e) => onUpdateNode(node.id, { hue: Number(e.target.value) })}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onMouseMove={(e) => e.stopPropagation()}
                                    className="psg-range-input color-slider"
                                    style={{
                                      background: `linear-gradient(to right, 
                                        hsl(0, ${node.saturation}%, ${node.lightness}%), 
                                        hsl(60, ${node.saturation}%, ${node.lightness}%), 
                                        hsl(120, ${node.saturation}%, ${node.lightness}%), 
                                        hsl(180, ${node.saturation}%, ${node.lightness}%), 
                                        hsl(240, ${node.saturation}%, ${node.lightness}%), 
                                        hsl(300, ${node.saturation}%, ${node.lightness}%), 
                                        hsl(360, ${node.saturation}%, ${node.lightness}%))`,
                                      '--slider-thumb-color': `hsl(${node.hue}, ${node.saturation}%, ${node.lightness}%)`,
                                    } as React.CSSProperties}
                                  />
                                </div>

                                <div className="psg-picker-stack-2">
                                  <div className="psg-picker-row">
                                    <PropertyControls
                                      property="Saturation"
                                      isDiffEnabled={node.diffSaturation !== false}
                                      isLocked={node.lockSaturation === true}
                                      onToggleDiff={() => {
                                        onUpdateNode(node.id, { diffSaturation: node.diffSaturation === false ? true : false });
                                      }}
                                      onToggleLock={() => {
                                        onUpdateNode(node.id, { lockSaturation: node.lockSaturation === true ? false : true });
                                      }}
                                      hasParent={node.parentId !== null}
                                    />
                                    <ScrubberInput
                                      ref={(el) => saturationInputRefs.current[node.id] = el}
                                      value={node.saturation}
                                      min={0}
                                      max={100}
                                      onChange={(value) => onUpdateNode(node.id, { saturation: value })}
                                      onMouseDown={(e) => e.stopPropagation()}
                                      className="psg-scrubber-input"
                                    />
                                  </div>
                                  <input
                                    type="range"
                                    min="0"
                                    max="100"
                                    value={node.saturation}
                                    onChange={(e) => onUpdateNode(node.id, { saturation: Number(e.target.value) })}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onMouseMove={(e) => e.stopPropagation()}
                                    className="psg-range-input color-slider"
                                    style={{
                                      background: `linear-gradient(to right, 
                                        hsl(${node.hue}, 0%, ${node.lightness}%), 
                                        hsl(${node.hue}, 100%, ${node.lightness}%))`,
                                      '--slider-thumb-color': `hsl(${node.hue}, ${node.saturation}%, ${node.lightness}%)`,
                                    } as React.CSSProperties}
                                  />
                                </div>

                                <div className="psg-picker-stack-2">
                                  <div className="psg-picker-row">
                                    <PropertyControls
                                      property="Lightness"
                                      isDiffEnabled={node.diffLightness !== false}
                                      isLocked={node.lockLightness === true}
                                      onToggleDiff={() => {
                                        onUpdateNode(node.id, { diffLightness: node.diffLightness === false ? true : false });
                                      }}
                                      onToggleLock={() => {
                                        onUpdateNode(node.id, { lockLightness: node.lockLightness === true ? false : true });
                                      }}
                                      hasParent={node.parentId !== null}
                                    />
                                    <ScrubberInput
                                      ref={(el) => lightnessInputRefs.current[node.id] = el}
                                      value={node.lightness}
                                      min={0}
                                      max={100}
                                      onChange={(value) => onUpdateNode(node.id, { lightness: value })}
                                      onMouseDown={(e) => e.stopPropagation()}
                                      className="psg-scrubber-input"
                                    />
                                  </div>
                                  <input
                                    type="range"
                                    min="0"
                                    max="100"
                                    value={node.lightness}
                                    onChange={(e) => onUpdateNode(node.id, { lightness: Number(e.target.value) })}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onMouseMove={(e) => e.stopPropagation()}
                                    className="psg-range-input color-slider"
                                    style={{
                                      background: `linear-gradient(to right, 
                                        hsl(${node.hue}, ${node.saturation}%, 0%), 
                                        hsl(${node.hue}, ${node.saturation}%, 50%), 
                                        hsl(${node.hue}, ${node.saturation}%, 100%))`,
                                      '--slider-thumb-color': `hsl(${node.hue}, ${node.saturation}%, ${node.lightness}%)`,
                                    } as React.CSSProperties}
                                  />
                                </div>

                                <div className="psg-picker-stack-2">
                                  <div className="psg-picker-row">
                                    <PropertyControls
                                      property="Alpha"
                                      isDiffEnabled={node.diffAlpha !== false}
                                      isLocked={node.lockAlpha === true}
                                      onToggleDiff={() => {
                                        onUpdateNode(node.id, { diffAlpha: node.diffAlpha === false ? true : false });
                                      }}
                                      onToggleLock={() => {
                                        onUpdateNode(node.id, { lockAlpha: node.lockAlpha === true ? false : true });
                                      }}
                                      hasParent={node.parentId !== null}
                                    />
                                    <ScrubberInput
                                      ref={(el) => alphaInputRefs.current[node.id] = el}
                                      value={node.alpha ?? 100}
                                      min={0}
                                      max={100}
                                      onChange={(value) => onUpdateNode(node.id, { alpha: value })}
                                      onMouseDown={(e) => e.stopPropagation()}
                                      className="psg-scrubber-input"
                                    />
                                  </div>
                                  <input
                                    type="range"
                                    min="0"
                                    max="100"
                                    value={node.alpha ?? 100}
                                    onChange={(e) => onUpdateNode(node.id, { alpha: Number(e.target.value) })}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onMouseMove={(e) => e.stopPropagation()}
                                    className="psg-range-input color-slider"
                                    style={{
                                      backgroundImage: `
                                        linear-gradient(to right, 
                                          hsla(${node.hue}, ${node.saturation}%, ${node.lightness}%, 0), 
                                          hsla(${node.hue}, ${node.saturation}%, ${node.lightness}%, 1)),
                                        linear-gradient(45deg, var(--grey-600) 25%, transparent 25%, transparent 75%, var(--grey-600) 75%, var(--grey-600)),
                                        linear-gradient(45deg, var(--grey-600) 25%, transparent 25%, transparent 75%, var(--grey-600) 75%, var(--grey-600))
                                      `,
                                      backgroundSize: '100% 100%, 8px 8px, 8px 8px',
                                      backgroundPosition: '0 0, 0 0, 4px 4px',
                                      backgroundColor: 'var(--grey-400)',
                                      '--slider-thumb-color': `hsla(${node.hue}, ${node.saturation}%, ${node.lightness}%, ${(node.alpha ?? 100) / 100})`,
                                    } as React.CSSProperties}
                                  />
                                </div>
                              </>
                            )}
                          </div>
                        </PopoverContent>
                      </Popover>

                      {/* Color format */}
                      <span 
                        className="psg-color-format-badge"
                        style={{ 
                          color: secondaryTextColor,
                          backgroundColor: badgeBgColor,
                        }}
                      >
                        {paletteNode.paletteColorFormat || 'HEX'}
                      </span>
                    </>
                  );
                })()}

                {/* Add child button - positioned at edge */}
                <button
                  className={`psg-wire-btn ${
                    wireHoverNodeId === node.id && wireStartButtonType === 'left' ? 'psg-wire-btn--success' : 'psg-wire-btn--default'
                  }`}
                  style={{ zIndex: 10, right: '-14px' }}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    // Start wire drag
                    onWireDragStart(node.id, 'right');
                  }}
                  onMouseEnter={() => {
                    // Only highlight if actively dragging from left button (opposite type)
                    if (isDraggingWire && wireStartButtonType === 'left') {
                      onWireHoverStart(node.id);
                    }
                  }}
                  onMouseLeave={() => onWireHoverEnd()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddChild(node.id);
                  }}
                  title="Add child node or drag to connect"
                  data-node-id={node.id}
                  data-button-type="right-connect"
                >
                  <Plus className={`psg-icon-3 ${wireHoverNodeId === node.id && wireStartButtonType === 'left' ? 'psg-icon-white' : 'psg-icon-foreground'}`} />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}