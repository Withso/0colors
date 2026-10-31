// A tiny, dependency-free highlighter for the CSS and JSON the exporters produce.
import type { ReactNode } from 'react';

const CSS_RE = /(\/\*[\s\S]*?\*\/)|(@[\w-]+)|(:root|\[[^\]\n]+\]|&:[\w-]+)|(--[\w-]+)|(#[0-9a-fA-F]{3,8}\b)|(\b[a-z-]+(?=\())|("[^"\n]*")|(-?\d*\.?\d+(?:%|deg)?)|([{}();:,])/g;
const CSS_CLASSES = ['text-fg-3 italic', 'text-danger', 'text-danger', 'text-accent', 'text-warning', 'text-success', 'text-success', 'text-warning', 'text-fg-3'];

const JSON_RE = /("(?:[^"\\\n]|\\.)*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b|([{}[\],])/g;

export function highlight(code: string, language: 'css' | 'json'): ReactNode[] {
  const out: ReactNode[] = [];
  const re = language === 'css' ? CSS_RE : JSON_RE;
  re.lastIndex = 0;
  let last = 0;
  let key = 0;
  for (let m = re.exec(code); m; m = re.exec(code)) {
    if (m.index > last) out.push(code.slice(last, m.index));
    if (language === 'css') {
      const group = m.slice(1).findIndex((g) => g !== undefined);
      out.push(<span key={key++} className={CSS_CLASSES[group]}>{m[0]}</span>);
    } else if (m[1] !== undefined) {
      const isKey = m[2] !== undefined;
      out.push(<span key={key++} className={isKey ? 'text-accent' : 'text-success'}>{m[1]}</span>);
      if (isKey) out.push(<span key={key++} className="text-fg-3">{m[2]}</span>);
    } else if (m[3] !== undefined) {
      out.push(<span key={key++} className="text-warning">{m[3]}</span>);
    } else if (m[4] !== undefined) {
      out.push(<span key={key++} className="text-danger">{m[4]}</span>);
    } else {
      out.push(<span key={key++} className="text-fg-3">{m[0]}</span>);
    }
    last = m.index + m[0].length;
  }
  if (last < code.length) out.push(code.slice(last));
  return out;
}

