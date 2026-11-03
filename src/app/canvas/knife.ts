// Geometry for the cut gesture: does a stroke segment cross a connection's polyline?
export interface Pt { x: number; y: number }

/** Proper or touching intersection of segments p1–p2 and p3–p4. */
export function segmentsIntersect(p1: Pt, p2: Pt, p3: Pt, p4: Pt): boolean {
  const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
  if (Math.abs(d) < 1e-12) return false; // parallel (collinear overlaps don't count as a cut)
  const u = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
  const v = ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / d;
  return u >= 0 && u <= 1 && v >= 0 && v <= 1;
}

/** Whether the segment a–b crosses any segment of the polyline `pts`. */
export function crossesPolyline(a: Pt, b: Pt, pts: Pt[]): boolean {
  for (let i = 1; i < pts.length; i++) if (segmentsIntersect(a, b, pts[i - 1], pts[i])) return true;
  return false;
}
