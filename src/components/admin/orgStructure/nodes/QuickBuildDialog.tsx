// «ساخت سریع»: the whole shape of a branch typed (or pasted) as an indented list, one node per line,
// made in one go. A line is a پست سازمانی; «سمت: عنوان» is a سمت سازمانی. People are added afterwards.
import React, { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { AdminDialog, Field, Notice, PrimaryButton, SecondaryButton, inputClass } from '../../AdminUi';
import { userErrorMessage } from '../../../../utils/errorMessages';
import { toPersianDigits } from '../../../../utils/helpers';
import { type ChartCompany, type ChartUnit, type NodeType, createNode } from '../../../../services/orgStructureApi';
import { kindOfType, parseOutline } from './simpleKinds';

const EXAMPLE = 'معاونت مالی\n  سمت: مدیر مالی\n    سمت: کارشناس فنی\n    سمت: کارشناس اداری\nمعاونت فنی';

export const QuickBuildDialog: React.FC<{
  company: ChartCompany;
  /** null: at the top of the company. */
  parent: ChartUnit | null;
  types: NodeType[];
  onDone: () => Promise<void> | void;
  onClose: () => void;
}> = ({ company, parent, types, onDone, onClose }) => {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const parentKind = kindOfType(types.find((t) => t.id === parent?.nodeType?.nodeTypeId));
  const parsed = useMemo(() => parseOutline(text, parentKind), [text, parentKind]);
  const postType = types.find((t) => kindOfType(t) === 'post');
  const roleType = types.find((t) => kindOfType(t) === 'role');

  const build = async () => {
    if (!postType || !roleType || parsed.errors.length > 0) return;
    setBusy(true);
    setError(null);
    setDone(0);
    let made = 0;
    try {
      const parents: (string | null)[] = [];
      for (const line of parsed.lines) {
        const above = line.depth === 0 ? parent?.unitId ?? null : parents[line.depth - 1];
        const node = await createNode({
          name: line.name,
          parentNodeId: above,
          companyId: above ? null : company.companyId,
          nodeTypeId: (line.kind === 'role' ? roleType : postType).id,
        });
        parents[line.depth] = node.id;
        made += 1;
        setDone(made);
      }
      await onDone();
      onClose();
    } catch (err) {
      setError(`${userErrorMessage(err, 'ساخت انجام نشد.')}${made ? ` ${toPersianDigits(made)} گره‌ی اول ساخته شد؛ ادامه را از «افزودن» بسازید.` : ''}`);
      if (made) await onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminDialog
      title={parent ? `ساخت سریع زیر «${parent.name}»` : `ساخت سریع در «${company.name}»`}
      onClose={() => !busy && onClose()}
      footer={<>
        <SecondaryButton type="button" onClick={onClose} disabled={busy}>انصراف</SecondaryButton>
        <PrimaryButton type="button" onClick={build} disabled={busy || parsed.errors.length > 0 || !postType || !roleType}>
          {busy && <Loader2 className="w-4 h-4 animate-spin" />} {busy ? `${toPersianDigits(done)} از ${toPersianDigits(parsed.lines.length)}` : `ساخت ${toPersianDigits(parsed.lines.length)} گره`}
        </PrimaryButton>
      </>}
    >
      {error && <Notice type="error" onClose={() => setError(null)}>{error}</Notice>}
      <Field label="ساختار" hint="هر خط یک گره؛ هر دو فاصله (یا یک Tab) یک سطح زیرتر. خط ساده پست سازمانی است و «سمت: عنوان» سمت سازمانی.">
        <textarea className={`${inputClass} font-mono`} dir="rtl" rows={10} value={text} onChange={(e) => setText(e.target.value)} placeholder={EXAMPLE} autoFocus />
      </Field>
      {text.trim() && parsed.errors.length > 0 && (
        <Notice type="error">{parsed.errors.slice(0, 5).map((e) => <span key={e} className="block">{e}</span>)}{parsed.errors.length > 5 && <span className="block">و {toPersianDigits(parsed.errors.length - 5)} خطای دیگر…</span>}</Notice>
      )}
      <p className="text-[11px] text-slate-500">زیر یک سمت فقط سمت می‌آید. شخص هر سمت را بعد از ساخت، از «افزودن» یا کارت سمت تعیین کنید.</p>
    </AdminDialog>
  );
};
