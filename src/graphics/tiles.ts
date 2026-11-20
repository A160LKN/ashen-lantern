/** Процедурный тайлсет 16x16 для всех тем уровней. */
import { mulberry32 } from '../core/rng';
import { createCanvas, Painter } from './canvas';
import { P } from './palette';

export const TID = {
  GRASS: [0, 1, 2],
  TALL: 3,
  FLOWERS: 4,
  PATH: 5,
  FLOOR: [6, 7, 8],
  MOSS: 9,
  BONES: 10,
  ASH: [11, 12, 13],
  COBBLE: 14,
  CARPET: 15,
  SLABS: 16,
  WALL_TOP: { forest: 17, crypt: 18, citadel: 19 },
  WALL_FACE: { forest: 20, crypt: 21, citadel: 22 },
  WATER: [23, 24, 25],
  WATER_EDGE: [26, 27, 28],
  LAVA: [29, 30, 31],
  LAVA_EDGE: [32, 33, 34],
  BRIDGE: 35,
  TREE_BASE: 36,
  TREE_TOP: 37,
  ROCK: 38,
  PILLAR_BASE: 39,
  PILLAR_TOP: 40,
  DEAD_TREE_BASE: 41,
  DEAD_TREE_TOP: 42,
  ASH_BONES: 43,
} as const;

export const TILE_COUNT = 44;
type Draw = (p: Painter, r: () => number) => void;

function speckle(p: Painter, r: () => number, n: number, colors: string[], x0 = 0, y0 = 0, w = 16, h = 16): void {
  for (let i = 0; i < n; i++) p.px(x0 + Math.floor(r() * w), y0 + Math.floor(r() * h), colors[Math.floor(r() * colors.length)]);
}

const grass = (variant: number): Draw => (p, r) => {
  p.rect(0, 0, 16, 16, P.grass1);
  speckle(p, r, 18, [P.grass0, P.grass2]);
  for (let i = 0; i < 5 + variant * 2; i++) {
    const x = Math.floor(r() * 15);
    const y = 2 + Math.floor(r() * 13);
    p.px(x, y, P.grass2);
    p.px(x + 1, y - 1, P.grass3);
  }
  if (variant === 2) speckle(p, r, 3, [P.dirt1]);
};

const tallGrass: Draw = (p, r) => {
  grass(0)(p, r);
  for (let i = 0; i < 9; i++) {
    const x = 1 + Math.floor(r() * 14);
    const y = 5 + Math.floor(r() * 10);
    p.rect(x, y - 3, 1, 4, P.grass3);
    p.px(x, y - 4, P.grass4);
    p.px(x + 1, y, P.grass0);
  }
};

const flowers: Draw = (p, r) => {
  grass(1)(p, r);
  const cols = [P.red2, P.gold2, P.wisp2, P.white];
  for (let i = 0; i < 5; i++) {
    const x = 2 + Math.floor(r() * 12);
    const y = 2 + Math.floor(r() * 12);
    const c = cols[Math.floor(r() * cols.length)];
    p.px(x, y + 1, P.grass3);
    p.px(x, y, c);
    p.px(x - 1, y, c);
    p.px(x + 1, y, c);
    p.px(x, y - 1, c);
    p.px(x, y, P.gold3);
  }
};

const path: Draw = (p, r) => {
  p.rect(0, 0, 16, 16, P.dirt1);
  speckle(p, r, 26, [P.dirt0, P.dirt2]);
  speckle(p, r, 6, [P.dirt3, P.stone2]);
};

const floor = (variant: number): Draw => (p, r) => {
  p.rect(0, 0, 16, 16, P.stone1);
  // Плиты 8x8 со швами.
  p.rect(0, 7, 16, 1, P.stone0);
  p.rect(7, 0, 1, 7, P.stone0);
  p.rect(11, 8, 1, 8, P.stone0);
  p.rect(0, 0, 16, 1, P.stone2);
  p.rect(8, 8, 3, 1, P.stone2);
  speckle(p, r, 12, [P.stone0, P.stone2]);
  if (variant === 1) {
    p.line(2, 10, 6, 14, P.stone0);
    p.line(6, 14, 9, 13, P.stone0);
  }
  if (variant === 2) speckle(p, r, 8, [P.moss0, P.moss1], 0, 8, 10, 8);
};

const moss: Draw = (p, r) => {
  floor(0)(p, r);
  for (let i = 0; i < 4; i++) p.ellipse(3 + Math.floor(r() * 10), 3 + Math.floor(r() * 10), 2, 1, i % 2 ? P.moss0 : P.moss1);
};

const bones = (base: Draw): Draw => (p, r) => {
  base(p, r);
  p.rect(3, 9, 6, 1, P.bone1);
  p.px(2, 8, P.bone2);
  p.px(2, 10, P.bone2);
  p.px(9, 8, P.bone2);
  p.px(9, 10, P.bone2);
  // Череп
  p.rect(10, 4, 4, 3, P.bone1);
  p.rect(11, 7, 2, 1, P.bone0);
  p.px(11, 5, P.black);
  p.px(13, 5, P.black);
};

const ash = (variant: number): Draw => (p, r) => {
  p.rect(0, 0, 16, 16, P.ash1);
  speckle(p, r, 30, [P.ash0, P.ash2]);
  if (variant === 1) speckle(p, r, 3, [P.lava1, P.fire0]);
  if (variant === 2) {
    p.line(1, 3, 6, 6, P.ash0);
    p.line(6, 6, 7, 11, P.ash0);
    p.px(6, 6, P.lava1);
  }
};

const cobble: Draw = (p, r) => {
  p.rect(0, 0, 16, 16, P.ash0);
  const stones = [[1, 1, 6, 4], [8, 0, 7, 5], [0, 6, 5, 5], [6, 6, 6, 4], [13, 6, 3, 5], [1, 12, 7, 4], [9, 11, 6, 5]];
  for (const [x, y, w, h] of stones) {
    p.rect(x, y, w, h, r() > 0.5 ? P.ash2 : P.ash3);
    p.rect(x, y, w, 1, P.stone3);
  }
};

const carpet: Draw = (p, r) => {
  p.rect(0, 0, 16, 16, P.red1);
  p.rect(0, 0, 1, 16, P.gold1);
  p.rect(15, 0, 1, 16, P.gold1);
  p.rect(1, 0, 1, 16, P.red0);
  p.rect(14, 0, 1, 16, P.red0);
  for (let y = 2; y < 16; y += 6) {
    p.px(7, y, P.gold1);
    p.px(8, y, P.gold1);
    p.px(6, y + 1, P.gold0);
    p.px(9, y + 1, P.gold0);
  }
  speckle(p, r, 8, [P.red0]);
};

const slabs: Draw = (p, r) => {
  p.rect(0, 0, 16, 16, P.stone2);
  p.rect(0, 0, 16, 1, P.stone3);
  p.rect(0, 8, 16, 1, P.stone1);
  p.rect(0, 9, 16, 1, P.stone3);
  p.rect(8, 0, 1, 8, P.stone1);
  p.rect(4, 9, 1, 7, P.stone1);
  p.rect(12, 9, 1, 7, P.stone1);
  speckle(p, r, 10, [P.stone1, P.stone3]);
};

const wallTop = (c0: string, c1: string, c2: string): Draw => (p, r) => {
  p.rect(0, 0, 16, 16, c0);
  speckle(p, r, 14, [c1]);
  p.rect(0, 15, 16, 1, c1);
  speckle(p, r, 4, [c2]);
};

const wallFace = (base: string, dark: string, light: string, mortar: string, extra?: (p: Painter, r: () => number) => void): Draw => (p, r) => {
  p.rect(0, 0, 16, 16, base);
  // Верхний край стены.
  p.rect(0, 0, 16, 2, light);
  p.rect(0, 2, 16, 1, dark);
  for (let row = 0; row < 3; row++) {
    const y = 3 + row * 4;
    p.rect(0, y + 3, 16, 1, mortar);
    const off = row % 2 ? 4 : 0;
    for (let x = off; x < 16; x += 8) p.rect(x, y, 1, 3, mortar);
    p.rect(0, y, 16, 1, light);
  }
  speckle(p, r, 10, [dark, light]);
  p.rect(0, 15, 16, 1, P.black);
  extra?.(p, r);
};

const water = (frameIdx: number, edge: boolean): Draw => (p) => {
  p.rect(0, 0, 16, 16, P.water1);
  const r = mulberry32(77);
  for (let i = 0; i < 10; i++) p.px(Math.floor(r() * 16), Math.floor(r() * 16), P.water0);
  for (let i = 0; i < 4; i++) {
    const y = 2 + i * 4;
    const x = (i * 5 + frameIdx * 2) % 16;
    p.rect(x, y, 4, 1, P.water2);
    p.rect((x + 9) % 16, y + 2, 3, 1, P.water2);
    p.px((x + 1) % 16, y, P.water3);
  }
  if (edge) {
    p.rect(0, 0, 16, 2, P.water3);
    for (let x = 0; x < 16; x++) if ((x + frameIdx) % 3 === 0) p.px(x, 2, P.water4);
    p.rect(0, 0, 16, 1, P.water4);
  }
};

const lava = (frameIdx: number, edge: boolean): Draw => (p) => {
  p.rect(0, 0, 16, 16, P.lava1);
  const r = mulberry32(91);
  for (let i = 0; i < 14; i++) p.px(Math.floor(r() * 16), Math.floor(r() * 16), P.lava0);
  for (let i = 0; i < 4; i++) {
    const x = (i * 6 + frameIdx * 3) % 14;
    const y = (i * 4 + frameIdx) % 14 + 1;
    p.ellipse(x + 1, y, 2, 1, P.lava2);
    p.px(x + 1, y, P.lava3);
  }
  if (frameIdx === 1) p.px(9, 9, P.lava4);
  if (edge) {
    p.rect(0, 0, 16, 2, P.ash0);
    p.rect(0, 2, 16, 1, P.lava2);
    for (let x = 0; x < 16; x += 3) p.px(x + frameIdx, 3, P.lava3);
  }
};

const bridge: Draw = (p, r) => {
  p.rect(0, 0, 16, 16, P.water1);
  for (let x = 0; x < 16; x += 4) {
    p.rect(x, 1, 3, 14, P.wood2);
    p.rect(x, 1, 3, 1, P.wood3);
    p.rect(x + 3, 1, 1, 14, P.wood0);
    if (r() > 0.5) p.px(x + 1, 4 + Math.floor(r() * 8), P.wood1);
  }
  p.rect(0, 0, 16, 1, P.wood1);
  p.rect(0, 15, 16, 1, P.wood0);
};

const treeBase: Draw = (p, r) => {
  grass(0)(p, r);
  // Тень и ствол.
  p.ellipse(8, 14, 6, 2, P.grass0);
  p.rect(6, 6, 4, 9, P.wood1);
  p.rect(6, 6, 1, 9, P.wood0);
  p.rect(9, 6, 1, 9, P.wood2);
  p.px(5, 14, P.wood1);
  p.px(10, 14, P.wood1);
  // Нижняя часть кроны.
  p.ellipse(8, 3, 7, 4, P.leaf1);
  p.ellipse(8, 2, 6, 3, P.leaf2);
  p.rect(2, 5, 12, 1, P.leaf0);
  speckle(p, r, 6, [P.leaf3], 2, 0, 12, 4);
};

const treeTop: Draw = (p, r) => {
  p.ellipse(8, 10, 7, 6, P.leaf1);
  p.ellipse(8, 9, 6, 5, P.leaf2);
  p.ellipse(7, 7, 4, 3, P.leaf3);
  p.px(5, 5, P.leaf4);
  p.px(6, 5, P.leaf4);
  p.px(4, 6, P.leaf4);
  speckle(p, r, 8, [P.leaf0, P.leaf3], 2, 6, 12, 9);
};

const deadTreeBase: Draw = (p, r) => {
  ash(0)(p, r);
  p.ellipse(8, 14, 5, 1, P.ash0);
  p.rect(7, 2, 3, 13, P.wood0);
  p.rect(9, 2, 1, 13, P.wood1);
  p.line(7, 6, 3, 2, P.wood0);
  p.line(10, 4, 13, 1, P.wood0);
};

const deadTreeTop: Draw = (p) => {
  p.rect(7, 8, 3, 8, P.wood0);
  p.line(8, 10, 3, 5, P.wood0);
  p.line(9, 9, 14, 4, P.wood0);
  p.line(8, 12, 12, 9, P.wood1);
  p.px(3, 4, P.wood1);
  p.px(14, 3, P.wood1);
};

const rock: Draw = (p, r) => {
  grass(0)(p, r);
  p.ellipse(8, 13, 7, 2, P.grass0);
  p.ellipse(8, 9, 6, 5, P.stone2);
  p.ellipse(7, 8, 4, 3, P.stone3);
  p.px(5, 6, P.stone4);
  p.px(6, 6, P.stone4);
  p.rect(3, 12, 10, 1, P.stone1);
  p.px(10, 10, P.moss1);
  p.px(11, 9, P.moss1);
};

const pillarBase: Draw = (p, r) => {
  floor(0)(p, r);
  p.ellipse(8, 14, 6, 2, P.stone0);
  p.rect(3, 11, 10, 4, P.stone3);
  p.rect(3, 11, 10, 1, P.stone4);
  p.rect(4, 0, 8, 11, P.stone2);
  p.rect(4, 0, 2, 11, P.stone3);
  p.rect(10, 0, 2, 11, P.stone1);
};

const pillarTop: Draw = (p) => {
  p.rect(4, 4, 8, 12, P.stone2);
  p.rect(4, 4, 2, 12, P.stone3);
  p.rect(10, 4, 2, 12, P.stone1);
  p.rect(2, 1, 12, 3, P.stone3);
  p.rect(2, 1, 12, 1, P.stone4);
  p.rect(2, 4, 12, 1, P.stone1);
};

const DRAWERS: Draw[] = [];
DRAWERS[0] = grass(0);
DRAWERS[1] = grass(1);
DRAWERS[2] = grass(2);
DRAWERS[3] = tallGrass;
DRAWERS[4] = flowers;
DRAWERS[5] = path;
DRAWERS[6] = floor(0);
DRAWERS[7] = floor(1);
DRAWERS[8] = floor(2);
DRAWERS[9] = moss;
DRAWERS[10] = bones(floor(0));
DRAWERS[11] = ash(0);
DRAWERS[12] = ash(1);
DRAWERS[13] = ash(2);
DRAWERS[14] = cobble;
DRAWERS[15] = carpet;
DRAWERS[16] = slabs;
DRAWERS[17] = wallTop(P.stone0, P.stone1, P.moss0);
DRAWERS[18] = wallTop(P.black, P.stone0, P.purple1);
DRAWERS[19] = wallTop(P.ash0, P.black, P.lava0);
DRAWERS[20] = wallFace(P.stone2, P.stone1, P.stone3, P.stone0, (p, r) => speckle(p, r, 5, [P.moss1, P.moss0], 0, 8, 16, 7));
DRAWERS[21] = wallFace(P.stone1, P.stone0, P.stone2, P.black, (p, r) => speckle(p, r, 4, [P.purple2], 0, 3, 16, 12));
DRAWERS[22] = wallFace(P.ash2, P.ash1, P.ash3, P.ash0, (p) => {
  p.px(3, 12, P.lava2);
  p.px(4, 12, P.lava1);
});
DRAWERS[23] = water(0, false);
DRAWERS[24] = water(1, false);
DRAWERS[25] = water(2, false);
DRAWERS[26] = water(0, true);
DRAWERS[27] = water(1, true);
DRAWERS[28] = water(2, true);
DRAWERS[29] = lava(0, false);
DRAWERS[30] = lava(1, false);
DRAWERS[31] = lava(2, false);
DRAWERS[32] = lava(0, true);
DRAWERS[33] = lava(1, true);
DRAWERS[34] = lava(2, true);
DRAWERS[35] = bridge;
DRAWERS[36] = treeBase;
DRAWERS[37] = treeTop;
DRAWERS[38] = rock;
DRAWERS[39] = pillarBase;
DRAWERS[40] = pillarTop;
DRAWERS[41] = deadTreeBase;
DRAWERS[42] = deadTreeTop;
DRAWERS[43] = bones(ash(0));

/** Возвращает холст-ленту со всеми тайлами. */
export function buildTileset(): HTMLCanvasElement {
  const { c, ctx } = createCanvas(16 * TILE_COUNT, 16);
  for (let i = 0; i < TILE_COUNT; i++) {
    const p = new Painter(ctx, 16, false, i * 16, 0);
    ctx.save();
    ctx.beginPath();
    ctx.rect(i * 16, 0, 16, 16);
    ctx.clip();
    DRAWERS[i](p, mulberry32(1000 + i * 31));
    ctx.restore();
  }
  return c;
}
