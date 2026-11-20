import type Phaser from 'phaser';
import type { SheetDir } from '../graphics/characters';

export type Dir = 'down' | 'up' | 'left' | 'right';

export function sheetDir(d: Dir): SheetDir {
  return d === 'left' || d === 'right' ? 'side' : d;
}

export function vecToDir(x: number, y: number, fallback: Dir = 'down'): Dir {
  if (Math.abs(x) < 0.001 && Math.abs(y) < 0.001) return fallback;
  if (Math.abs(x) > Math.abs(y)) return x > 0 ? 'right' : 'left';
  return y > 0 ? 'down' : 'up';
}

export function dirToAngle(d: Dir): number {
  return d === 'right' ? 0 : d === 'down' ? Math.PI / 2 : d === 'left' ? Math.PI : -Math.PI / 2;
}

export function bodyCenter(s: Phaser.Physics.Arcade.Sprite): { x: number; y: number } {
  const b = s.body as Phaser.Physics.Arcade.Body;
  return { x: b.center.x, y: b.center.y };
}
