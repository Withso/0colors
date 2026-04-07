import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Search, Palette, Tag, Workflow, Plus, FileText, Layers, Hash, CircleDot, Link, Ruler, Star, Clock, X } from 'lucide-react';
import { ColorNode, DesignToken, TokenGroup, Page, Theme } from '../../types';
import { hslToRgb, rgbToHex } from '../../utils/color-conversions';
import { hctToHex } from '../../utils/hct-utils';
import './CommandPalette.css';

/** Fixed width per layout pass: square cap on large screens (matches panel height), fluid 40vw with floor, never wider than viewport padding. */
const CMDK_PANEL_WIDTH = 'min(440px, calc(100vw - 2rem), max(280px, 40vw))';

// ─── Types ────────────────────────────────────────────────────────────────────

type ResultCategory = 'pinned' | 'recent' | 'nodes' | 'tokens' | 'palettes' | 'references' | 'actions';
type NavigationTarget = 'canvas' | 'token-panel' | 'token-table' | 'code-view' | 'action';

interface SearchResult {
  id: string;
  category: ResultCategory;
  icon: 'color-node' | 'palette' | 'token' | 'token-node' | 'spacing' | 'action' | 'page' | 'theme' | 'reference';
  title: string;
  subtitle: string;
  hexColor?: string;
  colorSpace?: string;
  navigateTo: NavigationTarget;
  meta: {
    nodeId?: string;
    tokenId?: string;
    pageId?: string;
    pageName?: string;
    themeName?: string;
    themeId?: string;
    groupName?: string;
    actionFn?: () => void;
  };
  locationHint: string;
  searchableText: string;
  relevance: number;
}

// Persisted recent item (serialisable, no functions)
interface RecentItem {
  resultId: string;
  title: string;
  subtitle: string;
  icon: SearchResult['icon'];
  hexColor?: string;
  colorSpace?: string;
  locationHint: string;
  navigateTo: NavigationTarget;
  meta: Omit<SearchResult['meta'], 'actionFn'>;
  timestamp: number;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  allNodes: ColorNode[];
  tokens: DesignToken[];
  groups: TokenGroup[];
  pages: Page[];
  themes: Theme[];
  activeProjectId: string;
  activePageId: string;
  activeThemeId: string;
  onNavigateToNode: (nodeId: string, pageId: string, themeId: string) => void;
  onNavigateToToken: (tokenId: string, pageId: string) => void;
  onOpenTokenTable: () => void;
  onOpenCodeView: () => void;
  onAddColorNode: (colorSpace: 'hsl' | 'rgb' | 'oklch' | 'hct') => void;
  onAddPaletteNode: () => void;
  onAddTokenNode: () => void;
  onAddSpacingNode: () => void;
  onCreatePage: () => void;
  onCreateTheme: () => void;
  onAddVariable: () => void;
  onSwitchPage: (pageId: string) => void;
  onSwitchTheme: (themeId: string) => void;
}

// ─── Color Helpers ────────────────────────────────────────────────────────────

function getNodeHexColor(node: ColorNode, themeId?: string): string {
  const override = themeId ? node.themeOverrides?.[themeId] : undefined;
  if (node.colorSpace === 'hex') return override?.hexValue || node.hexValue || '#000000';
  if (node.colorSpace === 'hct') {
    return hctToHex(override?.hctH ?? node.hctH ?? 0, override?.hctC ?? node.hctC ?? 0, override?.hctT ?? node.hctT ?? 0);
  }
  if (node.colorSpace === 'rgb') {
    return rgbToHex(override?.red ?? node.red ?? 0, override?.green ?? node.green ?? 0, override?.blue ?? node.blue ?? 0);
  }
  const h = override?.hue ?? node.hue;
  const s = override?.saturation ?? node.saturation;
  const l = override?.lightness ?? node.lightness;
  const rgb = hslToRgb(h, s, l);
  return rgbToHex(rgb.r, rgb.g, rgb.b);
}

function getTokenHexColor(token: DesignToken, themeId: string): string | undefined {
  const tv = token.themeValues?.[themeId];
  if (!tv) {
    if (token.hue !== undefined && token.saturation !== undefined && token.lightness !== undefined) {
      const rgb = hslToRgb(token.hue, token.saturation, token.lightness);
      return rgbToHex(rgb.r, rgb.g, rgb.b);
    }
    return undefined;
  }
  if (tv.hue !== undefined && tv.saturation !== undefined && tv.lightness !== undefined) {
    const rgb = hslToRgb(tv.hue, tv.saturation, tv.lightness);
    return rgbToHex(rgb.r, rgb.g, rgb.b);
  }
  return undefined;
}

// ─── Search Scoring ───────────────────────────────────────────────────────────

function splitWords(text: string): string[] {
  return text.toLowerCase().split(/[\s\-_./·:,]+/).filter(Boolean);
}

function scoreMatch(query: string, text: string): number {
  if (!query || !text) return 0;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (t === q) return 100;
  if (t.startsWith(q)) return 90;
  const segments = splitWords(text);
  for (const seg of segments) { if (seg === q) return 95; }
  for (const seg of segments) { if (seg.startsWith(q)) return 85; }
  if (t.includes(q)) return 70;
  const qw = splitWords(query);
  if (qw.length > 1 && qw.every(w => t.includes(w))) return 65;
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) { if (t[ti] === q[qi]) qi++; }
  if (qi === q.length) return Math.min(50, 30 + Math.max(0, 20 - (t.length - q.length)));
  return 0;
}

function bestScore(query: string, ...fields: (string | undefined)[]): number {
  if (!query) return 50;
  let best = 0;
  for (const f of fields) { if (f) { const s = scoreMatch(query, f); if (s > best) best = s; } }
  return best;
}

// ─── Persistence Helpers ──────────────────────────────────────────────────────

const RECENT_KEY = 'cmdK-recent';
const PINNED_KEY = 'cmdK-pinned';
const MAX_RECENT = 8;
const MAX_PINNED = 12;

function loadRecent(): RecentItem[] {
  try { const raw = localStorage.getItem(RECENT_KEY); return raw ? JSON.parse(raw) : []; }
  catch { return []; }
}
function saveRecent(items: RecentItem[]) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(items.slice(0, MAX_RECENT))); } catch {}
}
function loadPinned(): string[] {
  try { const raw = localStorage.getItem(PINNED_KEY); return raw ? JSON.parse(raw) : []; }
  catch { return []; }
}
function savePinned(ids: string[]) {
  try { localStorage.setItem(PINNED_KEY, JSON.stringify(ids.slice(0, MAX_PINNED))); } catch {}
}

// ─── Token Path Helpers ───────────────────────────────────────────────────────

function computeTokenPath(node: ColorNode, allNodes: ColorNode[]): string {
  const parts: string[] = [];
  let current: ColorNode | undefined = node;
  while (current) {
    if (current.isTokenPrefix) {
      const parent = current.parentId ? allNodes.find(n => n.id === current!.parentId) : null;
      if (!parent || !parent.isTokenNode) { parts.unshift(current.referenceName || 'color'); break; }
      else { parts.unshift(current.tokenNodeSuffix || current.referenceName || '1'); }
    } else { parts.unshift(current.tokenNodeSuffix || current.referenceName || '1'); }
    current = current.parentId ? allNodes.find(n => n.id === current!.parentId) : undefined;
  }
  return parts.join('-');
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CommandPalette({
  isOpen, onClose,
  allNodes, tokens, groups, pages, themes,
  activeProjectId, activePageId, activeThemeId,
  onNavigateToNode, onNavigateToToken,
  onOpenTokenTable, onOpenCodeView,
  onAddColorNode, onAddPaletteNode, onAddTokenNode, onAddSpacingNode,
  onCreatePage, onCreateTheme, onAddVariable,
  onSwitchPage, onSwitchTheme,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // ── Recent & Pinned ─────────────────────────────────────────────────
  const [recentItems, setRecentItems] = useState<RecentItem[]>(loadRecent);
  const [pinnedIds, setPinnedIds] = useState<string[]>(loadPinned);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setRecentItems(loadRecent());
      setPinnedIds(loadPinned());
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen]);

  const addToRecent = useCallback((result: SearchResult) => {
    // Don't track pinned or actions with no meaningful identity
    const item: RecentItem = {
      resultId: result.id,
      title: result.title,
      subtitle: result.subtitle,
      icon: result.icon,
      hexColor: result.hexColor,
      colorSpace: result.colorSpace,
      locationHint: result.locationHint,
      navigateTo: result.navigateTo,
      meta: { ...result.meta, actionFn: undefined } as Omit<SearchResult['meta'], 'actionFn'>,
      timestamp: Date.now(),
    };
    setRecentItems(prev => {
      const filtered = prev.filter(r => r.resultId !== result.id);
      const next = [item, ...filtered].slice(0, MAX_RECENT);
      saveRecent(next);
      return next;
    });
  }, []);

  const togglePin = useCallback((resultId: string) => {
    setPinnedIds(prev => {
      const next = prev.includes(resultId)
        ? prev.filter(id => id !== resultId)
        : [resultId, ...prev].slice(0, MAX_PINNED);
      savePinned(next);
      return next;
    });
  }, []);

  const clearRecent = useCallback(() => {
    setRecentItems([]);
    saveRecent([]);
  }, []);

  // ── Lookup Maps ───────────────────────────────────────────────────────
  const pageLookup = useMemo(() => { const m = new Map<string, Page>(); pages.forEach(p => m.set(p.id, p)); return m; }, [pages]);
  const groupLookup = useMemo(() => { const m = new Map<string, TokenGroup>(); groups.forEach(g => m.set(g.id, g)); return m; }, [groups]);
  const tokenLookup = useMemo(() => { const m = new Map<string, DesignToken>(); tokens.forEach(t => m.set(t.id, t)); return m; }, [tokens]);
  const nodeLookup = useMemo(() => { const m = new Map<string, ColorNode>(); allNodes.forEach(n => m.set(n.id, n)); return m; }, [allNodes]);

  // ── Cross-Reference Maps ──────────────────────────────────────────────
  const tokenToNodeIds = useMemo(() => {
    const map = new Map<string, string[]>();
    const projectNodes = allNodes.filter(n => n.projectId === activeProjectId);
    for (const node of projectNodes) {
      const assignedIds = new Set<string>();
      if (node.tokenAssignments) Object.values(node.tokenAssignments).forEach(ids => ids.forEach(id => assignedIds.add(id)));
      if (node.tokenIds) node.tokenIds.forEach(id => assignedIds.add(id));
      if (node.tokenId) assignedIds.add(node.tokenId);
      if (node.ownTokenId) assignedIds.add(node.ownTokenId);
      if (node.valueTokenId) assignedIds.add(node.valueTokenId);
      if (node.valueTokenAssignments) Object.values(node.valueTokenAssignments).forEach(id => { if (id) assignedIds.add(id); });
      if (node.autoAssignedTokenId) assignedIds.add(node.autoAssignedTokenId);
      assignedIds.forEach(tokenId => { if (!map.has(tokenId)) map.set(tokenId, []); map.get(tokenId)!.push(node.id); });
    }
    return map;
  }, [allNodes, activeProjectId]);

  const nodeAssignedTokenNames = useMemo(() => {
    const map = new Map<string, string[]>();
    const projectNodes = allNodes.filter(n => n.projectId === activeProjectId);
    for (const node of projectNodes) {
      const ids: string[] = node.tokenAssignments?.[activeThemeId] || node.tokenIds || [];
      const names = ids.map(id => tokenLookup.get(id)?.name).filter(Boolean) as string[];
      if (node.ownTokenId) { const t = tokenLookup.get(node.ownTokenId); if (t && !names.includes(t.name)) names.push(t.name); }
      if (node.autoAssignedTokenId) { const t = tokenLookup.get(node.autoAssignedTokenId); if (t && !names.includes(t.name)) names.push(t.name); }
      if (names.length > 0) map.set(node.id, names);
    }
    return map;
  }, [allNodes, tokens, activeProjectId, activeThemeId, tokenLookup]);

  // ── Build ALL Results ─────────────────────────────────────────────────

  const allResults = useMemo((): SearchResult[] => {
    const results: SearchResult[] = [];
    const projectNodes = allNodes.filter(n => n.projectId === activeProjectId);
    const projectTokens = tokens.filter(t => t.projectId === activeProjectId);
    const projectThemes = themes.filter(t => t.projectId === activeProjectId);
    const tid = activeThemeId;

    // ─── 1. ALL Nodes ─────────────────────────────────────────────────
    for (const node of projectNodes) {
      const page = pageLookup.get(node.pageId);
      const pageName = page?.name || 'Unknown Page';
      const hex = getNodeHexColor(node, tid);
      const cs = (node.colorSpace || 'hsl').toUpperCase();
      const assignedTokens = nodeAssignedTokenNames.get(node.id) || [];
      const assignedStr = assignedTokens.join(', ');
      const parentNode = node.parentId ? nodeLookup.get(node.parentId) : null;
      const isPaletteShade = !!parentNode?.isPalette;
      const isChildOfColorNode = !!parentNode && !parentNode.isPalette && !parentNode.isTokenNode;
      const isTokenNodeChild = !!node.isTokenNode && !!node.parentId;

      if (isPaletteShade) {
        const paletteName = parentNode!.paletteName || parentNode!.referenceName || 'Palette';
        const shadeRef = node.referenceName || `${paletteName} shade`;
        const shadeIndex = projectNodes.filter(n => n.parentId === parentNode!.id).sort((a, b) => a.position.y - b.position.y).findIndex(n => n.id === node.id) + 1;
        results.push({ id: `shade-${node.id}`, category: 'palettes', icon: 'palette', title: shadeRef, subtitle: `${hex} · Shade ${shadeIndex} of ${paletteName} · ${pageName}${assignedStr ? ` · Tokens: ${assignedStr}` : ''}`, hexColor: hex, colorSpace: cs, navigateTo: 'canvas', meta: { nodeId: node.id, pageId: node.pageId, pageName, themeId: tid }, locationHint: `Canvas → ${paletteName}`, searchableText: [shadeRef, hex, paletteName, pageName, cs, assignedStr, `shade ${shadeIndex}`].join(' '), relevance: 0 });
        continue;
      }
      if (isTokenNodeChild && !node.isTokenPrefix) {
        const tokenPath = computeTokenPath(node, projectNodes);
        const suffix = node.tokenNodeSuffix || '';
        const ownToken = node.ownTokenId ? tokenLookup.get(node.ownTokenId) : null;
        const valueToken = (() => { const vtId = node.valueTokenAssignments?.[tid] || node.valueTokenId; return vtId ? tokenLookup.get(vtId) : null; })();
        results.push({ id: `tnode-child-${node.id}`, category: 'nodes', icon: 'token-node', title: tokenPath, subtitle: [suffix && `Suffix: ${suffix}`, ownToken && `Token: ${ownToken.name}`, valueToken && `Value ref: ${valueToken.name}`, pageName].filter(Boolean).join(' · '), navigateTo: 'canvas', meta: { nodeId: node.id, pageId: node.pageId, pageName, themeId: tid }, locationHint: 'Canvas → Token Node', searchableText: [tokenPath, suffix, ownToken?.name, valueToken?.name, pageName, node.referenceName].join(' '), relevance: 0 });
        continue;
      }
      if (isChildOfColorNode) {
        const parentRef = parentNode!.referenceName || 'Parent';
        const ref = node.referenceName || `${cs} Node`;
        results.push({ id: `child-${node.id}`, category: 'nodes', icon: 'color-node', title: ref, subtitle: `${hex} · ${cs} · Child of ${parentRef} · ${pageName}${assignedStr ? ` · Tokens: ${assignedStr}` : ''}`, hexColor: hex, colorSpace: cs, navigateTo: 'canvas', meta: { nodeId: node.id, pageId: node.pageId, pageName, themeId: tid }, locationHint: `Canvas → ${parentRef}`, searchableText: [ref, hex, parentRef, pageName, cs, assignedStr].join(' '), relevance: 0 });
        continue;
      }
      if (node.isPalette) {
        const paletteName = node.paletteName || node.referenceName || 'Unnamed Palette';
        const shadeCount = node.paletteShadeCount ?? 10;
        results.push({ id: `node-${node.id}`, category: 'palettes', icon: 'palette', title: paletteName, subtitle: `${shadeCount} shades · ${hex} · ${cs} · ${pageName}${assignedStr ? ` · Tokens: ${assignedStr}` : ''}`, hexColor: hex, colorSpace: cs, navigateTo: 'canvas', meta: { nodeId: node.id, pageId: node.pageId, pageName, themeId: tid }, locationHint: 'Canvas → Palette Node', searchableText: [paletteName, hex, cs, pageName, `${shadeCount} shades`, assignedStr, node.referenceName].join(' '), relevance: 0 });
        continue;
      }
      if (node.isSpacing) {
        const spacingLabel = node.spacingName || node.referenceName || 'Spacing';
        const value = `${node.spacingValue ?? 0}${node.spacingUnit ?? 'px'}`;
        results.push({ id: `node-${node.id}`, category: 'nodes', icon: 'spacing', title: spacingLabel, subtitle: `${value} · Spacing · ${pageName}${assignedStr ? ` · Tokens: ${assignedStr}` : ''}`, navigateTo: 'canvas', meta: { nodeId: node.id, pageId: node.pageId, pageName, themeId: tid }, locationHint: 'Canvas → Spacing Node', searchableText: [spacingLabel, value, pageName, 'spacing', assignedStr].join(' '), relevance: 0 });
        continue;
      }
      if (node.isTokenNode && node.isTokenPrefix) {
        const tokenPath = node.referenceName || 'token';
        const groupToken = node.tokenGroupId ? groupLookup.get(node.tokenGroupId) : null;
        results.push({ id: `tnode-${node.id}`, category: 'nodes', icon: 'token-node', title: tokenPath, subtitle: `Token Prefix Node${groupToken ? ` · Group: ${groupToken.name}` : ''} · ${pageName}${assignedStr ? ` · Tokens: ${assignedStr}` : ''}`, navigateTo: 'canvas', meta: { nodeId: node.id, pageId: node.pageId, pageName, themeId: tid }, locationHint: 'Canvas → Token Node', searchableText: [tokenPath, pageName, 'token prefix', groupToken?.name, assignedStr].join(' '), relevance: 0 });
        continue;
      }
      // Regular color node
      const ref = node.referenceName || `${cs} Node`;
      results.push({ id: `node-${node.id}`, category: 'nodes', icon: 'color-node', title: ref, subtitle: `${hex} · ${cs} · ${pageName}${assignedStr ? ` · Tokens: ${assignedStr}` : ''}`, hexColor: hex, colorSpace: cs, navigateTo: 'canvas', meta: { nodeId: node.id, pageId: node.pageId, pageName, themeId: tid }, locationHint: 'Canvas → Color Node', searchableText: [ref, hex, cs, pageName, assignedStr].join(' '), relevance: 0 });
    }

    // ─── 2. ALL Tokens ────────────────────────────────────────────────
    for (const token of projectTokens) {
      const page = pageLookup.get(token.pageId);
      const pageName = page?.name || 'Unknown Page';
      const group = token.groupId ? groupLookup.get(token.groupId) : null;
      const groupName = group?.name || '';
      const hex = getTokenHexColor(token, tid);
      const isPaletteToken = group?.isColorPaletteGroup || group?.isPaletteEntry;
      const tokenType = token.type || 'color';
      const tvParts = projectThemes.slice(0, 3).map(t => { const h = getTokenHexColor(token, t.id); return h ? `${t.name}: ${h}` : null; }).filter(Boolean);
      const nodeIds = tokenToNodeIds.get(token.id) || [];
      const nodeNames = nodeIds.map(nid => { const n = nodeLookup.get(nid); return n?.referenceName || n?.paletteName || n?.spacingName; }).filter(Boolean);
      const usedByStr = nodeNames.length > 0 ? `Used by: ${nodeNames.slice(0, 3).join(', ')}${nodeNames.length > 3 ? ` +${nodeNames.length - 3}` : ''}` : '';
      const valueDesc = (() => {
        if (tokenType === 'spacing' || tokenType === 'radius' || tokenType === 'fontSize') { const tv = token.themeValues?.[tid]; if (tv?.value !== undefined) return `${tv.value}${tv.unit || 'px'}`; }
        if (tokenType === 'fontWeight') { const tv = token.themeValues?.[tid]; if (tv?.fontWeight) return `Weight: ${tv.fontWeight}`; }
        if (tokenType === 'opacity') { const tv = token.themeValues?.[tid]; if (tv?.opacity !== undefined) return `${tv.opacity}%`; }
        return null;
      })();
      results.push({ id: `token-${token.id}`, category: isPaletteToken ? 'palettes' : 'tokens', icon: isPaletteToken ? 'palette' : 'token', title: token.name, subtitle: [hex || valueDesc, tokenType !== 'color' && tokenType, groupName && `Group: ${groupName}`, pageName, usedByStr].filter(Boolean).join(' · '), hexColor: hex, navigateTo: 'token-panel', meta: { tokenId: token.id, pageId: token.pageId, pageName, groupName, themeId: tid }, locationHint: isPaletteToken ? 'Token Panel → Palettes' : 'Token Panel → Tokens', searchableText: [token.name, hex, groupName, pageName, tokenType, ...tvParts, ...nodeNames, valueDesc].filter(Boolean).join(' '), relevance: 0 });
    }

    // ─── 3. Actions ───────────────────────────────────────────────────
    const actionDefs: { id: string; icon: SearchResult['icon']; title: string; subtitle: string; fn: () => void; hint: string; search: string }[] = [
      { id: 'add-hsl', icon: 'action', title: 'Add HSL Color Node', subtitle: 'Create a new HSL color node', fn: () => onAddColorNode('hsl'), hint: 'Canvas', search: 'add hsl color node create' },
      { id: 'add-rgb', icon: 'action', title: 'Add RGB Color Node', subtitle: 'Create a new RGB color node', fn: () => onAddColorNode('rgb'), hint: 'Canvas', search: 'add rgb color node create' },
      { id: 'add-oklch', icon: 'action', title: 'Add OKLCH Color Node', subtitle: 'Create a new OKLCH color node', fn: () => onAddColorNode('oklch'), hint: 'Canvas', search: 'add oklch color node create' },
      { id: 'add-hct', icon: 'action', title: 'Add HCT Color Node', subtitle: 'Create a new HCT color node', fn: () => onAddColorNode('hct'), hint: 'Canvas', search: 'add hct color node create' },
      { id: 'add-palette', icon: 'action', title: 'Add Color Palette', subtitle: 'Create a palette with generated shades', fn: onAddPaletteNode, hint: 'Canvas', search: 'add color palette create shades' },
      { id: 'add-token-node', icon: 'action', title: 'Add Token Node', subtitle: 'Create a token node on canvas', fn: onAddTokenNode, hint: 'Canvas', search: 'add token node create canvas' },
      { id: 'add-spacing', icon: 'action', title: 'Add Spacing Node', subtitle: 'Create a spacing value node', fn: onAddSpacingNode, hint: 'Canvas', search: 'add spacing node create' },
      { id: 'add-variable', icon: 'action', title: 'Add Variable', subtitle: 'Create a new design token variable', fn: onAddVariable, hint: 'Token Panel', search: 'add variable token create design' },
      { id: 'create-page', icon: 'page', title: 'Create New Page', subtitle: 'Add a new page to the project', fn: onCreatePage, hint: 'Project', search: 'create new page add' },
      { id: 'create-theme', icon: 'theme', title: 'Create New Theme', subtitle: 'Add a new theme variant', fn: onCreateTheme, hint: 'Project', search: 'create new theme add variant' },
      { id: 'open-token-table', icon: 'action', title: 'Open Token Table', subtitle: 'View all tokens in a table', fn: onOpenTokenTable, hint: 'Token Table', search: 'open token table view' },
      { id: 'open-code', icon: 'action', title: 'Open Code Preview', subtitle: 'View generated code output', fn: onOpenCodeView, hint: 'Code View', search: 'open code preview view export' },
    ];
    for (const a of actionDefs) {
      results.push({ id: `action-${a.id}`, category: 'actions', icon: a.icon, title: a.title, subtitle: a.subtitle, navigateTo: 'action', meta: { actionFn: a.fn }, locationHint: a.hint, searchableText: a.search, relevance: 0 });
    }
    const projectPages = pages.filter(p => p.projectId === activeProjectId);
    for (const pg of projectPages) {
      results.push({ id: `action-goto-page-${pg.id}`, category: 'actions', icon: 'page', title: `Go to ${pg.name}`, subtitle: `Switch to page "${pg.name}"`, navigateTo: 'action', meta: { actionFn: () => onSwitchPage(pg.id), pageId: pg.id, pageName: pg.name }, locationHint: 'Navigation', searchableText: `go to page ${pg.name} switch navigate`, relevance: 0 });
    }
    for (const th of projectThemes) {
      results.push({ id: `action-goto-theme-${th.id}`, category: 'actions', icon: 'theme', title: `Switch to ${th.name}${th.isPrimary ? ' (Primary)' : ''}`, subtitle: `Change active theme to "${th.name}"`, navigateTo: 'action', meta: { actionFn: () => onSwitchTheme(th.id), themeId: th.id, themeName: th.name }, locationHint: 'Navigation', searchableText: `switch theme ${th.name} ${th.isPrimary ? 'primary' : ''} navigate`, relevance: 0 });
    }

    return results;
  }, [allNodes, tokens, groups, pages, themes, activeProjectId, activeThemeId,
      pageLookup, groupLookup, tokenLookup, nodeLookup, nodeAssignedTokenNames, tokenToNodeIds,
      onAddColorNode, onAddPaletteNode, onAddTokenNode, onAddSpacingNode,
      onCreatePage, onCreateTheme, onAddVariable, onOpenTokenTable, onOpenCodeView,
      onSwitchPage, onSwitchTheme]);

  // ── Cross-Ref Results (query-dependent) ───────────────────────────────
  const crossRefResults = useMemo((): SearchResult[] => {
    const q = query.trim();
    if (!q) return [];
    const refs: SearchResult[] = [];
    const projectTokens = tokens.filter(t => t.projectId === activeProjectId);
    const projectNodes = allNodes.filter(n => n.projectId === activeProjectId);
    const tid = activeThemeId;

    for (const token of projectTokens) {
      const tokenScore = bestScore(q, token.name);
      if (tokenScore < 65) continue;
      const nodeIds = tokenToNodeIds.get(token.id) || [];
      for (const nid of nodeIds) {
        const node = nodeLookup.get(nid);
        if (!node) continue;
        const page = pageLookup.get(node.pageId);
        const pageName = page?.name || '';
        const hex = getNodeHexColor(node, tid);
        const nodeName = node.isPalette ? (node.paletteName || node.referenceName || 'Palette') : node.isSpacing ? (node.spacingName || node.referenceName || 'Spacing') : (node.referenceName || 'Node');
        refs.push({ id: `ref-t2n-${token.id}-${node.id}`, category: 'references', icon: 'reference', title: nodeName, subtitle: `Has token "${token.name}" assigned · ${pageName}`, hexColor: hex, navigateTo: 'canvas', meta: { nodeId: node.id, pageId: node.pageId, pageName, themeId: tid }, locationHint: 'Canvas → Node', searchableText: `${token.name} ${nodeName} ${pageName}`, relevance: Math.max(0, tokenScore - 10) });
      }
    }
    for (const node of projectNodes) {
      const nodeName = node.isPalette ? (node.paletteName || node.referenceName) : node.isSpacing ? (node.spacingName || node.referenceName) : node.referenceName;
      if (!nodeName) continue;
      const nodeScore = bestScore(q, nodeName);
      if (nodeScore < 65) continue;
      const tokenNames = nodeAssignedTokenNames.get(node.id) || [];
      for (const tName of tokenNames) {
        const token = tokens.find(t => t.name === tName && t.projectId === activeProjectId);
        if (!token) continue;
        const page = pageLookup.get(token.pageId);
        const pageName = page?.name || '';
        const hex = getTokenHexColor(token, tid);
        const group = token.groupId ? groupLookup.get(token.groupId) : null;
        refs.push({ id: `ref-n2t-${node.id}-${token.id}`, category: 'references', icon: 'reference', title: tName, subtitle: `Assigned to "${nodeName}"${group ? ` · Group: ${group.name}` : ''} · ${pageName}`, hexColor: hex, navigateTo: 'token-panel', meta: { tokenId: token.id, pageId: token.pageId, pageName, groupName: group?.name, themeId: tid }, locationHint: 'Token Panel', searchableText: `${tName} ${nodeName} ${pageName} ${group?.name || ''}`, relevance: Math.max(0, nodeScore - 10) });
      }
    }
    return refs;
  }, [query, allNodes, tokens, activeProjectId, activeThemeId, tokenToNodeIds, nodeAssignedTokenNames, nodeLookup, pageLookup, groupLookup, tokenLookup]);

  // ── Result lookup map (for resolving recent/pinned by id) ─────────────
  const resultMap = useMemo(() => {
    const m = new Map<string, SearchResult>();
    allResults.forEach(r => m.set(r.id, r));
    return m;
  }, [allResults]);

  // ── Filter + Score ────────────────────────────────────────────────────

  const filteredResults = useMemo(() => {
    const q = query.trim();
    const combined = [...allResults, ...crossRefResults];

    return combined
      .map(r => ({ ...r, relevance: q ? bestScore(q, r.searchableText, r.title) : (r.category === 'actions' ? 50 : 40) }))
      .filter(r => r.relevance > 0)
      .sort((a, b) => {
        if (!q) {
          const ord: Record<ResultCategory, number> = { pinned: 0, recent: 0, actions: 1, nodes: 2, palettes: 3, tokens: 4, references: 5 };
          return ord[a.category] - ord[b.category];
        }
        if (b.relevance !== a.relevance) return b.relevance - a.relevance;
        const ord: Record<ResultCategory, number> = { pinned: 0, recent: 0, nodes: 1, palettes: 2, tokens: 3, references: 4, actions: 5 };
        return ord[a.category] - ord[b.category];
      });
  }, [allResults, crossRefResults, query]);

  // ── Grouping (with pinned/recent at top when idle) ────────────────────

  const groupedResults = useMemo(() => {
    const grouped: { category: ResultCategory; label: string; results: SearchResult[]; canClear?: boolean }[] = [];
    const q = query.trim();

    // When no query: show Pinned, Recent, then Actions, etc.
    if (!q) {
      // Pinned
      if (pinnedIds.length > 0) {
        const pinned = pinnedIds.map(id => resultMap.get(id)).filter(Boolean).map(r => ({ ...r!, category: 'pinned' as ResultCategory }));
        if (pinned.length > 0) grouped.push({ category: 'pinned', label: 'Pinned', results: pinned });
      }
      // Recent
      if (recentItems.length > 0) {
        const recent = recentItems
          .map(ri => {
            const live = resultMap.get(ri.resultId);
            if (live) return { ...live, category: 'recent' as ResultCategory };
            // For actions that have dynamic IDs (page/theme), try matching
            return null;
          })
          .filter(Boolean) as SearchResult[];
        if (recent.length > 0) grouped.push({ category: 'recent', label: 'Recent', results: recent, canClear: true });
      }
    }

    // Category map from filtered results
    const catMap = new Map<ResultCategory, SearchResult[]>();
    filteredResults.forEach(r => {
      if (!catMap.has(r.category)) catMap.set(r.category, []);
      catMap.get(r.category)!.push(r);
    });

    const labels: Record<ResultCategory, string> = { pinned: 'Pinned', recent: 'Recent', nodes: 'Nodes', palettes: 'Palettes', tokens: 'Design Tokens', references: 'References', actions: 'Actions' };
    const order: ResultCategory[] = q
      ? ['nodes', 'palettes', 'tokens', 'references', 'actions']
      : ['actions', 'nodes', 'palettes', 'tokens', 'references'];

    for (const cat of order) {
      const items = catMap.get(cat);
      if (items && items.length > 0) {
        const limit = q ? 60 : (cat === 'actions' ? 20 : 8);
        grouped.push({ category: cat, label: labels[cat], results: items.slice(0, limit) });
      }
    }
    return grouped;
  }, [filteredResults, query, pinnedIds, recentItems, resultMap]);

  const flatResults = useMemo(() => groupedResults.flatMap(g => g.results), [groupedResults]);

  useEffect(() => { setSelectedIndex(0); }, [query]);
  useEffect(() => { const el = itemRefs.current.get(selectedIndex); if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [selectedIndex]);

  // ── Execute ───────────────────────────────────────────────────────────

  const executeResult = useCallback((result: SearchResult) => {
    // Track in recent (only non-action or meaningful actions)
    addToRecent(result);

    if (result.navigateTo === 'action') { result.meta.actionFn?.(); onClose(); return; }
    if (result.navigateTo === 'canvas' && result.meta.nodeId) {
      onNavigateToNode(result.meta.nodeId, result.meta.pageId || activePageId, result.meta.themeId || activeThemeId);
      onClose(); return;
    }
    if (result.navigateTo === 'token-panel' && result.meta.tokenId) {
      onNavigateToToken(result.meta.tokenId, result.meta.pageId || activePageId);
      onClose(); return;
    }
    onClose();
  }, [onClose, onNavigateToNode, onNavigateToToken, activePageId, activeThemeId, addToRecent]);

  // ── Keyboard ──────────────────────────────────────────────────────────

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex(p => Math.min(p + 1, flatResults.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex(p => Math.max(p - 1, 0)); }
    else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      // Pin/unpin the selected result
      e.preventDefault();
      const r = flatResults[selectedIndex];
      if (r) togglePin(r.id);
    }
    else if (e.key === 'Enter') { e.preventDefault(); if (flatResults[selectedIndex]) executeResult(flatResults[selectedIndex]); }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  }, [flatResults, selectedIndex, executeResult, onClose, togglePin]);

  const handleBackdropClick = useCallback((e: React.MouseEvent) => { if (e.target === e.currentTarget) onClose(); }, [onClose]);

  if (!isOpen) return null;

  // ── Icon Renderer ─────────────────────────────────────────────────────
  const renderIcon = (r: SearchResult) => {
    if (r.hexColor) return <div className="cmd-palette-color-swatch" style={{ backgroundColor: r.hexColor }} />;
    const cls = "cmd-palette-icon";
    switch (r.icon) {
      case 'color-node': return <CircleDot className={cls} />;
      case 'palette': return <Palette className={cls} />;
      case 'token': return <Hash className={cls} />;
      case 'token-node': return <Tag className={cls} />;
      case 'spacing': return <Ruler className={cls} />;
      case 'page': return <FileText className={cls} />;
      case 'theme': return <Layers className={cls} />;
      case 'reference': return <Link className={cls} />;
      case 'action': return <Plus className={cls} />;
      default: return <Workflow className={cls} />;
    }
  };

  let flatIndex = 0;
  const dataResultCount = filteredResults.filter(r => r.category !== 'actions').length;
  const pinnedSet = new Set(pinnedIds);

  return (
    <div
      className="cmd-palette-backdrop"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      data-testid="command-palette-backdrop"
    >
      <div
        className="cmd-palette-panel"
        data-testid="command-palette-panel"
        style={{
          width: CMDK_PANEL_WIDTH,
          minWidth: CMDK_PANEL_WIDTH,
          maxWidth: CMDK_PANEL_WIDTH,
          flex: `0 0 ${CMDK_PANEL_WIDTH}`,
        }}
      >
        {/* Search input */}
        <div className="cmd-palette-search">
          <Search className="cmd-palette-search-icon" />
          <input ref={inputRef} type="text" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search nodes, tokens, palettes, or type an action..." className="cmd-palette-search-input" autoComplete="off" autoCorrect="off" spellCheck={false} data-testid="command-palette-search-input" />
          {query && (
            <span className="cmd-palette-result-count">
              {dataResultCount > 0 ? `${dataResultCount} result${dataResultCount !== 1 ? 's' : ''}` : 'No results'}
            </span>
          )}
        </div>

        {/* Results */}
        <div ref={listRef} className="cmd-palette-results" data-testid="command-palette-results">
          {groupedResults.length === 0 && query.trim() && (
            <div className="cmd-palette-empty">
              <Search className="cmd-palette-empty-icon" />
              <span className="cmd-palette-empty-text">No results for "{query}"</span>
              <span className="cmd-palette-empty-hint">Try a node name, token name, hex value, or color space</span>
            </div>
          )}

          {groupedResults.map(grp => (
            <div key={grp.category}>
              <div className="cmd-palette-group-header">
                <div className="cmd-palette-group-label-area">
                  {grp.category === 'pinned' && <Star className="cmd-palette-group-icon" />}
                  {grp.category === 'recent' && <Clock className="cmd-palette-group-icon" />}
                  <span className="cmd-palette-group-label">{grp.label}</span>
                </div>
                <div className="cmd-palette-group-actions">
                  <span className="cmd-palette-group-count">{grp.results.length}</span>
                  {grp.canClear && (
                    <button onClick={clearRecent} className="cmd-palette-clear-recent" title="Clear recent">
                      <X className="cmd-palette-group-icon" />
                    </button>
                  )}
                </div>
              </div>

              {grp.results.map(result => {
                const ci = flatIndex++;
                const sel = ci === selectedIndex;
                const isPinned = pinnedSet.has(result.id);

                return (
                  <div
                    key={`${grp.category}-${result.id}`}
                    ref={el => { if (el) itemRefs.current.set(ci, el); }}
                    className={`cmd-palette-row ${sel ? 'cmd-palette-row-selected' : ''}`}
                    onClick={() => executeResult(result)}
                    onMouseEnter={() => setSelectedIndex(ci)}
                    data-testid={`command-palette-row-${result.id}`}
                  >
                    <div className="cmd-palette-row-icon-box">
                      {renderIcon(result)}
                    </div>

                    <div className="cmd-palette-row-content">
                      <div className="cmd-palette-row-title-area">
                        <span className={`cmd-palette-row-title ${sel ? 'cmd-palette-row-title-selected' : ''}`}>
                          {result.title}
                        </span>
                        {result.colorSpace && (
                          <span className="cmd-palette-row-cs-badge">{result.colorSpace}</span>
                        )}
                      </div>
                      <div className="cmd-palette-row-subtitle">{result.subtitle}</div>
                    </div>

                    <div className="cmd-palette-row-right">
                      <span className="cmd-palette-location-hint">{result.locationHint}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); togglePin(result.id); }}
                        className={`cmd-palette-pin-btn ${
                          isPinned
                            ? 'cmd-palette-pin-btn-pinned'
                            : sel
                              ? 'cmd-palette-pin-btn-selected'
                              : 'cmd-palette-pin-btn-default'
                        }`}
                        title={isPinned ? 'Unpin' : 'Pin (⌘↵)'}
                      >
                        <Star className={`cmd-palette-group-icon ${isPinned ? 'cmd-palette-pin-icon-filled' : ''}`} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="cmd-palette-footer">
          <div className="cmd-palette-footer-left">
            <div className="cmd-palette-shortcut-group">
              <kbd className="cmd-palette-kbd">↑</kbd>
              <kbd className="cmd-palette-kbd">↓</kbd>
              <span className="cmd-palette-shortcut-label">Navigate</span>
            </div>
            <div className="cmd-palette-shortcut-group">
              <kbd className="cmd-palette-kbd">↵</kbd>
              <span className="cmd-palette-shortcut-label">Open</span>
            </div>
            <div className="cmd-palette-shortcut-group">
              <kbd className="cmd-palette-kbd">⌘↵</kbd>
              <span className="cmd-palette-shortcut-label">Pin</span>
            </div>
            <div className="cmd-palette-shortcut-group">
              <kbd className="cmd-palette-kbd">Esc</kbd>
              <span className="cmd-palette-shortcut-label">Close</span>
            </div>
          </div>
          <div className="cmd-palette-footer-right">
            <kbd className="cmd-palette-kbd">⌘</kbd>
            <kbd className="cmd-palette-kbd">K</kbd>
          </div>
        </div>
      </div>
    </div>
  );
}