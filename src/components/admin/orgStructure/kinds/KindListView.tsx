// «چارت مرتب»: the nested list the chart is built in. A «+» is always visible beside every node.
import React from 'react';
import { ArrowDown, ArrowUp, ChevronDown, ChevronLeft, GripVertical, MoveRight, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { toPersianDigits } from '../../../../utils/helpers';
import { KIND_INFO, type KindTreeNode, canHaveHead, countBelow, matches, self, serverOrder } from './orgKinds';
import { HeadChip, PersonChips, type KindActions } from './kindsUi';

export interface KindViewProps {
  roots: KindTreeNode[];
  query: string;
  isOpen: (id: string) => boolean;
  onToggle: (id: string) => void;
  flashId: string | null;
  pendingDelete: string | null;
  actions: KindActions;
}

/** The node being dragged to a new place among its siblings (one drag at a time, so a module variable is enough). */
let dragged: { node: KindTreeNode; parentId: string | null } | null = null;

const Row: React.FC<{ node: KindTreeNode; parent: KindTreeNode | null; siblings: KindTreeNode[] } & Omit<KindViewProps, 'roots'>> = ({ node, parent, siblings, query, isOpen, onToggle, flashId, pendingDelete, actions }) => {
  const [over, setOver] = React.useState(false);
  const order = serverOrder(siblings);
  const index = order.findIndex((n) => n.id === node.id);
  const canArrange = actions.can.move && !query.trim() && order.length > 1;
  const info = KIND_INFO[node.kind];
  const open = query.trim() ? true : isOpen(node.id);
  const below = countBelow(node);
  const isHead = !!parent && parent.headNodeId === node.id;
  const canMakeHead = !!parent && canHaveHead(parent.kind) && node.kind === 'position';
  const confirming = pendingDelete === node.id;
  return (
    <div id={`kind-${node.id}`} className={flashId === node.id ? 'animate-pulse' : ''}>
      <div
        className={`group relative flex flex-wrap items-center gap-2 rounded-xl border hover:border-indigo-100 hover:bg-indigo-50/40 dark:hover:bg-slate-800/50 ps-3 pe-2 py-1.5 my-0.5 ${over ? 'border-indigo-400 bg-indigo-50' : 'border-transparent'}`}
        style={{ boxShadow: `inset -4px 0 0 ${info.color}` }}
        draggable={canArrange}
        onDragStart={(e) => { dragged = { node, parentId: parent?.id ?? null }; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', node.id); }}
        onDragEnd={() => { dragged = null; setOver(false); }}
        onDragOver={(e) => { if (dragged && dragged.node.id !== node.id && dragged.parentId === (parent?.id ?? null)) { e.preventDefault(); setOver(true); } }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { setOver(false); if (dragged && dragged.node.id !== node.id && dragged.parentId === (parent?.id ?? null)) { e.preventDefault(); actions.onReorder(dragged.node, index); dragged = null; } }}
      >
        {canArrange && <span className="text-slate-300 cursor-grab" aria-hidden="true" title="بکشید و رها کنید تا ترتیب عوض شود"><GripVertical className="w-4 h-4" /></span>}
        <button type="button" aria-label={open ? `بستن ${node.name}` : `باز کردن ${node.name}`} aria-expanded={open} onClick={() => onToggle(node.id)} className={`w-6 h-6 grid place-items-center rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500 cursor-pointer ${node.children.length ? '' : 'invisible'}`}>
          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
        <span className="rounded-full px-2.5 py-0.5 text-[11px] whitespace-nowrap" style={{ color: info.color, backgroundColor: info.bg }}>{info.label}</span>
        {isHead && <span className="rounded-full px-2.5 py-0.5 text-[11px] bg-amber-100 text-amber-800 whitespace-nowrap">★ رئیس</span>}
        <b className={`text-sm ${self(node, query) ? 'bg-amber-200/70 rounded px-0.5' : ''}`}>{node.name}</b>
        {node.kind === 'unit' && <HeadChip unit={node} />}
        {node.kind === 'position' && <PersonChips node={node} actions={actions} query={query} />}
        {below > 0 && <span className="text-[11px] text-slate-400">{toPersianDigits(below)} زیرمجموعه</span>}
        <span className="flex-1" />
        <span className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          {canArrange && (
            <>
              <button type="button" disabled={index <= 0} onClick={() => actions.onReorder(node, index - 1)} aria-label={`بالاتر بردن ${node.name}`} title="بالاتر" className="inline-flex items-center rounded-md px-1.5 py-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30 cursor-pointer"><ArrowUp className="w-3.5 h-3.5" /></button>
              <button type="button" disabled={index >= order.length - 1} onClick={() => actions.onReorder(node, index + 1)} aria-label={`پایین‌تر بردن ${node.name}`} title="پایین‌تر" className="inline-flex items-center rounded-md px-1.5 py-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30 cursor-pointer"><ArrowDown className="w-3.5 h-3.5" /></button>
            </>
          )}
          {canMakeHead && actions.can.assign && (
            <button type="button" onClick={() => actions.onToggleHead(node, parent!)} className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs cursor-pointer ${isHead ? 'bg-amber-100 text-amber-800' : 'text-slate-500 hover:bg-slate-100'}`} aria-pressed={isHead}>
              <Star className="w-3.5 h-3.5" /> {isHead ? 'رئیس است' : 'رئیس'}
            </button>
          )}
          {actions.can.update && <button type="button" onClick={() => actions.onEdit(node)} aria-label={`ویرایش ${node.name}`} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 cursor-pointer"><Pencil className="w-3.5 h-3.5" /> ویرایش</button>}
          {actions.can.move && <button type="button" onClick={() => actions.onMove(node)} aria-label={`انتقال ${node.name}`} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 cursor-pointer"><MoveRight className="w-3.5 h-3.5" /> انتقال</button>}
          {actions.can.remove && (
            <button type="button" onClick={() => actions.onDelete(node)} aria-label={confirming ? `تأیید حذف ${node.name}` : `حذف ${node.name}`} className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs cursor-pointer ${confirming ? 'bg-rose-100 text-rose-700 font-bold' : 'text-slate-500 hover:bg-slate-100'}`}>
              <Trash2 className="w-3.5 h-3.5" /> {confirming ? (below > 0 ? `مطمئنی؟ با ${toPersianDigits(below)} زیرمجموعه حذف` : 'مطمئنی؟ حذف') : ''}
            </button>
          )}
        </span>
        {actions.can.create && (
          <button type="button" onClick={() => actions.onAdd(node)} title={`افزودن زیر ${node.name}`} aria-label={`افزودن زیرمجموعه به ${node.name}`} className="w-7 h-7 grid place-items-center rounded-full border-[1.5px] border-indigo-300 text-indigo-600 bg-white dark:bg-slate-900 hover:bg-indigo-600 hover:text-white cursor-pointer shrink-0"><Plus className="w-4 h-4" /></button>
        )}
      </div>
      {open && node.children.length > 0 && (
        <div className="me-4 ps-0 pe-4 border-e-2 border-indigo-100 dark:border-slate-700">
          {node.children.filter((c) => matches(c, query)).map((c) => (
            <Row key={c.id} node={c} parent={node} siblings={node.children} query={query} isOpen={isOpen} onToggle={onToggle} flashId={flashId} pendingDelete={pendingDelete} actions={actions} />
          ))}
        </div>
      )}
    </div>
  );
};

export const KindListView: React.FC<KindViewProps> = ({ roots, ...rest }) => (
  <div role="tree" aria-label="چارت مرتب">
    {roots.filter((r) => matches(r, rest.query)).map((r) => <Row key={r.id} node={r} parent={null} siblings={roots} {...rest} />)}
  </div>
);
