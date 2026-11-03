import { getEditor } from '../store';

/** Save text as a file in the browser (no server involved). */
export function downloadText(fileName: string, text: string, type = 'text/plain'): void {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/** Select a node and ask the canvas to bring it into view. */
export function focusNode(id: string): void {
  getEditor().select([id]);
  window.dispatchEvent(new CustomEvent('0colors:focus-node', { detail: { id } }));
}
