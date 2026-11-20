/** Виджеты интерфейса: панели, текст, кнопки, клавиатурная навигация по меню. */
import Phaser from 'phaser';
import { FONT, UI_SCALE } from '../config';
import { panelCanvas, type PanelStyle } from '../graphics/ui';
import { audio } from '../systems/Audio';

export const COLORS = {
  text: '#ede6f2',
  dim: '#9a90b0',
  gold: '#f2c443',
  red: '#f27a7a',
  green: '#a6e07a',
  blue: '#8fd0e0',
  purple: '#c3a8ff',
};

/** Возвращает ключ текстуры панели нужного размера (в экранных пикселях). */
export function panelKey(scene: Phaser.Scene, w: number, h: number, style: PanelStyle): string {
  const lw = Math.max(8, Math.round(w / UI_SCALE));
  const lh = Math.max(8, Math.round(h / UI_SCALE));
  const key = `panel:${style}:${lw}x${lh}`;
  if (!scene.textures.exists(key)) {
    const tex = scene.textures.addCanvas(key, panelCanvas(lw, lh, style));
    tex?.add(0, 0, 0, 0, lw, lh);
  }
  return key;
}

export function panel(scene: Phaser.Scene, x: number, y: number, w: number, h: number, style: PanelStyle = 'panel'): Phaser.GameObjects.Image {
  return scene.add.image(x, y, panelKey(scene, w, h, style), 0).setScale(UI_SCALE);
}

export function text(
  scene: Phaser.Scene, x: number, y: number, str: string, size = 20, color = COLORS.text,
  opts: Partial<Phaser.Types.GameObjects.Text.TextStyle> = {},
): Phaser.GameObjects.Text {
  return scene.add.text(x, y, str, {
    fontFamily: FONT,
    fontSize: `${size}px`,
    color,
    stroke: '#0b0910',
    strokeThickness: Math.max(2, Math.round(size / 6)),
    ...opts,
  });
}

export function icon(scene: Phaser.Scene, x: number, y: number, index: number, scale = UI_SCALE): Phaser.GameObjects.Image {
  return scene.add.image(x, y, 'icons', index).setScale(scale);
}

/** Затемнение фона для оверлеев. */
export function dim(scene: Phaser.Scene, alpha = 0.6): Phaser.GameObjects.Rectangle {
  const { width, height } = scene.scale;
  return scene.add.rectangle(width / 2, height / 2, width, height, 0x07060b, alpha).setInteractive();
}

export class UIButton extends Phaser.GameObjects.Container {
  private bg: Phaser.GameObjects.Image;
  readonly label: Phaser.GameObjects.Text;
  enabled = true;
  focused = false;
  onHover?: () => void;

  constructor(scene: Phaser.Scene, x: number, y: number, public w: number, public h: number, str: string, public onClick: () => void, fontSize = 20) {
    super(scene, x, y);
    this.bg = scene.add.image(0, 0, panelKey(scene, w, h, 'button'), 0).setScale(UI_SCALE);
    this.label = text(scene, 0, 0, str, fontSize).setOrigin(0.5);
    this.add([this.bg, this.label]);
    this.setSize(w, h);
    this.bg.setInteractive({ useHandCursor: true });
    this.bg.on('pointerover', () => {
      if (!this.enabled) return;
      this.onHover?.();
    });
    this.bg.on('pointerdown', () => this.press());
    scene.add.existing(this);
  }

  press(): void {
    if (!this.enabled || !this.visible) {
      audio.play('denied');
      return;
    }
    audio.play('button');
    this.onClick();
  }

  setFocus(f: boolean): this {
    this.focused = f;
    this.refresh();
    return this;
  }

  setEnabled(e: boolean): this {
    this.enabled = e;
    this.refresh();
    return this;
  }

  setLabel(s: string): this {
    this.label.setText(s);
    return this;
  }

  private refresh(): void {
    const style: PanelStyle = !this.enabled ? 'disabled' : this.focused ? 'hover' : 'button';
    this.bg.setTexture(panelKey(this.scene, this.w, this.h, style), 0);
    this.label.setColor(!this.enabled ? '#5c5470' : this.focused ? COLORS.gold : COLORS.text);
  }
}

export interface MenuItem {
  btn: UIButton;
  onLeft?: () => void;
  onRight?: () => void;
}

/** Навигация по кнопкам: стрелки/WASD, Enter/Space/E — выбор, Esc — назад. */
export class MenuList {
  index = 0;
  active = true;
  private readonly createdAt: number;
  private handler: (e: KeyboardEvent) => void;

  constructor(private scene: Phaser.Scene, public items: MenuItem[], private opts: { onCancel?: () => void; horizontal?: boolean; instant?: boolean } = {}) {
    // Защита от «сквозного» нажатия, открывшего экран; при перестройке того же экрана не нужна.
    this.createdAt = opts.instant ? 0 : performance.now();
    items.forEach((it, i) => {
      it.btn.onHover = () => {
        if (!this.active) return;
        if (this.index !== i) audio.play('hover');
        this.focus(i);
      };
    });
    const first = items.findIndex((i) => i.btn.enabled);
    this.focus(first >= 0 ? first : 0);
    this.handler = (e) => this.onKey(e);
    scene.input.keyboard?.on('keydown', this.handler);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  focus(i: number): void {
    this.index = i;
    this.items.forEach((it, j) => it.btn.setFocus(j === i));
  }

  private move(delta: number): void {
    const n = this.items.length;
    for (let k = 1; k <= n; k++) {
      const j = (this.index + delta * k + n * 10) % n;
      if (this.items[j].btn.enabled && this.items[j].btn.visible) {
        if (j !== this.index) audio.play('hover');
        this.focus(j);
        return;
      }
    }
  }

  private onKey(e: KeyboardEvent): void {
    if (!this.active || performance.now() - this.createdAt < 150) return;
    const prev = this.opts.horizontal ? ['ArrowLeft', 'KeyA'] : ['ArrowUp', 'KeyW'];
    const next = this.opts.horizontal ? ['ArrowRight', 'KeyD'] : ['ArrowDown', 'KeyS'];
    const item = this.items[this.index];
    if (prev.includes(e.code)) this.move(-1);
    else if (next.includes(e.code)) this.move(1);
    else if (!this.opts.horizontal && (e.code === 'ArrowLeft' || e.code === 'KeyA') && item?.onLeft) {
      audio.play('hover');
      item.onLeft();
    } else if (!this.opts.horizontal && (e.code === 'ArrowRight' || e.code === 'KeyD') && item?.onRight) {
      audio.play('hover');
      item.onRight();
    } else if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyE') item?.btn.press();
    else if (e.code === 'Escape' && this.opts.onCancel) {
      audio.play('button');
      this.opts.onCancel();
    }
  }

  destroy(): void {
    this.scene.input.keyboard?.off('keydown', this.handler);
  }
}

/** Закрыть оверлей и продолжить сцену, из которой он был открыт. */
export function closeOverlay(scene: Phaser.Scene, from?: string): void {
  scene.scene.stop();
  if (from) scene.scene.resume(from);
}

/** Открыть оверлей поверх текущей сцены, приостановив её. */
export function openOverlay(scene: Phaser.Scene, key: string, data: Record<string, unknown> = {}): void {
  scene.scene.pause();
  scene.scene.launch(key, { ...data, from: scene.scene.key });
}
