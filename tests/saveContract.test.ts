/**
 * Контрактные тесты формата сохранений: всё, что пишет игра, соответствует JSON Schema,
 * а sanitize() из любого мусора делает данные, проходящие схему.
 */
import Ajv from 'ajv';
import { describe, expect, it } from 'vitest';
import schema from '../schemas/save.schema.json';
import { mulberry32 } from '../src/core/rng';
import { addKill, addXp, advanceLevel, buyUpgrade, createNewGame } from '../src/systems/GameState';
import { applyQuestEvent, ensureLevelQuests, startQuest } from '../src/systems/Quests';
import { sanitize, saveGame, slotKey } from '../src/systems/SaveSystem';
import { createMemoryStorage } from '../src/systems/Storage';

const ajv = new Ajv({ allErrors: true });
const validate = ajv.compile(schema);
const errors = () => ajv.errorsText(validate.errors);

function envelopeOf(data: ReturnType<typeof createNewGame>) {
  const s = createMemoryStorage();
  saveGame(s, 1, data, 1_700_000_000_000);
  return JSON.parse(s.getItem(slotKey(1))!);
}

describe('контракт сохранения', () => {
  it('новая игра', () => {
    expect(validate(envelopeOf(createNewGame())), errors()).toBe(true);
  });

  it('прогресс в середине игры', () => {
    const d = createNewGame();
    ensureLevelQuests(d);
    startQuest(d, 'forest_slimes');
    for (let i = 0; i < 6; i++) {
      addKill(d, 'slime');
      applyQuestEvent(d, { type: 'kill', enemy: 'slime' });
    }
    addXp(d, 500);
    d.inventory.coins = 400;
    buyUpgrade(d, 'blade');
    buyUpgrade(d, 'lantern');
    d.levels[0].removed.push('*@3,2', 'D@31,6');
    d.levels[0].checkpoint = { x: 104, y: 232 };
    d.levels[0].beaconLit = true;
    advanceLevel(d);
    expect(validate(envelopeOf(d)), errors()).toBe(true);
  });

  it('схема ловит нарушения контракта', () => {
    const env = envelopeOf(createNewGame());
    const broken = [
      { ...env, version: 3 },
      { ...env, checksum: 'XYZ' },
      { ...env, data: { ...env.data, levelIndex: 7 } },
      { ...env, data: { ...env.data, inventory: { ...env.data.inventory, potions: 42 } } },
      { ...env, data: { ...env.data, upgrades: { ...env.data.upgrades, blade: 9 } } },
      { ...env, data: { ...env.data, extra: true } },
    ];
    for (const b of broken) expect(validate(b)).toBe(false);
  });

  it('фаззинг: sanitize превращает случайный мусор в данные по схеме', () => {
    const rnd = mulberry32(2024);
    const junk = (depth: number): unknown => {
      const r = rnd();
      if (depth > 3 || r < 0.15) return [null, true, -1e12, 1e12, NaN, 'x', 3.7, -0][Math.floor(rnd() * 8)];
      if (r < 0.3) return Array.from({ length: Math.floor(rnd() * 4) }, () => junk(depth + 1));
      const keys = ['levelIndex', 'player', 'level', 'xp', 'hp', 'oil', 'upgrades', 'blade', 'inventory', 'potions', 'coins', 'levels', 'removed', 'checkpoint', 'x', 'y', 'quests', 'stats', 'kills', 'playTimeMs'];
      const o: Record<string, unknown> = {};
      for (let i = 0; i < 6; i++) o[keys[Math.floor(rnd() * keys.length)]] = junk(depth + 1);
      return o;
    };
    let accepted = 0;
    for (let i = 0; i < 500; i++) {
      const raw = junk(0) as Record<string, unknown>;
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) raw.player = junk(1);
      const d = sanitize(raw);
      if (!d) continue;
      accepted++;
      expect(validate(envelopeOf(d)), errors()).toBe(true);
    }
    expect(accepted).toBeGreaterThan(50);
  });
});
