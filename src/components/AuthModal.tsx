import React, { useState } from 'react';
import { CalendarDays, KanbanSquare, MessagesSquare, Network, LogIn, KeyRound, User as UserIcon, AlertCircle, X, Loader2, Eye, EyeOff, CheckCircle2, ArrowRight, Mail, RefreshCw, ShieldCheck } from 'lucide-react';
import { AppTheme } from '../types';
import { completeLoginPB, confirmPasswordResetPB, loginPB, requestPasswordResetPB, verifyPasswordResetCodePB } from '../services/dataService';
import { userErrorMessage } from '../utils/errorMessages';
import { useBranding } from '../utils/branding';
import { CAPTCHA_ERROR_CODES, LoginCaptcha, NexusApiError, SessionLimitChallenge, SessionLimitError, requestLoginCaptcha } from '../services/nexusApi';
import { SessionLimitPicker } from './SessionLimitPicker';


/** Live Jalali date and time on the brand side of the sign-in page. */
const LoginClock: React.FC = () => {
  const [now, setNow] = useState(() => new Date());
  React.useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const time = new Intl.DateTimeFormat('fa-IR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(now);
  const day = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(now);
  return (
    <div className="text-white" dir="rtl">
      <p className="text-4xl font-black tabular-nums" dir="ltr" aria-label="ساعت">{time}</p>
      <p className="mt-1 text-base font-bold">{day}</p>
    </div>
  );
};

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  currentTheme: AppTheme;
  onThemeSelect: (theme: AppTheme) => void;
  canClose?: boolean;
  onOpenResetWithToken?: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  currentTheme,
  onThemeSelect,
  canClose = true,
  onOpenResetWithToken,
}) => {
  const brand = useBranding();
  // Sign-in and password recovery only: accounts are created by an administrator.
  const [mode, setMode] = useState<'login' | 'forgot'>('login');
  
  // Login fields
  const [identity, setIdentity] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // CAPTCHA: shown only once the server asks for one (after a failed sign-in). Each one can be
  // used once; the server checks it, this only displays it.
  const [captcha, setCaptcha] = useState<LoginCaptcha | null>(null);
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [captchaLoading, setCaptchaLoading] = useState(false);

  // Forgot Password: identifier -> SMS code -> new password. The server checks the code; the
  // token it returns for the last step is kept in memory only.
  const [forgotInput, setForgotInput] = useState('');
  const [forgotSuccessMsg, setForgotSuccessMsg] = useState<string | null>(null);
  const [forgotStep, setForgotStep] = useState<'request' | 'code' | 'password'>('request');
  const [forgotInfo, setForgotInfo] = useState<string | null>(null);
  const [resetCode, setResetCode] = useState('');
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');

  // The password was right but the user has as many sessions open as they may: they choose which to close.
  const [limit, setLimit] = useState<SessionLimitChallenge | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCloseModal = () => {
    if (canClose) {
      onClose();
    }
  };

  const loadCaptcha = async () => {
    setCaptchaAnswer('');
    setCaptchaLoading(true);
    try {
      setCaptcha(await requestLoginCaptcha());
    } catch (err: any) {
      setCaptcha(null);
      setErrorMsg(userErrorMessage(err, 'دریافت کد امنیتی ممکن نشد. لطفاً دوباره تلاش کنید.'));
    } finally {
      setCaptchaLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!identity.trim() || !password.trim()) {
      setErrorMsg('لطفاً نام کاربری یا شماره تلفن همراه و رمز عبور را وارد فرمایید.');
      return;
    }
    if (captcha && !captchaAnswer.trim()) {
      setErrorMsg('لطفاً کد امنیتی تصویر را وارد کنید.');
      return;
    }

    setIsLoading(true);
    try {
      const user = await loginPB(
        identity.trim(),
        password,
        captcha ? { captchaId: captcha.captchaId, answer: captchaAnswer } : undefined
      );
      setCaptcha(null);
      setCaptchaAnswer('');
      if (user.theme) {
        onThemeSelect(user.theme);
      }
      onSuccess();
      if (canClose) onClose();
    } catch (err: any) {
      if (err instanceof SessionLimitError) {
        setLimit(err.challenge);
        setPassword('');
        setCaptcha(null);
        setCaptchaAnswer('');
        return;
      }
      setErrorMsg(userErrorMessage(err, 'ورود ناموفق بود. نام کاربری/شماره تلفن یا رمز عبور اشتباه است.'));
      // The server wants a CAPTCHA for the next attempt, or the one just sent is used up.
      const code = err instanceof NexusApiError ? err.code : undefined;
      if ((code && CAPTCHA_ERROR_CODES.includes(code)) || captcha) {
        await loadCaptcha();
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleCompleteLimit = async (closeIds: string[], closeOldest: boolean) => {
    if (!limit) return;
    setErrorMsg(null);
    setIsLoading(true);
    try {
      const user = await completeLoginPB(limit.ticket, closeIds, closeOldest);
      setLimit(null);
      if (user.theme) onThemeSelect(user.theme);
      onSuccess();
      if (canClose) onClose();
    } catch (err: any) {
      setErrorMsg(userErrorMessage(err, 'ورود کامل نشد. دوباره وارد شوید.'));
      // The ticket lasts two minutes and works once: after a failure the user signs in again.
      if (err instanceof NexusApiError && err.httpStatus === 401) setLimit(null);
    } finally {
      setIsLoading(false);
    }
  };

  const resetForgotFlow = () => {
    setForgotStep('request');
    setForgotInfo(null);
    setResetCode('');
    setResetToken(null);
    setNewPassword('');
    setNewPasswordConfirm('');
  };

  const backToLogin = () => {
    setMode('login');
    setErrorMsg(null);
    setForgotSuccessMsg(null);
    resetForgotFlow();
  };

  const handleForgotPassword = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setErrorMsg(null);
    setForgotSuccessMsg(null);

    if (!forgotInput.trim()) {
      setErrorMsg('لطفاً نام کاربری یا شماره تلفن همراه خود را وارد نمایید.');
      return;
    }

    setIsLoading(true);
    try {
      // Same answer whether or not the account exists (the server does not say either).
      setForgotInfo(await requestPasswordResetPB(forgotInput));
      setResetCode('');
      setForgotStep('code');
    } catch (err: unknown) {
      setErrorMsg(userErrorMessage(err, 'ارسال کد بازیابی انجام نشد. لطفاً دوباره تلاش کنید.'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!resetCode.trim()) {
      setErrorMsg('لطفاً کد تأیید پیامک‌شده را وارد کنید.');
      return;
    }

    setIsLoading(true);
    try {
      setResetToken(await verifyPasswordResetCodePB(forgotInput, resetCode));
      setForgotStep('password');
    } catch (err: unknown) {
      setErrorMsg(userErrorMessage(err, 'بررسی کد تأیید انجام نشد. لطفاً دوباره تلاش کنید.'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!resetToken) {
      resetForgotFlow();
      return;
    }

    setIsLoading(true);
    try {
      await confirmPasswordResetPB(resetToken, newPassword, newPasswordConfirm);
      resetForgotFlow();
      setForgotSuccessMsg('رمز عبور شما با موفقیت تغییر کرد. اکنون با رمز جدید وارد شوید.');
    } catch (err: unknown) {
      const code = err instanceof NexusApiError ? err.code : undefined;
      if (code === 'reset_token.invalid') resetForgotFlow();
      setErrorMsg(userErrorMessage(err, 'ثبت رمز عبور جدید انجام نشد. لطفاً دوباره تلاش کنید.'));
    } finally {
      setIsLoading(false);
    }
  };

  const loginLogo = brand.hasCustomLogo ? brand.logo : '/login-logo.jpg';
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto animate-in fade-in duration-200" data-testid="login-page">
      {/* Background: deep green with soft glows and small white lights drifting like stars. */}
      <div aria-hidden="true" className="absolute inset-0 pointer-events-none bg-gradient-to-br from-emerald-950 via-emerald-900 to-slate-950" />
      <div aria-hidden="true" className="absolute -top-32 -start-24 w-[34rem] h-[34rem] rounded-full bg-emerald-500/20 blur-3xl pointer-events-none" />
      <div aria-hidden="true" className="absolute -bottom-40 end-1/4 w-[30rem] h-[30rem] rounded-full bg-lime-400/10 blur-3xl pointer-events-none" />
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0" aria-hidden="true">
        <div className="absolute top-[12%] left-[10%] w-3.5 h-3.5 rounded-full bg-white shadow-[0_0_12px_rgba(255,255,255,0.9)] animate-float-1" />
        <div className="absolute top-[22%] right-[15%] w-5 h-5 rounded-full bg-white/90 shadow-[0_0_14px_rgba(255,255,255,0.9)] animate-float-2" />
        <div className="absolute bottom-[18%] left-[14%] w-4 h-4 rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.95)] animate-float-3" />
        <div className="absolute bottom-[28%] right-[18%] w-3 h-3 rounded-full bg-white/95 shadow-[0_0_8px_rgba(255,255,255,0.9)] animate-float-4" />
        <div className="absolute top-[52%] left-[6%] w-4.5 h-4.5 rounded-full bg-white/90 shadow-[0_0_12px_rgba(255,255,255,0.95)] animate-float-5" />
        <div className="absolute top-[8%] right-[32%] w-3 h-3 rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.9)] animate-float-3" />
        <div className="absolute bottom-[10%] right-[38%] w-5 h-5 rounded-full bg-white/85 shadow-[0_0_14px_rgba(255,255,255,0.85)] animate-float-1" />
        <div className="absolute top-[42%] right-[8%] w-2.5 h-2.5 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.95)] animate-float-4" />
        <div className="absolute bottom-[45%] left-[22%] w-3.5 h-3.5 rounded-full bg-white/95 shadow-[0_0_10px_rgba(255,255,255,0.9)] animate-float-2" />
        <div className="absolute top-[30%] left-[38%] w-2.5 h-2.5 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.9)] animate-float-5" />
        <div className="absolute bottom-[15%] left-[45%] w-4 h-4 rounded-full bg-white/90 shadow-[0_0_12px_rgba(255,255,255,0.95)] animate-float-1" />
        <div className="absolute top-[75%] right-[25%] w-3 h-3 rounded-full bg-white shadow-[0_0_9px_rgba(255,255,255,0.9)] animate-float-3" />
      </div>

      <div className="relative min-h-full flex flex-col lg:flex-row">
        {/* The sign-in side (on the right in RTL) */}
        <main className="flex-1 flex items-center justify-center p-4 sm:p-8 lg:flex-none lg:w-[46%]">
          <div className="relative z-10 w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-white/60 dark:border-slate-800 overflow-hidden text-right flex flex-col">
            <div className="relative px-6 pt-8 pb-3 text-center shrink-0">
              {canClose && (
                <button
                  type="button"
                  onClick={handleCloseModal}
                  aria-label="بستن"
                  className="absolute left-4 top-4 p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
              <img src={loginLogo} alt="لوگو" className="lg:hidden mx-auto mb-3 w-20 h-20 object-contain" />
              <div className="mx-auto w-16 h-16 rounded-full bg-gradient-to-br from-emerald-600 to-emerald-800 text-white flex items-center justify-center shadow-lg shadow-emerald-900/20">
                <UserIcon className="w-8 h-8" />
              </div>
              <h1 className="mt-4 text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">{mode === 'forgot' ? 'بازیابی رمز عبور' : 'ورود به سیستم'}</h1>
              <h2 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-1">{brand.name}</h2>
            </div>

            <div className="p-6 pt-3">
          {errorMsg && (
            <div className="mb-4 p-3 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 rounded-xl text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2 animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              <span className="leading-relaxed">{errorMsg}</span>
            </div>
          )}

          {mode === 'login' && limit ? (
            <SessionLimitPicker
              challenge={limit}
              busy={isLoading}
              error={errorMsg}
              onConfirm={handleCompleteLimit}
              onCancel={() => { setLimit(null); setErrorMsg(null); }}
            />
          ) : mode === 'login' ? (
            /* Login Form */
            <form onSubmit={handleLogin} className="app-form space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  نام کاربری یا شماره تلفن همراه
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={identity}
                    onChange={(e) => setIdentity(e.target.value)}
                    placeholder="نام کاربری یا ۰۹۱۲۳۴۵۶۷۸۹"
                    autoComplete="username"
                    className="w-full pl-3 pr-10 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all dir-ltr text-right"
                    required
                  />
                  <UserIcon className="w-4 h-4 absolute right-3 top-3 text-slate-400" />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    رمز عبور
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setMode('forgot');
                      setErrorMsg(null);
                      setForgotSuccessMsg(null);
                      if (identity.trim()) {
                        setForgotInput(identity.trim());
                      }
                    }}
                    className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 dark:hover:text-emerald-300 hover:underline cursor-pointer transition-colors"
                  >
                    فراموشی رمز عبور؟
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-9 pr-10 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all dir-ltr text-right"
                    required
                  />
                  <KeyRound className="w-4 h-4 absolute right-3 top-3 text-slate-400" />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute left-3 top-2.5 p-0.5 text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 cursor-pointer transition-colors"
                    title={showPassword ? 'پنهان کردن رمز' : 'مشاهده رمز'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {(captcha || captchaLoading) && (
                <div className="p-3 rounded-2xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/70 space-y-2 animate-in fade-in">
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                    <ShieldCheck className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    <span>کد امنیتی تصویر را وارد کنید</span>
                  </label>
                  <div className="flex items-center gap-2">
                    {captcha ? (
                      <img
                        src={captcha.imageDataUrl}
                        alt="کد امنیتی"
                        width={200}
                        height={70}
                        className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white select-none"
                        draggable={false}
                      />
                    ) : (
                      <div className="w-[200px] h-[70px] rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                        <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={loadCaptcha}
                      disabled={captchaLoading || isLoading}
                      className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-white dark:hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-50"
                      title="دریافت کد جدید"
                    >
                      <RefreshCw className={`w-4 h-4 ${captchaLoading ? 'animate-spin' : ''}`} />
                    </button>
                  </div>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={captchaAnswer}
                    onChange={(e) => setCaptchaAnswer(e.target.value)}
                    placeholder="کد نمایش‌داده‌شده در تصویر"
                    className="w-full px-3 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all dir-ltr text-center tracking-[0.3em]"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading || captchaLoading || (!!captcha && !captchaAnswer.trim())}
                className="w-full mt-2 py-3 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>در حال بررسی...</span>
                  </>
                ) : (
                  <>
                    <LogIn className="w-4 h-4" />
                    <span>ورود به سیستم</span>
                  </>
                )}
              </button>
            </form>
          ) : (
            /* Forgot Password Form */
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
                <KeyRound className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  بازیابی رمز عبور
                </h3>
              </div>

              {forgotSuccessMsg ? (
                <div className="p-4 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-2xl text-xs text-emerald-800 dark:text-emerald-200 space-y-3">
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                    <p className="leading-relaxed font-medium">{forgotSuccessMsg}</p>
                  </div>
                  <button
                    type="button"
                    onClick={backToLogin}
                    className="w-full mt-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-sm transition-all cursor-pointer flex items-center justify-center gap-2"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    <span>بازگشت به صفحه ورود</span>
                  </button>
                </div>
              ) : forgotStep === 'request' ? (
                <form onSubmit={handleForgotPassword} className="app-form space-y-4">
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    نام کاربری یا شماره تلفن همراه ثبت‌شده را وارد نمایید. کد تأیید به شماره تلفن همراه ثبت‌شده برای حساب شما پیامک خواهد شد.
                  </p>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      نام کاربری یا شماره تلفن همراه
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={forgotInput}
                        onChange={(e) => setForgotInput(e.target.value)}
                        placeholder={'مثلاً: user123 یا ۰۹۱۲۳۴۵۶۷۸۹'}
                        className="w-full pl-3 pr-10 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all dir-ltr text-right"
                        required
                      />
                      <UserIcon className="w-4 h-4 absolute right-3 top-3 text-slate-400" />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>در حال ارسال کد...</span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4" />
                        <span>ارسال کد تأیید</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={backToLogin}
                    className="w-full py-2 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                    <span>انصراف و بازگشت به ورود</span>
                  </button>
                </form>
              ) : forgotStep === 'code' ? (
                <form onSubmit={handleVerifyCode} className="app-form space-y-4">
                  {forgotInfo && (
                    <div className="p-3 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-2xl text-xs text-emerald-800 dark:text-emerald-200 flex items-start gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                      <p className="leading-relaxed font-medium">{forgotInfo}</p>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      کد تأیید پیامک‌شده
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        value={resetCode}
                        onChange={(e) => setResetCode(e.target.value)}
                        placeholder={'مثلاً: ۱۲۳۴۵۶'}
                        className="w-full pl-3 pr-10 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all dir-ltr text-right"
                        required
                      />
                      <KeyRound className="w-4 h-4 absolute right-3 top-3 text-slate-400" />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>در حال بررسی...</span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4" />
                        <span>بررسی کد</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={() => handleForgotPassword()}
                    className="w-full py-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline transition-colors cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>ارسال مجدد کد</span>
                  </button>

                  <button
                    type="button"
                    onClick={backToLogin}
                    className="w-full py-2 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                    <span>انصراف و بازگشت به ورود</span>
                  </button>
                </form>
              ) : (
                <form onSubmit={handleSetNewPassword} className="app-form space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      رمز عبور جدید
                    </label>
                    <div className="relative">
                      <input
                        type="password"
                        autoComplete="new-password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder={'حداقل ۸ کاراکتر'}
                        className="w-full pl-3 pr-10 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all dir-ltr text-right"
                        required
                      />
                      <KeyRound className="w-4 h-4 absolute right-3 top-3 text-slate-400" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      تکرار رمز عبور جدید
                    </label>
                    <div className="relative">
                      <input
                        type="password"
                        autoComplete="new-password"
                        value={newPasswordConfirm}
                        onChange={(e) => setNewPasswordConfirm(e.target.value)}
                        className="w-full pl-3 pr-10 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all dir-ltr text-right"
                        required
                      />
                      <KeyRound className="w-4 h-4 absolute right-3 top-3 text-slate-400" />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>در حال ثبت...</span>
                      </>
                    ) : (
                      <>
                        <KeyRound className="w-4 h-4" />
                        <span>ثبت رمز عبور جدید</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={backToLogin}
                    className="w-full py-2 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                    <span>انصراف و بازگشت به ورود</span>
                  </button>
                </form>
              )}
            </div>
          )}

          {/* Company Footer Info */}
          <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 text-center space-y-1">
            <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
              تهیه شده توسط شرکت مدیریت پروژه پارس
            </p>
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 flex items-center justify-center gap-2 dir-ltr">
              <span>پشتیبانی: ۸۸۷۳۱۶۰۱</span>
              <span className="text-slate-300 dark:text-slate-700">|</span>
              <span>info@parspmi.ir</span>
            </p>
          </div>
            </div>
          </div>
        </main>

        {/* The brand side (on the left in RTL) */}
        <aside className="hidden lg:flex flex-1 flex-col items-center justify-center gap-5 px-10 py-12 text-center" data-testid="login-brand">
          <div className="w-56 h-56 rounded-full bg-white shadow-2xl shadow-black/30 ring-8 ring-white/15 flex items-center justify-center overflow-hidden">
            <img src={loginLogo} alt="لوگوی سامانه" className="w-44 h-44 object-contain" />
          </div>
          <div>
            <p className="text-5xl text-white leading-tight drop-shadow-sm" style={{ fontFamily: "'Lalezar', 'Vazirmatn Variable', sans-serif" }}>{brand.name}</p>
            <p className="mt-1 text-sm font-semibold text-emerald-100/80">سامانه یکپارچه وظایف، جلسات و ساختار سازمانی</p>
          </div>
          <LoginClock />
          <div className="grid grid-cols-2 gap-3 w-full max-w-md">
            {[
              { icon: KanbanSquare, title: 'مدیریت وظایف', text: 'برد کانبان و ماتریس اولویت' },
              { icon: CalendarDays, title: 'تقویم و جلسات', text: 'برنامه‌ریزی و پیگیری مصوبات' },
              { icon: Network, title: 'ساختار سازمانی', text: 'چارت، پست و جانشینی' },
              { icon: MessagesSquare, title: 'گفتگوی تیمی', text: 'ارتباط بر پایه سلسله‌مراتب' },
            ].map(({ icon: Icon, title, text }) => (
              <div key={title} className="flex items-center gap-3 rounded-2xl bg-white/10 backdrop-blur border border-white/15 shadow-sm px-3 py-2.5 text-right">
                <span className="w-10 h-10 rounded-xl bg-white/10 text-emerald-200 flex items-center justify-center shrink-0"><Icon className="w-5 h-5" /></span>
                <span className="min-w-0">
                  <span className="block text-sm font-extrabold text-white">{title}</span>
                  <span className="block text-[11px] text-emerald-100/70 truncate">{text}</span>
                </span>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
};
