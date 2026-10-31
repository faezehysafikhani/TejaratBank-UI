import React, { useMemo, useState } from 'react';
import { ArrowLeft, Link2, Loader2, Pencil, Play, Plus, Save, Trash2 } from 'lucide-react';
import { AdminCard, AdminDialog, Field, IconAction, Notice, PrimaryButton, SecondaryButton, StatusBadge, Toggle, inputClass } from '../AdminUi';
import { userErrorMessage } from '../../../utils/errorMessages';
import { toPersianDigits } from '../../../utils/helpers';
import { appConfirm } from '../../../utils/appDialog';
import {
  type AutoLinkPlan, type AutoLinkRule, type LinkType, type OrgLineStyle,
  applyAutoLinks, createLinkType, deleteLink, deleteLinkType, listAutoLinkRules, listLinkTypes, listLinks, listNodeTypes,
  planAutoLinks, setAutoLinkRules, updateLinkType,
} from '../../../services/orgStructureApi';
import { EmptyRow, LoadingRow, useLoad } from './orgShared';
import { LINE_STYLE_TITLES, linkSentence } from './nodes/LinkDialogs';

type Message = { type: 'success' | 'error'; text: string } | null;

const LineSample: React.FC<{ style: OrgLineStyle }> = ({ style }) => (
  <svg width="44" height="10" viewBox="0 0 44 10" aria-hidden="true" className="shrink-0 text-slate-500">
    <line x1="2" y1="5" x2="42" y2="5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray={style === 'dotted' ? '1 5' : style === 'dashed' ? '8 5' : undefined} />
  </svg>
);

interface TypeDraft { id?: string; name: string; lineStyle: OrgLineStyle; countsAsManager: boolean; isActive: boolean }

/**
 * «رابطه‌ها»: the secondary links as sentences (who is linked to whom, and whether it makes a
 * manager), the link types (line style, «مدیر حساب می‌شود») and the automatic rules (a node of one
 * type made → linked to the node of another type). Advanced level.
 */
export const OrgLinksPanel: React.FC<{ canEditLinks: boolean; canManageTypes: boolean }> = ({ canEditLinks, canManageTypes }) => {
  const data = useLoad(async () => {
    const [links, linkTypes, rules, nodeTypes] = await Promise.all([listLinks(), listLinkTypes(), listAutoLinkRules().catch(() => [] as AutoLinkRule[]), listNodeTypes().catch(() => [])]);
    return { links, linkTypes, rules, nodeTypes };
  }, 'دریافت رابطه‌ها ممکن نشد.');
  const [message, setMessage] = useState<Message>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<TypeDraft | null>(null);
  const [edited, setEdited] = useState<AutoLinkRule[] | null>(null);
  const [plan, setPlan] = useState<AutoLinkPlan | null>(null);
  const [filter, setFilter] = useState('');

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

  const linkTypes = data.data?.linkTypes || [];
  const nodeTypes = data.data?.nodeTypes || [];
  const saved = data.data?.rules || [];
  const rules = edited ?? saved;
  const dirty = edited !== null && JSON.stringify(edited) !== JSON.stringify(saved);
  const typeOf = useMemo(() => new Map(linkTypes.map((t) => [t.id, t] as const)), [linkTypes]);
  const links = (data.data?.links || []).filter((l) => !filter.trim() || `${l.fromName} ${l.toName} ${l.linkTypeName}`.includes(filter.trim()));

  const saveType = async () => {
    if (!draft) return;
    const input = { name: draft.name.trim(), lineStyle: draft.lineStyle, countsAsManager: draft.lineStyle === 'dotted' ? false : draft.countsAsManager };
    if (await act(() => (draft.id ? updateLinkType(draft.id, { ...input, isActive: draft.isActive }) : createLinkType(input)), draft.id ? 'نوع رابطه ویرایش شد.' : 'نوع رابطه ساخته شد.', 'ذخیره‌ی نوع رابطه انجام نشد.')) {
      setDraft(null);
      await data.reload();
    }
  };

  if (data.loading && !data.data) return <AdminCard><LoadingRow /></AdminCard>;
  if (data.error) return <Notice type="error">{data.error}</Notice>;

  return (
    <div className="space-y-4">
      {message && <Notice type={message.type} onClose={() => setMessage(null)}>{message.text}</Notice>}

      <AdminCard>
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="text-base font-extrabold text-slate-900 dark:text-white">رابطه‌های فرعی</h3>
            <p className="text-xs text-slate-500 mt-0.5">مثلاً کمیته‌ای که با خط نقطه‌چین به هیأت مدیره وصل است. رابطه‌ی جدید را از چارت، با «افزودن مافوق دوم»، اضافه کنید.</p>
          </div>
          <input className={`${inputClass} sm:w-60`} value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="جست‌وجو در رابطه‌ها…" aria-label="جست‌وجو در رابطه‌ها" />
        </div>
        {links.length === 0 ? <EmptyRow>{filter ? 'رابطه‌ای پیدا نشد.' : 'هنوز رابطه‌ی فرعی‌ای نیست.'}</EmptyRow> : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800" data-testid="link-sentences">
            {links.map((l) => (
              <li key={l.id} className="flex items-center gap-3 px-5 py-2.5">
                <LineSample style={l.lineStyle} />
                <span className="flex-1 text-sm leading-7 text-slate-800 dark:text-slate-100">{linkSentence(l.fromName, l.toName, l)}</span>
                {canEditLinks && (
                  <IconAction icon={Trash2} tone="rose" label={`برداشتن رابطه‌ی ${l.fromName} به ${l.toName}`} disabled={busy} onClick={async () => {
                    if (await appConfirm(`رابطه‌ی «${l.fromName}» به «${l.toName}» برداشته شود؟`, { danger: true, confirmLabel: 'بردار' })) {
                      if (await act(() => deleteLink(l.id), 'رابطه برداشته شد.', 'برداشتن رابطه انجام نشد.')) await data.reload();
                    }
                  }} />
                )}
              </li>
            ))}
          </ul>
        )}
      </AdminCard>

      <AdminCard>
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="text-base font-extrabold text-slate-900 dark:text-white">نوع رابطه‌ها</h3>
            <p className="text-xs text-slate-500 mt-0.5">شکل خط در چارت و اینکه مدیر گره‌ی مقصد، مدیر حساب شود یا نه. خط نقطه‌چین هیچ‌وقت مدیر حساب نمی‌شود.</p>
          </div>
          {canManageTypes && <PrimaryButton onClick={() => setDraft({ name: '', lineStyle: 'dashed', countsAsManager: false, isActive: true })}><Plus className="w-4 h-4" /> نوع جدید</PrimaryButton>}
        </div>
        {linkTypes.length === 0 ? <EmptyRow>هنوز نوع رابطه‌ای نیست.</EmptyRow> : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {linkTypes.map((t) => (
              <div key={t.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <LineSample style={t.lineStyle} />
                <span className="min-w-0 flex-1">
                  <span className={`block text-sm font-bold ${t.isActive ? 'text-slate-900 dark:text-slate-100' : 'text-slate-400 line-through'}`}>{t.name}</span>
                  <span className="block text-[11px] text-slate-500">{LINE_STYLE_TITLES[t.lineStyle]} · {t.countsAsManager ? 'مدیر حساب می‌شود' : 'مدیر حساب نمی‌شود'} · {toPersianDigits(t.linkCount)} رابطه</span>
                </span>
                {!t.isActive && <StatusBadge tone="red">غیرفعال</StatusBadge>}
                {canManageTypes && <IconAction icon={Pencil} label={`ویرایش ${t.name}`} onClick={() => setDraft({ id: t.id, name: t.name, lineStyle: t.lineStyle, countsAsManager: t.countsAsManager, isActive: t.isActive })} />}
                {canManageTypes && <IconAction icon={Trash2} tone="rose" label={`حذف ${t.name}`} disabled={busy || t.linkCount > 0} disabledReason="نوعی که رابطه دارد حذف نمی‌شود" onClick={async () => {
                  if (await appConfirm(`نوع رابطه‌ی «${t.name}» حذف شود؟`, { danger: true, confirmLabel: 'حذف' })) {
                    if (await act(() => deleteLinkType(t.id), 'نوع رابطه حذف شد.', 'حذف نوع رابطه انجام نشد.')) await data.reload();
                  }
                }} />}
              </div>
            ))}
          </div>
        )}
      </AdminCard>

      <AdminCard>
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="text-base font-extrabold text-slate-900 dark:text-white">رابطه‌ی خودکار</h3>
            <p className="text-xs text-slate-500 mt-0.5">وقتی گره‌ای از جزء مبدأ ساخته شود، خودش به گره‌ی جزء مقصد وصل می‌شود (اگر چند گره‌ی مقصد باشد، از شما می‌پرسد). فقط برای گره‌های تازه است؛ گره‌های موجود را با «پیش‌نمایش اجرا» می‌شود یک‌جا وصل کرد.</p>
          </div>
          {canManageTypes && (
            <div className="flex items-center gap-2">
              <SecondaryButton disabled={busy || dirty} onClick={async () => { await act(async () => setPlan(await planAutoLinks()), 'طرح اجرا آماده شد؛ چیزی ذخیره نشده است.', 'ساخت پیش‌نمایش انجام نشد.'); }}><Play className="w-4 h-4" /> پیش‌نمایش اجرا</SecondaryButton>
              <PrimaryButton disabled={busy || !dirty} onClick={async () => { if (await act(() => setAutoLinkRules(rules), 'قاعده‌های رابطه‌ی خودکار ذخیره شد.', 'ذخیره‌ی قاعده‌ها انجام نشد.')) { setEdited(null); await data.reload(); } }}><Save className="w-4 h-4" /> ذخیره</PrimaryButton>
            </div>
          )}
        </div>
        <div className="p-5 space-y-2">
          {rules.length === 0 && <p className="text-sm text-slate-500">قاعده‌ای نیست.</p>}
          {rules.map((rule, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2" data-testid="auto-rule">
              <select aria-label="جزء مبدأ" disabled={!canManageTypes} className={`${inputClass} w-44`} value={rule.sourceNodeTypeId} onChange={(e) => setEdited(rules.map((r, j) => (j === i ? { ...r, sourceNodeTypeId: e.target.value } : r)))}>
                <option value="">جزء مبدأ…</option>{nodeTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <ArrowLeft className="w-4 h-4 text-slate-400" aria-hidden="true" />
              <select aria-label="نوع رابطه" disabled={!canManageTypes} className={`${inputClass} w-44`} value={rule.linkTypeId} onChange={(e) => setEdited(rules.map((r, j) => (j === i ? { ...r, linkTypeId: e.target.value } : r)))}>
                <option value="">نوع رابطه…</option>{linkTypes.filter((t) => t.isActive || t.id === rule.linkTypeId).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <ArrowLeft className="w-4 h-4 text-slate-400" aria-hidden="true" />
              <select aria-label="جزء مقصد" disabled={!canManageTypes} className={`${inputClass} w-44`} value={rule.targetNodeTypeId} onChange={(e) => setEdited(rules.map((r, j) => (j === i ? { ...r, targetNodeTypeId: e.target.value } : r)))}>
                <option value="">جزء مقصد…</option>{nodeTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              {canManageTypes && <IconAction icon={Trash2} tone="rose" label="حذف قاعده" onClick={() => setEdited(rules.filter((_, j) => j !== i))} />}
            </div>
          ))}
          {canManageTypes && <SecondaryButton onClick={() => setEdited([...rules, { sourceNodeTypeId: '', targetNodeTypeId: '', linkTypeId: '' }])}><Plus className="w-4 h-4" /> قاعده‌ی جدید</SecondaryButton>}
          {dirty && rules.some((r) => !r.sourceNodeTypeId || !r.targetNodeTypeId || !r.linkTypeId) && <p className="text-[11px] text-amber-700">قاعده‌ی ناقص ذخیره نمی‌شود: نوع مبدأ، رابطه و مقصد را کامل کنید.</p>}
        </div>
      </AdminCard>

      {plan && (
        <AdminDialog title="اجرای رابطه‌ی خودکار روی گره‌های موجود" wide onClose={() => setPlan(null)} footer={<>
          <SecondaryButton onClick={() => setPlan(null)}>بستن</SecondaryButton>
          <PrimaryButton disabled={busy || plan.links.length === 0} onClick={async () => {
            if (await act(() => applyAutoLinks(plan.links.map((l) => ({ fromNodeId: l.fromNodeId, toNodeId: l.toNodeId, linkTypeId: l.linkTypeId }))), `${toPersianDigits(plan.links.length)} رابطه اضافه شد.`, 'اضافه کردن رابطه‌ها انجام نشد.')) { setPlan(null); await data.reload(); }
          }}>{busy && <Loader2 className="w-4 h-4 animate-spin" />} اضافه کردن {toPersianDigits(plan.links.length)} رابطه</PrimaryButton>
        </>}>
          {plan.links.length === 0 && plan.ambiguous.length === 0 ? <p className="text-sm text-slate-600">همه‌ی گره‌ها همین حالا مطابق قاعده‌ها وصل‌اند.</p> : (
            <>
              <ul className="space-y-1 max-h-80 overflow-y-auto text-sm" data-scrollable>
                {plan.links.map((l, i) => <li key={i}><Link2 className="inline w-3.5 h-3.5 me-1 text-indigo-600" />«{l.fromName}» ← {l.linkTypeName} ← «{l.toName}»</li>)}
              </ul>
              {plan.ambiguous.length > 0 && <Notice type="info">{toPersianDigits(plan.ambiguous.length)} گره چند مقصد ممکن دارد و اضافه نمی‌شود: {plan.ambiguous.map((a) => a.nodeName).join('، ')}. برایشان از چارت، «افزودن مافوق دوم» را بزنید.</Notice>}
            </>
          )}
        </AdminDialog>
      )}

      {draft && (
        <AdminDialog title={draft.id ? 'ویرایش نوع رابطه' : 'نوع رابطه‌ی جدید'} onClose={() => !busy && setDraft(null)} footer={<>
          <SecondaryButton onClick={() => setDraft(null)} disabled={busy}>انصراف</SecondaryButton>
          <PrimaryButton onClick={saveType} disabled={busy || !draft.name.trim()}>{busy && <Loader2 className="w-4 h-4 animate-spin" />} ذخیره</PrimaryButton>
        </>}>
          {message?.type === 'error' && <Notice type="error" onClose={() => setMessage(null)}>{message.text}</Notice>}
          <Field label="نام" required hint="مثلاً «گزارش‌دهی نقطه‌چین»"><input className={inputClass} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} maxLength={120} autoFocus /></Field>
          <fieldset className="space-y-1.5">
            <legend className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">شکل خط</legend>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="شکل خط">
              {(Object.keys(LINE_STYLE_TITLES) as OrgLineStyle[]).map((style) => (
                <label key={style} className={`flex items-center gap-2 rounded-xl border px-3 py-2 cursor-pointer ${draft.lineStyle === style ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-950/40' : 'border-slate-200 dark:border-slate-700'}`}>
                  <input type="radio" name="line-style" className="sr-only" checked={draft.lineStyle === style} onChange={() => setDraft({ ...draft, lineStyle: style, countsAsManager: style === 'dotted' ? false : draft.countsAsManager })} />
                  <LineSample style={style} /> <span className="text-sm font-bold">{LINE_STYLE_TITLES[style]}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <Toggle checked={draft.countsAsManager} disabled={draft.lineStyle === 'dotted'} onChange={(v) => setDraft({ ...draft, countsAsManager: v })} label="مدیر گره‌ی مقصد، مدیر دوم حساب شود" description={draft.lineStyle === 'dotted' ? 'خط نقطه‌چین هیچ‌وقت مدیر حساب نمی‌شود.' : 'افراد گره‌ی مبدأ یک مدیر دوم پیدا می‌کنند؛ مدیر اصلی، زیردستان و ارجاع کارشان عوض نمی‌شود.'} />
          {draft.id && <Toggle checked={draft.isActive} onChange={(v) => setDraft({ ...draft, isActive: v })} label="فعال" />}
        </AdminDialog>
      )}
    </div>
  );
};
