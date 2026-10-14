"use client";

import { ANIM_END, BEATS } from "./opening-timeline";

type Props = {
  t: number;
  beat: string;
  paused: boolean;
  onScrub: (t: number | null) => void;
  onTogglePause: () => void;
};

export function OpeningDebug({ t, beat, paused, onScrub, onTogglePause }: Props) {
  return (
    <div className="pointer-events-auto fixed bottom-4 left-4 z-30 w-[min(92vw,420px)] rounded-xl bg-black/70 p-3 font-mono text-[11px] text-white shadow-lg backdrop-blur-md">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span>
          t=<b className="text-amber-200">{t.toFixed(2)}</b>s · {beat}
        </span>
        <div className="flex gap-1">
          <button
            type="button"
            className="rounded bg-white/15 px-2 py-0.5 hover:bg-white/25"
            onClick={onTogglePause}
          >
            {paused ? "继续" : "暂停"}
          </button>
          <button
            type="button"
            className="rounded bg-white/15 px-2 py-0.5 hover:bg-white/25"
            onClick={() => onScrub(null)}
          >
            重播
          </button>
        </div>
      </div>
      <input
        type="range"
        min={0}
        max={ANIM_END}
        step={0.05}
        value={Math.min(ANIM_END, Math.max(0, t))}
        onChange={(e) => onScrub(Number(e.target.value))}
        className="mb-2 w-full accent-amber-300"
      />
      <div className="flex flex-wrap gap-1">
        {BEATS.map((b) => (
          <button
            key={`${b.t}-${b.label}`}
            type="button"
            title={b.label}
            className={`rounded px-1.5 py-0.5 ${
              Math.abs(t - b.t) < 0.08 ? "bg-amber-400/80 text-black" : "bg-white/10 hover:bg-white/20"
            }`}
            onClick={() => onScrub(b.t)}
          >
            {b.t.toFixed(2)}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[10px] leading-snug text-white/55">
        Meshy：idle → 挥手 → 摊手；摊手末帧定格至人物淡出。失焦结束 +0.05s 再对下一组。?debug=1
      </p>
    </div>
  );
}
