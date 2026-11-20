import { describe, expect, it } from 'vitest';
import { StateMachine } from '../src/core/StateMachine';
import { createGrid, findPath, isSolid, lineOfSight, setSolid } from '../src/world/grid';

function wallGrid() {
  // 10x10, вертикальная стена x=5 от y=0 до y=8, проход внизу.
  const g = createGrid(10, 10);
  for (let y = 0; y < 9; y++) setSolid(g, 5, y, true);
  return g;
}

describe('grid', () => {
  it('выход за границы считается стеной', () => {
    const g = createGrid(3, 3);
    expect(isSolid(g, -1, 0)).toBe(true);
    expect(isSolid(g, 3, 0)).toBe(true);
    expect(isSolid(g, 1, 1)).toBe(false);
  });

  it('A* обходит стену', () => {
    const g = wallGrid();
    const path = findPath(g, 2, 2, 8, 2)!;
    expect(path).not.toBeNull();
    expect(path[path.length - 1]).toEqual({ x: 8, y: 2 });
    for (const p of path) expect(isSolid(g, p.x, p.y)).toBe(false);
    expect(path.some((p) => p.y === 9)).toBe(true);
  });

  it('A* не срезает углы', () => {
    const g = createGrid(3, 3);
    setSolid(g, 1, 0, true);
    setSolid(g, 0, 1, true);
    expect(findPath(g, 0, 0, 1, 1)).toBeNull();
  });

  it('A* возвращает null для недостижимой цели', () => {
    const g = createGrid(5, 5);
    for (let y = 0; y < 5; y++) setSolid(g, 2, y, true);
    expect(findPath(g, 0, 0, 4, 4)).toBeNull();
    expect(findPath(g, 0, 0, 2, 2)).toBeNull();
  });

  it('прямая видимость блокируется стеной', () => {
    const g = wallGrid();
    expect(lineOfSight(g, 2 * 16 + 8, 2 * 16 + 8, 8 * 16 + 8, 2 * 16 + 8)).toBe(false);
    expect(lineOfSight(g, 2 * 16 + 8, 9 * 16 + 8, 8 * 16 + 8, 9 * 16 + 8)).toBe(true);
  });
});

describe('StateMachine', () => {
  it('вызывает enter/update/exit и считает время', () => {
    const log: string[] = [];
    const fsm = new StateMachine({ n: 0 });
    fsm
      .add('a', { enter: () => log.push('enter a'), update: (c) => c.n++, exit: (_c, next) => log.push(`exit a→${next}`) })
      .add('b', { enter: (_c, prev) => log.push(`enter b from ${prev}`) });
    fsm.set('a');
    fsm.update(16);
    fsm.update(16);
    expect(fsm.elapsed).toBe(32);
    fsm.set('b');
    expect(fsm.is('b')).toBe(true);
    expect(fsm.elapsed).toBe(0);
    expect(log).toEqual(['enter a', 'exit a→b', 'enter b from a']);
  });

  it('ругается на неизвестное состояние', () => {
    expect(() => new StateMachine({}).set('x')).toThrow();
  });
});
