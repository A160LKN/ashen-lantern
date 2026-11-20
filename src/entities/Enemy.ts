/**
 * Противник с ИИ на конечном автомате:
 * idle → patrol → (обнаружил игрока) chase → attack → chase … → (потерял) return → idle.
 * Обход препятствий — поиск пути A* по сетке уровня и детектор «застревания».
 */
import Phaser from 'phaser';
import { DEPTH, TILE } from '../config';
import { StateMachine } from '../core/StateMachine';
import { randRange } from '../core/rng';
import { ENEMIES, type EnemyDef, type EnemyType } from '../data/enemies';
import { charAnim } from '../graphics/TextureFactory';
import { audio } from '../systems/Audio';
import { findPath, isSolid, lineOfSight, type Grid, type Pt } from '../world/grid';
import { sheetDir, vecToDir, type Dir } from './common';
import type { Player } from './Player';

export interface EnemyWorld {
  grid: Grid;
  player: Player;
  /** Удар ближнего боя: сцена проверяет попадание по игроку. */
  enemyMelee(enemy: Enemy, rect: Phaser.Geom.Rectangle, damage: number): void;
  /** Контактный урон (прыжок слизня, рывок босса). Возвращает true при попадании. */
  enemyContact(enemy: Enemy, damage: number): boolean;
  spawnProjectile(x: number, y: number, angle: number, speed: number, damage: number, kind: 'orb' | 'fireball'): void;
  spawnMinion(type: EnemyType, x: number, y: number): void;
  minionCount(): number;
  shake(duration: number, intensity: number): void;
  telegraph(x: number, y: number, radius: number, duration: number): void;
  shockwave(x: number, y: number, radius: number): void;
  onBossActivate(enemy: Enemy): void;
  onBossPhase(enemy: Enemy): void;
}

export class Enemy extends Phaser.Physics.Arcade.Sprite {
  readonly def: EnemyDef;
  hp: number;
  maxHp: number;
  damage: number;
  dead = false;
  facing: Dir = 'down';
  home: Pt;
  protected fsm: StateMachine<Enemy>;
  protected path: Pt[] = [];
  protected repathTimer = 0;
  protected waitTime = 0;
  protected attackCd = 0;
  protected lostTime = 0;
  protected stuckTime = 0;
  protected lastPos = new Phaser.Math.Vector2();
  protected hitThisAttack = false;
  protected shadow: Phaser.GameObjects.Image;
  protected hpBar: Phaser.GameObjects.Graphics;
  protected hpBarTimer = 0;
  protected alertIcon: Phaser.GameObjects.Image;
  protected leapDir = new Phaser.Math.Vector2();
  /** Враги-«призванные» не дают лута. */
  minion = false;

  constructor(scene: Phaser.Scene, protected world: EnemyWorld, type: EnemyType, x: number, y: number, mult: { hp: number; dmg: number }) {
    const def = ENEMIES[type];
    super(scene, x, y, def.texture, 0);
    this.def = def;
    scene.add.existing(this);
    scene.physics.add.existing(this);
    const b = this.body as Phaser.Physics.Arcade.Body;
    b.setSize(def.body.w, def.body.h).setOffset(def.body.ox, def.body.oy);
    b.setCollideWorldBounds(true);
    this.maxHp = Math.round(def.hp * mult.hp);
    this.hp = this.maxHp;
    this.damage = Math.round(def.damage * mult.dmg);
    this.home = { x, y };
    this.shadow = scene.add.image(x, y, type === 'boss' ? 'shadow-big' : 'shadow', 0).setDepth(DEPTH.entityBase - 1);
    this.hpBar = scene.add.graphics().setDepth(DEPTH.text - 1);
    this.alertIcon = scene.add.image(x, y - 14, 'alert', 0).setDepth(DEPTH.text).setVisible(false);
    this.lastPos.set(x, y);
    this.waitTime = randRange(300, 1500);
    this.fsm = new StateMachine<Enemy>(this);
    this.setupStates();
    this.fsm.set('idle');
  }

  get aiState(): string {
    return this.fsm.current ?? '';
  }

  get cx(): number {
    return (this.body as Phaser.Physics.Arcade.Body).center.x;
  }

  get cy(): number {
    return (this.body as Phaser.Physics.Arcade.Body).center.y;
  }

  protected get b(): Phaser.Physics.Arcade.Body {
    return this.body as Phaser.Physics.Arcade.Body;
  }

  protected distToPlayer(): number {
    const p = this.world.player;
    return Phaser.Math.Distance.Between(this.cx, this.cy, p.x, p.feetY);
  }

  protected canSeePlayer(range = this.def.detect): boolean {
    const p = this.world.player;
    if (p.pstate === 'dead') return false;
    if (this.distToPlayer() > range) return false;
    return lineOfSight(this.world.grid, this.cx, this.cy, p.x, p.feetY);
  }

  protected setupStates(): void {
    const def = this.def;
    this.fsm
      .add('idle', {
        enter: (e) => {
          e.b.setVelocity(0, 0);
          e.waitTime = randRange(800, 2200);
        },
        update: (e) => {
          if (e.canSeePlayer()) return e.alert();
          if (e.fsm.elapsed > e.waitTime) e.pickPatrolTarget();
        },
      })
      .add('patrol', {
        update: (e) => {
          if (e.canSeePlayer()) return e.alert();
          if (e.followPath(def.speed) || e.checkStuck()) e.fsm.set('idle');
        },
      })
      .add('chase', {
        enter: (e) => {
          e.lostTime = 0;
          e.repathTimer = 0;
        },
        update: (e, dt) => e.updateChase(dt),
      })
      .add('attack', {
        enter: (e) => e.beginAttack(),
        update: (e) => e.updateAttack(),
        exit: (e) => e.clearTint(),
      })
      .add('return', {
        enter: (e) => e.setPathTo(e.home.x, e.home.y),
        update: (e) => {
          if (e.canSeePlayer(def.detect * 0.8) && e.distFromHome() < def.leash * 0.8) return e.fsm.set('chase');
          if (e.followPath(def.speed * 1.2) || e.checkStuck()) e.fsm.set('idle');
        },
      })
      .add('hurt', {
        update: (e) => {
          e.b.velocity.scale(0.85);
          if (e.fsm.elapsed > 160) e.fsm.set('chase');
        },
      });
  }

  protected alert(): void {
    this.alertIcon.setVisible(true);
    this.scene.time.delayedCall(650, () => this.alertIcon?.setVisible(false));
    audio.play('alert');
    this.fsm.set('chase');
  }

  protected distFromHome(): number {
    return Phaser.Math.Distance.Between(this.cx, this.cy, this.home.x, this.home.y);
  }

  protected pickPatrolTarget(): void {
    const g = this.world.grid;
    for (let i = 0; i < 8; i++) {
      const tx = Math.floor(this.home.x / TILE) + Phaser.Math.Between(-4, 4);
      const ty = Math.floor(this.home.y / TILE) + Phaser.Math.Between(-4, 4);
      if (!isSolid(g, tx, ty) && this.setPathTo(tx * TILE + 8, ty * TILE + 8)) {
        this.fsm.set('patrol');
        return;
      }
    }
    this.waitTime = 1000;
    this.fsm.set('idle');
  }

  protected setPathTo(x: number, y: number): boolean {
    const p = findPath(this.world.grid, Math.floor(this.cx / TILE), Math.floor(this.cy / TILE), Math.floor(x / TILE), Math.floor(y / TILE), 1500);
    this.path = p ?? [];
    return p !== null;
  }

  /** Движение по пути. Возвращает true, когда путь пройден. */
  protected followPath(speed: number): boolean {
    if (this.path.length === 0) {
      this.b.setVelocity(0, 0);
      return true;
    }
    const n = this.path[0];
    const tx = n.x * TILE + 8;
    const ty = n.y * TILE + 8;
    if (Phaser.Math.Distance.Between(this.cx, this.cy, tx, ty) < 3) {
      this.path.shift();
      return this.path.length === 0;
    }
    this.moveToward(tx, ty, speed);
    return false;
  }

  protected moveToward(x: number, y: number, speed: number): void {
    const a = Math.atan2(y - this.cy, x - this.cx);
    this.b.setVelocity(Math.cos(a) * speed, Math.sin(a) * speed);
    this.facing = vecToDir(Math.cos(a), Math.sin(a), this.facing);
  }

  /** Детектор застревания: если почти не сдвинулись за 600 мс. */
  protected checkStuck(): boolean {
    const moved = Phaser.Math.Distance.Between(this.x, this.y, this.lastPos.x, this.lastPos.y);
    if (moved < 0.3 && this.b.speed > 1) this.stuckTime += this.scene.game.loop.delta;
    else this.stuckTime = 0;
    if (this.stuckTime > 600) {
      this.stuckTime = 0;
      return true;
    }
    return false;
  }

  protected updateChase(dt: number): void {
    const def = this.def;
    const p = this.world.player;
    const dist = this.distToPlayer();
    const sees = this.canSeePlayer(def.lose);
    if (!sees) this.lostTime += dt;
    else this.lostTime = 0;
    if (this.lostTime > 3000 || this.distFromHome() > def.leash || p.pstate === 'dead') {
      this.fsm.set('return');
      return;
    }
    if (sees && dist <= def.attackRange && this.attackCd <= 0) {
      this.fsm.set('attack');
      return;
    }
    if (def.keepDistance && sees && dist < def.keepDistance) {
      // Дистанционный враг отступает, сохраняя дистанцию.
      const a = Math.atan2(this.cy - p.feetY, this.cx - p.x);
      this.b.setVelocity(Math.cos(a) * def.chaseSpeed, Math.sin(a) * def.chaseSpeed);
      this.facing = vecToDir(-Math.cos(a), -Math.sin(a), this.facing);
      if (this.checkStuck()) this.b.setVelocity(-Math.sin(a) * def.chaseSpeed, Math.cos(a) * def.chaseSpeed);
      return;
    }
    if (def.keepDistance && sees && dist <= def.attackRange) {
      this.b.setVelocity(0, 0);
      this.facing = vecToDir(p.x - this.cx, p.feetY - this.cy, this.facing);
      return;
    }
    this.repathTimer -= dt;
    const blocked = this.b.blocked.left || this.b.blocked.right || this.b.blocked.up || this.b.blocked.down;
    if (sees && !blocked && this.path.length === 0) {
      this.moveToward(p.x, p.feetY, def.chaseSpeed);
      if (this.checkStuck()) this.setPathTo(p.x, p.feetY);
    } else {
      if (this.repathTimer <= 0 || this.path.length === 0) {
        this.repathTimer = 450;
        if (!this.setPathTo(p.x, p.feetY)) this.moveToward(p.x, p.feetY, def.chaseSpeed);
      }
      this.followPath(def.chaseSpeed);
      if (sees && !blocked && this.path.length <= 1) this.path = [];
    }
  }

  protected beginAttack(): void {
    this.b.setVelocity(0, 0);
    this.hitThisAttack = false;
    const p = this.world.player;
    this.facing = vecToDir(p.x - this.cx, p.feetY - this.cy, this.facing);
    this.setTint(0xffb0a0);
    if (this.def.attack === 'leap') {
      this.leapDir.set(p.x - this.cx, p.feetY - this.cy).normalize();
    }
  }

  protected updateAttack(): void {
    const def = this.def;
    const t = this.fsm.elapsed;
    const p = this.world.player;
    if (def.attack === 'melee') {
      if (t >= def.windup && !this.hitThisAttack) {
        this.hitThisAttack = true;
        this.clearTint();
        const ang = Math.atan2(p.feetY - this.cy, p.x - this.cx);
        const r = new Phaser.Geom.Rectangle(this.cx + Math.cos(ang) * 10 - 8, this.cy + Math.sin(ang) * 10 - 8, 16, 16);
        audio.play('swing');
        this.world.enemyMelee(this, r, this.damage);
      }
      if (t >= def.windup + 320) this.finishAttack();
    } else if (def.attack === 'leap') {
      if (t < def.windup) return;
      if (t < def.windup + 300) {
        this.clearTint();
        this.b.setVelocity(this.leapDir.x * 175, this.leapDir.y * 175);
        if (!this.hitThisAttack && this.world.enemyContact(this, this.damage)) this.hitThisAttack = true;
      } else {
        this.b.velocity.scale(0.7);
        if (t >= def.windup + 600) this.finishAttack();
      }
    } else if (def.attack === 'ranged') {
      if (t >= def.windup && !this.hitThisAttack) {
        this.hitThisAttack = true;
        this.clearTint();
        const ang = Math.atan2(p.feetY - 4 - this.cy, p.x - this.cx);
        this.world.spawnProjectile(this.cx, this.cy, ang, 105, this.damage, 'orb');
        audio.play('shoot');
      }
      if (t >= def.windup + 300) this.finishAttack();
    }
  }

  protected finishAttack(): void {
    this.attackCd = this.def.cooldown * randRange(0.85, 1.15);
    this.fsm.set('chase');
  }

  /** Получение удара. Возвращает true, если враг погиб. */
  takeHit(dmg: number, fromX: number, fromY: number, knock = 130): boolean {
    if (this.dead) return false;
    this.hp -= dmg;
    this.hpBarTimer = 2500;
    this.setTintFill(0xffffff);
    this.scene.time.delayedCall(80, () => {
      if (!this.dead && this.active) this.clearTint();
    });
    if (this.hp <= 0) {
      this.dead = true;
      return true;
    }
    if (knock > 0 && this.aiState !== 'attack') {
      const a = Math.atan2(this.cy - fromY, this.cx - fromX);
      this.b.setVelocity(Math.cos(a) * knock, Math.sin(a) * knock);
      this.path = [];
      this.fsm.set('hurt');
    } else if (this.aiState === 'idle' || this.aiState === 'patrol' || this.aiState === 'return') {
      this.fsm.set('chase');
    }
    return false;
  }

  updateAI(dt: number): void {
    if (this.dead) return;
    this.attackCd -= dt;
    this.fsm.update(dt);
    this.lastPos.set(this.x, this.y);
    this.updateVisuals(dt);
  }

  protected updateVisuals(dt: number): void {
    const tex = this.def.texture;
    const dir = sheetDir(this.facing);
    this.setFlipX(this.facing === 'left');
    let anim = 'idle';
    if (this.aiState === 'attack') anim = this.fsm.elapsed < this.def.windup ? 'idle' : 'attack';
    else if (this.aiState === 'hurt') anim = 'hurt';
    else if (this.b.speed > 4) anim = 'walk';
    const key = charAnim(tex, anim, dir);
    if (this.anims.currentAnim?.key !== key) this.play(key, true);
    if (this.aiState === 'attack' && this.fsm.elapsed < this.def.windup) {
      // Предупреждающая дрожь перед атакой.
      this.x += Math.sin(this.fsm.elapsed * 0.08) * 0.3;
    }
    this.syncDecor(dt);
  }

  protected syncDecor(dt: number, shadowOffset = 7): void {
    this.setDepth(DEPTH.entityBase + this.cy);
    this.shadow.setPosition(Math.round(this.x), Math.round(this.y + shadowOffset));
    this.alertIcon.setPosition(Math.round(this.x), Math.round(this.y - this.height / 2 - 6));
    this.hpBarTimer -= dt;
    this.hpBar.clear();
    if (this.hpBarTimer > 0 && this.def.type !== 'boss') {
      const w = 14;
      const x = Math.round(this.x - w / 2);
      const y = Math.round(this.y - this.height / 2 - 3);
      this.hpBar.fillStyle(0x0b0910, 1).fillRect(x - 1, y - 1, w + 2, 4);
      this.hpBar.fillStyle(0x8f1f31, 1).fillRect(x, y, w, 2);
      this.hpBar.fillStyle(0xd1394c, 1).fillRect(x, y, Math.max(0, Math.round((w * this.hp) / this.maxHp)), 2);
    }
  }

  destroy(fromScene?: boolean): void {
    this.shadow?.destroy();
    this.hpBar?.destroy();
    this.alertIcon?.destroy();
    super.destroy(fromScene);
  }
}
