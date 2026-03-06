// ═══════════════════════════════════════════════════════════════════
// Server-side HCT Utilities — Self-contained (no npm dependencies)
// Ported from @material/material-color-utilities (Apache-2.0)
// The npm package has broken module resolution in Supabase Edge Runtime,
// so we use the same self-contained solver as material-template.tsx.
// ═══════════════════════════════════════════════════════════════════

// ─── Helpers ────────────────────────────────────────────────────

function signum(n: number): number { return n < 0 ? -1 : n === 0 ? 0 : 1; }

function sanitizeDegrees(deg: number): number {
  deg = deg % 360;
  if (deg < 0) deg += 360;
  return deg;
}

function linearized(rgb8: number): number {
  const s = rgb8 / 255;
  return s <= 0.040449936 ? s / 12.92 * 100 : Math.pow((s + 0.055) / 1.055, 2.4) * 100;
}

function delinearized(c: number): number {
  const s = c / 100;
  const v = s <= 0.0031308 ? s * 12.92 : 1.055 * Math.pow(s, 1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(v * 255)));
}

function argbFromRgb(r: number, g: number, b: number): number {
  return ((255 << 24) | ((r & 0xFF) << 16) | ((g & 0xFF) << 8) | (b & 0xFF)) >>> 0;
}

function yFromLstar(lstar: number): number {
  if (lstar > 8) { const f = (lstar + 16) / 116; return f * f * f * 100; }
  return lstar / 903.2962962962963 * 100;
}

function lstarFromY(y: number): number {
  const yn = y / 100;
  if (yn <= 216 / 24389) return 24389 / 27 * yn;
  return 116 * Math.cbrt(yn) - 16;
}

function argbFromLstar(lstar: number): number {
  const y = yFromLstar(lstar);
  const c = delinearized(y);
  return argbFromRgb(c, c, c);
}

// ─── CAM16 viewing conditions (standard sRGB, D65) ─────────────
const VC_N   = 0.18418651851244416;
const VC_AW  = 29.980990887425238;
const VC_NBB = 1.0169191804458757;
const VC_NCB = VC_NBB;
const VC_C   = 0.69;
const VC_NC  = 1.0;
const VC_FL  = 0.38848236943688717;
const VC_Z   = 1.909169568483652;
const VC_RGB_D: [number, number, number] = [1.0210085523498627, 0.9862996590492207, 0.9338075251498599];

// ─── CAM16 forward: ARGB → { hue, chroma, J } ──────────────────

function adapted(v: number): number {
  const af = Math.pow(VC_FL * Math.abs(v) / 100, 0.42);
  return signum(v) * af / (af + 27.13);
}

function cam16FromArgb(argb: number): { hue: number; chroma: number; J: number } {
  const rL = linearized((argb >> 16) & 0xFF);
  const gL = linearized((argb >> 8) & 0xFF);
  const bL = linearized(argb & 0xFF);

  const x = 0.41233895 * rL + 0.35762064 * gL + 0.18051042 * bL;
  const y = 0.2126     * rL + 0.7152     * gL + 0.0722     * bL;
  const z = 0.01932141 * rL + 0.11916382 * gL + 0.95034478 * bL;

  const rA = 0.401288  * x + 0.650173  * y - 0.051461  * z;
  const gA = -0.250268 * x + 1.204414  * y + 0.045854  * z;
  const bA = -0.002079 * x + 0.048952  * y + 0.953127  * z;

  const rD = VC_RGB_D[0] * rA;
  const gD = VC_RGB_D[1] * gA;
  const bD = VC_RGB_D[2] * bA;

  const rAF = 400 * adapted(rD);
  const gAF = 400 * adapted(gD);
  const bAF = 400 * adapted(bD);

  const a  = rAF + (-12 * gAF + bAF) / 11;
  const b  = (rAF + gAF - 2 * bAF) / 9;
  const hRad = Math.atan2(b, a);
  const hue = sanitizeDegrees(hRad * 180 / Math.PI);

  const ac = (2 * rAF + gAF + 0.05 * bAF - 0.305) * VC_NBB;
  const J  = 100 * Math.pow(ac / VC_AW, VC_C * VC_Z);

  const t  = (50000 / 13) * VC_NC * VC_NCB *
    Math.sqrt(a * a + b * b) / (rAF + gAF + 21 * bAF / 20);
  const alpha = Math.pow(t, 0.9) * Math.pow(1.64 - Math.pow(0.29, VC_N), 0.73);
  const chroma = alpha * Math.sqrt(J / 100);

  return { hue, chroma, J };
}

// ─── HCT Solver: (hue, chroma, tone) → ARGB ────────────────────

const SCALED_DISCOUNT_FROM_LINRGB = [
  [0.001200833568784504, 0.002389694492170889, 0.0002795742885861124],
  [0.0005891086651375999, 0.0029785502573438758, 0.0003270666104008398],
  [0.00010146692491640572, 0.0005364214359186694, 0.0032979401770712076],
];

function inverseChromaticAdaptation(v: number): number {
  const abs = Math.abs(v);
  const base = Math.max(0, 27.13 * abs / (400 - abs));
  return signum(v) * Math.pow(base, 1 / 0.42) / VC_FL;
}

function solveToInt(hueDegrees: number, chroma: number, lstar: number): number {
  if (chroma < 0.0001 || lstar < 0.0001 || lstar > 99.9999) {
    return argbFromLstar(lstar);
  }
  hueDegrees = sanitizeDegrees(hueDegrees);
  const hueRad = hueDegrees / 180 * Math.PI;
  const y = yFromLstar(lstar);

  const exactAnswer = findResultByJ(hueRad, chroma, y);
  if (exactAnswer !== 0) return exactAnswer;

  return bisectToSegment(y, hueRad);
}

function findResultByJ(hueRad: number, chroma: number, _y: number): number {
  let J = Math.sqrt(_y) * 11;
  const tInnerCoeff = 1 / (4 * Math.max(0.2, (1.64 - Math.pow(0.29, VC_N)) * 0.73));
  const eHue = 0.25 * (Math.cos(hueRad + 2) + 3.8);
  const p1 = eHue * (50000 / 13) * VC_NC * VC_NCB;
  const hSin = Math.sin(hueRad);
  const hCos = Math.cos(hueRad);

  for (let iter = 0; iter < 5; iter++) {
    const jNorm = J / 100;
    const alpha = chroma === 0 || J === 0 ? 0 : chroma / Math.sqrt(jNorm);
    const t = Math.pow(alpha * tInnerCoeff, 1 / 0.9);
    const ac = VC_AW * Math.pow(jNorm, 1 / (VC_C * VC_Z));

    const p2 = ac / VC_NBB;
    const gamma = 23 * (p2 + 0.305) * t / (23 * p1 + 11 * t * hCos + 108 * t * hSin);
    const a = gamma * hCos;
    const b = gamma * hSin;

    const rA = (460 * p2 + 451 * a + 288 * b) / 1403;
    const gA = (460 * p2 - 891 * a - 261 * b) / 1403;
    const bA = (460 * p2 - 220 * a - 6300 * b) / 1403;

    const rCScaled = inverseChromaticAdaptation(rA);
    const gCScaled = inverseChromaticAdaptation(gA);
    const bCScaled = inverseChromaticAdaptation(bA);

    const linR = +1.8620678550872327  * rCScaled - 1.0112546305316843 * gCScaled + 0.14918677544445175 * bCScaled;
    const linG = +0.38752654323613614 * rCScaled + 0.6214474419314753 * gCScaled - 0.008973985167612518 * bCScaled;
    const linB = -0.01584149884549182 * rCScaled - 0.03412293802851557 * gCScaled + 1.0499644891439397  * bCScaled;

    if (linR < 0 || linG < 0 || linB < 0) return 0;

    const rO = delinearized(linR);
    const gO = delinearized(linG);
    const bO = delinearized(linB);

    if (rO < 0 || rO > 255 || gO < 0 || gO > 255 || bO < 0 || bO > 255) return 0;

    const resultArgb = argbFromRgb(rO, gO, bO);
    const resultCam = cam16FromArgb(resultArgb);
    const dChroma = Math.abs(resultCam.chroma - chroma);
    if (dChroma < 0.5) return resultArgb;

    const dJ = (resultCam.J - J) * -0.5;
    J = J + dJ;
    if (Math.abs(dJ) < 0.002) break;
  }
  return 0;
}

function srgbTransfer(c: number): number {
  if (c <= 0.0031308) return 12.92 * c;
  return 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

function tryChromaAtHueTone(hueHct: number, chroma: number, tone: number): number | null {
  const L = tone / 100;
  const C = chroma / 333;
  const H = hueHct;
  const hRad = H * Math.PI / 180;
  const a = C * Math.cos(hRad);
  const b = C * Math.sin(hRad);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;

  const l3 = l_ * l_ * l_;
  const m3 = m_ * m_ * m_;
  const s3 = s_ * s_ * s_;

  const rL = +4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
  const gL = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
  const bL = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.7076147010 * s3;

  if (rL < -0.002 || rL > 1.002 || gL < -0.002 || gL > 1.002 || bL < -0.002 || bL > 1.002) {
    return null;
  }

  const r8 = Math.max(0, Math.min(255, Math.round(srgbTransfer(rL) * 255)));
  const g8 = Math.max(0, Math.min(255, Math.round(srgbTransfer(gL) * 255)));
  const b8 = Math.max(0, Math.min(255, Math.round(srgbTransfer(bL) * 255)));

  return argbFromRgb(r8, g8, b8);
}

function bisectToSegment(y: number, hueRad: number): number {
  const hSin = Math.sin(hueRad);
  const hCos = Math.cos(hueRad);

  let bestArgb = argbFromLstar(lstarFromY(y));
  let bestDist = 1e10;

  for (let axis = 0; axis < 3; axis++) {
    for (let edge = 0; edge <= 1; edge++) {
      const channel = edge * 100;
      for (let t = 0; t <= 255; t++) {
        let rL: number, gL: number, bL: number;
        const tLin = linearized(t);
        if (axis === 0) {
          rL = channel; gL = tLin;
          bL = (y - 0.2126 * rL - 0.7152 * gL) / 0.0722;
        } else if (axis === 1) {
          gL = channel; rL = tLin;
          bL = (y - 0.2126 * rL - 0.7152 * gL) / 0.0722;
        } else {
          bL = channel; rL = tLin;
          gL = (y - 0.2126 * rL - 0.0722 * bL) / 0.7152;
        }
        if (rL < -0.5 || rL > 100.5 || gL < -0.5 || gL > 100.5 || bL < -0.5 || bL > 100.5) continue;
        const r8 = delinearized(rL);
        const g8 = delinearized(gL);
        const b8 = delinearized(bL);
        const argb = argbFromRgb(r8, g8, b8);
        const cam = cam16FromArgb(argb);
        const hueDist = Math.abs(sanitizeDegrees(cam.hue - hueRad * 180 / Math.PI));
        const dist = Math.min(hueDist, 360 - hueDist);
        if (dist < bestDist) {
          bestDist = dist;
          bestArgb = argb;
        }
      }
    }
  }
  return bestArgb;
}

function hctToArgb(hue: number, chroma: number, tone: number): number {
  if (chroma < 0.5) return argbFromLstar(tone);
  if (tone < 0.5) return argbFromRgb(0, 0, 0);
  if (tone > 99.5) return argbFromRgb(255, 255, 255);

  hue = sanitizeDegrees(hue);

  let argb = solveToInt(hue, chroma, tone);
  let cam = cam16FromArgb(argb);

  if (Math.abs(cam.chroma - chroma) > 2 || Math.abs(sanitizeDegrees(cam.hue - hue)) > 5) {
    argb = argbFromLstar(tone);

    let lowChroma = 0;
    let highChroma = Math.min(chroma * 1.5, 150);
    let bestArgb = argb;
    let bestChromaDist = Infinity;

    for (let iter = 0; iter < 50; iter++) {
      const midChroma = (lowChroma + highChroma) / 2;
      const candidate = tryChromaAtHueTone(hue, midChroma, tone);
      if (candidate === null) {
        highChroma = midChroma;
        continue;
      }
      const candidateCam = cam16FromArgb(candidate);
      const chromaDist = Math.abs(candidateCam.chroma - chroma);
      if (chromaDist < bestChromaDist) {
        bestChromaDist = chromaDist;
        bestArgb = candidate;
      }
      if (chromaDist < 0.5) break;
      if (candidateCam.chroma < chroma) {
        lowChroma = midChroma;
      } else {
        highChroma = midChroma;
      }
    }
    argb = bestArgb;
  }

  return argb;
}

// ═══════════════════════════════════════════════════════════════════
// Public API — matches the interface expected by pipeline.ts
// ═══════════════════════════════════════════════════════════════════

export function rgbToHct(r: number, g: number, b: number): { h: number; c: number; t: number } {
  const argb = argbFromRgb(r, g, b);
  const cam = cam16FromArgb(argb);
  // Tone = L* (CIE lightness)
  const rL = linearized(r);
  const gL = linearized(g);
  const bL = linearized(b);
  const y = 0.2126 * rL + 0.7152 * gL + 0.0722 * bL;
  const tone = lstarFromY(y);
  return {
    h: Math.round(cam.hue * 10) / 10,
    c: Math.round(cam.chroma * 10) / 10,
    t: Math.round(tone * 10) / 10,
  };
}

export function hctToRgb(hue: number, chroma: number, tone: number): { r: number; g: number; b: number } {
  hue = ((hue % 360) + 360) % 360;
  chroma = Math.max(0, chroma);
  tone = Math.max(0, Math.min(100, tone));
  const argb = hctToArgb(hue, chroma, tone);
  return {
    r: (argb >> 16) & 0xFF,
    g: (argb >> 8) & 0xFF,
    b: argb & 0xFF,
  };
}

export function hctToHex(hue: number, chroma: number, tone: number): string {
  const { r, g, b } = hctToRgb(hue, chroma, tone);
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

export function hexToHct(hex: string): { h: number; c: number; t: number } {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16) || 0;
  const g = parseInt(h.substring(2, 4), 16) || 0;
  const b = parseInt(h.substring(4, 6), 16) || 0;
  return rgbToHct(r, g, b);
}

export function getMaxChroma(hue: number, tone: number): number {
  hue = ((hue % 360) + 360) % 360;
  tone = Math.max(0, Math.min(100, tone));
  // Binary search for max chroma that stays in gamut
  let low = 0, high = 150, best = 0;
  for (let i = 0; i < 30; i++) {
    const mid = (low + high) / 2;
    const argb = hctToArgb(hue, mid, tone);
    const cam = cam16FromArgb(argb);
    if (cam.chroma >= mid - 1) {
      best = mid;
      low = mid;
    } else {
      high = mid;
    }
  }
  return Math.round(best * 10) / 10;
}
