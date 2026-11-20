/** Универсальный конечный автомат состояний (без зависимостей от движка). */
export interface StateConfig<C> {
  enter?(ctx: C, prev: string | null): void;
  update?(ctx: C, dt: number): void;
  exit?(ctx: C, next: string): void;
}

export class StateMachine<C> {
  private states = new Map<string, StateConfig<C>>();
  current: string | null = null;
  previous: string | null = null;
  /** Время в текущем состоянии, мс. */
  elapsed = 0;

  constructor(private ctx: C) {}

  add(name: string, cfg: StateConfig<C>): this {
    this.states.set(name, cfg);
    return this;
  }

  has(name: string): boolean {
    return this.states.has(name);
  }

  set(name: string): void {
    const next = this.states.get(name);
    if (!next) throw new Error(`Unknown state: ${name}`);
    if (this.current) this.states.get(this.current)?.exit?.(this.ctx, name);
    this.previous = this.current;
    this.current = name;
    this.elapsed = 0;
    next.enter?.(this.ctx, this.previous);
  }

  is(name: string): boolean {
    return this.current === name;
  }

  update(dt: number): void {
    if (!this.current) return;
    this.elapsed += dt;
    this.states.get(this.current)?.update?.(this.ctx, dt);
  }
}
