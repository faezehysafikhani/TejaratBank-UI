// «چارت درختی»: the same data drawn as a horizontal tree (display only), on a canvas that is moved with the mouse:
// drag the background to pan, Ctrl + wheel (or pinch) to zoom around the pointer, the wheel scrolls, arrow keys move.
// A unit's head sits under the unit and the unit's other nodes under the head - only drawn so; nothing changes in the data.
// Many same-level nodes are paged. The content is moved with a CSS transform, so nothing reflows while dragging.
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Crosshair, Maximize2, Minus, Plus } from 'lucide-react';
import { toPersianDigits } from '../../../../utils/helpers';
import { usePanZoom, type PanZoomView } from '../usePanZoom';
import { KIND_INFO, type KindTreeNode, countBelow, matches } from './orgKinds';
import { HeadChip, PersonChips } from './kindsUi';
import type { KindViewProps } from './KindListView';

const PAGE = 12;

const CSS = `
.kt-vp{position:relative;overflow:hidden;height:clamp(420px,calc(100vh - 300px),900px);border:1px solid #e6e3f3;border-radius:16px;background:#faf9ff;cursor:grab;touch-action:none;outline:none}
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

const Card: React.FC<{ node: KindTreeNode; parent: KindTreeNode | null; real: KindTreeNode } & Omit<KindViewProps, 'roots'> & { open: boolean; toggle: () => void }> = ({ node, parent, real, query, flashId, actions, open, toggle }) => {
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

const Branch: React.FC<{ node: KindTreeNode; parent: KindTreeNode | null; real: KindTreeNode } & Omit<KindViewProps, 'roots'>> = (props) => {
  const { node, query, isOpen, onToggle } = props;
  const [shown, setShown] = useState(PAGE);
  const open = query.trim() ? true : isOpen(node.id);
  const kids = shownChildren(node).filter((c) => matches(c, query));
  return (
    <>
      <Card {...props} open={open} toggle={() => onToggle(node.id)} />
      {open && kids.length > 0 && (
        <ul>
          {kids.slice(0, shown).reverse().map((c) => {
            const real = node.children.find((x) => x.id === c.id) ?? c;
            return <li key={c.id}><Branch {...props} node={c} parent={node} real={real} /></li>;
          })}
          {kids.length > shown && (
            <li>
              <button type="button" data-nopan dir="rtl" onClick={() => setShown(shown + PAGE)} className="rounded-xl border border-dashed border-indigo-300 px-3 py-2 text-xs text-indigo-700 cursor-pointer">+{toPersianDigits(kids.length - shown)} گره‌ی دیگر</button>
            </li>
          )}
        </ul>
      )}
    </>
  );
};

export const KindTreeView: React.FC<KindViewProps & { orgName: string; onAddRoot: () => void; viewStore: React.MutableRefObject<PanZoomView | null> }> = ({ roots, orgName, onAddRoot, viewStore, ...rest }) => {
  const info = KIND_INFO.org;
  const viewport = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const rootCard = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const pz = usePanZoom(viewport, content, ready, { wheel: 'scroll', noPan: '[data-nopan]' });
  const tops = roots.filter((r) => matches(r, rest.query));

  useEffect(() => setReady(true), []);

  /** Opening: where the user left the chart, or else the whole chart if it fits readably, or else the organization at the top. */
  const openView = () => {
    if (viewStore.current) { pz.setView(viewStore.current); return; }
    const vp = viewport.current;
    const el = content.current;
    if (!vp || !el) return;
    const fitScale = Math.min(1, (vp.clientWidth - 48) / el.offsetWidth, (vp.clientHeight - 72) / el.offsetHeight);
    if (fitScale >= 0.45) { pz.fit(); pz.setView(pz.getView()); }
    else if (rootCard.current) pz.focus(rootCard.current, { minScale: 0.8 });
  };
  const openedFor = useRef(false);
  useLayoutEffect(() => {
    if (!ready || openedFor.current || !content.current?.offsetWidth) return;
    openedFor.current = true;
    const frame = requestAnimationFrame(openView);
    return () => cancelAnimationFrame(frame);
  });
  // Keep the view for when the list is shown and then the tree again.
  useEffect(() => () => { viewStore.current = pz.getView(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const control = 'w-8 h-8 grid place-items-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 hover:bg-indigo-50 cursor-pointer';
  return (
    <div className="kt-vp" ref={viewport} tabIndex={0} role="tree" aria-label="چارت درختی؛ با کشیدن جابه‌جا کنید، Ctrl و چرخ برای بزرگ‌نمایی، کلیدهای جهت‌نما برای حرکت">
      <style>{CSS}</style>
      <div className="absolute top-3 left-3 z-10 flex gap-1.5" data-nopan>
        <button type="button" data-nopan className={control} aria-label="بزرگ‌نمایی" title="بزرگ‌نمایی" onClick={() => pz.zoomBy(1.3)}><Plus className="w-4 h-4" /></button>
        <button type="button" data-nopan className={control} aria-label="کوچک‌نمایی" title="کوچک‌نمایی" onClick={() => pz.zoomBy(1 / 1.3)}><Minus className="w-4 h-4" /></button>
        <button type="button" data-nopan className={control} aria-label="متناسب با صفحه" title="متناسب با صفحه" onClick={() => pz.fit(true)}><Maximize2 className="w-4 h-4" /></button>
        <button type="button" data-nopan className={control} aria-label="مرکز روی سازمان" title="مرکز روی سازمان" onClick={() => rootCard.current && pz.focus(rootCard.current, { minScale: 0.8 })}><Crosshair className="w-4 h-4" /></button>
      </div>
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
    </div>
  );
};
