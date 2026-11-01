import React, { useEffect, useState } from 'react';
import { CheckSquare, FolderKanban, Loader2 } from 'lucide-react';
import { Task } from '../types';
import { MeetingTaskOption, getMeetingTaskOptions } from '../services/meetingApi';
import { parseISOToJalali } from '../utils/jalali';
import { toPersianDigits } from '../utils/helpers';

const STATUS: Record<string, { label: string; cls: string }> = {
  todo: { label: 'شروع نشده', cls: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700' },
  in_progress: { label: 'درحال اجرا', cls: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/50 dark:text-sky-300 dark:border-sky-800' },
  paused: { label: 'متوقف', cls: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800' },
  completed: { label: 'خاتمه یافته', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800' },
};
// The server names statuses in PascalCase (Todo, InProgress...), the app in snake_case.
const normalize = (status: string) => ({ Todo: 'todo', InProgress: 'in_progress', Paused: 'paused', Completed: 'completed' } as Record<string, string>)[status] ?? status;

const day = (iso: string) => {
  try {
    const d = parseISOToJalali(iso.slice(0, 10));
    return toPersianDigits(`${d.jy}/${String(d.jm).padStart(2, '0')}/${String(d.jd).padStart(2, '0')}`);
  } catch {
    return '—';
  }
};

/**
 * «وظایف این جلسه»: every task linked to the meeting - the ones made from its resolutions («ایجاد
 * وظیفه») and the ones linked by hand - as a list under the minutes, so what came out of the meeting
 * is in one place. A task just made is in the list as soon as it is linked.
 */
export function MeetingResolutionTasks({ taskIds, unlinked = [], onLink }: {
  taskIds: string[];
  /** Tasks that carry this meeting's label but are not linked to it (made before the link was saved): listed with a button to link them. */
  unlinked?: Task[];
  onLink?: (taskId: string) => void;
}) {
  const [rows, setRows] = useState<MeetingTaskOption[] | null>(null);
  const [failed, setFailed] = useState(false);
  const key = taskIds.join(',');

  useEffect(() => {
    if (taskIds.length === 0) { setRows([]); return undefined; }
    let alive = true;
    setFailed(false);
    getMeetingTaskOptions(taskIds)
      .then((result) => { if (alive) setRows(result.items); })
      .catch(() => { if (alive) { setFailed(true); setRows((old) => old ?? []); } });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const hidden = rows ? Math.max(0, taskIds.length - rows.length) : 0;
  return (
    <section className="mt-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden" aria-label="وظایف این جلسه">
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-slate-100 dark:border-slate-800">
        <h4 className="flex items-center gap-2 text-sm font-extrabold text-slate-800 dark:text-slate-100"><CheckSquare className="w-4 h-4 text-indigo-600" />وظایف این جلسه</h4>
        <span className="text-[11px] text-slate-500">{toPersianDigits(taskIds.length + unlinked.length)} وظیفه</span>
      </div>
      {rows === null ? (
        <div className="flex items-center justify-center gap-2 py-6 text-xs text-slate-400"><Loader2 className="w-4 h-4 animate-spin" />در حال دریافت وظایف…</div>
      ) : taskIds.length === 0 && unlinked.length === 0 ? (
        <p className="py-6 px-4 text-center text-xs text-slate-400">هنوز وظیفه‌ای از این جلسه ساخته یا به آن وصل نشده است. با «ایجاد وظیفه» از روی مصوبات، وظیفه‌ی تازه این‌جا فهرست می‌شود.</p>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {rows.map((task, index) => {
            const status = STATUS[normalize(task.status)] ?? { label: task.status, cls: STATUS.todo.cls };
            return (
              <li key={task.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="w-5 text-[11px] font-bold text-slate-400">{toPersianDigits(index + 1)}</span>
                <span className="min-w-0 flex-1 flex items-center gap-1.5 text-sm font-bold text-slate-800 dark:text-slate-100">
                  {task.isProject && <FolderKanban className="w-3.5 h-3.5 text-emerald-600 shrink-0" aria-label="پروژه" />}
                  <span className="truncate" title={task.title}>{task.title}</span>
                </span>
                <span className="hidden sm:inline text-[11px] text-slate-500 whitespace-nowrap">موعد: {day(task.dueDate)}</span>
                <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-bold border whitespace-nowrap ${status.cls}`}>{status.label}</span>
              </li>
            );
          })}
          {unlinked.map((task, index) => {
            const status = STATUS[task.status] ?? STATUS.todo;
            return (
              <li key={task.id} className="flex items-center gap-3 px-4 py-2.5 bg-amber-50/40 dark:bg-amber-950/10">
                <span className="w-5 text-[11px] font-bold text-slate-400">{toPersianDigits(rows.length + index + 1)}</span>
                <span className="min-w-0 flex-1 text-sm font-bold text-slate-800 dark:text-slate-100 truncate" title={task.title}>{task.title}</span>
                <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-bold border whitespace-nowrap ${status.cls}`}>{status.label}</span>
                {onLink && <button type="button" onClick={() => onLink(task.id)} className="text-[11px] font-bold text-indigo-700 dark:text-indigo-300 hover:underline cursor-pointer whitespace-nowrap">اتصال به جلسه</button>}
              </li>
            );
          })}
        </ul>
      )}
      {failed && <p className="px-4 pb-3 text-[11px] text-rose-600">دریافت فهرست وظایف کامل انجام نشد؛ آخرین فهرست دریافت‌شده نمایش داده می‌شود.</p>}
      {hidden > 0 && !failed && <p className="px-4 pb-3 text-[11px] text-slate-500">{toPersianDigits(hidden)} وظیفه‌ی دیگر برای شما قابل نمایش نیست.</p>}
    </section>
  );
}
