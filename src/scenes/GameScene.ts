/** Игровая сцена: мир, бой, предметы, взаимодействия, задания, переходы между уровнями. */
import Phaser from 'phaser';
import { DEPTH, FONT, SAVE_SLOTS, TILE, WORLD_ZOOM } from '../config';
import { bus, listen } from '../core/EventBus';
import { randInt, randRange } from '../core/rng';
import { LEVELS, LEVEL_COUNT, type LevelDef } from '../data/levels';
import type { EnemyType } from '../data/enemies';
import { Boss } from '../entities/Boss';
import { Enemy, type EnemyWorld } from '../entities/Enemy';
import { Player } from '../entities/Player';
import { charAnim } from '../graphics/TextureFactory';
import { hex, P } from '../graphics/palette';
import { audio } from '../systems/Audio';
import {
  addCoins, addKill, addOil, addPotion, addXp, advanceLevel, createNewGame, currentLevel, getDerived,
  isRemoved, markRemoved, usePotion, type GameData,
} from '../systems/GameState';
import { applyQuestEvent, ensureLevelQuests, questById, startQuest, type QuestEvent } from '../systems/Quests';
import { saveGame } from '../systems/SaveSystem';
import { DIFFICULTY } from '../systems/Settings';
import { checkAchievements, persistProfile, Session } from '../systems/Session';
import { openOverlay } from '../ui/widgets';
import { setSolid, type Grid } from '../world/grid';
import { animateTiles, buildLevel, type BuiltLevel } from '../world/LevelBuilder';
import { findDropPosition, magnetVelocity } from '../world/loot';
import { buildGrid, ENEMY_CHARS, parseLevel, type ParsedEntity, type ParsedLevel } from '../world/levelParser';
import { Lighting, type LightSource } from '../world/Lighting';

interface Interactable {
  x: number;
  y: number;
  range: number;
  label: () => string | null;
  act: () => void;
}

interface Breakable {
  id: string;
  sprite: Phaser.GameObjects.Image;
  zone: Phaser.GameObjects.Zone;
  tx: number;
  ty: number;
}

type PickupKind = 'coin' | 'potion' | 'oil' | 'key' | 'shard';

const ITEM_FRAME: Record<Exclude<PickupKind, 'coin'>, number> = { potion: 0, oil: 1, key: 2, shard: 3 };

export class GameScene extends Phaser.Scene implements EnemyWorld {
  grid!: Grid;
  player!: Player;
  private data_!: GameData;
  private def!: LevelDef;
  private parsed!: ParsedLevel;
  private built!: BuiltLevel;
  private lighting!: Lighting;
  private playerLight!: LightSource;
  private enemyGroup!: Phaser.Physics.Arcade.Group;
  private enemies: Enemy[] = [];
  private projectiles!: Phaser.Physics.Arcade.Group;
  private pickups!: Phaser.Physics.Arcade.Group;
  private solids!: Phaser.Physics.Arcade.StaticGroup;
  private interactables: Interactable[] = [];
  private breakables: Breakable[] = [];
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private ambientZone = new Phaser.Geom.Rectangle(0, 0, 320, 180);
  private promptIcon!: Phaser.GameObjects.Image;
  private boss: Boss | null = null;
  private dialogOpen = false;
  private transitioning = false;
  private dead = false;
  private inputLockUntil = 0;
  private queuedAim: number | undefined;
  private queuedAttack = false;
  private tileTimer = 0;
  private achTimer = 0;
  private oilWarned = false;
  private bagFullToastAt = 0;
  /**
   * Разовые нажатия, собранные из событий клавиатуры между кадрами.
   * Опрос JustDown терял нажатие, если клавишу нажали и отпустили внутри одного кадра (низкий FPS, BUG-010).
   */
  private pressed = new Set<string>();
  private beaconSprite: Phaser.GameObjects.Sprite | null = null;
  private beaconLight: LightSource | null = null;

  constructor() {
    super('Game');
  }

  create(): void {
    this.enemies = [];
    this.interactables = [];
    this.breakables = [];
    this.boss = null;
    this.dialogOpen = false;
    this.transitioning = false;
    this.dead = false;
    this.oilWarned = false;
    this.beaconSprite = null;
    this.beaconLight = null;
    this.inputLockUntil = this.time.now + 250;
    Session.runtime.boss = null;
    Session.runtime.prompt = '';

    if (!Session.data) Session.data = createNewGame();
    const data = (this.data_ = Session.data);
    if (data.player.hp <= 0) data.player.hp = getDerived(data).maxHp;
    this.def = LEVELS[data.levelIndex];
    this.parsed = parseLevel(this.def.map, this.def.fill);
    const lp = currentLevel(data);
    this.grid = buildGrid(this.parsed, (e) => !((e.ch === 'D' || e.ch === 'p') && lp.removed.includes(e.id)));
    this.built = buildLevel(this, this.parsed, this.def.theme);
    const W = this.parsed.w * TILE;
    const H = this.parsed.h * TILE;
    this.physics.world.setBounds(0, 0, W, H);
    this.cameras.main.setBackgroundColor(this.def.darkColor);

    this.solids = this.physics.add.staticGroup();
    this.enemyGroup = this.physics.add.group();
    this.projectiles = this.physics.add.group();
    this.pickups = this.physics.add.group();
    this.lighting = new Lighting(this, W, H, this.def.darkness, this.def.darkColor);

    // Игрок
    const cp = lp.checkpoint;
    const sx = cp ? cp.x : this.parsed.spawn.x * TILE + 8;
    const sy = cp ? cp.y : this.parsed.spawn.y * TILE + 8;
    this.player = new Player(this, sx, sy);
    this.player.onStrike = (a) => this.playerStrike(a);
    const derived = getDerived(data);
    this.player.setStaminaMax(derived.maxStamina);
    this.player.stamina = derived.maxStamina;
    this.playerLight = this.lighting.add({ radius: derived.lightRadius, follow: this.player, offsetY: 2, color: hex(P.fire3), intensity: 0.22, flicker: 0.04 });

    for (const e of this.parsed.entities) this.spawnEntity(e);
    if (lp.bossDefeated && !isRemoved(data, 'boss-shard')) {
      const b = this.parsed.entities.find((e) => e.ch === 'B');
      if (b) this.spawnPickup('shard', b.x * TILE + 8, b.y * TILE + 8, 1, 'boss-shard');
    }
    for (const c of this.built.lavaCells) {
      if ((c.x + c.y) % 2 === 0) this.lighting.add({ x: c.x * TILE + 8, y: c.y * TILE + 8, radius: 26, color: hex(P.lava2), intensity: 0.25, flicker: 0.1 });
    }

    // Столкновения
    this.physics.add.collider(this.player, this.built.solid);
    this.physics.add.collider(this.player, this.solids);
    this.physics.add.collider(this.enemyGroup, this.built.solid);
    this.physics.add.collider(this.enemyGroup, this.solids);
    this.physics.add.collider(this.enemyGroup, this.enemyGroup);
    this.physics.add.collider(this.projectiles, this.built.solid, (p) => this.destroyProjectile(p as Phaser.Physics.Arcade.Sprite));
    this.physics.add.collider(this.projectiles, this.solids, (p) => this.destroyProjectile(p as Phaser.Physics.Arcade.Sprite));
    this.physics.add.overlap(this.player, this.projectiles, (_pl, p) => this.onProjectileHit(p as Phaser.Physics.Arcade.Sprite));
    this.physics.add.overlap(this.player, this.pickups, (_pl, it) => this.tryCollect(it as Phaser.Physics.Arcade.Sprite));

    // Камера
    const cam = this.cameras.main;
    cam.setZoom(WORLD_ZOOM).setBounds(0, 0, W, H).setRoundPixels(true);
    cam.startFollow(this.player, true, 0.14, 0.14);
    cam.fadeIn(500, 0, 0, 0);

    this.setupInput();
    this.setupParticles();
    this.promptIcon = this.add.image(0, 0, 'key-e', 0).setDepth(DEPTH.prompt).setVisible(false);

    ensureLevelQuests(data);
    audio.playMusic(this.def.music);
    audio.setAmbient(this.def.theme);

    listen(this, 'dialog:closed', () => {
      this.dialogOpen = false;
      this.physics.world.resume();
      this.inputLockUntil = this.time.now + 200;
    });
    this.events.on(Phaser.Scenes.Events.RESUME, () => {
      this.input.keyboard?.resetKeys();
      this.pressed.clear();
      this.inputLockUntil = this.time.now + 150;
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.lighting.destroy();
      Session.runtime.boss = null;
      Session.runtime.prompt = '';
    });

    this.scene.stop('UI');
    this.scene.launch('UI');
    saveGame(Session.storage, SAVE_SLOTS[0], data);
  }

  // ------------------------------------------------------------------ сущности
  private addSolidZone(x: number, y: number, w: number, h: number): Phaser.GameObjects.Zone {
    const z = this.add.zone(x, y, w, h);
    this.solids.add(z);
    return z;
  }

  private spawnEntity(e: ParsedEntity): void {
    const data = this.data_;
    const x = e.x * TILE + 8;
    const y = e.y * TILE + 8;
    const removed = isRemoved(data, e.id);
    switch (e.ch) {
      case 'N': {
        const npc = this.def.npc;
        const s = this.add.sprite(x, y, npc.look, 0).play(charAnim(npc.look, 'idle', 'down'));
        s.setDepth(DEPTH.entityBase + y + 6);
        if (npc.look === 'ghost') {
          s.setAlpha(0.8);
          this.lighting.add({ x, y, radius: 30, color: hex(P.wisp2), intensity: 0.3 });
        }
        this.add.image(x, y + 7, 'shadow', 0).setDepth(DEPTH.entityBase - 1);
        this.addSolidZone(x, y + 4, 10, 6);
        this.interactables.push({ x, y, range: 22, label: () => `Говорить: ${npc.name}`, act: () => this.talkToNpc() });
        break;
      }
      case 'S': {
        const s = this.add.sprite(x, y, 'shrine', 0).play('shrine:glow').setDepth(DEPTH.entityBase + y + 6);
        void s;
        this.addSolidZone(x, y + 3, 14, 8);
        this.lighting.add({ x, y, radius: 40, color: hex(P.cloak3), intensity: 0.3, flicker: 0.03 });
        this.interactables.push({
          x, y, range: 22, label: () => 'Святилище: улучшения и отдых',
          act: () => openOverlay(this, 'Shop', { checkpoint: { x, y: y + 16 } }),
        });
        break;
      }
      case 't': {
        this.add.sprite(x, y, 'brazier', 0).play({ key: 'brazier:burn', startFrame: randInt(0, 3) }).setDepth(DEPTH.entityBase + y + 6);
        this.addSolidZone(x, y + 3, 10, 8);
        this.lighting.add({ x, y: y - 2, radius: 72, color: hex(P.fire2), intensity: 0.32, flicker: 0.07 });
        this.add.particles(x, y - 7, 'ember', {
          lifespan: 900, speedY: { min: -26, max: -10 }, speedX: { min: -6, max: 6 },
          alpha: { start: 1, end: 0 }, frequency: 240, blendMode: 'ADD',
        }).setDepth(DEPTH.airFx);
        break;
      }
      case 'L': {
        const lit = currentLevel(data).beaconLit;
        const s = this.add.sprite(x, y - 8, 'beacon', lit ? 1 : 0).setDepth(DEPTH.entityBase + y + 6);
        this.beaconSprite = s;
        this.addSolidZone(x, y + 2, 14, 10);
        this.beaconLight = this.lighting.add({ x, y: y - 14, radius: lit ? 120 : 18, color: hex(P.fire3), intensity: lit ? 0.4 : 0.15, flicker: 0.05 });
        if (lit) this.igniteBeaconVisuals(false);
        this.interactables.push({ x, y, range: 24, label: () => this.beaconLabel(), act: () => this.useBeacon() });
        break;
      }
      case 'c': {
        const s = this.add.sprite(x, y, 'chest', removed ? 1 : 0).setDepth(DEPTH.entityBase + y + 6);
        this.addSolidZone(x, y + 3, 12, 8);
        this.interactables.push({
          x, y, range: 20,
          label: () => (isRemoved(this.data_, e.id) ? null : 'Открыть сундук'),
          act: () => this.openChest(e, s),
        });
        break;
      }
      case 'p': {
        if (removed) break;
        const s = this.add.image(x, y, 'pot', 0).setDepth(DEPTH.entityBase + y + 6);
        const zone = this.addSolidZone(x, y + 3, 10, 8);
        this.breakables.push({ id: e.id, sprite: s, zone, tx: e.x, ty: e.y });
        break;
      }
      case 'D': {
        if (removed) break;
        const s = this.add.image(x, y, 'door', 0).setDepth(DEPTH.solid + 1);
        const zone = this.addSolidZone(x, y, 16, 16);
        const it: Interactable = {
          x, y, range: 22,
          label: () => (this.data_.inventory.keys > 0 ? 'Отпереть дверь' : 'Дверь заперта'),
          act: () => this.openDoor(e, s, zone, it),
        };
        this.interactables.push(it);
        break;
      }
      case 'K':
        if (!removed) this.spawnPickup('key', x, y, 1, e.id);
        break;
      case '*':
        if (!removed) this.spawnPickup('shard', x, y, 1, e.id);
        break;
      case '$':
        if (!removed) this.spawnPickup('coin', x, y, 10, e.id);
        break;
      case 'h':
        if (!removed) this.spawnPickup('potion', x, y, 1, e.id);
        break;
      case 'o':
        if (!removed) this.spawnPickup('oil', x, y, 40, e.id);
        break;
      default: {
        const type = ENEMY_CHARS[e.ch];
        if (!type) break;
        if (type === 'boss') {
          if (currentLevel(data).bossDefeated) break;
          this.boss = new Boss(this, this, x, y, this.enemyMult('boss'));
          this.registerEnemy(this.boss);
        } else {
          this.registerEnemy(new Enemy(this, this, type, x, y, this.enemyMult(type)));
        }
      }
    }
  }

  private enemyMult(type: EnemyType): { hp: number; dmg: number } {
    const diff = DIFFICULTY[Session.settings.difficulty];
    const lvl = type === 'boss' ? { hp: 1, dmg: 1 } : { hp: this.def.hpMult, dmg: this.def.dmgMult };
    return { hp: lvl.hp * diff.enemyHp, dmg: lvl.dmg };
  }

  private registerEnemy(e: Enemy): void {
    this.enemies.push(e);
    this.enemyGroup.add(e);
    if (e.def.light) {
      const l = this.lighting.add({ radius: e.def.light.radius, color: e.def.light.color, follow: e, intensity: 0.3, flicker: 0.08 });
      e.once(Phaser.GameObjects.Events.DESTROY, () => this.lighting.remove(l));
    }
  }

  private spawnPickup(kind: PickupKind, x: number, y: number, value: number, id?: string, scatter = false): void {
    const tex = kind === 'coin' ? (value >= 5 ? 'items' : 'coin') : 'items';
    const frameIdx = kind === 'coin' ? (value >= 5 ? 6 : 0) : ITEM_FRAME[kind];
    const s = this.pickups.create(x, y, tex, frameIdx) as Phaser.Physics.Arcade.Sprite;
    const b = s.body as Phaser.Physics.Arcade.Body;
    b.setSize(10, 10);
    b.setCollideWorldBounds(true);
    s.setData({ kind, value, id, readyAt: this.time.now + (scatter ? 350 : 0) });
    s.setDepth(DEPTH.entityBase + y);
    if (kind === 'coin' && value < 5) s.play({ key: 'coin:spin', startFrame: randInt(0, 3) });
    if (kind === 'shard') {
      s.play('shard:glow');
      const l = this.lighting.add({ radius: 26, follow: s, color: hex(P.fire2), intensity: 0.35, flicker: 0.1 });
      s.once(Phaser.GameObjects.Events.DESTROY, () => this.lighting.remove(l));
    }
    if (scatter) {
      const { x: tx, y: ty } = findDropPosition(this.grid, x, y);
      this.tweens.add({ targets: s, x: tx, duration: 350, ease: 'Quad.easeOut' });
      this.tweens.add({ targets: s, y: { from: y, to: ty }, duration: 350, ease: 'Bounce.easeOut' });
    } else {
      this.tweens.add({ targets: s, y: y - 2, duration: 700 + Math.random() * 300, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
  }

  // ------------------------------------------------------------------ ввод
  private setupInput(): void {
    const kb = this.input.keyboard!;
    this.keys = kb.addKeys({
      W: 'W', A: 'A', S: 'S', D: 'D', UP: 'UP', DOWN: 'DOWN', LEFT: 'LEFT', RIGHT: 'RIGHT',
      SHIFT: 'SHIFT', E: 'E', SPACE: 'SPACE', ESC: 'ESC', I: 'I', TAB: 'TAB', Q: 'Q',
    }) as Record<string, Phaser.Input.Keyboard.Key>;
    this.input.mouse?.disableContextMenu();
    this.pressed = new Set();
    kb.on('keydown', (e: KeyboardEvent) => {
      if (!e.repeat) this.pressed.add(e.code);
    });
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (!p.leftButtonDown() || this.dialogOpen || this.dead) return;
      const wp = this.cameras.main.getWorldPoint(p.x, p.y);
      this.queuedAim = Math.atan2(wp.y - (this.player.feetY - 3), wp.x - this.player.x);
      this.queuedAttack = true;
    });
    this.game.events.on(Phaser.Core.Events.BLUR, this.onBlur, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.game.events.off(Phaser.Core.Events.BLUR, this.onBlur, this));
  }

  private onBlur(): void {
    this.input.keyboard?.resetKeys();
    this.pressed.clear();
  }

  private setupParticles(): void {
    this.sparks = this.add.particles(0, 0, 'px', {
      emitting: false, lifespan: { min: 200, max: 380 }, speed: { min: 40, max: 120 },
      scale: { start: 1, end: 0 }, blendMode: 'ADD',
    }).setDepth(DEPTH.airFx);
    const zone = { type: 'random', source: this.ambientZone } as Phaser.Types.GameObjects.Particles.EmitZoneData;
    const theme = this.def.theme;
    if (theme === 'forest') {
      this.add.particles(0, 0, 'firefly', {
        lifespan: 5000, speedX: { min: -8, max: 8 }, speedY: { min: -8, max: 5 }, alpha: { start: 0.9, end: 0 },
        frequency: 380, blendMode: 'ADD', emitZone: zone,
      }).setDepth(DEPTH.airFx);
    } else if (theme === 'crypt') {
      this.add.particles(0, 0, 'px', {
        lifespan: 6000, speedX: { min: -3, max: 3 }, speedY: { min: 2, max: 7 }, alpha: { start: 0.35, end: 0 },
        scale: 0.5, tint: hex(P.gray3), frequency: 200, emitZone: zone,
      }).setDepth(DEPTH.above + 1);
    } else {
      this.add.particles(0, 0, 'ashfleck', {
        lifespan: 5000, speedX: { min: -10, max: 4 }, speedY: { min: 6, max: 14 }, alpha: { start: 0.7, end: 0 },
        frequency: 120, emitZone: zone,
      }).setDepth(DEPTH.above + 1);
      this.add.particles(0, 0, 'ember', {
        lifespan: 3500, speedX: { min: -6, max: 6 }, speedY: { min: -18, max: -6 }, alpha: { start: 1, end: 0 },
        frequency: 450, blendMode: 'ADD', emitZone: zone,
      }).setDepth(DEPTH.airFx);
    }
  }

  // ------------------------------------------------------------------ цикл
  update(time: number, delta: number): void {
    const dt = Math.min(delta, 50);
    const data = this.data_;
    const derived = getDerived(data);
    const cam = this.cameras.main;
    this.ambientZone.setTo(cam.worldView.x - 20, cam.worldView.y - 20, cam.worldView.width + 40, cam.worldView.height + 40);

    this.tileTimer += dt;
    if (this.tileTimer > 380) {
      this.tileTimer = 0;
      animateTiles(this.built);
    }

    // Свет фонаря зависит от масла.
    const oilK = 0.45 + 0.55 * (data.player.oil / 100);
    this.playerLight.radius = derived.lightRadius * oilK;
    this.lighting.update(time, cam);

    Session.runtime.stamina = this.player.stamina;
    Session.runtime.maxStamina = this.player.maxStamina;
    if (this.boss && !this.boss.dead && this.boss.activated) {
      Session.runtime.boss = { name: this.boss.def.name, hp: Math.max(0, this.boss.hp), max: this.boss.maxHp };
    }

    // Забираем нажатия этого кадра; всё, что не использовано, не переходит в следующий кадр.
    const pressed = this.pressed;
    this.pressed = new Set();
    if (this.dialogOpen || this.transitioning) {
      this.player.setVelocity(0, 0);
      this.promptIcon.setVisible(false);
      Session.runtime.prompt = '';
      return;
    }

    data.stats.playTimeMs += dt;
    if (!this.dead) {
      data.player.oil = Math.max(0, data.player.oil - derived.oilDrainPerSec * (dt / 1000));
      if (data.player.oil < 15 && !this.oilWarned) {
        this.oilWarned = true;
        this.toast('Масло на исходе — свет фонаря слабеет', P.gold2);
      }
      if (data.player.oil > 30) this.oilWarned = false;
    }

    const k = this.keys;
    const locked = time < this.inputLockUntil || this.dead;
    const mx = locked ? 0 : (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0);
    const my = locked ? 0 : (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0);
    const attack = !locked && (k.SPACE.isDown || pressed.has('Space') || this.queuedAttack);
    this.player.setStaminaMax(derived.maxStamina);
    this.player.updatePlayer(dt, { mx, my, sprint: k.SHIFT.isDown, attack, aim: this.queuedAttack ? this.queuedAim : undefined }, derived);
    this.queuedAttack = false;
    this.queuedAim = undefined;

    for (const e of this.enemies) e.updateAI(dt);
    this.updatePickups();
    this.updateInteraction(locked, pressed.has('KeyE'));

    if (!locked) {
      if (pressed.has('KeyQ')) this.drinkPotion();
      if (pressed.has('Escape')) {
        openOverlay(this, 'Pause');
        return;
      }
      if (pressed.has('KeyI') || pressed.has('Tab')) {
        openOverlay(this, 'Inventory');
        return;
      }
    }

    this.achTimer += dt;
    if (this.achTimer > 1000) {
      this.achTimer = 0;
      checkAchievements({ event: 'tick' });
    }
  }

  private updatePickups(): void {
    const px = this.player.x;
    const py = this.player.feetY;
    for (const obj of this.pickups.getChildren()) {
      const s = obj as Phaser.Physics.Arcade.Sprite;
      if (s.getData('kind') !== 'coin' || this.time.now < s.getData('readyAt')) continue;
      const v = magnetVelocity(px, py, s.x, s.y);
      if (v.vx !== 0 || v.vy !== 0) this.tweens.killTweensOf(s);
      (s.body as Phaser.Physics.Arcade.Body).setVelocity(v.vx, v.vy);
    }
  }

  private updateInteraction(locked: boolean, interactPressed: boolean): void {
    const px = this.player.x;
    const py = this.player.feetY;
    let best: Interactable | null = null;
    let bestLabel: string | null = null;
    let bestD = Infinity;
    for (const it of this.interactables) {
      const d = Phaser.Math.Distance.Between(px, py, it.x, it.y);
      if (d > it.range || d >= bestD) continue;
      const label = it.label();
      if (!label) continue;
      best = it;
      bestLabel = label;
      bestD = d;
    }
    if (best && !this.dead) {
      Session.runtime.prompt = bestLabel!;
      this.promptIcon.setVisible(true).setPosition(best.x, best.y - 16 + Math.sin(this.time.now / 200) * 1.5);
      if (!locked && interactPressed) best.act();
    } else {
      Session.runtime.prompt = '';
      this.promptIcon.setVisible(false);
    }
  }

  // ------------------------------------------------------------------ бой
  private playerStrike(angle: number): void {
    const data = this.data_;
    const d = getDerived(data);
    const px = this.player.x;
    const py = this.player.feetY - 4;
    const cx = px + Math.cos(angle) * 11;
    const cy = py + Math.sin(angle) * 11;
    const slash = this.add.sprite(cx, cy, 'slash', 0).setRotation(angle).setDepth(DEPTH.entityBase + 1000);
    if (Math.cos(angle) < -0.1) slash.setFlipY(true);
    slash.play('slash:swing');
    slash.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => slash.destroy());
    const hit = new Phaser.Geom.Rectangle(cx - 11, cy - 11, 22, 22);
    let landed = false;
    for (const e of this.enemies.slice()) {
      if (e.dead) continue;
      const b = e.body as Phaser.Physics.Arcade.Body;
      const er = new Phaser.Geom.Rectangle(b.x - 2, b.y - 4, b.width + 4, b.height + 6);
      if (!Phaser.Geom.Intersects.RectangleToRectangle(hit, er)) continue;
      landed = true;
      const crit = Math.random() < d.critChance;
      const dmg = Math.round(d.damage * randRange(0.9, 1.1) * (crit ? 1.8 : 1));
      const killed = e.takeHit(dmg, px, py);
      this.floatText(e.cx, e.cy - 10, crit ? `${dmg}!` : `${dmg}`, crit ? P.gold2 : P.white);
      this.burst(e.cx, e.cy - 2, e.def.type === 'slime' ? hex(P.slime2) : e.def.type === 'wisp' ? hex(P.wisp2) : hex(P.bone2), 7);
      audio.play(crit ? 'crit' : 'hit');
      if (crit) this.shake(90, 0.003);
      if (killed) this.killEnemy(e);
    }
    for (const br of this.breakables.slice()) {
      const r = new Phaser.Geom.Rectangle(br.sprite.x - 6, br.sprite.y - 6, 12, 12);
      if (Phaser.Geom.Intersects.RectangleToRectangle(hit, r)) this.breakPot(br);
    }
    if (landed) this.cameras.main.shake(40, 0.0015);
  }

  private killEnemy(e: Enemy): void {
    const data = this.data_;
    audio.play('enemyDie');
    const puff = this.add.sprite(e.cx, e.cy - 2, 'puff', 0).setDepth(DEPTH.entityBase + e.cy + 1).play('puff:pop');
    puff.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => puff.destroy());
    this.burst(e.cx, e.cy, hex(P.fire3), 12);
    const isBoss = e.def.type === 'boss';
    if (!e.minion) {
      let coins = randInt(e.def.coins[0], e.def.coins[1]);
      while (coins > 0) {
        const v = coins >= 10 ? 10 : 1;
        coins -= v;
        this.spawnPickup('coin', e.cx, e.cy, v, undefined, true);
      }
      if (Math.random() < e.def.dropPotion) this.spawnPickup('potion', e.cx, e.cy, 1, undefined, true);
      if (Math.random() < e.def.dropOil) this.spawnPickup('oil', e.cx, e.cy, 30, undefined, true);
      const lv = addXp(data, e.def.xp);
      this.floatText(e.cx, e.cy - 18, `+${e.def.xp} опыта`, P.wisp3);
      if (lv > 0) this.onLevelUp();
    }
    addKill(data, e.def.type);
    this.questEvent({ type: 'kill', enemy: e.def.type });
    this.enemies = this.enemies.filter((x) => x !== e);
    if (isBoss) this.onBossDefeated(e);
    e.destroy();
    checkAchievements({ event: 'tick' });
  }

  private onLevelUp(): void {
    audio.play('levelup');
    this.toast(`Новый уровень: ${this.data_.player.level}! Здоровье восстановлено`, P.gold2);
    this.burst(this.player.x, this.player.y, hex(P.gold2), 20);
  }

  private onBossDefeated(e: Enemy): void {
    const data = this.data_;
    currentLevel(data).bossDefeated = true;
    Session.runtime.boss = null;
    this.shake(900, 0.012);
    this.cameras.main.flash(400, 255, 200, 120);
    // Координаты фиксируем заранее: к моменту отложенных вспышек босс уже уничтожен.
    const bx = e.cx;
    const by = e.cy;
    for (let i = 0; i < 6; i++) {
      this.time.delayedCall(i * 140, () => this.burst(bx + randRange(-14, 14), by + randRange(-16, 6), hex(P.fire2), 14));
    }
    this.spawnPickup('shard', bx, by, 1, 'boss-shard', true);
    this.questEvent({ type: 'boss' });
    this.toast('Пепельный Король повержен! Подберите осколок его сердца', P.gold2);
    audio.playMusic(this.def.music);
    for (const m of this.enemies.slice()) {
      if (m.minion) {
        m.dead = true;
        this.burst(m.cx, m.cy, hex(P.bone2), 8);
        m.destroy();
      }
    }
    this.enemies = this.enemies.filter((m) => !m.minion);
    checkAchievements({ event: 'boss' });
    saveGame(Session.storage, SAVE_SLOTS[0], data);
  }

  /** Игрок получает урон. */
  private damagePlayer(amount: number, fromX: number, fromY: number): boolean {
    if (this.dead || this.dialogOpen || this.transitioning) return false;
    if (!this.player.hurt(fromX, fromY)) return false;
    const data = this.data_;
    const dmg = Math.max(1, Math.round(amount * DIFFICULTY[Session.settings.difficulty].damageTaken * randRange(0.9, 1.1)));
    data.player.hp = Math.max(0, data.player.hp - dmg);
    currentLevel(data).damageTaken += dmg;
    audio.play('hurt');
    this.shake(140, 0.005);
    this.floatText(this.player.x, this.player.y - 12, `-${dmg}`, P.red2);
    this.burst(this.player.x, this.player.y, hex(P.red2), 6);
    if (data.player.hp <= 0) this.onPlayerDeath();
    return true;
  }

  private onPlayerDeath(): void {
    this.dead = true;
    this.player.die();
    Session.profile.deaths++;
    persistProfile();
    audio.stopMusic();
    this.cameras.main.flash(300, 120, 0, 0);
    this.time.delayedCall(1300, () => openOverlay(this, 'GameOver'));
  }

  // EnemyWorld ------------------------------------------------------
  enemyMelee(enemy: Enemy, rect: Phaser.Geom.Rectangle, damage: number): void {
    const b = this.player.body as Phaser.Physics.Arcade.Body;
    const pr = new Phaser.Geom.Rectangle(b.x, b.y - 6, b.width, b.height + 6);
    if (Phaser.Geom.Intersects.RectangleToRectangle(rect, pr)) this.damagePlayer(damage, enemy.cx, enemy.cy);
  }

  enemyContact(enemy: Enemy, damage: number): boolean {
    const eb = enemy.body as Phaser.Physics.Arcade.Body;
    const pb = this.player.body as Phaser.Physics.Arcade.Body;
    const er = new Phaser.Geom.Rectangle(eb.x - 2, eb.y - 4, eb.width + 4, eb.height + 6);
    const pr = new Phaser.Geom.Rectangle(pb.x, pb.y - 6, pb.width, pb.height + 6);
    const near = enemy.def.type === 'boss' && enemy.aiState === 'slam';
    if (near || Phaser.Geom.Intersects.RectangleToRectangle(er, pr)) return this.damagePlayer(damage, enemy.cx, enemy.cy);
    return false;
  }

  spawnProjectile(x: number, y: number, angle: number, speed: number, damage: number, kind: 'orb' | 'fireball'): void {
    const s = this.projectiles.create(x, y, kind, 0) as Phaser.Physics.Arcade.Sprite;
    s.play(kind === 'orb' ? 'orb:fly' : 'fireball:fly');
    const b = s.body as Phaser.Physics.Arcade.Body;
    b.setCircle(3, kind === 'orb' ? 1 : 2, kind === 'orb' ? 1 : 2);
    b.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
    s.setDepth(DEPTH.entityBase + 1000);
    s.setData('damage', damage);
    const l = this.lighting.add({ radius: 18, follow: s, color: kind === 'orb' ? hex(P.wisp2) : hex(P.fire2), intensity: 0.4, flicker: 0.1 });
    s.once(Phaser.GameObjects.Events.DESTROY, () => this.lighting.remove(l));
    this.time.delayedCall(4000, () => {
      if (s.active) s.destroy();
    });
  }

  private destroyProjectile(p: Phaser.Physics.Arcade.Sprite): void {
    if (!p.active) return;
    this.burst(p.x, p.y, p.texture.key === 'orb' ? hex(P.wisp2) : hex(P.fire2), 5);
    p.destroy();
  }

  private onProjectileHit(p: Phaser.Physics.Arcade.Sprite): void {
    if (!p.active) return;
    this.damagePlayer(p.getData('damage') as number, p.x, p.y);
    this.destroyProjectile(p);
  }

  spawnMinion(type: EnemyType, x: number, y: number): void {
    const tx = Math.floor(x / TILE);
    const ty = Math.floor(y / TILE);
    let sx = x;
    let sy = y;
    if (this.grid.solid[ty * this.grid.w + tx]) {
      sx = this.boss ? this.boss.cx : x;
      sy = this.boss ? this.boss.cy + 14 : y;
    }
    const e = new Enemy(this, this, type, sx, sy, this.enemyMult(type));
    e.minion = true;
    this.registerEnemy(e);
    const puff = this.add.sprite(sx, sy, 'puff', 0).setDepth(DEPTH.airFx).play('puff:pop');
    puff.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => puff.destroy());
  }

  minionCount(): number {
    return this.enemies.filter((e) => e.minion && !e.dead).length;
  }

  shake(duration: number, intensity: number): void {
    if (Session.settings.screenShake) this.cameras.main.shake(duration, intensity);
  }

  telegraph(x: number, y: number, radius: number, duration: number): void {
    const g = this.add.graphics().setDepth(DEPTH.solid + 1);
    const start = this.time.now;
    const ev = this.time.addEvent({
      delay: 16, loop: true,
      callback: () => {
        const t = Math.min(1, (this.time.now - start) / duration);
        g.clear();
        g.fillStyle(0xd1394c, 0.15 + 0.25 * t).fillCircle(x, y, radius * t);
        g.lineStyle(1, 0xf27a7a, 0.8).strokeCircle(x, y, radius);
        if (t >= 1) {
          ev.remove();
          g.destroy();
        }
      },
    });
  }

  shockwave(x: number, y: number, radius: number): void {
    const g = this.add.graphics().setDepth(DEPTH.airFx);
    const obj = { r: 4, a: 1 };
    this.tweens.add({
      targets: obj, r: radius, a: 0, duration: 350, ease: 'Quad.easeOut',
      onUpdate: () => {
        g.clear();
        g.lineStyle(2, 0xffc861, obj.a).strokeCircle(x, y, obj.r);
      },
      onComplete: () => g.destroy(),
    });
    this.burst(x, y, hex(P.fire2), 18);
  }

  onBossActivate(): void {
    audio.playMusic('boss');
    this.toast('Пепельный Король пробудился!', P.red3);
  }

  onBossPhase(): void {
    this.toast('Король в ярости! Он призывает мёртвых', P.red3);
    this.cameras.main.flash(250, 255, 90, 40);
  }

  // ------------------------------------------------------------------ взаимодействия
  private talkToNpc(): void {
    const npc = this.def.npc;
    const data = this.data_;
    const q = npc.questId ? data.quests[npc.questId] : undefined;
    let lines = npc.lines;
    let onClose: (() => void) | undefined;
    if (npc.questId && !q) {
      onClose = () => {
        if (startQuest(data, npc.questId!)) {
          audio.play('quest');
          this.toast(`Новое задание: ${questById(npc.questId!)?.title}`, P.gold2);
          bus.emit('quests:changed');
        }
      };
    } else if (q && !q.done) lines = npc.repeatLines;
    else if (q?.done) lines = npc.doneLines ?? npc.repeatLines;
    this.dialogOpen = true;
    this.physics.world.pause();
    this.player.setVelocity(0, 0);
    bus.emit('dialog:open', { name: npc.name, lines, onClose });
  }

  private openChest(e: ParsedEntity, s: Phaser.GameObjects.Sprite): void {
    const data = this.data_;
    if (isRemoved(data, e.id)) return;
    markRemoved(data, e.id);
    s.setFrame(1);
    audio.play('chest');
    data.stats.chestsOpened++;
    const x = s.x;
    const y = s.y + 10;
    const coins = randInt(8, 18);
    this.spawnPickup('coin', x, y, 10, undefined, true);
    for (let i = 0; i < coins - 10; i++) this.spawnPickup('coin', x, y, 1, undefined, true);
    if (Math.random() < 0.55) this.spawnPickup('potion', x, y, 1, undefined, true);
    if (Math.random() < 0.4) this.spawnPickup('oil', x, y, 40, undefined, true);
    this.burst(x, s.y, hex(P.gold2), 12);
    checkAchievements({ event: 'tick' });
  }

  private openDoor(e: ParsedEntity, s: Phaser.GameObjects.Image, zone: Phaser.GameObjects.Zone, it: Interactable): void {
    const data = this.data_;
    if (data.inventory.keys <= 0) {
      audio.play('denied');
      this.toast('Заперто. Нужен ключ', P.red3);
      return;
    }
    data.inventory.keys--;
    markRemoved(data, e.id);
    audio.play('door');
    zone.destroy();
    setSolid(this.grid, e.x, e.y, false);
    this.interactables = this.interactables.filter((i) => i !== it);
    this.tweens.add({ targets: s, alpha: 0, y: s.y - 4, duration: 400, onComplete: () => s.destroy() });
    this.toast('Дверь отперта', P.cloak3);
  }

  private breakPot(br: Breakable): void {
    markRemoved(this.data_, br.id);
    audio.play('break');
    this.burst(br.sprite.x, br.sprite.y, hex(P.dirt3), 10);
    br.sprite.destroy();
    br.zone.destroy();
    setSolid(this.grid, br.tx, br.ty, false);
    this.breakables = this.breakables.filter((b) => b !== br);
    const r = Math.random();
    if (r < 0.55) this.spawnPickup('coin', br.sprite.x, br.sprite.y, 1, undefined, true);
    if (r < 0.25) this.spawnPickup('coin', br.sprite.x, br.sprite.y, 1, undefined, true);
    else if (r > 0.9) this.spawnPickup('oil', br.sprite.x, br.sprite.y, 25, undefined, true);
  }

  private beaconLabel(): string {
    const data = this.data_;
    if (currentLevel(data).beaconLit) return data.levelIndex >= LEVEL_COUNT - 1 ? 'Последний маяк горит — посмотреть финал' : 'Войти в портал';
    return `Зажечь маяк (${data.inventory.shards}/${this.def.shardsRequired})`;
  }

  private useBeacon(): void {
    const data = this.data_;
    const lp = currentLevel(data);
    const last = data.levelIndex >= LEVEL_COUNT - 1;
    if (lp.beaconLit) {
      // На последнем уровне повторно показываем финал (например, после «Продолжить» с автосохранения).
      if (last) this.onVictory(false);
      else this.goToNextLevel();
      return;
    }
    const need = this.def.shardsRequired - data.inventory.shards;
    if (need > 0) {
      audio.play('denied');
      this.toast(`Маяк холоден. Нужно ещё осколков: ${need}`, P.red3);
      return;
    }
    lp.beaconLit = true;
    audio.play('beacon');
    this.shake(500, 0.006);
    this.cameras.main.flash(500, 255, 210, 140);
    this.igniteBeaconVisuals(true);
    this.questEvent({ type: 'beacon' });
    checkAchievements({ event: 'tick' });
    if (last) {
      this.toast('Последний маяк зажжён! Тьма отступает...', P.gold2);
      this.transitioning = true;
      this.time.delayedCall(2600, () => this.onVictory(true));
    } else {
      this.toast('Маяк зажжён! Портал открыт — войдите в него', P.gold2);
      saveGame(Session.storage, SAVE_SLOTS[0], data);
    }
  }

  private igniteBeaconVisuals(animate: boolean): void {
    if (!this.beaconSprite) return;
    const s = this.beaconSprite;
    s.play('beacon:burn');
    if (this.beaconLight) {
      this.beaconLight.intensity = 0.4;
      this.beaconLight.glow?.setAlpha(0.4);
      if (animate) this.tweens.add({ targets: this.beaconLight, radius: 120, duration: 1200, ease: 'Quad.easeOut' });
      else this.beaconLight.radius = 120;
    }
    this.add.particles(s.x, s.y - 6, 'ember', {
      lifespan: 1400, speed: { min: 8, max: 30 }, angle: { min: 200, max: 340 }, alpha: { start: 1, end: 0 },
      scale: { start: 1.5, end: 0.5 }, frequency: 60, blendMode: 'ADD',
    }).setDepth(DEPTH.airFx);
  }

  private goToNextLevel(): void {
    if (this.transitioning) return;
    const data = this.data_;
    this.transitioning = true;
    audio.play('portal');
    checkAchievements({ event: 'level_complete', levelDamageTaken: currentLevel(data).damageTaken });
    this.cameras.main.fadeOut(700, 255, 220, 160);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      advanceLevel(data);
      this.scene.restart();
    });
  }

  /** firstTime=false — повторный просмотр финала: статистика побед не увеличивается. */
  private onVictory(firstTime = true): void {
    const data = this.data_;
    if (!firstTime) {
      audio.playMusic('victory');
      openOverlay(this, 'Victory');
      return;
    }
    checkAchievements({ event: 'level_complete', levelDamageTaken: currentLevel(data).damageTaken });
    checkAchievements({ event: 'victory' });
    Session.profile.wins++;
    const t = data.stats.playTimeMs;
    if (Session.profile.bestTimeMs === null || t < Session.profile.bestTimeMs) Session.profile.bestTimeMs = t;
    persistProfile();
    saveGame(Session.storage, SAVE_SLOTS[0], data);
    audio.playMusic('victory');
    openOverlay(this, 'Victory');
  }

  private drinkPotion(): void {
    const healed = usePotion(this.data_);
    if (healed > 0) {
      audio.play('potion');
      this.floatText(this.player.x, this.player.y - 12, `+${healed}`, P.slime3);
      this.burst(this.player.x, this.player.y, hex(P.slime3), 10);
    } else {
      audio.play('denied');
      this.toast(this.data_.inventory.potions <= 0 ? 'Нет зелий' : 'Здоровье и так полное', P.gray3);
    }
  }

  private tryCollect(s: Phaser.Physics.Arcade.Sprite): void {
    if (!s.active || this.time.now < (s.getData('readyAt') as number) || this.dead) return;
    const data = this.data_;
    const kind = s.getData('kind') as PickupKind;
    const value = s.getData('value') as number;
    const id = s.getData('id') as string | undefined;
    switch (kind) {
      case 'coin':
        addCoins(data, value);
        audio.play('coin');
        this.floatText(s.x, s.y - 6, `+${value}`, P.gold2);
        break;
      case 'potion':
        if (!addPotion(data)) {
          if (this.time.now > this.bagFullToastAt) {
            this.bagFullToastAt = this.time.now + 3000;
            this.toast('Сумка полна: больше 9 зелий не унести', P.gray3);
          }
          return;
        }
        audio.play('pickup');
        this.toast('Зелье здоровья (Q — выпить)', P.red3);
        break;
      case 'oil':
        addOil(data, value);
        audio.play('pickup');
        this.toast(`Масло для фонаря +${value}`, P.gold2);
        break;
      case 'key':
        data.inventory.keys++;
        audio.play('pickup');
        this.toast('Получен ключ', P.gold2);
        break;
      case 'shard':
        data.inventory.shards++;
        audio.play('quest');
        this.toast(`Осколок угля (${data.inventory.shards}/${this.def.shardsRequired})`, P.fire3);
        this.burst(s.x, s.y, hex(P.fire3), 14);
        this.questEvent({ type: 'shard', total: data.inventory.shards });
        break;
    }
    if (id) markRemoved(data, id);
    s.destroy();
  }

  private questEvent(ev: QuestEvent): void {
    const res = applyQuestEvent(this.data_, ev);
    for (const q of res.completed) {
      audio.play('quest');
      const reward = q.reward ? ` Награда: ${[q.reward.coins ? `${q.reward.coins} монет` : '', q.reward.potions ? `зелья ×${q.reward.potions}` : '', q.reward.xp ? `${q.reward.xp} опыта` : ''].filter(Boolean).join(', ')}` : '';
      this.toast(`Задание выполнено: ${q.title}.${reward}`, P.slime3);
    }
    if (res.levelsGained > 0) this.onLevelUp();
    bus.emit('quests:changed');
  }

  // ------------------------------------------------------------------ для тестового API
  debugEnemies(): { type: string; x: number; y: number; hp: number; state: string }[] {
    return this.enemies.map((e) => ({ type: e.def.type, x: Math.round(e.cx), y: Math.round(e.cy), hp: e.hp, state: e.aiState }));
  }

  /** Наносит урон ближайшему врагу так же, как удар игрока (с лутом и опытом). */
  debugDamageNearest(amount: number): string | null {
    let best: Enemy | null = null;
    let bd = Infinity;
    for (const e of this.enemies) {
      const d = Phaser.Math.Distance.Between(e.cx, e.cy, this.player.x, this.player.y);
      if (!e.dead && d < bd) {
        bd = d;
        best = e;
      }
    }
    if (!best) return null;
    if (best.takeHit(amount, this.player.x, this.player.y)) this.killEnemy(best);
    return best.def.type;
  }

  // ------------------------------------------------------------------ эффекты
  private burst(x: number, y: number, color: number, n: number): void {
    this.sparks.setParticleTint(color);
    this.sparks.explode(n, x, y);
  }

  private floatText(x: number, y: number, str: string, color: string): void {
    const t = this.add.text(x, y, str, {
      fontFamily: FONT, fontSize: '8px', color, stroke: '#0b0910', strokeThickness: 2, resolution: WORLD_ZOOM,
    }).setOrigin(0.5).setDepth(DEPTH.text);
    this.tweens.add({ targets: t, y: y - 12, alpha: 0, duration: 800, ease: 'Quad.easeOut', onComplete: () => t.destroy() });
  }

  private toast(msg: string, color: string): void {
    bus.emit('toast', { msg, color });
  }
}
