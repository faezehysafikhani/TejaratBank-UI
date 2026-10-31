// «ذخیره‌ی این ساختار به‌عنوان قالب»: a copy of a company's structure kept as a template of this
// organization, to start other companies from (needs the templates permission).
import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { AdminDialog, Field, Notice, PrimaryButton, SecondaryButton, inputClass } from '../../AdminUi';
import { userErrorMessage } from '../../../../utils/errorMessages';
import { type ChartCompany, saveTemplate } from '../../../../services/orgStructureApi';

export const SaveTemplateDialog: React.FC<{
  company: ChartCompany;
  onSaved: (name: string) => Promise<void> | void;
  onClose: () => void;
}> = ({ company, onSaved, onClose }) => {
  const [name, setName] = useState(`ساختار ${company.name}`);
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await saveTemplate({ companyId: company.companyId, name: name.trim(), description: description.trim() || null });
      await onSaved(name.trim());
      onClose();
    } catch (err) {
      setError(userErrorMessage(err, 'ذخیره‌ی قالب انجام نشد.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminDialog
      title={`ذخیره‌ی ساختار «${company.name}» به‌عنوان قالب`}
      onClose={() => !busy && onClose()}
      footer={<>
        <SecondaryButton type="button" onClick={onClose} disabled={busy}>انصراف</SecondaryButton>
        <PrimaryButton type="button" onClick={save} disabled={busy || !name.trim()}>{busy && <Loader2 className="w-4 h-4 animate-spin" />} ذخیره‌ی قالب</PrimaryButton>
      </>}
    >
      {error && <Notice type="error" onClose={() => setError(null)}>{error}</Notice>}
      <Field label="نام قالب" required><input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={200} autoFocus /></Field>
      <Field label="توضیحات"><textarea rows={3} className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} /></Field>
      <p className="text-[11px] leading-5 text-slate-500">اجزای چارت، قاعده‌ها، رابطه‌ها و گره‌های این شرکت کپی می‌شود (افراد کپی نمی‌شوند). بعداً هر شرکت تازه را می‌شود از آن ساخت.</p>
    </AdminDialog>
  );
};
