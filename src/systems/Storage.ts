/** Абстракция хранилища — позволяет тестировать сохранения без браузера. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

class MemoryStorage implements StorageLike {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

export function createMemoryStorage(): StorageLike {
  return new MemoryStorage();
}

/** localStorage, а при его недоступности — хранилище в памяти. */
export function getBrowserStorage(): StorageLike {
  try {
    const ls = globalThis.localStorage;
    const probe = '__ashen_probe__';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return ls;
  } catch {
    return createMemoryStorage();
  }
}
