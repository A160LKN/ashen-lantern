/** Носитель Фонаря — управляемый игроком персонаж. */
import Phaser from 'phaser';
import { DEPTH } from '../config';
import { charAnim } from '../graphics/TextureFactory';
import { audio } from '../systems/Audio';
import type { Derived } from '../systems/GameState';
import { dirToAngle, sheetDir, vecToDir, type Dir } from './common';

export interface PlayerInput {
  mx: number;
  my: number;
  sprint: boolean;
  attack: boolean;
  /** Угол атаки при прицеливании мышью. */
  aim?: number;
}

export type PlayerState = 'move' | 'attack' | 'hurt' | 'dead';

export class Player extends Phaser.Physics.Arcade.Sprite {
  facing: Dir = 'down';
  pstate: PlayerState = 'move';
  stamina = 100;
  maxStamina = 100;
  invuln = 0;
  private stateTime = 0;
  private attackCd = 0;
  private staminaDelay = 0;
  private stepTimer = 0;
  private struck = false;
  private attackAngle = 0;
  private shadow: Phaser.GameObjects.Image;
  onStrike?: (angle: number) => void;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'player', 0);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    const b = this.body as Phaser.Physics.Arcade.Body;
    b.setSize(8, 6).setOffset(4, 10);
    b.setCollideWorldBounds(true);
    this.shadow = scene.add.image(x, y + 7, 'shadow', 0).setDepth(DEPTH.entityBase - 1);
    this.play(charAnim('player', 'idle', 'down'));
  }

  get feetY(): number {
    return (this.body as Phaser.Physics.Arcade.Body).center.y;
  }

  setStaminaMax(max: number): void {
    this.maxStamina = max;
    this.stamina = Math.min(this.stamina, max);
  }

  updatePlayer(dt: number, input: PlayerInput, stats: Derived): void {
    const s = dt / 1000;
    const body = this.body as Phaser.Physics.Arcade.Body;
    this.stateTime += dt;
    this.attackCd -= dt;
    this.invuln = Math.max(0, this.invuln - dt);
    this.setAlpha(this.invuln > 0 && this.pstate !== 'dead' ? (Math.floor(this.invuln / 80) % 2 ? 0.45 : 1) : 1);

    if (this.pstate === 'dead') {
      body.setVelocity(0, 0);
      this.syncShadow();
      return;
    }

    if (this.pstate === 'hurt') {
      body.velocity.scale(0.86);
      if (this.stateTime > 180) this.pstate = 'move';
      this.syncShadow();
      return;
    }

    let mx = input.mx;
    let my = input.my;
    const len = Math.hypot(mx, my);
    if (len > 0) {
      mx /= len;
      my /= len;
    }
    const moving = len > 0;

    // Выносливость и бег
    let speed = stats.speed;
    const wantSprint = input.sprint && moving && this.pstate === 'move';
    if (wantSprint && this.stamina > 1) {
      speed = stats.sprintSpeed;
      this.stamina = Math.max(0, this.stamina - 32 * s);
      this.staminaDelay = 700;
    } else {
      this.staminaDelay -= dt;
      if (this.staminaDelay <= 0) this.stamina = Math.min(this.maxStamina, this.stamina + 26 * s);
    }

    if (this.pstate === 'attack') {
      const t = this.stateTime;
      if (!this.struck && t >= 70) {
        this.struck = true;
        this.onStrike?.(this.attackAngle);
      }
      body.setVelocity(mx * speed * 0.35, my * speed * 0.35);
      if (t >= 260) this.pstate = 'move';
      this.syncShadow();
      return;
    }

    if (input.attack && this.attackCd <= 0 && this.stamina >= 5) {
      this.startAttack(input.aim);
      this.syncShadow();
      return;
    }

    body.setVelocity(mx * speed, my * speed);
    if (moving) {
      this.facing = vecToDir(mx, my, this.facing);
      this.stepTimer -= dt;
      if (this.stepTimer <= 0) {
        audio.play('step');
        this.stepTimer = speed > stats.speed ? 220 : 320;
      }
    }
    const dir = sheetDir(this.facing);
    this.setFlipX(this.facing === 'left');
    const animKey = charAnim('player', moving ? 'walk' : 'idle', dir);
    this.anims.timeScale = moving && speed > stats.speed ? 1.6 : 1;
    if (this.anims.currentAnim?.key !== animKey) this.play(animKey, true);
    this.syncShadow();
  }

  private startAttack(aim?: number): void {
    this.pstate = 'attack';
    this.stateTime = 0;
    this.struck = false;
    this.attackCd = 380;
    this.stamina -= 5;
    this.staminaDelay = 500;
    if (aim !== undefined) {
      this.facing = vecToDir(Math.cos(aim), Math.sin(aim), this.facing);
      this.attackAngle = aim;
    } else {
      this.attackAngle = dirToAngle(this.facing);
    }
    this.setFlipX(this.facing === 'left');
    this.anims.timeScale = 1;
    this.play(charAnim('player', 'attack', sheetDir(this.facing)), true);
    audio.play('swing');
  }

  /** Получение урона с отбрасыванием. Возвращает true, если урон прошёл. */
  hurt(fromX: number, fromY: number): boolean {
    if (this.invuln > 0 || this.pstate === 'dead') return false;
    this.invuln = 850;
    this.pstate = 'hurt';
    this.stateTime = 0;
    const a = Math.atan2(this.y - fromY, this.x - fromX);
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(Math.cos(a) * 170, Math.sin(a) * 170);
    this.play(charAnim('player', 'hurt', sheetDir(this.facing)), true);
    this.setTintFill(0xffffff);
    this.scene.time.delayedCall(90, () => this.clearTint());
    return true;
  }

  die(): void {
    this.pstate = 'dead';
    this.play(charAnim('player', 'hurt', sheetDir(this.facing)), true);
    this.setTint(0x886666);
    this.setAlpha(1);
    this.scene.tweens.add({ targets: this, angle: 90, duration: 500, ease: 'Quad.easeIn' });
  }

  private syncShadow(): void {
    this.setDepth(DEPTH.entityBase + this.feetY);
    this.shadow.setPosition(Math.round(this.x), Math.round(this.y + 7));
  }

  destroy(fromScene?: boolean): void {
    this.shadow?.destroy();
    super.destroy(fromScene);
  }
}
