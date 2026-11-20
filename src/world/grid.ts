/** Сетка проходимости уровня, прямая видимость и поиск пути A* (без зависимостей от движка). */
export interface Grid {
  w: number;
  h: number;
  solid: Uint8Array;
}

export interface Pt {
  x: number;
  y: number;
}

export function createGrid(w: number, h: number): Grid {
  return { w, h, solid: new Uint8Array(w * h) };
}

export function inBounds(g: Grid, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < g.w && y < g.h;
}

export function isSolid(g: Grid, x: number, y: number): boolean {
  if (!inBounds(g, x, y)) return true;
  return g.solid[y * g.w + x] === 1;
}

export function setSolid(g: Grid, x: number, y: number, v: boolean): void {
  if (inBounds(g, x, y)) g.solid[y * g.w + x] = v ? 1 : 0;
}

/** Проверка прямой видимости между двумя точками в мировых пикселях. */
export function lineOfSight(g: Grid, x0: number, y0: number, x1: number, y1: number, tile = 16): boolean {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const dist = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(dist / 4));
  for (let i = 1; i < steps; i++) {
    const px = x0 + (dx * i) / steps;
    const py = y0 + (dy * i) / steps;
    if (isSolid(g, Math.floor(px / tile), Math.floor(py / tile))) return false;
  }
  return true;
}

const DIRS: ReadonlyArray<[number, number, number]> = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

/**
 * A* по 8 направлениям без «срезания углов».
 * Возвращает путь (без стартовой клетки) или null.
 */
export function findPath(g: Grid, sx: number, sy: number, tx: number, ty: number, maxIter = 3000): Pt[] | null {
  if (!inBounds(g, tx, ty) || isSolid(g, tx, ty)) return null;
  if (sx === tx && sy === ty) return [];
  const size = g.w * g.h;
  const gScore = new Float32Array(size).fill(Infinity);
  const came = new Int32Array(size).fill(-1);
  const closed = new Uint8Array(size);
  const open: number[] = [];
  const fScore = new Float32Array(size).fill(Infinity);
  const start = sy * g.w + sx;
  const goal = ty * g.w + tx;
  const hFn = (i: number) => {
    const x = i % g.w;
    const y = (i / g.w) | 0;
    const ddx = Math.abs(x - tx);
    const ddy = Math.abs(y - ty);
    return Math.max(ddx, ddy) + (Math.SQRT2 - 1) * Math.min(ddx, ddy);
  };
  gScore[start] = 0;
  fScore[start] = hFn(start);
  open.push(start);
  let iter = 0;
  while (open.length && iter++ < maxIter) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (fScore[open[i]] < fScore[open[bi]]) bi = i;
    const cur = open[bi];
    open[bi] = open[open.length - 1];
    open.pop();
    if (cur === goal) {
      const path: Pt[] = [];
      let c = cur;
      while (c !== start && c !== -1) {
        path.push({ x: c % g.w, y: (c / g.w) | 0 });
        c = came[c];
      }
      return path.reverse();
    }
    if (closed[cur]) continue;
    closed[cur] = 1;
    const cx = cur % g.w;
    const cy = (cur / g.w) | 0;
    for (const [dx, dy, cost] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (isSolid(g, nx, ny)) continue;
      if (dx !== 0 && dy !== 0 && (isSolid(g, cx + dx, cy) || isSolid(g, cx, cy + dy))) continue;
      const ni = ny * g.w + nx;
      if (closed[ni]) continue;
      const tentative = gScore[cur] + cost;
      if (tentative < gScore[ni]) {
        came[ni] = cur;
        gScore[ni] = tentative;
        fScore[ni] = tentative + hFn(ni);
        open.push(ni);
      }
    }
  }
  return null;
}

/** Достижимые клетки от старта (BFS, 4 направления). */
export function floodFill(g: Grid, sx: number, sy: number): Uint8Array {
  const seen = new Uint8Array(g.w * g.h);
  if (isSolid(g, sx, sy)) return seen;
  const q: number[] = [sy * g.w + sx];
  seen[q[0]] = 1;
  while (q.length) {
    const c = q.shift()!;
    const x = c % g.w;
    const y = (c / g.w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (isSolid(g, nx, ny)) continue;
      const ni = ny * g.w + nx;
      if (!seen[ni]) {
        seen[ni] = 1;
        q.push(ni);
      }
    }
  }
  return seen;
}
