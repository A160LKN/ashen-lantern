export type QuestType = 'shards' | 'beacon' | 'kill' | 'boss';

export interface QuestDef {
  id: string;
  level: number;
  title: string;
  type: QuestType;
  target?: string;
  count: number;
  optional: boolean;
  reward?: { coins?: number; potions?: number; xp?: number };
}

export const QUESTS: QuestDef[] = [
  { id: 'forest_shards', level: 0, title: 'Собрать осколки угля', type: 'shards', count: 3, optional: false },
  { id: 'forest_beacon', level: 0, title: 'Зажечь лесной маяк', type: 'beacon', count: 1, optional: false },
  { id: 'forest_slimes', level: 0, title: 'Истребить слизней', type: 'kill', target: 'slime', count: 6, optional: true, reward: { coins: 25, potions: 1, xp: 20 } },
  { id: 'crypt_shards', level: 1, title: 'Собрать осколки угля', type: 'shards', count: 3, optional: false },
  { id: 'crypt_beacon', level: 1, title: 'Зажечь маяк склепа', type: 'beacon', count: 1, optional: false },
  { id: 'crypt_skeletons', level: 1, title: 'Упокоить стражей', type: 'kill', target: 'skeleton', count: 8, optional: true, reward: { coins: 40, potions: 2, xp: 40 } },
  { id: 'citadel_boss', level: 2, title: 'Сразить Пепельного Короля', type: 'boss', count: 1, optional: false },
  { id: 'citadel_shards', level: 2, title: 'Собрать осколки угля', type: 'shards', count: 3, optional: false },
  { id: 'citadel_beacon', level: 2, title: 'Зажечь последний маяк', type: 'beacon', count: 1, optional: false },
  { id: 'citadel_wisps', level: 2, title: 'Развеять духов', type: 'kill', target: 'wisp', count: 5, optional: true, reward: { coins: 40, potions: 2, xp: 60 } },
];
