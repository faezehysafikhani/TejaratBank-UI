import React, { useMemo, useState } from 'react';
import { Flame, CalendarClock, Hourglass, Target, ListChecks, Zap, Layers, Armchair, X } from 'lucide-react';
import { Task, TaskStatus, Attachment, User } from '../types';
import { TaskCardList } from './TaskCardList';
import { toPersianDigits } from '../utils/helpers';
import {
  IMPORTANCE_INFO, IMPORTANCE_ORDER, URGENCY_INFO, URGENCY_ORDER, MatrixCell, Urgency, buildMatrix,
} from '../utils/boardView';
import type { Priority } from '../types';

interface Props {
  tasks: Task[];
  currentUser?: User | null;
  showDetails: boolean;
  onEditTask: (task: Task) => void;
  onDeleteTask: (taskId: string) => void;
  onStatusChange: (taskId: string, newStatus: TaskStatus) => void;
  onPreviewAttachment: (attachment: Attachment) => void;
  onViewDetails?: (task: Task) => void;
  onOpenProjectDetails?: (task: Task) => void;
  onToggleSubTask?: (taskId: string, subTaskId: string) => void;
}

// Full class names (Tailwind keeps them). One tone per urgency column header, one per cell.
const URGENCY_STYLE: Record<Urgency, { head: string; icon: React.ElementType }> = {
  high: { head: 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300', icon: Flame },
  medium: { head: 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900 text-amber-700 dark:text-amber-300', icon: CalendarClock },
  low: { head: 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300', icon: Hourglass },
};

const IMPORTANCE_STYLE: Record<Priority, { head: string; icon: React.ElementType }> = {
  high: { head: 'bg-indigo-50 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-900 text-indigo-700 dark:text-indigo-300', icon: Target },
  medium: { head: 'bg-sky-50 dark:bg-sky-950/30 border-sky-200 dark:border-sky-900 text-sky-700 dark:text-sky-300', icon: Layers },
  low: { head: 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300', icon: Armchair },
};

// What each combination means, for the cell's name and tone.
const CELL_META: Record<string, { name: string; hint: string; tone: string; num: string; bar: string }> = {
  'high:high': { name: 'اقدام فوری', hint: 'همین حالا انجام شود', tone: 'bg-rose-50/70 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/70', num: 'text-rose-600 dark:text-rose-400', bar: 'bg-rose-500' },
  'high:medium': { name: 'برنامه‌ریزی دقیق', hint: 'زمان‌بندی و پیگیری کنید', tone: 'bg-amber-50/70 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/70', num: 'text-amber-600 dark:text-amber-400', bar: 'bg-amber-500' },
  'high:low': { name: 'هدف‌گذاری', hint: 'فرصت برای برنامه‌ریزی', tone: 'bg-emerald-50/70 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/70', num: 'text-emerald-600 dark:text-emerald-400', bar: 'bg-emerald-500' },
  'medium:high': { name: 'پاسخ سریع', hint: 'سریع انجام یا تفویض شود', tone: 'bg-orange-50/70 dark:bg-orange-950/20 border-orange-200 dark:border-orange-900/70', num: 'text-orange-600 dark:text-orange-400', bar: 'bg-orange-500' },
  'medium:medium': { name: 'اجرای مرحله‌ای', hint: 'طبق برنامه پیش بروید', tone: 'bg-indigo-50/70 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-900/70', num: 'text-indigo-600 dark:text-indigo-400', bar: 'bg-indigo-500' },
  'medium:low': { name: 'اجرا در نوبت', hint: 'در زمان مناسب انجام شود', tone: 'bg-cyan-50/70 dark:bg-cyan-950/20 border-cyan-200 dark:border-cyan-900/70', num: 'text-cyan-600 dark:text-cyan-400', bar: 'bg-cyan-500' },
  'low:high': { name: 'مزاحم و پرفشار', hint: 'کوتاه انجام یا واگذار کنید', tone: 'bg-yellow-50/70 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-900/70', num: 'text-yellow-700 dark:text-yellow-400', bar: 'bg-yellow-500' },
  'low:medium': { name: 'فرعی و کم‌اثر', hint: 'در صورت وقت', tone: 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700', num: 'text-slate-600 dark:text-slate-300', bar: 'bg-slate-400' },
  'low:low': { name: 'در وقت آزاد', hint: 'حذف یا بایگانی', tone: 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700', num: 'text-slate-500 dark:text-slate-400', bar: 'bg-slate-400' },
};

const keyOf = (c: Pick<MatrixCell, 'importance' | 'urgency'>) => `${c.importance}:${c.urgency}`;

/**
 * «ماتریس اهمیت و فوریت»: nine boxes (importance rows x urgency columns) with the number of open
 * tasks in each. A box opens its tasks below the matrix as ordinary cards.
 */
export const TaskMatrixBoard: React.FC<Props> = ({ tasks, showDetails, currentUser, ...handlers }) => {
  const cells = useMemo(() => buildMatrix(tasks), [tasks]);
  const total = cells.reduce((n, c) => n + c.tasks.length, 0);
  const [selected, setSelected] = useState<string | null>(null);
  const open = cells.find((c) => keyOf(c) === selected) ?? null;

  return (
    <div className="space-y-4" dir="rtl">
      <div className="bg-white dark:bg-slate-800/90 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-xs p-3 sm:p-4 overflow-x-auto">
        <div className="min-w-[640px]">
          <div className="flex items-center justify-between gap-2 mb-3 px-1">
            <h2 className="flex items-center gap-1.5 text-sm font-extrabold text-slate-900 dark:text-white">
              <Zap className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              ماتریس اهمیت و فوریت
            </h2>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              {toPersianDigits(total)} فعالیت جاری؛ فعالیت‌های خاتمه‌یافته در ماتریس نیستند
            </span>
          </div>

          <div className="grid gap-2.5" style={{ gridTemplateColumns: '150px repeat(3, minmax(0, 1fr))' }}>
            <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 flex items-center justify-center text-[11px] font-bold text-slate-400 p-2 text-center">
              اهمیت ↓ &nbsp; فوریت ←
            </div>
            {URGENCY_ORDER.map((u) => {
              const { head, icon: Icon } = URGENCY_STYLE[u];
              return (
                <div key={u} className={`rounded-2xl border px-3 py-2 flex items-center gap-2 ${head}`}>
                  <Icon className="w-4 h-4 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-xs font-extrabold truncate">{URGENCY_INFO[u].title}</div>
                    <div className="text-[10px] opacity-80 truncate">{URGENCY_INFO[u].hint}</div>
                  </div>
                </div>
              );
            })}

            {IMPORTANCE_ORDER.map((imp) => {
              const { head, icon: Icon } = IMPORTANCE_STYLE[imp];
              const rowTotal = cells.filter((c) => c.importance === imp).reduce((n, c) => n + c.tasks.length, 0);
              return (
                <React.Fragment key={imp}>
                  <div className={`rounded-2xl border px-3 py-2 flex flex-col justify-center gap-0.5 ${head}`}>
                    <div className="flex items-center gap-1.5 text-xs font-extrabold">
                      <Icon className="w-4 h-4 shrink-0" />
                      {IMPORTANCE_INFO[imp].title}
                    </div>
                    <div className="text-[10px] opacity-80">{IMPORTANCE_INFO[imp].hint}</div>
                    <div className="text-[10px] font-bold mt-1">{toPersianDigits(rowTotal)} مورد</div>
                  </div>
                  {URGENCY_ORDER.map((u) => {
                    const cell = cells.find((c) => c.importance === imp && c.urgency === u)!;
                    const meta = CELL_META[keyOf(cell)];
                    const active = selected === keyOf(cell);
                    const share = total > 0 ? Math.round((cell.tasks.length / total) * 100) : 0;
                    return (
                      <button
                        key={u}
                        type="button"
                        onClick={() => setSelected(active ? null : keyOf(cell))}
                        aria-pressed={active}
                        aria-label={`${meta.name}: ${cell.tasks.length} فعالیت`}
                        className={`text-right rounded-2xl border p-3 min-h-[128px] flex flex-col justify-between transition-all cursor-pointer hover:shadow-md ${meta.tone} ${
                          active ? 'ring-2 ring-indigo-500 shadow-md' : ''
                        }`}
                      >
                        <div>
                          <div className="text-xs font-extrabold text-slate-800 dark:text-slate-100">{meta.name}</div>
                          <div className="text-[10px] text-slate-500 dark:text-slate-400">{meta.hint}</div>
                        </div>
                        <div className={`text-4xl font-black leading-none text-center my-2 ${cell.tasks.length === 0 ? 'text-slate-300 dark:text-slate-600' : meta.num}`}>
                          {toPersianDigits(cell.tasks.length)}
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 rounded-full bg-slate-200/80 dark:bg-slate-700 overflow-hidden">
                            <div className={`h-full rounded-full ${meta.bar}`} style={{ width: `${share}%` }} />
                          </div>
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 shrink-0">{toPersianDigits(share)}٪</span>
                        </div>
                      </button>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </div>

      {open && (
        <div className="bg-white dark:bg-slate-800/90 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-xs p-3 sm:p-4 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h3 className="flex items-center gap-1.5 text-[13px] font-extrabold text-slate-900 dark:text-white">
              <ListChecks className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              {CELL_META[keyOf(open)].name}
              <span className="font-normal text-[11px] text-slate-500 dark:text-slate-400">
                ({IMPORTANCE_INFO[open.importance].title} · {URGENCY_INFO[open.urgency].title})
              </span>
            </h3>
            <button
              type="button"
              onClick={() => setSelected(null)}
              aria-label="بستن فهرست"
              className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          {open.tasks.length === 0 ? (
            <div className="h-24 flex items-center justify-center border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl">
              <p className="text-xs text-slate-400 dark:text-slate-500 font-medium">هیچ فعالیتی در این خانه وجود ندارد</p>
            </div>
          ) : (
            <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 items-start">
              <div className="space-y-3 md:col-span-2 lg:col-span-3">
                <TaskCardList
                  tasks={open.tasks}
                  currentUser={currentUser}
                  showDetails={showDetails}
                  onEdit={handlers.onEditTask}
                  onDelete={handlers.onDeleteTask}
                  onStatusChange={handlers.onStatusChange}
                  onPreviewAttachment={handlers.onPreviewAttachment}
                  onViewDetails={handlers.onViewDetails}
                  onOpenProjectDetails={handlers.onOpenProjectDetails}
                  onToggleSubTask={handlers.onToggleSubTask}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
