// «چارت درختی»: the same data drawn as a horizontal tree (display only). A unit's head sits under the unit and the
// unit's other nodes under the head - only drawn so; nothing in the data changes. Many same-level nodes are paged.
import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { toPersianDigits } from '../../../../utils/helpers';
import { KIND_INFO, type KindTreeNode, countBelow, matches } from './orgKinds';
import { HeadChip, PersonChips } from './kindsUi';
import type { KindViewProps } from './KindListView';

const PAGE = 12;

const CSS = `
.kt{direction:ltr;width:max-content;margin:0 auto;padding:10px 20px 40px}
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

const Card: React.FC<{ node: KindTreeNode; parent: KindTreeNode | null; real: KindTreeNode } & Omit<KindViewProps, 'roots'> & { open: boolean; toggle: () => void }> = ({ node, parent, real, query, flashId, actions, open, toggle }) => {
  const info = KIND_INFO[node.kind];
  const isHead = !!parent && parent.headNodeId === node.id;
  const below = countBelow(real);
  return (
    <div id={`kind-t-${node.id}`} dir="rtl" className={`relative min-w-[150px] max-w-[230px] rounded-xl border bg-white dark:bg-slate-900 px-3 pt-2 pb-4 shadow-sm ${isHead ? 'border-amber-300 shadow-amber-200/60' : 'border-indigo-100'} ${flashId === node.id ? 'ring-2 ring-indigo-500' : ''}`} style={{ borderTop: `4px solid ${info.color}` }}>
      <div className="text-[10.5px]" style={{ color: info.color }}>{isHead ? '★ رئیس · ' : ''}{info.label}</div>
      <div className="font-bold text-sm mt-0.5 mb-1.5">{node.name}</div>
      {node.kind === 'unit' && <div className="mb-1.5"><HeadChip unit={real} /></div>}
      {node.kind === 'position' && <div className="flex justify-center"><PersonChips node={real} actions={actions} max={3} query={query} /></div>}
      {node.children.length > 0 && (
        <button type="button" onClick={toggle} aria-expanded={open} aria-label={open ? `بستن ${node.name}` : `باز کردن ${node.name}`} className="absolute top-1 left-1 min-w-5 h-5 rounded-md bg-slate-100 dark:bg-slate-800 text-[11px] cursor-pointer">{open ? '−' : toPersianDigits(below)}</button>
      )}
      {actions.can.create && (
        <button type="button" onClick={() => actions.onAdd(real)} aria-label={`افزودن زیرمجموعه به ${node.name}`} title="افزودن زیرمجموعه" className="absolute -bottom-3.5 left-[calc(50%-13px)] z-[2] w-[26px] h-[26px] grid place-items-center rounded-full border-[1.5px] border-indigo-300 bg-white dark:bg-slate-900 text-indigo-600 hover:bg-indigo-600 hover:text-white cursor-pointer"><Plus className="w-4 h-4" /></button>
      )}
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
              <button type="button" dir="rtl" onClick={() => setShown(shown + PAGE)} className="rounded-xl border border-dashed border-indigo-300 px-3 py-2 text-xs text-indigo-700 cursor-pointer">+{toPersianDigits(kids.length - shown)} گره‌ی دیگر</button>
            </li>
          )}
        </ul>
      )}
    </>
  );
};

export const KindTreeView: React.FC<KindViewProps & { zoom: number; orgName: string; onAddRoot: () => void }> = ({ roots, zoom, orgName, onAddRoot, ...rest }) => {
  const info = KIND_INFO.org;
  const tops = roots.filter((r) => matches(r, rest.query));
  return (
    <div role="tree" aria-label="چارت درختی" className="overflow-auto">
      <style>{CSS}</style>
      <div className="kt" style={{ zoom }}>
        <ul>
          <li>
            <div dir="rtl" className="relative min-w-[150px] max-w-[230px] rounded-xl border border-indigo-100 bg-white dark:bg-slate-900 px-3 pt-2 pb-4 shadow-sm" style={{ borderTop: `4px solid ${info.color}` }}>
              <div className="text-[10.5px]" style={{ color: info.color }}>{info.label}</div>
              <div className="font-bold text-sm mt-0.5 mb-1.5">{orgName}</div>
              {rest.actions.can.create && (
                <button type="button" onClick={onAddRoot} aria-label={`افزودن زیرمجموعه به ${orgName}`} title="افزودن زیرمجموعه" className="absolute -bottom-3.5 left-[calc(50%-13px)] z-[2] w-[26px] h-[26px] grid place-items-center rounded-full border-[1.5px] border-indigo-300 bg-white dark:bg-slate-900 text-indigo-600 hover:bg-indigo-600 hover:text-white cursor-pointer"><Plus className="w-4 h-4" /></button>
              )}
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
  );
};
