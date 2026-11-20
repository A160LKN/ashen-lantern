import { describe, expect, it } from 'vitest';
import { evaluateAchievements, defaultProfile, loadProfile, saveProfile } from '../src/systems/Achievements';
import {
  addKill, addOil, addPotion, addXp, advanceLevel, buyUpgrade, createNewGame, getDerived, MAX_POTIONS, upgradeCost, usePotion, xpToNext,
} from '../src/systems/GameState';
import { applyQuestEvent, ensureLevelQuests, startQuest } from '../src/systems/Quests';
import { checksum, deleteSave, latestSlot, listSlots, loadGame, saveGame, sanitize, slotKey } from '../src/systems/SaveSystem';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from '../src/systems/Settings';
import { createMemoryStorage } from '../src/systems/Storage';

describe('прогрессия', () => {
  it('новая игра начинается с полным здоровьем', () => {
    const d = createNewGame();
    expect(d.player.hp).toBe(getDerived(d).maxHp);
    expect(d.levels).toHaveLength(3);
  });

  it('опыт повышает уровень и исцеляет', () => {
    const d = createNewGame();
    d.player.hp = 5;
    const gained = addXp(d, xpToNext(1) + xpToNext(2));
    expect(gained).toBe(2);
    expect(d.player.level).toBe(3);
    expect(d.player.hp).toBe(getDerived(d).maxHp);
  });

  it('улучшения стоят монет и ограничены', () => {
    const d = createNewGame();
    expect(buyUpgrade(d, 'blade').ok).toBe(false);
    d.inventory.coins = 10_000;
    const before = getDerived(d).damage;
    for (let i = 0; i < 5; i++) expect(buyUpgrade(d, 'blade').ok).toBe(true);
    expect(buyUpgrade(d, 'blade')).toEqual({ ok: false, reason: 'Максимальный уровень' });
    expect(getDerived(d).damage).toBe(before + 20);
    expect(upgradeCost('blade', 1)).toBe(30);
    expect(d.stats.upgradesBought).toBe(5);
  });

  it('живучесть сразу добавляет здоровье', () => {
    const d = createNewGame();
    d.inventory.coins = 100;
    const hp = d.player.hp;
    buyUpgrade(d, 'vitality');
    expect(d.player.hp).toBe(hp + 15);
  });

  it('зелья: лечение, лимит, пустой инвентарь', () => {
    const d = createNewGame();
    expect(usePotion(d)).toBe(0); // здоровье полное
    d.player.hp = 10;
    expect(usePotion(d)).toBeGreaterThan(0);
    expect(d.inventory.potions).toBe(0);
    expect(usePotion(d)).toBe(0);
    for (let i = 0; i < 20; i++) addPotion(d);
    expect(d.inventory.potions).toBe(MAX_POTIONS);
    addOil(d, 500);
    expect(d.player.oil).toBe(100);
  });

  it('переход на уровень сбрасывает осколки, на последнем — запрещён', () => {
    const d = createNewGame();
    d.inventory.shards = 3;
    expect(advanceLevel(d)).toBe(true);
    expect(d.inventory.shards).toBe(0);
    advanceLevel(d);
    expect(advanceLevel(d)).toBe(false);
    expect(d.levelIndex).toBe(2);
  });
});

describe('задания', () => {
  it('основные задания стартуют автоматически, побочные — через NPC', () => {
    const d = createNewGame();
    ensureLevelQuests(d);
    expect(d.quests.forest_shards.started).toBe(true);
    expect(d.quests.forest_slimes).toBeUndefined();
    for (let i = 0; i < 6; i++) applyQuestEvent(d, { type: 'kill', enemy: 'slime' });
    expect(d.quests.forest_slimes).toBeUndefined();
    startQuest(d, 'forest_slimes');
    const coins = d.inventory.coins;
    let completed = 0;
    for (let i = 0; i < 6; i++) completed += applyQuestEvent(d, { type: 'kill', enemy: 'slime' }).completed.length;
    expect(completed).toBe(1);
    expect(d.quests.forest_slimes.done).toBe(true);
    expect(d.inventory.coins).toBe(coins + 25);
  });

  it('осколки и маяк', () => {
    const d = createNewGame();
    ensureLevelQuests(d);
    applyQuestEvent(d, { type: 'shard', total: 2 });
    expect(d.quests.forest_shards.progress).toBe(2);
    expect(applyQuestEvent(d, { type: 'shard', total: 3 }).completed[0].id).toBe('forest_shards');
    expect(applyQuestEvent(d, { type: 'beacon' }).completed[0].id).toBe('forest_beacon');
  });
});

describe('сохранения', () => {
  it('сохраняет и загружает без потерь', () => {
    const s = createMemoryStorage();
    const d = createNewGame();
    d.inventory.coins = 42;
    d.levels[0].removed.push('*@3,2');
    addKill(d, 'slime');
    expect(saveGame(s, 1, d, 1000)).toBe(true);
    const r = loadGame(s, 1);
    expect(r.status).toBe('ok');
    if (r.status === 'ok') expect(r.data).toEqual(d);
  });

  it('пустой слот', () => {
    expect(loadGame(createMemoryStorage(), 2).status).toBe('empty');
  });

  it('повреждённый JSON и подмена данных обнаруживаются', () => {
    const s = createMemoryStorage();
    s.setItem(slotKey(1), '{oops');
    expect(loadGame(s, 1)).toMatchObject({ status: 'corrupted' });
    saveGame(s, 2, createNewGame());
    const env = JSON.parse(s.getItem(slotKey(2))!);
    env.data.inventory.coins = 99999;
    s.setItem(slotKey(2), JSON.stringify(env));
    expect(loadGame(s, 2)).toMatchObject({ status: 'corrupted', reason: 'Контрольная сумма не совпадает' });
  });

  it('сохранение из будущей версии отклоняется', () => {
    const s = createMemoryStorage();
    s.setItem(slotKey(1), JSON.stringify({ version: 99, data: {}, checksum: '', summary: {} }));
    expect(loadGame(s, 1).status).toBe('corrupted');
  });

  it('устаревшее сохранение v1 мигрирует', () => {
    const s = createMemoryStorage();
    const old = { levelIndex: 1, player: { level: 4, xp: 3, hp: 50, gold: 77 }, inventory: { potions: 2 } };
    s.setItem(slotKey(3), JSON.stringify({ version: 1, savedAt: 1, data: old }));
    const r = loadGame(s, 3);
    expect(r.status).toBe('ok');
    if (r.status === 'ok') {
      expect(r.migrated).toBe(true);
      expect(r.data.inventory.coins).toBe(77);
      expect(r.data.player.oil).toBe(100);
      expect(r.data.levelIndex).toBe(1);
      expect(r.data.levels).toHaveLength(3);
    }
  });

  it('sanitize ограничивает некорректные значения', () => {
    const d = sanitize({ levelIndex: 99, player: { level: -5, hp: 1e9, oil: 'x' }, upgrades: { blade: 100 }, inventory: { potions: 500 } })!;
    expect(d.levelIndex).toBe(2);
    expect(d.player.level).toBe(1);
    expect(d.player.hp).toBe(getDerived(d).maxHp);
    expect(d.player.oil).toBe(100);
    expect(d.upgrades.blade).toBe(5);
    expect(d.inventory.potions).toBe(MAX_POTIONS);
    expect(sanitize(null)).toBeNull();
    expect(sanitize({})).toBeNull();
  });

  it('список слотов и самое свежее сохранение', () => {
    const s = createMemoryStorage();
    saveGame(s, 0, createNewGame(), 100);
    saveGame(s, 2, createNewGame(), 500);
    s.setItem(slotKey(3), 'broken');
    const info = listSlots(s, [0, 1, 2, 3]);
    expect(info.map((i) => i.status)).toEqual(['ok', 'empty', 'ok', 'corrupted']);
    expect(latestSlot(s, [0, 1, 2, 3])).toBe(2);
    deleteSave(s, 2);
    expect(latestSlot(s, [0, 1, 2, 3])).toBe(0);
    expect(checksum('abc')).toBe(checksum('abc'));
    expect(checksum('abc')).not.toBe(checksum('abd'));
  });
});

describe('настройки и достижения', () => {
  it('настройки: значения по умолчанию, ограничение, повреждение', () => {
    const s = createMemoryStorage();
    expect(loadSettings(s)).toEqual(DEFAULT_SETTINGS);
    saveSettings(s, { ...DEFAULT_SETTINGS, musicVolume: 0.2, difficulty: 'hard' });
    expect(loadSettings(s)).toMatchObject({ musicVolume: 0.2, difficulty: 'hard' });
    s.setItem('ashen-lantern.settings', JSON.stringify({ musicVolume: 7, difficulty: 'nightmare' }));
    expect(loadSettings(s)).toMatchObject({ musicVolume: 1, difficulty: 'normal' });
    s.setItem('ashen-lantern.settings', '{{{');
    expect(loadSettings(s)).toEqual(DEFAULT_SETTINGS);
  });

  it('достижения открываются один раз и сохраняются в профиле', () => {
    const s = createMemoryStorage();
    const p = defaultProfile();
    const d = createNewGame();
    expect(evaluateAchievements(p, { data: d, event: 'tick' })).toEqual([]);
    addKill(d, 'slime');
    expect(evaluateAchievements(p, { data: d, event: 'tick' }).map((a) => a.id)).toEqual(['first_blood']);
    expect(evaluateAchievements(p, { data: d, event: 'tick' })).toEqual([]);
    expect(evaluateAchievements(p, { data: d, event: 'level_complete', levelDamageTaken: 0 }).map((a) => a.id)).toContain('untouchable');
    saveProfile(s, p);
    expect(Object.keys(loadProfile(s).unlocked)).toEqual(['first_blood', 'untouchable']);
  });
});
