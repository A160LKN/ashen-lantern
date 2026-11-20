/**
 * Тестовый API для автотестов и ручной проверки (аналог «чит-консоли» в игровом QA).
 * Подключается только в dev-сборке или при запуске с параметром `?test`.
 * В обычной production-игре объект window.__ashen отсутствует.
 */
import type Phaser from 'phaser';
import { TILE } from '../config';
import { getDerived } from '../systems/GameState';
import { Session } from '../systems/Session';
import type { GameScene } from '../scenes/GameScene';

export interface AshenTestApi {
  game: Phaser.Game;
  session: typeof Session;
  /** Активные (не на паузе) сцены. */
  activeScenes(): string[];
  /** Журнал событий клавиатуры (DOM и обработанных меню) — для разбора нестабильных тестов. */
  inputLog: { t: number; src: string; type: string; code: string; repeat: boolean; frame: number }[];
  /** Краткий снимок состояния для проверок. */
  state(): Record<string, unknown> | null;
  /** Прогнать n кадров синхронно (детерминированно, не зависит от частоты rAF). */
  step(n: number): void;
  /** Остановить/возобновить собственный цикл кадров игры (для точных по времени проверок). */
  pauseLoop(): void;
  resumeLoop(): void;
  cheats: {
    teleport(tileX: number, tileY: number): void;
    give(item: 'coins' | 'potions' | 'keys' | 'shards', n: number): void;
    setHp(hp: number): void;
    godMode(on: boolean): void;
    damageNearestEnemy(amount: number): string | null;
    /** Перезапускает игровую сцену на указанном уровне с изменёнными флагами. */
    loadLevel(index: number, flags?: { beaconLit?: boolean; bossDefeated?: boolean }): void;
  };
}

export function testHooksEnabled(): boolean {
  return import.meta.env.DEV || new URLSearchParams(location.search).has('test');
}

export function installTestHooks(game: Phaser.Game): void {
  if (!testHooksEnabled()) return;
  let t = performance.now();
  let god = false;
  const gameScene = () => game.scene.getScene('Game') as GameScene;
  game.events.on('poststep', () => {
    if (god && Session.data) Session.data.player.hp = getDerived(Session.data).maxHp;
  });
  const inputLog: AshenTestApi['inputLog'] = [];
  for (const type of ['keydown', 'keyup'] as const) {
    window.addEventListener(type, (e) => {
      inputLog.push({ t: Math.round(performance.now()), src: 'dom', type, code: e.code, repeat: e.repeat, frame: game.loop.frame });
      if (inputLog.length > 500) inputLog.shift();
    }, true);
  }
  const api: AshenTestApi = {
    game,
    session: Session,
    inputLog,
    activeScenes: () => game.scene.getScenes(true).map((s) => s.scene.key),
    state: () => {
      const d = Session.data;
      if (!d) return null;
      const gs = game.scene.isActive('Game') || game.scene.isPaused('Game') ? gameScene() : null;
      return {
        levelIndex: d.levelIndex,
        hp: d.player.hp,
        maxHp: getDerived(d).maxHp,
        level: d.player.level,
        xp: d.player.xp,
        oil: d.player.oil,
        inventory: { ...d.inventory },
        upgrades: { ...d.upgrades },
        quests: JSON.parse(JSON.stringify(d.quests)),
        beaconLit: d.levels[d.levelIndex].beaconLit,
        bossDefeated: d.levels[d.levelIndex].bossDefeated,
        player: gs?.player ? { x: Math.round(gs.player.x), y: Math.round(gs.player.y), state: gs.player.pstate } : null,
        enemies: gs ? gs.debugEnemies() : [],
        prompt: Session.runtime.prompt,
        boss: Session.runtime.boss,
      };
    },
    step: (n) => {
      for (let i = 0; i < n; i++) {
        t = Math.max(t + 16.67, performance.now());
        game.step(t, 16.67);
      }
    },
    pauseLoop: () => game.loop.sleep(),
    resumeLoop: () => game.loop.wake(),
    cheats: {
      teleport: (tx, ty) => {
        const gs = gameScene();
        (gs.player.body as Phaser.Physics.Arcade.Body).reset(tx * TILE + 8, ty * TILE + 5);
      },
      give: (item, n) => {
        if (Session.data) Session.data.inventory[item] += n;
      },
      setHp: (hp) => {
        if (Session.data) Session.data.player.hp = hp;
      },
      godMode: (on) => {
        god = on;
      },
      damageNearestEnemy: (amount) => gameScene().debugDamageNearest(amount),
      loadLevel: (index, flags = {}) => {
        const d = Session.data;
        if (!d) return;
        d.levelIndex = index;
        Object.assign(d.levels[index], flags);
        gameScene().scene.restart();
      },
    },
  };
  (window as unknown as { __ashen: AshenTestApi }).__ashen = api;
}
