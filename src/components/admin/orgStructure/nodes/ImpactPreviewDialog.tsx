// «پیش‌نمایش اثر»: what a change to the structure would do to people, shown before it is made
// (POST /api/org-structure/impact-preview; nothing is written by asking). The dialog asks, shows
// who is affected and how, and only then lets the change be confirmed.
import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import { AdminDialog, Notice, PrimaryButton, SecondaryButton } from '../../AdminUi';
import { userErrorMessage } from '../../../../utils/errorMessages';
import { toPersianDigits } from '../../../../utils/helpers';
import { type ImpactChange, type ImpactPerson, type ImpactPreview, type PersonRef, isConflict, previewImpact } from '../../../../services/orgStructureApi';

const SHOWN_PEOPLE = 50;
const SHOWN_NAMES = 6;

const names = (people: PersonRef[]) =>
  `${people.slice(0, SHOWN_NAMES).map((p) => p.displayName).join('، ')}${people.length > SHOWN_NAMES ? ` و ${toPersianDigits(people.length - SHOWN_NAMES)} نفر دیگر` : ''}`;

/** The lines of what changes for one person; only what changes. */
export function impactLines(item: ImpactPerson, taskLimitOn: boolean): { tone: 'warn' | 'info' | 'good'; text: string }[] {
  const lines: { tone: 'warn' | 'info' | 'good'; text: string }[] = [];
  if (item.managerChanged) {
    lines.push({ tone: 'warn', text: `مدیر مستقیم: ${item.managerBefore?.displayName || 'ندارد'} ← ${item.managerAfter?.displayName || 'ندارد'}` });
  }
  if (item.subordinatesAdded.length) lines.push({ tone: 'info', text: `زیردست تازه (${toPersianDigits(item.subordinatesAdded.length)}): ${names(item.subordinatesAdded)}` });
  if (item.subordinatesRemoved.length) lines.push({ tone: 'warn', text: `از زیردستان خارج می‌شوند (${toPersianDigits(item.subordinatesRemoved.length)}): ${names(item.subordinatesRemoved)}` });
  if (taskLimitOn) {
    if (item.cannotAssignAdded.length) lines.push({ tone: 'warn', text: `دیگر نمی‌تواند به این افراد وظیفه بدهد (${toPersianDigits(item.cannotAssignAdded.length)}): ${names(item.cannotAssignAdded)}` });
    if (item.cannotAssignRemoved.length) lines.push({ tone: 'good', text: `از این پس می‌تواند به این افراد وظیفه بدهد (${toPersianDigits(item.cannotAssignRemoved.length)}): ${names(item.cannotAssignRemoved)}` });
  }
  if (item.substitutionAdded.length) lines.push({ tone: 'info', text: `پست‌های خالی تازه در کارتابل جانشینی: ${item.substitutionAdded.map((p) => p.title).join('، ')}` });
  if (item.substitutionRemoved.length) lines.push({ tone: 'info', text: `پست‌هایی که از کارتابل جانشینی‌اش خارج می‌شود: ${item.substitutionRemoved.map((p) => p.title).join('، ')}` });
  if (item.extraManagersAdded?.length) lines.push({ tone: 'warn', text: `مدیر دوم تازه (از رابطه‌ی فرعی): ${names(item.extraManagersAdded)}` });
  if (item.extraManagersRemoved?.length) lines.push({ tone: 'info', text: `دیگر مدیر دوم او نیستند: ${names(item.extraManagersRemoved)}` });
  if (item.teamAdded.length) lines.push({ tone: 'good', text: `اعضای تازه‌ای که می‌تواند به تیم کاری ببرد (${toPersianDigits(item.teamAdded.length)}): ${names(item.teamAdded)}` });
  if (item.teamRemoved.length) lines.push({ tone: 'warn', text: `اعضایی که دیگر نمی‌تواند به تیم کاری ببرد (${toPersianDigits(item.teamRemoved.length)}): ${names(item.teamRemoved)}` });
  return lines;
}

const toneClass = { warn: 'text-amber-700 dark:text-amber-300', info: 'text-slate-600 dark:text-slate-300', good: 'text-emerald-700 dark:text-emerald-300' } as const;

/** The result of a preview: how many people, and for each what changes. */
export const ImpactPreviewResult: React.FC<{ preview: ImpactPreview }> = ({ preview }) => {
  if (preview.peopleAffected === 0) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-950/30 p-3 text-sm text-emerald-800 dark:text-emerald-200">
        <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> هیچ‌کس تحت تأثیر این تغییر قرار نمی‌گیرد.
      </div>
    );
  }
  const shown = preview.people.slice(0, SHOWN_PEOPLE);
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50/60 dark:bg-amber-950/30 p-3 text-sm text-amber-800 dark:text-amber-200" data-testid="impact-summary">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
        <span><b>{toPersianDigits(preview.peopleAffected)} نفر</b> با این تغییر مدیر، زیردستان یا دسترسی‌شان به ارجاع کار عوض می‌شود.</span>
      </div>
      <div className="space-y-1.5 max-h-[50vh] overflow-y-auto" data-scrollable>
        {shown.map((item) => {
          const lines = impactLines(item, preview.taskLimitOn);
          return (
            <details key={item.person.userId} className="rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 open:bg-slate-50/60 dark:open:bg-slate-800/40">
              <summary className="cursor-pointer text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center justify-between gap-2">
                <span className="truncate">{item.person.displayName}</span>
                <span className="text-[11px] font-normal text-slate-500 shrink-0">{toPersianDigits(lines.length)} تغییر</span>
              </summary>
              <ul className="mt-2 space-y-1 text-xs leading-6">
                {lines.map((line, i) => <li key={i} className={toneClass[line.tone]}>• {line.text}</li>)}
              </ul>
            </details>
          );
        })}
        {preview.people.length > SHOWN_PEOPLE && (
          <p className="text-xs text-slate-500 px-1">و {toPersianDigits(preview.people.length - SHOWN_PEOPLE)} نفر دیگر.</p>
        )}
      </div>
    </div>
  );
};

/** Loads the preview of changes; null while loading, an error message if it could not be made. */
export function useImpactPreview(changes: ImpactChange[] | null) {
  const [state, setState] = useState<{ preview: ImpactPreview | null; error: string | null; loading: boolean }>({ preview: null, error: null, loading: !!changes });
  const key = JSON.stringify(changes);
  useEffect(() => {
    if (!changes) { setState({ preview: null, error: null, loading: false }); return; }
    let alive = true;
    setState({ preview: null, error: null, loading: true });
    previewImpact(changes)
      .then((preview) => alive && setState({ preview, error: null, loading: false }))
      .catch((err) => alive && setState({ preview: null, error: userErrorMessage(err, 'پیش‌نمایش اثر ممکن نشد.'), loading: false }));
    return () => { alive = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return state;
}

/**
 * The dialog: shows what the changes would do and confirms them. onConfirm makes the change (an
 * error it throws is shown here; a conflict offers reloading the chart through onReload).
 */
export const ImpactPreviewDialog: React.FC<{
  title: string;
  /** What the change is, in a line. */
  summary: React.ReactNode;
  changes: ImpactChange[];
  confirmLabel?: string;
  onConfirm: () => Promise<void>;
  onReload?: () => Promise<void> | void;
  onClose: () => void;
}> = ({ title, summary, changes, confirmLabel = 'تأیید و اعمال تغییر', onConfirm, onReload, onClose }) => {
  const { preview, error, loading } = useImpactPreview(changes);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<{ text: string; conflict: boolean } | null>(null);

  const confirm = async () => {
    setBusy(true);
    setFailure(null);
    try {
      await onConfirm();
    } catch (err) {
      setFailure({ text: userErrorMessage(err, 'اعمال تغییر انجام نشد.'), conflict: isConflict(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminDialog
      title={title}
      wide
      onClose={() => !busy && onClose()}
      footer={<>
        <SecondaryButton type="button" onClick={onClose} disabled={busy}>انصراف</SecondaryButton>
        <PrimaryButton type="button" onClick={confirm} disabled={busy || loading || !!error || !preview}>
          {busy && <Loader2 className="w-4 h-4 animate-spin" />} {confirmLabel}
        </PrimaryButton>
      </>}
    >
      <p className="text-sm text-slate-700 dark:text-slate-200" data-testid="impact-change">{summary}</p>
      {loading && <div className="flex items-center gap-2 text-sm text-slate-500 py-6 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> در حال بررسی اثر تغییر…</div>}
      {error && <Notice type="error">{error}</Notice>}
      {preview && <ImpactPreviewResult preview={preview} />}
      {failure && (
        <Notice type="error">
          {failure.text}
          {failure.conflict && onReload && (
            <button type="button" onClick={async () => { await onReload(); onClose(); }} className="mt-2 flex items-center gap-1.5 text-xs font-bold underline cursor-pointer">
              <RefreshCw className="w-3.5 h-3.5" /> بارگذاری دوباره‌ی چارت
            </button>
          )}
        </Notice>
      )}
    </AdminDialog>
  );
};
