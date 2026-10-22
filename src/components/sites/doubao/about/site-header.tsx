import { memo, useState } from "react";
import { HOME_URL, LOGO_SRC } from "./content";

const links = [
  { label: "主页", href: HOME_URL },
  { label: "个人简介", href: `${HOME_URL}?me/` },
  { label: "学科竞赛", href: `${HOME_URL}?contest/` },
  { label: "科研经历", href: `${HOME_URL}?science/` },
  { label: "知识产权", href: `${HOME_URL}?ip/` },
  { label: "在线留言", href: `${HOME_URL}?contact/` },
];

/**
 * Memoized — opening animation drives per-frame React state; keep this
 * out of the 60fps reconcile path.
 */
export const SiteHeader = memo(function SiteHeader({
  light,
  opacity = 1,
}: {
  light: boolean;
  opacity?: number;
}) {
  const [open, setOpen] = useState(false);
  const ink = light ? "text-white" : "text-[#f2f2f2]";

  return (
    <>
      <header
        className={`fixed inset-x-0 top-0 z-40 flex h-[58px] items-center justify-between px-6 transition-colors sm:px-8 ${ink}`}
        style={{ opacity }}
      >
        <a href={HOME_URL} className="flex items-center" aria-label="yaojunxd 主页">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={LOGO_SRC}
            alt="yaojunxd"
            className={`h-9 w-auto object-contain sm:h-10 ${light ? "brightness-0 invert" : ""}`}
            draggable={false}
          />
        </a>
        <button
          type="button"
          className="menu-btn flex h-10 w-10 flex-col items-end justify-center gap-[5px]"
          aria-label={open ? "关闭菜单" : "打开菜单"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span className={`block h-[2px] w-7 rounded-full ${light ? "bg-white" : "bg-[#f2f2f2]"}`} />
          <span className={`block h-[2px] w-5 rounded-full ${light ? "bg-white" : "bg-[#f2f2f2]"}`} />
          <span className={`block h-[2px] w-6 rounded-full ${light ? "bg-white" : "bg-[#f2f2f2]"}`} />
        </button>
      </header>

      <nav
        className={`fixed inset-0 z-50 flex flex-col items-center justify-center gap-7 bg-[#171717]/96 text-[22px] text-[#f2f2f2] backdrop-blur-md transition-opacity ${
          open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
        aria-hidden={!open}
      >
        <button
          type="button"
          className="absolute right-6 top-4 text-[28px] leading-none opacity-80 hover:opacity-100"
          aria-label="关闭菜单"
          onClick={() => setOpen(false)}
        >
          ×
        </button>
        {links.map((link) => (
          <a
            key={link.label}
            href={link.href}
            className="tracking-wide opacity-90 hover:opacity-100"
            onClick={() => setOpen(false)}
          >
            {link.label}
          </a>
        ))}
      </nav>
    </>
  );
});
