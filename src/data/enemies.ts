/** Параметры противников. Скорости — пиксели/с, дистанции — пиксели, время — мс. */
export type EnemyType = 'slime' | 'skeleton' | 'wisp' | 'boss';
export type AttackKind = 'leap' | 'melee' | 'ranged' | 'boss';

export interface EnemyDef {
  type: EnemyType;
  name: string;
  texture: string;
  hp: number;
  damage: number;
  speed: number;
  chaseSpeed: number;
  detect: number;
  lose: number;
  leash: number;
  attackRange: number;
  attack: AttackKind;
  cooldown: number;
  windup: number;
  xp: number;
  coins: [number, number];
  dropPotion: number;
  dropOil: number;
  body: { w: number; h: number; ox: number; oy: number };
  light?: { radius: number; color: number };
  keepDistance?: number;
}

export const ENEMIES: Record<EnemyType, EnemyDef> = {
  slime: {
    type: 'slime', name: 'Тлень-слизень', texture: 'slime',
    hp: 22, damage: 8, speed: 28, chaseSpeed: 52, detect: 80, lose: 140, leash: 200,
    attackRange: 34, attack: 'leap', cooldown: 1300, windup: 420,
    xp: 6, coins: [1, 3], dropPotion: 0.06, dropOil: 0.12,
    body: { w: 10, h: 7, ox: 3, oy: 8 },
  },
  skeleton: {
    type: 'skeleton', name: 'Костяной страж', texture: 'skeleton',
    hp: 40, damage: 12, speed: 32, chaseSpeed: 58, detect: 104, lose: 170, leash: 240,
    attackRange: 17, attack: 'melee', cooldown: 950, windup: 360,
    xp: 14, coins: [3, 6], dropPotion: 0.1, dropOil: 0.1,
    body: { w: 8, h: 6, ox: 4, oy: 10 },
  },
  wisp: {
    type: 'wisp', name: 'Пепельный дух', texture: 'wisp',
    hp: 28, damage: 10, speed: 26, chaseSpeed: 44, detect: 124, lose: 190, leash: 240,
    attackRange: 110, attack: 'ranged', cooldown: 1700, windup: 480,
    xp: 16, coins: [3, 6], dropPotion: 0.08, dropOil: 0.2,
    body: { w: 8, h: 8, ox: 4, oy: 6 },
    light: { radius: 34, color: 0x9a7cff },
    keepDistance: 60,
  },
  boss: {
    type: 'boss', name: 'Пепельный Король', texture: 'boss',
    hp: 520, damage: 20, speed: 40, chaseSpeed: 48, detect: 120, lose: 9999, leash: 9999,
    attackRange: 40, attack: 'boss', cooldown: 1000, windup: 700,
    xp: 200, coins: [60, 80], dropPotion: 1, dropOil: 1,
    body: { w: 16, h: 10, ox: 8, oy: 21 },
    light: { radius: 64, color: 0xff6a30 },
  },
};
