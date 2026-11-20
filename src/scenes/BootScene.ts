import Phaser from 'phaser';
import { generateAllTextures } from '../graphics/TextureFactory';
import { audio } from '../systems/Audio';
import { Session } from '../systems/Session';

/** Генерация всех ресурсов и переход в меню. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    generateAllTextures(this);
    audio.setVolumes(Session.settings.musicVolume, Session.settings.sfxVolume);
    document.getElementById('loading')?.remove();
    this.scene.start('Menu');
  }
}
