import { describe, expect, it } from 'vitest';
import { crossesPolyline, segmentsIntersect } from './knife';

describe('cut geometry', () => {
  it('detects crossing segments', () => {
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 })).toBe(true);
  });
  it('ignores segments that miss or run parallel', () => {
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 4, y: 4 }, { x: 6, y: 0 }, { x: 10, y: -4 })).toBe(false);
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 1 }, { x: 10, y: 1 })).toBe(false);
  });
  it('checks every segment of a polyline', () => {
    const wire = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 10 }, { x: 30, y: 10 }];
    expect(crossesPolyline({ x: 25, y: 0 }, { x: 25, y: 20 }, wire)).toBe(true);
    expect(crossesPolyline({ x: 40, y: 0 }, { x: 40, y: 20 }, wire)).toBe(false);
  });
});
