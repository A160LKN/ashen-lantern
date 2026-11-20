import { expect, test } from '@playwright/test';
import { activeScenes, openGame, startNewGame, state, unlockMenu, waitForMenuReady, waitForScene } from './helpers';

test('пауза по Esc и возврат в игру', async ({ page }) => {
  await openGame(page);
  await startNewGame(page);
  await page.keyboard.press('Escape');
  await waitForScene(page, 'Pause');
  expect(await activeScenes(page)).not.toContain('Game'); // мир на паузе
  await page.waitForTimeout(250);
  await page.keyboard.press('Escape');
  await waitForScene(page, 'Game');
});

test('инвентарь открывается по I и закрывается по I', async ({ page }) => {
  await openGame(page);
  await startNewGame(page);
  await page.keyboard.press('KeyI');
  await waitForScene(page, 'Inventory');
  await page.waitForTimeout(250);
  await page.keyboard.press('KeyI');
  await waitForScene(page, 'Game');
});

test('настройки громкости сохраняются после перезагрузки', async ({ page }) => {
  await openGame(page);
  await unlockMenu(page);
  await page.evaluate(() => (window as any).__ashen.game.scene.getScene('Menu').list.focus(3));
  await page.keyboard.press('Enter');
  await waitForScene(page, 'Settings');
  await page.waitForTimeout(250);
  await page.keyboard.press('ArrowLeft'); // музыка 50% → 40%
  await page.keyboard.press('ArrowLeft'); // → 30%
  const log = await page.evaluate(() => (window as any).__ashen.inputLog);
  await test.info().attach('input-log.json', { body: JSON.stringify(log, null, 1), contentType: 'application/json' });
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('ashen-lantern.settings') ?? '{}').musicVolume)).toBeCloseTo(0.3);
  await page.reload();
  await waitForMenuReady(page);
  expect(await page.evaluate(() => (window as any).__ashen.session.settings.musicVolume)).toBeCloseTo(0.3);
});

test('сохранение в слот и «Продолжить» после перезагрузки', async ({ page }) => {
  await openGame(page);
  await startNewGame(page);
  await page.evaluate(() => (window as any).__ashen.cheats.give('coins', 77));
  await page.keyboard.press('Escape');
  await waitForScene(page, 'Pause');
  await page.waitForTimeout(250);
  await page.keyboard.press('ArrowDown'); // «Сохранить»
  await page.keyboard.press('Enter');
  await waitForScene(page, 'SaveLoad');
  await page.waitForTimeout(250);
  await page.keyboard.press('Enter'); // первый доступный слот — «Слот 1»
  await expect.poll(() => page.evaluate(() => localStorage.getItem('ashen-lantern.save.1') !== null)).toBe(true).catch(async (err) => {
    const log = await page.evaluate(() => (window as any).__ashen.inputLog);
    await test.info().attach('input-log.json', { body: JSON.stringify(log, null, 1), contentType: 'application/json' });
    throw err;
  });
  const slot = await page.evaluate(() => JSON.parse(localStorage.getItem('ashen-lantern.save.1')!));
  expect(slot.summary.coins).toBe(77);

  await page.reload();
  await unlockMenu(page);
  const enabled = await page.evaluate(() => (window as any).__ashen.game.scene.getScene('Menu').buttons[0].enabled);
  expect(enabled).toBe(true);
  await page.evaluate(() => (window as any).__ashen.game.scene.getScene('Menu').list.focus(0));
  await page.keyboard.press('Enter');
  await waitForScene(page, 'Game');
  expect((await state(page)).inventory.coins).toBe(77);
});

test('повреждённое сохранение помечается и не ломает игру', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => {
    localStorage.setItem('ashen-lantern.save.2', '{not json');
    const env = { version: 2, savedAt: 1, checksum: '00000000', summary: { levelName: 'x', playerLevel: 1, playTimeMs: 0, coins: 0 }, data: { player: {} } };
    localStorage.setItem('ashen-lantern.save.3', JSON.stringify(env));
  });
  await page.reload();
  await unlockMenu(page);
  // «Продолжить» неактивно: корректных сохранений нет
  expect(await page.evaluate(() => (window as any).__ashen.game.scene.getScene('Menu').buttons[0].enabled)).toBe(false);
  await page.evaluate(() => (window as any).__ashen.game.scene.getScene('Menu').list.focus(2));
  await page.keyboard.press('Enter');
  await waitForScene(page, 'SaveLoad');
  const texts = await page.evaluate(() =>
    (window as any).__ashen.game.scene.getScene('SaveLoad').children.list.filter((o: any) => o.type === 'Text').map((t: any) => t.text),
  );
  expect(texts).toContain('Повреждено: Файл сохранения повреждён');
  expect(texts).toContain('Повреждено: Контрольная сумма не совпадает');
});

test('без параметра ?test тестовый API недоступен', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => 'game' in ((window as any).__ashen ?? {}))).toBe(false);
});

test('короткое нажатие внутри одного кадра не теряется (регрессия BUG-010)', async ({ page }) => {
  await openGame(page);
  await startNewGame(page);
  // Цикл кадров стоит: нажатие и отпускание Esc приходят до следующего кадра — как при низком FPS.
  await page.evaluate(() => (window as any).__ashen.pauseLoop());
  await page.keyboard.press('Escape');
  await page.evaluate(() => (window as any).__ashen.step(3));
  const scenes = await activeScenes(page);
  await page.evaluate(() => (window as any).__ashen.resumeLoop());
  expect(scenes).toContain('Pause');
});

test('несколько нажатий за один кадр обрабатываются ровно по одному разу (регрессия BUG-011)', async ({ page }) => {
  await openGame(page);
  await unlockMenu(page);
  await page.evaluate(() => (window as any).__ashen.game.scene.getScene('Menu').list.focus(3));
  await page.keyboard.press('Enter');
  await waitForScene(page, 'Settings');
  await page.waitForTimeout(250);
  // Цикл кадров стоит: оба нажатия приходят внутри одного кадра — как при низком FPS.
  await page.evaluate(() => (window as any).__ashen.pauseLoop());
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await page.evaluate(() => (window as any).__ashen.step(2));
  const volume = await page.evaluate(() => (window as any).__ashen.session.settings.musicVolume);
  await page.evaluate(() => (window as any).__ashen.resumeLoop());
  expect(volume).toBeCloseTo(0.3); // 50% − 2 × 10%
});
