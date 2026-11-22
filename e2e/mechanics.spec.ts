/**
 * Механики, которые раньше проверялись только по коду (кейсы со статусом «не выполнялся»).
 * Время везде игровое: цикл кадров останавливается, кадры прогоняются синхронно.
 */
import { expect, test, type Page } from '@playwright/test';
import { openGame, startNewGame, state, teleport, waitForScene } from './helpers';

const A = (page: Page, fn: string, arg?: unknown) =>
  page.evaluate(([f, a]) => new Function('A', 'arg', f)((window as any).__ashen, a), [fn, arg] as const);

/** Прогнать кадры игровой логики (без отрисовки) при остановленном цикле. */
async function frames(page: Page, n: number): Promise<void> {
  await page.evaluate((k) => {
    const a = (window as any).__ashen;
    a.pauseLoop();
    a.stepLogic(k);
    a.resumeLoop();
  }, n);
}

/** Зажать клавиши на n кадров игрового времени (события клавиатуры — настоящие). */
async function holdFrames(page: Page, keys: string[], n: number): Promise<void> {
  await A(page, 'A.pauseLoop()');
  for (const k of keys) await page.keyboard.down(k);
  await A(page, 'A.stepLogic(arg)', n);
  for (const k of keys) await page.keyboard.up(k);
  await A(page, 'A.stepLogic(2); A.resumeLoop()');
}

/** Нажать клавишу и прогнать пару кадров, чтобы игра её обработала. */
async function tap(page: Page, key: string): Promise<void> {
  await A(page, 'A.pauseLoop()');
  await page.keyboard.press(key);
  await A(page, 'A.stepLogic(3); A.resumeLoop()');
}

const toasts = (page: Page) =>
  page.evaluate(() =>
    (window as any).__ashen.game.scene.getScene('UI').toasts.map((c: any) => c.list.find((o: any) => o.type === 'Text')?.text),
  );

const game = 'const g = A.game.scene.getScene("Game");';

test.beforeEach(async ({ page }) => {
  await openGame(page);
  await startNewGame(page);
});

test('TC-CTRL-03: бег тратит выносливость, после паузы она восстанавливается', async ({ page }) => {
  await teleport(page, 5, 18);
  const max = (await A(page, `${game} return g.player.stamina`)) as number;
  await page.keyboard.down('ShiftLeft');
  await holdFrames(page, ['KeyD'], 30); // 0,5 с бега: −16 при расходе 32/с
  await page.keyboard.up('ShiftLeft');
  const afterRun = (await A(page, `${game} return g.player.stamina`)) as number;
  expect(afterRun).toBeLessThan(max - 12);
  await frames(page, 30); // задержка восстановления 0,7 с — ещё не восстановилась
  expect((await A(page, `${game} return g.player.stamina`)) as number).toBeCloseTo(afterRun, 0);
  await frames(page, 120); // ещё 2 с: восстановление 26/с
  expect((await A(page, `${game} return g.player.stamina`)) as number).toBe(max);
});

test('TC-CTRL-03: при выносливости ниже 5 удар не выполняется', async ({ page }) => {
  await A(page, `${game} g.player.stamina = 3;`);
  await tap(page, 'Space');
  expect(await A(page, `${game} return g.player.pstate`)).toBe('move');
  await A(page, `${game} g.player.stamina = 50;`);
  await tap(page, 'Space');
  expect(await A(page, `${game} return g.player.pstate`)).toBe('attack');
});

test('TC-CTRL-04: по диагонали герой не быстрее, чем по прямой', async ({ page }) => {
  await teleport(page, 6, 20);
  const a = (await state(page)).player;
  await holdFrames(page, ['KeyD', 'KeyS'], 30);
  const b = (await state(page)).player;
  const diag = Math.hypot(b.x - a.x, b.y - a.y);
  expect(diag).toBeGreaterThan(36); // 80 px/с × 0,5 с = 40
  expect(diag).toBeLessThan(44);
});

test('TC-CTRL-05: клавиша, отпущенная во время паузы, не «залипает»', async ({ page }) => {
  await teleport(page, 4, 12); // у старта: рядом нет врагов, которые могли бы отбросить героя
  await page.keyboard.down('KeyD');
  await frames(page, 5);
  await tap(page, 'Escape');
  await waitForScene(page, 'Pause');
  await page.keyboard.up('KeyD'); // отпускаем, пока игра на паузе
  await page.waitForTimeout(250);
  await page.keyboard.press('Escape');
  await waitForScene(page, 'Game');
  const a = (await state(page)).player;
  await frames(page, 30);
  const b = (await state(page)).player;
  expect(b.x).toBe(a.x);
  expect((await state(page)).hp).toBe(60); // героя никто не ударил — смещение не от отбрасывания
});

test('TC-WORLD-06: при малом запасе масла свет слабеет и появляется предупреждение', async ({ page }) => {
  const full = (await A(page, `${game} return g.playerLight.radius`)) as number;
  await A(page, 'A.session.data.player.oil = 14');
  await frames(page, 3);
  const low = (await A(page, `${game} return g.playerLight.radius`)) as number;
  const lightRadius = 60; // базовый радиус без улучшений
  expect(low).toBeCloseTo(lightRadius * (0.45 + 0.55 * 0.14), 0);
  expect(low).toBeLessThan(full);
  expect(await toasts(page)).toContain('Масло на исходе — свет фонаря слабеет');
  // Масло расходуется: за 10 с игрового времени — 6 единиц (0,6/с)
  // Масло расходуется 0,6 в секунду: за 2 с игрового времени — 1,2 единицы
  await A(page, 'A.session.data.player.oil = 50');
  await frames(page, 120);
  expect((await state(page)).oil).toBeCloseTo(48.8, 0);
});

test('TC-INT-03: дверь без ключа не открывается', async ({ page }) => {
  await teleport(page, 31, 7);
  await frames(page, 3);
  expect((await state(page)).prompt).toBe('Дверь заперта');
  await tap(page, 'KeyE');
  expect(await toasts(page)).toContain('Заперто. Нужен ключ');
  expect((await state(page)).prompt).toBe('Дверь заперта');
  expect(await A(page, 'return A.session.data.levels[0].removed.includes("D@31,6")')).toBe(false);
});

test('TC-INT-09: Q лечит и тратит зелье; при полном здоровье — отказ без траты', async ({ page }) => {
  await tap(page, 'KeyQ');
  expect((await state(page)).inventory.potions).toBe(1);
  expect(await toasts(page)).toContain('Здоровье и так полное');
  await A(page, 'A.session.data.player.hp = 20');
  await tap(page, 'KeyQ');
  const s = await state(page);
  expect(s.inventory.potions).toBe(0);
  expect(s.hp).toBe(20 + Math.ceil(60 * 0.45));
  await tap(page, 'KeyQ');
  expect(await toasts(page)).toContain('Нет зелий');
});

test('TC-INT-10: горшок разбивается ударом и освобождает клетку', async ({ page }) => {
  await teleport(page, 7, 21); // горшок на (7,22) — бьём вниз
  await frames(page, 3);
  await A(page, `${game} g.queuedAttack = true; g.queuedAim = Math.PI / 2;`);
  await frames(page, 20);
  expect(await A(page, 'return A.session.data.levels[0].removed.includes("p@7,22")')).toBe(true);
  expect(await A(page, `${game} return g.grid.solid[22 * g.grid.w + 7]`)).toBe(0);
});

test('TC-AI-04: враг теряет героя и возвращается к месту патруля', async ({ page }) => {
  await A(page, 'A.cheats.godMode(true)');
  const home = (await A(page, `${game} const e = g.enemies.find(e => e.def.type === "skeleton"); return { x: e.home.x, y: e.home.y }`)) as { x: number; y: number };
  await A(page, `${game} g.player.body.reset(arg.x + 40, arg.y)`, home);
  await frames(page, 30);
  expect(await A(page, `${game} return g.enemies.find(e => e.def.type === "skeleton").aiState`)).toMatch(/chase|attack|hurt/);
  await teleport(page, 3, 24); // далеко, за деревьями
  let st = '';
  for (let i = 0; i < 40 && !['idle', 'patrol'].includes(st); i++) {
    await frames(page, 30);
    st = (await A(page, `${game} return g.enemies.find(e => e.def.type === "skeleton").aiState`)) as string;
  }
  expect(['idle', 'patrol']).toContain(st);
  const d = (await A(page, `${game} const e = g.enemies.find(e => e.def.type === "skeleton"); return Math.hypot(e.cx - e.home.x, e.cy - e.home.y)`)) as number;
  expect(d).toBeLessThan(80); // вернулся в район патруля (радиус патруля — 4 клетки)
});

test('TC-AI-05: после удара 0,85 с неуязвимости', async ({ page }) => {
  const hit = `${game} return g.damagePlayer(10, g.player.x + 10, g.player.y)`;
  expect(await A(page, hit)).toBe(true);
  const hp1 = (await state(page)).hp;
  await frames(page, 30); // 0,5 с
  expect(await A(page, hit)).toBe(false);
  expect((await state(page)).hp).toBe(hp1);
  await frames(page, 25); // всего ≈ 0,92 с
  expect(await A(page, hit)).toBe(true);
  expect((await state(page)).hp).toBeLessThan(hp1);
});

test('TC-PROG-01: маяк без осколков не зажигается и называет недостающее количество', async ({ page }) => {
  await teleport(page, 36, 12);
  await frames(page, 3);
  expect((await state(page)).prompt).toBe('Зажечь маяк (0/3)');
  await tap(page, 'KeyE');
  expect(await toasts(page)).toContain('Маяк холоден. Нужно ещё осколков: 3');
  expect((await state(page)).beaconLit).toBe(false);
});

test('Уведомлений на экране одновременно не больше 4', async ({ page }) => {
  await page.evaluate(() => {
    const ui = (window as any).__ashen.game.scene.getScene('UI');
    for (let i = 0; i < 7; i++) ui.toast(`Сообщение ${i}`, '#ffffff');
  });
  const list = await toasts(page);
  expect(list.length).toBe(4);
  expect(list[0]).toBe('Сообщение 6'); // свежие сверху
});

test('Звук: у уровня своя музыка и фон; без звукового устройства трек ждёт в очереди', async ({ page }) => {
  // В CI у Firefox нет звукового устройства, и контекст может остаться приостановленным.
  // Тогда проверяем, что трек уровня поставлен в очередь и запустится, как только звук станет доступен (BUG-014).
  const check = async (track: string) => {
    const a = (await A(page, 'return A.audio()')) as any;
    expect(a.ambient).toBe(track);
    if (a.context === 'running') {
      expect(a.track).toBe(track);
      expect(a.sequencer).toBe(true);
      expect(a.ambientPlaying).toBe(true);
    } else {
      expect(a.context).toBe('suspended');
      expect(a.pendingTrack).toBe(track);
    }
  };
  await expect.poll(async () => ((await A(page, 'return A.audio()')) as any).ambient).toBe('forest');
  await check('forest');
  await A(page, 'A.cheats.loadLevel(1)');
  await expect.poll(async () => ((await A(page, 'return A.audio()')) as any).ambient).toBe('crypt');
  await check('crypt');
});

test('Подписки на события не копятся при перезапуске сцен (регрессия BUG-012)', async ({ page }) => {
  const counts = () =>
    page.evaluate(() => {
      const a = (window as any).__ashen;
      const g = a.game.scene.getScene('Game');
      const ui = a.game.scene.getScene('UI');
      return { resume: g.events.listenerCount('resume'), gamePointer: g.input.listenerCount('pointerdown'), uiPointer: ui.input.listenerCount('pointerdown') };
    });
  const before = await counts();
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => {
      const a = (window as any).__ashen;
      a.game.scene.getScene('Game').scene.restart();
      a.pauseLoop();
      a.step(5);
      a.resumeLoop();
    });
  }
  expect(await counts()).toEqual(before);
});
