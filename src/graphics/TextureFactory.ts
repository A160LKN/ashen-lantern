/**
 * Регистрирует все процедурные текстуры и анимации в Phaser.
 * Любую текстуру можно заменить PNG-файлом с тем же ключом и раскладкой кадров.
 */
import Phaser from 'phaser';
import { ANIM_FRAMES, BOSS_FRAMES, buildBossFrames, buildHumanoidFrames, buildSlimeFrames, buildWispFrames, FRAMES_PER_DIR, LOOKS, SHEET_DIRS } from './characters';
import { strip } from './canvas';
import * as O from './objects';
import { buildTileset } from './tiles';
import { P } from './palette';

function addStrip(scene: Phaser.Scene, key: string, frames: HTMLCanvasElement[]): void {
  if (scene.textures.exists(key)) return;
  const fw = frames[0].width;
  const fh = frames[0].height;
  const tex = scene.textures.addCanvas(key, strip(frames));
  if (!tex) return;
  frames.forEach((_, i) => tex.add(i, 0, i * fw, 0, fw, fh));
}

function addSingle(scene: Phaser.Scene, key: string, canvas: HTMLCanvasElement): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.addCanvas(key, canvas);
  tex?.add(0, 0, 0, 0, canvas.width, canvas.height);
}

function anim(scene: Phaser.Scene, key: string, tex: string, frames: readonly number[], frameRate: number, repeat = -1): void {
  if (scene.anims.exists(key)) return;
  scene.anims.create({ key, frames: frames.map((f) => ({ key: tex, frame: f })), frameRate, repeat });
}

export function charAnim(tex: string, name: string, dir: string): string {
  return `${tex}:${name}:${dir}`;
}

function characterAnims(scene: Phaser.Scene, tex: string, rates = { idle: 3, walk: 8, attack: 14 }): void {
  SHEET_DIRS.forEach((dir, d) => {
    const base = d * FRAMES_PER_DIR;
    anim(scene, charAnim(tex, 'idle', dir), tex, ANIM_FRAMES.idle.map((f) => f + base), rates.idle);
    anim(scene, charAnim(tex, 'walk', dir), tex, ANIM_FRAMES.walk.map((f) => f + base), rates.walk);
    anim(scene, charAnim(tex, 'attack', dir), tex, ANIM_FRAMES.attack.map((f) => f + base), rates.attack, 0);
    anim(scene, charAnim(tex, 'hurt', dir), tex, ANIM_FRAMES.hurt.map((f) => f + base), 1, 0);
  });
}

export function generateAllTextures(scene: Phaser.Scene): void {
  addSingle(scene, 'tiles', buildTileset());

  for (const k of ['player', 'skeleton', 'keeper', 'ghost', 'knight']) {
    addStrip(scene, k, buildHumanoidFrames(LOOKS[k]));
    characterAnims(scene, k);
  }
  addStrip(scene, 'slime', buildSlimeFrames());
  characterAnims(scene, 'slime', { idle: 3, walk: 7, attack: 8 });
  addStrip(scene, 'wisp', buildWispFrames());
  characterAnims(scene, 'wisp', { idle: 5, walk: 7, attack: 8 });

  addStrip(scene, 'boss', buildBossFrames());
  anim(scene, 'boss:idle', 'boss', BOSS_FRAMES.idle, 3);
  anim(scene, 'boss:walk', 'boss', BOSS_FRAMES.walk, 6);
  anim(scene, 'boss:windup', 'boss', BOSS_FRAMES.windup, 4, 0);
  anim(scene, 'boss:slam', 'boss', BOSS_FRAMES.slam, 1, 0);
  anim(scene, 'boss:cast', 'boss', BOSS_FRAMES.cast, 4);
  anim(scene, 'boss:hurt', 'boss', BOSS_FRAMES.hurt, 1, 0);

  addStrip(scene, 'chest', O.chestFrames());
  addSingle(scene, 'door', O.doorFrame());
  addStrip(scene, 'brazier', O.brazierFrames());
  anim(scene, 'brazier:burn', 'brazier', [0, 1, 2, 3], 8);
  addStrip(scene, 'beacon', O.beaconFrames());
  anim(scene, 'beacon:burn', 'beacon', [1, 2, 3], 8);
  addStrip(scene, 'shrine', O.shrineFrames());
  anim(scene, 'shrine:glow', 'shrine', [0, 1], 2);
  addSingle(scene, 'pot', O.potFrame());
  addStrip(scene, 'coin', O.coinFrames());
  anim(scene, 'coin:spin', 'coin', [0, 1, 2, 3], 10);
  addStrip(scene, 'items', O.itemFrames());
  anim(scene, 'shard:glow', 'items', [3, 4, 5, 4], 6);
  addStrip(scene, 'orb', O.orbFrames());
  anim(scene, 'orb:fly', 'orb', [0, 1], 10);
  addStrip(scene, 'fireball', O.fireballFrames());
  anim(scene, 'fireball:fly', 'fireball', [0, 1], 12);
  addStrip(scene, 'slash', O.slashFrames());
  anim(scene, 'slash:swing', 'slash', [0, 1, 2], 24, 0);
  addStrip(scene, 'puff', O.puffFrames());
  anim(scene, 'puff:pop', 'puff', [0, 1, 2, 3], 14, 0);

  addSingle(scene, 'px', O.simpleFrame(2, 2, (p) => p.rect(0, 0, 2, 2, '#ffffff')));
  addSingle(scene, 'ember', O.simpleFrame(2, 2, (p) => { p.rect(0, 0, 2, 2, P.fire2); p.px(0, 0, P.fire4); }));
  addSingle(scene, 'firefly', O.simpleFrame(3, 3, (p) => { p.px(1, 0, P.slime2); p.rect(0, 1, 3, 1, P.slime2); p.px(1, 2, P.slime2); p.px(1, 1, P.gold3); }));
  addSingle(scene, 'ashfleck', O.simpleFrame(2, 2, (p) => p.rect(0, 0, 2, 1, P.gray2)));
  addSingle(scene, 'shadow', O.shadowFrame(12, 5));
  addSingle(scene, 'shadow-big', O.shadowFrame(26, 8));
  addSingle(scene, 'light', O.lightStamp(128));
  addSingle(scene, 'glow', O.glowStamp(64));
  addSingle(scene, 'alert', O.alertFrame());
  addSingle(scene, 'key-e', O.keyPromptFrame('E'));
  addStrip(scene, 'icons', O.iconFrames());
}
