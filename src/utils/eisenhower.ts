// «ماتریس آیزنهاور»: every current activity falls in one of four quarters, by how important it
// is (درجه اهمیت) and how urgent (موعد انجام). Pure helpers; used by the board grouping, the
// matrix page, the statistics card and the task form.
import { Priority, Task } from '../types';
import { getDaysDiff, toPersianDigits } from './helpers';
import { parseDateSafely } from './jalali';

export type QuadrantId = 'do' | 'schedule' | 'delegate' | 'drop';
export type QuadrantTone = 'amber' | 'blue' | 'violet' | 'slate';

export interface Quadrant {
  id: QuadrantId;
  /** «۰۱» ... «۰۴» */
  no: string;
  title: string;
  /** What puts an activity here. */
  hint: string;
  important: boolean;
  urgent: boolean;
  tone: QuadrantTone;
}

/** An activity is urgent when it is due within this many days (or is already past due). */
export const URGENT_WITHIN_DAYS = 3;
/** Where «غیرفوری» puts an activity dropped there: this many days from today. */
const NOT_URGENT_AFTER_DAYS = 7;

export const QUADRANTS: Quadrant[] = [
  { id: 'do', no: '۰۱', title: 'انجام بده', hint: 'مهم و فوری', important: true, urgent: true, tone: 'amber' },
  { id: 'schedule', no: '۰۲', title: 'زمان‌بندی کن', hint: 'مهم، غیرفوری', important: true, urgent: false, tone: 'blue' },
  { id: 'delegate', no: '۰۳', title: 'واگذار کن', hint: 'فوری، کم‌اهمیت', important: false, urgent: true, tone: 'violet' },
  { id: 'drop', no: '۰۴', title: 'حذف کن', hint: 'نه مهم، نه فوری', important: false, urgent: false, tone: 'slate' },
];

/** Full class names per tone, so Tailwind keeps them. */
export const QUADRANT_TONES: Record<QuadrantTone, { top: string; title: string; soft: string; count: string }> = {
  amber: { top: 'border-t-orange-500', title: 'text-orange-800 dark:text-orange-300', soft: 'bg-orange-50 dark:bg-orange-950/40', count: 'text-orange-700 dark:text-orange-300' },
  blue: { top: 'border-t-blue-600', title: 'text-blue-800 dark:text-blue-300', soft: 'bg-blue-50 dark:bg-blue-950/40', count: 'text-blue-700 dark:text-blue-300' },
  violet: { top: 'border-t-violet-600', title: 'text-violet-800 dark:text-violet-300', soft: 'bg-violet-50 dark:bg-violet-950/40', count: 'text-violet-700 dark:text-violet-300' },
  slate: { top: 'border-t-slate-500', title: 'text-slate-700 dark:text-slate-300', soft: 'bg-slate-100 dark:bg-slate-800/60', count: 'text-slate-600 dark:text-slate-300' },
};

export const isImportant = (priority: Priority): boolean => priority === 'high';

/** Days until the due date (negative: past); null without a due date. */
export function daysToDue(task: Pick<Task, 'dueDate'>): number | null {
  if (!task.dueDate) return null;
  const diff = getDaysDiff(task.dueDate);
  if (!diff.text) return null;
  return diff.isPast && diff.days >= 0 ? -1 : diff.days;
}

export function isUrgent(task: Pick<Task, 'dueDate'>): boolean {
  const days = daysToDue(task);
  return days !== null && days <= URGENT_WITHIN_DAYS;
}

export function quadrantOf(task: Pick<Task, 'dueDate' | 'priority'>): Quadrant {
  const important = isImportant(task.priority);
  const urgent = isUrgent(task);
  return QUADRANTS.find((q) => q.important === important && q.urgent === urgent)!;
}

/** The activities that count in the matrix: the ones still to be done. */
const OPEN_STATUSES = ['todo', 'in_progress', 'paused'];

export function matrixTasks(tasks: Task[]): Task[] {
  return tasks.filter((task) => OPEN_STATUSES.includes(task.status));
}

export function groupByQuadrant(tasks: Task[]): Record<QuadrantId, Task[]> {
  const out: Record<QuadrantId, Task[]> = { do: [], schedule: [], delegate: [], drop: [] };
  for (const task of matrixTasks(tasks)) out[quadrantOf(task).id].push(task);
  return out;
}

/** «۱۲ روز تا موعد» / «فردا» / «موعد گذشته» for the line under the priority in the task form. */
export function dueSummary(task: Pick<Task, 'dueDate'>): string {
  const days = daysToDue(task);
  if (days === null) return 'بدون موعد';
  if (days < 0) return 'موعد گذشته';
  if (days === 0) return 'امروز';
  if (days === 1) return 'فردا';
  return `${toPersianDigits(days)} روز تا موعد`;
}

export function describeQuadrant(task: Pick<Task, 'dueDate' | 'priority'>): string {
  const q = quadrantOf(task);
  const importance = q.important ? 'مهم' : 'کم‌اهمیت';
  const level = task.priority === 'high' ? 'اهمیت زیاد' : task.priority === 'medium' ? 'اهمیت متوسط' : 'اهمیت کم';
  return `${importance} (${level}) · ${q.urgent ? 'فوری' : 'غیرفوری'} (${dueSummary(task)})`;
}

/**
 * What dropping an activity on a quarter changes: «مهم» means high priority (a high one dropped
 * on «کم‌اهمیت» becomes medium); «فوری» means due tomorrow, «غیرفوری» means a week from today
 * - the time of day of the due date is kept. Nothing is returned for what already fits.
 */
export function moveToQuadrant(task: Task, target: Quadrant): { priority?: Priority; dueDate?: string } {
  const patch: { priority?: Priority; dueDate?: string } = {};
  if (target.important && task.priority !== 'high') patch.priority = 'high';
  if (!target.important && task.priority === 'high') patch.priority = 'medium';

  if (isUrgent(task) !== target.urgent) {
    const due = parseDateSafely(task.dueDate) ?? new Date();
    const today = new Date();
    const wanted = new Date(today.getFullYear(), today.getMonth(), today.getDate() + (target.urgent ? 1 : NOT_URGENT_AFTER_DAYS));
    // Keep the clock time the activity already had.
    wanted.setUTCHours(due.getUTCHours(), due.getUTCMinutes(), 0, 0);
    patch.dueDate = wanted.toISOString();
  }
  return patch;
}
