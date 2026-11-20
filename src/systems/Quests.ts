/** Система заданий (чистая логика). */
import { QUESTS, type QuestDef } from '../data/quests';
import { addCoins, addPotion, addXp, type GameData } from './GameState';

export type QuestEvent =
  | { type: 'shard'; total: number }
  | { type: 'beacon' }
  | { type: 'kill'; enemy: string }
  | { type: 'boss' };

export interface QuestResult {
  completed: QuestDef[];
  levelsGained: number;
}

export function levelQuests(levelIndex: number): QuestDef[] {
  return QUESTS.filter((q) => q.level === levelIndex);
}

export function questById(id: string): QuestDef | undefined {
  return QUESTS.find((q) => q.id === id);
}

/** Запускает обязательные задания текущего уровня. */
export function ensureLevelQuests(d: GameData): void {
  for (const q of levelQuests(d.levelIndex)) {
    if (!q.optional && !d.quests[q.id]) d.quests[q.id] = { started: true, progress: 0, done: false };
  }
}

export function startQuest(d: GameData, id: string): boolean {
  if (d.quests[id]?.started) return false;
  d.quests[id] = { started: true, progress: 0, done: false };
  return true;
}

export function applyQuestEvent(d: GameData, ev: QuestEvent): QuestResult {
  const result: QuestResult = { completed: [], levelsGained: 0 };
  for (const q of levelQuests(d.levelIndex)) {
    const st = d.quests[q.id];
    if (!st || !st.started || st.done) continue;
    let changed = false;
    if (q.type === 'shards' && ev.type === 'shard') {
      st.progress = Math.min(q.count, ev.total);
      changed = true;
    } else if (q.type === 'beacon' && ev.type === 'beacon') {
      st.progress = 1;
      changed = true;
    } else if (q.type === 'boss' && ev.type === 'boss') {
      st.progress = 1;
      changed = true;
    } else if (q.type === 'kill' && ev.type === 'kill' && ev.enemy === q.target) {
      st.progress = Math.min(q.count, st.progress + 1);
      changed = true;
    }
    if (changed && st.progress >= q.count) {
      st.done = true;
      result.completed.push(q);
      if (q.reward?.coins) addCoins(d, q.reward.coins);
      for (let i = 0; i < (q.reward?.potions ?? 0); i++) addPotion(d);
      if (q.reward?.xp) result.levelsGained += addXp(d, q.reward.xp);
    }
  }
  return result;
}
