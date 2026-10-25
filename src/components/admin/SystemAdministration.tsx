import React, { useEffect, useState } from 'react';
import { Smartphone, MessageSquare, Users, History, Network, KeyRound, Loader2, Save, User as UserIcon, Palette, FileText, UploadCloud, Building2, BadgeCheck } from 'lucide-react';
import { getKnownPermissions, getMyPermissions, changeMyPassword, requestPhoneChange, confirmPhoneChange, fetchUploadPolicy, updateMaxUploadSizeKb } from '../../services/nexusApi';
import { AdminCard, SegmentedTabs, PillTabs, TabItem, Field, inputClass, Notice, PrimaryButton } from './AdminUi';
import { UsersPanel } from './UsersPanel';
import { LoginHistoryPanel } from './LoginHistoryPanel';
import { LdapPanel } from './LdapPanel';
import { SsoPreparationPanel } from './SsoPreparationPanel';
import { SmsPanel } from './SmsPanel';
import { userErrorMessage } from '../../utils/errorMessages';
import { refreshUploadPolicy } from '../../utils/uploadPolicy';
import { isOrgStructureAvailable, orgStructureLookupKey, ORG_STRUCTURE_PERMISSIONS, ORG_UNIT_PERMISSIONS, TITLE_PERMISSIONS } from '../../services/orgStructureApi';
import { useLookup } from '../../utils/lookupCache';
import { OrgStructureSection } from './orgStructure/OrgStructureSection';
import { TitlesPanel } from './orgStructure/TitlesPanel';
import { canSeeWorkTeams } from '../../utils/permissions';

type MainTab = 'profile' | 'team' | 'appearance' | 'help' | 'sms' | 'users' | 'org';
type UsersTab = 'list' | 'titles' | 'history' | 'ldap' | 'sso';

/**
 * Permission names the signed-in user holds: those saved at sign-in at once (so menus do not
 * appear a moment late), then the server's current ones. Null only while none are known yet.
 * The server re-checks every call.
 */
export function useMyPermissions(userId: string | undefined): Set<string> | null {
  const [permissions, setPermissions] = useState<Set<string> | null>(() => {
    const known = userId ? getKnownPermissions(userId) : null;
    return known ? new Set(known) : null;
  });
  useEffect(() => {
    if (!userId) { setPermissions(new Set()); return; }
    let alive = true;
    const known = getKnownPermissions(userId);
    if (known) setPermissions(new Set(known));
    getMyPermissions()
      .then((names) => alive && setPermissions(new Set(names)))
      .catch(() => alive && setPermissions((current) => current ?? new Set()));
    return () => { alive = false; };
  }, [userId]);
  return permissions;
}

/**
 * Whether the backend has the organization-structure module (companies, positions, managers).
 * Products without it answer 404 and the «ساختار سازمانی» tab never appears. The last answer
 * is shown at once and checked again in the background.
 */
function useOrgStructureAvailable(userId: string | undefined): { available: boolean; known: boolean } {
  const { value, known } = useLookup(userId ? orgStructureLookupKey(userId) : null, isOrgStructureAvailable, false);
  return { available: value, known };
}

/** «مدیریت کاربران» with its sub-tabs: users, sign-in history and LDAP. */
const UserManagementSection: React.FC<{ currentUserId: string; can: (p: string) => boolean; orgStructureAvailable: boolean }> = ({ currentUserId, can, orgStructureAvailable }) => {
  const tabs: TabItem<UsersTab>[] = [
    ...(can('users.view') ? [{ id: 'list' as const, label: 'مدیریت کاربران', icon: Users }] : []),
    // Titles before names come with the organization-structure module; whoever may add users manages them.
    ...(orgStructureAvailable && can(TITLE_PERMISSIONS.manage) ? [{ id: 'titles' as const, label: 'عنوان‌ها', icon: BadgeCheck }] : []),
    ...(can('audit_logs.view') ? [{ id: 'history' as const, label: 'تاریخچه ورود', icon: History }] : []),
    ...(can('ldap_settings.view') ? [{ id: 'ldap' as const, label: 'LDAP', icon: Network }] : []),
    ...(can('sso_settings.view') ? [{ id: 'sso' as const, label: 'ورود با SSO', icon: KeyRound }] : []),
  ];
  const [active, setActive] = useState<UsersTab>(tabs[0]?.id ?? 'list');
  const current = tabs.some((t) => t.id === active) ? active : tabs[0]?.id;

  return (
    <div className="space-y-4">
      <PillTabs tabs={tabs} active={current ?? 'list'} onChange={setActive} />
      {current === 'list' && (
        <UsersPanel
          currentUserId={currentUserId}
          rights={{
            create: can('users.create'),
            update: can('users.update'),
            changeStatus: can('users.change_status'),
            assignRoles: can('users.assign_roles'),
            assignPermissions: can('users.assign_permissions'),
          }}
          orgStructureAvailable={orgStructureAvailable}
          canManageOrgAssignments={can(ORG_STRUCTURE_PERMISSIONS.manageAssignments)}
          canSeeOrgUnits={can(ORG_UNIT_PERMISSIONS.view)}
        />
      )}
      {current === 'titles' && <TitlesPanel />}
      {current === 'history' && <LoginHistoryPanel />}
      {current === 'ldap' && <LdapPanel canUpdate={can('ldap_settings.update')} canTest={can('ldap_settings.test')} />}
      {current === 'sso' && <SsoPreparationPanel />}
    </div>
  );
};

/** The signed-in user's own password change (the system administrator included). */
/** Mirrors the server's rule (PasswordRules): 10+ characters of at least three kinds. The server decides; this only saves a trip. */
const PASSWORD_RULE = 'رمز عبور باید حداقل ۱۰ کاراکتر باشد و دست‌کم از سه نوع کاراکتر (حرف کوچک، حرف بزرگ، رقم، نماد) تشکیل شود.';

function isStrongPassword(value: string): boolean {
  if (value.length < 10 || value.length > 128) return false;
  const kinds = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((pattern) => pattern.test(value)).length;
  return kinds >= 3;
}

export const ChangePasswordCard: React.FC = () => {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    if (!isStrongPassword(next)) { setMessage({ type: 'error', text: PASSWORD_RULE }); return; }
    if (next !== repeat) { setMessage({ type: 'error', text: 'تکرار رمز عبور جدید با آن یکسان نیست.' }); return; }
    setBusy(true);
    try {
      await changeMyPassword(current, next);
      setCurrent(''); setNext(''); setRepeat('');
      setMessage({ type: 'success', text: 'رمز عبور شما تغییر کرد.' });
    } catch (err: any) {
      setMessage({ type: 'error', text: userErrorMessage(err, 'تغییر رمز عبور انجام نشد.') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminCard className="p-5 sm:p-6">
      <form onSubmit={submit} className="space-y-4">
        <div className="flex items-center gap-2">
          <KeyRound className="w-5 h-5 text-indigo-700 dark:text-indigo-400" />
          <h3 className="text-base font-extrabold text-slate-900 dark:text-white">تغییر رمز عبور</h3>
        </div>
        {message && <Notice type={message.type} onClose={() => setMessage(null)}>{message.text}</Notice>}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="رمز عبور فعلی" required>
            <input type="password" className={`${inputClass} dir-ltr text-right`} value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
          </Field>
          <Field label="رمز عبور جدید" required hint="حداقل ۱۰ کاراکتر، ترکیبی از حروف، ارقام و نماد">
            <input type="password" className={`${inputClass} dir-ltr text-right`} value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" required />
          </Field>
          <Field label="تکرار رمز عبور جدید" required>
            <input type="password" className={`${inputClass} dir-ltr text-right`} value={repeat} onChange={(e) => setRepeat(e.target.value)} autoComplete="new-password" required />
          </Field>
        </div>
        <div className="flex justify-end">
          <PrimaryButton type="submit" disabled={busy}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>تغییر رمز عبور</span>
          </PrimaryButton>
        </div>
      </form>
    </AdminCard>
  );
};

/**
 * Changing the mobile number (the number a forgotten password is recovered through): the current
 * password and the new number first, then the code that arrives on the NEW number. The number
 * changes only after both, and the person's other sign-ins end.
 */
export const ChangePhoneCard: React.FC<{ currentPhone?: string; onChanged?: () => void | Promise<void> }> = ({ currentPhone, onChanged }) => {
  const [newPhone, setNewPhone] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const sendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setBusy(true);
    try {
      const answer = await requestPhoneChange(newPhone, password);
      setSent(true);
      setMessage({ type: 'success', text: `${answer.message} کد تا ${Math.ceil(answer.expiresInSeconds / 60)} دقیقه معتبر است.` });
    } catch (err: any) {
      setMessage({ type: 'error', text: userErrorMessage(err, 'ارسال کد تأیید انجام نشد.') });
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setBusy(true);
    try {
      await confirmPhoneChange(newPhone, code, password);
      setNewPhone(''); setPassword(''); setCode(''); setSent(false);
      setMessage({ type: 'success', text: 'شماره موبایل شما تغییر کرد. نشست‌های دیگر شما بسته شد.' });
      await onChanged?.();
    } catch (err: any) {
      setMessage({ type: 'error', text: userErrorMessage(err, 'تغییر شماره موبایل انجام نشد.') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminCard className="p-5 sm:p-6">
      <form onSubmit={sent ? confirm : sendCode} className="space-y-4">
        <div className="flex items-center gap-2">
          <Smartphone className="w-5 h-5 text-indigo-700 dark:text-indigo-400" />
          <h3 className="text-base font-extrabold text-slate-900 dark:text-white">تغییر شماره موبایل</h3>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          شماره فعلی: <span className="font-mono dir-ltr">{currentPhone || '—'}</span>. شماره موبایل برای بازیابی رمز عبور استفاده می‌شود، بنابراین تغییر آن به رمز عبور فعلی و کدی نیاز دارد که به شماره‌ی جدید پیامک می‌شود.
        </p>
        {message && <Notice type={message.type} onClose={() => setMessage(null)}>{message.text}</Notice>}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="شماره موبایل جدید" required>
            <input type="tel" className={`${inputClass} dir-ltr text-right`} value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="09121234567" disabled={sent} required />
          </Field>
          <Field label="رمز عبور فعلی" required>
            <input type="password" className={`${inputClass} dir-ltr text-right`} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          </Field>
          {sent && (
            <Field label="کد تأیید پیامک‌شده" required>
              <input type="text" inputMode="numeric" className={`${inputClass} dir-ltr text-right`} value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" required />
            </Field>
          )}
        </div>
        <div className="flex justify-end gap-2">
          {sent && (
            <button type="button" onClick={() => { setSent(false); setCode(''); setMessage(null); }} className="px-4 py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">
              شماره‌ی دیگر
            </button>
          )}
          <PrimaryButton type="submit" disabled={busy}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>{sent ? 'تأیید و تغییر شماره' : 'ارسال کد تأیید'}</span>
          </PrimaryButton>
        </div>
      </form>
    </AdminCard>
  );
};

/** Admin-only (settings.update): the system-wide max upload file size, in KB. */
const UploadSizeSettingsCard: React.FC = () => {
  const [valueKb, setValueKb] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    fetchUploadPolicy()
      .then((policy) => { if (alive) setValueKb(String(policy.maxFileSizeKb)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const kb = Number(valueKb);
    if (!Number.isFinite(kb) || kb <= 0) {
      setMessage({ type: 'error', text: 'مقدار وارد شده معتبر نیست.' });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      await updateMaxUploadSizeKb(kb);
      // Apply the new limit to this open app right away, not only after a reload.
      await refreshUploadPolicy();
      setMessage({ type: 'success', text: 'حداکثر حجم فایل آپلودی ذخیره شد.' });
    } catch (err: any) {
      setMessage({ type: 'error', text: userErrorMessage(err, 'ذخیره تنظیمات با خطا مواجه شد.') });
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminCard className="p-5 sm:p-6">
      <form onSubmit={submit} className="space-y-4">
        <div className="flex items-center gap-2">
          <UploadCloud className="w-5 h-5 text-indigo-700 dark:text-indigo-400" />
          <h3 className="text-base font-extrabold text-slate-900 dark:text-white">محدودیت حجم فایل آپلودی</h3>
        </div>
        {message && <Notice type={message.type} onClose={() => setMessage(null)}>{message.text}</Notice>}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <Field label="حداکثر حجم مجاز (کیلوبایت)" hint="پیش‌فرض: ۲۰۰ کیلوبایت">
            <input
              type="number"
              min={1}
              className={inputClass}
              value={valueKb}
              onChange={(e) => setValueKb(e.target.value)}
              disabled={loading}
            />
          </Field>
          <PrimaryButton type="submit" disabled={saving || loading}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>ذخیره</span>
          </PrimaryButton>
        </div>
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          این مقدار برای بارگذاری فایل در فعالیت‌ها، گفتگو و یادداشت‌ها در کل سامانه اعمال می‌شود.
        </p>
      </form>
    </AdminCard>
  );
};

/**
 * «تنظیمات سامانه»: the header card with the main tabs. Profile / Team / Appearance / Help are
 * always-present personal-settings tabs; SMS panel and user management appear by permission.
 */
export const SystemAdministration: React.FC<{
  currentUserId?: string;
  profile: React.ReactNode;
  team: React.ReactNode;
  appearance: React.ReactNode;
  help: React.ReactNode;
}> = ({ currentUserId, profile, team, appearance, help }) => {
  const permissions = useMyPermissions(currentUserId);
  const can = (p: string) => !!permissions?.has(p);
  const { available: orgStructureAvailable, known: orgStructureKnown } = useOrgStructureAvailable(currentUserId);
  // Until what the user may see is known, a placeholder instead of a partial row of tabs.
  const tabsReady = permissions !== null && orgStructureKnown;
  const [active, setActive] = useState<MainTab>('profile');

  const tabs: TabItem<MainTab>[] = [
    { id: 'profile', label: 'پروفایل', icon: UserIcon },
    // Only for people given the work-team permissions; nobody else sees the tab.
    ...(canSeeWorkTeams(permissions) ? [{ id: 'team' as const, label: 'مدیریت تیم کاری', icon: Users }] : []),
    { id: 'appearance', label: 'ظاهر سامانه', icon: Palette },
    { id: 'help', label: 'راهنما', icon: FileText },
    ...(can('sms_settings.view') ? [{ id: 'sms' as const, label: 'پنل پیامکی', icon: MessageSquare }] : []),
    ...(can('users.view') || can('audit_logs.view') || can('ldap_settings.view') || can('sso_settings.view')
      ? [{ id: 'users' as const, label: 'مدیریت کاربران', icon: Users }] : []),
    ...(orgStructureAvailable ? [{ id: 'org' as const, label: 'ساختار سازمانی', icon: Building2 }] : []),
  ];
  const current = tabs.some((t) => t.id === active) ? active : 'profile';

  return (
    <div className="w-full space-y-5" dir="rtl">
      {/* The page's title, and under it its main tabs from the start (right) edge; each tab's own
          sub-tabs come below, in the page itself. */}
      <AdminCard className="p-5 sm:p-6 space-y-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">تنظیمات سامانه</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">تنظیمات شخصی، پنل پیامکی و مدیریت کاربران سامانه</p>
        </div>
        {!tabsReady ? (
          <div className="h-[52px] rounded-2xl bg-slate-100/80 dark:bg-slate-800/70 animate-pulse" aria-hidden="true" />
        ) : tabs.length > 1 && <SegmentedTabs tabs={tabs} active={current} onChange={setActive} />}
      </AdminCard>

      {current === 'profile' && profile}
      {current === 'team' && canSeeWorkTeams(permissions) && team}
      {current === 'appearance' && (
        <div className="space-y-5">
          {can('settings.update') && <UploadSizeSettingsCard />}
          {appearance}
        </div>
      )}
      {current === 'help' && help}
      {current === 'sms' && <SmsPanel canUpdate={can('sms_settings.update')} canTest={can('sms_settings.test')} />}
      {current === 'users' && currentUserId && <UserManagementSection currentUserId={currentUserId} can={can} orgStructureAvailable={orgStructureAvailable} />}
      {current === 'org' && <OrgStructureSection can={can} />}
    </div>
  );
};
