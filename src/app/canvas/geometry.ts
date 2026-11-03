export interface Rect { x: number; y: number; width: number; height: number }
export interface Guide { axis: 'x' | 'y'; pos: number; from: number; to: number }

const valid = (r: Rect) => [r.x, r.y, r.width, r.height].every(Number.isFinite) && r.width >= 0 && r.height >= 0;
const EPSILON = 1e-8;

export function contains(outer: Rect, inner: Rect, tolerance = 0): boolean {
  return valid(outer) && valid(inner)
    && inner.x >= outer.x - tolerance && inner.y >= outer.y - tolerance
    && inner.x + inner.width <= outer.x + outer.width + tolerance
    && inner.y + inner.height <= outer.y + outer.height + tolerance;
}

export function boundsOf(rects: Rect[]): Rect | null {
  let left = Infinity; let top = Infinity; let right = -Infinity; let bottom = -Infinity;
  for (const r of rects) {
    if (!valid(r)) continue;
    left = Math.min(left, r.x); top = Math.min(top, r.y);
    right = Math.max(right, r.x + r.width); bottom = Math.max(bottom, r.y + r.height);
  }
  return left === Infinity ? null : { x: left, y: top, width: right - left, height: bottom - top };
}

export function idsInside(section: Rect, rects: Record<string, Rect>, excludeId?: string): string[] {
  return Object.entries(rects).filter(([id, rect]) => id !== excludeId && contains(section, rect)).map(([id]) => id);
}

const anchors = (start: number, size: number) => [start, start + size / 2, start + size];

function snapDelta(moving: number[], targets: number[][], threshold: number): number | null {
  let best: { delta: number; matching: boolean } | null = null;
  for (const target of targets) {
    for (let i = 0; i < moving.length; i++) {
      for (let j = 0; j < target.length; j++) {
        const delta = target[j] - moving[i];
        if (Math.abs(delta) > threshold) continue;
        const matching = i === j;
        if (!best || Math.abs(delta) < Math.abs(best.delta) - EPSILON
          || (Math.abs(Math.abs(delta) - Math.abs(best.delta)) <= EPSILON
            && (Number(matching) > Number(best.matching) || (matching === best.matching && delta < best.delta)))) {
          best = { delta, matching };
        }
      }
    }
  }
  return best?.delta ?? null;
}

export function snapToGuides(moving: Rect, others: Rect[], threshold: number): { x: number; y: number; guides: Guide[] } {
  if (!valid(moving)) return { x: moving.x, y: moving.y, guides: [] };
  const targets = others.filter(valid);
  const limit = Number.isFinite(threshold) ? Math.max(0, threshold) : 0;
  const dx = snapDelta(anchors(moving.x, moving.width), targets.map((r) => anchors(r.x, r.width)), limit);
  const dy = snapDelta(anchors(moving.y, moving.height), targets.map((r) => anchors(r.y, r.height)), limit);
  const snapped = { ...moving, x: moving.x + (dx ?? 0), y: moving.y + (dy ?? 0) };
  const guides: Guide[] = [];
  for (const axis of ['x', 'y'] as const) {
    if ((axis === 'x' ? dx : dy) === null) continue;
    const size = axis === 'x' ? 'width' : 'height';
    const cross = axis === 'x' ? 'y' : 'x';
    const crossSize = axis === 'x' ? 'height' : 'width';
    for (const pos of anchors(snapped[axis], snapped[size])) {
      for (const target of targets) {
        if (!anchors(target[axis], target[size]).some((v) => Math.abs(v - pos) <= EPSILON)) continue;
        const from = Math.min(snapped[cross], target[cross]);
        const to = Math.max(snapped[cross] + snapped[crossSize], target[cross] + target[crossSize]);
        const existing = guides.find((g) => g.axis === axis && Math.abs(g.pos - pos) <= EPSILON);
        if (existing) { existing.from = Math.min(existing.from, from); existing.to = Math.max(existing.to, to); }
        else guides.push({ axis, pos, from, to });
      }
    }
  }
  guides.sort((a, b) => a.axis.localeCompare(b.axis) || a.pos - b.pos);
  return { x: snapped.x, y: snapped.y, guides };
}

interface Obstacle { left: number; top: number; right: number; bottom: number }

/** Nearest allowed y at x; touching an obstacle boundary is allowed. */
function freeY(x: number, wantY: number, obstacles: Obstacle[]): number {
  let low = Infinity; let high = -Infinity;
  const nearest = () => wantY - low < high - wantY ? low : high;
  for (const r of obstacles) {
    if (x <= r.left || x >= r.right) continue;
    if (r.top >= high) {
      if (wantY > low && wantY < high) return nearest();
      low = r.top; high = r.bottom;
    } else {
      high = Math.max(high, r.bottom);
    }
  }
  return wantY > low && wantY < high ? nearest() : wantY;
}

export function freeSpot(want: { x: number; y: number }, size: { x: number; y: number }, rects: Rect[], gap = 24): { x: number; y: number } {
  if (![want.x, want.y, size.x, size.y].every(Number.isFinite) || size.x <= 0 || size.y <= 0) return { ...want };
  gap = Number.isFinite(gap) ? Math.max(0, gap) : 0;
  // In top-left coordinates, each occupied rectangle becomes an open forbidden region.
  const obstacles: Obstacle[] = rects.filter((r) => valid(r) && r.width > 0 && r.height > 0).map((r) => ({
    left: r.x - size.x - gap, top: r.y - size.y - gap, right: r.x + r.width + gap, bottom: r.y + r.height + gap,
  })).sort((a, b) => a.top - b.top || a.bottom - b.bottom);
  if (!obstacles.some((r) => want.x > r.left && want.x < r.right && want.y > r.top && want.y < r.bottom)) return { ...want };

  // The nearest point outside their union lies at want.x or on a vertical boundary.
  // Scanning sorted y intervals at each candidate x is O(n²), without an arbitrary search radius.
  const xs = new Set([want.x, ...obstacles.flatMap((r) => [r.left, r.right])]);
  let best = { x: want.x, y: freeY(want.x, want.y, obstacles) };
  let distance = (best.y - want.y) ** 2;
  for (const x of xs) {
    if ((x - want.x) ** 2 > distance + EPSILON) continue;
    const y = freeY(x, want.y, obstacles);
    const d = (x - want.x) ** 2 + (y - want.y) ** 2;
    const tie = Math.abs(d - distance) <= EPSILON;
    const dy = Math.abs(y - want.y); const bestDy = Math.abs(best.y - want.y);
    if (d < distance - EPSILON || (tie && (dy < bestDy || (dy === bestDy && (x > best.x || (x === best.x && y > best.y)))))) {
      best = { x, y }; distance = d;
    }
  }
  return best;
}
