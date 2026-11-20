/**
 * Процедурные спрайты персонажей. Каждый лист: 3 направления (вниз, вверх, вбок) × 10 кадров:
 * 0–1 ожидание, 2–5 ходьба, 6–8 атака, 9 получение урона.
 */
import { frame, type Painter } from './canvas';
import { P } from './palette';

export const SHEET_DIRS = ['down', 'up', 'side'] as const;
export type SheetDir = (typeof SHEET_DIRS)[number];
export const FRAMES_PER_DIR = 10;
export const ANIM_FRAMES = { idle: [0, 1], walk: [2, 3, 4, 5], attack: [6, 7, 8], hurt: [9] } as const;

interface Pose {
  bob: number;
  legA: number;
  legB: number;
  stride: number;
  arm: number;
  atk: 0 | 1 | 2 | 3;
  hurt: boolean;
}

const POSES: Pose[] = [
  { bob: 0, legA: 0, legB: 0, stride: 0, arm: 0, atk: 0, hurt: false },
  { bob: 1, legA: 0, legB: 0, stride: 0, arm: 0, atk: 0, hurt: false },
  { bob: 0, legA: 1, legB: 0, stride: 1, arm: 1, atk: 0, hurt: false },
  { bob: 1, legA: 0, legB: 0, stride: 0, arm: 0, atk: 0, hurt: false },
  { bob: 0, legA: 0, legB: 1, stride: -1, arm: -1, atk: 0, hurt: false },
  { bob: 1, legA: 0, legB: 0, stride: 0, arm: 0, atk: 0, hurt: false },
  { bob: 0, legA: 0, legB: 0, stride: 0, arm: 0, atk: 1, hurt: false },
  { bob: 1, legA: 0, legB: 1, stride: 1, arm: 0, atk: 2, hurt: false },
  { bob: 0, legA: 0, legB: 0, stride: 0, arm: 0, atk: 3, hurt: false },
  { bob: 0, legA: 0, legB: 0, stride: 0, arm: 0, atk: 0, hurt: true },
];

export interface Look {
  hood: string;
  hoodDark: string;
  skin: string | null;
  skinDark: string;
  eye: string;
  body: string;
  bodyDark: string;
  trim: string;
  legs: string;
  boots: string;
  weapon: string | null;
  item: 'lantern' | 'staff' | null;
  skull?: boolean;
  beard?: string;
  helmet?: boolean;
  ribs?: boolean;
}

export const LOOKS: Record<string, Look> = {
  player: {
    hood: P.cloak2, hoodDark: P.cloak1, skin: P.skin, skinDark: P.skin2, eye: P.black,
    body: P.cloak1, bodyDark: P.cloak0, trim: P.gold1, legs: P.purple1, boots: P.wood1,
    weapon: P.steel2, item: 'lantern',
  },
  skeleton: {
    hood: P.bone1, hoodDark: P.bone0, skin: null, skinDark: P.bone0, eye: '#ff4a3a',
    body: P.bone0, bodyDark: '#5e594b', trim: P.red1, legs: P.bone1, boots: P.bone0,
    weapon: '#9a7a56', item: null, skull: true, ribs: true,
  },
  keeper: {
    hood: P.robe1, hoodDark: P.robe0, skin: P.skin, skinDark: P.skin2, eye: P.black,
    body: P.robe1, bodyDark: P.robe0, trim: P.gold0, legs: P.robe0, boots: P.wood0,
    weapon: null, item: 'staff', beard: P.bone2,
  },
  ghost: {
    hood: P.wisp2, hoodDark: P.wisp1, skin: '#c8d8ff', skinDark: P.wisp2, eye: P.wisp0,
    body: P.wisp1, bodyDark: P.wisp0, trim: P.wisp3, legs: P.wisp0, boots: P.wisp0,
    weapon: null, item: 'staff', beard: P.wisp3,
  },
  knight: {
    hood: P.steel1, hoodDark: P.steel0, skin: P.skin, skinDark: P.skin2, eye: P.black,
    body: P.steel0, bodyDark: P.stone1, trim: P.red1, legs: P.stone1, boots: P.wood0,
    weapon: P.steel2, item: null, helmet: true,
  },
};

function drawItem(p: Painter, look: Look, x: number, y: number): void {
  if (look.item === 'lantern') {
    p.px(x + 1, y, P.stone0);
    p.rect(x, y + 1, 3, 3, P.stone1);
    p.px(x + 1, y + 2, P.fire3);
    p.px(x + 1, y + 1, P.fire2);
  } else if (look.item === 'staff') {
    p.rect(x + 1, y - 8, 1, 12, P.wood2);
    p.rect(x, y - 9, 3, 2, P.gold1);
    p.px(x + 1, y - 9, P.wisp3);
  }
}

function drawHead(p: Painter, look: Look, dir: SheetDir, b: number, hx: number): void {
  if (look.skull) {
    const fy = 1 + b;
    p.rect(4 + hx, fy + 1, 8, 5, look.hood);
    p.rect(5 + hx, fy, 6, 1, look.hood);
    p.rect(5 + hx, fy + 6, 6, 1, look.hoodDark);
    if (dir === 'down') {
      p.rect(5 + hx, fy + 3, 2, 2, P.black);
      p.rect(9 + hx, fy + 3, 2, 2, P.black);
      p.px(6 + hx, fy + 4, look.eye);
      p.px(9 + hx, fy + 4, look.eye);
      for (let i = 0; i < 4; i += 2) p.px(6 + i + hx, fy + 6, P.black);
    } else if (dir === 'side') {
      p.rect(9 + hx, fy + 3, 2, 2, P.black);
      p.px(10 + hx, fy + 4, look.eye);
      p.rect(9 + hx, fy + 6, 3, 1, look.hoodDark);
    } else {
      p.rect(7 + hx, fy + 2, 2, 3, look.hoodDark);
    }
    return;
  }
  const y = 1 + b;
  if (look.helmet) {
    p.rect(4 + hx, y + 1, 8, 6, look.hood);
    p.rect(5 + hx, y, 6, 1, look.hood);
    p.rect(4 + hx, y + 1, 8, 1, P.steel2);
    p.rect(7 + hx, y - 1, 2, 2, look.trim);
  } else {
    p.rect(5 + hx, y, 6, 1, look.hoodDark);
    p.rect(4 + hx, y + 1, 8, 5, look.hood);
    p.rect(4 + hx, y + 5, 8, 1, look.hoodDark);
  }
  if (dir === 'down' && look.skin) {
    p.rect(5 + hx, y + 2, 6, 3, look.skin);
    p.rect(5 + hx, y + 4, 6, 1, look.skinDark);
    p.px(6 + hx, y + 3, look.eye);
    p.px(9 + hx, y + 3, look.eye);
    if (look.helmet) p.rect(5 + hx, y + 2, 6, 1, P.steel0);
    if (look.beard) {
      p.rect(5 + hx, y + 4, 6, 3, look.beard);
      p.px(7 + hx, y + 7, look.beard);
      p.px(8 + hx, y + 7, look.beard);
    }
  } else if (dir === 'side' && look.skin) {
    p.rect(8 + hx, y + 2, 3, 3, look.skin);
    p.px(10 + hx, y + 4, look.skinDark);
    p.px(9 + hx, y + 3, look.eye);
    p.rect(7 + hx, y + 2, 1, 4, look.hoodDark);
    if (look.beard) p.rect(8 + hx, y + 4, 3, 3, look.beard);
  } else if (dir === 'up') {
    p.rect(7 + hx, y + 1, 2, 4, look.hoodDark);
  }
}

function drawBody(p: Painter, look: Look, dir: SheetDir, pose: Pose): void {
  const b = pose.bob;
  const hx = pose.hurt ? (dir === 'side' ? -1 : 1) : 0;
  // Ноги
  if (dir === 'side') {
    p.rect(6 - pose.stride, 12, 2, 3, look.boots);
    p.rect(6 - pose.stride, 12, 2, 2, look.legs);
    p.rect(8 + pose.stride, 12, 2, 3, look.boots);
    p.rect(8 + pose.stride, 12, 2, 2, look.legs);
  } else {
    p.rect(5, 12 - pose.legA, 2, 3, look.legs);
    p.rect(5, 14 - pose.legA, 2, 1, look.boots);
    p.rect(9, 12 - pose.legB, 2, 3, look.legs);
    p.rect(9, 14 - pose.legB, 2, 1, look.boots);
  }
  // Корпус
  const bx = dir === 'side' ? 5 : 4;
  const bw = dir === 'side' ? 6 : 8;
  p.rect(bx, 7 + b, bw, 5, look.body);
  p.rect(bx, 7 + b, 1, 5, look.bodyDark);
  if (dir !== 'side') p.rect(bx + bw - 1, 7 + b, 1, 5, look.bodyDark);
  p.rect(bx, 11 + b, bw, 1, look.bodyDark);
  p.rect(bx + 1, 10 + b, bw - 2, 1, look.trim);
  if (look.ribs && dir !== 'up') {
    p.rect(bx + 1, 8 + b, bw - 2, 1, P.black);
    p.px(bx + Math.floor(bw / 2), 9 + b, P.black);
  }
  if (dir === 'down' && look.item === 'lantern') p.px(8, 8 + b, P.gold2);
  // Руки и оружие
  const strikeColor = look.weapon;
  if (dir === 'down') {
    p.rect(3, 8 + b + (pose.arm > 0 ? 1 : 0), 1, 3, look.bodyDark);
    if (look.item) drawItem(p, look, 1, 10 + b);
    if (pose.atk === 1) {
      p.rect(12, 5 + b, 1, 3, look.bodyDark);
      if (strikeColor) p.rect(12, 1 + b, 1, 4, strikeColor);
    } else if (pose.atk === 2) {
      p.rect(12, 9 + b, 1, 4, look.bodyDark);
      if (strikeColor) p.rect(12, 13 + b, 1, 3, strikeColor);
    } else {
      p.rect(12, 8 + b + (pose.arm < 0 ? 1 : 0), 1, 3, look.bodyDark);
      if (strikeColor && pose.atk === 3) p.rect(13, 10 + b, 2, 1, strikeColor);
    }
  } else if (dir === 'up') {
    p.rect(12, 8 + b + (pose.arm > 0 ? 1 : 0), 1, 3, look.bodyDark);
    if (look.item) drawItem(p, look, 12, 10 + b);
    if (pose.atk === 1) {
      p.rect(3, 9 + b, 1, 3, look.bodyDark);
    } else if (pose.atk === 2) {
      p.rect(3, 4 + b, 1, 4, look.bodyDark);
      if (strikeColor) p.rect(3, 0 + b, 1, 4, strikeColor);
    } else {
      p.rect(3, 8 + b + (pose.arm < 0 ? 1 : 0), 1, 3, look.bodyDark);
    }
  } else {
    if (look.item) drawItem(p, look, 3, 10 + b);
    if (pose.atk === 1) {
      p.rect(4, 7 + b, 2, 2, look.bodyDark);
      if (strikeColor) p.rect(2, 4 + b, 1, 4, strikeColor);
    } else if (pose.atk === 2) {
      p.rect(10, 8 + b, 3, 2, look.bodyDark);
      if (strikeColor) p.rect(13, 8 + b, 3, 1, strikeColor);
    } else {
      p.rect(7 + pose.arm, 8 + b, 2, 3, look.bodyDark);
    }
  }
  drawHead(p, look, dir, b, hx);
}

export function buildHumanoidFrames(look: Look): HTMLCanvasElement[] {
  const frames: HTMLCanvasElement[] = [];
  for (const dir of SHEET_DIRS) {
    for (const pose of POSES) frames.push(frame(16, 16, (p) => drawBody(p, look, dir, pose), P.outline));
  }
  return frames;
}

// ---------------- Слизень ----------------
interface BlobPose {
  w: number;
  h: number;
  lift: number;
  hurt?: boolean;
}

const SLIME_POSES: BlobPose[] = [
  { w: 5, h: 7, lift: 0 }, { w: 6, h: 6, lift: 0 },
  { w: 5, h: 8, lift: 0 }, { w: 6, h: 7, lift: 1 }, { w: 7, h: 5, lift: 0 }, { w: 6, h: 6, lift: 0 },
  { w: 7, h: 4, lift: 0 }, { w: 4, h: 9, lift: 3 }, { w: 7, h: 5, lift: 0 },
  { w: 6, h: 6, lift: 0, hurt: true },
];

function drawSlime(p: Painter, s: BlobPose, dir: SheetDir): void {
  const base = 14 - s.lift;
  const cy = base - Math.floor(s.h / 2);
  p.ellipse(8, cy, s.w, Math.ceil(s.h / 2), P.slime1);
  p.rect(8 - s.w, base, s.w * 2 + 1, 1, P.slime0);
  p.rect(8 - s.w + 1, base - 1, s.w * 2 - 1, 1, P.slime0);
  p.px(8 - s.w + 2, cy - Math.floor(s.h / 2) + 1, P.slime3);
  p.px(8 - s.w + 3, cy - Math.floor(s.h / 2) + 1, P.slime2);
  p.px(8 - s.w + 2, cy - Math.floor(s.h / 2) + 2, P.slime2);
  if (dir !== 'up') {
    const ey = cy - 1;
    const exOff = dir === 'side' ? 2 : 0;
    if (s.hurt) {
      p.px(6 + exOff, ey, P.white);
      p.px(10 + exOff, ey, P.white);
    } else {
      p.rect(6 + exOff, ey, 1, 2, P.black);
      p.rect(10 + exOff, ey, 1, 2, P.black);
      p.px(8 + exOff, ey + 2, P.slime0);
    }
  }
}

export function buildSlimeFrames(): HTMLCanvasElement[] {
  const frames: HTMLCanvasElement[] = [];
  for (const dir of SHEET_DIRS) for (const s of SLIME_POSES) frames.push(frame(16, 16, (p) => drawSlime(p, s, dir), P.outline));
  return frames;
}

// ---------------- Пепельный дух ----------------
function drawWisp(p: Painter, i: number, dir: SheetDir): void {
  const float = [0, -1, 0, 1, -1, 0, 1, 0, 0, 0][i];
  const atk = i >= 6 && i <= 8;
  const r = atk && i === 7 ? 5 : 4;
  const cy = 7 + float;
  // Хвост-пламя
  const flick = i % 2;
  p.rect(6, cy + 2, 4, 3, P.wisp1);
  p.rect(7 - flick, cy + 5, 3, 2, P.wisp1);
  p.px(8 + flick, cy + 7, P.wisp0);
  p.circle(8, cy, r, P.wisp1);
  p.circle(8, cy - 1, r - 1, P.wisp2);
  p.circle(7, cy - 2, Math.max(1, r - 3), P.wisp3);
  if (dir !== 'up') {
    const ex = dir === 'side' ? 1 : 0;
    const eyeC = i === 9 ? P.white : P.wisp0;
    p.rect(6 + ex, cy, 1, 2, eyeC);
    p.rect(9 + ex, cy, 1, 2, eyeC);
  }
  if (atk) {
    p.px(2, cy - 2, P.wisp3);
    p.px(13, cy - 3, P.wisp3);
    p.px(3, cy + 2, P.wisp2);
    p.px(12, cy + 1, P.wisp2);
  }
}

export function buildWispFrames(): HTMLCanvasElement[] {
  const frames: HTMLCanvasElement[] = [];
  for (const dir of SHEET_DIRS) for (let i = 0; i < FRAMES_PER_DIR; i++) frames.push(frame(16, 16, (p) => drawWisp(p, i, dir), P.wisp0));
  return frames;
}

// ---------------- Пепельный Король (32x32) ----------------
export const BOSS_FRAMES = { idle: [0, 1], walk: [2, 3, 4, 5], windup: [6, 7], slam: [8], cast: [9, 10], hurt: [11] } as const;

function drawBoss(p: Painter, i: number): void {
  const bob = [0, 1, 0, 1, 0, 1, 0, 0, 1, 0, 0, 0][i];
  const stride = [0, 0, 1, 0, -1, 0, 0, 0, 0, 0, 0, 0][i];
  const sword: 'down' | 'up' | 'front' | 'cast' = i === 6 || i === 7 ? 'up' : i === 8 ? 'front' : i === 9 || i === 10 ? 'cast' : 'down';
  const b = bob;
  // Плащ
  p.rect(7, 11 + b, 18, 17, P.red0);
  p.rect(8, 12 + b, 16, 15, P.red1);
  for (let x = 8; x < 24; x += 3) p.px(x, 27 + b, P.red0);
  // Ноги
  p.rect(11 - stride, 23, 4, 6, P.ash1);
  p.rect(17 + stride, 23, 4, 6, P.ash1);
  p.rect(10 - stride, 28, 5, 3, P.stone0);
  p.rect(17 + stride, 28, 5, 3, P.stone0);
  // Корпус-доспех
  p.rect(10, 12 + b, 12, 12, P.stone1);
  p.rect(11, 13 + b, 10, 6, P.stone2);
  p.rect(11, 13 + b, 10, 1, P.stone3);
  p.rect(15, 15 + b, 2, 2, i === 7 || i === 10 ? P.fire4 : P.fire2);
  p.px(14, 16 + b, P.fire1);
  p.px(17, 16 + b, P.fire1);
  p.rect(10, 21 + b, 12, 2, P.gold0);
  p.rect(15, 21 + b, 2, 2, P.gold2);
  // Наплечники
  p.rect(6, 11 + b, 6, 4, P.stone2);
  p.rect(20, 11 + b, 6, 4, P.stone2);
  p.rect(6, 11 + b, 6, 1, P.stone4);
  p.rect(20, 11 + b, 6, 1, P.stone4);
  p.px(6, 10 + b, P.stone3);
  p.px(25, 10 + b, P.stone3);
  // Руки
  if (sword === 'cast') {
    p.rect(5, 6 + b, 3, 8, P.stone1);
    p.rect(24, 6 + b, 3, 8, P.stone1);
    p.circle(6, 4 + b, i === 10 ? 3 : 2, P.fire2);
    p.circle(25, 4 + b, i === 10 ? 3 : 2, P.fire2);
    p.px(6, 4 + b, P.fire4);
    p.px(25, 4 + b, P.fire4);
  } else if (sword === 'up') {
    p.rect(8, 8 + b, 3, 6, P.stone1);
    p.rect(21, 8 + b, 3, 6, P.stone1);
    p.rect(14, 2 + b, 4, 2, P.gold0);
    p.rect(15, 0, 2, 4 + b, P.steel1);
    p.rect(23, 0, 3, 12, P.steel1);
    p.rect(23, 0, 1, 12, P.steel2);
    p.px(24, 3, P.fire3);
    p.px(24, 7, P.fire2);
    p.rect(21, 12, 7, 1, P.gold1);
  } else if (sword === 'front') {
    p.rect(8, 15 + b, 3, 7, P.stone1);
    p.rect(21, 15 + b, 3, 7, P.stone1);
    p.rect(12, 23, 8, 1, P.gold1);
    p.rect(14, 24, 4, 8, P.steel1);
    p.rect(14, 24, 1, 8, P.steel2);
    p.px(16, 27, P.fire3);
    p.px(15, 30, P.fire2);
  } else {
    p.rect(7, 15 + b, 3, 7, P.stone1);
    p.rect(22, 15 + b, 3, 7, P.stone1);
    p.rect(22, 21 + b, 6, 1, P.gold1);
    p.rect(24, 22 + b, 2, 9 - b, P.steel1);
    p.rect(24, 22 + b, 1, 9 - b, P.steel2);
    p.px(25, 25 + b, P.fire2);
  }
  // Голова и корона
  p.rect(11, 4 + b, 10, 8, P.stone0);
  p.rect(11, 4 + b, 10, 1, P.stone2);
  p.rect(12, 7 + b, 8, 2, P.black);
  const eye = i === 7 || i === 10 || i === 11 ? P.fire4 : P.fire3;
  p.px(13, 7 + b, eye);
  p.px(14, 7 + b, P.fire2);
  p.px(18, 7 + b, eye);
  p.px(17, 7 + b, P.fire2);
  p.rect(11, 2 + b, 10, 2, P.gold1);
  p.rect(11, 2 + b, 10, 1, P.gold2);
  for (const x of [11, 14, 17, 20]) p.px(x, 1 + b, P.gold2);
  p.px(14, 0 + b, P.gold3);
  p.px(17, 0 + b, P.gold3);
  p.rect(15, 2 + b, 2, 1, P.red2);
}

export function buildBossFrames(): HTMLCanvasElement[] {
  const frames: HTMLCanvasElement[] = [];
  for (let i = 0; i < 12; i++) frames.push(frame(32, 32, (p) => drawBoss(p, i), P.outline));
  return frames;
}
