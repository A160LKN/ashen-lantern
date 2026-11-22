/** Главное меню с атмосферным пиксельным фоном. */
import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, SAVE_SLOTS } from '../config';
import { mulberry32 } from '../core/rng';
import { createCanvas, Painter } from '../graphics/canvas';
import { charAnim } from '../graphics/TextureFactory';
import { hex, P } from '../graphics/palette';
import { audio } from '../systems/Audio';
import { createNewGame } from '../systems/GameState';
import { latestSlot, loadGame } from '../systems/SaveSystem';
import { launchGame, Session } from '../systems/Session';
import { COLORS, MenuList, onSceneEvent, openOverlay, panel, text, UIButton, dim } from '../ui/widgets';

function backdrop(): HTMLCanvasElement {
  const W = 320;
  const H = 180;
  const { c, ctx } = createCanvas(W, H);
  const p = new Painter(ctx, W);
  const sky = ['#07060f', '#0c0a1a', '#141026', '#1d1531', '#2a1a36', '#3a1f33'];
  sky.forEach((col, i) => p.rect(0, i * 22, W, 24, col));
  const r = mulberry32(42);
  for (let i = 0; i < 70; i++) p.px(Math.floor(r() * W), Math.floor(r() * 90), r() > 0.8 ? P.gold3 : P.gray3);
  // Луна
  p.circle(292, 24, 12, '#d8cfe0');
  p.circle(288, 21, 11, '#efe8f2');
  p.circle(297, 28, 2, '#c9bfd4');
  const ridge = (base: number, amp: number, color: string, seed: number) => {
    const rr = mulberry32(seed);
    let h = base;
    for (let x = 0; x < W; x++) {
      h += (rr() - 0.5) * amp;
      h = Math.max(base - 18, Math.min(base + 18, h));
      p.rect(x, Math.floor(h), 1, H - Math.floor(h), color);
    }
  };
  ridge(105, 3, '#1b1428', 1);
  ridge(122, 4, '#140f1f', 2);
  // Силуэт маяка на холме
  p.rect(70, 82, 10, 40, '#0e0a16');
  p.rect(67, 78, 16, 5, '#0e0a16');
  p.rect(72, 70, 6, 8, '#0e0a16');
  ridge(140, 5, '#0d0a15', 3);
  // Лес на переднем плане
  const rt = mulberry32(5);
  for (let x = -6; x < W; x += 9 + Math.floor(rt() * 6)) {
    const h = 26 + Math.floor(rt() * 22);
    const base = 172;
    for (let y = 0; y < h; y++) {
      const half = Math.floor((y / h) * 7) + 1;
      p.rect(x + 7 - half, base - h + y, half * 2, 1, '#07050c');
    }
  }
  p.rect(0, 166, W, 14, '#07050c');
  return c;
}

export class MenuScene extends Phaser.Scene {
  private list: MenuList | null = null;
  private buttons: UIButton[] = [];
  private modal: Phaser.GameObjects.Container | null = null;

  constructor() {
    super('Menu');
  }

  create(): void {
    this.list = null;
    this.buttons = [];
    this.modal = null;
    if (!this.textures.exists('menu-bg')) {
      const tex = this.textures.addCanvas('menu-bg', backdrop());
      tex?.add(0, 0, 0, 0, 320, 180);
    }
    this.add.image(0, 0, 'menu-bg', 0).setOrigin(0).setScale(3);
    // Огонь маяка на заднем плане
    const beacon = this.add.image(75 * 3, 66 * 3, 'glow', 0).setBlendMode(Phaser.BlendModes.ADD).setTint(hex(P.fire2)).setScale(2.2).setAlpha(0.8);
    this.tweens.add({ targets: beacon, alpha: 0.45, scale: 1.8, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.add.particles(0, 0, 'ember', {
      x: { min: 0, max: GAME_WIDTH }, y: GAME_HEIGHT + 10, lifespan: 7000, speedY: { min: -60, max: -25 }, speedX: { min: -12, max: 12 },
      scale: { start: 3, end: 1 }, alpha: { start: 1, end: 0 }, frequency: 140, blendMode: 'ADD',
    });
    // Носитель фонаря
    const hero = this.add.sprite(GAME_WIDTH / 2 - 250, GAME_HEIGHT - 66, 'player', 0).setScale(6).play(charAnim('player', 'idle', 'side'));
    const heroGlow = this.add.image(hero.x - 26, hero.y + 16, 'glow', 0).setBlendMode(Phaser.BlendModes.ADD).setTint(hex(P.fire3)).setScale(3).setAlpha(0.5);
    this.tweens.add({ targets: heroGlow, alpha: 0.32, duration: 160, yoyo: true, repeat: -1 });

    text(this, GAME_WIDTH / 2, 92, 'ПЕПЕЛЬНЫЙ ФОНАРЬ', 64, COLORS.gold, { strokeThickness: 10 }).setOrigin(0.5);
    text(this, GAME_WIDTH / 2, 146, 'Зажги маяки. Верни свет.', 22, COLORS.dim).setOrigin(0.5);
    text(this, GAME_WIDTH - 12, GAME_HEIGHT - 10, 'v1.0 · Phaser 3 · TypeScript', 14, COLORS.dim).setOrigin(1, 1);

    audio.setVolumes(Session.settings.musicVolume, Session.settings.sfxVolume);
    if (Session.audioUnlocked) {
      audio.playMusic('menu');
      audio.setAmbient(null);
      this.buildMenu();
    } else {
      const hint = text(this, GAME_WIDTH / 2, 340, 'Нажмите любую клавишу или кликните', 24).setOrigin(0.5);
      this.tweens.add({ targets: hint, alpha: 0.3, duration: 700, yoyo: true, repeat: -1 });
      const start = () => {
        if (Session.audioUnlocked) return;
        Session.audioUnlocked = true;
        audio.unlock();
        audio.playMusic('menu');
        audio.setAmbient(null);
        hint.destroy();
        this.buildMenu();
      };
      this.input.keyboard?.once('keydown', start);
      this.input.once('pointerdown', start);
    }
    onSceneEvent(this, Phaser.Scenes.Events.RESUME, () => {
      this.input.keyboard?.resetKeys();
      this.refreshContinue();
    });
  }

  private buildMenu(): void {
    const cx = GAME_WIDTH / 2;
    const entries: [string, () => void][] = [
      ['Продолжить', () => this.continueGame()],
      ['Новая игра', () => this.newGame()],
      ['Загрузить', () => openOverlay(this, 'SaveLoad', { mode: 'load' })],
      ['Настройки', () => openOverlay(this, 'Settings')],
      ['Достижения', () => openOverlay(this, 'Achievements')],
      ['Как играть', () => openOverlay(this, 'Help')],
    ];
    this.buttons = entries.map(([label, fn], i) => new UIButton(this, cx, 214 + i * 50, 300, 42, label, fn));
    this.list = new MenuList(this, this.buttons.map((btn) => ({ btn })));
    this.refreshContinue();
  }

  private refreshContinue(): void {
    if (!this.buttons.length) return;
    const has = latestSlot(Session.storage, SAVE_SLOTS) !== null;
    this.buttons[0].setEnabled(has);
    if (!has && this.list?.index === 0) this.list.focus(1);
    else this.list?.focus(this.list.index);
  }

  private continueGame(): void {
    const slot = latestSlot(Session.storage, SAVE_SLOTS);
    if (slot === null) return;
    const r = loadGame(Session.storage, slot);
    if (r.status === 'ok') launchGame(this, r.data);
  }

  private newGame(): void {
    const hasAuto = loadGame(Session.storage, SAVE_SLOTS[0]).status !== 'empty';
    if (!hasAuto) {
      launchGame(this, createNewGame());
      return;
    }
    this.showConfirm('Начать новую игру?\nАвтосохранение будет перезаписано.\nРучные слоты 1–3 сохранятся.', () => launchGame(this, createNewGame()));
  }

  private showConfirm(msg: string, onYes: () => void): void {
    if (this.modal) return;
    if (this.list) this.list.active = false;
    const bg = dim(this, 0.7);
    const p = panel(this, GAME_WIDTH / 2, GAME_HEIGHT / 2, 540, 240, 'panel');
    const t = text(this, GAME_WIDTH / 2, GAME_HEIGHT / 2 - 40, msg, 20, COLORS.text, { align: 'center', lineSpacing: 6 }).setOrigin(0.5);
    const close = () => {
      this.modal?.destroy(true);
      this.modal = null;
      modalList.destroy();
      if (this.list) this.list.active = true;
    };
    const yes = new UIButton(this, GAME_WIDTH / 2 - 110, GAME_HEIGHT / 2 + 70, 190, 42, 'Да', () => {
      close();
      onYes();
    });
    const no = new UIButton(this, GAME_WIDTH / 2 + 110, GAME_HEIGHT / 2 + 70, 190, 42, 'Отмена', close);
    this.modal = this.add.container(0, 0, [bg, p, t, yes, no]).setDepth(100);
    const modalList = new MenuList(this, [{ btn: yes }, { btn: no }], { horizontal: true, onCancel: close });
    modalList.focus(1);
  }
}
