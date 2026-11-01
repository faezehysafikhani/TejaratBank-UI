import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Loader2, Lock, Eye } from 'lucide-react';
import {
  AdminRole, PermissionInfo, listRoles, createRole, updateRole, setRolePermissions, listPermissionGroups,
} from '../../services/nexusApi';
import { toPersianDigits } from '../../utils/helpers';
import {
  AdminCard, SearchBox, StatusBadge, IconAction, Field, inputClass, Notice, AdminDialog, PrimaryButton, SecondaryButton,
} from './AdminUi';
import { isListedPermission, moduleTitle, prerequisitesOf } from '../../utils/permissions';
import { userErrorMessage } from '../../utils/errorMessages';
import { roleTitle } from './UsersPanel';

/** Which role actions the signed-in user may take (the server checks again). */
export interface RoleAdminRights {
  create: boolean;
  update: boolean;
  assignPermissions: boolean;
}

/**
 * «نقش‌ها»: custom roles - a named set of permissions the administrator builds, changes later
 * and gives to users in their access window. A change reaches everyone with the role. The
 * built-in Administrator role always has every permission and is only shown.
 */
export const RolesPanel: React.FC<{ rights: RoleAdminRights }> = ({ rights }) => {
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [editing, setEditing] = useState<AdminRole | 'new' | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRoles(await listRoles());
    } catch (err) {
      setMessage({ type: 'error', text: userErrorMessage(err, 'دریافت فهرست نقش‌ها ممکن نشد.') });
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => {
    const term = search.trim().toLowerCase();
    return roles
      .filter((r) => !term || `${roleTitle(r.name)} ${r.name} ${r.description || ''}`.toLowerCase().includes(term))
      .sort((a, b) => Number(b.isSystem) - Number(a.isSystem) || roleTitle(a.name).localeCompare(roleTitle(b.name), 'fa'));
  }, [roles, search]);

  return (
    <AdminCard>
      <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3 p-5">
        <SearchBox value={search} onChange={setSearch} placeholder="جستجو در نام یا توضیحات نقش..." />
        {rights.create && (
          <PrimaryButton onClick={() => setEditing('new')}>
            <Plus className="w-4 h-4" />
            <span>نقش جدید</span>
          </PrimaryButton>
        )}
      </div>
      <p className="px-5 pb-3 text-xs text-slate-500 dark:text-slate-400">
        هر نقش مجموعه‌ای از مجوزهاست. نقش را در «مدیریت کاربران ← دسترسی‌ها» به هر کاربر بدهید؛ هر تغییری در مجوزهای نقش، برای همهٔ دارندگان آن اعمال می‌شود.
      </p>

      {message && (
        <div className="px-5 pb-3">
          <Notice type={message.type} onClose={() => setMessage(null)}>{message.text}</Notice>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="bg-slate-50/80 dark:bg-slate-800/40 text-slate-500 dark:text-slate-400 text-xs">
              <th className="text-right font-bold px-5 py-3">نام نقش</th>
              <th className="text-right font-bold px-3 py-3">توضیحات</th>
              <th className="text-right font-bold px-3 py-3">مجوزها</th>
              <th className="text-right font-bold px-5 py-3">عملیات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {loading && roles.length === 0 ? (
              <tr><td colSpan={4} className="py-12 text-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin inline" /></td></tr>
            ) : shown.length === 0 ? (
              <tr><td colSpan={4} className="py-12 text-center text-slate-500">نقشی یافت نشد.</td></tr>
            ) : shown.map((role) => (
              <tr key={role.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30">
                <td className="px-5 py-3.5">
                  <div className="font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <span>{roleTitle(role.name)}</span>
                    {role.isSystem && (
                      <StatusBadge tone="indigo" title="نقش سیستمی همیشه همهٔ مجوزها را دارد و قابل تغییر نیست.">
                        <Lock className="w-3 h-3" /> سیستمی
                      </StatusBadge>
                    )}
                  </div>
                </td>
                <td className="px-3 py-3.5 text-slate-600 dark:text-slate-300">{role.description || '—'}</td>
                <td className="px-3 py-3.5 text-slate-600 dark:text-slate-300">
                  {role.isSystem ? 'همهٔ مجوزها' : `${toPersianDigits(role.permissions.filter(isListedPermission).length)} مجوز`}
                </td>
                <td className="px-5 py-3.5">
                  {role.isSystem ? null : rights.update || rights.assignPermissions ? (
                    <IconAction icon={Pencil} label="ویرایش نقش" onClick={() => setEditing(role)} />
                  ) : (
                    <IconAction icon={Eye} label="مشاهدهٔ مجوزها" onClick={() => setEditing(role)} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <RoleDialog
          role={editing === 'new' ? null : editing}
          otherNames={roles.filter((r) => editing === 'new' || r.id !== editing.id).map((r) => r.name)}
          rights={rights}
          onClose={() => setEditing(null)}
          onSaved={(text) => { setEditing(null); setMessage({ type: 'success', text }); load(); }}
        />
      )}
    </AdminCard>
  );
};

const RoleDialog: React.FC<{
  role: AdminRole | null;
  otherNames: string[];
  rights: RoleAdminRights;
  onClose: () => void;
  onSaved: (message: string) => void;
}> = ({ role, otherNames, rights, onClose, onSaved }) => {
  const isNew = role === null;
  const canEditInfo = isNew ? rights.create : rights.update;
  const canEditPermissions = rights.assignPermissions;
  const [name, setName] = useState(role?.name ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [groups, setGroups] = useState<{ module: string; permissions: PermissionInfo[] }[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set(role?.permissions ?? []));
  const [filter, setFilter] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listPermissionGroups()
      .then(setGroups)
      .catch((err) => { setGroups([]); setError(userErrorMessage(err, 'دریافت فهرست مجوزها ممکن نشد.')); });
  }, []);

  const byName = useMemo(() => new Map((groups || []).flatMap((g) => g.permissions).map((p) => [p.name, p])), [groups]);

  const modules = useMemo(() => {
    const term = filter.trim().toLowerCase();
    return (groups || [])
      .map((g) => ({
        module: g.module,
        permissions: g.permissions.filter((p) => isListedPermission(p.name)
          && (!term || `${p.name} ${p.description} ${moduleTitle(g.module)}`.toLowerCase().includes(term))),
      }))
      .filter((g) => g.permissions.length > 0);
  }, [groups, filter]);

  // A permission another chosen one needs stays chosen (the server would add it back anyway).
  const neededBy = (permissionName: string): PermissionInfo | undefined => {
    for (const chosen of selected) {
      if (chosen !== permissionName && prerequisitesOf(chosen).includes(permissionName)) return byName.get(chosen);
    }
    return undefined;
  };

  const toggle = (permission: PermissionInfo, on: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      if (on) {
        next.add(permission.name);
        for (const needed of prerequisitesOf(permission.name)) next.add(needed);
      } else {
        next.delete(permission.name);
      }
      return next;
    });
  };

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) { setError('نام نقش را وارد کنید.'); return; }
    if (trimmed.length > 80) { setError('نام نقش حداکثر ۸۰ کاراکتر است.'); return; }
    if (description.trim().length > 300) { setError('توضیحات حداکثر ۳۰۰ کاراکتر است.'); return; }
    if (otherNames.some((n) => n.trim().toLowerCase() === trimmed.toLowerCase() || roleTitle(n) === trimmed)) {
      setError('نقشی با این نام قبلاً ثبت شده است.');
      return;
    }
    if (isNew && selected.size === 0) { setError('حداقل یک مجوز برای نقش انتخاب کنید.'); return; }
    setSaving(true);
    setError(null);
    try {
      let roleId = role?.id;
      const desc = description.trim() || null;
      if (isNew) {
        roleId = (await createRole(trimmed, desc)).id;
      } else if (canEditInfo && (trimmed !== role.name || desc !== (role.description || null))) {
        await updateRole(role.id, trimmed, desc);
      }
      const before = [...(role?.permissions ?? [])].sort().join(',');
      if (canEditPermissions && roleId && [...selected].sort().join(',') !== before) {
        const ids = [...selected].map((n) => byName.get(n)?.id).filter((id): id is string => !!id);
        await setRolePermissions(roleId, ids);
      }
      onSaved(isNew ? `نقش «${trimmed}» ساخته شد.` : `نقش «${trimmed}» ذخیره شد.`);
    } catch (err) {
      setError(userErrorMessage(err, isNew ? 'ساخت نقش انجام نشد.' : 'ذخیرهٔ نقش انجام نشد.'));
    } finally {
      setSaving(false);
    }
  };

  const readOnly = !canEditInfo && !canEditPermissions;
  return (
    <AdminDialog
      wide
      title={isNew ? 'نقش جدید' : `نقش «${roleTitle(role.name)}»`}
      onClose={onClose}
      footer={
        <>
          <SecondaryButton type="button" onClick={onClose}>{readOnly ? 'بستن' : 'انصراف'}</SecondaryButton>
          {!readOnly && (
            <PrimaryButton type="button" onClick={save} disabled={saving || groups === null}>
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{isNew ? 'ساخت نقش' : 'ذخیرهٔ تغییرات'}</span>
            </PrimaryButton>
          )}
        </>
      }
    >
      {error && <Notice type="error">{error}</Notice>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="نام نقش" required hint="مثلاً «کارشناس ارشد» یا «مدیر واحد»">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} disabled={!canEditInfo} autoFocus={isNew} />
        </Field>
        <Field label="توضیحات">
          <input className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} disabled={!canEditInfo} />
        </Field>
      </div>

      <section className="space-y-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h4 className="text-sm font-extrabold text-slate-800 dark:text-slate-100">
            مجوزهای این نقش
            <span className="text-xs font-bold text-slate-400 mr-2">({toPersianDigits([...selected].filter(isListedPermission).length)} مجوز)</span>
          </h4>
          <SearchBox value={filter} onChange={setFilter} placeholder="جستجوی مجوز..." />
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          با زدن تیک هر مجوز، مجوزهایی که لازمهٔ آن هستند هم خودکار انتخاب می‌شوند. فقط مجوزهایی را می‌توانید به نقش بدهید که خودتان دارید.
        </p>
        {groups === null ? (
          <div className="py-10 text-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin inline" /></div>
        ) : (
          <div className="space-y-3">
            {modules.map(({ module, permissions }) => (
              <div key={module} className="rounded-xl border border-slate-200 dark:border-slate-700">
                <div className="px-3 py-2 bg-slate-50 dark:bg-slate-800/60 rounded-t-xl text-xs font-extrabold text-slate-600 dark:text-slate-300">{moduleTitle(module)}</div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {permissions.map((permission) => {
                    const checked = selected.has(permission.name);
                    const dependent = checked ? neededBy(permission.name) : undefined;
                    const locked = !canEditPermissions || !!dependent;
                    return (
                      <label key={permission.id} className={`flex items-center gap-2 px-3 py-2 ${locked ? '' : 'cursor-pointer'}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={locked}
                          title={dependent ? `ابتدا مجوز «${dependent.description}» را بردارید.` : undefined}
                          onChange={(e) => toggle(permission, e.target.checked)}
                        />
                        <span className="min-w-0 text-sm text-slate-800 dark:text-slate-100">{permission.description}</span>
                        {dependent && (
                          <span className="text-xs text-amber-600 dark:text-amber-400">پیش‌نیاز «{dependent.description}» است</span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </AdminDialog>
  );
};
