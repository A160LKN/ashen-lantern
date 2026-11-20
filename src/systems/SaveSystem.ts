/**
 * Сохранения: конверт с версией и контрольной суммой, миграция старых форматов,
 * очистка/ограничение значений из повреждённых данных.
 */
import { SAVE_VERSION, STORAGE_PREFIX } from '../config';
import { LEVEL_COUNT, LEVELS } from '../data/levels';
import { UPGRADE_MAX } from '../data/upgrades';
import { createNewGame, getDerived, MAX_OIL, MAX_POTIONS, newLevelProgress, type GameData } from './GameState';
import type { StorageLike } from './Storage';

export interface SaveSummary {
  levelName: string;
  playerLevel: number;
  playTimeMs: number;
  coins: number;
}

export interface SaveEnvelope {
  version: number;
  savedAt: number;
  checksum: string;
  summary: SaveSummary;
  data: unknown;
}

export type LoadResult =
  | { status: 'ok'; data: GameData; envelope: SaveEnvelope; migrated: boolean }
  | { status: 'empty' }
  | { status: 'corrupted'; reason: string };

export function slotKey(slot: number): string {
  return `${STORAGE_PREFIX}.save.${slot}`;
}

export function checksum(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function summarize(d: GameData): SaveSummary {
  return {
    levelName: LEVELS[d.levelIndex]?.name ?? '?',
    playerLevel: d.player.level,
    playTimeMs: d.stats.playTimeMs,
    coins: d.inventory.coins,
  };
}

export function saveGame(storage: StorageLike, slot: number, data: GameData, now = Date.now()): boolean {
  const json = JSON.stringify(data);
  const env: SaveEnvelope = {
    version: SAVE_VERSION,
    savedAt: now,
    checksum: checksum(json),
    summary: summarize(data),
    data,
  };
  try {
    storage.setItem(slotKey(slot), JSON.stringify(env));
    return true;
  } catch {
    return false;
  }
}

export function deleteSave(storage: StorageLike, slot: number): void {
  storage.removeItem(slotKey(slot));
}

export function loadGame(storage: StorageLike, slot: number): LoadResult {
  const raw = storage.getItem(slotKey(slot));
  if (raw === null) return { status: 'empty' };
  let env: SaveEnvelope;
  try {
    env = JSON.parse(raw);
  } catch {
    return { status: 'corrupted', reason: 'Файл сохранения повреждён' };
  }
  if (!env || typeof env !== 'object' || typeof env.version !== 'number' || !env.data || typeof env.data !== 'object') {
    return { status: 'corrupted', reason: 'Неизвестный формат сохранения' };
  }
  if (env.version > SAVE_VERSION) {
    return { status: 'corrupted', reason: 'Сохранение из более новой версии игры' };
  }
  let migrated = false;
  let data: any = env.data;
  if (env.version === SAVE_VERSION) {
    if (typeof env.checksum !== 'string' || checksum(JSON.stringify(data)) !== env.checksum) {
      return { status: 'corrupted', reason: 'Контрольная сумма не совпадает' };
    }
  } else {
    data = migrate(data, env.version);
    migrated = true;
  }
  const clean = sanitize(data);
  if (!clean) return { status: 'corrupted', reason: 'Данные сохранения некорректны' };
  return { status: 'ok', data: clean, envelope: env, migrated };
}

/** Миграции старых форматов. v1 (ранняя версия): монеты хранились в player.gold, не было масла для фонаря. */
export function migrate(data: any, fromVersion: number): any {
  let d = { ...data };
  if (fromVersion <= 1) {
    d.inventory = { ...(d.inventory ?? {}) };
    if (typeof d.player?.gold === 'number' && d.inventory.coins === undefined) d.inventory.coins = d.player.gold;
    if (d.player) {
      d.player = { ...d.player };
      delete d.player.gold;
      if (d.player.oil === undefined) d.player.oil = MAX_OIL;
    }
  }
  return d;
}

function num(v: unknown, def: number, min: number, max: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : def;
  return Math.min(max, Math.max(min, n));
}

function int(v: unknown, def: number, min: number, max: number): number {
  return Math.floor(num(v, def, min, max));
}

/** Приводит произвольный объект к корректному GameData (или null, если восстановить нельзя). */
export function sanitize(raw: any): GameData | null {
  if (!raw || typeof raw !== 'object') return null;
  if (!raw.player || typeof raw.player !== 'object') return null;
  const base = createNewGame();
  const d = base;
  d.levelIndex = int(raw.levelIndex, 0, 0, LEVEL_COUNT - 1);
  d.player.level = int(raw.player.level, 1, 1, 30);
  d.player.xp = int(raw.player.xp, 0, 0, 1e7);
  d.player.oil = num(raw.player.oil, MAX_OIL, 0, MAX_OIL);
  const up = raw.upgrades ?? {};
  for (const k of Object.keys(d.upgrades) as (keyof typeof d.upgrades)[]) d.upgrades[k] = int(up[k], 0, 0, UPGRADE_MAX);
  const inv = raw.inventory ?? {};
  d.inventory.coins = int(inv.coins, 0, 0, 1e7);
  d.inventory.potions = int(inv.potions, 0, 0, MAX_POTIONS);
  d.inventory.keys = int(inv.keys, 0, 0, 99);
  d.inventory.shards = int(inv.shards, 0, 0, 99);
  if (Array.isArray(raw.levels)) {
    d.levels = Array.from({ length: LEVEL_COUNT }, (_, i) => {
      const l = raw.levels[i];
      const lp = newLevelProgress();
      if (l && typeof l === 'object') {
        lp.removed = Array.isArray(l.removed) ? l.removed.filter((s: unknown) => typeof s === 'string').slice(0, 2000) : [];
        lp.beaconLit = l.beaconLit === true;
        lp.bossDefeated = l.bossDefeated === true;
        lp.damageTaken = num(l.damageTaken, 0, 0, 1e9);
        if (l.checkpoint && typeof l.checkpoint.x === 'number' && typeof l.checkpoint.y === 'number') {
          lp.checkpoint = { x: num(l.checkpoint.x, 0, 0, 1e5), y: num(l.checkpoint.y, 0, 0, 1e5) };
        }
      }
      return lp;
    });
  }
  if (raw.quests && typeof raw.quests === 'object') {
    for (const [id, q] of Object.entries<any>(raw.quests)) {
      if (q && typeof q === 'object') {
        d.quests[id] = { started: q.started === true, progress: int(q.progress, 0, 0, 1e6), done: q.done === true };
      }
    }
  }
  const st = raw.stats ?? {};
  if (st.kills && typeof st.kills === 'object') {
    for (const [k, v] of Object.entries(st.kills)) d.stats.kills[k] = int(v, 0, 0, 1e7);
  }
  d.stats.chestsOpened = int(st.chestsOpened, 0, 0, 1e6);
  d.stats.upgradesBought = int(st.upgradesBought, 0, 0, 1e6);
  d.stats.potionsUsed = int(st.potionsUsed, 0, 0, 1e6);
  d.stats.coinsEarned = int(st.coinsEarned, 0, 0, 1e9);
  d.stats.playTimeMs = num(st.playTimeMs, 0, 0, 1e12);
  const maxHp = getDerived(d).maxHp;
  d.player.hp = num(raw.player.hp, maxHp, 1, maxHp);
  return d;
}

export interface SlotInfo {
  slot: number;
  status: 'ok' | 'empty' | 'corrupted';
  savedAt?: number;
  summary?: SaveSummary;
  reason?: string;
}

export function listSlots(storage: StorageLike, slots: readonly number[]): SlotInfo[] {
  return slots.map((slot) => {
    const r = loadGame(storage, slot);
    if (r.status === 'ok') return { slot, status: 'ok', savedAt: r.envelope.savedAt, summary: summarize(r.data) };
    if (r.status === 'empty') return { slot, status: 'empty' };
    return { slot, status: 'corrupted', reason: r.reason };
  });
}

/** Самое свежее корректное сохранение. */
export function latestSlot(storage: StorageLike, slots: readonly number[]): number | null {
  let best: SlotInfo | null = null;
  for (const s of listSlots(storage, slots)) {
    if (s.status === 'ok' && (!best || (s.savedAt ?? 0) > (best.savedAt ?? 0))) best = s;
  }
  return best ? best.slot : null;
}

export function formatTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
