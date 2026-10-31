// A node's manager post and its pattern posts, in the details panel: which post is the node's
// manager's (the others go under it), and «ساخت پست‌های پیش‌فرض» - the posts its type says it gets.
import React, { useState } from 'react';
import { Crown, Loader2, Play } from 'lucide-react';
import { Notice, SecondaryButton, inputClass } from '../../AdminUi';
import { userErrorMessage } from '../../../../utils/errorMessages';
import { toPersianDigits } from '../../../../utils/helpers';
import { type ChartUnit, applyPostTemplates, listUnitPositions, setManagerPost } from '../../../../services/orgStructureApi';
import { postLabel } from '../../../../services/orgStructureApi';
import { useLoad } from '../orgShared';

export const NodePostTools: React.FC<{ unit: ChartUnit; hasPattern: boolean; onChanged: () => Promise<void> | void }> = ({ unit, hasPattern, onChanged }) => {
  const posts = useLoad(() => listUnitPositions(unit.unitId), 'دریافت پست‌ها ممکن نشد.');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const list = posts.data || [];
  const manager = list.find((p) => p.isManagerPost);

  const act = async (action: () => Promise<string | null>, failure: string) => {
    setBusy(true);
    setMessage(null);
    try {
      const text = await action();
      await posts.reload();
      await onChanged();
      if (text) setMessage({ type: 'success', text });
    } catch (err) {
      setMessage({ type: 'error', text: userErrorMessage(err, failure) });
    } finally {
      setBusy(false);
    }
  };

  const choose = (id: string) => act(async () => {
    // At most one: the old mark goes first.
    if (manager && manager.id !== id) await setManagerPost(manager.id, false);
    if (id) await setManagerPost(id, true);
    return id ? 'پست مدیر گره تعیین شد.' : 'پست مدیر گره برداشته شد.';
  }, 'تعیین پست مدیر انجام نشد.');

  if (list.length === 0 && !hasPattern) return null;
  return (
    <div className="space-y-2 rounded-xl border border-slate-100 dark:border-slate-800 p-3">
      <p className="flex items-center gap-1.5 text-xs font-bold text-slate-500"><Crown className="w-3.5 h-3.5 text-amber-600" /> پست مدیر گره</p>
      {list.length > 0 && (
        <select className={inputClass} value={manager?.id || ''} disabled={busy} onChange={(e) => choose(e.target.value)} aria-label="پست مدیر گره">
          <option value="">بدون پست مدیر</option>
          {list.map((p) => <option key={p.id} value={p.id}>{postLabel(p)}</option>)}
        </select>
      )}
      <p className="text-[11px] leading-5 text-slate-500">دارنده‌ی این پست، مدیر گره است (مگر مدیر مستقیم تعیین شده باشد). پست‌های تازه‌ی گره زیر آن می‌روند.</p>
      {hasPattern && (
        <SecondaryButton type="button" className="w-full" disabled={busy} onClick={() => act(async () => {
          const result = await applyPostTemplates({ nodeId: unit.unitId });
          return `${toPersianDigits(result.created.length)} پست ساخته شد${result.skipped.length ? `؛ ${toPersianDigits(result.skipped.length)} ساخته نشد: ${result.skipped.map((s) => `${s.positionTitle || ''} (${s.reason})`).join('، ')}` : ''}.`;
        }, 'ساخت پست‌های پیش‌فرض انجام نشد.')}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} ساخت پست‌های پیش‌فرض این جزء
        </SecondaryButton>
      )}
      {message && <Notice type={message.type} onClose={() => setMessage(null)}>{message.text}</Notice>}
    </div>
  );
};
