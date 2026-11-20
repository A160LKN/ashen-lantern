/** Разбор ASCII-карты уровня (чистая логика, без движка). */
import { createGrid, setSolid, type Grid } from './grid';

export const GROUND_CHARS = new Set(['.', ',', ';', 'f', '_', 'x', '=']);
export const SOLID_TERRAIN = new Set(['#', 'T', '~', 'l', 'r', '|']);
export const ENTITY_CHARS = new Set(['P', 'N', 'S', 't', 'L', 'c', 'p', 'D', 'K', '*', '$', 'h', 'o', 's', 'k', 'a', 'B']);
/** Объекты, физически блокирующие клетку. */
export const SOLID_ENTITIES = new Set(['N', 'S', 't', 'L', 'c', 'p', 'D']);
export const ENEMY_CHARS: Record<string, 'slime' | 'skeleton' | 'wisp' | 'boss'> = {
  s: 'slime',
  k: 'skeleton',
  a: 'wisp',
  B: 'boss',
};

export interface ParsedEntity {
  ch: string;
  x: number;
  y: number;
  /** Стабильный идентификатор для сохранения состояния объекта. */
  id: string;
}

export interface ParsedLevel {
  w: number;
  h: number;
  /** Рельеф: под объектами подставлена земля. */
  terrain: string[][];
  entities: ParsedEntity[];
  spawn: { x: number; y: number };
  warnings: string[];
}

export function parseLevel(map: string[], fill: string): ParsedLevel {
  const warnings: string[] = [];
  const h = map.length;
  const w = Math.max(...map.map((r) => r.length));
  map.forEach((row, y) => {
    if (row.length !== w) warnings.push(`row ${y} has length ${row.length}, expected ${w}`);
  });
  const raw: string[][] = map.map((row) => row.padEnd(w, fill).split(''));
  // Края карты всегда непроходимы.
  for (let x = 0; x < w; x++) {
    raw[0][x] = fill;
    raw[h - 1][x] = fill;
  }
  for (let y = 0; y < h; y++) {
    raw[y][0] = fill;
    raw[y][w - 1] = fill;
  }
  const terrain = raw.map((r) => r.slice());
  const entities: ParsedEntity[] = [];
  let spawn = { x: 1, y: 1 };
  let spawnFound = false;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = raw[y][x];
      if (!ENTITY_CHARS.has(ch)) {
        if (!GROUND_CHARS.has(ch) && !SOLID_TERRAIN.has(ch)) {
          warnings.push(`unknown char '${ch}' at ${x},${y}`);
          terrain[y][x] = '.';
        }
        continue;
      }
      terrain[y][x] = groundAround(raw, x, y);
      if (ch === 'P') {
        spawn = { x, y };
        spawnFound = true;
      } else {
        entities.push({ ch, x, y, id: `${ch}@${x},${y}` });
      }
    }
  }
  if (!spawnFound) warnings.push('no spawn point (P)');
  return { w, h, terrain, entities, spawn, warnings };
}

function groundAround(raw: string[][], x: number, y: number): string {
  const counts = new Map<string, number>();
  for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    const c = raw[y + dy]?.[x + dx];
    if (c && GROUND_CHARS.has(c) && c !== '=') counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  let best = '.';
  let bestN = 0;
  for (const [c, n] of counts) {
    if (n > bestN || (n === bestN && c === '.')) {
      best = c;
      bestN = n;
    }
  }
  return best;
}

/**
 * Сетка проходимости. `blocked` решает, блокирует ли объект клетку
 * (например, уже открытая дверь — нет).
 */
export function buildGrid(level: ParsedLevel, blocked: (e: ParsedEntity) => boolean): Grid {
  const g = createGrid(level.w, level.h);
  for (let y = 0; y < level.h; y++) {
    for (let x = 0; x < level.w; x++) {
      if (SOLID_TERRAIN.has(level.terrain[y][x])) setSolid(g, x, y, true);
    }
  }
  for (const e of level.entities) {
    if (SOLID_ENTITIES.has(e.ch) && blocked(e)) setSolid(g, e.x, e.y, true);
  }
  return g;
}
