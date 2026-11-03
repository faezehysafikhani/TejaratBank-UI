import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Clock, KeyRound, Loader2, LogOut, ShieldAlert } from 'lucide-react';
import {
  CAPTCHA_ERROR_CODES,
  LoginCaptcha,
  NexusApiError,
  SessionLimitError,
  SessionStatus,
  getSessionStatus,
  keepSessionAlive,
  login,
  requestLoginCaptcha,
  setAbsoluteReauthHandler,
} from '../services/nexusApi';
import {
  broadcastContinued,
  hasPendingActivity,
  onActivity,
  onContinuedInOtherTab,
  pauseActivityTracking,
  startActivityTracking,
} from '../utils/sessionActivity';
import { userErrorMessage } from '../utils/errorMessages';
import { toPersianDigits } from '../utils/helpers';

/** The warning appears this long before the idle timeout ends the session. */
const IDLE_WARNING_SECONDS = 120;
/** The notice about the end of the sign-in appears this long before its absolute limit. */
const ABSOLUTE_WARNING_SECONDS = 600;
/** The server moves the idle clock at most every 30 s; the local estimate leaves room for that. */
const SERVER_LAG_MS = 30_000;
const HEARTBEAT_MS = 20_000;
const RESYNC_MS = 60_000;

interface Deadlines {
  idleAt: number;
  absoluteAt: number;
  idleSeconds: number;
  warningSeconds: number;
}

const formatClock = (seconds: number) => {
  const total = Math.max(0, Math.ceil(seconds));
  return toPersianDigits(`${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`);
};

/**
 * The browser side of the session limits. The server decides when a session ends; this only
 * tells the user before it happens and keeps the server informed that they are there.
 *
 * - Idle: two minutes before the end, a dialog counts down with Continue and Sign out. It is the
 *   same in every tab (a BroadcastChannel carries activity and the choice), and moving the mouse
 *   does not dismiss it. The remaining time always comes from the server, so a sleeping laptop or
 *   a wrong clock cannot make the warning wrong.
 * - Absolute: ten minutes before the end a notice asks the user to save their work; at the end
 *   the password is asked again in a small dialog and the page - and anything half-filled in it -
 *   stays as it is.
 */
export const SessionGuard: React.FC<{ identifier: string; onSignOut: () => void }> = ({ identifier, onSignOut }) => {
  const [deadlines, setDeadlines] = useState<Deadlines | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [reauth, setReauth] = useState<{ resolve: (ok: boolean) => void } | null>(null);
  const deadlinesRef = useRef<Deadlines | null>(null);
  const checkingEndRef = useRef(false);
  const stayingRef = useRef(false);
  // When "Continue" was last pressed: an answer to a question asked before it is out of date.
  const stayAtRef = useRef(0);
  const [stayError, setStayError] = useState<string | null>(null);

  const apply = useCallback((status: SessionStatus, askedAt = Date.now()) => {
    // A status requested before the user pressed "Continue" still carries the old idle time and
    // would bring the dialog straight back.
    if (askedAt < stayAtRef.current) return;
    const received = Date.now();
    const next = {
      idleAt: received + status.idleRemainingSeconds * 1000,
      absoluteAt: received + status.absoluteRemainingSeconds * 1000,
      idleSeconds: status.idleTimeoutSeconds,
      warningSeconds: status.idleWarningSeconds ?? IDLE_WARNING_SECONDS,
    };
    deadlinesRef.current = next;
    setDeadlines(next);
  }, []);

  const resync = useCallback(async () => {
    const askedAt = Date.now();
    try {
      apply(await getSessionStatus(), askedAt);
    } catch {
      // A 401 already signed the user out (the HTTP client reports why); anything else is retried on the next tick.
    }
  }, [apply]);

  useEffect(() => {
    startActivityTracking();
    void resync();
    const resyncTimer = window.setInterval(() => void resync(), RESYNC_MS);
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    // A tab that was asleep or hidden asks the server instead of trusting its own timers.
    const onVisible = () => { if (document.visibilityState === 'visible') void resync(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(resyncTimer);
      window.clearInterval(clock);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [resync]);

  // Activity here or in another tab pushes the local idle estimate out.
  useEffect(() => onActivity((at) => {
    const current = deadlinesRef.current;
    if (!current) return;
    // The server moves its clock at most every min(30 s, idle/4); the estimate leaves room for that.
    const lag = Math.min(SERVER_LAG_MS, (current.idleSeconds * 1000) / 4);
    const idleAt = Math.max(current.idleAt, at + current.idleSeconds * 1000 - lag);
    if (idleAt !== current.idleAt) {
      const next = { ...current, idleAt };
      deadlinesRef.current = next;
      setDeadlines(next);
    }
  }), []);

  // Something was done but no request carried it to the server for a while: a short heartbeat.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!hasPendingActivity()) return;
      const askedAt = Date.now();
      keepSessionAlive().then((status) => apply(status, askedAt)).catch(() => undefined);
    }, HEARTBEAT_MS);
    return () => window.clearInterval(timer);
  }, [apply]);

  useEffect(() => onContinuedInOtherTab(() => void resync()), [resync]);

  // The absolute limit: the HTTP client calls this when the server refuses a request for it.
  useEffect(() => {
    setAbsoluteReauthHandler(() => new Promise<boolean>((resolve) => setReauth({ resolve })));
    return () => setAbsoluteReauthHandler(null);
  }, []);

  const idleRemaining = deadlines ? (deadlines.idleAt - now) / 1000 : Infinity;
  const absoluteRemaining = deadlines ? (deadlines.absoluteAt - now) / 1000 : Infinity;
  const warnIdle = idleRemaining <= (deadlines?.warningSeconds ?? IDLE_WARNING_SECONDS) && idleRemaining > 0 && !reauth;
  const warnAbsolute = absoluteRemaining <= ABSOLUTE_WARNING_SECONDS && absoluteRemaining > 0;

  useEffect(() => {
    pauseActivityTracking(warnIdle);
    return () => pauseActivityTracking(false);
  }, [warnIdle]);

  // A limit was reached on the local clock: the server says whether it really was. If the session
  // is over, the answer is a 401 and the HTTP client signs the user out (or asks for the password).
  useEffect(() => {
    if (!deadlines || checkingEndRef.current) return;
    if (idleRemaining <= 0 || absoluteRemaining <= 0) {
      checkingEndRef.current = true;
      resync().finally(() => { checkingEndRef.current = false; });
    }
  }, [deadlines, idleRemaining, absoluteRemaining, resync]);

  // "Continue": the dialog closes at once (the click is the user's answer; waiting for the server
  // made it linger for seconds on a slow link) and the other tabs are told straight away. The
  // server then confirms; if that fails the old state comes back and the dialog says so.
  const stay = async () => {
    const before = deadlinesRef.current;
    if (!before || stayingRef.current) return;
    stayingRef.current = true;
    stayAtRef.current = Date.now();
    setStayError(null);
    const optimistic = { ...before, idleAt: Date.now() + before.idleSeconds * 1000 };
    deadlinesRef.current = optimistic;
    setDeadlines(optimistic);
    broadcastContinued();
    try {
      apply(await keepSessionAlive(), stayAtRef.current);
    } catch (err) {
      // A 401 means the session really ended: the HTTP client has already signed the user out.
      if (err instanceof NexusApiError && err.httpStatus === 401) return;
      deadlinesRef.current = before;
      setDeadlines(before);
      setStayError('ادامه‌ی نشست ثبت نشد. دوباره تلاش کنید.');
      void resync();
    } finally {
      stayingRef.current = false;
    }
  };

  return (
    <>
      {warnIdle && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4" role="alertdialog" aria-modal="true" aria-labelledby="idle-title" dir="rtl">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl shadow-2xl p-6 text-center space-y-4">
            <div className="mx-auto w-12 h-12 rounded-2xl bg-amber-100 dark:bg-amber-950/50 flex items-center justify-center">
              <Clock className="w-6 h-6 text-amber-600 dark:text-amber-400" />
            </div>
            <h2 id="idle-title" className="text-base font-extrabold text-slate-900 dark:text-white">به‌زودی از سامانه خارج می‌شوید</h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-6">
              به دلیل عدم فعالیت، نشست شما تا
              <span className="mx-1 font-extrabold text-amber-600 dark:text-amber-400 text-sm" aria-live="polite">{formatClock(idleRemaining)}</span>
              دیگر بسته می‌شود.
            </p>
            {stayError && <p className="text-[11px] text-red-600 dark:text-red-400" role="alert">{stayError}</p>}
            <div className="flex gap-2">
              <button type="button" autoFocus onClick={stay} className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer">
                ادامه کار
              </button>
              <button type="button" onClick={onSignOut} className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer flex items-center justify-center gap-1.5">
                <LogOut className="w-3.5 h-3.5" /> خروج
              </button>
            </div>
          </div>
        </div>
      )}

      {warnAbsolute && !warnIdle && !reauth && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[250] max-w-sm w-[calc(100%-2rem)] px-4 py-3 rounded-2xl bg-amber-50 dark:bg-amber-950/80 border border-amber-200 dark:border-amber-800 shadow-lg flex items-start gap-2.5" role="status" dir="rtl">
          <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <p className="text-[11px] leading-5 text-amber-900 dark:text-amber-200">
            مدت مجاز این ورود تا {formatClock(absoluteRemaining)} دیگر به پایان می‌رسد. کارهای خود را ذخیره کنید؛ در پایان، فقط رمز عبور را دوباره وارد می‌کنید.
          </p>
        </div>
      )}

      {reauth && (
        <ReauthDialog
          identifier={identifier}
          onDone={(ok) => {
            reauth.resolve(ok);
            setReauth(null);
            if (ok) void resync();
          }}
          onSignOut={onSignOut}
        />
      )}
    </>
  );
};

/** Password again, in place: the sign-in reached its longest allowed time. */
const ReauthDialog: React.FC<{ identifier: string; onDone: (ok: boolean) => void; onSignOut: () => void }> = ({ identifier, onDone, onSignOut }) => {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // After a wrong password the server wants a CAPTCHA for the next attempt (same rule as the sign-in screen).
  const [captcha, setCaptcha] = useState<LoginCaptcha | null>(null);
  const [captchaAnswer, setCaptchaAnswer] = useState('');

  const loadCaptcha = async () => {
    setCaptchaAnswer('');
    try {
      setCaptcha(await requestLoginCaptcha());
    } catch {
      setCaptcha(null);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!password || busy || (captcha && !captchaAnswer.trim())) return;
    setBusy(true);
    setError(null);
    try {
      await login(identifier, password, captcha ? { captchaId: captcha.captchaId, answer: captchaAnswer } : undefined);
      onDone(true);
    } catch (err) {
      setError(err instanceof SessionLimitError
        ? 'تعداد نشست‌های هم‌زمان شما به سقف رسیده است. از سامانه خارج شوید و دوباره وارد شوید.'
        : userErrorMessage(err, 'ورود دوباره ناموفق بود.'));
      // The CAPTCHA asked for, or the one just used up: a new one.
      const code = err instanceof NexusApiError ? err.code : undefined;
      if ((code && CAPTCHA_ERROR_CODES.includes(code)) || captcha) await loadCaptcha();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[310] flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-labelledby="reauth-title" dir="rtl">
      <form onSubmit={submit} className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl shadow-2xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-indigo-100 dark:bg-indigo-950/50 flex items-center justify-center">
            <KeyRound className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h2 id="reauth-title" className="text-sm font-extrabold text-slate-900 dark:text-white">رمز عبور را دوباره وارد کنید</h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">مدت مجاز این ورود به پایان رسید. صفحه و کارهای نیمه‌تمام شما حفظ می‌شود.</p>
          </div>
        </div>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="رمز عبور"
          autoComplete="current-password"
          className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 dir-ltr text-right"
        />
        {captcha && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <img src={captcha.imageDataUrl} alt="کد امنیتی" width={200} height={70} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white select-none" draggable={false} />
              <button type="button" onClick={loadCaptcha} className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 cursor-pointer">کد جدید</button>
            </div>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={captchaAnswer}
              onChange={(event) => setCaptchaAnswer(event.target.value)}
              placeholder="کد نمایش‌داده‌شده در تصویر"
              className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 dir-ltr text-center tracking-[0.3em]"
            />
          </div>
        )}
        {error && <p className="text-[11px] text-red-600 dark:text-red-400" role="alert">{error}</p>}
        <div className="flex gap-2">
          <button type="submit" disabled={busy || !password || (!!captcha && !captchaAnswer.trim())} className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-bold cursor-pointer flex items-center justify-center gap-1.5">
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} ادامه
          </button>
          <button type="button" onClick={() => { onDone(false); onSignOut(); }} className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer">
            خروج
          </button>
        </div>
      </form>
    </div>
  );
};

