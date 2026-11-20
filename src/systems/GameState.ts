/** Сериализуемое состояние партии и правила прогрессии (без зависимостей от движка). */
import { LEVEL_COUNT } from '../data/levels';
import { UPGRADES, UPGRADE_MAX, type UpgradeKey } from '../data/upgrades';

export interface QuestProgress {
  started: boolean;
  progress: number;
  done: boolean;
}

export interface LevelProgress {
  /** Идентификаторы использованных объектов (подобранные предметы, открытые двери, сундуки...). */
  removed: string[];
  beaconLit: boolean;
  bossDefeated: boolean;
  checkpoint: { x: number; y: number } | null;
  damageTaken: number;
}

export interface GameData {
  levelIndex: number;
  player: { level: number; xp: number; hp: number; oil: number };
  upgrades: Record<UpgradeKey, number>;
  inventory: { coins: number; potions: number; keys: number; shards: number };
  levels: LevelProgress[];
  quests: Record<string, QuestProgress>;
  stats: {
    kills: Record<string, number>;
    chestsOpened: number;
    upgradesBought: number;
    potionsUsed: number;
    coinsEarned: number;
    playTimeMs: number;
  };
}

export interface Derived {
  maxHp: number;
  damage: number;
  speed: number;
  sprintSpeed: number;
  maxStamina: number;
  lightRadius: number;
  oilDrainPerSec: number;
  critChance: number;
}

export const MAX_POTIONS = 9;
export const MAX_OIL = 100;

export function newLevelProgress(): LevelProgress {
  return { removed: [], beaconLit: false, bossDefeated: false, checkpoint: null, damageTaken: 0 };
}

export function createNewGame(): GameData {
  const d: GameData = {
    levelIndex: 0,
    player: { level: 1, xp: 0, hp: 0, oil: MAX_OIL },
    upgrades: { blade: 0, vitality: 0, agility: 0, lantern: 0, endurance: 0 },
    inventory: { coins: 0, potions: 1, keys: 0, shards: 0 },
    levels: Array.from({ length: LEVEL_COUNT }, newLevelProgress),
    quests: {},
    stats: { kills: {}, chestsOpened: 0, upgradesBought: 0, potionsUsed: 0, coinsEarned: 0, playTimeMs: 0 },
  };
  d.player.hp = getDerived(d).maxHp;
  return d;
}

export function getDerived(d: GameData): Derived {
  const u = d.upgrades;
  const lvl = d.player.level - 1;
  const speed = 80 + 7 * u.agility;
  return {
    maxHp: 60 + 15 * u.vitality + 6 * lvl,
    damage: 10 + 4 * u.blade + lvl,
    speed,
    sprintSpeed: Math.round(speed * 1.6),
    maxStamina: 100 + 20 * u.endurance,
    lightRadius: 60 + 10 * u.lantern,
    oilDrainPerSec: 0.6 / (1 + 0.3 * u.lantern),
    critChance: 0.08 + 0.02 * u.blade,
  };
}

export function xpToNext(level: number): number {
  return Math.floor(20 * Math.pow(level, 1.5));
}

/** Добавляет опыт. Возвращает число полученных уровней (при повышении — полное исцеление). */
export function addXp(d: GameData, amount: number): number {
  d.player.xp += Math.max(0, Math.floor(amount));
  let gained = 0;
  while (d.player.xp >= xpToNext(d.player.level) && d.player.level < 30) {
    d.player.xp -= xpToNext(d.player.level);
    d.player.level++;
    gained++;
  }
  if (gained > 0) d.player.hp = getDerived(d).maxHp;
  return gained;
}

export function upgradeCost(key: UpgradeKey, currentLevel: number): number {
  const def = UPGRADES.find((u) => u.key === key)!;
  return def.baseCost * (currentLevel + 1);
}

export function buyUpgrade(d: GameData, key: UpgradeKey): { ok: boolean; reason?: string } {
  const lvl = d.upgrades[key];
  if (lvl >= UPGRADE_MAX) return { ok: false, reason: 'Максимальный уровень' };
  const cost = upgradeCost(key, lvl);
  if (d.inventory.coins < cost) return { ok: false, reason: 'Недостаточно монет' };
  const before = getDerived(d);
  d.inventory.coins -= cost;
  d.upgrades[key] = lvl + 1;
  d.stats.upgradesBought++;
  const after = getDerived(d);
  if (after.maxHp > before.maxHp) d.player.hp += after.maxHp - before.maxHp;
  return { ok: true };
}

/** Использует зелье: лечит 45% от максимума. Возвращает вылеченное количество. */
export function usePotion(d: GameData): number {
  const max = getDerived(d).maxHp;
  if (d.inventory.potions <= 0 || d.player.hp >= max) return 0;
  const heal = Math.min(max - d.player.hp, Math.ceil(max * 0.45));
  d.player.hp += heal;
  d.inventory.potions--;
  d.stats.potionsUsed++;
  return heal;
}

export function addCoins(d: GameData, n: number): void {
  d.inventory.coins += n;
  d.stats.coinsEarned += n;
}

export function addPotion(d: GameData): boolean {
  if (d.inventory.potions >= MAX_POTIONS) return false;
  d.inventory.potions++;
  return true;
}

export function addOil(d: GameData, n: number): void {
  d.player.oil = Math.min(MAX_OIL, d.player.oil + n);
}

export function currentLevel(d: GameData): LevelProgress {
  return d.levels[d.levelIndex];
}

export function markRemoved(d: GameData, id: string): void {
  const lp = currentLevel(d);
  if (!lp.removed.includes(id)) lp.removed.push(id);
}

export function isRemoved(d: GameData, id: string): boolean {
  return currentLevel(d).removed.includes(id);
}

export function addKill(d: GameData, type: string): void {
  d.stats.kills[type] = (d.stats.kills[type] ?? 0) + 1;
}

export function totalKills(d: GameData): number {
  return Object.values(d.stats.kills).reduce((a, b) => a + b, 0);
}

/** Переход на следующий уровень: осколки и ключи обнуляются. */
export function advanceLevel(d: GameData): boolean {
  if (d.levelIndex >= LEVEL_COUNT - 1) return false;
  d.levelIndex++;
  d.inventory.shards = 0;
  d.inventory.keys = 0;
  return true;
}
