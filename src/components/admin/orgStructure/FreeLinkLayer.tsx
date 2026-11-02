// The lines between cards in «چیدمان آزاد»: drawn from where the cards really are, so they follow
// a card that was dragged. Elbow lines from the bottom of the parent to the top of the child.
import React, { RefObject, useCallback, useLayoutEffect, useState } from 'react';
import { linkPath } from './OrgLinkLayer';
import type { FreeOffset } from './FreeDrag';
import { localRect } from './usePanZoom';

export const FreeLinkLayer: React.FC<{
  content: RefObject<HTMLDivElement | null>;
  pairs: [string, string][];
  offsets: Record<string, FreeOffset>;
}> = ({ content, pairs, offsets }) => {
  const [paths, setPaths] = useState<string[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });

  const measure = useCallback(() => {
    const root = content.current;
    if (!root) return;
    const boxOf = (key: string) => {
      const sel = key === 'company' || key === 'head' ? `[data-free-id="${key}"]` : `[data-node="${CSS.escape(key)}"]`;
      const el = root.querySelector(sel) as HTMLElement | null;
      if (!el || !el.offsetParent) return null;
      const r = localRect(el, root);
      const o = offsets[key];
      return { x: r.x + (o?.x ?? 0), y: r.y + (o?.y ?? 0), w: r.w, h: r.h };
    };
    const next: string[] = [];
    for (const [p, c] of pairs) {
      const a = boxOf(p);
      const b = boxOf(c);
      if (!a || !b) continue;
      const ax = a.x + a.w / 2;
      const ay = a.y + a.h;
      const bx = b.x + b.w / 2;
      if (b.y > ay + 12) {
        const mid = ay + (b.y - ay) / 2;
        next.push(`M ${ax} ${ay} V ${mid} H ${bx} V ${b.y}`);
      } else {
        next.push(linkPath(a, b));
      }
    }
    setPaths((prev) => (prev.join('|') === next.join('|') ? prev : next));
    setSize((prev) => (prev.w === root.offsetWidth && prev.h === root.offsetHeight ? prev : { w: root.offsetWidth, h: root.offsetHeight }));
  }, [content, pairs, offsets]);

  // Every render may have moved a card (a drag, a branch opening): measure again, set only on change.
  useLayoutEffect(() => { measure(); });

  return (
    <svg data-free-lines aria-hidden="true" className="absolute top-0 left-0 pointer-events-none overflow-visible text-slate-300 dark:text-slate-600" width={size.w} height={size.h}>
      {paths.map((d, i) => <path key={i} d={d} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />)}
    </svg>
  );
};
