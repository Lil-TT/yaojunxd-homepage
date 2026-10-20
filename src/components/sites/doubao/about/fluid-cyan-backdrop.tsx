"use client";

import { useEffect, useRef } from "react";

/**
 * P0 backdrop — QQ-music / client-ref style: soft cyan–teal field + film grain.
 *
 * Differs from the previous Doubao stack (looping MP4 + PNG mix-blend + dark wash):
 * this is a live WebGL fragment field (no video decode), so color drift and grain
 * stay continuous and cheap to retune.
 */
const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

const FRAG = `
precision mediump float;
varying vec2 vUv;
uniform vec2 uRes;
uniform float uTime;
uniform float uGrain;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = p * 2.02 + vec2(17.1, 9.3);
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = vUv;
  float aspect = uRes.x / max(uRes.y, 1.0);
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0);

  // Stronger clock — waves readable, still calm.
  float t = uTime * 0.55;

  // Domain warp: block edges visibly undulate.
  float warpAmp = 0.28;
  vec2 warp = vec2(
    fbm(p * 1.1 + vec2(t * 0.31, -t * 0.22)),
    fbm(p * 1.1 + vec2(-t * 0.27, t * 0.19) + 3.1)
  );
  vec2 pw = p + (warp - 0.5) * warpAmp;

  // Traveling wave ridges across the field
  float wave =
    0.55 * sin(pw.x * 2.4 + t * 0.85) +
    0.35 * sin(pw.y * 2.1 - t * 0.7) +
    0.25 * sin((pw.x + pw.y) * 1.6 + t * 0.55);
  wave = wave * 0.5 + 0.5;

  // Large continents (low freq) with clear ink ↔ color separation
  float nA = fbm(pw * 0.55 + vec2(t * 0.12, -t * 0.09));
  float nB = fbm(pw * 0.95 + vec2(-t * 0.1, t * 0.14) + vec2(nA * 1.2, 0.0));
  float nC = fbm(pw * 1.6 - vec2(t * 0.08, t * 0.11) + vec2(0.0, nB));
  float field = clamp(nA * 0.5 + nB * 0.32 + nC * 0.18 + (wave - 0.5) * 0.35, 0.0, 1.0);

  // Push contrast: hard-ish softsteps → distinct color blocks
  float maskInk  = 1.0 - smoothstep(0.28, 0.52, field);
  float maskBlue = smoothstep(0.32, 0.58, field) * (1.0 - smoothstep(0.62, 0.88, field));
  float maskTiff = smoothstep(0.55, 0.78, field);

  vec3 cInk  = vec3(0.04, 0.05, 0.06);
  vec3 cBlue = vec3(0.03, 0.32, 0.58);   // brand blue body
  vec3 cTiff = vec3(0.22, 0.72, 0.70);   // Tiffany block
  vec3 cHot  = vec3(0.45, 0.90, 0.86);   // breath peak inside Tiffany

  vec3 col = cInk * maskInk;
  col += cBlue * maskBlue;
  col += mix(cTiff, cHot, 0.35) * maskTiff;
  // Fill residual gaps so we don't get pure voids between masks
  col += cInk * (1.0 - maskInk - maskBlue - maskTiff) * 0.85;
  col = mix(col, cBlue * 0.45, 0.12);

  // Three roaming blobs, out-of-phase — clear spatial motion
  vec2 B1 = vec2(sin(t * 0.33) * 0.62, cos(t * 0.29) * 0.42);
  vec2 B2 = vec2(cos(t * 0.27 + 1.2) * 0.55, sin(t * 0.31 + 0.6) * 0.48);
  vec2 B3 = vec2(sin(t * 0.21 + 2.4) * 0.48, cos(t * 0.35 + 1.8) * 0.38);
  float b1 = exp(-length(pw - B1) * 1.15);
  float b2 = exp(-length(pw - B2) * 1.35);
  float b3 = exp(-length(pw - B3) * 1.55);
  col += cTiff * b1 * 0.55;
  col += cBlue * b2 * 0.5;
  col += cHot  * b3 * 0.35;

  // Breathing: strong amplitude + regional (color blocks inhale separately)
  float breathG = 0.5 + 0.5 * sin(uTime * 0.85);
  float breathT = 0.5 + 0.5 * sin(uTime * 0.65 + field * 3.5);
  float breathB = 0.5 + 0.5 * sin(uTime * 0.55 + 2.1 + wave * 2.0);
  col *= mix(0.72, 1.28, breathG);
  col += cHot  * maskTiff * (0.08 + 0.22 * breathT);
  col += cBlue * maskBlue * (0.06 + 0.18 * breathB);
  col += cTiff * (b1 + b2) * 0.12 * breathG;

  col = clamp(col, vec3(0.03, 0.035, 0.04), vec3(0.55, 0.88, 0.86));

  // Fine film grain
  float g = hash(floor(uv * uRes) + floor(uTime * 24.0));
  col += (g - 0.5) * uGrain;

  float vig = smoothstep(1.5, 0.18, length(p * vec2(0.8, 1.05)));
  col *= mix(0.72, 1.0, vig);

  gl_FragColor = vec4(col, 1.0);
}
`;

function createShader(gl: WebGLRenderingContext, type: number, src: string) {
  const sh = gl.createShader(type);
  if (!sh) throw new Error("shader");
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(sh) ?? "compile failed";
    gl.deleteShader(sh);
    throw new Error(info);
  }
  return sh;
}

export function FluidCyanBackdrop({ className = "" }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl", {
      alpha: false,
      antialias: false,
      powerPreference: "low-power",
    });
    if (!gl) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let prog: WebGLProgram | null = null;
    let buf: WebGLBuffer | null = null;
    let raf = 0;
    let dead = false;

    try {
      const vs = createShader(gl, gl.VERTEX_SHADER, VERT);
      const fs = createShader(gl, gl.FRAGMENT_SHADER, FRAG);
      prog = gl.createProgram();
      if (!prog) throw new Error("program");
      gl.attachShader(prog, vs);
      gl.attachShader(prog, fs);
      gl.linkProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(prog) ?? "link failed");
      }

      buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
        gl.STATIC_DRAW
      );

      const aPos = gl.getAttribLocation(prog, "aPos");
      const uRes = gl.getUniformLocation(prog, "uRes");
      const uTime = gl.getUniformLocation(prog, "uTime");
      const uGrain = gl.getUniformLocation(prog, "uGrain");

      const resize = () => {
        const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
        const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
          gl.viewport(0, 0, w, h);
        }
      };

      const draw = (tSec: number) => {
        if (!prog) return;
        resize();
        gl.useProgram(prog);
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.enableVertexAttribArray(aPos);
        gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
        gl.uniform2f(uRes, canvas.width, canvas.height);
        gl.uniform1f(uTime, reduce ? 0 : tSec);
        gl.uniform1f(uGrain, 0.075);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      };

      if (reduce) {
        draw(0);
      } else {
        const loop = (now: number) => {
          if (dead) return;
          draw(now * 0.001);
          raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
      }

      window.addEventListener("resize", resize);
      return () => {
        dead = true;
        cancelAnimationFrame(raf);
        window.removeEventListener("resize", resize);
        if (buf) gl.deleteBuffer(buf);
        if (prog) gl.deleteProgram(prog);
      };
    } catch {
      // Fallback: static CSS gradient if WebGL is unavailable.
      canvas.style.background =
        "radial-gradient(ellipse at 30% 40%, #2a6b72 0%, #0e181c 55%, #0a1012 100%)";
      return;
    }
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 h-full w-full ${className}`}
      aria-hidden
    />
  );
}
