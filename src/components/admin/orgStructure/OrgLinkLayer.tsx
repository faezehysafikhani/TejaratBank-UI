// The secondary links of the chart (a committee's dotted line to the board, a dashed functional
// line...), drawn as one SVG behind the cards. It lives inside the zoomed content, so pan and zoom
// move it with the cards (a CSS transform, nothing recomputed); the lines are only measured again
// when the layout itself changes (a card opens or closes, the chart is re-laid out). A link whose
// card is not on the chart (another company, a collapsed branch) is not drawn. No links: nothing.
import React, { RefObject, useCallback, useEffect, useId, useLayoutEffect, useMemo, useState } from 'react';
import type { ChartCompany, OrgLineStyle } from '../../../services/orgStructureApi';
import { linksOf } from './orgChartModel';
import { localRect } from './usePanZoom';

interface Box { x: number; y: number; w: number; h: number }
interface DrawnLink { key: string; d: string; style: OrgLineStyle; name: string; sourceId: string; targetId: string }

const DASH: Record<OrgLineStyle, string | undefined> = { solid: undefined, dotted: '1 6', dashed: '8 6' };

/** A curve from the side of one card that faces the other to the facing side of the other. */
export function linkPath(a: Box, b: Box): string {
  const ax = a.x + a.w / 2;
  const ay = a.y + a.h / 2;
  const bx = b.x + b.w / 2;
  const by = b.y + b.h / 2;
  const dx = bx - ax;
  const dy = by - ay;
  // Mostly side by side: from the left/right edges; else from the top/bottom edges.
  if (Math.abs(dx) - (a.w + b.w) / 2 > Math.abs(dy) - (a.h + b.h) / 2) {
    const sx = dx > 0 ? a.x + a.w : a.x;
    const tx = dx > 0 ? b.x : b.x + b.w;
    const bend = Math.max(30, Math.abs(tx - sx) / 2) * Math.sign(dx || 1);
    return `M ${sx} ${ay} C ${sx + bend} ${ay}, ${tx - bend} ${by}, ${tx} ${by}`;
  }
  const sy = dy > 0 ? a.y + a.h : a.y;
  const ty = dy > 0 ? b.y : b.y + b.h;
  const bend = Math.max(30, Math.abs(ty - sy) / 2) * Math.sign(dy || 1);
  return `M ${ax} ${sy} C ${ax} ${sy + bend}, ${bx} ${ty - bend}, ${bx} ${ty}`;
}

export const OrgLinkLayer: React.FC<{
  company: ChartCompany;
  /** The zoomed content the cards are in (the SVG covers it). */
  content: RefObject<HTMLDivElement | null>;
  /** The selected node: its lines are drawn stronger. */
  highlightNodeId?: string | null;
  /** Cards moved by hand in the free layout (by card key): the lines follow them. */
  offsets?: Record<string, { x: number; y: number }>;
}> = ({ company, content, highlightNodeId, offsets }) => {
  const links = useMemo(() => linksOf(company), [company]);
  const [drawn, setDrawn] = useState<DrawnLink[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const marker = useId().replace(/:/g, '');

  const measure = useCallback(() => {
    const root = content.current;
    if (!root || links.length === 0) {
      setDrawn((prev) => (prev.length ? [] : prev));
      return;
    }
    const host: HTMLDivElement = root;
    const boxes = new Map<string, Box | null>();
    const boxOf = (unitId: string) => {
      if (!boxes.has(unitId)) {
        const el = host.querySelector(`[data-node="unit:${CSS.escape(unitId)}"]`) as HTMLElement | null;
        const r = el && el.offsetParent ? localRect(el, host) : null;
        const o = offsets?.[`unit:${unitId}`];
        boxes.set(unitId, r && o ? { ...r, x: r.x + o.x, y: r.y + o.y } : r);
      }
      return boxes.get(unitId)!;
    };
    const next: DrawnLink[] = [];
    for (const { source, link } of links) {
      const a = boxOf(source.unitId);
      const b = boxOf(link.targetNodeId);
      if (!a || !b) continue;
      next.push({ key: link.linkId, d: linkPath(a, b), style: link.lineStyle, name: link.name, sourceId: source.unitId, targetId: link.targetNodeId });
    }
    setDrawn(next);
    setSize({ w: root.offsetWidth, h: root.offsetHeight });
  }, [content, links, offsets]);

  useLayoutEffect(() => { measure(); }, [measure]);

  // Measure again (once a frame at most) when the layout changes.
  useEffect(() => {
    const root = content.current;
    if (!root || links.length === 0) return;
    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => { frame = 0; measure(); });
    };
    const resize = new ResizeObserver(schedule);
    resize.observe(root);
    const mutations = new MutationObserver((records) => {
      // Our own SVG changing is not a layout change.
      if (records.some((r) => !(r.target instanceof SVGElement))) schedule();
    });
    mutations.observe(root, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      mutations.disconnect();
    };
  }, [content, links, measure]);

  if (drawn.length === 0) return null;
  return (
    <svg
      data-org-links
      aria-hidden="true"
      className="absolute top-0 left-0 pointer-events-none overflow-visible text-violet-500 dark:text-violet-400"
      width={size.w}
      height={size.h}
    >
      <defs>
        <marker id={`${marker}-end`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
        </marker>
      </defs>
      {drawn.map((line) => {
        const strong = !!highlightNodeId && (line.sourceId === highlightNodeId || line.targetId === highlightNodeId);
        const faded = !!highlightNodeId && !strong;
        return (
          <path
            key={line.key}
            data-link-style={line.style}
            data-source={line.sourceId}
            data-target={line.targetId}
            d={line.d}
            fill="none"
            stroke="currentColor"
            strokeWidth={strong ? 3 : 2}
            strokeLinecap="round"
            strokeDasharray={DASH[line.style]}
            opacity={faded ? 0.35 : 0.9}
            markerEnd={`url(#${marker}-end)`}
          >
            <title>{line.name}</title>
          </path>
        );
      })}
    </svg>
  );
};
