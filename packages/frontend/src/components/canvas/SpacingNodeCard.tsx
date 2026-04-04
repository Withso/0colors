import { useState, useRef, useEffect } from 'react';
import { ColorNode, DesignToken, TokenGroup } from '../../types';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Plus, X, Trash2, Move, Ruler, ChevronsUpDown, Target, GripVertical } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '../ui/command';
import "./SpacingNodeCard.css";

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
      className={`spacing-card-root${isSelected ? ' spacing-card-root--selected' : ''}`}
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
          className="spacing-card-connect-btn spacing-card-connect-btn--left"
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
          className="spacing-card-connect-btn spacing-card-connect-btn--right"
          onMouseDown={(e) => {
            e.stopPropagation();
            onWireStartDrag(node.id, 'right', e);
          }}
        />
      )}

      <div className="spacing-card-body">
        {/* Top Section: Header and Value Input */}
        <div className="spacing-card-top">
          {/* Drag Handle Icon */}
          <div
            className={`spacing-card-drag-handle ${isHovered ? 'spacing-card-drag-handle--visible' : 'spacing-card-drag-handle--hidden'}`}
            onMouseDown={onMouseDown}
            onClick={(e) => e.stopPropagation()}
            data-drag-handle="true"
            title="Drag to move"
          >
            <GripVertical className="spacing-card-drag-handle-icon" />
          </div>

          {/* Header with Icon and Name */}
          <div className="spacing-card-header">
            <Ruler className="spacing-card-ruler-icon" />
            <Input
              value={node.spacingName}
              onChange={(e) => handleNameChange(e.target.value)}
              className="spacing-card-name-input"
              placeholder="Spacing name"
            />
          </div>

          {/* Value Input */}
          <div className="spacing-card-value-row">
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
              className="spacing-card-value-input"
            />
            <Select value={spacingUnit} onValueChange={handleUnitChange}>
              <SelectTrigger className="spacing-card-unit-trigger">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="spacing-card-unit-content">
                <SelectItem value="px" className="spacing-card-unit-item">px</SelectItem>
                <SelectItem value="rem" className="spacing-card-unit-item">rem</SelectItem>
                <SelectItem value="em" className="spacing-card-unit-item">em</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Bottom Section: Token Assignment */}
        <div className="spacing-card-bottom">
          {/* Assigned Tokens */}
          {assignedTokens.length > 0 && (
            <div className="spacing-card-tokens-list">
              {assignedTokens.map(token => (
                <div
                  key={token.id}
                  className="spacing-card-token-row"
                >
                  <span className="spacing-card-token-name">
                    {token.name}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="spacing-card-token-remove-btn"
                    onClick={() => handleRemoveToken(token.id)}
                  >
                    <Trash2 className="spacing-card-token-remove-icon" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Token Selector */}
          <div className="spacing-card-selector-row">
            <Popover open={tokenComboOpen} onOpenChange={setTokenComboOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={tokenComboOpen}
                  className="spacing-card-combo-btn"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(e);
                  }}
                >
                  <span className="spacing-card-combo-placeholder">Select token...</span>
                  <ChevronsUpDown className="spacing-card-combo-chevron" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="spacing-card-popover"
                side="bottom"
                align="start"
                onMouseDown={(e) => e.stopPropagation()}
                onWheel={(e) => e.stopPropagation()}
              >
                <Command className="spacing-card-command" shouldFilter={false} loop={false}>
                  <CommandInput
                    placeholder="Search tokens..."
                    className="spacing-card-command-input"
                  />
                  <CommandList className="spacing-card-command-list">
                    <CommandEmpty className="spacing-card-command-empty">
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
                          className="spacing-card-command-group"
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
                                className="spacing-card-command-item"
                                title={isAssignedToOther && otherNode ? `This variable is already assigned to another node. Reassigning it will remove it from that node. Previous node: ${otherNode.spacingName || `${otherNode.spacingValue}${otherNode.spacingUnit}`}` : undefined}
                              >
                                <div className={`spacing-card-item-inner${isCurrentlyAssigned ? ' spacing-card-item-inner--assigned' : isAssignedToOther ? ' spacing-card-item-inner--other' : ''}`}>
                                  <div className="spacing-card-item-dot" />
                                  <div className="spacing-card-item-text-col">
                                    <span className={`spacing-card-item-label${isCurrentlyAssigned ? ' spacing-card-item-label--assigned' : ''}`}>{token.name}</span>
                                  </div>
                                  {isAssignedToOther && (
                                    <Target className="spacing-card-item-target-icon" />
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
                        <CommandGroup className="spacing-card-command-group">
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
                                className="spacing-card-command-item"
                                title={isAssignedToOther && otherNode ? `This variable is already assigned to another node. Reassigning it will remove it from that node. Previous node: ${otherNode.spacingName || `${otherNode.spacingValue}${otherNode.spacingUnit}`}` : undefined}
                              >
                                <div className={`spacing-card-item-inner${isCurrentlyAssigned ? ' spacing-card-item-inner--assigned' : isAssignedToOther ? ' spacing-card-item-inner--other' : ''}`}>
                                  <div className="spacing-card-item-dot" />
                                  <div className="spacing-card-item-text-col">
                                    <span className={`spacing-card-item-label${isCurrentlyAssigned ? ' spacing-card-item-label--assigned' : ''}`}>{token.name}</span>
                                  </div>
                                  {isAssignedToOther && (
                                    <Target className="spacing-card-item-target-icon" />
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
        className="spacing-card-resize-handle"
        onMouseDown={handleResizeStart}
        title="Resize node"
      >
        <svg
          className="spacing-card-resize-svg"
          viewBox="0 0 12 12"
          fill="none"
          style={{ color: 'var(--border-on-surface-0)' }}
        >
          <path d="M10 2L2 10M10 6L6 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </div>
    </div>
  );
}
