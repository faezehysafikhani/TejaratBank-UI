import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil, ShieldCheck, UserX, UserCheck, UserPlus, Loader2, Lock, UserRound, Building2 } from 'lucide-react';
import {
  AdminUser, AdminUserInput, AdminRole, UserAccess, UserAccessEntry, NexusApiError,
  listUsersPage, adminCreateUser, adminUpdateUser, setUserActive,
  listRoles, getUserAccess, setUserRoles, setUserDirectPermissions,
} from '../../services/nexusApi';
import { getAssignment, setAssignment, removeAssignment, Honorific, listTitles, getUserTitle, setUserTitle } from '../../services/orgStructureApi';
import { toPersianDigits, formatToJalali } from '../../utils/helpers';
import {
  AdminCard, SearchBox, StatusBadge, IconAction, Pagination, Field, inputClass, Notice,
  AdminDialog, PrimaryButton, SecondaryButton, toLatinDigits, useDebounced, PillTabs,
} from './AdminUi';
import { moduleTitle, toggleUserAccess, clearPrerequisiteDenials, clearPrerequisiteDenialsForPermissions, preservePrerequisitesWhenDisabling, preservePermissionPrerequisites, enabledDependentForPrerequisite, hasKnownPermissionDependents, rolePermissionNames, isListedPermission } from '../../utils/permissions';
import { userErrorMessage } from '../../utils/errorMessages';
import { LoadingRow } from './orgStructure/orgShared';
import { OrgPlacementFields, useOrgPlacementData, EMPTY_PLACEMENT_DRAFT, OrgPlacementDraft } from './orgStructure/OrgPlacementFields';
import { appConfirm } from '../../utils/appDialog';

const PAGE_SIZE = 10;
const NATIONAL_CODE = /^[0-9]{10}$/;

/** Which user-administration actions the signed-in user may take (the server checks again). */
export interface UserAdminRights {
  create: boolean;
  update: boolean;
  changeStatus: boolean;
  assignRoles: boolean;
  assignPermissions: boolean;
}

const ROLE_TITLES: Record<string, string> = { Administrator: 'مدیر سیستم', Member: 'کاربر' };
export const roleTitle = (name: string) => ROLE_TITLES[name] || name;

function errorText(err: unknown, fallback: string): string {
  return userErrorMessage(err, fallback);
}

export const UsersPanel: React.FC<{
  currentUserId: string;
  rights: UserAdminRights;
  /** Whether the backend has the organization-structure module at all. */
  orgStructureAvailable: boolean;
  /** org_structure.manage_assignments: required to show the «جایگاه سازمانی» tab. */
  canManageOrgAssignments: boolean;
  /** organization_units.view: whether the unit (deputy) dropdown can be populated. */
  canSeeOrgUnits: boolean;
}> = ({ currentUserId, rights, orgStructureAvailable, canManageOrgAssignments, canSeeOrgUnits }) => {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [editing, setEditing] = useState<AdminUser | 'new' | null>(null);
  const [accessOf, setAccessOf] = useState<AdminUser | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listUsersPage({ page, pageSize: PAGE_SIZE, search: debouncedSearch });
      setRows(result.items);
      setTotal(result.totalCount);
    } catch (err) {
      setMessage({ type: 'error', text: errorText(err, 'دریافت فهرست کاربران ممکن نشد.') });
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch]);

  useEffect(() => { setPage(1); }, [debouncedSearch]);
  useEffect(() => { load(); }, [load]);

  const toggleStatus = async (user: AdminUser) => {
    const enable = !user.isActive;
    if (!enable && !(await appConfirm(`حساب «${user.displayName}» غیرفعال شود؟ کاربر بلافاصله از سامانه خارج می‌شود.`))) return;
    try {
      await setUserActive(user.id, enable);
      setMessage({ type: 'success', text: `حساب «${user.displayName}» ${enable ? 'فعال' : 'غیرفعال'} شد.` });
      await load();
    } catch (err) {
      setMessage({ type: 'error', text: errorText(err, 'تغییر وضعیت کاربر انجام نشد.') });
    }
  };

  return (
    <AdminCard>
      <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3 p-5">
        <SearchBox value={search} onChange={setSearch} placeholder="جستجو در نام، کد ملی، موبایل، ایمیل، نقش..." />
        {rights.create && (
          <PrimaryButton onClick={() => setEditing('new')}>
            <UserPlus className="w-4 h-4" />
            <span>کاربر جدید</span>
          </PrimaryButton>
        )}
      </div>

      {message && (
        <div className="px-5 pb-3">
          <Notice type={message.type} onClose={() => setMessage(null)}>{message.text}</Notice>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="bg-slate-50/80 dark:bg-slate-800/40 text-slate-500 dark:text-slate-400 text-xs">
              <th className="text-right font-bold px-5 py-3">کاربر</th>
              <th className="text-right font-bold px-3 py-3">نام کاربری (کد ملی)</th>
              <th className="text-right font-bold px-3 py-3">شماره موبایل</th>
              <th className="text-right font-bold px-3 py-3">نقش</th>
              <th className="text-right font-bold px-3 py-3">آخرین ورود</th>
              <th className="text-right font-bold px-3 py-3">وضعیت</th>
              <th className="text-right font-bold px-5 py-3">عملیات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {loading && rows.length === 0 ? (
              <tr><td colSpan={7} className="py-12 text-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin inline" /></td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} className="py-12 text-center text-slate-500">کاربری یافت نشد.</td></tr>
            ) : rows.map((user) => {
              const isSelf = user.id === currentUserId;
              const lockedReason = user.isSystem ? 'مدیر اصلی سیستم از این بخش قابل تغییر نیست.' : isSelf ? 'این عملیات برای حساب خودتان مجاز نیست.' : undefined;
              return (
                <tr key={user.id} className={`hover:bg-slate-50/60 dark:hover:bg-slate-800/30 ${loading ? 'opacity-60' : ''}`}>
                  <td className="px-5 py-3.5">
                    <div className="font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                      {/* The display name: first and last name, with the user's title before them when they have one. */}
                      <span>{user.displayName || `${user.firstName} ${user.lastName}`.trim()}</span>
                      {user.isSystem && (
                        <StatusBadge tone="indigo" title="ایجادشده توسط سیستم؛ قابل حذف، غیرفعال‌سازی یا تغییر دسترسی نیست">
                          <Lock className="w-3 h-3" /> مدیر اصلی
                        </StatusBadge>
                      )}
                    </div>
                    {user.email && <div className="text-xs text-slate-400 mt-0.5 dir-ltr text-right">{user.email}</div>}
                  </td>
                  <td className="px-3 py-3.5 font-mono text-slate-700 dark:text-slate-300 dir-ltr text-right">
                    {user.username ? toPersianDigits(user.username) : <span className="text-amber-600 font-sans text-xs">ثبت نشده</span>}
                  </td>
                  <td className="px-3 py-3.5 font-mono text-slate-700 dark:text-slate-300 dir-ltr text-right">{user.phoneNumber ? toPersianDigits(user.phoneNumber) : '—'}</td>
                  <td className="px-3 py-3.5">
                    <div className="flex flex-wrap gap-1">
                      {user.roles.length === 0 ? <span className="text-xs text-slate-400">بدون نقش</span> : user.roles.map((r) => (
                        <StatusBadge key={r} tone={r === 'Administrator' ? 'indigo' : 'slate'}>{roleTitle(r)}</StatusBadge>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-3.5 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">{user.lastLoginAtUtc ? formatToJalali(user.lastLoginAtUtc) : 'ثبت نشده'}</td>
                  <td className="px-3 py-3.5">
                    {user.isActive ? <StatusBadge tone="green">فعال</StatusBadge> : <StatusBadge tone="red">غیرفعال</StatusBadge>}
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-0.5">
                      {rights.update && (
                        <IconAction icon={Pencil} label="ویرایش" onClick={() => setEditing(user)} disabled={user.isSystem} disabledReason="مشخصات مدیر اصلی سیستم از این بخش قابل تغییر نیست؛ رمز خود را از «تنظیمات عمومی» تغییر می‌دهد." />
                      )}
                      {(rights.assignRoles || rights.assignPermissions) && (
                        <IconAction icon={ShieldCheck} label="دسترسی‌ها" onClick={() => setAccessOf(user)} disabled={!!lockedReason} disabledReason={lockedReason} />
                      )}
                      {rights.changeStatus && (
                        user.isActive
                          ? <IconAction icon={UserX} label="غیرفعال‌سازی" tone="rose" onClick={() => toggleStatus(user)} disabled={!!lockedReason} disabledReason={lockedReason} />
                          : <IconAction icon={UserCheck} label="فعال‌سازی" tone="emerald" onClick={() => toggleStatus(user)} />
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPage={setPage} />

      {editing && (
        <UserFormDialog
          user={editing === 'new' ? null : editing}
          canAssignRoles={rights.assignRoles}
          showPlacementTab={orgStructureAvailable && canManageOrgAssignments}
          canSeeOrgUnits={canSeeOrgUnits}
          showTitle={orgStructureAvailable && (rights.create || rights.update)}
          onClose={() => setEditing(null)}
          onSaved={async (text) => { setEditing(null); setMessage({ type: 'success', text }); await load(); }}
        />
      )}
      {accessOf && (
        <UserAccessDialog
          user={accessOf}
          rights={rights}
          onClose={() => setAccessOf(null)}
          onSaved={async (refreshError) => {
            setAccessOf(null);
            setMessage(refreshError
              ? { type: 'error', text: refreshError }
              : { type: 'success', text: `دسترسی‌های «${accessOf.displayName}» ذخیره شد.` });
            await load();
          }}
        />
      )}
    </AdminCard>
  );
};

// ---------------------------------------------------------------- create / edit

const UserFormDialog: React.FC<{
  user: AdminUser | null;
  canAssignRoles: boolean;
  showPlacementTab: boolean;
  canSeeOrgUnits: boolean;
  /** The organization-structure module's titles («آقای»، «خانم»...) before the name. */
  showTitle: boolean;
  onClose: () => void;
  onSaved: (message: string) => void;
}> = ({ user, canAssignRoles, showPlacementTab, canSeeOrgUnits, showTitle: titlesAvailable, onClose, onSaved }) => {
  const isNew = user === null;
  const [form, setForm] = useState<AdminUserInput>({
    firstName: user?.firstName || (user && !user.firstName && !user.lastName ? user.displayName : ''),
    lastName: user?.lastName || '',
    username: user?.username || '',
    phoneNumber: user?.phoneNumber || '',
    email: user?.email || '',
    password: '',
  });
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'basic' | 'placement'>('basic');
  const [placementDraft, setPlacementDraft] = useState<OrgPlacementDraft>(EMPTY_PLACEMENT_DRAFT);
  const [hadExistingAssignment, setHadExistingAssignment] = useState(false);
  const placementData = useOrgPlacementData(canSeeOrgUnits, showPlacementTab);

  // The title before the name. Not for the built-in administrator, whose name cannot change.
  const showTitle = titlesAvailable && !user?.isSystem;
  const [titles, setTitles] = useState<Honorific[]>([]);
  const [titleId, setTitleId] = useState('');
  const [originalTitleId, setOriginalTitleId] = useState('');
  useEffect(() => {
    if (!showTitle) return;
    let alive = true;
    listTitles().then((list) => alive && setTitles(list)).catch(() => {});
    if (!isNew) {
      getUserTitle(user!.id).then((t) => {
        if (!alive) return;
        setTitleId(t.honorificId || '');
        setOriginalTitleId(t.honorificId || '');
      }).catch(() => {});
    }
    return () => { alive = false; };
  }, [showTitle, isNew, user?.id]);
  const selectableTitles = titles.filter((t) => t.isActive || t.id === titleId);
  const chosenTitle = titles.find((t) => t.id === titleId)?.title;

  useEffect(() => {
    if (!isNew || !canAssignRoles) return;
    listRoles().then((list) => {
      setRoles(list);
      const member = list.find((r) => r.name === 'Member');
      if (member) setRoleIds([member.id]);
    }).catch(() => setRoles([]));
  }, [isNew, canAssignRoles]);

  // The user's current placement, to prefill the «جایگاه سازمانی» tab when editing.
  useEffect(() => {
    if (isNew || !showPlacementTab) return;
    let alive = true;
    getAssignment(user!.id).then((a) => {
      if (!alive || !a) return;
      setHadExistingAssignment(true);
      setPlacementDraft({
        companyId: a.companyId,
        unitId: a.unitId || '',
        positionId: a.positionId || '',
        managerUserId: a.explicitManagerUserId,
        managerName: a.explicitManagerUserId ? a.manager?.displayName || 'کاربر' : null,
      });
    }).catch(() => {});
    return () => { alive = false; };
  }, [isNew, showPlacementTab, user?.id]);

  const set = (key: keyof AdminUserInput) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: key === 'username' || key === 'phoneNumber' ? toLatinDigits(e.target.value) : e.target.value }));

  const usernameChanged = isNew || form.username.trim() !== (user?.username || '');

  const validate = (): string | null => {
    if (!form.firstName.trim() || !form.lastName.trim()) return 'نام و نام خانوادگی را وارد کنید.';
    if (usernameChanged && !NATIONAL_CODE.test(form.username.trim())) return 'نام کاربری باید کد ملی ۱۰ رقمی باشد (فقط عدد).';
    if (!form.phoneNumber.trim()) return 'شماره موبایل را وارد کنید.';
    if (!/^(\+?[0-9]{8,15}|0?9[0-9]{9})$/.test(form.phoneNumber.replace(/[\s\-()]/g, ''))) return 'شماره موبایل معتبر نیست (مثال: 09121234567).';
    if (form.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) return 'ایمیل معتبر نیست.';
    if (isNew && (form.password || '').length < 8) return 'رمز عبور اولیه باید حداقل ۸ کاراکتر باشد.';
    if (!isNew && form.password && form.password.length < 8) return 'رمز عبور جدید باید حداقل ۸ کاراکتر باشد.';
    if (form.password !== passwordConfirm) return 'رمز عبور و تکرار آن یکسان نیستند.';
    return null;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = validate();
    if (problem) { setError(problem); return; }
    setSaving(true);
    setError(null);
    try {
      let savedUserId: string;
      if (isNew) {
        savedUserId = (await adminCreateUser(form, canAssignRoles ? roleIds : [])).id;
      } else {
        await adminUpdateUser(user!, form);
        savedUserId = user!.id;
      }

      // Saving the name rebuilds it from first and last name, so a title is put back each time.
      if (showTitle && (titleId || originalTitleId)) {
        await setUserTitle(savedUserId, titleId || null);
      }

      // Placement is optional: only touch it when a company was actually chosen on that tab.
      // Clearing it back to «— بدون شرکت —» on a user who had a placement removes it instead of
      // silently leaving the old one in place.
      if (showPlacementTab) {
        if (placementDraft.companyId) {
          await setAssignment(savedUserId, {
            companyId: placementDraft.companyId,
            unitId: placementDraft.unitId || null,
            positionId: placementDraft.positionId || null,
            managerUserId: placementDraft.managerUserId,
          });
        } else if (hadExistingAssignment) {
          await removeAssignment(savedUserId);
        }
      }

      onSaved(isNew ? `کاربر «${form.firstName} ${form.lastName}» ایجاد شد.` : `مشخصات «${form.firstName} ${form.lastName}» ذخیره شد.`);
    } catch (err) {
      setError(errorText(err, 'ذخیره کاربر انجام نشد.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminDialog
      title={isNew ? 'ایجاد کاربر جدید' : `ویرایش «${user!.displayName}»`}
      onClose={onClose}
      footer={
        <>
          <SecondaryButton type="button" onClick={onClose}>انصراف</SecondaryButton>
          <PrimaryButton type="submit" form="user-form" disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            <span>{isNew ? 'ایجاد کاربر' : 'ذخیره تغییرات'}</span>
          </PrimaryButton>
        </>
      }
    >
      {showPlacementTab && (
        <PillTabs
          tabs={[
            { id: 'basic', label: 'اطلاعات کاربر', icon: UserRound },
            { id: 'placement', label: 'جایگاه سازمانی', icon: Building2 },
          ]}
          active={activeTab}
          onChange={setActiveTab}
        />
      )}
      <form id="user-form" onSubmit={submit} className="space-y-3" noValidate>
        {error && <Notice type="error">{error}</Notice>}
        {(!showPlacementTab || activeTab === 'basic') && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/30 p-3">
              {showTitle && (
                <Field
                  label="عنوان"
                  className="sm:col-span-2"
                  hint={
                    selectableTitles.length === 0
                      ? 'هنوز عنوانی تعریف نشده است (مدیریت کاربران ← عنوان‌ها).'
                      : `نام نمایشی: ${[chosenTitle, form.firstName.trim(), form.lastName.trim()].filter(Boolean).join(' ') || '—'}`
                  }
                >
                  <select className={inputClass} value={titleId} onChange={(e) => setTitleId(e.target.value)} disabled={selectableTitles.length === 0}>
                    <option value="">— بدون عنوان —</option>
                    {selectableTitles.map((t) => <option key={t.id} value={t.id}>{t.title}{t.isActive ? '' : ' (غیرفعال)'}</option>)}
                  </select>
                </Field>
              )}
              <Field label="نام" required><input className={inputClass} value={form.firstName} onChange={set('firstName')} maxLength={80} autoFocus /></Field>
              <Field label="نام خانوادگی" required><input className={inputClass} value={form.lastName} onChange={set('lastName')} maxLength={80} /></Field>
              <Field label="نام کاربری (کد ملی)" required hint={!isNew && user?.username && !NATIONAL_CODE.test(user.username) ? 'نام کاربری فعلی پیش از قانون کد ملی ثبت شده؛ اگر تغییرش دهید باید کد ملی ۱۰ رقمی باشد.' : 'دقیقاً ۱۰ رقم، فقط عدد.'}>
                <input className={`${inputClass} dir-ltr text-right font-mono`} value={form.username} onChange={set('username')} inputMode="numeric" maxLength={usernameChanged ? 10 : 64} autoComplete="off" />
              </Field>
              <Field label="شماره موبایل" required hint="برای ورود و دریافت پیامک.">
                <input className={`${inputClass} dir-ltr text-right font-mono`} value={form.phoneNumber} onChange={set('phoneNumber')} inputMode="tel" placeholder="09121234567" autoComplete="off" />
              </Field>
              <Field label="ایمیل" hint="اختیاری؛ برای ارسال لینک بازیابی رمز عبور." className="sm:col-span-2">
                <input className={`${inputClass} dir-ltr text-right`} type="email" value={form.email} onChange={set('email')} autoComplete="off" />
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-2xl border border-violet-100 dark:border-violet-900 bg-violet-50/40 dark:bg-violet-950/20 p-3">
              <Field label={isNew ? 'رمز عبور اولیه' : 'رمز عبور جدید'} required={isNew} hint={isNew ? 'حداقل ۸ کاراکتر.' : 'خالی بگذارید تا رمز فعلی بماند.'}>
                <input className={`${inputClass} dir-ltr text-right`} type="password" value={form.password} onChange={set('password')} autoComplete="new-password" minLength={form.password || isNew ? 8 : undefined} />
              </Field>
              <Field label="تکرار رمز عبور" required={isNew} hint={passwordConfirm && form.password !== passwordConfirm ? 'رمزها یکسان نیستند.' : undefined}>
                <input className={`${inputClass} dir-ltr text-right ${passwordConfirm && form.password !== passwordConfirm ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-400/40' : ''}`} type="password" value={passwordConfirm} onChange={(e) => setPasswordConfirm(e.target.value)} autoComplete="new-password" aria-invalid={!!passwordConfirm && form.password !== passwordConfirm} />
              </Field>
            </div>
            {isNew && canAssignRoles && roles.length > 0 && (
              <div className="rounded-2xl border border-violet-100 dark:border-violet-900 bg-violet-50/40 dark:bg-violet-950/20 p-3">
                <span className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">نقش‌ها</span>
                <div className="flex flex-wrap gap-2">
                  {roles.map((role) => (
                    <label key={role.id} className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm cursor-pointer hover:border-indigo-400 hover:shadow-sm transition-all">
                      <input type="checkbox" checked={roleIds.includes(role.id)} onChange={(e) => setRoleIds((ids) => e.target.checked ? [...ids, role.id] : ids.filter((id) => id !== role.id))} />
                      <span>{roleTitle(role.name)}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
        {showPlacementTab && activeTab === 'placement' && (
          <div className="space-y-3">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              شرکت، معاونت/واحد، سمت و مدیر مستقیم این کاربر؛ اختیاری است و بعداً هم قابل تغییر.
            </p>
            {placementData.loading ? <LoadingRow /> : placementData.error ? <Notice type="error">{placementData.error}</Notice> : (
              <OrgPlacementFields
                draft={placementDraft}
                onChange={setPlacementDraft}
                data={placementData.data!}
                excludeManagerIds={user ? [user.id] : []}
              />
            )}
          </div>
        )}
      </form>
    </AdminDialog>
  );
};

// ---------------------------------------------------------------- access

/** Where a permission reaches the user from, and whether it is in effect for them. */
const AccessSourceBadges: React.FC<{ entry: UserAccessEntry; direct: ReadonlySet<string>; denied: ReadonlySet<string>; prerequisite: boolean }> = ({ entry, direct, denied, prerequisite }) => {
  const roles = entry.grantingRoles.map(roleTitle).join('، ');
  const groups = entry.grantingGroups.join('، ');
  if (denied.has(entry.permissionId)) {
    const despite = [entry.grantedByRole && `نقش ${roles}`, entry.grantedByGroup && `گروه ${groups}`].filter(Boolean).join(' و ');
    return (
      <StatusBadge tone="red" title={despite ? `با وجود دسترسی از طریق ${despite}، برای این کاربر ممنوع شده است.` : 'برای این کاربر ممنوع شده است.'}>
        غیرفعال برای این کاربر
      </StatusBadge>
    );
  }
  return (
    <>
      {direct.has(entry.permissionId) && <StatusBadge tone="green">دسترسی مستقیم</StatusBadge>}
      {entry.grantedByRole && <StatusBadge tone="indigo" title={roles}>فعال از طریق نقش {roles}</StatusBadge>}
      {entry.grantedByGroup && <StatusBadge tone="amber" title={groups}>فعال از طریق گروه {groups}</StatusBadge>}
      {prerequisite && !direct.has(entry.permissionId) && !entry.grantedByRole && !entry.grantedByGroup && (
        <StatusBadge tone="slate" title="مجوز دیگری از این کاربر به آن نیاز دارد.">لازمهٔ مجوزی دیگر</StatusBadge>
      )}
    </>
  );
};

const UserAccessDialog: React.FC<{ user: AdminUser; rights: UserAdminRights; onClose: () => void; onSaved: (refreshError?: string) => void }> = ({ user, rights, onClose, onSaved }) => {
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [access, setAccess] = useState<UserAccess | null>(null);
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [direct, setDirect] = useState<Set<string>>(new Set());
  const [denied, setDenied] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // The role list needs roles.view; without it the permissions are still shown.
    Promise.all([listRoles().catch(() => [] as AdminRole[]), getUserAccess(user.id)]).then(([roleList, userAccess]) => {
      setRoles(roleList);
      setAccess(userAccess);
      setRoleIds(roleList.filter((r) => userAccess.roles.includes(r.name)).map((r) => r.id));
      setDirect(new Set(userAccess.permissions.filter((p) => p.grantedDirectly || p.isDirect).map((p) => p.permissionId)));
      setDenied(new Set(userAccess.permissions.filter((p) => p.deniedForUser).map((p) => p.permissionId)));
    }).catch((err) => setError(errorText(err, 'دریافت دسترسی‌ها ممکن نشد.')));
  }, [user.id]);

  const modules = useMemo(() => {
    const term = filter.trim().toLowerCase();
    const groups = new Map<string, UserAccess['permissions']>();
    for (const entry of access?.permissions || []) {
      if (!isListedPermission(entry.name)) continue;
      if (term && !`${entry.name} ${entry.description} ${entry.module} ${moduleTitle(entry.module)}`.toLowerCase().includes(term)) continue;
      groups.set(entry.module, [...(groups.get(entry.module) || []), entry]);
    }
    return [...groups.entries()];
  }, [access, filter]);

  const selectedRoleNames = useMemo(
    () => new Set(roles.filter((role) => roleIds.includes(role.id)).map((role) => role.name)),
    [roles, roleIds],
  );
  const selectedRolePermissions = useMemo(
    () => new Set(roles
      .filter((role) => roleIds.includes(role.id))
      .flatMap((role) => rolePermissionNames(role.permissions, access?.permissions || []))),
    [access, roles, roleIds],
  );

  const save = async () => {
    if (!access) return;
    setSaving(true);
    setError(null);
    try {
      const originalRoleIds = roles.filter((r) => access.roles.includes(r.name)).map((r) => r.id).sort().join(',');
      if (rights.assignRoles && [...roleIds].sort().join(',') !== originalRoleIds) {
        await setUserRoles(user.id, roleIds);
      }
      const originalDirect = access.permissions.filter((p) => p.grantedDirectly || p.isDirect).map((p) => p.permissionId).sort().join(',');
      const originalDenied = access.permissions.filter((p) => p.deniedForUser).map((p) => p.permissionId).sort().join(',');
      if (rights.assignPermissions && ([...direct].sort().join(',') !== originalDirect || [...denied].sort().join(',') !== originalDenied)) {
        await setUserDirectPermissions(user.id, [...direct], [...denied]);
      }
      let refreshedAccess: UserAccess;
      try {
        refreshedAccess = await getUserAccess(user.id);
      } catch (err) {
        onSaved(`دسترسی‌ها ذخیره شد، اما دریافت وضعیت جدید ممکن نشد: ${errorText(err, 'خطای نامشخص')}`);
        return;
      }
      setAccess(refreshedAccess);
      setDirect(new Set(refreshedAccess.permissions.filter((p) => p.grantedDirectly || p.isDirect).map((p) => p.permissionId)));
      setDenied(new Set(refreshedAccess.permissions.filter((p) => p.deniedForUser).map((p) => p.permissionId)));
      onSaved();
    } catch (err) {
      setError(errorText(err, 'ذخیره دسترسی‌ها انجام نشد.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminDialog
      wide
      title={`دسترسی‌های «${user.displayName}»`}
      onClose={onClose}
      footer={
        <>
          <SecondaryButton type="button" onClick={onClose}>انصراف</SecondaryButton>
          <PrimaryButton type="button" onClick={save} disabled={saving || !access}>
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            <span>ذخیره دسترسی‌ها</span>
          </PrimaryButton>
        </>
      }
    >
      {error && <Notice type="error">{error}</Notice>}
      {!access ? (
        <div className="py-10 text-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin inline" /></div>
      ) : (
        <>
          <section>
            <h4 className="text-sm font-extrabold text-slate-800 dark:text-slate-100 mb-2">نقش‌ها</h4>
            <div className="flex flex-wrap gap-2">
              {roles.map((role) => (
                <label key={role.id} className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm ${rights.assignRoles ? 'cursor-pointer' : 'opacity-60'} ${roleIds.includes(role.id) ? 'border-indigo-300 bg-indigo-50 dark:bg-indigo-950/40 dark:border-indigo-700' : 'border-slate-200 dark:border-slate-700'}`}>
                  <input
                    type="checkbox"
                    disabled={!rights.assignRoles}
                    checked={roleIds.includes(role.id)}
                    onChange={(e) => {
                      const permissionNames = rolePermissionNames(role.permissions, access.permissions);
                      if (e.target.checked) {
                        setRoleIds((ids) => ids.includes(role.id) ? ids : [...ids, role.id]);
                        setDenied((current) => clearPrerequisiteDenialsForPermissions(permissionNames, access.permissions, current));
                      } else {
                        setRoleIds((ids) => ids.filter((id) => id !== role.id));
                        setDirect((current) => preservePermissionPrerequisites(permissionNames, access.permissions, current, denied));
                      }
                    }}
                  />
                  <span className="font-bold">{roleTitle(role.name)}</span>
                  <span className="text-xs text-slate-400">({toPersianDigits(role.permissions.length)} مجوز)</span>
                </label>
              ))}
            </div>
          </section>

          <section className="space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h4 className="text-sm font-extrabold text-slate-800 dark:text-slate-100">مجوزهای این کاربر</h4>
              <SearchBox value={filter} onChange={setFilter} placeholder="جستجوی مجوز..." />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              تیک هر مجوز یعنی این کاربر واقعاً آن را دارد. برداشتن تیک مجوزی که از نقش یا گروه می‌آید، آن را فقط برای همین کاربر غیرفعال می‌کند و نقش یا گروه تغییر نمی‌کند؛ با زدن دوباره تیک، دسترسی برمی‌گردد. فقط مجوزهایی را می‌توانید اعطا یا غیرفعال کنید که خودتان دارید.
            </p>
            <div className="space-y-3">
              {modules.map(([module, entries]) => (
                <div key={module} className="rounded-xl border border-slate-200 dark:border-slate-700">
                  <div className="px-3 py-2 bg-slate-50 dark:bg-slate-800/60 rounded-t-xl text-xs font-extrabold text-slate-600 dark:text-slate-300">{moduleTitle(module)}</div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {entries.map((entry) => {
                      const dependent = enabledDependentForPrerequisite(
                        entry,
                        access.permissions,
                        direct,
                        denied,
                        selectedRoleNames,
                        selectedRolePermissions,
                      );
                      const grantedBySelectedRole = selectedRolePermissions.has(entry.name)
                        || (entry.grantedByRole && entry.grantingRoles.some((roleName) => selectedRoleNames.has(roleName)));
                      const prerequisite = !!dependent
                        || (!!entry.grantedAsPrerequisite && !hasKnownPermissionDependents(entry.name));
                      const effective = !denied.has(entry.permissionId) && (
                        direct.has(entry.permissionId)
                        || grantedBySelectedRole
                        || entry.grantedByGroup
                        || prerequisite
                      );
                      const cannotDisable = !!dependent && effective;
                      return (
                      <label key={entry.permissionId} className={`flex items-center justify-between gap-3 px-3 py-2 ${rights.assignPermissions && !cannotDisable ? 'cursor-pointer' : ''}`}>
                        <span className="flex items-center gap-2 min-w-0">
                          <input
                            type="checkbox"
                            disabled={!rights.assignPermissions || cannotDisable}
                            checked={effective}
                            title={cannotDisable ? `ابتدا مجوز «${dependent.description}» را غیرفعال کنید.` : undefined}
                            onChange={(e) => {
                              const next = toggleUserAccess(entry, e.target.checked, direct, denied);
                              setDirect(e.target.checked
                                ? next.direct
                                : preservePrerequisitesWhenDisabling(entry, access.permissions, next.direct, next.denied));
                              setDenied(e.target.checked
                                ? clearPrerequisiteDenials(entry, access.permissions, next.denied)
                                : next.denied);
                            }}
                          />
                          <span className="min-w-0 text-sm text-slate-800 dark:text-slate-100">{entry.description}</span>
                          {cannotDisable && (
                            <span className="text-xs text-amber-600 dark:text-amber-400">
                              پیش‌نیاز «{dependent.description}» است
                            </span>
                          )}
                        </span>
                        <span className="flex flex-wrap gap-1 justify-end">
                          <AccessSourceBadges entry={entry} direct={direct} denied={denied} prerequisite={prerequisite} />
                        </span>
                      </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </AdminDialog>
  );
};
