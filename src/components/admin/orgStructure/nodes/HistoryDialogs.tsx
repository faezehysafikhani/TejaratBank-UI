// A node's history (phase 7.2): the merge form with its impact preview and the change log with «بازگردانی».
import React, { useState } from 'react';
import { Loader2, RotateCcw } from 'lucide-react';
import { AdminDialog, Notice, PrimaryButton, SecondaryButton } from '../../AdminUi';
import { userErrorMessage } from '../../../../utils/errorMessages';
import { formatToJalali, toPersianDigits } from '../../../../utils/helpers';
import { gregorianToJalali } from '../../../../utils/jalali';

/** A Gregorian day (yyyy-MM-dd) as a Jalali date. */
export const jalaliDay = (iso: string): string => {
  const [gy, gm, gd] = iso.split('-').map(Number);
  if (!gy || !gm || !gd) return iso;
  const { jy, jm, jd } = gregorianToJalali(gy, gm, gd);
  return toPersianDigits(`${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`);
};
import { appConfirm } from '../../../../utils/appDialog';
import { type ChartCompany, type ChartUnit, type NodeChange, isConflict, listCompanies, listNodeChanges, listNodeTypes, listNodes, mergeNode, undoNodeChange } from '../../../../services/orgStructureApi';
import { fetchUsers } from '../../../../services/nexusApi';
import { type ChangeNames, describeChange } from './changeDetails';
import { useLoad } from '../orgShared';
import { ImpactPreviewDialog } from './ImpactPreviewDialog';
import { MergeNodesForm, type MergeNodesInput } from './MergeNodesForm';

/** «ادغام در گره‌ی دیگر»: choose the target and the date, see what it changes for people, then merge. */
export const MergeNodeDialog: React.FC<{
  company: ChartCompany;
  unit: ChartUnit;
  rowVersion: string | null;
  onMerged: () => Promise<void> | void;
  onReload: () => Promise<void> | void;
  onClose: () => void;
}> = ({ company, unit, rowVersion, onMerged, onReload, onClose }) => {
  const [input, setInput] = useState<MergeNodesInput | null>(null);
  const target = input ? company.units.concat(company.units.flatMap(function walk(u: ChartUnit): ChartUnit[] { return (u.children || []).flatMap((c) => [c, ...walk(c)]); })).find((u) => u.unitId === input.targetNodeId) : undefined;

  if (input && target) {
    return (
      <ImpactPreviewDialog
        title={`ادغام «${unit.name}»`}
        summary={<>«{unit.name}» با زیرمجموعه، پست‌ها (با دارندگان) و افرادش در «{target.name}» ادغام می‌شود و {input.effectiveDate ? `از ${jalaliDay(input.effectiveDate)}` : 'همین حالا'} غیرفعال می‌شود.</>}
        changes={[{ kind: 'merge', nodeId: unit.unitId, toNodeId: input.targetNodeId }]}
        confirmLabel="ادغام کن"
        onConfirm={async () => {
          await mergeNode(unit.unitId, { targetNodeId: input.targetNodeId, effectiveDate: input.effectiveDate ?? null, rowVersion });
          await onMerged();
          onClose();
        }}
        onReload={onReload}
        onClose={onClose}
      />
    );
  }
  return (
    <AdminDialog title={`ادغام «${unit.name}» در گره‌ی دیگر`} wide onClose={onClose} footer={<SecondaryButton type="button" onClick={onClose}>بستن</SecondaryButton>}>
      <MergeNodesForm company={company} initialSourceId={unit.unitId} onSubmit={setInput} onCancel={onClose} />
    </AdminDialog>
  );
};

const ACTION_TITLES: Record<string, string> = {
  create: 'ساخته شد', update: 'ویرایش نام یا جزء چارت', manager: 'تغییر مدیر', move: 'جابه‌جایی', reorder: 'تغییر ترتیب', deactivate: 'غیرفعال شد', activate: 'فعال شد',
  details: 'ویرایش اطلاعات', validity: 'تغییر تاریخ وجود', merge: 'ادغام', unmerge: 'برگشت ادغام', undo: 'بازگردانی', link: 'افزودن رابطه', unlink: 'برداشتن رابطه',
};
const actionTitle = (action: string) => ACTION_TITLES[action] || ACTION_TITLES[action.split('.').pop() || ''] || action;

/** The change log of a node, newest first; the last change can be undone. */
export const NodeHistoryDialog: React.FC<{
  unit: ChartUnit;
  rowVersion: string | null;
  canUndo: boolean;
  onUndone: () => Promise<void> | void;
  onClose: () => void;
}> = ({ unit, rowVersion, canUndo, onUndone, onClose }) => {
  const log = useLoad(() => listNodeChanges(unit.unitId, 50), 'دریافت تاریخچه ممکن نشد.');
  // Names for the ids in the log; each list is optional (a missing permission only leaves «(حذف‌شده)»).
  const names = useLoad(async (): Promise<ChangeNames> => {
    const [nodes, types, companies, users] = await Promise.all([
      listNodes().catch(() => []), listNodeTypes().catch(() => []), listCompanies().catch(() => []), fetchUsers().catch(() => []),
    ]);
    const map = (items: { id: string; name?: string; username?: string }[]) => new Map(items.map((i) => [i.id, i.name || i.username || '']));
    const [n, ty, c, u] = [map(nodes), map(types), map(companies), map(users)];
    return { node: (id) => n.get(id), type: (id) => ty.get(id), company: (id) => c.get(id), user: (id) => u.get(id) };
  }, '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string; conflict?: boolean } | null>(null);
  const changes: NodeChange[] = log.data || [];
  const last = changes[0];

  const undo = async () => {
    if (!(await appConfirm('آخرین تغییر این گره برگردانده شود؟ بازگردانی هم مثل هر تغییر دیگر بررسی و در تاریخچه ثبت می‌شود.', { confirmLabel: 'بازگردان' }))) return;
    setBusy(true);
    setMessage(null);
    try {
      await undoNodeChange(unit.unitId, rowVersion);
      await onUndone();
      await log.reload();
      setMessage({ type: 'success', text: 'آخرین تغییر برگردانده شد.' });
    } catch (err) {
      setMessage({ type: 'error', text: userErrorMessage(err, 'بازگردانی انجام نشد.'), conflict: isConflict(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminDialog title={`تاریخچه‌ی «${unit.name}»`} wide onClose={onClose} footer={<>
      <SecondaryButton type="button" onClick={onClose}>بستن</SecondaryButton>
      {canUndo && <PrimaryButton type="button" onClick={undo} disabled={busy || !last?.canUndo}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />} بازگرداندن آخرین تغییر</PrimaryButton>}
    </>}>
      {message && <Notice type={message.type}>{message.text}{message.conflict && ' صفحه را بارگذاری دوباره کنید.'}</Notice>}
      {log.loading ? <p className="text-sm text-slate-500">در حال دریافت…</p> : log.error ? <Notice type="error">{log.error}</Notice>
        : changes.length === 0 ? <p className="text-sm text-slate-500">هنوز تغییری ثبت نشده است.</p> : (
          <ol className="space-y-1.5" data-testid="node-log">
            {changes.map((c, i) => (
              <li key={c.id} className="rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{actionTitle(c.action)}</span>
                  <span className="text-[11px] text-slate-500 tabular-nums">{formatToJalali(c.atUtc)}</span>
                </div>
                {(() => {
                  const lines = describeChange(c.action, c.details, names.data || {});
                  return lines.length > 0 && (
                    <details className="mt-1"><summary className="text-[11px] text-slate-500 cursor-pointer">جزئیات</summary>
                      <ul className="mt-1 space-y-0.5 text-[12px] text-slate-600 dark:text-slate-300">{lines.map((line) => <li key={line}>{line}</li>)}</ul>
                    </details>
                  );
                })()}
                {i === 0 && !c.canUndo && <p className="mt-1 text-[11px] text-slate-400">این نوع تغییر برگردانده نمی‌شود.</p>}
              </li>
            ))}
          </ol>
        )}
    </AdminDialog>
  );
};
