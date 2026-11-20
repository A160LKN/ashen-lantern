/** Чистая логика выпадения и притягивания предметов (без движка — покрыта тестами). */
import { isSolid, type Grid } from './grid';

export const MAGNET_RADIUS = 42;

/**
 * Точка, куда «отлетает» выпавший предмет. Цель выбирается случайно в радиусе разлёта,
 * но только в проходимой клетке — иначе предмет мог оказаться внутри стены и стать недоступным.
 * Если подходящей клетки не нашлось — предмет остаётся в точке выпадения.
 */
export function findDropPosition(
  grid: Grid, x: number, y: number, rnd: () => number = Math.random, spreadX = 14, spreadY = 10, tile = 16, attempts = 10,
): { x: number; y: number } {
  for (let i = 0; i < attempts; i++) {
    const tx = x + (rnd() * 2 - 1) * spreadX;
    const ty = y + (rnd() * 2 - 1) * spreadY;
    if (!isSolid(grid, Math.floor(tx / tile), Math.floor(ty / tile))) return { x: tx, y: ty };
  }
  return { x, y };
}

/**
 * Скорость монеты под действием «магнита». Вне радиуса — ноль:
 * раньше монета сохраняла скорость и улетала за пределы карты, если игрок отходил.
 */
export function magnetVelocity(px: number, py: number, cx: number, cy: number, radius = MAGNET_RADIUS): { vx: number; vy: number } {
  const d = Math.hypot(px - cx, py - cy);
  if (d >= radius || d === 0) return { vx: 0, vy: 0 };
  const a = Math.atan2(py - cy, px - cx);
  const sp = 70 + (radius - d) * 4;
  return { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp };
}
