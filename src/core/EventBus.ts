import Phaser from 'phaser';

/** Глобальная шина событий между игровой сценой и интерфейсом. */
export const bus = new Phaser.Events.EventEmitter();

/** Подписка, автоматически снимаемая при остановке сцены. */
export function listen(scene: Phaser.Scene, event: string, fn: (...args: any[]) => void): void {
  bus.on(event, fn);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => bus.off(event, fn));
}
