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
    <div className="w-full h-full flex flex-col bg-[#0c0c0c] overflow-hidden">
      {/* ─── Top Bar ─── */}
      <div className="flex items-center justify-between px-5 h-[44px] shrink-0 border-b border-[#141414] bg-[#0c0c0c]">
        <div className="flex items-center gap-3 min-w-0">
          <FileCode2 className="h-3.5 w-3.5 text-ghost shrink-0" />
          <span className="text-[11px] text-faint uppercase tracking-widest shrink-0">
            Code Export
          </span>
          {activePage && (
            <>
              <div className="w-px h-3.5 bg-[#1f1f1f] shrink-0" />
              <span className="text-[11px] text-dim">{activePage.name}</span>
            </>
          )}
          {activeTheme && (
            <>
              <div className="w-px h-3.5 bg-[#1f1f1f] shrink-0" />
              <span className="text-[11px] text-dim">{activeTheme.name}</span>
            </>
          )}

          {/* Show as Hex — multi-select dropdown (hidden for Figma Variables which are always hex) */}
          {selectedFormat !== 'figma' && (
            <>
              <div className="w-px h-3.5 bg-[#1f1f1f] shrink-0" />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className={`flex items-center gap-1.5 h-[28px] px-2.5 rounded-md border text-[11px] transition-colors outline-none cursor-pointer ${
                      hexOverrideSpaces.size > 0
                        ? 'bg-[#1a1a2e] border-[#252525] text-foreground'
                        : 'bg-[#141414] border-secondary hover:bg-secondary text-subtle hover:text-foreground'
                    }`}
                  >
                    <span>Show as Hex{hexOverrideSpaces.size > 0 ? ` (${hexOverrideSpaces.size})` : ''}</span>
                    <ChevronDown className="h-3 w-3 opacity-40" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="w-[180px] bg-card border-secondary p-1 shadow-lg"
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
                      className="flex items-center gap-2.5 text-xs cursor-pointer focus:bg-hairline focus:text-foreground"
                    >
                      <div className="pointer-events-none shrink-0">
                        <Checkbox
                          checked={hexOverrideSpaces.has(key)}
                        />
                      </div>
                      <span className={hexOverrideSpaces.has(key) ? 'text-foreground' : 'text-subtle'}>
                        {label}
                      </span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {/* Format selector */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex items-center gap-1.5 h-[28px] px-2.5 rounded-md bg-[#141414] border border-secondary hover:bg-secondary text-[11px] text-subtle hover:text-foreground transition-colors outline-none cursor-pointer"
              >
                <span>{formatLabels[selectedFormat]}</span>
                <ChevronDown className="h-3 w-3 opacity-40" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[220px] bg-card border-secondary p-1 shadow-lg">
              {(Object.keys(formatLabels) as CodeFormat[]).map(fmt => (
                <DropdownMenuItem
                  key={fmt}
                  onClick={() => setSelectedFormat(fmt)}
                  className="flex items-center justify-between text-xs cursor-pointer focus:bg-hairline focus:text-foreground"
                >
                  <div className="flex flex-col">
                    <span className={fmt === selectedFormat ? 'text-foreground' : 'text-subtle'}>
                      {formatLabels[fmt]}
                    </span>
                    <span className="text-[10px] text-ghost">{formatDescriptions[fmt]}</span>
                  </div>
                  {fmt === selectedFormat && <Check className="h-3 w-3 text-dim" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Divider */}
          <div className="w-px h-4 bg-[#1f1f1f] mx-0.5" />

          {/* Copy */}
          <button
            onClick={copyToClipboard}
            className="flex items-center gap-1.5 h-[28px] px-2.5 rounded-md bg-[#141414] border border-secondary hover:bg-secondary text-[11px] text-subtle hover:text-foreground transition-colors cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="h-3 w-3 text-success" />
                <span className="text-success">Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" />
                <span>Copy</span>
              </>
            )}
          </button>

          {/* Download */}
          <button
            onClick={downloadFile}
            className="flex items-center gap-1.5 h-[28px] px-2.5 rounded-md bg-[#141414] border border-secondary hover:bg-secondary text-[11px] text-subtle hover:text-foreground transition-colors cursor-pointer"
          >
            <Download className="h-3 w-3" />
            <span>Download</span>
          </button>
        </div>
      </div>

      {/* ─── Code Display ─── */}
      <div className="flex-1 overflow-auto min-h-0">
        {tokens.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="w-10 h-10 rounded-lg bg-[#141414] border border-[#181818] flex items-center justify-center mx-auto mb-3">
                <FileCode2 className="h-5 w-5 text-ghost" />
              </div>
              <p className="text-dim text-[13px] mb-1">No tokens to export</p>
              <p className="text-ghost text-[11px]">
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
      <div
        className="flex items-center justify-between px-5 h-[30px] shrink-0 select-none"
        style={{ borderTop: '1px solid #141414' }}
      >
        <span className="text-[10px] text-ghost tabular-nums">
          {lineCount} line{lineCount !== 1 ? 's' : ''}
          {' \u00b7 '}
          {formatLabels[selectedFormat]}
        </span>
        <span className="text-[10px] text-ghost uppercase tracking-wider">
          Read-only
        </span>
      </div>
    </div>
  );
}