/** Пиксельные панели и кнопки интерфейса (рисуются в логическом масштабе и увеличиваются). */
import { createCanvas, Painter } from './canvas';
import { P } from './palette';

export type PanelStyle = 'panel' | 'dark' | 'button' | 'hover' | 'disabled' | 'slot' | 'slotActive' | 'bar';

const STYLES: Record<PanelStyle, { fill: string; border: string; light: string; shade: string }> = {
  panel: { fill: P.ui1, border: P.ui4, light: P.ui3, shade: P.ui0 },
  dark: { fill: P.ui0, border: P.ui3, light: P.ui2, shade: P.black },
  button: { fill: P.ui2, border: P.ui4, light: P.ui3, shade: P.ui0 },
  hover: { fill: P.ui3, border: P.gold2, light: P.ui4, shade: P.ui1 },
  disabled: { fill: P.ui1, border: P.ui2, light: P.ui1, shade: P.ui0 },
  slot: { fill: P.ui0, border: P.ui3, light: P.ui2, shade: P.black },
  slotActive: { fill: P.ui2, border: P.gold2, light: P.ui4, shade: P.ui0 },
  bar: { fill: P.black, border: P.ui3, light: P.ui2, shade: P.black },
};

export function panelCanvas(w: number, h: number, style: PanelStyle): HTMLCanvasElement {
  const s = STYLES[style];
  const { c, ctx } = createCanvas(w, h);
  const p = new Painter(ctx, w);
  p.rect(1, 0, w - 2, h, P.outline);
  p.rect(0, 1, w, h - 2, P.outline);
  p.rect(1, 1, w - 2, h - 2, s.border);
  p.rect(2, 2, w - 4, h - 4, s.fill);
  p.rect(2, 2, w - 4, 1, s.light);
  p.rect(2, h - 3, w - 4, 1, s.shade);
  if (style === 'panel' || style === 'dark') {
    // Угловые заклёпки.
    for (const [x, y] of [[3, 3], [w - 4, 3], [3, h - 4], [w - 4, h - 4]]) p.px(x, y, P.gold1);
  }
  return c;
}
