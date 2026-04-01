/**
 * Thumbnail Generator — creates a visual preview of a project's color canvas.
 *
 * Renders nodes as colored rectangles on a <canvas> element with wires
 * connecting parent→child relationships, then exports as a WebP data URL.
 */

import type { ColorNode } from '../types';

interface ThumbnailOptions {
  width?: number;
  height?: number;
  quality?: number; // 0–1 for WebP quality
  padding?: number;
  bgColor?: string;
}

const DEFAULTS: Required<ThumbnailOptions> = {
  width: 1200,
  height: 630,
  quality: 0.85,
  padding: 60,
  bgColor: '#0a0a0a',
};

function hslToHex(h: number, s: number, l: number): string {
  const sl = s / 100;
  const ll = l / 100;
  const a = sl * Math.min(ll, 1 - ll);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = ll - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** Draw a rounded rectangle (fallback for older browsers without roundRect). */
function drawRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number | number[]) {
  const radii = Array.isArray(r) ? r : [r, r, r, r];
  const [tl, tr, br, bl] = radii.map(v => Math.min(v, w / 2, h / 2));
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + tr);
  ctx.lineTo(x + w, y + h - br);
  ctx.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
  ctx.lineTo(x + bl, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - bl);
  ctx.lineTo(x, y + tl);
  ctx.quadraticCurveTo(x, y, x + tl, y);
  ctx.closePath();
}

/**
 * Generate a WebP data URL thumbnail from project nodes.
 * Shows the first page's nodes as colored rounded rectangles with wire connections.
 */
export function generateThumbnail(
  nodes: ColorNode[],
  pageId: string,
  opts?: ThumbnailOptions,
): string {
  const { width, height, quality, padding, bgColor } = { ...DEFAULTS, ...opts };

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  // Background
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, width, height);

  // Filter nodes for this page
  const pageNodes = nodes.filter((n) => n.pageId === pageId);
  if (pageNodes.length === 0) {
    // Draw "empty" indicator
    ctx.fillStyle = '#1a1a1a';
    ctx.font = '24px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Empty project', width / 2, height / 2);
    return canvas.toDataURL('image/webp', quality);
  }

  // Calculate bounding box for zoom-to-fit
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const nodeWidth = 240; // Default node width
  const nodeHeight = 100; // Approximate node height

  pageNodes.forEach((n) => {
    minX = Math.min(minX, n.position.x);
    minY = Math.min(minY, n.position.y);
    maxX = Math.max(maxX, n.position.x + (n.width || nodeWidth));
    maxY = Math.max(maxY, n.position.y + nodeHeight);
  });

  // Calculate scale to fit all nodes
  const contentWidth = maxX - minX;
  const contentHeight = maxY - minY;
  const availWidth = width - padding * 2;
  const availHeight = height - padding * 2;
  const scale = Math.min(availWidth / Math.max(contentWidth, 1), availHeight / Math.max(contentHeight, 1), 2); // Cap at 2x

  const offsetX = padding + (availWidth - contentWidth * scale) / 2;
  const offsetY = padding + (availHeight - contentHeight * scale) / 2;

  // Transform helper
  const tx = (x: number) => offsetX + (x - minX) * scale;
  const ty = (y: number) => offsetY + (y - minY) * scale;

  // Draw wires first (behind nodes)
  ctx.lineWidth = 2 * Math.min(scale, 1);
  ctx.strokeStyle = 'rgba(100, 100, 100, 0.3)';
  pageNodes.forEach((node) => {
    if (!node.parentId) return;
    const parent = pageNodes.find((n) => n.id === node.parentId);
    if (!parent) return;

    const x1 = tx(parent.position.x + (parent.width || nodeWidth) / 2);
    const y1 = ty(parent.position.y + nodeHeight / 2);
    const x2 = tx(node.position.x + (node.width || nodeWidth) / 2);
    const y2 = ty(node.position.y + nodeHeight / 2);

    ctx.beginPath();
    // Bezier curve for wire
    const midX = (x1 + x2) / 2;
    ctx.moveTo(x1, y1);
    ctx.bezierCurveTo(midX, y1, midX, y2, x2, y2);
    ctx.stroke();
  });

  // Draw nodes
  pageNodes.forEach((node) => {
    const x = tx(node.position.x);
    const y = ty(node.position.y);
    const w = (node.width || nodeWidth) * scale;
    const h = nodeHeight * scale;
    const r = 8 * Math.min(scale, 1);

    // Node background
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : drawRoundRect(ctx, x, y, w, h, r);
    ctx.fill();

    // Color swatch on the node
    const color = hslToHex(node.hue, node.saturation, node.lightness);
    const swatchH = h * 0.45;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x + 4 * scale, y + 4 * scale, w - 8 * scale, swatchH, [r - 2, r - 2, 0, 0]) : drawRoundRect(ctx, x + 4 * scale, y + 4 * scale, w - 8 * scale, swatchH, [r - 2, r - 2, 0, 0]);
    ctx.fill();

    // Node name
    if (scale > 0.3) {
      ctx.fillStyle = '#888';
      ctx.font = `${Math.max(9, 11 * scale)}px system-ui, sans-serif`;
      ctx.textAlign = 'left';
      const name = node.referenceName || node.paletteName || '';
      if (name) {
        ctx.fillText(name, x + 6 * scale, y + swatchH + 16 * scale, w - 12 * scale);
      }
    }

    // Border
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : drawRoundRect(ctx, x, y, w, h, r);
    ctx.stroke();
  });

  // Export as WebP
  try {
    return canvas.toDataURL('image/webp', quality);
  } catch {
    // Fallback to PNG if WebP not supported
    return canvas.toDataURL('image/png');
  }
}