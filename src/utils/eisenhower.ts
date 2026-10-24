// «ماتریس آیزنهاور»: every current activity falls in one of four quarters, by how important it
// is (درجه اهمیت) and how urgent (موعد انجام). Pure helpers; used by the board grouping, the
// matrix page, the statistics card and the task form.
import { Priority, ProjectSubTask, Task } from '../types';
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

const OPEN_STATUSES = ['todo', 'in_progress', 'paused'];

/** One entry of the matrix: a plain or recurring activity, or one sub-activity of a project. */
export interface MatrixItem {
  key: string;
  task: Task;
  subTaskId?: string;
  title: string;
  priority: Priority;
  dueDate: string;
}

const isDone = (st: ProjectSubTask): boolean => st.completed || st.status === 'completed';
const subTaskDate = (st: ProjectSubTask, task: Pick<Task, 'dueDate'>): string => st.endDate || st.startDate || task.dueDate;

/**
 * What an activity puts in the matrix. A plain activity is one entry (its priority and due date).
 * A project has no entry of its own, only one per open sub-activity (its importance and end date). A recurring
 * activity is its next open occurrence. Finished activities have none.
 */
export function matrixItemsOf(task: Task): MatrixItem[] {
  if (!OPEN_STATUSES.includes(task.status)) return [];
  const subTasks = task.projectSubTasks || [];
  // A project is not placed itself: only its sub-activities are.
  if (subTasks.length === 0 && task.isProject) return [];
  if (subTasks.length === 0) {
    return [{ key: task.id, task, title: task.title, priority: task.priority, dueDate: task.dueDate }];
  }

  let open = subTasks.filter((st) => !isDone(st));
  if (task.isRecurring) {
    // Only the next occurrence matters now, not every one scheduled for the months ahead.
    open = [...open]
      .sort((a, b) => (parseDateSafely(subTaskDate(a, task))?.getTime() ?? 0) - (parseDateSafely(subTaskDate(b, task))?.getTime() ?? 0))
      .slice(0, 1);
  }
  return open.map((st) => ({
    key: `${task.id}:${st.id}`,
    task,
    subTaskId: st.id,
    title: task.isRecurring ? task.title : `${task.title} › ${st.title}`,
    priority: st.importance as Priority,
    dueDate: subTaskDate(st, task),
  }));
}

export function quadrantOfItem(item: Pick<MatrixItem, 'priority' | 'dueDate'>): Quadrant {
  return quadrantOf(item);
}

export function allMatrixItems(tasks: Task[]): MatrixItem[] {
  return tasks.flatMap(matrixItemsOf);
}

export function groupItemsByQuadrant(tasks: Task[]): Record<QuadrantId, MatrixItem[]> {
  const out: Record<QuadrantId, MatrixItem[]> = { do: [], schedule: [], delegate: [], drop: [] };
  for (const item of allMatrixItems(tasks)) out[quadrantOf(item).id].push(item);
  return out;
}

/**
 * The quarters an activity card is placed in on the board: one for a plain or recurring
 * activity, and for a project every quarter one of its open sub-activities is in (the project
 * itself is not placed).
 */
export function quadrantsOfTask(task: Task): Quadrant[] {
  const ids = new Set(matrixItemsOf(task).map((item) => quadrantOf(item).id));
  return QUADRANTS.filter((q) => ids.has(q.id));
}

export function groupByQuadrant(tasks: Task[]): Record<QuadrantId, Task[]> {
  const out: Record<QuadrantId, Task[]> = { do: [], schedule: [], delegate: [], drop: [] };
  for (const task of tasks) {
    for (const quadrant of quadrantsOfTask(task)) out[quadrant.id].push(task);
  }
  return out;
}

/** How many entries fall in each quarter. */
export function quadrantCounts(items: Pick<MatrixItem, 'priority' | 'dueDate'>[]): Record<QuadrantId, number> {
  const out: Record<QuadrantId, number> = { do: 0, schedule: 0, delegate: 0, drop: 0 };
  for (const item of items) out[quadrantOf(item).id]++;
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
export function moveToQuadrant(task: Pick<Task, 'dueDate' | 'priority'>, target: Quadrant): { priority?: Priority; dueDate?: string } {
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
