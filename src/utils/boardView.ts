// «نوار گروه‌بندی و تنظیمات نمای کارت»: how the Kanban page groups its cards and what each card
// shows. Pure helpers only; the panel is components/BoardViewBar.tsx, the board KanbanBoard.tsx.
import { Task, Priority, PRIORITIES, TaskStatus } from '../types';
import { getDaysDiff, getTaskLastModifiedTime, isOverdue } from './helpers';
import { responsibleIdsOf } from './taskPeople';

export type BoardGroupBy = 'status' | 'owner' | 'responsible' | 'priority' | 'dueDate' | 'tag' | 'none';

export interface BoardViewSettings {
  groupBy: BoardGroupBy;
  /** Owner, responsible people and tags on each card. */
  showDetails: boolean;
  /** Only tasks that are not finished (completed ones are hidden). */
  currentOnly: boolean;
}

export const DEFAULT_BOARD_VIEW: BoardViewSettings = { groupBy: 'status', showDetails: true, currentOnly: false };

export const BOARD_GROUP_LABELS: Record<BoardGroupBy, string> = {
  status: 'وضعیت (کانبان پیش‌فرض)',
  owner: 'مالک فعالیت',
  responsible: 'مسئول فعالیت',
  priority: 'درجه اهمیت (اولویت)',
  dueDate: 'موعد انجام',
  tag: 'برچسب کاری',
  none: 'بدون گروه‌بندی (لیست ردیف‌دار)',
};

const STORAGE_KEY = 'tm_board_view_v1';
const GROUP_KEYS = Object.keys(BOARD_GROUP_LABELS) as BoardGroupBy[];

/** This browser's last choice (a per-viewer convenience); the defaults when there is none. */
export function loadBoardView(): BoardViewSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (saved && typeof saved === 'object') {
      return {
        groupBy: GROUP_KEYS.includes(saved.groupBy) ? saved.groupBy : DEFAULT_BOARD_VIEW.groupBy,
        showDetails: typeof saved.showDetails === 'boolean' ? saved.showDetails : DEFAULT_BOARD_VIEW.showDetails,
        currentOnly: typeof saved.currentOnly === 'boolean' ? saved.currentOnly : DEFAULT_BOARD_VIEW.currentOnly,
      };
    }
  } catch {
    // Storage blocked or corrupt: fall back to the defaults.
  }
  return DEFAULT_BOARD_VIEW;
}

export function saveBoardView(settings: BoardViewSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Not saved; the choice still applies until the page is reloaded.
  }
}

/** Color of a group column. Full class names, so Tailwind keeps them. */
export type GroupTone = 'slate' | 'indigo' | 'blue' | 'amber' | 'emerald' | 'rose' | 'violet' | 'cyan';

export const GROUP_TONES: Record<GroupTone, { border: string; badge: string }> = {
  slate: { border: 'border-slate-400', badge: 'bg-slate-100 text-slate-700 border-slate-300' },
  indigo: { border: 'border-indigo-400', badge: 'bg-indigo-100 text-indigo-700 border-indigo-300' },
  blue: { border: 'border-blue-500', badge: 'bg-blue-100 text-blue-700 border-blue-300' },
  amber: { border: 'border-amber-500', badge: 'bg-amber-100 text-amber-800 border-amber-300' },
  emerald: { border: 'border-emerald-500', badge: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  rose: { border: 'border-rose-500', badge: 'bg-rose-100 text-rose-700 border-rose-300' },
  violet: { border: 'border-violet-500', badge: 'bg-violet-100 text-violet-700 border-violet-300' },
  cyan: { border: 'border-cyan-500', badge: 'bg-cyan-100 text-cyan-800 border-cyan-300' },
};

export interface TaskGroup {
  key: string;
  title: string;
  description?: string;
  tone: GroupTone;
  tasks: Task[];
}

/** Tags the app adds itself for recurring tasks; cards do not show them either. */
const SYSTEM_TAGS = new Set(['تکرارشونده', 'تکرار', 'فعالیت تکرارشونده']);

const NAMED_TONES: GroupTone[] = ['indigo', 'blue', 'violet', 'cyan', 'emerald', 'amber', 'rose'];

const OPEN_STATUSES: TaskStatus[] = ['todo', 'in_progress', 'paused'];

export function isCurrentTask(task: Task): boolean {
  return OPEN_STATUSES.includes(task.status);
}

const byName = (a: { title: string }, b: { title: string }) => a.title.localeCompare(b.title, 'fa');

/**
 * The columns for every grouping but «وضعیت» (that one stays the real Kanban with drag and drop)
 * and «بدون گروه‌بندی» (a list). A task with several responsible people or tags is in each of
 * their groups. Empty groups are left out, except the fixed ones of priority and due date.
 */
export function buildTaskGroups(tasks: Task[], groupBy: BoardGroupBy): TaskGroup[] {
  const groups = buildGroups(tasks, groupBy);
  for (const group of groups) {
    group.tasks.sort((a, b) => getTaskLastModifiedTime(b) - getTaskLastModifiedTime(a));
  }
  return groups;
}

function buildGroups(tasks: Task[], groupBy: BoardGroupBy): TaskGroup[] {
  switch (groupBy) {
    case 'owner':
      return byPerson(tasks, (task) => (task.user ? [{ id: task.user, name: task.ownerName || 'کاربر' }] : []), 'بدون مالک مشخص');
    case 'responsible':
      return byPerson(tasks, (task) => {
        const ids = responsibleIdsOf(task);
        const names = task.responsibleUserNames && task.responsibleUserNames.length > 0
          ? task.responsibleUserNames
          : task.assignedUserName ? [task.assignedUserName] : [];
        return ids.map((id, i) => ({ id, name: names[i] || 'کاربر' }));
      }, 'بدون مسئول');
    case 'priority':
      return byPriority(tasks);
    case 'dueDate':
      return byDueDate(tasks);
    case 'tag':
      return byTag(tasks);
    default:
      return [{ key: 'all', title: 'همه فعالیت‌ها', tone: 'indigo', tasks: [...tasks] }];
  }
}

function byPerson(tasks: Task[], peopleOf: (task: Task) => { id: string; name: string }[], noneTitle: string): TaskGroup[] {
  const map = new Map<string, TaskGroup>();
  const none: Task[] = [];
  for (const task of tasks) {
    const people = peopleOf(task);
    if (people.length === 0) {
      none.push(task);
      continue;
    }
    for (const person of people) {
      let group = map.get(person.id);
      if (!group) {
        group = { key: `person:${person.id}`, title: person.name, tone: 'indigo', tasks: [] };
        map.set(person.id, group);
      }
      group.tasks.push(task);
    }
  }
  const named = Array.from(map.values()).sort(byName);
  named.forEach((group, i) => { group.tone = NAMED_TONES[i % NAMED_TONES.length]; });
  return none.length > 0 ? [...named, { key: 'person:none', title: noneTitle, tone: 'slate', tasks: none }] : named;
}

function byPriority(tasks: Task[]): TaskGroup[] {
  const order: { id: Priority; tone: GroupTone; description: string }[] = [
    { id: 'high', tone: 'rose', description: 'فعالیت‌های با اهمیت زیاد' },
    { id: 'medium', tone: 'amber', description: 'فعالیت‌های با اهمیت متوسط' },
    { id: 'low', tone: 'emerald', description: 'فعالیت‌های با اهمیت کم' },
  ];
  return order.map(({ id, tone, description }) => ({
    key: `priority:${id}`,
    title: `اولویت ${PRIORITIES[id].title}`,
    description,
    tone,
    tasks: tasks.filter((task) => task.priority === id),
  }));
}

function byDueDate(tasks: Task[]): TaskGroup[] {
  const groups: TaskGroup[] = [
    { key: 'due:overdue', title: 'عقب‌افتاده', description: 'موعد گذشته و هنوز انجام نشده', tone: 'rose', tasks: [] },
    { key: 'due:today', title: 'امروز', description: 'موعد انجام امروز', tone: 'amber', tasks: [] },
    { key: 'due:week', title: 'هفت روز آینده', description: 'موعد انجام تا یک هفته دیگر', tone: 'blue', tasks: [] },
    { key: 'due:later', title: 'آینده', description: 'موعد انجام بیش از یک هفته دیگر', tone: 'indigo', tasks: [] },
    { key: 'due:past', title: 'موعد گذشته', description: 'خاتمه‌یافته یا متوقف با موعد گذشته', tone: 'slate', tasks: [] },
    { key: 'due:recurring', title: 'تکرارشونده', description: 'فعالیت‌های دوره‌ای با موعدهای تکراری', tone: 'violet', tasks: [] },
    { key: 'due:none', title: 'بدون موعد', description: 'موعد انجام ثبت نشده', tone: 'slate', tasks: [] },
  ];
  const at = (key: string) => groups.find((g) => g.key === key)!;
  for (const task of tasks) {
    if (task.isRecurring) { at('due:recurring').tasks.push(task); continue; }
    if (!task.dueDate) { at('due:none').tasks.push(task); continue; }
    if (isOverdue(task.dueDate, task.status)) { at('due:overdue').tasks.push(task); continue; }
    const diff = getDaysDiff(task.dueDate);
    if (diff.isPast || diff.days < 0) at('due:past').tasks.push(task);
    else if (diff.days === 0) at('due:today').tasks.push(task);
    else if (diff.days <= 7) at('due:week').tasks.push(task);
    else at('due:later').tasks.push(task);
  }
  // The four time buckets always show; the special ones only when they hold something.
  return groups.filter((g, i) => i < 4 || g.tasks.length > 0);
}

function byTag(tasks: Task[]): TaskGroup[] {
  const map = new Map<string, TaskGroup>();
  const none: Task[] = [];
  for (const task of tasks) {
    const tags = Array.from(new Set((task.tags || []).map((t) => t.trim()).filter((t) => t && !SYSTEM_TAGS.has(t))));
    if (tags.length === 0) {
      none.push(task);
      continue;
    }
    for (const tag of tags) {
      let group = map.get(tag);
      if (!group) {
        group = { key: `tag:${tag}`, title: `#${tag}`, tone: 'indigo', tasks: [] };
        map.set(tag, group);
      }
      group.tasks.push(task);
    }
  }
  const named = Array.from(map.values()).sort(byName);
  named.forEach((group, i) => { group.tone = NAMED_TONES[i % NAMED_TONES.length]; });
  return none.length > 0 ? [...named, { key: 'tag:none', title: 'بدون برچسب', tone: 'slate', tasks: none }] : named;
}
