/** Строит тайловую карту Phaser из разобранного ASCII-уровня. */
import Phaser from 'phaser';
import { DEPTH, TILE } from '../config';
import { hash2 } from '../core/rng';
import type { Theme } from '../data/levels';
import { TID } from '../graphics/tiles';
import type { ParsedLevel } from './levelParser';

export interface BuiltLevel {
  map: Phaser.Tilemaps.Tilemap;
  ground: Phaser.Tilemaps.TilemapLayer;
  solid: Phaser.Tilemaps.TilemapLayer;
  above: Phaser.Tilemaps.TilemapLayer;
  animated: { tile: Phaser.Tilemaps.Tile; frames: number[] }[];
  lavaCells: { x: number; y: number }[];
}

function groundTile(ch: string, theme: Theme, x: number, y: number): number {
  const r = hash2(x, y, 7);
  switch (ch) {
    case ';': return theme === 'forest' ? TID.TALL : TID.MOSS;
    case 'f': return TID.FLOWERS;
    case ',': return theme === 'forest' ? TID.PATH : theme === 'crypt' ? TID.MOSS : TID.COBBLE;
    case '_': return theme === 'citadel' ? TID.CARPET : TID.SLABS;
    case 'x': return theme === 'citadel' ? TID.ASH_BONES : TID.BONES;
    case '=': return TID.BRIDGE;
    default:
      if (theme === 'forest') return r < 0.7 ? TID.GRASS[0] : r < 0.9 ? TID.GRASS[1] : TID.GRASS[2];
      if (theme === 'crypt') return r < 0.65 ? TID.FLOOR[0] : r < 0.85 ? TID.FLOOR[1] : TID.FLOOR[2];
      return r < 0.7 ? TID.ASH[0] : r < 0.88 ? TID.ASH[1] : TID.ASH[2];
  }
}

function defaultGround(theme: Theme, x: number, y: number): number {
  return groundTile('.', theme, x, y);
}

export function buildLevel(scene: Phaser.Scene, level: ParsedLevel, theme: Theme): BuiltLevel {
  const map = scene.make.tilemap({ tileWidth: TILE, tileHeight: TILE, width: level.w, height: level.h });
  const ts = map.addTilesetImage('tiles', 'tiles', TILE, TILE, 0, 0)!;
  const ground = map.createBlankLayer('ground', ts)!.setDepth(DEPTH.ground);
  const solid = map.createBlankLayer('solid', ts)!.setDepth(DEPTH.solid);
  const above = map.createBlankLayer('above', ts)!.setDepth(DEPTH.above);
  const animated: BuiltLevel['animated'] = [];
  const lavaCells: BuiltLevel['lavaCells'] = [];
  const t = level.terrain;
  const at = (x: number, y: number) => t[y]?.[x];

  for (let y = 0; y < level.h; y++) {
    for (let x = 0; x < level.w; x++) {
      const ch = t[y][x];
      ground.putTileAt(ch === '#' || ch === '~' || ch === 'l' ? defaultGround(theme, x, y) : groundTile(ch, theme, x, y), x, y);
      switch (ch) {
        case '#': {
          const below = at(x, y + 1);
          const face = below !== undefined && below !== '#';
          solid.putTileAt(face ? TID.WALL_FACE[theme] : TID.WALL_TOP[theme], x, y);
          break;
        }
        case 'T': {
          const forest = theme === 'forest';
          solid.putTileAt(forest ? TID.TREE_BASE : TID.DEAD_TREE_BASE, x, y);
          if (y > 0) above.putTileAt(forest ? TID.TREE_TOP : TID.DEAD_TREE_TOP, x, y - 1);
          break;
        }
        case '|':
          solid.putTileAt(TID.PILLAR_BASE, x, y);
          if (y > 0) above.putTileAt(TID.PILLAR_TOP, x, y - 1);
          break;
        case 'r':
          solid.putTileAt(TID.ROCK, x, y);
          break;
        case '~': {
          const edge = at(x, y - 1) !== '~';
          const frames = (edge ? TID.WATER_EDGE : TID.WATER).slice();
          const off = Math.floor(hash2(x, y, 3) * 3);
          const tile = solid.putTileAt(frames[off], x, y);
          animated.push({ tile, frames });
          break;
        }
        case 'l': {
          const edge = at(x, y - 1) !== 'l';
          const frames = (edge ? TID.LAVA_EDGE : TID.LAVA).slice();
          const tile = solid.putTileAt(frames[Math.floor(hash2(x, y, 5) * 3)], x, y);
          animated.push({ tile, frames });
          lavaCells.push({ x, y });
          break;
        }
      }
    }
  }
  solid.setCollisionByExclusion([-1]);
  return { map, ground, solid, above, animated, lavaCells };
}

/** Переключает кадры воды и лавы. */
export function animateTiles(built: BuiltLevel): void {
  for (const a of built.animated) {
    const i = a.frames.indexOf(a.tile.index);
    a.tile.index = a.frames[(i + 1) % a.frames.length];
  }
}
