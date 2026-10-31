import { RefObject, useCallback, useEffect, useRef } from 'react';
import { type PanZoomView, centerTop, fitScaleFor, zoomAround } from './panMath';

export type { PanZoomView };

export const MAX_SCALE = 2;
/** The zoom the chart opens at (more if the whole chart fits bigger). */
export const START_SCALE = 0.5;
/** Below this the cards are hard to read: choosing one zooms in to it. */
export const READABLE_SCALE = 0.7;

const PAD = 24;
/** On narrow screens the zoom controls sit over the top of the canvas: the chart starts below them. */
const topPad = (vp: HTMLElement) => (vp.clientWidth < 640 ? 64 : PAD);

/** An element's place inside the zoomed content, unaffected by the current zoom. */
export function localRect(el: HTMLElement, content: HTMLElement) {
  let x = 0;
  let y = 0;
  let node: HTMLElement | null = el;
  while (node && node !== content) {
    x += node.offsetLeft;
    y += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  // A row inside a scrolled member list sits higher than its offset says.
  const list = el.parentElement?.closest<HTMLElement>('[data-scrollable]');
  if (list && content.contains(list)) y -= list.scrollTop;
  return { x, y, w: el.offsetWidth, h: el.offsetHeight };
}

/**
 * Pan and zoom for a canvas: the content is moved with a CSS transform (not re-rendered), so
 * zooming stays smooth with hundreds of cards. Wheel or pinch zooms around the pointer, dragging
 * moves; a drag never counts as a click on the card under it. Lists inside the canvas marked
 * data-scrollable keep scrolling with the wheel while they can. `active`: the viewport is mounted.
 */
export interface PanZoomOptions {
  /** 'zoom' (default): the wheel zooms. 'scroll': the wheel moves the chart (Shift: sideways) and Ctrl + wheel zooms. */
  wheel?: 'zoom' | 'scroll';
  /** A drag that starts on an element matching this does not pan (cards, buttons). */
  noPan?: string;
  /** The smallest zoom (default: the one that shows the whole chart) and the largest (default MAX_SCALE). */
  minScale?: number;
  maxScale?: number;
}

export function usePanZoom(viewport: RefObject<HTMLDivElement | null>, content: RefObject<HTMLDivElement | null>, active: boolean, options: PanZoomOptions = {}) {
  const opts = useRef(options);
  opts.current = options;
  const view = useRef<PanZoomView>({ x: 0, y: 0, s: 1 });
  const listeners = useRef(new Set<(view: PanZoomView) => void>());
  /** The user moved or zoomed since the chart opened (a resize then keeps their view). */
  const moved = useRef(false);
  const dragged = useRef(false);

  /** The zoom that shows the whole chart (never bigger than its real size). */
  const fitScale = useCallback(() => {
    const el = content.current;
    const vp = viewport.current;
    if (!el || !vp || !el.offsetWidth || !el.offsetHeight || !vp.clientWidth || !vp.clientHeight) return 1;
    return fitScaleFor({ w: el.offsetWidth, h: el.offsetHeight }, { w: vp.clientWidth, h: vp.clientHeight }, PAD, topPad(vp));
  }, [content, viewport]);

  /** Zooming out stops where the whole chart is in view. */
  const clampScale = useCallback((s: number) => Math.min(opts.current.maxScale ?? MAX_SCALE, Math.max(opts.current.minScale ?? fitScale(), s)), [fitScale]);

  const apply = useCallback((animate: boolean) => {
    const el = content.current;
    const vp = viewport.current;
    if (!el || !vp) return;
    const { x, y, s } = view.current;
    el.style.transition = animate ? 'transform 380ms cubic-bezier(0.2, 0.8, 0.2, 1)' : 'none';
    el.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
    listeners.current.forEach((listener) => listener(view.current));
  }, [content, viewport]);

  /** Some of the content always stays in sight. */
  const set = useCallback((next: PanZoomView, animate = false) => {
    const el = content.current;
    const vp = viewport.current;
    if (!el || !vp) return;
    const s = clampScale(next.s);
    const w = el.offsetWidth * s;
    const h = el.offsetHeight * s;
    const keep = Math.min(120, vp.clientWidth / 3, vp.clientHeight / 3);
    view.current = {
      s,
      x: Math.min(vp.clientWidth - keep, Math.max(keep - w, next.x)),
      y: Math.min(vp.clientHeight - keep, Math.max(keep - h, next.y)),
    };
    apply(animate);
  }, [apply, clampScale, content, viewport]);

  /** The whole chart in view (never bigger than its real size). */
  const fit = useCallback((animate = false, sticky = false) => {
    const el = content.current;
    const vp = viewport.current;
    if (!el || !vp || !vp.clientWidth || !vp.clientHeight) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const top = topPad(vp);
    const s = fitScale();
    moved.current = false;
    set({ s, x: (vp.clientWidth - w * s) / 2, y: Math.max(top, (vp.clientHeight - h * s) / 2) }, animate);
    // `sticky`: the chart stays as fitted when the canvas is resized later (instead of going back to the opening view).
    if (sticky) moved.current = true;
  }, [content, fitScale, set, viewport]);

  /** How the chart opens: at START_SCALE, centred, from its top (where the company is). */
  const home = useCallback((animate = false) => {
    const el = content.current;
    const vp = viewport.current;
    if (!el || !vp || !vp.clientWidth || !vp.clientHeight) return;
    const top = topPad(vp);
    const s = clampScale(START_SCALE);
    const w = el.offsetWidth * s;
    const h = el.offsetHeight * s;
    // A chart wider than the canvas even at the opening size (hundreds of nodes) opens whole, not cut at its sides.
    if (w > vp.clientWidth - 2 * PAD) {
      fit(animate);
      return;
    }
    moved.current = false;
    set({ s, x: (vp.clientWidth - w) / 2, y: h <= vp.clientHeight - top - PAD ? (vp.clientHeight - h) / 2 : top }, animate);
  }, [clampScale, content, fit, set, viewport]);

  const zoomAt = useCallback((px: number, py: number, factor: number, animate = false) => {
    moved.current = true;
    set(zoomAround(view.current, px, py, factor, opts.current.minScale ?? fitScale(), opts.current.maxScale ?? MAX_SCALE), animate);
  }, [fitScale, set]);

  const zoomBy = useCallback((factor: number) => {
    const vp = viewport.current;
    if (vp) zoomAt(vp.clientWidth / 2, vp.clientHeight / 2, factor, true);
  }, [viewport, zoomAt]);

  /** Brings an element of the content into view, zoomed in enough to read it. */
  const focus = useCallback((el: HTMLElement, options: { onlyIfNeeded?: boolean; minScale?: number } = {}) => {
    const root = content.current;
    const vp = viewport.current;
    if (!root || !vp || !root.contains(el)) return;
    const { minScale = 0.9, onlyIfNeeded = false } = options;
    // A row further down a member list is scrolled into the list first.
    const list = el.parentElement?.closest<HTMLElement>('[data-scrollable]');
    if (list && root.contains(list) && el.offsetParent === list) {
      list.scrollTop = el.offsetTop - (list.clientHeight - el.offsetHeight) / 2;
    }
    const r = localRect(el, root);
    const { x, y, s } = view.current;
    const vw = vp.clientWidth;
    const vh = vp.clientHeight;
    const inView = r.x * s + x >= 0 && (r.x + r.w) * s + x <= vw && r.y * s + y >= 0 && (r.y + r.h) * s + y <= vh;
    if (onlyIfNeeded && inView && s >= READABLE_SCALE) return;
    const ns = clampScale(Math.min(Math.max(s, minScale), (vw - 2 * PAD) / r.w));
    moved.current = true;
    set({
      s: ns,
      x: vw / 2 - (r.x + r.w / 2) * ns,
      // A third of the way down, so what hangs under the card (a deputy's teams) shows too.
      y: r.h * ns > vh - topPad(vp) - PAD ? topPad(vp) - r.y * ns : Math.max(topPad(vp), vh / 3 - (r.h * ns) / 2) - r.y * ns,
    }, true);
  }, [clampScale, content, set, viewport]);

  const subscribe = useCallback((listener: (view: PanZoomView) => void) => {
    listeners.current.add(listener);
    listener(view.current);
    return () => { listeners.current.delete(listener); };
  }, []);

  useEffect(() => {
    const vp = viewport.current;
    if (!active || !vp) return;
    const pointers = new Map<number, { x: number; y: number }>();
    let start: { x: number; y: number } | null = null;
    let pinch: { dist: number; mid: { x: number; y: number } } | null = null;

    const local = (e: { clientX: number; clientY: number }) => {
      const rect = vp.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const pinchOf = () => {
      const [a, b] = [...pointers.values()];
      return { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
    };

    const onWheel = (e: WheelEvent) => {
      const list = (e.target as Element).closest<HTMLElement>('[data-scrollable]');
      if (list && !e.ctrlKey && list.scrollHeight > list.clientHeight) {
        const canScroll = e.deltaY > 0 ? list.scrollTop + list.clientHeight < list.scrollHeight - 1 : list.scrollTop > 0;
        if (canScroll) return;
      }
      e.preventDefault();
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
      if (opts.current.wheel === 'scroll' && !e.ctrlKey) {
        const { x, y, s } = view.current;
        moved.current = true;
        // Shift (or a sideways wheel) moves along, the plain wheel moves up and down.
        const dx = e.shiftKey ? e.deltaY : e.deltaX;
        const dy = e.shiftKey ? 0 : e.deltaY;
        set({ x: x - dx * unit, y: y - dy * unit, s });
        return;
      }
      const p = local(e);
      // A pinch on a touchpad arrives as a wheel with ctrl held, in much smaller steps.
      zoomAt(p.x, p.y, Math.exp(-e.deltaY * unit * (e.ctrlKey ? 0.01 : 0.0015)));
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if ((e.target as Element).closest('input, select, textarea')) return;
      if (opts.current.noPan && (e.target as Element).closest(opts.current.noPan)) return;
      pointers.set(e.pointerId, local(e));
      if (pointers.size === 1) {
        start = local(e);
        dragged.current = false;
      } else if (pointers.size === 2) {
        pinch = pinchOf();
        dragged.current = true;
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      const p = local(e);
      pointers.set(e.pointerId, p);
      if (pointers.size === 2 && pinch) {
        const now = pinchOf();
        const { x, y, s } = view.current;
        const ns = clampScale(s * (now.dist / pinch.dist));
        moved.current = true;
        set({
          s: ns,
          x: now.mid.x - (pinch.mid.x - x) * (ns / s),
          y: now.mid.y - (pinch.mid.y - y) * (ns / s),
        });
        pinch = now;
        return;
      }
      if (pointers.size !== 1 || !start) return;
      if (!dragged.current && Math.hypot(p.x - start.x, p.y - start.y) < 5) return;
      if (!dragged.current) {
        dragged.current = true;
        vp.setPointerCapture(e.pointerId);
        vp.dataset.dragging = 'true';
      }
      moved.current = true;
      set({ ...view.current, x: view.current.x + p.x - prev.x, y: view.current.y + p.y - prev.y });
    };

    const onPointerUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (pointers.size === 0) {
        start = null;
        delete vp.dataset.dragging;
      }
    };

    // The click that ends a drag does not select the card under the pointer.
    const onClick = (e: MouseEvent) => {
      if (!dragged.current) return;
      dragged.current = false;
      e.stopPropagation();
      e.preventDefault();
    };

    const onDoubleClick = (e: MouseEvent) => {
      if ((e.target as Element).closest('[data-node], button, input, select, textarea')) return;
      const p = local(e);
      zoomAt(p.x, p.y, 1.8, true);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.target !== vp) return;
      const step = 80;
      const keys: Record<string, () => void> = {
        '+': () => zoomBy(1.3),
        '=': () => zoomBy(1.3),
        '-': () => zoomBy(1 / 1.3),
        '0': () => fit(true),
        ArrowLeft: () => set({ ...view.current, x: view.current.x + step }, true),
        ArrowRight: () => set({ ...view.current, x: view.current.x - step }, true),
        ArrowUp: () => set({ ...view.current, y: view.current.y + step }, true),
        ArrowDown: () => set({ ...view.current, y: view.current.y - step }, true),
      };
      const action = keys[e.key];
      if (!action) return;
      e.preventDefault();
      moved.current = true;
      action();
    };

    // The browser's own drag of a picture or link is not wanted; a node card that can be moved (data-draggable-node) is.
    const onDragStart = (e: DragEvent) => { if (!(e.target as Element).closest?.('[data-draggable-node]')) e.preventDefault(); };
    // A drag the browser takes over (moving a card) cancels the pointer: it is neither a pan nor a click.
    const onPointerCancel = (e: PointerEvent) => {
      onPointerUp(e);
      dragged.current = false;
    };

    // Until the user moves the chart, it keeps fitting the canvas as the canvas changes size.
    const resize = new ResizeObserver(() => {
      if (!moved.current) home();
      else set(view.current);
    });
    resize.observe(vp);

    vp.addEventListener('wheel', onWheel, { passive: false });
    vp.addEventListener('pointerdown', onPointerDown);
    vp.addEventListener('pointermove', onPointerMove);
    vp.addEventListener('pointerup', onPointerUp);
    vp.addEventListener('pointercancel', onPointerCancel);
    vp.addEventListener('click', onClick, true);
    vp.addEventListener('dblclick', onDoubleClick);
    vp.addEventListener('keydown', onKey);
    vp.addEventListener('dragstart', onDragStart);
    return () => {
      resize.disconnect();
      vp.removeEventListener('wheel', onWheel);
      vp.removeEventListener('pointerdown', onPointerDown);
      vp.removeEventListener('pointermove', onPointerMove);
      vp.removeEventListener('pointerup', onPointerUp);
      vp.removeEventListener('pointercancel', onPointerCancel);
      vp.removeEventListener('click', onClick, true);
      vp.removeEventListener('dblclick', onDoubleClick);
      vp.removeEventListener('keydown', onKey);
      vp.removeEventListener('dragstart', onDragStart);
    };
  }, [active, clampScale, fit, home, set, viewport, zoomAt, zoomBy]);

  /** The view as it is (to keep it while another drawing is shown) and putting one back. */
  const getView = useCallback((): PanZoomView => ({ ...view.current }), []);
  const setView = useCallback((next: PanZoomView, animate = false) => { moved.current = true; set(next, animate); }, [set]);

  /** Puts an element at the top middle of the canvas at exactly this zoom. */
  const centerOn = useCallback((el: HTMLElement, scale: number, animate = true) => {
    const root = content.current;
    const vp = viewport.current;
    if (!root || !vp || !root.contains(el)) return;
    moved.current = true;
    set(centerTop(localRect(el, root), clampScale(scale), { w: vp.clientWidth }, topPad(vp)), animate);
  }, [clampScale, content, set, viewport]);

  return { fit, home, zoomBy, focus, centerOn, fitScale, subscribe, getView, setView };
}
