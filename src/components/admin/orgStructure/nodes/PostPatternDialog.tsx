// «پست‌های پیش‌فرض» of a node type: the posts every node of the type gets (e.g. a «معاون» as its
// manager post). Saving the pattern changes no node; «اجرا روی همه‌ی این جزء» makes the posts the
// nodes lack - running it again makes nothing - and says which it could not make.
import React, { useState } from 'react';
import { ArrowDown, ArrowUp, Crown, Loader2, Play, Plus, Trash2 } from 'lucide-react';
import { AdminDialog, Notice, PrimaryButton, SecondaryButton, inputClass } from '../../AdminUi';
import { userErrorMessage } from '../../../../utils/errorMessages';
import { toPersianDigits } from '../../../../utils/helpers';
import { appConfirm } from '../../../../utils/appDialog';
import { type ApplyPostTemplatesResult, type NodeType, type Position, applyPostTemplates, getNodeTypePosts, listPositions, setNodeTypePosts } from '../../../../services/orgStructureApi';
import { useLoad } from '../orgShared';

interface Row { positionId: string; title: string; isManagerPost: boolean }

export const PostPatternDialog: React.FC<{
  type: NodeType;
  canSave: boolean;
  canApply: boolean;
  onClose: () => void;
}> = ({ type, canSave, canApply, onClose }) => {
  const data = useLoad(async () => {
    const [saved, positions] = await Promise.all([getNodeTypePosts(type.id), listPositions()]);
    return { saved, positions };
  }, 'دریافت پست‌های پیش‌فرض ممکن نشد.');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [add, setAdd] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [applied, setApplied] = useState<ApplyPostTemplatesResult | null>(null);

  const current: Row[] = rows ?? (data.data?.saved || []).map((p) => ({ positionId: p.positionId, title: p.title, isManagerPost: p.isManagerPost }));
  const positions: Position[] = (data.data?.positions || []).filter((p) => p.isActive);
  const dirty = rows !== null;
  const edit = (next: Row[]) => { setRows(next); setApplied(null); };

  const save = async (): Promise<boolean> => {
    setBusy(true);
    setMessage(null);
    try {
      await setNodeTypePosts(type.id, current.map((r) => ({ positionId: r.positionId, isManagerPost: r.isManagerPost })));
      setRows(null);
      await data.reload();
      setMessage({ type: 'success', text: 'پست‌های پیش‌فرض ذخیره شد؛ گره‌ی موجودی تغییر نکرد.' });
      return true;
    } catch (err) {
      setMessage({ type: 'error', text: userErrorMessage(err, 'ذخیره‌ی پست‌های پیش‌فرض انجام نشد.') });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    if (dirty && !(await save())) return;
    if (!(await appConfirm(`پست‌های پیش‌فرض روی همه‌ی ${toPersianDigits(type.nodeCount)} گره‌ی «${type.name}» ساخته شود؟ پستی که گره دارد دوباره ساخته نمی‌شود.`, { confirmLabel: 'اجرا' }))) return;
    setBusy(true);
    setMessage(null);
    try {
      setApplied(await applyPostTemplates({ nodeTypeId: type.id }));
    } catch (err) {
      setMessage({ type: 'error', text: userErrorMessage(err, 'اجرای پست‌های پیش‌فرض انجام نشد.') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminDialog
      title={`پست‌های پیش‌فرض «${type.name}»`}
      onClose={() => !busy && onClose()}
      footer={<>
        <SecondaryButton type="button" onClick={onClose} disabled={busy}>بستن</SecondaryButton>
        {canApply && <SecondaryButton type="button" onClick={apply} disabled={busy || type.nodeCount === 0}><Play className="w-4 h-4" /> اجرا روی همه‌ی این جزء</SecondaryButton>}
        {canSave && <PrimaryButton type="button" onClick={save} disabled={busy || !dirty}>{busy && <Loader2 className="w-4 h-4 animate-spin" />} ذخیره</PrimaryButton>}
      </>}
    >
      {message && <Notice type={message.type} onClose={() => setMessage(null)}>{message.text}</Notice>}
      {data.error && <Notice type="error">{data.error}</Notice>}
      <p className="text-xs leading-6 text-slate-600 dark:text-slate-300">هر گره‌ی تازه از این جزء، این پست‌ها را می‌گیرد. «پست مدیر» (حداکثر یکی) پستی است که مدیر گره را می‌سازد و پست‌های دیگر زیر آن می‌روند.</p>
      {current.length === 0 ? <p className="text-sm text-slate-400">هنوز پستی تعریف نشده است.</p> : (
        <ul className="space-y-1" data-testid="pattern-posts">
          {current.map((row, i) => (
            <li key={`${row.positionId}-${i}`} className="flex items-center gap-1 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-1.5">
              <span className="flex-1 text-sm font-bold text-slate-800 dark:text-slate-100">{row.title}</span>
              {canSave && (
                <>
                  <button type="button" aria-pressed={row.isManagerPost} title="پست مدیر گره" aria-label={`پست مدیر: ${row.title}`} onClick={() => edit(current.map((r, j) => ({ ...r, isManagerPost: j === i ? !r.isManagerPost : false })))} className={`p-1.5 rounded-lg cursor-pointer ${row.isManagerPost ? 'text-amber-600 bg-amber-50 dark:bg-amber-950/40' : 'text-slate-400 hover:text-amber-600'}`}><Crown className="w-4 h-4" /></button>
                  <button type="button" disabled={i === 0} onClick={() => { const n = [...current]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; edit(n); }} aria-label={`بالاتر: ${row.title}`} className="p-1 text-slate-400 hover:text-indigo-600 disabled:opacity-30 cursor-pointer"><ArrowUp className="w-3.5 h-3.5" /></button>
                  <button type="button" disabled={i === current.length - 1} onClick={() => { const n = [...current]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; edit(n); }} aria-label={`پایین‌تر: ${row.title}`} className="p-1 text-slate-400 hover:text-indigo-600 disabled:opacity-30 cursor-pointer"><ArrowDown className="w-3.5 h-3.5" /></button>
                  <button type="button" onClick={() => edit(current.filter((_, j) => j !== i))} aria-label={`حذف: ${row.title}`} className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {canSave && (
        <div className="flex gap-2">
          <select className={inputClass} value={add} onChange={(e) => setAdd(e.target.value)} aria-label="سمت">
            <option value="">افزودن سمت…</option>
            {positions.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
          <SecondaryButton type="button" disabled={!add} onClick={() => { const p = positions.find((x) => x.id === add); if (p) { edit([...current, { positionId: p.id, title: p.title, isManagerPost: false }]); setAdd(''); } }}><Plus className="w-4 h-4" /> افزودن</SecondaryButton>
        </div>
      )}
      {applied && (
        <Notice type={applied.skipped.length ? 'info' : 'success'}>
          {toPersianDigits(applied.created.length)} پست ساخته شد{applied.skipped.length > 0 ? `؛ ${toPersianDigits(applied.skipped.length)} پست ساخته نشد: ${applied.skipped.slice(0, 5).map((s) => `${s.nodeName}${s.positionTitle ? ` (${s.positionTitle})` : ''}: ${s.reason}`).join('؛ ')}${applied.skipped.length > 5 ? '…' : ''}` : ''}.
        </Notice>
      )}
    </AdminDialog>
  );
};
