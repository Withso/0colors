import { useState, useMemo } from 'react';
import { DesignToken, ColorNode, Page, TokenGroup, Theme, NodeAdvancedLogic } from '../types';
import { Copy, Check, Download, ChevronDown, FileCode2 } from 'lucide-react';
import { copyTextToClipboard } from '../utils/clipboard';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import {
  generateCSSVariables,
  generateDTCGJSON,
  generateTailwindConfig,
  generateFigmaVariablesJSON,
} from '../utils/tokenFormatters';
import { SyntaxHighlightedCode } from '../components/SyntaxHighlightedCode';
import { Checkbox } from '../components/ui/checkbox';
import { getVisibleTokens } from '../utils/visibility';
import type { ProjectComputedTokens } from '../utils/computed-tokens';
import './CodePreview.css';

type CodeFormat = 'css' | 'dtcg' | 'tailwind' | 'figma';

interface CodePreviewProps {
  tokens: DesignToken[];
  tokenGroups: TokenGroup[];
  nodes: ColorNode[];
  allProjectTokens?: DesignToken[];
  allProjectNodes?: ColorNode[];
  activePage: Page | undefined;
  themes: Theme[];
  activeThemeId: string;
  hexOverridesByPage: Record<string, Set<string>>;
  onHexOverridesByPageChange: (value: Record<string, Set<string>>) => void;
  advancedLogic?: NodeAdvancedLogic[];
  computedTokens?: ProjectComputedTokens;
}

const FORMAT_LANGUAGE_MAP: Record<CodeFormat, 'css' | 'json' | 'javascript'> = {
  css: 'css',
  dtcg: 'json',
  tailwind: 'javascript',
  figma: 'json',
};

export function CodePreview({ tokens, tokenGroups, nodes, allProjectTokens, allProjectNodes, activePage, themes, activeThemeId, hexOverridesByPage, onHexOverridesByPageChange, advancedLogic, computedTokens }: CodePreviewProps) {
  const [selectedFormat, setSelectedFormat] = useState<CodeFormat>('css');
  const [copied, setCopied] = useState(false);

  const activeTheme = themes.find(t => t.id === activeThemeId);
  const currentPageId = activePage?.id || '';

  // Get the current page's hex override set
  const hexOverrideSpaces = hexOverridesByPage[currentPageId] || new Set<string>();

  const toggleHexOverride = (space: string) => {
    const currentSet = hexOverridesByPage[currentPageId] || new Set<string>();
    const next = new Set(currentSet);
    if (next.has(space)) {
      next.delete(space);
    } else {
      next.add(space);
    }
    onHexOverridesByPageChange({ ...hexOverridesByPage, [currentPageId]: next });
  };

  // Only pass hexOverrideSpaces when size > 0 (for performance — avoids unnecessary work)
  const activeHexOverride = hexOverrideSpaces.size > 0 ? hexOverrideSpaces : undefined;

  const formatLabels: Record<CodeFormat, string> = {
    css: 'CSS Variables',
    dtcg: 'DTCG JSON',
    tailwind: 'Tailwind CSS',
    figma: 'Figma Variables',
  };

  const formatDescriptions: Record<CodeFormat, string> = {
    css: 'CSS custom properties',
    dtcg: 'Design Token Community Group',
    tailwind: 'Tailwind configuration',
    figma: 'Figma Variables JSON',
  };

  const primaryThemeId = themes.find(t => t.isPrimary)?.id || '';

  const getCodeContent = (): string => {
    const pageName = activePage?.name || 'Design Tokens';
    // Use computed tokens as the source of truth for visibility when available,
    // falling back to legacy getVisibleTokens for backward compatibility
    let visibleTokens: DesignToken[];
    const themeComputed = computedTokens?.themes?.find(t => t.themeId === activeThemeId);
    if (themeComputed && themeComputed.tokens.length > 0) {
      const visibleIds = new Set(themeComputed.tokens.map(t => t.id));
      visibleTokens = tokens.filter(t => visibleIds.has(t.id));
    } else {
      visibleTokens = getVisibleTokens(tokens, nodes, activeThemeId, primaryThemeId);
    }

    switch (selectedFormat) {
      case 'css':
        return generateCSSVariables(visibleTokens, tokenGroups, nodes, activeThemeId, activeHexOverride, primaryThemeId, allProjectTokens, allProjectNodes, advancedLogic);
      case 'dtcg':
        return generateDTCGJSON(visibleTokens, tokenGroups, nodes, activeThemeId, activeHexOverride, primaryThemeId, allProjectTokens, allProjectNodes, advancedLogic);
      case 'tailwind':
        return generateTailwindConfig(visibleTokens, tokenGroups, nodes, activeThemeId, activeHexOverride, primaryThemeId, allProjectTokens, allProjectNodes, advancedLogic);
      case 'figma':
        return generateFigmaVariablesJSON(visibleTokens, tokenGroups, nodes, pageName, activeThemeId, primaryThemeId, allProjectTokens, allProjectNodes, advancedLogic);
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
    const extensions: Record<CodeFormat, string> = {
      css: 'css',
      dtcg: 'json',
      tailwind: 'js',
      figma: 'json',
    };

    const fileName = `tokens-${activePage?.name.toLowerCase().replace(/\s+/g, '-') || 'export'}.${extensions[selectedFormat]}`;
    const blob = new Blob([codeContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="code-preview-root" data-testid="code-preview-page">
      {/* ─── Top Bar ─── */}
      <div className="code-preview-top-bar">
        <div className="code-preview-top-bar-left">
          <FileCode2 className="code-preview-file-icon" />
          <span className="code-preview-label">
            Code Export
          </span>
          {activePage && (
            <>
              <div className="code-preview-divider" />
              <span className="code-preview-meta-text">{activePage.name}</span>
            </>
          )}
          {activeTheme && (
            <>
              <div className="code-preview-divider" />
              <span className="code-preview-meta-text">{activeTheme.name}</span>
            </>
          )}

          {/* Show as Hex — multi-select dropdown (hidden for Figma Variables which are always hex) */}
          {selectedFormat !== 'figma' && (
            <>
              <div className="code-preview-divider" />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className={`code-preview-hex-btn ${
                      hexOverrideSpaces.size > 0
                        ? 'code-preview-hex-btn--active'
                        : 'code-preview-hex-btn--inactive'
                    }`}
                  >
                    <span>Show as Hex{hexOverrideSpaces.size > 0 ? ` (${hexOverrideSpaces.size})` : ''}</span>
                    <ChevronDown className="code-preview-hex-chevron" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="code-preview-dropdown-content--narrow"
                  onCloseAutoFocus={(e) => e.preventDefault()}
                >
                  {([
                    { key: 'hsl', label: 'HSL' },
                    { key: 'oklch', label: 'OKLCH' },
                  ] as const).map(({ key, label }) => (
                    <DropdownMenuItem
                      key={key}
                      onSelect={(e) => {
                        e.preventDefault(); // keep dropdown open
                        toggleHexOverride(key);
                      }}
                      className="code-preview-hex-menu-item"
                    >
                      <div className="code-preview-checkbox-wrapper">
                        <Checkbox
                          checked={hexOverrideSpaces.has(key)}
                        />
                      </div>
                      <span className={hexOverrideSpaces.has(key) ? 'code-preview-hex-dropdown-label--active' : 'code-preview-hex-dropdown-label--inactive'}>
                        {label}
                      </span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>

        <div className="code-preview-top-bar-right">
          {/* Format selector */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="code-preview-action-btn" data-testid="code-preview-format-dropdown-trigger">
                <span>{formatLabels[selectedFormat]}</span>
                <ChevronDown className="code-preview-action-icon" style={{ opacity: 0.4 }} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="code-preview-dropdown-content">
              {(Object.keys(formatLabels) as CodeFormat[]).map(fmt => (
                <DropdownMenuItem
                  key={fmt}
                  onClick={() => setSelectedFormat(fmt)}
                  className="code-preview-dropdown-menu-item"
                >
                  <div className="code-preview-dropdown-item">
                    <span className={fmt === selectedFormat ? 'code-preview-dropdown-item-label--active' : 'code-preview-dropdown-item-label--inactive'}>
                      {formatLabels[fmt]}
                    </span>
                    <span className="code-preview-dropdown-item-desc">{formatDescriptions[fmt]}</span>
                  </div>
                  {fmt === selectedFormat && <Check className="code-preview-dropdown-check" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Divider */}
          <div className="code-preview-divider-v" />

          {/* Copy */}
          <button
            onClick={copyToClipboard}
            className="code-preview-action-btn"
            data-testid="code-preview-copy-button"
          >
            {copied ? (
              <>
                <Check className="code-preview-action-icon--success" />
                <span className="code-preview-action-text--success">Copied</span>
              </>
            ) : (
              <>
                <Copy className="code-preview-action-icon" />
                <span>Copy</span>
              </>
            )}
          </button>

          {/* Download */}
          <button
            onClick={downloadFile}
            className="code-preview-action-btn"
            data-testid="code-preview-download-button"
          >
            <Download className="code-preview-action-icon" />
            <span>Download</span>
          </button>
        </div>
      </div>

      {/* ─── Code Display ─── */}
      <div className="code-preview-code-area">
        {tokens.length === 0 ? (
          <div className="code-preview-empty">
            <div className="code-preview-empty-inner">
              <div className="code-preview-empty-icon-wrapper">
                <FileCode2 className="code-preview-empty-icon" />
              </div>
              <p className="code-preview-empty-title">No tokens to export</p>
              <p className="code-preview-empty-subtitle">
                Create and assign tokens to nodes to see code output
              </p>
            </div>
          </div>
        ) : (
          <SyntaxHighlightedCode
            code={codeContent}
            language={FORMAT_LANGUAGE_MAP[selectedFormat]}
          />
        )}
      </div>

      {/* ─── Footer ─── */}
      <div className="code-preview-footer">
        <span className="code-preview-footer-left">
          {lineCount} line{lineCount !== 1 ? 's' : ''}
          {' \u00b7 '}
          {formatLabels[selectedFormat]}
        </span>
        <span className="code-preview-footer-right">
          Read-only
        </span>
      </div>
    </div>
  );
}
