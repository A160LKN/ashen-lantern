import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      // Покрытие меряется для логики без движка; сцены и графика проверяются E2E-тестами в браузере.
      include: [
        'src/core/StateMachine.ts', 'src/core/rng.ts', 'src/world/grid.ts', 'src/world/levelParser.ts', 'src/world/loot.ts',
        'src/systems/GameState.ts', 'src/systems/Quests.ts', 'src/systems/SaveSystem.ts', 'src/systems/Settings.ts',
        'src/systems/Achievements.ts', 'src/systems/Storage.ts',
      ],
      thresholds: { lines: 90, functions: 90, branches: 85, statements: 90 },
    },
  },
});
