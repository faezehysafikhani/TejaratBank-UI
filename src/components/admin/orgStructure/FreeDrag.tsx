// «چیدمان آزاد»: a card (with what hangs under it) that can be dragged to any place on the chart.
// Only how the chart looks changes: the offsets are kept in the browser, the structure is untouched.
import React, { useRef } from 'react';

export interface FreeOffset { x: number; y: number }

export const FreeDrag: React.FC<{
  id: string;
  enabled: boolean;
  offset?: FreeOffset;
  /** The chart's current zoom (the drag moves in chart units, not screen pixels). */
  scale: () => number;
  onMove: (id: string, offset: FreeOffset) => void;
  onEnd: () => void;
  className?: string;
  children: React.ReactNode;
}> = ({ id, enabled, offset, scale, onMove, onEnd, className = '', children }) => {
  const suppress = useRef(false);
  const o = enabled ? offset : undefined;

  const start = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if ((e.target as Element).closest('button, input, select, textarea, a')) return;
    const d = { sx: e.clientX, sy: e.clientY, ox: offset?.x ?? 0, oy: offset?.y ?? 0, active: false, pointerId: e.pointerId };
    // Listened on the window: a quick drag leaves a small card at once, and the moves must still arrive.
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== d.pointerId) return;
      if (!d.active) {
        if (Math.hypot(ev.clientX - d.sx, ev.clientY - d.sy) < 4) return;
        d.active = true;
      }
      const s = scale() || 1;
      onMove(id, { x: d.ox + (ev.clientX - d.sx) / s, y: d.oy + (ev.clientY - d.sy) / s });
    };
    const end = (ev: PointerEvent) => {
      if (ev.pointerId !== d.pointerId) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      if (!d.active) return;
      suppress.current = true;
      setTimeout(() => { suppress.current = false; }, 0);
      onEnd();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  };

  return (
    <div
      data-free-id={id}
      data-free-drag={enabled ? '' : undefined}
      className={`${className} ${enabled ? 'cursor-move' : ''}`}
      style={o && (o.x || o.y) ? { transform: `translate(${o.x}px, ${o.y}px)` } : undefined}
      onPointerDown={enabled ? start : undefined}
      onClickCapture={(e) => { if (suppress.current) { e.stopPropagation(); e.preventDefault(); } }}
    >
      {children}
    </div>
  );
};
