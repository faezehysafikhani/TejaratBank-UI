// Data access for the UI. Everything goes to the NexusCore REST API (see nexusApi.ts).
import { Task, TaskStatus, Priority, Attachment, User, AppTheme, AppColorPalette, WorkTeam, TaskComment, TaskLog, SystemNotificationSettings, DirectMessage, PersonalNote, NoteAttachment } from '../types';
import { parseDateSafely } from '../utils/jalali';
import * as nexusApi from './nexusApi';


/** Origin of the NexusCore API all data comes from. */
export const ACTIVE_DATA_SERVER_URL = nexusApi.NEXUS_API_BASE_URL;
const LOCAL_TEAMS_PREFIX = 'parstask_teams_';

export function getCurrentUser(): User | null {
  const user = nexusApi.getSessionUser();
    return user ? { ...user, teams: fetchUserTeamsPB(user.id) } : null;
}

export async function loginPB(
  identity: string,
  password: string,
  captcha?: { captchaId: string; answer: string }
): Promise<User> {
  const user = await nexusApi.login(identity, password, captcha);
    return { ...user, teams: fetchUserTeamsPB(user.id) };
}

export async function requestPasswordResetPB(identifier: string): Promise<string> {
  if (!identifier.trim()) {
      throw new Error('لطفاً نام کاربری یا شماره تلفن همراه خود را وارد نمایید.');
    }
    return (await nexusApi.requestPasswordReset(identifier)).message;
}

export async function verifyPasswordResetCodePB(identifier: string, code: string): Promise<string> {
  return nexusApi.verifyPasswordResetCode(identifier, code);
}

export async function confirmPasswordResetPB(
  token: string,
  password: string,
  passwordConfirm: string
): Promise<boolean> {
  if (!password || password.length < 8) {
      throw new Error('رمز عبور جدید باید حداقل ۸ کاراکتر باشد.');
    }
    if (password !== passwordConfirm) {
      throw new Error('رمز عبور جدید و تکرار آن با یکدیگر مطابقت ندارند.');
    }
    await nexusApi.confirmPasswordReset(token, password);
    return true;
}

export function extractResetTokenFromURL(): string | null {
  if (typeof window === 'undefined') return null;
  const href = window.location.href;

  try {
    // 1. Check for query parameter ?token=TOKEN
    const urlObj = new URL(href);
    const tokenQuery = urlObj.searchParams.get('token');
    if (tokenQuery) return tokenQuery;

    // 2. Check for hash parameters e.g. #token=TOKEN
    if (window.location.hash) {
      const hashStr = window.location.hash;
      const hashMatch = hashStr.match(/token=([A-Za-z0-9_\-.]+)/);
      if (hashMatch && hashMatch[1]) {
        return hashMatch[1];
      }
    }

    // 3. Check for confirm-password-reset/TOKEN or reset-password/TOKEN in path or hash
    const matchPath = href.match(/(?:confirm-password-reset|reset-password)\/([A-Za-z0-9_\-.]+)/);
    if (matchPath && matchPath[1]) {
      return matchPath[1];
    }
  } catch (e) {
    console.error('Error parsing reset token from URL', e);
  }

  return null;
}

export async function refreshCurrentUserPB(): Promise<User | null> {
  const user = await nexusApi.refreshCurrentUser();
    return user ? { ...user, teams: fetchUserTeamsPB(user.id) } : null;
}

export function logoutPB(): void {
  nexusApi.logout();
    return;
}

function normalizeCachedTeams(value: unknown): WorkTeam[] {
  if (!Array.isArray(value)) return [];

  return value.filter((team): team is WorkTeam => {
    if (!team || typeof team !== 'object') return false;
    const candidate = team as Partial<WorkTeam>;
    return typeof candidate.id === 'string'
      && nexusApi.isGuid(candidate.id)
      && typeof candidate.name === 'string'
      && Array.isArray(candidate.members);
  });
}

export function fetchUserTeamsPB(userId: string): WorkTeam[] {
  if (!userId) return [];
  try {
    const raw = localStorage.getItem(LOCAL_TEAMS_PREFIX + userId);
    return raw ? normalizeCachedTeams(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

export async function fetchUserTeamsAsyncPB(userId: string): Promise<WorkTeam[]> {
  if (!userId) return [];

  try {
      const teams = await nexusApi.fetchUserGroupsAsTeams();
      try {
        localStorage.setItem(LOCAL_TEAMS_PREFIX + userId, JSON.stringify(teams));
      } catch {}
      return teams;
    } catch (err) {
      console.warn('Could not load user groups from NexusCore:', err instanceof Error ? err.message : err);
      return fetchUserTeamsPB(userId);
    }
}

export async function saveUserTeamsPB(userId: string, teams: WorkTeam[]): Promise<void> {
  if (!userId) return;

  // Personal work teams (UserGroups owned by the user) - created, renamed, re-membered and
    // deleted to match the list the team editor holds.
    const saved = await nexusApi.saveMyTeams(teams);
    try {
      localStorage.setItem(LOCAL_TEAMS_PREFIX + userId, JSON.stringify(saved));
    } catch {}
    return;
}

/**
 * One change to one of the user's own teams, sent to the server right away (no list diff, no
 * temporary ids). Resolves with the teams as the server now has them; throws on failure, so
 * the caller shows nothing as saved that was not.
 */
export async function changeUserTeamPB(
  userId: string,
  change: { kind: 'create'; name: string } | { kind: 'members'; teamId: string; userIds: string[] } | { kind: 'delete'; teamId: string },
): Promise<{ teams: WorkTeam[]; teamId?: string }> {
  let teamId: string | undefined;
  if (change.kind === 'create') teamId = (await nexusApi.createMyTeam(change.name)).id;
  else if (change.kind === 'members') teamId = (await nexusApi.setMyTeamMembers(change.teamId, change.userIds)).id;
  else await nexusApi.deleteMyTeam(change.teamId);

  const teams = await nexusApi.fetchUserGroupsAsTeams();
  try {
    localStorage.setItem(LOCAL_TEAMS_PREFIX + userId, JSON.stringify(teams));
  } catch {}
  return { teams, teamId };
}

export async function fetchAllUsersPB(): Promise<User[]> {
  try {
      return await nexusApi.fetchUsers();
    } catch (err) {
      // Listing users needs the Users.View permission; without it only the signed-in user is known.
      console.warn('Could not load users from NexusCore:', err instanceof Error ? err.message : err);
      const me = nexusApi.getSessionUser();
      return me ? [me] : [];
    }
}

/** Everyone chat lets you start a direct conversation with - never needs users.view. */
export async function fetchChatDirectoryPB(): Promise<User[]> {
  try {
    const contacts = await nexusApi.fetchChatDirectory();
    return contacts.map((c) => ({ id: c.id, username: '', email: '', name: c.name, avatar: c.avatar }));
  } catch (err) {
    console.warn('Could not load the chat directory from NexusCore:', err instanceof Error ? err.message : err);
    return [];
  }
}

export async function updateUserThemePB(settings: { theme?: AppTheme; colorPalette?: AppColorPalette; themeMode?: 'light' | 'dark' }): Promise<void> {
  try {
      await nexusApi.updateMyPreferences(settings);
    } catch (err) {
      console.warn('Could not save theme/settings to NexusCore:', err instanceof Error ? err.message : err);
    }
    return;
}

export async function updateUserProfilePB(updates: {
  name?: string;
  username?: string;
  avatar?: string;
  phoneNumber?: string;
  notifySms?: boolean;
}): Promise<User> {
  const user = await nexusApi.updateMyProfile(updates);
    return { ...user, teams: fetchUserTeamsPB(user.id) };
}

// System Notification Gateway Settings Persistence (SMS)
const NOTIFICATION_SETTINGS_STORAGE_KEY = 'parstask_system_notification_settings';

export function getSystemNotificationSettingsPB(): SystemNotificationSettings {
  const defaultSettings: SystemNotificationSettings = {
    sms: {
      enabled: false,
      provider: 'kavenegar',
      apiKey: '',
      lineNumber: '',
      patternCode: '',
      apiUrl: 'https://api.kavenegar.com/v1/',
    },
  };

  try {
    const raw = localStorage.getItem(NOTIFICATION_SETTINGS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        sms: { ...defaultSettings.sms, ...(parsed.sms || {}) },
      };
    }
  } catch (e) {
    console.error('Error reading system notification settings:', e);
  }

  return defaultSettings;
}

export async function fetchSystemNotificationSettingsPB(): Promise<SystemNotificationSettings> {
  // NexusCore sends SMS itself and the SMS panel reads its own settings; the browser needs
    // no copy (and the API key is never sent to it).
    return getSystemNotificationSettingsPB();
}

export async function sendNewTaskNotificationsPB(task: Task): Promise<void> {
  // The server sends task-created SMS itself (the gateway key never reaches the browser).
    return;
}

// Local metadata storage helper for tasks (comments, team member IDs, owner info)
function getTaskExtraMeta(taskId: string): Partial<Task> {
  try {
    const raw = localStorage.getItem(`parstask_meta_${taskId}`);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveTaskExtraMeta(taskId: string, meta: Partial<Task>): void {
  try {
    const existing = getTaskExtraMeta(taskId);
    const updated = { ...existing, ...meta };
    localStorage.setItem(`parstask_meta_${taskId}`, JSON.stringify(updated));
  } catch (e) {
    console.error('Failed to save task extra meta:', e);
  }
}

export async function fetchTasksFromPB(): Promise<Task[]> {
  return nexusApi.fetchTasks();
}

/** One task by id (GET /api/task-management/tasks/{id}); throws NexusApiError (404 deleted, 403 no access). */
export async function fetchTaskByIdPB(taskId: string): Promise<Task> {
  return nexusApi.fetchTask(taskId);
}

export async function createTaskInPB(
  taskData: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Task> {
  const newTask = await nexusApi.createTask(taskData);
    sendNewTaskNotificationsPB(newTask).catch((err) =>
      console.warn('Task creation notification dispatch error:', err)
    );
    return newTask;
}

export async function updateTaskInPB(
  taskId: string,
  taskData: Partial<Omit<Task, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<Task> {
  return nexusApi.updateTask(taskId, taskData);
}

export async function deleteTaskFromPB(taskId: string): Promise<boolean> {
  await nexusApi.deleteTask(taskId);
    return true;
}

export function subscribeToTasksPB(onChange: () => void): () => void {
  return nexusApi.subscribeToTaskChanges(onChange);
}

// Task comments
export async function fetchCommentsForTaskPB(taskId: string): Promise<TaskComment[]> {
  return nexusApi.fetchTaskComments(taskId);
}

export async function createTaskCommentPB(commentData: {
  taskId: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  text: string;
  attachments?: Attachment[];
}): Promise<TaskComment> {
  return nexusApi.createTaskComment(commentData.taskId, commentData.text, commentData.attachments || []);
}

/**
 * Saves an edited comment: its text and attachment changes are stored on the server.
 */
export async function updateTaskCommentPB(
  commentId: string,
  text: string,
  attachments: Attachment[],
  previousAttachments: Attachment[]
): Promise<void> {
  await nexusApi.updateTaskComment(commentId, text, attachments, previousAttachments);
}

export async function deleteTaskCommentPB(commentId: string): Promise<boolean> {
  try {
      await nexusApi.deleteTaskComment(commentId);
      return true;
    } catch (err) {
      console.warn(`Deleting comment ${commentId} failed:`, err instanceof Error ? err.message : err);
      return false;
    }
}

// Task activity history
export async function fetchTaskLogsPB(taskId: string): Promise<TaskLog[]> {
  return nexusApi.fetchTaskActivity(taskId);
}

export async function createTaskLogPB(logData: {
  taskId: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  action: string;
  details?: string;
}): Promise<TaskLog> {
  const newLog: TaskLog = {
    id: 'log_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
    taskId: logData.taskId,
    userId: logData.userId,
    userName: logData.userName,
    userAvatar: logData.userAvatar,
    action: logData.action,
    details: logData.details,
    createdAt: new Date().toISOString(),
  };

  // Stored in the task's server-side history, under the signed-in user.
    try {
      await nexusApi.addTaskActivityEntry(logData.taskId, logData.action, logData.details);
    } catch (err) {
      console.warn('Could not store the task history entry:', err instanceof Error ? err.message : err);
    }
    return newLog;
}

export async function fetchDirectMessagesPB(currentUserId: string, partnerId: string): Promise<DirectMessage[]> {
  return nexusApi.fetchDirectMessages(partnerId);
}

export async function sendDirectMessagePB(msgData: {
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  receiverId: string;
  text: string;
  attachmentUrl?: string;
  attachmentName?: string;
}): Promise<DirectMessage> {
  return nexusApi.sendDirectMessage(msgData);
}

export async function markDirectMessagesAsReadPB(senderId: string, receiverId: string): Promise<void> {
  // The reader is always the signed-in user (receiverId); the server takes it from the token.
    await nexusApi.markDirectMessagesRead(senderId).catch((err) =>
      console.warn('Could not mark messages as read:', err instanceof Error ? err.message : err));
    return;
}

export async function updateDirectMessagePB(messageId: string, text: string): Promise<void> {
  await nexusApi.updateDirectMessage(messageId, text);
    return;
}

export async function deleteDirectMessagePB(messageId: string): Promise<void> {
  await nexusApi.deleteDirectMessage(messageId);
    return;
}

// A team's one shared conversation (group chat)
export async function fetchTeamMessagesPB(teamId: string): Promise<DirectMessage[]> {
  return nexusApi.fetchTeamMessages(teamId);
}

export async function sendTeamMessagePB(teamId: string, msg: { text: string; attachmentUrl?: string; attachmentName?: string }): Promise<DirectMessage> {
  return nexusApi.sendTeamMessage(teamId, msg);
}

export async function markTeamMessagesReadPB(teamId: string): Promise<void> {
  return nexusApi.markTeamMessagesRead(teamId);
}

export async function fetchTeamUnreadCountsPB(): Promise<Record<string, number>> {
  try {
    return await nexusApi.fetchTeamUnreadCounts();
  } catch (err) {
    console.warn('Could not load team unread counts:', err instanceof Error ? err.message : err);
    return {};
  }
}

/** Live presence (online/offline) of these users; unknown ones are left out. */
export async function fetchPresencePB(userIds: string[]): Promise<Record<string, boolean>> {
  return nexusApi.fetchPresence(userIds);
}

export async function fetchUnreadMessageCountsPB(currentUserId: string): Promise<Record<string, number>> {
  try {
      return await nexusApi.fetchUnreadMessageCounts();
    } catch (err) {
      console.warn('Could not load unread message counts:', err instanceof Error ? err.message : err);
      return {};
    }
}


// ==========================================
// PERSONAL NOTES API & LOCAL STORAGE
// ==========================================
// PERSONAL NOTES SERVICE
// ==========================================
function encodeNoteContent(content: string, attachments?: NoteAttachment[]): string {
  if (!attachments || attachments.length === 0) return content || '';
  return `${content || ''}\n\n<!--ATTACHMENTS_DATA:${JSON.stringify(attachments)}-->`;
}

function decodeNoteContent(rawContent: string, rawAttachments?: any): { content: string; attachments: NoteAttachment[] } {
  let attachments: NoteAttachment[] = [];
  
  if (Array.isArray(rawAttachments) && rawAttachments.length > 0) {
    attachments = rawAttachments;
  } else if (typeof rawAttachments === 'string' && rawAttachments.trim().startsWith('[')) {
    try { attachments = JSON.parse(rawAttachments); } catch {}
  }

  let content = rawContent || '';
  const match = content.match(/<!--ATTACHMENTS_DATA:(.*?)-->/s);
  if (match) {
    try {
      if (attachments.length === 0) {
        attachments = JSON.parse(match[1]);
      }
    } catch {}
    content = content.replace(/<!--ATTACHMENTS_DATA:(.*?)-->/s, '').trim();
  }

  return { content, attachments };
}

export async function fetchPersonalNotesPB(userId: string): Promise<PersonalNote[]> {
  if (!userId) return [];

  const notes = await nexusApi.listNotes();
    return notes.map((n) => {
      const { content, attachments } = decodeNoteContent(n.content);
      return {
        id: n.id,
        userId: n.userId,
        title: n.title,
        content,
        color: n.color || 'amber',
        isPinned: n.isPinned,
        tags: [],
        attachments,
        createdAt: n.createdAtUtc,
        updatedAt: n.modifiedAtUtc || undefined,
      };
    });
}

export async function createPersonalNotePB(
  userId: string,
  noteData: { title: string; content: string; color?: string; isPinned?: boolean; tags?: string[]; attachments?: NoteAttachment[] }
): Promise<PersonalNote> {
  const rec = await nexusApi.createNote({
      title: noteData.title,
      content: encodeNoteContent(noteData.content, noteData.attachments),
      color: noteData.color || 'amber',
      isPinned: !!noteData.isPinned,
    });
    const { content, attachments } = decodeNoteContent(rec.content);
    return {
      id: rec.id,
      userId: rec.userId,
      title: rec.title,
      content,
      color: rec.color || 'amber',
      isPinned: rec.isPinned,
      tags: noteData.tags || [],
      attachments,
      createdAt: rec.createdAtUtc,
      updatedAt: rec.modifiedAtUtc || undefined,
    };
}

export async function updatePersonalNotePB(
  id: string,
  userId: string,
  updates: Partial<PersonalNote>
): Promise<PersonalNote> {
  // PUT replaces the whole note, so fields not being changed are read back first.
    const existing = await nexusApi.getNote(id);
    const decoded = decodeNoteContent(existing.content);
    const rec = await nexusApi.updateNote(id, {
      title: updates.title ?? existing.title,
      content: encodeNoteContent(
        updates.content !== undefined ? updates.content : decoded.content,
        updates.attachments !== undefined ? updates.attachments : decoded.attachments
      ),
      color: updates.color ?? existing.color,
      isPinned: updates.isPinned ?? existing.isPinned,
    });
    const { content, attachments } = decodeNoteContent(rec.content);
    return {
      id: rec.id,
      userId: rec.userId,
      title: rec.title,
      content,
      color: rec.color || 'amber',
      isPinned: rec.isPinned,
      tags: updates.tags || [],
      attachments,
      createdAt: rec.createdAtUtc,
      updatedAt: rec.modifiedAtUtc || undefined,
    };
}

export async function deletePersonalNotePB(id: string, userId: string): Promise<void> {
  await nexusApi.deleteNote(id);
    return;
}

// Notifications stored by the server (task reminders). Failures leave the bell as it was.
export async function fetchServerNotificationsPB() {
  try {
    return await nexusApi.fetchMyNotifications();
  } catch (err) {
    console.warn('Could not load notifications from NexusCore:', err instanceof Error ? err.message : err);
    return null;
  }
}

/** Whether the server stores task notifications (comments, changes, reminders) itself; false for an older server. */
export async function serverTellsOfTasksPB(): Promise<boolean> {
  try {
    return (await nexusApi.getTaskReminderSettings()) !== null;
  } catch {
    return false;
  }
}

export async function markServerNotificationReadPB(id: string): Promise<void> {
  await nexusApi.markNotificationRead(id);
}

export async function markAllServerNotificationsReadPB(): Promise<void> {
  await nexusApi.markAllNotificationsRead();
}
