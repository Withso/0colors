import { useState, useRef, useEffect } from 'react';
import { ColorNode, DesignToken, TokenGroup } from './types';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Plus, X, Trash2, Move, Ruler, ChevronsUpDown, Target, GripVertical } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './ui/command';
import { cn } from './ui/utils';

interface SpacingNodeCardProps {
  node: ColorNode;
  nodes: ColorNode[];
  tokens: DesignToken[];
  groups: TokenGroup[];
  activeProjectId: string;
  onMouseDown: (e: React.MouseEvent) => void;
  onUpdateNode: (id: string, updates: Partial<ColorNode>) => void;
  onAddChild: (parentId: string) => void;
  onAddParent: (nodeId: string) => void;
  onDeleteNode: (id: string) => void;
  onUnlinkNode: (id: string) => void;
  onAssignToken: (nodeId: string, tokenId: string, isAssigned: boolean) => void;
  onAddToken: (name?: string, groupId?: string | null, projectId?: string) => void;
  onUpdateToken: (id: string, updates: Partial<DesignToken>) => void;
  isSelected: boolean;
  onSelect: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
  onWireStartDrag: (nodeId: string, buttonType: 'left' | 'right', event: React.MouseEvent) => void;
  onWireEndDrag: (nodeId: string) => void;
  onWireHover: (nodeId: string, isHovering: boolean) => void;
  isWireHovered: boolean;
  onColorPickerOpenChange?: (nodeId: string, isOpen: boolean) => void;
}

export function SpacingNodeCard({
  node,
  nodes,
  tokens,
  groups,
  activeProjectId,
  onMouseDown,
  onUpdateNode,
  onAddChild,
  onAddParent,
  onDeleteNode,
  onUnlinkNode,
  onAssignToken,
  onAddToken,
  onUpdateToken,
  isSelected,
  onSelect,
  onDoubleClick,
  onWireStartDrag,
  onWireEndDrag,
  onWireHover,
  isWireHovered,
  onColorPickerOpenChange,
}: SpacingNodeCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [tokenComboOpen, setTokenComboOpen] = useState(false);
  const [tempWidth, setTempWidth] = useState<number | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const resizeAnimationFrameRef = useRef<number | null>(null);

  const assignedTokens = tokens.filter(t => node.tokenIds?.includes(t.id));
  const spacingValue = node.spacingValue ?? 16;
  const spacingUnit = node.spacingUnit ?? 'px';

  // Show tokens that are either:
  // 1. Spacing tokens (type === 'spacing') from the current page
  // 2. Not assigned to ANY node (check all nodes) and from the current page
  const availableTokens = tokens.filter(t => {
    // Only show tokens from the current page
    if (t.pageId !== node.pageId) return false;
    
    // Always show spacing tokens
    if (t.type === 'spacing') return true;
    
    // Show tokens that are not assigned to any node
    const isAssignedToAnyNode = nodes.some(node => node.tokenIds?.includes(t.id));
    return !isAssignedToAnyNode;
  });

  const handleValueChange = (value: string) => {
    const numValue = parseFloat(value);
    if (!isNaN(numValue) && numValue >= 0) {
      onUpdateNode(node.id, { spacingValue: numValue });
      
      // Update assigned tokens
      if (node.tokenIds && node.tokenIds.length > 0) {
        node.tokenIds.forEach(tokenId => {
          const token = tokens.find(t => t.id === tokenId);
          if (token && token.type === 'spacing') {
            onUpdateToken(tokenId, { 
              value: numValue,
              unit: spacingUnit
            });
          }
        });
      }
    }
  };

  const handleUnitChange = (unit: 'px' | 'rem' | 'em') => {
    onUpdateNode(node.id, { spacingUnit: unit });
    
    // Update assigned tokens
    if (node.tokenIds && node.tokenIds.length > 0) {
      node.tokenIds.forEach(tokenId => {
        const token = tokens.find(t => t.id === tokenId);
        if (token && token.type === 'spacing') {
          onUpdateToken(tokenId, { 
            value: spacingValue,
            unit: unit
          });
        }
      });
    }
  };

  const handleNameChange = (value: string) => {
    onUpdateNode(node.id, { spacingName: value });
  };

  const hasParent = node.parentId !== null;
  const hasChildren = nodes.some(n => n.parentId === node.id);

  const handleRemoveToken = (tokenId: string) => {
    onAssignToken(node.id, tokenId, false);
  };

  const handleAssignToken = (tokenId: string) => {
    const token = tokens.find(t => t.id === tokenId);
    if (!token) return;
    
    onAssignToken(node.id, tokenId, true);
    
    // Update token to become a spacing token with current node value
    onUpdateToken(tokenId, { 
      type: 'spacing',
      value: spacingValue,
      unit: spacingUnit
    });
  };

  // Handle resize functionality
  const handleResizeStart = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    
    if (!cardRef.current) return;
    
    const initialWidth = node.width || 240;
    const initialX = e.clientX;
    
    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - initialX;
      const newWidth = Math.max(180, Math.min(600, initialWidth + deltaX));
      
      // Update the width directly on the DOM element for smooth resizing
      if (cardRef.current) {
        cardRef.current.style.width = `${newWidth}px`;
      }
      
      // Also update temporary state
      setTempWidth(newWidth);
    };

    const handleMouseUp = () => {
      // Only update the actual node state once when resizing is complete
      if (tempWidth !== null) {
        onUpdateNode(node.id, { width: tempWidth });
        setTempWidth(null);
      }
      
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  useEffect(() => {
    if (onColorPickerOpenChange) {
      onColorPickerOpenChange(node.id, tokenComboOpen);
    }
  }, [tokenComboOpen, node.id, onColorPickerOpenChange]);

  return (
    <div
      ref={cardRef}
      data-node-card
      className={`relative rounded-[19px] transition-all border ${
        isSelected
          ? 'border-[#6b8598]'
          : 'border-[#111111]'
      }`}
      style={{ width: `${node.width || 240}px` }}
      onMouseEnter={() => {
        setIsHovered(true);
        onWireHover(node.id, true);
      }}
      onMouseLeave={() => {
        setIsHovered(false);
        onWireHover(node.id, false);
      }}
      onClick={onSelect}
      onDoubleClick={onDoubleClick}
    >
      {/* Parent Connection Button (Left) */}
      {hasParent && (
        <button
          data-button-type="left-connect"
          data-node-id={node.id}
          className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-[#555] border-2 border-[#111111] hover:bg-[#6b8598] hover:border-[#8ea3b4] transition-colors z-10"
          onMouseDown={(e) => {
            e.stopPropagation();
            onWireStartDrag(node.id, 'left', e);
          }}
        />
      )}

      {/* Child Connection Button (Right) */}
      {hasChildren && (
        <button
          data-button-type="right-connect"
          data-node-id={node.id}
          className="absolute right-0 top-1/2 translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-[#555] border-2 border-[#111111] hover:bg-[#6b8598] hover:border-[#8ea3b4] transition-colors z-10"
          onMouseDown={(e) => {
            e.stopPropagation();
            onWireStartDrag(node.id, 'right', e);
          }}
        />
      )}

      <div className="bg-[#111111] rounded-[19px]">
        {/* Top Section: Header and Value Input */}
        <div className="p-4 bg-[#111111] rounded-tl-[19px] rounded-tr-[19px] relative">
          {/* Drag Handle Icon */}
          <div
            className={`cursor-move absolute top-2 -left-[22px] text-[#a1a1a1] hover:text-[#ededed] transition-all ${isHovered ? 'opacity-100' : 'opacity-0'}`}
            onMouseDown={onMouseDown}
            onClick={(e) => e.stopPropagation()}
            data-drag-handle="true"
            title="Drag to move"
          >
            <GripVertical className="h-5 w-5" />
          </div>

          {/* Header with Icon and Name */}
          <div className="flex items-center gap-2 mb-3">
            <Ruler className="h-4 w-4 text-purple-400" />
            <Input
              value={node.spacingName}
              onChange={(e) => handleNameChange(e.target.value)}
              className="flex-1 h-7 bg-[#1a1a1a] border-transparent text-[#ededed] text-sm"
              placeholder="Spacing name"
            />
          </div>

          {/* Value Input */}
          <div className="flex gap-2">
            <Input
              type="text"
              inputMode="numeric"
              value={spacingValue}
              onChange={(e) => handleValueChange(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
                  e.currentTarget.select();
                }
              }}
              className="flex-1 !h-7 !py-1 bg-[#1a1a1a] border-transparent text-[#ededed]"
            />
            <Select value={spacingUnit} onValueChange={handleUnitChange}>
              <SelectTrigger className="w-20 !h-7 !py-1 bg-[#1a1a1a] border-transparent text-[#ededed]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#1a1a1a] border-[#252525]">
                <SelectItem value="px" className="text-[#ededed]">px</SelectItem>
                <SelectItem value="rem" className="text-[#ededed]">rem</SelectItem>
                <SelectItem value="em" className="text-[#ededed]">em</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Bottom Section: Token Assignment */}
        <div className="p-4 border-t border-[#252525]">
          {/* Assigned Tokens */}
          {assignedTokens.length > 0 && (
            <div className="space-y-2 mb-2">
              {assignedTokens.map(token => (
                <div
                  key={token.id}
                  className="flex items-stretch gap-3 bg-transparent rounded-[0px] py-0 pr-[0px] pb-[0px] pl-[0px]"
                >
                  <span className="flex-1 text-[#ededed] text-2xl py-[0px] text-[12px] bg-[#1a1a1a] px-[8px] py-[4px] rounded-[8px] flex items-center justify-start gap-[2px] min-w-0 truncate whitespace-nowrap">
                    {token.name}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 hover:bg-[#ffffff]/[0.06] flex-shrink-0"
                    onClick={() => handleRemoveToken(token.id)}
                  >
                    <Trash2 className="h-4 w-4 text-[#a1a1a1]" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Token Selector */}
          <div className="flex items-center gap-2">
            <Popover open={tokenComboOpen} onOpenChange={setTokenComboOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={tokenComboOpen}
                  className="flex-1 h-8 justify-between text-xs overflow-hidden bg-[#1a1a1a] text-[#ededed] hover:bg-[#222] hover:text-[#ededed]"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(e);
                  }}
                >
                  <span className="text-[#878787]">Select token...</span>
                  <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent 
                className="w-[240px] p-0 bg-[#161616] border-[#252525]" 
                side="bottom"
                align="start"
                onMouseDown={(e) => e.stopPropagation()}
                onWheel={(e) => e.stopPropagation()}
              >
                <Command className="bg-[#161616]" shouldFilter={false} loop={false}>
                  <CommandInput 
                    placeholder="Search tokens..."
                    className="h-9 text-xs bg-[#1a1a1a] pl-[10px] m-[4px] text-[#ededed] focus-visible:outline-none focus-visible:ring-0 hover:bg-[#1a1a1a]"
                  />
                  <CommandList className="pb-[5px] max-h-[280px]">
                    <CommandEmpty className="py-6 text-xs text-center text-[#878787]">
                      {availableTokens.length === 0 ? (
                        <>
                          No spacing tokens available.<br />
                          Create one in the panel.
                        </>
                      ) : (
                        'No tokens found.'
                      )}
                    </CommandEmpty>
                    
                    {/* Grouped tokens */}
                    {(() => {
                      // Filter out palette groups and their tokens, and only show groups from current page
                      const paletteGroupIds = new Set(groups.filter(g => g.isPaletteEntry).map(g => g.id));
                      const nonPaletteGroups = groups.filter(g => !g.isPaletteEntry && g.pageId === node.pageId);
                      
                      return nonPaletteGroups.map((group) => {
                        const groupTokens = availableTokens.filter(t => t.groupId === group.id && !paletteGroupIds.has(t.groupId || ''));
                      if (groupTokens.length === 0) return null;
                      
                      return (
                        <CommandGroup 
                          key={group.id} 
                          heading={group.name}
                          className="[&_[cmdk-group-heading]]:text-[#cfcfcf] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:sticky [&_[cmdk-group-heading]]:top-0 [&_[cmdk-group-heading]]:z-10 [&_[cmdk-group-heading]]:pl-[12px] [&_[cmdk-group-heading]]:pr-2 p-0"
                        >
                          {groupTokens.map((token) => {
                            const isCurrentlyAssigned = node.tokenIds?.includes(token.id);
                            // Check if token is assigned to any OTHER node
                            const otherNode = nodes.find(n => n.id !== node.id && n.tokenIds?.includes(token.id));
                            const isAssignedToOther = !!otherNode;
                            
                            return (
                              <CommandItem
                                key={token.id}
                                value={`${group.name} ${token.name}`}
                                onSelect={() => {
                                  onSelect(null as any);
                                  if (isCurrentlyAssigned) {
                                    onAssignToken(node.id, token.id, false);
                                  } else {
                                    handleAssignToken(token.id);
                                  }
                                  setTokenComboOpen(false);
                                }}
                                className={cn(
                                  "text-xs mx-1 group relative",
                                  isCurrentlyAssigned 
                                    ? "hover:!bg-[#ffffff]/[0.06] data-[selected=true]:bg-transparent"
                                    : "data-[selected=true]:bg-transparent hover:!bg-[#ffffff]/[0.06]"
                                )}
                                title={isAssignedToOther && otherNode ? `This variable is already assigned to another node. Reassigning it will remove it from that node. Previous node: ${otherNode.spacingName || `${otherNode.spacingValue}${otherNode.spacingUnit}`}` : undefined}
                              >
                                <div className={cn("flex items-center gap-2 flex-1 min-w-0 px-[8px] rounded-[10px] py-[2px]", isCurrentlyAssigned ? "bg-[#ffffff]/[0.08]" : isAssignedToOther ? "bg-[#4a6475]" : "")}>
                                  <div
                                    className="w-3 h-3 rounded-full bg-purple-500 shrink-0"
                                  />
                                  <div className="flex flex-col min-w-0 flex-1">
                                    <span className={cn("truncate text-[#ededed] group-hover:text-white transition-colors", isCurrentlyAssigned && "text-white font-medium")}>{token.name}</span>
                                  </div>
                                  {isAssignedToOther && (
                                    <Target className="h-4 w-4 text-[#8ea3b4] shrink-0" />
                                  )}
                                </div>
                              </CommandItem>
                            );
                          })}
                        </CommandGroup>
                      );
                      });
                    })()}

                    {/* Ungrouped tokens */}
                    {(() => {
                      // Ungrouped tokens can't be palette tokens (palette tokens always have a groupId)
                      const ungroupedTokens = availableTokens.filter(t => !t.groupId);
                      if (ungroupedTokens.length === 0) return null;
                      
                      return (
                        <CommandGroup className="p-0">
                          {ungroupedTokens.map((token) => {
                            const isCurrentlyAssigned = node.tokenIds?.includes(token.id);
                            // Check if token is assigned to any OTHER node
                            const otherNode = nodes.find(n => n.id !== node.id && n.tokenIds?.includes(token.id));
                            const isAssignedToOther = !!otherNode;
                            
                            return (
                              <CommandItem
                                key={token.id}
                                value={token.name}
                                onSelect={() => {
                                  onSelect(null as any);
                                  if (isCurrentlyAssigned) {
                                    onAssignToken(node.id, token.id, false);
                                  } else {
                                    handleAssignToken(token.id);
                                  }
                                  setTokenComboOpen(false);
                                }}
                                className={cn(
                                  "text-xs mx-1 group relative",
                                  isCurrentlyAssigned 
                                    ? "hover:!bg-[#ffffff]/[0.06] data-[selected=true]:bg-transparent"
                                    : "data-[selected=true]:bg-transparent hover:!bg-[#ffffff]/[0.06]"
                                )}
                                title={isAssignedToOther && otherNode ? `This variable is already assigned to another node. Reassigning it will remove it from that node. Previous node: ${otherNode.spacingName || `${otherNode.spacingValue}${otherNode.spacingUnit}`}` : undefined}
                              >
                                <div className={cn("flex items-center gap-2 flex-1 min-w-0 px-[8px] rounded-[10px] py-[2px]", isCurrentlyAssigned ? "bg-[#ffffff]/[0.08]" : isAssignedToOther ? "bg-[#4a6475]" : "")}>
                                  <div
                                    className="w-3 h-3 rounded-full bg-purple-500 shrink-0"
                                  />
                                  <div className="flex flex-col min-w-0 flex-1">
                                    <span className={cn("truncate text-[#ededed] group-hover:text-white transition-colors", isCurrentlyAssigned && "text-white font-medium")}>{token.name}</span>
                                  </div>
                                  {isAssignedToOther && (
                                    <Target className="h-4 w-4 text-[#8ea3b4] shrink-0" />
                                  )}
                                </div>
                              </CommandItem>
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
        </div>
      </div>

      {/* Resize Handle */}
      <div
        className="absolute -bottom-px -right-px w-4 h-4 cursor-nwse-resize group z-10 bg-[rgba(91,91,91,0)]"
        onMouseDown={handleResizeStart}
        title="Resize node"
      >
        <svg 
          className="absolute top-1/2 left-1/2 -translate-x-[calc(50%+1px)] -translate-y-[calc(50%+1px)] w-3 h-3 transition-colors" 
          viewBox="0 0 12 12" 
          fill="none"
          style={{ color: '#1a1a1a' }}
        >
          <path d="M10 2L2 10M10 6L6 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </div>
    </div>
  );
}