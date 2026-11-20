/** Достижения хранятся в профиле игрока — общем для всех сохранений. */
import { STORAGE_PREFIX } from '../config';
import { ACHIEVEMENTS, type AchievementDef } from '../data/achievements';
import type { GameData } from './GameState';
import type { StorageLike } from './Storage';

export interface Profile {
  unlocked: Record<string, number>;
  deaths: number;
  wins: number;
  bestTimeMs: number | null;
}

export type AchievementEvent = 'tick' | 'level_complete' | 'victory' | 'boss';

export interface AchContext {
  data: GameData;
  event: AchievementEvent;
  levelDamageTaken?: number;
}

const KEY = `${STORAGE_PREFIX}.profile`;

export function defaultProfile(): Profile {
  return { unlocked: {}, deaths: 0, wins: 0, bestTimeMs: null };
}

export function loadProfile(storage: StorageLike): Profile {
  try {
    const raw = JSON.parse(storage.getItem(KEY) ?? 'null');
    if (!raw || typeof raw !== 'object') return defaultProfile();
    const p = defaultProfile();
    if (raw.unlocked && typeof raw.unlocked === 'object') {
      for (const [k, v] of Object.entries(raw.unlocked)) if (typeof v === 'number') p.unlocked[k] = v;
    }
    p.deaths = typeof raw.deaths === 'number' ? raw.deaths : 0;
    p.wins = typeof raw.wins === 'number' ? raw.wins : 0;
    p.bestTimeMs = typeof raw.bestTimeMs === 'number' ? raw.bestTimeMs : null;
    return p;
  } catch {
    return defaultProfile();
  }
}

export function saveProfile(storage: StorageLike, p: Profile): void {
  try {
    storage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

const CHECKS: Record<string, (c: AchContext) => boolean> = {
  first_blood: (c) => Object.values(c.data.stats.kills).some((v) => v > 0),
  slime_bane: (c) => (c.data.stats.kills.slime ?? 0) >= 15,
  bone_breaker: (c) => (c.data.stats.kills.skeleton ?? 0) >= 15,
  exorcist: (c) => (c.data.stats.kills.wisp ?? 0) >= 10,
  treasure: (c) => c.data.stats.chestsOpened >= 8,
  rich: (c) => c.data.inventory.coins >= 150,
  tempered: (c) => c.data.stats.upgradesBought >= 6,
  veteran: (c) => c.data.player.level >= 6,
  first_beacon: (c) => c.data.levels.some((l) => l.beaconLit),
  untouchable: (c) => c.event === 'level_complete' && c.levelDamageTaken === 0,
  kingslayer: (c) => c.data.levels.some((l) => l.bossDefeated),
  swift: (c) => c.event === 'victory' && c.data.stats.playTimeMs < 25 * 60 * 1000,
};

/** Проверяет условия и отмечает новые достижения в профиле. */
export function evaluateAchievements(profile: Profile, ctx: AchContext, now = Date.now()): AchievementDef[] {
  const unlocked: AchievementDef[] = [];
  for (const a of ACHIEVEMENTS) {
    if (profile.unlocked[a.id]) continue;
    const check = CHECKS[a.id];
    if (check && check(ctx)) {
      profile.unlocked[a.id] = now;
      unlocked.push(a);
    }
  }
  return unlocked;
}
