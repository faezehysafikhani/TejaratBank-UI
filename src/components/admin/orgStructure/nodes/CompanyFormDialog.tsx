// «شرکت جدید» / «ویرایش اطلاعات شرکت»: the company's name, contact and registration details, logo,
// what its head is called on the chart, the organization above it, the template to start from
// (new only) and which deputies belong to it - all in one form, saved together.
import React, { useEffect, useMemo, useState } from 'react';
import { ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { AdminDialog, Field, Notice, PrimaryButton, SecondaryButton, Toggle, inputClass } from '../../AdminUi';
import { userErrorMessage } from '../../../../utils/errorMessages';
import { toPersianDigits } from '../../../../utils/helpers';
import {
  type Company, type CompanyDetails, type CompanyUnitLink, type OrgNode, type OrgUnit, type StructureTemplate,
  companyLogoUrl, createCompany, linkUnitToCompany, listCompanyUnits, listNodes, listOrgUnits, removeCompanyLogo,
  setCompanyDetails, setCompanyLogo, setCompanyParent, unlinkUnit, updateCompany,
} from '../../../../services/orgStructureApi';
import { useLoad } from '../orgShared';
import { UI_LEVEL_TITLES } from './CompanyWizard';

const MAX_LOGO_BYTES = 512 * 1024;
const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

/** A deputy that can belong to this company: a top one, with no company or this one. */
interface UnitChoice { id: string; name: string }

export const CompanyFormDialog: React.FC<{
  /** The company to edit; none: a new one. */
  company?: Company | null;
  /** Ready structures to start a new company from (none: no such question). */
  templates?: StructureTemplate[];
  initialTemplateId?: string | null;
  /** Companies to choose the organization above from; none given: no such question. */
  parentChoices?: Pick<Company, 'id' | 'name' | 'isActive'>[];
  /** Whether deputies can be chosen here (the user may see and link units). */
  canLinkUnits?: boolean;
  onSaved: (company: Company) => Promise<void> | void;
  onClose: () => void;
}> = ({ company, templates = [], initialTemplateId = null, parentChoices, canLinkUnits = true, onSaved, onClose }) => {
  const editing = !!company;
  const [name, setName] = useState(company?.name ?? '');
  const [details, setDetails] = useState<Required<{ [K in keyof CompanyDetails]: string }>>({
    phone: company?.phone ?? '', email: company?.email ?? '', website: company?.website ?? '', nationalId: company?.nationalId ?? '',
    economicCode: company?.economicCode ?? '', address: company?.address ?? '', headTitle: company?.headTitle ?? '',
  });
  const [description, setDescription] = useState(company?.description ?? '');
  const [isActive, setIsActive] = useState(company?.isActive ?? true);
  const [parentId, setParentId] = useState(company?.parentCompanyId ?? '');
  const [templateId, setTemplateId] = useState(initialTemplateId ?? '');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [logoPreview, setLogoPreview] = useState('');
  const [unitIds, setUnitIds] = useState<string[]>(company?.linkedUnitIds ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The deputies to choose from: top ones with no company yet, and (when editing) this company's own.
  const units = useLoad(async (): Promise<{ choices: UnitChoice[]; links: CompanyUnitLink[] }> => {
    if (!canLinkUnits) return { choices: [], links: [] };
    const [links, nodes] = await Promise.all([
      listCompanyUnits().catch(() => [] as CompanyUnitLink[]),
      listNodes().catch(() => null as OrgNode[] | null),
    ]);
    const linked = new Map(links.map((l) => [l.unitId, l.companyId]));
    const tops: { id: string; name: string; isActive: boolean }[] = nodes
      ? nodes.filter((n) => !n.parentNodeId).map((n) => ({ id: n.id, name: n.name, isActive: n.isActive !== false }))
      : (await listOrgUnits().catch(() => [] as OrgUnit[])).map((u) => ({ id: u.id, name: u.name, isActive: u.isActive }));
    const choices = tops
      .filter((u) => (u.isActive && !linked.has(u.id)) || (company && linked.get(u.id) === company.id))
      .sort((a, b) => a.name.localeCompare(b.name, 'fa'));
    return { choices, links };
  }, 'دریافت فهرست معاونت‌ها ممکن نشد.');

  // The logo now: a new file, the saved one, or none.
  useEffect(() => {
    let alive = true;
    let objectUrl = '';
    if (logoFile) {
      objectUrl = URL.createObjectURL(logoFile);
      setLogoPreview(objectUrl);
    } else if (!removeLogo && company?.logoUrl) {
      void companyLogoUrl(company.logoUrl).then((url) => { if (alive) setLogoPreview(url); });
    } else {
      setLogoPreview('');
    }
    return () => { alive = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [logoFile, removeLogo, company?.logoUrl]);

  const pickLogo = (file: File | undefined) => {
    if (!file) return;
    if (!LOGO_TYPES.includes(file.type)) { setError('لوگو باید تصویر PNG، JPEG یا WebP باشد.'); return; }
    if (file.size > MAX_LOGO_BYTES) { setError('لوگو حداکثر ۵۱۲ کیلوبایت می‌تواند باشد.'); return; }
    setError(null);
    setLogoFile(file);
    setRemoveLogo(false);
  };

  const template = templates.find((t) => t.id === templateId);
  const set = (key: keyof CompanyDetails) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDetails({ ...details, [key]: e.target.value });
  const detailsInput = (): CompanyDetails => Object.fromEntries(Object.entries(details).map(([k, v]) => [k, String(v).trim() || null])) as CompanyDetails;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      let saved: Company;
      if (!company) {
        saved = await createCompany({
          name: name.trim(), description: description.trim() || null, templateId: templateId || null, parentCompanyId: parentId || null,
          details: detailsInput(), unitIds,
        });
      } else {
        // The name and state, then the details (they replace all of them), the organization above and the deputies.
        saved = await updateCompany(company.id, { name: name.trim(), code: company.code, description: description.trim() || null, isActive });
        saved = await setCompanyDetails(company.id, detailsInput());
        if (parentChoices && (company.parentCompanyId ?? '') !== parentId) await setCompanyParent(company.id, parentId || null);
        const before = new Set(company.linkedUnitIds);
        for (const id of unitIds.filter((u) => !before.has(u))) await linkUnitToCompany(id, company.id);
        for (const id of company.linkedUnitIds.filter((u) => !unitIds.includes(u))) await unlinkUnit(id);
      }
      if (logoFile) saved = await setCompanyLogo(saved.id, logoFile);
      else if (removeLogo && company?.logoUrl) saved = await removeCompanyLogo(saved.id);
      await onSaved(saved);
      onClose();
    } catch (err) {
      setError(userErrorMessage(err, editing ? 'ذخیره‌ی شرکت انجام نشد.' : 'ساخت شرکت انجام نشد.'));
    } finally {
      setBusy(false);
    }
  };

  const unitChoices = units.data?.choices ?? [];
  const chosenCount = useMemo(() => unitIds.filter((id) => unitChoices.some((u) => u.id === id)).length, [unitIds, unitChoices]);

  return (
    <AdminDialog
      title={editing ? 'ویرایش اطلاعات شرکت' : 'شرکت جدید'}
      wide
      onClose={() => !busy && onClose()}
      footer={<>
        <SecondaryButton type="button" onClick={onClose} disabled={busy}>انصراف</SecondaryButton>
        <PrimaryButton type="button" onClick={save} disabled={busy || !name.trim()}>{busy && <Loader2 className="w-4 h-4 animate-spin" />} {editing ? 'ذخیره' : 'ساخت شرکت'}</PrimaryButton>
      </>}
    >
      {error && <Notice type="error" onClose={() => setError(null)}>{error}</Notice>}

      <Field label="نام شرکت" required><input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={200} /></Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="تلفن"><input className={`${inputClass} dir-ltr text-right`} value={details.phone} onChange={set('phone')} maxLength={40} inputMode="tel" /></Field>
        <Field label="ایمیل"><input className={`${inputClass} dir-ltr text-right`} value={details.email} onChange={set('email')} maxLength={200} type="email" /></Field>
        <Field label="وب‌سایت"><input className={`${inputClass} dir-ltr text-right`} value={details.website} onChange={set('website')} maxLength={200} /></Field>
        <Field label="شناسه ملی"><input className={`${inputClass} dir-ltr text-right`} value={details.nationalId} onChange={set('nationalId')} maxLength={20} inputMode="numeric" /></Field>
        <Field label="کد اقتصادی"><input className={`${inputClass} dir-ltr text-right`} value={details.economicCode} onChange={set('economicCode')} maxLength={20} inputMode="numeric" /></Field>
        <Field label="عنوان رئیس شرکت" hint="در چارت بالای همه می‌آید؛ خالی: «رئیس کل». مثلاً «مدیرعامل» یا «مدیر سازمان».">
          <input className={inputClass} value={details.headTitle} onChange={set('headTitle')} maxLength={100} placeholder="رئیس کل" />
        </Field>
      </div>
      <Field label="آدرس"><textarea rows={2} className={inputClass} value={details.address} onChange={set('address')} maxLength={500} /></Field>

      <Field label="لوگوی شرکت" hint="PNG، JPEG یا WebP، حداکثر ۵۱۲ کیلوبایت.">
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-bold cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800">
            <ImagePlus className="w-4 h-4" /> انتخاب لوگو
            <input type="file" accept={LOGO_TYPES.join(',')} className="sr-only" aria-label="انتخاب لوگو" onChange={(e) => { pickLogo(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
          {logoPreview && (
            <>
              <img src={logoPreview} alt="لوگوی شرکت" className="h-20 w-20 rounded-xl border border-slate-200 dark:border-slate-700 object-contain bg-white p-1" />
              <SecondaryButton type="button" onClick={() => { setLogoFile(null); setRemoveLogo(true); }}><Trash2 className="w-4 h-4" /> برداشتن لوگو</SecondaryButton>
            </>
          )}
        </div>
      </Field>

      <Field label="توضیحات"><textarea rows={2} className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} /></Field>

      {parentChoices && parentChoices.length > 0 && (
        <Field label="سازمان بالادستی (اختیاری)" hint="این شرکت زیر سازمان بالادستی‌اش در «چارت گروه» می‌آید. فقط دسته‌بندی است.">
          <select className={inputClass} value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">بدون سازمان بالادستی</option>
            {parentChoices.filter((c) => c.isActive && c.id !== company?.id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
      )}

      {!editing && templates.length > 0 && (
        <Field label="ساختار اولیه" hint="قالب فقط کپی می‌شود و بعد از ساخت به آن وصل نیست.">
          <select className={inputClass} value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            <option value="">شرکت خالی (خودتان گره‌ها را می‌سازید)</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}{t.isSystem ? '' : ' (قالب شما)'}</option>)}
          </select>
          {template && <span className="block mt-1 text-[11px] text-slate-500">{toPersianDigits(template.nodeCount)} گره · {toPersianDigits(template.nodeTypeCount)} جزء چارت · سطح نمایش {UI_LEVEL_TITLES[template.uiLevel] || template.uiLevel}</span>}
        </Field>
      )}

      {canLinkUnits && (
        <fieldset className="space-y-2">
          <legend className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">معاونت‌های شرکت {chosenCount > 0 && <span className="text-slate-500 font-normal">({toPersianDigits(chosenCount)} انتخاب‌شده)</span>}</legend>
          {units.loading ? <p className="text-xs text-slate-500">در حال دریافت…</p> : units.error ? <Notice type="error">{units.error}</Notice>
            : unitChoices.length === 0 ? <p className="text-xs text-slate-500">معاونتی بدون شرکت نیست. معاونت تازه را بعد از ساخت شرکت در چارت با «افزودن معاونت» بسازید.</p> : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-48 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 p-2">
                {unitChoices.map((u) => (
                  <label key={u.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800">
                    <input type="checkbox" checked={unitIds.includes(u.id)} onChange={(e) => setUnitIds(e.target.checked ? [...unitIds, u.id] : unitIds.filter((id) => id !== u.id))} />
                    {u.name}
                  </label>
                ))}
              </div>
            )}
          <p className="text-[11px] text-slate-500">فقط معاونت‌هایی که به شرکت دیگری وصل نیستند. معاونتی که فرد یا پست دارد، فقط از «ویرایش» شرکتِ ساخته‌شده وصل می‌شود.</p>
        </fieldset>
      )}

      {editing && <Toggle checked={isActive} onChange={setIsActive} label="شرکت فعال است" />}
    </AdminDialog>
  );
};
