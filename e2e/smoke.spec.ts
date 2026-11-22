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

  test('игровая логика укладывается в бюджет кадра', async ({ page }, info) => {
    await openGame(page);
    await startNewGame(page);
    await page.waitForTimeout(3000);
    // Справочно: FPS в CI зависит от машины (WebGL там программный), поэтому не проверяется жёстко.
    const fps = await page.evaluate(() => (window as any).__ashen.game.loop.actualFps);
    info.annotations.push({ type: 'fps (справочно)', description: fps.toFixed(1) });
    // Проверяется время логики на кадр — ИИ врагов, поиск пути, физика, освещение — без рендера.
    const msPerFrame = await page.evaluate(() => {
      const a = (window as any).__ashen;
      a.pauseLoop();
      let t = performance.now();
      const start = performance.now();
      for (let i = 0; i < 300; i++) {
        t += 16.67;
        a.game.scene.update(t, 16.67);
      }
      const ms = (performance.now() - start) / 300;
      a.resumeLoop();
      return ms;
    });
    info.annotations.push({ type: 'логика, мс/кадр', description: msPerFrame.toFixed(2) });
    expect(msPerFrame).toBeLessThan(4); // четверть бюджета кадра при 60 FPS (16,7 мс)
  });
});
