// «چارت درختی»: the same data drawn as a horizontal tree (display only), on a canvas that is moved with the mouse:
// drag the background to pan, Ctrl + wheel (or pinch) to zoom around the pointer, the wheel scrolls, arrow keys move.
// A unit's head sits under the unit and the unit's other nodes under the head - only drawn so; nothing changes in the data.
// Many same-level nodes are paged. The content is moved with a CSS transform, so nothing reflows while dragging.
import React, { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Crosshair, Expand, Maximize2, Minimize2, Minus, Plus } from 'lucide-react';
import { toPersianDigits } from '../../../../utils/helpers';
import { usePanZoom } from '../usePanZoom';
import { type PanZoomView, isInSight } from '../panMath';
import { KIND_INFO, type KindTreeNode, countBelow, leafColumns, matches, splitChildren } from './orgKinds';
import { HeadChip, PersonChips } from './kindsUi';
import type { KindViewProps } from './KindListView';

/** How many branches / leaves a node shows before «+N گره‌ی دیگر»; «نمایش همه» shows every one. */
const BRANCH_PAGE = 30;
const LEAF_PAGE = 24;
/** The chart is never fitted smaller than this (the cards would not be readable): it is centred on the organization instead. */
const MIN_FIT = 0.35;

/** Lets a deep card ask the canvas to move to a node (after «+N گره‌ی دیگر»). */
const FocusContext = createContext<(id: string) => void>(() => undefined);

const CSS = `
.kt-shell{position:relative}
.kt-shell:fullscreen{background:#fff;padding:12px}
.kt-shell:fullscreen .kt-vp{height:calc(100vh - 24px)}
.kt-vp{position:relative;overflow:hidden;height:max(420px,calc(100dvh - 250px));border:1px solid #e6e3f3;border-radius:16px;background:#faf9ff;cursor:grab;touch-action:none;outline:none}
.kt-vp:focus-visible{box-shadow:0 0 0 3px #6a4fe033}
.kt-vp[data-dragging=true]{cursor:grabbing;user-select:none}
.kt-vp[data-dragging=true] *{cursor:grabbing!important}
.kt-vp [data-nopan]{cursor:default}
.kt-vp button[data-nopan]{cursor:pointer}
.kt-content{position:absolute;top:0;left:0;transform-origin:0 0;will-change:transform}
.kt{direction:ltr;width:max-content;padding:10px 20px 40px}
.kt ul{display:flex;justify-content:center;padding-top:26px;position:relative;margin:0;padding-left:0;padding-right:0}
.kt li{list-style:none;text-align:center;position:relative;padding:26px 8px 0;display:flex;flex-direction:column;align-items:center}
.kt li::before,.kt li::after{content:'';position:absolute;top:0;right:50%;border-top:2px solid #d3cbf5;width:50%;height:26px}
.kt li::after{right:auto;left:50%;border-left:2px solid #d3cbf5}
.kt li:only-child::before,.kt li:only-child::after{display:none}.kt li:only-child{padding-top:26px}
.kt li:first-child::before,.kt li:last-child::after{border:0 none}
.kt li:last-child::before{border-right:2px solid #d3cbf5;border-radius:0 8px 0 0}.kt li:first-child::after{border-radius:8px 0 0 0}
.kt ul ul::before{content:'';position:absolute;top:0;left:50%;border-left:2px solid #d3cbf5;height:26px}
.kt>ul{padding-top:0}.kt>ul>li{padding-top:0}.kt>ul>li::before,.kt>ul>li::after{display:none}
`;

/** What the tree shows under a node: the head, then the node's other children under it (display only). */
function shownChildren(node: KindTreeNode): KindTreeNode[] {
  const head = node.headNodeId ? node.children.find((c) => c.id === node.headNodeId) : null;
  if (!head) return node.children;
  return [{ ...head, children: [...head.children, ...node.children.filter((c) => c !== head)] }];
}

const AddButton: React.FC<{ label: string; onClick: () => void }> = ({ label, onClick }) => (
  <button type="button" data-nopan onClick={onClick} aria-label={label} title="افزودن زیرمجموعه" className="absolute -bottom-3.5 left-[calc(50%-13px)] z-[2] w-[26px] h-[26px] grid place-items-center rounded-full border-[1.5px] border-indigo-300 bg-white dark:bg-slate-900 text-indigo-600 hover:bg-indigo-600 hover:text-white cursor-pointer"><Plus className="w-4 h-4" /></button>
);

type CardProps = { node: KindTreeNode; parent: KindTreeNode | null; real: KindTreeNode } & Omit<KindViewProps, 'roots'>;

const Card: React.FC<CardProps & { open: boolean; toggle: () => void }> = ({ node, parent, real, query, flashId, actions, open, toggle }) => {
  const info = KIND_INFO[node.kind];
  const isHead = !!parent && parent.headNodeId === node.id;
  const below = countBelow(real);
  return (
    <div id={`kind-t-${node.id}`} data-node data-nopan dir="rtl" className={`relative min-w-[150px] max-w-[230px] rounded-xl border bg-white dark:bg-slate-900 px-3 pt-2 pb-4 shadow-sm ${isHead ? 'border-amber-300 shadow-amber-200/60 ring-1 ring-amber-200' : 'border-indigo-100'} ${flashId === node.id ? 'ring-2 ring-indigo-500' : ''}`} style={{ borderTop: `4px solid ${info.color}` }}>
      <div className="text-[10.5px]" style={{ color: info.color }}>{isHead ? '★ رئیس · ' : ''}{info.label}</div>
      <div className="font-bold text-sm mt-0.5 mb-1.5">{node.name}</div>
      {node.kind === 'unit' && <div className="mb-1.5"><HeadChip unit={real} /></div>}
      {node.kind === 'position' && <div className="flex justify-center"><PersonChips node={real} actions={actions} max={3} query={query} /></div>}
      {node.children.length > 0 && (
        <button type="button" data-nopan onClick={toggle} aria-expanded={open} aria-label={open ? `بستن ${node.name}` : `باز کردن ${node.name}`} className="absolute top-1 left-1 min-w-5 h-5 rounded-md bg-slate-100 dark:bg-slate-800 text-[11px] cursor-pointer">{open ? '−' : toPersianDigits(below)}</button>
      )}
      {actions.can.create && <AddButton label={`افزودن زیرمجموعه به ${node.name}`} onClick={() => actions.onAdd(real)} />}
    </div>
  );
};

const MoreButtons: React.FC<{ hidden: number; step: number; onMore: () => void; onAll: () => void }> = ({ hidden, step, onMore, onAll }) => (
  <div className="flex flex-col gap-1.5" dir="rtl">
    <button type="button" data-nopan onClick={onMore} className="rounded-xl border border-dashed border-indigo-300 px-3 py-2 text-xs text-indigo-700 cursor-pointer">+{toPersianDigits(Math.min(hidden, step))} گره‌ی دیگر ({toPersianDigits(hidden)} مانده)</button>
    <button type="button" data-nopan onClick={onAll} className="rounded-xl border border-indigo-200 px-3 py-1.5 text-xs text-indigo-700 cursor-pointer">نمایش همه</button>
  </div>
);

const Branch: React.FC<CardProps> = (props) => {
  const { node, query, isOpen, onToggle } = props;
  const focusNode = useContext(FocusContext);
  const [branchLimit, setBranchLimit] = useState(BRANCH_PAGE);
  const [leafLimit, setLeafLimit] = useState(LEAF_PAGE);
  const open = query.trim() ? true : isOpen(node.id);
  const kids = shownChildren(node).filter((c) => matches(c, query));
  // The nodes with something under them (units) come first and are never hidden behind a leaf; the leaves follow.
  const { branches, leaves, grid } = splitChildren(kids);
  const realOf = (c: KindTreeNode) => node.children.find((x) => x.id === c.id) ?? c;
  const items: React.ReactNode[] = branches.slice(0, branchLimit).map((c) => <li key={c.id}><Branch {...props} node={c} parent={node} real={realOf(c)} /></li>);
  if (branches.length > branchLimit) {
    items.push(<li key="more-branches"><MoreButtons hidden={branches.length - branchLimit} step={BRANCH_PAGE} onMore={() => { const first = branches[branchLimit]; setBranchLimit(branchLimit + BRANCH_PAGE); setTimeout(() => focusNode(first.id), 60); }} onAll={() => { const first = branches[branchLimit]; setBranchLimit(Infinity); setTimeout(() => focusNode(first.id), 60); }} /></li>);
  }
  if (grid) {
    const cols = leafColumns(Math.min(leaves.length, leafLimit));
    items.push(
      <li key="leaves">
        <div className="grid gap-2" dir="rtl" style={{ gridTemplateColumns: `repeat(${cols}, minmax(150px, 1fr))` }}>
          {leaves.slice(0, leafLimit).map((c) => <Card key={c.id} {...props} node={c} parent={node} real={realOf(c)} open={false} toggle={() => undefined} />)}
        </div>
        {leaves.length > leafLimit && (
          <div className="mt-2"><MoreButtons hidden={leaves.length - leafLimit} step={LEAF_PAGE} onMore={() => { const first = leaves[leafLimit]; setLeafLimit(leafLimit + LEAF_PAGE); setTimeout(() => focusNode(first.id), 60); }} onAll={() => { const first = leaves[leafLimit]; setLeafLimit(Infinity); setTimeout(() => focusNode(first.id), 60); }} /></div>
        )}
      </li>,
    );
  } else {
    items.push(...leaves.map((c) => <li key={c.id}><Branch {...props} node={c} parent={node} real={realOf(c)} /></li>));
  }
  return (
    <>
      <Card {...props} open={open} toggle={() => onToggle(node.id)} />
      {open && items.length > 0 && <ul>{[...items].reverse()}</ul>}
    </>
  );
};

export const KindTreeView: React.FC<KindViewProps & { orgName: string; onAddRoot: () => void; viewStore: React.MutableRefObject<PanZoomView | null> }> = ({ roots, orgName, onAddRoot, viewStore, ...rest }) => {
  const info = KIND_INFO.org;
  const shell = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const rootCard = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  // The wheel zooms around the pointer (10% to 200%); dragging the background pans; cards and buttons do not start a pan.
  const pz = usePanZoom(viewport, content, ready, { wheel: 'zoom', noPan: '[data-nopan]', minScale: 0.1, maxScale: 2 });
  const tops = roots.filter((r) => matches(r, rest.query));

  useEffect(() => setReady(true), []);

  /** The whole chart if it is readable that way, else the organization at the top at the smallest readable zoom. */
  const fitOrCenter = (animate: boolean) => {
    if (pz.fitScale() >= MIN_FIT) pz.fit(animate, true);
    else if (rootCard.current) pz.centerOn(rootCard.current, MIN_FIT, animate);
  };

  // Opening, every time this chart is shown: where the user left it if some of the chart is still in sight with the organization
  // on the canvas, otherwise fitted. It waits until the canvas and the chart have a size (a hidden or just-mounted one has none).
  const opened = useRef(false);
  useLayoutEffect(() => {
    if (!ready || opened.current) return;
    let frames = 0;
    let frame = 0;
    const tryOpen = () => {
      const vp = viewport.current;
      const el = content.current;
      if (!vp || !el) return;
      if ((!vp.clientWidth || !vp.clientHeight || !el.offsetWidth) && frames++ < 60) { frame = requestAnimationFrame(tryOpen); return; }
      opened.current = true;
      const stored = viewStore.current;
      if (stored && isInSight(stored, { w: el.offsetWidth, h: el.offsetHeight }, { w: vp.clientWidth, h: vp.clientHeight })) {
        pz.setView(stored);
        // The organization (or at least a card) must be in sight, else the canvas looks empty: fit instead.
        requestAnimationFrame(() => {
          const box = vp.getBoundingClientRect();
          const anyCard = Array.from(el.querySelectorAll<HTMLElement>('[data-node]')).some((c: HTMLElement) => { const r = c.getBoundingClientRect(); return r.right > box.left && r.left < box.right && r.bottom > box.top && r.top < box.bottom; });
          if (!anyCard) fitOrCenter(false);
        });
        return;
      }
      fitOrCenter(false);
    };
    frame = requestAnimationFrame(tryOpen);
    return () => cancelAnimationFrame(frame);
  });
  // Keep the view for when the list is shown and then the tree again.
  useEffect(() => () => { viewStore.current = pz.getView(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard focus on a card or button out of sight moves the chart to it (the canvas itself never scrolls).
  useEffect(() => {
    const vp = viewport.current;
    if (!vp) return;
    const onFocusIn = (e: FocusEvent) => {
      vp.scrollLeft = 0;
      vp.scrollTop = 0;
      const el = e.target as HTMLElement;
      // A card, or a button outside the cards (the «+N گره‌ی دیگر» ones): bring it into sight at the zoom the user has.
      const target = el.closest<HTMLElement>('[data-node]') ?? el.closest<HTMLElement>('button');
      if (target && el !== vp && content.current?.contains(target)) pz.focus(target, { onlyIfNeeded: true, minScale: pz.getView().s });
    };
    vp.addEventListener('focusin', onFocusIn);
    const onScroll = () => { vp.scrollLeft = 0; vp.scrollTop = 0; };
    vp.addEventListener('scroll', onScroll);
    return () => { vp.removeEventListener('focusin', onFocusIn); vp.removeEventListener('scroll', onScroll); };
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // Full screen: the canvas grows to the screen and the chart is fitted again.
  useEffect(() => {
    const onChange = () => { setFullscreen(document.fullscreenElement === shell.current); setTimeout(() => fitOrCenter(false), 120); };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const toggleFullscreen = () => { if (document.fullscreenElement) void document.exitFullscreen(); else void shell.current?.requestFullscreen?.(); };

  const focusNode = (id: string) => requestAnimationFrame(() => {
    const el = document.getElementById(`kind-t-${id}`);
    if (el) pz.focus(el, { minScale: Math.max(0.6, pz.getView().s) });
  });

  const control = 'w-8 h-8 grid place-items-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 hover:bg-indigo-50 cursor-pointer';
  return (
    <div className="kt-shell" ref={shell}>
      <div className="kt-vp" ref={viewport} tabIndex={0} role="tree" aria-label="چارت درختی؛ چرخ موس بزرگ‌نمایی، کشیدن برای جابه‌جایی، کلیدهای جهت‌نما برای حرکت و + و - برای بزرگ‌نمایی">
        <style>{CSS}</style>
        <div className="absolute top-3 left-3 z-10 flex gap-1.5" data-nopan>
          <button type="button" data-nopan className={control} aria-label="بزرگ‌نمایی" title="بزرگ‌نمایی" onClick={() => pz.zoomBy(1.3)}><Plus className="w-4 h-4" /></button>
          <button type="button" data-nopan className={control} aria-label="کوچک‌نمایی" title="کوچک‌نمایی" onClick={() => pz.zoomBy(1 / 1.3)}><Minus className="w-4 h-4" /></button>
          <button type="button" data-nopan className={control} aria-label="متناسب با صفحه" title="متناسب با صفحه" onClick={() => fitOrCenter(true)}><Maximize2 className="w-4 h-4" /></button>
          <button type="button" data-nopan className={control} aria-label="مرکز روی سازمان" title="مرکز روی سازمان" onClick={() => rootCard.current && pz.centerOn(rootCard.current, Math.max(MIN_FIT, Math.min(1, pz.getView().s)))}><Crosshair className="w-4 h-4" /></button>
          <button type="button" data-nopan className={control} aria-label={fullscreen ? 'خروج از تمام‌صفحه' : 'تمام‌صفحه'} title={fullscreen ? 'خروج از تمام‌صفحه' : 'تمام‌صفحه'} onClick={toggleFullscreen}>{fullscreen ? <Minimize2 className="w-4 h-4" /> : <Expand className="w-4 h-4" />}</button>
        </div>
        <FocusContext.Provider value={focusNode}>
          <div className="kt-content" ref={content}>
            <div className="kt">
              <ul>
                <li>
                  <div ref={rootCard} data-node data-nopan dir="rtl" className="relative min-w-[150px] max-w-[230px] rounded-xl border border-indigo-100 bg-white dark:bg-slate-900 px-3 pt-2 pb-4 shadow-sm" style={{ borderTop: `4px solid ${info.color}` }}>
                    <div className="text-[10.5px]" style={{ color: info.color }}>{info.label}</div>
                    <div className="font-bold text-sm mt-0.5 mb-1.5">{orgName}</div>
                    {rest.actions.can.create && <AddButton label={`افزودن زیرمجموعه به ${orgName}`} onClick={onAddRoot} />}
                  </div>
                  {tops.length > 0 && (
                    <ul>
                      {[...tops].reverse().map((r) => <li key={r.id}><Branch node={r} parent={null} real={r} {...rest} /></li>)}
                    </ul>
                  )}
                </li>
              </ul>
            </div>
          </div>
        </FocusContext.Provider>
      </div>
    </div>
  );
};
