import { describe, expect, it } from 'vitest';
import { type Rect, boundsOf, contains, freeSpot, idsInside, snapToGuides } from './geometry';

const rect = (x: number, y: number, width = 10, height = 10): Rect => ({ x, y, width, height });
const overlap = (a: Rect, b: Rect, gap = 0) => a.x < b.x + b.width + gap && a.x + a.width + gap > b.x
  && a.y < b.y + b.height + gap && a.y + a.height + gap > b.y;

describe('containment and bounds', () => {
  it('includes touching edges, negative coordinates and zero-size points', () => {
    expect(contains(rect(-10, -10, 30, 30), rect(-10, -10, 30, 30))).toBe(true);
    expect(contains(rect(0, 0), rect(10, 10, 0, 0))).toBe(true);
    expect(contains(rect(0, 0), rect(9, 9))).toBe(false);
    expect(contains(rect(0, 0), rect(-1, 0, 1, 1))).toBe(false);
  });

  it('uses tolerance on every side and supports an inset', () => {
    expect(contains(rect(0, 0), rect(-1, -1, 12, 12), 1)).toBe(true);
    expect(contains(rect(0, 0), rect(-1, -1, 12, 12), 0.9)).toBe(false);
    expect(contains(rect(0, 0), rect(1, 1, 8, 8), -1)).toBe(true);
    expect(contains(rect(0, 0), rect(0, 0), -1)).toBe(false);
  });

  it('returns exact bounds or null and ignores malformed rectangles', () => {
    expect(boundsOf([])).toBeNull();
    expect(boundsOf([rect(-20, 10, 5, 15), rect(10, -20, 20, 10)])).toEqual(rect(-20, -20, 50, 45));
    expect(boundsOf([rect(NaN, 0), rect(0, 0, -1, 5)])).toBeNull();
    expect(boundsOf([rect(Infinity, 0), rect(1, 2)])).toEqual(rect(1, 2));
  });

  it('selects fully contained ids and excludes the frame itself', () => {
    const frame = rect(0, 0, 100, 100);
    expect(idsInside(frame, { frame, inside: rect(10, 10), edge: rect(90, 90), partial: rect(95, 90), outside: rect(101, 0) }, 'frame')).toEqual(['inside', 'edge']);
  });
});

describe('snapToGuides', () => {
  it('snaps both axes independently and draws guides through the snapped bounds', () => {
    const result = snapToGuides(rect(97, 203, 40, 20), [rect(100, 100, 40, 100)], 4);
    expect(result).toMatchObject({ x: 100, y: 200 });
    expect(result.guides).toContainEqual({ axis: 'x', pos: 120, from: 100, to: 220 });
    expect(result.guides).toContainEqual({ axis: 'y', pos: 200, from: 100, to: 140 });
  });

  it('aligns centers even when rectangle sizes differ', () => {
    const result = snapToGuides(rect(144, 300, 10, 20), [rect(100, 0, 100, 50)], 2);
    expect(result).toMatchObject({ x: 145, y: 300 });
    expect(result.guides).toEqual([{ axis: 'x', pos: 150, from: 0, to: 320 }]);
  });

  it('aligns an edge with another rectangle’s opposite edge', () => {
    const result = snapToGuides(rect(32, 50), [rect(0, 0, 30, 10)], 3);
    expect(result.x).toBe(30);
    expect(result.guides).toContainEqual({ axis: 'x', pos: 30, from: 0, to: 60 });
  });

  it('chooses the nearest alignment and remains stable when targets are reordered', () => {
    const others = [rect(13, 300), rect(9, 100), rect(11, 200)];
    const moving = rect(10, 50);
    expect(snapToGuides(moving, others, 3)).toEqual(snapToGuides(moving, [...others].reverse(), 3));
    expect(snapToGuides(moving, others, 3).x).toBe(9);
  });

  it('merges collinear guides across targets', () => {
    const result = snapToGuides(rect(1, 100), [rect(0, 0), rect(0, 200)], 2);
    expect(result.guides.filter((g) => g.axis === 'x')).toHaveLength(3);
    expect(result.guides).toContainEqual({ axis: 'x', pos: 0, from: 0, to: 210 });
  });

  it('leaves distant rectangles unchanged and shows exact alignments at threshold zero', () => {
    expect(snapToGuides(rect(10, 10), [rect(100, 100)], 2)).toEqual({ x: 10, y: 10, guides: [] });
    expect(snapToGuides(rect(10, 10), [], 10)).toEqual({ x: 10, y: 10, guides: [] });
    expect(snapToGuides(rect(0, 100), [rect(0, 0)], 0).guides).toHaveLength(3);
  });
});

describe('freeSpot', () => {
  it('keeps a free requested position, including exact touching boundaries', () => {
    expect(freeSpot({ x: 10, y: 0 }, { x: 10, y: 10 }, [rect(0, 0)], 0)).toEqual({ x: 10, y: 0 });
    expect(freeSpot({ x: -100, y: -100 }, { x: 10, y: 10 }, [])).toEqual({ x: -100, y: -100 });
  });

  it('chooses the nearest top-left, with deterministic rightward placement on ties', () => {
    expect(freeSpot({ x: 0, y: 0 }, { x: 10, y: 10 }, [rect(0, 0)], 0)).toEqual({ x: 10, y: 0 });
    expect(freeSpot({ x: 9, y: 0 }, { x: 10, y: 10 }, [rect(0, 0)], 0)).toEqual({ x: 10, y: 0 });
    expect(freeSpot({ x: -9, y: 0 }, { x: 10, y: 10 }, [rect(0, 0)], 0)).toEqual({ x: -10, y: 0 });
  });

  it('honors an explicit gap and defaults to a 24px gutter', () => {
    expect(freeSpot({ x: 0, y: 0 }, { x: 10, y: 10 }, [rect(0, 0)], 5)).toEqual({ x: 15, y: 0 });
    expect(freeSpot({ x: 0, y: 0 }, { x: 10, y: 10 }, [rect(0, 0)])).toEqual({ x: 34, y: 0 });
  });

  it('finds the nearest diagonal opening around overlapping obstacles', () => {
    const others = [rect(-2, -10, 4, 20), rect(-10, -2, 20, 4)];
    const result = freeSpot({ x: 0, y: 0 }, { x: 1, y: 1 }, others, 0);
    expect(result).toEqual({ x: 2, y: 2 });
    expect(others.some((r) => overlap(rect(result.x, result.y, 1, 1), r))).toBe(false);
  });

  it('allows an exact-width opening and handles fractional coordinates', () => {
    const obstacles = [rect(0, 0, 10, 10), rect(0, 15, 10, 10)];
    expect(freeSpot({ x: 5, y: 9 }, { x: 5, y: 5 }, obstacles, 0)).toEqual({ x: 5, y: 10 });
    expect(freeSpot({ x: 0.25, y: 0.25 }, { x: 1, y: 1 }, [rect(0, 0, 1.5, 10)], 0.1)).toEqual({ x: 1.6, y: 0.25 });
  });

  it('has no arbitrary search radius and is independent of input order', () => {
    const others = [rect(-10000, -10000, 20000, 20000), rect(10001, 0, 10000, 10000)];
    const a = freeSpot({ x: 0, y: 0 }, { x: 10, y: 10 }, others);
    expect(others.every((r) => !overlap(rect(a.x, a.y), r, 24))).toBe(true);
    expect(a).toEqual(freeSpot({ x: 0, y: 0 }, { x: 10, y: 10 }, [...others].reverse()));
  });

  it('matches an exhaustive nearest-point search on varied small layouts', () => {
    let seed = 9;
    const random = (max: number) => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % max; };
    for (let trial = 0; trial < 40; trial++) {
      const want = { x: random(10), y: random(10) };
      const size = { x: random(3) + 1, y: random(3) + 1 };
      const others = Array.from({ length: 6 }, () => rect(random(10), random(10), random(4) + 1, random(4) + 1));
      const result = freeSpot(want, size, others, 0);
      const distance = (result.x - want.x) ** 2 + (result.y - want.y) ** 2;
      expect(others.some((r) => overlap(rect(result.x, result.y, size.x, size.y), r))).toBe(false);
      let best = Infinity;
      for (let x = -5; x <= 15; x++) for (let y = -5; y <= 15; y++) {
        if (!others.some((r) => overlap(rect(x, y, size.x, size.y), r))) best = Math.min(best, (x - want.x) ** 2 + (y - want.y) ** 2);
      }
      expect(distance).toBe(best);
    }
  });

  it('does not mutate inputs and tolerates invalid rectangles', () => {
    const want = Object.freeze({ x: 0, y: 0 });
    const size = Object.freeze({ x: 10, y: 10 });
    const other = Object.freeze(rect(0, 0));
    expect(() => freeSpot(want, size, [other, rect(NaN, 0)])).not.toThrow();
    expect(freeSpot(want, { x: 0, y: 10 }, [other])).toEqual(want);
  });
});
