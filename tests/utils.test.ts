import { afterEach, describe, expect, it, vi } from 'vitest';
import { hash2, mulberry32, pick, randInt, randRange } from '../src/core/rng';
import { createNewGame, isRemoved, markRemoved, totalKills, addKill, currentLevel } from '../src/systems/GameState';
import { levelQuests, questById, startQuest } from '../src/systems/Quests';
import { formatTime } from '../src/systems/SaveSystem';
import { getBrowserStorage } from '../src/systems/Storage';

describe('ГСЧ', () => {
  it('mulberry32 детерминирован и в [0,1)', () => {
    const a = mulberry32(7);
    const b = mulberry32(7);
    for (let i = 0; i < 100; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('hash2 стабилен и различает соседей', () => {
    expect(hash2(3, 4, 1)).toBe(hash2(3, 4, 1));
    expect(hash2(3, 4)).not.toBe(hash2(4, 3));
  });

  it('randInt/randRange/pick остаются в границах', () => {
    const r = mulberry32(1);
    for (let i = 0; i < 500; i++) {
      const n = randInt(2, 5, r);
      expect(n).toBeGreaterThanOrEqual(2);
      expect(n).toBeLessThanOrEqual(5);
      const f = randRange(-1, 1, r);
      expect(Math.abs(f)).toBeLessThanOrEqual(1);
      expect(['a', 'b']).toContain(pick(['a', 'b'], r));
    }
  });
});

describe('вспомогательные функции состояния', () => {
  it('markRemoved не дублирует и относится к текущему уровню', () => {
    const d = createNewGame();
    markRemoved(d, 'c@1,1');
    markRemoved(d, 'c@1,1');
    expect(currentLevel(d).removed).toEqual(['c@1,1']);
    expect(isRemoved(d, 'c@1,1')).toBe(true);
    d.levelIndex = 1;
    expect(isRemoved(d, 'c@1,1')).toBe(false);
  });

  it('totalKills суммирует по типам', () => {
    const d = createNewGame();
    addKill(d, 'slime');
    addKill(d, 'slime');
    addKill(d, 'wisp');
    expect(totalKills(d)).toBe(3);
  });

  it('задания: поиск, список уровня, повторный старт', () => {
    expect(questById('forest_slimes')?.target).toBe('slime');
    expect(questById('nope')).toBeUndefined();
    expect(levelQuests(2).map((q) => q.id)).toContain('citadel_boss');
    const d = createNewGame();
    expect(startQuest(d, 'forest_slimes')).toBe(true);
    expect(startQuest(d, 'forest_slimes')).toBe(false);
  });

  it('formatTime', () => {
    expect(formatTime(0)).toBe('00:00');
    expect(formatTime(65_000)).toBe('01:05');
    expect(formatTime(3_725_000)).toBe('1:02:05');
  });
});

describe('getBrowserStorage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('использует localStorage, если он работает', () => {
    const m = new Map<string, string>();
    const ls = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => m.set(k, v), removeItem: (k: string) => m.delete(k) };
    vi.stubGlobal('localStorage', ls);
    expect(getBrowserStorage()).toBe(ls);
  });

  it('падает обратно на память, если localStorage запрещён (приватный режим)', () => {
    vi.stubGlobal('localStorage', { setItem: () => { throw new Error('QuotaExceeded'); } });
    const s = getBrowserStorage();
    s.setItem('a', '1');
    expect(s.getItem('a')).toBe('1');
    s.removeItem('a');
    expect(s.getItem('a')).toBeNull();
  });
});
