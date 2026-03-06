/**
 * Copies text to the clipboard using a fallback approach that works
 * in sandboxed environments where the Clipboard API is blocked by
 * permissions policy.
 */
export function copyTextToClipboard(text: string): Promise<void> {
  // Always try the textarea/execCommand fallback first since the
  // Clipboard API is blocked in many sandboxed iframes.
  const fallbackCopy = (): boolean => {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      return true;
    } catch {
      return false;
    } finally {
      document.body.removeChild(textarea);
    }
  };

  // Try native Clipboard API first, fall back to execCommand
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text).catch(() => {
      fallbackCopy();
    });
  }

  fallbackCopy();
  return Promise.resolve();
}
