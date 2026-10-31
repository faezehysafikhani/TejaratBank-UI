// The two ways a node enters the structure's shape: «افزودن» (only the types the rules allow there)
// and «جابه‌جایی» (only the places the rules allow; ends in the impact preview before it is saved).
import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { AdminDialog, Field, Notice, PrimaryButton, SecondaryButton, inputClass } from '../../AdminUi';
import { userErrorMessage } from '../../../../utils/errorMessages';
import { NexusApiError } from '../../../../services/nexusApi';
import { type ChartCompany, type ChartUnit, type NodeType, type NodeTypeRule, type OrgNode, createNode, moveNode } from '../../../../services/orgStructureApi';
import { allUnitsOf } from '../orgChartModel';
import { moveTargets } from '../orgNodeRules';
import { ImpactPreviewDialog } from './ImpactPreviewDialog';
import { NodeTypeIcon, safeColor } from './nodeTypeStyle';

/** «افزودن گره»: a name and one of the types the rules allow at this place (the top, or under `parent`). */
export const AddNodeDialog: React.FC<{
  company: ChartCompany;
  /** null: at the top of the company. */
  parent: ChartUnit | null;
  types: NodeType[];
  onCreated: (node: OrgNode) => Promise<void> | void;
  onClose: () => void;
}> = ({ company, parent, types, onCreated, onClose }) => {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [typeId, setTypeId] = useState(types.length === 1 ? types[0].id : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const node = await createNode({
        name: name.trim(),
        parentNodeId: parent?.unitId ?? null,
        companyId: parent ? null : company.companyId,
        nodeTypeId: typeId || null,
        code: code.trim() || null,
      });
      await onCreated(node);
      onClose();
    } catch (err) {
      setError(userErrorMessage(err, 'افزودن گره انجام نشد.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminDialog
      title={parent ? `افزودن زیرمجموعه به «${parent.name}»` : `افزودن گره در بالاترین سطح «${company.name}»`}
      onClose={() => !busy && onClose()}
      footer={<>
        <SecondaryButton type="button" onClick={onClose} disabled={busy}>انصراف</SecondaryButton>
        <PrimaryButton type="button" onClick={save} disabled={busy || !name.trim() || !typeId}>{busy && <Loader2 className="w-4 h-4 animate-spin" />} افزودن</PrimaryButton>
      </>}
    >
      {error && <Notice type="error" onClose={() => setError(null)}>{error}</Notice>}
      <fieldset className="space-y-1.5">
        <legend className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">جزء چارت <span className="text-rose-500">*</span></legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="radiogroup" aria-label="جزء چارت">
          {types.map((type) => {
            const color = safeColor(type.color);
            const chosen = typeId === type.id;
            return (
              <label key={type.id} className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 cursor-pointer ${chosen ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 dark:border-indigo-600' : 'border-slate-200 dark:border-slate-700 hover:border-indigo-200'}`}>
                <input type="radio" name="node-type" className="sr-only" checked={chosen} onChange={() => setTypeId(type.id)} />
                <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${color}1a`, color }}><NodeTypeIcon icon={type.icon} className="w-4 h-4" /></span>
                <span className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{type.name}</span>
              </label>
            );
          })}
        </div>
        <p className="text-[11px] text-slate-500">فقط اجزایی که قاعده‌ی «سلسله‌مراتب مجاز» اینجا اجازه می‌دهد نشان داده می‌شود.</p>
      </fieldset>
      <Field label="نام" required>
        <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={200} autoFocus placeholder="مثلاً: اداره کل حسابداری" onKeyDown={(e) => { if (e.key === 'Enter' && name.trim() && typeId && !busy) save(); }} />
      </Field>
      <Field label="کد (اختیاری)" hint="در هر شرکت یکتاست، مثلاً کد شعبه.">
        <input className={`${inputClass} dir-ltr text-right`} value={code} onChange={(e) => setCode(e.target.value)} maxLength={40} />
      </Field>
    </AdminDialog>
  );
};

type Target = { unitId: string | null };

/**
 * «جابه‌جایی گره»: pick the new place (or arrive with one, from dragging), see what it would change
 * for people, then confirm. With a place given, it opens at the preview.
 */
export const MoveNodeDialog: React.FC<{
  company: ChartCompany;
  unit: ChartUnit;
  rules: NodeTypeRule[];
  /** The place chosen already (dragging): undefined to choose here, null for the top. */
  initialParentId?: string | null;
  /** The node's version as the chart was loaded. */
  rowVersion: string | null;
  onMoved: () => Promise<void> | void;
  onReload: () => Promise<void> | void;
  onClose: () => void;
}> = ({ company, unit, rules, initialParentId, rowVersion, onMoved, onReload, onClose }) => {
  const [target, setTarget] = useState<Target | null>(initialParentId === undefined ? null : { unitId: initialParentId });
  const [choice, setChoice] = useState('');
  const { top, targets } = moveTargets(company, unit, rules);
  const parent = target?.unitId ? allUnitsOf(company).find((u) => u.unitId === target.unitId) ?? null : null;

  if (target) {
    const where = parent ? `«${parent.name}»` : 'بالاترین سطح شرکت';
    return (
      <ImpactPreviewDialog
        title={`جابه‌جایی «${unit.name}»`}
        summary={<>«{unit.name}» و همه‌ی زیرمجموعه‌اش از {unit.parentNodeId ? 'جای فعلی' : 'بالاترین سطح'} به <b>{where}</b> می‌روند.</>}
        changes={[{ kind: 'move', nodeId: unit.unitId, parentNodeId: target.unitId }]}
        confirmLabel="جابه‌جا کن"
        onConfirm={async () => {
          // Without the node's version the server could not tell that someone changed it first: refuse here.
          if (!rowVersion) throw new NexusApiError('نسخه‌ی این گره دریافت نشده؛ چارت را دوباره بارگذاری کنید و دوباره امتحان کنید.', 409);
          await moveNode(unit.unitId, { parentNodeId: target.unitId, rowVersion });
          await onMoved();
          onClose();
        }}
        onReload={onReload}
        onClose={onClose}
      />
    );
  }

  const empty = !top && targets.length === 0;
  return (
    <AdminDialog
      title={`جابه‌جایی «${unit.name}»`}
      onClose={onClose}
      footer={<>
        <SecondaryButton type="button" onClick={onClose}>انصراف</SecondaryButton>
        <PrimaryButton type="button" disabled={!choice} onClick={() => setTarget({ unitId: choice === '__top' ? null : choice })}>مرحله‌ی بعد: پیش‌نمایش اثر</PrimaryButton>
      </>}
    >
      {empty ? (
        <Notice type="info">با قاعده‌های «سلسله‌مراتب مجاز» فعلی، جای دیگری برای این گره مجاز نیست.{rules.length === 0 ? ' هنوز قاعده‌ای تعریف نشده و ساختار مسطح است.' : ''}</Notice>
      ) : (
        <Field label="گره‌ی بالاتر جدید" required hint="فقط جاهایی که قاعده‌ی «سلسله‌مراتب مجاز» اجازه می‌دهد فهرست شده است.">
          <select className={inputClass} value={choice} onChange={(e) => setChoice(e.target.value)} autoFocus>
            <option value="">— انتخاب کنید —</option>
            {top && <option value="__top">بالاترین سطح شرکت</option>}
            {targets.map((t) => <option key={t.unit.unitId} value={t.unit.unitId}>{t.path}</option>)}
          </select>
        </Field>
      )}
    </AdminDialog>
  );
};
