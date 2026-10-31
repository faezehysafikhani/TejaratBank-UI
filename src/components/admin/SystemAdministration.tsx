import React, { useEffect, useId, useState } from 'react';
import { MessageSquare, Users, History, Network, KeyRound, Loader2, Save, User as UserIcon, Palette, FileText, UploadCloud, Building2, BadgeCheck, ShieldCheck, Image as ImageIcon, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';
import { getKnownPermissions, getMyPermissions, changeMyPassword, fetchUploadPolicy, updateMaxUploadSizeKb } from '../../services/nexusApi';
import { AdminCard, SegmentedTabs, PillTabs, TabItem, Field, inputClass, Notice, PrimaryButton } from './AdminUi';
import { UsersPanel } from './UsersPanel';
import { RolesPanel } from './RolesPanel';
import { LoginHistoryPanel } from './LoginHistoryPanel';
import { LdapPanel } from './LdapPanel';
import { SsoPreparationPanel } from './SsoPreparationPanel';
import { SmsPanel } from './SmsPanel';
import { userErrorMessage } from '../../utils/errorMessages';
import { refreshUploadPolicy } from '../../utils/uploadPolicy';
import { isOrgStructureAvailable, orgStructureLookupKey, ORG_STRUCTURE_PERMISSIONS, ORG_UNIT_PERMISSIONS, TITLE_PERMISSIONS } from '../../services/orgStructureApi';
import { useLookup } from '../../utils/lookupCache';
import { OrgStructureSection } from './orgStructure/OrgStructureSection';
import { MyPlacementPanel } from './orgStructure/OrgViews';
import { TitlesPanel } from './orgStructure/TitlesPanel';
import { canSeeWorkTeams } from '../../utils/permissions';
import { DEFAULT_SYSTEM_NAME, saveBranding, useBranding } from '../../utils/branding';

type MainTab = 'profile' | 'team' | 'appearance' | 'help' | 'sms' | 'users' | 'org';
type UsersTab = 'list' | 'roles' | 'titles' | 'history' | 'ldap' | 'sso';

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

/** «مدیریت کاربران» with its sub-tabs: users, roles, titles, sign-in history, LDAP and SSO. */
const UserManagementSection: React.FC<{ currentUserId: string; can: (p: string) => boolean; orgStructureAvailable: boolean }> = ({ currentUserId, can, orgStructureAvailable }) => {
  const tabs: TabItem<UsersTab>[] = [
    ...(can('users.view') ? [{ id: 'list' as const, label: 'مدیریت کاربران', icon: Users }] : []),
    ...(can('roles.view') ? [{ id: 'roles' as const, label: 'نقش‌ها', icon: ShieldCheck }] : []),
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
      {current === 'roles' && (
        <RolesPanel rights={{ create: can('roles.create'), update: can('roles.update'), assignPermissions: can('roles.assign_permissions') }} />
      )}
      {current === 'titles' && <TitlesPanel />}
      {current === 'history' && <LoginHistoryPanel />}
      {current === 'ldap' && <LdapPanel canUpdate={can('ldap_settings.update')} canTest={can('ldap_settings.test')} />}
      {current === 'sso' && <SsoPreparationPanel />}
    </div>
  );
};

/** The signed-in user's own password change (the system administrator included). */
export const ChangePasswordCard: React.FC = () => {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    if (next.length < 8) { setMessage({ type: 'error', text: 'رمز عبور جدید باید حداقل ۸ کاراکتر باشد.' }); return; }
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
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(value => !value)}
        className={`w-full flex items-center justify-between text-slate-900 dark:text-white font-bold text-sm select-none cursor-pointer group ${open ? 'pb-3 border-b border-slate-100 dark:border-slate-800' : ''}`}
      >
        <span className="flex items-center gap-2">
          <KeyRound className="w-5 h-5 text-indigo-600 dark:text-indigo-400 group-hover:scale-110 transition-transform" />
          <span>تغییر رمز عبور</span>
        </span>
        {open ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
      </button>
      <div id={panelId} hidden={!open}>
      <form onSubmit={submit} className="space-y-4 pt-4">
        {message && <Notice type={message.type} onClose={() => setMessage(null)}>{message.text}</Notice>}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="رمز عبور فعلی" required>
            <input type="password" className={`${inputClass} dir-ltr text-right`} value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
          </Field>
          <Field label="رمز عبور جدید" required hint="حداقل ۸ کاراکتر">
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
      </div>
    </AdminCard>
  );
};

/** Admin-only (settings.update): the system-wide max upload file size, in KB. */
const BRAND_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/x-icon', 'image/vnd.microsoft.icon'];
const BRAND_IMAGE_MAX_KB = 512;

/** One image of the branding: what is shown now, a new file to upload, or back to the default. */
const BrandImageField: React.FC<{
  label: string;
  hint: string;
  current: string;
  isCustom: boolean;
  file: File | null;
  remove: boolean;
  onFile: (file: File | null) => void;
  onRemove: () => void;
  onError: (text: string) => void;
}> = ({ label, hint, current, isCustom, file, remove, onFile, onRemove, onError }) => {
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const shown = preview || (remove ? null : current);
  const pick = (picked: File | undefined) => {
    if (!picked) return;
    const byName = /\.(png|jpe?g|webp|ico)$/i.test(picked.name);
    if (!byName && !BRAND_IMAGE_TYPES.includes(picked.type)) {
      onError('تصویر باید PNG، JPEG، WebP یا ICO باشد.');
      return;
    }
    if (picked.size > BRAND_IMAGE_MAX_KB * 1024) {
      onError('حجم تصویر حداکثر ۵۱۲ کیلوبایت است.');
      return;
    }
    onFile(picked);
  };
  return (
    <div className="space-y-2">
      <span className="block text-xs font-bold text-slate-700 dark:text-slate-300">{label}</span>
      <div className="flex items-center gap-3">
        <div className="w-16 h-16 shrink-0 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex items-center justify-center overflow-hidden">
          {shown ? <img src={shown} alt={label} className="w-full h-full object-contain" /> : <span className="text-[10px] text-slate-400 text-center px-1">پیش‌فرض</span>}
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer">
            <UploadCloud className="w-3.5 h-3.5" /> انتخاب تصویر
            <input type="file" accept=".png,.jpg,.jpeg,.webp,.ico,image/png,image/jpeg,image/webp,image/x-icon" className="hidden"
              onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
          {(isCustom || file) && !remove && (
            <button type="button" onClick={onRemove} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer">
              <RotateCcw className="w-3.5 h-3.5" /> برگرداندن به پیش‌فرض
            </button>
          )}
        </div>
      </div>
      <p className="text-[11px] text-slate-500 dark:text-slate-400">{hint}</p>
    </div>
  );
};

/** «نام و لوگوی سامانه»: what everyone sees - the sign-in page too - next to the logo and in the browser tab. */
const BrandingSettingsCard: React.FC = () => {
  const brand = useBranding();
  const [name, setName] = useState(brand.customName || '');
  const [logo, setLogo] = useState<File | null>(null);
  const [favicon, setFavicon] = useState<File | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [removeFavicon, setRemoveFavicon] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  // The name loads after the page opens; take it once it is known, unless already edited.
  const [touched, setTouched] = useState(false);
  useEffect(() => { if (!touched) setName(brand.customName || ''); }, [brand.customName, touched]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length > 60) {
      setMessage({ type: 'error', text: 'نام سامانه حداکثر ۶۰ کاراکتر است.' });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      await saveBranding({ systemName: name, logo, favicon, removeLogo, removeFavicon });
      setLogo(null); setFavicon(null); setRemoveLogo(false); setRemoveFavicon(false); setTouched(false);
      setMessage({ type: 'success', text: 'نام و لوگوی سامانه ذخیره شد و برای همهٔ کاربران اعمال شد.' });
    } catch (err: any) {
      setMessage({ type: 'error', text: userErrorMessage(err, 'ذخیرهٔ نام و لوگوی سامانه انجام نشد.') });
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminCard className="p-5 sm:p-6">
      <form onSubmit={submit} className="space-y-4">
        <div className="flex items-center gap-2">
          <ImageIcon className="w-5 h-5 text-indigo-700 dark:text-indigo-400" />
          <h3 className="text-base font-extrabold text-slate-900 dark:text-white">نام و لوگوی سامانه</h3>
        </div>
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          برای همهٔ کاربران و صفحهٔ ورود اعمال می‌شود: نام کنار لوگو و در عنوان تب مرورگر، لوگوی بالای صفحه و گزارش‌ها، و آیکون تب مرورگر.
        </p>
        {message && <Notice type={message.type} onClose={() => setMessage(null)}>{message.text}</Notice>}
        <Field label="نام سامانه" hint={`خالی بگذارید تا «${DEFAULT_SYSTEM_NAME}» نمایش داده شود. حداکثر ۶۰ کاراکتر.`}>
          <input className={inputClass} value={name} maxLength={60} placeholder={DEFAULT_SYSTEM_NAME}
            onChange={(e) => { setName(e.target.value); setTouched(true); }} />
        </Field>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <BrandImageField
            label="لوگوی سامانه"
            hint="PNG، JPEG، WebP یا ICO، حداکثر ۵۱۲ کیلوبایت. تصویر مربعی بهتر نمایش داده می‌شود."
            current={brand.logo} isCustom={brand.hasCustomLogo}
            file={logo} remove={removeLogo}
            onFile={(f) => { setLogo(f); setRemoveLogo(false); setMessage(null); }}
            onRemove={() => { setLogo(null); setRemoveLogo(true); }}
            onError={(text) => setMessage({ type: 'error', text })}
          />
          <BrandImageField
            label="آیکون تب مرورگر"
            hint="PNG یا ICO مربعی (مثلاً ۶۴×۶۴). اگر تعیین نشود، لوگوی سامانه روی تب نمایش داده می‌شود."
            current={brand.favicon} isCustom={brand.hasCustomFavicon}
            file={favicon} remove={removeFavicon}
            onFile={(f) => { setFavicon(f); setRemoveFavicon(false); setMessage(null); }}
            onRemove={() => { setFavicon(null); setRemoveFavicon(true); }}
            onError={(text) => setMessage({ type: 'error', text })}
          />
        </div>
        <div className="flex justify-end">
          <PrimaryButton type="submit" disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>ذخیره</span>
          </PrimaryButton>
        </div>
      </form>
    </AdminCard>
  );
};

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
    ...(can('users.view') || can('roles.view') || can('audit_logs.view') || can('ldap_settings.view') || can('sso_settings.view')
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

      {current === 'profile' && <>{profile}{orgStructureAvailable && <MyPlacementPanel />}</>}
      {current === 'team' && canSeeWorkTeams(permissions) && team}
      {current === 'appearance' && (
        <div className="space-y-5">
          {can('settings.update') && <BrandingSettingsCard />}
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
