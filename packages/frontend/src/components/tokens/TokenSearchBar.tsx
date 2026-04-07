import { useState, useRef, useEffect, useCallback } from 'react';
import { Search, X, SlidersHorizontal } from 'lucide-react';
import { DesignToken, ColorNode, TokenGroup } from '../../types';
import { isTokenHiddenInTheme } from '../../utils/visibility';
import './TokenSearchBar.css';

// ─── Filter Types ────────────────────────────────────────────
export interface TokenSearchFilters {
  colorSpaces: Set<string>;      // 'HSL' | 'RGB' | 'OKLCH' | 'HCT' | 'HEX' | 'TOKEN'
  hiddenOnly: boolean;           // show only hidden tokens
  unassignedOnly: boolean;       // show only tokens not assigned to any node
  tokenNodesOnly: boolean;       // show only token node group tokens
  modifiedOnly: boolean;         // show only tokens modified from primary
  hasAlpha: boolean;             // show only tokens with alpha < 100
  paletteOnly: boolean;          // show only color palette tokens
}

export const DEFAULT_FILTERS: TokenSearchFilters = {
  colorSpaces: new Set<string>(),
  hiddenOnly: false,
  unassignedOnly: false,
  tokenNodesOnly: false,
  modifiedOnly: false,
  hasAlpha: false,
  paletteOnly: false,
};

export function hasActiveFilters(filters: TokenSearchFilters): boolean {
  return (
    filters.colorSpaces.size > 0 ||
    filters.hiddenOnly ||
    filters.unassignedOnly ||
    filters.tokenNodesOnly ||
    filters.modifiedOnly ||
    filters.hasAlpha ||
    filters.paletteOnly
  );
}

export function countActiveFilters(filters: TokenSearchFilters): number {
  let count = 0;
  if (filters.colorSpaces.size > 0) count++;
  if (filters.hiddenOnly) count++;
  if (filters.unassignedOnly) count++;
  if (filters.tokenNodesOnly) count++;
  if (filters.modifiedOnly) count++;
  if (filters.hasAlpha) count++;
  if (filters.paletteOnly) count++;
  return count;
}

// ─── Smart Search Engine ─────────────────────────────────────

// Color name → approximate hue ranges for smart matching
const COLOR_NAME_HUES: Record<string, [number, number]> = {
  red:     [345, 15],
  orange:  [15, 45],
  yellow:  [45, 70],
  lime:    [70, 100],
  green:   [100, 160],
  teal:    [160, 190],
  cyan:    [180, 200],
  blue:    [200, 260],
  indigo:  [230, 270],
  violet:  [260, 290],
  purple:  [270, 310],
  magenta: [290, 330],
  pink:    [320, 355],
  white:   [-1, -1],  // special: L > 90, S < 15
  black:   [-2, -2],  // special: L < 10
  gray:    [-3, -3],  // special: S < 10
  grey:    [-3, -3],  // alias
};

function hslToHex(h: number, s: number, l: number): string {
  const s1 = s / 100, l1 = l / 100;
  const a = s1 * Math.min(l1, 1 - l1);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l1 - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
  };
  const toH = (n: number) => Math.round(n * 255).toString(16).padStart(2, '0');
  return `#${toH(f(0))}${toH(f(8))}${toH(f(4))}`.toUpperCase();
}

function matchesHueRange(hue: number, sat: number, light: number, range: [number, number]): boolean {
  // Special cases
  if (range[0] === -1) return light > 90 && sat < 15; // white
  if (range[0] === -2) return light < 10;              // black
  if (range[0] === -3) return sat < 10;                // gray
  
  // Normal hue range (may wrap around 360)
  const [lo, hi] = range;
  if (lo <= hi) {
    return hue >= lo && hue <= hi;
  }
  return hue >= lo || hue <= hi; // wraps around
}

export interface SmartSearchResult {
  tokenId: string;
  matchReason: 'name' | 'group' | 'hex' | 'color-name' | 'value';
}

/**
 * Smart token search — matches against name, group, hex, color names, and numeric values.
 * Returns token IDs that match, with the reason for matching.
 */
export function smartSearchTokens(
  query: string,
  tokens: DesignToken[],
  groups: TokenGroup[],
  getTokenThemeValues: (token: DesignToken) => Record<string, any>,
  /** Optional extra display names for groups (e.g. palette display names that differ from group.name) */
  extraGroupNames?: Map<string, string>,
): SmartSearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return tokens.map(t => ({ tokenId: t.id, matchReason: 'name' as const }));

  const results: SmartSearchResult[] = [];
  const groupNameMap = new Map<string, string>();
  groups.forEach(g => groupNameMap.set(g.id, g.name.toLowerCase()));

  // Pre-compute: is this a hex query?
  const isHexQuery = q.startsWith('#') || /^[0-9a-f]{3,8}$/i.test(q);
  const hexNormalized = q.replace(/^#/, '').toUpperCase();

  // Pre-compute: is this a color name query?
  const colorNameEntry = Object.entries(COLOR_NAME_HUES).find(([name]) => name.startsWith(q) || q.startsWith(name));

  // Pre-compute: is this a numeric query?
  const numericVal = !isNaN(Number(q)) ? Number(q) : null;

  for (const token of tokens) {
    // 1. Name match
    if (token.name.toLowerCase().includes(q)) {
      results.push({ tokenId: token.id, matchReason: 'name' });
      continue;
    }

    // 2. Group name match (includes palette display names via extraGroupNames)
    if (token.groupId && groupNameMap.get(token.groupId)?.includes(q)) {
      results.push({ tokenId: token.id, matchReason: 'group' });
      continue;
    }
    if (token.groupId && extraGroupNames?.get(token.groupId)?.toLowerCase().includes(q)) {
      results.push({ tokenId: token.id, matchReason: 'group' });
      continue;
    }

    // 3. Hex match
    if (isHexQuery) {
      const tv = getTokenThemeValues(token);
      const h = tv.hue ?? 0;
      const s = tv.saturation ?? 0;
      const l = tv.lightness ?? 0;
      const hex = hslToHex(h, s, l).replace('#', '');
      if (hex.includes(hexNormalized) || hexNormalized.length >= 3 && hex.startsWith(hexNormalized)) {
        results.push({ tokenId: token.id, matchReason: 'hex' });
        continue;
      }
    }

    // 4. Color name match
    if (colorNameEntry) {
      const tv = getTokenThemeValues(token);
      const h = tv.hue ?? 0;
      const s = tv.saturation ?? 0;
      const l = tv.lightness ?? 0;
      if (matchesHueRange(h, s, l, colorNameEntry[1])) {
        results.push({ tokenId: token.id, matchReason: 'color-name' });
        continue;
      }
    }

    // 5. Numeric value match (hue, saturation, lightness, alpha, spacing value)
    if (numericVal !== null) {
      const tv = getTokenThemeValues(token);
      if (
        Math.round(tv.hue ?? -1) === numericVal ||
        Math.round(tv.saturation ?? -1) === numericVal ||
        Math.round(tv.lightness ?? -1) === numericVal ||
        Math.round(tv.alpha ?? -1) === numericVal ||
        tv.value === numericVal
      ) {
        results.push({ tokenId: token.id, matchReason: 'value' });
        continue;
      }
    }

    // 6. Token type match (e.g., searching "color", "spacing")
    if (token.type && token.type.toLowerCase().includes(q)) {
      results.push({ tokenId: token.id, matchReason: 'name' });
      continue;
    }
  }

  return results;
}


// ─── Filter Application ──────────────────────────────────────

export function applyTokenFilters(
  token: DesignToken,
  filters: TokenSearchFilters,
  ctx: {
    nodes: ColorNode[];
    groups: TokenGroup[];
    activeThemeId: string;
    primaryThemeId: string;
    getNodesUsingToken: (tokenId: string) => ColorNode[];
    getTokenThemeValues: (token: DesignToken) => Record<string, any>;
    isTokenNodeGroupToken: (token: DesignToken) => boolean;
    isTokenModified: (tokenId: string) => boolean;
  },
): boolean {
  // Color space filter
  if (filters.colorSpaces.size > 0) {
    // Token node group tokens are always classified as 'TOKEN' color space
    if (ctx.isTokenNodeGroupToken(token)) {
      if (!filters.colorSpaces.has('TOKEN')) return false;
      // Only show token node tokens that have a value token assigned
      const ownerNode = ctx.nodes.find(n => n.isTokenNode && !n.isTokenPrefix && n.ownTokenId === token.id);
      if (!ownerNode) return false;
      // Check if the owner node has a value token (theme-aware)
      const hasValueToken = (() => {
        if (ctx.activeThemeId && ownerNode.valueTokenAssignments?.[ctx.activeThemeId]) return true;
        if (ctx.primaryThemeId && ownerNode.valueTokenAssignments?.[ctx.primaryThemeId]) return true;
        if (ownerNode.valueTokenId) return true;
        return false;
      })();
      if (!hasValueToken) return false;
    } else {
      // Regular tokens — resolve color space from assigned node
      const assignedNodes = ctx.getNodesUsingToken(token.id);
      if (assignedNodes.length === 0) {
        return false; // unassigned non-token-node token — can't determine color space
      }
      const node = assignedNodes[0];
      let cs: string;
      // Check if it's a palette shade
      if (node.parentId) {
        const parent = ctx.nodes.find(n => n.id === node.parentId);
        if (parent?.isPalette && parent.paletteColorFormat) {
          const fmt = parent.paletteColorFormat;
          cs = fmt === 'OKLCH' ? 'OKLCH' : fmt === 'RGBA' ? 'RGB' : fmt === 'HEX' ? 'HEX' : 'HSL';
        } else {
          cs = (node.colorSpace || 'hsl').toUpperCase();
        }
      } else {
        cs = (node.colorSpace || 'hsl').toUpperCase();
      }
      // Normalize RGBA → RGB for filter matching
      if (cs === 'RGBA') cs = 'RGB';
      if (cs === 'HSLA') cs = 'HSL';
      if (!filters.colorSpaces.has(cs)) return false;
    }
  }

  // Hidden only
  if (filters.hiddenOnly) {
    if (!isTokenHiddenInTheme(token, ctx.nodes, ctx.activeThemeId, ctx.primaryThemeId)) return false;
  }

  // Unassigned only
  if (filters.unassignedOnly) {
    const isTokenNodeToken = ctx.isTokenNodeGroupToken(token);
    if (isTokenNodeToken) {
      // Token node tokens are "unassigned" if their owner node has no value token
      const ownerNode = ctx.nodes.find(n => n.isTokenNode && !n.isTokenPrefix && n.ownTokenId === token.id);
      if (!ownerNode) return false;
      const hasValueToken =
        (ctx.activeThemeId && ownerNode.valueTokenAssignments?.[ctx.activeThemeId]) ||
        (ctx.primaryThemeId && ownerNode.valueTokenAssignments?.[ctx.primaryThemeId]) ||
        ownerNode.valueTokenId;
      if (hasValueToken) return false; // has a value token → not unassigned
    } else {
      // Regular tokens are unassigned if no nodes reference them
      const assignedNodes = ctx.getNodesUsingToken(token.id);
      if (assignedNodes.length > 0) return false;
    }
  }

  // Token nodes only
  if (filters.tokenNodesOnly) {
    if (!ctx.isTokenNodeGroupToken(token)) return false;
  }

  // Modified only (non-primary theme)
  if (filters.modifiedOnly) {
    if (!ctx.isTokenModified(token.id)) return false;
  }

  // Has alpha
  if (filters.hasAlpha) {
    const tv = ctx.getTokenThemeValues(token);
    const alpha = tv.alpha ?? 100;
    if (alpha >= 100) return false;
  }

  // Palette only
  if (filters.paletteOnly) {
    if (!token.groupId) return false;
    const group = ctx.groups.find(g => g.id === token.groupId);
    if (!group?.isPaletteEntry) return false;
  }

  return true;
}

// ─── Search Bar Component ────────────────────────────────────

interface TokenSearchBarProps {
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  filters: TokenSearchFilters;
  onFiltersChange: (filters: TokenSearchFilters) => void;
  isPrimaryTheme: boolean;
}

// Filter chip component
function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`search-bar-chip ${active ? 'search-bar-chip-active' : ''}`}
    >
      {label}
    </button>
  );
}

export function TokenSearchBar({
  searchQuery,
  onSearchQueryChange,
  filters,
  onFiltersChange,
  isPrimaryTheme,
}: TokenSearchBarProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const activeFilterCount = countActiveFilters(filters);
  const hasFilters = activeFilterCount > 0;

  // Close panel on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsExpanded(false);
      }
    };
    if (isExpanded) {
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
    }
  }, [isExpanded]);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isExpanded) {
        setIsExpanded(false);
        inputRef.current?.blur();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isExpanded]);

  const toggleColorSpace = useCallback((cs: string) => {
    const next = new Set(filters.colorSpaces);
    if (next.has(cs)) next.delete(cs);
    else next.add(cs);
    onFiltersChange({ ...filters, colorSpaces: next });
  }, [filters, onFiltersChange]);

  const toggleBool = useCallback((key: keyof Omit<TokenSearchFilters, 'colorSpaces'>) => {
    onFiltersChange({ ...filters, [key]: !filters[key] });
  }, [filters, onFiltersChange]);

  const clearAll = useCallback(() => {
    onSearchQueryChange('');
    onFiltersChange(DEFAULT_FILTERS);
  }, [onSearchQueryChange, onFiltersChange]);

  const colorSpaces = ['HSL', 'RGB', 'OKLCH', 'HCT', 'HEX', 'TOKEN'];

  return (
    <div ref={containerRef} data-testid="tokens-panel-search-bar">
      {/* Search Input */}
      <div className="search-bar-input-wrapper">
        <Search className="search-bar-icon" />
        <input
          ref={inputRef}
          type="text"
          placeholder={hasFilters ? `Search (${activeFilterCount} filter${activeFilterCount > 1 ? 's' : ''})...` : "Search variables..."}
          value={searchQuery}
          onChange={(e) => onSearchQueryChange(e.target.value)}
          onFocus={() => setIsExpanded(true)}
          className={`search-bar-input ${isExpanded ? 'search-bar-input-expanded' : ''} ${hasFilters ? 'search-bar-input-has-filters' : 'search-bar-input-no-filters'}`}
          data-testid="tokens-panel-search-input"
        />

        {/* Right-side indicators */}
        <div className="search-bar-indicators">
          {hasFilters && !searchQuery && (
            <span className="search-bar-badge">
              {activeFilterCount}
            </span>
          )}
          {(searchQuery || hasFilters) && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                clearAll();
              }}
              className="search-bar-clear-btn"
              data-testid="tokens-panel-search-clear-button"
            >
              <X className="search-bar-icon-sm" />
            </button>
          )}
          {!searchQuery && !hasFilters && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded(!isExpanded);
                if (!isExpanded) inputRef.current?.focus();
              }}
              className="search-bar-filter-btn"
              data-testid="tokens-panel-search-filter-toggle"
            >
              <SlidersHorizontal className="search-bar-icon-sm" />
            </button>
          )}
        </div>
      </div>

      {/* Inline Filter Panel — rendered in flow to avoid overflow clipping */}
      {isExpanded && (
        <div className="search-bar-panel">
          <div className="search-bar-panel-body">

            {/* Color Space Row */}
            <div>
              <div className="search-bar-section-label">Color Space</div>
              <div className="search-bar-chip-row">
                {colorSpaces.map(cs => (
                  <FilterChip
                    key={cs}
                    label={cs}
                    active={filters.colorSpaces.has(cs)}
                    onClick={() => toggleColorSpace(cs)}
                  />
                ))}
              </div>
            </div>

            {/* Divider */}
            <div className="search-bar-divider" />

            {/* Status Filters */}
            <div>
              <div className="search-bar-section-label">Status</div>
              <div className="search-bar-chip-row">
                <FilterChip label="Hidden" active={filters.hiddenOnly} onClick={() => toggleBool('hiddenOnly')} />
                <FilterChip label="Unassigned" active={filters.unassignedOnly} onClick={() => toggleBool('unassignedOnly')} />
                <FilterChip label="Token Nodes" active={filters.tokenNodesOnly} onClick={() => toggleBool('tokenNodesOnly')} />
                <FilterChip label="Transparency" active={filters.hasAlpha} onClick={() => toggleBool('hasAlpha')} />
              </div>
            </div>

            {/* Theme Filters (only in non-primary) */}
            {!isPrimaryTheme && (
              <>
                <div className="search-bar-divider" />
                <div>
                  <div className="search-bar-section-label">Theme</div>
                  <div className="search-bar-chip-row">
                    <FilterChip label="Modified" active={filters.modifiedOnly} onClick={() => toggleBool('modifiedOnly')} />
                  </div>
                </div>
              </>
            )}

            {/* Palette Filters */}
            <div className="search-bar-divider" />
            <div>
              <div className="search-bar-section-label">Palette</div>
              <div className="search-bar-chip-row">
                <FilterChip label="Palette Only" active={filters.paletteOnly} onClick={() => toggleBool('paletteOnly')} />
              </div>
            </div>

            {/* Hints */}
            <div className="search-bar-divider" />
            <div className="search-bar-hint">
              <span className="search-bar-hint-label">Tip:</span>{' '}
              Type <span className="search-bar-hint-code">#hex</span> for color,{' '}
              <span className="search-bar-hint-code">red</span>{' '}
              <span className="search-bar-hint-code">blue</span>{' '}etc. for color names
            </div>
          </div>

          {/* Footer */}
          {hasFilters && (
            <div className="search-bar-footer">
              <span className="search-bar-footer-count">{activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''}</span>
              <button
                onClick={clearAll}
                className="search-bar-footer-clear"
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}