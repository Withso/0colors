import { useMemo, useRef, useState, useCallback } from 'react';

// ───── Geist-inspired syntax color palette ─────
const COLORS = {
  // Base
  bg: '#0a0a0a',
  gutterBg: '#0a0a0a',
  gutterBorder: '#141414',
  lineNumber: '#444',
  lineNumberActive: '#666',
  lineHighlight: 'rgba(255,255,255,0.03)',
  text: '#abb2bf',

  // CSS
  cssSelector: '#FFA0E6',      // :root, [data-theme]  — Pink
  cssProperty: '#D4A0FF',      // --color-xxx — Lavender
  cssValue: '#5CD88E',          // #hex, hsl(), oklch() — Green
  cssNumber: '#FF7A90',         // numeric values — Coral
  cssPunctuation: '#636d83',    // { } ; :
  cssComment: '#5c6370',        // /* comment */
  cssUnit: '#7B8FFF',           // px, rem, em, % — Blue
  cssFunction: '#7B8FFF',       // hsl(), hsla(), oklch(), rgb() — Blue

  // JSON
  jsonKey: '#FFA0E6',           // "key" — Pink
  jsonString: '#5CD88E',        // "value" — Green
  jsonNumber: '#FF7A90',        // 123 — Coral
  jsonBool: '#FF7A90',          // true/false/null — Coral
  jsonBrace: '#abb2bf',         // { } [ ]
  jsonPunctuation: '#636d83',   // : ,

  // JS / Tailwind
  jsKeyword: '#FFA0E6',        // module, exports, const, theme — Pink
  jsString: '#5CD88E',         // 'string' — Green
  jsComment: '#5c6370',        // // comment
  jsProperty: '#D4A0FF',       // property names — Lavender
  jsNumber: '#FF7A90',         // numbers — Coral
  jsPunctuation: '#636d83',    // { } ; = ,
  jsFunction: '#7B8FFF',       // extend, colors — Blue
};

type Language = 'css' | 'json' | 'javascript';

interface Token {
  text: string;
  color: string;
  italic?: boolean;
}

// ───── CSS Tokenizer ─────
function tokenizeCSS(line: string): Token[] {
  const tokens: Token[] = [];
  let remaining = line;

  while (remaining.length > 0) {
    // Leading whitespace
    const wsMatch = remaining.match(/^(\s+)/);
    if (wsMatch) {
      tokens.push({ text: wsMatch[1], color: COLORS.text });
      remaining = remaining.slice(wsMatch[1].length);
      continue;
    }

    // Block comment (single line or start/end)
    const commentMatch = remaining.match(/^(\/\*.*?\*\/)/);
    if (commentMatch) {
      tokens.push({ text: commentMatch[1], color: COLORS.cssComment, italic: true });
      remaining = remaining.slice(commentMatch[1].length);
      continue;
    }

    // Line comment fragment (/* ... without close)
    const openCommentMatch = remaining.match(/^(\/\*.*)$/);
    if (openCommentMatch) {
      tokens.push({ text: openCommentMatch[1], color: COLORS.cssComment, italic: true });
      remaining = '';
      continue;
    }

    // CSS selector — :root, [data-theme="..."]
    const selectorMatch = remaining.match(/^(:root|\.[\w-]+|\[data-[\w-]+(?:="[^"]*")?\])/);
    if (selectorMatch) {
      tokens.push({ text: selectorMatch[1], color: COLORS.cssSelector });
      remaining = remaining.slice(selectorMatch[1].length);
      continue;
    }

    // CSS variable property name (--xxx)
    const varMatch = remaining.match(/^(--[\w\/-]+)/);
    if (varMatch) {
      tokens.push({ text: varMatch[1], color: COLORS.cssProperty });
      remaining = remaining.slice(varMatch[1].length);
      continue;
    }

    // Color functions: hsl(), hsla(), oklch(), rgb(), rgba()
    const funcMatch = remaining.match(/^(hsla?|oklch|rgba?)\(/);
    if (funcMatch) {
      tokens.push({ text: funcMatch[1], color: COLORS.cssFunction });
      tokens.push({ text: '(', color: COLORS.cssPunctuation });
      remaining = remaining.slice(funcMatch[0].length);

      // Consume everything until closing paren
      const closeIdx = remaining.indexOf(')');
      if (closeIdx !== -1) {
        const inner = remaining.slice(0, closeIdx);
        // Tokenize numbers, commas, %, / inside
        tokenizeFuncArgs(inner, tokens);
        tokens.push({ text: ')', color: COLORS.cssPunctuation });
        remaining = remaining.slice(closeIdx + 1);
      }
      continue;
    }

    // Hex color value
    const hexMatch = remaining.match(/^(#[0-9a-fA-F]{3,8})/);
    if (hexMatch) {
      tokens.push({ text: hexMatch[1], color: COLORS.cssValue });
      remaining = remaining.slice(hexMatch[1].length);
      continue;
    }

    // Numbers with optional unit
    const numMatch = remaining.match(/^(-?\d+\.?\d*)(px|rem|em|%|ms|s|deg)?/);
    if (numMatch && numMatch[0].length > 0) {
      tokens.push({ text: numMatch[1], color: COLORS.cssNumber });
      if (numMatch[2]) {
        tokens.push({ text: numMatch[2], color: COLORS.cssUnit });
      }
      remaining = remaining.slice(numMatch[0].length);
      continue;
    }

    // Punctuation: { } ; : ,
    if ('{}'.includes(remaining[0])) {
      tokens.push({ text: remaining[0], color: COLORS.cssPunctuation });
      remaining = remaining.slice(1);
      continue;
    }
    if (';:,'.includes(remaining[0])) {
      tokens.push({ text: remaining[0], color: COLORS.cssPunctuation });
      remaining = remaining.slice(1);
      continue;
    }

    // Plain text (word or single char fallback)
    const wordMatch = remaining.match(/^([^\s{};:,/#()-]+)/);
    if (wordMatch) {
      tokens.push({ text: wordMatch[1], color: COLORS.text });
      remaining = remaining.slice(wordMatch[1].length);
      continue;
    }

    // Single char fallback
    tokens.push({ text: remaining[0], color: COLORS.text });
    remaining = remaining.slice(1);
  }

  return tokens;
}

function tokenizeFuncArgs(inner: string, tokens: Token[]) {
  let rem = inner;
  while (rem.length > 0) {
    const ws = rem.match(/^(\s+)/);
    if (ws) {
      tokens.push({ text: ws[1], color: COLORS.text });
      rem = rem.slice(ws[1].length);
      continue;
    }
    const num = rem.match(/^(-?\d+\.?\d*)(px|rem|em|%|deg)?/);
    if (num && num[0].length > 0) {
      tokens.push({ text: num[1], color: COLORS.cssNumber });
      if (num[2]) tokens.push({ text: num[2], color: COLORS.cssUnit });
      rem = rem.slice(num[0].length);
      continue;
    }
    if (',/'.includes(rem[0])) {
      tokens.push({ text: rem[0], color: COLORS.cssPunctuation });
      rem = rem.slice(1);
      continue;
    }
    tokens.push({ text: rem[0], color: COLORS.text });
    rem = rem.slice(1);
  }
}

// ───── JSON Tokenizer ─────
function tokenizeJSON(line: string): Token[] {
  const tokens: Token[] = [];
  let remaining = line;

  while (remaining.length > 0) {
    // Whitespace
    const ws = remaining.match(/^(\s+)/);
    if (ws) {
      tokens.push({ text: ws[1], color: COLORS.text });
      remaining = remaining.slice(ws[1].length);
      continue;
    }

    // String — determine if key or value by context
    if (remaining[0] === '"') {
      const strMatch = remaining.match(/^("(?:[^"\\]|\\.)*")/);
      if (strMatch) {
        const str = strMatch[1];
        // Check if followed by : (it's a key)
        const afterStr = remaining.slice(str.length).trimStart();
        const isKey = afterStr.startsWith(':');

        if (isKey) {
          tokens.push({ text: str, color: COLORS.jsonKey });
        } else {
          // Check if it looks like a color value
          const inner = str.slice(1, -1);
          if (/^#[0-9a-fA-F]{3,8}$/.test(inner)) {
            tokens.push({ text: '"', color: COLORS.jsonString });
            tokens.push({ text: inner, color: COLORS.cssValue });
            tokens.push({ text: '"', color: COLORS.jsonString });
          } else {
            tokens.push({ text: str, color: COLORS.jsonString });
          }
        }
        remaining = remaining.slice(str.length);
        continue;
      }
    }

    // Numbers
    const numMatch = remaining.match(/^(-?\d+\.?\d*(?:[eE][+-]?\d+)?)/);
    if (numMatch) {
      tokens.push({ text: numMatch[1], color: COLORS.jsonNumber });
      remaining = remaining.slice(numMatch[1].length);
      continue;
    }

    // Booleans / null
    const boolMatch = remaining.match(/^(true|false|null)/);
    if (boolMatch) {
      tokens.push({ text: boolMatch[1], color: COLORS.jsonBool });
      remaining = remaining.slice(boolMatch[1].length);
      continue;
    }

    // Braces & brackets
    if ('{}[]'.includes(remaining[0])) {
      tokens.push({ text: remaining[0], color: COLORS.jsonBrace });
      remaining = remaining.slice(1);
      continue;
    }

    // Punctuation: : ,
    if (':,'.includes(remaining[0])) {
      tokens.push({ text: remaining[0], color: COLORS.jsonPunctuation });
      remaining = remaining.slice(1);
      continue;
    }

    // Fallback
    tokens.push({ text: remaining[0], color: COLORS.text });
    remaining = remaining.slice(1);
  }

  return tokens;
}

// ───── JavaScript Tokenizer ─────
const JS_KEYWORDS = new Set([
  'module', 'exports', 'const', 'let', 'var', 'function', 'return', 'import',
  'export', 'default', 'from', 'require', 'extends', 'theme', 'colors', 'extend',
]);

function tokenizeJS(line: string): Token[] {
  const tokens: Token[] = [];
  let remaining = line;

  while (remaining.length > 0) {
    // Whitespace
    const ws = remaining.match(/^(\s+)/);
    if (ws) {
      tokens.push({ text: ws[1], color: COLORS.text });
      remaining = remaining.slice(ws[1].length);
      continue;
    }

    // Line comments
    const commentMatch = remaining.match(/^(\/\/.*)/);
    if (commentMatch) {
      tokens.push({ text: commentMatch[1], color: COLORS.jsComment, italic: true });
      remaining = '';
      continue;
    }

    // Strings (single or double quoted)
    const strMatch = remaining.match(/^('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")/);
    if (strMatch) {
      // Check if it contains a hex color
      const inner = strMatch[1].slice(1, -1);
      const quote = strMatch[1][0];
      if (/^#[0-9a-fA-F]{3,8}$/.test(inner)) {
        tokens.push({ text: quote, color: COLORS.jsString });
        tokens.push({ text: inner, color: COLORS.cssValue });
        tokens.push({ text: quote, color: COLORS.jsString });
      } else {
        tokens.push({ text: strMatch[1], color: COLORS.jsString });
      }
      remaining = remaining.slice(strMatch[1].length);
      continue;
    }

    // Numbers
    const numMatch = remaining.match(/^(-?\d+\.?\d*)/);
    if (numMatch) {
      tokens.push({ text: numMatch[1], color: COLORS.jsNumber });
      remaining = remaining.slice(numMatch[1].length);
      continue;
    }

    // Identifiers (keywords vs property names)
    const identMatch = remaining.match(/^([a-zA-Z_$][\w$]*)/);
    if (identMatch) {
      const word = identMatch[1];
      if (JS_KEYWORDS.has(word)) {
        tokens.push({ text: word, color: COLORS.jsKeyword });
      } else {
        // Check if followed by : → property name
        const afterIdent = remaining.slice(word.length).trimStart();
        if (afterIdent.startsWith(':')) {
          tokens.push({ text: word, color: COLORS.jsProperty });
        } else {
          tokens.push({ text: word, color: COLORS.text });
        }
      }
      remaining = remaining.slice(word.length);
      continue;
    }

    // Punctuation
    if ('{}[]();:,=.'.includes(remaining[0])) {
      tokens.push({ text: remaining[0], color: COLORS.jsPunctuation });
      remaining = remaining.slice(1);
      continue;
    }

    // Fallback
    tokens.push({ text: remaining[0], color: COLORS.text });
    remaining = remaining.slice(1);
  }

  return tokens;
}

// ───── Language Detection ─────
function detectLanguage(code: string): Language {
  const trimmed = code.trimStart();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 'json';
  if (trimmed.startsWith(':root') || trimmed.startsWith('/*') || /^\[data-theme/.test(trimmed) || /^--/.test(trimmed)) return 'css';
  if (trimmed.includes('module.exports') || trimmed.includes('const ') || trimmed.includes('export ')) return 'javascript';
  // Check if it looks like JSON
  try {
    JSON.parse(code);
    return 'json';
  } catch {
    // Not JSON
  }
  // Default to CSS for token outputs
  return 'css';
}

// ───── Main Tokenizer ─────
function tokenizeLine(line: string, language: Language): Token[] {
  switch (language) {
    case 'css': return tokenizeCSS(line);
    case 'json': return tokenizeJSON(line);
    case 'javascript': return tokenizeJS(line);
    default: return [{ text: line, color: COLORS.text }];
  }
}

// ───── Component ─────

interface SyntaxHighlightedCodeProps {
  code: string;
  language?: Language;
  className?: string;
}

export function SyntaxHighlightedCode({ code, language: forcedLanguage, className = '' }: SyntaxHighlightedCodeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredLine, setHoveredLine] = useState<number | null>(null);

  const detectedLanguage = useMemo(() => forcedLanguage || detectLanguage(code), [code, forcedLanguage]);

  const lines = useMemo(() => code.split('\n'), [code]);

  const tokenizedLines = useMemo(
    () => lines.map(line => tokenizeLine(line, detectedLanguage)),
    [lines, detectedLanguage]
  );

  const lineCount = lines.length;
  const gutterWidth = Math.max(2, String(lineCount).length);

  // Handle mouse leave on the whole container
  const handleContainerLeave = useCallback(() => {
    setHoveredLine(null);
  }, []);

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden ${className}`}
      style={{ background: COLORS.bg }}
      onMouseLeave={handleContainerLeave}
    >
      {/* Code area with line numbers */}
      <div
        className="overflow-auto font-mono text-[13px] leading-[22px]"
        style={{ tabSize: 2 }}
      >
        <table
          className="w-full border-collapse"
          style={{ borderSpacing: 0 }}
        >
          <tbody>
            {tokenizedLines.map((tokens, idx) => {
              const isHovered = hoveredLine === idx;
              return (
                <tr
                  key={idx}
                  onMouseEnter={() => setHoveredLine(idx)}
                  style={{
                    background: isHovered ? COLORS.lineHighlight : 'transparent',
                  }}
                >
                  {/* Line number gutter */}
                  <td
                    className="select-none text-right align-top shrink-0 sticky left-0"
                    style={{
                      color: isHovered ? COLORS.lineNumberActive : COLORS.lineNumber,
                      width: `${gutterWidth + 2}ch`,
                      minWidth: `${gutterWidth + 2}ch`,
                      paddingRight: '1.25ch',
                      paddingLeft: '1ch',
                      paddingTop: idx === 0 ? '16px' : undefined,
                      paddingBottom: idx === lineCount - 1 ? '16px' : undefined,
                      background: COLORS.gutterBg,
                      borderRight: `1px solid ${COLORS.gutterBorder}`,
                      transition: 'color 0.1s',
                      userSelect: 'none',
                    }}
                  >
                    {idx + 1}
                  </td>

                  {/* Code content */}
                  <td
                    className="align-top whitespace-pre"
                    style={{
                      paddingLeft: '1.5ch',
                      paddingRight: '2ch',
                      paddingTop: idx === 0 ? '16px' : undefined,
                      paddingBottom: idx === lineCount - 1 ? '16px' : undefined,
                    }}
                  >
                    {tokens.map((token, ti) => (
                      <span
                        key={ti}
                        style={{
                          color: token.color,
                          fontStyle: token.italic ? 'italic' : undefined,
                        }}
                      >
                        {token.text}
                      </span>
                    ))}
                    {tokens.length === 0 && <span>&nbsp;</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}