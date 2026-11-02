// «مراحل ساخت»: only information - which of the four parts of a structure (company, units, posts,
// people) is done and how many of each there are. Nothing is added from here: the buttons are on
// the cards of the chart itself.
import React from 'react';
import { Check } from 'lucide-react';
import { toPersianDigits } from '../../../../utils/helpers';
import type { ChartCompany } from '../../../../services/orgStructureApi';
import { allUnitsOf, nodeCount, positionsOf } from '../orgChartModel';

export const BuildSteps: React.FC<{ company: ChartCompany }> = ({ company }) => {
  const units = allUnitsOf(company);
  const posts = units.flatMap((u) => positionsOf(u));
  const withPerson = posts.filter((p) => p.holders.length > 0).length;
  const steps = [
    { id: 'company', title: 'شرکت', done: true, detail: company.name },
    { id: 'units', title: 'واحدها', done: nodeCount(company) > 0, detail: `${toPersianDigits(nodeCount(company))} واحد` },
    { id: 'posts', title: 'پست‌ها', done: posts.length > 0, detail: `${toPersianDigits(posts.length)} پست` },
    { id: 'people', title: 'افراد', done: withPerson > 0, detail: `${toPersianDigits(withPerson)} از ${toPersianDigits(posts.length)} پست فرد دارد` },
  ];
  const next = steps.find((s) => !s.done);
  return (
    <ol className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-2xl border border-indigo-100 dark:border-indigo-900 bg-indigo-50/50 dark:bg-indigo-950/20 px-3 py-2" data-testid="build-steps" aria-label="مراحل ساخت ساختار">
      {steps.map((s, i) => (
        <li key={s.id} className="flex items-center gap-2">
          <span className={`w-5 h-5 rounded-full text-[10px] font-extrabold flex items-center justify-center ${s.done ? 'bg-emerald-500 text-white' : next?.id === s.id ? 'bg-indigo-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-500'}`}>
            {s.done ? <Check className="w-3 h-3" /> : toPersianDigits(i + 1)}
          </span>
          <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{s.title}</span>
          <span className="text-[11px] text-slate-500">{s.detail}</span>
          {i < steps.length - 1 && <span className="text-slate-300 dark:text-slate-600" aria-hidden="true">‹</span>}
        </li>
      ))}
    </ol>
  );
};
