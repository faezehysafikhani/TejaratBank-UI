// Secondary links («افزودن مافوق دوم»): a node reports also to another node, drawn as a dotted /
// dashed / solid line. Adding and removing show the impact preview first; a dotted link never makes
// the other end a manager (only a link type that counts as manager does).
import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { AdminDialog, Field, Notice, PrimaryButton, SecondaryButton, inputClass } from '../../AdminUi';
import { userErrorMessage } from '../../../../utils/errorMessages';
import { toPersianDigits } from '../../../../utils/helpers';
import { type AutoLinkChoice, type ChartCompany, type ChartUnit, type LinkType, createLink, deleteLink } from '../../../../services/orgStructureApi';
import { allUnitsOf, ancestorsOf } from '../orgChartModel';
import { ImpactPreviewDialog } from './ImpactPreviewDialog';

export const LINE_STYLE_TITLES = { solid: 'خط ممتد', dotted: 'نقطه‌چین', dashed: 'خط‌چین' } as const;

/** «الف طبق رابطه‌ی «…» (نقطه‌چین) به ب وصل است؛ مدیر حساب نمی‌شود.» */
export const linkSentence = (from: string, to: string, type: { name: string; lineStyle: keyof typeof LINE_STYLE_TITLES; countsAsManager: boolean }) =>
  `«${from}» طبق رابطه‌ی «${type.name}» (${LINE_STYLE_TITLES[type.lineStyle] || type.lineStyle}) به «${to}» وصل است؛ ${type.countsAsManager ? 'مدیر آن، مدیر دوم افراد «' + from + '» حساب می‌شود' : 'مدیر آن مدیر کسی حساب نمی‌شود'}.`;

const pathOf = (company: ChartCompany, unit: ChartUnit) =>
  [...ancestorsOf(company, unit.unitId)].reverse().map((a) => a.name).concat(unit.name).join(' ‹ ');

/** Choose the link type and the other node, see what it changes, then add it. */
export const AddLinkDialog: React.FC<{
  company: ChartCompany;
  from: ChartUnit;
  linkTypes: LinkType[];
  onAdded: () => Promise<void> | void;
  onReload: () => Promise<void> | void;
  onClose: () => void;
}> = ({ company, from, linkTypes, onAdded, onReload, onClose }) => {
  const types = linkTypes.filter((t) => t.isActive);
  const [typeId, setTypeId] = useState(types.length === 1 ? types[0].id : '');
  const [toId, setToId] = useState('');
  const [confirming, setConfirming] = useState(false);
  const type = types.find((t) => t.id === typeId);
  const existing = new Set((from.links || []).map((l) => `${l.targetNodeId}|${l.linkTypeId}`));
  // Not itself, not a node it already has this link to.
  const targets = allUnitsOf(company).filter((u) => u.unitId !== from.unitId && u.isActive !== false && !(typeId && existing.has(`${u.unitId}|${typeId}`)));
  const to = targets.find((u) => u.unitId === toId);

  if (confirming && type && to) {
    return (
      <ImpactPreviewDialog
        title="افزودن مافوق دوم"
        summary={linkSentence(from.name, to.name, type)}
        changes={[{ kind: 'link', nodeId: from.unitId, toNodeId: to.unitId, linkTypeId: type.id }]}
        confirmLabel="رابطه را اضافه کن"
        onConfirm={async () => {
          await createLink({ fromNodeId: from.unitId, toNodeId: to.unitId, linkTypeId: type.id });
          await onAdded();
          onClose();
        }}
        onReload={onReload}
        onClose={onClose}
      />
    );
  }

  return (
    <AdminDialog
      title={`مافوق دوم برای «${from.name}»`}
      onClose={onClose}
      footer={<>
        <SecondaryButton type="button" onClick={onClose}>انصراف</SecondaryButton>
        <PrimaryButton type="button" disabled={!type || !to} onClick={() => setConfirming(true)}>مرحله‌ی بعد: پیش‌نمایش اثر</PrimaryButton>
      </>}
    >
      {types.length === 0 ? <Notice type="info">هنوز نوع رابطه‌ای تعریف نشده است؛ در تب «رابطه‌ها» یکی بسازید.</Notice> : (
        <>
          <Field label="نوع رابطه" required>
            <select className={inputClass} value={typeId} onChange={(e) => { setTypeId(e.target.value); setToId(''); }} autoFocus>
              <option value="">— انتخاب کنید —</option>
              {types.map((t) => <option key={t.id} value={t.id}>{t.name} ({LINE_STYLE_TITLES[t.lineStyle]}{t.countsAsManager ? '، مدیر حساب می‌شود' : ''})</option>)}
            </select>
          </Field>
          <Field label="به کدام واحد وصل شود؟" required>
            <select className={inputClass} value={toId} onChange={(e) => setToId(e.target.value)} disabled={!typeId}>
              <option value="">— انتخاب کنید —</option>
              {targets.map((u) => <option key={u.unitId} value={u.unitId}>{pathOf(company, u)}</option>)}
            </select>
          </Field>
          {type && <p className="text-[11px] leading-5 text-slate-500">{type.countsAsManager ? 'مدیر واحد مقصد، مدیر دوم افراد این واحد هم حساب می‌شود (مدیر اصلی‌شان عوض نمی‌شود).' : 'این رابطه فقط در چارت کشیده می‌شود؛ مدیر واحد مقصد، مدیر کسی حساب نمی‌شود.'}</p>}
        </>
      )}
    </AdminDialog>
  );
};

/** Removes one link, after the preview. */
export const RemoveLinkDialog: React.FC<{
  link: { id: string; from: string; to: string; type: LinkType };
  onRemoved: () => Promise<void> | void;
  onReload: () => Promise<void> | void;
  onClose: () => void;
}> = ({ link, onRemoved, onReload, onClose }) => (
  <ImpactPreviewDialog
    title="برداشتن رابطه"
    summary={<>رابطه‌ی «{link.type.name}» از «{link.from}» به «{link.to}» برداشته شود؟ واحدها و افراد تغییری نمی‌کنند.</>}
    changes={[{ kind: 'unlink-link', linkId: link.id }]}
    confirmLabel="رابطه را بردار"
    onConfirm={async () => { await deleteLink(link.id); await onRemoved(); onClose(); }}
    onReload={onReload}
    onClose={onClose}
  />
);

/**
 * A node was just made and an automatic rule has several possible targets for it: the user picks
 * one for each (or none), and the links are added.
 */
export const AutoLinkChoiceDialog: React.FC<{
  choices: AutoLinkChoice[];
  onDone: () => Promise<void> | void;
  onClose: () => void;
}> = ({ choices, onDone, onClose }) => {
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const keyOf = (c: AutoLinkChoice) => `${c.nodeId}|${c.linkTypeId}`;
  const chosen = choices.filter((c) => picked[keyOf(c)]);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      for (const c of chosen) await createLink({ fromNodeId: c.nodeId, toNodeId: picked[keyOf(c)], linkTypeId: c.linkTypeId });
      await onDone();
      onClose();
    } catch (err) {
      setError(userErrorMessage(err, 'افزودن رابطه انجام نشد.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminDialog
      title="رابطه‌ی خودکار: مقصد را انتخاب کنید"
      onClose={() => !busy && onClose()}
      footer={<>
        <SecondaryButton type="button" onClick={onClose} disabled={busy}>بعداً</SecondaryButton>
        <PrimaryButton type="button" onClick={save} disabled={busy || chosen.length === 0}>{busy && <Loader2 className="w-4 h-4 animate-spin" />} افزودن {chosen.length > 0 ? toPersianDigits(chosen.length) : ''} رابطه</PrimaryButton>
      </>}
    >
      {error && <Notice type="error" onClose={() => setError(null)}>{error}</Notice>}
      <p className="text-xs leading-6 text-slate-600 dark:text-slate-300">واحد تازه طبق قاعده‌ی رابطه‌ی خودکار باید به یکی از چند واحد وصل شود؛ کدام؟ اگر الان انتخاب نکنید، بعداً از «افزودن مافوق دوم» می‌توانید.</p>
      {choices.map((c) => (
        <Field key={keyOf(c)} label={`«${c.nodeName}» ← ${c.linkTypeName}`}>
          <select className={inputClass} value={picked[keyOf(c)] || ''} onChange={(e) => setPicked({ ...picked, [keyOf(c)]: e.target.value })}>
            <option value="">— بدون رابطه —</option>
            {c.targets.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Field>
      ))}
    </AdminDialog>
  );
};
