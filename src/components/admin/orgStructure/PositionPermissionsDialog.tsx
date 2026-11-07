import React, { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { AdminDialog, Notice, PrimaryButton, SecondaryButton } from '../AdminUi';
import { SearchBox } from '../AdminUi';
import { userErrorMessage } from '../../../utils/errorMessages';
import { toPersianDigits } from '../../../utils/helpers';
import { isListedPermission, moduleTitle, prerequisitesOf } from '../../../utils/permissions';
import { listPermissionGroups, type PermissionInfo } from '../../../services/nexusApi';
import {
  getPositionPermissions, getPostPermissions, setPositionPermissions, setPostPermissions,
} from '../../../services/orgStructureApi';

/**
 * The permissions a position (سمت) or one post gives to whoever holds it. A person's own access is the
 * sum of what their posts give (plus a stand-in's, while it is on); nothing is given to a post's
 * superior. A caller can only hand out permissions they hold themselves (the server checks).
 */
export const PositionPermissionsDialog: React.FC<{
  kind: 'position' | 'post';
  id: string;
  title: string;
  /** For a position: the companies it is for. Each company has its own list of permissions. */
  companies?: { id: string; name: string }[];
  canEdit: boolean;
  onClose: () => void;
  onSaved?: (message: string) => void;
}> = ({ kind, id, title, companies = [], canEdit, onClose, onSaved }) => {
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? '');
  const [groups, setGroups] = useState<{ module: string; permissions: PermissionInfo[] }[] | null>(null);
  const [original, setOriginal] = useState<string[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (kind === 'position' && !companyId) { setGroups([]); setOriginal([]); setError('این سمت برای هیچ شرکتی تعیین نشده است.'); return () => { alive = false; }; }
    setGroups(null);
    setError(null);
    const load = kind === 'position' ? getPositionPermissions(id, companyId) : getPostPermissions(id);
    Promise.all([listPermissionGroups(), load])
      .then(([list, current]) => {
        if (!alive) return;
        setGroups(list);
        setOriginal(current.permissionNames);
        setSelected(new Set(current.permissionNames));
      })
      .catch((err) => { if (alive) { setGroups([]); setOriginal([]); setError(userErrorMessage(err, 'دریافت دسترسی‌ها ممکن نشد.')); } });
    return () => { alive = false; };
  }, [kind, id, companyId]);

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

  // A permission another chosen one needs stays chosen (the server adds it back anyway).
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
    setSaving(true);
    setError(null);
    try {
      const names = [...selected].sort();
      await (kind === 'position' ? setPositionPermissions(id, companyId, names) : setPostPermissions(id, names));
      const where = kind === 'position' && companies.length > 1 ? ` در «${companies.find((c) => c.id === companyId)?.name ?? ''}»` : '';
      onSaved?.(`دسترسی‌های «${title}»${where} ذخیره شد.`);
      onClose();
    } catch (err) {
      setError(userErrorMessage(err, 'ذخیرهٔ دسترسی‌ها انجام نشد.'));
    } finally {
      setSaving(false);
    }
  };

  const changed = original !== null && [...selected].sort().join(',') !== [...original].sort().join(',');
  return (
    <AdminDialog
      wide
      title={kind === 'position' ? `دسترسی‌های سمت «${title}»` : `دسترسی‌های پست «${title}»`}
      onClose={onClose}
      footer={
        <>
          <SecondaryButton type="button" onClick={onClose}>{canEdit ? 'انصراف' : 'بستن'}</SecondaryButton>
          {canEdit && (
            <PrimaryButton type="button" onClick={save} disabled={saving || groups === null || !changed}>
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>ذخیرهٔ دسترسی‌ها</span>
            </PrimaryButton>
          )}
        </>
      }
    >
      {error && <Notice type="error">{error}</Notice>}
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {kind === 'position'
          ? 'هر کسی که در همین شرکت پستی با این سمت دارد این دسترسی‌ها را می‌گیرد (همین سمت در شرکت دیگر فهرست جدا دارد)؛ با پایان انتصاب، دسترسی‌ها هم برداشته می‌شود. جانشین هم تا زمانی که جانشین است از آن‌ها برخوردار است.'
          : 'فقط دارندهٔ همین پست این دسترسی‌ها را (علاوه بر دسترسی‌های سمتش) می‌گیرد.'}
        {' '}فقط دسترسی‌هایی را می‌توانید بدهید که خودتان دارید.
      </p>
      {kind === 'position' && companies.length > 1 && (
        <label className="flex items-center gap-2 text-sm">
          <span className="font-bold text-slate-700 dark:text-slate-200">شرکت</span>
          <select className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5" value={companyId} disabled={saving} onChange={(e) => setCompanyId(e.target.value)}>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
      )}
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-extrabold text-slate-800 dark:text-slate-100">
          دسترسی‌ها
          <span className="text-xs font-bold text-slate-400 mr-2">({toPersianDigits([...selected].filter(isListedPermission).length)} مورد)</span>
        </h4>
        <SearchBox value={filter} onChange={setFilter} placeholder="جستجوی دسترسی..." />
      </div>
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
                  const locked = !canEdit || !!dependent;
                  return (
                    <label key={permission.id} className={`flex items-center gap-2 px-3 py-2 ${locked ? '' : 'cursor-pointer'}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={locked}
                        title={dependent ? `ابتدا دسترسی «${dependent.description}» را بردارید.` : undefined}
                        onChange={(e) => toggle(permission, e.target.checked)}
                      />
                      <span className="min-w-0 text-sm text-slate-800 dark:text-slate-100">{permission.description}</span>
                      {dependent && <span className="text-xs text-amber-600 dark:text-amber-400">پیش‌نیاز «{dependent.description}» است</span>}
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </AdminDialog>
  );
};
