// The arithmetic of the pan/zoom canvas, apart from the DOM so it can be checked (scripts/check-org-kinds.ts).
// A view is where the content's top-left is (x, y, in canvas pixels) and its scale s: a point p of the content is drawn at x + p * s.
export interface PanZoomView { x: number; y: number; s: number }

export const clampScale = (s: number, min: number, max: number): number => Math.min(max, Math.max(min, s));

/** Zooms by `factor` around the canvas point (px, py): the content point under it stays under it. */
export function zoomAround(view: PanZoomView, px: number, py: number, factor: number, min: number, max: number): PanZoomView {
  const s = clampScale(view.s * factor, min, max);
  const k = s / view.s;
  return { s, x: px - (px - view.x) * k, y: py - (py - view.y) * k };
}

/** The scale that shows all the content (never bigger than `ceiling`), with `pad` around and `top` free above. */
export function fitScaleFor(content: { w: number; h: number }, canvas: { w: number; h: number }, pad: number, top: number, ceiling = 1): number {
  if (!content.w || !content.h || !canvas.w || !canvas.h) return ceiling;
  return Math.max(0.01, Math.min(ceiling, (canvas.w - 2 * pad) / content.w, (canvas.h - top - pad) / content.h));
}

/** A view that puts the content rectangle `r` (content pixels) at the top middle of the canvas at scale `s`. */
export function centerTop(r: { x: number; y: number; w: number; h: number }, s: number, canvas: { w: number }, top: number): PanZoomView {
  return { s, x: canvas.w / 2 - (r.x + r.w / 2) * s, y: top - r.y * s };
}

/** Whether any part of the content rectangle (content pixels) is inside the canvas under `view`. */
export function isInSight(view: PanZoomView, content: { w: number; h: number }, canvas: { w: number; h: number }): boolean {
  const left = view.x;
  const top = view.y;
  const right = view.x + content.w * view.s;
  const bottom = view.y + content.h * view.s;
  return right > 0 && bottom > 0 && left < canvas.w && top < canvas.h;
}
