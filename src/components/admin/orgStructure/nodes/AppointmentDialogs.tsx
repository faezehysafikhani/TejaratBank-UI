// Appointments over time (phase 10): who holds a post from when until when. Appointing or replacing
// (now, or from a later day - the present holder ends then), ending, and the history of a post's
// holders and of a person's posts. The past is never changed: ending keeps the appointment as history.
import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { AdminDialog, Field, Notice, PrimaryButton, SecondaryButton, StatusBadge } from '../../AdminUi';
import { JalaliDatePicker } from '../../../JalaliDatePicker';
import { userErrorMessage } from '../../../../utils/errorMessages';
import { toPersianDigits } from '../../../../utils/helpers';
import { type Appointment, type ChartPosition, type HeldPosition, appointToPost, appointmentState, cancelUpcomingAppointment, endPostAppointment, getPostHistory, getUserPositionHistory, postLabel } from '../../../../services/orgStructureApi';
import { EmptyRow, LoadingRow, UserPicker, useLoad } from '../orgShared';
import { PostChoiceDialog, endPosts, heldPostsOf, moveMainToHeldPost } from './PostChoices';
import { jalaliDay } from './HistoryDialogs';

/** Today as a Gregorian day (yyyy-MM-dd), for «not in the past». */
const today = () => new Date().toISOString().slice(0, 10);

/** «از ۱۴۰۵/۰۸/۱۰ تا ۱۴۰۵/۰۹/۰۱» (an empty end: «تا امروز»/«بدون پایان»). */
export const periodText = (a: Pick<Appointment, 'startDate' | 'endDate' | 'isActive'>): string => {
  const from = a.startDate ? `از ${jalaliDay(a.startDate.slice(0, 10))}` : 'از قدیم';
  const to = a.endDate ? ` تا ${jalaliDay(a.endDate.slice(0, 10))}` : a.isActive ? ' تا کنون' : '';
  return `${from}${to}`;
};

const STATE_BADGE = {
  current: <StatusBadge tone="green">فعلی</StatusBadge>,
  waiting: <StatusBadge tone="amber">در انتظار شروع</StatusBadge>,
  ended: <StatusBadge tone="slate">پایان‌یافته</StatusBadge>,
} as const;

/** The appointments, newest first: a post's holders over time (or one person's posts when `showPost`). */
export const AppointmentList: React.FC<{ appointments: Appointment[]; showPost?: boolean }> = ({ appointments, showPost = false }) => (
  appointments.length === 0 ? <EmptyRow>هنوز سابقه‌ای ثبت نشده است.</EmptyRow> : (
    <ol className="space-y-1.5" data-testid="appointments">
      {appointments.map((a) => (
        <li key={a.id} className="flex items-start justify-between gap-2 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2">
          <span className="min-w-0">
            <span className="block text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{showPost ? `${a.postTitle || 'پست'}${a.postCode ? ` · کد ${toPersianDigits(a.postCode)}` : ''}` : a.person.displayName}</span>
            <span className="block text-[11px] text-slate-500">{showPost && a.place ? `${a.place} · ` : ''}{periodText(a)}</span>
          </span>
          {STATE_BADGE[appointmentState(a)]}
        </li>
      ))}
    </ol>
  )
);

/**
 * «لغو انتصاب در انتظار»: an appointment from a later day can be cancelled before it starts; the
 * present holder then stays on. `canChange`: whoever may appoint (the server checks again).
 */
export const CancelWaitingAppointment: React.FC<{
  unitPositionId: string;
  appointments: Appointment[];
  onCancelled: (text: string) => Promise<void> | void;
}> = ({ unitPositionId, appointments, onCancelled }) => {
  const waiting = appointments.find((a) => appointmentState(a) === 'waiting');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!waiting) return null;
  const cancel = async () => {
    if (!window.confirm(`انتصاب «${waiting.person.displayName}» که ${periodText(waiting)} شروع می‌شد لغو شود؟ مسئول فعلی سر جایش می‌ماند.`)) return;
    setBusy(true);
    setError(null);
    try {
      await cancelUpcomingAppointment(unitPositionId);
      await onCancelled(`انتصاب در انتظارِ «${waiting.person.displayName}» لغو شد.`);
    } catch (err) {
      setError(userErrorMessage(err, 'لغو انتصاب انجام نشد.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-1.5">
      {error && <Notice type="error" onClose={() => setError(null)}>{error}</Notice>}
      <SecondaryButton type="button" onClick={cancel} disabled={busy} data-testid="cancel-waiting-appointment">
        {busy && <Loader2 className="w-4 h-4 animate-spin" />} لغو انتصاب در انتظار ({waiting.person.displayName})
      </SecondaryButton>
    </div>
  );
};

/** A post's holders over time; with `canChange`, an appointment waiting to start can be cancelled here. */
export const PostHistory: React.FC<{ unitPositionId: string; canChange?: boolean; onChanged?: () => Promise<void> | void }> = ({ unitPositionId, canChange = false, onChanged }) => {
  const history = useLoad(() => getPostHistory(unitPositionId), 'دریافت تاریخچه‌ی پست ممکن نشد.');
  if (history.loading) return <LoadingRow />;
  if (history.error) return <Notice type="error">{history.error}</Notice>;
  return (
    <div className="space-y-2">
      <AppointmentList appointments={history.data || []} />
      {canChange && (
        <CancelWaitingAppointment
          unitPositionId={unitPositionId}
          appointments={history.data || []}
          onCancelled={async () => { await history.reload(); await onChanged?.(); }}
        />
      )}
    </div>
  );
};

/** A person's posts over time (their chart panel, the users page). */
export const UserPositionHistory: React.FC<{ userId: string }> = ({ userId }) => {
  const history = useLoad(() => getUserPositionHistory(userId), 'دریافت سابقه‌ی سمت‌ها ممکن نشد.');
  if (history.loading) return <LoadingRow />;
  if (history.error) return <Notice type="error">{history.error}</Notice>;
  return <AppointmentList appointments={history.data || []} showPost />;
};

/** «تعیین یا تعویض مسئول»: the person and the day (empty: now). The present holder ends then. */
export const AppointDialog: React.FC<{
  post: ChartPosition;
  placeName: string;
  onDone: (text: string) => Promise<void> | void;
  onClose: () => void;
}> = ({ post, placeName, onDone, onClose }) => {
  const history = useLoad(() => getPostHistory(post.unitPositionId), 'دریافت تاریخچه‌ی پست ممکن نشد.');
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [start, setStart] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const holder = post.holders[0];
  const waiting = (history.data || []).some((a) => appointmentState(a) === 'waiting');
  const inPast = !!start && start < today();

  const [previous, setPrevious] = useState<HeldPosition[] | null>(null);

  // First: the posts the new person already holds - each stays or is removed (asked in a dialog).
  const save = async () => {
    if (!userId) return;
    setBusy(true);
    setError(null);
    try {
      const held = (await heldPostsOf(userId)).filter((h) => h.unitPositionId !== post.unitPositionId);
      if (held.length > 0) {
        setPrevious(held);
        return;
      }
      await appoint([]);
    } catch (err) {
      setError(userErrorMessage(err, 'ثبت انتصاب انجام نشد.'));
    } finally {
      setBusy(false);
    }
  };

  const confirmPrevious = async (endPostIds: string[]) => {
    setPrevious(null);
    setBusy(true);
    setError(null);
    try {
      await appoint(endPostIds);
    } catch (err) {
      setError(userErrorMessage(err, 'ثبت انتصاب انجام نشد.'));
    } finally {
      setBusy(false);
    }
  };

  const appoint = async (endPostIds: string[]) => {
    if (!userId) return;
    await appointToPost(post.unitPositionId, userId, start || null);
    await endPosts(endPostIds, start || null);
    if (!start && endPostIds.length > 0) await moveMainToHeldPost(userId, post.unitPositionId);
    await onDone(start ? `«${userName}» از ${jalaliDay(start)} مسئول «${post.title}» می‌شود.` : `«${userName}» مسئول «${post.title}» شد.`);
    onClose();
  };

  return (
    <AdminDialog
      title={`${holder ? 'تعویض مسئول' : 'انتصاب'} پست «${postLabel(post)}»`}
      onClose={() => !busy && onClose()}
      footer={<>
        <SecondaryButton type="button" onClick={onClose} disabled={busy}>انصراف</SecondaryButton>
        <PrimaryButton type="button" onClick={save} disabled={busy || !userId || inPast || waiting || history.loading}>{busy && <Loader2 className="w-4 h-4 animate-spin" />} ثبت انتصاب</PrimaryButton>
      </>}
    >
      {error && <Notice type="error" onClose={() => setError(null)}>{error}</Notice>}
      {waiting && <Notice type="info">این پست یک انتصاب در انتظار شروع دارد؛ برای ثبت انتصاب تازه اول آن را لغو کنید.</Notice>}
      {waiting && <CancelWaitingAppointment unitPositionId={post.unitPositionId} appointments={history.data || []} onCancelled={history.reload} />}
      <div className="space-y-1.5">
        <span className="block text-xs font-bold text-slate-700 dark:text-slate-300">مسئول جدید</span>
        <UserPicker value={userId} valueLabel={userName} onChange={(id, name) => { setUserId(id); setUserName(name); }} />
        <p className="text-[11px] text-slate-500">باید در همین شرکت ({placeName}) جایگاه داشته باشد؛ اگر ندارد اول از «قرار دادن در ساختار» جایگاهش را بدهید.</p>
      </div>
      <Field label="از چه روزی؟" hint="خالی: از همین الان. تاریخ گذشته ثبت نمی‌شود؛ سابقه بازنویسی نمی‌شود.">
        <JalaliDatePicker value={start} onChange={setStart} ariaLabel="تاریخ شروع انتصاب" placeholder="از همین الان" />
      </Field>
      {inPast && <Notice type="error">تاریخ شروع نباید گذشته باشد.</Notice>}
      {previous && (
        <PostChoiceDialog
          personName={userName || 'کاربر'}
          filled={null}
          vacant={[]}
          allowNew={false}
          allowReplace={false}
          previous={previous}
          onConfirm={(choice) => void confirmPrevious(choice.endPostIds)}
          onCancel={() => setPrevious(null)}
        />
      )}
      {holder && <Notice type="info">«{holder.displayName}» که الان مسئول این پست است، همان روز پایان می‌یابد و در تاریخچه می‌ماند. کارهای بازِ پست به مسئول جدید می‌رسد؛ آنچه مسئول قبلی انجام داده برای خودش می‌ماند.</Notice>}
    </AdminDialog>
  );
};

/** «پایان انتصاب»: now, or on a later day. */
export const EndAppointmentDialog: React.FC<{
  post: ChartPosition;
  onDone: (text: string) => Promise<void> | void;
  onClose: () => void;
}> = ({ post, onDone, onClose }) => {
  const [end, setEnd] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const holder = post.holders[0];
  const inPast = !!end && end < today();

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await endPostAppointment(post.unitPositionId, end || null);
      await onDone(end ? `انتصاب «${holder?.displayName}» از ${jalaliDay(end)} پایان می‌یابد.` : `انتصاب «${holder?.displayName}» پایان یافت.`);
      onClose();
    } catch (err) {
      setError(userErrorMessage(err, 'پایان انتصاب انجام نشد.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminDialog
      title={`پایان انتصاب در «${postLabel(post)}»`}
      onClose={() => !busy && onClose()}
      footer={<>
        <SecondaryButton type="button" onClick={onClose} disabled={busy}>انصراف</SecondaryButton>
        <PrimaryButton type="button" onClick={save} disabled={busy || inPast}>{busy && <Loader2 className="w-4 h-4 animate-spin" />} پایان انتصاب</PrimaryButton>
      </>}
    >
      {error && <Notice type="error" onClose={() => setError(null)}>{error}</Notice>}
      <Field label="تا چه روزی؟" hint="خالی: همین الان.">
        <JalaliDatePicker value={end} onChange={setEnd} ariaLabel="تاریخ پایان انتصاب" placeholder="همین الان" />
      </Field>
      {inPast && <Notice type="error">تاریخ پایان نباید گذشته باشد.</Notice>}
      <Notice type="info">انتصاب پاک نمی‌شود؛ در تاریخچه‌ی پست می‌ماند. بعد از پایان، پست خالی می‌شود.</Notice>
    </AdminDialog>
  );
};
