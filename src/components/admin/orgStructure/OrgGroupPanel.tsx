import React, { useState } from 'react';
import { Building2, GitFork, Loader2, Pencil } from 'lucide-react';
import { AdminCard, AdminDialog, Field, IconAction, Notice, PrimaryButton, SecondaryButton, StatusBadge, inputClass } from '../AdminUi';
import { userErrorMessage } from '../../../utils/errorMessages';
import { toPersianDigits } from '../../../utils/helpers';
import { type CompanyGroup, listCompanyGroups, setCompanyParent } from '../../../services/orgStructureApi';
import { EmptyRow, LoadingRow, useLoad } from './orgShared';

const flatten = (groups: CompanyGroup[], parentId: string | null = null): { group: CompanyGroup; parentId: string | null }[] =>
  groups.flatMap((g) => [{ group: g, parentId }, ...flatten(g.children, g.id)]);

const descendantsOf = (group: CompanyGroup): string[] => group.children.flatMap((c) => [c.id, ...descendantsOf(c)]);

const GroupNode: React.FC<{ group: CompanyGroup; depth: number; canEdit: boolean; onOpen: (companyId: string) => void; onEdit: (group: CompanyGroup) => void }> = ({ group, depth, canEdit, onOpen, onEdit }) => (
  <li>
    <div className={`flex flex-wrap items-center gap-3 rounded-xl border px-3 py-2.5 ${depth === 0 ? 'border-indigo-200 bg-indigo-50/60 dark:border-indigo-900 dark:bg-indigo-950/30' : 'border-slate-200 dark:border-slate-700'}`}>
      <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${depth === 0 ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}><Building2 className="w-[18px] h-[18px]" /></span>
      <span className="min-w-0 flex-1">
        <span className={`block text-sm font-extrabold ${group.isActive ? 'text-slate-900 dark:text-slate-100' : 'text-slate-400 line-through'}`}>{group.name}</span>
        <span className="block text-[11px] text-slate-500"><span className="dir-ltr inline-block">{group.code}</span>{group.children.length > 0 ? ` · ${toPersianDigits(group.children.length)} شرکت زیرمجموعه` : ''}</span>
      </span>
      {!group.isActive && <StatusBadge tone="red">غیرفعال</StatusBadge>}
      <SecondaryButton type="button" onClick={() => onOpen(group.id)}><GitFork className="w-4 h-4" /> چارت</SecondaryButton>
      {canEdit && <IconAction icon={Pencil} label={`تغییر سازمان بالادستی ${group.name}`} onClick={() => onEdit(group)} />}
    </div>
    {group.children.length > 0 && (
      <ul className="ms-6 mt-2 space-y-2 border-s-2 border-slate-200 dark:border-slate-700 ps-4">
        {group.children.map((child) => <GroupNode key={child.id} group={child} depth={depth + 1} canEdit={canEdit} onOpen={onOpen} onEdit={onEdit} />)}
      </ul>
    )}
  </li>
);

/**
 * «چارت گروه»: the companies of a group (a holding) as a tree - the parent company at the top, the
 * companies under it below - each opening its own chart. The grouping is only that: who sees which
 * company, managers and everything else stay as they were.
 */
export const OrgGroupPanel: React.FC<{ canEdit: boolean; onOpenCompany: (companyId: string) => void }> = ({ canEdit, onOpenCompany }) => {
  const data = useLoad(listCompanyGroups, 'دریافت چارت گروه ممکن نشد.');
  const [editing, setEditing] = useState<CompanyGroup | null>(null);
  const [parentId, setParentId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (data.loading && !data.data) return <AdminCard><LoadingRow /></AdminCard>;
  if (data.error) return <Notice type="error">{data.error}</Notice>;
  const roots = data.data || [];
  const all = flatten(roots);
  const grouped = roots.some((r) => r.children.length > 0);

  const edit = (group: CompanyGroup) => { setEditing(group); setParentId(all.find((x) => x.group.id === group.id)?.parentId || ''); setError(null); };
  const save = async () => {
    if (!editing) return;
    setBusy(true);
    setError(null);
    try {
      await setCompanyParent(editing.id, parentId || null);
      setEditing(null);
      setMessage(`سازمان بالادستی «${editing.name}» ذخیره شد.`);
      await data.reload();
    } catch (err) {
      setError(userErrorMessage(err, 'تغییر سازمان بالادستی انجام نشد.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {message && <Notice type="success" onClose={() => setMessage(null)}>{message}</Notice>}
      <AdminCard>
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <h3 className="text-base font-extrabold text-slate-900 dark:text-white">چارت گروه</h3>
          <p className="text-xs text-slate-500 mt-0.5">هر شرکت زیر سازمان بالادستی‌اش. این فقط یک دسته‌بندی است: دسترسی‌ها، مدیرها و بقیه‌ی رفتار هر شرکت همان‌طور که بود می‌ماند.</p>
        </div>
        {roots.length === 0 ? <EmptyRow>هنوز شرکتی تعریف نشده است.</EmptyRow> : (
          <div className="p-5 space-y-3">
            {!grouped && <Notice type="info">هیچ شرکتی زیر شرکت دیگری نیست. با دکمه‌ی مداد، سازمان بالادستی یک شرکت را تعیین کنید (یا هنگام ساخت شرکت).</Notice>}
            <ul className="space-y-3" data-testid="company-group">
              {roots.map((g) => <GroupNode key={g.id} group={g} depth={0} canEdit={canEdit} onOpen={onOpenCompany} onEdit={edit} />)}
            </ul>
          </div>
        )}
      </AdminCard>
      {editing && (
        <AdminDialog title={`سازمان بالادستی «${editing.name}»`} onClose={() => !busy && setEditing(null)} footer={<>
          <SecondaryButton type="button" onClick={() => setEditing(null)} disabled={busy}>انصراف</SecondaryButton>
          <PrimaryButton type="button" onClick={save} disabled={busy}>{busy && <Loader2 className="w-4 h-4 animate-spin" />} ذخیره</PrimaryButton>
        </>}>
          {error && <Notice type="error" onClose={() => setError(null)}>{error}</Notice>}
          <Field label="سازمان بالادستی" hint="سازمانی که زیرمجموعه‌ی همین شرکت نباشد. خالی: بدون سازمان بالادستی.">
            <select className={inputClass} value={parentId} onChange={(e) => setParentId(e.target.value)} autoFocus>
              <option value="">بدون سازمان بالادستی</option>
              {all.filter((x) => x.group.id !== editing.id && !descendantsOf(editing).includes(x.group.id)).map((x) => <option key={x.group.id} value={x.group.id}>{x.group.name}</option>)}
            </select>
          </Field>
        </AdminDialog>
      )}
    </div>
  );
};
