// The two ways a node enters the structure's shape: «افزودن» (only the types the rules allow there)
// and «جابه‌جایی» (only the places the rules allow; ends in the impact preview before it is saved).
import React, { useState } from 'react';
import { ChevronDown, Loader2, Plus } from 'lucide-react';
import { AdminDialog, Field, Notice, PrimaryButton, SecondaryButton, inputClass } from '../../AdminUi';
import { userErrorMessage } from '../../../../utils/errorMessages';
import { NexusApiError } from '../../../../services/nexusApi';
import { type ChartCompany, type ChartUnit, type NodeType, type NodeTypeRule, type OrgNode, createNode, createNodeType, getNodeTypeRules, listNodeTypes, moveNode, setNodeTypeRules, updateNodeType } from '../../../../services/orgStructureApi';
import { toPersianDigits } from '../../../../utils/helpers';
import { allUnitsOf } from '../orgChartModel';
import { moveTargets } from '../orgNodeRules';
import { ImpactPreviewDialog } from './ImpactPreviewDialog';
import { NODE_TYPE_ICONS, NodeTypeIcon, TYPE_COLORS, safeColor, suggestTypeLook } from './nodeTypeStyle';

const sameName = (a: string, b: string) => a.replace(/[\s\u200c]+/g, '').replace(/ي/g, 'ی').replace(/ك/g, 'ک') === b.replace(/[\s\u200c]+/g, '').replace(/ي/g, 'ی').replace(/ك/g, 'ک');

/**
 * Lets `typeId` stand at `parentTypeId` (null: at the top of the company): the rule is added to the
 * ones there are. With no rules yet (the flat structure) the existing types are first allowed at the
 * top, so nothing that is there now stops being allowed.
 */
export async function allowTypeHere(typeId: string, parentTypeId: string | null, existing: NodeType[]): Promise<void> {
  const { rules } = await getNodeTypeRules();
  if (rules.some((r) => r.childNodeTypeId === typeId && (r.parentNodeTypeId ?? null) === parentTypeId)) return;
  const all: NodeTypeRule[] = rules.length > 0
    ? [...rules]
    : existing.filter((t) => t.isActive).map((t) => ({ parentNodeTypeId: null, childNodeTypeId: t.id }));
  all.push({ parentNodeTypeId: parentTypeId, childNodeTypeId: typeId });
  await setNodeTypeRules(all);
}

/**
 * A type named `name` that may stand at `parentTypeId`: the one that already has this name (types are
 * shared by the whole organization, so it is used, and turned on if it was off), else a new one -
 * then allowed there.
 */
export async function createAllowedType(name: string, parentTypeId: string | null, existing: NodeType[], look?: { color: string; icon: string }): Promise<NodeType> {
  const fresh = await listNodeTypes().catch(() => existing);
  const same = fresh.find((t) => sameName(t.name, name));
  let type: NodeType;
  if (same) {
    type = same.isActive ? same : await updateNodeType(same.id, { name: same.name, color: same.color, icon: same.icon, isDomainBoundary: same.isDomainBoundary, sortOrder: same.sortOrder, isActive: true });
  } else {
    const chosen = look ?? suggestTypeLook(name, fresh.map((t) => t.color));
    type = await createNodeType({ name: name.trim(), color: chosen.color, icon: chosen.icon });
  }
  await allowTypeHere(type.id, parentTypeId, fresh);
  return type;
}

/** Icon-only dropdown: a button showing the chosen icon that opens a grid of icons (no names). */
const IconPicker: React.FC<{ value: string; color: string; onChange: (icon: string) => void }> = ({ value, color, onChange }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" aria-haspopup="listbox" aria-expanded={open} aria-label="آیکون" data-testid="icon-picker" onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 cursor-pointer">
        <span className="w-6 h-6 rounded-md flex items-center justify-center" style={{ backgroundColor: `${color}1a`, color }}><NodeTypeIcon icon={value} className="w-4 h-4" /></span>
        <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
      </button>
      {open && (
        <div role="listbox" aria-label="آیکون" className="basis-full w-full grid grid-cols-[repeat(auto-fill,minmax(2.25rem,1fr))] gap-1 p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60">
          {Object.keys(NODE_TYPE_ICONS).map((key) => (
            <button key={key} type="button" role="option" aria-selected={value === key} data-icon={key} onClick={() => { onChange(key); setOpen(false); }} className={`w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer ${value === key ? 'ring-2 ring-indigo-400' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`} style={{ color }}>
              <NodeTypeIcon icon={key} className="w-4 h-4" />
            </button>
          ))}
        </div>
      )}
    </>
  );
};

/**
 * «افزودن واحد»: one or several names (a line each) and the type they get, at this place (the top
 * of the company, or under `parent`). Only the types the rules allow are listed; a type that is
 * missing can be made right here (it is allowed at this place at once).
 */
export const AddNodeDialog: React.FC<{
  company: ChartCompany;
  /** null: at the top of the company. */
  parent: ChartUnit | null;
  types: NodeType[];
  /** Every type (to keep what is allowed when the first rule is made). */
  allTypes?: NodeType[];
  /** Whether the user may make a new type (it needs the rules' permission). */
  canCreateTypes?: boolean;
  onCreated: (nodes: OrgNode[]) => Promise<void> | void;
  onClose: () => void;
}> = ({ company, parent, types: initialTypes, allTypes, canCreateTypes = false, onCreated, onClose }) => {
  const [types, setTypes] = useState(initialTypes);
  const parentTypeId0 = parent?.nodeType?.nodeTypeId ?? null;
  /** Other types that exist: choosing one allows it here. Not offered under a node with no type (no rule can say so). */
  const [others, setOthers] = useState<NodeType[]>(() => (!parent || parentTypeId0 ? (allTypes ?? []).filter((t) => t.isActive && !initialTypes.some((x) => x.id === t.id)) : []));
  const [names, setNames] = useState('');
  const [code, setCode] = useState('');
  const [typeId, setTypeId] = useState(initialTypes.length === 1 ? initialTypes[0].id : '');
  const [newType, setNewType] = useState<string | null>(initialTypes.length === 0 && canCreateTypes && !(allTypes ?? []).some((t) => t.isActive) ? (parent ? '' : 'معاونت') : null);
  const [look, setLook] = useState<{ color: string; icon: string } | null>(null);
  const [typeFilter, setTypeFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const list = names.split('\n').map((n) => n.trim()).filter(Boolean);
  const parentTypeId = parent?.nodeType?.nodeTypeId ?? null;

  const makeType = async () => {
    if (!newType?.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const type = await createAllowedType(newType, parentTypeId, allTypes ?? types, look ?? undefined);
      setTypes((t) => (t.some((x) => x.id === type.id) ? t : [...t, type]));
      setOthers((o) => o.filter((x) => x.id !== type.id));
      setTypeId(type.id);
      setNewType(null);
    } catch (err) {
      setError(userErrorMessage(err, 'ساخت نوع واحد انجام نشد.'));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    const made: OrgNode[] = [];
    try {
      // A type that is not allowed here yet (chosen from the others): it is allowed first.
      if (others.some((t) => t.id === typeId)) {
        await allowTypeHere(typeId, parentTypeId, allTypes ?? types);
        const chosen = others.find((t) => t.id === typeId)!;
        setTypes((t) => [...t, chosen]);
        setOthers((o) => o.filter((x) => x.id !== typeId));
      }
      for (const name of list) {
        made.push(await createNode({
          name,
          parentNodeId: parent?.unitId ?? null,
          companyId: parent ? null : company.companyId,
          nodeTypeId: typeId || null,
          code: list.length === 1 ? code.trim() || null : null,
        }));
      }
      await onCreated(made);
      onClose();
    } catch (err) {
      // What was made stays; the rest is left in the box to try again.
      setNames(list.slice(made.length).join('\n'));
      if (made.length > 0) await onCreated(made);
      setError(`${made.length > 0 ? `${toPersianDigits(made.length)} واحد ساخته شد. ` : ''}${userErrorMessage(err, 'افزودن واحد انجام نشد.')}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminDialog
      title={parent ? `افزودن زیرمجموعه به «${parent.name}»` : `افزودن واحد در بالاترین سطح «${company.name}»`}
      onClose={() => !busy && onClose()}
      footer={<>
        <SecondaryButton type="button" onClick={onClose} disabled={busy}>انصراف</SecondaryButton>
        <PrimaryButton type="button" onClick={save} disabled={busy || list.length === 0 || !typeId}>
          {busy && <Loader2 className="w-4 h-4 animate-spin" />} {list.length > 1 ? `افزودن ${toPersianDigits(list.length)} واحد` : 'افزودن'}
        </PrimaryButton>
      </>}
    >
      {error && <Notice type="error" onClose={() => setError(null)}>{error}</Notice>}
      <fieldset className="space-y-1.5">
        <legend className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">نوع واحد <span className="text-rose-500">*</span></legend>
        {(types.length > 0 || others.length > 0) && (() => {
          const q = typeFilter.trim();
          const match = (t: NodeType) => !q || t.name.includes(q);
          const chip = (type: NodeType, dashed: boolean) => {
            const color = safeColor(type.color);
            const chosen = typeId === type.id;
            return (
              <label key={type.id} className={`inline-flex items-center gap-2 rounded-xl border ${dashed ? 'border-dashed' : ''} px-2.5 py-1.5 cursor-pointer max-w-full ${chosen ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 dark:border-indigo-600' : 'border-slate-200 dark:border-slate-700 hover:border-indigo-200'}`}>
                <input type="radio" name="node-type" className="sr-only" checked={chosen} onChange={() => setTypeId(type.id)} />
                <span className="w-6 h-6 rounded-md flex items-center justify-center shrink-0" style={{ backgroundColor: `${color}1a`, color }}><NodeTypeIcon icon={type.icon} className="w-3.5 h-3.5" /></span>
                <span className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{type.name}</span>
              </label>
            );
          };
          const shown = types.filter(match);
          const shownOthers = others.filter(match);
          return (
            <div className="space-y-1.5">
              {types.length + others.length > 8 && (
                <input className={`${inputClass} w-full`} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} placeholder="جستجوی نوع واحد…" aria-label="جستجوی نوع واحد" />
              )}
              <div className="max-h-44 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 p-2 flex flex-wrap gap-2" role="radiogroup" aria-label="نوع واحد" data-testid="type-list">
                {shown.map((t) => chip(t, false))}
                {shownOthers.map((t) => chip(t, true))}
                {shown.length + shownOthers.length === 0 && <span className="text-xs text-slate-500 px-1">نوعی با این نام نیست.</span>}
              </div>
              {others.length > 0 && <p className="text-[11px] text-slate-500" data-testid="other-types">نوع‌های خط‌چین هنوز اینجا مجاز نیستند؛ با انتخابشان مجاز می‌شوند.</p>}
            </div>
          );
        })()}
        {types.length === 0 && others.length === 0 && newType === null && (
          <Notice type="info">{canCreateTypes ? 'هنوز نوعی برای این جایگاه تعریف نشده است.' : 'نوعی برای این جایگاه مجاز نیست و شما اجازه‌ی ساخت نوع تازه را ندارید.'}</Notice>
        )}
        {newType !== null ? (
          <div className="space-y-2 rounded-xl border border-slate-200 dark:border-slate-700 p-2.5">
          <div className="flex gap-2 items-center">
            <input
              className={`${inputClass} flex-1 min-w-0`}
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
              maxLength={100}
              autoFocus={types.length === 0}
              aria-label="نام نوع واحد تازه"
              placeholder={parent ? 'مثلاً: اداره کل' : 'مثلاً: معاونت'}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void makeType(); } }}
            />
            <SecondaryButton type="button" disabled={busy || !newType.trim()} onClick={() => void makeType()}>ساخت این نوع</SecondaryButton>
            {(types.length > 0 || others.length > 0) && <SecondaryButton type="button" disabled={busy} onClick={() => setNewType(null)}>بستن</SecondaryButton>}
          </div>
          {(() => {
            const auto = suggestTypeLook(newType, (allTypes ?? types).map((t) => t.color));
            const cur = look ?? auto;
            return (
              <div className="flex flex-wrap items-center gap-3" data-testid="type-look">
                <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300">رنگ:</span>
                <span className="flex gap-1" role="radiogroup" aria-label="رنگ">
                  {TYPE_COLORS.map((c) => (
                    <button key={c} type="button" role="radio" aria-checked={cur.color === c} aria-label={c} onClick={() => setLook({ ...cur, color: c })} className={`w-5 h-5 rounded-full cursor-pointer ${cur.color === c ? 'ring-2 ring-offset-1 ring-slate-500' : ''}`} style={{ backgroundColor: c }} />
                  ))}
                </span>
                <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300">آیکون:</span>
                <IconPicker value={cur.icon} color={cur.color} onChange={(icon) => setLook({ ...cur, icon })} />
              </div>
            );
          })()}
          </div>
        ) : canCreateTypes && (
          <button type="button" onClick={() => setNewType('')} data-testid="new-type-open" className="w-full flex items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-indigo-300 dark:border-indigo-700 bg-indigo-50/60 dark:bg-indigo-950/30 px-3 py-2 text-sm font-bold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 cursor-pointer"><Plus className="w-4 h-4" />نوع واحد تازه</button>
        )}
      </fieldset>
      <Field label="نام واحد" required hint="برای ساخت چند واحد با یک نوع، هر نام را در یک خط بنویسید.">
        <textarea
          className={`${inputClass} min-h-[5.5rem] resize-y`}
          value={names}
          onChange={(e) => setNames(e.target.value)}
          maxLength={4000}
          rows={3}
          autoFocus={types.length > 0}
          placeholder={'مثلاً:\nاداره کل حسابداری\nاداره کل خزانه‌داری'}
        />
      </Field>
      {list.length <= 1 && (
        <Field label="کد (اختیاری)" hint="در هر شرکت یکتاست، مثلاً کد شعبه.">
          <input className={`${inputClass} dir-ltr text-right`} value={code} onChange={(e) => setCode(e.target.value)} maxLength={40} />
        </Field>
      )}
    </AdminDialog>
  );
};

type Target = { unitId: string | null };

/**
 * «جابه‌جایی واحد»: pick the new place (or arrive with one, from dragging), see what it would change
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
          if (!rowVersion) throw new NexusApiError('نسخه‌ی این واحد دریافت نشده؛ چارت را دوباره بارگذاری کنید و دوباره امتحان کنید.', 409);
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
        <Notice type="info">با قاعده‌های «سلسله‌مراتب مجاز» فعلی، جای دیگری برای این واحد مجاز نیست.{rules.length === 0 ? ' هنوز قاعده‌ای تعریف نشده و ساختار مسطح است.' : ''}</Notice>
      ) : (
        <Field label="واحد بالاتر جدید" required hint="فقط جاهایی که قاعده‌ی «سلسله‌مراتب مجاز» اجازه می‌دهد فهرست شده است.">
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
