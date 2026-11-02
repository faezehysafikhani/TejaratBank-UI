// Merging two nodes: the target stays; the source's nodes and posts move under it and the source
// is deactivated (from the chosen date; empty: right away). Standalone: the company's chart in,
// the choice out (onSubmit); the impact preview, when there is one, is the caller's (preview slot).
import React, { useMemo, useState } from 'react';
import { ArrowLeft, GitMerge } from 'lucide-react';
import type { ChartCompany } from '../../../../services/orgStructureApi';
import { toPersianDigits } from '../../../../utils/helpers';
import { JalaliDatePicker } from '../../../JalaliDatePicker';
import { Field, Notice, PrimaryButton, SecondaryButton, inputClass } from '../../AdminUi';
import { positionsOf, unitHeadcount, unitTree } from '../orgChartModel';

export interface MergeNodesInput { sourceNodeId: string; targetNodeId: string; effectiveDate?: string }

/** Why a merge cannot be done, or null. */
export function mergeProblem(company: ChartCompany, sourceNodeId: string, targetNodeId: string): string | null {
  if (!sourceNodeId || !targetNodeId) return 'واحد مبدأ و مقصد را انتخاب کنید.';
  if (sourceNodeId === targetNodeId) return 'مبدأ و مقصد نباید یکی باشند.';
  const tree = unitTree(company);
  const start = tree.findIndex((t) => t.unit.unitId === sourceNodeId);
  if (start < 0 || !tree.some((t) => t.unit.unitId === targetNodeId)) return 'واحد انتخاب‌شده در این شرکت نیست.';
  // The source's subtree: the nodes after it in the tree until one at its depth or above.
  for (let i = start + 1; i < tree.length && tree[i].depth > tree[start].depth; i++) {
    if (tree[i].unit.unitId === targetNodeId) return 'مقصد نمی‌تواند زیرمجموعه‌ی مبدأ باشد.';
  }
  return null;
}

export const MergeNodesForm: React.FC<{
  company: ChartCompany;
  initialSourceId?: string;
  onSubmit: (input: MergeNodesInput) => void | Promise<void>;
  onCancel?: () => void;
  /** The impact preview for the current choice (the caller's), shown above the buttons. */
  preview?: React.ReactNode;
  busy?: boolean;
}> = ({ company, initialSourceId = '', onSubmit, onCancel, preview, busy = false }) => {
  const [sourceId, setSourceId] = useState(initialSourceId);
  const [targetId, setTargetId] = useState('');
  const [date, setDate] = useState<string | undefined>(undefined);
  const tree = useMemo(() => unitTree(company).filter((t) => t.unit.isActive !== false), [company]);
  const source = tree.find((t) => t.unit.unitId === sourceId)?.unit;
  const target = tree.find((t) => t.unit.unitId === targetId)?.unit;
  const problem = sourceId && targetId ? mergeProblem(company, sourceId, targetId) : null;
  const ready = !!source && !!target && !problem && !busy;

  const option = ({ unit, depth }: (typeof tree)[number]) => (
    <option key={unit.unitId} value={unit.unitId}>
      {`${'  '.repeat(depth)}${depth > 0 ? '└ ' : ''}${unit.name}${unit.nodeType ? ` (${unit.nodeType.name})` : ''}`}
    </option>
  );

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => { e.preventDefault(); if (ready) onSubmit({ sourceNodeId: sourceId, targetNodeId: targetId, effectiveDate: date }); }}
    >
      <div className="grid sm:grid-cols-[1fr_auto_1fr] items-end gap-3">
        <Field label="واحدی که ادغام می‌شود (مبدأ)" required>
          <select className={inputClass} value={sourceId} onChange={(e) => setSourceId(e.target.value)} disabled={busy}>
            <option value="">انتخاب کنید</option>
            {tree.map(option)}
          </select>
        </Field>
        <ArrowLeft className="hidden sm:block w-5 h-5 mb-3 text-slate-400" aria-hidden />
        <Field label="واحدی که می‌ماند (مقصد)" required>
          <select className={inputClass} value={targetId} onChange={(e) => setTargetId(e.target.value)} disabled={busy}>
            <option value="">انتخاب کنید</option>
            {tree.filter((t) => t.unit.unitId !== sourceId).map(option)}
          </select>
        </Field>
      </div>

      <Field label="تاریخ اجرا" hint="خالی: از همین الان. تا آن تاریخ ساختار فعلی می‌ماند.">
        <JalaliDatePicker value={date} onChange={setDate} ariaLabel="تاریخ اجرای ادغام" placeholder="از همین الان" />
      </Field>

      {problem && <Notice type="error">{problem}</Notice>}

      {source && target && !problem && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 text-xs text-slate-600 dark:text-slate-300 space-y-1.5 leading-relaxed">
          <div className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-100">
            <GitMerge className="w-4 h-4 text-indigo-600" />
            «{source.name}» در «{target.name}» ادغام می‌شود.
          </div>
          <ul className="list-disc ps-5 space-y-0.5">
            <li>{toPersianDigits(source.children?.length ?? 0)} واحد زیرمجموعه به زیر «{target.name}» می‌رود.</li>
            <li>{toPersianDigits(positionsOf(source).length)} پست ({toPersianDigits(unitHeadcount(source))} نفر) به «{target.name}» منتقل می‌شود؛ وظایف باز همچنان به همان پست‌ها وصل‌اند.</li>
            <li>«{source.name}» غیرفعال می‌شود و سابقه‌اش می‌ماند.</li>
          </ul>
        </div>
      )}

      {preview}

      <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
        {onCancel && <SecondaryButton type="button" onClick={onCancel} disabled={busy}>انصراف</SecondaryButton>}
        <PrimaryButton type="submit" disabled={!ready}>
          <GitMerge className="w-4 h-4" />
          ادغام
        </PrimaryButton>
      </div>
    </form>
  );
};
