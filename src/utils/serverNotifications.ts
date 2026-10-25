// The bell shows two kinds of items: ones the UI derives from the visible tasks (comments and
// task history, read state kept in this browser) and notifications stored by the server
// (GET /api/notifications - e.g. the reminder when a recurring task falls due, read state kept
// on the server). This merges them into one list without duplicates.
import type { AppNotification, Task } from '../types';
import { ACTIVITY_ACTION_TITLES, translateActivityDetails } from '../services/nexusApi';

export interface ServerNotificationDto {
  id: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  createdAt: string;
  /** What it is about, e.g. task.comment (a newer server; see TaskNoticeNotifications). */
  category?: string | null;
  /** The task (or team) it is about. */
  referenceId?: string | null;
  actorUserId?: string | null;
  actorName?: string | null;
}

/** Ids of server notifications carry this prefix, so they never collide with derived ones. */
export const SERVER_NOTIFICATION_PREFIX = 'ntf_';

const REMINDER_TITLE_PREFIX = 'یادآوری وظیفه: ';

export function isServerNotificationId(id: string): boolean {
  return id.startsWith(SERVER_NOTIFICATION_PREFIX);
}

export function serverNotificationKey(id: string): string {
  return id.slice(SERVER_NOTIFICATION_PREFIX.length);
}

/** The server stores UTC without an offset marker; read it as UTC, not as local time. */
function asUtc(value: string): string {
  return /[zZ]|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value}Z`;
}

/** Bell wording of the server's task notifications that are not history entries. */
const TASK_NOTICES: Record<string, { type: AppNotification['type']; badge: string; action: string }> = {
  'task.deleted': { type: 'system', badge: 'حذف فعالیت', action: 'این فعالیت حذف شد' },
  'task.assigned': { type: 'system', badge: 'واگذاری فعالیت', action: 'شما مسئول انجام این فعالیت شدید' },
  'task.unassigned': { type: 'system', badge: 'تغییر مسئول', action: 'شما دیگر مسئول انجام این فعالیت نیستید' },
  'task.access_granted': { type: 'system', badge: 'دسترسی جدید', action: 'به این فعالیت دسترسی پیدا کردید' },
  'task.due_soon': { type: 'reminder', badge: 'موعد نزدیک', action: 'موعد انجام این فعالیت نزدیک است' },
  'task.overdue': { type: 'reminder', badge: 'موعد گذشته', action: 'موعد این فعالیت گذشته و هنوز انجام نشده است' },
  'task.overdue_changed': { type: 'task_log', badge: 'تغییر فعالیت موعدگذشته', action: 'وضعیت این فعالیت موعدگذشته تغییر کرد' },
  'task.recurring_soon': { type: 'reminder', badge: 'نوبت بعدی', action: 'نوبت بعدی این فعالیت تکرارشونده نزدیک است' },
  'task.reminder': { type: 'reminder', badge: 'یادآوری موعد', action: 'یادآوری موعد وظیفه' },
};

const HISTORY_CATEGORIES = new Set(['task.created', 'task.edit', 'task.activity']);

/** Whether the server tells about comments and task changes itself (instead of the UI deriving them). */
export function isTaskNotification(dto: ServerNotificationDto): boolean {
  return !!dto.category && dto.category.startsWith('task.');
}

function taskOf(id: string | null | undefined, visibleTasks: Task[]): Task | undefined {
  return id ? visibleTasks.find((t) => t.id === id) : undefined;
}

/** The text after "label: " in a server message, e.g. the date in «موعد فعالیت «X» نزدیک است: ۱۴۰۵/۰۷/۲۳». */
function detailsOf(category: string, message: string): string {
  if (category === 'task.due_soon' || category === 'task.recurring_soon') {
    const at = message.lastIndexOf(': ');
    return at >= 0 ? `زمان: ${message.slice(at + 2)}` : message;
  }
  if (category === 'task.overdue') {
    const match = /\(([^)]+)\)/.exec(message);
    return match ? `موعد: ${match[1]}` : message;
  }
  return '';
}

/**
 * One server notification as a bell item. A newer server says what it is about (its category,
 * the task and who did it); an older one only names a reminder's task in the title - when
 * exactly one task the user can see has that title it is linked, so "view task" opens it.
 */
export function toAppNotification(dto: ServerNotificationDto, visibleTasks: Task[]): AppNotification {
  const category = dto.category || '';
  if (category.startsWith('task.')) {
    const task = taskOf(dto.referenceId, visibleTasks);
    const base = {
      id: SERVER_NOTIFICATION_PREFIX + dto.id,
      // Only a task the user can still see can be opened.
      taskId: task ? task.id : '',
      actorName: dto.actorName || 'سامانه',
      createdAt: asUtc(dto.createdAt),
      isRead: dto.isRead,
    };
    if (category === 'task.comment') {
      return { ...base, type: 'comment', taskTitle: dto.title || task?.title || '', actionTitle: dto.message };
    }
    if (HISTORY_CATEGORIES.has(category)) {
      // A history entry: the title is the entry's own action, worded as the task's history words it.
      return {
        ...base,
        type: 'task_log',
        taskTitle: task?.title || '',
        actionTitle: ACTIVITY_ACTION_TITLES[dto.title] || dto.title,
        // The server's own entry may carry just the task's title, which is shown anyway.
        details: (() => {
          const details = translateActivityDetails(dto.title, dto.message);
          return details && details.trim() !== task?.title.trim() ? details : undefined;
        })(),
      };
    }
    const notice = TASK_NOTICES[category];
    if (notice) {
      const details = category === 'task.reminder' || category === 'task.overdue_changed' ? dto.message : detailsOf(category, dto.message);
      return {
        ...base,
        type: notice.type,
        taskTitle: dto.title.startsWith(REMINDER_TITLE_PREFIX) ? dto.title.slice(REMINDER_TITLE_PREFIX.length).trim() : dto.title,
        actionTitle: notice.action,
        details: details || undefined,
        badge: notice.badge,
        popup: category === 'task.overdue_changed' ? true : undefined,
      };
    }
  }

  const isReminder = dto.title.startsWith(REMINDER_TITLE_PREFIX);
  const taskTitle = isReminder ? dto.title.slice(REMINDER_TITLE_PREFIX.length).trim() : dto.title;
  const matches = isReminder ? visibleTasks.filter((t) => t.title.trim() === taskTitle) : [];
  return {
    id: SERVER_NOTIFICATION_PREFIX + dto.id,
    type: isReminder ? 'reminder' : 'system',
    taskId: matches.length === 1 ? matches[0].id : '',
    // Only a reminder is about a task; another notice's title is its own subject.
    taskTitle: isReminder ? taskTitle : '',
    actorName: 'سامانه',
    actionTitle: isReminder ? 'یادآوری موعد وظیفه' : dto.title,
    details: dto.message,
    createdAt: asUtc(dto.createdAt),
    isRead: dto.isRead,
  };
}

/** Both lists, newest first, each id once. */
export function mergeNotifications(derived: AppNotification[], server: AppNotification[]): AppNotification[] {
  const byId = new Map<string, AppNotification>();
  for (const item of [...derived, ...server]) {
    if (!byId.has(item.id)) byId.set(item.id, item);
  }
  return Array.from(byId.values()).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
