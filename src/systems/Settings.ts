import { STORAGE_PREFIX } from '../config';
import type { StorageLike } from './Storage';

export type Difficulty = 'easy' | 'normal' | 'hard';

export interface Settings {
  musicVolume: number;
  sfxVolume: number;
  screenShake: boolean;
  showFps: boolean;
  difficulty: Difficulty;
}

export const DIFFICULTY: Record<Difficulty, { label: string; enemyHp: number; damageTaken: number }> = {
  easy: { label: 'Лёгкая', enemyHp: 0.8, damageTaken: 0.65 },
  normal: { label: 'Обычная', enemyHp: 1, damageTaken: 1 },
  hard: { label: 'Тяжёлая', enemyHp: 1.25, damageTaken: 1.35 },
};

export const DEFAULT_SETTINGS: Settings = {
  musicVolume: 0.5,
  sfxVolume: 0.7,
  screenShake: true,
  showFps: false,
  difficulty: 'normal',
};

const KEY = `${STORAGE_PREFIX}.settings`;

export function loadSettings(storage: StorageLike): Settings {
  try {
    const raw = JSON.parse(storage.getItem(KEY) ?? 'null');
    if (!raw || typeof raw !== 'object') return { ...DEFAULT_SETTINGS };
    const vol = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : d);
    return {
      musicVolume: vol(raw.musicVolume, DEFAULT_SETTINGS.musicVolume),
      sfxVolume: vol(raw.sfxVolume, DEFAULT_SETTINGS.sfxVolume),
      screenShake: typeof raw.screenShake === 'boolean' ? raw.screenShake : DEFAULT_SETTINGS.screenShake,
      showFps: typeof raw.showFps === 'boolean' ? raw.showFps : DEFAULT_SETTINGS.showFps,
      difficulty: raw.difficulty in DIFFICULTY ? raw.difficulty : DEFAULT_SETTINGS.difficulty,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(storage: StorageLike, s: Settings): void {
  try {
    storage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* хранилище недоступно — настройки действуют до перезагрузки */
  }
}
