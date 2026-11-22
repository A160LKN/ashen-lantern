import { expect, type Page } from '@playwright/test';

type Win = Window & { __ashen?: any };

/** Открывает игру с тестовым API и собирает ошибки консоли. */
export async function openGame(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?test');
  await waitForMenuReady(page);
  return errors;
}

/** Ждёт, пока сцена меню запущена и прошла хотя бы пара кадров (слушатели клавиатуры подключены). */
export async function waitForMenuReady(page: Page): Promise<void> {
  await page.waitForFunction(() => !!(window as Win).__ashen && (window as Win).__ashen.activeScenes().includes('Menu'));
  const f0 = await page.evaluate(() => (window as Win).__ashen.game.loop.frame);
  await page.waitForFunction((f) => (window as Win).__ashen.game.loop.frame > f + 2, f0);
}

export async function activeScenes(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as Win).__ashen.activeScenes());
}

export async function waitForScene(page: Page, key: string): Promise<void> {
  await expect.poll(() => activeScenes(page)).toContain(key);
}

export async function state(page: Page): Promise<any> {
  return page.evaluate(() => (window as Win).__ashen.state());
}

/** Пропускает экран «нажмите любую клавишу» (он же разблокирует звук). */
export async function unlockMenu(page: Page): Promise<void> {
  await waitForMenuReady(page);
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => (window as Win).__ashen.game.scene.getScene('Menu').buttons.length)).toBeGreaterThan(0);
  // Меню игнорирует ввод первые 150 мс — защита от «сквозного» нажатия.
  await page.waitForTimeout(250);
}

/** Пустое хранилище → кнопка «Продолжить» неактивна и фокус на «Новая игра». */
export async function startNewGame(page: Page): Promise<void> {
  await unlockMenu(page);
  await page.keyboard.press('Enter');
  await waitForScene(page, 'Game');
  await page.waitForTimeout(400);
}

export async function teleport(page: Page, tx: number, ty: number): Promise<void> {
  await page.evaluate(([x, y]) => (window as Win).__ashen.cheats.teleport(x, y), [tx, ty]);
}

export async function holdKey(page: Page, key: string, ms: number): Promise<void> {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
}

/**
 * Зажать клавишу на точное игровое время: событие клавиатуры настоящее,
 * а кадры прогоняются синхронно через тестовый API — результат не зависит от скорости машины.
 */
export async function holdKeyFrames(page: Page, key: string, frames: number): Promise<void> {
  await page.evaluate(() => (window as Win).__ashen.pauseLoop());
  await page.keyboard.down(key);
  await page.evaluate((n) => (window as Win).__ashen.step(n), frames);
  await page.keyboard.up(key);
  await page.evaluate(() => {
    (window as Win).__ashen.step(2);
    (window as Win).__ashen.resumeLoop();
  });
}

/**
 * Ждёт сцену по игровому, а не реальному времени: собственный цикл кадров останавливается,
 * кадры прогоняются синхронно, пока сцена не станет активной (не дольше maxFrames).
 * На медленной машине CI игровые 1–3 секунды могут занимать больше 10 секунд реального времени.
 */
export async function stepUntilScene(page: Page, key: string, maxFrames = 1200): Promise<void> {
  const ok = await page.evaluate(
    ([k, max]) => {
      const a = (window as Win).__ashen;
      a.pauseLoop();
      try {
        for (let i = 0; i < (max as number); i++) {
          if (a.activeScenes().includes(k)) return true;
          a.step(1);
        }
        return a.activeScenes().includes(k);
      } finally {
        a.resumeLoop();
      }
    },
    [key, maxFrames],
  );
  expect(ok, `сцена ${key} не открылась за ${maxFrames} кадров игрового времени`).toBe(true);
}
