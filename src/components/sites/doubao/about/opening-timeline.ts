/**
 * Official Doubao opening.mp4 master timeline.
 * Every track below is measured from the official video at 1920×1080 (10fps),
 * expressed as fractions of viewport height so it scales to any screen.
 *
 * Measurement sources:
 * - Hole radius: disc bbox + veil-area inversion (0–1.4s bbox; 1.5–2.9s area).
 * - Hole center drift: bbox centers, cy 0.504 → 0.562 while expanding.
 * - Character hair-top / feet screen positions: hair & shirt blob tracking.
 * - Edge profile: ~10% of radius feather (crisp, not soft).
 */

/**
 * Child sheets start at 5.4s 回正 and are fully out by ~7.35s. No empty
 * hold after that — hero fades, then titles / first focus at INTRO_END.
 */
export const INTRO_END = 7.85;

/** Scrub range through card settle → hero fade → titles kickoff. */
export const ANIM_END = 8.5;

export type BeatId =
  | "idle-circle"
  | "expand"
  | "yeah"
  | "present"
  | "burst"
  | "orbit"
  | "settle"
  | "fade"
  | "titles";

export type Beat = {
  id: BeatId;
  t: number;
  label: string;
};

/** Scrub / compare markers from official frame analysis. */
export const BEATS: Beat[] = [
  { id: "idle-circle", t: 0, label: "小圆 idle" },
  { id: "expand", t: 0.75, label: "圆开始扩" },
  { id: "yeah", t: 1.0, label: "Yeah 出手" },
  { id: "yeah", t: 1.25, label: "气泡淡入" },
  { id: "yeah", t: 1.75, label: "全身露出" },
  { id: "present", t: 2.5, label: "Yeah 收回" },
  { id: "present", t: 2.75, label: "摊手介绍" },
  { id: "burst", t: 3.45, label: "卡片爆出·人物下沉·开绕" },
  { id: "orbit", t: 3.85, label: "背后仰视" },
  { id: "orbit", t: 4.2, label: "绕侧回转" },
  { id: "orbit", t: 5.4, label: "回正·子卡生长" },
  { id: "settle", t: 7.35, label: "卡片就绪" },
  { id: "fade", t: 7.35, label: "人开始淡" },
  { id: "titles", t: 7.85, label: "第一行字·对焦" },
];

export function clamp01(v: number) {
  return Math.min(1, Math.max(0, v));
}

export function smoothstep(a: number, b: number, t: number) {
  const p = clamp01((t - a) / Math.max(0.0001, b - a));
  return p * p * (3 - 2 * p);
}

/**
 * Zoom along a multiplicative ease. Perceived size is 1/viewH, so a linear
 * viewH ramp snaps while the character is large and crawls once it is small.
 * smoothstep on the exponent makes the rate even, and velocity is 0 at both ends.
 */
export function easeScale(t: number, t0: number, t1: number, a: number, b: number) {
  const u = smoothstep(t0, t1, t);
  return a * Math.pow(b / Math.max(1e-6, a), u);
}

/** Smoothstep between keys (gestures / camera). */
export function sample(t: number, keys: [number, number][]) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) {
      const [t0, v0] = keys[i - 1];
      const [t1, v1] = keys[i];
      return v0 + (v1 - v0) * smoothstep(t0, t1, t);
    }
  }
  return keys[keys.length - 1][1];
}

/** Pure linear lerp between keys (circle expand — dense measured keys). */
export function sampleLinear(t: number, keys: [number, number][]) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) {
      const [t0, v0] = keys[i - 1];
      const [t1, v1] = keys[i];
      const p = clamp01((t - t0) / Math.max(0.0001, t1 - t0));
      return v0 + (v1 - v0) * p;
    }
  }
  return keys[keys.length - 1][1];
}

/**
 * Monotone cubic (Fritsch–Carlson) C1-continuous sampler — for camera
 * tracks. Unlike per-segment smoothstep, velocity never stalls at keys, so
 * dense keyframe chains (the phase-2 orbit) stay fluid; anchors are exact.
 */
export function sampleSpline(t: number, keys: [number, number][]) {
  const n = keys.length;
  if (t <= keys[0][0]) return keys[0][1];
  if (t >= keys[n - 1][0]) return keys[n - 1][1];
  const d: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    d.push((keys[i + 1][1] - keys[i][1]) / (keys[i + 1][0] - keys[i][0]));
  }
  const m: number[] = new Array(n);
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) {
    m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  }
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) {
      const tau = 3 / Math.sqrt(s);
      m[i] = tau * a * d[i];
      m[i + 1] = tau * b * d[i];
    }
  }
  for (let i = 1; i < n; i++) {
    if (t <= keys[i][0]) {
      const [t0, v0] = keys[i - 1];
      const [t1, v1] = keys[i];
      const h = t1 - t0;
      const p = (t - t0) / h;
      const h00 = 2 * p * p * p - 3 * p * p + 1;
      const h10 = p * p * p - 2 * p * p + p;
      const h01 = -2 * p * p * p + 3 * p * p;
      const h11 = p * p * p - p * p;
      return h00 * v0 + h10 * h * m[i - 1] + h01 * v1 + h11 * h * m[i];
    }
  }
  return keys[n - 1][1];
}

/**
 * Hole radius — official measured timeline (r as fraction of viewport height).
 * t:    0     .25   .5    .75   1.0   1.1   1.2   1.3   1.4   1.5   1.6   1.7
 * r/vh: .0745 .082  .087  .102  .1485 .173  .2035 .240  .287  .391  .443  .501
 * t:    1.8   1.9   2.0   2.1   2.2   2.3   2.4   2.5   2.6   2.7
 * r/vh: .562  .629  .694  .759  .811  .852  .888  .917  .953  ~1.02 (corners clear)
 * Veil completely off screen ≈ 2.65–2.7s (NOT 1.75 — earlier keys were too fast).
 */
export function holeRadius(t: number, vw: number, vh: number) {
  const m = vh;
  return m * sampleLinear(t, [
    [0, 0.0745],
    [0.25, 0.082],
    [0.5, 0.087],
    [0.75, 0.102],
    [1.0, 0.1485],
    [1.1, 0.173],
    [1.2, 0.2035],
    [1.3, 0.240],
    [1.4, 0.287],
    [1.5, 0.391],
    [1.6, 0.443],
    [1.7, 0.501],
    [1.8, 0.562],
    [1.9, 0.629],
    [2.0, 0.694],
    [2.1, 0.759],
    [2.2, 0.811],
    [2.3, 0.852],
    [2.4, 0.888],
    [2.5, 0.917],
    [2.6, 0.953],
    [2.75, 1.05],
  ]);
}

/**
 * Hole center Y — the official circle drifts DOWN as it expands
 * (bbox centers: 0.504 @0s → 0.526 @1.1s → 0.554 @1.4s → ~0.562 @1.7s),
 * then eases back toward mid as the circle outgrows the screen.
 * Returned as fraction of viewport height (for the CSS mask center).
 */
export function holeCenterY(t: number) {
  return sample(t, [
    [0, 0.5037],
    [0.5, 0.5056],
    [1.0, 0.523],
    [1.4, 0.558],
    [1.7, 0.562],
    [2.3, 0.541],
    [2.7, 0.525],
  ]);
}

/** Gesture weights interleaved on the same clock as mask/camera. */
export function gestureWeights(t: number) {
  return {
    yeah: sample(t, [
      [0, 0],
      [0.95, 0],
      [1.15, 1],
      [1.85, 1],
      [2.55, 0.15],
      [2.65, 0],
    ]),
    present: sample(t, [
      [0, 0],
      [2.55, 0],
      [2.75, 0.55],
      [3.35, 1],
      [3.7, 1],
      [5.0, 0.2],
      [6.0, 0.12],
      [7.25, 0.08],
    ]),
    backLift: sample(t, [
      [0, 0],
      [3.7, 0],
      [3.9, 1],
      [4.2, 1],
      [4.55, 0],
    ]),
    /** Kept at 0 — phase 2 is camera dolly/crane, not body turn. */
    bodyYaw: 0,
  };
}

export function idleMixerActive(t: number) {
  return t < 0.95;
}

/** Meshy library clips on the master clock. */
export type CharClip = "idle" | "wave" | "present";

/**
 * idle → wave → present; stay on present (last frame held) until character fades.
 * Wave starts at 0.80 — the original t_0.95 frame already shows the wave in
 * progress (hand up through the hole), so the raise must begin earlier.
 */
export function characterClipAt(t: number): CharClip {
  if (t < 0.8) return "idle";
  if (t < 2.35) return "wave";
  return "present";
}

export function characterClipLocalTime(t: number): number {
  const clip = characterClipAt(t);
  if (clip === "wave") return Math.max(0, t - 0.8);
  if (clip === "present") return Math.max(0, t - 2.35);
  return t;
}

export function beatLabelAt(t: number) {
  let label = BEATS[0].label;
  for (const b of BEATS) {
    if (t + 1e-3 >= b.t) label = b.label;
  }
  return label;
}

export type CamInfo = {
  /** master clock time (rad-accurate per frame; not throttled) */
  t: number;
  /** world-space yaw of camera around character (rad; 0 = front) */
  yaw: number;
  /** absolute world Y of camera eye */
  camY: number;
  /** absolute world Y of look target */
  lookY: number;
  /** camera distance from target */
  dist: number;
  /** vertical fov (rad) */
  fov: number;
  /** visible world height at target plane */
  viewH: number;
  /** world Y of character center (feetY + bodyH/2) */
  charY: number;
  /** character body height in world units */
  bodyH: number;
};

export type ClockInfo = {
  t: number;
  hole: number;
  heroAlpha: number;
  helloAlpha: number;
  cards: number;
  cam?: CamInfo;
  beat: string;
};