/**
 * Пепельный Король. Собственный автомат состояний:
 * dormant → chase ⇄ {slam, ring, summon, dash}; при 50% здоровья — вторая фаза.
 */
import Phaser from 'phaser';
import { randRange } from '../core/rng';
import { audio } from '../systems/Audio';
import { lineOfSight } from '../world/grid';
import { Enemy, type EnemyWorld } from './Enemy';

export class Boss extends Enemy {
  phase = 1;
  activated = false;
  private slamCd = 1500;
  private ringCd = 3500;
  private summonCd = 6000;
  private dashCd = 4000;
  private dashDir = new Phaser.Math.Vector2();

  constructor(scene: Phaser.Scene, world: EnemyWorld, x: number, y: number, mult: { hp: number; dmg: number }) {
    super(scene, world, 'boss', x, y, mult);
  }

  protected setupStates(): void {
    this.fsm
      .add('idle', {
        enter: (e) => e.body && (e.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0),
        update: () => {
          const p = this.world.player;
          const d = this.distToPlayer();
          if (p.pstate !== 'dead' && d < this.def.detect && lineOfSight(this.world.grid, this.cx, this.cy, p.x, p.feetY)) {
            this.activated = true;
            audio.play('roar');
            this.world.shake(500, 0.006);
            this.world.onBossActivate(this);
            this.fsm.set('chase');
          }
        },
      })
      .add('chase', { update: (_e, dt) => this.bossChase(dt) })
      .add('slam', {
        enter: () => {
          this.b.setVelocity(0, 0);
          this.world.telegraph(this.cx, this.cy, 46, 650);
        },
        update: () => {
          const t = this.fsm.elapsed;
          if (t >= 650 && !this.hitThisAttack) {
            this.hitThisAttack = true;
            audio.play('slam');
            this.world.shake(260, 0.01);
            this.world.shockwave(this.cx, this.cy, 46);
            const p = this.world.player;
            if (Phaser.Math.Distance.Between(this.cx, this.cy, p.x, p.feetY) < 46) this.world.enemyContact(this, this.damage);
          }
          if (t >= 1150) this.endMove();
        },
      })
      .add('ring', {
        enter: () => this.b.setVelocity(0, 0),
        update: () => {
          const t = this.fsm.elapsed;
          const waves = this.phase === 2 ? 2 : 1;
          const n = this.phase === 2 ? 14 : 10;
          for (let w = 0; w < waves; w++) {
            const at = 600 + w * 450;
            if (t >= at && this.hitCount === w) {
              this.hitCount++;
              const off = w * (Math.PI / n);
              for (let i = 0; i < n; i++) {
                const a = off + (i / n) * Math.PI * 2;
                this.world.spawnProjectile(this.cx, this.cy - 6, a, 85, Math.round(this.damage * 0.6), 'fireball');
              }
              audio.play('shoot');
            }
          }
          if (t >= 600 + waves * 450 + 200) this.endMove();
        },
      })
      .add('summon', {
        enter: () => this.b.setVelocity(0, 0),
        update: () => {
          if (this.fsm.elapsed >= 800 && !this.hitThisAttack) {
            this.hitThisAttack = true;
            audio.play('roar');
            for (const dx of [-28, 28]) this.world.spawnMinion('skeleton', this.cx + dx, this.cy + 10);
          }
          if (this.fsm.elapsed >= 1200) this.endMove();
        },
      })
      .add('dash', {
        enter: () => {
          this.b.setVelocity(0, 0);
          const p = this.world.player;
          this.dashDir.set(p.x - this.cx, p.feetY - this.cy).normalize();
          this.setTint(0xff9070);
        },
        update: () => {
          const t = this.fsm.elapsed;
          if (t < 420) return;
          if (t < 760) {
            if (t - this.scene.game.loop.delta < 420) audio.play('dash');
            this.b.setVelocity(this.dashDir.x * 230, this.dashDir.y * 230);
            if (!this.hitThisAttack && this.world.enemyContact(this, this.damage)) this.hitThisAttack = true;
          } else {
            this.b.velocity.scale(0.75);
            if (t >= 1000) this.endMove();
          }
        },
        exit: () => this.clearTint(),
      })
      .add('hurt', { update: () => this.fsm.set('chase') });
  }

  private hitCount = 0;

  private startMove(name: string): void {
    this.hitThisAttack = false;
    this.hitCount = 0;
    this.fsm.set(name);
  }

  private endMove(): void {
    this.fsm.set('chase');
  }

  private bossChase(dt: number): void {
    const p = this.world.player;
    if (p.pstate === 'dead') {
      this.b.setVelocity(0, 0);
      return;
    }
    this.slamCd -= dt;
    this.ringCd -= dt;
    this.summonCd -= dt;
    this.dashCd -= dt;
    const d = this.distToPlayer();
    if (d < 40 && this.slamCd <= 0) {
      this.slamCd = this.phase === 2 ? 1800 : 2600;
      return this.startMove('slam');
    }
    if (this.ringCd <= 0 && d < 170) {
      this.ringCd = this.phase === 2 ? 4200 : 6000;
      return this.startMove('ring');
    }
    if (this.phase === 2 && this.summonCd <= 0 && this.world.minionCount() < 3) {
      this.summonCd = 11000;
      return this.startMove('summon');
    }
    if (this.phase === 2 && this.dashCd <= 0 && d > 56) {
      this.dashCd = randRange(3500, 5000);
      return this.startMove('dash');
    }
    const speed = this.def.chaseSpeed * (this.phase === 2 ? 1.25 : 1);
    if (d > 26) {
      this.repathTimer -= dt;
      if (lineOfSight(this.world.grid, this.cx, this.cy, p.x, p.feetY)) {
        this.path = [];
        this.moveToward(p.x, p.feetY, speed);
      } else {
        if (this.repathTimer <= 0 || this.path.length === 0) {
          this.repathTimer = 500;
          this.setPathTo(p.x, p.feetY);
        }
        this.followPath(speed);
      }
    } else {
      this.b.setVelocity(0, 0);
    }
  }

  takeHit(dmg: number, fromX: number, fromY: number): boolean {
    if (!this.activated) {
      this.activated = true;
      this.world.onBossActivate(this);
      this.fsm.set('chase');
    }
    const killed = super.takeHit(dmg, fromX, fromY, 0);
    if (!killed && this.phase === 1 && this.hp <= this.maxHp / 2) {
      this.phase = 2;
      this.summonCd = 1500;
      this.dashCd = 2500;
      audio.play('roar');
      this.world.shake(400, 0.008);
      this.world.onBossPhase(this);
    }
    return killed;
  }

  protected updateVisuals(dt: number): void {
    const p = this.world.player;
    this.setFlipX(p.x < this.cx);
    let key = 'boss:idle';
    const st = this.aiState;
    if (st === 'slam') key = this.fsm.elapsed < 650 ? 'boss:windup' : 'boss:slam';
    else if (st === 'ring' || st === 'summon') key = 'boss:cast';
    else if (st === 'dash') key = this.fsm.elapsed < 420 ? 'boss:windup' : 'boss:walk';
    else if (this.b.speed > 4) key = 'boss:walk';
    if (this.anims.currentAnim?.key !== key) this.play(key, true);
    if (this.phase === 2 && !this.isTinted) this.setTint(0xffd0c0);
    this.syncDecor(dt, 13);
  }
}
