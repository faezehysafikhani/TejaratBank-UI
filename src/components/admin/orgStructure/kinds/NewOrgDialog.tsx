// «ساخت سازمان»: only a name (and, for a subsidiary, the organization above). The rest of the company's details
// (phone, logo, address...) are in «ویرایش اطلاعات سازمان».
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2 } from 'lucide-react';
import { PrimaryButton, SecondaryButton, inputClass } from '../../AdminUi';
import { userErrorMessage } from '../../../../utils/errorMessages';
import { type Company, createCompany } from '../../../../services/orgStructureApi';

export const NewOrgDialog: React.FC<{ parents: Pick<Company, 'id' | 'name' | 'isActive'>[]; onCreated: (company: Company) => Promise<void> | void; onClose: () => void }> = ({ parents, onCreated, onClose }) => {
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const company = await createCompany({ name: name.trim(), code: '', parentCompanyId: parentId || null });
      await onCreated(company);
      onClose();
    } catch (err) {
      setError(userErrorMessage(err, 'ساخت سازمان انجام نشد.'));
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label="ساخت سازمان" dir="rtl" className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 shadow-2xl p-5 space-y-3" onKeyDown={(e) => { if (e.key === 'Escape' && !busy) { e.stopPropagation(); onClose(); } }}>
        <h3 className="text-base font-extrabold text-slate-900 dark:text-white">ساخت سازمان</h3>
        {error && <p role="alert" className="rounded-xl bg-rose-50 text-rose-700 text-xs px-3 py-2">{error}</p>}
        <div>
          <label htmlFor="org-name" className="block text-xs text-slate-600 dark:text-slate-300 mb-1">نام سازمان</label>
          <input id="org-name" className={inputClass} value={name} maxLength={200} autoFocus onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void send(); } }} placeholder="مثلاً: پست بانک ایران" />
        </div>
        {parents.length > 0 && (
          <div>
            <label htmlFor="org-parent" className="block text-xs text-slate-600 dark:text-slate-300 mb-1">سازمان بالادستی (اختیاری؛ برای هلدینگ)</label>
            <select id="org-parent" className={inputClass} value={parentId} onChange={(e) => setParentId(e.target.value)}>
              <option value="">بدون سازمان بالادستی</option>
              {parents.filter((p) => p.isActive).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        )}
        <p className="text-[11px] text-slate-500">تلفن، لوگو، آدرس و بقیه‌ی اطلاعات را بعداً در «ویرایش اطلاعات سازمان» می‌نویسید.</p>
        <div className="flex items-center gap-2 pt-1">
          <span className="flex-1" />
          <SecondaryButton type="button" onClick={onClose} disabled={busy}>انصراف</SecondaryButton>
          <PrimaryButton type="button" onClick={() => void send()} disabled={busy || !name.trim()}>{busy && <Loader2 className="w-4 h-4 animate-spin" />} ساخت</PrimaryButton>
        </div>
      </div>
    </div>,
    document.body,
  );
};
