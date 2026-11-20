/** Текущая игровая сессия: данные партии, настройки, профиль и переходные значения для HUD. */
import type Phaser from 'phaser';
import { evaluateAchievements, loadProfile, saveProfile, type AchContext, type Profile } from './Achievements';
import type { GameData } from './GameState';
import { loadSettings, saveSettings, type Settings } from './Settings';
import { getBrowserStorage, type StorageLike } from './Storage';
import { bus } from '../core/EventBus';

const storage: StorageLike = getBrowserStorage();

export const Session = {
  storage,
  data: null as GameData | null,
  settings: loadSettings(storage) as Settings,
  profile: loadProfile(storage) as Profile,
  audioUnlocked: false,
  runtime: {
    stamina: 100,
    maxStamina: 100,
    prompt: '',
    boss: null as null | { name: string; hp: number; max: number },
  },
};

export function persistSettings(): void {
  saveSettings(storage, Session.settings);
}

export function persistProfile(): void {
  saveProfile(storage, Session.profile);
}

/** Проверяет достижения и показывает уведомления о новых. */
export function checkAchievements(ctx: Omit<AchContext, 'data'> & { data?: GameData }): void {
  const data = ctx.data ?? Session.data;
  if (!data) return;
  const got = evaluateAchievements(Session.profile, { ...ctx, data });
  if (got.length) {
    persistProfile();
    for (const a of got) bus.emit('achievement', a);
  }
}

const OVERLAYS = ['Pause', 'Inventory', 'Shop', 'Settings', 'SaveLoad', 'GameOver', 'Victory', 'Achievements', 'Help'];

/** Запускает игровую сцену с указанными данными, закрывая все остальные экраны. */
export function launchGame(scene: Phaser.Scene, data: GameData): void {
  Session.data = data;
  const mgr = scene.game.scene;
  for (const key of [...OVERLAYS, 'UI', 'Menu']) {
    if (key !== scene.scene.key && mgr.getScene(key) && (mgr.isActive(key) || mgr.isPaused(key) || mgr.isSleeping(key))) {
      mgr.stop(key);
    }
  }
  if (scene.scene.key === 'Game') scene.scene.restart();
  else scene.scene.start('Game');
}

/** Возврат в главное меню. */
export function goToMenu(scene: Phaser.Scene): void {
  const mgr = scene.game.scene;
  for (const key of [...OVERLAYS, 'UI', 'Game']) {
    if (key !== scene.scene.key && mgr.getScene(key) && (mgr.isActive(key) || mgr.isPaused(key) || mgr.isSleeping(key))) {
      mgr.stop(key);
    }
  }
  scene.scene.start('Menu');
}
