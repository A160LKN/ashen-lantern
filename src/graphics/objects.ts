/** Процедурные спрайты объектов, предметов, эффектов и иконок интерфейса. */
import { createCanvas, frame, type Painter } from './canvas';
import { P } from './palette';

export const chestFrames = (): HTMLCanvasElement[] =>
  [false, true].map((open) =>
    frame(16, 16, (p) => {
      p.rect(2, 7, 12, 8, P.wood1);
      p.rect(2, 7, 12, 1, P.wood2);
      p.rect(2, 11, 12, 1, P.wood0);
      p.rect(2, 7, 1, 8, P.gold0);
      p.rect(13, 7, 1, 8, P.gold0);
      if (open) {
        p.rect(3, 8, 10, 3, P.black);
        p.rect(4, 9, 8, 2, P.gold1);
        p.px(6, 9, P.gold3);
        p.px(9, 9, P.gold2);
        p.rect(2, 2, 12, 5, P.wood1);
        p.rect(2, 2, 12, 1, P.wood2);
        p.rect(3, 6, 10, 1, P.wood0);
      } else {
        p.rect(2, 4, 12, 4, P.wood2);
        p.rect(2, 4, 12, 1, P.wood3);
        p.rect(2, 4, 1, 4, P.gold0);
        p.rect(13, 4, 1, 4, P.gold0);
        p.rect(7, 7, 2, 3, P.gold2);
        p.px(7, 9, P.black);
      }
    }, P.outline),
  );

export const doorFrame = (): HTMLCanvasElement =>
  frame(16, 16, (p) => {
    p.rect(1, 0, 14, 16, P.stone3);
    p.rect(2, 1, 12, 15, P.wood1);
    for (let x = 2; x < 14; x += 3) p.rect(x, 1, 1, 15, P.wood0);
    p.rect(2, 4, 12, 2, P.steel0);
    p.rect(2, 11, 12, 2, P.steel0);
    p.rect(2, 4, 12, 1, P.steel1);
    p.rect(2, 11, 12, 1, P.steel1);
    p.rect(6, 7, 4, 4, P.gold1);
    p.rect(7, 8, 2, 2, P.black);
    p.px(7, 10, P.black);
  });

export const brazierFrames = (): HTMLCanvasElement[] =>
  [0, 1, 2, 3].map((i) =>
    frame(16, 16, (p) => {
      p.rect(7, 10, 2, 4, P.stone1);
      p.rect(5, 14, 6, 2, P.stone1);
      p.rect(3, 7, 10, 3, P.stone2);
      p.rect(3, 7, 10, 1, P.stone3);
      p.rect(4, 10, 8, 1, P.stone0);
      const h = [5, 6, 5, 7][i];
      const sway = [0, 1, 0, -1][i];
      p.ellipse(8, 7 - Math.floor(h / 2), 3, Math.floor(h / 2), P.fire1);
      p.ellipse(8 + sway, 6 - Math.floor(h / 3), 2, Math.floor(h / 3), P.fire2);
      p.rect(8 + sway, 7 - h, 1, 2, P.fire2);
      p.px(8, 6, P.fire4);
      p.px(7 - sway, 5, P.fire3);
    }, P.outline),
  );

export const beaconFrames = (): HTMLCanvasElement[] =>
  [0, 1, 2, 3].map((i) =>
    frame(16, 32, (p) => {
      p.rect(2, 26, 12, 6, P.stone2);
      p.rect(2, 26, 12, 1, P.stone4);
      p.rect(4, 12, 8, 14, P.stone2);
      p.rect(4, 12, 2, 14, P.stone3);
      p.rect(10, 12, 2, 14, P.stone1);
      p.rect(5, 16, 6, 1, P.gold0);
      p.rect(5, 21, 6, 1, P.gold0);
      p.rect(1, 9, 14, 3, P.stone3);
      p.rect(1, 9, 14, 1, P.stone4);
      p.rect(2, 12, 12, 1, P.stone1);
      if (i === 0) {
        p.rect(4, 7, 8, 2, P.ash1);
        p.px(6, 7, P.fire0);
        p.px(9, 8, P.fire0);
      } else {
        const sway = [0, 1, -1][i - 1];
        p.ellipse(8, 5, 5, 4, P.fire1);
        p.ellipse(8 + sway, 4, 3, 3, P.fire2);
        p.ellipse(8, 5, 2, 2, P.fire3);
        p.rect(8 - sway, 0, 1, 2, P.fire2);
        p.px(8, 5, P.fire4);
        p.px(5, 2 + (i % 2), P.fire3);
        p.px(11, 1 + (i % 2), P.fire2);
      }
    }, P.outline),
  );

export const shrineFrames = (): HTMLCanvasElement[] =>
  [0, 1].map((i) =>
    frame(16, 16, (p) => {
      p.rect(1, 12, 14, 4, P.stone2);
      p.rect(1, 12, 14, 1, P.stone4);
      p.rect(3, 3, 10, 9, P.stone2);
      p.rect(3, 3, 10, 1, P.stone4);
      p.rect(3, 3, 1, 9, P.stone3);
      p.rect(12, 3, 1, 9, P.stone1);
      const rune = i ? P.cloak3 : P.cloak2;
      p.rect(7, 5, 2, 5, rune);
      p.rect(5, 6, 6, 1, rune);
      p.px(6, 9, rune);
      p.px(9, 9, rune);
      if (i) {
        p.px(8, 1, P.cloak3);
        p.px(4, 2, P.cloak2);
        p.px(12, 1, P.cloak2);
      }
    }, P.outline),
  );

export const potFrame = (): HTMLCanvasElement =>
  frame(16, 16, (p) => {
    p.ellipse(8, 11, 5, 4, P.dirt2);
    p.ellipse(7, 10, 3, 2, P.dirt3);
    p.rect(5, 5, 6, 2, P.dirt1);
    p.rect(6, 4, 4, 1, P.dirt2);
    p.rect(3, 11, 10, 1, P.dirt1);
    p.rect(4, 14, 8, 1, P.dirt0);
  }, P.outline);

export const coinFrames = (): HTMLCanvasElement[] =>
  [3, 2, 1, 2].map((w, i) =>
    frame(8, 8, (p) => {
      p.ellipse(4, 4, w, 3, P.gold1);
      if (w > 1) p.ellipse(4, 4, w - 1, 2, P.gold2);
      if (i === 0) p.px(3, 3, P.gold3);
    }, P.gold0),
  );

/** Предметы на земле: 0 зелье, 1 масло, 2 ключ, 3–5 осколок (анимация), 6 горсть монет. */
export const itemFrames = (): HTMLCanvasElement[] => {
  const potion = frame(16, 16, (p) => {
    p.rect(7, 4, 2, 2, P.wood2);
    p.rect(6, 6, 4, 1, P.gray2);
    p.ellipse(8, 10, 4, 3, P.red1);
    p.ellipse(8, 10, 3, 2, P.red2);
    p.px(6, 9, P.red3);
    p.px(7, 8, P.white);
  }, P.outline);
  const oil = frame(16, 16, (p) => {
    p.rect(6, 3, 4, 2, P.stone1);
    p.rect(5, 5, 6, 8, P.gold0);
    p.rect(6, 6, 4, 6, P.gold1);
    p.rect(6, 6, 1, 6, P.gold2);
    p.rect(5, 9, 6, 1, P.wood1);
    p.px(9, 7, P.fire3);
  }, P.outline);
  const key = frame(16, 16, (p) => {
    p.ring(5, 7, 3, P.gold2);
    p.px(5, 7, P.black);
    p.rect(8, 7, 6, 1, P.gold2);
    p.rect(12, 8, 1, 2, P.gold1);
    p.rect(10, 8, 1, 2, P.gold1);
    p.px(4, 5, P.gold3);
  }, P.gold0);
  const shard = (i: number) =>
    frame(16, 16, (p) => {
      const y = [0, -1, 0][i];
      p.rect(7, 3 + y, 2, 10, P.fire1);
      p.rect(6, 5 + y, 4, 6, P.fire1);
      p.rect(7, 5 + y, 2, 6, P.fire2);
      p.px(7, 4 + y, P.fire3);
      p.px(8, 6 + y, P.fire4);
      p.px(7, 8 + y, P.fire3);
      if (i === 1) {
        p.px(4, 4, P.fire3);
        p.px(11, 10, P.fire3);
      }
    }, P.fire0);
  const pile = frame(16, 16, (p) => {
    for (const [x, y] of [[5, 11], [9, 11], [7, 9], [11, 12], [4, 13], [8, 13]]) {
      p.ellipse(x, y, 2, 1, P.gold1);
      p.px(x, y, P.gold3);
    }
  }, P.gold0);
  return [potion, oil, key, shard(0), shard(1), shard(2), pile];
};

export const orbFrames = (): HTMLCanvasElement[] =>
  [0, 1].map((i) => frame(8, 8, (p) => {
    p.circle(4, 4, 3, P.wisp1);
    p.circle(4, 4, 2, i ? P.wisp3 : P.wisp2);
    p.px(4, 4, P.white);
  }));

export const fireballFrames = (): HTMLCanvasElement[] =>
  [0, 1].map((i) => frame(10, 10, (p) => {
    p.circle(5, 5, 4, P.fire1);
    p.circle(5, 5, 3, P.fire2);
    p.circle(5 - i, 5, 1, P.fire4);
  }));

/** Дуга удара, направлена вправо. */
export const slashFrames = (): HTMLCanvasElement[] =>
  [0, 1, 2].map((i) => frame(24, 24, (p) => {
    const r = 9;
    const span = [0.9, 1.4, 1.5][i];
    const start = -span / 2 + (i === 2 ? 0.4 : 0);
    for (let a = start; a < start + span; a += 0.05) {
      for (let t = 0; t < (i === 2 ? 1 : 3); t++) {
        const rr = r - t;
        const c = t === 0 ? P.white : t === 1 ? P.steel2 : P.steel1;
        p.px(Math.round(12 + Math.cos(a) * rr), Math.round(12 + Math.sin(a) * rr), c);
      }
    }
  }));

export const puffFrames = (): HTMLCanvasElement[] =>
  [2, 4, 5, 5].map((r, i) => frame(12, 12, (p) => {
    const c = [P.gray3, P.gray2, P.gray1, P.gray0][i];
    p.circle(6, 6, r, c);
    if (i < 3) p.circle(5, 5, Math.max(1, r - 2), P.white);
  }));

export const simpleFrame = (w: number, h: number, draw: (p: Painter) => void): HTMLCanvasElement => frame(w, h, draw);

export const shadowFrame = (w: number, h: number): HTMLCanvasElement => {
  const { c, ctx } = createCanvas(w, h);
  ctx.fillStyle = 'rgba(0,0,0,0.38)';
  for (let y = 0; y < h; y++) {
    const t = 1 - Math.pow((y - (h - 1) / 2) / (h / 2), 2);
    const half = Math.round((w / 2) * Math.sqrt(Math.max(0, t)));
    ctx.fillRect(Math.round(w / 2 - half), y, half * 2, 1);
  }
  return c;
};

/** Ступенчатый радиальный градиент — «пиксельный» свет для маски темноты. */
export const lightStamp = (size = 128): HTMLCanvasElement => {
  const { c, ctx } = createCanvas(size, size);
  const bands: [number, number][] = [[1.0, 0.18], [0.86, 0.42], [0.72, 0.72], [0.56, 1]];
  const r0 = size / 2;
  for (const [rf, a] of bands) {
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    // Каждое внутреннее кольцо заменяет пиксели внешнего (clearRect + fillRect).
    const R = r0 * rf;
    for (let y = -R; y <= R; y++) {
      const half = Math.floor(Math.sqrt(R * R - y * y));
      ctx.clearRect(Math.floor(r0 - half), Math.floor(r0 + y), half * 2, 1);
      ctx.fillRect(Math.floor(r0 - half), Math.floor(r0 + y), half * 2, 1);
    }
  }
  return c;
};

export const glowStamp = (size = 64): HTMLCanvasElement => {
  const { c, ctx } = createCanvas(size, size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return c;
};

/** Иконки интерфейса 10x10. */
export const ICON = {
  heart: 0, coin: 1, potion: 2, key: 3, shard: 4, oil: 5, xp: 6, sword: 7, boot: 8, lantern: 9,
  bolt: 10, skull: 11, chest: 12, star: 13, lock: 14, check: 15, scroll: 16,
} as const;

export const iconFrames = (): HTMLCanvasElement[] => {
  const f = (draw: (p: Painter) => void, outline: string = P.outline) => frame(10, 10, draw, outline);
  return [
    f((p) => { p.rect(1, 2, 3, 3, P.red2); p.rect(5, 2, 3, 3, P.red2); p.rect(1, 4, 7, 2, P.red2); p.rect(2, 6, 5, 1, P.red1); p.rect(3, 7, 3, 1, P.red1); p.px(4, 8, P.red1); p.px(2, 3, P.red3); }),
    f((p) => { p.ellipse(4, 4, 3, 3, P.gold1); p.ellipse(4, 4, 2, 2, P.gold2); p.px(3, 3, P.gold3); }),
    f((p) => { p.rect(4, 1, 2, 2, P.wood2); p.ellipse(4, 6, 3, 2, P.red2); p.px(3, 5, P.red3); }),
    f((p) => { p.ring(3, 3, 2, P.gold2); p.rect(5, 3, 4, 1, P.gold2); p.rect(7, 4, 1, 2, P.gold1); }),
    f((p) => { p.rect(4, 1, 2, 8, P.fire1); p.rect(3, 3, 4, 4, P.fire2); p.px(4, 2, P.fire4); p.px(5, 4, P.fire3); }),
    f((p) => { p.rect(3, 1, 3, 1, P.stone1); p.rect(2, 2, 5, 6, P.gold1); p.rect(3, 3, 1, 4, P.gold2); p.px(5, 4, P.fire3); }),
    f((p) => { p.rect(4, 0, 1, 9, P.wisp3); p.rect(0, 4, 9, 1, P.wisp3); p.rect(3, 3, 3, 3, P.wisp2); p.px(4, 4, P.white); }),
    f((p) => { p.line(1, 8, 7, 2, P.steel2); p.line(2, 8, 8, 2, P.steel1); p.rect(1, 6, 3, 1, P.gold1); p.px(1, 8, P.wood2); }),
    f((p) => { p.rect(2, 1, 3, 6, P.wood2); p.rect(2, 6, 6, 2, P.wood2); p.rect(2, 7, 6, 1, P.wood0); p.px(2, 1, P.wood3); }),
    f((p) => { p.rect(4, 0, 2, 1, P.stone2); p.rect(2, 1, 6, 1, P.stone2); p.rect(2, 2, 6, 5, P.stone1); p.rect(3, 3, 4, 3, P.fire2); p.px(4, 4, P.fire4); p.rect(2, 7, 6, 1, P.stone2); }),
    f((p) => { p.line(6, 0, 2, 5, P.slime3); p.line(2, 5, 7, 4, P.slime3); p.line(7, 4, 3, 9, P.slime3); p.px(5, 2, P.slime2); }),
    f((p) => { p.rect(2, 1, 6, 5, P.bone2); p.rect(3, 6, 4, 2, P.bone1); p.px(3, 3, P.black); p.px(6, 3, P.black); p.px(4, 7, P.black); }),
    f((p) => { p.rect(1, 3, 8, 5, P.wood2); p.rect(1, 2, 8, 2, P.wood3); p.rect(4, 4, 2, 2, P.gold2); }),
    f((p) => { p.px(4, 0, P.gold2); p.rect(3, 2, 3, 2, P.gold2); p.rect(0, 3, 9, 1, P.gold2); p.rect(1, 4, 7, 1, P.gold2); p.rect(2, 5, 5, 2, P.gold1); p.px(1, 7, P.gold1); p.px(7, 7, P.gold1); p.px(4, 3, P.gold3); }),
    f((p) => { p.ring(4, 3, 2, P.gray2); p.rect(1, 4, 7, 5, P.gray2); p.rect(4, 6, 1, 2, P.black); }),
    f((p) => { p.line(1, 5, 3, 7, P.slime3); p.line(3, 7, 8, 2, P.slime3); }),
    f((p) => { p.rect(1, 1, 7, 8, P.bone1); p.rect(1, 1, 7, 1, P.bone2); p.rect(2, 3, 5, 1, P.dirt1); p.rect(2, 5, 5, 1, P.dirt1); p.rect(2, 7, 3, 1, P.dirt1); }),
  ];
};

export const keyPromptFrame = (letter: 'E'): HTMLCanvasElement =>
  frame(9, 10, (p) => {
    p.rect(0, 0, 9, 9, P.ui2);
    p.rect(0, 8, 9, 2, P.ui0);
    p.rect(0, 0, 9, 1, P.ui4);
    if (letter === 'E') {
      p.rect(3, 2, 1, 5, P.white);
      p.rect(3, 2, 3, 1, P.white);
      p.rect(3, 4, 3, 1, P.white);
      p.rect(3, 6, 3, 1, P.white);
    }
  }, P.outline);

export const alertFrame = (): HTMLCanvasElement =>
  frame(5, 10, (p) => {
    p.rect(1, 0, 3, 6, P.gold2);
    p.rect(1, 7, 3, 2, P.gold2);
    p.px(2, 0, P.gold3);
  }, P.red0);
