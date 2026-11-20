import { expect, test } from '@playwright/test';
import { activeScenes, openGame, startNewGame, state, unlockMenu } from './helpers';

test.describe('Смоук', () => {
  test('игра загружается без ошибок и показывает меню', async ({ page }) => {
    const errors = await openGame(page);
    await expect(page.locator('canvas')).toBeVisible();
    const box = await page.locator('canvas').boundingBox();
    expect(box!.width).toBeGreaterThan(600);
    await unlockMenu(page);
    const menu = await page.evaluate(() => {
      const m = (window as any).__ashen.game.scene.getScene('Menu');
      return m.buttons.map((b: any) => ({ label: b.label.text, enabled: b.enabled }));
    });
    expect(menu.map((b: any) => b.label)).toEqual(['Продолжить', 'Новая игра', 'Загрузить', 'Настройки', 'Достижения', 'Как играть']);
    expect(menu[0].enabled).toBe(false); // сохранений ещё нет
    expect(errors).toEqual([]);
  });

  test('новая игра: первый уровень, полный HUD, задания выданы', async ({ page }) => {
    const errors = await openGame(page);
    await startNewGame(page);
    expect(await activeScenes(page)).toEqual(expect.arrayContaining(['Game', 'UI']));
    const s = await state(page);
    expect(s.levelIndex).toBe(0);
    expect(s.hp).toBe(60);
    expect(s.inventory).toEqual({ coins: 0, potions: 1, keys: 0, shards: 0 });
    expect(Object.keys(s.quests)).toEqual(['forest_shards', 'forest_beacon']);
    expect(s.enemies.length).toBeGreaterThan(10);
    // Автосохранение при входе на уровень
    expect(await page.evaluate(() => localStorage.getItem('ashen-lantern.save.0'))).not.toBeNull();
    expect(errors).toEqual([]);
  });

  test('игра держит стабильную частоту кадров', async ({ page }, info) => {
    await openGame(page);
    await startNewGame(page);
    await page.waitForTimeout(3000);
    const fps = await page.evaluate(() => (window as any).__ashen.game.loop.actualFps);
    info.annotations.push({ type: 'fps', description: fps.toFixed(1) });
    // Порог мягкий: в CI WebGL работает программно (SwiftShader). Цель на реальном ПК — 60.
    expect(fps).toBeGreaterThan(20);
  });
});
