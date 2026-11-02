// «تعیین جانشین»: someone of the post's own unit (or below) stands in for it - while it is vacant,
// or from one day to another (a holder on leave or a mission). The stand-in sees the post's tasks
// in their own list for that time.
import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { AdminDialog, Field, Notice, PrimaryButton, SecondaryButton, inputClass } from '../../AdminUi';
import { JalaliDatePicker } from '../../../JalaliDatePicker';
import { userErrorMessage } from '../../../../utils/errorMessages';
import { toPersianDigits } from '../../../../utils/helpers';
import { type ChartPosition, clearActingPost, getActingForPost, postLabel, setActingPost } from '../../../../services/orgStructureApi';
import { LoadingRow, useLoad } from '../orgShared';
import { jalaliDay } from './HistoryDialogs';

const today = () => new Date().toISOString().slice(0, 10);
/** The start of a Gregorian day in local time, as the server takes dates. */
const dayStart = (day: string) => new Date(`${day}T00:00:00`).toISOString();
/** The last day of a stand-in (it ends at the start of the next day), as a local Gregorian day. */
const lastDay = (until: string) => {
  const d = new Date(new Date(until).getTime() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const StandInDialog: React.FC<{
  post: ChartPosition;
  onDone: (text: string) => Promise<void> | void;
  onClose: () => void;
}> = ({ post, onDone, onClose }) => {
  const data = useLoad(() => getActingForPost(post.unitPositionId), 'دریافت جانشین‌های مجاز ممکن نشد.');
  const [actingPostId, setActingPostId] = useState('');
  const [start, setStart] = useState<string | undefined>(undefined);
  const [end, setEnd] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const filled = post.holders.length > 0;
  const current = data.data?.acting ?? null;
  const badDates = (!!start && start < today()) || (!!end && end <= today()) || (!!start && !!end && end <= start);

  const save = async () => {
    if (!actingPostId) return;
    setBusy(true);
    setError(null);
    try {
      // The end day is included: the stand-in ends at the start of the next day.
      const until = end ? new Date(new Date(`${end}T00:00:00`).getTime() + 86_400_000).toISOString() : null;
      await setActingPost(post.unitPositionId, actingPostId, start && start > today() ? dayStart(start) : null, until);
      const who = data.data?.candidates.find((c) => c.postId === actingPostId)?.holderName ?? '';
      await onDone(end ? `«${who}» از ${start ? jalaliDay(start) : 'امروز'} تا ${jalaliDay(end)} جانشین «${post.title}» است.` : `«${who}» جانشین «${post.title}» شد.`);
      onClose();
    } catch (err) {
      setError(userErrorMessage(err, 'تعیین جانشین انجام نشد.'));
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    setBusy(true);
    setError(null);
    try {
      await clearActingPost(post.unitPositionId);
      await onDone(`جانشین «${post.title}» برداشته شد.`);
      onClose();
    } catch (err) {
      setError(userErrorMessage(err, 'برداشتن جانشین انجام نشد.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminDialog
      title={`جانشین پست «${postLabel(post)}»`}
      onClose={() => !busy && onClose()}
      footer={<>
        <SecondaryButton type="button" onClick={onClose} disabled={busy}>انصراف</SecondaryButton>
        <PrimaryButton type="button" onClick={save} disabled={busy || !actingPostId || badDates || (filled && !end)} data-testid="stand-in-save">
          {busy && <Loader2 className="w-4 h-4 animate-spin" />} ثبت جانشین
        </PrimaryButton>
      </>}
    >
      {error && <Notice type="error" onClose={() => setError(null)}>{error}</Notice>}
      {data.loading && <LoadingRow />}
      {data.error && <Notice type="error">{data.error}</Notice>}
      {current && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2" data-testid="stand-in-current">
          <span className="text-sm text-slate-800 dark:text-slate-100">
            جانشین فعلی: «{current.holderName ?? '—'}» ({current.title})
            {data.data?.actingUntil && <span className="text-[11px] text-slate-500"> · تا {jalaliDay(lastDay(data.data.actingUntil))}</span>}
          </span>
          <SecondaryButton type="button" onClick={clear} disabled={busy}>برداشتن جانشین</SecondaryButton>
        </div>
      )}
      {data.data && (
        <>
          <Field label="جانشین" hint="فقط کسانی که در همین واحد (یا زیرمجموعه‌ی آن) پست دارند.">
            <select value={actingPostId} onChange={(e) => setActingPostId(e.target.value)} aria-label="جانشین" className={inputClass}>
              <option value="">انتخاب…</option>
              {data.data.candidates.map((c) => (
                <option key={c.postId} value={c.postId}>{c.holderName} — {c.title}{c.code ? ` · کد ${toPersianDigits(c.code)}` : ''}</option>
              ))}
            </select>
          </Field>
          {data.data.candidates.length === 0 && <Notice type="info">در این واحد کسی نیست که بتواند جانشین شود.</Notice>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="از تاریخ" hint="خالی: از همین الان.">
              <JalaliDatePicker value={start} onChange={setStart} ariaLabel="شروع جانشینی" placeholder="از همین الان" />
            </Field>
            <Field label={filled ? 'تا تاریخ (لازم)' : 'تا تاریخ'} hint={filled ? 'پست مسئول دارد؛ جانشین فقط برای مدتی معین است.' : 'خالی: تا وقتی پست خالی است.'}>
              <JalaliDatePicker value={end} onChange={setEnd} ariaLabel="پایان جانشینی" placeholder={filled ? 'انتخاب کنید' : 'تا پر شدن پست'} />
            </Field>
          </div>
          {badDates && <Notice type="error">تاریخ‌ها درست نیستند: شروع گذشته نباشد و پایان بعد از امروز و بعد از شروع باشد.</Notice>}
          {start && !end && <Notice type="info">برای جانشینی از یک تاریخ، تاریخ پایان را هم بدهید.</Notice>}
          <Notice type="info">جانشین در این مدت فعالیت‌های این پست را در فهرست خودش می‌بیند و می‌تواند روی آن‌ها کار کند.</Notice>
        </>
      )}
    </AdminDialog>
  );
};
