import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../src/core/rng';
import { createGrid, isSolid, setSolid } from '../src/world/grid';
import { findDropPosition, MAGNET_RADIUS, magnetVelocity } from '../src/world/loot';

describe('выпадение предметов (регрессия BUG-007)', () => {
  it('предмет, выпавший у стены, никогда не оказывается внутри стены', () => {
    const g = createGrid(5, 5);
    for (let y = 0; y < 5; y++) setSolid(g, 0, y, true); // стена слева
    const rnd = mulberry32(1);
    for (let i = 0; i < 2000; i++) {
      const p = findDropPosition(g, 24, 40, rnd);
      expect(isSolid(g, Math.floor(p.x / 16), Math.floor(p.y / 16))).toBe(false);
    }
  });

  it('разлёт сохраняется, если вокруг свободно', () => {
    const g = createGrid(10, 10);
    const rnd = mulberry32(2);
    const xs = Array.from({ length: 200 }, () => findDropPosition(g, 80, 80, rnd).x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(20);
    for (const x of xs) expect(Math.abs(x - 80)).toBeLessThanOrEqual(14);
  });

  it('в полностью замурованном месте предмет остаётся в точке выпадения', () => {
    const g = createGrid(3, 3);
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) if (!(x === 1 && y === 1)) setSolid(g, x, y, true);
    expect(findDropPosition(g, 24, 24, () => 0)).toEqual({ x: 24, y: 24 });
  });
});

describe('магнит монет (регрессия BUG-006)', () => {
  it('вне радиуса скорость нулевая — монета не улетает', () => {
    expect(magnetVelocity(0, 0, MAGNET_RADIUS + 1, 0)).toEqual({ vx: 0, vy: 0 });
    expect(magnetVelocity(0, 0, 500, 300)).toEqual({ vx: 0, vy: 0 });
  });

  it('в радиусе монета летит к игроку и тем быстрее, чем ближе', () => {
    const far = magnetVelocity(0, 0, 40, 0);
    const near = magnetVelocity(0, 0, 10, 0);
    expect(far.vx).toBeLessThan(0);
    expect(Math.abs(near.vx)).toBeGreaterThan(Math.abs(far.vx));
    expect(Math.abs(far.vy)).toBeLessThan(1e-9);
  });

  it('монета ровно на игроке не получает NaN', () => {
    expect(magnetVelocity(5, 5, 5, 5)).toEqual({ vx: 0, vy: 0 });
  });
});
