// «انتقال»: moves a node (and everything under it) under another place - the organization (top) or any node that may hold
// its kind. It never offers the node itself or anything below it (that would make a loop). Siblings of the same kind can
// be ticked to move together (e.g. nine deputies under the CEO).
import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2 } from 'lucide-react';
import { PrimaryButton, SecondaryButton, inputClass } from '../../AdminUi';
import { userErrorMessage } from '../../../../utils/errorMessages';
import { toPersianDigits } from '../../../../utils/helpers';
import { KIND_INFO, type KindTreeNode, inListOrder, moveTargets, rankTargets } from './orgKinds';

const SHOWN = 80;

export const KindMoveDialog: React.FC<{
  node: KindTreeNode;
  /** Nodes with the same parent and kind: they can move with it. */
  siblings: KindTreeNode[];
  /** All the nodes of that parent in the order the list shows them: several moving together keep this order. */
  listOrder: KindTreeNode[];
  roots: KindTreeNode[];
  orgName: string;
  onMove: (nodes: KindTreeNode[], targetId: string | null, progress: (text: string) => void) => Promise<void>;
  onClose: () => void;
}> = ({ node, siblings, listOrder, roots, orgName, onMove, onClose }) => {
  const [query, setQuery] = useState('');
  const [target, setTarget] = useState<string | null | undefined>(undefined);
  /** The place chosen, shown on its own (with its whole path) while the list of suggestions is closed. */
  const [chosen, setChosen] = useState<{ id: string | null; name: string; path: string; kind: 'org' | 'unit' | 'position' } | null>(null);
  const [also, setAlso] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const targets = useMemo(() => moveTargets(roots, node, orgName), [roots, node, orgName]);
  const shown = useMemo(() => rankTargets(targets, query), [targets, query]);
  // Several moving together keep the order they have in the list.
  const moving = inListOrder(listOrder, new Set([node.id, ...also]));
  // A node that is among those moving cannot be the place they go to.
  const valid = (id: string | null) => id === null || !moving.some((m) => m.id === id);

  const send = async () => {
    if (target === undefined || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onMove(moving, target, setProgress);
      onClose();
    } catch (err) {
      setError(userErrorMessage(err, 'انتقال انجام نشد.'));
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label={`انتقال ${node.name}`} dir="rtl" className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 shadow-2xl max-h-[90vh] flex flex-col" onKeyDown={(e) => { if (e.key === 'Escape' && !busy) { e.stopPropagation(); onClose(); } }}>
        <div className="shrink-0 px-5 pt-5 pb-3 border-b border-slate-100 dark:border-slate-800">
          <h3 className="text-base font-extrabold text-slate-900 dark:text-white">انتقال «{node.name}»</h3>
          <p className="mt-1 text-xs text-slate-500">با همه‌ی زیرمجموعه‌هایش منتقل می‌شود. فقط جاهایی که اجازه دارد پیشنهاد می‌شود.</p>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {error && <p role="alert" className="rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-xs px-3 py-2">{error}</p>}
          {siblings.length > 0 && (
            <fieldset>
              <legend className="text-xs text-slate-600 dark:text-slate-300 mb-1">همراه این‌ها هم منتقل شود ({toPersianDigits(siblings.length)} هم‌سطح)</legend>
              <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                {siblings.map((s) => (
                  <label key={s.id} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs cursor-pointer ${also.has(s.id) ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200'}`}>
                    <input type="checkbox" className="accent-indigo-600" checked={also.has(s.id)} onChange={(e) => setAlso((prev) => { const next = new Set(prev); if (e.target.checked) next.add(s.id); else next.delete(s.id); return next; })} />
                    {s.name}
                  </label>
                ))}
              </div>
              <button type="button" className="mt-1 text-[11px] text-indigo-600 cursor-pointer" onClick={() => setAlso(new Set(also.size === siblings.length ? [] : siblings.map((s) => s.id)))}>{also.size === siblings.length ? 'برداشتن همه' : 'انتخاب همه'}</button>
            </fieldset>
          )}
          {chosen ? (
            <div className="rounded-xl border border-indigo-300 bg-indigo-50/60 dark:bg-indigo-950/30 px-3 py-2.5">
              <div className="text-[11px] text-slate-500 mb-1">مقصد</div>
              <div className="flex items-center gap-2">
                <span className="rounded-full px-2 py-0.5 text-[10.5px] shrink-0" style={{ color: KIND_INFO[chosen.kind].color, backgroundColor: KIND_INFO[chosen.kind].bg }}>{KIND_INFO[chosen.kind].label}</span>
                <b className="text-sm">{chosen.name}</b>
                <button type="button" className="ms-auto text-[11px] text-indigo-600 cursor-pointer" onClick={() => { setChosen(null); setTarget(undefined); }}>تغییر مقصد</button>
              </div>
              <div className="mt-1 text-[11px] text-slate-500 break-words" dir="rtl">{chosen.path}</div>
            </div>
          ) : (
            <>
              <div>
                <label htmlFor="kind-move-q" className="block text-xs text-slate-600 dark:text-slate-300 mb-1">انتقال به</label>
                <input id="kind-move-q" className={inputClass} placeholder="جستجوی نام مقصد..." value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
              </div>
              <div role="radiogroup" aria-label="مقصد" className="max-h-64 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
                {shown.slice(0, SHOWN).map((t) => {
                  const ok = valid(t.id);
                  return (
                    <button key={t.id ?? 'org'} type="button" role="radio" aria-checked={false} disabled={!ok} title={t.path} onClick={() => { setTarget(t.id); setChosen(t); setQuery(''); }} className="w-full flex items-start gap-2 px-3 py-2 text-right cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-800">
                      <span className="rounded-full px-2 py-0.5 text-[10.5px] shrink-0 mt-0.5" style={{ color: KIND_INFO[t.kind].color, backgroundColor: KIND_INFO[t.kind].bg }}>{KIND_INFO[t.kind].label}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-bold">{t.name}</span>
                        {t.path !== t.name && <span className="block text-[11px] text-slate-400 break-words">{t.path}</span>}
                      </span>
                    </button>
                  );
                })}
                {shown.length === 0 && <p className="px-3 py-3 text-xs text-slate-500">مقصدی پیدا نشد.</p>}
                {shown.length > SHOWN && <p className="px-3 py-2 text-[11px] text-slate-500">{toPersianDigits(shown.length - SHOWN)} مورد دیگر؛ جستجو را دقیق‌تر کنید.</p>}
              </div>
            </>
          )}
        </div>
        <div className="shrink-0 flex items-center gap-3 border-t border-slate-100 dark:border-slate-800 px-5 py-3 rounded-b-2xl">
          {busy && progress && <span className="text-xs text-slate-500" role="status">{progress}</span>}
          <span className="flex-1" />
          <SecondaryButton type="button" onClick={onClose} disabled={busy}>انصراف</SecondaryButton>
          <PrimaryButton type="button" onClick={() => void send()} disabled={busy || target === undefined}>{busy && <Loader2 className="w-4 h-4 animate-spin" />} انتقال{moving.length > 1 ? ` (${toPersianDigits(moving.length)} گره)` : ''}</PrimaryButton>
        </div>
      </div>
    </div>,
    document.body,
  );
};
