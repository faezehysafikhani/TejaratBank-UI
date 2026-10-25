/**
 * Maximum size of any uploaded attachment: 200 KB by default, admin-configurable at runtime
 * (Uploads.MaxFileSizeKb on the backend). App.tsx applies the real value on startup via
 * setMaxAttachmentBytes(); until then, and if that fetch fails, this 200 KB default matches the
 * backend's own default so nothing here ever accepts a file the API would reject.
 */
export let MAX_ATTACHMENT_BYTES = 204800;

/** How that limit is written in user-facing messages. */
export let MAX_ATTACHMENT_LABEL = '۲۰۰ کیلوبایت';

/** Applies the admin-configured max upload size (in KB) app-wide. */
export function setMaxAttachmentBytes(maxFileSizeKb: number): void {
  if (!(maxFileSizeKb > 0)) return;
  MAX_ATTACHMENT_BYTES = Math.round(maxFileSizeKb * 1024);
  MAX_ATTACHMENT_LABEL = maxFileSizeKb >= 1024
    ? `${Number.isInteger(maxFileSizeKb / 1024) ? maxFileSizeKb / 1024 : (maxFileSizeKb / 1024).toFixed(1)} مگابایت`
    : `${maxFileSizeKb} کیلوبایت`;
}

export type TaskStatus = 'todo' | 'in_progress' | 'paused' | 'completed';

export type Priority = 'low' | 'medium' | 'high';

export type AppTheme = 'default' | 'checkerboard' | 'diagonal' | 'grid' | 'dots' | 'cross' | 'waves' | 'glass' | 'bubbles' | 'rain' | 'dandelion' | 'snow' | 'autumn' | 'spring';

export type AppColorPalette = 'indigo' | 'emerald' | 'rose' | 'amber' | 'cyan' | 'slate';

export interface WorkTeamMember {
  userId: string;
  name: string;
  username: string;
  avatar?: string;
  role?: string; // e.g. 'مدیر تیم' | 'عضو تیم'
}

export interface WorkTeam {
  id: string;
  name: string;
  ownerId: string;
  members: WorkTeamMember[];
  createdAt: string;
}

export interface User {
  id: string;
  username: string;
  email: string;
  name?: string;
  avatar?: string;
  theme?: AppTheme;
  colorPalette?: AppColorPalette;
  themeMode?: 'light' | 'dark';
  role?: 'admin' | 'user' | string;
  /** Permission names granted by the server (GET /auth/me). Undefined until known. */
  permissions?: string[];
  disabled?: boolean;
  teams?: WorkTeam[];
  lastLogin?: string;
  phoneNumber?: string;
  notifySms?: boolean;
}

export interface SmsGatewaySettings {
  enabled: boolean;
  provider: 'kavenegar' | 'farazsms' | 'melipayamak' | 'custom';
  apiKey: string;
  lineNumber: string;
  patternCode?: string;
  apiUrl?: string;
}

export interface SystemNotificationSettings {
  sms: SmsGatewaySettings;
}

export interface Attachment {
  id: string;
  name: string;
  size: number;
  type: string;
  dataUrl: string; // Base64 data URL for preview and download
  createdAt: string;
}

export interface TaskComment {
  id: string;
  taskId: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  /** Written as a stand-in for a vacant post («جانشین کارشناس · کد ۷»). */
  actingNote?: string;
  text: string;
  attachments?: Attachment[];
  createdAt: string;
  updatedAt?: string;
}

export interface TaskLog {
  id: string;
  taskId: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  action: string;
  details?: string;
  createdAt: string;
  /** The server's own entry kind ("Task updated", "Status changed"...); unset for entries this app wrote. */
  serverAction?: string;
}

export type SubTaskImportance = 'low' | 'medium' | 'high';

export interface SubTaskAssignee {
  id: string;
  name: string;
}

/** A subtask's own lifecycle, independent of its parent task's. */
export type SubTaskProgress = 'not_started' | 'in_progress' | 'completed';

export interface ProjectSubTask {
  id: string;
  title: string;
  startDate?: string;
  endDate?: string;
  importance: SubTaskImportance; // 'low' (1), 'medium' (2), 'high' (3)
  completed: boolean; // derived: status === 'completed'
  status?: SubTaskProgress;
  /** When the subtask actually entered 'in_progress'. Set once, never cleared. */
  actualStartDate?: string;
  /** When the subtask actually entered 'completed'. Set once, never cleared. */
  actualCompletedDate?: string;
  createdAt: string;
  assignees?: SubTaskAssignee[];
}

export interface ProjectCharter {
  description?: string;
  projectManager?: string;
  startDate?: string;
  endDate?: string;
}

export type RecurringFrequency = 'daily' | 'weekly' | 'monthly' | 'monthly_day' | 'monthly_nth_weekday';

export type OccurrenceNth = 'first' | 'second' | 'third' | 'fourth' | 'last';

export interface RecurringConfig {
  frequency: RecurringFrequency; // 'daily' | 'weekly' | 'monthly' | 'monthly_day' | 'monthly_nth_weekday'
  intervalWeeks?: number; // 1 = هر هفته, 2 = ۲ هفته یکبار, 3 = ۳ هفته یکبار, ...
  startTime?: string; // e.g., "09:00"
  endTime?: string; // e.g., "11:00"
  dailyTime?: string; // fallback / legacy e.g., "09:00"
  time?: string; // fallback / legacy
  weeklyDays?: number[]; // 0=شنبه, 1=یکشنبه, 2=دوشنبه, 3=سه‌شنبه, 4=چهارشنبه, 5=پنج‌شنبه, 6=جمعه
  monthlyDays?: number[]; // 1 to 31
  nthOccurrence?: OccurrenceNth; // 'first' | 'second' | 'third' | 'fourth' | 'last'
  nthWeekday?: number; // 0=شنبه, 1=یکشنبه, 2=دوشنبه, 3=سه‌شنبه, 4=چهارشنبه, 5=پنج‌شنبه, 6=جمعه
  startDate?: string; // YYYY-MM-DD or ISO
  endDate?: string; // YYYY-MM-DD or ISO
}

export interface Task {
  id: string;
  title: string;
  description: string;
  dueDate: string; // YYYY-MM-DD
  actualCompletionDate?: string; // تاریخ واقعی تکمیل فعالیت موقع خاتمه یافتن
  priority: Priority;
  status: TaskStatus;
  attachments: Attachment[];
  user?: string; // id of the owner/creator
  ownerName?: string;
  ownerAvatar?: string;
  assignedUserId?: string; // the first of responsibleUserIds (kept for older code and tasks)
  assignedUserName?: string;
  assignedUserAvatar?: string;
  /** Everyone responsible for doing the task (one or more); the first is assignedUserId. */
  responsibleUserIds?: string[];
  responsibleUserNames?: string[];
  /** Standing in for a vacant post of the task (جانشین): see it and comment, nothing more. */
  standIns?: { userId: string; name: string; note: string | null }[];
  assignedTeamId?: string; // the task's team: its context, not who is responsible
  assignedTeamName?: string;
  /** Where tasks are given to posts: the responsible posts (their holders are responsibleUserIds). */
  responsiblePostIds?: string[];
  /** Where tasks are given to posts: every post of the task (creator's, responsible, access). */
  posts?: TaskPostInfo[];
  teamMemberIds?: string[]; // the access list: who else may see and work on the task
  teamMemberNames?: string[]; // their names, in the same order
  allowAssigneeStatusUpdate?: boolean; // آیا مسئول امکان بروزرسانی وضعیت را دارد یا خیر
  tags?: string[];
  isProject?: boolean;
  /** The activity this one was created under (a sub-activity), when it has a parent. */
  parentTaskId?: string;
  isRecurring?: boolean;
  recurringConfig?: RecurringConfig;
  projectCharter?: ProjectCharter;
  projectSubTasks?: ProjectSubTask[];
  comments?: TaskComment[];
  logs?: TaskLog[];
  createdAt: string;
  updatedAt: string;
}

/** A post a task is given to: role owner / responsible / access; holderUserId null when vacant. */
export interface TaskPostInfo {
  postId: string;
  role: 'owner' | 'responsible' | 'access';
  title: string;
  code: string;
  place: string;
  holderUserId: string | null;
  holderName: string | null;
}

export interface StatusConfig {
  id: TaskStatus;
  title: string;
  shortTitle: string;
  description: string;
  color: string; // TailWind color key e.g. 'slate', 'indigo', 'amber', 'emerald'
  bgLight: string;
  badgeBg: string;
  badgeText: string;
  borderColor: string;
  iconName: string;
}

export interface PriorityConfig {
  id: Priority;
  title: string;
  color: string;
  bgColor: string;
  textColor: string;
  borderColor: string;
}

export const STATUSES: Record<TaskStatus, StatusConfig> = {
  todo: {
    id: 'todo',
    title: 'شروع نشده',
    shortTitle: 'شروع نشده',
    description: 'فعالیت‌های آماده جهت شروع',
    color: 'slate',
    bgLight: 'bg-slate-50/80 border-slate-200',
    badgeBg: 'bg-slate-100',
    badgeText: 'text-slate-700 border-slate-300',
    borderColor: 'border-slate-400',
    iconName: 'Circle'
  },
  in_progress: {
    id: 'in_progress',
    title: 'درحال اجرا',
    shortTitle: 'درحال اجرا',
    description: 'فعالیتهای جاری',
    color: 'blue',
    bgLight: 'bg-blue-50/80 border-blue-200',
    badgeBg: 'bg-blue-100',
    badgeText: 'text-blue-700 border-blue-300',
    borderColor: 'border-blue-500',
    iconName: 'Clock'
  },
  paused: {
    id: 'paused',
    title: 'متوقف',
    shortTitle: 'متوقف',
    description: 'فعالیت‌های منتظر یا معلق شده',
    color: 'amber',
    bgLight: 'bg-amber-50/80 border-amber-200',
    badgeBg: 'bg-amber-100',
    badgeText: 'text-amber-800 border-amber-300',
    borderColor: 'border-amber-500',
    iconName: 'PauseCircle'
  },
  completed: {
    id: 'completed',
    title: 'خاتمه یافته',
    shortTitle: 'خاتمه یافته',
    description: 'فعالیت‌های تکمیل شده',
    color: 'emerald',
    bgLight: 'bg-emerald-50/80 border-emerald-200',
    badgeBg: 'bg-emerald-100',
    badgeText: 'text-emerald-800 border-emerald-300',
    borderColor: 'border-emerald-500',
    iconName: 'CheckCircle2'
  }
};

export const PRIORITIES: Record<Priority, PriorityConfig> = {
  low: {
    id: 'low',
    title: 'کم',
    color: 'emerald',
    bgColor: 'bg-emerald-50',
    textColor: 'text-emerald-700',
    borderColor: 'border-emerald-200'
  },
  medium: {
    id: 'medium',
    title: 'متوسط',
    color: 'amber',
    bgColor: 'bg-amber-50',
    textColor: 'text-amber-800',
    borderColor: 'border-amber-200'
  },
  high: {
    id: 'high',
    title: 'زیاد',
    color: 'rose',
    bgColor: 'bg-rose-50',
    textColor: 'text-rose-700',
    borderColor: 'border-rose-200'
  }
};

export interface AppNotification {
  id: string;
  /**
   * reminder and system: stored by the server (GET /api/notifications) - a task falling due, or
   * another notice such as being added to a work team. The others are derived from tasks.
   */
  type: 'comment' | 'task_log' | 'reminder' | 'system';
  taskId: string;
  taskTitle: string;
  actorName: string;
  actorAvatar?: string;
  actionTitle: string;
  details?: string;
  createdAt: string;
  isRead: boolean;
  /** The label shown on the item, when its type's usual one does not fit (e.g. «موعد گذشته»). */
  badge?: string;
  /** The details open in a small popup («جزئیات») instead of being listed in the item. */
  popup?: boolean;
}

export interface DirectMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  receiverId: string;
  text: string;
  attachmentUrl?: string;
  attachmentName?: string;
  isRead: boolean;
  createdAt: string;
}

export interface NoteAttachment {
  id: string;
  name: string;
  size?: number;
  type?: string;
  dataUrl: string;
  createdAt?: string;
}

export interface PersonalNote {
  id: string;
  userId: string;
  title: string;
  content: string;
  color?: string; // 'amber' | 'indigo' | 'emerald' | 'rose' | 'cyan' | 'slate'
  isPinned?: boolean;
  tags?: string[];
  attachments?: NoteAttachment[];
  createdAt: string;
  updatedAt?: string;
}
