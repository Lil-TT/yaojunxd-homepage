const ASSET = "/sites/yaojunxd/about";

export const HOME_URL = "https://www.yaojunxd.com/";
export const CHAT_URL = "https://www.yaojunxd.com/?contact/";

export const OPENING_VIDEO = `${ASSET}/bg/opening.mp4`;
export const CHARACTER_GLB = `${ASSET}/hero/character.glb`;
/** Meshy Mixamo clips: idle → wave → present (last-frame hold). */
export const CHARACTER_CLIPS = {
  idle: `${ASSET}/hero/yaojun-idle.glb`,
  wave: `${ASSET}/hero/yaojun-wave.glb`,
  present: `${ASSET}/hero/yaojun-present.glb`,
} as const;
export const FLUID_VIDEO = `${ASSET}/bg/part1.mp4`;
export const FLUID_WASH = `${ASSET}/bg/part2-talent.png`;
export const FLUID_BLUE = `${ASSET}/bg/bg-blue.png`;
export const LOGO_SRC = `${ASSET}/logo.png`;

export type Topic = "me" | "contest" | "science" | "ip";

export type CardDef = {
  id: string;
  topic: Topic;
  src: string;
  left: number;
  top: number;
  width: number;
  perspective: number;
  restRotate: string;
  enterRotate: string;
  frontRotate: string;
  dimBlur: number;
};

/**
 * Layout / tilt kept from the Doubao opening stage (1440×810).
 * Only static image paths + topics swapped for yaojunxd.
 */
export const cards: CardDef[] = [
  {
    id: "science-a",
    topic: "science",
    src: `${ASSET}/cards/card-science-1.png`,
    left: 35.3,
    top: 12.7,
    width: 22.5,
    perspective: 2680,
    restRotate: "rotateZ(-1deg)",
    enterRotate: "rotateX(8deg) rotateY(-5deg) rotateZ(-3deg)",
    frontRotate: "rotateX(2deg) rotateY(-1deg) rotateZ(0deg)",
    dimBlur: 15,
  },
  {
    id: "contest-a",
    topic: "contest",
    src: `${ASSET}/cards/card-contest-1.jpg`,
    left: 13.0,
    top: 45.2,
    width: 7.0,
    perspective: 2709,
    restRotate: "rotateX(8deg) rotateY(-5deg)",
    enterRotate: "rotateX(14deg) rotateY(-9deg) rotateZ(3deg)",
    frontRotate: "rotateX(4deg) rotateY(-2deg)",
    dimBlur: 15,
  },
  {
    id: "me-a",
    topic: "me",
    src: `${ASSET}/cards/card-me.jpg`,
    left: 16.5,
    top: 71.5,
    width: 14.8,
    perspective: 2903,
    restRotate: "rotateX(45deg) rotateY(32deg) rotateZ(-52deg)",
    enterRotate: "rotateX(52deg) rotateY(36deg) rotateZ(-58deg)",
    frontRotate: "rotateX(28deg) rotateY(20deg) rotateZ(-32deg)",
    dimBlur: 15,
  },
  {
    id: "contest-b",
    topic: "contest",
    src: `${ASSET}/cards/card-contest-2.png`,
    left: 64.2,
    top: 8.5,
    width: 7.1,
    perspective: 2738,
    restRotate: "rotateZ(-55deg)",
    enterRotate: "rotateX(8deg) rotateY(-6deg) rotateZ(-64deg)",
    frontRotate: "rotateX(2deg) rotateY(-2deg) rotateZ(-32deg)",
    dimBlur: 25,
  },
  {
    id: "science-b",
    topic: "science",
    src: `${ASSET}/cards/card-science-2.jpg`,
    left: 18.5,
    top: 14.5,
    width: 9.7,
    perspective: 2099,
    restRotate: "rotateX(17deg) rotateY(22deg) rotateZ(18deg)",
    enterRotate: "rotateX(24deg) rotateY(28deg) rotateZ(24deg)",
    frontRotate: "rotateX(8deg) rotateY(10deg) rotateZ(8deg)",
    dimBlur: 15,
  },
  {
    id: "me-b",
    topic: "me",
    src: `${ASSET}/cards/card-me-2.jpg`,
    left: 77.0,
    top: 30.5,
    width: 5.8,
    perspective: 2704,
    restRotate: "rotateZ(-26deg)",
    enterRotate: "rotateX(8deg) rotateY(-6deg) rotateZ(-34deg)",
    frontRotate: "rotateX(2deg) rotateY(-2deg) rotateZ(-12deg)",
    dimBlur: 30,
  },
  {
    id: "ip",
    topic: "ip",
    src: `${ASSET}/cards/card-ip.jpg`,
    left: 72.5,
    top: 54.0,
    width: 12.5,
    perspective: 1406,
    restRotate: "rotateX(17deg) rotateY(-22deg) rotateZ(3deg)",
    enterRotate: "rotateX(24deg) rotateY(-28deg) rotateZ(8deg)",
    frontRotate: "rotateX(8deg) rotateY(-10deg) rotateZ(2deg)",
    dimBlur: 11,
  },
];

export type TitleDef = {
  id: string;
  topic: Topic;
  src: string;
  dir: 1 | -1;
  restX: number;
  href: string;
};

export const titles: TitleDef[] = [
  { id: "t1", topic: "me", src: `${ASSET}/titles/text-1.png`, dir: 1, restX: 42, href: `${HOME_URL}?me/` },
  { id: "t2", topic: "contest", src: `${ASSET}/titles/text-2.png`, dir: -1, restX: -48, href: `${HOME_URL}?contest/` },
  { id: "t3", topic: "science", src: `${ASSET}/titles/text-3.png`, dir: 1, restX: 46, href: `${HOME_URL}?science/` },
  { id: "t4", topic: "ip", src: `${ASSET}/titles/text-4.png`, dir: -1, restX: -36, href: `${HOME_URL}?ip/` },
];

export type FootDef = {
  id: string;
  parentId: string;
  src: string;
  rank: number;
  left: number;
  top: number;
  width: number;
  rotate: string;
};

/** Depth peeks from Doubao opening; slots remapped onto yaojunxd parent cards. */
export const feet: FootDef[] = [
  {
    id: "me-a-0",
    parentId: "me-a",
    src: `${ASSET}/feet/foot-girl-2.jpg`,
    rank: 0,
    left: 66,
    top: 22,
    width: 40,
    rotate: "rotateX(28deg) rotateY(18deg) rotateZ(-36deg)",
  },
  {
    id: "me-a-1",
    parentId: "me-a",
    src: `${ASSET}/feet/foot-girl-1.jpg`,
    rank: 1,
    left: 96,
    top: 32,
    width: 26,
    rotate: "rotateX(18deg) rotateY(14deg) rotateZ(-22deg)",
  },
  {
    id: "science-b-0",
    parentId: "science-b",
    src: `${ASSET}/feet/foot-red-1.jpg`,
    rank: 0,
    left: 28,
    top: 18,
    width: 78,
    rotate: "rotateX(10deg) rotateY(14deg) rotateZ(12deg)",
  },
  {
    id: "science-b-1",
    parentId: "science-b",
    src: `${ASSET}/feet/foot-red-2.jpg`,
    rank: 1,
    left: 52,
    top: 48,
    width: 52,
    rotate: "rotateX(8deg) rotateY(10deg) rotateZ(16deg)",
  },
  {
    id: "contest-a-0",
    parentId: "contest-a",
    src: `${ASSET}/feet/foot-art-1.jpg`,
    rank: 0,
    left: 38,
    top: 6,
    width: 82,
    rotate: "rotateX(6deg) rotateY(-3deg)",
  },
  {
    id: "contest-a-1",
    parentId: "contest-a",
    src: `${ASSET}/feet/foot-art-2.jpg`,
    rank: 1,
    left: 72,
    top: 12,
    width: 54,
    rotate: "rotateX(4deg) rotateY(-2deg) rotateZ(-3deg)",
  },
  {
    id: "science-a-0",
    parentId: "science-a",
    src: `${ASSET}/feet/foot-text-1.jpg`,
    rank: 0,
    left: 8,
    top: 62,
    width: 84,
    rotate: "rotateX(2deg) rotateZ(-1deg)",
  },
  {
    id: "science-a-1",
    parentId: "science-a",
    src: `${ASSET}/feet/foot-text-1.jpg`,
    rank: 1,
    left: 22,
    top: 98,
    width: 58,
    rotate: "rotateX(3deg) rotateZ(1deg)",
  },
  {
    id: "contest-b-0",
    parentId: "contest-b",
    src: `${ASSET}/feet/foot-boy-1.jpg`,
    rank: 0,
    left: -6,
    top: 40,
    width: 58,
    rotate: "rotateZ(-48deg)",
  },
  {
    id: "contest-b-1",
    parentId: "contest-b",
    src: `${ASSET}/feet/foot-boy-2.png`,
    rank: 1,
    left: -22,
    top: 66,
    width: 36,
    rotate: "rotateX(6deg) rotateZ(-38deg)",
  },
  {
    id: "me-b-0",
    parentId: "me-b",
    src: `${ASSET}/feet/foot-blue-1.jpg`,
    rank: 0,
    left: -18,
    top: 8,
    width: 62,
    rotate: "rotateZ(-22deg)",
  },
  {
    id: "me-b-1",
    parentId: "me-b",
    src: `${ASSET}/feet/foot-blue-2.png`,
    rank: 1,
    left: -38,
    top: 36,
    width: 40,
    rotate: "rotateX(8deg) rotateZ(-18deg)",
  },
  {
    id: "ip-0",
    parentId: "ip",
    src: `${ASSET}/feet/foot-human-2.jpg`,
    rank: 0,
    left: -10,
    top: 22,
    width: 34,
    rotate: "rotateX(10deg) rotateY(-12deg) rotateZ(4deg)",
  },
  {
    id: "ip-1",
    parentId: "ip",
    src: `${ASSET}/feet/foot-human-1.jpg`,
    rank: 1,
    left: -40,
    top: 18,
    width: 24,
    rotate: "rotateX(12deg) rotateY(-16deg) rotateZ(8deg)",
  },
];
