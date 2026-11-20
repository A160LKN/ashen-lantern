/** Игровой интерфейс поверх мира: показатели, задания, подсказки, диалоги и уведомления. */
import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';
import { listen } from '../core/EventBus';
import type { AchievementDef } from '../data/achievements';
import { LEVELS } from '../data/levels';
import { ICON } from '../graphics/objects';
import { hex, P } from '../graphics/palette';
import { audio } from '../systems/Audio';
import { getDerived, xpToNext } from '../systems/GameState';
import { levelQuests } from '../systems/Quests';
import { bus } from '../core/EventBus';
import { Session } from '../systems/Session';
import { COLORS, icon, panel, text } from '../ui/widgets';

interface DialogState {
  name: string;
  lines: string[];
  index: number;
  shown: number;
  onClose?: () => void;
}

export class UIScene extends Phaser.Scene {
  private g!: Phaser.GameObjects.Graphics;
  private bossG!: Phaser.GameObjects.Graphics;
  private hpText!: Phaser.GameObjects.Text;
  private lvlText!: Phaser.GameObjects.Text;
  private counters!: Record<'coins' | 'potions' | 'keys' | 'shards', Phaser.GameObjects.Text>;
  private questTexts: Phaser.GameObjects.Text[] = [];
  private questPanel!: Phaser.GameObjects.Image;
  private promptBox!: Phaser.GameObjects.Container;
  private promptText!: Phaser.GameObjects.Text;
  private toasts: Phaser.GameObjects.Container[] = [];
  private bossBox!: Phaser.GameObjects.Container;
  private bossName!: Phaser.GameObjects.Text;
  private dialogBox!: Phaser.GameObjects.Container;
  private dialogName!: Phaser.GameObjects.Text;
  private dialogText!: Phaser.GameObjects.Text;
  private dialogHint!: Phaser.GameObjects.Text;
  private dialog: DialogState | null = null;
  private fpsText!: Phaser.GameObjects.Text;
  private questTimer = 0;

  constructor() {
    super('UI');
  }

  create(): void {
    this.toasts = [];
    this.questTexts = [];
    this.questSignature = '';
    this.dialog = null;

    // Левая верхняя панель показателей
    panel(this, 168, 66, 324, 120, 'dark');
    icon(this, 30, 30, ICON.heart);
    icon(this, 30, 56, ICON.bolt);
    icon(this, 30, 82, ICON.lantern);
    this.g = this.add.graphics();
    this.hpText = text(this, 186, 30, '', 16).setOrigin(0.5);
    this.lvlText = text(this, 24, 104, '', 16, COLORS.purple).setOrigin(0, 0.5);

    // Счётчики
    panel(this, 168, 150, 324, 42, 'dark');
    const items: [keyof UIScene['counters'], number, number][] = [['coins', ICON.coin, 30], ['potions', ICON.potion, 110], ['keys', ICON.key, 190], ['shards', ICON.shard, 262]];
    this.counters = {} as UIScene['counters'];
    for (const [k, ic, x] of items) {
      icon(this, x, 150, ic);
      this.counters[k] = text(this, x + 18, 150, '0', 18).setOrigin(0, 0.5);
    }
    text(this, 140, 150, 'Q', 12, COLORS.dim).setOrigin(0, 0.5).setPosition(138, 160);

    // Задания
    this.questPanel = panel(this, GAME_WIDTH - 156, 70, 300, 120, 'dark');
    text(this, GAME_WIDTH - 292, 22, 'ЗАДАНИЯ', 16, COLORS.gold).setOrigin(0, 0.5);

    // Подсказка взаимодействия
    const pbg = panel(this, 0, 0, 420, 42, 'panel');
    this.promptText = text(this, 14, 0, '', 18).setOrigin(0.5);
    const keyE = this.add.image(-182, 0, 'key-e', 0).setScale(3);
    this.promptBox = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT - 120, [pbg, keyE, this.promptText]).setVisible(false);

    // Полоса босса
    const bbg = panel(this, 0, 0, 600, 54, 'dark');
    this.bossName = text(this, 0, -12, '', 16, COLORS.red).setOrigin(0.5);
    this.bossBox = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT - 40, [bbg, this.bossName]).setVisible(false);
    this.bossG = this.add.graphics();

    // Диалог
    const dbg = panel(this, 0, 0, 780, 150, 'panel');
    this.dialogName = text(this, -370, -56, '', 20, COLORS.gold).setOrigin(0, 0.5);
    this.dialogText = text(this, -370, -36, '', 20, COLORS.text, { wordWrap: { width: 740 }, lineSpacing: 6 }).setOrigin(0, 0);
    this.dialogHint = text(this, 370, 56, 'E / Пробел — далее', 14, COLORS.dim).setOrigin(1, 0.5);
    this.dialogBox = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT - 100, [dbg, this.dialogName, this.dialogText, this.dialogHint]).setVisible(false).setDepth(10);

    this.fpsText = text(this, GAME_WIDTH - 10, GAME_HEIGHT - 10, '', 14, COLORS.dim).setOrigin(1, 1);

    listen(this, 'toast', (t: { msg: string; color: string }) => this.toast(t.msg, t.color));
    listen(this, 'achievement', (a: AchievementDef) => {
      audio.play('levelup');
      this.toast(`Достижение: ${a.title}`, P.gold3, ICON.star);
    });
    listen(this, 'dialog:open', (d: { name: string; lines: string[]; onClose?: () => void }) => this.openDialog(d));
    listen(this, 'quests:changed', () => this.refreshQuests());

    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => {
      if (!this.dialog) return;
      if (['KeyE', 'Space', 'Enter'].includes(e.code)) this.advanceDialog();
      if (e.code === 'Escape') this.closeDialog();
    });
    this.input.on('pointerdown', () => {
      if (this.dialog) this.advanceDialog();
    });

    this.refreshQuests();
    this.showBanner();
  }

  private showBanner(): void {
    const data = Session.data;
    if (!data) return;
    const def = LEVELS[data.levelIndex];
    const sub = text(this, GAME_WIDTH / 2, 170, def.subtitle.toUpperCase(), 20, COLORS.gold).setOrigin(0.5).setAlpha(0);
    const title = text(this, GAME_WIDTH / 2, 210, def.name, 44).setOrigin(0.5).setAlpha(0);
    this.tweens.add({ targets: [sub, title], alpha: 1, duration: 600, delay: 300, hold: 1800, yoyo: true, onComplete: () => { sub.destroy(); title.destroy(); } });
  }

  private questSignature = '';

  private refreshQuests(): void {
    const data = Session.data;
    if (!data) return;
    // Перерисовываем трекер только при изменении заданий, а не каждую секунду.
    const sig = JSON.stringify([data.levelIndex, levelQuests(data.levelIndex).map((q) => data.quests[q.id] ?? null)]);
    if (sig === this.questSignature) return;
    this.questSignature = sig;
    for (const t of this.questTexts) t.destroy();
    this.questTexts = [];
    const list = levelQuests(data.levelIndex).filter((q) => data.quests[q.id]?.started);
    let y = 46;
    for (const q of list) {
      const st = data.quests[q.id];
      const mark = st.done ? '✓' : '•';
      const prog = q.count > 1 ? ` ${Math.min(st.progress, q.count)}/${q.count}` : '';
      const color = st.done ? COLORS.green : q.optional ? COLORS.blue : COLORS.text;
      const t = text(this, GAME_WIDTH - 292, y, `${mark} ${q.title}${prog}${q.optional ? ' (доп.)' : ''}`, 15, color).setOrigin(0, 0.5);
      if (st.done) t.setAlpha(0.7);
      this.questTexts.push(t);
      y += 22;
    }
    const h = Math.max(60, y - 10 + 14);
    this.questPanel.destroy();
    this.questPanel = panel(this, GAME_WIDTH - 156, 10 + h / 2, 300, h, 'dark').setDepth(-1);
  }

  private toast(msg: string, color: string, iconIdx?: number): void {
    const t = text(this, 0, 0, msg, 17, color).setOrigin(0.5);
    const w = Math.min(GAME_WIDTH - 40, t.width + 40 + (iconIdx !== undefined ? 30 : 0));
    const bg = panel(this, 0, 0, w, 38, 'dark');
    const parts: Phaser.GameObjects.GameObject[] = [bg, t];
    if (iconIdx !== undefined) {
      t.setX(14);
      parts.push(icon(this, -w / 2 + 22, 0, iconIdx));
    }
    const c = this.add.container(GAME_WIDTH / 2, 0, parts).setAlpha(0).setDepth(5);
    this.toasts.unshift(c);
    if (this.toasts.length > 4) this.toasts.pop()?.destroy();
    this.layoutToasts();
    this.tweens.add({
      targets: c, alpha: 1, duration: 200, hold: 2600, yoyo: true,
      onComplete: () => {
        this.toasts = this.toasts.filter((x) => x !== c);
        c.destroy();
        this.layoutToasts();
      },
    });
  }

  private layoutToasts(): void {
    this.toasts.forEach((c, i) => c.setY(GAME_HEIGHT - 190 - i * 44));
  }

  private openDialog(d: { name: string; lines: string[]; onClose?: () => void }): void {
    this.dialog = { ...d, index: 0, shown: 0 };
    this.dialogName.setText(d.name);
    this.dialogText.setText('');
    this.dialogBox.setVisible(true);
    audio.play('button');
  }

  private advanceDialog(): void {
    const d = this.dialog;
    if (!d) return;
    const line = d.lines[d.index];
    if (d.shown < line.length) {
      d.shown = line.length;
      return;
    }
    d.index++;
    d.shown = 0;
    audio.play('hover');
    if (d.index >= d.lines.length) this.closeDialog();
  }

  private closeDialog(): void {
    const d = this.dialog;
    if (!d) return;
    this.dialog = null;
    this.dialogBox.setVisible(false);
    d.onClose?.();
    bus.emit('dialog:closed');
  }

  update(_time: number, delta: number): void {
    const data = Session.data;
    if (!data) return;
    const der = getDerived(data);
    const g = this.g;
    g.clear();
    const bar = (y: number, value: number, max: number, c0: number, c1: number, c2: number) => {
      const x = 48;
      const w = 270;
      const h = 15;
      g.fillStyle(0x0b0910, 1).fillRect(x - 3, y - h / 2 - 3, w + 6, h + 6);
      g.fillStyle(hex(P.ui2), 1).fillRect(x, y - h / 2, w, h);
      const fw = Math.round((w * Math.max(0, Math.min(value, max))) / max / 3) * 3;
      g.fillStyle(c0, 1).fillRect(x, y - h / 2, fw, h);
      g.fillStyle(c1, 1).fillRect(x, y - h / 2, fw, 3);
      g.fillStyle(c2, 1).fillRect(x, y + h / 2 - 3, fw, 3);
    };
    bar(30, data.player.hp, der.maxHp, hex(P.red2), hex(P.red3), hex(P.red1));
    bar(56, Session.runtime.stamina, Session.runtime.maxStamina, hex(P.slime1), hex(P.slime3), hex(P.slime0));
    bar(82, data.player.oil, 100, hex(P.gold1), hex(P.gold2), hex(P.gold0));
    // Опыт
    const need = xpToNext(data.player.level);
    g.fillStyle(hex(P.ui2), 1).fillRect(130, 102, 186, 6);
    g.fillStyle(hex(P.wisp2), 1).fillRect(130, 102, Math.round((186 * data.player.xp) / need), 6);
    this.hpText.setText(`${Math.ceil(data.player.hp)} / ${der.maxHp}`).setPosition(183, 30);
    this.lvlText.setText(`Ур. ${data.player.level}`);

    this.counters.coins.setText(String(data.inventory.coins));
    this.counters.potions.setText(String(data.inventory.potions));
    this.counters.keys.setText(String(data.inventory.keys));
    this.counters.shards.setText(`${data.inventory.shards}/${LEVELS[data.levelIndex].shardsRequired}`);

    // Подсказка
    const prompt = this.dialog ? '' : Session.runtime.prompt;
    this.promptBox.setVisible(!!prompt);
    if (prompt) this.promptText.setText(prompt);

    // Босс
    const boss = Session.runtime.boss;
    this.bossBox.setVisible(!!boss);
    this.bossG.clear();
    if (boss) {
      const g = this.bossG;
      this.bossName.setText(boss.name);
      const x = GAME_WIDTH / 2 - 270;
      const y = GAME_HEIGHT - 32;
      g.fillStyle(0x0b0910, 1).fillRect(x - 3, y - 3, 546, 18);
      g.fillStyle(hex(P.red0), 1).fillRect(x, y, 540, 12);
      const w = Math.round((540 * boss.hp) / boss.max / 3) * 3;
      g.fillStyle(hex(P.fire1), 1).fillRect(x, y, w, 12);
      g.fillStyle(hex(P.fire2), 1).fillRect(x, y, w, 3);
    }

    // Диалог — печатная машинка
    if (this.dialog) {
      const d = this.dialog;
      const line = d.lines[d.index] ?? '';
      if (d.shown < line.length) d.shown = Math.min(line.length, d.shown + delta * 0.06);
      this.dialogText.setText(line.slice(0, Math.floor(d.shown)));
      this.dialogHint.setText(d.index === d.lines.length - 1 && d.shown >= line.length ? 'E / Пробел — закрыть' : 'E / Пробел — далее');
    }

    this.questTimer += delta;
    if (this.questTimer > 1000) {
      this.questTimer = 0;
      this.refreshQuests();
    }

    this.fpsText.setVisible(Session.settings.showFps);
    if (Session.settings.showFps) this.fpsText.setText(`FPS ${Math.round(this.game.loop.actualFps)}`);
  }
}
