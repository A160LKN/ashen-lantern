import '@fontsource/pixelify-sans/latin-400.css';
import '@fontsource/pixelify-sans/cyrillic-400.css';
import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from './config';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { MenuScene } from './scenes/MenuScene';
import {
  AchievementsScene, GameOverScene, HelpScene, InventoryScene, PauseScene, SaveLoadScene, SettingsScene, ShopScene, VictoryScene,
} from './scenes/overlays';
import { UIScene } from './scenes/UIScene';
import { installTestHooks } from './testing/testHooks';

async function loadFonts(): Promise<void> {
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load('20px "Pixelify Sans"', 'Пепельный Фонарь'),
        document.fonts.load('20px "Pixelify Sans"', 'Ashen Lantern 0123'),
      ]),
      new Promise((r) => setTimeout(r, 2500)),
    ]);
  } catch {
    /* шрифт не загрузился — используется запасной моноширинный */
  }
}

async function start(): Promise<void> {
  await loadFonts();
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: '#07060b',
    pixelArt: true,
    roundPixels: true,
    antialias: false,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 0 }, debug: false } },
    fps: { target: 60 },
    disableContextMenu: true,
    // Порядок важен: сцены ниже по списку рисуются поверх.
    scene: [
      BootScene, MenuScene, GameScene, UIScene, GameOverScene, VictoryScene, PauseScene,
      InventoryScene, ShopScene, SettingsScene, SaveLoadScene, AchievementsScene, HelpScene,
    ],
  });
  installTestHooks(game);
  // Если контейнер ещё не имел размера при старте (скрытая вкладка/панель), пересчитываем масштаб.
  const parent = document.getElementById('game');
  if (parent && 'ResizeObserver' in window) new ResizeObserver(() => game.scale.refresh()).observe(parent);
  game.events.once(Phaser.Core.Events.READY, () => game.scale.refresh());
}

void start();
