import React, { useMemo, useState } from 'react';
import { AlertTriangle, Briefcase, Loader2, Pencil, Plus, Save, Trash2, Undo2 } from 'lucide-react';
import { AdminCard, AdminDialog, Field, IconAction, Notice, PrimaryButton, SecondaryButton, StatusBadge, Toggle, inputClass } from '../AdminUi';
import { userErrorMessage } from '../../../utils/errorMessages';
import { toPersianDigits } from '../../../utils/helpers';
import { appConfirm } from '../../../utils/appDialog';
import {
  type ChartNodeType, type NodeType, type NodeTypeRule as ApiRule, type RuleConflict,
  createNodeType, deleteNodeType, getChart, getNodeTypeRules, listNodeTypes, setNodeTypeRules, updateNodeType,
} from '../../../services/orgStructureApi';
import { EmptyRow, LoadingRow, useLoad } from './orgShared';
import { NodeTypeRulesMatrix, ruleUsage, type NodeTypeRule } from './nodes/NodeTypeRulesMatrix';
import { NodeTypeStylePicker, type NodeTypeStyle } from './nodes/NodeTypeStylePicker';
import { NodeTypeBadge, NodeTypeIcon, safeColor } from './nodes/nodeTypeStyle';
import { allUnitsOf } from './orgChartModel';
import { PostPatternDialog } from './nodes/PostPatternDialog';

type Message = { type: 'success' | 'error'; text: string } | null;

const toMatrix = (rules: ApiRule[]): NodeTypeRule[] => rules.map((r) => ({ parentTypeId: r.parentNodeTypeId, childTypeId: r.childNodeTypeId }));
const toApi = (rules: NodeTypeRule[]): ApiRule[] => rules.map((r) => ({ parentNodeTypeId: r.parentTypeId, childNodeTypeId: r.childTypeId }));
const asChartType = (t: NodeType): ChartNodeType => ({ nodeTypeId: t.id, name: t.name, color: t.color, icon: t.icon, isDomainBoundary: t.isDomainBoundary });
const sameRules = (a: NodeTypeRule[], b: NodeTypeRule[]) => {
  const key = (r: NodeTypeRule) => `${r.parentTypeId ?? 'company'}>${r.childTypeId}`;
  return a.length === b.length && a.every((r) => b.some((x) => key(x) === key(r)));
};

interface TypeDraft { id?: string; name: string; style: NodeTypeStyle; isDomainBoundary: boolean; isActive: boolean }

/**
 * «قواعد ساختار» (only with the rules permission): the node types - their name, colour, icon and
 * whether a node of the type starts its own «معاونت» - and the table of what may sit under what.
 * Changing a rule never deletes a node: the nodes that no longer match are listed, to be moved.
 */
export const OrgRulesPanel: React.FC<{ canApplyPosts?: boolean }> = ({ canApplyPosts = false }) => {
  const data = useLoad(async () => {
    const [types, rules, chart] = await Promise.all([listNodeTypes(), getNodeTypeRules(), getChart().catch(() => [])]);
    return { types, rules, chart };
  }, 'دریافت قواعد ساختار ممکن نشد.');
  const [message, setMessage] = useState<Message>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<TypeDraft | null>(null);
  /** The rules being edited; null: as saved. */
  const [edited, setEdited] = useState<NodeTypeRule[] | null>(null);
  const [conflicts, setConflicts] = useState<RuleConflict[] | null>(null);
  const [patternOf, setPatternOf] = useState<NodeType | null>(null);

  const types = data.data?.types || [];
  const saved = useMemo(() => toMatrix(data.data?.rules.rules || []), [data.data]);
  const current = edited ?? saved;
  const dirty = edited !== null && !sameRules(edited, saved);
  const shownConflicts = conflicts ?? data.data?.rules.conflicts ?? [];
  const usage = useMemo(() => {
    const total: Record<string, number> = {};
    for (const company of data.data?.chart || []) {
      for (const [key, count] of Object.entries(ruleUsage(allUnitsOf(company))) as [string, number][]) total[key] = (total[key] ?? 0) + count;
    }
    return total;
  }, [data.data]);
  /** Nodes that the rules being edited would no longer match (before saving). */
  const wouldConflict = useMemo(() => {
    const allowed = new Set(current.map((r) => `${r.parentTypeId ?? 'company'}>${r.childTypeId}`));
    return (Object.entries(usage) as [string, number][]).filter(([key]) => !allowed.has(key)).reduce((sum, [, count]) => sum + count, 0);
  }, [current, usage]);

  const act = async (action: () => Promise<unknown>, success: string, failure: string): Promise<boolean> => {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      setMessage({ type: 'success', text: success });
      return true;
    } catch (err) {
      setMessage({ type: 'error', text: userErrorMessage(err, failure) });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const saveRules = async () => {
    if (!edited) return;
    if (wouldConflict > 0 && !(await appConfirm(
      `${toPersianDigits(wouldConflict)} گره‌ی موجود با قاعده‌های جدید جور نیست. این گره‌ها حذف یا جابه‌جا نمی‌شوند؛ فقط در فهرست «ناسازگار» می‌آیند تا خودتان جابه‌جایشان کنید. قاعده‌ها ذخیره شود؟`,
      { confirmLabel: 'ذخیره‌ی قاعده‌ها', danger: true },
    ))) return;
    let result: Awaited<ReturnType<typeof setNodeTypeRules>> | null = null;
    const ok = await act(async () => { result = await setNodeTypeRules(toApi(edited)); }, 'قاعده‌ها ذخیره شد.', 'ذخیره‌ی قاعده‌ها انجام نشد.');
    if (ok && result) {
      setEdited(null);
      setConflicts(result.conflicts);
      await data.reload();
    }
  };

  const saveType = async () => {
    if (!draft) return;
    const ok = await act(
      () => (draft.id
        ? updateNodeType(draft.id, { name: draft.name.trim(), color: draft.style.color, icon: draft.style.icon, isDomainBoundary: draft.isDomainBoundary, sortOrder: types.find((t) => t.id === draft.id)?.sortOrder ?? 0, isActive: draft.isActive })
        : createNodeType({ name: draft.name.trim(), color: draft.style.color, icon: draft.style.icon, isDomainBoundary: draft.isDomainBoundary })),
      draft.id ? 'جزء چارت ویرایش شد.' : 'جزء چارت ساخته شد.',
      'ذخیره‌ی جزء چارت انجام نشد.',
    );
    if (ok) { setDraft(null); await data.reload(); }
  };

  const removeType = async (type: NodeType) => {
    if (!(await appConfirm(`جزء چارت «${type.name}» حذف شود؟`, { danger: true, confirmLabel: 'حذف' }))) return;
    if (await act(() => deleteNodeType(type.id), 'جزء چارت حذف شد.', 'حذف جزء چارت انجام نشد.')) await data.reload();
  };

  if (data.loading && !data.data) return <AdminCard><LoadingRow /></AdminCard>;
  if (data.error) return <Notice type="error">{data.error}</Notice>;

  return (
    <div className="space-y-4">
      {message && <Notice type={message.type} onClose={() => setMessage(null)}>{message.text}</Notice>}

      <AdminCard>
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="text-base font-extrabold text-slate-900 dark:text-white">اجزای چارت</h3>
            <p className="text-xs text-slate-500 mt-0.5">«معاونت»، «اداره کل»، «کمیته»… هر جزء رنگ و آیکون خودش را دارد. جزئی که «معاونت جدا» باشد، افراد زیرمجموعه‌اش را هم‌معاونت حساب می‌کند.</p>
          </div>
          <PrimaryButton onClick={() => setDraft({ name: '', style: { color: '#2563eb', icon: 'folder' }, isDomainBoundary: true, isActive: true })}>
            <Plus className="w-4 h-4" /> جزء جدید
          </PrimaryButton>
        </div>
        {types.length === 0 ? <EmptyRow>هنوز جزئی برای چارت تعریف نشده است؛ شرکت بدون اجزای چارت، ساختار مسطح دارد.</EmptyRow> : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {types.map((type) => (
              <div key={type.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${safeColor(type.color)}1a`, color: safeColor(type.color) }}><NodeTypeIcon icon={type.icon} className="w-[18px] h-[18px]" /></span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-sm font-bold ${type.isActive ? 'text-slate-900 dark:text-slate-100' : 'text-slate-400 line-through'}`}>{type.name}</span>
                  <span className="block text-[11px] text-slate-500">{toPersianDigits(type.nodeCount)} گره{type.isDomainBoundary ? ' · معاونت جدا (مرز هم‌معاونت)' : ''}</span>
                </span>
                {!type.isActive && <StatusBadge tone="red">غیرفعال</StatusBadge>}
                <IconAction icon={Briefcase} label={`پست‌های پیش‌فرض ${type.name}`} onClick={() => setPatternOf(type)} />
                <IconAction icon={Pencil} label={`ویرایش ${type.name}`} onClick={() => setDraft({ id: type.id, name: type.name, style: { color: type.color, icon: type.icon }, isDomainBoundary: type.isDomainBoundary, isActive: type.isActive })} />
                <IconAction icon={Trash2} tone="rose" label={`حذف ${type.name}`} disabled={busy || type.nodeCount > 0} disabledReason="جزئی که گره‌ای از آن دارد حذف نمی‌شود" onClick={() => removeType(type)} />
              </div>
            ))}
          </div>
        )}
      </AdminCard>

      <AdminCard>
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="text-base font-extrabold text-slate-900 dark:text-white">سلسله‌مراتب مجاز</h3>
            <p className="text-xs text-slate-500 mt-0.5">هر ردیف یک جزء «والد» است؛ ستون‌هایی که تیک دارند، اجزایی‌اند که می‌شود زیرش گذاشت. ردیف اول: مستقیم زیر شرکت. بدون هیچ تیکی، ساختار مسطح است.</p>
          </div>
          <div className="flex items-center gap-2">
            {dirty && <SecondaryButton onClick={() => setEdited(null)} disabled={busy}><Undo2 className="w-4 h-4" /> بازگرداندن</SecondaryButton>}
            <PrimaryButton onClick={saveRules} disabled={busy || !dirty}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} ذخیره‌ی قاعده‌ها</PrimaryButton>
          </div>
        </div>
        <div className="p-5 space-y-3">
          {current.length === 0 && types.length > 0 && (
            <Notice type="info">هنوز هیچ قاعده‌ای تیک نخورده است: همه‌ی گره‌ها در بالاترین سطح می‌مانند و جابه‌جایی «زیر گره‌ی دیگر» ممکن نیست.</Notice>
          )}
          <NodeTypeRulesMatrix types={types.filter((t) => t.isActive || usage[`company>${t.id}`] !== undefined || current.some((r) => r.childTypeId === t.id || r.parentTypeId === t.id)).map(asChartType)} rules={current} onChange={setEdited} usage={usage} />
          {dirty && wouldConflict > 0 && (
            <p className="text-[11px] text-amber-700 dark:text-amber-300">با این تغییر {toPersianDigits(wouldConflict)} گره‌ی موجود ناسازگار می‌شود؛ هنگام ذخیره از شما تأیید گرفته می‌شود.</p>
          )}
        </div>
      </AdminCard>

      <AdminCard>
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <h3 className="flex items-center gap-2 text-base font-extrabold text-slate-900 dark:text-white">
            <AlertTriangle className={`w-5 h-5 ${shownConflicts.length ? 'text-amber-600' : 'text-slate-400'}`} /> گره‌های ناسازگار با قاعده‌ها
            {shownConflicts.length > 0 && <StatusBadge tone="amber">{toPersianDigits(shownConflicts.length)}</StatusBadge>}
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">این گره‌ها حذف نشده‌اند و کار می‌کنند؛ فقط جایشان با قاعده‌ی فعلی نمی‌خواند. در چارت، آن‌ها را جابه‌جا کنید.</p>
        </div>
        {shownConflicts.length === 0 ? <EmptyRow>همه‌ی گره‌ها با قاعده‌ها می‌خوانند.</EmptyRow> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px]" data-testid="conflicts">
              <thead className="bg-slate-50 dark:bg-slate-800/60"><tr>
                <th className="px-4 py-2 text-right text-xs font-bold text-slate-500">گره</th>
                <th className="px-4 py-2 text-right text-xs font-bold text-slate-500">جزء چارت</th>
                <th className="px-4 py-2 text-right text-xs font-bold text-slate-500">فعلاً زیر</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {shownConflicts.map((c) => (
                  <tr key={c.nodeId}>
                    <td className="px-4 py-2 text-sm font-bold text-slate-800 dark:text-slate-100">{c.nodeName}</td>
                    <td className="px-4 py-2 text-xs text-slate-600 dark:text-slate-300">{c.nodeTypeName || '—'}</td>
                    <td className="px-4 py-2 text-xs text-slate-600 dark:text-slate-300">{c.parentName ? `${c.parentName}${c.parentTypeName ? ` (${c.parentTypeName})` : ''}` : 'بالاترین سطح'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminCard>

      {patternOf && <PostPatternDialog type={patternOf} canSave canApply={canApplyPosts} onClose={() => { setPatternOf(null); void data.reload(); }} />}

      {draft && (
        <AdminDialog
          title={draft.id ? 'ویرایش جزء چارت' : 'جزء جدید چارت'}
          onClose={() => !busy && setDraft(null)}
          footer={<>
            <SecondaryButton onClick={() => setDraft(null)} disabled={busy}>انصراف</SecondaryButton>
            <PrimaryButton onClick={saveType} disabled={busy || !draft.name.trim()}>{busy && <Loader2 className="w-4 h-4 animate-spin" />} ذخیره</PrimaryButton>
          </>}
        >
          {message?.type === 'error' && <Notice type="error" onClose={() => setMessage(null)}>{message.text}</Notice>}
          <Field label="نام جزء" required hint="مثلاً «معاونت»، «اداره کل»، «کمیته»"><input className={inputClass} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} maxLength={120} autoFocus /></Field>
          <NodeTypeStylePicker value={draft.style} onChange={(style) => setDraft({ ...draft, style })} previewName={draft.name.trim() || 'نمونه'} />
          <Toggle checked={draft.isDomainBoundary} onChange={(v) => setDraft({ ...draft, isDomainBoundary: v })} label="معاونتِ جدا (مرز هم‌معاونت)" description="کارکنان یک گره از این نوع، «هم‌معاونت» حساب می‌شوند؛ گره‌ی دیگر جزو معاونت نزدیک‌ترین گره‌ی بالایی است که این‌طور باشد." />
          {draft.id && <Toggle checked={draft.isActive} onChange={(v) => setDraft({ ...draft, isActive: v })} label="فعال" description="جزء غیرفعال برای گره‌ی تازه پیشنهاد نمی‌شود؛ گره‌های موجود می‌مانند." />}
        </AdminDialog>
      )}
    </div>
  );
};
