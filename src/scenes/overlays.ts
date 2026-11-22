/** Экраны поверх игры и меню. Каждый открывается через openOverlay и возвращается в вызвавшую сцену. */
import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, SAVE_SLOTS } from '../config';
import { ACHIEVEMENTS } from '../data/achievements';
import { LEVELS } from '../data/levels';
import { UPGRADES, UPGRADE_MAX } from '../data/upgrades';
import { ICON } from '../graphics/objects';
import { audio } from '../systems/Audio';
import { buyUpgrade, createNewGame, currentLevel, getDerived, totalKills, upgradeCost, usePotion, xpToNext } from '../systems/GameState';
import { levelQuests } from '../systems/Quests';
import { deleteSave, formatTime, listSlots, loadGame, saveGame } from '../systems/SaveSystem';
import { DIFFICULTY, type Difficulty } from '../systems/Settings';
import { checkAchievements, goToMenu, launchGame, persistSettings, Session } from '../systems/Session';
import { closeOverlay, COLORS, dim, icon, MenuList, onSceneEvent, onSceneKeyDown, openOverlay, panel, text, UIButton } from '../ui/widgets';

type OverlayData = { from?: string; [k: string]: unknown };

abstract class Overlay extends Phaser.Scene {
  protected from?: string;
  protected list: MenuList | null = null;
  /** true после первой отрисовки — повторные перестройки не включают задержку ввода. */
  protected built = false;
  private resumeHooked = false;

  init(d: OverlayData): void {
    this.from = d.from;
    this.built = false;
  }

  protected frame(w: number, h: number, title: string): { cx: number; cy: number; top: number; left: number } {
    dim(this, 0.65);
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    panel(this, cx, cy, w, h, 'panel');
    text(this, cx, cy - h / 2 + 34, title, 30, COLORS.gold).setOrigin(0.5);
    // frame() вызывается и при перестройке экрана — подписываемся один раз за запуск сцены.
    if (!this.resumeHooked) {
      this.resumeHooked = true;
      onSceneEvent(this, Phaser.Scenes.Events.RESUME, () => {
        this.input.keyboard?.resetKeys();
        this.onResumed();
      });
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        this.resumeHooked = false;
      });
    }
    return { cx, cy, top: cy - h / 2, left: cx - w / 2 };
  }

  protected onResumed(): void {}

  protected close(): void {
    closeOverlay(this, this.from);
  }
}

// ------------------------------------------------------------------ Пауза
export class PauseScene extends Overlay {
  constructor() {
    super('Pause');
  }

  create(): void {
    const { cx, top } = this.frame(380, 420, 'ПАУЗА');
    const entries: [string, () => void][] = [
      ['Продолжить', () => this.close()],
      ['Сохранить', () => openOverlay(this, 'SaveLoad', { mode: 'save' })],
      ['Загрузить', () => openOverlay(this, 'SaveLoad', { mode: 'load' })],
      ['Настройки', () => openOverlay(this, 'Settings')],
      ['Как играть', () => openOverlay(this, 'Help')],
      ['Главное меню', () => goToMenu(this)],
    ];
    const btns = entries.map(([l, fn], i) => new UIButton(this, cx, top + 96 + i * 52, 280, 42, l, fn));
    this.list = new MenuList(this, btns.map((btn) => ({ btn })), { onCancel: () => this.close() });
    const d = Session.data;
    if (d) text(this, cx, top + 400, `${LEVELS[d.levelIndex].name} · ${formatTime(d.stats.playTimeMs)}`, 14, COLORS.dim).setOrigin(0.5);
  }
}

// ------------------------------------------------------------------ Настройки
export class SettingsScene extends Overlay {
  constructor() {
    super('Settings');
  }

  create(): void {
    const { cx, top } = this.frame(560, 440, 'НАСТРОЙКИ');
    const s = Session.settings;
    const diffs: Difficulty[] = ['easy', 'normal', 'hard'];
    const pct = (v: number) => `${Math.round(v * 100)}%`;
    const apply = () => {
      persistSettings();
      audio.setVolumes(s.musicVolume, s.sfxVolume);
      refresh();
    };
    const step = (key: 'musicVolume' | 'sfxVolume', d: number) => {
      s[key] = Math.round(Math.min(1, Math.max(0, s[key] + d)) * 10) / 10;
      apply();
      if (key === 'sfxVolume') audio.play('coin');
    };
    const cycleDiff = (d: number) => {
      s.difficulty = diffs[(diffs.indexOf(s.difficulty) + d + diffs.length) % diffs.length];
      apply();
    };
    const rows: { label: string; value: () => string; left: () => void; right: () => void }[] = [
      { label: 'Музыка', value: () => pct(s.musicVolume), left: () => step('musicVolume', -0.1), right: () => step('musicVolume', 0.1) },
      { label: 'Звуки', value: () => pct(s.sfxVolume), left: () => step('sfxVolume', -0.1), right: () => step('sfxVolume', 0.1) },
      { label: 'Тряска экрана', value: () => (s.screenShake ? 'Вкл' : 'Выкл'), left: () => { s.screenShake = !s.screenShake; apply(); }, right: () => { s.screenShake = !s.screenShake; apply(); } },
      { label: 'Показывать FPS', value: () => (s.showFps ? 'Вкл' : 'Выкл'), left: () => { s.showFps = !s.showFps; apply(); }, right: () => { s.showFps = !s.showFps; apply(); } },
      { label: 'Сложность', value: () => DIFFICULTY[s.difficulty].label, left: () => cycleDiff(-1), right: () => cycleDiff(1) },
    ];
    const items: { btn: UIButton; onLeft?: () => void; onRight?: () => void }[] = [];
    const valueBtns: UIButton[] = [];
    rows.forEach((r, i) => {
      const y = top + 100 + i * 56;
      text(this, cx - 240, y, r.label, 20).setOrigin(0, 0.5);
      const minus = new UIButton(this, cx + 40, y, 42, 42, '◄', r.left);
      const val = new UIButton(this, cx + 140, y, 140, 42, r.value(), r.right);
      const plus = new UIButton(this, cx + 240, y, 42, 42, '►', r.right);
      valueBtns.push(val);
      items.push({ btn: val, onLeft: r.left, onRight: r.right });
      // Боковые кнопки управляются мышью; клавиатура — стрелками влево/вправо.
      minus.label.setFontSize(16);
      plus.label.setFontSize(16);
    });
    const refresh = () => rows.forEach((r, i) => valueBtns[i].setLabel(r.value()));
    text(this, cx, top + 382, 'Сложность влияет на здоровье врагов и получаемый урон', 14, COLORS.dim).setOrigin(0.5);
    const back = new UIButton(this, cx, top + 412, 220, 40, 'Назад', () => this.close());
    items.push({ btn: back });
    this.list = new MenuList(this, items, { onCancel: () => this.close() });
  }
}

// ------------------------------------------------------------------ Сохранение / загрузка
export class SaveLoadScene extends Overlay {
  private mode: 'save' | 'load' = 'load';
  private status!: Phaser.GameObjects.Text;

  constructor() {
    super('SaveLoad');
  }

  init(d: OverlayData): void {
    super.init(d);
    this.mode = d.mode === 'save' ? 'save' : 'load';
  }

  create(): void {
    this.build();
  }

  private build(focus = 0): void {
    this.children.removeAll(true);
    this.list?.destroy();
    const { cx, top } = this.frame(700, 470, this.mode === 'save' ? 'СОХРАНИТЬ ИГРУ' : 'ЗАГРУЗИТЬ ИГРУ');
    const slots = listSlots(Session.storage, SAVE_SLOTS);
    const items: { btn: UIButton; onRight?: () => void }[] = [];
    slots.forEach((info, i) => {
      const y = top + 100 + i * 74;
      const name = info.slot === 0 ? 'Автосохранение' : `Слот ${info.slot}`;
      let desc = 'Пусто';
      if (info.status === 'ok' && info.summary) {
        const date = new Date(info.savedAt ?? 0).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        desc = `${info.summary.levelName} · ур. ${info.summary.playerLevel} · ${formatTime(info.summary.playTimeMs)} · ${date}`;
      } else if (info.status === 'corrupted') desc = `Повреждено: ${info.reason}`;
      const canSave = this.mode === 'save' && info.slot !== 0;
      const canLoad = this.mode === 'load' && info.status === 'ok';
      const btn = new UIButton(this, cx - 50, y, 560, 60, '', () => this.useSlot(info.slot, info.status));
      btn.label.setText('');
      text(this, cx - 316, y - 12, name, 20, info.status === 'corrupted' ? COLORS.red : COLORS.gold).setOrigin(0, 0.5);
      text(this, cx - 316, y + 13, desc, 15, info.status === 'ok' ? COLORS.text : COLORS.dim).setOrigin(0, 0.5);
      btn.setEnabled(canSave || canLoad);
      const del = new UIButton(this, cx + 290, y, 60, 60, '✕', () => this.deleteSlot(info.slot, del));
      del.setEnabled(info.status !== 'empty');
      items.push({ btn, onRight: () => del.press() });
    });
    this.status = text(this, cx, top + 404, this.mode === 'save' ? 'Выберите слот (позиция — у последнего святилища)' : 'Выберите сохранение · ✕ — удалить', 15, COLORS.dim).setOrigin(0.5);
    const back = new UIButton(this, cx, top + 438, 220, 40, 'Назад', () => this.close());
    items.push({ btn: back });
    this.list = new MenuList(this, items, { onCancel: () => this.close(), instant: this.built });
    this.built = true;
    if (items[focus]?.btn.enabled) this.list.focus(focus);
  }

  private useSlot(slot: number, status: string): void {
    if (this.mode === 'save') {
      if (!Session.data) return;
      const ok = saveGame(Session.storage, slot, Session.data);
      audio.play(ok ? 'save' : 'denied');
      this.build(slot);
      this.status.setText(ok ? `Игра сохранена в слот ${slot}` : 'Не удалось сохранить (хранилище недоступно)').setColor(ok ? COLORS.green : COLORS.red);
      return;
    }
    if (status !== 'ok') return;
    const r = loadGame(Session.storage, slot);
    if (r.status !== 'ok') {
      audio.play('denied');
      this.status.setText(r.status === 'corrupted' ? `Ошибка: ${r.reason}` : 'Слот пуст').setColor(COLORS.red);
      return;
    }
    launchGame(this, r.data);
  }

  private deleteSlot(slot: number, btn: UIButton): void {
    if (btn.label.text !== 'Да?') {
      btn.setLabel('Да?');
      this.status.setText('Нажмите ещё раз, чтобы удалить сохранение').setColor(COLORS.red);
      return;
    }
    deleteSave(Session.storage, slot);
    this.build(slot);
    this.status.setText('Сохранение удалено').setColor(COLORS.dim);
  }
}

// ------------------------------------------------------------------ Достижения
export class AchievementsScene extends Overlay {
  constructor() {
    super('Achievements');
  }

  create(): void {
    const { cx, top, left } = this.frame(840, 500, 'ДОСТИЖЕНИЯ');
    const un = Session.profile.unlocked;
    const got = ACHIEVEMENTS.filter((a) => un[a.id]).length;
    text(this, cx, top + 64, `Открыто ${got} из ${ACHIEVEMENTS.length} · Побед: ${Session.profile.wins} · Гибелей: ${Session.profile.deaths}`, 15, COLORS.dim).setOrigin(0.5);
    ACHIEVEMENTS.forEach((a, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = left + 30 + col * 400;
      const y = top + 104 + row * 54;
      const ok = !!un[a.id];
      panel(this, x + 190, y, 384, 48, ok ? 'slotActive' : 'slot');
      icon(this, x + 24, y, ok ? ICON.star : ICON.lock);
      text(this, x + 46, y - 10, a.title, 17, ok ? COLORS.gold : COLORS.dim).setOrigin(0, 0.5);
      text(this, x + 46, y + 11, a.desc, 13, ok ? COLORS.text : '#6c6482').setOrigin(0, 0.5);
    });
    const back = new UIButton(this, cx, top + 466, 220, 40, 'Назад', () => this.close());
    this.list = new MenuList(this, [{ btn: back }], { onCancel: () => this.close() });
  }
}

// ------------------------------------------------------------------ Помощь
export class HelpScene extends Overlay {
  constructor() {
    super('Help');
  }

  create(): void {
    const { cx, top, left } = this.frame(820, 500, 'КАК ИГРАТЬ');
    const controls = [
      ['WASD / стрелки', 'движение'],
      ['Shift', 'бег (тратит выносливость)'],
      ['Пробел / ЛКМ', 'удар мечом (ЛКМ — в сторону курсора)'],
      ['E', 'взаимодействие'],
      ['Q', 'выпить зелье'],
      ['I / Tab', 'инвентарь и журнал'],
      ['Esc', 'пауза'],
    ];
    controls.forEach(([k, v], i) => {
      text(this, left + 40, top + 90 + i * 32, k, 18, COLORS.gold).setOrigin(0, 0.5);
      text(this, left + 230, top + 90 + i * 32, v, 18).setOrigin(0, 0.5);
    });
    const goal = [
      'Цель: на каждом уровне соберите осколки угля и зажгите маяк — он откроет портал дальше.',
      'Фонарь тратит масло: чем его меньше, тем слабее свет. Ищите фляги с маслом.',
      'Святилища исцеляют, сохраняют прогресс и продают улучшения за монеты.',
      'Запертые двери открываются ключами. Горшки можно разбивать. В финале ждёт Пепельный Король.',
    ];
    text(this, left + 40, top + 330, goal.join('\n'), 16, COLORS.text, { wordWrap: { width: 740 }, lineSpacing: 6 });
    const back = new UIButton(this, cx, top + 466, 220, 40, 'Назад', () => this.close());
    this.list = new MenuList(this, [{ btn: back }], { onCancel: () => this.close() });
  }
}

// ------------------------------------------------------------------ Инвентарь
export class InventoryScene extends Overlay {
  constructor() {
    super('Inventory');
  }

  create(): void {
    this.build();
    const opened = performance.now();
    const onKey = (e: KeyboardEvent) => {
      if ((e.code === 'KeyI' || e.code === 'Tab') && performance.now() - opened > 150) this.close();
    };
    onSceneKeyDown(this, onKey);
  }

  private build(): void {
    this.children.removeAll(true);
    this.list?.destroy();
    const d = Session.data!;
    const der = getDerived(d);
    const { cx, top, left } = this.frame(900, 500, 'СНАРЯЖЕНИЕ И ЖУРНАЛ');
    // Предметы
    text(this, left + 40, top + 76, 'Предметы', 20, COLORS.gold).setOrigin(0, 0.5);
    const items: [number, string, string, string][] = [
      [ICON.potion, 'Зелье здоровья', `×${d.inventory.potions}`, 'Восстанавливает 45% здоровья (Q)'],
      [ICON.coin, 'Монеты', `${d.inventory.coins}`, 'Тратятся в святилищах на улучшения'],
      [ICON.key, 'Ключи', `×${d.inventory.keys}`, 'Открывают запертые двери уровня'],
      [ICON.shard, 'Осколки угля', `${d.inventory.shards}/${LEVELS[d.levelIndex].shardsRequired}`, 'Нужны, чтобы зажечь маяк'],
      [ICON.oil, 'Масло фонаря', `${Math.round(d.player.oil)}%`, 'Чем больше масла, тем дальше свет'],
    ];
    items.forEach(([ic, name, count, desc], i) => {
      const y = top + 116 + i * 54;
      panel(this, left + 180, y, 300, 48, 'slot');
      icon(this, left + 54, y, ic);
      text(this, left + 78, y - 10, name, 16).setOrigin(0, 0.5);
      text(this, left + 78, y + 11, desc, 12, COLORS.dim).setOrigin(0, 0.5);
      text(this, left + 318, y - 10, count, 16, COLORS.gold).setOrigin(1, 0.5);
    });
    const use = new UIButton(this, left + 180, top + 400, 300, 40, 'Выпить зелье', () => {
      const healed = usePotion(d);
      audio.play(healed > 0 ? 'potion' : 'denied');
      this.build();
    });
    use.setEnabled(d.inventory.potions > 0 && d.player.hp < der.maxHp);

    // Характеристики
    const sx = left + 370;
    text(this, sx, top + 76, 'Носитель Фонаря', 20, COLORS.gold).setOrigin(0, 0.5);
    const stats: [string, string][] = [
      ['Уровень', `${d.player.level}  (${d.player.xp}/${xpToNext(d.player.level)} опыта)`],
      ['Здоровье', `${Math.ceil(d.player.hp)} / ${der.maxHp}`],
      ['Урон', `${der.damage}  (крит ${Math.round(der.critChance * 100)}%)`],
      ['Скорость', `${der.speed}  (бег ${der.sprintSpeed})`],
      ['Выносливость', `${der.maxStamina}`],
      ['Радиус света', `${der.lightRadius}`],
      ['Улучшения', UPGRADES.map((u) => d.upgrades[u.key]).join(' · ')],
      ['Убито врагов', `${totalKills(d)}`],
      ['Сундуков', `${d.stats.chestsOpened}`],
      ['Время в игре', formatTime(d.stats.playTimeMs)],
    ];
    stats.forEach(([k, v], i) => {
      text(this, sx, top + 108 + i * 28, k, 15, COLORS.dim).setOrigin(0, 0.5);
      text(this, sx + 130, top + 108 + i * 28, v, 15).setOrigin(0, 0.5);
    });

    // Журнал заданий
    const qx = left + 640;
    text(this, qx, top + 76, 'Задания', 20, COLORS.gold).setOrigin(0, 0.5);
    let y = top + 108;
    for (const q of levelQuests(d.levelIndex)) {
      const st = d.quests[q.id];
      if (!st?.started) continue;
      const prog = q.count > 1 ? ` (${Math.min(st.progress, q.count)}/${q.count})` : '';
      text(this, qx, y, `${st.done ? '✓' : '•'} ${q.title}${prog}`, 14, st.done ? COLORS.green : q.optional ? COLORS.blue : COLORS.text, { wordWrap: { width: 220 } }).setOrigin(0, 0);
      y += 44;
    }
    const lp = currentLevel(d);
    text(this, qx, top + 370, lp.beaconLit ? 'Маяк уровня зажжён' : 'Маяк ещё не зажжён', 13, lp.beaconLit ? COLORS.gold : COLORS.dim).setOrigin(0, 0.5);

    const back = new UIButton(this, cx + 200, top + 466, 220, 40, 'Закрыть', () => this.close());
    this.list = new MenuList(this, [{ btn: use }, { btn: back }], { onCancel: () => this.close(), instant: this.built });
    this.built = true;
  }
}

// ------------------------------------------------------------------ Святилище
export class ShopScene extends Overlay {
  private checkpoint: { x: number; y: number } | null = null;
  private info!: Phaser.GameObjects.Text;
  private focusIdx = 0;

  constructor() {
    super('Shop');
  }

  init(d: OverlayData): void {
    super.init(d);
    this.checkpoint = (d.checkpoint as { x: number; y: number }) ?? null;
    this.focusIdx = 0;
  }

  create(): void {
    this.build();
  }

  private build(msg?: { text: string; color: string }): void {
    this.children.removeAll(true);
    this.list?.destroy();
    const d = Session.data!;
    const { cx, top, left } = this.frame(760, 500, 'СВЯТИЛИЩЕ ПЕПЛА');
    icon(this, cx - 50, top + 70, ICON.coin);
    text(this, cx - 32, top + 70, `${d.inventory.coins} монет`, 20, COLORS.gold).setOrigin(0, 0.5);
    const items: { btn: UIButton }[] = [];
    UPGRADES.forEach((u, i) => {
      const y = top + 120 + i * 56;
      const lvl = d.upgrades[u.key];
      const max = lvl >= UPGRADE_MAX;
      const cost = upgradeCost(u.key, lvl);
      panel(this, left + 270, y, 500, 50, 'slot');
      icon(this, left + 48, y, u.icon);
      text(this, left + 72, y - 10, u.name, 17).setOrigin(0, 0.5);
      text(this, left + 72, y + 11, u.desc, 12, COLORS.dim).setOrigin(0, 0.5);
      text(this, left + 500, y, '■'.repeat(lvl) + '□'.repeat(UPGRADE_MAX - lvl), 16, COLORS.gold).setOrigin(1, 0.5);
      const btn = new UIButton(this, left + 620, y, 190, 46, max ? 'Максимум' : `Купить · ${cost}`, () => {
        const r = buyUpgrade(d, u.key);
        this.focusIdx = i;
        if (r.ok) {
          audio.play('levelup');
          checkAchievements({ event: 'tick' });
          this.build({ text: `${u.name}: уровень ${d.upgrades[u.key]}`, color: COLORS.green });
        } else {
          audio.play('denied');
          this.info.setText(r.reason ?? '').setColor(COLORS.red);
        }
      }, 16);
      btn.setEnabled(!max && d.inventory.coins >= cost);
      items.push({ btn });
    });
    const rest = new UIButton(this, cx - 130, top + 440, 300, 42, 'Отдохнуть и сохранить', () => {
      const lp = currentLevel(d);
      d.player.hp = getDerived(d).maxHp;
      if (this.checkpoint) lp.checkpoint = { ...this.checkpoint };
      const ok = saveGame(Session.storage, SAVE_SLOTS[0], d);
      audio.play(ok ? 'save' : 'denied');
      this.focusIdx = UPGRADES.length;
      this.build({ text: ok ? 'Здоровье восстановлено. Прогресс сохранён.' : 'Не удалось сохранить', color: ok ? COLORS.green : COLORS.red });
    });
    const close = new UIButton(this, cx + 170, top + 440, 220, 42, 'Уйти', () => this.close());
    items.push({ btn: rest }, { btn: close });
    this.info = text(this, cx, top + 400, msg?.text ?? 'Монеты превращаются в силу. Отдых восстанавливает здоровье.', 15, msg?.color ?? COLORS.dim).setOrigin(0.5);
    this.list = new MenuList(this, items, { onCancel: () => this.close(), instant: this.built });
    this.built = true;
    const f = items[this.focusIdx]?.btn.enabled ? this.focusIdx : UPGRADES.length;
    this.list.focus(f);
  }
}

// ------------------------------------------------------------------ Поражение
export class GameOverScene extends Overlay {
  constructor() {
    super('GameOver');
  }

  create(): void {
    const { cx, top } = this.frame(520, 400, 'ФОНАРЬ ПОГАС');
    const d = Session.data;
    if (d) {
      text(this, cx, top + 90, `${LEVELS[d.levelIndex].name} · уровень ${d.player.level} · врагов повержено: ${totalKills(d)}`, 16, COLORS.dim).setOrigin(0.5);
    }
    text(this, cx, top + 124, 'Тьма поглотила вас... но пепел помнит путь.', 18).setOrigin(0.5);
    const respawn = new UIButton(this, cx, top + 190, 340, 46, 'Возродиться у святилища', () => {
      const r = loadGame(Session.storage, SAVE_SLOTS[0]);
      if (r.status === 'ok') launchGame(this, r.data);
      else {
        const nd = Session.data ?? createNewGame();
        nd.player.hp = getDerived(nd).maxHp;
        launchGame(this, nd);
      }
    });
    const load = new UIButton(this, cx, top + 248, 340, 46, 'Загрузить сохранение', () => openOverlay(this, 'SaveLoad', { mode: 'load' }));
    const menu = new UIButton(this, cx, top + 306, 340, 46, 'Главное меню', () => goToMenu(this));
    this.list = new MenuList(this, [{ btn: respawn }, { btn: load }, { btn: menu }]);
  }
}

// ------------------------------------------------------------------ Победа
export class VictoryScene extends Overlay {
  constructor() {
    super('Victory');
  }

  create(): void {
    const { cx, top } = this.frame(640, 470, 'МАЯКИ ЗАЖЖЕНЫ');
    const d = Session.data!;
    text(this, cx, top + 84, 'Пепельный Король пал, и свет вернулся в мир.', 20).setOrigin(0.5);
    const got = ACHIEVEMENTS.filter((a) => Session.profile.unlocked[a.id]).length;
    const lines = [
      ['Время', formatTime(d.stats.playTimeMs)],
      ['Уровень героя', `${d.player.level}`],
      ['Врагов повержено', `${totalKills(d)}`],
      ['Монет собрано', `${d.stats.coinsEarned}`],
      ['Сундуков открыто', `${d.stats.chestsOpened}`],
      ['Достижения', `${got} / ${ACHIEVEMENTS.length}`],
    ];
    lines.forEach(([k, v], i) => {
      text(this, cx - 200, top + 140 + i * 34, k, 18, COLORS.dim).setOrigin(0, 0.5);
      text(this, cx + 200, top + 140 + i * 34, v, 18, COLORS.gold).setOrigin(1, 0.5);
    });
    this.add.particles(0, 0, 'ember', {
      x: { min: 0, max: GAME_WIDTH }, y: GAME_HEIGHT + 10, lifespan: 6000, speedY: { min: -90, max: -40 },
      scale: { start: 3, end: 1 }, alpha: { start: 1, end: 0 }, frequency: 60, blendMode: 'ADD',
    });
    const menu = new UIButton(this, cx, top + 420, 300, 46, 'Главное меню', () => goToMenu(this));
    this.list = new MenuList(this, [{ btn: menu }]);
  }
}
