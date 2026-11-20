/**
 * Атмосферное освещение: слой темноты (RenderTexture размером с карту),
 * из которого «вырезаются» ступенчатые пятна света, плюс аддитивное цветное свечение.
 */
import Phaser from 'phaser';
import { DEPTH } from '../config';

export interface LightSource {
  x: number;
  y: number;
  radius: number;
  color: number;
  intensity: number;
  flicker: number;
  follow?: { x: number; y: number; active?: boolean };
  offsetY?: number;
  glow?: Phaser.GameObjects.Image;
  seed: number;
  enabled: boolean;
}

export class Lighting {
  private rt: Phaser.GameObjects.RenderTexture;
  private stamp: Phaser.GameObjects.Image;
  private lights = new Set<LightSource>();
  darkness: number;

  constructor(private scene: Phaser.Scene, width: number, height: number, darkness: number, private color: number) {
    this.darkness = darkness;
    this.rt = scene.add.renderTexture(0, 0, width, height).setOrigin(0, 0).setDepth(DEPTH.light);
    this.stamp = scene.make.image({ key: 'light', frame: 0, add: false });
  }

  add(opts: Partial<LightSource> & { radius: number }): LightSource {
    const l: LightSource = {
      x: 0, y: 0, color: 0xffa040, intensity: 0.35, flicker: 0.06, seed: Math.random() * 1000, enabled: true,
      ...opts,
    };
    if (l.intensity > 0) {
      l.glow = this.scene.add.image(l.x, l.y, 'glow', 0)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(DEPTH.glow)
        .setTint(l.color)
        .setAlpha(l.intensity);
    }
    this.lights.add(l);
    return l;
  }

  remove(l: LightSource | null | undefined): void {
    if (!l) return;
    l.glow?.destroy();
    this.lights.delete(l);
  }

  update(time: number, cam: Phaser.Cameras.Scene2D.Camera): void {
    const view = cam.worldView;
    this.rt.clear();
    this.rt.fill(this.color, this.darkness);
    for (const l of this.lights) {
      if (l.follow) {
        if (l.follow.active === false) {
          l.enabled = false;
        } else {
          l.x = l.follow.x;
          l.y = l.follow.y + (l.offsetY ?? 0);
        }
      }
      const visible = l.enabled && l.radius > 0 &&
        l.x + l.radius > view.x && l.x - l.radius < view.right && l.y + l.radius > view.y && l.y - l.radius < view.bottom;
      if (l.glow) l.glow.setVisible(visible);
      if (!visible) continue;
      const fl = 1 + Math.sin(time * 0.009 + l.seed) * l.flicker + Math.sin(time * 0.023 + l.seed * 2) * l.flicker * 0.5;
      const r = Math.max(4, l.radius * fl);
      this.stamp.setScale((r * 2) / 128);
      this.rt.erase(this.stamp, Math.round(l.x), Math.round(l.y));
      if (l.glow) {
        l.glow.setPosition(Math.round(l.x), Math.round(l.y));
        l.glow.setScale((r * 1.6) / 64);
      }
    }
  }

  destroy(): void {
    for (const l of this.lights) l.glow?.destroy();
    this.lights.clear();
    this.rt.destroy();
    this.stamp.destroy();
  }
}
