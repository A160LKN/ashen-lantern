import { describe, expect, it } from 'vitest';
import { LEVELS } from '../src/data/levels';
import { createGrid, floodFill, isSolid, setSolid } from '../src/world/grid';
import { buildGrid, ENEMY_CHARS, parseLevel, SOLID_ENTITIES, SOLID_TERRAIN } from '../src/world/levelParser';

/** Симуляция прохождения: собираем ключи, открываем двери, пока это возможно. */
function simulate(levelIdx: number) {
  const def = LEVELS[levelIdx];
  const lvl = parseLevel(def.map, def.fill);
  const opened = new Set<string>();
  const taken = new Set<string>();
  let keys = 0;
  for (let iter = 0; iter < 20; iter++) {
    const g = buildGrid(lvl, (e) => !(e.ch === 'D' && opened.has(e.id)) && e.ch !== 'p');
    const seen = floodFill(g, lvl.spawn.x, lvl.spawn.y);
    const reach = (x: number, y: number) => seen[y * g.w + x] === 1;
    const adj = (x: number, y: number) => [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => x + dx >= 0 && y + dy >= 0 && x + dx < g.w && y + dy < g.h && reach(x + dx, y + dy));
    let progress = false;
    for (const e of lvl.entities) {
      if (e.ch === 'K' && !taken.has(e.id) && reach(e.x, e.y)) {
        taken.add(e.id);
        keys++;
        progress = true;
      }
    }
    for (const e of lvl.entities) {
      if (e.ch === 'D' && !opened.has(e.id) && keys > 0 && adj(e.x, e.y)) {
        opened.add(e.id);
        keys--;
        progress = true;
      }
    }
    if (!progress) return { lvl, reach, adj };
  }
  throw new Error('simulation did not converge');
}

describe('уровни', () => {
  LEVELS.forEach((def, i) => {
    describe(def.name, () => {
      const lvl = parseLevel(def.map, def.fill);

      it('карта прямоугольная и без неизвестных символов', () => {
        expect(lvl.warnings).toEqual([]);
        expect(lvl.w).toBe(40);
        expect(lvl.h).toBe(28);
      });

      it('есть ровно одна точка старта, маяк, NPC и хотя бы одно святилище', () => {
        expect(def.map.join('').split('P').length - 1).toBe(1);
        expect(lvl.entities.filter((e) => e.ch === 'L')).toHaveLength(1);
        expect(lvl.entities.filter((e) => e.ch === 'N')).toHaveLength(1);
        expect(lvl.entities.filter((e) => e.ch === 'S').length).toBeGreaterThanOrEqual(1);
      });

      it('осколков хватает, чтобы зажечь маяк', () => {
        const shards = lvl.entities.filter((e) => e.ch === '*').length + (lvl.entities.some((e) => e.ch === 'B') ? 1 : 0);
        expect(shards).toBeGreaterThanOrEqual(def.shardsRequired);
      });

      it('все цели достижимы со старта с учётом ключей и дверей', () => {
        const { lvl: l, reach, adj } = simulate(i);
        for (const e of l.entities) {
          if (['*', 'K', '$', 'h', 'o'].includes(e.ch)) expect(reach(e.x, e.y), `${e.id} unreachable`).toBe(true);
          if (['L', 'N', 'S', 'c', 'D'].includes(e.ch)) expect(adj(e.x, e.y), `${e.id} not adjacent to reachable`).toBe(true);
          if (e.ch === 'B') expect(reach(e.x, e.y), 'boss unreachable').toBe(true);
        }
      });

      it('враги стоят на проходимых клетках и не замурованы', () => {
        const g = buildGrid(lvl, () => true);
        for (const e of lvl.entities.filter((x) => ENEMY_CHARS[x.ch])) {
          expect(SOLID_TERRAIN.has(lvl.terrain[e.y][e.x])).toBe(false);
          const free = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => !isSolid(g, e.x + dx, e.y + dy)).length;
          expect(free, `${e.id} boxed in`).toBeGreaterThan(0);
        }
      });

      it('объекты-препятствия не перекрывают единственный проход', () => {
        // Без твёрдых объектов и с ними множество достижимых клеток-полов совпадает (кроме самих объектов и закрытых зон).
        const open = buildGrid(lvl, () => false);
        const all = floodFill(open, lvl.spawn.x, lvl.spawn.y);
        const blocked = buildGrid(lvl, (e) => SOLID_ENTITIES.has(e.ch) && e.ch !== 'D');
        const withObjs = floodFill(blocked, lvl.spawn.x, lvl.spawn.y);
        const doorsClosed = buildGrid(lvl, (e) => e.ch === 'D');
        const behindDoors = floodFill(doorsClosed, lvl.spawn.x, lvl.spawn.y);
        let lost = 0;
        for (let k = 0; k < all.length; k++) if (all[k] && !withObjs[k] && !blocked.solid[k] && behindDoors[k]) lost++;
        expect(lost).toBe(0);
      });
    });
  });
});

describe('parseLevel', () => {
  it('дополняет короткие строки и закрывает края', () => {
    const l = parseLevel(['.....', '.P.', '.....'], '#');
    expect(l.w).toBe(5);
    expect(l.terrain[1][4]).toBe('#');
    expect(l.terrain[0][2]).toBe('#');
    expect(l.spawn).toEqual({ x: 1, y: 1 });
    expect(l.warnings.length).toBe(1);
  });

  it('подставляет землю под объекты', () => {
    const l = parseLevel(['#####', '#,c,#', '#,P,#', '#####'], '#');
    expect(l.terrain[1][2]).toBe(',');
    expect(l.entities[0]).toMatchObject({ ch: 'c', x: 2, y: 1, id: 'c@2,1' });
  });

  it('buildGrid учитывает открытые двери', () => {
    const l = parseLevel(['#####', '#.D.#', '#P..#', '#####'], '#');
    expect(isSolid(buildGrid(l, () => true), 2, 1)).toBe(true);
    expect(isSolid(buildGrid(l, () => false), 2, 1)).toBe(false);
    const g = createGrid(2, 2);
    setSolid(g, 0, 0, true);
    expect(isSolid(g, 0, 0)).toBe(true);
  });
});
