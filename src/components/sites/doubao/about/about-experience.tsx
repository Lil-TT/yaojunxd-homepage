"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cards, feet, titles, type CardDef, type Topic } from "./content";
import { FluidCyanBackdrop } from "./fluid-cyan-backdrop";
import { OpeningDebug } from "./opening-debug";
import { OpeningHero } from "./opening-hero";
import { SiteHeader } from "./site-header";
import {
  FEET_GROW,
  FLOW_ARM,
  SETTLE_END,
  clamp01,
  sampleSpline,
  smoothstep,
  type CamInfo,
  type ClockInfo,
} from "./opening-timeline";

type Phase = "intro" | "titles" | "live";

/** Official anime.js uses easeInOutSine ≈ this bezier. */
const EASE_SINE = "cubic-bezier(0.37, 0, 0.63, 1)";
/** Hold on the focused card before it starts leaving. */
const CARD_MS = 2800;
/**
 * Title reveal — a bit slower so it rides with the longer focus rack.
 */
const TITLE_MS = 1800;
const TITLE_EASE = "cubic-bezier(0.25, 0.46, 0.45, 0.94)";

/** Official design stage — see about_page.js: k={width:1440,height:810} */
const STAGE_W = 1440;
const STAGE_H = 810;

/**
 * Focus rack, driven by CSS on the existing title clock (no second timeline).
 * Only the selected MAIN card sharpens; its child sheets stay at DIM_BLUR.
 * The next topic waits until the previous card has fully left focus.
 */
const FOCUS_ARRIVE_MS = 2400;
const FOCUS_LEAVE_MS = 2600;
/** Extra rest after a leave finishes, before the next topic arrives. */
const FOCUS_GAP_MS = 400;
/** Titles chain straight off settle — almost no dead hold. */
const FOCUS_FIRST_DELAY_MS = 80;
const FOCUS_IN_EASE = "cubic-bezier(0.33, 1, 0.68, 1)";
const FOCUS_OUT_EASE = "cubic-bezier(0.4, 0, 0.2, 1)";
/** Micro ring tilt (±7°) — armed at FLOW_ARM (before feet), through titles/live. */
const FLOW_POS = 7;
const FLOW_NEG = -7;
/** Official swing is JS-eased and much slower than 2s CSS. */
const FLOW_TURN_MS = 7000;
const FLOW_HOLD_MS = 1200;
/** Unselected cards hold this blur for the whole title focus. */
const DIM_BLUR = 6;

/**
 * Title → detail: one hero card per topic flies to the lens and covers the
 * viewport, then we leave. No underline / recolor — motion is the cue.
 */
const TOPIC_EXIT_CARD: Record<Topic, string> = {
  me: "me-a",
  contest: "contest-a",
  science: "science-a",
  ip: "ip",
};
const EXIT_MS = 1100;
const EXIT_EASE = "cubic-bezier(0.76, 0, 0.24, 1)";

type ExitFlight = {
  href: string;
  src: string;
  from: { left: number; top: number; width: number; height: number };
  expand: boolean;
};

/**
 * Landing ring vs official: cards read larger than the center titles.
 * Hero stays full-bleed cover (never contain) — only the card stage fits.
 */
const CARD_RING_BASE = 1.28;
/** Portrait (w/h < 1): bump ring so cards fill the tall frame more. */
const CARD_RING_PORTRAIT = 1.42;

/**
 * Card stage: 16:9 → cover + BASE; portrait → contain + larger ring.
 * Character/veil stay full-viewport.
 */
function calcStageFit() {
  if (typeof window === "undefined") {
    return { stage: 1, ring: CARD_RING_BASE, visibleFrac: 1, mode: "cover" as const };
  }
  const w = window.innerWidth;
  const h = window.innerHeight;
  const aspect = w / Math.max(h, 1);
  const cover = Math.max(w / STAGE_W, h / STAGE_H);
  const contain = Math.min(w / STAGE_W, h / STAGE_H);
  const visibleFrac = Math.min(w / (STAGE_W * cover), h / (STAGE_H * cover), 1);

  if (aspect < 1) {
    return {
      stage: contain * 0.98,
      ring: CARD_RING_PORTRAIT,
      visibleFrac,
      mode: "contain" as const,
    };
  }

  if (visibleFrac >= 0.999) {
    return { stage: cover, ring: CARD_RING_BASE, visibleFrac, mode: "cover" as const };
  }

  const ring = CARD_RING_BASE * (0.9 + 0.1 * visibleFrac);
  return {
    stage: contain * 0.98,
    ring,
    visibleFrac,
    mode: "contain" as const,
  };
}

/* ---------------------------------------------------------------------------
 * Pseudo-3D card sphere.
 *
 * Official effect: the character spreads her arms and the cards materialize
 * right around her body, then ride a tight sphere while the camera orbits a
 * full 360° (cards cross in FRONT of and BEHIND her, near cards defocus),
 * and finally inflate into the big elliptical ring as the camera pulls back.
 *
 * We keep DOM cards but re-project them every frame through the SAME camera
 * the WebGL hero uses (yaw/height/distance/fov), so parallax, occlusion
 * (front/back layers around the character canvas), perspective sizing and
 * DOF blur all come for free. Anchors are solved so that at the final held
 * camera (t ≥ SETTLE_END) every card projects back to its authored layout pixel
 * exactly — the handoff to the titles/live stage is seamless.
 * ------------------------------------------------------------------------- */

type V3 = [number, number, number];
const vSub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const vAdd = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const vMul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const vDot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const vCross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const vNorm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

const STAGE_ASPECT = STAGE_W / STAGE_H;
/** vertical-fov of the held final camera (deg) — matches opening-hero track */
const FINAL_FOV = 42;
/** card depth offsets around the character plane, ×bodyH (− near camera).
 *  Deepened per frame-diff vs t_*.jpg: the official near cards (human/girl)
 *  read MUCH bigger & lower through the mid-orbit camera (t6.50 blob bottom
 *  .97 vs our old .80) — anchors still re-project to the exact final pixel,
 *  depth only changes how aggressively they inflate on the closer cameras. */
const CARD_DEPTH: Record<string, number> = {
  "science-a": -2.5,
  "contest-a": 1.1,
  "me-a": 2.1,
  "contest-b": -0.5,
  "science-b": -0.8,
  "me-b": 1.7,
  ip: -0.8,
};
/** Depth used ONLY for the end-state circle-of-confusion at the final camera. */
const COC_DEPTH: Record<string, number> = {
  "science-a": 0.5,
  "contest-a": 1.1,
  "me-a": 2.1,
  "contest-b": -1.5,
  "science-b": -0.35,
  "me-b": 1.7,
  ip: -0.8,
};

/** Sphere-inflate factor g(t): ~0.03 = hugging the body at burst, 1 = final ring.
 *  Frame-fitted against t_*.jpg (person-blob right edge vs card extent):
 *  the official cards stay HUGGING the torso through t4.50 (right .69 vs
 *  body .57) — the visible spread happens 4.75→5.0 (right .82→.87) while
 *  the camera pulls out in lock-step, so g only reaches ~0.65 by 5.0 and
 *  HOLDS there (0.65 × final-ring @ 5.1b viewH ≈ the final screen layout);
 *  the last inflate rides settle0→SETTLE_END ease-out to the final cam. */
/** Same curve as the hero `cardsP` track — sampled per card with `lag`. */
const BURST_KEYS: [number, number][] = [
  [0, 0],
  [3.38, 0],
  [3.55, 0.6],
  [3.75, 0.9],
  [3.95, 1],
  [9, 1],
];

const SPHERE_G: [number, number][] = [
  [0, 0.03],
  [3.36, 0.03],
  [3.5, 0.065],
  [3.62, 0.09],
  [3.85, 0.12],
  [4.05, 0.16],
  [4.4, 0.28],
  [5.4, 0.58],
  [6.0, 0.88],
  [SETTLE_END, 1],
  [9, 1],
];

/**
 * Belt-hold screen offsets only (no per-card size inflate).
 * Size used to rush the lens (boost → shrink); presence now comes from
 * path, tilt, and a one-way hatch→rest grow.
 */
const BELT_OFFSET: Record<string, { x: number; y: number }> = {
  "science-a": { x: -0.5, y: 6.0 },
  "contest-a": { x: -4.3, y: 22.8 },
  "me-a": { x: -6.5, y: 1.6 },
  "contest-b": { x: 4.5, y: -5.4 },
  "science-b": { x: -5.0, y: 1.2 },
  ip: { x: 7.0, y: 10.2 },
};

/** "rotateX(8deg) rotateY(-5deg)…" → { x: 8, y: -5, z: 0 } */
function parseRotate(str: string) {
  const out = { x: 0, y: 0, z: 0 };
  const re = /rotate([XYZ])\s*\((-?[\d.]+)deg\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(str))) {
    const v = parseFloat(m[2]);
    if (m[1] === "X") out.x = v;
    else if (m[1] === "Y") out.y = v;
    else out.z = v;
  }
  return out;
}

type SphereAnchor = {
  /** world-space rest point (projects to the authored layout pixel at the final camera) */
  p: V3;
  /** outward sphere normal at that point */
  n: V3;
  /** final-camera perspective size ratio vs the character plane (>1 near) */
  perspFinal: number;
  /** SHALLOW CoC depth offset (×bodyH) — for DOF blur only */
  cocDepth: number;
  /** belt-hold screen offset (x: width-%, y: height-%) */
  beltOffset: { x: number; y: number };
  /** half card box in stage-% — figure left/top anchor the TOP-LEFT, but the
   *  projection yields the card CENTER, so convert before applying */
  halfW: number;
  halfH: number;
  /** authored layout center (stage %) — final g=1 target */
  homeX: number;
  homeY: number;
  /** stagger delay (s) for the titles hand-off blur, inner ring first */
  delay: number;
  /**
   * End-state circle-of-confusion blur at the FINAL camera — official
   * 8.2s+ frames show NEAR cards (human/text) near-sharp while far cards
   * sit at 6-8px: the camera refocuses onto the card group, it does NOT
   * uniformly defocus everything to DIM_BLUR.
   */
  dofFinal: number;
  rest: { x: number; y: number; z: number };
  enterZ: number;
  /** Burst follow-through delay (s). Far cards lag; fades out before the belt lock. */
  lag: number;
};

type SphereSolved = { center: V3; anchors: SphereAnchor[] };

/**
 * Solve per-card world anchors: cast the authored layout pixel through the
 * FINAL camera and intersect at center-depth ± per-card offset. Any-depth
 * projection through the same camera returns the same pixel, so at g=1 the
 * sphere frame equals the authored layout exactly.
 */
function solveSphereAnchors(cam: CamInfo): SphereSolved {
  const b = cam.bodyH;
  const charY = cam.charY;
  const tanF = Math.tan((FINAL_FOV * Math.PI) / 360);
  /** held final camera: yaw 0, camY = feet+1.05b (= charY+0.55b), viewH = 3.65b */
  const camYF = charY + 0.55 * b;
  const lookYF = charY + 0.32 * b;
  const distF = (3.65 * b) / (2 * tanF);
  const E: V3 = [0, camYF, distF];
  const center: V3 = [0, charY, 0];
  const F = vNorm([0 - E[0], lookYF - E[1], 0 - E[2]]);
  const R = vNorm(vCross(F, [0, 1, 0]));
  const U = vCross(R, F);
  const zcF = vDot(vSub(center, E), F);

  const anchors = cards.map((card) => {
    const ratio = card.id === "science-a" ? 124 / 470 : 1.28;
    const pose = CONFIRMED_MAIN.cards[card.id] ?? REST_MAIN;
    const cx = card.left + card.width / 2 + pose.dx;
    const cy = card.top + (card.width * ratio) / 2 + pose.dy;
    const xn = (cx - 50) / 50;
    const yn = (50 - cy) / 50;
    const dz = (CARD_DEPTH[card.id] ?? 0.5) * b;
    const depth = zcF + dz;
    /** pixel ray in camera basis, un-normalized (F component = 1) */
    const ray: V3 = [
      F[0] + R[0] * xn * tanF * STAGE_ASPECT + U[0] * yn * tanF,
      F[1] + R[1] * xn * tanF * STAGE_ASPECT + U[1] * yn * tanF,
      F[2] + R[2] * xn * tanF * STAGE_ASPECT + U[2] * yn * tanF,
    ];
    const p = vAdd(E, vMul(ray, depth));
    const r = Math.hypot(p[0] - center[0], p[1] - center[1], p[2] - center[2]);
    /** relative focal offset at the final camera → per-card end-state CoC
     *  (uses the shallow COC_DEPTH, NOT the geometric CARD_DEPTH) */
    const relF = 1 - (zcF + COC_DEPTH[card.id] * b) / zcF;
    const dofFinal = relF > 0 ? Math.min(8, relF * 26) : Math.min(6, -relF * 30);
    return {
      p,
      n: vNorm(vSub(p, center)),
      perspFinal: zcF / depth,
      cocDepth: COC_DEPTH[card.id] * b,
      beltOffset: BELT_OFFSET[card.id] ?? { x: 0, y: 0 },
      halfW: (card.width * pose.scale) / 2,
      halfH: (card.width * pose.scale * ratio) / 2,
      homeX: cx,
      homeY: cy,
      /**
       * Staggered hand-off blur (official is layered, not simultaneous):
       * inner-ring cards start defocusing first, outer cards trail by
       * 2–3 frames — models focus racking out from the subject.
       */
      delay: (r / (5.5 * b)) * 0.1,
      dofFinal,
      rest: {
        x: parseRotate(card.restRotate).x + pose.rx,
        y: parseRotate(card.restRotate).y + pose.ry,
        z: parseRotate(card.restRotate).z + pose.rz,
      },
      enterZ: parseRotate(card.enterRotate).z,
      /** 80ms on the near ring → 160ms on the far ring. Rotation leads position. */
      lag: 0.08 + 0.08 * clamp01((CARD_DEPTH[card.id] + 2.5) / 4.6),
    };
  });
  return { center, anchors };
}

type SphereFrame = {
  left: number;
  top: number;
  scale: number;
  rotX: number;
  rotY: number;
  rotZ: number;
  blur: number;
  footBlur: number;
  behind: boolean;
  opacity: number;
};

/**
 * Child sheets: near → mid → far, sheet 0 then 1. Overall card defocus
 * rides this same window — sharp until growth starts, soft when done.
 */
/**
 * Main cards burst first. Child sheets stay on their anchor and fade in:
 * the one farther from screen center first, then the one closer in.
 */
const FOOT_OUTER_START = 4.6;
const FOOT_FADE = 0.9;
const FOOT_INNER_GAP = 0.72;
/** Main-card softness stays on the later settle, not the burst. */
const DEFOCUS_START = 5.4;
const DEFOCUS_END = 6.6;

/** Project the shrunken sphere through the LIVE camera → per-card DOM state. */
function projectSphere(cam: CamInfo, solved: SphereSolved): SphereFrame[] {
  const b = cam.bodyH;
  const tanH = Math.tan((cam.fov * Math.PI) / 360);
  const E: V3 = [Math.sin(cam.yaw) * cam.dist, cam.camY, Math.cos(cam.yaw) * cam.dist];
  const F = vNorm([0 - E[0], cam.lookY - E[1], 0 - E[2]]);
  const R = vNorm(vCross(F, [0, 1, 0]));
  const U = vCross(R, F);
  const zc = vDot(vSub(solved.center, E), F);
  /** Occlusion dressing only — does not drive the soft look anymore. */
  const settle = 1 - clamp01((cam.t - 6.0) / 1.8);
  /**
   * Follow-through only while the ring is still forming. By the belt lock
   * (t≈5.05) every card samples the same g, so the fitted 5.0–6.5 layout
   * and the 8.05 hand-off stay exact.
   */
  const lagW = 1 - smoothstep(4.7, 5.05, cam.t);

  return solved.anchors.map((a) => {
    const gRot = sampleSpline(cam.t - a.lag * lagW * 0.35, SPHERE_G);
    const gCard = sampleSpline(cam.t - a.lag * lagW, SPHERE_G);
    const burstLocal = sampleSpline(cam.t - a.lag * lagW, BURST_KEYS);
    /**
     * Face → rest: finish with camera 回正 (~5.4) so cards are not still
     * edge-on after the orbit lands frontal.
     */
    const settleFace = smoothstep(4.4, 5.4, cam.t - a.lag * lagW * 0.2);
    const wSphere = 1 - settleFace;
    const fadeIn = clamp01(burstLocal / 0.3);
    /** Birth near the chest; the bias is gone by mid-orbit so the ring holds. */
    const birth = 1 - smoothstep(0.35, 0.7, gCard);
    const sprout = vAdd(solved.center, [0, 0.18 * b * birth, 0.08 * b * birth]);
    const w = vAdd(sprout, vMul(vSub(a.p, sprout), gCard));
    const v = vSub(w, E);
    const x = vDot(v, R);
    const y = vDot(v, U);
    const z = vDot(v, F);
    const persp = zc / Math.max(0.05, z);
    /**
     * Size language: hatch → rest once. No per-card boost (that read as
     * 扑向屏幕 then shrink-back). Soft perspective only while orbiting;
     * both terms land on exactly 1 at g=1 for a seamless titles hand-off.
     */
    const hatch = smoothstep(0.02, 0.72, gCard);
    const sizeTerm = ((persp - 1) - (a.perspFinal - 1) * gCard) * 0.22 * (1 - gCard);
    const scale = (0.38 + 0.62 * hatch) * (1 + sizeTerm);
    /** Belt offsets ride the face settle so mid-orbit layout stays dressed. */
    const ramp = smoothstep(0.3, 0.8, gCard);
    const bh = Math.min(ramp, 1 - settleFace);

    /** sphere-facing orientation, blended into the authored rest tilt */
    const ry = (Math.atan2(vDot(a.n, R), -vDot(a.n, F)) * 180) / Math.PI;
    const rx = (-Math.asin(Math.max(-1, Math.min(1, vDot(a.n, U)))) * 180) / Math.PI;
    const rotX = rx * wSphere + a.rest.x * (1 - wSphere);
    const rotY = ry * wSphere + a.rest.y * (1 - wSphere);
    const rotZ = a.enterZ + (a.rest.z - a.enterZ) * clamp01(burstLocal * 1.4);

    /**
     * Stay sharp through the orbit. Softness still waits for settle.
     */
    const defocus = smoothstep(DEFOCUS_START, DEFOCUS_END, cam.t);
    const blur = a.dofFinal * defocus;
    const footBlur = blur;

    const behind = z > zc + 0.12 * b;
    /**
     * Pure projection + live camera can reverse the UL cards mid-path
     * (~7s) as g and the dolly fight. Ease the last stretch into the
     * authored centers so the settle has no direction flip.
     */
    const rawLeft = 50 + (x / (z * tanH * STAGE_ASPECT)) * 50 + a.beltOffset.x * bh;
    const rawTop = 50 - (y / (z * tanH)) * 50 + a.beltOffset.y * bh;
    const home = smoothstep(5.85, SETTLE_END, cam.t);
    const left = rawLeft + (a.homeX - rawLeft) * home;
    const top = rawTop + (a.homeY - rawTop) * home;
    return {
      /** projection is the card CENTER. The figure is centered with
       *  translate(-50%, -50%) so scale and rotation pivot on that point. */
      left,
      top,
      scale,
      rotX,
      rotY,
      rotZ,
      blur,
      footBlur,
      behind,
      opacity: fadeIn * (behind ? 0.92 + 0.08 * (1 - settle) : 1),
    };
  });
}

const FOOT_GROW_REST = { spread: 1, scale: 1, opacity: 1 };
const FOOT_HIDDEN = { spread: 0, scale: 0.4, opacity: 0 };

function footGrowAt(t: number, order: number) {
  const start = FOOT_OUTER_START + order * FOOT_INNER_GAP;
  const u = clamp01((t - start) / FOOT_FADE);
  if (u <= 0) return FOOT_HIDDEN;
  if (u >= 1) return FOOT_GROW_REST;
  const e = u * u * (3 - 2 * u);
  return {
    spread: e,
    scale: 0.4 + 0.6 * e,
    opacity: e,
  };
}

function cardBoxRatio(id: string) {
  return id === "science-a" ? 124 / 470 : 1.28;
}

/**
 * Stage box each child sheet was authored against, before the main-card
 * slot swap. Sheets stay pinned here; only the parent photo moves.
 */
const FOOT_HOME: Record<string, { left: number; top: number; width: number }> = {
  "science-a": { left: 35.3, top: 12.7, width: 22.5 },
  "contest-a": { left: 13.0, top: 45.2, width: 7.0 },
  "me-a": { left: 16.5, top: 71.5, width: 14.8 },
  "contest-b": { left: 64.2, top: 8.5, width: 7.1 },
  "science-b": { left: 18.5, top: 14.5, width: 9.7 },
  "me-b": { left: 77.0, top: 30.5, width: 5.8 },
  ip: { left: 72.5, top: 54.0, width: 12.5 },
};

/** 0 = farther from screen center (opens first), 1 = closer (opens after). */
const FOOT_OPEN_ORDER: Record<string, number> = {};
for (const [parentId, home] of Object.entries(FOOT_HOME)) {
  const ratio = cardBoxRatio(parentId);
  const ranked = feet
    .filter((foot) => foot.parentId === parentId)
    .map((foot) => {
      const x = home.left + ((foot.left + foot.width / 2) / 100) * home.width;
      const y = home.top + (foot.top / 100) * home.width * ratio;
      return { id: foot.id, d: Math.hypot(x - 50, y - 50) };
    })
    .sort((a, b) => b.d - a.d);
  ranked.forEach((foot, order) => {
    FOOT_OPEN_ORDER[foot.id] = order;
  });
}

function cardCenterOf(card: CardDef) {
  const ratio = cardBoxRatio(card.id);
  return {
    x: card.left + card.width / 2,
    y: card.top + (card.width * ratio) / 2,
  };
}

/** Child sheet sits inward of its main card. `inset` and `gap` are stage %. */
function inwardSheet(
  card: CardDef,
  foot: { id: string; width: number },
  cx: number,
  cy: number,
  aspect: number,
  tune: { size: number; inset: number; gap: number },
) {
  const home = FOOT_HOME[card.id];
  const stageW = (home ? (foot.width / 100) * home.width : card.width * 0.42) * tune.size;
  const order = FOOT_OPEN_ORDER[foot.id] ?? 0;
  const boxH = card.width * aspect * STAGE_ASPECT;
  const dx = 50 - cx;
  const dy = 50 - cy;
  const len = Math.hypot(dx, dy) || 1;
  const halfReach = 0.5 * Math.hypot(card.width, boxH);
  const tuck = Math.min(len * 0.9, halfReach * 0.72 + tune.inset + order * tune.gap);
  const sx = cx + (dx / len) * tuck;
  const sy = cy + (dy / len) * tuck;
  return {
    left: sx - stageW / 2,
    top: sy - stageW * 0.55,
    width: stageW,
  };
}

type SheetNudge = {
  dx: number;
  dy: number;
  scale: number;
  rx: number;
  ry: number;
  rz: number;
};

const GROUP_LIST = [
  { id: "science-a", label: "科研经历 · 上" },
  { id: "contest-a", label: "学科竞赛 · 右上" },
  { id: "me-a", label: "个人简介 · 右" },
  { id: "science-b", label: "科研经历 · 右下" },
  { id: "me-b", label: "个人简介 · 左" },
  { id: "contest-b", label: "学科竞赛 · 左下" },
  { id: "ip", label: "知识产权" },
] as const;

type SheetLayout = {
  counts: Record<string, number>;
  sheets: Record<string, SheetNudge>;
};

const SHEET_LAYOUT_KEY = "yaojun-sheet-layout";
const REST_SHEET: SheetNudge = { dx: 0, dy: 0, scale: 1, rx: 0, ry: 0, rz: 0 };

/** Confirmed layout node: main-card pose plus the locked child relationship. */
const CONFIRMED_SHEET: SheetLayout = {
  counts: {
    "science-a": 1,
    "contest-a": 1,
    "me-a": 2,
    "science-b": 2,
    "me-b": 2,
    "contest-b": 2,
    ip: 1,
  },
  sheets: {
    "me-a-0": { dx: 7, dy: -2, scale: 0.7, rx: 0, ry: 2, rz: 57 },
    "me-a-1": { dx: 14, dy: -2, scale: 0.6, rx: 0, ry: 0, rz: 60 },
    "science-b-0": { dx: 7, dy: 5, scale: 1.3, rx: -6, ry: -38, rz: 41 },
    "science-b-1": { dx: 10, dy: 20, scale: 0.9, rx: 1, ry: -12, rz: 67 },
    "contest-a-0": { dx: 3.5, dy: -10, scale: 1.3, rx: 0, ry: 0, rz: 0 },
    "contest-a-1": { dx: 0, dy: 0, scale: 1, rx: 0, ry: 0, rz: 0 },
    "science-a-0": { dx: -2.5, dy: -5, scale: 1.15, rx: 0, ry: 0, rz: 0 },
    "science-a-1": { dx: 0, dy: 0, scale: 1, rx: 0, ry: 0, rz: 0 },
    "contest-b-0": { dx: -3, dy: 14.5, scale: 2.4, rx: -11, ry: -30, rz: 53 },
    "contest-b-1": { dx: -2.5, dy: 30, scale: 1.5, rx: 0, ry: 0, rz: 0 },
    "me-b-0": { dx: -7, dy: 0, scale: 1.35, rx: 0, ry: 0, rz: 44 },
    "me-b-1": { dx: -17, dy: 9, scale: 1, rx: 0, ry: 0, rz: 0 },
    "ip-0": { dx: -4.5, dy: -6, scale: 1.55, rx: 0, ry: 0, rz: 43 },
    "ip-1": { dx: 0, dy: 0, scale: 1, rx: 0, ry: 0, rz: 0 },
  },
};

function defaultSheetLayout(): SheetLayout {
  return {
    counts: { ...CONFIRMED_SHEET.counts },
    sheets: Object.fromEntries(
      feet.map((foot) => [foot.id, { ...(CONFIRMED_SHEET.sheets[foot.id] ?? REST_SHEET) }]),
    ),
  };
}

function countOf(layout: SheetLayout, groupId: string) {
  return layout.counts[groupId] ?? 2;
}

function sheetOf(layout: SheetLayout, id: string) {
  return layout.sheets[id] ?? REST_SHEET;
}

function axisDeg(rotate: string, axis: "X" | "Y" | "Z") {
  const match = rotate.match(new RegExp(`rotate${axis}\\((-?[\\d.]+)deg\\)`));
  return match ? Number(match[1]) : 0;
}

function sheetTransform(rotate: string, nudge: { rx: number; ry: number; rz: number }) {
  const x = axisDeg(rotate, "X") + nudge.rx;
  const y = axisDeg(rotate, "Y") + nudge.ry;
  const z = axisDeg(rotate, "Z") + nudge.rz;
  return `rotateX(${x}deg) rotateY(${y}deg) rotateZ(${z}deg)`;
}

type MainNudge = {
  dx: number;
  dy: number;
  scale: number;
  rx: number;
  ry: number;
  rz: number;
};

type MainLayout = {
  cards: Record<string, MainNudge>;
};

const MAIN_LAYOUT_KEY = "yaojun-main-layout";
const REST_MAIN: MainNudge = { dx: 0, dy: 0, scale: 1, rx: 0, ry: 0, rz: 0 };

const CONFIRMED_MAIN: MainLayout = {
  cards: {
    "science-a": { dx: 0, dy: -3, scale: 1.2, rx: 0, ry: 0, rz: 0 },
    "contest-a": { dx: 5.5, dy: 0, scale: 1, rx: 0, ry: 0, rz: 0 },
    "me-a": { dx: 3.5, dy: 5, scale: 1, rx: 0, ry: 0, rz: 15 },
    "science-b": { dx: 0, dy: 10, scale: 1.2, rx: 0, ry: 0, rz: 0 },
    "me-b": { dx: -2.5, dy: -0.5, scale: 1, rx: 0, ry: 0, rz: 0 },
    "contest-b": { dx: 0, dy: 4, scale: 1.1, rx: 8, ry: 10, rz: 11 },
    ip: { dx: -2.5, dy: 1, scale: 1, rx: 0, ry: 0, rz: 0 },
  },
};

function defaultMainLayout(): MainLayout {
  return {
    cards: Object.fromEntries(
      GROUP_LIST.map((group) => [group.id, { ...(CONFIRMED_MAIN.cards[group.id] ?? REST_MAIN) }]),
    ),
  };
}

function mainOf(layout: MainLayout, id: string) {
  return layout.cards[id] ?? REST_MAIN;
}

function focusShift(card: CardDef, nudge: MainNudge = REST_MAIN) {
  const ratio = card.id === "science-a" ? 124 / 470 : 1.28;
  const cx = card.left + card.width / 2 + nudge.dx;
  const cy = card.top + (card.width * ratio) / 2 + nudge.dy;
  const pull = 0.22;
  return {
    x: ((50 - cx) * pull * STAGE_W) / 100,
    y: ((46 - cy) * pull * STAGE_H) / 100,
  };
}

export function AboutExperience() {
  const [phase, setPhase] = useState<Phase>("intro");
  const [cardAspect, setCardAspect] = useState<Record<string, number>>({});
  const [sheetLayout, setSheetLayout] = useState<SheetLayout>(defaultSheetLayout);
  const [mainLayout, setMainLayout] = useState<MainLayout>(defaultMainLayout);
  const [titleOn, setTitleOn] = useState(-1);
  const [focusTopic, setFocusTopic] = useState<Topic | null>(null);
  const [exitFlight, setExitFlight] = useState<ExitFlight | null>(null);
  const exiting = exitFlight != null;
  const [reduce, setReduce] = useState(false);
  const [stageScale, setStageScale] = useState(1);
  const [cardRingScale, setCardRingScale] = useState(CARD_RING_BASE);
  const [flowZ, setFlowZ] = useState(0);
  /** Micro tilt arms at FLOW_ARM — continues through titles → live. */
  const [flowArmed, setFlowArmed] = useState(false);
  const flowArmedRef = useRef(false);
  const [revealCards, setRevealCards] = useState(false);
  const [burstP, setBurstP] = useState(0);
  const [debug, setDebug] = useState(false);
  const [scrubT, setScrubT] = useState<number | null>(null);
  const [clock, setClock] = useState<ClockInfo>({
    t: 0,
    hole: 0,
    heroAlpha: 0,
    helloAlpha: 0,
    cards: 0,
    beat: "小圆 idle",
  });
  const [heroKey, setHeroKey] = useState(0);
  /** live WebGL camera state, unthrottled (drives the pseudo-3D card sphere) */
  const [camInfo, setCamInfo] = useState<CamInfo | null>(null);
  const [sphere, setSphere] = useState<SphereSolved | null>(null);
  const sphereRef = useRef<SphereSolved | null>(null);
  const timers = useRef<number[]>([]);
  const clockFlush = useRef(0);
  const phaseRef = useRef(phase);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  const scrubbing = scrubT != null;

  const clearTimers = () => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
  };

  const land = () => {
    clearTimers();
    setScrubT(null);
    setRevealCards(true);
    setBurstP(1);
    setPhase("live");
    setTitleOn(3);
    setFocusTopic(null);
    flowArmedRef.current = true;
    setFlowArmed(true);
  };

  const beginTitleExit = useCallback(
    (topic: Topic, href: string) => {
      if (exiting || phase !== "live") return;
      const heroId = TOPIC_EXIT_CARD[topic];
      const hero = cards.find((card) => card.id === heroId);
      if (!hero) {
        window.location.assign(href);
        return;
      }
      if (reduce) {
        window.location.assign(href);
        return;
      }
      const el = document.querySelector<HTMLElement>(`[data-card-id="${heroId}"]`);
      const rect = el?.getBoundingClientRect();
      const from = rect
        ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
        : {
            left: window.innerWidth * 0.35,
            top: window.innerHeight * 0.28,
            width: window.innerWidth * 0.3,
            height: window.innerHeight * 0.42,
          };
      setFocusTopic(topic);
      setExitFlight({ href, src: hero.src, from, expand: false });
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setExitFlight((prev) => (prev ? { ...prev, expand: true } : prev));
        });
      });
      timers.current.push(
        window.setTimeout(() => {
          window.location.assign(href);
        }, EXIT_MS + 80),
      );
    },
    [exiting, phase, reduce],
  );

  const playTitles = useCallback(() => {
    if (scrubbing) return;
    setRevealCards(true);
    setPhase("titles");
    setTitleOn(-1);
    setFocusTopic(null);
    /**
     * Chain off INTRO_END — micro ring tilt already running from FLOW_ARM.
     * Tiny delay only so the first focus doesn't pop on the same paint.
     */
    let t = FOCUS_FIRST_DELAY_MS;
    titles.forEach((title, i) => {
      timers.current.push(
        window.setTimeout(() => {
          setTitleOn(i);
          setFocusTopic(title.topic);
        }, t)
      );
      t += CARD_MS;
      timers.current.push(
        window.setTimeout(() => {
          setFocusTopic(null);
        }, t)
      );
      t += FOCUS_LEAVE_MS + FOCUS_GAP_MS;
    });
    timers.current.push(
      window.setTimeout(() => {
        setPhase("live");
        setTitleOn(3);
        setFocusTopic(null);
      }, t)
    );
  }, [scrubbing]);

  /** stable for the memoized OpeningHero — never inline-arrow props there */
  const revealCardsCb = useCallback(() => setRevealCards(true), []);

  /**
   * Hot path — called every rAF by the hero. MUST stay a stable
   * useCallback (deps change rarely) or the memoized OpeningHero
   * re-renders every frame again.
   */
  const onClock = useCallback((info: ClockInfo) => {
    /** runtime camera probe for frame-by-frame regression scripts */
    (window as Window & { __openingCam?: CamInfo | null }).__openingCam = info.cam ?? null;
    (window as Window & { __openingClockInfo?: ClockInfo }).__openingClockInfo = info;
    /** Cards follow master t every frame (no 30fps throttle — that caused stutter). */
    if (phaseRef.current === "intro" || scrubT != null) {
      setBurstP(info.cards);
      if (info.cam) {
        setCamInfo(info.cam);
        /** solve world anchors once — bodyH/charY are model constants */
        if (!sphereRef.current) {
          const solved = solveSphereAnchors(info.cam);
          sphereRef.current = solved;
          setSphere(solved);
        }
      }
      if (info.cards > 0.001) setRevealCards(true);
      /** Titles wait for child sheets — kicked off in playTitles at INTRO_END. */
    }
    if (!flowArmedRef.current && info.t >= FLOW_ARM) {
      flowArmedRef.current = true;
      setFlowArmed(true);
    }
    const now = performance.now();
    /** Scrub: always flush beat label; play: ~20fps React clock. */
    if (scrubT != null || now - clockFlush.current >= 50) {
      clockFlush.current = now;
      setClock(info);
    }
  }, [scrubT, reduce]);

  const handleScrub = (t: number | null) => {
    clearTimers();
    if (t == null) {
      setScrubT(null);
      setPhase("intro");
      setTitleOn(-1);
      setFocusTopic(null);
      setRevealCards(false);
      setBurstP(0);
      flowArmedRef.current = false;
      setFlowArmed(false);
      setFlowZ(0);
      setHeroKey((k) => k + 1);
      return;
    }
    setScrubT(t);
    setPhase("intro");
    setTitleOn(-1);
    setFocusTopic(null);
    setRevealCards(t >= 3.38);
    setBurstP(t < 3.38 ? 0 : Math.min(1, (t - 3.38) / 0.57));
    const armed = t >= FLOW_ARM;
    flowArmedRef.current = armed;
    setFlowArmed(armed);
    if (!armed) setFlowZ(0);
  };

  useEffect(() => {
    // mount-only browser probes (must run client-side to avoid hydration mismatch)
    const prefers = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration-safe probe
    setReduce(prefers);
    setDebug(new URLSearchParams(window.location.search).has("debug"));
    const saved = window.localStorage.getItem(SHEET_LAYOUT_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Partial<SheetLayout> & { count?: number };
        const base = defaultSheetLayout();
        const sheets = { ...base.sheets };
        for (const foot of feet) {
          const nudge = parsed.sheets?.[foot.id];
          if (nudge) sheets[foot.id] = { ...REST_SHEET, ...nudge };
        }
        const counts = { ...base.counts };
        for (const group of GROUP_LIST) {
          const savedCount = parsed.counts?.[group.id];
          if (typeof savedCount === "number") counts[group.id] = savedCount;
          else if (typeof parsed.count === "number") counts[group.id] = parsed.count;
        }
        setSheetLayout({ counts, sheets });
      } catch {
        /* keep defaults */
      }
    }
    const savedMain = window.localStorage.getItem(MAIN_LAYOUT_KEY);
    if (savedMain) {
      try {
        const parsed = JSON.parse(savedMain) as Partial<MainLayout>;
        const base = defaultMainLayout();
        const cardsNudge = { ...base.cards };
        for (const group of GROUP_LIST) {
          const nudge = parsed.cards?.[group.id];
          if (nudge) cardsNudge[group.id] = { ...REST_MAIN, ...nudge };
        }
        setMainLayout({ cards: cardsNudge });
      } catch {
        /* keep defaults */
      }
    }
    if (prefers) {
      land();
      return;
    }
    return clearTimers;
  }, []);

  useEffect(() => {
    const update = () => {
      const fit = calcStageFit();
      setStageScale(fit.stage);
      setCardRingScale(fit.ring);
      (window as Window & { __stageFit?: typeof fit }).__stageFit = fit;
    };
    update();
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    return () => {
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
    };
  }, []);

  /** Single-screen opening — keep body scroll locked. */
  useEffect(() => {
    if (reduce) return;
    document.body.style.overflow = "hidden";
    window.scrollTo(0, 0);
    return () => {
      document.body.style.overflow = "";
    };
  }, [reduce]);

  useEffect(() => {
    if (reduce || !flowArmed) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset until FLOW_ARM arms tilt
      setFlowZ(0);
      return;
    }
    let cancelled = false;
    const ids: number[] = [];
    const go = (z: number) => {
      if (cancelled) return;
      setFlowZ(z);
      ids.push(
        window.setTimeout(() => {
          go(z > 0 ? FLOW_NEG : FLOW_POS);
        }, FLOW_TURN_MS + FLOW_HOLD_MS)
      );
    };
    const start = window.requestAnimationFrame(() => go(FLOW_POS));
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(start);
      ids.forEach((id) => window.clearTimeout(id));
    };
  }, [flowArmed, reduce]);

  const showCards = revealCards || phase !== "intro" || reduce;
  /** Light nav while white still dominates the rim; fluid is always the underlayer. */
  const lightHeader = phase === "intro" && clock.t < 2.25 && !reduce;
  const cardTween = `opacity ${CARD_MS}ms ${EASE_SINE}`;
  const introActive = phase === "intro" && !scrubbing;

  /** live pseudo-3D sphere: only during the intro card burst */
  const sphereWanted = phase === "intro" && !reduce && revealCards && camInfo != null;
  let frames: SphereFrame[] | null = null;
  if (sphereWanted && camInfo && sphere) {
    frames = projectSphere(camInfo, sphere);
  }
  const sphereActive = frames != null;

  /**
   * Orbit stays ring=1 so cards track the hero; ease into the inset
   * landing scale as the camera settles (FEET_GROW→SETTLE_END).
   */
  const ringNow =
    phase === "intro" && !reduce
      ? 1 - (1 - cardRingScale) * smoothstep(FEET_GROW, SETTLE_END, camInfo?.t ?? clock.t)
      : cardRingScale;

  const stageStyle = {
    width: STAGE_W,
    height: STAGE_H,
    transform: `translate(-50%, -50%) scale(${stageScale})`,
    transformOrigin: "center center",
  } as const;

  /**
   * One card figure. During the intro sphere burst every card is rendered
   * twice — front layer (over the character) and back layer (under her,
   * z-[3]) — with visibility switched by the per-frame depth test.
   */
  const renderCard = (card: CardDef, i: number, layer: "front" | "back") => {
    const sf = frames?.[i] ?? null;
    // NOTE: local `inSphere` must NOT shadow the `sphere` state (needed for
    // per-card end-state CoC in the waiting branch below).
    const inSphere = sphereActive && sf != null;
    const visible = inSphere ? (layer === "back") === sf.behind : layer === "front";
    const isFocus = focusTopic === card.topic;
    const isExitHero = exiting && TOPIC_EXIT_CARD[focusTopic ?? "me"] === card.id;
    const settled = phase === "live" || reduce;
    const waiting = phase === "titles" && !isFocus;
    const flying = phase === "intro" && revealCards && !inSphere;

    const main = mainOf(mainLayout, card.id);
    let left = cardCenterOf(card).x;
    let top = cardCenterOf(card).y;
    let rotate = card.enterRotate;
    let blur = 0;
    let opacity = 1;
    let scale = 1;
    let z = 10;
    let shiftX = 0;
    let shiftY = 0;

    if (inSphere && sf) {
      // pseudo-3D sphere frame projected through the live hero camera
      left = sf.left;
      top = sf.top;
      rotate = `rotateX(${sf.rotX}deg) rotateY(${sf.rotY}deg) rotateZ(${sf.rotZ}deg)`;
      blur = sf.blur;
      opacity = sf.opacity;
      scale = sf.scale;
      z = sf.behind ? 6 : 18;
    } else if (settled) {
      /**
       * Live end-state: every main card stays sharp. Soft hover nudges the
       * matching main card — no title recolor. Exit hides the source card
       * under the FLIP overlay that covers the viewport.
       */
      blur = 0;
      opacity = exiting ? (isExitHero ? 0 : 0.12) : 1;
      if (!exiting && focusTopic && isFocus) {
        rotate = card.frontRotate;
        scale = 1.05;
        z = 16;
        const s = focusShift(card, main);
        shiftX = s.x;
        shiftY = s.y;
      } else {
        rotate = card.restRotate;
        scale = exiting && !isExitHero ? 0.92 : 1;
        z = 12;
      }
    } else if (flying) {
      const home = cardCenterOf(card);
      const originX = home.x + (50 - home.x) * 0.45;
      const originY = home.y + (58 - home.y) * 0.45;
      left = originX + (home.x - originX) * burstP;
      top = originY + (home.y - originY) * burstP;
      rotate = burstP < 0.72 ? card.enterRotate : card.restRotate;
      blur = 0;
      opacity = 1;
      scale = 0.16 + 0.84 * burstP;
      z = 18;
    } else if (isFocus) {
      rotate = card.frontRotate;
      blur = 0;
      opacity = 1;
      scale = 1.04;
      z = 16;
      const s = focusShift(card, main);
      shiftX = s.x;
      shiftY = s.y;
    } else if (waiting) {
      /** Stay on rest pose — enterRotate used to snap UL cards at the
       *  intro→titles flip and read as a sudden 偏折. */
      rotate = card.restRotate;
      blur = Math.max(sphere?.anchors[i]?.dofFinal ?? DIM_BLUR, 5);
      opacity = 1;
      scale = 1;
      z = 10;
    }

    if (!inSphere) {
      left += main.dx;
      top += main.dy;
      rotate = sheetTransform(rotate, main);
    }
    const settleP = inSphere ? smoothstep(5.85, SETTLE_END, camInfo?.t ?? clock.t) : 1;
    const cardWidth = card.width * (inSphere ? 1 + (main.scale - 1) * settleP : main.scale);

    const blurMs = isFocus ? FOCUS_ARRIVE_MS : FOCUS_LEAVE_MS;
    const blurEase = isFocus ? FOCUS_IN_EASE : FOCUS_OUT_EASE;
    const blurTween = `filter ${blurMs}ms ${blurEase}`;
    const motionTween =
      inSphere || flying
        ? "none"
        : `transform ${blurMs}ms ${blurEase}, ${blurTween}`;
    const figureTween =
      inSphere || flying
        ? "none"
        : exiting
          ? `opacity ${EXIT_MS * 0.55}ms ${EXIT_EASE}, transform ${EXIT_MS * 0.55}ms ${EXIT_EASE}, ${cardTween}`
          : `left ${blurMs}ms ${blurEase}, top ${blurMs}ms ${blurEase}, ${cardTween}`;

    return (
      <figure
        key={`${card.id}-${layer}`}
        data-card-id={layer === "front" ? card.id : undefined}
        className="absolute overflow-visible will-change-transform"
        style={{
          left: `${left}%`,
          top: `${top}%`,
          width: `${cardWidth}%`,
          transform: "translate(-50%, -50%)",
          transformOrigin: "50% 50%",
          perspective: `${card.perspective}px`,
          zIndex: z,
          opacity,
          display: visible ? undefined : "none",
          transition: figureTween,
        }}
      >
        <div
          className="relative"
          style={{
            animation:
              settled && !reduce && !exiting
                ? `card-float ${3.2 + (i % 3) * 0.35}s ease-in-out ${i * 0.12}s infinite alternate`
                : undefined,
          }}
        >
          <div
            className="relative z-[2] origin-center"
            style={{
              transform: `translate(${shiftX}px, ${shiftY}px) scale(${scale})`,
              transition: motionTween,
            }}
          >
            <div
              className="origin-center"
              style={{
                transform: rotate,
                transformStyle: "preserve-3d",
                transition: inSphere ? "none" : motionTween,
                filter: blur > 0.05 ? `blur(${blur}px)` : "none",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={card.src}
                alt=""
                className="block h-auto w-full rounded-[14px] shadow-[0_18px_40px_rgba(20,24,40,0.22)]"
                draggable={false}
                onLoad={(event) => {
                  const img = event.currentTarget;
                  const next = img.naturalWidth > 0 ? img.naturalHeight / img.naturalWidth : 0;
                  if (next <= 0) return;
                  setCardAspect((prev) => (prev[card.id] === next ? prev : { ...prev, [card.id]: next }));
                }}
              />
            </div>
          </div>
        </div>
      </figure>
    );
  };

  const renderSheets = (layer: "front" | "back") =>
    cards.map((card, i) => {
      const sf = frames?.[i] ?? null;
      const inSphere = sphereActive && sf != null;
      if (inSphere) {
        if ((layer === "back") !== sf.behind) return null;
      } else if (layer === "back") {
        return null;
      }
      const sheets = feet.filter((foot) => foot.parentId === card.id);
      if (sheets.length === 0) return null;
      const rest = cardCenterOf(card);
      const focused = focusTopic === card.topic;
      const live = phase === "intro" && !focused && sf ? sf : null;
      const sheetBlur =
        live != null
          ? live.blur
          : phase === "live" || reduce
            ? 5
            : phase === "titles"
              ? Math.max(sphere?.anchors[i]?.dofFinal ?? DIM_BLUR, 5)
              : 0;
      const visibleSheets = [...sheets]
        .sort((a, b) => (FOOT_OPEN_ORDER[a.id] ?? 0) - (FOOT_OPEN_ORDER[b.id] ?? 0))
        .slice(0, countOf(sheetLayout, card.id));
      return visibleSheets.map((foot) => {
        const grown =
          phase === "intro" && !reduce
            ? footGrowAt(camInfo?.t ?? clock.t, FOOT_OPEN_ORDER[foot.id] ?? 0)
            : FOOT_GROW_REST;
        const nudge = sheetOf(sheetLayout, foot.id);
        const mainPose = mainOf(mainLayout, card.id);
        const aspect = cardAspect[card.id] ?? 1.25;
        const tune = { size: nudge.scale, inset: 4, gap: 12 };
        const restBox = inwardSheet(card, foot, rest.x, rest.y, aspect, tune);
        const ox = restBox.left + nudge.dx - rest.x;
        const oy = restBox.top + nudge.dy - rest.y;
        const settleP =
          phase === "intro" && !reduce ? smoothstep(5.85, SETTLE_END, camInfo?.t ?? clock.t) : 1;
        const widthFactor = 1 + (mainPose.scale - 1) * settleP;
        const burst = live ? (live.scale * widthFactor) / mainPose.scale : 1;
        const parentX = live ? live.left : rest.x + mainPose.dx;
        const parentY = live ? live.top : rest.y + mainPose.dy;
        const sheetLeft = parentX + ox * mainPose.scale * burst;
        const sheetTop = parentY + oy * mainPose.scale * burst;
        const sheetW = restBox.width * mainPose.scale * burst;
        return (
          <div
            key={foot.id}
            className="pointer-events-none absolute overflow-hidden rounded-[12px]"
            style={{
              left: `${sheetLeft}%`,
              top: `${sheetTop}%`,
              width: `${sheetW}%`,
              zIndex: 2 + (FOOT_OPEN_ORDER[foot.id] ?? 0),
              transform: sheetTransform(foot.rotate, nudge),
              transformOrigin: "50% 50%",
              opacity: exiting ? 0 : grown.opacity,
              visibility: grown.opacity < 0.02 && !exiting ? "hidden" : "visible",
              filter: sheetBlur > 0.05 ? `blur(${sheetBlur}px)` : "none",
              transition: inSphere
                ? "none"
                : exiting
                  ? `opacity ${EXIT_MS * 0.4}ms ${EXIT_EASE}`
                  : `filter ${FOCUS_LEAVE_MS}ms ${FOCUS_OUT_EASE}`,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={foot.src} alt="" className="block h-auto w-full" draggable={false} />
          </div>
        );
      });
    });

  return (
    <main className="relative w-full bg-[#0e1316] text-[#f2f2f2]">
      <SiteHeader light={lightHeader} />

      {/*
        Opening act — single full-viewport stage.
      */}
      <section className="relative h-screen w-full overflow-hidden">

      {/*
        P0 fluid: live cyan–teal WebGL field (client ref). Under the black
        veil; the expanding hole reveals this — not the old Doubao MP4 stack.
      */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <FluidCyanBackdrop />
      </div>

      {/*
        Back card layer — sphere cards currently BEHIND the character sit under
        the hero canvas (z-3 < hero z-4) so the body occludes them during orbit.
      */}
      {frames != null ? (
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 z-[3]"
          style={stageStyle}
        >
          <div
            className="absolute inset-0"
            style={{
              opacity: showCards ? 1 : 0,
              perspective: "1600px",
              perspectiveOrigin: "50% 45%",
              transform: `scale(${ringNow})`,
              transformOrigin: "50% 50%",
            }}
          >
            <div
              className="absolute inset-0"
              style={{
                transform: `rotateZ(${flowZ}deg)`,
                transformOrigin: "50% 50%",
                transition:
                  flowArmed && !reduce
                    ? `transform ${FLOW_TURN_MS}ms ${EASE_SINE}`
                    : "none",
              }}
            >
              <div className="absolute inset-0" style={{ zIndex: 1 }}>
                {renderSheets("back")}
              </div>
              <div className="absolute inset-0" style={{ zIndex: 2 }}>
                {cards.map((card, i) => renderCard(card, i, "back"))}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {!reduce ? (
        <OpeningHero
          key={heroKey}
          active={introActive}
          scrubT={scrubT}
          onRevealCards={revealCardsCb}
          onDone={playTitles}
          onClock={onClock}
        />
      ) : null}

      {/*
        1440×810 stage × cover-scale. Card ring uses ringNow; titles stay
        full-stage (not scaled with the ring).
      */}
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 z-[5]"
        style={stageStyle}
      >
        <div
          className="absolute inset-0"
          style={{
            opacity: showCards ? 1 : 0,
            perspective: "1600px",
            perspectiveOrigin: "50% 45%",
            transform: `scale(${ringNow})`,
            transformOrigin: "50% 50%",
          }}
        >
          <div
            className="absolute inset-0"
            style={{
              transform: `rotateZ(${flowZ}deg)`,
              transformOrigin: "50% 50%",
              transition:
                flowArmed && !reduce
                  ? `transform ${FLOW_TURN_MS}ms ${EASE_SINE}`
                  : "none",
            }}
          >
            <div className="absolute inset-0" style={{ zIndex: 1 }}>
              {renderSheets("front")}
            </div>
            <div className="absolute inset-0" style={{ zIndex: 2 }}>
            {cards.map((card, i) => renderCard(card, i, "front"))}
            </div>
          </div>
        </div>

        <nav
          className={`absolute left-1/2 top-[46%] z-[10] flex w-max -translate-x-1/2 -translate-y-1/2 flex-col items-center ${
            (phase === "intro" || titleOn < 0) && !reduce ? "opacity-0" : exiting ? "opacity-0" : "opacity-100"
          }`}
          style={{
            transition: exiting
              ? `opacity ${EXIT_MS * 0.45}ms ${EXIT_EASE}`
              : "opacity 500ms ease",
            pointerEvents: exiting ? "none" : undefined,
          }}
        >
          {titles.map((title, i) => {
            const on = titleOn >= i;
            const current = titleOn === i && phase === "titles";
            const dim =
              phase === "live"
                ? 1
                : current || (phase === "intro" && i === 0)
                  ? 1
                  : titleOn > i
                    ? 0.55
                    : 0;
            return (
              <a
                key={title.id}
                href={title.href}
                className="pointer-events-auto relative overflow-hidden py-[0.02em]"
                style={{
                  clipPath: on ? "inset(0% 0 0 0)" : "inset(100% 0 0 0)",
                  transition: `clip-path ${TITLE_MS}ms ${TITLE_EASE}`,
                  transform: `translateX(${on ? title.restX : title.restX + title.dir * 22}px)`,
                }}
                onMouseEnter={() => {
                  if (phase === "live" && !exiting) setFocusTopic(title.topic);
                }}
                onMouseLeave={() => {
                  if (phase === "live" && !exiting) setFocusTopic(null);
                }}
                onFocus={() => {
                  if (phase === "live" && !exiting) setFocusTopic(title.topic);
                }}
                onBlur={() => {
                  if (phase === "live" && !exiting) setFocusTopic(null);
                }}
                onClick={(event) => {
                  if (phase !== "live") {
                    event.preventDefault();
                    return;
                  }
                  event.preventDefault();
                  beginTitleExit(title.topic, title.href);
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={title.src}
                  alt=""
                  className="block h-[clamp(68px,11.5vh,108px)] w-auto max-w-[min(90vw,600px)] object-contain"
                  style={{
                    opacity: on ? dim : 0,
                    filter: on ? "blur(0px)" : "blur(8px)",
                    transform: `translateY(${on ? 0 : 12}%)`,
                    transition: `opacity ${TITLE_MS}ms ${TITLE_EASE}, filter ${TITLE_MS}ms ${TITLE_EASE}, transform ${TITLE_MS}ms ${TITLE_EASE}`,
                  }}
                  draggable={false}
                />
              </a>
            );
          })}
        </nav>
      </div>

      {exitFlight ? (
        <div className="pointer-events-none fixed inset-0 z-[60]" aria-hidden>
          <div
            className="absolute inset-0 bg-[#0e1316]"
            style={{
              opacity: exitFlight.expand ? 1 : 0,
              transition: `opacity ${EXIT_MS * 0.7}ms ${EXIT_EASE}`,
            }}
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={exitFlight.src}
            alt=""
            className="absolute object-cover shadow-[0_40px_120px_rgba(0,0,0,0.35)]"
            style={{
              left: exitFlight.expand ? 0 : exitFlight.from.left,
              top: exitFlight.expand ? 0 : exitFlight.from.top,
              width: exitFlight.expand ? "100%" : exitFlight.from.width,
              height: exitFlight.expand ? "100%" : exitFlight.from.height,
              borderRadius: exitFlight.expand ? 0 : 14,
              transition: `left ${EXIT_MS}ms ${EXIT_EASE}, top ${EXIT_MS}ms ${EXIT_EASE}, width ${EXIT_MS}ms ${EXIT_EASE}, height ${EXIT_MS}ms ${EXIT_EASE}, border-radius ${EXIT_MS}ms ${EXIT_EASE}`,
            }}
            draggable={false}
          />
        </div>
      ) : null}

      {phase !== "live" && !reduce && !debug ? (
        <button
          type="button"
          onClick={land}
          className="pointer-events-auto absolute bottom-8 right-8 z-20 rounded-full bg-black/35 px-4 py-2 text-[13px] text-white backdrop-blur-sm"
        >
          跳过动画
        </button>
      ) : null}

      </section>

      {debug && !reduce ? (
        <OpeningDebug
          t={scrubT ?? clock.t}
          beat={clock.beat}
          paused={scrubbing}
          onScrub={handleScrub}
          onTogglePause={() => {
            if (scrubbing) handleScrub(null);
            else handleScrub(clock.t);
          }}
        />
      ) : null}
    </main>
  );
}
