import { useState, useMemo, useEffect } from 'react';
import { DesignToken, ColorNode, Page, TokenGroup, Theme, NodeAdvancedLogic } from '../types';
import { Copy, Check, Download, ChevronDown, FileText, Palette, Hash } from 'lucide-react';
import { copyTextToClipboard } from '../utils/clipboard';
import { Checkbox } from '../components/ui/checkbox';
import { ScrollArea } from '../components/ui/scroll-area';
import JSZip from 'jszip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import { SyntaxHighlightedCode } from '../components/SyntaxHighlightedCode';
import { getTokenColorValue, getTokenNodeColorSpace, tokenColorToNativeCSS } from '../utils/tokenFormatters';
import { evaluateAllTokenAssignments, TokenAssignExportResult } from '../utils/advanced-logic-engine';
import { MAX_PAGE_NAME, MAX_THEME_NAME } from '../utils/textLimits';
import { getVisibleTokens } from '../utils/visibility';
import type { ProjectComputedTokens } from '../utils/computed-tokens';
import './MultiPageExport.css';

type CodeFormat = 'css' | 'dtcg' | 'tailwind' | 'figma';

interface MultiPageExportProps {
  pages: Page[];
  tokens: DesignToken[];
  tokenGroups: TokenGroup[];
  nodes: ColorNode[];
  activeProjectId: string;
  themes: Theme[];
  activeThemeId: string;
  selectedPageIds: Set<string> | null;
  onSelectedPageIdsChange: (value: Set<string> | null) => void;
  selectedThemeIds: Set<string> | null;
  onSelectedThemeIdsChange: (value: Set<string> | null) => void;
  hexOverrideSpaces: Set<string>;
  onHexOverrideSpacesChange: (value: Set<string>) => void;
  advancedLogic?: NodeAdvancedLogic[];
  computedTokens?: ProjectComputedTokens;
}

export function MultiPageExport({
  pages, tokens, tokenGroups, nodes, activeProjectId, themes, activeThemeId,
  selectedPageIds: externalPageIds, onSelectedPageIdsChange,
  selectedThemeIds: externalThemeIds, onSelectedThemeIdsChange,
  hexOverrideSpaces, onHexOverrideSpacesChange, advancedLogic, computedTokens,
}: MultiPageExportProps) {
  const [selectedFormat, setSelectedFormat] = useState<CodeFormat>('css');
  const [copied, setCopied] = useState(false);
  
  // Filter pages for current project
  const projectPages = pages.filter(p => p.projectId === activeProjectId);
  
  // Filter themes for current project
  const projectThemes = themes.filter(t => t.projectId === activeProjectId);
  
  // Use external state if available, otherwise default to all pages / active theme
  const selectedPageIds = externalPageIds ?? new Set(projectPages.map(p => p.id));
  const selectedThemeIds = externalThemeIds ?? new Set([activeThemeId]);
  
  // Initialize external state on first mount if null
  useEffect(() => {
    if (externalPageIds === null) {
      onSelectedPageIdsChange(new Set(projectPages.map(p => p.id)));
    }
  }, [externalPageIds === null]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (externalThemeIds === null) {
      onSelectedThemeIdsChange(new Set([activeThemeId]));
    }
  }, [externalThemeIds === null]); // eslint-disable-line react-hooks/exhaustive-deps

  // For Figma Variables format, track which theme to preview
  const [previewThemeId, setPreviewThemeId] = useState<string>(activeThemeId);

  const formatLabels: Record<CodeFormat, string> = {
    css: 'CSS Variables',
    dtcg: 'DTCG JSON',
    tailwind: 'Tailwind CSS',
    figma: 'Figma Variables',
  };

  const togglePage = (pageId: string) => {
    const newSet = new Set(selectedPageIds);
    if (newSet.has(pageId)) {
      newSet.delete(pageId);
    } else {
      newSet.add(pageId);
    }
    onSelectedPageIdsChange(newSet);
  };

  const toggleAllPages = () => {
    if (selectedPageIds.size === projectPages.length) {
      onSelectedPageIdsChange(new Set());
    } else {
      onSelectedPageIdsChange(new Set(projectPages.map(p => p.id)));
    }
  };
  
  const toggleTheme = (themeId: string) => {
    const newSet = new Set(selectedThemeIds);
    if (newSet.has(themeId)) {
      newSet.delete(themeId);
    } else {
      newSet.add(themeId);
    }
    onSelectedThemeIdsChange(newSet);
  };

  const toggleAllThemes = () => {
    if (selectedThemeIds.size === projectThemes.length) {
      onSelectedThemeIdsChange(new Set());
    } else {
      onSelectedThemeIdsChange(new Set(projectThemes.map(t => t.id)));
    }
  };

  const toggleHexOverride = (space: string) => {
    const next = new Set(hexOverrideSpaces);
    if (next.has(space)) {
      next.delete(space);
    } else {
      next.add(space);
    }
    onHexOverrideSpacesChange(next);
  };

  const activeHexOverride = hexOverrideSpaces.size > 0 ? hexOverrideSpaces : undefined;

  const primaryThemeId = projectThemes.find(t => t.isPrimary)?.id || '';

  const getCodeContent = (): string => {
    const selectedPages = projectPages.filter(p => selectedPageIds.has(p.id));
    const selectedThemes = projectThemes.filter(t => selectedThemeIds.has(t.id));
    
    if (selectedPages.length === 0) {
      return '// No pages selected';
    }
    
    if (selectedThemes.length === 0) {
      return '// No themes selected';
    }

    switch (selectedFormat) {
      case 'css':
        return generateMultiPageCSS(selectedPages, selectedThemes, tokens, tokenGroups, nodes, primaryThemeId, activeHexOverride, advancedLogic, computedTokens);
      case 'dtcg':
        return generateMultiPageDTCG(selectedPages, selectedThemes, tokens, tokenGroups, nodes, primaryThemeId, activeHexOverride, advancedLogic, computedTokens);
      case 'tailwind':
        return generateMultiPageTailwind(selectedPages, selectedThemes, tokens, tokenGroups, nodes, primaryThemeId, activeHexOverride, advancedLogic, computedTokens);
      case 'figma':
        // For Figma Variables, show only the preview theme
        const previewTheme = projectThemes.find(t => t.id === previewThemeId);
        if (previewTheme && selectedThemeIds.has(previewTheme.id)) {
          return generateFigmaForSingleTheme(selectedPages, previewTheme, tokens, tokenGroups, nodes, primaryThemeId, advancedLogic, computedTokens);
        }
        // Fallback to first selected theme if preview theme is not selected
        if (selectedThemes.length > 0) {
          return generateFigmaForSingleTheme(selectedPages, selectedThemes[0], tokens, tokenGroups, nodes, primaryThemeId, advancedLogic, computedTokens);
        }
        return '{}';
      default:
        return '';
    }
  };

  const codeContent = getCodeContent();

  const lineCount = useMemo(() => codeContent.split('\n').length, [codeContent]);

  const copyToClipboard = async () => {
    try {
      await copyTextToClipboard(codeContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const downloadFile = () => {
    const selectedPages = projectPages.filter(p => selectedPageIds.has(p.id));
    const selectedThemes = projectThemes.filter(t => selectedThemeIds.has(t.id));
    
    const extensions: Record<CodeFormat, string> = {
      css: 'css',
      dtcg: 'json',
      tailwind: 'js',
      figma: 'json',
    };
    
    // For Figma format with multiple themes, create a ZIP with separate JSON files
    if (selectedFormat === 'figma' && selectedThemes.length > 1) {
      const zip = new JSZip();
      
      selectedThemes.forEach(theme => {
        const themeContent = generateFigmaForSingleTheme(selectedPages, theme, tokens, tokenGroups, nodes, primaryThemeId, advancedLogic, computedTokens);
        const fileName = `${theme.name}.json`;
        zip.file(fileName, themeContent);
      });
      
      zip.generateAsync({ type: 'blob' }).then(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'figma-variables.zip';
        a.click();
        URL.revokeObjectURL(url);
      });
      return;
    }
    
    // For other formats or single theme, download as a single file
    const fileName = `tokens-all-pages.${extensions[selectedFormat]}`;
    const blob = new Blob([codeContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatDescriptions: Record<CodeFormat, string> = {
    css: 'CSS custom properties',
    dtcg: 'Design Token Community Group',
    tailwind: 'Tailwind configuration',
    figma: 'Figma Variables JSON',
  };

  const isDisabled = selectedPageIds.size === 0 || selectedThemeIds.size === 0;

  return (
    <div className="export-root">
      {/* ──── Top Bar ──── */}
      <div className="export-top-bar">
        {/* Left: Info */}
        <div className="export-top-bar-left">
          <span className="export-top-bar-label">Multi-Page Export</span>
          <div className="export-top-bar-divider" />
          <span className="export-top-bar-stat">
            {selectedPageIds.size} page{selectedPageIds.size !== 1 ? 's' : ''}
          </span>
          <div className="export-top-bar-divider" />
          <span className="export-top-bar-stat">
            {selectedThemeIds.size} theme{selectedThemeIds.size !== 1 ? 's' : ''}
          </span>
          {/* Figma theme preview selector (inline in top bar) */}
          {selectedFormat === 'figma' && selectedThemeIds.size > 0 && (
            <>
              <div className="export-top-bar-divider" />
              <span className="export-top-bar-preview-label">Preview:</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="export-figma-preview-btn">
                    <span className="export-figma-preview-btn-text" title={projectThemes.find(t => t.id === previewThemeId)?.name || 'Select'}>{projectThemes.find(t => t.id === previewThemeId)?.name || 'Select'}</span>
                    <ChevronDown className="export-figma-preview-chevron" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="export-dropdown-content--narrow">
                  {projectThemes.filter(t => selectedThemeIds.has(t.id)).map(theme => (
                    <DropdownMenuItem
                      key={theme.id}
                      onClick={() => setPreviewThemeId(theme.id)}
                      className="export-dropdown-theme-item"
                    >
                      <span className={theme.id === previewThemeId ? 'export-figma-theme-label--active' : 'export-figma-theme-label--inactive'} title={theme.name}>
                        {theme.name}
                      </span>
                      {theme.isPrimary && <span className="export-sidebar-item-badge" style={{ marginLeft: 8 }}>(Primary)</span>}
                      {theme.id === previewThemeId && <Check className="export-format-dropdown-check" style={{ marginLeft: 'auto' }} />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>

        {/* Right: Actions */}
        <div className="export-top-bar-right">
          {/* Format Selector */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="export-action-btn">
                <span>{formatLabels[selectedFormat]}</span>
                <ChevronDown className="export-action-icon" style={{ opacity: 0.4 }} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="export-dropdown-content">
              {(Object.keys(formatLabels) as CodeFormat[]).map(fmt => (
                <DropdownMenuItem
                  key={fmt}
                  onClick={() => setSelectedFormat(fmt)}
                  className="export-dropdown-menu-item"
                >
                  <div className="export-format-dropdown-item">
                    <span className={fmt === selectedFormat ? 'export-format-dropdown-item-label--active' : 'export-format-dropdown-item-label--inactive'}>
                      {formatLabels[fmt]}
                    </span>
                    <span className="export-format-dropdown-item-desc">{formatDescriptions[fmt]}</span>
                  </div>
                  {fmt === selectedFormat && <Check className="export-format-dropdown-check" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Divider */}
          <div className="export-divider-v" />

          {/* Copy */}
          <button
            onClick={copyToClipboard}
            disabled={isDisabled}
            className="export-action-btn"
          >
            {copied ? (
              <>
                <Check className="export-action-icon--success" />
                <span className="export-action-text--success">Copied</span>
              </>
            ) : (
              <>
                <Copy className="export-action-icon" />
                <span>Copy</span>
              </>
            )}
          </button>

          {/* Download */}
          <button
            onClick={downloadFile}
            disabled={isDisabled}
            className="export-action-btn"
          >
            <Download className="export-action-icon" />
            <span>Download</span>
          </button>
        </div>
      </div>

      {/* ──── Main Content: Sidebar + Code ──── */}
      <div className="export-main">
        {/* ──── Left Sidebar ──── */}
        <div className="export-sidebar">
          <ScrollArea className="export-sidebar-scroll">
            {/* Pages Section */}
            <div className="export-sidebar-section-header">
              <div className="export-sidebar-section-title-row">
                <span className="export-sidebar-section-title">Pages</span>
                <button
                  onClick={toggleAllPages}
                  className="export-sidebar-toggle-all-btn"
                >
                  {selectedPageIds.size === projectPages.length ? 'Deselect All' : 'Select All'}
                </button>
              </div>
              <span className="export-sidebar-section-count">
                {selectedPageIds.size} of {projectPages.length} selected
              </span>
            </div>

            <div className="export-sidebar-list">
              {projectPages.map(page => (
                <div
                  key={page.id}
                  className="export-sidebar-item"
                  onClick={() => togglePage(page.id)}
                >
                  <Checkbox
                    checked={selectedPageIds.has(page.id)}
                    onCheckedChange={() => togglePage(page.id)}
                    className="export-checkbox-wrapper"
                  />
                  <span className={`export-sidebar-item-label ${
                    selectedPageIds.has(page.id) ? 'export-sidebar-item-label--selected' : 'export-sidebar-item-label--unselected'
                  }`} title={page.name}>{page.name}</span>
                </div>
              ))}
            </div>

            {/* Divider */}
            <div className="export-sidebar-divider" />

            {/* Themes Section */}
            <div className="export-sidebar-section-header--themes">
              <div className="export-sidebar-section-title-row">
                <span className="export-sidebar-section-title">Themes</span>
                <button
                  onClick={toggleAllThemes}
                  className="export-sidebar-toggle-all-btn"
                >
                  {selectedThemeIds.size === projectThemes.length ? 'Deselect All' : 'Select All'}
                </button>
              </div>
              <span className="export-sidebar-section-count">
                {selectedThemeIds.size} of {projectThemes.length} selected
              </span>
            </div>

            <div className="export-sidebar-list--themes">
              {projectThemes.map(theme => (
                <div
                  key={theme.id}
                  className="export-sidebar-item"
                  onClick={() => toggleTheme(theme.id)}
                >
                  <Checkbox
                    checked={selectedThemeIds.has(theme.id)}
                    onCheckedChange={() => toggleTheme(theme.id)}
                    className="export-checkbox-wrapper"
                  />
                  <span className={`export-sidebar-item-label ${
                    selectedThemeIds.has(theme.id) ? 'export-sidebar-item-label--selected' : 'export-sidebar-item-label--unselected'
                  }`} title={theme.name}>{theme.name}</span>
                  {theme.isPrimary && (
                    <span className="export-sidebar-item-badge">(Primary)</span>
                  )}
                </div>
              ))}
            </div>

            {/* Show as Hex Section — hidden for Figma Variables (always hex) */}
            {selectedFormat !== 'figma' && (
              <>
                <div className="export-sidebar-divider" />

                <div className="export-sidebar-section-header--hex">
                  <div className="export-sidebar-hex-title-row">
                    <Hash className="export-sidebar-hex-icon" />
                    <span className="export-sidebar-section-title">Show as Hex</span>
                  </div>
                  <span className="export-sidebar-hex-hint">
                    Convert color spaces to hex
                  </span>
                </div>

                <div className="export-sidebar-list--hex">
                  {([
                    { key: 'hsl', label: 'HSL' },
                    { key: 'oklch', label: 'OKLCH' },
                  ] as const).map(({ key, label }) => (
                    <div
                      key={key}
                      className="export-sidebar-item"
                      onClick={() => toggleHexOverride(key)}
                    >
                      <div className="export-checkbox-wrapper" style={{ flexShrink: 0 }}>
                        <Checkbox
                          checked={hexOverrideSpaces.has(key)}
                        />
                      </div>
                      <span className={`export-sidebar-item-label ${
                        hexOverrideSpaces.has(key) ? 'export-sidebar-item-label--selected' : 'export-sidebar-item-label--unselected'
                      }`}>{label}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </ScrollArea>
        </div>

        {/* ──── Right Panel — Code Preview ──── */}
        <div className="export-code-panel">
          {/* Code Display */}
          <div className="export-code-display">
            {selectedPageIds.size === 0 ? (
              <div className="export-empty">
                <div className="export-empty-inner">
                  <div className="export-empty-icon-wrapper">
                    <FileText className="export-empty-icon" />
                  </div>
                  <p className="export-empty-title">No pages selected</p>
                  <p className="export-empty-subtitle">
                    Select at least one page to export tokens
                  </p>
                </div>
              </div>
            ) : selectedThemeIds.size === 0 ? (
              <div className="export-empty">
                <div className="export-empty-inner">
                  <div className="export-empty-icon-wrapper">
                    <Palette className="export-empty-icon" />
                  </div>
                  <p className="export-empty-title">No themes selected</p>
                  <p className="export-empty-subtitle">
                    Select at least one theme to export tokens
                  </p>
                </div>
              </div>
            ) : (
              <SyntaxHighlightedCode
                code={codeContent}
                language={selectedFormat === 'css' ? 'css' : selectedFormat === 'tailwind' ? 'javascript' : 'json'}
              />
            )}
          </div>

          {/* ──── Footer ──── */}
          <div className="export-footer">
            <span className="export-footer-left">
              {!isDisabled && <>{lineCount} line{lineCount !== 1 ? 's' : ''} {'\u00b7'} </>}
              {formatLabels[selectedFormat]}
            </span>
            <span className="export-footer-right">
              Read-only
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper function to check if token is assigned to any node for a given theme
function isTokenAssignedToNode(token: DesignToken, nodes: ColorNode[], themeId?: string): boolean {
  return nodes.some(node => {
    if (themeId) {
      const themeAssignments = node.tokenAssignments?.[themeId] || [];
      if (themeAssignments.length > 0) {
        return themeAssignments.includes(token.id);
      }
    }
    // Fallback to legacy tokenIds
    const tokenIds = node.tokenIds || [];
    return tokenIds.includes(token.id);
  });
}

// ─── Token Node Group Token Helpers ─────────────────────────────
/** Check if a token belongs to a token node group */
function isTokenNodeGroupToken(token: DesignToken, groups: TokenGroup[]): boolean {
  if (!token.groupId) return false;
  const group = groups.find(g => g.id === token.groupId);
  return group?.isTokenNodeGroup === true;
}

/** Resolve value token reference for a token node group token in a given theme */
function resolveTokenNodeValueRef(
  token: DesignToken,
  allTokens: DesignToken[],
  nodes: ColorNode[],
  activeThemeId: string,
  primaryThemeId: string,
): DesignToken | null {
  const ownerNode = nodes.find(n => n.isTokenNode && !n.isTokenPrefix && n.ownTokenId === token.id);
  if (!ownerNode) return null;
  let resolvedId: string | undefined;
  if (ownerNode.valueTokenAssignments?.[activeThemeId] !== undefined) {
    resolvedId = ownerNode.valueTokenAssignments[activeThemeId] || undefined;
  } else if (primaryThemeId && ownerNode.valueTokenAssignments?.[primaryThemeId] !== undefined) {
    resolvedId = ownerNode.valueTokenAssignments[primaryThemeId] || undefined;
  } else {
    resolvedId = ownerNode.valueTokenId;
  }
  if (!resolvedId) return null;
  return allTokens.find(t => t.id === resolvedId) || null;
}

// Multi-page format generators
function generateMultiPageCSS(pages: Page[], themes: Theme[], tokens: DesignToken[], groups: TokenGroup[], nodes: ColorNode[], primaryThemeId: string, hexOverride?: Set<string>, advancedLogic?: NodeAdvancedLogic[], projectComputedTokens?: ProjectComputedTokens): string {
  let output = '';
  
  // Generate for each theme
  themes.forEach((theme, themeIndex) => {
    // Use :root for first theme (primary), data attribute for others
    const selector = themeIndex === 0 ? ':root' : `[data-theme="${theme.name}"]`;
    output += `${selector} {\n`;
    
    // Evaluate advanced logic for this theme
    const computedTokens = advancedLogic
      ? evaluateAllTokenAssignments(advancedLogic, tokens, nodes, theme.id, primaryThemeId)
      : new Map<string, TokenAssignExportResult>();
    
    // Use computed tokens as source of truth for visibility when available
    const themeComputed = projectComputedTokens?.themes?.find(t => t.themeId === theme.id);
    let themeVisibleTokens: DesignToken[];
    if (themeComputed && themeComputed.tokens.length > 0) {
      const visibleIds = new Set(themeComputed.tokens.map(t => t.id));
      themeVisibleTokens = tokens.filter(t => visibleIds.has(t.id));
    } else {
      themeVisibleTokens = getVisibleTokens(tokens, nodes, theme.id, primaryThemeId);
    }
    
    pages.forEach(page => {
      const pageTokens = themeVisibleTokens.filter(t => {
        if (isTokenNodeGroupToken(t, groups)) {
          // Include if has computed value OR value token ref
          return t.pageId === page.id && (computedTokens.has(t.id) || !!resolveTokenNodeValueRef(t, tokens, nodes, theme.id, primaryThemeId));
        }
        return t.pageId === page.id && isTokenAssignedToNode(t, nodes, theme.id);
      });
      if (pageTokens.length === 0) return;
      
      output += `  /* ${page.name} */\n`;
      
      // Group tokens by group
      const tokensByGroup = new Map<string | null, DesignToken[]>();
      pageTokens.forEach(token => {
        const groupId = token.groupId || null;
        if (!tokensByGroup.has(groupId)) {
          tokensByGroup.set(groupId, []);
        }
        tokensByGroup.get(groupId)!.push(token);
      });
      
      // Output tokens by group
      tokensByGroup.forEach((groupTokens, groupId) => {
        if (groupId) {
          const group = groups.find(g => g.id === groupId);
          output += `  /* ${group?.name || 'Ungrouped'} */\n`;
        }
        
        groupTokens.forEach(token => {
          // Token node group tokens: check computed value first, then var() reference
          if (isTokenNodeGroupToken(token, groups)) {
            const computed = computedTokens.get(token.id);
            if (computed) {
              if (computed.result.type === 'computedColor') {
                const ownerNode = nodes.find(n => n.ownTokenId === token.id);
                const cs = ownerNode?.colorSpace || 'hsl';
                const cssValue = tokenColorToNativeCSS(computed.result.color, cs, hexOverride);
                output += `  --${token.name}: ${cssValue}; /* ${computed.expressionText} */\n`;
              } else if (computed.result.type === 'tokenRef') {
                const refToken = tokens.find(t => t.id === computed.result.tokenId);
                if (refToken) {
                  output += `  --${token.name}: var(--${refToken.name}); /* ${computed.expressionText} */\n`;
                }
              }
              return;
            }
            const valueToken = resolveTokenNodeValueRef(token, tokens, nodes, theme.id, primaryThemeId);
            if (valueToken) {
              output += `  --${token.name}: var(--${valueToken.name});\n`;
            }
            return;
          }
          // Get theme-specific color value using shared helpers (respects color space + hex override)
          const nodeColorSpace = getTokenNodeColorSpace(token, nodes, theme.id);
          const color = getTokenColorValue(token, theme.id, nodeColorSpace, hexOverride);
          if (color) {
            output += `  --${token.name}: ${color.native};\n`;
          }
        });
      });
      
      output += '\n';
    });
    
    output += '}\n\n';
  });
  
  return output.trim();
}

function generateMultiPageDTCG(pages: Page[], themes: Theme[], tokens: DesignToken[], groups: TokenGroup[], nodes: ColorNode[], primaryThemeId: string, hexOverride?: Set<string>, advancedLogic?: NodeAdvancedLogic[], projectComputedTokens?: ProjectComputedTokens): string {
  const output: any = {};
  
  // Nest by theme first, then by page
  themes.forEach(theme => {
    const themeObj: any = {};
    // Evaluate advanced logic for this theme
    const computedTokens = advancedLogic
      ? evaluateAllTokenAssignments(advancedLogic, tokens, nodes, theme.id, primaryThemeId)
      : new Map<string, TokenAssignExportResult>();
    // Use computed tokens as source of truth for visibility when available
    const themeComputed = projectComputedTokens?.themes?.find(t => t.themeId === theme.id);
    let themeVisibleTokens: DesignToken[];
    if (themeComputed && themeComputed.tokens.length > 0) {
      const visibleIds = new Set(themeComputed.tokens.map(t => t.id));
      themeVisibleTokens = tokens.filter(t => visibleIds.has(t.id));
    } else {
      themeVisibleTokens = getVisibleTokens(tokens, nodes, theme.id, primaryThemeId);
    }
    
    pages.forEach(page => {
      const pageTokens = themeVisibleTokens.filter(t => {
        if (isTokenNodeGroupToken(t, groups)) {
          return t.pageId === page.id && (computedTokens.has(t.id) || !!resolveTokenNodeValueRef(t, tokens, nodes, theme.id, primaryThemeId));
        }
        return t.pageId === page.id && isTokenAssignedToNode(t, nodes, theme.id);
      });
      if (pageTokens.length === 0) return;
      
      const pageObj: any = {};
      
      // Group tokens by group
      const tokensByGroup = new Map<string | null, DesignToken[]>();
      pageTokens.forEach(token => {
        const groupId = token.groupId || null;
        if (!tokensByGroup.has(groupId)) {
          tokensByGroup.set(groupId, []);
        }
        tokensByGroup.get(groupId)!.push(token);
      });
      
      tokensByGroup.forEach((groupTokens, groupId) => {
        const groupName = groupId ? (groups.find(g => g.id === groupId)?.name || 'ungrouped') : 'ungrouped';
        if (!pageObj[groupName]) pageObj[groupName] = {};
        
        groupTokens.forEach(token => {
          // Token node group tokens: check computed value first
          if (isTokenNodeGroupToken(token, groups)) {
            const computed = computedTokens.get(token.id);
            if (computed) {
              if (computed.result.type === 'computedColor') {
                const ownerNode = nodes.find(n => n.ownTokenId === token.id);
                const cs = ownerNode?.colorSpace || 'hsl';
                const cssValue = tokenColorToNativeCSS(computed.result.color, cs, hexOverride);
                pageObj[groupName][token.name] = {
                  $type: 'color',
                  $value: cssValue,
                  $description: `Computed: ${computed.expressionText}`,
                };
              } else if (computed.result.type === 'tokenRef') {
                const refToken = tokens.find(t => t.id === computed.result.tokenId);
                if (refToken) {
                  pageObj[groupName][token.name] = {
                    $type: 'color',
                    $value: `{${refToken.name}}`,
                    $description: `Computed: ${computed.expressionText}`,
                  };
                }
              }
              return;
            }
            const valueToken = resolveTokenNodeValueRef(token, tokens, nodes, theme.id, primaryThemeId);
            if (valueToken) {
              pageObj[groupName][token.name] = {
                $type: 'color',
                $value: `{${valueToken.name}}`,
              };
            }
            return;
          }
          // Use shared helpers (respects color space + hex override)
          const nodeColorSpace = getTokenNodeColorSpace(token, nodes, theme.id);
          const color = getTokenColorValue(token, theme.id, nodeColorSpace, hexOverride);
          if (color) {
            pageObj[groupName][token.name] = {
              $type: 'color',
              $value: color.native,
            };
          }
        });
      });
      
      if (Object.keys(pageObj).length > 0) {
        themeObj[page.name] = pageObj;
      }
    });
    
    if (Object.keys(themeObj).length > 0) {
      output[theme.name] = themeObj;
    }
  });
  
  return JSON.stringify(output, null, 2);
}

function generateMultiPageTailwind(pages: Page[], themes: Theme[], tokens: DesignToken[], groups: TokenGroup[], nodes: ColorNode[], primaryThemeId: string, hexOverride?: Set<string>, advancedLogic?: NodeAdvancedLogic[], projectComputedTokens?: ProjectComputedTokens): string {
  let output = 'module.exports = {\n  theme: {\n    extend: {\n      colors: {\n';
  
  themes.forEach(theme => {
    output += `        // Theme: ${theme.name}\n`;
    // Evaluate advanced logic for this theme
    const computedTokens = advancedLogic
      ? evaluateAllTokenAssignments(advancedLogic, tokens, nodes, theme.id, primaryThemeId)
      : new Map<string, TokenAssignExportResult>();
    // Use computed tokens as source of truth for visibility when available
    const themeComputed = projectComputedTokens?.themes?.find(t => t.themeId === theme.id);
    let themeVisibleTokens: DesignToken[];
    if (themeComputed && themeComputed.tokens.length > 0) {
      const visibleIds = new Set(themeComputed.tokens.map(t => t.id));
      themeVisibleTokens = tokens.filter(t => visibleIds.has(t.id));
    } else {
      themeVisibleTokens = getVisibleTokens(tokens, nodes, theme.id, primaryThemeId);
    }
    
    pages.forEach(page => {
      const pageTokens = themeVisibleTokens.filter(t => {
        if (isTokenNodeGroupToken(t, groups)) {
          return t.pageId === page.id && (computedTokens.has(t.id) || !!resolveTokenNodeValueRef(t, tokens, nodes, theme.id, primaryThemeId));
        }
        return t.pageId === page.id && isTokenAssignedToNode(t, nodes, theme.id);
      });
      if (pageTokens.length === 0) return;
      
      output += `        // ${page.name}\n`;
      
      // Group tokens by group
      const tokensByGroup = new Map<string | null, DesignToken[]>();
      pageTokens.forEach(token => {
        const groupId = token.groupId || null;
        if (!tokensByGroup.has(groupId)) {
          tokensByGroup.set(groupId, []);
        }
        tokensByGroup.get(groupId)!.push(token);
      });
      
      tokensByGroup.forEach((groupTokens, groupId) => {
        if (groupId) {
          const group = groups.find(g => g.id === groupId);
          output += `        // ${group?.name || 'Ungrouped'}\n`;
        }
        
        groupTokens.forEach(token => {
          // Token node group tokens: check computed value first
          if (isTokenNodeGroupToken(token, groups)) {
            const computed = computedTokens.get(token.id);
            if (computed) {
              const tokenName = themes.length > 1 ? `${token.name}-${theme.name}` : token.name;
              if (computed.result.type === 'computedColor') {
                const ownerNode = nodes.find(n => n.ownTokenId === token.id);
                const cs = ownerNode?.colorSpace || 'hsl';
                const cssValue = tokenColorToNativeCSS(computed.result.color, cs, hexOverride);
                output += `        '${tokenName}': '${cssValue}',\n`;
              } else if (computed.result.type === 'tokenRef') {
                const refToken = tokens.find(t => t.id === computed.result.tokenId);
                if (refToken) {
                  output += `        '${tokenName}': 'var(--${refToken.name})',\n`;
                }
              }
              return;
            }
            const valueToken = resolveTokenNodeValueRef(token, tokens, nodes, theme.id, primaryThemeId);
            if (valueToken) {
              const tokenName = themes.length > 1 ? `${token.name}-${theme.name}` : token.name;
              output += `        '${tokenName}': 'var(--${valueToken.name})',\n`;
            }
            return;
          }
          // Get theme-specific color value using shared helpers (respects color space + hex override)
          const nodeColorSpace = getTokenNodeColorSpace(token, nodes, theme.id);
          const color = getTokenColorValue(token, theme.id, nodeColorSpace, hexOverride);
          if (color) {
            const tokenName = themes.length > 1 ? `${token.name}-${theme.name}` : token.name;
            output += `        '${tokenName}': '${color.native}',\n`;
          }
        });
      });
      
      output += '\n';
    });
  });
  
  output += '      },\n    },\n  },\n};';
  return output;
}

function generateMultiPageFigma(pages: Page[], themes: Theme[], tokens: DesignToken[], groups: TokenGroup[], nodes: ColorNode[], primaryThemeId: string, advancedLogic?: NodeAdvancedLogic[], projectComputedTokens?: ProjectComputedTokens): string {
  const output: any = {};
  
  // Nest by theme first, then by page
  themes.forEach(theme => {
    const themeObj: any = {};

    // Evaluate advanced logic for this theme
    const computedTokens = advancedLogic
      ? evaluateAllTokenAssignments(advancedLogic, tokens, nodes, theme.id, primaryThemeId)
      : new Map<string, TokenAssignExportResult>();

    // Use computed tokens as source of truth for visibility when available
    const themeComputed = projectComputedTokens?.themes?.find(t => t.themeId === theme.id);
    let themeVisibleTokens: DesignToken[];
    if (themeComputed && themeComputed.tokens.length > 0) {
      const visibleIds = new Set(themeComputed.tokens.map(t => t.id));
      themeVisibleTokens = tokens.filter(t => visibleIds.has(t.id));
    } else {
      themeVisibleTokens = getVisibleTokens(tokens, nodes, theme.id, primaryThemeId);
    }
    
    pages.forEach((page, pageIndex) => {
      const pageTokens = themeVisibleTokens.filter(t => {
        if (isTokenNodeGroupToken(t, groups)) {
          return t.pageId === page.id && (computedTokens.has(t.id) || !!resolveTokenNodeValueRef(t, tokens, nodes, theme.id, primaryThemeId));
        }
        return t.pageId === page.id && isTokenAssignedToNode(t, nodes, theme.id);
      });
      if (pageTokens.length === 0) return;
      
      const pageObj: any = {};
      
      // Group tokens by group
      const tokensByGroup = new Map<string | null, DesignToken[]>();
      pageTokens.forEach(token => {
        const groupId = token.groupId || null;
        if (!tokensByGroup.has(groupId)) {
          tokensByGroup.set(groupId, []);
        }
        tokensByGroup.get(groupId)!.push(token);
      });
      
      // Process each group
      let tokenCounter = 0;
      tokensByGroup.forEach((groupTokens, groupId) => {
        const groupName = groupId ? (groups.find(g => g.id === groupId)?.name || 'ungrouped') : null;
        
        groupTokens.forEach((token) => {
          // Token node group tokens: check computed value first, then alias reference
          if (isTokenNodeGroupToken(token, groups)) {
            const computed = computedTokens.get(token.id);
            if (computed && computed.result.type === 'computedColor') {
              const c = computed.result.color;
              const hex = hslToHex(c.h, c.s, c.l);
              const rgba = hexToRGBAComponents(hex);
              const variableId = `VariableID:${pageIndex}:${tokenCounter}`;
              tokenCounter++;
              const tokenData = {
                $type: 'color',
                $value: {
                  colorSpace: 'srgb',
                  components: [rgba.r, rgba.g, rgba.b],
                  alpha: (c.a ?? 100) / 100,
                  hex: hex.toUpperCase(),
                },
                $description: `Computed: ${computed.expressionText}`,
                $extensions: {
                  'com.figma.variableId': variableId,
                  'com.figma.scopes': ['ALL_SCOPES'],
                },
              };
              if (!groupName) {
                pageObj[token.name] = tokenData;
              } else {
                const targetObj = setNestedProperty(pageObj, groupName, null);
                targetObj[token.name] = tokenData;
              }
              return;
            } else if (computed && computed.result.type === 'tokenRef') {
              const refToken = tokens.find(t => t.id === computed.result.tokenId);
              if (refToken) {
                const refTokenName = refToken.name.toLowerCase().replace(/\s+/g, '-');
                let refGroupPath = '';
                if (refToken.groupId) {
                  const refGroup = groups.find(g => g.id === refToken.groupId);
                  if (refGroup && !refGroup.isPaletteEntry) {
                    refGroupPath = `${refGroup.name.toLowerCase().replace(/\s+/g, '-')}.`;
                  }
                }
                const refPage = pages.find(p => p.id === refToken.pageId);
                const refPagePath = refPage ? `${refPage.name}.` : '';
                const refPath = `${refPagePath}${refGroupPath}${refTokenName}`;
                const variableId = `VariableID:${pageIndex}:${tokenCounter}`;
                tokenCounter++;
                const tokenData = {
                  $type: 'color',
                  $value: `{${refPath}}`,
                  $description: `Computed: ${computed.expressionText}`,
                  $extensions: {
                    'com.figma.variableId': variableId,
                    'com.figma.scopes': ['ALL_SCOPES'],
                  },
                };
                if (!groupName) {
                  pageObj[token.name] = tokenData;
                } else {
                  const targetObj = setNestedProperty(pageObj, groupName, null);
                  targetObj[token.name] = tokenData;
                }
                return;
              }
            }

            // Fallback: static value token reference
            const valueToken = resolveTokenNodeValueRef(token, tokens, nodes, theme.id, primaryThemeId);
            if (!valueToken) return;
            const refTokenName = valueToken.name.toLowerCase().replace(/\s+/g, '-');
            let refGroupPath = '';
            if (valueToken.groupId) {
              const refGroup = groups.find(g => g.id === valueToken.groupId);
              if (refGroup && !refGroup.isPaletteEntry) {
                refGroupPath = `${refGroup.name.toLowerCase().replace(/\s+/g, '-')}.`;
              }
            }
            const refPage = pages.find(p => p.id === valueToken.pageId);
            const refPagePath = refPage ? `${refPage.name}.` : '';
            const refPath = `${refPagePath}${refGroupPath}${refTokenName}`;

            const variableId = `VariableID:${pageIndex}:${tokenCounter}`;
            tokenCounter++;

            const tokenData = {
              $type: 'color',
              $value: `{${refPath}}`,
              $extensions: {
                'com.figma.variableId': variableId,
                'com.figma.scopes': ['ALL_SCOPES'],
              },
            };

            if (!groupName) {
              pageObj[token.name] = tokenData;
            } else {
              const targetObj = setNestedProperty(pageObj, groupName, null);
              targetObj[token.name] = tokenData;
            }
            return;
          }

          // Get theme-specific color value
          const themeValue = token.themeValues?.[theme.id];
          if (!themeValue || themeValue.hue === undefined) return;
          
          const h = themeValue.hue ?? 0;
          const s = themeValue.saturation ?? 0;
          const l = themeValue.lightness ?? 0;
          const a = (themeValue.alpha ?? 100) / 100;
          
          // Convert to hex
          const hex = hslToHex(h, s, l);
          const rgba = hexToRGBAComponents(hex);
          
          const variableId = `VariableID:${pageIndex}:${tokenCounter}`;
          tokenCounter++;
          
          const tokenData = {
            $type: 'color',
            $value: {
              colorSpace: 'srgb',
              components: [rgba.r, rgba.g, rgba.b],
              alpha: a,
              hex: hex.toUpperCase(),
            },
            $extensions: {
              'com.figma.variableId': variableId,
              'com.figma.scopes': ['ALL_SCOPES'],
            },
          };
          
          // If no group, add directly to page, otherwise nest under group path
          if (!groupName) {
            pageObj[token.name] = tokenData;
          } else {
            // Support nested groups using "/" separator (e.g., "colors/primary")
            const targetObj = setNestedProperty(pageObj, groupName, null);
            targetObj[token.name] = tokenData;
          }
        });
      });
      
      if (Object.keys(pageObj).length > 0) {
        themeObj[page.name] = pageObj;
      }
    });
    
    if (Object.keys(themeObj).length > 0) {
      output[theme.name] = themeObj;
    }
  });
  
  return JSON.stringify(output, null, 2);
}

// Helper to convert HSL to hex
function hslToHex(h: number, s: number, l: number): string {
  s = s / 100;
  l = l / 100;
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
  
  const r = Math.round((r1 + m) * 255);
  const g = Math.round((g1 + m) * 255);
  const b = Math.round((b1 + m) * 255);
  
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`.toUpperCase();
}

// Helper function to convert hex color to RGBA components for Figma DTCG format
function hexToRGBAComponents(hex: string): { r: number; g: number; b: number; a: number } {
  // Handle undefined or empty values
  if (!hex) {
    return { r: 0, g: 0, b: 0, a: 1 };
  }
  
  // Remove # if present
  hex = hex.replace('#', '');
  
  let r = 0, g = 0, b = 0, a = 1;
  
  if (hex.length === 6) {
    r = parseInt(hex.substring(0, 2), 16) / 255;
    g = parseInt(hex.substring(2, 4), 16) / 255;
    b = parseInt(hex.substring(4, 6), 16) / 255;
  } else if (hex.length === 8) {
    r = parseInt(hex.substring(0, 2), 16) / 255;
    g = parseInt(hex.substring(2, 4), 16) / 255;
    b = parseInt(hex.substring(4, 6), 16) / 255;
    a = parseInt(hex.substring(6, 8), 16) / 255;
  } else if (hex.length === 3) {
    r = parseInt(hex[0] + hex[0], 16) / 255;
    g = parseInt(hex[1] + hex[1], 16) / 255;
    b = parseInt(hex[2] + hex[2], 16) / 255;
  }
  
  return { r, g, b, a };
}

// Helper function to set a nested property in an object using a path (e.g., "colors/primary" -> obj.colors.primary)
function setNestedProperty(obj: any, path: string, value: any) {
  const parts = path.split('/');
  let current = obj;
  
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!current[part]) {
      current[part] = {};
    }
    current = current[part];
  }
  
  const lastPart = parts[parts.length - 1];
  if (!current[lastPart]) {
    current[lastPart] = {};
  }
  
  return current[lastPart];
}

// Helper function to generate Figma variables for a single theme
function generateFigmaForSingleTheme(pages: Page[], theme: Theme, tokens: DesignToken[], groups: TokenGroup[], nodes: ColorNode[], primaryThemeId: string, advancedLogic?: NodeAdvancedLogic[], projectComputedTokens?: ProjectComputedTokens): string {
  const output: any = {};
  // Evaluate advanced logic for this theme
  const computedTokenMap = advancedLogic
    ? evaluateAllTokenAssignments(advancedLogic, tokens, nodes, theme.id, primaryThemeId)
    : new Map<string, TokenAssignExportResult>();
  // Use computed tokens as source of truth for visibility when available
  const themeComputed = projectComputedTokens?.themes?.find(t => t.themeId === theme.id);
  let themeVisibleTokens: DesignToken[];
  if (themeComputed && themeComputed.tokens.length > 0) {
    const visibleIds = new Set(themeComputed.tokens.map(t => t.id));
    themeVisibleTokens = tokens.filter(t => visibleIds.has(t.id));
  } else {
    themeVisibleTokens = getVisibleTokens(tokens, nodes, theme.id, primaryThemeId);
  }
  
  // Nest by page
  pages.forEach((page, pageIndex) => {
    // Filter tokens by page - include both regular tokens and token node group tokens
    const pageTokens = themeVisibleTokens.filter(t => {
      if (isTokenNodeGroupToken(t, groups)) {
        return t.pageId === page.id && (computedTokenMap.has(t.id) || !!resolveTokenNodeValueRef(t, tokens, nodes, theme.id, primaryThemeId));
      }
      return t.pageId === page.id && isTokenAssignedToNode(t, nodes, theme.id);
    });
    
    if (pageTokens.length === 0) {
      return;
    }
    
    const pageObj: any = {};
    
    // Group tokens by group
    const tokensByGroup = new Map<string | null, DesignToken[]>();
    pageTokens.forEach(token => {
      const groupId = token.groupId || null;
      if (!tokensByGroup.has(groupId)) {
        tokensByGroup.set(groupId, []);
      }
      tokensByGroup.get(groupId)!.push(token);
    });
    
    // Process each group
    let tokenCounter = 0;
    tokensByGroup.forEach((groupTokens, groupId) => {
      const groupName = groupId ? (groups.find(g => g.id === groupId)?.name || 'ungrouped') : null;
      
      groupTokens.forEach((token) => {
        // Token node group tokens: check computed value first, then alias reference
        if (isTokenNodeGroupToken(token, groups)) {
          const computed = computedTokenMap.get(token.id);
          if (computed && computed.result.type === 'computedColor') {
            const c = computed.result.color;
            const hex = hslToHex(c.h, c.s, c.l);
            const rgba = hexToRGBAComponents(hex);
            const variableId = `VariableID:${pageIndex}:${tokenCounter}`;
            tokenCounter++;
            const tokenData = {
              $type: 'color',
              $value: {
                colorSpace: 'srgb',
                components: [rgba.r, rgba.g, rgba.b],
                alpha: (c.a ?? 100) / 100,
                hex: hex.toUpperCase(),
              },
              $description: `Computed: ${computed.expressionText}`,
              $extensions: {
                'com.figma.variableId': variableId,
                'com.figma.scopes': ['ALL_SCOPES'],
              },
            };
            if (!groupName) {
              pageObj[token.name] = tokenData;
            } else {
              const targetObj = setNestedProperty(pageObj, groupName, null);
              targetObj[token.name] = tokenData;
            }
            return;
          } else if (computed && computed.result.type === 'tokenRef') {
            const refToken = tokens.find(t => t.id === computed.result.tokenId);
            if (refToken) {
              const refTokenName = refToken.name.toLowerCase().replace(/\s+/g, '-');
              let refGroupPath = '';
              if (refToken.groupId) {
                const refGroup = groups.find(g => g.id === refToken.groupId);
                if (refGroup && !refGroup.isPaletteEntry) {
                  refGroupPath = `${refGroup.name.toLowerCase().replace(/\s+/g, '-')}.`;
                }
              }
              const refPage = pages.find(p => p.id === refToken.pageId);
              const refPagePath = refPage ? `${refPage.name}.` : '';
              const refPath = `${refPagePath}${refGroupPath}${refTokenName}`;
              const variableId = `VariableID:${pageIndex}:${tokenCounter}`;
              tokenCounter++;
              const tokenData = {
                $type: 'color',
                $value: `{${refPath}}`,
                $description: `Computed: ${computed.expressionText}`,
                $extensions: {
                  'com.figma.variableId': variableId,
                  'com.figma.scopes': ['ALL_SCOPES'],
                },
              };
              if (!groupName) {
                pageObj[token.name] = tokenData;
              } else {
                const targetObj = setNestedProperty(pageObj, groupName, null);
                targetObj[token.name] = tokenData;
              }
              return;
            }
          }

          // Fallback: static value token reference
          const valueToken = resolveTokenNodeValueRef(token, tokens, nodes, theme.id, primaryThemeId);
          if (!valueToken) return;
          const refTokenName = valueToken.name.toLowerCase().replace(/\s+/g, '-');
          let refGroupPath = '';
          if (valueToken.groupId) {
            const refGroup = groups.find(g => g.id === valueToken.groupId);
            if (refGroup && !refGroup.isPaletteEntry) {
              refGroupPath = `${refGroup.name.toLowerCase().replace(/\s+/g, '-')}.`;
            }
          }
          const refPage = pages.find(p => p.id === valueToken.pageId);
          const refPagePath = refPage ? `${refPage.name}.` : '';
          const refPath = `${refPagePath}${refGroupPath}${refTokenName}`;

          const variableId = `VariableID:${pageIndex}:${tokenCounter}`;
          tokenCounter++;

          const tokenData = {
            $type: 'color',
            $value: `{${refPath}}`,
            $extensions: {
              'com.figma.variableId': variableId,
              'com.figma.scopes': ['ALL_SCOPES'],
            },
          };

          if (!groupName) {
            pageObj[token.name] = tokenData;
          } else {
            const targetObj = setNestedProperty(pageObj, groupName, null);
            targetObj[token.name] = tokenData;
          }
          return;
        }

        // Get theme-specific color value
        const themeValue = token.themeValues?.[theme.id];
        if (!themeValue || themeValue.hue === undefined) return;
        
        const h = themeValue.hue ?? 0;
        const s = themeValue.saturation ?? 0;
        const l = themeValue.lightness ?? 0;
        const a = (themeValue.alpha ?? 100) / 100;
        
        // Convert to hex
        const hex = hslToHex(h, s, l);
        const rgba = hexToRGBAComponents(hex);
        
        const variableId = `VariableID:${pageIndex}:${tokenCounter}`;
        tokenCounter++;
        
        const tokenData = {
          $type: 'color',
          $value: {
            colorSpace: 'srgb',
            components: [rgba.r, rgba.g, rgba.b],
            alpha: a,
            hex: hex.toUpperCase(),
          },
          $extensions: {
            'com.figma.variableId': variableId,
            'com.figma.scopes': ['ALL_SCOPES'],
          },
        };
        
        // If no group, add directly to page, otherwise nest under group path
        if (!groupName) {
          pageObj[token.name] = tokenData;
        } else {
          // Support nested groups using "/" separator (e.g., "colors/primary")
          const targetObj = setNestedProperty(pageObj, groupName, null);
          targetObj[token.name] = tokenData;
        }
      });
    });
    
    if (Object.keys(pageObj).length > 0) {
      output[page.name] = pageObj;
    }
  });
  
  return JSON.stringify(output, null, 2);
}