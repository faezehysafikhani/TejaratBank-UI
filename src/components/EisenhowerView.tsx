// «ماتریس آیزنهاور»: the current activities in four quarters by importance (درجه اهمیت) and
// urgency (موعد انجام). A quarter opens its full list; an activity can be dragged to another
// quarter (or moved from the list on a phone), which changes its priority and due date.
import React, { useMemo, useState } from 'react';
import { X, LayoutGrid, Zap, CalendarClock, Send, Trash2, Clock, Inbox, ChevronLeft } from 'lucide-react';
import { Priority, PRIORITIES, Task } from '../types';
import { toPersianDigits } from '../utils/helpers';
import {
  QUADRANTS, QUADRANT_TONES, MatrixItem, Quadrant, QuadrantId, QuadrantTone, daysToDue, dueSummary, groupItemsByQuadrant,
  moveToQuadrant, quadrantOfItem,
} from '../utils/eisenhower';

interface EisenhowerViewProps {
  tasks: Task[];
  onViewDetails: (task: Task) => void;
  onMoveTask: (item: MatrixItem, patch: { priority?: Priority; dueDate?: string }) => void;
}

const PREVIEW_COUNT = 5;

const ICONS: Record<QuadrantId, React.ElementType> = { do: Zap, schedule: CalendarClock, delegate: Send, drop: Trash2 };

// Full class names, so Tailwind keeps them.
const LOOK: Record<QuadrantTone, { card: string; chip: string; bar: string; dot: string; head: string }> = {
  amber: {
    card: 'from-orange-50/90 to-white dark:from-orange-950/30 dark:to-slate-900 border-orange-200/80 dark:border-orange-900/50',
    chip: 'bg-orange-100 text-orange-700 dark:bg-orange-950/70 dark:text-orange-300',
    bar: 'bg-orange-500', dot: 'bg-orange-500', head: 'from-orange-500 to-amber-500',
  },
  blue: {
    card: 'from-blue-50/90 to-white dark:from-blue-950/30 dark:to-slate-900 border-blue-200/80 dark:border-blue-900/50',
    chip: 'bg-blue-100 text-blue-700 dark:bg-blue-950/70 dark:text-blue-300',
    bar: 'bg-blue-600', dot: 'bg-blue-600', head: 'from-blue-600 to-indigo-600',
  },
  violet: {
    card: 'from-violet-50/90 to-white dark:from-violet-950/30 dark:to-slate-900 border-violet-200/80 dark:border-violet-900/50',
    chip: 'bg-violet-100 text-violet-700 dark:bg-violet-950/70 dark:text-violet-300',
    bar: 'bg-violet-600', dot: 'bg-violet-600', head: 'from-violet-600 to-purple-600',
  },
  slate: {
    card: 'from-slate-100/90 to-white dark:from-slate-800/60 dark:to-slate-900 border-slate-200 dark:border-slate-700',
    chip: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
    bar: 'bg-slate-500', dot: 'bg-slate-500', head: 'from-slate-600 to-slate-700',
  },
};

/** The due date chip: red once past due, amber when it is today or tomorrow, quiet otherwise. */
function dueChipClass(item: MatrixItem): string {
  const days = daysToDue(item);
  if (days === null) return 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400';
  if (days < 0) return 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300';
  if (days <= 1) return 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300';
  return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
}

const PRIORITY_DOT: Record<Priority, string> = { high: 'bg-rose-500', medium: 'bg-amber-400', low: 'bg-emerald-500' };

export const EisenhowerView: React.FC<EisenhowerViewProps> = ({ tasks, onViewDetails, onMoveTask }) => {
  const grouped = useMemo(() => groupItemsByQuadrant(tasks), [tasks]);
  const total = useMemo(() => QUADRANTS.reduce((sum, q) => sum + grouped[q.id].length, 0), [grouped]);
  const [openQuadrant, setOpenQuadrant] = useState<QuadrantId | null>(null);
  const [dragOver, setDragOver] = useState<QuadrantId | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  const move = (item: MatrixItem, target: Quadrant) => {
    const patch = moveToQuadrant(item, target);
    if (patch.priority || patch.dueDate) onMoveTask(item, patch);
  };

  const opened = openQuadrant ? QUADRANTS.find((q) => q.id === openQuadrant)! : null;

  const rowProps = (item: MatrixItem) => ({
    role: 'button' as const,
    tabIndex: 0,
    onClick: () => onViewDetails(item.task),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onViewDetails(item.task);
      }
    },
  });

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {/* Title and how the current activities spread over the four quarters */}
      <div className="rounded-3xl border border-slate-200/80 dark:border-slate-700 bg-gradient-to-br from-white to-slate-50 dark:from-slate-900 dark:to-slate-900/70 p-4 sm:p-5 shadow-[0_10px_28px_-18px_rgba(15,23,42,0.55)]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-md shadow-orange-500/30">
              <LayoutGrid className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">ماتریس آیزنهاور</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                بر اساس «درجه اهمیت» و «موعد انجام» بفهمید اول چه کاری را انجام دهید.
              </p>
            </div>
          </div>
          <span className="shrink-0 rounded-full border border-indigo-100 dark:border-indigo-900 bg-indigo-50 dark:bg-indigo-950/50 px-3 py-1 text-[11px] font-black text-indigo-700 dark:text-indigo-300">
            {toPersianDigits(total)} فعالیت جاری
          </span>
        </div>

        {total > 0 && (
          <div className="mt-4">
            <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" role="img" aria-label="سهم هر ربع از فعالیت‌های جاری">
              {QUADRANTS.map((q) => (
                <div
                  key={q.id}
                  className={`${LOOK[q.tone].bar} transition-all duration-500`}
                  style={{ width: `${(grouped[q.id].length / total) * 100}%` }}
                  title={`${q.title}: ${toPersianDigits(grouped[q.id].length)}`}
                />
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              {QUADRANTS.map((q) => (
                <span key={q.id} className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-300">
                  <span className={`h-2 w-2 rounded-full ${LOOK[q.tone].dot}`} />
                  {q.title}
                  <span className="text-slate-400">{toPersianDigits(grouped[q.id].length)}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* The matrix: urgency across (فوری | غیرفوری), importance down (مهم / کم‌اهمیت) */}
      <div className="grid grid-cols-[1.5rem_1fr_1fr] gap-x-2 gap-y-2 sm:grid-cols-[2rem_1fr_1fr] sm:gap-x-3">
        <div />
        <div className="flex items-center justify-center gap-1.5 rounded-2xl bg-slate-900 py-2 text-xs font-black text-white shadow-sm">
          <Zap className="h-3.5 w-3.5 text-orange-400" /> فوری
        </div>
        <div className="flex items-center justify-center gap-1.5 rounded-2xl bg-slate-200 py-2 text-xs font-black text-slate-700 dark:bg-slate-700 dark:text-slate-100">
          <Clock className="h-3.5 w-3.5" /> غیرفوری
        </div>

        {[true, false].map((important) => (
          <React.Fragment key={String(important)}>
            <div className="flex items-center justify-center">
              <span className="[writing-mode:vertical-rl] rotate-180 text-[11px] font-black tracking-wide text-slate-500 dark:text-slate-400">
                {important ? 'مهم' : 'کم‌اهمیت'}
              </span>
            </div>
            {QUADRANTS.filter((q) => q.important === important).map((q) => {
              const look = LOOK[q.tone];
              const Icon = ICONS[q.id];
              const list = grouped[q.id];
              const share = total > 0 ? Math.round((list.length / total) * 100) : 0;
              const over = dragOver === q.id;
              return (
                <section
                  key={q.id}
                  data-quadrant={q.id}
                  onDragOver={(e) => { e.preventDefault(); if (dragOver !== q.id) setDragOver(q.id); }}
                  onDragLeave={() => setDragOver((current) => (current === q.id ? null : current))}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(null);
                    setDragging(null);
                    const dropped = QUADRANTS.flatMap((x) => grouped[x.id]).find((i) => i.key === e.dataTransfer.getData('text/plain'));
                    if (dropped) move(dropped, q);
                  }}
                  className={`relative flex min-h-[14rem] flex-col overflow-hidden rounded-3xl border bg-gradient-to-b ${look.card} p-3 shadow-[0_10px_28px_-18px_rgba(15,23,42,0.55)] transition-all duration-200 hover:shadow-[0_16px_34px_-18px_rgba(15,23,42,0.55)] ${
                    over ? 'ring-2 ring-indigo-400 ring-offset-2 ring-offset-transparent' : ''
                  }`}
                >
                  <span className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-l ${look.head}`} />

                  <button
                    type="button"
                    onClick={() => setOpenQuadrant(q.id)}
                    className="mt-1 flex w-full items-start justify-between gap-2 text-right cursor-pointer"
                    title="مشاهده‌ی لیست کامل"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${look.chip}`}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className={`block truncate text-sm font-black ${QUADRANT_TONES[q.tone].title}`}>{q.no} · {q.title}</span>
                        <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">{q.hint}</span>
                      </span>
                    </span>
                    <span className={`shrink-0 rounded-xl px-2 py-0.5 text-sm font-black ${look.chip}`}>{toPersianDigits(list.length)}</span>
                  </button>

                  <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-slate-200/70 dark:bg-slate-700/60" title={`${toPersianDigits(share)}٪ از فعالیت‌های جاری`}>
                    <div className={`h-full rounded-full ${look.bar} transition-all duration-500`} style={{ width: `${share}%` }} />
                  </div>

                  <div className="mt-2.5 flex-1 space-y-1.5">
                    {list.slice(0, PREVIEW_COUNT).map((task) => (
                      <div
                        key={task.key}
                        draggable
                        onDragStart={(e) => { e.dataTransfer.setData('text/plain', task.key); setDragging(task.key); }}
                        onDragEnd={() => { setDragging(null); setDragOver(null); }}
                        {...rowProps(task)}
                        className={`group rounded-xl border border-white/70 dark:border-slate-700/70 bg-white/90 dark:bg-slate-800/80 px-2.5 py-2 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 cursor-grab active:cursor-grabbing ${
                          dragging === task.key ? 'opacity-40' : ''
                        }`}
                        title={task.title}
                      >
                        <div className="flex items-start gap-1.5">
                          <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${PRIORITY_DOT[task.priority]}`} title={`اهمیت ${PRIORITIES[task.priority].title}`} />
                          <span className="line-clamp-2 text-xs font-bold leading-5 text-slate-800 dark:text-slate-100">{task.title}</span>
                        </div>
                        <span className={`mt-1 inline-block rounded-md px-1.5 py-0.5 text-[10px] font-bold ${dueChipClass(task)}`}>{dueSummary(task)}</span>
                      </div>
                    ))}

                    {list.length === 0 && (
                      <div className="flex h-full min-h-[7rem] flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-slate-300/80 dark:border-slate-600/70 text-slate-400 dark:text-slate-500">
                        <Inbox className="h-6 w-6" />
                        <span className="text-[11px] font-bold">{over ? 'رها کنید' : 'فعالیتی اینجا نیست'}</span>
                      </div>
                    )}
                  </div>

                  {list.length > PREVIEW_COUNT && (
                    <button
                      type="button"
                      onClick={() => setOpenQuadrant(q.id)}
                      className="mt-2 flex w-full items-center justify-center gap-1 rounded-xl py-1.5 text-[11px] font-black text-indigo-600 hover:bg-white/70 dark:text-indigo-400 dark:hover:bg-slate-800/70 cursor-pointer"
                    >
                      {toPersianDigits(list.length - PREVIEW_COUNT)} مورد دیگر
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                  )}

                  {over && (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-3xl bg-indigo-500/10 backdrop-blur-[1px]">
                      <span className="rounded-full bg-indigo-600 px-3 py-1 text-xs font-black text-white shadow-lg">
                        انتقال به «{q.title}»
                      </span>
                    </div>
                  )}
                </section>
              );
            })}
          </React.Fragment>
        ))}
      </div>

      <p className="text-center text-[11px] text-slate-500 dark:text-slate-400">
        مهم یعنی اهمیت «زیاد» و فوری یعنی موعد تا ۳ روز دیگر. کارت را بکشید و در ربع دیگر رها کنید؛ روی گوشی از لیست هر ربع «انتقال به» را بزنید.
      </p>

      {opened && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in duration-200"
          onClick={() => setOpenQuadrant(null)}
          role="dialog"
          aria-modal="true"
          aria-label={`${opened.no} ${opened.title}`}
        >
          <div
            className="flex w-full sm:max-w-lg max-h-[85vh] flex-col overflow-hidden rounded-t-3xl sm:rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl animate-in slide-in-from-bottom-4 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`flex items-center justify-between gap-3 bg-gradient-to-l ${LOOK[opened.tone].head} p-4 text-white`}>
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/20">
                  {React.createElement(ICONS[opened.id], { className: 'h-5 w-5' })}
                </span>
                <div>
                  <h3 className="text-sm font-black">{opened.no} · {opened.title}</h3>
                  <p className="text-[11px] text-white/85">{opened.hint} · {toPersianDigits(grouped[opened.id].length)} مورد</p>
                </div>
              </div>
              <button type="button" onClick={() => setOpenQuadrant(null)} aria-label="بستن" title="بستن" className="rounded-xl p-2 text-white/90 hover:bg-white/15 cursor-pointer">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-2 overflow-y-auto p-3">
              {grouped[opened.id].length === 0 && (
                <div className="flex flex-col items-center gap-2 py-10 text-slate-400">
                  <Inbox className="h-8 w-8" />
                  <p className="text-xs font-bold">فعالیتی در این ربع نیست.</p>
                </div>
              )}
              {grouped[opened.id].map((task) => (
                <div key={task.key} className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 p-3">
                  <button
                    type="button"
                    onClick={() => { setOpenQuadrant(null); onViewDetails(task.task); }}
                    className="flex w-full items-start gap-2 text-right cursor-pointer"
                  >
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${PRIORITY_DOT[task.priority]}`} />
                    <span className="text-sm font-bold leading-6 text-slate-900 dark:text-white">{task.title}</span>
                  </button>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${PRIORITIES[task.priority].bgColor} ${PRIORITIES[task.priority].textColor}`}>
                        اهمیت {PRIORITIES[task.priority].title}
                      </span>
                      <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${dueChipClass(task)}`}>{dueSummary(task)}</span>
                    </div>
                    <select
                      aria-label="انتقال به ربع دیگر"
                      value={quadrantOfItem(task).id}
                      onChange={(e) => move(task, QUADRANTS.find((q) => q.id === e.target.value)!)}
                      className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-[11px] font-bold text-slate-700 dark:text-slate-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    >
                      {QUADRANTS.map((q) => (
                        <option key={q.id} value={q.id}>{q.id === quadrantOfItem(task).id ? `اکنون: ${q.title}` : `انتقال به ${q.title}`}</option>
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
