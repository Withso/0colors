// Share links: the whole project is compressed into the URL hash.
// The hash never reaches a server, so shared canvases stay private to whoever has the link.
import { type Project, uid } from './model';
import { normalizeProject } from './schema';

const DAMAGED = 'This share link is incomplete or damaged.';

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new Error(DAMAGED);
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

export async function encodeShare(project: Project): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(project));
  if (typeof CompressionStream === 'function') {
    try {
      return 'z' + toBase64Url(await pipe(bytes, new CompressionStream('deflate-raw')));
    } catch {
      // Fall through to the uncompressed form.
    }
  }
  return 'j' + toBase64Url(bytes);
}

export async function decodeShare(code: string): Promise<Project> {
  const trimmed = code.trim();
  const kind = trimmed[0];
  const body = trimmed.slice(1);
  if (!body || (kind !== 'z' && kind !== 'j')) throw new Error(DAMAGED);
  if (kind === 'z' && typeof DecompressionStream !== 'function') {
    throw new Error('This browser cannot open compressed share links. Try a recent Chrome, Edge, Firefox or Safari.');
  }

  let parsed: unknown;
  try {
    let bytes = fromBase64Url(body);
    if (kind === 'z') bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error(DAMAGED);
  }

  const project = normalizeProject(parsed);
  // A fresh id means opening a link can never overwrite a canvas you already have.
  return { ...project, id: uid('p_'), updatedAt: Date.now() };
}

export function shareUrl(origin: string, code: string): string {
  return `${origin.replace(/\/+$/, '')}/#s=${code}`;
}

export function readShareCode(hash: string): string | null {
  const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
  const code = params.get('s');
  return code && code.length > 1 ? code : null;
}
