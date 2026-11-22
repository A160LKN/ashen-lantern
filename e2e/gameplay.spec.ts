import { expect, test } from '@playwright/test';
import { holdKey, holdKeyFrames, openGame, stepUntilScene, startNewGame, state, teleport, waitForScene } from './helpers';

test.beforeEach(async ({ page }) => {
  await openGame(page);
  await startNewGame(page);
});

test('движение WASD и ускорение Shift', async ({ page }) => {
  await teleport(page, 8, 14);
  await page.waitForTimeout(100);
  const a = (await state(page)).player;
  await holdKeyFrames(page, 'KeyD', 36); // 0,6 с игрового времени
  const b = (await state(page)).player;
  const walk = b.x - a.x;
  expect(walk).toBeGreaterThan(40); // скорость 80 px/с → ≈ 48 px
  expect(walk).toBeLessThan(52);
  expect(b.y).toBe(a.y);

  await teleport(page, 5, 18); // строка 18 свободна от деревьев до ручья
  await page.waitForTimeout(100);
  const c = (await state(page)).player;
  await page.keyboard.down('ShiftLeft');
  await holdKeyFrames(page, 'KeyD', 36);
  await page.keyboard.up('ShiftLeft');
  const d = (await state(page)).player;
  expect(d.x - c.x).toBeGreaterThan(walk * 1.3);
});

test('коллизии: герой не проходит сквозь деревья на краю карты', async ({ page }) => {
  await teleport(page, 2, 16);
  await holdKey(page, 'KeyA', 1200);
  const p = (await state(page)).player;
  expect(p.x).toBeGreaterThanOrEqual(16 + 4); // край тайла x=1 плюс половина тела
});

test('диалог с NPC выдаёт побочное задание', async ({ page }) => {
  await teleport(page, 5, 11);
  await expect.poll(async () => (await state(page)).prompt).toBe('Говорить: Старый Хранитель');
  await page.keyboard.press('KeyE');
  await expect.poll(() => page.evaluate(() => !!(window as any).__ashen.game.scene.getScene('UI').dialog)).toBe(true);
  for (let i = 0; i < 20; i++) {
    const open = await page.evaluate(() => !!(window as any).__ashen.game.scene.getScene('UI').dialog);
    if (!open) break;
    await page.keyboard.press('Space');
    await page.waitForTimeout(60);
  }
  await expect.poll(async () => (await state(page)).quests.forest_slimes?.started).toBe(true);
});

test('бой: удары мечом убивают слизня, выпадает лут и опыт', async ({ page }) => {
  const slime = (await state(page)).enemies.find((e: any) => e.type === 'slime');
  const total = (await state(page)).enemies.length;
  await page.evaluate(() => (window as any).__ashen.cheats.godMode(true));
  // Становимся чуть левее слизня и бьём вправо
  await page.evaluate((s) => {
    const gs = (window as any).__ashen.game.scene.getScene('Game');
    gs.player.body.reset(s.x - 14, s.y - 5);
  }, slime);
  for (let i = 0; i < 25; i++) {
    const s = await state(page);
    if (s.enemies.length < total) break;
    const target = s.enemies.reduce((best: any, e: any) => (!best || Math.hypot(e.x - s.player.x, e.y - s.player.y) < Math.hypot(best.x - s.player.x, best.y - s.player.y) ? e : best), null);
    if (Math.hypot(target.x - s.player.x, target.y - s.player.y) > 24) {
      await page.evaluate((t) => (window as any).__ashen.game.scene.getScene('Game').player.body.reset(t.x - 14, t.y - 5), target);
    }
    const box = (await page.locator('canvas').boundingBox())!;
    // ЛКМ — удар в сторону курсора; целимся правее героя (камера ×3, герой примерно в центре)
    await page.mouse.click(box.x + box.width / 2 + 120, box.y + box.height / 2);
    await page.waitForTimeout(420);
  }
  // Рядом может погибнуть и второй враг, поэтому проверяем «меньше», а не «ровно на одного».
  await expect.poll(async () => (await state(page)).enemies.length).toBeLessThan(total);
  const s = await state(page);
  expect(s.xp).toBeGreaterThan(0);
  await expect.poll(async () => (await state(page)).inventory.coins).toBeGreaterThan(0); // монеты притягиваются магнитом
});

test('ключ открывает дверь, осколки зажигают маяк, портал ведёт на уровень 2', async ({ page }) => {
  await page.evaluate(() => (window as any).__ashen.cheats.godMode(true));
  // Ключ лежит на (35,20)
  await teleport(page, 35, 20);
  await expect.poll(async () => (await state(page)).inventory.keys).toBe(1);
  await teleport(page, 31, 7);
  await expect.poll(async () => (await state(page)).prompt).toBe('Отпереть дверь');
  await page.keyboard.press('KeyE');
  await expect.poll(async () => (await state(page)).inventory.keys).toBe(0);
  for (const [x, y] of [[31, 5], [3, 2], [24, 25]]) {
    await teleport(page, x, y);
    await page.waitForTimeout(150);
  }
  await expect.poll(async () => (await state(page)).inventory.shards).toBe(3);
  await teleport(page, 36, 12);
  await expect.poll(async () => (await state(page)).prompt).toBe('Зажечь маяк (3/3)');
  await page.keyboard.press('KeyE');
  await expect.poll(async () => (await state(page)).beaconLit).toBe(true);
  await expect.poll(async () => (await state(page)).prompt).toBe('Войти в портал');
  await page.keyboard.press('KeyE');
  await expect.poll(async () => (await state(page)).levelIndex, { timeout: 15_000 }).toBe(1);
  await waitForScene(page, 'Game');
});

test('гибель → экран поражения → возрождение с полным здоровьем', async ({ page }) => {
  await page.evaluate(() => (window as any).__ashen.cheats.setHp(1));
  const sk = (await state(page)).enemies.find((e: any) => e.type === 'skeleton');
  await page.evaluate((s) => (window as any).__ashen.game.scene.getScene('Game').player.body.reset(s.x + 10, s.y - 5), sk);
  // Скелет должен сам заметить героя, замахнуться и ударить; ждём по игровому времени (до 20 с).
  await stepUntilScene(page, 'GameOver');
  await page.waitForTimeout(250);
  await page.keyboard.press('Enter'); // «Возродиться у святилища»
  await waitForScene(page, 'Game');
  await expect.poll(async () => (await state(page)).hp).toBe(60);
});

test('босс: пробуждение, полоса здоровья, победа и финальный экран', async ({ page }) => {
  await page.evaluate(() => {
    const a = (window as any).__ashen;
    a.cheats.godMode(true);
    a.cheats.loadLevel(2);
  });
  await page.waitForTimeout(800);
  await teleport(page, 20, 8);
  await expect.poll(async () => (await state(page)).boss?.name, { timeout: 15_000 }).toBe('Пепельный Король');
  // Несколько настоящих ударов, затем ускоряем бой тестовой командой
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('Space');
    await page.waitForTimeout(400);
  }
  await page.evaluate(() => (window as any).__ashen.cheats.damageNearestEnemy(99999));
  await expect.poll(async () => (await state(page)).bossDefeated).toBe(true);
  expect((await state(page)).boss).toBeNull();
  await page.evaluate(() => (window as any).__ashen.cheats.give('shards', 2));
  // Ждём окончания разлёта (350 мс) и встаём точно на осколок из сердца босса.
  await page.waitForTimeout(600);
  const picked = await page.evaluate(() => {
    const gs = (window as any).__ashen.game.scene.getScene('Game');
    const p = gs.pickups.getChildren().find((c: any) => c.getData('id') === 'boss-shard');
    if (!p) return false;
    gs.player.body.reset(p.x, p.y - 3);
    return true;
  });
  expect(picked).toBe(true);
  await expect.poll(async () => (await state(page)).inventory.shards).toBe(3);
  await teleport(page, 20, 3);
  await expect.poll(async () => (await state(page)).prompt).toBe('Зажечь маяк (3/3)');
  await page.keyboard.press('KeyE');
  // Финальный экран открывается через 2,6 с игрового времени после того, как маяк загорелся.
  await stepUntilScene(page, 'Victory', 600);
});
