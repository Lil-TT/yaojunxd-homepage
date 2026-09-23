import { createHero } from "./home-3d.js";

const cards = gsap.utils.toArray(".card");
const titles = gsap.utils.toArray(".titles a");
const skip = document.querySelector(".skip");
const replay = document.querySelector(".replay");
const stage = document.querySelector(".stage");
const menuBtn = document.querySelector(".menu-btn");
const menuPanel = document.querySelector(".menu-panel");
const menuClose = document.querySelector(".menu-close");
const params = new URLSearchParams(location.search);
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const isMobile = matchMedia("(max-width: 900px)").matches;

const deg = (el, name) => parseFloat(getComputedStyle(el).getPropertyValue(name)) || 0;

const fromCenter = (el) => {
  const r = el.getBoundingClientRect();
  return {
    x: innerWidth / 2 - (r.left + r.width / 2),
    y: innerHeight / 2 - (r.top + r.height / 2),
  };
};

cards.forEach((card) => {
  const origin = fromCenter(card);
  const float = card.querySelector(".card-float");
  gsap.set(card, {
    x: origin.x,
    y: origin.y,
    scale: 0.22,
    autoAlpha: 0,
    filter: "blur(12px)",
  });
  gsap.set(float, {
    rotationX: deg(card, "--rx") + 38,
    rotationY: deg(card, "--ry") + (deg(card, "--ry") >= 0 ? 42 : -42),
    rotation: deg(card, "--tilt"),
    z: -120,
  });
});
gsap.set(titles, { autoAlpha: 0, y: 18 });
gsap.set(".hello", { autoAlpha: 0, y: 8 });
gsap.set(".hero-3d", { autoAlpha: 0 });
gsap.set(".hero-wash", { autoAlpha: 0 });
gsap.set(".hero-halo", { autoAlpha: 0 });
gsap.set(".hero-glow", { autoAlpha: 0, scale: 0.7 });

const idleTweens = [];
const stopIdle = () => {
  idleTweens.splice(0).forEach((t) => t.kill());
};

const startIdle = () => {
  stopIdle();
  cards.forEach((card, i) => {
    idleTweens.push(
      gsap.to(card.querySelector(".card-float"), {
        y: i % 2 ? 8 : -8,
        duration: 2.8 + (i % 3) * 0.3,
        yoyo: true,
        repeat: -1,
        ease: "sine.inOut",
        delay: i * 0.16,
      })
    );
  });
};

const dimOthers = (topic) => {
  cards.forEach((card) => {
    const on = card.dataset.topic === topic;
    card.classList.toggle("is-focus", on);
    gsap.to(card, {
      scale: on ? 1.1 : 0.92,
      filter: on ? "blur(0px)" : "blur(6px)",
      autoAlpha: on ? 1 : 0.4,
      duration: 0.55,
      ease: "power2.out",
      overwrite: "auto",
    });
  });
  titles.forEach((t) => {
    const on = t.dataset.topic === topic;
    t.classList.toggle("is-on", on);
    t.classList.toggle("is-hot", on && stage.classList.contains("is-live"));
    if (on) t.classList.add("is-shown");
  });
};

const clearFocus = () => {
  cards.forEach((card) => card.classList.remove("is-focus"));
  titles.forEach((t) => {
    t.classList.remove("is-on", "is-hot");
    t.classList.add("is-shown");
  });
  gsap.to(cards, {
    scale: 1,
    filter: "blur(0px)",
    autoAlpha: 1,
    duration: 0.55,
    ease: "power2.out",
    overwrite: "auto",
  });
};

const settle = () => {
  clearFocus();
  gsap.to(titles, { autoAlpha: 1, y: 0, duration: 0.35, overwrite: "auto" });
  stage.classList.add("is-live");
  document.body.classList.add("is-settled");
  skip.hidden = true;
  replay.hidden = false;
  startIdle();
};

const revealTitle = (topic) => {
  const title = titles.find((t) => t.dataset.topic === topic);
  if (title) {
    title.classList.add("is-shown");
    gsap.to(title, { autoAlpha: 1, y: 0, duration: 0.45, ease: "power2.out" });
  }
  dimOthers(topic);
};

let hero;
let intro;

const landNow = () => {
  if (intro) intro.pause();
  gsap.killTweensOf([cards, titles, ".hero-3d", ".hero-wash", ".hero-halo", ".hero-glow", ".hello"]);
  cards.forEach((card) => {
    const float = card.querySelector(".card-float");
    gsap.set(card, { x: 0, y: 0, scale: 1, autoAlpha: 1, filter: "blur(0px)" });
    gsap.set(float, {
      rotationX: deg(card, "--rx"),
      rotationY: deg(card, "--ry"),
      rotation: deg(card, "--tilt"),
      z: 0,
    });
  });
  if (hero) {
    hero.pause();
    gsap.set(".hero-3d", { autoAlpha: 0, clipPath: "circle(0px at 50% 46%)" });
    gsap.set(".hero-wash", { autoAlpha: 0, clipPath: "circle(0px at 50% 46%)" });
    gsap.set(".hero-halo", { autoAlpha: 0 });
    gsap.set(".hero-glow", { autoAlpha: 0 });
  }
  gsap.set(".hello", { autoAlpha: 0 });
  gsap.set(titles, { autoAlpha: 1, y: 0 });
  settle();
};

const setMenu = (open) => {
  document.body.classList.toggle("menu-open", open);
  menuBtn.setAttribute("aria-expanded", String(open));
  menuPanel.setAttribute("aria-hidden", String(!open));
};

const buildIntro = () => {
  const hold = isMobile ? 0.8 : 2.8;
  const tl = gsap.timeline({
    defaults: { ease: "power3.out" },
    paused: true,
  });

  const hole = { r: 0 };
  const applyHole = () => {
    document.querySelector(".hero-3d").style.clipPath = `circle(${hole.r}px at 50% 46%)`;
    document.querySelector(".hero-wash").style.clipPath = `circle(${hole.r * 1.22}px at 50% 46%)`;
    const halo = document.querySelector(".hero-halo");
    const d = hole.r * 2;
    halo.style.width = `${d}px`;
    halo.style.height = `${d}px`;
    halo.style.margin = `${-hole.r}px 0 0 ${-hole.r}px`;
  };
  const circle = isMobile ? 102 : 148;
  const full = Math.hypot(innerWidth, innerHeight) * 0.7;

  tl.addLabel("circle", 0)
    .to(".hero-3d", { autoAlpha: 1, duration: 0.35 }, "circle")
    .to(".hero-wash", { autoAlpha: 1, duration: 0.5 }, "circle")
    .to(".hero-halo", { autoAlpha: 1, duration: 0.5 }, "circle")
    .to(hole, { r: circle, duration: 0.95, ease: "power2.out", onUpdate: applyHole }, "circle")
    .to(".hero-glow", { autoAlpha: 1, scale: 1, duration: 0.9 }, "circle")
    .add(() => hero && hero.play(), "circle+=0.45")

    .addLabel("hello", 1.45)
    .to(".hello", { autoAlpha: 1, y: 0, duration: 0.4 }, "hello")

    .addLabel("full", 2.2)
    .to(hole, { r: full, duration: 1.35, ease: "power2.inOut", onUpdate: applyHole }, "full")
    .to(".hero-glow", { autoAlpha: 0, scale: 1.8, duration: 0.85 }, "full")
    .to(".hero-wash", { autoAlpha: 0, duration: 0.9 }, "full+=0.35")
    .to(".hero-halo", { autoAlpha: 0, duration: 0.7 }, "full+=0.25")
    .add(() => {
      if (!hero) return;
      gsap.to(hero.cam, {
        dist: hero.maxDim * 2.15,
        y: hero.size.y * 0.1,
        lookY: hero.size.y * 0.02,
        lookX: 0,
        x: hero.maxDim * 0.06,
        duration: 1.25,
        ease: "power2.inOut",
      });
    }, "full")

    .addLabel("orbit", 3.55)
    .to(".hello", { autoAlpha: 0, y: -8, duration: 0.35 }, "orbit+=0.6")
    .to(
      cards,
      {
        x: 0,
        y: 0,
        scale: 1,
        autoAlpha: 1,
        filter: "blur(0px)",
        duration: 1.2,
        stagger: 0.08,
        ease: "power3.out",
      },
      "orbit"
    )
    .to(
      ".card-float",
      {
        z: 0,
        rotationX: (i) => deg(cards[i], "--rx"),
        rotationY: (i) => deg(cards[i], "--ry"),
        duration: 1.25,
        stagger: 0.08,
        ease: "power3.out",
      },
      "orbit"
    )
    .add(() => {
      if (!hero) return;
      gsap.to(hero.cam, {
        dist: hero.maxDim * 3.35,
        y: hero.size.y * 0.28,
        lookY: hero.size.y * 0.04,
        lookX: 0,
        x: 0,
        duration: 1.5,
        ease: "power2.inOut",
      });
    }, "orbit")
    .to({}, { duration: hold })

    .addLabel("away")
    .to(".hero-3d", { autoAlpha: 0, duration: 0.7 }, "away")
    .add(() => hero && hero.hold(), "away")

    .addLabel("t1")
    .add(() => revealTitle("me"))
    .to({}, { duration: 1.15 })
    .add(() => revealTitle("contest"))
    .to({}, { duration: 1.15 })
    .add(() => revealTitle("science"))
    .to({}, { duration: 1.15 })
    .add(() => revealTitle("ip"))
    .to({}, { duration: 1.05 })
    .add(settle);

  return tl;
};

const boot = async () => {
  const pulse = gsap.to(".hero-glow", {
    autoAlpha: 0.45,
    scale: 1,
    duration: 0.9,
    yoyo: true,
    repeat: -1,
    ease: "sine.inOut",
  });
  try {
    hero = await createHero(document.querySelector("#hero-canvas"));
  } catch (err) {
    console.warn("3D hero failed", err);
    hero = null;
  }
  pulse.kill();
  gsap.set(".hero-glow", { autoAlpha: 0, scale: 0.7 });

  intro = buildIntro();
  window.__intro = intro;
  window.__hero = hero;

  skip.addEventListener("click", landNow);
  replay.addEventListener("click", () => location.reload());
  menuBtn.addEventListener("click", () => setMenu(!document.body.classList.contains("menu-open")));
  menuClose.addEventListener("click", () => setMenu(false));
  menuPanel.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => setMenu(false)));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") setMenu(false);
  });

  titles.forEach((title) => {
    title.addEventListener("mouseenter", () => {
      if (!stage.classList.contains("is-live")) return;
      dimOthers(title.dataset.topic);
    });
  });
  document.querySelector(".titles").addEventListener("mouseleave", () => {
    if (!stage.classList.contains("is-live")) return;
    clearFocus();
  });

  cards.forEach((card) => {
    card.addEventListener("click", () => {
      if (!stage.classList.contains("is-live")) return;
      if (card.dataset.href) location.href = card.dataset.href;
    });
  });

  if (reduce || params.has("skip")) {
    landNow();
    return;
  }

  intro.play(0);
};

boot();
