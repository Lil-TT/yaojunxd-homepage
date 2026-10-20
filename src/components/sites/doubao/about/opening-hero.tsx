"use client";

import { memo, useEffect, useRef } from "react";
import { CHARACTER_CLIPS, CHARACTER_GLB } from "./content";
import {
  BEATS,
  FADE_END,
  FADE_START,
  HOLE_EXPAND_END,
  INTRO_END,
  SETTLE_END,
  beatLabelAt,
  characterClipAt,
  characterClipLocalTime,
  clamp01,
  holeCenterY,
  holeEdgeSoft,
  holeExpandProgress,
  holeRadius,
  easeScale,
  sample,
  sampleLinear,
  sampleSpline,
  smoothstep,
  type CharClip,
  type ClockInfo,
} from "./opening-timeline";
import type { AnimationAction, AnimationMixer, WebGLRenderer } from "three";

type Props = {
  active: boolean;
  scrubT?: number | null;
  onExpand?: () => void;
  onRevealCards?: () => void;
  onDone?: () => void;
  onClock?: (info: ClockInfo) => void;
};

/**
 * One rebound while the bubble is in: left side lifts, drops past level, settles.
 * Negative degrees lift the left edge; the pivot sits on the right, by the tail.
 */
function bubbleLift(t: number) {
  const u = clamp01((t - 1.28) / 1.25);
  if (u <= 0 || u >= 1) return 0;
  if (u < 0.4) return -9.5 * Math.sin((u / 0.4) * Math.PI * 0.5);
  if (u < 0.72) return -9.5 + 13.1 * Math.sin(((u - 0.4) / 0.32) * Math.PI * 0.5);
  return 3.6 * (1 - Math.sin(((u - 0.72) / 0.28) * Math.PI * 0.5));
}

/**
 * Memoized — the parent re-renders every animation frame (camera state for
 * the card sphere); this component only re-renders when active/scrubT
 * change. Callbacks must be stable (useCallback in the parent) or the
 * memo is defeated.
 */
export const OpeningHero = memo(function OpeningHero({
  active,
  scrubT = null,
  onExpand,
  onRevealCards,
  onDone,
  onClock,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const washRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const maskRef = useRef<HTMLDivElement>(null);
  const helloRef = useRef<HTMLImageElement>(null);
  const callbacks = useRef({ onExpand, onRevealCards, onDone, onClock });
  callbacks.current = { onExpand, onRevealCards, onDone, onClock };
  const activeRef = useRef(active);
  activeRef.current = active;
  const scrubRef = useRef(scrubT);
  scrubRef.current = scrubT;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let dead = false;
    let renderer: WebGLRenderer | null = null;
    let raf = 0;

    (async () => {
      const THREE = await import("three");
      const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
      if (dead) return;

      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.12;

      const scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight(0xfff3e8, 0xc5cfe0, 1.05));
      const key = new THREE.DirectionalLight(0xfff1e4, 1.02);
      key.position.set(2.0, 3.2, 2.4);
      scene.add(key);
      const fill = new THREE.DirectionalLight(0xc5d4ea, 0.48);
      fill.position.set(-2.2, 1.2, -0.8);
      scene.add(fill);
      const rim = new THREE.DirectionalLight(0xfff6ee, 0.18);
      rim.position.set(0, 2.2, -3);
      scene.add(rim);

      const loader = new GLTFLoader();
      let idleGltf;
      try {
        const [idle, wave, present] = await Promise.all([
          loader.loadAsync(CHARACTER_CLIPS.idle),
          loader.loadAsync(CHARACTER_CLIPS.wave),
          loader.loadAsync(CHARACTER_CLIPS.present),
        ]);
        idleGltf = { idle, wave, present };
      } catch (err) {
        console.warn("Meshy clips failed, fallback placeholder", err);
        const one = await loader.loadAsync(CHARACTER_GLB);
        idleGltf = { idle: one, wave: one, present: one };
      }
      if (dead) return;

      const model = idleGltf.idle.scene;
      model.traverse((node) => {
        const mesh = node as import("three").Mesh;
        if (!mesh.isMesh) return;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mats.forEach((mat) => {
          if (!mat) return;
          const std = mat as import("three").MeshStandardMaterial;
          if (std.isMeshStandardMaterial) {
            std.metalness = Math.min(std.metalness ?? 0, 0.04);
            std.roughness = Math.max(std.roughness ?? 0.5, 0.72);
          }
        });
      });

      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      model.position.sub(center);
      const baseY = size.y * 0.02;
      model.position.y = baseY;
      scene.add(model);

      /**
       * Skeleton landmarks (world units, model at rest).
       * The bounding box of a rigged GLB spans only real geometry (feet→head),
       * and `position.y = baseY` keeps the feet near y≈0.034 — so the rig
       * gives us exact anchors for framing: feet, head top, face height.
       */
      const bones: Record<string, [number, number, number]> = {};
      model.updateMatrixWorld(true);
      model.traverse((node) => {
        const bone = node as import("three").Bone;
        if (bone.isBone && bone.name) {
          const wp = bone.getWorldPosition(new THREE.Vector3());
          bones[bone.name] = [wp.x, wp.y, wp.z];
        }
      });
      const feetY = box.min.y + baseY;
      const headTopY = box.max.y + baseY;
      const bodyH = Math.max(0.001, headTopY - feetY);
      const headBoneY =
        Object.entries(bones).find(([name]) => /Head$/i.test(name.replace("mixamorig", "")))?.[1][1] ??
        headTopY - bodyH * 0.23;
      const faceY = headBoneY + (headTopY - headBoneY) * 0.44;

      const mixer: AnimationMixer = new THREE.AnimationMixer(model);
      const pickClip = (gltf: { animations: import("three").AnimationClip[] }, prefer: string) =>
        gltf.animations.find((c) => c.name === prefer) || gltf.animations[0];

      const clips = {
        idle: pickClip(idleGltf.idle, "Idle_11"),
        wave: pickClip(idleGltf.wave, "Wave_One_Hand"),
        present: pickClip(idleGltf.present, "Talk_with_Hands_Open"),
      };

      const actions: Record<CharClip, AnimationAction | null> = {
        idle: clips.idle ? mixer.clipAction(clips.idle) : null,
        wave: clips.wave ? mixer.clipAction(clips.wave.clone()) : null,
        present: clips.present ? mixer.clipAction(clips.present.clone()) : null,
      };

      /**
       * Head −20° via AdditiveAnimationBlendMode. Do NOT multiply bone
       * quaternions after mixer.update — that stacks when the pose is held
       * and reads as a 360° X spin.
       */
      const headTrack =
        clips.present?.tracks.find((tr) => /Head\.quaternion$/i.test(tr.name))?.name ??
        "mixamorig:Head.quaternion";
      const headPitchDelta = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(1, 0, 0),
        (-20 * Math.PI) / 180
      );
      const headPitchClip = new THREE.AnimationClip("head-pitch", 1, [
        new THREE.QuaternionKeyframeTrack(
          headTrack,
          [0, 1],
          [
            headPitchDelta.x,
            headPitchDelta.y,
            headPitchDelta.z,
            headPitchDelta.w,
            headPitchDelta.x,
            headPitchDelta.y,
            headPitchDelta.z,
            headPitchDelta.w,
          ]
        ),
      ]);
      const headPitchAction = mixer.clipAction(headPitchClip);
      headPitchAction.blendMode = THREE.AdditiveAnimationBlendMode;
      headPitchAction.setLoop(THREE.LoopOnce, 1);
      headPitchAction.clampWhenFinished = true;
      headPitchAction.enabled = true;
      headPitchAction.paused = true;
      headPitchAction.time = 0;
      headPitchAction.setEffectiveWeight(0);
      headPitchAction.play();

      let headBone: import("three").Bone | null = null;
      let leftShoulder: import("three").Bone | null = null;
      let rightShoulder: import("three").Bone | null = null;
      model.traverse((node) => {
        const bone = node as import("three").Bone;
        if (!bone.isBone || !bone.name) return;
        const short = bone.name.replace(/^mixamorig:?/i, "");
        if (short === "Head") headBone = bone;
        if (short === "LeftShoulder") leftShoulder = bone;
        if (short === "RightShoulder") rightShoulder = bone;
      });
      const headEuler = new THREE.Euler();
      const shoulderL = new THREE.Vector3();
      const shoulderR = new THREE.Vector3();
      let squareYaw = 0;

      (Object.keys(actions) as CharClip[]).forEach((k) => {
        const a = actions[k];
        if (!a) return;
        a.enabled = true;
        a.setEffectiveWeight(0);
        a.play();
        if (k === "idle") a.setLoop(THREE.LoopRepeat, Infinity);
        else {
          a.setLoop(THREE.LoopOnce, 1);
          a.clampWhenFinished = true;
        }
      });

      let currentClip: CharClip | null = null;
      let lastWant: CharClip | null = null;
      let wasScrub = false;
      const fadeTo = (name: CharClip, fade = 0.28) => {
        if (name === currentClip) return;
        const next = actions[name];
        if (!next) return;
        const prev = currentClip ? actions[currentClip] : null;
        next.reset();
        next.play();
        if (!prev || prev === next || fade <= 0.001) {
          if (prev && prev !== next) prev.setEffectiveWeight(0);
          next.setEffectiveWeight(1);
        } else {
          next.setEffectiveWeight(1);
          prev.crossFadeTo(next, fade, false);
        }
        currentClip = name;
      };

      const fit = () => {
        const w = window.innerWidth;
        const h = window.innerHeight;
        renderer?.setSize(w, h, false);
        camera.aspect = w / Math.max(h, 1);
        camera.updateProjectionMatrix();
      };

      const camera = new THREE.PerspectiveCamera(28, 1, 0.05, 400);
      fit();
      window.addEventListener("resize", fit);

      let t0 = 0;
      let lastWall = performance.now();
      let playT = 0;
      const fired = { expand: false, cards: false, titles: false, started: false };

      /**
       * DOM veil + character masks.
       * Veil: start crisp (~7% rim), then soft blooms so the ring melts into
       * the cyan backdrop. Character keeps a tighter cut so the figure stays clear.
       */
      const applyDom = (
        hole: number,
        cy: number,
        heroA: number,
        veilA: number,
        helloA: number,
        soft: number,
        helloTilt = 0
      ) => {
        // soft 0 → crisp; soft 1 → wide dissolve into backdrop
        const inner = soft * 0.4;
        const outer = 0.07 + soft * 0.72;
        const veilSolid = Math.max(0, hole * (1 - inner));
        const veilEdge = hole * (1 + outer) + 3 + soft * hole * 0.2;
        // Character: stay relatively sharp so only the wash rim blooms
        const charSolid = hole;
        const charEdge = hole * (1.07 + soft * 0.12) + 3;
        const at = `circle at 50% ${(cy * 100).toFixed(3)}%`;
        const veilMask = `radial-gradient(${at}, transparent 0%, transparent ${veilSolid}px, #000 ${veilEdge}px)`;
        const charMask = `radial-gradient(${at}, #000 0%, #000 ${charSolid}px, transparent ${charEdge}px)`;
        if (washRef.current) {
          washRef.current.style.opacity = String(veilA);
          // Dark stage that already carries a hint of brand blue.
          washRef.current.style.background = "#0e1316";
          washRef.current.style.webkitMaskImage = veilMask;
          washRef.current.style.maskImage = veilMask;
        }
        if (glowRef.current) glowRef.current.style.opacity = "0";
        if (maskRef.current) {
          maskRef.current.style.opacity = String(heroA);
          /**
           * Dissolve feel (official frame check): the fade-out rides a
           * 0→2px blur — edges soften BEFORE disappearing. A pure alpha
           * cut reads as a paper cutout snapping out of existence.
           */
          maskRef.current.style.filter =
            heroA < 0.999 ? `blur(${((1 - heroA) * 2).toFixed(2)}px)` : "";
          maskRef.current.style.webkitMaskImage = charMask;
          maskRef.current.style.maskImage = charMask;
        }
        if (helloRef.current) {
          helloRef.current.style.opacity = String(helloA);
          helloRef.current.style.transform = `rotate(${helloTilt.toFixed(2)}deg)`;
        }
        if (wrapRef.current) {
          wrapRef.current.style.opacity = activeRef.current || scrubRef.current != null ? "1" : "0";
        }
      };

      /**
       * ── Camera system (official screen layout, absolute world coords) ──
       *
       * Front phase (0→3.45) reproduces the officially measured on-screen
       * hair-top / feet trajectories, which pin down two numbers per beat:
       *   viewH = visible world height at the look target, L = world y at
       *   screen center. The camera starts framing the FACE so it fills the
       *   15%vh hole (hair touches the top edge), then cranes down to a
       *   chest-anchored wide framing as the hole reveals the whole body.
       *
       * Orbit phase (3.45→5.4) keeps the QA-verified path — swing behind
       * with a LOW camera looking up at the burst, then rise and return to
       * front high-angle looking down at the small figure — rescaled to the
       * corrected framing. The camera does NOT follow the character sink:
       * officially the head holds while the feet drop, so the sink must be
       * visible relative to a locked-off view.
       */
      const evaluate = (t: number, dt: number, scrubbing: boolean) => {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        // 0.93 = empirical calibration: the feathered mask renders the visible
        // disc ~7% larger than the nominal radius (verified against official)
        const hole = holeRadius(t, vw, vh) * 0.93;
        const holeCy = holeCenterY(t);

        /** Fade as soon as the dolly pull-back begins — no wait for settle. */
        const heroA = sampleLinear(t, [
          [0, 1],
          [FADE_START, 1],
          [5.15, 0.72],
          [5.7, 0.38],
          [FADE_END, 0],
        ]);
        /**
         * Veil wash-out rides the same expand factor (慢进快出) as radius + soft.
         */
        const expandP = holeExpandProgress(t);
        const soft = holeEdgeSoft(t);
        const veilA =
          expandP < 1
            ? 1 - expandP * 0.88
            : clamp01((1 - 0.88) * (1 - (t - HOLE_EXPAND_END) / 0.35));
        const helloA = sample(t, [
          [0, 0],
          [1.2, 0],
          [1.5, 1],
          [3.0, 1],
          [3.35, 0],
        ]);
        const helloTilt = bubbleLift(t);
        // Official: cards pop in by ~3.4s and reach their ring by ~3.8s.
        const cardsP = sampleSpline(t, [
          [0, 0],
          [3.38, 0],
          [3.55, 0.6],
          [3.75, 0.9],
          [3.95, 1],
          [9, 1],
        ]);

        /** Official sink: starts with the burst, deepest ~3.9, recovered by 5.4. */
        const sink = sampleSpline(t, [
          [0, 0],
          [3.1, 0],
          [3.45, bodyH * 0.088],
          [3.85, bodyH * 0.106],
          [4.4, bodyH * 0.07],
          [5.0, bodyH * 0.024],
          [5.4, 0],
          [9, 0],
        ]);
        model.position.y = baseY - sink;

        // Front-phase framing keys — re-fit frame-by-frame against the original
        // reference frames (opening-frames/t_*.jpg, Oct 2026 standard).
        // Pixel-measured original anchors (hair-top / waist):
        //   t1.50 hair .407 waist .811  → viewH 1.29 bodyH (mid-thigh crop)
        //   t1.75 hair .371 upper-thigh crop, NO shoes → viewH 0.94 bodyH
        //   t2.25 hair .396 lower-legs crop           → viewH 1.30 bodyH
        //   t2.75 hair .373 upper-thigh (摊手 start)  → viewH 1.10 bodyH
        //   t3.45 hair ~.33 mid-thigh crop + 贴身卡爆开 → viewH 0.85 bodyH
        // L is pinned by the hair anchor: L = headTopY − (hair−0.5)·viewH,
        // so the character sits LOW in frame (waist/legs clipped by the
        // bottom edge) exactly like the original close framing.
        const v0 = (headTopY - faceY) / 0.0722; // face fills the hole at t=0
        const L0 = faceY + (0.5037 - 0.5) * v0; // face rendered at mask center 0.5037
        const v075 = v0 * 1.034;
        const L075 = headTopY + 0.4213 * v075 - v075 / 2;
        /** hair-anchored key helper: viewH = f × bodyH.
         * Screen frac = 0.5 − (y−L)/viewH, so hair at frac `hair` (above the
         * centre when hair<0.5) pins L BELOW the head top:
         * L = headTopY + (hair − 0.5) · viewH. */
        const vFit = (f: number) => bodyH * f;
        const lFit = (hair: number, f: number) => headTopY + (hair - 0.5) * bodyH * f;
        const v150 = vFit(1.28);
        const L150 = lFit(0.407, 1.28);
        /** Slow push into the burst. Feet stay below the frame. */
        const vB = vFit(1.02);
        const LB = lFit(0.33, 1.02);

        /**
         * Dolly is one multiplicative ease per move, never a reversal.
         * The old orbit keys (2.33→2.1, then 5.2→5.1) stalled and snapped
         * because a spline zeros its tangent at every direction change,
         * and a linear viewH ramp zooms hardest while the figure is large.
         * Landing starts during the orbit (FADE_START, yaw still turning until
         * 4.4) and eases to rest by SETTLE_END — chained into titles without
         * a long static hold.
         */
        const blend = (t0: number, t1: number, a: number, b: number) =>
          a + (b - a) * smoothstep(t0, t1, t);
        const unit = (t0: number, t1: number, x: number) =>
          Math.min(1, Math.max(0, (x - t0) / Math.max(1e-6, t1 - t0)));
        const settle0 = FADE_START;
        /** Final framing stays a mid shot — character readable, not a speck. */
        const VIEW_END_MUL = 3.65;
        const VIEW_MID_MUL = 3.05;
        /**
         * Face→body enlarge used to sit mostly in 1.25→1.5 (a sudden kick
         * around 1.2s). Start it with the circle expand at 0.75 and ease
         * into the same 1.5 framing (v150 / L150) — end state unchanged.
         */
        const viewEarly =
          t <= 0.75
            ? sampleSpline(t, [
                [0, v0],
                [0.75, v075],
              ])
            : easeScale(t, 0.75, 1.5, v075, v150);
        const viewEnd = bodyH * VIEW_END_MUL;
        const orbitU = unit(3.45, 5, settle0);
        const orbitS = orbitU * orbitU * (3 - 2 * orbitU);
        const viewAt = vB * Math.pow((bodyH * VIEW_MID_MUL) / Math.max(1e-6, vB), orbitS);
        /**
         * settle0→SETTLE_END: smoothstep in log-space so velocity eases to 0
         * at the lock (constant coast used to hard-stop and kink UL cards).
         */
        const settleU = smoothstep(settle0, SETTLE_END, t);
        const viewH =
          t <= 1.5
            ? viewEarly
            : t <= 3.45
              ? easeScale(t, 1.5, 3.45, v150, vB)
              : t <= settle0
                ? easeScale(t, 3.45, 5, vB, bodyH * VIEW_MID_MUL)
                : t <= SETTLE_END
                  ? viewAt * Math.pow(viewEnd / Math.max(1e-6, viewAt), settleU)
                  : viewEnd;
        const camEarly =
          t <= 0.75
            ? sampleSpline(t, [
                [0, L0],
                [0.75, L075],
              ])
            : t <= 1.5
              ? blend(0.75, 1.5, L075, L150)
              : sampleSpline(t, [
                  [1.5, L150],
                  [3.45, LB],
                ]);
        const lookEarly = camEarly;
        const lowY = feetY + bodyH * 0.55;
        const endY = feetY + bodyH * 1.05;
        const lowLook = feetY + bodyH * 0.9;
        /** Look a touch higher so upper cards stay in the gaze line. */
        const endLook = feetY + bodyH * 0.82;
        const yAt = lowY;
        const lookAt = lowLook;
        const camY =
          t <= 3.45
            ? camEarly
            : t <= settle0
              ? blend(3.45, settle0, LB, lowY)
              : t <= SETTLE_END
                ? yAt + (endY - yAt) * settleU
                : endY;
        const lookY =
          t <= 3.45
            ? lookEarly
            : t <= settle0
              ? blend(3.45, settle0, LB, lowLook)
              : t <= SETTLE_END
                ? lookAt + (endLook - lookAt) * settleU
                : endLook;
        /** Land on exactly 0 (not 2π) so 回正 is a true frontal camera. */
        const camYaw =
          t <= 3.45 ? 0 : t >= 4.4 ? 0 : smoothstep(3.45, 4.4, t) * Math.PI * 2;
        const fovAt = 32 + (41.2 - 32) * orbitS;
        const fov =
          t <= 1.75
            ? blend(0, 1.75, 28, 30)
            : t <= 3.45
              ? blend(1.75, 3.45, 30, 32)
              : t <= settle0
                ? blend(3.45, 5, 32, 41.2)
                : t <= SETTLE_END
                  ? fovAt + (42 - fovAt) * settleU
                  : 42;
        camera.fov = fov;
        camera.updateProjectionMatrix();

        const dist = viewH / (2 * Math.tan((camera.fov * Math.PI) / 360));
        camera.position.set(Math.sin(camYaw) * dist, camY, Math.cos(camYaw) * dist);
        camera.lookAt(0, lookY, 0);

        /** Meshy clips: idle → wave → present; present last frame holds until fade. */
        const want = characterClipAt(t);
        const switched = want !== lastWant;
        lastWant = want;
        fadeTo(want, scrubbing ? 0 : 0.45);
        const act = actions[want];
        if (act) {
          const local = characterClipLocalTime(t);
          const dur = Math.max(0.001, act.getClip().duration);
          const syncTime = () => {
            act.time = want === "idle" ? local % dur : Math.min(local, dur - 0.001);
          };
          if (scrubbing) {
            // Scrub: frame-exact sync to the master clock.
            syncTime();
            act.paused = true;
            wasScrub = true;
          } else {
            // Playback: mixer advances the clip by itself. Only re-sync on a
            // clip switch or right after a scrub (overwriting act.time every
            // frame fights mixer.update(dt) — rAF jitter then makes the pose
            // micro-jump backwards, which reads as xyz twitching).
            if (switched || wasScrub) syncTime();
            act.paused = want !== "idle" && act.time >= dur - 0.001;
            wasScrub = false;
          }
        }
        /** Ease additive head pitch to −20° by 5.40s, then hold weight=1. */
        const lookW = smoothstep(4.55, 5.4, t);
        headPitchAction.setEffectiveWeight(lookW);
        headPitchAction.time = 0;
        headPitchAction.paused = true;

        mixer.update(scrubbing ? 0 : dt);

        /**
         * Present hold leaves the body slightly yawed. After orbit 回正,
         * equalize Left/Right shoulder depth (world Z toward the camera)
         * so the chest faces the lens square-on.
         */
        const faceW = smoothstep(4.4, 5.2, t);
        let targetSquare = 0;
        let shoulderZ = 0;
        if (faceW > 0.001 && leftShoulder && rightShoulder) {
          model.rotation.y = 0;
          model.updateMatrixWorld(true);
          leftShoulder.getWorldPosition(shoulderL);
          rightShoulder.getWorldPosition(shoulderR);
          /** Camera on +Z; square facing ⇒ shoulders share the same Z. */
          const zDiff = shoulderL.z - shoulderR.z;
          const shoulderSpan = Math.max(0.05, Math.abs(shoulderL.x - shoulderR.x));
          targetSquare = Math.atan2(zDiff, shoulderSpan) * 1.15 * faceW;
        }
        if (scrubbing) squareYaw = targetSquare;
        else {
          const k = 1 - Math.exp(-(dt || 1 / 60) * 6);
          squareYaw += (targetSquare - squareYaw) * k;
        }
        model.rotation.y = squareYaw;
        if (leftShoulder && rightShoulder) {
          model.updateMatrixWorld(true);
          leftShoulder.getWorldPosition(shoulderL);
          rightShoulder.getWorldPosition(shoulderR);
          shoulderZ = shoulderL.z - shoulderR.z;
        }

        if (headBone) {
          headEuler.setFromQuaternion(headBone.quaternion, "XYZ");
          (window as Window & {
            __headLook?: {
              pitchDeg: number;
              track: string;
              boneXDeg: number;
              squareDeg: number;
              shoulderZ: number;
            };
          }).__headLook = {
            pitchDeg: -20 * lookW,
            track: headTrack,
            boneXDeg: (headEuler.x * 180) / Math.PI,
            squareDeg: (squareYaw * 180) / Math.PI,
            shoulderZ,
          };
        }

        applyDom(hole, holeCy, heroA, veilA, helloA, soft, helloTilt);

        const hold =
          want !== "idle" &&
          act != null &&
          characterClipLocalTime(t) >= act.getClip().duration - 0.001;

        callbacks.current.onClock?.({
          t,
          hole,
          heroAlpha: heroA,
          helloAlpha: helloA,
          cards: cardsP,
          cam: {
            t,
            yaw: camYaw,
            camY,
            lookY,
            dist,
            fov: camera.fov,
            viewH,
            charY: feetY + bodyH * 0.5,
            bodyH,
          },
          beat: `${beatLabelAt(t)} · ${want}${hold ? "·hold" : ""}`,
        });

        // debug/verification hook — lets regression scripts read the exact
        // per-frame clock (heroAlpha etc.) while scrubbing (?debug=1)
        (window as Window & { __heroClock?: ClockInfo }).__heroClock = {
          t,
          hole,
          heroAlpha: heroA,
          helloAlpha: helloA,
          cards: cardsP,
          beat: "",
        };

        if (!scrubbing) {
          if (t >= HOLE_EXPAND_END && !fired.expand) {
            fired.expand = true;
            callbacks.current.onExpand?.();
          }
          if (t >= 3.36 && !fired.cards) {
            fired.cards = true;
            callbacks.current.onRevealCards?.();
          }
          if (t >= INTRO_END && !fired.titles) {
            fired.titles = true;
            callbacks.current.onDone?.();
          }
        }

        renderer?.render(scene, camera);
      };

      fadeTo("idle", 0);

      const loop = () => {
        if (dead) return;
        const now = performance.now();
        const dt = Math.min(0.05, (now - lastWall) / 1000);
        lastWall = now;

        const scrub = scrubRef.current;
        if (scrub != null) {
          playT = scrub;
          evaluate(playT, 0, true);
        } else if (activeRef.current) {
          if (!fired.started) {
            fired.started = true;
            t0 = now;
            playT = 0;
          }
          playT = (now - t0) / 1000;
          evaluate(playT, dt, false);
        } else {
          applyDom(0, 0.5, 0, 0, 0, 0);
        }

        raf = requestAnimationFrame(loop);
      };
      loop();

      (canvas as HTMLCanvasElement & { __disposeFit?: () => void }).__disposeFit = () =>
        window.removeEventListener("resize", fit);

      window.__openingBeats = BEATS;
    })().catch((err) => {
      console.warn("3D hero failed", err);
      if (scrubRef.current == null) callbacks.current.onDone?.();
    });

    return () => {
      dead = true;
      cancelAnimationFrame(raf);
      const extra = canvas as HTMLCanvasElement & { __disposeFit?: () => void };
      extra.__disposeFit?.();
      renderer?.dispose();
    };
  }, []);

  return (
    <div
      ref={wrapRef}
      className="pointer-events-none absolute inset-0 z-[4]"
      style={{ opacity: active || scrubT != null ? 1 : "0", transition: "opacity 0.6s ease" }}
      aria-hidden
    >
      <div ref={washRef} className="absolute inset-0 z-[6] bg-[#0e1316]" style={{ opacity: 0 }} />
      <div ref={glowRef} className="absolute inset-0 z-[7]" style={{ opacity: 0 }} />
      <div ref={maskRef} className="absolute inset-0 z-[8]" style={{ opacity: 0 }}>
        <canvas ref={canvasRef} className="block h-full w-full" />
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={helloRef}
        src="/sites/yaojunxd/about/hello-bubble.png"
        alt=""
        draggable={false}
        className="absolute left-[calc(50%-300px)] top-[min(50%,44vh)] z-[9] w-[120px] max-w-none origin-[86%_58%]"
        style={{ opacity: 0 }}
      />
    </div>
  );
});

declare global {
  interface Window {
    __openingBeats?: typeof BEATS;
  }
}