export type UpgradeKey = 'blade' | 'vitality' | 'agility' | 'lantern' | 'endurance';

export interface UpgradeDef {
  key: UpgradeKey;
  name: string;
  desc: string;
  icon: number;
  baseCost: number;
}

export const UPGRADE_MAX = 5;

export const UPGRADES: UpgradeDef[] = [
  { key: 'blade', name: 'Закалка клинка', desc: '+4 к урону, +2% шанс крита', icon: 7, baseCost: 15 },
  { key: 'vitality', name: 'Живучесть', desc: '+15 к максимуму здоровья', icon: 0, baseCost: 12 },
  { key: 'agility', name: 'Лёгкий шаг', desc: '+7 к скорости движения', icon: 8, baseCost: 10 },
  { key: 'lantern', name: 'Пламя фонаря', desc: '+10 к радиусу света, масло тратится медленнее', icon: 9, baseCost: 10 },
  { key: 'endurance', name: 'Выносливость', desc: '+20 к максимуму выносливости', icon: 10, baseCost: 10 },
];
