import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Network, Loader2, Ban, CheckCircle2 } from 'lucide-react';
import {
  AdminCard, AdminDialog, Field, IconAction, Notice, PrimaryButton, SecondaryButton, StatusBadge, Toggle, inputClass,
} from '../AdminUi';
import { userErrorMessage } from '../../../utils/errorMessages';
import {
  Company, CompanyUnitLink, Position, createOrgUnit, createPosition, deactivateOrgUnit,
  deleteCompany, deletePosition, listCompanies, listCompanyUnits, listNodes, listOrgUnits, listTemplates, type OrgNode, type StructureTemplate,
  headTitleOf, listAssignments, listPositions, sortOrgUnits, updateOrgUnit, updatePosition, UserAssignment,
} from '../../../services/orgStructureApi';
import { EmptyRow, LoadingRow, useLoad } from './orgShared';
import { CompanyFormDialog } from './nodes/CompanyFormDialog';
import { CompanyLogo } from './nodes/CompanyLogo';

type Message = { type: 'success' | 'error'; text: string } | null;

const th = 'px-4 py-3 text-right text-xs font-bold text-slate-500 dark:text-slate-400 whitespace-nowrap';
const td = 'px-4 py-3 align-middle text-sm';

/** Runs a change, shows its result, and reloads. */
function useAction(reload: () => void, setMessage: (m: Message) => void) {
  const [busy, setBusy] = useState(false);
  const run = async (action: () => Promise<unknown>, success: string, failure: string): Promise<boolean> => {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      setMessage({ type: 'success', text: success });
      reload();
      return true;
    } catch (err) {
      setMessage({ type: 'error', text: userErrorMessage(err, failure) });
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, run };
}

// ============================================================================ companies

export const CompaniesPanel: React.FC<{ canManage: boolean; canSeeUnits: boolean; advanced?: boolean }> = ({ canManage, canSeeUnits, advanced = false }) => {
  const data = useLoad(async () => {
    const [companies, links, templates] = await Promise.all([
      listCompanies(), listCompanyUnits(),
      // Ready structures to start a company from; a backend without them: none.
      listTemplates().catch(() => [] as StructureTemplate[]),
    ]);
    return { companies, links, templates };
  }, 'دریافت فهرست شرکت‌ها ممکن نشد.');
  const [message, setMessage] = useState<Message>(null);
  /** The company being edited; null: a new one; undefined: no form open. */
  const [editing, setEditing] = useState<Company | null | undefined>(undefined);
  const [confirmDelete, setConfirmDelete] = useState<Company | null>(null);
  const { busy, run } = useAction(data.reload, setMessage);

  return (
    <div className="space-y-4">
      {message && <Notice type={message.type} onClose={() => setMessage(null)}>{message.text}</Notice>}
      <AdminCard>
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="text-base font-extrabold text-slate-900 dark:text-white">شرکت‌ها</h3>
            <p className="text-xs text-slate-500 mt-0.5">شرکت‌های این سازمان و معاونت‌هایی که هر کدام در اختیار دارد.</p>
          </div>
          {canManage && (
            <PrimaryButton onClick={() => setEditing(null)}>
              <Plus className="w-4 h-4" /> شرکت جدید
            </PrimaryButton>
          )}
        </div>
        {data.loading ? <LoadingRow /> : data.error ? <div className="p-5"><Notice type="error">{data.error}</Notice></div>
          : data.data!.companies.length === 0 ? <EmptyRow>هنوز شرکتی تعریف نشده است.</EmptyRow> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead className="bg-slate-50 dark:bg-slate-800/60"><tr>
                  <th className={th}>نام شرکت</th><th className={th}>کد</th><th className={th}>رئیس شرکت</th><th className={th}>معاونت‌ها</th><th className={th}>وضعیت</th><th className={th} />
                </tr></thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.data!.companies.map((c) => (
                    <tr key={c.id}>
                      <td className={`${td} font-bold text-slate-900 dark:text-slate-100`}><span className="flex items-center gap-2"><CompanyLogo logoUrl={c.logoUrl} name={c.name} className="w-8 h-8" fallback={null} />{c.name}</span></td>
                      <td className={`${td} dir-ltr text-right text-slate-500`}>{c.code}</td>
                      <td className={td}>{c.manager ? <>{c.manager.displayName} <span className="text-[11px] text-slate-400">({headTitleOf(c)})</span></> : '—'}</td>
                      <td className={td}>
                        <div className="flex flex-wrap gap-1">
                          {data.data!.links.filter((l) => l.companyId === c.id).map((l) => <StatusBadge key={l.unitId} tone="indigo">{l.unitName}</StatusBadge>)}
                          {c.linkedUnitIds.length === 0 && <span className="text-xs text-slate-400">—</span>}
                        </div>
                      </td>
                      <td className={td}>{c.isActive ? <StatusBadge tone="green">فعال</StatusBadge> : <StatusBadge tone="red">غیرفعال</StatusBadge>}</td>
                      <td className={`${td} whitespace-nowrap text-left`}>
                        {canManage && <IconAction icon={Pencil} label="ویرایش" onClick={() => setEditing(c)} />}
                        {canManage && <IconAction icon={Trash2} tone="rose" label="حذف" onClick={() => setConfirmDelete(c)} />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </AdminCard>

      {editing !== undefined && data.data && (
        <CompanyFormDialog
          company={editing}
          templates={data.data.templates}
          parentChoices={advanced ? data.data.companies : undefined}
          canLinkUnits={canSeeUnits}
          onSaved={async () => { setMessage({ type: 'success', text: editing ? 'شرکت ویرایش شد.' : 'شرکت ساخته شد.' }); await data.reload(); }}
          onClose={() => setEditing(undefined)}
        />
      )}

      {confirmDelete && (
        <AdminDialog
          title="حذف شرکت"
          onClose={() => setConfirmDelete(null)}
          footer={<>
            <SecondaryButton onClick={() => setConfirmDelete(null)}>انصراف</SecondaryButton>
            <PrimaryButton className="bg-rose-700 hover:bg-rose-800" disabled={busy} onClick={async () => { if (await run(() => deleteCompany(confirmDelete.id), 'شرکت حذف شد.', 'حذف شرکت انجام نشد.')) setConfirmDelete(null); }}>حذف</PrimaryButton>
          </>}
        >
          <p className="text-sm text-slate-700 dark:text-slate-300">شرکت «{confirmDelete.name}» حذف شود؟ شرکتی که معاونت یا کارمند دارد حذف نمی‌شود؛ به‌جای آن غیرفعالش کنید.</p>
        </AdminDialog>
      )}
    </div>
  );
};

// ============================================================================ units (Nexus.Organization)

interface UnitDraft { id?: string; name: string; managerUserId: string | null; managerName: string | null; isActive: boolean }

export const UnitsPanel: React.FC<{ canCreate: boolean; canUpdate: boolean; canDeactivate: boolean }> = ({ canCreate, canUpdate, canDeactivate }) => {
  const data = useLoad(async () => {
    const [units, links, nodes] = await Promise.all([
      listOrgUnits(),
      listCompanyUnits().catch(() => [] as CompanyUnitLink[]),
      // Each unit's type and the node above it; a backend without the node API: none.
      listNodes().catch(() => [] as OrgNode[]),
    ]);
    return { units, links, nodes };
  }, 'دریافت واحدهای سازمانی ممکن نشد.');
  const [message, setMessage] = useState<Message>(null);
  const [draft, setDraft] = useState<UnitDraft | null>(null);
  const { busy, run } = useAction(data.reload, setMessage);
  // A message from before the dialog opened is not the dialog's.
  const dialogOpen = !!draft;
  useEffect(() => { if (dialogOpen) setMessage(null); }, [dialogOpen]);

  const rows = useMemo(() => (data.data ? sortOrgUnits(data.data.units) : []), [data.data]);
  const companyOf = useMemo(() => {
    const map = new Map<string, string>();
    if (!data.data) return map;
    for (const link of data.data.links) map.set(link.unitId, link.companyName);
    // A nested node belongs to the company of the nearest node above it that is linked to one.
    const byId = new Map<string, OrgNode>(data.data.nodes.map((n) => [n.id, n]));
    for (const node of data.data.nodes) {
      const seen = new Set<string>();
      for (let current: OrgNode | undefined = node; current && !seen.has(current.id); current = current.parentNodeId ? byId.get(current.parentNodeId) : undefined) {
        seen.add(current.id);
        const name = map.get(current.id);
        if (name) { map.set(node.id, name); break; }
      }
    }
    return map;
  }, [data.data]);
  const nodeOf = useMemo(() => new Map((data.data?.nodes || []).map((n) => [n.id, n])), [data.data]);
  const hasNodes = (data.data?.nodes.length ?? 0) > 0;
  const save = async () => {
    if (!draft) return;
    const ok = await run(
      () => draft.id
        ? updateOrgUnit(draft.id, { name: draft.name, managerUserId: draft.managerUserId, isActive: draft.isActive })
        : createOrgUnit({ name: draft.name }),
      draft.id ? 'واحد ویرایش شد.' : 'واحد ایجاد شد.',
      'ذخیره واحد انجام نشد.',
    );
    if (ok) setDraft(null);
  };

  return (
    <div className="space-y-4">
      {message && !(draft && message.type === 'error') && <Notice type={message.type} onClose={() => setMessage(null)}>{message.text}</Notice>}
      <AdminCard>
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="text-base font-extrabold text-slate-900 dark:text-white">معاونت‌ها و واحدها</h3>
            <p className="text-xs text-slate-500 mt-0.5">درخت واحدهای سازمانی. مدیر هر معاونت، دارندهٔ پست بالای آن در چارت سازمانی است.</p>
          </div>
          {canCreate && (
            <PrimaryButton onClick={() => setDraft({ name: '', managerUserId: null, managerName: null, isActive: true })}>
              <Plus className="w-4 h-4" /> واحد جدید
            </PrimaryButton>
          )}
        </div>
        {data.loading ? <LoadingRow /> : data.error ? <div className="p-5"><Notice type="error">{data.error}</Notice></div>
          : rows.length === 0 ? <EmptyRow>هنوز واحدی تعریف نشده است.</EmptyRow> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead className="bg-slate-50 dark:bg-slate-800/60"><tr>
                  <th className={th}>نام واحد</th>
                  {hasNodes && <th className={th}>جزء چارت</th>}
                  {hasNodes && <th className={th}>مافوق</th>}
                  <th className={th}>شرکت</th><th className={th}>وضعیت</th><th className={th} />
                </tr></thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {rows.map((u) => (
                    <tr key={u.id}>
                      <td className={td}>
                        <span className="flex items-center gap-2 font-bold text-slate-900 dark:text-slate-100">
                          <Network className="w-4 h-4 shrink-0 text-indigo-600" /> {u.name}
                        </span>
                      </td>
                      {hasNodes && <td className={td}>{nodeOf.get(u.id)?.nodeTypeName || <span className="text-xs text-slate-400">—</span>}</td>}
                      {hasNodes && <td className={td}>{(nodeOf.get(u.id)?.parentNodeId && nodeOf.get(nodeOf.get(u.id)!.parentNodeId!)?.name) || <span className="text-xs text-slate-400">بالاترین سطح</span>}</td>}
                      <td className={td}>{companyOf.get(u.id) || <span className="text-xs text-slate-400">بدون شرکت</span>}</td>
                      <td className={td}>{u.isActive ? <StatusBadge tone="green">فعال</StatusBadge> : <StatusBadge tone="red">غیرفعال</StatusBadge>}</td>
                      <td className={`${td} whitespace-nowrap text-left`}>
                        {canUpdate && (
                          <IconAction icon={Pencil} label="ویرایش" onClick={() => setDraft({ id: u.id, name: u.name, managerUserId: u.managerUserId, managerName: null, isActive: u.isActive })} />
                        )}
                        {canDeactivate && u.isActive && (
                          <IconAction icon={Ban} tone="rose" label="غیرفعال کردن" disabled={busy} onClick={() => run(() => deactivateOrgUnit(u.id), 'واحد غیرفعال شد.', 'غیرفعال کردن واحد انجام نشد.')} />
                        )}
                        {canUpdate && !u.isActive && (
                          <IconAction
                            icon={CheckCircle2}
                            tone="emerald"
                            label="فعال‌سازی"
                            disabled={busy}
                            onClick={() => run(
                              () => updateOrgUnit(u.id, { name: u.name, managerUserId: u.managerUserId, isActive: true }),
                              'واحد فعال شد.',
                              'فعال‌سازی واحد انجام نشد.',
                            )}
                          />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </AdminCard>

      {draft && (
        <AdminDialog
          title={draft.id ? 'ویرایش واحد' : 'واحد جدید'}
          onClose={() => setDraft(null)}
          footer={<>
            <SecondaryButton onClick={() => setDraft(null)}>انصراف</SecondaryButton>
            <PrimaryButton onClick={save} disabled={busy || !draft.name.trim()}>{busy && <Loader2 className="w-4 h-4 animate-spin" />} ذخیره</PrimaryButton>
          </>}
        >
          {/* An error of this dialog shows in it, not behind it. */}
          {message?.type === 'error' && <Notice type="error" onClose={() => setMessage(null)}>{message.text}</Notice>}
          <Field label="نام واحد" required hint="مثلاً «معاونت فناوری اطلاعات»"><input className={inputClass} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Field>
          {draft.id && (
            <>
              <Toggle checked={draft.isActive} onChange={(v) => setDraft({ ...draft, isActive: v })} label="واحد فعال است" />
            </>
          )}
        </AdminDialog>
      )}
    </div>
  );
};

// ============================================================================ positions

interface PositionDraft { id?: string; title: string; parentPositionId: string | null; isActive: boolean; companyIds: string[] }

/**
 * In each company the one position with no superior is the head's (رئیس کل): the only such one,
 * or else the one its head holds. Any other position with no superior still needs one.
 */
function headPositionIds(positions: Position[], companies: Company[], assignments: UserAssignment[]): Set<string> {
  const heads = new Set<string>();
  for (const company of companies) {
    const roots = positions.filter((p) => !p.parentPositionId && (p.companyIds || []).includes(company.id));
    const held = assignments.find((a) => a.userId === company.manager?.userId && a.companyId === company.id && !a.unitId)?.positionId;
    const head = roots.length === 1 ? roots[0] : roots.find((p) => p.id === held);
    if (head) heads.add(head.id);
  }
  return heads;
}

export const PositionsPanel: React.FC<{ canManage: boolean }> = ({ canManage }) => {
  const data = useLoad(async () => {
    const [positions, companies, assignments] = await Promise.all([
      listPositions(), listCompanies(), listAssignments().catch(() => [] as UserAssignment[]),
    ]);
    return { positions, companies, assignments };
  }, 'دریافت فهرست سمت‌ها ممکن نشد.');
  const [message, setMessage] = useState<Message>(null);
  const [draft, setDraft] = useState<PositionDraft | null>(null);
  const { busy, run } = useAction(data.reload, setMessage);
  // A message from before the dialog opened is not the dialog's.
  const dialogOpen = !!draft;
  useEffect(() => { if (dialogOpen) setMessage(null); }, [dialogOpen]);

  const positions = data.data?.positions || [];
  const companies = data.data?.companies || [];
  const companyName = (id: string) => companies.find((c) => c.id === id)?.name || 'شرکت حذف‌شده';
  const heads = useMemo(
    () => headPositionIds(data.data?.positions || [], data.data?.companies || [], data.data?.assignments || []),
    [data.data],
  );

  // A superior: not the position itself or one below it, and for every company chosen.
  const parentOptions = useMemo(() => {
    if (!draft) return [];
    const descendants = new Set<string>(draft.id ? [draft.id] : []);
    let changed = true;
    while (changed) {
      changed = false;
      for (const position of positions) {
        if (position.parentPositionId && descendants.has(position.parentPositionId) && !descendants.has(position.id)) {
          descendants.add(position.id);
          changed = true;
        }
      }
    }
    return positions.filter((position) => !descendants.has(position.id)
      && draft.companyIds.every((id) => (position.companyIds || []).includes(id)));
  }, [positions, draft]);

  const save = async () => {
    if (!draft) return;
    const ok = await run(
      () => (draft.id
        ? updatePosition(draft.id, draft.title, draft.parentPositionId, draft.isActive, draft.companyIds)
        : createPosition(draft.title, draft.parentPositionId, draft.companyIds)),
      draft.id ? 'سمت ویرایش شد.' : 'سمت ایجاد شد.',
      'ذخیره سمت انجام نشد.',
    );
    if (ok) setDraft(null);
  };

  const toggleCompany = (id: string) => {
    if (!draft) return;
    const companyIds = draft.companyIds.includes(id) ? draft.companyIds.filter((c) => c !== id) : [...draft.companyIds, id];
    const parent = positions.find((p) => p.id === draft.parentPositionId);
    const parentStillFits = !parent || companyIds.every((c) => (parent.companyIds || []).includes(c));
    setDraft({ ...draft, companyIds, parentPositionId: parentStillFits ? draft.parentPositionId : null });
  };

  return (
    <div className="space-y-4">
      {message && !(draft && message.type === 'error') && <Notice type={message.type} onClose={() => setMessage(null)}>{message.text}</Notice>}
      <AdminCard>
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="text-base font-extrabold text-slate-900 dark:text-white">سمت‌ها</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              عنوان‌های شغلی هر شرکت، مثل کارشناس، رئیس اداره و معاون. (جدا از نقش‌های دسترسی)
              در هر شرکت فقط سمت رئیس کل بدون مافوق است؛ کسی که این سمت را مستقیم در شرکت بگیرد رئیس کل آن شرکت می‌شود.
            </p>
          </div>
          {canManage && (
            <PrimaryButton onClick={() => setDraft({ title: '', parentPositionId: null, isActive: true, companyIds: companies.length === 1 ? [companies[0].id] : [] })}>
              <Plus className="w-4 h-4" /> سمت جدید
            </PrimaryButton>
          )}
        </div>
        {data.loading ? <LoadingRow /> : data.error ? <div className="p-5"><Notice type="error">{data.error}</Notice></div>
          : positions.length === 0 ? <EmptyRow>هنوز سمتی تعریف نشده است.</EmptyRow> : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {positions.map((p: Position) => {
                const companyIds = p.companyIds || [];
                return (
                  <div key={p.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="flex flex-wrap items-center gap-2 min-w-0">
                      <span className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">{p.title}</span>
                      {heads.has(p.id) && <StatusBadge tone="amber">رئیس کل</StatusBadge>}
                      {p.parentPositionId && <span className="text-xs text-slate-500 truncate">مافوق: {positions.find((parent) => parent.id === p.parentPositionId)?.title || 'سمت حذف‌شده'}</span>}
                      {!p.parentPositionId && !heads.has(p.id) && companyIds.length > 0 && (
                        <StatusBadge tone="red" title="در هر شرکت فقط سمت رئیس کل بدون مافوق است؛ برای این سمت مافوق تعیین کنید.">مافوق تعیین نشده</StatusBadge>
                      )}
                      {companyIds.length === 0 && <StatusBadge tone="red" title="این سمت به هیچ کاربری داده نمی‌شود تا شرکتش تعیین شود.">بدون شرکت</StatusBadge>}
                      {companyIds.map((id) => <StatusBadge key={id} tone="indigo">{companyName(id)}</StatusBadge>)}
                      {!p.isActive && <StatusBadge tone="red">غیرفعال</StatusBadge>}
                    </div>
                    {canManage && (
                      <div className="whitespace-nowrap">
                        <IconAction icon={Pencil} label="ویرایش" onClick={() => setDraft({ id: p.id, title: p.title, parentPositionId: p.parentPositionId, isActive: p.isActive, companyIds })} />
                        <IconAction icon={Trash2} tone="rose" label="حذف" disabled={busy} onClick={() => run(() => deletePosition(p.id), 'سمت حذف شد.', 'حذف سمت انجام نشد.')} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
      </AdminCard>

      {draft && (
        <AdminDialog
          title={draft.id ? 'ویرایش سمت' : 'سمت جدید'}
          onClose={() => setDraft(null)}
          footer={<>
            <SecondaryButton onClick={() => setDraft(null)}>انصراف</SecondaryButton>
            <PrimaryButton onClick={save} disabled={busy || !draft.title.trim() || draft.companyIds.length === 0}>{busy && <Loader2 className="w-4 h-4 animate-spin" />} ذخیره</PrimaryButton>
          </>}
        >
          {/* An error of this dialog shows in it, not behind it. */}
          {message?.type === 'error' && <Notice type="error" onClose={() => setMessage(null)}>{message.text}</Notice>}
          <Field label="عنوان سمت" required><input className={inputClass} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></Field>
          <Field label="شرکت‌ها" required hint="این سمت فقط به کاربران و معاونت‌های این شرکت‌ها داده می‌شود.">
            {companies.length === 0 ? (
              <p className="text-xs text-rose-600">ابتدا در بخش «شرکت‌ها» شرکت تعریف کنید.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {companies.map((c) => (
                  <label key={c.id} className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-sm cursor-pointer ${draft.companyIds.includes(c.id) ? 'border-indigo-400 bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'}`}>
                    <input type="checkbox" className="accent-indigo-600" checked={draft.companyIds.includes(c.id)} onChange={() => toggleCompany(c.id)} />
                    {c.name}
                  </label>
                ))}
              </div>
            )}
          </Field>
          <Field label="سمت مافوق" hint="فقط سمت‌هایی که برای همهٔ شرکت‌های انتخاب‌شده هستند. بدون مافوق یعنی سمت رئیس کل (هر شرکت فقط یکی).">
            <select className={inputClass} value={draft.parentPositionId || ''} onChange={(e) => setDraft({ ...draft, parentPositionId: e.target.value || null })}>
              <option value="">— بدون مافوق (رئیس کل شرکت) —</option>
              {parentOptions.map((position) => <option key={position.id} value={position.id}>{position.title}</option>)}
            </select>
          </Field>
          {draft.id && <Toggle checked={draft.isActive} onChange={(v) => setDraft({ ...draft, isActive: v })} label="سمت فعال است" description="سمت غیرفعال برای انتصاب جدید قابل انتخاب نیست." />}
        </AdminDialog>
      )}
    </div>
  );
};
