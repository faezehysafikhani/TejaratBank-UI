import React, { useState } from 'react';
import { Loader2, MonitorSmartphone, ShieldAlert } from 'lucide-react';
import { SessionInfo, SessionLimitChallenge } from '../services/nexusApi';
import { toPersianDigits } from '../utils/helpers';

const formatTime = (iso: string) => {
  try {
    return toPersianDigits(new Date(iso).toLocaleString('fa-IR', { dateStyle: 'short', timeStyle: 'short' }));
  } catch {
    return iso;
  }
};

/** One line of a session list: device, address, when it started and was last used. */
export const SessionSummary: React.FC<{ session: SessionInfo }> = ({ session }) => (
  <div className="min-w-0 text-right">
    <div className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">{session.deviceLabel || 'دستگاه نامشخص'}</div>
    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
      {session.lastIp && <span dir="ltr">{toPersianDigits(session.lastIp)}</span>}
      <span>ورود: {formatTime(session.createdAtUtc)}</span>
      <span>آخرین فعالیت: {formatTime(session.lastActivityAtUtc)}</span>
    </div>
  </div>
);

/**
 * Shown instead of the tokens when the password was right but the user already has as many
 * sessions open as they may. Nothing is closed silently, and a refusal would lock out someone who
 * forgot to sign out at work: the user picks which session to close, or lets the oldest go.
 */
export const SessionLimitPicker: React.FC<{
  challenge: SessionLimitChallenge;
  busy: boolean;
  error: string | null;
  onConfirm: (closeIds: string[], closeOldest: boolean) => void;
  onCancel: () => void;
}> = ({ challenge, busy, error, onConfirm, onCancel }) => {
  const [chosen, setChosen] = useState<string[]>([]);
  const toggle = (id: string) =>
    setChosen((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
  const enough = chosen.length >= challenge.mustClose;

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-start gap-3 p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/70">
        <ShieldAlert className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <p className="text-xs leading-6 text-amber-900 dark:text-amber-200">
          به سقف نشست هم‌زمان ({toPersianDigits(challenge.maxConcurrent)}) رسیده‌اید؛ نشستی را که می‌خواهید بسته شود انتخاب کنید.
          {challenge.mustClose > 1 && ` (دست‌کم ${toPersianDigits(challenge.mustClose)} نشست)`}
        </p>
      </div>

      <ul className="space-y-2 max-h-64 overflow-y-auto">
        {challenge.sessions.map((session) => (
          <li key={session.id}>
            <label className={`flex items-center gap-3 p-3 rounded-2xl border cursor-pointer transition-colors ${
              chosen.includes(session.id)
                ? 'border-indigo-400 bg-indigo-50/70 dark:bg-indigo-950/30'
                : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/60'
            }`}>
              <input type="checkbox" checked={chosen.includes(session.id)} onChange={() => toggle(session.id)} className="w-4 h-4 accent-indigo-600" />
              <MonitorSmartphone className="w-5 h-5 text-slate-400 shrink-0" />
              <SessionSummary session={session} />
            </label>
          </li>
        ))}
      </ul>

      {error && <p className="text-xs text-red-600 dark:text-red-400" role="alert">{error}</p>}

      <div className="space-y-2">
        <button
          type="button"
          disabled={busy || !enough}
          onClick={() => onConfirm(chosen, false)}
          className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold cursor-pointer flex items-center justify-center gap-1.5"
        >
          {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} بستن نشست‌های انتخاب‌شده و ورود
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onConfirm([], true)}
          className="w-full py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
        >
          بستن قدیمی‌ترین نشست و ادامه
        </button>
        <button type="button" disabled={busy} onClick={onCancel} className="w-full py-2 text-[11px] font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 cursor-pointer">
          انصراف
        </button>
      </div>
    </div>
  );
};
