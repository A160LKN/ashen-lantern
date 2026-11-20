/** Низкоуровневые помощники рисования пикселей на Canvas. */
export function createCanvas(w: number, h: number): { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = false;
  return { c, ctx };
}

/** Рисовальщик с поддержкой зеркалирования по горизонтали. */
export class Painter {
  constructor(public ctx: CanvasRenderingContext2D, public w: number, public flip = false, public ox = 0, public oy = 0) {}

  rect(x: number, y: number, w: number, h: number, color: string | null | undefined): void {
    if (!color || w <= 0 || h <= 0) return;
    const X = this.flip ? this.w - x - w : x;
    this.ctx.fillStyle = color;
    this.ctx.fillRect(Math.round(this.ox + X), Math.round(this.oy + y), Math.round(w), Math.round(h));
  }

  px(x: number, y: number, color: string | null | undefined): void {
    this.rect(x, y, 1, 1, color);
  }

  /** Залитый «пиксельный» эллипс. */
  ellipse(cx: number, cy: number, rx: number, ry: number, color: string): void {
    for (let y = -ry; y <= ry; y++) {
      const t = 1 - (y * y) / (ry * ry + 0.5);
      if (t < 0) continue;
      const half = Math.round(rx * Math.sqrt(t));
      this.rect(cx - half, cy + y, half * 2 + 1, 1, color);
    }
  }

  circle(cx: number, cy: number, r: number, color: string): void {
    this.ellipse(cx, cy, r, r, color);
  }

  ring(cx: number, cy: number, r: number, color: string): void {
    for (let a = 0; a < Math.PI * 2; a += 0.5 / Math.max(1, r)) {
      this.px(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), color);
    }
  }

  line(x0: number, y0: number, x1: number, y1: number, color: string): void {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) this.px(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), color);
  }
}

/** Обводка силуэта: прозрачные пиксели рядом с непрозрачными окрашиваются. */
export function addOutline(canvas: HTMLCanvasElement, color: string): void {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const { width: w, height: h } = canvas;
  const img = ctx.getImageData(0, 0, w, h);
  const src = new Uint8ClampedArray(img.data);
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && src[(y * w + x) * 4 + 3] > 40;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (src[i + 3] > 40) continue;
      if (solid(x + 1, y) || solid(x - 1, y) || solid(x, y + 1) || solid(x, y - 1)) {
        img.data[i] = r;
        img.data[i + 1] = g;
        img.data[i + 2] = b;
        img.data[i + 3] = 255;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
}

/** Создаёт кадр заданного размера, опционально с обводкой. */
export function frame(w: number, h: number, draw: (p: Painter) => void, outline?: string, flip = false): HTMLCanvasElement {
  const { c, ctx } = createCanvas(w, h);
  draw(new Painter(ctx, w, flip));
  if (outline) addOutline(c, outline);
  return c;
}

/** Склеивает кадры в горизонтальную ленту. */
export function strip(frames: HTMLCanvasElement[]): HTMLCanvasElement {
  const fw = frames[0].width;
  const fh = frames[0].height;
  const { c, ctx } = createCanvas(fw * frames.length, fh);
  frames.forEach((f, i) => ctx.drawImage(f, i * fw, 0));
  return c;
}
