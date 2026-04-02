import { useState, useRef, useEffect, useCallback } from 'react';
import { ColorNode, DesignToken, TokenGroup, Page, NodeViewConfig } from '../../types';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Plus, Trash2, GripVertical, Tag, ChevronsUpDown, Check, ChevronDown, Target, Lock, Unlock, Diff, Unlink, AlertTriangle, Link2, Palette, Sun, Crown, Copy, Zap, Eye, EyeOff } from 'lucide-react';
import { copyTextToClipboard } from '../../utils/clipboard';
import { Switch } from '../ui/switch';
import { ScrubberInput } from './ScrubberInput';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '../ui/command';
import { cn } from '../ui/utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu';
import namer from 'color-namer';
import { OklchGamutSlider } from './OklchGamutSlider';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../ui/alert-dialog';
import { rgbToHct, hctToRgb, hctToHex, hexToHct, getMaxChroma } from '../../utils/hct-utils';
import { hslToRgb, rgbToHex, rgbToHsl, hslToOklch, oklchToHsl } from '../../utils/color-conversions';
import { Tip } from '../Tip';
import { MAX_PALETTE_NAME } from '../../utils/textLimits';

// Property control component with hover state
interface PropertyControlProps {
  label: string;
  prop: 'Hue' | 'Saturation' | 'Lightness' | 'Alpha' | 'Red' | 'Green' | 'Blue' | 'OklchL' | 'OklchC' | 'OklchH' | 'HctH' | 'HctC' | 'HctT';
  fullName: string;
  node: ColorNode;
  toggleLock: (prop: 'Hue' | 'Saturation' | 'Lightness' | 'Alpha' | 'Red' | 'Green' | 'Blue' | 'OklchL' | 'OklchC' | 'OklchH' | 'HctH' | 'HctC' | 'HctT') => void;
  toggleDiff: (prop: 'Hue' | 'Saturation' | 'Lightness' | 'Alpha' | 'Red' | 'Green' | 'Blue' | 'OklchL' | 'OklchC' | 'OklchH' | 'HctH' | 'HctC' | 'HctT') => void;
  hasPrevSelected?: boolean;
  hasNextSelected?: boolean;
}

function PropertyControl({ label, prop, fullName, node, toggleLock, toggleDiff, hasPrevSelected, hasNextSelected }: PropertyControlProps) {
  const [isHovered, setIsHovered] = useState(false);
  
  const isSelected = node[`lock${prop}` as keyof ColorNode] === true || node[`diff${prop}` as keyof ColorNode] === true;
  
  // Calculate border radius based on adjacent selections
  let borderRadius = '4px';
  if (isSelected) {
    if (hasPrevSelected && hasNextSelected) {
      borderRadius = '0px';
    } else if (hasPrevSelected) {
      borderRadius = '0px 4px 4px 0px';
    } else if (hasNextSelected) {
      borderRadius = '4px 0px 0px 4px';
    }
  }
  
  return (
    <div 
      className="inline-flex flex-col items-center gap-1 relative w-fit h-fit"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <span 
        className="text-xs font-medium hover:text-white cursor-pointer px-[2px] py-[0px]"
        style={{
          color: isSelected
            ? 'white'
            : 'rgb(229, 229, 229)',
          backgroundColor: isSelected
            ? (() => {
                // Calculate luminance to determine adaptive blue color
                let r = 0, g = 0, b = 0;
                if (node.colorSpace === 'hsl') {
                  const h = node.hue / 360;
                  const s = node.saturation / 100;
                  const l = node.lightness / 100;
                  const c = (1 - Math.abs(2 * l - 1)) * s;
                  const x = c * (1 - Math.abs((h * 6) % 2 - 1));
                  const m = l - c / 2;
                  let r1 = 0, g1 = 0, b1 = 0;
                  if (h < 1/6) { r1 = c; g1 = x; }
                  else if (h < 2/6) { r1 = x; g1 = c; }
                  else if (h < 3/6) { g1 = c; b1 = x; }
                  else if (h < 4/6) { g1 = x; b1 = c; }
                  else if (h < 5/6) { r1 = x; b1 = c; }
                  else { r1 = c; b1 = x; }
                  r = (r1 + m) * 255;
                  g = (g1 + m) * 255;
                  b = (b1 + m) * 255;
                } else if (node.colorSpace === 'rgb') {
                  r = node.red;
                  g = node.green;
                  b = node.blue;
                } else if (node.colorSpace === 'oklch') {
                  // For OKLCH, use lightness to determine
                  return node.oklchL > 50 ? '#60A5FA' : '#3B83F6';
                } else if (node.colorSpace === 'hct') {
                  // For HCT, use tone to determine
                  return node.hctT > 50 ? '#60A5FA' : '#3B83F6';
                } else {
                  return '#3B83F6';
                }
                const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
                // If light node color (dark bg), use lighter blue; if dark node color (light bg), use darker blue
                return luminance > 0.5 ? '#60A5FA' : '#3B83F6';
              })()
            : 'transparent',
          borderRadius: borderRadius
        }}
        title={fullName}
      >
        {label}
      </span>
      {isHovered && (
        <div 
          className="absolute bottom-full flex gap-0 items-center justify-center bg-elevated rounded-[5px] shadow-lg z-10"
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleLock(prop);
            }}
            className={`w-6 h-6 rounded transition-colors flex items-center justify-center hover:bg-hairline ${
              node[`lock${prop}` as keyof ColorNode] === true
                ? 'text-brand'
                : 'text-muted-foreground'
            }`}
            title={node[`lock${prop}` as keyof ColorNode] === true ? 'Locked' : 'Unlocked'}
          >
            {node[`lock${prop}` as keyof ColorNode] === true ? (
              <Lock className="w-3 h-3" />
            ) : (
              <Unlock className="w-3 h-3" />
            )}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleDiff(prop);
            }}
            className="w-6 h-6 rounded transition-colors flex items-center justify-center hover:bg-hairline"
            style={{
              color: node[`diff${prop}` as keyof ColorNode] === true ? 'var(--brand)' : 'var(--muted-foreground)'
            }}
            title={node[`diff${prop}` as keyof ColorNode] === false ? 'Diff disabled - matches parent' : 'Diff enabled - maintains offset'}
          >
            <span className="relative inline-block text-[12px]">
              <Diff className="w-3 h-3" />
              {node[`diff${prop}` as keyof ColorNode] === false && (
                <span className="absolute inset-0 flex items-center justify-center text-[12px]">
                  <span className="w-full h-[1px] bg-muted-foreground rotate-[-45deg] rounded-full" />
                </span>
              )}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}

interface ColorNodeCardProps {
  node: ColorNode;
  nodes: ColorNode[];
  tokens: DesignToken[];
  groups: TokenGroup[];
  activeProjectId: string;
  onMouseDown: (e: React.MouseEvent) => void;
  onUpdateNode: (id: string, updates: Partial<ColorNode>) => void;
  onAddChild: (parentId: string) => void;
  onAddParent: (nodeId: string) => void;
  onDelete: (id: string) => void;
  onUnlink: (id: string) => void;
  onLink: (nodeId: string, newParentId: string | null) => void;
  onAssignToken: (nodeId: string, tokenId: string, isAssigned: boolean) => void;
  onUpdateToken: (id: string, updates: Partial<DesignToken>) => void;
  onDeleteToken: (id: string) => void;
  onNavigateToNode: (nodeId: string) => void;
  onWireDragStart: (nodeId: string, buttonType: 'left' | 'right') => void;
  onWireHoverStart: (nodeId: string) => void;
  onWireHoverEnd: () => void;
  isWireHovered: boolean;
  wireStartButtonType: 'left' | 'right' | null;
  isDraggingWire: boolean;
  isSelected: boolean;
  isMultiSelected: boolean;
  selectedNodeIds: string[]; // All currently multi-selected node IDs
  onSelect: (e?: React.MouseEvent) => void;
  onDoubleClick: () => void;
  onColorPickerOpenChange?: (nodeId: string, isOpen: boolean) => void;
  shouldAutoOpenColorPicker?: boolean;
  onColorPickerAutoOpened?: () => void;
  pages?: Page[]; // All pages for the active project (for informational bar)
  isPaletteShade?: boolean;
  showInheritanceIcon?: boolean; // Show crown icon for non-primary themes
  activeThemeId?: string; // Current active theme for theme-specific token assignments
  isPrimaryTheme?: boolean; // Whether the current active theme is the primary theme
  primaryThemeId?: string; // The primary theme's ID for comparing token assignments
  showAllVisible?: boolean; // Override dimming — show all sections at full opacity
  isNodeHidden?: boolean; // Whether this node is hidden in the active theme
  onToggleVisibility?: () => void; // Toggle visibility for this node
  activeAdvancedChannels?: string[]; // Channel keys that have active conditioned logic (e.g., ['hue', 'saturation'])
  onRevertThemeAdvancedLogic?: (nodeId: string, themeId: string) => void; // Clear theme-specific advanced logic when re-linking to primary
  readOnly?: boolean; // When true, all editing controls are disabled
  nodeViewConfig?: NodeViewConfig; // Node View config: per-channel hide/slider-range (UI-only controls from advanced logic)
  showDevMode?: boolean; // When true, show webhook badge and enable webhook toggle on nodes
  onToggleWebhookInput?: (nodeId: string) => void; // Toggle isWebhookInput flag on a node
}



// FxButton — compact green-highlighted button indicating advanced logic is active for a channel
// Sits next to the disabled input, sized to match the input height (h-7)
function FxButton({ nodeId, channelKey }: { nodeId: string; channelKey: string }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        window.dispatchEvent(new CustomEvent('openAdvancedPopup', { detail: { nodeId, channelKey } }));
      }}
      onMouseDown={(e) => e.stopPropagation()}
      className="w-7 h-7 rounded-md flex items-center justify-center cursor-pointer transition-colors hover:brightness-110 shrink-0"
      style={{
        backgroundColor: 'rgba(43,189,104,0.12)',
        border: 'none',
        color: 'var(--success)',
      }}
      title="Advanced logic active — click to edit"
    >
      <span className="text-[11px]" style={{ fontStyle: 'italic', fontWeight: 600 }}>fx</span>
    </button>
  );
}

// Property control buttons component
interface PropertyControlsProps {
  property: 'Hue' | 'Saturation' | 'Lightness' | 'Alpha' | 'Red' | 'Green' | 'Blue' | 'Light' | 'Chroma' | 'Tone';
  isDiffEnabled: boolean;
  isLocked: boolean;
  onToggleDiff: () => void;
  onToggleLock: () => void;
  hasParent: boolean;
  hideControls?: boolean;
  disabled?: boolean;
  diffValue?: number | null;
  onDiffValueChange?: (newDiff: number) => void;
  precision?: number; // decimal places for diff display (default: 0 = integers)
  isAdvancedActive?: boolean; // when true, hide lock/diff/diff values — advanced logic controls this channel
}

function PropertyControls({ property, isDiffEnabled, isLocked, onToggleDiff, onToggleLock, hasParent, hideControls, disabled, diffValue, onDiffValueChange, precision = 0, isAdvancedActive = false }: PropertyControlsProps) {
  const [editingDiff, setEditingDiff] = useState(false);
  const [editDiffValue, setEditDiffValue] = useState('');

  const showDiffInput = hasParent && !hideControls && diffValue !== undefined && diffValue !== null;
  const displayDiff = diffValue != null ? Number(diffValue.toFixed(precision)) : 0;
  const formattedDiff = diffValue != null ? (displayDiff >= 0 ? `+${displayDiff}` : `${displayDiff}`) : '';

  // Commit edited diff value, auto-enabling diff if non-zero
  const commitDiffEdit = (raw: string) => {
    setEditingDiff(false);
    const parsed = parseFloat(raw);
    if (isNaN(parsed) || !onDiffValueChange) return;
    const val = precision > 0 ? parsed : Math.round(parsed);
    onDiffValueChange(val);
    // Auto-enable diff when user types a non-zero offset while diff is disabled
    if (val !== 0 && !isDiffEnabled) {
      onToggleDiff();
    }
  };

  return (
    <div className={`flex items-center gap-1 ${disabled ? 'opacity-50' : ''}`}>
      {hasParent && !hideControls && !isAdvancedActive && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (disabled) return;
            onToggleLock();
          }}
          disabled={disabled}
          className={`w-6 h-6 rounded transition-colors flex items-center justify-center ${
            disabled ? 'cursor-not-allowed text-muted-foreground' :
            isLocked
              ? 'text-brand hover:bg-brand/10'
              : 'text-muted-foreground hover:text-foreground hover:bg-elevated'
          }`}
          title={disabled ? 'Inherited — unlink to modify' : isLocked ? 'Locked - will not change with parent' : 'Unlocked - will change with parent'}
        >
          {isLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
        </button>
      )}
      <Label className={disabled ? 'text-foreground/50' : 'text-foreground'}>{property}</Label>
      {hasParent && !hideControls && !isAdvancedActive && (
        <div className="flex items-center gap-0 ml-auto">
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (disabled) return;
              onToggleDiff();
            }}
            disabled={disabled}
            className={`w-6 h-6 rounded transition-colors flex items-center justify-center ${
              disabled ? 'cursor-not-allowed text-muted-foreground' :
              isDiffEnabled
                ? 'text-brand hover:bg-brand/10'
                : 'text-muted-foreground hover:text-foreground hover:bg-elevated'
            }`}
            title={disabled ? 'Inherited — unlink to modify' : isDiffEnabled ? 'Diff enabled - maintains offset from parent' : 'Diff disabled - matches parent exactly'}
          >
            <span className="relative inline-block">
              <Diff className="w-3.5 h-3.5" />
              {!isDiffEnabled && (
                <span className="absolute inset-0 flex items-center justify-center">
                  <span className="w-full h-[1px] bg-current rotate-[-45deg] rounded-full" />
                </span>
              )}
            </span>
          </button>
          {showDiffInput && (
            editingDiff ? (
              <input
                autoFocus
                value={editDiffValue}
                onChange={(e) => setEditDiffValue(e.target.value)}
                onBlur={() => commitDiffEdit(editDiffValue)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    (e.target as HTMLInputElement).blur();
                  } else if (e.key === 'Escape') {
                    setEditingDiff(false);
                  }
                  e.stopPropagation();
                }}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                className="w-[38px] h-[20px] text-[11px] text-center rounded border outline-none"
                style={{
                  background: 'var(--secondary)',
                  borderColor: 'var(--brand)',
                  color: isDiffEnabled ? 'var(--brand)' : 'var(--faint)',
                }}
              />
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (disabled) return;
                  setEditDiffValue(String(displayDiff));
                  setEditingDiff(true);
                }}
                onMouseDown={(e) => e.stopPropagation()}
                disabled={disabled}
                className="h-[20px] min-w-[28px] px-1 text-[11px] rounded transition-colors hover:bg-elevated"
                style={{
                  color: isDiffEnabled ? 'var(--brand)' : 'var(--faint)',
                }}
                title={`Offset from parent: ${formattedDiff}. Click to edit.`}
              >
                {formattedDiff}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}

// Palette controls component
interface PaletteControlsProps {
  node: ColorNode;
  onUpdateNode: (id: string, updates: Partial<ColorNode>) => void;
}

function hslToHex(h: number, s: number, l: number): string {
  const rgb = hslToRgb(h, s, l);
  return rgbToHex(rgb.r, rgb.g, rgb.b);
}

function oklchToHex(lightness: number, chroma: number, hue: number): string {
  // Convert OKLCH to RGB directly, then to HEX
  const hsl = oklchToHsl(lightness, chroma, hue);
  const rgb = hslToRgb(hsl.h, hsl.s, hsl.l);
  return rgbToHex(rgb.r, rgb.g, rgb.b);
}

// hslToRgb, rgbToHex, rgbToHsl, hslToOklch, oklchToHsl imported from ../utils/color-conversions
// HCT conversion functions imported from /utils/hct-utils.ts

// Generate HCT gradient for sliders
function generateHctHueGradient(chroma: number, tone: number): string {
  const steps = 7;
  const colors: string[] = [];
  for (let i = 0; i < steps; i++) {
    const hue = (360 / (steps - 1)) * i;
    const rgb = hctToRgb(hue, chroma, tone);
    colors.push(`rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`);
  }
  return `linear-gradient(to right, ${colors.join(', ')})`;
}

function generateHctChromaGradient(hue: number, tone: number, maxChroma?: number): string {
  const max = maxChroma ?? 120;
  const steps = 7;
  const colors: string[] = [];
  for (let i = 0; i < steps; i++) {
    const chroma = (max / (steps - 1)) * i;
    const rgb = hctToRgb(hue, chroma, tone);
    colors.push(`rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`);
  }
  return `linear-gradient(to right, ${colors.join(', ')})`;
}

function generateHctToneGradient(hue: number, chroma: number): string {
  const steps = 7;
  const colors: string[] = [];
  for (let i = 0; i < steps; i++) {
    const tone = (100 / (steps - 1)) * i;
    const rgb = hctToRgb(hue, chroma, tone);
    colors.push(`rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`);
  }
  return `linear-gradient(to right, ${colors.join(', ')})`;
}

// Generate descriptive color name from HSL values using color-namer
function generateColorName(hue: number, saturation: number, lightness: number): string {
  try {
    // Convert HSL to RGB
    const h = hue;
    const s = saturation / 100;
    const l = lightness / 100;
    
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) => {
      const k = (n + h / 30) % 12;
      const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
      return Math.round(255 * color);
    };
    
    const r = f(0);
    const g = f(8);
    const b = f(4);
    
    // Convert to hex for color-namer
    const toHex = (n: number) => n.toString(16).padStart(2, '0');
    const hexColor = `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    
    // Use color-namer to get the best name
    // Using 'ntc' (Name That Color) list which has good quality names
    const names = namer(hexColor);
    
    // Get the closest match from ntc (Name That Color) - has good descriptive names
    const colorName = names.ntc[0]?.name || 'Color';
    
    return colorName;
  } catch (e) {
    return 'Color';
  }
}

function PaletteControls({ node, onUpdateNode }: PaletteControlsProps) {
  const pickerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isManuallyEdited, setIsManuallyEdited] = useState(false);
  const prevColorRef = useRef({ hue: node.hue, saturation: node.saturation, lightness: node.lightness });
  
  const paletteName = node.paletteName || '';
  const colorFormat = node.paletteColorFormat || 'HEX';
  const lightnessMode = node.paletteLightnessMode || 'linear';
  const lightnessStart = node.paletteLightnessStart ?? 95;
  const lightnessEnd = node.paletteLightnessEnd ?? 10;
  const namingPattern = node.paletteNamingPattern || '100-900';
  const shadeCount = node.paletteShadeCount || 10;
  
  // Auto-generate color name when color changes
  useEffect(() => {
    const colorChanged = 
      prevColorRef.current.hue !== node.hue ||
      prevColorRef.current.saturation !== node.saturation ||
      prevColorRef.current.lightness !== node.lightness;
    
    if (colorChanged && !isManuallyEdited && !node.paletteNameLocked) {
      const newName = generateColorName(node.hue, node.saturation, node.lightness);
      onUpdateNode(node.id, { paletteName: newName });
    }
    
    prevColorRef.current = { 
      hue: node.hue, 
      saturation: node.saturation, 
      lightness: node.lightness 
    };
  }, [node.hue, node.saturation, node.lightness, isManuallyEdited, node.paletteNameLocked, node.id, onUpdateNode]);
  
  // Initialize with auto-generated name if empty
  useEffect(() => {
    if (!paletteName) {
      const newName = generateColorName(node.hue, node.saturation, node.lightness);
      onUpdateNode(node.id, { paletteName: newName });
    }
  }, []);
  
  const rgb = hslToRgb(node.hue, node.saturation, node.lightness);
  const hexColor = rgbToHex(rgb.r, rgb.g, rgb.b);
  
  // Calculate lightness steps based on mode
  const calculateLightnessSteps = () => {
    const steps: number[] = [];
    for (let i = 0; i < shadeCount; i++) {
      const t = i / (shadeCount - 1);
      let lightness;
      if (lightnessMode === 'curve') {
        const easedT = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        lightness = lightnessStart + (lightnessEnd - lightnessStart) * easedT;
      } else {
        lightness = lightnessStart + (lightnessEnd - lightnessStart) * t;
      }
      steps.push(Math.round(lightness));
    }
    return steps;
  };
  
  const lightnessSteps = calculateLightnessSteps();
  
  const handlePickerMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    setIsDragging(true);
    updateColorFromPicker(e);
  };
  
  const updateColorFromPicker = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!pickerRef.current) return;
    
    const rect = pickerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const y = Math.max(0, Math.min(e.clientY - rect.top, rect.height));
    
    const saturation = Math.round((x / rect.width) * 100);
    const lightness = Math.round(100 - (y / rect.height) * 100);
    
    onUpdateNode(node.id, { saturation, lightness });
  };
  
  useEffect(() => {
    if (!isDragging) return;
    
    const handleMouseMove = (e: MouseEvent) => {
      if (!pickerRef.current) return;
      updateColorFromPicker(e as any);
    };
    
    const handleMouseUp = () => {
      setIsDragging(false);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);
  
  return (
    <div className="px-4 pb-4 space-y-3">
      {/* Name */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-[#cfcfcf] text-sm">Name</label>
          <Tip label={node.paletteNameLocked ? "Unlock Name" : "Lock Name"} side="top">
          <button
            onClick={() => {
              onUpdateNode(node.id, { paletteNameLocked: !node.paletteNameLocked });
            }}
            className="w-6 h-6 rounded transition-colors flex items-center justify-center hover:bg-hairline"
            onMouseDown={(e) => e.stopPropagation()}
          >
            {node.paletteNameLocked ? (
              <Lock className="w-3.5 h-3.5 text-brand" />
            ) : (
              <Unlock className="w-3.5 h-3.5 text-muted-foreground" />
            )}
          </button>
          </Tip>
        </div>
        <Input
          value={paletteName}
          onChange={(e) => {
            setIsManuallyEdited(true);
            onUpdateNode(node.id, { paletteName: e.target.value, paletteNameLocked: true });
          }}
          className="bg-secondary border-0 text-foreground"
          placeholder="Palette name"
          onMouseDown={(e) => e.stopPropagation()}
          maxLength={MAX_PALETTE_NAME}
        />
      </div>
      
      {/* Color Section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <label className="text-[#cfcfcf] text-sm">Color</label>
          <div 
            className="w-8 h-8 rounded-lg border border-secondary"
            style={{ 
              backgroundColor: `hsl(${node.hue}, ${node.saturation}%, ${node.lightness}%)`
            }}
          />
        </div>
        
        {/* 2D Color Picker */}
        <div
          ref={pickerRef}
          className="w-full h-32 rounded-lg mb-3 cursor-crosshair relative overflow-hidden"
          style={{
            background: `
              linear-gradient(to top, black, transparent),
              linear-gradient(to right, white, hsl(${node.hue}, 100%, 50%))
            `,
          }}
          onMouseDown={handlePickerMouseDown}
        >
          {/* Picker indicator */}
          <div
            className="absolute w-3 h-3 border-2 border-white rounded-full shadow-lg pointer-events-none"
            style={{
              left: `calc(${node.saturation}% - 6px)`,
              top: `calc(${100 - node.lightness}% - 6px)`,
            }}
          />
        </div>
        
        {/* Hue Slider */}
        <div className="mb-2 relative">
          <div className="h-2 rounded-full relative overflow-hidden" style={{
            background: 'linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)'
          }} />
          <input
            type="range"
            min="0"
            max="360"
            value={node.hue}
            onChange={(e) => onUpdateNode(node.id, { hue: parseInt(e.target.value) })}
            className="absolute inset-0 w-full h-2 opacity-0 cursor-pointer"
            onMouseDown={(e) => e.stopPropagation()}
          />
        </div>
        
        {/* Alpha Slider */}
        <div className="mb-3 relative">
          <div 
            className="h-2 rounded-full relative overflow-hidden" 
            style={{
              backgroundImage: `
                linear-gradient(to right, 
                  hsla(${node.hue}, ${node.saturation}%, ${node.lightness}%, 0),
                  hsl(${node.hue}, ${node.saturation}%, ${node.lightness}%)
                ),
                linear-gradient(45deg, #ccc 25%, transparent 25%), 
                linear-gradient(-45deg, #ccc 25%, transparent 25%), 
                linear-gradient(45deg, transparent 75%, #ccc 75%), 
                linear-gradient(-45deg, transparent 75%, #ccc 75%)
              `,
              backgroundSize: '100% 100%, 8px 8px, 8px 8px, 8px 8px, 8px 8px',
              backgroundPosition: '0 0, 0 0, 4px 0, 4px -4px, 0 4px',
              backgroundColor: '#fff'
            }}
          />
          <input
            type="range"
            min="0"
            max="100"
            value={node.alpha ?? 100}
            onChange={(e) => onUpdateNode(node.id, { alpha: parseInt(e.target.value) })}
            className="absolute inset-0 w-full h-2 opacity-0 cursor-pointer"
            onMouseDown={(e) => e.stopPropagation()}
          />
        </div>
        
        {/* Color Format Selector */}
        <div className="flex gap-2">
          <Select value={colorFormat} onValueChange={(value) => onUpdateNode(node.id, { paletteColorFormat: value as any })}>
            <SelectTrigger className="w-24 bg-secondary border-secondary text-foreground h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-secondary border-secondary">
              <SelectItem value="HEX" className="text-foreground">HEX</SelectItem>
              <SelectItem value="HSLA" className="text-foreground">HSLA</SelectItem>
              <SelectItem value="OKLCH" className="text-foreground">OKLCH</SelectItem>
              <SelectItem value="RGBA" className="text-foreground">RGBA</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex-1 bg-secondary border border-secondary rounded-lg px-3 py-2 text-foreground text-sm font-mono">
            {colorFormat === 'HEX' && hexColor}
            {colorFormat === 'HSLA' && `hsla(${Math.round(node.hue)}, ${Math.round(node.saturation)}%, ${Math.round(node.lightness)}%, ${node.alpha / 100})`}
            {colorFormat === 'OKLCH' && node.colorSpace === 'oklch' && `oklch(${node.oklchL}% ${(node.oklchC || 0) / 100 * 0.4} ${node.oklchH}deg)`}
            {colorFormat === 'RGBA' && `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${node.alpha / 100})`}
          </div>
        </div>
      </div>
      
      {/* Lightness Mode */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Sun className="h-4 w-4 text-[#cfcfcf]" />
          <label className="text-[#cfcfcf] text-sm">Lightness mode</label>
        </div>
        <Select value={lightnessMode} onValueChange={(value) => onUpdateNode(node.id, { paletteLightnessMode: value as any })}>
          <SelectTrigger className="bg-secondary border-secondary text-foreground">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-secondary border-secondary">
            <SelectItem value="linear" className="text-foreground">Linear</SelectItem>
            <SelectItem value="curve" className="text-foreground">Curve</SelectItem>
          </SelectContent>
        </Select>
      </div>
      
      {/* Lightness Scale */}
      <div>
        <div className="mb-2 text-[#cfcfcf] text-sm">Lightness scale</div>
        
        <div className="space-y-2">
          <div className="relative pt-2 pb-4">
            {/* Dual Range Slider */}
            <div className="relative h-6 flex items-center">
              {/* Track background - dark */}
              <div className="absolute w-full h-3 bg-secondary rounded-full"></div>
              
              {/* Gradient track showing lightness progression */}
              <div 
                className="absolute h-3 rounded-full overflow-hidden"
                style={{
                  left: `${Math.min(lightnessStart, lightnessEnd)}%`,
                  right: `${100 - Math.max(lightnessStart, lightnessEnd)}%`,
                  background: `linear-gradient(to right, 
                    hsl(${node.hue}, ${node.saturation}%, ${Math.min(lightnessStart, lightnessEnd)}%), 
                    hsl(${node.hue}, ${node.saturation}%, ${Math.max(lightnessStart, lightnessEnd)}%))`
                }}
              ></div>
              
              {/* Dots along the track showing color at each position */}
              {Array.from({ length: node.paletteShadeCount }, (_, i) => {
                const minLight = Math.min(lightnessStart, lightnessEnd);
                const maxLight = Math.max(lightnessStart, lightnessEnd);
                const step = (maxLight - minLight) / (node.paletteShadeCount + 1);
                const lightnessValue = minLight + step * (i + 1);
                return (
                  <div
                    key={i}
                    className="absolute w-1 h-1 rounded-full -translate-x-1/2 z-10"
                    style={{ 
                      left: `${lightnessValue}%`,
                      backgroundColor: '#C2C2C2',
                      boxShadow: '0 1px 2px rgba(0, 0, 0, 0.1)'
                    }}
                  ></div>
                );
              })}
              
              {/* Start knob */}
              <input
                type="range"
                min="0"
                max="100"
                value={lightnessStart}
                onChange={(e) => onUpdateNode(node.id, { paletteLightnessStart: parseInt(e.target.value) })}
                className="absolute w-full appearance-none bg-transparent cursor-pointer pointer-events-none z-20 palette-range-slider [&::-webkit-slider-thumb]:pointer-events-auto [&::-moz-range-thumb]:pointer-events-auto"
                onMouseDown={(e) => e.stopPropagation()}
              />
              
              {/* End knob */}
              <input
                type="range"
                min="0"
                max="100"
                value={lightnessEnd}
                onChange={(e) => onUpdateNode(node.id, { paletteLightnessEnd: parseInt(e.target.value) })}
                className="absolute w-full appearance-none bg-transparent cursor-pointer pointer-events-none z-20 palette-range-slider [&::-webkit-slider-thumb]:pointer-events-auto [&::-moz-range-thumb]:pointer-events-auto"
                onMouseDown={(e) => e.stopPropagation()}
              />
            </div>
            
            {/* Labels */}
            <div className="flex justify-between items-center mt-2">
              <span className="text-xs text-[#b4b4b4]">Start: {lightnessStart}%</span>
              <span className="text-xs text-[#b4b4b4]">End: {lightnessEnd}%</span>
            </div>
          </div>
        </div>
      </div>
      
      {/* Naming Pattern */}
      <div>
        <div className="mb-2 text-[#cfcfcf] text-sm">Naming pattern</div>
        <Select value={namingPattern} onValueChange={(value) => onUpdateNode(node.id, { paletteNamingPattern: value as any })}>
          <SelectTrigger className="bg-secondary border-secondary text-foreground">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-secondary border-secondary">
            <SelectItem value="1-9" className="text-foreground">1-9</SelectItem>
            <SelectItem value="10-90" className="text-foreground">10-90</SelectItem>
            <SelectItem value="100-900" className="text-foreground">100-900</SelectItem>
            <SelectItem value="a-z" className="text-foreground">a-z</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Shades Count */}
      <div>
        <div className="flex justify-between items-center mb-1">
          <label className="text-[#cfcfcf] text-sm">Shades</label>
          <span className="text-foreground text-sm">{shadeCount}</span>
        </div>
        <input
          type="range"
          min="2"
          max="20"
          value={shadeCount}
          onChange={(e) => onUpdateNode(node.id, { paletteShadeCount: parseInt(e.target.value) })}
          className="w-full h-1 bg-elevated rounded-full appearance-none cursor-pointer palette-range-slider"
          onMouseDown={(e) => e.stopPropagation()}
        />
        <div className="flex justify-between mt-2">
          <span className="text-xs text-muted-foreground">2</span>
          <span className="text-xs text-muted-foreground">20</span>
        </div>
      </div>
    </div>
  );
}

export function ColorNodeCard({
  node,
  nodes,
  tokens,
  groups,
  activeProjectId,
  onMouseDown,
  onUpdateNode,
  onAddChild,
  onAddParent,
  onDelete,
  onUnlink,
  onLink,
  onAssignToken,
  onUpdateToken,
  onDeleteToken,
  onNavigateToNode,
  onWireDragStart,
  onWireHoverStart,
  onWireHoverEnd,
  isWireHovered,
  wireStartButtonType,
  isDraggingWire,
  isSelected,
  isMultiSelected,
  selectedNodeIds = [],
  onSelect,
  onDoubleClick,
  onColorPickerOpenChange,
  shouldAutoOpenColorPicker,
  onColorPickerAutoOpened,
  pages = [],
  isPaletteShade = false,
  showInheritanceIcon = false,
  activeThemeId = '',
  isPrimaryTheme = true,
  primaryThemeId = '',
  showAllVisible = false,
  isNodeHidden = false,
  onToggleVisibility,
  activeAdvancedChannels = [],
  onRevertThemeAdvancedLogic,
  readOnly = false,
  nodeViewConfig = {},
  showDevMode = false,
  onToggleWebhookInput,
}: ColorNodeCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  
  // Helper: check if a channel key has active advanced logic
  const isChannelAdvanced = useCallback((key: string) => activeAdvancedChannels.includes(key), [activeAdvancedChannels]);

  // Helper: check if a channel is hidden by Node View config
  const isChannelHidden = useCallback((key: string) => !!nodeViewConfig[key]?.hidden, [nodeViewConfig]);

  // Helper: get slider min/max for a channel from Node View config
  const getSliderRange = useCallback((key: string, defaultMin: number, defaultMax: number) => {
    const cfg = nodeViewConfig[key];
    return {
      min: cfg?.sliderMin !== undefined ? cfg.sliderMin : defaultMin,
      max: cfg?.sliderMax !== undefined ? cfg.sliderMax : defaultMax,
    };
  }, [nodeViewConfig]);

  // Helper function to get theme-specific token assignments
  const getNodeTokenIds = (node: ColorNode): string[] => {
    // If theme assignments exist for this theme (even if empty array), use them
    if (activeThemeId && node.tokenAssignments?.[activeThemeId] !== undefined) {
      return node.tokenAssignments[activeThemeId];
    }
    // Fallback to legacy tokenIds only if no theme assignments exist at all
    return node.tokenIds || [];
  };
  const [isEditingHex, setIsEditingHex] = useState(false);
  const [hexInputValue, setHexInputValue] = useState('');
  const [copiedHex, setCopiedHex] = useState(false);
  const [showParentSelector, setShowParentSelector] = useState(false);
  const [tokenComboOpenIndex, setTokenComboOpenIndex] = useState<number | null>(null);
  const [isExpanded, setIsExpanded] = useState(node.isExpanded ?? false);
  const [isResizing, setIsResizing] = useState(false);
  const [reassignPopover, setReassignPopover] = useState<{ tokenId: string; previousNodeId: string; open: boolean } | null>(null);
  const reassignHoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Auto-assign token delete confirmation dialog ──────────────
  const [autoAssignDeleteDialog, setAutoAssignDeleteDialog] = useState<{
    open: boolean;
    tokenId: string;
    tokenName: string;
    excludeFromAutoAssign: boolean;
  }>({ open: false, tokenId: '', tokenName: '', excludeFromAutoAssign: false });

  const [colorFormat, setColorFormat] = useState<'HSLA' | 'RGBA' | 'OKLCH'>('HSLA');
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [popoverSide, setPopoverSide] = useState<'right' | 'left' | 'top' | 'bottom'>('right');
  const [isHovered, setIsHovered] = useState(false);
  const hexInputRef = useRef<HTMLInputElement>(null);
  const headerHexInputRef = useRef<HTMLInputElement>(null);
  const resizeStartRef = useRef<{ width: number; mouseX: number } | null>(null);
  const paletteButtonRef = useRef<HTMLButtonElement>(null);
  
  // Refs for color property inputs (for keyboard shortcuts)
  const hueInputRef = useRef<HTMLInputElement>(null);
  const saturationInputRef = useRef<HTMLInputElement>(null);
  const lightnessInputRef = useRef<HTMLInputElement>(null);
  const alphaInputRef = useRef<HTMLInputElement>(null);
  const redInputRef = useRef<HTMLInputElement>(null);
  const greenInputRef = useRef<HTMLInputElement>(null);
  const blueInputRef = useRef<HTMLInputElement>(null);
  const chromaInputRef = useRef<HTMLInputElement>(null);
  const hctHueInputRef = useRef<HTMLInputElement>(null);
  const hctChromaInputRef = useRef<HTMLInputElement>(null);
  const hctToneInputRef = useRef<HTMLInputElement>(null);
  
  // Helper function to check if node is linked to primary theme
  const isLinkedToPrimary = (): boolean => {
    if (isPrimaryTheme || !activeThemeId) return true; // Primary theme nodes are always "linked" to themselves
    return !node.themeOverrides || !node.themeOverrides[activeThemeId];
  };
  
  // Helper to check if a specific node is inherited (linked to primary) on the current theme
  const isNodeInheritedOnTheme = (n: ColorNode): boolean => {
    if (isPrimaryTheme || !activeThemeId) return false; // Primary theme: never "inherited"
    return !n.themeOverrides || !n.themeOverrides[activeThemeId];
  };
  
  // On non-primary themes, structural changes (connect/disconnect) are blocked
  // if THIS node is inherited — any connection involving an inherited node is locked
  const isStructurallyLocked = !isPrimaryTheme && !!activeThemeId && isNodeInheritedOnTheme(node);

  // Helper function to get effective color values for the current theme
  const getEffectiveColorValues = () => {
    if (isPrimaryTheme || !activeThemeId || isLinkedToPrimary()) {
      // Use base node values (primary theme values)
      return {
        hue: node.hue,
        saturation: node.saturation,
        lightness: node.lightness,
        alpha: node.alpha,
        red: node.red,
        green: node.green,
        blue: node.blue,
        oklchL: node.oklchL,
        oklchC: node.oklchC,
        oklchH: node.oklchH,
        hctH: node.hctH,
        hctC: node.hctC,
        hctT: node.hctT,
        hexValue: node.hexValue,
      };
    }
    // Use theme override values, falling back to base node values for any missing properties
    const overrides = node.themeOverrides![activeThemeId];
    return {
      hue: overrides.hue ?? node.hue,
      saturation: overrides.saturation ?? node.saturation,
      lightness: overrides.lightness ?? node.lightness,
      alpha: overrides.alpha ?? node.alpha,
      red: (overrides as any).red ?? node.red,
      green: (overrides as any).green ?? node.green,
      blue: (overrides as any).blue ?? node.blue,
      oklchL: (overrides as any).oklchL ?? node.oklchL,
      oklchC: (overrides as any).oklchC ?? node.oklchC,
      oklchH: (overrides as any).oklchH ?? node.oklchH,
      hctH: (overrides as any).hctH ?? node.hctH,
      hctC: (overrides as any).hctC ?? node.hctC,
      hctT: (overrides as any).hctT ?? node.hctT,
      hexValue: (overrides as any).hexValue ?? node.hexValue,
    };
  };
  
  // Get effective color values for display and editing
  const effectiveColors = getEffectiveColorValues();

  // ── Parent effective colors (for diff computation) ────────────────────
  const parentNodeRef = nodes.find(n => n.id === node.parentId);
  const parentEffective = parentNodeRef ? (() => {
    if (isPrimaryTheme || !activeThemeId) {
      return {
        hue: parentNodeRef.hue, saturation: parentNodeRef.saturation, lightness: parentNodeRef.lightness,
        alpha: parentNodeRef.alpha ?? 100,
        red: parentNodeRef.red ?? 0, green: parentNodeRef.green ?? 0, blue: parentNodeRef.blue ?? 0,
        oklchL: parentNodeRef.oklchL ?? 0, oklchC: parentNodeRef.oklchC ?? 0, oklchH: parentNodeRef.oklchH ?? 0,
        hctH: parentNodeRef.hctH ?? 0, hctC: parentNodeRef.hctC ?? 0, hctT: parentNodeRef.hctT ?? 0,
      };
    }
    const ov = parentNodeRef.themeOverrides?.[activeThemeId];
    if (!ov) return {
      hue: parentNodeRef.hue, saturation: parentNodeRef.saturation, lightness: parentNodeRef.lightness,
      alpha: parentNodeRef.alpha ?? 100,
      red: parentNodeRef.red ?? 0, green: parentNodeRef.green ?? 0, blue: parentNodeRef.blue ?? 0,
      oklchL: parentNodeRef.oklchL ?? 0, oklchC: parentNodeRef.oklchC ?? 0, oklchH: parentNodeRef.oklchH ?? 0,
      hctH: parentNodeRef.hctH ?? 0, hctC: parentNodeRef.hctC ?? 0, hctT: parentNodeRef.hctT ?? 0,
    };
    return {
      hue: ov.hue ?? parentNodeRef.hue, saturation: ov.saturation ?? parentNodeRef.saturation,
      lightness: ov.lightness ?? parentNodeRef.lightness, alpha: ov.alpha ?? parentNodeRef.alpha ?? 100,
      red: (ov as any).red ?? parentNodeRef.red ?? 0, green: (ov as any).green ?? parentNodeRef.green ?? 0,
      blue: (ov as any).blue ?? parentNodeRef.blue ?? 0,
      oklchL: (ov as any).oklchL ?? parentNodeRef.oklchL ?? 0, oklchC: (ov as any).oklchC ?? parentNodeRef.oklchC ?? 0,
      oklchH: (ov as any).oklchH ?? parentNodeRef.oklchH ?? 0,
      hctH: (ov as any).hctH ?? parentNodeRef.hctH ?? 0, hctC: (ov as any).hctC ?? parentNodeRef.hctC ?? 0,
      hctT: (ov as any).hctT ?? parentNodeRef.hctT ?? 0,
    };
  })() : null;

  // Helper: compute diff props for a channel between child and parent
  const hasSameColorSpaceParent = parentNodeRef && parentNodeRef.colorSpace === node.colorSpace;
  const getDiffProps = (
    childVal: number,
    parentVal: number | undefined,
    min: number,
    max: number,
    handler: (absoluteVal: number) => void,
    wrap?: boolean,
    prec?: number
  ): { diffValue: number | null; onDiffValueChange: (d: number) => void; precision?: number } => {
    if (!parentNodeRef || !hasSameColorSpaceParent || parentVal === undefined) {
      return { diffValue: null, onDiffValueChange: () => {}, ...(prec != null && { precision: prec }) };
    }
    const diff = childVal - parentVal;
    return {
      diffValue: diff,
      onDiffValueChange: (newDiff: number) => {
        let newVal = parentVal + newDiff;
        if (wrap) newVal = ((newVal % max) + max) % max;
        else newVal = Math.max(min, Math.min(max, newVal));
        handler(newVal);
      },
      ...(prec != null && { precision: prec }),
    };
  };

  // Toggle link to primary theme
  const handleToggleLinkToPrimary = () => {
    if (isPrimaryTheme || !activeThemeId) return;
    
    if (isLinkedToPrimary()) {
      // Unlink: Create theme override with current values (color only — tokens are independent)
      const currentValues = {
        hue: node.hue,
        saturation: node.saturation,
        lightness: node.lightness,
        alpha: node.alpha,
        red: node.red,
        green: node.green,
        blue: node.blue,
        oklchL: node.oklchL,
        oklchC: node.oklchC,
        oklchH: node.oklchH,
        hctH: node.hctH,
        hctC: node.hctC,
        hctT: node.hctT,
        hexValue: node.hexValue,
      };
      onUpdateNode(node.id, {
        themeOverrides: {
          ...node.themeOverrides,
          [activeThemeId]: currentValues,
        },
      });
    } else {
      // Re-link: Remove theme override (color only — tokens are independent)
      const newOverrides = { ...node.themeOverrides };
      delete newOverrides[activeThemeId];
      onUpdateNode(node.id, {
        themeOverrides: newOverrides,
      });
      // Also clear theme-specific advanced logic for this node+theme
      if (activeThemeId && onRevertThemeAdvancedLogic) {
        onRevertThemeAdvancedLogic(node.id, activeThemeId);
      }
    }
  };
  
  // Revert token assignments to match the primary theme (undo all token modifications)
  const handleRevertTokensToPrimary = () => {
    if (isPrimaryTheme || !activeThemeId || !primaryThemeId) return;

    // Get primary theme's token assignments for this node
    const primaryAssignments = node.tokenAssignments?.[primaryThemeId] !== undefined
      ? node.tokenAssignments[primaryThemeId]
      : (node.tokenIds || []);

    // Clean up tokens that were added only on the current theme — reset their values
    const currentAssignments = node.tokenAssignments?.[activeThemeId] !== undefined
      ? node.tokenAssignments[activeThemeId]
      : (node.tokenIds || []);
    const primarySet = new Set(primaryAssignments);
    currentAssignments.forEach(tokenId => {
      if (!primarySet.has(tokenId)) {
        const token = tokens.find(t => t.id === tokenId);
        if (token && onUpdateToken) {
          const primaryValue = token.themeValues?.[primaryThemeId];
          if (primaryValue) {
            const updatedThemeValues = { ...token.themeValues };
            updatedThemeValues[activeThemeId] = { ...primaryValue };
            onUpdateToken(tokenId, { themeValues: updatedThemeValues });
          }
        }
      }
    });

    // Reclaim tokens from OTHER nodes that currently hold them on this theme.
    // Since tokens are exclusive (one token → one node per theme), reverting
    // this node's assignments to primary must remove those tokens from wherever
    // they were reassigned on the active theme.
    primaryAssignments.forEach(tokenId => {
      nodes.forEach(otherNode => {
        if (otherNode.id === node.id) return; // skip self
        const otherAssignments = otherNode.tokenAssignments?.[activeThemeId] !== undefined
          ? otherNode.tokenAssignments[activeThemeId]
          : (otherNode.tokenIds || []);
        if (otherAssignments.includes(tokenId)) {
          const updatedOtherAssignments = { ...otherNode.tokenAssignments };
          updatedOtherAssignments[activeThemeId] = otherAssignments.filter(tid => tid !== tokenId);
          onUpdateNode(otherNode.id, { tokenAssignments: updatedOtherAssignments });
        }
      });
    });

    // Overwrite current theme's assignments with primary's
    const updatedAssignments = { ...node.tokenAssignments };
    updatedAssignments[activeThemeId] = [...primaryAssignments];
    onUpdateNode(node.id, { tokenAssignments: updatedAssignments });

    // For every token in the primary assignment list, copy primary theme
    // values into the current theme so resolved values also match.
    primaryAssignments.forEach(tokenId => {
      const token = tokens.find(t => t.id === tokenId);
      if (token && onUpdateToken) {
        const primaryValue = token.themeValues?.[primaryThemeId];
        if (primaryValue) {
          const updatedThemeValues = { ...token.themeValues };
          updatedThemeValues[activeThemeId] = { ...primaryValue };
          onUpdateToken(tokenId, { themeValues: updatedThemeValues });
        }
      }
    });
  };

  // Determine if color inputs should be disabled (non-primary theme with linked node)
  const isColorInputDisabled = readOnly || (!isPrimaryTheme && isLinkedToPrimary());
  
  // Theme inheritance section tracking for non-primary themes
  const [hoveredSection, setHoveredSection] = useState<'color' | 'token' | null>(null);
  
  // Determine if token assignments differ from primary theme.
  // Uses the same resolution logic as getNodeTokenIds to avoid mismatches
  // between what's displayed and what's compared.
  const hasTokenAssignmentChanges = (() => {
    if (isPrimaryTheme || !activeThemeId || !primaryThemeId) return false;
    // Resolve primary theme tokens (same fallback as getNodeTokenIds)
    const primaryAssignments = node.tokenAssignments?.[primaryThemeId] !== undefined
      ? node.tokenAssignments[primaryThemeId]
      : (node.tokenIds || []);
    // Resolve current theme tokens (same fallback as getNodeTokenIds)
    const currentAssignments = node.tokenAssignments?.[activeThemeId] !== undefined
      ? node.tokenAssignments[activeThemeId]
      : (node.tokenIds || []);
    if (primaryAssignments.length !== currentAssignments.length) return true;
    const primarySet = new Set(primaryAssignments);
    return currentAssignments.some(id => !primarySet.has(id));
  })();
  
  // Also check if any assigned token's resolved VALUE differs between themes
  // (e.g. user changed node color on this theme, causing different token HSL output)
  const hasTokenValueChanges = (() => {
    if (isPrimaryTheme || !activeThemeId || !primaryThemeId) return false;
    const nodeTokenIds = getNodeTokenIds(node);
    if (nodeTokenIds.length === 0) return false;
    return nodeTokenIds.some(tokenId => {
      const token = tokens.find(t => t.id === tokenId);
      if (!token) return false;
      const primaryValue = token.themeValues?.[primaryThemeId];
      const currentValue = token.themeValues?.[activeThemeId];
      if (!primaryValue && !currentValue) return false;
      if (!primaryValue || !currentValue) return true;
      // Compare HSL values
      if ('hue' in primaryValue && 'hue' in currentValue) {
        return Math.round(primaryValue.hue ?? 0) !== Math.round(currentValue.hue ?? 0) ||
               Math.round(primaryValue.saturation ?? 0) !== Math.round(currentValue.saturation ?? 0) ||
               Math.round(primaryValue.lightness ?? 0) !== Math.round(currentValue.lightness ?? 0);
      }
      // Compare spacing values
      if ('value' in primaryValue && 'value' in currentValue) {
        return primaryValue.value !== currentValue.value || primaryValue.unit !== currentValue.unit;
      }
      return false;
    });
  })();
  
  // Combined: token section has changes if EITHER assignments or values differ
  const hasAnyTokenChanges = hasTokenAssignmentChanges || hasTokenValueChanges;
  
  // Whether the color section is inherited (linked to primary)
  const isColorInherited = !isPrimaryTheme && isLinkedToPrimary();
  
  // Whether color has actually changed (unlinked from primary = color changed)
  const isColorChanged = !isPrimaryTheme && !isLinkedToPrimary();
  
  // Whether the color VALUES have actually been modified from primary after unlinking
  // (Right after toggling off, override values still match primary — not yet modified)
  const hasColorBeenModified = !isPrimaryTheme && !isLinkedToPrimary() && (() => {
    if (!activeThemeId || !node.themeOverrides?.[activeThemeId]) return false;
    const overrides = node.themeOverrides[activeThemeId];
    return (
      overrides.hue !== node.hue ||
      overrides.saturation !== node.saturation ||
      overrides.lightness !== node.lightness ||
      (overrides.alpha ?? node.alpha) !== node.alpha
    );
  })();

  // Whether the entire node is fully inherited (color + tokens same as primary)
  const isFullyInherited = isColorInherited && !hasAnyTokenChanges;
  
  // Whether each section should be dimmed (only dim when NOT modified on this theme)
  const isColorSectionDimmed = !isPrimaryTheme && isColorInherited;
  const isTokenSectionDimmed = !isPrimaryTheme && !hasAnyTokenChanges;
  
  // Compute dim opacity ONLY when section is dimmed; returns undefined when fully visible.
  // This avoids ever setting opacity:1 as an inline style — sections that should be
  // fully visible simply have NO opacity style applied at all.
  const colorDimOpacity: number | undefined = (() => {
    if (showAllVisible) return undefined;
    if (!isColorSectionDimmed) return undefined;
    if (hoveredSection === 'color') return 1;
    return hasAnyTokenChanges ? 0.45 : 0.55;
  })();
  
  const tokenDimOpacity: number | undefined = (() => {
    if (showAllVisible) return undefined;
    if (!isTokenSectionDimmed) return undefined;
    if (hoveredSection === 'token') return 1;
    return isColorChanged ? 0.45 : 0.55;
  })();
  
  // Whether the color section needs hover interaction (only when dimmed)
  const colorNeedsHover = isColorSectionDimmed;
  // Whether the token section needs hover interaction (all non-primary themes)
  // Even when tokens are modified (section not technically dimmed), enable hover
  // so the section can always be revealed at full opacity on non-primary themes
  const tokenNeedsHover = !isPrimaryTheme;
  
  // Inheritance toggle bar opacity — tracks colorDimOpacity so the bar and color
  // swatch have the same perceived dimness and light up together on hover.
  const barDimOpacity: number | undefined = (() => {
    if (isPrimaryTheme || !showInheritanceIcon) return undefined;
    if (showAllVisible) return undefined;
    if (!isColorSectionDimmed) return undefined; // not inherited → fully visible
    if (isSelected || isMultiSelected) return 1; // fully visible when node is selected or multi-selected
    if (hoveredSection === 'color') return 1;
    return hasAnyTokenChanges ? 0.45 : 0.55;
  })();
  
  // Sync local isExpanded state with node prop (for keyboard shortcuts)
  useEffect(() => {
    setIsExpanded(node.isExpanded ?? false);
  }, [node.isExpanded]);
  
  // Notify parent when color picker opens/closes
  useEffect(() => {
    if (onColorPickerOpenChange) {
      onColorPickerOpenChange(node.id, showColorPicker);
    }
  }, [showColorPicker, node.id, onColorPickerOpenChange]);
  
  // Close color picker when node loses selection
  useEffect(() => {
    if (!isSelected && showColorPicker) {
      setShowColorPicker(false);
    }
  }, [isSelected, showColorPicker]);
  
  // Force-close color picker when node becomes inherited (disabled)
  useEffect(() => {
    if (isColorInputDisabled && showColorPicker) {
      setShowColorPicker(false);
    }
  }, [isColorInputDisabled, showColorPicker]);
  
  // Calculate optimal popover position based on viewport
  const calculatePopoverPosition = useCallback(() => {
    if (!paletteButtonRef.current) return;
    
    const buttonRect = paletteButtonRef.current.getBoundingClientRect();
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
  
  // Auto-open color picker when navigating with arrow keys
  useEffect(() => {
    if (shouldAutoOpenColorPicker && !showColorPicker) {
      calculatePopoverPosition();
      setShowColorPicker(true);
      if (onColorPickerAutoOpened) {
        onColorPickerAutoOpened();
      }
    }
  }, [shouldAutoOpenColorPicker, showColorPicker, calculatePopoverPosition, onColorPickerAutoOpened]);
  
  // Listen for "autoOpenTokenCombo" event — triggered when "Go back" restores this node
  useEffect(() => {
    const handleAutoOpen = (e: Event) => {
      const { nodeId } = (e as CustomEvent<{ nodeId: string }>).detail;
      if (nodeId === node.id) {
        // Open the token assignment combobox (index -1 = "Select token..." trigger)
        setTokenComboOpenIndex(-1);
      }
    };
    window.addEventListener('autoOpenTokenCombo', handleAutoOpen);
    return () => window.removeEventListener('autoOpenTokenCombo', handleAutoOpen);
  }, [node.id]);

  // Handle keyboard shortcuts for color picker
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only trigger if this node is selected
      if (!isSelected) return;
      
      // Block all keyboard shortcuts when node is inherited (color inputs disabled)
      if (isColorInputDisabled) return;
      
      // Check if user is typing in an input field
      const target = e.target as HTMLElement;
      const isTyping = target.tagName === 'INPUT' || 
                      target.tagName === 'TEXTAREA' || 
                      target.isContentEditable;
      
      // If user is typing in an input, don't interfere with their input at all
      // Let all keyboard events pass through naturally to the input
      if (isTyping) {
        // Only handle Enter key to blur input when typing
        if (e.key === 'Enter') {
          e.preventDefault();
          (target as HTMLInputElement).blur();
        }
        // For all other keys while typing, let them pass through to the input
        return;
      }
      
      // Allow Tab to work normally for focus navigation when popup is open
      if (showColorPicker && e.key === 'Tab') {
        return; // Don't prevent default, let Tab work naturally
      }
      
      // If color picker is open, handle property shortcuts
      if (showColorPicker) {
        let handled = false;
        
        // HSL shortcuts
        if (node.colorSpace === 'hsl') {
          if (e.key === 'h' || e.key === 'H') {
            hueInputRef.current?.focus();
            hueInputRef.current?.select();
            handled = true;
          } else if (e.key === 's' || e.key === 'S') {
            saturationInputRef.current?.focus();
            saturationInputRef.current?.select();
            handled = true;
          } else if (e.key === 'l' || e.key === 'L') {
            lightnessInputRef.current?.focus();
            lightnessInputRef.current?.select();
            handled = true;
          } else if (e.key === 'a' || e.key === 'A') {
            alphaInputRef.current?.focus();
            alphaInputRef.current?.select();
            handled = true;
          } else if ((e.key === 'c' || e.key === 'C' || e.code === 'KeyC') && e.shiftKey && !e.metaKey && !e.ctrlKey) {
            // Shift + C closes color picker
            setShowColorPicker(false);
            handled = true;
          } else if ((e.key === 'c' || e.key === 'C' || e.code === 'KeyC') && !e.metaKey && !e.ctrlKey) {
            // C closes color picker for HSL (but not Cmd+C/Ctrl+C)
            setShowColorPicker(false);
            handled = true;
          }
        }
        
        // RGB shortcuts
        if (node.colorSpace === 'rgb') {
          if (e.key === 'r' || e.key === 'R') {
            redInputRef.current?.focus();
            redInputRef.current?.select();
            handled = true;
          } else if (e.key === 'g' || e.key === 'G') {
            greenInputRef.current?.focus();
            greenInputRef.current?.select();
            handled = true;
          } else if (e.key === 'b' || e.key === 'B') {
            blueInputRef.current?.focus();
            blueInputRef.current?.select();
            handled = true;
          } else if (e.key === 'a' || e.key === 'A') {
            alphaInputRef.current?.focus();
            alphaInputRef.current?.select();
            handled = true;
          } else if ((e.key === 'c' || e.key === 'C' || e.code === 'KeyC') && e.shiftKey && !e.metaKey && !e.ctrlKey) {
            // Shift + C closes color picker
            setShowColorPicker(false);
            handled = true;
          } else if ((e.key === 'c' || e.key === 'C' || e.code === 'KeyC') && !e.metaKey && !e.ctrlKey) {
            // C closes color picker for RGB (but not Cmd+C/Ctrl+C)
            setShowColorPicker(false);
            handled = true;
          }
        }
        
        // OKLCH shortcuts
        if (node.colorSpace === 'oklch') {
          if (e.key === 'l' || e.key === 'L') {
            lightnessInputRef.current?.focus();
            lightnessInputRef.current?.select();
            handled = true;
          } else if ((e.key === 'c' || e.key === 'C' || e.code === 'KeyC') && e.shiftKey && !e.metaKey && !e.ctrlKey) {
            // Shift + C closes color picker for OKLCH
            setShowColorPicker(false);
            handled = true;
          } else if ((e.key === 'c' || e.key === 'C' || e.code === 'KeyC') && !e.metaKey && !e.ctrlKey) {
            // C focuses Chroma for OKLCH (but not Cmd+C/Ctrl+C)
            chromaInputRef.current?.focus();
            chromaInputRef.current?.select();
            handled = true;
          } else if (e.key === 'h' || e.key === 'H') {
            hueInputRef.current?.focus();
            hueInputRef.current?.select();
            handled = true;
          } else if (e.key === 'a' || e.key === 'A') {
            alphaInputRef.current?.focus();
            alphaInputRef.current?.select();
            handled = true;
          }
        }
        
        // HCT shortcuts
        if (node.colorSpace === 'hct') {
          if (e.key === 'h' || e.key === 'H') {
            hctHueInputRef.current?.focus();
            hctHueInputRef.current?.select();
            handled = true;
          } else if ((e.key === 'c' || e.key === 'C' || e.code === 'KeyC') && e.shiftKey && !e.metaKey && !e.ctrlKey) {
            // Shift + C closes color picker for HCT
            setShowColorPicker(false);
            handled = true;
          } else if ((e.key === 'c' || e.key === 'C' || e.code === 'KeyC') && !e.metaKey && !e.ctrlKey) {
            // C focuses Chroma for HCT (but not Cmd+C/Ctrl+C)
            hctChromaInputRef.current?.focus();
            hctChromaInputRef.current?.select();
            handled = true;
          } else if (e.key === 't' || e.key === 'T') {
            hctToneInputRef.current?.focus();
            hctToneInputRef.current?.select();
            handled = true;
          } else if (e.key === 'a' || e.key === 'A') {
            alphaInputRef.current?.focus();
            alphaInputRef.current?.select();
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
          setShowColorPicker(true);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isSelected, showColorPicker, node.colorSpace, isColorInputDisabled]);
  
  // Check if parent has a different color space
  const parentNode = nodes.find(n => n.id === node.parentId);
  const hasDifferentColorSpaceParent = parentNode && parentNode.colorSpace !== node.colorSpace;
  
  // Wire drag threshold state
  const [wireButtonPressed, setWireButtonPressed] = useState<{ buttonType: 'left' | 'right'; startX: number; startY: number } | null>(null);
  const alphaDecimal = (effectiveColors.alpha ?? 100) / 100;
  
  // Generate color string based on colorSpace using effective color values
  const displayColor = (() => {
    // For palette shade nodes, HSL is always the ground truth (set during shade generation).
    // Always use HSLA for reliable rendering, regardless of the shade's colorSpace.
    if (isPaletteShade) {
      return `hsla(${effectiveColors.hue}, ${effectiveColors.saturation}%, ${effectiveColors.lightness}%, ${alphaDecimal})`;
    }
    if (node.colorSpace === 'rgb') {
      return `rgba(${effectiveColors.red || 0}, ${effectiveColors.green || 0}, ${effectiveColors.blue || 0}, ${alphaDecimal})`;
    } else if (node.colorSpace === 'oklch') {
      return `oklch(${(effectiveColors.oklchL || 0)}% ${(effectiveColors.oklchC || 0) / 100 * 0.4} ${effectiveColors.oklchH || 0}deg / ${alphaDecimal})`;
    } else if (node.colorSpace === 'hct') {
      // Convert HCT to RGB for display
      const rgb = hctToRgb(effectiveColors.hctH || 0, effectiveColors.hctC || 0, effectiveColors.hctT || 0);
      return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alphaDecimal})`;
    } else if (node.colorSpace === 'hex') {
      // For locked hex nodes, use their own hexValue
      if (node.hexLocked) {
        if (effectiveColors.hexValue) {
          const cleanHex = effectiveColors.hexValue.replace('#', '');
          const r = parseInt(cleanHex.substring(0, 2), 16);
          const g = parseInt(cleanHex.substring(2, 4), 16);
          const b = parseInt(cleanHex.substring(4, 6), 16);
          const alpha = cleanHex.length === 8 ? parseInt(cleanHex.substring(6, 8), 16) / 255 : alphaDecimal;
          return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        }
        // Locked but no hexValue - use default gray
        return `hsla(0, 0%, 50%, ${alphaDecimal})`;
      }
      // For unlocked hex nodes, use their own hexValue if set (preserves color when unlocking)
      if (!node.hexLocked && effectiveColors.hexValue) {
        const cleanHex = effectiveColors.hexValue.replace('#', '');
        const r = parseInt(cleanHex.substring(0, 2), 16);
        const g = parseInt(cleanHex.substring(2, 4), 16);
        const b = parseInt(cleanHex.substring(4, 6), 16);
        const alpha = cleanHex.length === 8 ? parseInt(cleanHex.substring(6, 8), 16) / 255 : alphaDecimal;
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
      }
      // For unlocked hex nodes without hexValue, use inherited HSL values
      return `hsla(${effectiveColors.hue}, ${effectiveColors.saturation}%, ${effectiveColors.lightness}%, ${alphaDecimal})`;
    } else {
      // For HSL, use HSLA for CSS display
      return `hsla(${effectiveColors.hue}, ${effectiveColors.saturation}%, ${effectiveColors.lightness}%, ${alphaDecimal})`;
    }
  })();
  
  const hslColor = displayColor; // For backward compatibility
  
  const hexColor = (() => {
    let h = effectiveColors.hue, s = effectiveColors.saturation, l = effectiveColors.lightness;
    
    // For locked hex type nodes, use their own hexValue
    if (node.colorSpace === 'hex' && node.hexLocked) {
      if (node.hexValue) {
        return node.hexValue;
      }
      // Locked but no hexValue - show default gray
      return '#808080';
    }
    
    // For unlocked hex nodes, use their own hexValue if set (preserves value when unlocking)
    if (node.colorSpace === 'hex' && !node.hexLocked && node.hexValue) {
      return node.hexValue;
    }
    
    // For unlocked hex nodes with parent and no hexValue, inherit from parent
    if (node.colorSpace === 'hex' && !node.hexLocked && parentNode) {
      // Get parent's hex value if parent is also hex
      if (parentNode.colorSpace === 'hex' && parentNode.hexValue) {
        return parentNode.hexValue;
      }
      
      // Get parent's color values based on parent's color space
      if (parentNode.colorSpace === 'rgb') {
        const r = (parentNode.red || 0) / 255;
        const g = (parentNode.green || 0) / 255;
        const b = (parentNode.blue || 0) / 255;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        l = (max + min) / 2 * 100;
        
        if (max === min) {
          h = s = 0;
        } else {
          const d = max - min;
          s = l > 50 ? d / (2 - max - min) : d / (max + min);
          s *= 100;
          
          switch (max) {
            case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6 * 360; break;
            case g: h = ((b - r) / d + 2) / 6 * 360; break;
            case b: h = ((r - g) / d + 4) / 6 * 360; break;
          }
        }
      } else if (parentNode.colorSpace === 'oklch') {
        h = parentNode.oklchH || 0;
        s = parentNode.oklchC || 0;
        l = parentNode.oklchL || 0;
      } else {
        // Parent is HSL or HEX
        h = parentNode.hue;
        s = parentNode.saturation;
        l = parentNode.lightness;
      }
      
      const baseHex = hslToHex(h, s, l);
      const alpha = parentNode.alpha ?? 100;
      if (alpha < 100) {
        const alphaHex = Math.round((alpha / 100) * 255).toString(16).padStart(2, '0').toUpperCase();
        return `${baseHex}${alphaHex}`;
      }
      return baseHex;
    }
    
    // For unlocked hex nodes without parent, use hexValue if available
    if (node.colorSpace === 'hex') {
      if (node.hexValue) {
        return node.hexValue;
      }
      // No hexValue set - convert HSL to hex for display
      h = effectiveColors.hue;
      s = effectiveColors.saturation;
      l = effectiveColors.lightness;
      const baseHex = hslToHex(h, s, l);
      const alpha = effectiveColors.alpha ?? 100;
      if (alpha < 100) {
        const alphaHex = Math.round((alpha / 100) * 255).toString(16).padStart(2, '0').toUpperCase();
        return `${baseHex}${alphaHex}`;
      }
      return baseHex;
    }
    
    // Convert RGB to hex directly
    if (node.colorSpace === 'rgb') {
      // For RGB nodes, always convert RGB to hex (don't use stored hexValue to ensure sliders update display)
      const baseHex = rgbToHex(effectiveColors.red || 0, effectiveColors.green || 0, effectiveColors.blue || 0);
      const alpha = effectiveColors.alpha ?? 100;
      if (alpha < 100) {
        const alphaHex = Math.round((alpha / 100) * 255).toString(16).padStart(2, '0').toUpperCase();
        return `${baseHex}${alphaHex}`;
      }
      return baseHex;
    } else if (node.colorSpace === 'oklch') {
      // For OKLCH nodes, always convert OKLCH to hex (don't use stored hexValue to ensure sliders update display)
      const baseHex = oklchToHex(effectiveColors.oklchL || 0, effectiveColors.oklchC || 0, effectiveColors.oklchH || 0);
      const alpha = effectiveColors.alpha ?? 100;
      if (alpha < 100) {
        const alphaHex = Math.round((alpha / 100) * 255).toString(16).padStart(2, '0').toUpperCase();
        return `${baseHex}${alphaHex}`;
      }
      return baseHex;
    } else if (node.colorSpace === 'hct') {
      // For HCT nodes, always convert HCT to hex (don't use stored hexValue to ensure sliders update display)
      const baseHex = hctToHex(effectiveColors.hctH || 0, effectiveColors.hctC || 0, effectiveColors.hctT || 0);
      const alpha = effectiveColors.alpha ?? 100;
      if (alpha < 100) {
        const alphaHex = Math.round((alpha / 100) * 255).toString(16).padStart(2, '0').toUpperCase();
        return `${baseHex}${alphaHex}`;
      }
      return baseHex;
    } else if (node.colorSpace === 'hsl') {
      // For HSL nodes without stored hexValue, convert from HSL
      h = effectiveColors.hue;
      s = effectiveColors.saturation;
      l = effectiveColors.lightness;
    }
    
    const baseHex = hslToHex(h, s, l);
    const alpha = effectiveColors.alpha ?? 100;
    if (alpha < 100) {
      const alphaHex = Math.round((alpha / 100) * 255).toString(16).padStart(2, '0').toUpperCase();
      return `${baseHex}${alphaHex}`;
    }
    return baseHex;
  })();
  
  // Display value: show native format based on palette color format or node colorSpace
  const displayColorValue = (() => {
    // For palette shade nodes, always compute display from HSL on-the-fly (HSL is ground truth)
    if (isPaletteShade && parentNode?.isPalette) {
      const palFmt = parentNode.paletteColorFormat || 'HEX';
      const h = effectiveColors.hue;
      const s = effectiveColors.saturation;
      const l = effectiveColors.lightness;
      const alpha = effectiveColors.alpha ?? 100;
      
      if (palFmt === 'OKLCH' || node.colorSpace === 'oklch') {
        const oklch = hslToOklch(h, s, l);
        const L = (oklch.l / 100).toFixed(2);
        const C = (oklch.c / 100).toFixed(3);
        const H = Math.round(oklch.h);
        if (alpha < 100) {
          return `oklch(${L} ${C} ${H} / ${(alpha / 100).toFixed(2)})`;
        }
        return `oklch(${L} ${C} ${H})`;
      }
      if (palFmt === 'HSLA') {
        if (alpha < 100) {
          return `hsla(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%, ${(alpha / 100).toFixed(2)})`;
        }
        return `hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%)`;
      }
      if (palFmt === 'RGBA') {
        const rgb = hslToRgb(h, s, l);
        if (alpha < 100) {
          return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${(alpha / 100).toFixed(2)})`;
        }
        return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
      }
      // HEX format - fall through to hexColor
    }
    if (node.colorSpace === 'oklch') {
      const L = ((effectiveColors.oklchL || 0) / 100).toFixed(2);
      const C = ((effectiveColors.oklchC || 0) / 100 * 0.4).toFixed(3);
      const H = Math.round(effectiveColors.oklchH || 0);
      const alpha = effectiveColors.alpha ?? 100;
      if (alpha < 100) {
        return `oklch(${L} ${C} ${H} / ${(alpha / 100).toFixed(2)})`;
      }
      return `oklch(${L} ${C} ${H})`;
    }
    return hexColor;
  })();
  
  // Calculate perceived brightness for better contrast
  // Uses relative luminance formula for accurate brightness perception
  const getPerceivedBrightness = () => {
    let r = 0, g = 0, b = 0;
    
    // For palette shade nodes, always compute from HSL (ground truth)
    if (isPaletteShade) {
      const h = effectiveColors.hue;
      const sNorm = (effectiveColors.saturation) / 100;
      const lNorm = (effectiveColors.lightness) / 100;
      const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
      const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
      const m = lNorm - c / 2;
      let r1 = 0, g1 = 0, b1 = 0;
      if (h >= 0 && h < 60) { r1 = c; g1 = x; }
      else if (h >= 60 && h < 120) { r1 = x; g1 = c; }
      else if (h >= 120 && h < 180) { g1 = c; b1 = x; }
      else if (h >= 180 && h < 240) { g1 = x; b1 = c; }
      else if (h >= 240 && h < 300) { r1 = x; b1 = c; }
      else if (h >= 300 && h < 360) { r1 = c; b1 = x; }
      r = (r1 + m) * 255;
      g = (g1 + m) * 255;
      b = (b1 + m) * 255;
      const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      const alphaDecimal = (effectiveColors.alpha ?? 100) / 100;
      return luminance * alphaDecimal + 0.2 * (1 - alphaDecimal);
    }
    
    // Get RGB values based on color space
    if (node.colorSpace === 'rgb') {
      r = effectiveColors.red || 0;
      g = effectiveColors.green || 0;
      b = effectiveColors.blue || 0;
    } else if (node.colorSpace === 'hex') {
      // For hex nodes, convert hexValue to RGB
      const hex = hexColor; // Use the calculated hexColor value
      const cleanHex = hex.replace('#', '');
      r = parseInt(cleanHex.substring(0, 2), 16);
      g = parseInt(cleanHex.substring(2, 4), 16);
      b = parseInt(cleanHex.substring(4, 6), 16);
    } else if (node.colorSpace === 'oklch') {
      // For OKLCH, use a simple approximation based on lightness
      // OKLCH lightness (0-100) is perceptually uniform
      // We can use it directly as a good approximation
      const oklchL = effectiveColors.oklchL || 0;
      // Simple approximation: convert OKLCH L to perceived brightness
      const luminance = oklchL / 100;
      
      // Canvas background is dark gray (#353535), which has luminance ~0.2
      const canvasBgLuminance = 0.2;
      
      // Blend the color luminance with canvas background based on alpha
      const alphaDecimal = (effectiveColors.alpha ?? 100) / 100;
      const adjustedLuminance = luminance * alphaDecimal + canvasBgLuminance * (1 - alphaDecimal);
      
      return adjustedLuminance;
    } else if (node.colorSpace === 'hct') {
      // For HCT, convert to RGB first
      const rgb = hctToRgb(effectiveColors.hctH || 0, effectiveColors.hctC || 0, effectiveColors.hctT || 0);
      r = rgb.r;
      g = rgb.g;
      b = rgb.b;
    } else {
      // HSL - convert to RGB first
      const h = effectiveColors.hue;
      const s = effectiveColors.saturation / 100;
      const l = effectiveColors.lightness / 100;
      const c = (1 - Math.abs(2 * l - 1)) * s;
      const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
      const m = l - c / 2;
      let r1 = 0, g1 = 0, b1 = 0;
      
      if (h >= 0 && h < 60) { r1 = c; g1 = x; b1 = 0; }
      else if (h >= 60 && h < 120) { r1 = x; g1 = c; b1 = 0; }
      else if (h >= 120 && h < 180) { r1 = 0; g1 = c; b1 = x; }
      else if (h >= 180 && h < 240) { r1 = 0; g1 = x; b1 = c; }
      else if (h >= 240 && h < 300) { r1 = x; g1 = 0; b1 = c; }
      else if (h >= 300 && h < 360) { r1 = c; g1 = 0; b1 = x; }
      
      r = (r1 + m) * 255;
      g = (g1 + m) * 255;
      b = (b1 + m) * 255;
    }
    
    // Calculate relative luminance
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    
    // Canvas background is dark gray (#353535), which has luminance ~0.2
    const canvasBgLuminance = 0.2;
    
    // Blend the color luminance with canvas background based on alpha
    const alphaDecimal = (effectiveColors.alpha ?? 100) / 100;
    const adjustedLuminance = luminance * alphaDecimal + canvasBgLuminance * (1 - alphaDecimal);
    
    return adjustedLuminance;
  };
  
  const perceivedBrightness = getPerceivedBrightness();
  const isLightBackground = perceivedBrightness > 0.4; // Use perceived brightness instead of just lightness
  
  // OKLCH gamut check - determine if the current OKLCH color falls outside sRGB gamut
  const isOklchOutOfGamut = node.colorSpace === 'oklch' && (() => {
    const L = (effectiveColors.oklchL || 0) / 100;
    const C = (effectiveColors.oklchC || 0) / 100 * 0.4;
    const H = effectiveColors.oklchH || 0;
    const hRad = (H * Math.PI) / 180;
    const a = C * Math.cos(hRad);
    const b = C * Math.sin(hRad);
    const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
    const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
    const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
    const l = l_ * l_ * l_;
    const m = m_ * m_ * m_;
    const s = s_ * s_ * s_;
    const r_lin = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
    const g_lin = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
    const b_lin = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
    const toSrgb = (val: number) => val <= 0.0031308 ? 12.92 * val : 1.055 * Math.pow(val, 1 / 2.4) - 0.055;
    const r = toSrgb(r_lin);
    const g = toSrgb(g_lin);
    const bv = toSrgb(b_lin);
    return !(r >= -0.001 && r <= 1.001 && g >= -0.001 && g <= 1.001 && bv >= -0.001 && bv <= 1.001);
  })();

  const minWidth = 240;
  const nodeWidth = node.width || minWidth;

  // Color conversion helpers
  const hslToRgb = (h: number, s: number, l: number) => {
    s = s / 100;
    l = l / 100;
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) => {
      const k = (n + h / 30) % 12;
      const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
      return Math.round(255 * color);
    };
    return { r: f(0), g: f(8), b: f(4) };
  };

  const rgbToHsl = (r: number, g: number, b: number) => {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0, s = 0, l = (max + min) / 2;
    
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }
    
    return {
      h: Math.round(h * 360),
      s: Math.round(s * 100),
      l: Math.round(l * 100)
    };
  };

  const hslToOklchRaw = (h: number, s: number, l: number) => {
    // Convert HSL to RGB first
    const rgb = hslToRgb(h, s, l);
    
    // Convert RGB (0-255) to linear RGB (0-1)
    const toLinear = (c: number) => {
      const val = c / 255;
      return val <= 0.04045 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
    };
    
    const r = toLinear(rgb.r);
    const g = toLinear(rgb.g);
    const b = toLinear(rgb.b);
    
    // Convert linear RGB to XYZ (D65)
    const x = 0.4124564 * r + 0.3575761 * g + 0.1804375 * b;
    const y = 0.2126729 * r + 0.7151522 * g + 0.0721750 * b;
    const z = 0.0193339 * r + 0.1191920 * g + 0.9503041 * b;
    
    // Convert XYZ to OKLab
    const l_ = 0.8189330101 * x + 0.3618667424 * y - 0.1288597137 * z;
    const m_ = 0.0329845436 * x + 0.9293118715 * y + 0.0361456387 * z;
    const s_ = 0.0482003018 * x + 0.2643662691 * y + 0.6338517070 * z;
    
    const l__ = Math.cbrt(l_);
    const m__ = Math.cbrt(m_);
    const s__ = Math.cbrt(s_);
    
    const okL = 0.2104542553 * l__ + 0.7936177850 * m__ - 0.0040720468 * s__;
    const okA = 1.9779984951 * l__ - 2.4285922050 * m__ + 0.4505937099 * s__;
    const okB = 0.0259040371 * l__ + 0.7827717662 * m__ - 0.8086757660 * s__;
    
    // Convert OKLab to OKLCH
    const okC = Math.sqrt(okA * okA + okB * okB);
    let okH = Math.atan2(okB, okA) * 180 / Math.PI;
    if (okH < 0) okH += 360;
    
    return { 
      l: okL * 100,        // Scale to 0-100
      c: okC / 0.4 * 100,  // Scale raw 0-0.4 → 0-100 display range (matches node.oklchC convention)
      h: okH               // 0-360 degrees
    };
  };

  const oklchToHslRaw = (l: number, c: number, h: number) => {
    // Convert OKLCH to OKLab
    const okL = l / 100;  // Scale back to 0-1
    const rawC = c / 100 * 0.4;  // Scale from 0-100 display → raw 0-0.4
    const okA = rawC * Math.cos(h * Math.PI / 180);
    const okB = rawC * Math.sin(h * Math.PI / 180);
    
    // Convert OKLab to XYZ
    const l_ = okL + 0.3963377774 * okA + 0.2158037573 * okB;
    const m_ = okL - 0.1055613458 * okA - 0.0638541728 * okB;
    const s_ = okL - 0.0894841775 * okA - 1.2914855480 * okB;
    
    const l__ = l_ * l_ * l_;
    const m__ = m_ * m_ * m_;
    const s__ = s_ * s_ * s_;
    
    const x = +4.0767416621 * l__ - 3.3077115913 * m__ + 0.2309699292 * s__;
    const y = -1.2684380046 * l__ + 2.6097574011 * m__ - 0.3413193965 * s__;
    const z = -0.0041960863 * l__ - 0.7034186147 * m__ + 1.7076147010 * s__;
    
    // Convert XYZ to linear RGB
    const r =  3.2404542 * x - 1.5371385 * y - 0.4985314 * z;
    const g = -0.9692660 * x + 1.8760108 * y + 0.0415560 * z;
    const b =  0.0556434 * x - 0.2040259 * y + 1.0572252 * z;
    
    // Convert linear RGB to sRGB
    const fromLinear = (c: number) => {
      const val = Math.max(0, Math.min(1, c));
      return val <= 0.0031308 ? val * 12.92 : 1.055 * Math.pow(val, 1 / 2.4) - 0.055;
    };
    
    const rSrgb = Math.round(fromLinear(r) * 255);
    const gSrgb = Math.round(fromLinear(g) * 255);
    const bSrgb = Math.round(fromLinear(b) * 255);
    
    // Convert RGB to HSL
    const hsl = rgbToHsl(rSrgb, gSrgb, bSrgb);
    return hsl;
  };



  // Helper to update color values (pass color properties directly - App.tsx handles theme overrides)
  const updateColorValue = (updates: Partial<ColorNode>) => {
    onUpdateNode(node.id, updates);
  };

  const handleHueChange = (value: number) => {
    onSelect();
    updateColorValue({ hue: Math.max(0, Math.min(360, value)) });
  };

  const handleSaturationChange = (value: number) => {
    onSelect();
    updateColorValue({ saturation: Math.max(0, Math.min(100, value)) });
  };

  const handleLightnessChange = (value: number) => {
    onSelect();
    updateColorValue({ lightness: Math.max(0, Math.min(100, value)) });
  };

  const handleAlphaChange = (value: number) => {
    onSelect();
    updateColorValue({ alpha: Math.max(0, Math.min(100, value)) });
  };

  // RGB handlers
  const handleRedChange = (value: number) => {
    onSelect();
    updateColorValue({ red: Math.round(Math.max(0, Math.min(255, value))) });
  };

  const handleGreenChange = (value: number) => {
    onSelect();
    updateColorValue({ green: Math.round(Math.max(0, Math.min(255, value))) });
  };

  const handleBlueChange = (value: number) => {
    onSelect();
    updateColorValue({ blue: Math.round(Math.max(0, Math.min(255, value))) });
  };

  // OKLCH handlers
  const handleOklchLChange = (value: number) => {
    onSelect();
    updateColorValue({ oklchL: Math.max(0, Math.min(100, value)) });
  };

  const handleOklchCChange = (value: number) => {
    onSelect();
    updateColorValue({ oklchC: Math.max(0, Math.min(100, value)) });
  };

  const handleOklchHChange = (value: number) => {
    onSelect();
    updateColorValue({ oklchH: Math.max(0, Math.min(360, value)) });
  };

  // HCT handlers
  const handleHctHChange = (value: number) => {
    onSelect();
    updateColorValue({ hctH: Math.max(0, Math.min(360, value)), hexValue: undefined });
  };

  const handleHctCChange = (value: number) => {
    onSelect();
    updateColorValue({ hctC: Math.max(0, Math.min(120, value)), hexValue: undefined });
  };

  const handleHctTChange = (value: number) => {
    onSelect();
    updateColorValue({ hctT: Math.max(0, Math.min(100, value)), hexValue: undefined });
  };

  // Lock/Diff toggle handlers
  const toggleLock = (property: 'Hue' | 'Saturation' | 'Lightness' | 'Alpha' | 'Red' | 'Green' | 'Blue' | 'OklchL' | 'OklchC' | 'OklchH' | 'HctH' | 'HctC' | 'HctT') => {
    onSelect();
    const lockKey = `lock${property}` as keyof ColorNode;
    onUpdateNode(node.id, { [lockKey]: !node[lockKey] });
  };

  const toggleDiff = (property: 'Hue' | 'Saturation' | 'Lightness' | 'Alpha' | 'Red' | 'Green' | 'Blue' | 'OklchL' | 'OklchC' | 'OklchH' | 'HctH' | 'HctC' | 'HctT') => {
    onSelect();
    const diffKey = `diff${property}` as keyof ColorNode;
    // Default is true (diff enabled), so toggle to false and back
    onUpdateNode(node.id, { [diffKey]: node[diffKey] === false ? true : false });
  };

  // ── Pre-computed diff props for each channel ───────────────────────
  // Spread these into <PropertyControls> to show the offset input.
  const dp = {
    hue:        getDiffProps(effectiveColors.hue, parentEffective?.hue, 0, 360, handleHueChange, true),
    saturation: getDiffProps(effectiveColors.saturation, parentEffective?.saturation, 0, 100, handleSaturationChange),
    lightness:  getDiffProps(effectiveColors.lightness, parentEffective?.lightness, 0, 100, handleLightnessChange),
    alpha:      getDiffProps(effectiveColors.alpha ?? 100, parentEffective?.alpha, 0, 100, handleAlphaChange),
    red:        getDiffProps(effectiveColors.red || 0, parentEffective?.red, 0, 255, handleRedChange),
    green:      getDiffProps(effectiveColors.green || 0, parentEffective?.green, 0, 255, handleGreenChange),
    blue:       getDiffProps(effectiveColors.blue || 0, parentEffective?.blue, 0, 255, handleBlueChange),
    oklchL:     getDiffProps(effectiveColors.oklchL || 0, parentEffective?.oklchL, 0, 100, handleOklchLChange),
    oklchC:     getDiffProps(effectiveColors.oklchC || 0, parentEffective?.oklchC, 0, 100, handleOklchCChange, false, 2),
    oklchH:     getDiffProps(effectiveColors.oklchH || 0, parentEffective?.oklchH, 0, 360, handleOklchHChange, true),
    hctH:       getDiffProps(effectiveColors.hctH || 0, parentEffective?.hctH, 0, 360, handleHctHChange, true),
    hctC:       getDiffProps(effectiveColors.hctC || 0, parentEffective?.hctC, 0, 120, handleHctCChange),
    hctT:       getDiffProps(effectiveColors.hctT || 0, parentEffective?.hctT, 0, 100, handleHctTChange),
  };

  const handleHexInputChange = (value: string) => {
    // Store the raw input value - always allow editing
    setHexInputValue(value);
    
    // For OKLCH nodes, try to parse oklch() format live
    if (node.colorSpace === 'oklch') {
      const oklchMatch = value.match(/^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+))?\s*\)$/i);
      if (oklchMatch) {
        const L = parseFloat(oklchMatch[1]);
        const C = parseFloat(oklchMatch[2]);
        const H = parseFloat(oklchMatch[3]);
        const newOklchL = Math.max(0, Math.min(100, L * 100));
        const newOklchC = Math.max(0, Math.min(100, (C / 0.4) * 100));
        const newOklchH = ((H % 360) + 360) % 360;
        const updates: Record<string, number> = { oklchL: newOklchL, oklchC: newOklchC, oklchH: newOklchH };
        if (oklchMatch[4] !== undefined) {
          updates.alpha = Math.max(0, Math.min(100, parseFloat(oklchMatch[4]) * 100));
        }
        onUpdateNode(node.id, updates);
      }
      return;
    }
    
    // Only validate and update node color if we have a complete hex value
    // This allows free typing/deleting without interference
    const cleanHex = value.replace('#', '');
    
    // Validate hex - support both 6-char (RGB) and 8-char (RGBA) formats
    const is6Char = /^[0-9A-Fa-f]{6}$/.test(cleanHex);
    const is8Char = /^[0-9A-Fa-f]{8}$/.test(cleanHex);
    
    // Only update the node when we have a complete valid hex
    if (!is6Char && !is8Char) return;
    
    // Convert hex to RGB
    const r255 = parseInt(cleanHex.substring(0, 2), 16);
    const g255 = parseInt(cleanHex.substring(2, 4), 16);
    const b255 = parseInt(cleanHex.substring(4, 6), 16);
    
    const r = r255 / 255;
    const g = g255 / 255;
    const b = b255 / 255;
    
    // Parse alpha from 8-char hex if present
    let alpha = 100;
    if (is8Char) {
      const alphaHex = parseInt(cleanHex.substring(6, 8), 16);
      alpha = Math.round((alphaHex / 255) * 100);
    }
    
    // Update based on colorSpace
    if (node.colorSpace === 'rgb') {
      onUpdateNode(node.id, {
        red: r255,
        green: g255,
        blue: b255,
        alpha: alpha,
      });
    } else if (node.colorSpace === 'hex') {
      // For hex nodes, store the hex value directly and also convert to HSL for consistency
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      let h = 0, s = 0, l = (max + min) / 2;
      
      if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        
        switch (max) {
          case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
          case g: h = ((b - r) / d + 2) / 6; break;
          case b: h = ((r - g) / d + 4) / 6; break;
        }
      }
      
      onUpdateNode(node.id, {
        hexValue: value.startsWith('#') ? value.toUpperCase() : `#${value.toUpperCase()}`,
        hue: Math.round(h * 360 * 100) / 100,
        saturation: Math.round(s * 100 * 100) / 100,
        lightness: Math.round(l * 100 * 100) / 100,
        alpha: alpha,
      });
    } else {
      // Convert RGB to HSL for HSL and OKLCH nodes
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      let h = 0, s = 0, l = (max + min) / 2;
      
      if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        
        switch (max) {
          case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
          case g: h = ((b - r) / d + 2) / 6; break;
          case b: h = ((r - g) / d + 4) / 6; break;
        }
      }
      
      if (node.colorSpace === 'oklch') {
        // For OKLCH, convert HSL to OKLCH
        const oklch = hslToOklchRaw(h * 360, s * 100, l * 100);
        onUpdateNode(node.id, {
          oklchL: oklch.l,
          oklchC: oklch.c,
          oklchH: oklch.h,
          alpha: alpha,
        });
      } else if (node.colorSpace === 'hct') {
        // For HCT, convert RGB to HCT and store hex value for precision
        const hct = rgbToHct(r255, g255, b255);
        onUpdateNode(node.id, {
          hexValue: value.startsWith('#') ? value.toUpperCase() : `#${value.toUpperCase()}`,
          hctH: hct.h,
          hctC: hct.c,
          hctT: hct.t,
          alpha: alpha,
        });
      } else {
        // HSL - store hex value for precision and update HSL with decimal precision
        onUpdateNode(node.id, {
          hexValue: value.startsWith('#') ? value.toUpperCase() : `#${value.toUpperCase()}`,
          hue: Math.round(h * 360 * 100) / 100,
          saturation: Math.round(s * 100 * 100) / 100,
          lightness: Math.round(l * 100 * 100) / 100,
          alpha: alpha,
        });
      }
    }
  };

  const handleCopyHex = useCallback(() => {
    copyTextToClipboard(displayColorValue);
    setCopiedHex(true);
    setTimeout(() => setCopiedHex(false), 1200);
  }, [displayColorValue]);

  const handleHexFocus = () => {
    onSelect();
    setIsEditingHex(true);
    // Initialize with current displayed value when starting to edit
    setHexInputValue(displayColorValue);
  };

  const handleHexBlur = () => {
    setIsEditingHex(false);
    if (node.colorSpace === 'oklch') {
      // For OKLCH, validate oklch() format or reset
      const oklchMatch = hexInputValue.match(/^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+))?\s*\)$/i);
      if (oklchMatch) {
        const L = parseFloat(oklchMatch[1]);
        const C = parseFloat(oklchMatch[2]);
        const H = parseFloat(oklchMatch[3]);
        // Convert back to node's internal scale: L * 100, C / 0.4 * 100
        const newOklchL = Math.max(0, Math.min(100, L * 100));
        const newOklchC = Math.max(0, Math.min(100, (C / 0.4) * 100));
        const newOklchH = ((H % 360) + 360) % 360;
        const updates: Record<string, number> = { oklchL: newOklchL, oklchC: newOklchC, oklchH: newOklchH };
        if (oklchMatch[4] !== undefined) {
          updates.alpha = Math.max(0, Math.min(100, parseFloat(oklchMatch[4]) * 100));
        }
        onUpdateNode(node.id, updates);
      } else {
        setHexInputValue(displayColorValue);
      }
    } else {
      // Validate and reset to current hex if invalid (must be 6 or 8 characters)
      const cleanHex = hexInputValue.replace('#', '');
      const isValid = /^[0-9A-Fa-f]{6}$/.test(cleanHex) || /^[0-9A-Fa-f]{8}$/.test(cleanHex);
      if (!isValid) {
        setHexInputValue(displayColorValue);
      }
    }
  };

  const handleHexKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Stop propagation of Delete and Backspace to prevent node deletion while editing
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.stopPropagation();
    }
    
    // Allow Cmd+A / Ctrl+A to select all
    if ((e.metaKey || e.ctrlKey) && (e.key === 'a' || e.key === 'A')) {
      e.stopPropagation();
      // Manually select all text in whichever input is focused
      setTimeout(() => {
        const activeEl = document.activeElement as HTMLInputElement;
        activeEl?.select();
      }, 0);
      return;
    }
  };

  // Get available parent options (exclude self and descendants)
  const getAvailableParents = () => {
    const descendants = new Set<string>();
    
    const findDescendants = (parentId: string) => {
      nodes.forEach((n) => {
        if (n.parentId === parentId) {
          descendants.add(n.id);
          findDescendants(n.id);
        }
      });
    };
    
    findDescendants(node.id);
    
    return nodes.filter((n) => n.id !== node.id && !descendants.has(n.id));
  };

  const availableParents = getAvailableParents();
  const isConnected = node.parentId !== null;

  // For the left connection button: locked if this node OR its parent is inherited
  const isLeftConnectionLocked = isStructurallyLocked || (
    isConnected && !!node.parentId && (() => {
      const parent = nodes.find(n => n.id === node.parentId);
      return parent ? isNodeInheritedOnTheme(parent) : false;
    })()
  );

  const handleSwitchChange = (checked: boolean) => {
    if (!checked) {
      // Disconnect from parent
      onUnlink(node.id);
    }
    // If checked but no parent, the select will handle connection
  };

  // ─── Auto-assign token delete handlers ─────────────────────────
  // When a user clicks trash on an auto-assigned token, show confirmation instead of
  // immediately unassigning. The dialog warns the token will be deleted from the
  // token panel and offers a "Don't auto-assign token for this node" checkbox.
  const handleTokenRemoveClick = (tokenId: string) => {
    // Check if this token is an auto-assigned token for this node
    // Only treat as auto-assigned if the parent still has autoAssignEnabled ON
    const parentNode = node.parentId ? nodes.find(n => n.id === node.parentId) : null;
    const parentAutoAssignActive = !!parentNode?.autoAssignEnabled;
    if (parentAutoAssignActive && node.autoAssignedTokenId === tokenId) {
      if (isPrimaryTheme) {
        // Primary theme: show confirmation dialog (deletes token from panel)
        const token = tokens.find(t => t.id === tokenId);
        setAutoAssignDeleteDialog({
          open: true,
          tokenId,
          tokenName: token?.name || 'Unknown',
          excludeFromAutoAssign: false,
        });
      } else {
        // Non-primary theme: treat like a normal token — just unassign from this node/theme.
        // The token remains in the token panel; only the theme-specific assignment is removed.
        onAssignToken(node.id, tokenId, false);
      }
    } else {
      // Not an auto-assigned token — just unassign immediately
      onAssignToken(node.id, tokenId, false);
    }
  };

  const confirmAutoAssignTokenDelete = () => {
    const { tokenId, excludeFromAutoAssign } = autoAssignDeleteDialog;
    // Delete the token from the token panel (this also clears autoAssignedTokenId
    // and unassigns from all nodes via App.tsx deleteToken)
    onDeleteToken(tokenId);
    // If checkbox was checked, exclude this node from future auto-assign
    if (excludeFromAutoAssign) {
      onUpdateNode(node.id, { autoAssignExcluded: true });
    }
    setAutoAssignDeleteDialog(prev => ({ ...prev, open: false }));
  };

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onSelect();
    setIsResizing(true);
    resizeStartRef.current = {
      width: nodeWidth,
      mouseX: e.clientX,
    };
  };

  // Effect to handle resize event listeners
  useEffect(() => {
    if (!isResizing) return;

    const handleResizeMouseMove = (e: MouseEvent) => {
      if (!resizeStartRef.current) return;
      
      const deltaX = e.clientX - resizeStartRef.current.mouseX;
      const newWidth = Math.max(minWidth, resizeStartRef.current.width + deltaX);
      
      onUpdateNode(node.id, { width: newWidth });
    };

    const handleResizeMouseUp = () => {
      setIsResizing(false);
      resizeStartRef.current = null;
    };

    document.addEventListener('mousemove', handleResizeMouseMove);
    document.addEventListener('mouseup', handleResizeMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleResizeMouseMove);
      document.removeEventListener('mouseup', handleResizeMouseUp);
    };
  }, [isResizing, node.id, onUpdateNode, minWidth]);

  // Effect to handle wire drag threshold
  useEffect(() => {
    if (!wireButtonPressed) return;

    const DRAG_THRESHOLD = 5; // pixels
    let hasDragStarted = false;

    const handleMouseMove = (e: MouseEvent) => {
      if (!wireButtonPressed || hasDragStarted) return;

      const deltaX = e.clientX - wireButtonPressed.startX;
      const deltaY = e.clientY - wireButtonPressed.startY;
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

      if (distance > DRAG_THRESHOLD) {
        // Threshold exceeded - start wire drag
        hasDragStarted = true;
        onWireDragStart(node.id, wireButtonPressed.buttonType);
        setWireButtonPressed(null);
      }
    };

    const handleMouseUp = () => {
      // Mouse released before threshold - treat as click (do nothing here, onClick will handle it)
      setWireButtonPressed(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [wireButtonPressed, node.id, onWireDragStart]);

  // Prevent canvas zoom when token dropdown is open
  useEffect(() => {
    if (tokenComboOpenIndex === null) {
      // Remove the data attribute when closed
      document.body.removeAttribute('data-dropdown-open');
      return;
    }

    // Set a data attribute on body to indicate a dropdown is open
    document.body.setAttribute('data-dropdown-open', 'true');

    const handleWheel = (e: WheelEvent) => {
      // Check if the wheel event is inside a popover/dropdown
      const target = e.target as HTMLElement;
      const isInsidePopover = target.closest('[role="dialog"]') || 
                             target.closest('[data-radix-popper-content-wrapper]') ||
                             target.closest('[data-slot="command-list"]');
      
      // Only prevent canvas zoom if NOT scrolling inside a popover
      if (!isInsidePopover) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    // Add listener to window with capture phase to intercept before canvas handlers
    window.addEventListener('wheel', handleWheel, { passive: false, capture: true });
    
    return () => {
      window.removeEventListener('wheel', handleWheel, { capture: true });
      document.body.removeAttribute('data-dropdown-open');
    };
  }, [tokenComboOpenIndex]);

  // Clean up reassign hover timeout on unmount
  useEffect(() => {
    return () => {
      if (reassignHoverTimeoutRef.current) clearTimeout(reassignHoverTimeoutRef.current);
    };
  }, []);

  // Clear reassign popover when token combo closes
  useEffect(() => {
    if (tokenComboOpenIndex === null) {
      setReassignPopover(null);
      if (reassignHoverTimeoutRef.current) clearTimeout(reassignHoverTimeoutRef.current);
    }
  }, [tokenComboOpenIndex]);

  // ── Palette Shade: compact modern card ──────────────────────────────
  if (isPaletteShade) {
    // Check if this shade has children (to show connection indicator)
    const shadeChildren = nodes.filter(n => n.parentId === node.id);
    const hasChildren = shadeChildren.length > 0;
    
    // Check if parent palette node is inherited (linked to primary in non-primary theme)
    const isParentPaletteInherited = !isPrimaryTheme && parentNode?.isPalette && (!parentNode.themeOverrides || !parentNode.themeOverrides[activeThemeId]);
    const shadeInheritedOpacity: React.CSSProperties | undefined = isParentPaletteInherited
      ? { opacity: showAllVisible ? 1 : 0.45 }
      : undefined;
    
    return (
      <div className="relative transition-opacity" style={shadeInheritedOpacity} data-node-card>
        {/* Left connection ellipse (gray) — always interactive for wire connections */}
        <div className="absolute -left-[5px] top-1/2 -translate-y-1/2 z-20" style={{ pointerEvents: 'auto' }}>
          <div
            className={`w-[8px] h-[8px] rounded-full ${
              isDraggingWire && wireStartButtonType === 'right' ? 'bg-success' : 'bg-dim'
            }`}
            title="Connected to palette"
            data-node-id={node.id}
            data-button-type="left-connect"
            onMouseEnter={() => {
              if (isDraggingWire && wireStartButtonType === 'right' && !isStructurallyLocked) {
                onWireHoverStart(node.id);
              }
            }}
            onMouseLeave={() => onWireHoverEnd()}
          />
        </div>

        {/* Right connection: + button — always interactive for wire connections */}
        {(
          <div className="absolute -right-[13px] top-1/2 -translate-y-1/2 z-20" style={{ pointerEvents: 'auto' }}>
            <button
              onMouseDown={(e) => {
                e.stopPropagation();
                // Block wire drag start if this node is inherited on non-primary theme
                if (isStructurallyLocked) return;
                setWireButtonPressed({
                  buttonType: 'right',
                  startX: e.clientX,
                  startY: e.clientY,
                });
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (isStructurallyLocked) return;
                onAddChild(node.id);
              }}
              className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors shadow-md ${
                isStructurallyLocked
                  ? 'bg-[#222] cursor-not-allowed'
                  : isWireHovered && wireStartButtonType === 'left' ? 'bg-success' : 'bg-border hover:bg-border'
              }`}
              title={isStructurallyLocked ? "Inherited from primary — unlink from primary to modify" : "Add child node or drag to connect"}
              data-node-id={node.id}
              data-button-type="right-connect"
            >
              <Plus className={`w-3 h-3 ${isStructurallyLocked ? 'text-dim' : isWireHovered && wireStartButtonType === 'left' ? 'text-white' : 'text-foreground'}`} />
            </button>
          </div>
        )}

        {/* Card body */}
        <div
          className="rounded-[12px] flex items-center justify-between px-3 relative cursor-move select-none"
          style={{
            backgroundColor: hslColor,
            border: isSelected
              ? '2px solid var(--brand)'
              : isMultiSelected
              ? '2px solid #7B8FFF'
              : '2px solid transparent',
            width: `${nodeWidth}px`,
            height: '44px',
          }}
          onMouseDown={onMouseDown}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(e);
          }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            onDoubleClick();
          }}
        >
          <span
            className="font-mono text-xs tracking-wide"
            style={{
              color: isLightBackground ? 'rgba(0,0,0,0.75)' : 'rgba(255,255,255,0.9)',
              textShadow: isLightBackground
                ? '0 1px 2px rgba(255,255,255,0.3)'
                : '0 1px 2px rgba(0,0,0,0.4)',
            }}
          >
            {displayColorValue !== hexColor ? displayColorValue : hexColor.toUpperCase()}
          </span>
          {(() => {
            const shadeTokenIds = getNodeTokenIds(node);
            const shadeToken = shadeTokenIds.length > 0 ? tokens.find(t => t.id === shadeTokenIds[0]) : null;
            if (!shadeToken) return null;
            return (
              <span
                className="text-xs truncate ml-2"
                style={{
                  color: isLightBackground ? 'rgba(0,0,0,0.75)' : 'rgba(255,255,255,0.9)',
                  textShadow: isLightBackground
                    ? '0 1px 2px rgba(255,255,255,0.3)'
                    : '0 1px 3px rgba(0,0,0,0.6)',
                }}
              >
                {shadeToken.name}
              </span>
            );
          })()}
        </div>
      </div>
    );
  }

  return (
    <div className="relative" data-node-card>
      {/* Left side + button for parent connection — always interactive for wire connections */}
      {!isPaletteShade && (
        <div 
          className="absolute -left-3 top-1/2 -translate-y-1/2 z-20"
          style={{ pointerEvents: 'auto' }}
          onMouseEnter={() => {
            if (isDraggingWire && wireStartButtonType === 'right' && !isLeftConnectionLocked) {
              onWireHoverStart(node.id);
            }
          }}
          onMouseLeave={() => onWireHoverEnd()}
        >
          <button
            onMouseDown={(e) => {
              e.stopPropagation();
              // Block wire drag start if either this node or its parent is inherited
              if (isLeftConnectionLocked) return;
              setWireButtonPressed({
                buttonType: 'left',
                startX: e.clientX,
                startY: e.clientY,
              });
            }}
            onClick={(e) => {
              e.stopPropagation();
              // Shift+click on left + when multi-selected: unlink ALL selected nodes from their parents
              if (e.shiftKey && isMultiSelected && selectedNodeIds.length > 1) {
                let unlinkedCount = 0;
                for (const nid of selectedNodeIds) {
                  const n = nodes.find(nd => nd.id === nid);
                  if (n?.parentId) {
                    onUnlink(nid);
                    unlinkedCount++;
                  }
                }
                if (unlinkedCount > 0) {
                  setShowParentSelector(false);
                }
                return;
              }
              if (isConnected) {
                // On non-primary themes, block unlink if either node is inherited
                if (isLeftConnectionLocked) return;
                onUnlink(node.id);
                setShowParentSelector(false);
              } else {
                // Block connect-via-popup if this node is inherited
                if (isStructurallyLocked) return;
                onAddParent(node.id);
              }
            }}
            className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors shadow-md ${
              isLeftConnectionLocked
                ? 'bg-[#222] cursor-not-allowed'
                : isWireHovered && wireStartButtonType === 'right' ? 'bg-success' : 'bg-border hover:bg-border'
            }`}
            title={isLeftConnectionLocked ? "Inherited from primary — unlink from primary to modify" : isConnected ? (isMultiSelected ? "Disconnect from parent (Shift+click to unlink all selected)" : "Disconnect from parent") : "Add new parent or drag to connect"}
            data-node-id={node.id}
            data-button-type="left-connect"
          >
            <Plus className={`w-3 h-3 ${isLeftConnectionLocked ? 'text-dim' : isWireHovered && wireStartButtonType === 'right' ? 'text-white' : 'text-foreground'}`} />
          </button>
          
          {/* Parent selection popup */}
          {showParentSelector && !isConnected && availableParents.length > 0 && (
            <div className="absolute left-8 top-0 bg-white border border-gray-200 rounded-lg shadow-lg p-2 min-w-[120px] z-30">
              <div className="text-xs mb-1 px-2 py-1">Select parent:</div>
              {availableParents.map((parent) => (
                <button
                  key={parent.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    onLink(node.id, parent.id);
                    setShowParentSelector(false);
                  }}
                  className="w-full text-left px-2 py-1 text-sm hover:bg-gray-100 rounded flex items-center gap-2"
                >
                  <div
                    className="w-4 h-4 rounded border border-gray-300"
                    style={{ backgroundColor: `hsl(${parent.hue}, ${parent.saturation}%, ${parent.lightness}%)` }}
                  />
                  {hslToHex(parent.hue, parent.saturation, parent.lightness)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Palette shade link connection indicator */}
      {isPaletteShade && (
        <div 
          className="absolute -left-[5px] top-1/2 -translate-y-1/2 z-20"
        >
          <div
            className="w-[10px] h-[10px] rounded-full bg-brand flex items-center justify-center"
            title="Connected to palette"
            data-node-id={node.id}
            data-button-type="left-connect"
          />
        </div>
      )}

      {/* Right side top + button for adding child — always interactive for wire connections */}
      {(
        <div
          className="absolute -right-3 top-6 z-20 flex flex-col gap-1"
          style={{ pointerEvents: 'auto' }}
          onMouseEnter={() => {
            if (isDraggingWire && wireStartButtonType === 'left' && !isStructurallyLocked) {
              onWireHoverStart(node.id);
            }
          }}
          onMouseLeave={() => onWireHoverEnd()}
        >
          {!node.isPalette && (
            <button
              onMouseDown={(e) => {
                e.stopPropagation();
                // Block wire drag start if this node is inherited on non-primary theme
                if (isStructurallyLocked) return;
                setWireButtonPressed({
                  buttonType: 'right',
                  startX: e.clientX,
                  startY: e.clientY,
                });
              }}
              onClick={(e) => {
                e.stopPropagation();
                // addChildNode already blocks on non-primary themes
                if (isStructurallyLocked) return;
                onAddChild(node.id);
              }}
              className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors shadow-md ${
                isStructurallyLocked
                  ? 'bg-[#222] cursor-not-allowed'
                  : isWireHovered && wireStartButtonType === 'left' ? 'bg-success' : 'bg-border hover:bg-border'
              }`}
              title={isStructurallyLocked ? "Inherited from primary — unlink from primary to modify" : "Add child node or drag to connect"}
              data-node-id={node.id}
              data-button-type="right-connect"
            >
              <Plus className={`w-3 h-3 ${isStructurallyLocked ? 'text-dim' : isWireHovered && wireStartButtonType === 'left' ? 'text-white' : 'text-foreground'}`} />
            </button>
          )}

          {/* Palette-specific: + button to increase shade count */}
          {node.isPalette && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (isColorInputDisabled) return;
                const currentShadeCount = node.paletteShadeCount || 10;
                if (currentShadeCount < 20) {
                  onUpdateNode(node.id, { paletteShadeCount: currentShadeCount + 1 });
                }
              }}
              disabled={(node.paletteShadeCount || 10) >= 20 || isColorInputDisabled}
              className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors shadow-md ${
                isColorInputDisabled
                  ? 'bg-[#222] cursor-not-allowed'
                  : (node.paletteShadeCount || 10) >= 20 
                  ? 'bg-dim cursor-not-allowed opacity-50'
                  : 'bg-border hover:bg-border'
              }`}
              title={isColorInputDisabled ? "Inherited from primary — unlink to modify" : (node.paletteShadeCount || 10) >= 20 ? "Maximum shades reached (20)" : "Increase shade count"}
            >
              <Plus className={`w-3 h-3 ${isColorInputDisabled ? 'text-dim' : (node.paletteShadeCount || 10) >= 20 ? 'text-white' : 'text-foreground'}`} />
            </button>
          )}
        </div>
      )}



      {/* Connection port indicator on right top */}
      {(
        <div
          className="absolute -right-[5px] top-6 z-10 w-[10px] h-[10px] rounded-full bg-brand"
        />
      )}

    <Collapsible open={isColorInputDisabled ? false : isExpanded} onOpenChange={(expanded) => {
      if (isColorInputDisabled) return;
      setIsExpanded(expanded);
      onUpdateNode(node.id, { isExpanded: expanded });
    }}>
    {/* Inheritance Toggle Bar for Non-Primary Themes — flow-based bar above the card */}
    {showInheritanceIcon && !isPrimaryTheme && (
      <div
        className="w-full z-20 flex items-center gap-2 px-2.5 py-1.5 rounded-[20px] transition-opacity duration-200 mb-1"
        style={{ backgroundColor: '#0E0E0E', ...(barDimOpacity !== undefined ? { opacity: barDimOpacity } : {}) }}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onMouseEnter={() => { if (colorNeedsHover) setHoveredSection('color'); }}
        onMouseLeave={() => { if (hoveredSection === 'color') setHoveredSection(null); }}
      >
          <Crown 
            className={`h-3 w-3 shrink-0 transition-all ${
              isLinkedToPrimary() 
                ? 'text-warning fill-warning'
                : hasColorBeenModified
                  ? 'text-brand fill-brand'
                  : 'text-dim fill-none'
            }`}
          />
          <Switch
            checked={isLinkedToPrimary()}
            onCheckedChange={() => handleToggleLinkToPrimary()}
            className="data-[state=checked]:bg-[#EFB100] data-[state=unchecked]:bg-border dark:data-[state=unchecked]:bg-border h-[16px] w-[30px] shrink-0"
          />
          <span className={`text-[11px] select-none transition-colors ${
            isLinkedToPrimary() ? 'text-subtle' : hasColorBeenModified ? 'text-subtle' : 'text-faint'
          }`}>
            {isLinkedToPrimary() 
              ? 'Node is inherited' 
              : hasColorBeenModified 
                ? 'Node is modified'
                : 'Node is not-inherited'}
          </span>
        </div>
      )}
    <Card 
      className="overflow-visible cursor-default relative rounded-[20px]"
      style={{ 
        backgroundColor: '#0e0e0e',
        border: isSelected ? '1px solid var(--brand)' : isMultiSelected ? '1px solid #7B8FFF' : '1px solid transparent',
        width: `${nodeWidth}px`,
        maxWidth: `${nodeWidth}px`,
        minWidth: `${nodeWidth}px`
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onMouseDown={(e) => {
        e.stopPropagation();
      }}
      onClick={(e) => {
        const target = e.target as HTMLElement;
        const isInteractive = target.tagName === 'INPUT' || 
                             target.tagName === 'BUTTON' || 
                             target.closest('button') ||
                             target.closest('input');
        
        if (!isInteractive) {
          onSelect(e);
        }
      }}
      onDoubleClick={(e) => {
        const target = e.target as HTMLElement;
        const isInteractive = target.tagName === 'INPUT' || 
                             target.tagName === 'BUTTON' || 
                             target.closest('button') ||
                             target.closest('input');
        if (!isInteractive) {
          onDoubleClick();
        }
      }}
    >
      {/* Color Preview */}
      <div
        className={`h-24 flex items-center justify-center relative rounded-tl-[19px] rounded-tr-[19px] ${isColorSectionDimmed ? 'transition-opacity duration-200' : ''} ${isExpanded ? '' : 'mb-3'}`}
        style={{ backgroundColor: hslColor, ...(colorDimOpacity !== undefined ? { opacity: colorDimOpacity } : {}) }}
        onMouseEnter={() => { if (colorNeedsHover) setHoveredSection('color'); }}
        onMouseLeave={() => { if (hoveredSection === 'color') setHoveredSection(null); }}
      >
        {/* Webhook Input Badge (Option B) — shown when Dev Mode is active */}
        {showDevMode && !isPaletteShade && (
          <button
            className={`absolute top-2 right-2 z-10 flex items-center gap-1 h-5 px-1.5 rounded-md text-[11px] font-medium transition-all cursor-pointer ${
              node.isWebhookInput
                ? 'bg-warning/90 text-black shadow-md shadow-warning/30'
                : 'bg-black/30 text-white/60 hover:bg-black/50 hover:text-white/90 backdrop-blur-sm'
            }`}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onToggleWebhookInput?.(node.id);
            }}
            onMouseDown={(e) => e.stopPropagation()}
            title={node.isWebhookInput ? 'Webhook input active — click to disable' : 'Mark as webhook input'}
          >
            <span className="text-[11px]">{node.isWebhookInput ? '\u26A1' : '\u{1F517}'}</span>
            {node.isWebhookInput && <span>Webhook</span>}
          </button>
        )}

        {/* Drag handle — only for palette shade nodes (regular nodes use name-based drag) */}
        {isPaletteShade && (
          <div
            className={`cursor-move absolute top-2 -left-[22px] text-muted-foreground hover:text-foreground transition-all ${
              isHovered ? 'opacity-100' : 'opacity-0'
            }`}
            onMouseDown={onMouseDown}
            onClick={(e) => e.stopPropagation()}
            data-drag-handle="true"
            title="Drag to move"
          >
            <GripVertical className="h-5 w-5" />
          </div>
        )}

        {/* Visibility toggle */}
        {!isPaletteShade && onToggleVisibility && (
          <div
            className={`absolute top-2 -left-[22px] transition-all cursor-pointer ${
              isNodeHidden
                ? 'opacity-100 text-brand'
                : isHovered
                  ? 'opacity-100 text-muted-foreground hover:text-foreground'
                  : 'opacity-0'
            }`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleVisibility();
            }}
            title={isNodeHidden ? 'Show node' : 'Hide node'}
          >
            {isNodeHidden ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
          </div>
        )}

        {/* Compact Lock/Diff Controls - Collapsed View */}
        {!isExpanded && node.parentId && !hasDifferentColorSpaceParent && node.colorSpace !== 'hex' && (() => {
          // Check if any property has lock or diff enabled
          const properties = node.colorSpace === 'hsl' 
            ? ['Hue', 'Saturation', 'Lightness', 'Alpha']
            : node.colorSpace === 'rgb'
            ? ['Red', 'Green', 'Blue', 'Alpha']
            : node.colorSpace === 'oklch'
            ? ['OklchL', 'OklchC', 'OklchH', 'Alpha']
            : ['HctH', 'HctC', 'HctT', 'Alpha'];
          
          const hasAnyLockOrDiff = properties.some(prop => 
            node[`lock${prop}` as keyof ColorNode] === true || node[`diff${prop}` as keyof ColorNode] === true
          );
          
          return hasAnyLockOrDiff;
        })() && (
          <div 
            className={`inline-flex w-fit h-fit absolute bottom-2 left-[16px] rounded-[8px] m-[0px] px-[4px] py-[2px] items-center justify-center ${isColorInputDisabled ? 'pointer-events-none opacity-40' : ''}`}
            style={{
              backgroundColor: (() => {
                // Calculate luminance to determine if node color is light or dark
                let r = 0, g = 0, b = 0;
                if (node.colorSpace === 'hsl') {
                  // Convert HSL to RGB for luminance calculation
                  const h = node.hue / 360;
                  const s = node.saturation / 100;
                  const l = node.lightness / 100;
                  const c = (1 - Math.abs(2 * l - 1)) * s;
                  const x = c * (1 - Math.abs((h * 6) % 2 - 1));
                  const m = l - c / 2;
                  let r1 = 0, g1 = 0, b1 = 0;
                  if (h < 1/6) { r1 = c; g1 = x; }
                  else if (h < 2/6) { r1 = x; g1 = c; }
                  else if (h < 3/6) { g1 = c; b1 = x; }
                  else if (h < 4/6) { g1 = x; b1 = c; }
                  else if (h < 5/6) { r1 = x; b1 = c; }
                  else { r1 = c; b1 = x; }
                  r = (r1 + m) * 255;
                  g = (g1 + m) * 255;
                  b = (b1 + m) * 255;
                } else if (node.colorSpace === 'rgb') {
                  r = node.red;
                  g = node.green;
                  b = node.blue;
                } else if (node.colorSpace === 'oklch') {
                  // For OKLCH, use lightness to determine
                  return node.oklchL > 50 ? 'rgba(0, 0, 0, 0.3)' : 'rgba(255, 255, 255, 0.3)';
                } else if (node.colorSpace === 'hct') {
                  // For HCT, use tone to determine
                  return node.hctT > 50 ? 'rgba(0, 0, 0, 0.3)' : 'rgba(255, 255, 255, 0.3)';
                }
                // Calculate relative luminance
                const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
                // If light color, use black background; if dark, use white
                return luminance > 0.5 ? 'rgba(0, 0, 0, 0.3)' : 'rgba(255, 255, 255, 0.3)';
              })(),
              color: (() => {
                // Calculate luminance to determine text color
                let r = 0, g = 0, b = 0;
                if (node.colorSpace === 'hsl') {
                  const h = node.hue / 360;
                  const s = node.saturation / 100;
                  const l = node.lightness / 100;
                  const c = (1 - Math.abs(2 * l - 1)) * s;
                  const x = c * (1 - Math.abs((h * 6) % 2 - 1));
                  const m = l - c / 2;
                  let r1 = 0, g1 = 0, b1 = 0;
                  if (h < 1/6) { r1 = c; g1 = x; }
                  else if (h < 2/6) { r1 = x; g1 = c; }
                  else if (h < 3/6) { g1 = c; b1 = x; }
                  else if (h < 4/6) { g1 = x; b1 = c; }
                  else if (h < 5/6) { r1 = x; b1 = c; }
                  else { r1 = c; b1 = x; }
                  r = (r1 + m) * 255;
                  g = (g1 + m) * 255;
                  b = (b1 + m) * 255;
                } else if (node.colorSpace === 'rgb') {
                  r = node.red;
                  g = node.green;
                  b = node.blue;
                } else if (node.colorSpace === 'oklch') {
                  // For OKLCH, if light bg use dark text, if dark bg use light text
                  return node.oklchL > 50 ? 'rgba(255, 255, 255, 0.9)' : 'rgba(0, 0, 0, 0.8)';
                } else if (node.colorSpace === 'hct') {
                  // For HCT, if light tone use dark text, if dark tone use light text
                  return node.hctT > 50 ? 'rgba(255, 255, 255, 0.9)' : 'rgba(0, 0, 0, 0.8)';
                }
                const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
                // If light node color (black bg), use white text; if dark node color (white bg), use black text
                return luminance > 0.5 ? 'rgba(255, 255, 255, 0.9)' : 'rgba(0, 0, 0, 0.8)';
              })()
            }}
          >
            <div className="inline-flex gap-0 items-center justify-center h-fit">
              {(() => {
                if (node.colorSpace === 'hsl') {
                  return [
                    { label: 'H', prop: 'Hue' as const, fullName: 'Hue' },
                    { label: 'S', prop: 'Saturation' as const, fullName: 'Saturation' },
                    { label: 'L', prop: 'Lightness' as const, fullName: 'Lightness' },
                    { label: 'A', prop: 'Alpha' as const, fullName: 'Alpha' },
                  ];
                } else if (node.colorSpace === 'rgb') {
                  return [
                    { label: 'R', prop: 'Red' as const, fullName: 'Red' },
                    { label: 'G', prop: 'Green' as const, fullName: 'Green' },
                    { label: 'B', prop: 'Blue' as const, fullName: 'Blue' },
                    { label: 'A', prop: 'Alpha' as const, fullName: 'Alpha' },
                  ];
                } else if (node.colorSpace === 'hct') {
                  return [
                    { label: 'H', prop: 'HctH' as const, fullName: 'Hue' },
                    { label: 'C', prop: 'HctC' as const, fullName: 'Chroma' },
                    { label: 'T', prop: 'HctT' as const, fullName: 'Tone' },
                    { label: 'A', prop: 'Alpha' as const, fullName: 'Alpha' },
                  ];
                } else {
                  return [
                    { label: 'L', prop: 'OklchL' as const, fullName: 'Lightness' },
                    { label: 'C', prop: 'OklchC' as const, fullName: 'Chroma' },
                    { label: 'H', prop: 'OklchH' as const, fullName: 'Hue' },
                    { label: 'A', prop: 'Alpha' as const, fullName: 'Alpha' },
                  ];
                }
              })().map(({ label, prop, fullName }, index, array) => {
                // Check if previous and next properties are selected
                const isSelected = (p: typeof prop) => 
                  node[`lock${p}` as keyof ColorNode] === true || node[`diff${p}` as keyof ColorNode] === true;
                
                const hasPrevSelected = index > 0 && isSelected(array[index - 1].prop);
                const hasNextSelected = index < array.length - 1 && isSelected(array[index + 1].prop);
                
                return (
                  <PropertyControl
                    key={label}
                    label={label}
                    prop={prop}
                    fullName={fullName}
                    node={node}
                    toggleLock={toggleLock}
                    toggleDiff={toggleDiff}
                    hasPrevSelected={hasPrevSelected}
                    hasNextSelected={hasNextSelected}
                  />
                );
              })}
            </div>
          </div>
        )}

        <div className="absolute bottom-2 right-2 flex items-center gap-1">
          {/* Only show color picker for non-HEX nodes and non-palette-shade nodes */}
          {node.colorSpace !== 'hex' && !isPaletteShade && (
          <Popover open={showColorPicker} onOpenChange={(open) => { if (!isColorInputDisabled) setShowColorPicker(open); }}>
            <PopoverTrigger asChild>
              <button
                ref={paletteButtonRef}
                className={`p-1 rounded transition-colors ${isColorInputDisabled ? 'opacity-30 cursor-not-allowed' : isLightBackground ? 'hover:bg-[#0a0a0a]/10' : 'hover:bg-white/20'}`}
                disabled={isColorInputDisabled}
                onClick={(e) => {
                  e.stopPropagation();
                  if (isColorInputDisabled) return;
                  onSelect();
                  if (!showColorPicker) {
                    calculatePopoverPosition();
                  }
                  setShowColorPicker(!showColorPicker);
                }}
              >
                <Palette 
                  className={`h-5 w-5 ${isLightBackground ? 'text-[#444444]/80' : 'text-white/80'}`}
                />
              </button>
            </PopoverTrigger>
            <PopoverContent 
              className="w-[268px] p-4 bg-secondary border-secondary"
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onOpenAutoFocus={(e) => e.preventDefault()}
              onCloseAutoFocus={(e) => e.preventDefault()}
              side={popoverSide}
              align="start"
              sideOffset={5}
            >
              <div className="space-y-3">
                {/* HSL Format */}
                {node.colorSpace === 'hsl' && (
                  <>
                    {!isChannelHidden('hue') && (<div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <PropertyControls
                          property="Hue"
                          isDiffEnabled={node.diffHue !== false}
                          isLocked={node.lockHue === true}
                          onToggleDiff={() => toggleDiff('Hue')}
                          onToggleLock={() => toggleLock('Hue')}
                          hasParent={node.parentId !== null}
                          hideControls={hasDifferentColorSpaceParent}
                          isAdvancedActive={isChannelAdvanced('hue')}
                          {...dp.hue}
                        />
                        <div className="flex items-center gap-1">
                          {isChannelAdvanced('hue') && (
                            <FxButton nodeId={node.id} channelKey="hue" />
                          )}
                          <ScrubberInput
                            ref={hueInputRef}
                            value={Math.round(effectiveColors.hue)}
                            min={getSliderRange('hue', 0, 360).min}
                            max={getSliderRange('hue', 0, 360).max}
                            onChange={handleHueChange}
                            onMouseDown={(e) => e.stopPropagation()}
                            className="w-16 h-7 text-sm"
                            disabled={isColorInputDisabled || isChannelAdvanced('hue')}
                          />
                        </div>
                      </div>
                      <input
                        type="range"
                        min={getSliderRange('hue', 0, 360).min}
                        max={getSliderRange('hue', 0, 360).max}
                        value={effectiveColors.hue}
                        onChange={(e) => handleHueChange(Number(e.target.value))}
                        onMouseDown={(e) => e.stopPropagation()}
                        onMouseMove={(e) => e.stopPropagation()}
                        disabled={isColorInputDisabled || isChannelAdvanced('hue')}
                        className="w-full h-2 rounded-lg appearance-none cursor-pointer color-slider"
                        style={{
                          background: `linear-gradient(to right, 
                            hsl(0, ${effectiveColors.saturation}%, ${effectiveColors.lightness}%), 
                            hsl(60, ${effectiveColors.saturation}%, ${effectiveColors.lightness}%), 
                            hsl(120, ${effectiveColors.saturation}%, ${effectiveColors.lightness}%), 
                            hsl(180, ${effectiveColors.saturation}%, ${effectiveColors.lightness}%), 
                            hsl(240, ${effectiveColors.saturation}%, ${effectiveColors.lightness}%), 
                            hsl(300, ${effectiveColors.saturation}%, ${effectiveColors.lightness}%), 
                            hsl(360, ${effectiveColors.saturation}%, ${effectiveColors.lightness}%))`,
                          '--slider-thumb-color': `hsl(${effectiveColors.hue}, ${effectiveColors.saturation}%, ${effectiveColors.lightness}%)`,
                          opacity: isChannelAdvanced('hue') ? 0.3 : 1,
                        } as React.CSSProperties}
                      />
                    </div>)}

                    {!isChannelHidden('saturation') && (<div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <PropertyControls
                          property="Saturation"
                          isDiffEnabled={node.diffSaturation !== false}
                          isLocked={node.lockSaturation === true}
                          onToggleDiff={() => toggleDiff('Saturation')}
                          onToggleLock={() => toggleLock('Saturation')}
                          hasParent={node.parentId !== null}
                          hideControls={hasDifferentColorSpaceParent}
                          isAdvancedActive={isChannelAdvanced('saturation')}
                          {...dp.saturation}
                        />
                        <div className="flex items-center gap-1">
                          {isChannelAdvanced('saturation') && (
                            <FxButton nodeId={node.id} channelKey="saturation" />
                          )}
                          <ScrubberInput
                            ref={saturationInputRef}
                            value={Math.round(effectiveColors.saturation)}
                            min={getSliderRange('saturation', 0, 100).min}
                            max={getSliderRange('saturation', 0, 100).max}
                            onChange={handleSaturationChange}
                            onMouseDown={(e) => e.stopPropagation()}
                            className="w-16 h-7 text-sm"
                            disabled={isColorInputDisabled || isChannelAdvanced('saturation')}
                          />
                        </div>
                      </div>
                      <input
                        type="range"
                        min={getSliderRange('saturation', 0, 100).min}
                        max={getSliderRange('saturation', 0, 100).max}
                        value={effectiveColors.saturation}
                        onChange={(e) => handleSaturationChange(Number(e.target.value))}
                        onMouseDown={(e) => e.stopPropagation()}
                        onMouseMove={(e) => e.stopPropagation()}
                        disabled={isColorInputDisabled || isChannelAdvanced('saturation')}
                        className="w-full h-2 rounded-lg appearance-none cursor-pointer color-slider"
                        style={{
                          background: `linear-gradient(to right, 
                            hsl(${effectiveColors.hue}, 0%, ${effectiveColors.lightness}%), 
                            hsl(${effectiveColors.hue}, 100%, ${effectiveColors.lightness}%))`,
                          '--slider-thumb-color': `hsl(${effectiveColors.hue}, ${effectiveColors.saturation}%, ${effectiveColors.lightness}%)`,
                          opacity: isChannelAdvanced('saturation') ? 0.3 : 1,
                        } as React.CSSProperties}
                      />
                    </div>)}

                    {!isChannelHidden('lightness') && (<div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <PropertyControls
                          property="Lightness"
                          isDiffEnabled={node.diffLightness !== false}
                          isLocked={node.lockLightness === true}
                          onToggleDiff={() => toggleDiff('Lightness')}
                          onToggleLock={() => toggleLock('Lightness')}
                          hasParent={node.parentId !== null}
                          hideControls={hasDifferentColorSpaceParent}
                          isAdvancedActive={isChannelAdvanced('lightness')}
                          {...dp.lightness}
                        />
                        <div className="flex items-center gap-1">
                          {isChannelAdvanced('lightness') && (
                            <FxButton nodeId={node.id} channelKey="lightness" />
                          )}
                          <ScrubberInput
                            ref={lightnessInputRef}
                            value={Math.round(effectiveColors.lightness)}
                            min={getSliderRange('lightness', 0, 100).min}
                            max={getSliderRange('lightness', 0, 100).max}
                            onChange={handleLightnessChange}
                            onMouseDown={(e) => e.stopPropagation()}
                            className="w-16 h-7 text-sm"
                            disabled={isColorInputDisabled || isChannelAdvanced('lightness')}
                          />
                        </div>
                      </div>
                      <input
                        type="range"
                        min={getSliderRange('lightness', 0, 100).min}
                        max={getSliderRange('lightness', 0, 100).max}
                        value={effectiveColors.lightness}
                        onChange={(e) => handleLightnessChange(Number(e.target.value))}
                        onMouseDown={(e) => e.stopPropagation()}
                        onMouseMove={(e) => e.stopPropagation()}
                        disabled={isColorInputDisabled || isChannelAdvanced('lightness')}
                        className="w-full h-2 rounded-lg appearance-none cursor-pointer color-slider"
                        style={{
                          background: `linear-gradient(to right, 
                            hsl(${effectiveColors.hue}, ${effectiveColors.saturation}%, 0%), 
                            hsl(${effectiveColors.hue}, ${effectiveColors.saturation}%, 50%), 
                            hsl(${effectiveColors.hue}, ${effectiveColors.saturation}%, 100%))`,
                          '--slider-thumb-color': `hsl(${effectiveColors.hue}, ${effectiveColors.saturation}%, ${effectiveColors.lightness}%)`,
                          opacity: isChannelAdvanced('lightness') ? 0.3 : 1,
                        } as React.CSSProperties}
                      />
                    </div>)}

                    {!isChannelHidden('alpha') && (<div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <PropertyControls
                          property="Alpha"
                          isDiffEnabled={node.diffAlpha !== false}
                          isLocked={node.lockAlpha === true}
                          onToggleDiff={() => toggleDiff('Alpha')}
                          onToggleLock={() => toggleLock('Alpha')}
                          hasParent={node.parentId !== null}
                          hideControls={hasDifferentColorSpaceParent}
                          isAdvancedActive={isChannelAdvanced('alpha')}
                          {...dp.alpha}
                        />
                        <div className="flex items-center gap-1">
                          {isChannelAdvanced('alpha') && (
                            <FxButton nodeId={node.id} channelKey="alpha" />
                          )}
                          <ScrubberInput
                            ref={alphaInputRef}
                            value={effectiveColors.alpha ?? 100}
                            min={getSliderRange('alpha', 0, 100).min}
                            max={getSliderRange('alpha', 0, 100).max}
                            onChange={handleAlphaChange}
                            onMouseDown={(e) => e.stopPropagation()}
                            className="w-16 h-7 text-sm"
                            disabled={isColorInputDisabled || isChannelAdvanced('alpha')}
                          />
                        </div>
                      </div>
                      <input
                        type="range"
                        min={getSliderRange('alpha', 0, 100).min}
                        max={getSliderRange('alpha', 0, 100).max}
                        value={effectiveColors.alpha ?? 100}
                        disabled={isColorInputDisabled || isChannelAdvanced('alpha')}
                        onChange={(e) => handleAlphaChange(Number(e.target.value))}
                        onMouseDown={(e) => e.stopPropagation()}
                        onMouseMove={(e) => e.stopPropagation()}
                        className="w-full h-2 rounded-lg appearance-none cursor-pointer color-slider"
                        style={{
                          backgroundImage: `
                            linear-gradient(to right, 
                              hsla(${effectiveColors.hue}, ${effectiveColors.saturation}%, ${effectiveColors.lightness}%, 0), 
                              hsla(${effectiveColors.hue}, ${effectiveColors.saturation}%, ${effectiveColors.lightness}%, 1)),
                            linear-gradient(45deg, #666666 25%, transparent 25%, transparent 75%, #666666 75%, #666666),
                            linear-gradient(45deg, #666666 25%, transparent 25%, transparent 75%, #666666 75%, #666666)
                          `,
                          backgroundSize: '100% 100%, 8px 8px, 8px 8px',
                          backgroundPosition: '0 0, 0 0, 4px 4px',
                          backgroundColor: '#999999',
                          '--slider-thumb-color': `hsla(${effectiveColors.hue}, ${effectiveColors.saturation}%, ${effectiveColors.lightness}%, ${(effectiveColors.alpha ?? 100) / 100})`,
                          opacity: isChannelAdvanced('alpha') ? 0.3 : 1,
                        } as React.CSSProperties}
                      />
                    </div>)}
                  </>
                )}

                {/* RGB Format */}
                {node.colorSpace === 'rgb' && (
                  <>
                    {!isChannelHidden('red') && (<div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <PropertyControls property="Red" isDiffEnabled={node.diffRed !== false} isLocked={node.lockRed === true} onToggleDiff={() => toggleDiff('Red')} onToggleLock={() => toggleLock('Red')} hasParent={node.parentId !== null} hideControls={hasDifferentColorSpaceParent} isAdvancedActive={isChannelAdvanced('red')} {...dp.red} />
                        <div className="flex items-center gap-1">
                          {isChannelAdvanced('red') && (<FxButton nodeId={node.id} channelKey="red" />)}
                          <ScrubberInput ref={redInputRef} value={effectiveColors.red || 0} min={getSliderRange('red', 0, 255).min} max={getSliderRange('red', 0, 255).max} onChange={handleRedChange} onMouseDown={(e) => e.stopPropagation()} className="w-16 h-7 text-sm" disabled={isColorInputDisabled || isChannelAdvanced('red')} />
                        </div>
                      </div>
                      <input type="range" min={getSliderRange('red', 0, 255).min} max={getSliderRange('red', 0, 255).max} value={effectiveColors.red || 0} onChange={(e) => handleRedChange(Number(e.target.value))} onMouseDown={(e) => e.stopPropagation()} onMouseMove={(e) => e.stopPropagation()} disabled={isColorInputDisabled || isChannelAdvanced('red')} className="w-full h-2 rounded-lg appearance-none cursor-pointer color-slider" style={{ background: `linear-gradient(to right, rgb(0, ${effectiveColors.green || 0}, ${effectiveColors.blue || 0}), rgb(255, ${effectiveColors.green || 0}, ${effectiveColors.blue || 0}))`, '--slider-thumb-color': `rgb(${effectiveColors.red || 0}, ${effectiveColors.green || 0}, ${effectiveColors.blue || 0})`, opacity: isChannelAdvanced('red') ? 0.3 : 1 } as React.CSSProperties} />
                    </div>)}

                    {!isChannelHidden('green') && (<div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <PropertyControls property="Green" isDiffEnabled={node.diffGreen !== false} isLocked={node.lockGreen === true} onToggleDiff={() => toggleDiff('Green')} onToggleLock={() => toggleLock('Green')} hasParent={node.parentId !== null} hideControls={hasDifferentColorSpaceParent} isAdvancedActive={isChannelAdvanced('green')} {...dp.green} />
                        <div className="flex items-center gap-1">
                          {isChannelAdvanced('green') && (<FxButton nodeId={node.id} channelKey="green" />)}
                          <ScrubberInput ref={greenInputRef} value={effectiveColors.green || 0} min={getSliderRange('green', 0, 255).min} max={getSliderRange('green', 0, 255).max} onChange={handleGreenChange} onMouseDown={(e) => e.stopPropagation()} className="w-16 h-7 text-sm" disabled={isColorInputDisabled || isChannelAdvanced('green')} />
                        </div>
                      </div>
                      <input type="range" min={getSliderRange('green', 0, 255).min} max={getSliderRange('green', 0, 255).max} value={effectiveColors.green || 0} onChange={(e) => handleGreenChange(Number(e.target.value))} onMouseDown={(e) => e.stopPropagation()} onMouseMove={(e) => e.stopPropagation()} disabled={isColorInputDisabled || isChannelAdvanced('green')} className="w-full h-2 rounded-lg appearance-none cursor-pointer color-slider" style={{ background: `linear-gradient(to right, rgb(${effectiveColors.red || 0}, 0, ${effectiveColors.blue || 0}), rgb(${effectiveColors.red || 0}, 255, ${effectiveColors.blue || 0}))`, '--slider-thumb-color': `rgb(${effectiveColors.red || 0}, ${effectiveColors.green || 0}, ${effectiveColors.blue || 0})`, opacity: isChannelAdvanced('green') ? 0.3 : 1 } as React.CSSProperties} />
                    </div>)}

                    {!isChannelHidden('blue') && (<div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <PropertyControls property="Blue" isDiffEnabled={node.diffBlue !== false} isLocked={node.lockBlue === true} onToggleDiff={() => toggleDiff('Blue')} onToggleLock={() => toggleLock('Blue')} hasParent={node.parentId !== null} hideControls={hasDifferentColorSpaceParent} isAdvancedActive={isChannelAdvanced('blue')} {...dp.blue} />
                        <div className="flex items-center gap-1">
                          {isChannelAdvanced('blue') && (<FxButton nodeId={node.id} channelKey="blue" />)}
                          <ScrubberInput ref={blueInputRef} value={effectiveColors.blue || 0} min={getSliderRange('blue', 0, 255).min} max={getSliderRange('blue', 0, 255).max} onChange={handleBlueChange} onMouseDown={(e) => e.stopPropagation()} className="w-16 h-7 text-sm" disabled={isColorInputDisabled || isChannelAdvanced('blue')} />
                        </div>
                      </div>
                      <input type="range" min={getSliderRange('blue', 0, 255).min} max={getSliderRange('blue', 0, 255).max} value={effectiveColors.blue || 0} onChange={(e) => handleBlueChange(Number(e.target.value))} onMouseDown={(e) => e.stopPropagation()} onMouseMove={(e) => e.stopPropagation()} disabled={isColorInputDisabled || isChannelAdvanced('blue')} className="w-full h-2 rounded-lg appearance-none cursor-pointer color-slider" style={{ background: `linear-gradient(to right, rgb(${effectiveColors.red || 0}, ${effectiveColors.green || 0}, 0), rgb(${effectiveColors.red || 0}, ${effectiveColors.green || 0}, 255))`, '--slider-thumb-color': `rgb(${effectiveColors.red || 0}, ${effectiveColors.green || 0}, ${effectiveColors.blue || 0})`, opacity: isChannelAdvanced('blue') ? 0.3 : 1 } as React.CSSProperties} />
                    </div>)}

                    {!isChannelHidden('alpha') && (<div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <PropertyControls property="Alpha" isDiffEnabled={node.diffAlpha !== false} isLocked={node.lockAlpha === true} onToggleDiff={() => toggleDiff('Alpha')} onToggleLock={() => toggleLock('Alpha')} hasParent={node.parentId !== null} hideControls={hasDifferentColorSpaceParent} isAdvancedActive={isChannelAdvanced('alpha')} {...dp.alpha} />
                        <div className="flex items-center gap-1">
                          {isChannelAdvanced('alpha') && (<FxButton nodeId={node.id} channelKey="alpha" />)}
                          <ScrubberInput ref={alphaInputRef} value={node.alpha ?? 100} min={getSliderRange('alpha', 0, 100).min} max={getSliderRange('alpha', 0, 100).max} onChange={handleAlphaChange} onMouseDown={(e) => e.stopPropagation()} className="w-16 h-7 text-sm" disabled={isChannelAdvanced('alpha')} />
                        </div>
                      </div>
                      <input type="range" min={getSliderRange('alpha', 0, 100).min} max={getSliderRange('alpha', 0, 100).max} value={node.alpha ?? 100} onChange={(e) => handleAlphaChange(Number(e.target.value))} onMouseDown={(e) => e.stopPropagation()} onMouseMove={(e) => e.stopPropagation()} disabled={isChannelAdvanced('alpha')} className="w-full h-2 rounded-lg appearance-none cursor-pointer color-slider" style={{ backgroundImage: `linear-gradient(to right, rgba(${node.red || 0}, ${node.green || 0}, ${node.blue || 0}, 0), rgba(${node.red || 0}, ${node.green || 0}, ${node.blue || 0}, 1)), linear-gradient(45deg, #666666 25%, transparent 25%, transparent 75%, #666666 75%, #666666), linear-gradient(45deg, #666666 25%, transparent 25%, transparent 75%, #666666 75%, #666666)`, backgroundSize: '100% 100%, 8px 8px, 8px 8px', backgroundPosition: '0 0, 0 0, 4px 4px', backgroundColor: '#999999', '--slider-thumb-color': `rgba(${node.red || 0}, ${node.green || 0}, ${node.blue || 0}, ${(node.alpha ?? 100) / 100})`, opacity: isChannelAdvanced('alpha') ? 0.3 : 1 } as React.CSSProperties} />
                    </div>)}
                  </>
                )}

                {/* OKLCH Format */}
                {node.colorSpace === 'oklch' && (() => {
                  // Check if current color is in gamut
                  const checkInGamut = () => {
                    const L = (effectiveColors.oklchL || 0) / 100;
                    const C = (effectiveColors.oklchC || 0) / 100 * 0.4;
                    const H = effectiveColors.oklchH || 0;
                    const hRad = (H * Math.PI) / 180;
                    const a = C * Math.cos(hRad);
                    const b = C * Math.sin(hRad);
                    const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
                    const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
                    const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
                    const l = l_ * l_ * l_;
                    const m = m_ * m_ * m_;
                    const s = s_ * s_ * s_;
                    const r_linear = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
                    const g_linear = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
                    const b_linear = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
                    const toSrgb = (val: number) => val <= 0.0031308 ? 12.92 * val : 1.055 * Math.pow(val, 1 / 2.4) - 0.055;
                    const r = toSrgb(r_linear);
                    const g = toSrgb(g_linear);
                    const b_srgb = toSrgb(b_linear);
                    return r >= 0 && r <= 1 && g >= 0 && g <= 1 && b_srgb >= 0 && b_srgb <= 1;
                  };
                  
                  const isInGamut = checkInGamut();
                  
                  return (
                  <>
                    {!isChannelHidden('oklchL') && (<div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <PropertyControls property="Light" isDiffEnabled={node.diffOklchL !== false} isLocked={node.lockOklchL === true} onToggleDiff={() => toggleDiff('OklchL')} onToggleLock={() => toggleLock('OklchL')} hasParent={node.parentId !== null} hideControls={hasDifferentColorSpaceParent} isAdvancedActive={isChannelAdvanced('oklchL')} {...dp.oklchL} />
                        <div className="flex items-center gap-1">
                          {isChannelAdvanced('oklchL') && (<FxButton nodeId={node.id} channelKey="oklchL" />)}
                          <ScrubberInput ref={lightnessInputRef} value={effectiveColors.oklchL || 0} min={getSliderRange('oklchL', 0, 100).min} max={getSliderRange('oklchL', 0, 100).max} onChange={handleOklchLChange} onMouseDown={(e) => e.stopPropagation()} className="w-16 h-7 text-sm" disabled={isColorInputDisabled || isChannelAdvanced('oklchL')} />
                        </div>
                      </div>
                      <div style={{ opacity: isChannelAdvanced('oklchL') ? 0.3 : 1, pointerEvents: isChannelAdvanced('oklchL') ? 'none' : undefined }}>
                        <OklchGamutSlider type="lightness" value={effectiveColors.oklchL || 0} lightness={effectiveColors.oklchL || 0} chroma={effectiveColors.oklchC || 0} hue={effectiveColors.oklchH || 0} onChange={handleOklchLChange} onMouseDown={(e) => e.stopPropagation()} onMouseMove={(e) => e.stopPropagation()} disabled={isColorInputDisabled || isChannelAdvanced('oklchL')} />
                      </div>
                    </div>)}

                    {!isChannelHidden('oklchC') && (<div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1">
                          <PropertyControls property="Chroma" isDiffEnabled={node.diffOklchC !== false} isLocked={node.lockOklchC === true} onToggleDiff={() => toggleDiff('OklchC')} onToggleLock={() => toggleLock('OklchC')} hasParent={node.parentId !== null} hideControls={hasDifferentColorSpaceParent} isAdvancedActive={isChannelAdvanced('oklchC')} {...dp.oklchC} />
                          <span className="text-[11px] text-subtle" title="Actual range: 0-0.4">(0-{((effectiveColors.oklchC || 0) / 100 * 0.4).toFixed(2)})</span>
                        </div>
                        <div className="flex items-center gap-1">
                          {isChannelAdvanced('oklchC') && (<FxButton nodeId={node.id} channelKey="oklchC" />)}
                          <ScrubberInput ref={chromaInputRef} value={effectiveColors.oklchC || 0} min={getSliderRange('oklchC', 0, 100).min} max={getSliderRange('oklchC', 0, 100).max} onChange={handleOklchCChange} onMouseDown={(e) => e.stopPropagation()} className="w-16 h-7 text-sm" disabled={isColorInputDisabled || isChannelAdvanced('oklchC')} />
                        </div>
                      </div>
                      <div style={{ opacity: isChannelAdvanced('oklchC') ? 0.3 : 1, pointerEvents: isChannelAdvanced('oklchC') ? 'none' : undefined }}>
                        <OklchGamutSlider type="chroma" value={effectiveColors.oklchC || 0} lightness={effectiveColors.oklchL || 0} chroma={effectiveColors.oklchC || 0} hue={effectiveColors.oklchH || 0} onChange={handleOklchCChange} onMouseDown={(e) => e.stopPropagation()} onMouseMove={(e) => e.stopPropagation()} disabled={isColorInputDisabled || isChannelAdvanced('oklchC')} />
                      </div>
                    </div>)}

                    {!isChannelHidden('oklchH') && (<div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <PropertyControls property="Hue" isDiffEnabled={node.diffOklchH !== false} isLocked={node.lockOklchH === true} onToggleDiff={() => toggleDiff('OklchH')} onToggleLock={() => toggleLock('OklchH')} hasParent={node.parentId !== null} hideControls={hasDifferentColorSpaceParent} isAdvancedActive={isChannelAdvanced('oklchH')} {...dp.oklchH} />
                        <div className="flex items-center gap-1">
                          {isChannelAdvanced('oklchH') && (<FxButton nodeId={node.id} channelKey="oklchH" />)}
                          <ScrubberInput ref={hueInputRef} value={effectiveColors.oklchH || 0} min={getSliderRange('oklchH', 0, 360).min} max={getSliderRange('oklchH', 0, 360).max} onChange={handleOklchHChange} onMouseDown={(e) => e.stopPropagation()} className="w-16 h-7 text-sm" disabled={isColorInputDisabled || isChannelAdvanced('oklchH')} />
                        </div>
                      </div>
                      <div style={{ opacity: isChannelAdvanced('oklchH') ? 0.3 : 1, pointerEvents: isChannelAdvanced('oklchH') ? 'none' : undefined }}>
                        <OklchGamutSlider type="hue" value={effectiveColors.oklchH || 0} lightness={effectiveColors.oklchL || 0} chroma={effectiveColors.oklchC || 0} hue={effectiveColors.oklchH || 0} onChange={handleOklchHChange} onMouseDown={(e) => e.stopPropagation()} onMouseMove={(e) => e.stopPropagation()} disabled={isColorInputDisabled || isChannelAdvanced('oklchH')} />
                      </div>
                    </div>)}

                    {!isChannelHidden('alpha') && (<div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <PropertyControls property="Alpha" isDiffEnabled={node.diffAlpha !== false} isLocked={node.lockAlpha === true} onToggleDiff={() => toggleDiff('Alpha')} onToggleLock={() => toggleLock('Alpha')} hasParent={node.parentId !== null} hideControls={hasDifferentColorSpaceParent} isAdvancedActive={isChannelAdvanced('alpha')} {...dp.alpha} />
                        <div className="flex items-center gap-1">
                          {isChannelAdvanced('alpha') && (<FxButton nodeId={node.id} channelKey="alpha" />)}
                          <ScrubberInput ref={alphaInputRef} value={node.alpha ?? 100} min={getSliderRange('alpha', 0, 100).min} max={getSliderRange('alpha', 0, 100).max} onChange={handleAlphaChange} onMouseDown={(e) => e.stopPropagation()} className="w-16 h-7 text-sm" disabled={isChannelAdvanced('alpha')} />
                        </div>
                      </div>
                      <input type="range" min={getSliderRange('alpha', 0, 100).min} max={getSliderRange('alpha', 0, 100).max} value={node.alpha ?? 100} onChange={(e) => handleAlphaChange(Number(e.target.value))} onMouseDown={(e) => e.stopPropagation()} onMouseMove={(e) => e.stopPropagation()} disabled={isChannelAdvanced('alpha')} className="w-full h-2 rounded-lg appearance-none cursor-pointer color-slider" style={{ backgroundImage: `linear-gradient(to right, oklch(${node.oklchL || 0}% ${(node.oklchC || 0) / 100 * 0.4} ${node.oklchH || 0}deg / 0), oklch(${node.oklchL || 0}% ${(node.oklchC || 0) / 100 * 0.4} ${node.oklchH || 0}deg / 1)), linear-gradient(45deg, #666666 25%, transparent 25%, transparent 75%, #666666 75%, #666666), linear-gradient(45deg, #666666 25%, transparent 25%, transparent 75%, #666666 75%, #666666)`, backgroundSize: '100% 100%, 8px 8px, 8px 8px', backgroundPosition: '0 0, 0 0, 4px 4px', backgroundColor: '#999999', '--slider-thumb-color': `oklch(${node.oklchL || 0}% ${(node.oklchC || 0) / 100 * 0.4} ${node.oklchH || 0}deg / ${(node.alpha ?? 100) / 100})`, opacity: isChannelAdvanced('alpha') ? 0.3 : 1 } as React.CSSProperties} />
                    </div>)}
                  </>
                  );
                })()}

                {/* HCT Format */}
                {node.colorSpace === 'hct' && (() => {
                  const hctMaxChroma = getMaxChroma(effectiveColors.hctH || 0, effectiveColors.hctT || 0);
                  const clampedChroma = Math.min(effectiveColors.hctC || 0, hctMaxChroma);
                  
                  return (
                  <>
                    {!isChannelHidden('hctH') && (<div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <PropertyControls property="Hue" isDiffEnabled={node.diffHctH !== false} isLocked={node.lockHctH === true} onToggleDiff={() => toggleDiff('HctH')} onToggleLock={() => toggleLock('HctH')} hasParent={node.parentId !== null} hideControls={hasDifferentColorSpaceParent} isAdvancedActive={isChannelAdvanced('hctH')} {...dp.hctH} />
                        <div className="flex items-center gap-1">
                          {isChannelAdvanced('hctH') && (<FxButton nodeId={node.id} channelKey="hctH" />)}
                          <ScrubberInput ref={hctHueInputRef} value={Math.round(effectiveColors.hctH || 0)} min={getSliderRange('hctH', 0, 360).min} max={getSliderRange('hctH', 0, 360).max} onChange={handleHctHChange} onMouseDown={(e) => e.stopPropagation()} className="w-16 h-7 text-sm" disabled={isColorInputDisabled || isChannelAdvanced('hctH')} />
                        </div>
                      </div>
                      <input type="range" min={getSliderRange('hctH', 0, 360).min} max={getSliderRange('hctH', 0, 360).max} value={effectiveColors.hctH || 0} onChange={(e) => handleHctHChange(Number(e.target.value))} onMouseDown={(e) => e.stopPropagation()} onMouseMove={(e) => e.stopPropagation()} disabled={isColorInputDisabled || isChannelAdvanced('hctH')} className="w-full h-2 rounded-lg appearance-none cursor-pointer color-slider" style={{ background: generateHctHueGradient(effectiveColors.hctC || 0, effectiveColors.hctT || 0), '--slider-thumb-color': (() => { const rgb = hctToRgb(effectiveColors.hctH || 0, effectiveColors.hctC || 0, effectiveColors.hctT || 0); return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${(effectiveColors.alpha ?? 100) / 100})`; })(), opacity: isChannelAdvanced('hctH') ? 0.3 : 1 } as React.CSSProperties} />
                    </div>)}

                    {!isChannelHidden('hctC') && (<div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <PropertyControls property="Chroma" isDiffEnabled={node.diffHctC !== false} isLocked={node.lockHctC === true} onToggleDiff={() => toggleDiff('HctC')} onToggleLock={() => toggleLock('HctC')} hasParent={node.parentId !== null} hideControls={hasDifferentColorSpaceParent} isAdvancedActive={isChannelAdvanced('hctC')} {...dp.hctC} />
                        <div className="flex items-center gap-1">
                          {isChannelAdvanced('hctC') && (<FxButton nodeId={node.id} channelKey="hctC" />)}
                          <ScrubberInput ref={hctChromaInputRef} value={Math.round(clampedChroma)} min={getSliderRange('hctC', 0, Math.round(hctMaxChroma)).min} max={Math.min(getSliderRange('hctC', 0, 120).max, Math.round(hctMaxChroma))} onChange={handleHctCChange} onMouseDown={(e) => e.stopPropagation()} className="w-16 h-7 text-sm" disabled={isColorInputDisabled || isChannelAdvanced('hctC')} />
                        </div>
                      </div>
                      <input type="range" min={getSliderRange('hctC', 0, 120).min} max={Math.min(getSliderRange('hctC', 0, 120).max, hctMaxChroma)} step="0.1" value={clampedChroma} onChange={(e) => handleHctCChange(Number(e.target.value))} onMouseDown={(e) => e.stopPropagation()} onMouseMove={(e) => e.stopPropagation()} disabled={isColorInputDisabled || isChannelAdvanced('hctC')} className="w-full h-2 rounded-lg appearance-none cursor-pointer color-slider" style={{ background: generateHctChromaGradient(effectiveColors.hctH || 0, effectiveColors.hctT || 0, hctMaxChroma), '--slider-thumb-color': (() => { const rgb = hctToRgb(effectiveColors.hctH || 0, clampedChroma, effectiveColors.hctT || 0); return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${(effectiveColors.alpha ?? 100) / 100})`; })(), opacity: isChannelAdvanced('hctC') ? 0.3 : 1 } as React.CSSProperties} />
                    </div>)}

                    {!isChannelHidden('hctT') && (<div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <PropertyControls property="Tone" isDiffEnabled={node.diffHctT !== false} isLocked={node.lockHctT === true} onToggleDiff={() => toggleDiff('HctT')} onToggleLock={() => toggleLock('HctT')} hasParent={node.parentId !== null} hideControls={hasDifferentColorSpaceParent} isAdvancedActive={isChannelAdvanced('hctT')} {...dp.hctT} />
                        <div className="flex items-center gap-1">
                          {isChannelAdvanced('hctT') && (<FxButton nodeId={node.id} channelKey="hctT" />)}
                          <ScrubberInput ref={hctToneInputRef} value={Math.round(effectiveColors.hctT || 0)} min={getSliderRange('hctT', 0, 100).min} max={getSliderRange('hctT', 0, 100).max} onChange={handleHctTChange} onMouseDown={(e) => e.stopPropagation()} className="w-16 h-7 text-sm" disabled={isColorInputDisabled || isChannelAdvanced('hctT')} />
                        </div>
                      </div>
                      <input type="range" min={getSliderRange('hctT', 0, 100).min} max={getSliderRange('hctT', 0, 100).max} step="0.1" value={effectiveColors.hctT || 0} onChange={(e) => handleHctTChange(Number(e.target.value))} onMouseDown={(e) => e.stopPropagation()} onMouseMove={(e) => e.stopPropagation()} disabled={isColorInputDisabled || isChannelAdvanced('hctT')} className="w-full h-2 rounded-lg appearance-none cursor-pointer color-slider" style={{ background: generateHctToneGradient(effectiveColors.hctH || 0, effectiveColors.hctC || 0), '--slider-thumb-color': (() => { const rgb = hctToRgb(effectiveColors.hctH || 0, effectiveColors.hctC || 0, effectiveColors.hctT || 0); return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${(effectiveColors.alpha ?? 100) / 100})`; })(), opacity: isChannelAdvanced('hctT') ? 0.3 : 1 } as React.CSSProperties} />
                    </div>)}

                    {!isChannelHidden('alpha') && (<div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <PropertyControls property="Alpha" isDiffEnabled={node.diffAlpha !== false} isLocked={node.lockAlpha === true} onToggleDiff={() => toggleDiff('Alpha')} onToggleLock={() => toggleLock('Alpha')} hasParent={node.parentId !== null} hideControls={hasDifferentColorSpaceParent} isAdvancedActive={isChannelAdvanced('alpha')} {...dp.alpha} />
                        <div className="flex items-center gap-1">
                          {isChannelAdvanced('alpha') && (<FxButton nodeId={node.id} channelKey="alpha" />)}
                          <ScrubberInput ref={alphaInputRef} value={node.alpha ?? 100} min={getSliderRange('alpha', 0, 100).min} max={getSliderRange('alpha', 0, 100).max} onChange={handleAlphaChange} onMouseDown={(e) => e.stopPropagation()} className="w-16 h-7 text-sm" disabled={isColorInputDisabled || isChannelAdvanced('alpha')} />
                        </div>
                      </div>
                      <input type="range" min={getSliderRange('alpha', 0, 100).min} max={getSliderRange('alpha', 0, 100).max} value={node.alpha ?? 100} onChange={(e) => handleAlphaChange(Number(e.target.value))} onMouseDown={(e) => e.stopPropagation()} onMouseMove={(e) => e.stopPropagation()} disabled={isColorInputDisabled || isChannelAdvanced('alpha')} className="w-full h-2 rounded-lg appearance-none cursor-pointer color-slider" style={{ backgroundImage: (() => { const rgb = hctToRgb(effectiveColors.hctH || 0, effectiveColors.hctC || 0, effectiveColors.hctT || 0); return `linear-gradient(to right, rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0), rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 1)), linear-gradient(45deg, #666666 25%, transparent 25%, transparent 75%, #666666 75%, #666666), linear-gradient(45deg, #666666 25%, transparent 25%, transparent 75%, #666666 75%, #666666)`; })(), backgroundSize: '100% 100%, 8px 8px, 8px 8px', backgroundPosition: '0 0, 0 0, 4px 4px', backgroundColor: '#999999', '--slider-thumb-color': (() => { const rgb = hctToRgb(effectiveColors.hctH || 0, effectiveColors.hctC || 0, effectiveColors.hctT || 0); return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${(node.alpha ?? 100) / 100})`; })(), opacity: isChannelAdvanced('alpha') ? 0.3 : 1 } as React.CSSProperties} />
                    </div>)}
                  </>
                  );
                })()}
              </div>
            </PopoverContent>
          </Popover>
          )}

          {node.colorSpace !== 'hex' && !isPaletteShade && (
            <CollapsibleTrigger asChild>
              <Tip label={isExpanded ? 'Collapse Controls' : 'Expand Controls'} side="top" enabled={!isColorInputDisabled}>
              <button
                className={`p-1 rounded transition-colors ${isColorInputDisabled ? 'opacity-30 cursor-not-allowed' : isLightBackground ? 'hover:bg-[#0a0a0a]/10' : 'hover:bg-white/20'}`}
                disabled={isColorInputDisabled}
                onClick={(e) => {
                  e.stopPropagation();
                  if (isColorInputDisabled) return;
                  onSelect();
                  setIsExpanded(!isExpanded);
                }}
              >
                <ChevronDown 
                  className={`h-5 w-5 transition-transform ${isExpanded ? 'rotate-180' : ''} ${isLightBackground ? 'text-[#444444]/80' : 'text-white/80'}`}
                />
              </button>
              </Tip>
            </CollapsibleTrigger>
          )}
        </div>
        <div className="flex flex-col items-center">
          {isOklchOutOfGamut && (
            <span
              className="text-[11px] tracking-wider uppercase drop-shadow-md leading-none"
              style={{
                color: isLightBackground ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)',
              }}
            >
              sRGB fallback
            </span>
          )}
          <div className="relative flex items-center gap-1">
            {/* Copy hex button — absolutely positioned left of hex, visible on hover */}
            <Tip label="Copy Hex" side="left" enabled={isHovered && !copiedHex}>
            <button
              className={`absolute right-full mr-1 p-1 rounded transition-all ${isLightBackground ? 'hover:bg-[#0a0a0a]/10' : 'hover:bg-white/20'} ${isHovered || copiedHex ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
              onClick={(e) => { e.stopPropagation(); handleCopyHex(); }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {copiedHex ? (
                <Check className={`w-4 h-4 ${isLightBackground ? 'text-[#444444]/80' : 'text-white/80'}`} />
              ) : (
                <Copy className={`w-4 h-4 ${isLightBackground ? 'text-[#444444]/60' : 'text-white/60'}`} />
              )}
            </button>
            </Tip>
            {/* Lock icon for hex nodes */}
            {node.colorSpace === 'hex' && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (isColorInputDisabled) return;
                  onSelect();
                  // When toggling lock state, preserve the current displayed hex value
                  if (!node.hexLocked) {
                    // Locking: store the current displayed hex
                    onUpdateNode(node.id, { 
                      hexLocked: true,
                      hexValue: hexColor
                    });
                  } else {
                    // Unlocking: preserve current hex value so it doesn't change visually
                    onUpdateNode(node.id, { 
                      hexLocked: false,
                      hexValue: hexColor
                    });
                  }
                }}
                disabled={isColorInputDisabled}
                className={
                  isColorInputDisabled
                    ? `p-1 rounded transition-colors opacity-30 cursor-not-allowed ${
                        isLightBackground ? 'text-[#444444]' : 'text-white'
                      }`
                    : node.colorSpace === 'hex'
                    ? `p-1 rounded transition-colors ${
                        isLightBackground
                          ? 'text-[#444444] hover:bg-[#0a0a0a]/10'
                          : 'text-white hover:bg-white/10'
                      }`
                    : `p-1 rounded transition-colors ${
                        node.hexLocked
                          ? 'text-brand hover:bg-brand/10'
                          : 'text-muted-foreground hover:text-subtle hover:bg-secondary'
                      }`
                }
                title={isColorInputDisabled ? 'Inherited from primary — unlink to modify' : node.hexLocked ? 'Locked - can edit manually' : 'Unlocked - inherits from parent'}
              >
                {node.hexLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
              </button>
            )}
            <Input
              ref={headerHexInputRef}
              type="text"
              value={isEditingHex ? hexInputValue : displayColorValue}
              onChange={(e) => handleHexInputChange(e.target.value)}
              onFocus={handleHexFocus}
              onBlur={handleHexBlur}
              onKeyDown={handleHexKeyDown}
              onMouseDown={(e) => e.stopPropagation()}
              disabled={isColorInputDisabled}
              placeholder={node.colorSpace === 'oklch' ? 'oklch(0.7 0.1 58)' : '#000000'}
              size={(isEditingHex ? hexInputValue : displayColorValue).length || 7}
              className={`font-mono bg-transparent border-none text-center w-auto h-auto px-0 py-1 drop-shadow-md focus-visible:ring-0 focus-visible:border-none ${isLightBackground ? 'text-black/80 focus-visible:bg-[#0a0a0a]/10' : 'text-white focus-visible:bg-white/10'}`}
            />
          </div>
        </div>
      </div>

      {/* Palette-specific Controls */}
      {node.isPalette && (
        <div
          className={`${isColorSectionDimmed ? 'transition-opacity duration-200' : ''}`}
          style={{
            ...(colorDimOpacity !== undefined ? { opacity: colorDimOpacity } : {}),
            ...(isColorInputDisabled ? { pointerEvents: 'none' as const } : {}),
          }}
          onMouseEnter={() => { if (colorNeedsHover) setHoveredSection('color'); }}
          onMouseLeave={() => { if (hoveredSection === 'color') setHoveredSection(null); }}
        >
          <PaletteControls
            node={node}
            onUpdateNode={onUpdateNode}
          />
        </div>
      )}

      {/* Controls */}
      {!node.isPalette && (
      <div 
        className={`px-4 space-y-3 py-[12px] pt-[0px] pr-[16px] pb-[12px] pl-[16px] mt-[-20px] mr-[0px] mb-[0px] ml-[0px]`}
        onMouseEnter={() => { if (colorNeedsHover) setHoveredSection('color'); }}
        onMouseLeave={() => { if (hoveredSection === 'color') setHoveredSection(null); }}
      >
        <CollapsibleContent>
        <div 
          className={`space-y-3 ${isColorSectionDimmed ? 'transition-opacity duration-200' : ''}`}
          style={{
            ...(colorDimOpacity !== undefined ? { opacity: colorDimOpacity } : {}),
            ...(isColorInputDisabled ? { pointerEvents: 'none' as const } : {}),
          }}
        >
        {/* Color Space Label */}
        {node.colorSpace !== 'hex' && (
          <div className="pt-2">
            <div 
              className="px-3 py-1 rounded-full text-xs inline-block" 
              style={{ backgroundColor: 'var(--secondary)', color: 'var(--foreground)' }}
            >
              {node.colorSpace === 'hsl' ? 'HSL' : node.colorSpace === 'rgb' ? 'RGB' : node.colorSpace === 'oklch' ? 'OKLCH' : node.colorSpace === 'hct' ? 'HCT' : 'HEX'}
            </div>
          </div>
        )}

        {/* HSL Format */}
        {node.colorSpace === 'hsl' && (
          <>
            {!isChannelHidden('hue') && (<div className="space-y-2 mt-[0px] mr-[0px] mb-[10px] ml-[0px]">
              <div className="flex items-center justify-between gap-[0.125rem]">
                <PropertyControls
                  property="Hue"
                  isDiffEnabled={node.diffHue !== false}
                  isLocked={node.lockHue === true}
                  onToggleDiff={() => toggleDiff('Hue')}
                  onToggleLock={() => toggleLock('Hue')}
                  hasParent={node.parentId !== null}
                  hideControls={hasDifferentColorSpaceParent}
                  isAdvancedActive={isChannelAdvanced('hue')}
                  {...dp.hue}
                />
                <div className="flex items-center gap-1">
                  {isChannelAdvanced('hue') && (
                    <FxButton nodeId={node.id} channelKey="hue" />
                  )}
                  <ScrubberInput
                    value={effectiveColors.hue}
                    min={getSliderRange('hue', 0, 360).min}
                    max={getSliderRange('hue', 0, 360).max}
                    onChange={handleHueChange}
                    onMouseDown={(e) => e.stopPropagation()}
                    className="w-16 h-7 text-sm"
                    disabled={isChannelAdvanced('hue')}
                  />
                </div>
              </div>
              <input
                type="range"
                min={getSliderRange('hue', 0, 360).min}
                max={getSliderRange('hue', 0, 360).max}
                value={effectiveColors.hue}
                onChange={(e) => handleHueChange(Number(e.target.value))}
                onMouseDown={(e) => e.stopPropagation()}
                onMouseMove={(e) => e.stopPropagation()}
                disabled={isChannelAdvanced('hue')}
                className="w-full h-2 rounded-lg appearance-none cursor-pointer color-slider"
                style={{
                  background: `linear-gradient(to right, 
                    hsl(0, ${effectiveColors.saturation}%, ${effectiveColors.lightness}%), 
                    hsl(60, ${effectiveColors.saturation}%, ${effectiveColors.lightness}%), 
                    hsl(120, ${effectiveColors.saturation}%, ${effectiveColors.lightness}%), 
                    hsl(180, ${effectiveColors.saturation}%, ${effectiveColors.lightness}%), 
                    hsl(240, ${effectiveColors.saturation}%, ${effectiveColors.lightness}%), 
                    hsl(300, ${effectiveColors.saturation}%, ${effectiveColors.lightness}%), 
                    hsl(360, ${effectiveColors.saturation}%, ${effectiveColors.lightness}%))`,
                  '--slider-thumb-color': `hsl(${effectiveColors.hue}, ${effectiveColors.saturation}%, ${effectiveColors.lightness}%)`,
                  opacity: isChannelAdvanced('hue') ? 0.3 : 1,
                } as React.CSSProperties}
              />
            </div>)}

            {!isChannelHidden('saturation') && (<div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <PropertyControls property="Saturation" isDiffEnabled={node.diffSaturation !== false} isLocked={node.lockSaturation === true} onToggleDiff={() => toggleDiff('Saturation')} onToggleLock={() => toggleLock('Saturation')} hasParent={node.parentId !== null} hideControls={hasDifferentColorSpaceParent} isAdvancedActive={isChannelAdvanced('saturation')} {...dp.saturation} />
                <div className="flex items-center gap-1">
                  {isChannelAdvanced('saturation') && (<FxButton nodeId={node.id} channelKey="saturation" />)}
                  <ScrubberInput value={effectiveColors.saturation} min={getSliderRange('saturation', 0, 100).min} max={getSliderRange('saturation', 0, 100).max} onChange={handleSaturationChange} onMouseDown={(e) => e.stopPropagation()} className="w-16 h-7 text-sm" disabled={isChannelAdvanced('saturation')} />
                </div>
              </div>
              <input type="range" min={getSliderRange('saturation', 0, 100).min} max={getSliderRange('saturation', 0, 100).max} value={effectiveColors.saturation} onChange={(e) => handleSaturationChange(Number(e.target.value))} onMouseDown={(e) => e.stopPropagation()} onMouseMove={(e) => e.stopPropagation()} disabled={isChannelAdvanced('saturation')} className="w-full h-2 rounded-lg appearance-none cursor-pointer color-slider" style={{ background: `linear-gradient(to right, hsl(${effectiveColors.hue}, 0%, ${effectiveColors.lightness}%), hsl(${effectiveColors.hue}, 100%, ${effectiveColors.lightness}%))`, '--slider-thumb-color': `hsl(${effectiveColors.hue}, ${effectiveColors.saturation}%, ${effectiveColors.lightness}%)`, opacity: isChannelAdvanced('saturation') ? 0.3 : 1 } as React.CSSProperties} />
            </div>)}

            {!isChannelHidden('lightness') && (<div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <PropertyControls
                  property="Lightness"
                  isDiffEnabled={node.diffLightness !== false}
                  isLocked={node.lockLightness === true}
                  onToggleDiff={() => toggleDiff('Lightness')}
                  onToggleLock={() => toggleLock('Lightness')}
                  hasParent={node.parentId !== null}
                  hideControls={hasDifferentColorSpaceParent}
                  isAdvancedActive={isChannelAdvanced('lightness')}
                  {...dp.lightness}
                />
                <div className="flex items-center gap-1">
                  {isChannelAdvanced('lightness') && (
                    <FxButton nodeId={node.id} channelKey="lightness" />
                  )}
                  <ScrubberInput
                    value={effectiveColors.lightness}
                    min={0}
                    max={100}
                    onChange={handleLightnessChange}
                    onMouseDown={(e) => e.stopPropagation()}
                    className="w-16 h-7 text-sm"
                    disabled={isChannelAdvanced('lightness')}
                  />
                </div>
              </div>
              <input type="range" min={getSliderRange('lightness', 0, 100).min} max={getSliderRange('lightness', 0, 100).max} value={effectiveColors.lightness} onChange={(e) => handleLightnessChange(Number(e.target.value))} onMouseDown={(e) => e.stopPropagation()} onMouseMove={(e) => e.stopPropagation()} disabled={isChannelAdvanced('lightness')} className="w-full h-2 rounded-lg appearance-none cursor-pointer color-slider" style={{ background: `linear-gradient(to right, hsl(${effectiveColors.hue}, ${effectiveColors.saturation}%, 0%), hsl(${effectiveColors.hue}, ${effectiveColors.saturation}%, 50%), hsl(${effectiveColors.hue}, ${effectiveColors.saturation}%, 100%))`, '--slider-thumb-color': `hsl(${effectiveColors.hue}, ${effectiveColors.saturation}%, ${effectiveColors.lightness}%)`, opacity: isChannelAdvanced('lightness') ? 0.3 : 1 } as React.CSSProperties} />
            </div>)}

            {!isChannelHidden('alpha') && (<div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <PropertyControls property="Alpha" isDiffEnabled={node.diffAlpha !== false} isLocked={node.lockAlpha === true} onToggleDiff={() => toggleDiff('Alpha')} onToggleLock={() => toggleLock('Alpha')} hasParent={node.parentId !== null} hideControls={hasDifferentColorSpaceParent} isAdvancedActive={isChannelAdvanced('alpha')} {...dp.alpha} />
                <div className="flex items-center gap-1">
                  {isChannelAdvanced('alpha') && (<FxButton nodeId={node.id} channelKey="alpha" />)}
                  <ScrubberInput value={node.alpha ?? 100} min={getSliderRange('alpha', 0, 100).min} max={getSliderRange('alpha', 0, 100).max} onChange={handleAlphaChange} onMouseDown={(e) => e.stopPropagation()} className="w-16 h-7 text-sm" disabled={isChannelAdvanced('alpha')} />
                </div>
              </div>
              <input type="range" min={getSliderRange('alpha', 0, 100).min} max={getSliderRange('alpha', 0, 100).max} value={node.alpha ?? 100} onChange={(e) => handleAlphaChange(Number(e.target.value))} onMouseDown={(e) => e.stopPropagation()} onMouseMove={(e) => e.stopPropagation()} disabled={isChannelAdvanced('alpha')} className="w-full h-2 rounded-lg appearance-none cursor-pointer color-slider" style={{ backgroundImage: `linear-gradient(to right, hsla(${node.hue}, ${node.saturation}%, ${node.lightness}%, 0), hsla(${node.hue}, ${node.saturation}%, ${node.lightness}%, 1)), linear-gradient(45deg, #666666 25%, transparent 25%, transparent 75%, #666666 75%, #666666), linear-gradient(45deg, #666666 25%, transparent 25%, transparent 75%, #666666 75%, #666666)`, backgroundSize: '100% 100%, 8px 8px, 8px 8px', backgroundPosition: '0 0, 0 0, 4px 4px', backgroundColor: '#999999', '--slider-thumb-color': `hsla(${node.hue}, ${node.saturation}%, ${node.lightness}%, ${(node.alpha ?? 100) / 100})`, opacity: isChannelAdvanced('alpha') ? 0.3 : 1 } as React.CSSProperties} />
            </div>)}
          </>
        )}

        {/* RGB Format */}
        {node.colorSpace === 'rgb' && (() => {
          const handleRgbChange = (component: 'red' | 'green' | 'blue', value: number) => {
            onUpdateNode(node.id, { [component]: Math.round(value) });
          };

          return (
            <>
              {!isChannelHidden('red') && (<div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <PropertyControls property="Red" isDiffEnabled={node.diffRed !== false} isLocked={node.lockRed === true} onToggleDiff={() => toggleDiff('Red')} onToggleLock={() => toggleLock('Red')} hasParent={node.parentId !== null} hideControls={hasDifferentColorSpaceParent} isAdvancedActive={isChannelAdvanced('red')} {...dp.red} />
                  <div className="flex items-center gap-1">
                    {isChannelAdvanced('red') && (<FxButton nodeId={node.id} channelKey="red" />)}
                    <ScrubberInput value={node.red || 0} min={getSliderRange('red', 0, 255).min} max={getSliderRange('red', 0, 255).max} onChange={(value) => handleRgbChange('red', value)} onMouseDown={(e) => e.stopPropagation()} className="w-16 h-7 text-sm" disabled={isChannelAdvanced('red')} />
                  </div>
                </div>
                <input type="range" min={getSliderRange('red', 0, 255).min} max={getSliderRange('red', 0, 255).max} value={node.red || 0} onChange={(e) => handleRgbChange('red', Number(e.target.value))} onMouseDown={(e) => e.stopPropagation()} onMouseMove={(e) => e.stopPropagation()} disabled={isChannelAdvanced('red')} className="w-full h-2 rounded-lg appearance-none cursor-pointer color-slider" style={{ background: `linear-gradient(to right, rgb(0, ${node.green || 0}, ${node.blue || 0}), rgb(255, ${node.green || 0}, ${node.blue || 0}))`, '--slider-thumb-color': `rgba(${node.red || 0}, ${node.green || 0}, ${node.blue || 0}, ${(node.alpha ?? 100) / 100})`, opacity: isChannelAdvanced('red') ? 0.3 : 1 } as React.CSSProperties} />
              </div>)}
              {!isChannelHidden('green') && (<div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <PropertyControls property="Green" isDiffEnabled={node.diffGreen !== false} isLocked={node.lockGreen === true} onToggleDiff={() => toggleDiff('Green')} onToggleLock={() => toggleLock('Green')} hasParent={node.parentId !== null} hideControls={hasDifferentColorSpaceParent} isAdvancedActive={isChannelAdvanced('green')} {...dp.green} />
                  <div className="flex items-center gap-1">
                    {isChannelAdvanced('green') && (<FxButton nodeId={node.id} channelKey="green" />)}
                    <ScrubberInput value={node.green || 0} min={getSliderRange('green', 0, 255).min} max={getSliderRange('green', 0, 255).max} onChange={(value) => handleRgbChange('green', value)} onMouseDown={(e) => e.stopPropagation()} className="w-16 h-7 text-sm" disabled={isChannelAdvanced('green')} />
                  </div>
                </div>
                <input type="range" min={getSliderRange('green', 0, 255).min} max={getSliderRange('green', 0, 255).max} value={node.green || 0} onChange={(e) => handleRgbChange('green', Number(e.target.value))} onMouseDown={(e) => e.stopPropagation()} onMouseMove={(e) => e.stopPropagation()} disabled={isChannelAdvanced('green')} className="w-full h-2 rounded-lg appearance-none cursor-pointer color-slider" style={{ background: `linear-gradient(to right, rgb(${node.red || 0}, 0, ${node.blue || 0}), rgb(${node.red || 0}, 255, ${node.blue || 0}))`, '--slider-thumb-color': `rgba(${node.red || 0}, ${node.green || 0}, ${node.blue || 0}, ${(node.alpha ?? 100) / 100})`, opacity: isChannelAdvanced('green') ? 0.3 : 1 } as React.CSSProperties} />
              </div>)}
              {!isChannelHidden('blue') && (<div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <PropertyControls property="Blue" isDiffEnabled={node.diffBlue !== false} isLocked={node.lockBlue === true} onToggleDiff={() => toggleDiff('Blue')} onToggleLock={() => toggleLock('Blue')} hasParent={node.parentId !== null} hideControls={hasDifferentColorSpaceParent} isAdvancedActive={isChannelAdvanced('blue')} {...dp.blue} />
                  <div className="flex items-center gap-1">
                    {isChannelAdvanced('blue') && (<FxButton nodeId={node.id} channelKey="blue" />)}
                    <ScrubberInput value={node.blue || 0} min={getSliderRange('blue', 0, 255).min} max={getSliderRange('blue', 0, 255).max} onChange={(value) => handleRgbChange('blue', value)} onMouseDown={(e) => e.stopPropagation()} className="w-16 h-7 text-sm" disabled={isChannelAdvanced('blue')} />
                  </div>
                </div>
                <input type="range" min={getSliderRange('blue', 0, 255).min} max={getSliderRange('blue', 0, 255).max} value={node.blue || 0} onChange={(e) => handleRgbChange('blue', Number(e.target.value))} onMouseDown={(e) => e.stopPropagation()} onMouseMove={(e) => e.stopPropagation()} disabled={isChannelAdvanced('blue')} className="w-full h-2 rounded-lg appearance-none cursor-pointer color-slider" style={{ background: `linear-gradient(to right, rgb(${node.red || 0}, ${node.green || 0}, 0), rgb(${node.red || 0}, ${node.green || 0}, 255))`, '--slider-thumb-color': `rgba(${node.red || 0}, ${node.green || 0}, ${node.blue || 0}, ${(node.alpha ?? 100) / 100})`, opacity: isChannelAdvanced('blue') ? 0.3 : 1 } as React.CSSProperties} />
              </div>)}
              {!isChannelHidden('alpha') && (<div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <PropertyControls property="Alpha" isDiffEnabled={node.diffAlpha !== false} isLocked={node.lockAlpha === true} onToggleDiff={() => toggleDiff('Alpha')} onToggleLock={() => toggleLock('Alpha')} hasParent={node.parentId !== null} hideControls={hasDifferentColorSpaceParent} isAdvancedActive={isChannelAdvanced('alpha')} {...dp.alpha} />
                  <div className="flex items-center gap-1">
                    {isChannelAdvanced('alpha') && (<FxButton nodeId={node.id} channelKey="alpha" />)}
                    <ScrubberInput value={node.alpha ?? 100} min={getSliderRange('alpha', 0, 100).min} max={getSliderRange('alpha', 0, 100).max} onChange={handleAlphaChange} onMouseDown={(e) => e.stopPropagation()} className="w-16 h-7 text-sm" disabled={isChannelAdvanced('alpha')} />
                  </div>
                </div>
                <input type="range" min={getSliderRange('alpha', 0, 100).min} max={getSliderRange('alpha', 0, 100).max} value={node.alpha ?? 100} onChange={(e) => handleAlphaChange(Number(e.target.value))} onMouseDown={(e) => e.stopPropagation()} onMouseMove={(e) => e.stopPropagation()} disabled={isChannelAdvanced('alpha')} className="w-full h-2 rounded-lg appearance-none cursor-pointer color-slider" style={{ backgroundImage: `linear-gradient(to right, rgba(${node.red || 0}, ${node.green || 0}, ${node.blue || 0}, 0), rgba(${node.red || 0}, ${node.green || 0}, ${node.blue || 0}, 1)), linear-gradient(45deg, #666666 25%, transparent 25%, transparent 75%, #666666 75%, #666666), linear-gradient(45deg, #666666 25%, transparent 25%, transparent 75%, #666666 75%, #666666)`, backgroundSize: '100% 100%, 8px 8px, 8px 8px', backgroundPosition: '0 0, 0 0, 4px 4px', backgroundColor: '#999999', '--slider-thumb-color': `rgba(${node.red || 0}, ${node.green || 0}, ${node.blue || 0}, ${(node.alpha ?? 100) / 100})`, opacity: isChannelAdvanced('alpha') ? 0.3 : 1 } as React.CSSProperties} />
              </div>)}
            </>
          );
        })()}

        {/* OKLCH Format */}
        {node.colorSpace === 'oklch' && (() => {
          return (
            <>
              {!isChannelHidden('oklchL') && (<div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <PropertyControls
                    property="Light"
                    isDiffEnabled={node.diffOklchL !== false}
                    isLocked={node.lockOklchL === true}
                    onToggleDiff={() => toggleDiff('OklchL')}
                    onToggleLock={() => toggleLock('OklchL')}
                    hasParent={node.parentId !== null}
                    hideControls={hasDifferentColorSpaceParent}
                    isAdvancedActive={isChannelAdvanced('oklchL')}
                    {...dp.oklchL}
                  />
                  <div className="flex items-center gap-1">
                    {isChannelAdvanced('oklchL') && (
                      <FxButton nodeId={node.id} channelKey="oklchL" />
                    )}
                    <ScrubberInput
                      value={Math.round(effectiveColors.oklchL || 0)}
                      min={getSliderRange('oklchL', 0, 100).min}
                      max={getSliderRange('oklchL', 0, 100).max}
                      onChange={handleOklchLChange}
                      onMouseDown={(e) => e.stopPropagation()}
                      className="w-16 h-7 text-sm"
                      disabled={isChannelAdvanced('oklchL')}
                    />
                  </div>
                </div>
                <div style={{ opacity: isChannelAdvanced('oklchL') ? 0.3 : 1, pointerEvents: isChannelAdvanced('oklchL') ? 'none' : undefined }}>
                  <OklchGamutSlider
                    type="lightness"
                    value={effectiveColors.oklchL || 0}
                    lightness={effectiveColors.oklchL || 0}
                    chroma={effectiveColors.oklchC || 0}
                    hue={effectiveColors.oklchH || 0}
                    onChange={handleOklchLChange}
                    onMouseDown={(e) => e.stopPropagation()}
                    onMouseMove={(e) => e.stopPropagation()}
                    disabled={isChannelAdvanced('oklchL')}
                  />
                </div>
              </div>)}
              {!isChannelHidden('oklchC') && (<div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1">
                    <PropertyControls property="Chroma" isDiffEnabled={node.diffOklchC !== false} isLocked={node.lockOklchC === true} onToggleDiff={() => toggleDiff('OklchC')} onToggleLock={() => toggleLock('OklchC')} hasParent={node.parentId !== null} hideControls={hasDifferentColorSpaceParent} isAdvancedActive={isChannelAdvanced('oklchC')} {...dp.oklchC} />
                    <span className="text-[11px] text-subtle" title="Actual range: 0-0.4">(0-{((effectiveColors.oklchC || 0) / 100 * 0.4).toFixed(2)})</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {isChannelAdvanced('oklchC') && (<FxButton nodeId={node.id} channelKey="oklchC" />)}
                    <ScrubberInput value={Math.round(effectiveColors.oklchC || 0)} min={getSliderRange('oklchC', 0, 100).min} max={getSliderRange('oklchC', 0, 100).max} onChange={handleOklchCChange} onMouseDown={(e) => e.stopPropagation()} className="w-16 h-7 text-sm" disabled={isChannelAdvanced('oklchC')} />
                  </div>
                </div>
                <div style={{ opacity: isChannelAdvanced('oklchC') ? 0.3 : 1, pointerEvents: isChannelAdvanced('oklchC') ? 'none' : undefined }}>
                  <OklchGamutSlider
                    type="chroma"
                    value={effectiveColors.oklchC || 0}
                    lightness={effectiveColors.oklchL || 0}
                    chroma={effectiveColors.oklchC || 0}
                    hue={effectiveColors.oklchH || 0}
                    onChange={handleOklchCChange}
                    onMouseDown={(e) => e.stopPropagation()}
                    onMouseMove={(e) => e.stopPropagation()}
                    disabled={isChannelAdvanced('oklchC')}
                  />
                </div>
              </div>)}
              {!isChannelHidden('oklchH') && (<div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <PropertyControls property="Hue" isDiffEnabled={node.diffOklchH !== false} isLocked={node.lockOklchH === true} onToggleDiff={() => toggleDiff('OklchH')} onToggleLock={() => toggleLock('OklchH')} hasParent={node.parentId !== null} hideControls={hasDifferentColorSpaceParent} isAdvancedActive={isChannelAdvanced('oklchH')} {...dp.oklchH} />
                  <div className="flex items-center gap-1">
                    {isChannelAdvanced('oklchH') && (<FxButton nodeId={node.id} channelKey="oklchH" />)}
                    <ScrubberInput value={Math.round(effectiveColors.oklchH || 0)} min={getSliderRange('oklchH', 0, 360).min} max={getSliderRange('oklchH', 0, 360).max} onChange={handleOklchHChange} onMouseDown={(e) => e.stopPropagation()} className="w-16 h-7 text-sm" disabled={isChannelAdvanced('oklchH')} />
                  </div>
                </div>
                <div style={{ opacity: isChannelAdvanced('oklchH') ? 0.3 : 1, pointerEvents: isChannelAdvanced('oklchH') ? 'none' : undefined }}>
                  <OklchGamutSlider type="hue" value={effectiveColors.oklchH || 0} lightness={effectiveColors.oklchL || 0} chroma={effectiveColors.oklchC || 0} hue={effectiveColors.oklchH || 0} onChange={handleOklchHChange} onMouseDown={(e) => e.stopPropagation()} onMouseMove={(e) => e.stopPropagation()} disabled={isChannelAdvanced('oklchH')} />
                </div>
              </div>)}
              {!isChannelHidden('alpha') && (<div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <PropertyControls property="Alpha" isDiffEnabled={node.diffAlpha !== false} isLocked={node.lockAlpha === true} onToggleDiff={() => toggleDiff('Alpha')} onToggleLock={() => toggleLock('Alpha')} hasParent={node.parentId !== null} hideControls={hasDifferentColorSpaceParent} isAdvancedActive={isChannelAdvanced('alpha')} {...dp.alpha} />
                  <div className="flex items-center gap-1">
                    {isChannelAdvanced('alpha') && (<FxButton nodeId={node.id} channelKey="alpha" />)}
                    <ScrubberInput value={node.alpha ?? 100} min={getSliderRange('alpha', 0, 100).min} max={getSliderRange('alpha', 0, 100).max} onChange={handleAlphaChange} onMouseDown={(e) => e.stopPropagation()} className="w-16 h-7 text-sm" disabled={isChannelAdvanced('alpha')} />
                  </div>
                </div>
                <input type="range" min={getSliderRange('alpha', 0, 100).min} max={getSliderRange('alpha', 0, 100).max} value={node.alpha ?? 100} onChange={(e) => handleAlphaChange(Number(e.target.value))} onMouseDown={(e) => e.stopPropagation()} onMouseMove={(e) => e.stopPropagation()} disabled={isChannelAdvanced('alpha')} className="w-full h-2 rounded-lg appearance-none cursor-pointer color-slider" style={{ backgroundImage: `linear-gradient(to right, oklch(${effectiveColors.oklchL || 0}% ${(effectiveColors.oklchC || 0) / 100 * 0.4} ${effectiveColors.oklchH || 0}deg / 0), oklch(${effectiveColors.oklchL || 0}% ${(effectiveColors.oklchC || 0) / 100 * 0.4} ${effectiveColors.oklchH || 0}deg / 1)), linear-gradient(45deg, #666666 25%, transparent 25%, transparent 75%, #666666 75%, #666666), linear-gradient(45deg, #666666 25%, transparent 25%, transparent 75%, #666666 75%, #666666)`, backgroundSize: '100% 100%, 8px 8px, 8px 8px', backgroundPosition: '0 0, 0 0, 4px 4px', backgroundColor: '#999999', '--slider-thumb-color': `oklch(${(effectiveColors.oklchL || 0)}% ${(effectiveColors.oklchC || 0) / 100 * 0.4} ${effectiveColors.oklchH || 0}deg / ${(node.alpha ?? 100) / 100})`, opacity: isChannelAdvanced('alpha') ? 0.3 : 1 } as React.CSSProperties} />
              </div>)}
            </>
          );
        })()}

        {/* HCT Format */}
        {node.colorSpace === 'hct' && (() => {
          const hctMaxChroma = getMaxChroma(effectiveColors.hctH || 0, effectiveColors.hctT || 0);
          const clampedChroma = Math.min(effectiveColors.hctC || 0, hctMaxChroma);

          return (
            <>
              {!isChannelHidden('hctH') && (<div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <PropertyControls property="Hue" isDiffEnabled={node.diffHctH !== false} isLocked={node.lockHctH === true} onToggleDiff={() => toggleDiff('HctH')} onToggleLock={() => toggleLock('HctH')} hasParent={node.parentId !== null} hideControls={hasDifferentColorSpaceParent} isAdvancedActive={isChannelAdvanced('hctH')} {...dp.hctH} />
                  <div className="flex items-center gap-1">
                    {isChannelAdvanced('hctH') && (<FxButton nodeId={node.id} channelKey="hctH" />)}
                    <ScrubberInput ref={hctHueInputRef} value={Math.round(effectiveColors.hctH || 0)} min={getSliderRange('hctH', 0, 360).min} max={getSliderRange('hctH', 0, 360).max} onChange={handleHctHChange} onMouseDown={(e) => e.stopPropagation()} className="w-16 h-7 text-sm" disabled={isChannelAdvanced('hctH')} />
                  </div>
                </div>
                <input type="range" min={getSliderRange('hctH', 0, 360).min} max={getSliderRange('hctH', 0, 360).max} value={effectiveColors.hctH || 0} onChange={(e) => handleHctHChange(Number(e.target.value))} onMouseDown={(e) => e.stopPropagation()} onMouseMove={(e) => e.stopPropagation()} disabled={isChannelAdvanced('hctH')} className="w-full h-2 rounded-lg appearance-none cursor-pointer color-slider" style={{ background: generateHctHueGradient(effectiveColors.hctC || 0, effectiveColors.hctT || 0), '--slider-thumb-color': (() => { const rgb = hctToRgb(effectiveColors.hctH || 0, effectiveColors.hctC || 0, effectiveColors.hctT || 0); return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${(effectiveColors.alpha ?? 100) / 100})`; })(), opacity: isChannelAdvanced('hctH') ? 0.3 : 1 } as React.CSSProperties} />
              </div>)}
              {!isChannelHidden('hctC') && (<div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <PropertyControls property="Chroma" isDiffEnabled={node.diffHctC !== false} isLocked={node.lockHctC === true} onToggleDiff={() => toggleDiff('HctC')} onToggleLock={() => toggleLock('HctC')} hasParent={node.parentId !== null} hideControls={hasDifferentColorSpaceParent} isAdvancedActive={isChannelAdvanced('hctC')} {...dp.hctC} />
                  <div className="flex items-center gap-1">
                    {isChannelAdvanced('hctC') && (<FxButton nodeId={node.id} channelKey="hctC" />)}
                    <ScrubberInput ref={hctChromaInputRef} value={Math.round(clampedChroma)} min={getSliderRange('hctC', 0, Math.round(hctMaxChroma)).min} max={Math.min(getSliderRange('hctC', 0, 120).max, Math.round(hctMaxChroma))} onChange={handleHctCChange} onMouseDown={(e) => e.stopPropagation()} className="w-16 h-7 text-sm" disabled={isChannelAdvanced('hctC')} />
                  </div>
                </div>
                <input type="range" min={getSliderRange('hctC', 0, 120).min} max={Math.min(getSliderRange('hctC', 0, 120).max, hctMaxChroma)} step="0.1" value={clampedChroma} onChange={(e) => handleHctCChange(Number(e.target.value))} onMouseDown={(e) => e.stopPropagation()} onMouseMove={(e) => e.stopPropagation()} disabled={isChannelAdvanced('hctC')} className="w-full h-2 rounded-lg appearance-none cursor-pointer color-slider" style={{ background: generateHctChromaGradient(effectiveColors.hctH || 0, effectiveColors.hctT || 0, hctMaxChroma), '--slider-thumb-color': (() => { const rgb = hctToRgb(effectiveColors.hctH || 0, clampedChroma, effectiveColors.hctT || 0); return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${(effectiveColors.alpha ?? 100) / 100})`; })(), opacity: isChannelAdvanced('hctC') ? 0.3 : 1 } as React.CSSProperties} />
              </div>)}
              {!isChannelHidden('hctT') && (<div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <PropertyControls property="Tone" isDiffEnabled={node.diffHctT !== false} isLocked={node.lockHctT === true} onToggleDiff={() => toggleDiff('HctT')} onToggleLock={() => toggleLock('HctT')} hasParent={node.parentId !== null} hideControls={hasDifferentColorSpaceParent} isAdvancedActive={isChannelAdvanced('hctT')} {...dp.hctT} />
                  <div className="flex items-center gap-1">
                    {isChannelAdvanced('hctT') && (<FxButton nodeId={node.id} channelKey="hctT" />)}
                    <ScrubberInput ref={hctToneInputRef} value={Math.round(effectiveColors.hctT || 0)} min={getSliderRange('hctT', 0, 100).min} max={getSliderRange('hctT', 0, 100).max} onChange={handleHctTChange} onMouseDown={(e) => e.stopPropagation()} className="w-16 h-7 text-sm" disabled={isChannelAdvanced('hctT')} />
                  </div>
                </div>
                <input type="range" min={getSliderRange('hctT', 0, 100).min} max={getSliderRange('hctT', 0, 100).max} step="0.1" value={effectiveColors.hctT || 0} onChange={(e) => handleHctTChange(Number(e.target.value))} onMouseDown={(e) => e.stopPropagation()} onMouseMove={(e) => e.stopPropagation()} disabled={isChannelAdvanced('hctT')} className="w-full h-2 rounded-lg appearance-none cursor-pointer color-slider" style={{ background: generateHctToneGradient(effectiveColors.hctH || 0, effectiveColors.hctC || 0), '--slider-thumb-color': (() => { const rgb = hctToRgb(effectiveColors.hctH || 0, effectiveColors.hctC || 0, effectiveColors.hctT || 0); return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${(effectiveColors.alpha ?? 100) / 100})`; })(), opacity: isChannelAdvanced('hctT') ? 0.3 : 1 } as React.CSSProperties} />
              </div>)}
              {!isChannelHidden('alpha') && (<div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <PropertyControls property="Alpha" isDiffEnabled={node.diffAlpha !== false} isLocked={node.lockAlpha === true} onToggleDiff={() => toggleDiff('Alpha')} onToggleLock={() => toggleLock('Alpha')} hasParent={node.parentId !== null} hideControls={hasDifferentColorSpaceParent} isAdvancedActive={isChannelAdvanced('alpha')} {...dp.alpha} />
                  <div className="flex items-center gap-1">
                    {isChannelAdvanced('alpha') && (<FxButton nodeId={node.id} channelKey="alpha" />)}
                    <ScrubberInput value={node.alpha ?? 100} min={getSliderRange('alpha', 0, 100).min} max={getSliderRange('alpha', 0, 100).max} onChange={handleAlphaChange} onMouseDown={(e) => e.stopPropagation()} className="w-16 h-7 text-sm" disabled={isChannelAdvanced('alpha')} />
                  </div>
                </div>
                <input type="range" min={getSliderRange('alpha', 0, 100).min} max={getSliderRange('alpha', 0, 100).max} value={node.alpha ?? 100} onChange={(e) => handleAlphaChange(Number(e.target.value))} onMouseDown={(e) => e.stopPropagation()} onMouseMove={(e) => e.stopPropagation()} disabled={isChannelAdvanced('alpha')} className="w-full h-2 rounded-lg appearance-none cursor-pointer color-slider" style={{ backgroundImage: `linear-gradient(to right, hsl(${node.hctH || 0}, ${(node.hctC || 0)}%, ${(node.hctT || 0)}% / 0), hsl(${node.hctH || 0}, ${(node.hctC || 0)}%, ${(node.hctT || 0)}% / 1)), linear-gradient(45deg, #666666 25%, transparent 25%, transparent 75%, #666666 75%, #666666), linear-gradient(45deg, #666666 25%, transparent 25%, transparent 75%, #666666 75%, #666666)`, backgroundSize: '100% 100%, 8px 8px, 8px 8px', backgroundPosition: '0 0, 0 0, 4px 4px', backgroundColor: '#999999', '--slider-thumb-color': `hsl(${(node.hctH || 0)}, ${(node.hctC || 0)}%, ${(node.hctT || 0)}% / ${(node.alpha ?? 100) / 100})`, opacity: isChannelAdvanced('alpha') ? 0.3 : 1 } as React.CSSProperties} />
              </div>)}
            </>
          );
        })()}


        </div>
        </CollapsibleContent>

        {/* Design Token Assignment - Always visible (hidden for palette shades since they ARE tokens) */}
        {/* Also hidden when Node View config hides token section AND no tokens are assigned */}
        {!isPaletteShade && !(isChannelHidden('_tokenSection') && getNodeTokenIds(node).length === 0) && (
        <div 
          className={`p-[0px] space-y-2 relative ${isTokenSectionDimmed ? 'transition-opacity duration-200' : ''}`}
          style={tokenDimOpacity !== undefined ? { opacity: tokenDimOpacity } : undefined}
          onMouseEnter={() => { if (tokenNeedsHover) setHoveredSection('token'); }}
          onMouseLeave={() => { if (hoveredSection === 'token') setHoveredSection(null); }}
        >
          {/* Token inheritance toggle — always visible on non-primary themes */}
          {/* Checked = inherited (no changes), cannot be toggled off manually */}
          {/* Unchecked = modified, toggling ON reverts to primary's assignments & values */}
          {!isPrimaryTheme && (
            <div
              className="flex items-center gap-1.5 pb-1.5 pt-0.5 pl-[0px] pr-[11px] pt-[1px] pb-[3px]"
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {/* Crown icon — golden filled when inherited, blue outline when modified */}
              <Crown
                className={`h-3 w-3 shrink-0 transition-all ${
                  hasAnyTokenChanges
                    ? 'text-brand fill-brand'
                    : 'text-warning fill-warning'
                }`}
              />
              <Switch
                checked={!hasAnyTokenChanges}
                onCheckedChange={() => {
                  // Only allow toggling ON (revert) — toggling OFF happens automatically via edits
                  if (hasAnyTokenChanges) {
                    handleRevertTokensToPrimary();
                  }
                }}
                disabled={!hasAnyTokenChanges}
                className="data-[state=checked]:bg-[#EFB100] data-[state=unchecked]:bg-border dark:data-[state=unchecked]:bg-border h-[16px] w-[30px] shrink-0 disabled:opacity-100 disabled:cursor-default"
              />
              <span className={`text-[11px] select-none transition-colors ${hasAnyTokenChanges ? 'text-subtle' : 'text-faint'}`}>
                {hasAnyTokenChanges ? 'Tokens modified' : 'Tokens inherited'}
              </span>
            </div>
          )}
          {/* Render existing token assignments */}
          {(() => {
            const nodeTokenIds = getNodeTokenIds(node);
            // Check if parent has auto-assign enabled — Zap icon only shows when parent's toggle is ON
            const parentNode = node.parentId ? nodes.find(n => n.id === node.parentId) : null;
            const parentAutoAssignActive = !!parentNode?.autoAssignEnabled;
            return nodeTokenIds.length > 0 && nodeTokenIds.map((assignedTokenId, index) => {
              const assignedToken = tokens.find(t => t.id === assignedTokenId);
              if (!assignedToken) return null;
            
            // Use theme-specific values, falling back to legacy properties
            const _tv0 = activeThemeId && assignedToken.themeValues?.[activeThemeId];
            const _h0 = (_tv0 && _tv0.hue !== undefined) ? _tv0.hue : (assignedToken.hue ?? 0);
            const _s0 = (_tv0 && _tv0.saturation !== undefined) ? _tv0.saturation : (assignedToken.saturation ?? 0);
            const _l0 = (_tv0 && _tv0.lightness !== undefined) ? _tv0.lightness : (assignedToken.lightness ?? 0);
            const hslValue = `hsl(${Math.round(_h0)}, ${Math.round(_s0)}%, ${Math.round(_l0)}%)`;
            
            const isAutoAssigned = isPrimaryTheme && parentAutoAssignActive && node.autoAssignedTokenId === assignedTokenId;
            
            return (
              <div key={assignedTokenId} className="flex items-center gap-2">
                <div className="flex-1 flex items-center gap-2 h-8 px-3 rounded-[8px] bg-secondary text-foreground min-w-0">
                  <Tag className="w-3 h-3 text-muted-foreground shrink-0" />
                  <span className="truncate text-xs min-w-0">{assignedToken.name}</span>
                  {isAutoAssigned && (
                    <Zap className="w-3 h-3 text-brand shrink-0 fill-current ml-auto" />
                  )}
                </div>
                {!readOnly && (
                <Tip label={isAutoAssigned ? "Delete Auto-assigned Token" : "Remove Token"} side="top">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect();
                    handleTokenRemoveClick(assignedTokenId);
                  }}
                  className="p-1 hover:bg-hairline rounded transition-colors shrink-0"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <Trash2 className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                </button>
                </Tip>
                )}
              </div>
            );
          });
          })()}
          
          {/* Add new token button — hidden in readOnly mode */}
          {!readOnly && (
          <div className="flex items-center gap-2">
            <Popover open={tokenComboOpenIndex === -1} onOpenChange={(open) => setTokenComboOpenIndex(open ? -1 : null)}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={tokenComboOpenIndex === -1}
                  className="flex-1 h-8 justify-between text-xs overflow-hidden bg-secondary border-secondary text-foreground hover:bg-line hover:text-foreground"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={() => onSelect()}
                >
                  <span className="text-subtle">Select token...</span>
                  <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
                <PopoverContent 
                  className="w-[240px] p-0 bg-secondary border-secondary"
                  side="bottom"
                  align="start"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  {/* ── Informational page scope bar ── */}
                  {pages.length > 0 && (
                    <div className="px-1.5 pt-1.5">
                      <div className="flex items-center rounded-lg bg-[#0e0e0e] p-[3px]">
                        <span className="shrink-0 px-2 py-[3px] rounded-md text-[11px] bg-elevated text-foreground shadow-sm">
                          This page
                        </span>
                      </div>
                    </div>
                  )}
                  <Command className="bg-secondary" filter={(value, search, keywords) => {
                    if (!search.trim()) return 1;
                    const searchable = [value, ...(keywords || [])].join(' ').toLowerCase();
                    const words = search.toLowerCase().trim().split(/\s+/);
                    return words.every(w => searchable.includes(w)) ? 1 : 0;
                  }} loop={false}>
                    <CommandInput
                      placeholder="Search tokens..."
                      className="h-9 text-xs bg-[#0e0e0e] pl-[10px] mx-1.5 mt-1 mb-1 rounded-md text-foreground placeholder:text-dim focus-visible:outline-none focus-visible:ring-0"
                    />
                    <CommandList className="pb-[5px] max-h-[280px]" onScroll={() => { if (reassignHoverTimeoutRef.current) clearTimeout(reassignHoverTimeoutRef.current); if (reassignPopover) setReassignPopover(null); }}>
                      <CommandEmpty className="py-6 text-xs text-center text-subtle">
                        {tokens.length === 0 ? (
                          <>
                            No tokens available.<br />
                            Create one in the panel.
                          </>
                        ) : (
                          'No tokens found.'
                        )}
                      </CommandEmpty>
                      
                      {/* Grouped tokens - each group as a separate CommandGroup */}
                      {(() => {
                        // Filter out palette groups and their tokens
                        const paletteGroupIds = new Set(groups.filter(g => g.isPaletteEntry).map(g => g.id));
                        
                        // Collect token IDs owned by token nodes — these cannot be assigned to color nodes
                        const tokenNodeOwnedTokenIds = new Set<string>();
                        nodes.forEach(n => {
                          if (!n.isTokenNode || n.isTokenPrefix) return;
                          if (n.pageId !== node.pageId) return;
                          if (n.ownTokenId) tokenNodeOwnedTokenIds.add(n.ownTokenId);
                        });
                        
                        // Filter out palette groups and token node groups
                        const nonPaletteGroups = groups.filter(g => !g.isPaletteEntry && !g.isTokenNodeGroup);
                        
                        return nonPaletteGroups.map((group) => {
                          const groupTokens = tokens.filter(t => t.groupId === group.id && !paletteGroupIds.has(t.groupId || '') && t.pageId === node.pageId && !tokenNodeOwnedTokenIds.has(t.id));
                        if (groupTokens.length === 0) return null;
                        
                        return (
                          <CommandGroup 
                            key={group.id} 
                            heading={group.name}
                            className="[&_[cmdk-group-heading]]:!hidden p-0"
                          >
                            <div className="flex items-center text-xs text-subtle font-semibold sticky top-0 z-10 bg-secondary pl-[10px] pr-2 py-1.5">
                              <span className="inline-flex items-center gap-[5px] bg-white/[0.035] rounded-[5px] px-[6px] py-[1px]">
                                {group.name}
                              </span>
                            </div>
                            {groupTokens.map((token) => {
                              // Use theme-specific values for color display
                              const _tv1 = activeThemeId && token.themeValues?.[activeThemeId];
                              const _isEmpty1 = _tv1 ? (_tv1.hue === undefined && _tv1.saturation === undefined && _tv1.lightness === undefined) : (token.hue === undefined && token.saturation === undefined && token.lightness === undefined);
                              const _h1 = (_tv1 && _tv1.hue !== undefined) ? _tv1.hue : (token.hue ?? 0);
                              const _s1 = (_tv1 && _tv1.saturation !== undefined) ? _tv1.saturation : (token.saturation ?? 0);
                              const _l1 = (_tv1 && _tv1.lightness !== undefined) ? _tv1.lightness : (token.lightness ?? 0);
                              const hslValue = _isEmpty1 ? 'transparent' : `hsl(${Math.round(_h1)}, ${Math.round(_s1)}%, ${Math.round(_l1)}%)`;
                              const hexValue1 = _isEmpty1 ? '' : hslToHex(_h1, _s1, _l1);
                              const assignedNode = nodes.find(n => !n.isTokenNode && !n.isSpacing && !n.isPalette && getNodeTokenIds(n).includes(token.id) && n.id !== node.id && n.pageId === node.pageId);
                              const isAlreadyAssigned = !!assignedNode;
                              
                              const isCurrentlyAssigned = getNodeTokenIds(node).includes(token.id);
                              const isAssignedToAnyNode = isCurrentlyAssigned || isAlreadyAssigned || nodes.some(n => !n.isTokenNode && !n.isSpacing && !n.isPalette && getNodeTokenIds(n).includes(token.id));
                              
                              const isReassignPopoverOpen = reassignPopover?.tokenId === token.id && reassignPopover?.open;
                              
                              // Build search-friendly value: group + token name + hex + numbers
                              const numbers1 = token.name.match(/\d+/g);
                              const searchKeywords1 = [group.name, token.name, hexValue1, ...(numbers1 || [])];

                              return (
                                <div
                                  key={token.id}
                                  className="relative"
                                  onMouseEnter={() => {
                                    if (isAlreadyAssigned && assignedNode && !isCurrentlyAssigned) {
                                      if (reassignHoverTimeoutRef.current) clearTimeout(reassignHoverTimeoutRef.current);
                                      setReassignPopover({ tokenId: token.id, previousNodeId: assignedNode.id, open: true });
                                    }
                                  }}
                                  onMouseLeave={() => {
                                    if (isAlreadyAssigned && !isCurrentlyAssigned && isReassignPopoverOpen) {
                                      reassignHoverTimeoutRef.current = setTimeout(() => setReassignPopover(null), 200);
                                    }
                                  }}
                                >
                                  <CommandItem
                                    value={token.id}
                                    keywords={searchKeywords1}
                                    onSelect={() => {
                                      onSelect();
                                      if (isCurrentlyAssigned) {
                                        onAssignToken(node.id, token.id, false);
                                        setTokenComboOpenIndex(null);
                                      } else if (isAlreadyAssigned && assignedNode) {
                                        setReassignPopover({ tokenId: token.id, previousNodeId: assignedNode.id, open: true });
                                      } else {
                                        onAssignToken(node.id, token.id, true);
                                        setTokenComboOpenIndex(null);
                                      }
                                    }}
                                    className={cn(
                                      "text-xs mx-1 group",
                                      "data-[selected=true]:bg-transparent hover:!bg-transparent"
                                    )}
                                  >
                                      <div className={cn(
                                        "flex items-center gap-2 flex-1 min-w-0 px-2 rounded-md py-[5px] transition-all duration-150",
                                        isCurrentlyAssigned
                                          ? "bg-hairline ring-1 ring-hairline"
                                          : isAlreadyAssigned && !isCurrentlyAssigned
                                            ? cn(
                                                "ring-1",
                                                isReassignPopoverOpen
                                                  ? "bg-brand/[0.22] ring-brand/35"
                                                  : "bg-brand/[0.12] ring-brand/20 hover:bg-brand/[0.20] hover:ring-brand/30"
                                              )
                                            : "hover:bg-[#ffffff]/[0.05]"
                                      )}>
                                        <div
                                          className={cn("w-3.5 h-3.5 rounded-[3px] shrink-0", (!isAssignedToAnyNode || _isEmpty1) && "border border-dashed border-elevated/40 opacity-40")}
                                          style={{ backgroundColor: (isAssignedToAnyNode && !_isEmpty1) ? hslValue : 'transparent' }}
                                        />
                                        <div className="flex flex-col min-w-0 flex-1">
                                          <span className={cn("truncate transition-colors", isCurrentlyAssigned ? "text-foreground" : isAlreadyAssigned ? "text-foreground" : "text-foreground group-hover:text-foreground")}>{token.name}</span>
                                        </div>
                                        {isCurrentlyAssigned && !isAlreadyAssigned && (
                                          <Check className="h-3.5 w-3.5 shrink-0 text-foreground" />
                                        )}
                                        {/* Spacer for the absolutely-positioned navigate button */}
                                        {isAlreadyAssigned && assignedNode && (
                                          <div className="w-5 shrink-0" />
                                        )}
                                      </div>
                                    </CommandItem>
                                  {/* Navigate button OUTSIDE CommandItem to bypass cmdk event capture */}
                                  {isAlreadyAssigned && assignedNode && (
                                    <Tip label="Navigate to assigned node" side="left">
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          e.preventDefault();
                                          window.dispatchEvent(new CustomEvent('saveTokenNavBackState', {
                                            detail: { sourceNodeId: node.id }
                                          }));
                                          setTokenComboOpenIndex(null);
                                          onNavigateToNode(assignedNode.id);
                                        }}
                                        onPointerDown={(e) => e.stopPropagation()}
                                        className="absolute right-[14px] top-1/2 -translate-y-1/2 z-10 p-0.5 hover:bg-[#ffffff]/[0.1] rounded transition-colors cursor-pointer"
                                      >
                                        <Target className="h-3.5 w-3.5 text-brand" />
                                      </button>
                                    </Tip>
                                  )}
                                  {isAlreadyAssigned && assignedNode && !isCurrentlyAssigned && isReassignPopoverOpen && (
                                    <Popover open={isReassignPopoverOpen} onOpenChange={(open) => {
                                      if (!open) {
                                        if (reassignHoverTimeoutRef.current) clearTimeout(reassignHoverTimeoutRef.current);
                                        setReassignPopover(null);
                                      }
                                    }}>
                                      <PopoverTrigger asChild>
                                        <div className="absolute inset-0 pointer-events-none" />
                                      </PopoverTrigger>
                                      <PopoverContent 
                                        className="w-72 border-elevated p-0 shadow-[0_8px_30px_rgba(0,0,0,0.5)]"
                                        style={{ backgroundColor: 'var(--secondary)' }}
                                        side="right" 
                                        align="start"
                                        sideOffset={8}
                                        onClick={(e) => e.stopPropagation()}
                                        onMouseEnter={() => {
                                          if (reassignHoverTimeoutRef.current) clearTimeout(reassignHoverTimeoutRef.current);
                                        }}
                                        onMouseLeave={() => {
                                          reassignHoverTimeoutRef.current = setTimeout(() => setReassignPopover(null), 150);
                                        }}
                                        onOpenAutoFocus={(e) => e.preventDefault()}
                                        onCloseAutoFocus={(e) => e.preventDefault()}
                                      >
                                        <div className="p-1.5">
                                          <button
                                            onClick={() => {
                                              onAssignToken(node.id, token.id, true);
                                              setTokenComboOpenIndex(null);
                                              setReassignPopover(null);
                                            }}
                                            className="w-full flex items-center gap-2.5 px-2.5 py-2 text-xs text-foreground hover:bg-hairline rounded-md transition-colors cursor-pointer"
                                          >
                                            <Link2 className="h-4 w-4 text-brand shrink-0" />
                                            <span>Reassign to this node</span>
                                          </button>
                                        </div>
                                        <div className="px-4 pb-3 pt-1 text-xs">
                                          <p className="text-faint mb-2 leading-relaxed">
                                            This variable is already assigned to another node. Reassigning it will remove it from that node.
                                          </p>
                                          <p className="text-faint">
                                            Previous node: <span className="font-mono text-[#FFB800]">{hslToHex(assignedNode.hue, assignedNode.saturation, assignedNode.lightness)}</span>
                                          </p>
                                        </div>
                                      </PopoverContent>
                                    </Popover>
                                  )}
                                </div>
                              );
                            })}
                          </CommandGroup>
                        );
                        });
                      })()}
                      
                      {/* Ungrouped tokens */}
                      {(() => {
                        // Also filter out tokens owned by token nodes
                        const tokenNodeOwnedTokenIds = new Set<string>();
                        nodes.forEach(n => {
                          if (!n.isTokenNode || n.isTokenPrefix) return;
                          if (n.pageId !== node.pageId) return;
                          if (n.ownTokenId) tokenNodeOwnedTokenIds.add(n.ownTokenId);
                        });
                        const ungroupedTokens = tokens.filter(t => !t.groupId && t.pageId === node.pageId && !tokenNodeOwnedTokenIds.has(t.id));
                        if (ungroupedTokens.length === 0) return null;
                        
                        return (
                          <CommandGroup 
                            heading="Others"
                            className="[&_[cmdk-group-heading]]:!hidden p-0"
                          >
                            <div className="flex items-center text-xs text-subtle font-semibold sticky top-0 z-10 bg-secondary pl-[10px] pr-2 py-1.5">
                              <span className="inline-flex items-center gap-[5px] bg-white/[0.035] rounded-[5px] px-[6px] py-[1px]">
                                Others
                              </span>
                            </div>
                            {ungroupedTokens.map((token) => {
                              // Use theme-specific values for color display
                              const _tv2 = activeThemeId && token.themeValues?.[activeThemeId];
                              const _isEmpty2 = _tv2 ? (_tv2.hue === undefined && _tv2.saturation === undefined && _tv2.lightness === undefined) : (token.hue === undefined && token.saturation === undefined && token.lightness === undefined);
                              const _h2 = (_tv2 && _tv2.hue !== undefined) ? _tv2.hue : (token.hue ?? 0);
                              const _s2 = (_tv2 && _tv2.saturation !== undefined) ? _tv2.saturation : (token.saturation ?? 0);
                              const _l2 = (_tv2 && _tv2.lightness !== undefined) ? _tv2.lightness : (token.lightness ?? 0);
                              const hslValue = _isEmpty2 ? 'transparent' : `hsl(${Math.round(_h2)}, ${Math.round(_s2)}%, ${Math.round(_l2)}%)`;
                              const hexValue2 = _isEmpty2 ? '' : hslToHex(_h2, _s2, _l2);
                              const assignedNode = nodes.find(n => !n.isTokenNode && !n.isSpacing && !n.isPalette && getNodeTokenIds(n).includes(token.id) && n.id !== node.id && n.pageId === node.pageId);
                              const isAlreadyAssigned = !!assignedNode;
                              const isCurrentlyAssigned = getNodeTokenIds(node).includes(token.id);
                              const isAssignedToAnyNode = isCurrentlyAssigned || isAlreadyAssigned || nodes.some(n => !n.isTokenNode && !n.isSpacing && !n.isPalette && getNodeTokenIds(n).includes(token.id));
                              
                              const isReassignPopoverOpen = reassignPopover?.tokenId === token.id && reassignPopover?.open;
                              
                              // Build search-friendly keywords
                              const numbers2 = token.name.match(/\d+/g);
                              const searchKeywords2 = ['Others', token.name, hexValue2, ...(numbers2 || [])];

                              return (
                                <div
                                  key={token.id}
                                  className="relative"
                                  onMouseEnter={() => {
                                    if (isAlreadyAssigned && assignedNode && !isCurrentlyAssigned) {
                                      if (reassignHoverTimeoutRef.current) clearTimeout(reassignHoverTimeoutRef.current);
                                      setReassignPopover({ tokenId: token.id, previousNodeId: assignedNode.id, open: true });
                                    }
                                  }}
                                  onMouseLeave={() => {
                                    if (isAlreadyAssigned && !isCurrentlyAssigned && isReassignPopoverOpen) {
                                      reassignHoverTimeoutRef.current = setTimeout(() => setReassignPopover(null), 200);
                                    }
                                  }}
                                >
                                  <CommandItem
                                    value={token.id}
                                    keywords={searchKeywords2}
                                    onSelect={() => {
                                      onSelect();
                                      if (isCurrentlyAssigned) {
                                        onAssignToken(node.id, token.id, false);
                                        setTokenComboOpenIndex(null);
                                      } else if (isAlreadyAssigned && assignedNode) {
                                        setReassignPopover({ tokenId: token.id, previousNodeId: assignedNode.id, open: true });
                                      } else {
                                        onAssignToken(node.id, token.id, true);
                                        setTokenComboOpenIndex(null);
                                      }
                                    }}
                                    className={cn(
                                      "text-xs mx-1 group",
                                      "data-[selected=true]:bg-transparent hover:!bg-transparent"
                                    )}
                                  >
                                      <div className={cn(
                                        "flex items-center gap-2 flex-1 min-w-0 px-2 rounded-md py-[5px] transition-all duration-150",
                                        isCurrentlyAssigned
                                          ? "bg-hairline ring-1 ring-hairline"
                                          : isAlreadyAssigned && !isCurrentlyAssigned
                                            ? cn(
                                                "ring-1",
                                                isReassignPopoverOpen
                                                  ? "bg-brand/[0.22] ring-brand/35"
                                                  : "bg-brand/[0.12] ring-brand/20 hover:bg-brand/[0.20] hover:ring-brand/30"
                                              )
                                            : "hover:bg-[#ffffff]/[0.05]"
                                      )}>
                                        <div
                                          className={cn("w-3.5 h-3.5 rounded-[3px] shrink-0", (!isAssignedToAnyNode || _isEmpty2) && "border border-dashed border-elevated/40 opacity-40")}
                                          style={{ backgroundColor: (isAssignedToAnyNode && !_isEmpty2) ? hslValue : 'transparent' }}
                                        />
                                        <div className="flex flex-col min-w-0 flex-1">
                                          <span className={cn("truncate transition-colors", isCurrentlyAssigned ? "text-foreground" : isAlreadyAssigned ? "text-foreground" : "text-foreground group-hover:text-foreground")}>{token.name}</span>
                                        </div>
                                        {isCurrentlyAssigned && !isAlreadyAssigned && (
                                          <Check className="h-3.5 w-3.5 shrink-0 text-foreground" />
                                        )}
                                        {/* Spacer for the absolutely-positioned navigate button */}
                                        {isAlreadyAssigned && assignedNode && (
                                          <div className="w-5 shrink-0" />
                                        )}
                                      </div>
                                    </CommandItem>
                                  {/* Navigate button OUTSIDE CommandItem to bypass cmdk event capture */}
                                  {isAlreadyAssigned && assignedNode && (
                                    <Tip label="Navigate to assigned node" side="left">
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          e.preventDefault();
                                          window.dispatchEvent(new CustomEvent('saveTokenNavBackState', {
                                            detail: { sourceNodeId: node.id }
                                          }));
                                          setTokenComboOpenIndex(null);
                                          onNavigateToNode(assignedNode.id);
                                        }}
                                        onPointerDown={(e) => e.stopPropagation()}
                                        className="absolute right-[14px] top-1/2 -translate-y-1/2 z-10 p-0.5 hover:bg-[#ffffff]/[0.1] rounded transition-colors cursor-pointer"
                                      >
                                        <Target className="h-3.5 w-3.5 text-brand" />
                                      </button>
                                    </Tip>
                                  )}
                                  {isAlreadyAssigned && assignedNode && !isCurrentlyAssigned && isReassignPopoverOpen && (
                                    <Popover open={isReassignPopoverOpen} onOpenChange={(open) => {
                                      if (!open) {
                                        if (reassignHoverTimeoutRef.current) clearTimeout(reassignHoverTimeoutRef.current);
                                        setReassignPopover(null);
                                      }
                                    }}>
                                      <PopoverTrigger asChild>
                                        <div className="absolute inset-0 pointer-events-none" />
                                      </PopoverTrigger>
                                      <PopoverContent 
                                        className="w-72 border-elevated p-0 shadow-[0_8px_30px_rgba(0,0,0,0.5)]"
                                        style={{ backgroundColor: 'var(--secondary)' }}
                                        side="right" 
                                        align="start"
                                        sideOffset={8}
                                        onClick={(e) => e.stopPropagation()}
                                        onMouseEnter={() => {
                                          if (reassignHoverTimeoutRef.current) clearTimeout(reassignHoverTimeoutRef.current);
                                        }}
                                        onMouseLeave={() => {
                                          reassignHoverTimeoutRef.current = setTimeout(() => setReassignPopover(null), 150);
                                        }}
                                        onOpenAutoFocus={(e) => e.preventDefault()}
                                        onCloseAutoFocus={(e) => e.preventDefault()}
                                      >
                                        <div className="p-1.5">
                                          <button
                                            onClick={() => {
                                              onAssignToken(node.id, token.id, true);
                                              setTokenComboOpenIndex(null);
                                              setReassignPopover(null);
                                            }}
                                            className="w-full flex items-center gap-2.5 px-2.5 py-2 text-xs text-foreground hover:bg-hairline rounded-md transition-colors cursor-pointer"
                                          >
                                            <Link2 className="h-4 w-4 text-brand shrink-0" />
                                            <span>Reassign to this node</span>
                                          </button>
                                        </div>
                                        <div className="px-4 pb-3 pt-1 text-xs">
                                          <p className="text-faint mb-2 leading-relaxed">
                                            This variable is already assigned to another node. Reassigning it will remove it from that node.
                                          </p>
                                          <p className="text-faint">
                                            Previous node: <span className="font-mono text-[#FFB800]">{hslToHex(assignedNode.hue, assignedNode.saturation, assignedNode.lightness)}</span>
                                          </p>
                                        </div>
                                      </PopoverContent>
                                    </Popover>
                                  )}
                                </div>
                              );
                            })}
                          </CommandGroup>
                        );
                      })()}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          )}
        </div>
        )}
      </div>
      )}

      {/* Resize Handle */}
      <div
        className="absolute -bottom-px -right-px w-4 h-4 cursor-nwse-resize group z-10 bg-[rgba(91,91,91,0)]"
        onMouseDown={handleResizeMouseDown}
        title="Resize node"
      >
        <svg 
          className="absolute top-1/2 left-1/2 -translate-x-[calc(50%+1px)] -translate-y-[calc(50%+1px)] w-3 h-3 transition-colors" 
          viewBox="0 0 12 12" 
          fill="none"
          style={{ color: 'var(--secondary)' }}
        >
          <path d="M10 2L2 10M10 6L6 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </div>
    </Card>
    </Collapsible>

    {/* Advanced Island — shown when selected OR when any channel has active logic */}
    {(isSelected || activeAdvancedChannels.length > 0) && !isPaletteShade && (isPrimaryTheme || !isColorInherited) && (
      <div
        className="flex items-center justify-between px-4 py-[8px] rounded-[16px] mt-[2px]"
        style={{
          backgroundColor: '#0E0E0E',
          border: 'none',
          width: `${nodeWidth}px`,
        }}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <span className="text-[14px] text-dim select-none">Advanced</span>
          {activeAdvancedChannels.length > 0 && (
            <div className="flex items-center gap-[3px]">
              {activeAdvancedChannels.map(chKey => {
                const label = ({
                  hue: 'H', saturation: 'S', lightness: 'L', alpha: 'A',
                  red: 'R', green: 'G', blue: 'B',
                  oklchL: 'L', oklchC: 'C', oklchH: 'H',
                  hctH: 'H', hctC: 'C', hctT: 'T',
                } as Record<string, string>)[chKey] || chKey[0]?.toUpperCase();
                return (
                  <span
                    key={chKey}
                    className="text-[11px] font-mono w-[16px] h-[16px] flex items-center justify-center rounded select-none"
                    style={{
                      color: 'var(--success)',
                      backgroundColor: 'rgba(43,189,104,0.12)',
                      border: 'none',
                    }}
                  >
                    {label}
                  </span>
                );
              })}
            </div>
          )}
        </div>
        <button
          className="text-dim hover:text-subtle cursor-pointer transition-colors p-0.5 rounded hover:bg-white/[0.04]"
          onClick={(e) => {
            e.stopPropagation();
            window.dispatchEvent(new CustomEvent('openAdvancedPopup', { detail: { nodeId: node.id } }));
          }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 19a2 2 0 0 0 2 2c2 0 2 -4 3 -9s1 -9 3 -9a2 2 0 0 1 2 2" /><path d="M5 12h6" /><path d="M15 12l6 6" /><path d="M15 18l6 -6" /></svg>
        </button>
      </div>
    )}

    {/* Auto-assign Token Delete Confirmation Dialog */}
    <AlertDialog
      open={autoAssignDeleteDialog.open}
      onOpenChange={(open) => setAutoAssignDeleteDialog(prev => ({ ...prev, open }))}
    >
      <AlertDialogContent className="bg-card border-line max-w-[400px]">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-foreground flex items-center gap-2">
            <Zap size={14} className="text-brand" />
            Delete auto-assigned token?
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="text-muted-foreground space-y-3">
              <div>
                The token <span className="text-foreground font-mono text-[12px] bg-secondary px-1.5 py-0.5 rounded">
                  {autoAssignDeleteDialog.tokenName}
                </span> will be permanently deleted from the token panel.
              </div>
              <div className="text-[12px] text-subtle">
                This token was auto-assigned to node <span className="text-foreground">{node.referenceName || node.id.slice(0, 8)}</span>.
                It may be recreated if the parent node&apos;s auto-assign is re-applied.
              </div>
              <label className="flex items-start gap-2.5 cursor-pointer group bg-secondary rounded-lg px-3 py-2.5 border border-secondary hover:bg-secondary transition-colors">
                <div
                  className={`w-4 h-4 mt-[1px] rounded border flex items-center justify-center transition-colors shrink-0 ${
                    autoAssignDeleteDialog.excludeFromAutoAssign
                      ? 'bg-warning border-warning'
                      : 'border-dim group-hover:border-faint'
                  }`}
                  onClick={(e) => {
                    e.preventDefault();
                    setAutoAssignDeleteDialog(prev => ({
                      ...prev,
                      excludeFromAutoAssign: !prev.excludeFromAutoAssign,
                    }));
                  }}
                >
                  {autoAssignDeleteDialog.excludeFromAutoAssign && (
                    <Check size={10} className="text-card" />
                  )}
                </div>
                <div
                  onClick={(e) => {
                    e.preventDefault();
                    setAutoAssignDeleteDialog(prev => ({
                      ...prev,
                      excludeFromAutoAssign: !prev.excludeFromAutoAssign,
                    }));
                  }}
                >
                  <div className="text-[12px] text-foreground select-none">
                    Don&apos;t auto-assign token for this node
                  </div>
                  <div className="text-[11px] text-faint select-none mt-0.5">
                    Future re-apply or updates will skip this node
                  </div>
                </div>
              </label>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="bg-secondary border-secondary text-foreground hover:bg-line">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={confirmAutoAssignTokenDelete}
            className="bg-[#EA0B2D] text-white hover:bg-[#C00924]"
          >
            Delete Token
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    </div>
  );
}
