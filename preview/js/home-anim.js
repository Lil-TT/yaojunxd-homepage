import { createHero } from "./home-3d.js";

const cards = gsap.utils.toArray(".card");
const titles = gsap.utils.toArray(".titles a");
const skip = document.querySelector(".skip");
const replay = document.querySelector(".replay");
const stage = document.querySelector(".stage");
const params = new URLSearchParams(location.search);
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const isMobile = matchMedia("(max-width: 900px)").matches;

const fromCenter = (el) => {
  const r = el.getBoundingClientRect();
  return {
    x: innerWidth / 2 - (r.left + r.width / 2),
    y: innerHeight / 2 - (r.top + r.height / 2),
  };
};

const tiltOf = (el) => parseFloat(getComputedStyle(el).getPropertyValue("--tilt")) || 0;

cards.forEach((card) => {
  const origin = fromCenter(card);
  gsap.set(card, {
    x: origin.x,
    y: origin.y,
    scale: 0.22,
    autoAlpha: 0,
    rotation: tiltOf(card),
    filter: "blur(16px)",
  });
});
gsap.set(titles, { autoAlpha: 0, y: 18 });
gsap.set(".hello", { autoAlpha: 0, y: 8 });
gsap.set(".hero-3d", { autoAlpha: 0 });
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
        y: i % 2 ? 9 : -9,
        duration: 2.6 + (i % 3) * 0.35,
        yoyo: true,
        repeat: -1,
        ease: "sine.inOut",
        delay: i * 0.18,
      })
    );
  });
};

const dimOthers = (topic) => {
  cards.forEach((card) => {
    const on = card.dataset.topic === topic;
    card.classList.toggle("is-focus", on);
    gsap.to(card, {
      scale: on ? 1.12 : 0.9,
      filter: on ? "blur(0px)" : "blur(7px)",
      autoAlpha: on ? 1 : 0.38,
      duration: 0.7,
      ease: "power2.out",
      overwrite: "auto",
    });
  });
  titles.forEach((t) => {
    const on = t.dataset.topic === topic;
    t.classList.toggle("is-on", on);
    if (on) t.classList.add("is-shown");
  });
};

const settle = () => {
  cards.forEach((card) => card.classList.remove("is-focus"));
  titles.forEach((t) => {
    t.classList.remove("is-on");
    t.classList.add("is-shown");
  });
  gsap.to(cards, {
    scale: 1,
    filter: "blur(0px)",
    autoAlpha: 1,
    duration: 0.7,
    ease: "power2.out",
    overwrite: "auto",
  });
  gsap.to(titles, { autoAlpha: 1, y: 0, duration: 0.35, overwrite: "auto" });
  stage.classList.add("is-live");
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
  gsap.killTweensOf([cards, titles, ".hero-3d", ".hero-glow", ".hello"]);
  if (hero) {
    hero.pause();
    gsap.set(".hero-3d", { autoAlpha: 0, clipPath: "circle(0px at 50% 46%)" });
    gsap.set(".hero-glow", { autoAlpha: 0 });
  }
  gsap.set(".hello", { autoAlpha: 0 });
  gsap.set(cards, { x: 0, y: 0, scale: 1, autoAlpha: 1, filter: "blur(0px)" });
  gsap.set(titles, { autoAlpha: 1, y: 0 });
  settle();
};

const buildIntro = () => {
  const hold = isMobile ? 0.8 : 2.8;
  const tl = gsap.timeline({
    defaults: { ease: "power3.out" },
    paused: true,
  });

  const hole = { r: 0 };
  const heroEl = document.querySelector(".hero-3d");
  const applyHole = () => {
    heroEl.style.clipPath = `circle(${hole.r}px at 50% 46%)`;
  };
  const circle = isMobile ? 96 : 132;
  const full = Math.hypot(innerWidth, innerHeight) * 0.7;

  tl.addLabel("circle", 0)
    .to(".hero-3d", { autoAlpha: 1, duration: 0.35 }, "circle")
    .to(hole, { r: circle, duration: 0.95, ease: "power2.out", onUpdate: applyHole }, "circle")
    .to(".hero-glow", { autoAlpha: 1, scale: 1, duration: 0.9 }, "circle")
    .add(() => hero && hero.play(), "circle+=0.45")

    .addLabel("hello", 1.45)
    .to(".hello", { autoAlpha: 1, y: 0, duration: 0.4 }, "hello")

    .addLabel("full", 2.2)
    .to(hole, { r: full, duration: 1.35, ease: "power2.inOut", onUpdate: applyHole }, "full")
    .to(".hero-glow", { autoAlpha: 0, scale: 1.8, duration: 0.85 }, "full")
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
        duration: 1.15,
        stagger: 0.07,
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
