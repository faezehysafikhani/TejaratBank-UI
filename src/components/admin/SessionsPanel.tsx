import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, LogOut, MonitorSmartphone, Save, ShieldAlert, X } from 'lucide-react';
import {
  SESSION_END_MESSAGES,
  SessionInfo,
  SessionList,
  SessionPolicySettings,
  getMySessions,
  getSessionPolicy,
  getUserSessions,
  logoutEverywhere,
  revokeAllOrganizationSessions,
  revokeAllSessionsOfUser,
  revokeMyOtherSessions,
  revokeMySession,
  revokeUserSession,
  updateSessionPolicy,
  updateSessionPreferences,
} from '../../services/nexusApi';
import { AdminCard, Field, Notice, PrimaryButton, SecondaryButton, Toggle, inputClass } from './AdminUi';
import { SessionSummary } from '../SessionLimitPicker';
import { appConfirm } from '../../utils/appDialog';
import { userErrorMessage } from '../../utils/errorMessages';
import { toPersianDigits } from '../../utils/helpers';

type Message = { type: 'success' | 'error'; text: string } | null;

const END_LABELS: Record<string, string> = {
  'session.logged_out': 'خروج کاربر',
  'session.revoked': 'بسته‌شده از نشست دیگر',
  'session.idle_expired': 'عدم فعالیت',
  'session.absolute_expired': 'پایان مدت مجاز ورود',
  'session.credentials_changed': 'تغییر رمز یا شماره موبایل',
  'session.administrator': 'بسته‌شده توسط مدیر',
  'session.account_disabled': 'غیرفعال‌شدن حساب',
  'session.reuse_detected': 'استفاده‌ی مجدد از توکن (احتمال سرقت)',
  'session.concurrent_limit': 'بسته‌شده برای ورود جدید',
};
const endLabel = (session: SessionInfo) => {
  const base = (session.endReason && (END_LABELS[session.endReason] || SESSION_END_MESSAGES[session.endReason])) || 'پایان یافته';
  return session.endedByName ? `${base} (${session.endedByName})` : base;
};

const END_BADGE_TONES: Record<string, string> = {
  'session.idle_expired': 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
  'session.absolute_expired': 'bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300',
  'session.concurrent_limit': 'bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300',
};
const DEFAULT_END_BADGE_TONE = 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
const RECENT_PREVIEW_COUNT = 5;

/** Lists of sessions with a close button each. Used for one's own sessions and for another user's. */
const SessionRows: React.FC<{
  list: SessionList;
  canClose: boolean;
  busyId: string | null;
  onClose: (session: SessionInfo) => void;
}> = ({ list, canClose, busyId, onClose }) => {
  const [showAllRecent, setShowAllRecent] = useState(false);
  const recent = showAllRecent ? list.recent : list.recent.slice(0, RECENT_PREVIEW_COUNT);

  return (
    <div className="space-y-4">
      <ul className="space-y-2">
        {list.active.length === 0 && <li className="text-xs text-slate-500 dark:text-slate-400">نشست فعالی وجود ندارد.</li>}
        {list.active.map((session) => (
          <li
            key={session.id}
            className={`flex items-center gap-3 rounded-2xl border ${
              session.isCurrent
                ? 'p-3.5 border-emerald-300/50 dark:border-emerald-700/50 bg-gradient-to-br from-emerald-500/10 to-emerald-500/0'
                : 'p-3 border-slate-200 dark:border-slate-700'
            }`}
          >
            <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
              session.isCurrent ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-slate-100 text-slate-400 dark:bg-slate-800'
            }`}>
              <MonitorSmartphone className="w-5 h-5" />
            </span>
            <div className="flex-1 min-w-0">
              <SessionSummary session={session} />
            </div>
            {session.isCurrent && <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 shrink-0">همین دستگاه</span>}
            {canClose && (
              <button
                type="button"
                disabled={busyId === session.id}
                onClick={() => onClose(session)}
                className="text-[11px] font-bold px-3 py-1.5 rounded-xl border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 disabled:opacity-50 cursor-pointer shrink-0"
              >
                {busyId === session.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : session.isCurrent ? 'خروج' : 'بستن'}
              </button>
            )}
          </li>
        ))}
      </ul>

      {list.recent.length > 0 && (
        <div>
          <h4 className="text-xs font-bold text-slate-600 dark:text-slate-300 mb-2">نشست‌های اخیراً بسته‌شده</h4>
          <div className="border border-slate-200 dark:border-slate-700 rounded-2xl overflow-auto max-h-[380px]">
            <ul className="divide-y divide-slate-200 dark:divide-slate-700">
              {recent.map((session) => (
                <li key={session.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-indigo-500/5">
                  <span className="w-8 h-8 rounded-[10px] bg-slate-100 text-slate-400 dark:bg-slate-800 flex items-center justify-center shrink-0">
                    <MonitorSmartphone className="w-4 h-4" />
                  </span>
                  <div className="flex-1 min-w-0"><SessionSummary session={session} /></div>
                  <span className={`rounded-full text-[10px] font-bold px-2.5 py-0.5 shrink-0 ${(session.endReason && END_BADGE_TONES[session.endReason]) || DEFAULT_END_BADGE_TONE}`}>{endLabel(session)}</span>
                </li>
              ))}
            </ul>
          </div>
          {list.recent.length > RECENT_PREVIEW_COUNT && (
            <button
              type="button"
              onClick={() => setShowAllRecent((value) => !value)}
              className="mt-2 w-full py-2 rounded-xl border border-dashed border-indigo-400/50 bg-indigo-500/5 text-indigo-600 dark:text-indigo-300 text-xs font-bold cursor-pointer"
            >
              {showAllRecent ? 'نمایش کمتر' : `نمایش همه (${toPersianDigits(list.recent.length)})`}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

/** «نشست‌های فعال»: the user's own sessions, how many may be open at once, and the SMS for every sign-in. */
const MySessionsCard: React.FC = () => {
  const [list, setList] = useState<SessionList | null>(null);
  const [message, setMessage] = useState<Message>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [maxChosen, setMaxChosen] = useState<number>(1);
  const [sms, setSms] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const next = await getMySessions();
      setList(next);
      setMaxChosen(next.policy?.maxConcurrentChosen ?? 1);
      setSms(next.smsOnEveryNewSignIn);
    } catch (err) {
      setMessage({ type: 'error', text: userErrorMessage(err, 'دریافت نشست‌ها ممکن نشد.') });
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const close = async (session: SessionInfo) => {
    if (!(await appConfirm(session.isCurrent ? 'از همین دستگاه خارج می‌شوید؟' : `نشست «${session.deviceLabel || 'دستگاه نامشخص'}» بسته شود؟`))) return;
    setBusyId(session.id);
    try {
      await revokeMySession(session.id);
      // Closing this very session signs the user out: the next request reports it.
      if (session.isCurrent) window.location.reload();
      else await load();
    } catch (err) {
      setMessage({ type: 'error', text: userErrorMessage(err, 'بستن نشست ممکن نشد.') });
    } finally {
      setBusyId(null);
    }
  };

  const closeOthers = async () => {
    if (!(await appConfirm('از همه‌ی دستگاه‌های دیگر خارج می‌شوید؟'))) return;
    try {
      const count = await revokeMyOtherSessions();
      setMessage({ type: 'success', text: `${toPersianDigits(count)} نشست بسته شد.` });
      await load();
    } catch (err) {
      setMessage({ type: 'error', text: userErrorMessage(err, 'بستن نشست‌ها ممکن نشد.') });
    }
  };

  const closeAll = async () => {
    if (!(await appConfirm('از همه‌ی دستگاه‌ها، از جمله همین دستگاه، خارج می‌شوید؟', { danger: true }))) return;
    try {
      await logoutEverywhere();
      window.location.reload();
    } catch (err) {
      setMessage({ type: 'error', text: userErrorMessage(err, 'خروج ممکن نشد.') });
    }
  };

  const savePreferences = async () => {
    setSaving(true);
    try {
      await updateSessionPreferences(maxChosen, sms);
      setMessage({ type: 'success', text: 'تنظیمات ذخیره شد. کم‌کردن تعداد نشست‌ها از ورود بعدی اعمال می‌شود.' });
      await load();
    } catch (err) {
      setMessage({ type: 'error', text: userErrorMessage(err, 'ذخیره ممکن نشد.') });
    } finally {
      setSaving(false);
    }
  };

  const allowed = list?.policy?.maxConcurrentAllowed ?? 1;

  return (
    <AdminCard className="p-5 sm:p-6 space-y-5">
      <div>
        <h3 className="text-base font-extrabold text-slate-900 dark:text-white">نشست‌های فعال</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          دستگاه‌هایی که با حساب شما وارد شده‌اند. اگر نشستی را نمی‌شناسید، آن را ببندید و رمز عبور خود را تغییر دهید.
        </p>
      </div>
      {message && <Notice type={message.type} onClose={() => setMessage(null)}>{message.text}</Notice>}
      {!list ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
      ) : (
        <>
          {list.policy && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              بی‌فعالیتی تا {toPersianDigits(Math.round(list.policy.idleSeconds / 60))} دقیقه و حداکثر {toPersianDigits(Math.round(list.policy.absoluteSeconds / 3600))} ساعت برای هر ورود.
            </p>
          )}
          <SessionRows list={list} canClose busyId={busyId} onClose={close} />
          <div className="flex flex-wrap gap-2">
            <SecondaryButton onClick={closeOthers} disabled={list.active.length < 2}><X className="w-4 h-4" /> خروج از بقیه‌ی دستگاه‌ها</SecondaryButton>
            <SecondaryButton onClick={closeAll}><LogOut className="w-4 h-4" /> خروج از همه‌ی دستگاه‌ها</SecondaryButton>
          </div>

          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
            <Field label="حداکثر نشست هم‌زمان" hint={`تا سقف ${toPersianDigits(allowed)} که مدیر سازمان تعیین کرده است. هنگام رسیدن به سقف، نشستی را که می‌خواهید بسته شود خودتان انتخاب می‌کنید.`}>
              <select value={maxChosen} onChange={(event) => setMaxChosen(Number(event.target.value))} className={inputClass}>
                {Array.from({ length: allowed }, (_, index) => index + 1).map((value) => (
                  <option key={value} value={value}>{toPersianDigits(value)}</option>
                ))}
              </select>
            </Field>
            <Toggle checked={sms} onChange={setSms} label="پیامک برای هر ورود جدید" description="با هر ورود به حساب شما، پیامکی (بدون نشانی IP) ارسال می‌شود." />
            <PrimaryButton onClick={savePreferences} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} ذخیره
            </PrimaryButton>
          </div>
        </>
      )}
    </AdminCard>
  );
};

const policyInputClass =
  'w-[120px] text-center font-bold text-[13px] py-1.5 rounded-[10px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400';

const PolicyNumberField: React.FC<{ label: string; range: string; unit?: string; value: number; min: number; max: number; onChange: (value: number) => void }> = ({ label, range, unit, value, min, max, onChange }) => (
  <label className="block">
    <span className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
      {label}
      <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 dark:text-indigo-300 dark:bg-indigo-950/50 rounded-full px-2">{range}</span>
    </span>
    <span className="relative inline-block">
      <input type="number" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} className={`${policyInputClass} ${unit ? 'pl-[46px]' : ''}`} />
      {unit && <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 pointer-events-none">{unit}</span>}
    </span>
  </label>
);

/** The organization's timeouts and session limits, inside the platform's range. */
const PolicyCard: React.FC<{ canUpdate: boolean }> = ({ canUpdate }) => {
  const [policy, setPolicy] = useState<SessionPolicySettings | null>(null);
  const [message, setMessage] = useState<Message>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getSessionPolicy().then(setPolicy).catch((err) => setMessage({ type: 'error', text: userErrorMessage(err, 'دریافت تنظیمات نشست ممکن نشد.') }));
  }, []);

  if (!policy) return message ? <Notice type="error">{message.text}</Notice> : null;
  const set = (patch: Partial<SessionPolicySettings>) => setPolicy({ ...policy, ...patch });
  const { range } = policy;

  const save = async () => {
    setSaving(true);
    try {
      setPolicy(await updateSessionPolicy(policy));
      setMessage({ type: 'success', text: 'تنظیمات ذخیره شد. برای نشست‌های جدید اعمال می‌شود؛ برای اعمال فوری از «خاتمه‌ی همه‌ی نشست‌ها» استفاده کنید.' });
    } catch (err) {
      setMessage({ type: 'error', text: userErrorMessage(err, 'ذخیره ممکن نشد.') });
    } finally {
      setSaving(false);
    }
  };

  const group = (title: string, idle: keyof SessionPolicySettings, absolute: keyof SessionPolicySettings, concurrent: keyof SessionPolicySettings | null) => (
    <div className="p-3 sm:p-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40 space-y-3">
      <h4 className="flex items-center gap-2 text-[13px] font-extrabold text-slate-700 dark:text-slate-200">
        <span className="w-2 h-2 rounded-full bg-indigo-500 shrink-0" />
        {title}
      </h4>
      <div className="flex flex-wrap gap-x-8 gap-y-3">
        <PolicyNumberField label="بی‌فعالیتی" unit="دقیقه" range={`${toPersianDigits(range.minIdleMinutes)} تا ${toPersianDigits(range.maxIdleMinutes)}`} value={policy[idle] as number} min={range.minIdleMinutes} max={range.maxIdleMinutes} onChange={(value) => set({ [idle]: value } as Partial<SessionPolicySettings>)} />
        <PolicyNumberField label="حداکثر مدت ورود" unit="ساعت" range={`${toPersianDigits(range.minAbsoluteHours)} تا ${toPersianDigits(range.maxAbsoluteHours)}`} value={policy[absolute] as number} min={range.minAbsoluteHours} max={range.maxAbsoluteHours} onChange={(value) => set({ [absolute]: value } as Partial<SessionPolicySettings>)} />
        {concurrent && (
          <PolicyNumberField label="سقف نشست هم‌زمان" range={`${toPersianDigits(range.minConcurrent)} تا ${toPersianDigits(range.maxConcurrent)}`} value={policy[concurrent] as number} min={range.minConcurrent} max={range.maxConcurrent} onChange={(value) => set({ [concurrent]: value } as Partial<SessionPolicySettings>)} />
        )}
      </div>
    </div>
  );

  return (
    <AdminCard className="p-5 sm:p-6 space-y-4">
      <div>
        <h3 className="text-base font-extrabold text-slate-900 dark:text-white">سیاست نشست‌ها</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">برای هر کاربر سخت‌گیرانه‌ترین مقدارِ پروفایل‌های مشمول او اعمال می‌شود.</p>
      </div>
      {message && <Notice type={message.type} onClose={() => setMessage(null)}>{message.text}</Notice>}
      {group('پیش‌فرض (همه‌ی کاربران)', 'idleMinutes', 'absoluteHours', 'maxConcurrent')}
      {group('کاربران دارای دسترسی حساس (مدیریت کاربران و نقش‌ها، تنظیمات، پنل پیامک، تاریخچه)', 'sensitiveIdleMinutes', 'sensitiveAbsoluteHours', 'sensitiveMaxConcurrent')}
      {group('مدیر اصلی سیستم', 'systemIdleMinutes', 'systemAbsoluteHours', 'systemMaxConcurrent')}
      {group('ورود از بیرون شبکه‌ی داخلی', 'externalIdleMinutes', 'externalAbsoluteHours', null)}
      <Field label="بازه‌های شبکه‌ی داخلی بانک (CIDR، هر خط یکی)" hint="مثلاً 10.0.0.0/8. اگر خالی باشد پروفایل «بیرون شبکه» اعمال نمی‌شود.">
        <textarea
          dir="ltr"
          value={policy.internalNetworks.join('\n')}
          onChange={(event) => set({ internalNetworks: event.target.value.split('\n').map((line) => line.trim()).filter(Boolean) })}
          className="block w-full max-w-[420px] h-20 text-left font-mono text-xs px-3 py-2 rounded-[10px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400"
        />
      </Field>
      {canUpdate && (
        <PrimaryButton onClick={save} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} ذخیره‌ی سیاست
        </PrimaryButton>
      )}
    </AdminCard>
  );
};

/** The emergency button: ends every session of the organization except the caller's own. */
const EmergencyCard: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);

  const run = async () => {
    setBusy(true);
    try {
      const count = await revokeAllOrganizationSessions(password, reason.trim());
      setMessage({ type: 'success', text: `${toPersianDigits(count)} نشست بسته شد.` });
      setOpen(false);
      setPassword('');
      setReason('');
    } catch (err) {
      setMessage({ type: 'error', text: userErrorMessage(err, 'انجام نشد.') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminCard className="p-5 sm:p-6 space-y-4 border-red-300/50 dark:border-red-800/50 bg-gradient-to-br from-red-500/10 to-red-500/0">
      <div className="flex items-start gap-3">
        <ShieldAlert className="w-5 h-5 text-rose-600 dark:text-rose-400 mt-0.5 shrink-0" />
        <div>
          <h3 className="text-base font-extrabold text-slate-900 dark:text-white">خاتمه‌ی همه‌ی نشست‌های سازمان</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">برای حادثه‌ی امنیتی. همه‌ی کاربران، به‌جز نشست فعلی شما، از سامانه خارج می‌شوند. رمز عبور و دلیل لازم است و در تاریخچه ثبت می‌شود.</p>
        </div>
      </div>
      {message && <Notice type={message.type} onClose={() => setMessage(null)}>{message.text}</Notice>}
      {!open ? (
        <SecondaryButton onClick={() => setOpen(true)} className="text-rose-600">خاتمه‌ی نشست‌ها…</SecondaryButton>
      ) : (
        <div className="space-y-3">
          <Field label="دلیل" required><input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={300} className={inputClass} /></Field>
          <Field label="رمز عبور شما" required><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" className={inputClass} dir="ltr" /></Field>
          <div className="flex gap-2">
            <PrimaryButton onClick={run} disabled={busy || reason.trim().length < 3 || !password} className="!bg-rose-700 hover:!bg-rose-800">
              {busy && <Loader2 className="w-4 h-4 animate-spin" />} تأیید و خاتمه
            </PrimaryButton>
            <SecondaryButton onClick={() => setOpen(false)}>انصراف</SecondaryButton>
          </div>
        </div>
      )}
    </AdminCard>
  );
};

/** Sessions of another user, for those who may see (and close) them. */
export const UserSessionsDialog: React.FC<{ userId: string; userName: string; canClose: boolean; onClose: () => void }> = ({ userId, userName, canClose, onClose }) => {
  const [list, setList] = useState<SessionList | null>(null);
  const [message, setMessage] = useState<Message>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setList(await getUserSessions(userId));
    } catch (err) {
      setMessage({ type: 'error', text: userErrorMessage(err, 'دریافت نشست‌ها ممکن نشد.') });
    }
  }, [userId]);
  // The list is a picture of a moment: sessions end by themselves (idle, absolute) while the
  // dialog is open, so it is read again every 15 seconds and when the window is focused.
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { if (!document.hidden) void load(); }, 15_000);
    const onFocus = () => void load();
    window.addEventListener('focus', onFocus);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', onFocus); };
  }, [load]);

  const closeOne = async (session: SessionInfo) => {
    setBusyId(session.id);
    try {
      await revokeUserSession(userId, session.id);
      await load();
    } catch (err) {
      setMessage({ type: 'error', text: userErrorMessage(err, 'بستن نشست ممکن نشد.') });
    } finally {
      setBusyId(null);
    }
  };

  const closeAll = async () => {
    if (!(await appConfirm(`همه‌ی نشست‌های «${userName}» بسته شود؟ کاربر مطلع می‌شود.`, { danger: true }))) return;
    try {
      await revokeAllSessionsOfUser(userId);
      await load();
    } catch (err) {
      setMessage({ type: 'error', text: userErrorMessage(err, 'بستن نشست‌ها ممکن نشد.') });
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/50 backdrop-blur-sm p-4" role="dialog" aria-modal="true" dir="rtl">
      <div className="w-full max-w-2xl max-h-[85vh] overflow-y-auto bg-white dark:bg-slate-900 rounded-3xl shadow-2xl p-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-base font-extrabold text-slate-900 dark:text-white">نشست‌های «{userName}»</h3>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer" aria-label="بستن"><X className="w-4 h-4" /></button>
        </div>
        {message && <Notice type={message.type} onClose={() => setMessage(null)}>{message.text}</Notice>}
        {!list ? <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div> : (
          <>
            <SessionRows list={list} canClose={canClose} busyId={busyId} onClose={closeOne} />
            {canClose && list.active.length > 0 && <SecondaryButton onClick={closeAll} className="text-rose-600">بستن همه‌ی نشست‌های این کاربر</SecondaryButton>}
          </>
        )}
      </div>
    </div>
  );
};

/** The «نشست‌ها» tab of the settings: the user's own sessions, and the organization's policy for those who may change it. */
export const SessionsPanel: React.FC<{ can: (permission: string) => boolean }> = ({ can }) => (
  <div className="space-y-5">
    <MySessionsCard />
    {can('settings.view') && <PolicyCard canUpdate={can('settings.update')} />}
    {can('sessions.revoke_all') && <EmergencyCard />}
  </div>
);
