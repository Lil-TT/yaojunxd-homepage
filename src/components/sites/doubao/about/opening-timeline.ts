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
 * Tighter chain (P0): pull-back fade starts with dolly (~4.05), micro ring
 * tilt arms before feet grow, titles kick without a static hold.
 */
export const INTRO_END = 6.55;

/** Scrub range through card settle → hero fade → titles kickoff. */
export const ANIM_END = 7.1;

/** Camera dolly-out / settle begin — character fade starts here. */
export const FADE_START = 4.05;
/**
 * Micro ring tilt arms with the pull-back — well before feet grow,
 * so the swing is already in the shot when child sheets appear.
 */
export const FLOW_ARM = 4.05;
/** Feet / child sheets begin growing. */
export const FEET_GROW = 5.4;
/** Character fully clear before titles. */
export const FADE_END = 6.35;
/** Camera settle lock (was 7.25). */
export const SETTLE_END = 6.35;

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
  { id: "idle-circle", t: 0, label: "小圆 · 立刻开扩" },
  { id: "expand", t: 0, label: "圆开始扩（无等待）" },
  { id: "yeah", t: 1.0, label: "Yeah 出手" },
  { id: "yeah", t: 1.25, label: "气泡淡入" },
  { id: "yeah", t: 1.75, label: "全身露出" },
  { id: "present", t: 2.5, label: "Yeah 收回" },
  { id: "present", t: 2.75, label: "摊手介绍" },
  { id: "burst", t: 3.45, label: "卡片爆出·人物下沉·开绕" },
  { id: "orbit", t: 3.85, label: "背后仰视" },
  { id: "fade", t: 4.05, label: "镜头拉远·人开始淡·环微转接入" },
  { id: "orbit", t: 4.2, label: "绕侧回转" },
  { id: "orbit", t: 5.4, label: "回正·子卡生长（叠在微转上）" },
  { id: "settle", t: 6.35, label: "卡片就绪·人淡尽" },
  { id: "titles", t: 6.55, label: "第一行字·对焦（接环微转）" },
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
 * Veil reveal: ease-in radius (慢进快出) — linger small, then punch open.
 * Starts immediately (no idle hold). Edge begins crisp, then softens into the
 * backdrop (see holeEdgeSoft). Mask alone drives the punch — no opacity cliffs.
 */
export const HOLE_EXPAND_START = 0;
export const HOLE_EXPAND_END = 3.5;
const HOLE_R0 = 0.0745;
const HOLE_R1 = 1.08;

/** power2.in — slow start, accelerating finish (慢进快出). */
function easeInQuad(u: number) {
  return u * u;
}

/** 0→1 while the circle covers the stage (eased, not linear). */
export function holeExpandProgress(t: number) {
  if (t <= HOLE_EXPAND_START) return 0;
  if (t >= HOLE_EXPAND_END) return 1;
  const u = (t - HOLE_EXPAND_START) / (HOLE_EXPAND_END - HOLE_EXPAND_START);
  return easeInQuad(u);
}

/**
 * Edge soften 0→1 — same ease-in factor as the radius expand (慢进快出),
 * so the rim stays crisp early and blooms with the punch at the end.
 */
export function holeEdgeSoft(t: number) {
  return holeExpandProgress(t);
}

export function holeRadius(t: number, _vw: number, vh: number) {
  const p = holeExpandProgress(t);
  return vh * (HOLE_R0 + (HOLE_R1 - HOLE_R0) * p);
}

/**
 * Hole center Y — one linear drift down, then linear ease back (C0 continuous).
 */
export function holeCenterY(t: number) {
  const p = holeExpandProgress(t);
  if (p <= 0) return 0.5037;
  if (p >= 1) return 0.525;
  const mid = 0.55;
  if (p < mid) {
    const u = p / mid;
    return 0.5037 + (0.562 - 0.5037) * u;
  }
  const u = (p - mid) / (1 - mid);
  return 0.562 + (0.525 - 0.562) * u;
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
      [5.8, 0.1],
      [SETTLE_END, 0.06],
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