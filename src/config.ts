/** Глобальные константы игры. */
export const TILE = 16;
export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 540;
/** Масштаб мировой камеры: 960x540 / 3 = 320x180 игровых пикселей на экране. */
export const WORLD_ZOOM = 3;
/** Масштаб пиксельной графики интерфейса. */
export const UI_SCALE = 3;
export const FONT = '"Pixelify Sans", "Courier New", monospace';
/**
 * Префикс ключей localStorage. Параметр `?profile=имя` даёт изолированное хранилище —
 * автотесты и ручные проверки не трогают сохранения игрока.
 */
function storagePrefix(): string {
  const search = (globalThis as { location?: { search?: string } }).location?.search ?? '';
  const profile = new URLSearchParams(search).get('profile');
  return profile && /^[a-z0-9-]{1,32}$/i.test(profile) ? `ashen-lantern@${profile}` : 'ashen-lantern';
}
export const STORAGE_PREFIX = storagePrefix();
export const SAVE_VERSION = 2;
export const SAVE_SLOTS = [0, 1, 2, 3] as const; // 0 — автосохранение

export const DEPTH = {
  ground: 0,
  solid: 2,
  entityBase: 10,
  above: 5000,
  glow: 5990,
  light: 6000,
  airFx: 6500,
  text: 7000,
  prompt: 8000,
} as const;
