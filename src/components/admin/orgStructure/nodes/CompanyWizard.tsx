// «شرکت جدید با قالب»: three short steps - name and code, the template to start from (or an empty
// company), and a summary - then the company is made with a copy of the template's structure.
import React, { useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Loader2, LayoutTemplate } from 'lucide-react';
import { AdminDialog, Field, Notice, PrimaryButton, SecondaryButton, inputClass } from '../../AdminUi';
import { userErrorMessage } from '../../../../utils/errorMessages';
import { toPersianDigits } from '../../../../utils/helpers';
import { type Company, type OrgUiLevel, type StructureTemplate, createCompany } from '../../../../services/orgStructureApi';

export const UI_LEVEL_TITLES: Record<OrgUiLevel, string> = { simple: 'ساده', normal: 'معمولی', advanced: 'پیشرفته' };

const STEPS = ['اطلاعات شرکت', 'انتخاب قالب', 'تأیید'] as const;

export const CompanyWizard: React.FC<{
  templates: StructureTemplate[];
  /** A template chosen already (from the templates page). */
  initialTemplateId?: string | null;
  /** Companies to choose a parent company (holding) from; none given: no such question (below the advanced level). */
  parentChoices?: Pick<Company, 'id' | 'name' | 'isActive'>[];
  onCreated: (company: Company) => Promise<void> | void;
  onClose: () => void;
}> = ({ templates, initialTemplateId = null, parentChoices, onCreated, onClose }) => {
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [parentId, setParentId] = useState('');
  /** '' : an empty company. */
  const [templateId, setTemplateId] = useState(initialTemplateId ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const template = templates.find((t) => t.id === templateId);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const company = await createCompany({ name: name.trim(), code: code.trim(), description: description.trim() || null, templateId: templateId || null, parentCompanyId: parentId || null });
      await onCreated(company);
      onClose();
    } catch (err) {
      setError(userErrorMessage(err, 'ساخت شرکت انجام نشد.'));
    } finally {
      setBusy(false);
    }
  };

  const canNext = step === 0 ? !!name.trim() && !!code.trim() : true;

  return (
    <AdminDialog
      title="شرکت جدید"
      wide
      onClose={() => !busy && onClose()}
      footer={<>
        <SecondaryButton type="button" onClick={onClose} disabled={busy}>انصراف</SecondaryButton>
        {step > 0 && <SecondaryButton type="button" onClick={() => { setError(null); setStep(step - 1); }} disabled={busy}><ArrowRight className="w-4 h-4" /> قبلی</SecondaryButton>}
        {step < STEPS.length - 1
          ? <PrimaryButton type="button" onClick={() => setStep(step + 1)} disabled={!canNext}>بعدی <ArrowLeft className="w-4 h-4" /></PrimaryButton>
          : <PrimaryButton type="button" onClick={create} disabled={busy || !canNext}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} ساخت شرکت</PrimaryButton>}
      </>}
    >
      <ol className="flex items-center gap-2 text-xs font-bold" aria-label="مرحله‌ها">
        {STEPS.map((title, i) => (
          <li key={title} aria-current={i === step ? 'step' : undefined} className={`flex items-center gap-1.5 rounded-full px-3 py-1 ${i === step ? 'bg-indigo-700 text-white' : i < step ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'}`}>
            <span>{toPersianDigits(i + 1)}</span> {title}
          </li>
        ))}
      </ol>
      {error && <Notice type="error" onClose={() => setError(null)}>{error}</Notice>}

      {step === 0 && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="نام شرکت" required><input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={200} autoFocus /></Field>
            <Field label="کد شرکت" required hint="کد یکتا، مثلاً TJ"><input className={`${inputClass} dir-ltr text-right`} value={code} onChange={(e) => setCode(e.target.value)} maxLength={40} /></Field>
          </div>
          <Field label="توضیحات"><textarea rows={3} className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
          {parentChoices && parentChoices.length > 0 && (
            <Field label="سازمان بالادستی (اختیاری)" hint="این شرکت زیر سازمان بالادستی‌اش در «چارت گروه» می‌آید. فقط دسته‌بندی است.">
              <select className={inputClass} value={parentId} onChange={(e) => setParentId(e.target.value)}>
                <option value="">بدون سازمان بالادستی</option>
                {parentChoices.filter((c) => c.isActive).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
          )}
        </>
      )}

      {step === 1 && (
        <fieldset className="space-y-2">
          <legend className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">ساختار اولیه</legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="radiogroup" aria-label="قالب">
            {[{ id: '', name: 'شرکت خالی', description: 'بدون ساختار؛ خودتان گره‌ها را می‌سازید.', nodeCount: 0, nodeTypeCount: 0, uiLevel: 'normal' as OrgUiLevel, isSystem: true, code: '' }, ...templates].map((t) => {
              const chosen = templateId === t.id;
              return (
                <label key={t.id || 'empty'} className={`block rounded-xl border p-3 cursor-pointer ${chosen ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 dark:border-indigo-600' : 'border-slate-200 dark:border-slate-700 hover:border-indigo-200'}`}>
                  <input type="radio" name="company-template" className="sr-only" checked={chosen} onChange={() => setTemplateId(t.id)} />
                  <span className="flex items-center gap-2 text-sm font-extrabold text-slate-900 dark:text-white"><LayoutTemplate className="w-4 h-4 text-indigo-600" /> {t.name}{!t.isSystem && <span className="text-[10px] font-bold text-emerald-700">(قالب شما)</span>}</span>
                  {t.description && <span className="block mt-1 text-[11px] leading-5 text-slate-500 line-clamp-3">{t.description}</span>}
                  {t.id && <span className="block mt-1.5 text-[11px] text-slate-500">{toPersianDigits(t.nodeCount)} گره · {toPersianDigits(t.nodeTypeCount)} جزء چارت · سطح نمایش {UI_LEVEL_TITLES[t.uiLevel] || t.uiLevel}</span>}
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      {step === 2 && (
        <div className="space-y-3 text-sm">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
            <dt className="text-slate-500">نام</dt><dd className="font-bold">{name.trim()}</dd>
            <dt className="text-slate-500">کد</dt><dd className="font-bold dir-ltr text-right">{code.trim()}</dd>
            {parentId && parentChoices && <><dt className="text-slate-500">سازمان بالادستی</dt><dd className="font-bold">{parentChoices.find((c) => c.id === parentId)?.name}</dd></>}
            <dt className="text-slate-500">قالب</dt><dd className="font-bold">{template ? template.name : 'شرکت خالی'}</dd>
            {template && template.nodeCount > 0 && <><dt className="text-slate-500">ساخته می‌شود</dt><dd>{toPersianDigits(template.nodeCount)} گره با {toPersianDigits(template.nodeTypeCount)} جزء چارت، قاعده‌های «سلسله‌مراتب مجاز» و رابطه‌های خودکار آن</dd></>}
          </dl>
          <p className="text-[11px] leading-5 text-slate-500">قالب فقط کپی می‌شود و بعد از ساخت به آن وصل نیست. پست‌ها و افراد را بعد از ساخت در چارت اضافه کنید.</p>
        </div>
      )}
    </AdminDialog>
  );
};
