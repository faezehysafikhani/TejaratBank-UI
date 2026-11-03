// «ماتریس آیزنهاور»: the current activities in four quarters by importance (درجه اهمیت) and
// urgency (موعد انجام). A quarter opens its full list; an activity can be dragged to another
// quarter (or moved from the list on a phone), which changes its priority and due date.
import React, { useMemo, useState } from 'react';
import { X, LayoutGrid, GripVertical } from 'lucide-react';
import { Priority, PRIORITIES, Task } from '../types';
import { toPersianDigits } from '../utils/helpers';
import {
  QUADRANTS, QUADRANT_TONES, Quadrant, QuadrantId, dueSummary, groupByQuadrant, matrixTasks, moveToQuadrant, quadrantOf,
} from '../utils/eisenhower';

interface EisenhowerViewProps {
  tasks: Task[];
  onViewDetails: (task: Task) => void;
  onMoveTask: (task: Task, patch: { priority?: Priority; dueDate?: string }) => void;
}

const PREVIEW_COUNT = 5;

export const EisenhowerView: React.FC<EisenhowerViewProps> = ({ tasks, onViewDetails, onMoveTask }) => {
  const grouped = useMemo(() => groupByQuadrant(tasks), [tasks]);
  const total = useMemo(() => matrixTasks(tasks).length, [tasks]);
  const [openQuadrant, setOpenQuadrant] = useState<QuadrantId | null>(null);
  const [dragOver, setDragOver] = useState<QuadrantId | null>(null);

  const move = (task: Task, target: Quadrant) => {
    const patch = moveToQuadrant(task, target);
    if (patch.priority || patch.dueDate) onMoveTask(task, patch);
  };

  const opened = openQuadrant ? QUADRANTS.find((q) => q.id === openQuadrant)! : null;

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-base font-black text-slate-900 dark:text-white">
            <LayoutGrid className="w-5 h-5 text-orange-500" />
            ماتریس آیزنهاور
          </h2>
          <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-900">
            {toPersianDigits(total)} فعالیت جاری
          </span>
        </div>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          بر اساس «درجه اهمیت» و «موعد انجام»؛ مهم یعنی اهمیت زیاد و فوری یعنی موعد تا ۳ روز دیگر.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 text-center text-xs font-black">
        <div className="rounded-xl bg-slate-900 text-white py-1.5">فوری</div>
        <div className="rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-100 py-1.5">غیرفوری</div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {QUADRANTS.map((q) => {
          const tone = QUADRANT_TONES[q.tone];
          const list = grouped[q.id];
          return (
            <section
              key={q.id}
              data-quadrant={q.id}
              onDragOver={(e) => { e.preventDefault(); if (dragOver !== q.id) setDragOver(q.id); }}
              onDragLeave={() => setDragOver((current) => (current === q.id ? null : current))}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(null);
                const task = tasks.find((t) => t.id === e.dataTransfer.getData('text/plain'));
                if (task) move(task, q);
              }}
              className={`min-h-[12rem] rounded-2xl border border-slate-200 dark:border-slate-700 border-t-4 ${tone.top} bg-white dark:bg-slate-900 p-2.5 shadow-sm transition-shadow ${
                dragOver === q.id ? 'ring-2 ring-indigo-400 shadow-lg' : ''
              }`}
            >
              <button
                type="button"
                onClick={() => setOpenQuadrant(q.id)}
                className="w-full flex items-center justify-between gap-1 text-right cursor-pointer"
                title="مشاهده‌ی لیست کامل"
              >
                <span className={`text-sm font-black ${tone.title}`}>{q.no} · {q.title}</span>
                <span className={`text-xs font-black ${tone.count}`}>({toPersianDigits(list.length)})</span>
              </button>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-2">{q.hint}</p>

              <div className="space-y-1.5">
                {list.slice(0, PREVIEW_COUNT).map((task) => (
                  <div
                    key={task.id}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData('text/plain', task.id)}
                    onClick={() => onViewDetails(task)}
                    className={`flex items-center gap-1 rounded-lg border border-slate-100 dark:border-slate-800 ${tone.soft} px-2 py-1.5 text-xs font-bold text-slate-800 dark:text-slate-100 cursor-pointer hover:shadow-sm`}
                    title={`${task.title}\n${dueSummary(task)}`}
                  >
                    <GripVertical className="w-3 h-3 shrink-0 text-slate-300 hidden sm:block" />
                    <span className="truncate">{task.title}</span>
                  </div>
                ))}
                {list.length > PREVIEW_COUNT && (
                  <button
                    type="button"
                    onClick={() => setOpenQuadrant(q.id)}
                    className="w-full text-center text-[11px] font-bold text-indigo-600 dark:text-indigo-400 py-1 cursor-pointer"
                  >
                    + {toPersianDigits(list.length - PREVIEW_COUNT)} مورد دیگر
                  </button>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <p className="text-center text-[11px] text-slate-500 dark:text-slate-400">
        کارت‌ها را بین ربع‌ها بکشید تا اهمیت و موعد عوض شود؛ روی گوشی از لیست هر ربع «انتقال به» را بزنید.
      </p>

      {opened && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-sm p-0 sm:p-4"
          onClick={() => setOpenQuadrant(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full sm:max-w-lg max-h-[85vh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className={`text-sm font-black ${QUADRANT_TONES[opened.tone].title}`}>{opened.no} · {opened.title}</h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">{opened.hint} · {toPersianDigits(grouped[opened.id].length)} مورد</p>
              </div>
              <button type="button" onClick={() => setOpenQuadrant(null)} aria-label="بستن" className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto p-3 space-y-2">
              {grouped[opened.id].length === 0 && (
                <p className="py-8 text-center text-xs text-slate-400">فعالیتی در این ربع نیست.</p>
              )}
              {grouped[opened.id].map((task) => (
                <div key={task.id} className={`rounded-xl border border-slate-100 dark:border-slate-800 ${QUADRANT_TONES[opened.tone].soft} p-2.5`}>
                  <button
                    type="button"
                    onClick={() => { setOpenQuadrant(null); onViewDetails(task); }}
                    className="w-full text-right text-sm font-bold text-slate-900 dark:text-white cursor-pointer"
                  >
                    {task.title}
                  </button>
                  <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                    <span>اهمیت {PRIORITIES[task.priority].title} · {dueSummary(task)}</span>
                    <select
                      aria-label="انتقال به ربع دیگر"
                      value={quadrantOf(task).id}
                      onChange={(e) => move(task, QUADRANTS.find((q) => q.id === e.target.value)!)}
                      className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-1.5 py-1 text-[11px] font-bold text-slate-700 dark:text-slate-200 cursor-pointer"
                    >
                      {QUADRANTS.map((q) => (
                        <option key={q.id} value={q.id}>{q.id === quadrantOf(task).id ? `اکنون: ${q.title}` : `انتقال به ${q.title}`}</option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
