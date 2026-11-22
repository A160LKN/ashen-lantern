/**
 * Логика звукового движка с поддельным AudioContext: настоящий звук в node недоступен,
 * но очередь отложенной музыки и реакция на «пробуждение» контекста проверяемы.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class FakeParam {
  value = 0;
  setValueAtTime() { return this; }
  setTargetAtTime() { return this; }
  linearRampToValueAtTime() { return this; }
  exponentialRampToValueAtTime() { return this; }
}
class FakeNode {
  gain = new FakeParam();
  frequency = new FakeParam();
  detune = new FakeParam();
  delayTime = new FakeParam();
  Q = new FakeParam();
  type = '';
  buffer: unknown = null;
  loop = false;
  connect() {}
  disconnect() {}
  start() {}
  stop() {}
}
class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  state: 'suspended' | 'running' = 'suspended';
  currentTime = 0;
  sampleRate = 8000;
  destination = new FakeNode();
  onstatechange: (() => void) | null = null;
  resumeCalls = 0;
  constructor() { FakeAudioContext.instances.push(this); }
  resume() { this.resumeCalls++; return Promise.resolve(); }
  /** Имитация браузера: контекст проснулся позже. */
  wake() { this.state = 'running'; this.onstatechange?.(); }
  createGain() { return new FakeNode(); }
  createBiquadFilter() { return new FakeNode(); }
  createDelay() { return new FakeNode(); }
  createOscillator() { return new FakeNode(); }
  createBufferSource() { return new FakeNode(); }
  createBuffer(_c: number, len: number) { return { getChannelData: () => new Float32Array(len) }; }
}

let listeners: Record<string, (() => void)[]>;

beforeEach(() => {
  vi.resetModules();
  FakeAudioContext.instances = [];
  listeners = {};
  vi.stubGlobal('window', {
    AudioContext: FakeAudioContext,
    setInterval: () => 1,
    clearInterval: () => undefined,
    addEventListener: (ev: string, fn: () => void) => { (listeners[ev] ??= []).push(fn); },
  });
  vi.stubGlobal('performance', { now: () => 0 });
});
afterEach(() => vi.unstubAllGlobals());

describe('звуковой движок (регрессия BUG-014)', () => {
  it('музыка и фон стартуют, когда контекст «просыпается» после первого жеста', async () => {
    const { audio } = await import('../src/systems/Audio');
    audio.playMusic('menu'); // до жеста — в очередь
    audio.unlock(); // жест: контекст создан, но ещё приостановлен
    expect(audio.debugState()).toMatchObject({ context: 'suspended', pendingTrack: 'menu', sequencer: false });
    audio.setAmbient('forest');
    FakeAudioContext.instances[0].wake();
    expect(audio.debugState()).toMatchObject({ context: 'running', track: 'menu', pendingTrack: null, sequencer: true, ambient: 'forest', ambientPlaying: true });
  });

  it('если первый жест не разбудил звук, следующий нажатие пробует снова', async () => {
    const { audio } = await import('../src/systems/Audio');
    audio.unlock();
    const ctx = FakeAudioContext.instances[0];
    const before = ctx.resumeCalls;
    for (const fn of listeners.keydown ?? []) fn();
    for (const fn of listeners.pointerdown ?? []) fn();
    expect(ctx.resumeCalls).toBe(before + 2);
  });

  it('смена трека, пока звук приостановлен, отменяет устаревший отложенный трек', async () => {
    const { audio } = await import('../src/systems/Audio');
    audio.unlock();
    audio.playMusic('forest');
    audio.playMusic(null); // например, выход в меню без музыки
    FakeAudioContext.instances[0].wake();
    expect(audio.debugState()).toMatchObject({ track: null, pendingTrack: null, sequencer: false });
  });
});
