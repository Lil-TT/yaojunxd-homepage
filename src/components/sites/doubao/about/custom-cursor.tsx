"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * 光标资源对齐 https://why.zero.university（同一 atlas）
 * 原站显示格 56px，本页略小一档，常规 / hover 共用同一格尺寸。
 * 偶发「正常大小」多半是自定义层未挂上、露出系统光标。
 */
const ATLAS = "/sites/yaojunxd/about/cursors/cursors_atlas.webp";
/** 原站 56；本页统一 20px，arrow / pointer 同大 */
const CELL = 23;
const COLS = 3;
const ROWS = 2;
const SHEET_W = COLS * CELL;
const SHEET_H = ROWS * CELL;

const FRAMES = {
  arrow: { col: 0, row: 0 },
  pointer: { col: 1, row: 0 },
} as const;

type Frame = keyof typeof FRAMES;

const CLICKABLE = [
  "a",
  "button",
  "[role='button']",
  "[role='link']",
  "label",
  "input[type='submit']",
  "input[type='button']",
  "select",
  ".cursor-pointer",
].join(",");

function resolveFrame(el: Element | null): Frame {
  if (!el) return "arrow";
  try {
    if (el.closest(CLICKABLE)) return "pointer";
  } catch {
    /* ignore */
  }
  return "arrow";
}

export function CustomCursor() {
  const nest = useRef<HTMLDivElement>(null);
  const frameRef = useRef<Frame>("arrow");
  const [mounted, setMounted] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setMounted(true);
    const coarse =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(hover: none) and (pointer: coarse)").matches;
    if (coarse) return;

    setEnabled(true);
    document.documentElement.classList.add("yao-cursor-hide");

    // 预加载 atlas
    const img = new Image();
    img.src = ATLAS;

    const applyFrame = (frame: Frame) => {
      const el = nest.current;
      if (!el || frame === frameRef.current) return;
      frameRef.current = frame;
      const { col, row } = FRAMES[frame];
      el.style.backgroundPosition = `${-col * CELL}px ${-row * CELL}px`;
    };

    const onMove = (event: PointerEvent) => {
      const el = nest.current;
      if (el) {
        el.style.transform = `translate3d(${event.clientX}px, ${event.clientY}px, 0)`;
      }
      setVisible(true);
      applyFrame(resolveFrame(document.elementFromPoint(event.clientX, event.clientY)));
    };

    const onLeave = () => setVisible(false);

    document.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerdown", onMove, { passive: true });
    document.addEventListener("pointerup", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerdown", onMove);
      document.removeEventListener("pointerup", onMove);
      document.removeEventListener("pointerleave", onLeave);
      document.documentElement.classList.remove("yao-cursor-hide");
    };
  }, []);

  if (!mounted || !enabled) return null;

  return createPortal(
    <div
      ref={nest}
      data-custom-cursor="1"
      aria-hidden
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: CELL,
        height: CELL,
        pointerEvents: "none",
        zIndex: 999999,
        backgroundImage: `url("${ATLAS}")`,
        backgroundSize: `${SHEET_W}px ${SHEET_H}px`,
        backgroundPosition: "0 0",
        backgroundRepeat: "no-repeat",
        imageRendering: "-webkit-optimize-contrast",
        transform: "translate3d(-9999px, -9999px, 0)",
        willChange: "transform",
        opacity: visible ? 1 : 0,
        transition: "opacity 0.15s ease",
      }}
    />,
    document.body,
  );
}
