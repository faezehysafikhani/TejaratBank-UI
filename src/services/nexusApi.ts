/**
 * REST connection to the NexusCore backend (ASP.NET Core 8, TaskManagement module).
 *
 * This is the app's only backend. In production, the origin is read at runtime from
 * /config/runtime-config.js; without it the app calls the origin it is served from
 * (a reverse proxy in front of both).
 *
 * The functions in dataService.ts delegate here; the components keep calling the same
 * functions and receive the same shapes.
 * All translation between the backend DTOs and the UI types happens in this file.
 *
 * Request and response shapes are taken from the backend source:
 *   NexusCore.Application/Identity/Dtos/*.cs
 *   Nexus.TaskManagement/Application/Dtos/TaskManagementDtos.cs
 * Enums travel as strings (JsonStringEnumConverter) and property names are camelCase.
 */
import { toSafeBlob } from '../utils/safeBlob';
import {
  Task,
  TaskStatus,
  Priority,
  Attachment,
  User,
  WorkTeam,
  TaskComment,
  TaskLog,
  ProjectSubTask,
  SubTaskImportance,
  SubTaskProgress,
  RecurringConfig,
  RecurringFrequency,
  OccurrenceNth,
  STATUSES,
  DirectMessage,
} from '../types';
import { iranDateTimeToISO, isoToIranDateTimeParts } from '../utils/jalali';
import { HubConnection, HubConnectionBuilder, LogLevel } from '@microsoft/signalr';
import { NETWORK_ERROR, TIMEOUT_ERROR, persianApiMessage } from '../utils/errorMessages';
import { normalizeAvatar } from '../utils/avatars';
import { clearLookups } from '../utils/lookupCache';
import type { ServerNotificationDto } from '../utils/serverNotifications';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const env = ((import.meta as any).env || {}) as Record<string, string | undefined | boolean>;

interface RuntimeConfig {
  apiBaseUrl?: string;
  signalRBaseUrl?: string;
  tenantSlug?: string;
  requestTimeoutMs?: number | string;
}

declare global {
  interface Window {
    __TMPB_RUNTIME_CONFIG__?: RuntimeConfig;
  }
}

const runtimeConfig: RuntimeConfig =
  typeof window !== 'undefined' && window.__TMPB_RUNTIME_CONFIG__
    ? window.__TMPB_RUNTIME_CONFIG__
    : {};

function cleanBaseUrl(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\/+$/, '') : '';
}

const isDevelopment = env.DEV === true || env.MODE === 'development';

/** Backend origin. Empty means same-origin: /api/... */
export const NEXUS_API_BASE_URL = cleanBaseUrl(
  runtimeConfig.apiBaseUrl || (isDevelopment ? env.VITE_DEV_API_BASE_URL : '')
);

/** SignalR origin. Empty means same-origin: /hubs/... */
export const NEXUS_SIGNALR_BASE_URL = cleanBaseUrl(
  runtimeConfig.signalRBaseUrl
  || runtimeConfig.apiBaseUrl
  || (isDevelopment ? env.VITE_DEV_SIGNALR_BASE_URL || env.VITE_DEV_API_BASE_URL : '')
);

/** Optional tenant slug sent with login. Leave empty for a single-tenant install. */
const NEXUS_TENANT_SLUG = String(runtimeConfig.tenantSlug || env.VITE_NEXUS_TENANT_SLUG || '').trim();

const timeoutFromRuntime = Number(runtimeConfig.requestTimeoutMs);
const timeoutFromEnv = Number(env.VITE_API_TIMEOUT_MS);
const REQUEST_TIMEOUT_MS = timeoutFromRuntime > 0 ? timeoutFromRuntime : (timeoutFromEnv > 0 ? timeoutFromEnv : 30000);


/** Name of the seeded system role (NexusCore.Infrastructure/Persistence/DefaultDataSeeder.cs). */
const ADMIN_ROLE_NAME = 'Administrator';

/** Parallel requests used when a screen needs one call per task. */
const DETAIL_CONCURRENCY = 6;

// ---------------------------------------------------------------------------
// Backend DTOs (camelCase JSON)
// ---------------------------------------------------------------------------

interface UserDto {
  id: string;
  tenantId: string;
  email: string | null;
  displayName: string;
  isActive: boolean;
  lastLoginAtUtc: string | null;
  roles: string[];
  username?: string | null;
  phoneNumber?: string | null;
  notifySms?: boolean;
  avatarUrl?: string | null;
  theme?: string | null;
  colorPalette?: string | null;
  themeMode?: string | null;
}

interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAtUtc: string;
  user: UserDto;
}

interface CurrentUserResponse {
  user: UserDto;
  permissions: string[];
}

export interface PagedResult<T> {
  items: T[];
  pageNumber: number;
  pageSize: number;
  totalCount: number;
  totalPages?: number;
}

interface UserSummaryDto { id: string; displayName: string; email: string; }
interface UserGroupSummaryDto { id: string; name: string; }
interface TagDto { id: string; name: string; color: string | null; }

interface TaskFileDto {
  linkId: string;
  fileId: string;
  fileName: string;
  contentType: string;
  fileSizeBytes: number;
  uploadedByUserId: string | null;
  createdAtUtc: string;
}

interface SubTaskDto {
  id: string;
  taskId: string;
  title: string;
  startDate: string | null;
  endDate: string | null;
  importance: 'Low' | 'Medium' | 'High';
  isCompleted: boolean;
  sortOrder: number;
  tags: TagDto[];
  files: TaskFileDto[];
  createdAtUtc: string;
  isGeneratedOccurrence?: boolean;
  startTime?: string | null;
  endTime?: string | null;
  assignees?: UserSummaryDto[];
  status?: 'NotStarted' | 'InProgress' | 'Completed';
  actualStartedAtUtc?: string | null;
  actualCompletedAtUtc?: string | null;
}

interface RepetitiveTaskDto {
  id: string;
  taskId: string;
  frequency: string;
  intervalWeeks: number | null;
  startTime: string | null;
  endTime: string | null;
  weeklyDays: number[];
  monthlyDays: number[];
  nthOccurrence: string | null;
  nthWeekday: number | null;
  startDate: string;
  endDate: string | null;
  nextExecutionAtUtc: string | null;
  lastExecutionAtUtc: string | null;
  isActive: boolean;
}

interface TaskDto {
  id: string;
  title: string;
  description: string | null;
  isProject: boolean;
  parentTaskId?: string | null;
  isRecurring: boolean;
  status: string;
  priority: string;
  dueDate: string;
  actualCompletionDateUtc: string | null;
  owner: UserSummaryDto | null;
  assignedUser: UserSummaryDto | null;
  assignedUserGroup: UserGroupSummaryDto | null;
  assignees: UserSummaryDto[];
  /** Everyone responsible (servers before multi-responsible tasks leave it out). */
  responsibleUsers?: UserSummaryDto[] | null;
  /** Who stands in for a vacant post of the task (جانشین), with the post; older servers leave it out. */
  standIns?: { id: string; displayName: string; note: string | null }[] | null;
  allowAssigneeStatusUpdate: boolean;
  charterDescription: string | null;
  charterProjectManager: string | null;
  charterStartDate: string | null;
  charterEndDate: string | null;
  subTasks: SubTaskDto[];
  tags: TagDto[];
  files: TaskFileDto[];
  recurrence: RepetitiveTaskDto | null;
  createdAtUtc: string;
  modifiedAtUtc: string | null;
  /** Time of day on dueDate ("HH:mm:ss"); null when the task has only a date. */
  dueTime?: string | null;
  /** Times of day on the charter dates, like dueTime. */
  charterStartTime?: string | null;
  charterEndTime?: string | null;
  posts?: Array<{ postId: string; role: string; title: string; code: string; place: string; holderUserId: string | null; holderName: string | null }> | null;
}

interface TaskListItemDto { id: string; }

interface TaskCommentDto {
  id: string;
  taskId: string;
  userId: string;
  userDisplayName: string | null;
  text: string;
  createdAtUtc: string;
  modifiedAtUtc: string | null;
  files?: TaskFileDto[] | null;
  actingNote?: string | null;
}

interface TaskActivityDto {
  id: string;
  taskId: string;
  userId: string | null;
  userDisplayName: string | null;
  action: string;
  details: string | null;
  occurredAtUtc: string;
}

interface UserGroupMemberDto { userId: string; displayName: string; email: string; }

interface UserGroupDto {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  isActive: boolean;
  memberCount: number;
  members: UserGroupMemberDto[];
  ownerUserId?: string | null;
}

export interface NoteDto {
  id: string;
  userId: string;
  title: string;
  content: string;
  color: string | null;
  isPinned: boolean;
  createdAtUtc: string;
  modifiedAtUtc: string | null;
}

// ---------------------------------------------------------------------------
// Session (access + refresh token)
// ---------------------------------------------------------------------------

interface StoredSession {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAtUtc: string;
  user: UserDto;
  /** The user's permissions from the last /me answer. */
  permissions?: string[];
}

const SESSION_KEY = 'nexuscore_auth_session_v1';

/**
 * Fired on window when the server no longer accepts the session (account disabled, tokens
 * revoked or expired), so the UI can go back to the sign-in screen. Not fired by logout().
 */
export const SESSION_ENDED_EVENT = 'nexuscore:session-ended';

function endSession(): void {
  writeSession(null);
  clearLookups();
  try {
    window.dispatchEvent(new Event(SESSION_ENDED_EVENT));
  } catch {
    // No window (tests, SSR): nothing to notify.
  }
}

function readSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    return null;
  }
}

function writeSession(session: StoredSession | null): void {
  try {
    if (session) {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } else {
      localStorage.removeItem(SESSION_KEY);
    }
  } catch {
    // Storage unavailable (private mode); the session simply will not survive a reload.
  }
}

function saveAuthResponse(auth: AuthResponse): void {
  const previous = readSession();
  writeSession({
    accessToken: auth.accessToken,
    refreshToken: auth.refreshToken,
    accessTokenExpiresAtUtc: auth.accessTokenExpiresAtUtc,
    user: auth.user,
    // A renewed token keeps the known permissions; a new sign-in reads them from /me.
    permissions: previous?.user?.id === auth.user.id ? previous.permissions : undefined,
  });
}

// Refresh tokens rotate on every use (IdentityService.RefreshTokenAsync revokes the old one),
// so concurrent 401s must share a single refresh call rather than racing each other.
let refreshInFlight: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const session = readSession();
    if (!session?.refreshToken) return false;
    try {
      const auth = await request<AuthResponse>('POST', '/api/identity/auth/refresh', {
        body: { refreshToken: session.refreshToken },
        auth: false,
        retryOnUnauthorized: false,
      });
      saveAuthResponse(auth);
      return true;
    } catch (err) {
      if (err instanceof NexusApiError && (err.httpStatus === 401 || err.httpStatus === 400)) {
        endSession();
      }
      return false;
    }
  })();

  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

// ---------------------------------------------------------------------------
// HTTP client
// ---------------------------------------------------------------------------

/**
 * Carries the HTTP status as `httpStatus`, not `status`: App.tsx reads `error.status` to
 * show hints of the previous backend ("collection tasks not found"), which would be wrong here.
 */
export class NexusApiError extends Error {
  constructor(message: string, public readonly httpStatus: number, public readonly code?: string) {
    super(message);
    this.name = 'NexusApiError';
  }
}

interface RequestOptions {
  body?: unknown;
  form?: FormData;
  query?: Record<string, string | number | boolean | undefined | null>;
  auth?: boolean;
  retryOnUnauthorized?: boolean;
  responseType?: 'json' | 'blob';
  /** Message used for 401 instead of the generic session-expired text (login form). */
  unauthorizedMessage?: string;
  /** Fetch cache mode; reports use 'no-store' so a repeat request never returns an old copy. */
  cache?: RequestCache;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = `${NEXUS_API_BASE_URL}${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') params.append(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

/**
 * Turns a backend failure into a Persian message for the existing alert/banner mechanism.
 * The backend answers failures with RFC 7807 ProblemDetails: { title: <error code>,
 * detail: <message>, status } (NexusCore.Application/Common/EndpointResults.cs). Policy
 * failures (403) and authentication failures from the JWT middleware have an empty body.
 * See utils/errorMessages.ts: never English, never internals.
 */
function toApiError(status: number, body: any, unauthorizedMessage?: string): NexusApiError {
  const detail: string = (body && (body.detail || body.message)) || '';
  const code: string | undefined = body?.title;
  if (status === 401 && unauthorizedMessage) {
    return new NexusApiError(unauthorizedMessage, status, code);
  }
  return new NexusApiError(persianApiMessage(status, code, detail), status, code);
}

/** The same client for API modules kept in their own file (e.g. orgStructureApi.ts). */
export function apiRequest<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
  return request<T>(method, path, options);
}

async function request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
  const { body, form, query, auth = true, retryOnUnauthorized = true, responseType = 'json' } = options;

  const headers: Record<string, string> = { Accept: responseType === 'json' ? 'application/json' : '*/*' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) {
    const session = readSession();
    if (session?.accessToken) headers.Authorization = `Bearer ${session.accessToken}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers,
      // FormData sets its own multipart boundary header.
      body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
      cache: options.cache,
      signal: controller.signal,
    });
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new NexusApiError(TIMEOUT_ERROR, 0);
    }
    throw new NexusApiError(NETWORK_ERROR, 0);
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 401 && auth && retryOnUnauthorized) {
    if (await refreshSession()) {
      return request<T>(method, path, { ...options, retryOnUnauthorized: false });
    }
  }

  if (!response.ok) {
    let problem: any = null;
    try {
      const text = await response.text();
      problem = text ? JSON.parse(text) : null;
    } catch {
      problem = null;
    }
    throw toApiError(response.status, problem, options.unauthorizedMessage);
  }

  if (responseType === 'blob') {
    return (await response.blob()) as unknown as T;
  }
  if (response.status === 204) {
    return undefined as unknown as T;
  }
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

async function mapWithLimit<TIn, TOut>(items: TIn[], limit: number, fn: (item: TIn) => Promise<TOut>): Promise<TOut[]> {
  const results = new Array<TOut>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

async function getAllPages<T>(path: string, query: RequestOptions['query'] = {}, pageSize = 200): Promise<T[]> {
  const all: T[] = [];
  for (let pageNumber = 1; ; pageNumber++) {
    const page = await request<PagedResult<T>>('GET', path, { query: { ...query, pageNumber, pageSize } });
    all.push(...page.items);
    if (page.items.length === 0 || all.length >= page.totalCount) break;
  }
  return all;
}

// ---------------------------------------------------------------------------
// Value conversions
// ---------------------------------------------------------------------------

const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isGuid(value: string | undefined | null): value is string {
  return !!value && GUID_PATTERN.test(value);
}

const STATUS_TO_API: Record<TaskStatus, string> = {
  todo: 'Todo',
  in_progress: 'InProgress',
  paused: 'Paused',
  completed: 'Completed',
};
const STATUS_FROM_API: Record<string, TaskStatus> = {
  Todo: 'todo',
  InProgress: 'in_progress',
  Paused: 'paused',
  Completed: 'completed',
};

const LEVEL_TO_API: Record<Priority | SubTaskImportance, 'Low' | 'Medium' | 'High'> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};
const LEVEL_FROM_API: Record<string, Priority> = { Low: 'low', Medium: 'medium', High: 'high' };

const FREQUENCY_TO_API: Record<RecurringFrequency, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  monthly_day: 'MonthlyDay',
  monthly_nth_weekday: 'MonthlyNthWeekday',
};
const FREQUENCY_FROM_API: Record<string, RecurringFrequency> = {
  Daily: 'daily',
  Weekly: 'weekly',
  Monthly: 'monthly',
  MonthlyDay: 'monthly_day',
  MonthlyNthWeekday: 'monthly_nth_weekday',
};

const NTH_TO_API: Record<OccurrenceNth, string> = {
  first: 'First',
  second: 'Second',
  third: 'Third',
  fourth: 'Fourth',
  last: 'Last',
};
const NTH_FROM_API: Record<string, OccurrenceNth> = {
  First: 'first',
  Second: 'second',
  Third: 'third',
  Fourth: 'fourth',
  Last: 'last',
};

/**
 * UI dates are ISO instants; the backend keeps what the user picked - a calendar date
 * (DateOnly) and, separately, a wall-clock time (TimeOnly). Both are taken in Iran time
 * (UTC+3:30), the zone every date picker and label in the app works in (utils/jalali.ts), so
 * the stored day is the day the user clicked whatever the browser's own time zone is. Taking
 * the UTC date instead would move anything picked before 03:30 to the previous day.
 */
function toDateOnly(value: string | undefined | null): string | null {
  return (value && isoToIranDateTimeParts(value)?.date) || null;
}

/** The wall-clock time ("HH:mm:00") of a UI date; null for a bare date. 00:00 is kept as a time. */
function toTimeOfDay(value: string | undefined | null): string | null {
  return (value && isoToIranDateTimeParts(value)?.time) || null;
}

/** Inverse of toDateOnly + toTimeOfDay. Without a time it is the start of that Iranian day. */
function fromDateOnly(value: string | null | undefined, time?: string | null): string | undefined {
  return iranDateTimeToISO(value, time);
}

/** "09:00" -> "09:00:00" (System.Text.Json TimeOnly format). */
function toTimeOnly(value: string | undefined): string | null {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!match) return null;
  return `${match[1].padStart(2, '0')}:${match[2]}:${match[3] || '00'}`;
}

/** "09:00:00" -> "09:00". */
function fromTimeOnly(value: string | null): string | undefined {
  return value ? value.substring(0, 5) : undefined;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function dataUrlToBlob(dataUrl: string, fallbackType: string): Blob {
  const [header, payload = ''] = dataUrl.split(',', 2);
  const isBase64 = /;base64/i.test(header);
  const mime = /^data:([^;,]+)/i.exec(header)?.[1] || fallbackType || 'application/octet-stream';
  if (!isBase64) {
    return new Blob([decodeURIComponent(payload)], { type: mime });
  }
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

// ---------------------------------------------------------------------------
// Mapping: backend -> UI
// ---------------------------------------------------------------------------

export function mapUserDto(u: UserDto): User {
  return {
    id: u.id,
    username: u.username || '',
    email: u.email || '',
    name: u.displayName || u.username || '',
    avatar: normalizeAvatar(u.avatarUrl),
    theme: (u.theme as User['theme']) || undefined,
    colorPalette: (u.colorPalette as User['colorPalette']) || undefined,
    themeMode: (u.themeMode as User['themeMode']) || undefined,
    role: (u.roles || []).includes(ADMIN_ROLE_NAME) ? 'admin' : 'user',
    disabled: !u.isActive,
    lastLogin: u.lastLoginAtUtc || undefined,
    phoneNumber: u.phoneNumber || '',
    notifySms: u.notifySms !== false,
  };
}

function mapRecurrence(r: RepetitiveTaskDto): RecurringConfig {
  const startTime = fromTimeOnly(r.startTime);
  return {
    frequency: FREQUENCY_FROM_API[r.frequency] || 'daily',
    intervalWeeks: r.intervalWeeks ?? undefined,
    startTime,
    endTime: fromTimeOnly(r.endTime),
    dailyTime: startTime,
    time: startTime,
    weeklyDays: r.weeklyDays?.length ? r.weeklyDays : undefined,
    monthlyDays: r.monthlyDays?.length ? r.monthlyDays : undefined,
    nthOccurrence: r.nthOccurrence ? NTH_FROM_API[r.nthOccurrence] : undefined,
    nthWeekday: r.nthWeekday ?? undefined,
    startDate: fromDateOnly(r.startDate),
    endDate: fromDateOnly(r.endDate),
  };
}

/**
 * The UI recognises the occurrences it generated from a recurrence schedule by a "rec_occ_"
 * id prefix and replaces them when the schedule is saved again. The server keeps that fact
 * (IsGeneratedOccurrence), and the prefix is restored here around the server id.
 */
const OCCURRENCE_PREFIX = 'rec_occ_';

function toUiSubTaskId(s: SubTaskDto): string {
  return s.isGeneratedOccurrence ? `${OCCURRENCE_PREFIX}${s.id}` : s.id;
}

/** The server id behind a UI subtask id, or the id itself for one not yet saved. */
function toServerSubTaskId(uiId: string): string {
  if (uiId.startsWith(OCCURRENCE_PREFIX)) {
    const rest = uiId.slice(OCCURRENCE_PREFIX.length);
    if (isGuid(rest)) return rest;
  }
  return uiId;
}

const SUBTASK_PROGRESS_FROM_API: Record<string, SubTaskProgress> = {
  NotStarted: 'not_started',
  InProgress: 'in_progress',
  Completed: 'completed',
};

const SUBTASK_PROGRESS_TO_API: Record<SubTaskProgress, 'NotStarted' | 'InProgress' | 'Completed'> = {
  not_started: 'NotStarted',
  in_progress: 'InProgress',
  completed: 'Completed',
};

function mapSubTask(s: SubTaskDto): ProjectSubTask {
  const status = SUBTASK_PROGRESS_FROM_API[s.status || 'NotStarted'] || 'not_started';
  return {
    id: toUiSubTaskId(s),
    title: s.title,
    startDate: fromDateOnly(s.startDate, s.startTime),
    endDate: fromDateOnly(s.endDate, s.endTime),
    importance: LEVEL_FROM_API[s.importance] || 'medium',
    completed: s.isCompleted,
    status,
    actualStartDate: s.actualStartedAtUtc || undefined,
    actualCompletedDate: s.actualCompletedAtUtc || undefined,
    createdAt: s.createdAtUtc,
    assignees: (s.assignees || []).map((a) => ({ id: a.id, name: a.displayName })),
  };
}

async function downloadFileAsDataUrl(fileId: string): Promise<string> {
  const blob = await request<Blob>('GET', `/api/task-management/files/${fileId}/content`, { responseType: 'blob' });
  return blobToDataUrl(toSafeBlob(blob));
}

/**
 * The UI shows and downloads attachments straight from `dataUrl`, so the bytes are fetched
 * here. The attachment id is the TaskFile link id - the handle the delete endpoint takes.
 */
async function mapFiles(files: TaskFileDto[]): Promise<Attachment[]> {
  return Promise.all(
    files.map(async (f) => ({
      id: f.linkId,
      name: f.fileName,
      size: f.fileSizeBytes,
      type: f.contentType,
      // One unreadable file must not stop the whole board from loading. The entry is kept
      // (with no content) so its link id survives and a later save does not delete it.
      dataUrl: await downloadFileAsDataUrl(f.fileId).catch((err) => {
        console.warn(`Attachment ${f.fileName} could not be downloaded:`, err instanceof Error ? err.message : err);
        return '';
      }),
      createdAt: f.createdAtUtc,
    }))
  );
}

export const ACTIVITY_ACTION_TITLES: Record<string, string> = {
  'Task created': 'ثبت و ایجاد فعالیت جدید',
  'Task updated': 'ویرایش مشخصات فعالیت',
  'Task deleted': 'حذف کامل فعالیت',
  'Status changed': 'تغییر وضعیت فعالیت',
  'Priority changed': 'تغییر اولویت فعالیت',
  'Assignee changed': 'تغییر مسئول انجام',
  'Team changed': 'تغییر تیم مسئول',
  'Subtask added': 'افزودن زیرفعالیت',
  'Subtask updated': 'ویرایش زیرفعالیت',
  'Subtask deleted': 'حذف زیرفعالیت',
  'Subtask completed': 'انجام زیرفعالیت',
  'Subtask reopened': 'بازگشایی زیرفعالیت',
};

export function translateActivityDetails(action: string, details: string | null): string {
  if (!details) return '';
  // The server's plain "updated" entry carries only the task's title, which the bell shows anyway.
  if (action === 'Task updated') return '';
  if (action === 'Status changed') {
    const match = /^(\w+)\s*->\s*(\w+)$/.exec(details.trim());
    if (match) {
      const from = STATUSES[STATUS_FROM_API[match[1]]]?.title || match[1];
      const to = STATUSES[STATUS_FROM_API[match[2]]]?.title || match[2];
      return `تغییر وضعیت از "${from}" به "${to}"`;
    }
  }
  return details;
}

function mapActivity(a: TaskActivityDto): TaskLog {
  return {
    id: a.id,
    taskId: a.taskId,
    userId: a.userId || '',
    userName: a.userDisplayName || 'کاربر',
    action: ACTIVITY_ACTION_TITLES[a.action] || a.action,
    details: translateActivityDetails(a.action, a.details),
    createdAt: a.occurredAtUtc,
    serverAction: a.action in ACTIVITY_ACTION_TITLES ? a.action : undefined,
  };
}

function mapComment(c: TaskCommentDto, attachments?: Attachment[]): TaskComment {
  return {
    id: c.id,
    taskId: c.taskId,
    userId: c.userId,
    userName: c.userDisplayName || 'کاربر',
    actingNote: c.actingNote || undefined,
    text: c.text,
    attachments: attachments && attachments.length > 0 ? attachments : undefined,
    createdAt: c.createdAtUtc,
    updatedAt: c.modifiedAtUtc || undefined,
  };
}

async function mapCommentWithFiles(c: TaskCommentDto): Promise<TaskComment> {
  return mapComment(c, await mapFiles(c.files || []));
}

/** The task's responsible people; an older server only knows the one assignedUser. */
function responsibleOf(dto: TaskDto): UserSummaryDto[] {
  if (dto.responsibleUsers && dto.responsibleUsers.length > 0) return dto.responsibleUsers;
  return dto.assignedUser ? [dto.assignedUser] : [];
}

async function mapTask(dto: TaskDto, comments?: TaskComment[], logs?: TaskLog[]): Promise<Task> {
  const hasCharter =
    dto.charterDescription || dto.charterProjectManager || dto.charterStartDate || dto.charterEndDate;

  return {
    id: dto.id,
    title: dto.title,
    description: dto.description || '',
    dueDate: fromDateOnly(dto.dueDate, dto.dueTime) || new Date().toISOString(),
    actualCompletionDate: dto.actualCompletionDateUtc || undefined,
    priority: LEVEL_FROM_API[dto.priority] || 'medium',
    status: STATUS_FROM_API[dto.status] || 'todo',
    attachments: await mapFiles(dto.files || []),
    user: dto.owner?.id,
    ownerName: dto.owner?.displayName,
    assignedUserId: dto.assignedUser?.id,
    assignedUserName: dto.assignedUser?.displayName,
    responsibleUserIds: responsibleOf(dto).map((u) => u.id),
    responsibleUserNames: responsibleOf(dto).map((u) => u.displayName),
    standIns: dto.standIns?.length ? dto.standIns.map((s) => ({ userId: s.id, name: s.displayName, note: s.note ? s.note.replace(/[0-9]/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]) : null })) : undefined,
    assignedTeamId: dto.assignedUserGroup?.id,
    assignedTeamName: dto.assignedUserGroup?.name,
    teamMemberIds: (dto.assignees || []).map((a) => a.id),
    teamMemberNames: (dto.assignees || []).map((a) => a.displayName),
    posts: dto.posts ? dto.posts.map((p) => ({ ...p, role: p.role as 'owner' | 'responsible' | 'access' })) : undefined,
    responsiblePostIds: dto.posts ? dto.posts.filter((p) => p.role === 'responsible').map((p) => p.postId) : undefined,
    allowAssigneeStatusUpdate: dto.allowAssigneeStatusUpdate,
    tags: (dto.tags || []).map((t) => t.name),
    isProject: dto.isProject,
    parentTaskId: dto.parentTaskId || undefined,
    isRecurring: dto.isRecurring,
    recurringConfig: dto.recurrence ? mapRecurrence(dto.recurrence) : undefined,
    projectCharter: hasCharter
      ? {
          description: dto.charterDescription || undefined,
          projectManager: dto.charterProjectManager || undefined,
          startDate: fromDateOnly(dto.charterStartDate, dto.charterStartTime),
          endDate: fromDateOnly(dto.charterEndDate, dto.charterEndTime),
        }
      : undefined,
    projectSubTasks: [...(dto.subTasks || [])].sort((a, b) => a.sortOrder - b.sortOrder).map(mapSubTask),
    comments: comments || [],
    logs: logs || [],
    createdAt: dto.createdAtUtc,
    updatedAt: dto.modifiedAtUtc || dto.createdAtUtc,
  };
}

// ---------------------------------------------------------------------------
// Mapping: UI -> backend
// ---------------------------------------------------------------------------

function requireGuid(value: string | undefined, what: string): string | null {
  if (!value) return null;
  if (!isGuid(value)) {
    throw new NexusApiError(
      `شناسه ${what} («${value}») با سرور NexusCore سازگار نیست. لطفاً ${what} را دوباره از فهرست انتخاب کنید.`,
      400
    );
  }
  return value;
}

function toRecurrenceInput(cfg: RecurringConfig, fallbackStart: string | undefined) {
  const start = toDateOnly(cfg.startDate) || toDateOnly(fallbackStart);
  if (!start) {
    throw new NexusApiError('تاریخ شروع تکرار مشخص نشده است.', 400);
  }
  return {
    frequency: FREQUENCY_TO_API[cfg.frequency] || 'Daily',
    startDate: start,
    intervalWeeks: cfg.frequency === 'weekly' ? cfg.intervalWeeks ?? null : null,
    startTime: toTimeOnly(cfg.startTime || cfg.dailyTime || cfg.time),
    endTime: toTimeOnly(cfg.endTime),
    weeklyDays: cfg.weeklyDays ?? null,
    monthlyDays: cfg.monthlyDays ?? null,
    nthOccurrence: cfg.nthOccurrence ? NTH_TO_API[cfg.nthOccurrence] : null,
    nthWeekday: cfg.nthWeekday ?? null,
    endDate: toDateOnly(cfg.endDate),
  };
}

function toSubTaskBody(s: ProjectSubTask, sortOrder: number) {
  return {
    title: s.title,
    importance: LEVEL_TO_API[s.importance] || 'Medium',
    startDate: toDateOnly(s.startDate),
    endDate: toDateOnly(s.endDate),
    startTime: toTimeOfDay(s.startDate),
    endTime: toTimeOfDay(s.endDate),
    sortOrder,
    isGeneratedOccurrence: s.id.startsWith(OCCURRENCE_PREFIX),
    assigneeUserIds: (s.assignees || []).map((a) => a.id),
  };
}

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

/** A CAPTCHA the server asked for: the image to show and the id to send back with the answer. */
export interface LoginCaptcha {
  captchaId: string;
  imageDataUrl: string;
  expiresInSeconds: number;
}

/**
 * Error codes (ProblemDetails title) with which sign-in says a CAPTCHA is needed for the next
 * attempt: none was sent, the one sent was wrong or expired, or the credentials were wrong and
 * the server now wants one.
 */
export const CAPTCHA_ERROR_CODES = ['captcha.required', 'captcha.invalid', 'unauthorized.captcha_required'];

/** A new single-use CAPTCHA for this client. The answer is never sent to the browser. */
export async function requestLoginCaptcha(): Promise<LoginCaptcha> {
  return request<LoginCaptcha>('POST', '/api/identity/auth/captcha', { auth: false, retryOnUnauthorized: false, body: {} });
}

/**
 * Signs in with a username or a mobile number (email addresses are not sign-in names). After a
 * failed attempt the server requires a CAPTCHA; the error then carries one of
 * CAPTCHA_ERROR_CODES and the caller shows a CAPTCHA from requestLoginCaptcha().
 */
export async function login(
  identity: string,
  password: string,
  captcha?: { captchaId: string; answer: string }
): Promise<User> {
  const identifier = identity.trim();
  if (identifier.includes('@')) {
    throw new NexusApiError('ورود با ایمیل امکان‌پذیر نیست. لطفاً نام کاربری یا شماره تلفن همراه خود را وارد کنید.', 400);
  }

  let auth: AuthResponse;
  try {
    auth = await request<AuthResponse>('POST', '/api/identity/auth/login', {
      body: {
        identifier,
        password,
        tenantSlug: NEXUS_TENANT_SLUG || null,
        captchaId: captcha?.captchaId || null,
        captchaAnswer: captcha?.answer?.trim() || null,
      },
      auth: false,
      retryOnUnauthorized: false,
      unauthorizedMessage: 'نام کاربری، شماره تلفن یا رمز عبور صحیح نیست.',
    });
  } catch (err) {
    // Only sent when the password was right, so it tells nothing to someone guessing.
    if (err instanceof NexusApiError && err.code === 'account.disabled') {
      throw new NexusApiError('حساب کاربری شما غیرفعال شده است. لطفاً با مدیر سامانه تماس بگیرید.', err.httpStatus, err.code);
    }
    if (err instanceof NexusApiError && err.code === 'captcha.required') {
      throw new NexusApiError('برای ادامه، کد امنیتی تصویر را وارد کنید.', err.httpStatus, err.code);
    }
    if (err instanceof NexusApiError && err.code === 'captcha.invalid') {
      throw new NexusApiError('کد امنیتی نادرست است یا منقضی شده است. کد جدید را وارد کنید.', err.httpStatus, err.code);
    }
    throw err;
  }
  saveAuthResponse(auth);
  return mapUserDto(auth.user);
}

/** Signed-in user from the stored session, without a network call (used on first render). */
export function getSessionUser(): User | null {
  const session = readSession();
  return session?.refreshToken && session.user ? { ...mapUserDto(session.user), permissions: session.permissions } : null;
}

export function getSessionTenantId(): string | null {
  return readSession()?.user?.tenantId || null;
}

/**
 * GET /api/identity/auth/me. Returns null when the session is gone (refresh failed); keeps
 * the stored user when the server is merely unreachable.
 */
export async function refreshCurrentUser(): Promise<User | null> {
  const session = readSession();
  if (!session) return null;
  try {
    const me = await request<CurrentUserResponse>('GET', '/api/identity/auth/me');
    const latest = readSession();
    const permissions = me.permissions || [];
    if (latest) writeSession({ ...latest, user: me.user, permissions });
    if (!me.user.isActive) {
      endSession();
      return null;
    }
    return { ...mapUserDto(me.user), permissions };
  } catch (err) {
    if (err instanceof NexusApiError && err.httpStatus === 401) {
      endSession();
      return null;
    }
    console.warn('Could not refresh the current user from NexusCore:', err instanceof Error ? err.message : err);
    return getSessionUser();
  }
}

/**
 * Signs out: the refresh token is revoked on the server (POST /auth/logout) and the stored
 * tokens are discarded at once. The server call is best effort - sign-out never waits for it.
 */
export function logout(): void {
  const refreshToken = readSession()?.refreshToken;
  writeSession(null);
  clearLookups();
  if (refreshToken) {
    request<void>('POST', '/api/identity/auth/logout', {
      body: { refreshToken },
      auth: false,
      retryOnUnauthorized: false,
    }).catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------
// Users & user groups (UI "teams")
// ---------------------------------------------------------------------------

export async function fetchUsers(): Promise<User[]> {
  if (!readSession()) return [];
  const users = await getAllPages<UserDto>('/api/identity/users', {}, 100);
  return users.map(mapUserDto);
}

/** Chat's own, permission-light directory: everyone in your tenant you may start a direct chat with. */
export interface ChatContactDto {
  id: string;
  name: string;
  avatar?: string;
}

export async function fetchChatDirectory(): Promise<ChatContactDto[]> {
  if (!readSession()) return [];
  const contacts = await request<{ id: string; displayName: string; avatarUrl?: string | null }[]>('GET', '/api/chat/direct/directory');
  return (contacts || []).map((c) => ({ id: c.id, name: c.displayName, avatar: normalizeAvatar(c.avatarUrl) }));
}

export async function deleteUser(userId: string): Promise<void> {
  await request<void>('DELETE', `/api/identity/users/${requireGuid(userId, 'کاربر')}`);
}

const MY_TEAMS = '/api/identity/groups/mine';
const TEAM_MANAGER_ROLE = 'مدیر تیم';
const TEAM_MEMBER_ROLE = 'عضو تیم';

function mapTeam(g: UserGroupDto): WorkTeam {
  const ownerId = g.ownerUserId || '';
  return {
    id: g.id,
    name: g.name,
    ownerId,
    // The UI's roles follow ownership: the owner manages the team, everyone else is a member.
    members: (g.members || []).map((m) => ({
      userId: m.userId,
      name: m.displayName,
      username: m.email,
      role: m.userId === ownerId ? TEAM_MANAGER_ROLE : TEAM_MEMBER_ROLE,
    })),
    createdAt: '',
  };
}

/** The signed-in user's own work teams (personal teams, owned by them). */
export async function fetchUserGroupsAsTeams(): Promise<WorkTeam[]> {
  if (!readSession()) return [];
  const teams = await request<UserGroupDto[]>('GET', MY_TEAMS);
  return (teams || []).filter((g) => g.isActive).map(mapTeam);
}

/**
 * Stores the whole team list the team editor holds: new teams are created, renamed ones
 * updated, member lists replaced and teams no longer in the list deleted. Returns the teams
 * as saved, with server ids.
 */
export async function saveMyTeams(teams: WorkTeam[]): Promise<WorkTeam[]> {
  const current = await request<UserGroupDto[]>('GET', MY_TEAMS);
  const currentById = new Map((current || []).map((g) => [g.id, g]));
  const keep = new Set<string>();

  for (const team of teams) {
    const memberIds = (team.members || []).map((m) => m.userId).filter((id) => isGuid(id));
    let saved = isGuid(team.id) ? currentById.get(team.id) : undefined;

    if (!saved) {
      saved = await request<UserGroupDto>('POST', MY_TEAMS, { body: { name: team.name } });
    } else if (saved.name !== team.name) {
      saved = await request<UserGroupDto>('PUT', `${MY_TEAMS}/${saved.id}`, { body: { name: team.name, description: saved.description } });
    }

    keep.add(saved.id);
    const before = new Set((saved.members || []).map((m) => m.userId));
    const changed = memberIds.length !== before.size || memberIds.some((id) => !before.has(id));
    if (changed) {
      await request<UserGroupDto>('PUT', `${MY_TEAMS}/${saved.id}/members`, { body: { userIds: memberIds } });
    }
  }

  for (const existing of current || []) {
    if (!keep.has(existing.id)) {
      await request('DELETE', `${MY_TEAMS}/${existing.id}`);
    }
  }

  return fetchUserGroupsAsTeams();
}

/** Creates one of the caller's own teams (the caller is its first member); the server's copy. */
export async function createMyTeam(name: string): Promise<WorkTeam> {
  return mapTeam(await request<UserGroupDto>('POST', MY_TEAMS, { body: { name } }));
}

/** Replaces the members of one of the caller's own teams (the owner always stays); the server's copy. */
export async function setMyTeamMembers(teamId: string, userIds: string[]): Promise<WorkTeam> {
  return mapTeam(await request<UserGroupDto>('PUT', `${MY_TEAMS}/${teamId}/members`, { body: { userIds } }));
}

/**
 * Whom the caller may add to their teams. limited = false: anyone; otherwise only allowedUserIds
 * (e.g. their own deputy, with the organization structure). null when the server does not say
 * (an older backend, or no right to build teams) - then nothing is filtered.
 */
export interface MyTeamMemberScope { limited: boolean; allowedUserIds: string[]; scopeName: string | null }

export async function fetchMyTeamMemberScope(): Promise<MyTeamMemberScope | null> {
  if (!readSession()) return null;
  try {
    return await request<MyTeamMemberScope>('GET', `${MY_TEAMS}/member-scope`);
  } catch {
    return null;
  }
}

/** Deletes one of the caller's own teams. */
export async function deleteMyTeam(teamId: string): Promise<void> {
  await request('DELETE', `${MY_TEAMS}/${teamId}`);
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

const TASKS = '/api/task-management/tasks';

async function getTaskDto(taskId: string): Promise<TaskDto> {
  return request<TaskDto>('GET', `${TASKS}/${taskId}`);
}

async function fetchComments(taskId: string): Promise<TaskComment[]> {
  const items = await request<TaskCommentDto[]>('GET', `${TASKS}/${taskId}/comments`);
  return (await Promise.all((items || []).map(mapCommentWithFiles))).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/** The creation entry this app writes itself, with the assignees in its text. */
export const TASK_CREATED_ACTION = 'ثبت و ایجاد فعالیت جدید';

/**
 * The server records "Task created" (details: just the title) on its own, and this app adds its
 * fuller creation entry right after. Both are the same event, so when the fuller one exists the
 * server's short one is left out - otherwise the history and the bell show the creation twice.
 */
export function withoutDuplicateCreation<T extends { action: string }>(items: T[]): T[] {
  return items.some((a) => a.action === TASK_CREATED_ACTION) ? items.filter((a) => a.action !== 'Task created') : items;
}

/** The server's own entries for the parts of an edit; this app's edit entry describes them all. */
const SERVER_EDIT_ACTIONS = new Set(['Task updated', 'Status changed', 'Priority changed', 'Assignee changed', 'Team changed']);
/** How far apart an edit's server entries and this app's entry for it can be. */
const EDIT_ENTRY_WINDOW_MS = 2 * 60_000;

/**
 * Saving an edit makes the server record its own short entries ("Task updated" with just the
 * title, "Status changed"...) and this app then records one entry saying exactly what changed.
 * Same edit, same person: the server's entries are left out, so the history and the bell tell
 * it once, clearly. Server entries with no such entry next to them (e.g. a subtask ticked on
 * the board) stay.
 */
export function withoutEditDuplicates(logs: TaskLog[]): TaskLog[] {
  const appEdits = logs.filter((l) => !l.serverAction && l.action !== TASK_CREATED_ACTION && l.action !== 'حذف کامل فعالیت');
  return logs.filter((l) => {
    if (!l.serverAction || !SERVER_EDIT_ACTIONS.has(l.serverAction)) return true;
    const at = new Date(l.createdAt).getTime();
    return !appEdits.some((edit) => {
      const editAt = new Date(edit.createdAt).getTime();
      return edit.userId === l.userId && at <= editAt + 5_000 && editAt - at <= EDIT_ENTRY_WINDOW_MS;
    });
  });
}

async function fetchActivity(taskId: string): Promise<TaskLog[]> {
  const items = await request<TaskActivityDto[]>('GET', `${TASKS}/${taskId}/activity`);
  return withoutEditDuplicates(withoutDuplicateCreation(items || []).map(mapActivity))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/**
 * The list endpoint returns a trimmed TaskListItemDto (no description, subtasks, files,
 * charter or recurrence), while the board needs the full task. So the list supplies the ids
 * and each task is then read in full, together with its comments and activity (the
 * notification bell is built from those).
 */
export async function fetchTasks(): Promise<Task[]> {
  // Signed out: nothing to show, and no point sending requests that can only return 401.
  if (!readSession()) return [];
  const list = await getAllPages<TaskListItemDto>(TASKS, { sortBy: 'CreatedAtUtc', sortDescending: true }, 200);
  return mapWithLimit(list, DETAIL_CONCURRENCY, async (item) => {
    const [dto, comments, logs] = await Promise.all([
      getTaskDto(item.id),
      fetchComments(item.id),
      fetchActivity(item.id),
    ]);
    return mapTask(dto, comments, logs);
  });
}

async function fetchTask(taskId: string): Promise<Task> {
  const [dto, comments, logs] = await Promise.all([getTaskDto(taskId), fetchComments(taskId), fetchActivity(taskId)]);
  return mapTask(dto, comments, logs);
}

async function uploadAttachment(taskId: string, attachment: Attachment): Promise<void> {
  const form = new FormData();
  form.append('file', dataUrlToBlob(attachment.dataUrl, attachment.type), attachment.name);
  await request<TaskFileDto>('POST', `/api/task-management/files/tasks/${taskId}`, { form });
}

async function resolveTagId(name: string): Promise<string> {
  const wanted = name.trim().toUpperCase();
  const found = await request<TagDto[]>('GET', '/api/task-management/tags', { query: { search: name.trim() } });
  const exact = (found || []).find((t) => t.name.trim().toUpperCase() === wanted);
  if (exact) return exact.id;
  const created = await request<TagDto>('POST', '/api/task-management/tags', { body: { name: name.trim() } });
  return created.id;
}

/** Who the caller wants responsible: responsibleUserIds, or the single assignedUserId of older code. */
function responsibleIdsOf(taskData: Partial<Task>): string[] {
  if (taskData.responsibleUserIds !== undefined) return Array.from(new Set(taskData.responsibleUserIds.filter(Boolean)));
  return taskData.assignedUserId ? [taskData.assignedUserId] : [];
}

export async function createTask(taskData: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): Promise<Task> {
  const subTasks = taskData.projectSubTasks || [];
  const dueDate = toDateOnly(taskData.dueDate);
  if (!dueDate) throw new NexusApiError('تاریخ سررسید فعالیت نامعتبر است.', 400);

  // Task, subtasks and tags are written by one call and one transaction on the server.
  const created = await request<TaskDto>('POST', TASKS, {
    body: {
      title: taskData.title,
      dueDate,
      dueTime: toTimeOfDay(taskData.dueDate),
      priority: LEVEL_TO_API[taskData.priority] || 'Medium',
      description: taskData.description || null,
      isProject: !!taskData.isProject,
      parentTaskId: taskData.parentTaskId || null,
      assignedUserId: requireGuid(responsibleIdsOf(taskData)[0], 'کاربر مسئول'),
      responsibleUserIds: responsibleIdsOf(taskData).map((id) => requireGuid(id, 'کاربر مسئول')),
      // Where tasks are given to posts: these posts (their holders are the people above).
      responsiblePostIds: taskData.responsiblePostIds ?? null,
      assignedUserGroupId: requireGuid(taskData.assignedTeamId, 'تیم'),
      assigneeUserIds: (taskData.teamMemberIds || []).map((id) => requireGuid(id, 'عضو تیم')),
      allowAssigneeStatusUpdate: taskData.allowAssigneeStatusUpdate ?? true,
      charterDescription: taskData.projectCharter?.description || null,
      charterProjectManager: taskData.projectCharter?.projectManager || null,
      charterStartDate: toDateOnly(taskData.projectCharter?.startDate),
      charterEndDate: toDateOnly(taskData.projectCharter?.endDate),
      charterStartTime: toTimeOfDay(taskData.projectCharter?.startDate),
      charterEndTime: toTimeOfDay(taskData.projectCharter?.endDate),
      subTasks: subTasks.map((s, i) => toSubTaskBody(s, i)),
      tags: (taskData.tags || []).filter((t) => t && t.trim()),
    },
  });

  // The remaining steps use their own endpoints. If one fails, the task is removed again so
  // a half-saved task is not left behind - the same all-or-nothing result as before.
  try {
    const createdSubTasks = [...created.subTasks].sort((a, b) => a.sortOrder - b.sortOrder);
    for (let i = 0; i < subTasks.length && i < createdSubTasks.length; i++) {
      const desiredStatus = subTasks[i].status || (subTasks[i].completed ? 'completed' : 'not_started');
      if (desiredStatus !== 'not_started') {
        await request('PATCH', `/api/task-management/subtasks/${createdSubTasks[i].id}/status`, {
          body: { status: SUBTASK_PROGRESS_TO_API[desiredStatus] },
        });
      }
    }

    if (taskData.status && STATUS_TO_API[taskData.status] !== created.status) {
      await request('PATCH', `${TASKS}/${created.id}/status`, { body: { status: STATUS_TO_API[taskData.status] } });
    }

    if (taskData.isRecurring && taskData.recurringConfig) {
      await request('POST', '/api/task-management/repetitive-tasks', {
        body: { taskId: created.id, recurrence: toRecurrenceInput(taskData.recurringConfig, taskData.dueDate) },
      });
    }

    for (const attachment of taskData.attachments || []) {
      await uploadAttachment(created.id, attachment);
    }
  } catch (err) {
    await request('DELETE', `${TASKS}/${created.id}`).catch(() => undefined);
    throw err;
  }

  return fetchTask(created.id);
}

/**
 * Applies a partial update. A field left `undefined` is not
 * changed. Each part goes to the endpoint that owns it - details (PUT), status (PATCH),
 * subtasks, tags, files and the recurrence schedule.
 */
export async function updateTask(
  taskId: string,
  taskData: Partial<Omit<Task, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<Task> {
  const current = await getTaskDto(taskId);


  const desiredSubTasks = taskData.projectSubTasks;

  // 1. New subtasks first: promoting a task to a project requires subtasks to exist already.
  //    A regenerated schedule arrives as new "rec_occ_" items; the old ones are no longer in
  //    the list and are removed in step 3 - the same replace-on-save the UI always did.
  const currentById = new Map(current.subTasks.map((s) => [s.id, s]));
  if (desiredSubTasks) {
    for (let i = 0; i < desiredSubTasks.length; i++) {
      const s = desiredSubTasks[i];
      if (currentById.has(toServerSubTaskId(s.id))) continue;
      const added = await request<SubTaskDto>('POST', `${TASKS}/${taskId}/subtasks`, { body: toSubTaskBody(s, i) });
      const desiredStatus = s.status || (s.completed ? 'completed' : 'not_started');
      if (desiredStatus !== 'not_started') {
        await request('PATCH', `/api/task-management/subtasks/${added.id}/status`, { body: { status: SUBTASK_PROGRESS_TO_API[desiredStatus] } });
      }
    }
  }

  // 2. Task details. PUT replaces every field, so untouched ones are carried over.
  const touchesDetails = [
    taskData.title,
    taskData.description,
    taskData.dueDate,
    taskData.priority,
    taskData.isProject,
    taskData.assignedUserId,
    taskData.responsibleUserIds,
    taskData.assignedTeamId,
    taskData.teamMemberIds,
    taskData.allowAssigneeStatusUpdate,
    taskData.projectCharter,
  ].some((v) => v !== undefined);

  if (touchesDetails) {
    const charter = taskData.projectCharter;
    await request('PUT', `${TASKS}/${taskId}`, {
      body: {
        title: taskData.title ?? current.title,
        dueDate: toDateOnly(taskData.dueDate) || current.dueDate,
        // The PUT replaces the time too, so an untouched due date keeps the time it has.
        dueTime: taskData.dueDate !== undefined ? toTimeOfDay(taskData.dueDate) : current.dueTime ?? null,
        priority: taskData.priority ? LEVEL_TO_API[taskData.priority] : current.priority,
        description: taskData.description !== undefined ? taskData.description || null : current.description,
        isProject: taskData.isProject ?? current.isProject,
        assignedUserId:
          taskData.responsibleUserIds !== undefined || taskData.assignedUserId !== undefined
            ? requireGuid(responsibleIdsOf(taskData)[0], 'کاربر مسئول')
            : current.assignedUser?.id ?? null,
        // Sent only when the caller set it; otherwise the server keeps who is responsible.
        responsibleUserIds:
          taskData.responsibleUserIds !== undefined
            ? responsibleIdsOf(taskData).map((id) => requireGuid(id, 'کاربر مسئول'))
            : null,
        responsiblePostIds: taskData.responsiblePostIds ?? null,
        assignedUserGroupId:
          taskData.assignedTeamId !== undefined
            ? requireGuid(taskData.assignedTeamId, 'تیم')
            : current.assignedUserGroup?.id ?? null,
        assigneeUserIds:
          taskData.teamMemberIds !== undefined
            ? taskData.teamMemberIds.map((id) => requireGuid(id, 'عضو تیم'))
            : null,
        allowAssigneeStatusUpdate: taskData.allowAssigneeStatusUpdate ?? current.allowAssigneeStatusUpdate,
        charterDescription: charter !== undefined ? charter?.description || null : current.charterDescription,
        charterProjectManager: charter !== undefined ? charter?.projectManager || null : current.charterProjectManager,
        charterStartDate: charter !== undefined ? toDateOnly(charter?.startDate) : current.charterStartDate,
        charterEndDate: charter !== undefined ? toDateOnly(charter?.endDate) : current.charterEndDate,
        charterStartTime: charter !== undefined ? toTimeOfDay(charter?.startDate) : current.charterStartTime ?? null,
        charterEndTime: charter !== undefined ? toTimeOfDay(charter?.endDate) : current.charterEndTime ?? null,
      },
    });
  }

  // 3. Existing subtasks: edits, completion toggles, then removals (a plain task may drop
  //    them all; a project keeps at least one, which the server enforces).
  if (desiredSubTasks) {
    const desiredIds = new Set(desiredSubTasks.map((s) => toServerSubTaskId(s.id)));
    for (let i = 0; i < desiredSubTasks.length; i++) {
      const s = desiredSubTasks[i];
      const serverId = toServerSubTaskId(s.id);
      const existing = currentById.get(serverId);
      if (!existing) continue;
      const body = toSubTaskBody(s, i);
      const existingAssigneeIds = (existing.assignees || []).map((a) => a.id).sort();
      const desiredAssigneeIds = [...body.assigneeUserIds].sort();
      const changed =
        existing.title !== body.title ||
        existing.importance !== body.importance ||
        (existing.startDate || null) !== body.startDate ||
        (existing.endDate || null) !== body.endDate ||
        (existing.startTime || null) !== body.startTime ||
        (existing.endTime || null) !== body.endTime ||
        existing.sortOrder !== body.sortOrder ||
        existingAssigneeIds.length !== desiredAssigneeIds.length ||
        existingAssigneeIds.some((id, idx) => id !== desiredAssigneeIds[idx]);
      if (changed) {
        await request('PUT', `/api/task-management/subtasks/${serverId}`, { body });
      }
      const desiredStatus = SUBTASK_PROGRESS_TO_API[s.status || (s.completed ? 'completed' : 'not_started')];
      if ((existing.status || 'NotStarted') !== desiredStatus) {
        await request('PATCH', `/api/task-management/subtasks/${serverId}/status`, { body: { status: desiredStatus } });
      }
    }
    for (const existing of current.subTasks) {
      if (!desiredIds.has(existing.id)) {
        await request('DELETE', `/api/task-management/subtasks/${existing.id}`);
      }
    }
  }

  // 4. Status.
  if (taskData.status && STATUS_TO_API[taskData.status] !== current.status) {
    await request('PATCH', `${TASKS}/${taskId}/status`, { body: { status: STATUS_TO_API[taskData.status] } });
  }

  // 5. Tags, by name.
  if (taskData.tags !== undefined) {
    const wanted = new Map(
      taskData.tags.filter((t) => t && t.trim()).map((t) => [t.trim().toUpperCase(), t.trim()])
    );
    for (const tag of current.tags) {
      if (!wanted.has(tag.name.trim().toUpperCase())) {
        await request('DELETE', `${TASKS}/${taskId}/tags/${tag.id}`);
      }
    }
    const have = new Set(current.tags.map((t) => t.name.trim().toUpperCase()));
    for (const [key, name] of wanted) {
      if (have.has(key)) continue;
      const tagId = await resolveTagId(name);
      await request('POST', `${TASKS}/${taskId}/tags`, { body: { tagId } });
    }
  }

  // 6. Attachments: anything without a known link id is new, anything missing is removed.
  if (taskData.attachments !== undefined) {
    const currentLinks = new Set(current.files.map((f) => f.linkId));
    const keep = new Set(taskData.attachments.map((a) => a.id));
    for (const f of current.files) {
      if (!keep.has(f.linkId)) {
        await request('DELETE', `/api/task-management/files/${f.linkId}`);
      }
    }
    for (const attachment of taskData.attachments) {
      if (!currentLinks.has(attachment.id)) {
        await uploadAttachment(taskId, attachment);
      }
    }
  }

  // 7. Recurrence schedule, through the RepetitiveTask endpoints.
  if (taskData.isRecurring !== undefined || taskData.recurringConfig !== undefined) {
    const wantsRecurrence = taskData.isRecurring ?? current.isRecurring;
    if (!wantsRecurrence) {
      if (current.recurrence) {
        await request('DELETE', `/api/task-management/repetitive-tasks/${current.recurrence.id}`);
      }
    } else if (taskData.recurringConfig) {
      const recurrence = toRecurrenceInput(taskData.recurringConfig, taskData.dueDate || current.dueDate);
      if (current.recurrence) {
        await request('PUT', `/api/task-management/repetitive-tasks/${current.recurrence.id}`, { body: { recurrence } });
      } else {
        await request('POST', '/api/task-management/repetitive-tasks', { body: { taskId, recurrence } });
      }
    }
  }

  return fetchTask(taskId);
}

export async function deleteTask(taskId: string): Promise<void> {
  await request('DELETE', `${TASKS}/${taskId}`);
}

// ---------------------------------------------------------------------------
// Comments & activity
// ---------------------------------------------------------------------------

export async function fetchTaskComments(taskId: string): Promise<TaskComment[]> {
  return fetchComments(taskId);
}

async function uploadCommentAttachment(commentId: string, attachment: Attachment): Promise<void> {
  const form = new FormData();
  form.append('file', dataUrlToBlob(attachment.dataUrl, attachment.type), attachment.name);
  await request<TaskFileDto>('POST', `/api/task-management/files/comments/${commentId}`, { form });
}

export async function createTaskComment(taskId: string, text: string, attachments: Attachment[] = []): Promise<TaskComment> {
  const created = await request<TaskCommentDto>('POST', `${TASKS}/${taskId}/comments`, { body: { text } });
  try {
    for (const attachment of attachments) {
      await uploadCommentAttachment(created.id, attachment);
    }
  } catch (err) {
    // A comment that lost its files would read as complete; remove it and report instead.
    await request('DELETE', `/api/task-management/comments/${created.id}`).catch(() => undefined);
    throw err;
  }

  if (attachments.length === 0) {
    return mapComment(created);
  }

  const saved = (await request<TaskCommentDto[]>('GET', `${TASKS}/${taskId}/comments`)).find((c) => c.id === created.id);
  return saved ? mapCommentWithFiles(saved) : mapComment(created);
}

/**
 * Saves an edited comment: its text, plus attachments added (uploaded) or removed (their links
 * deleted). Attachments that came from the server carry their link id as id.
 */
export async function updateTaskComment(
  commentId: string,
  text: string,
  attachments: Attachment[],
  previous: Attachment[]
): Promise<void> {
  await request<TaskCommentDto>('PUT', `/api/task-management/comments/${commentId}`, { body: { text } });

  const keep = new Set(attachments.map((a) => a.id));
  for (const old of previous) {
    if (!keep.has(old.id) && isGuid(old.id)) {
      await request('DELETE', `/api/task-management/files/${old.id}`);
    }
  }

  const had = new Set(previous.map((a) => a.id));
  for (const attachment of attachments) {
    if (!had.has(attachment.id)) {
      await uploadCommentAttachment(commentId, attachment);
    }
  }
}

export async function deleteTaskComment(commentId: string): Promise<void> {
  await request('DELETE', `/api/task-management/comments/${commentId}`);
}

export async function fetchTaskActivity(taskId: string): Promise<TaskLog[]> {
  return fetchActivity(taskId);
}

// ---------------------------------------------------------------------------
// Personal notes (owner comes from the token; no user id is sent)
// ---------------------------------------------------------------------------

const NOTES = '/api/task-management/notes';

export function listNotes(): Promise<NoteDto[]> {
  return request<NoteDto[]>('GET', NOTES);
}

export function getNote(id: string): Promise<NoteDto> {
  return request<NoteDto>('GET', `${NOTES}/${id}`);
}

export function createNote(body: { title: string; content: string; color: string | null; isPinned: boolean }): Promise<NoteDto> {
  return request<NoteDto>('POST', NOTES, { body });
}

export function updateNote(
  id: string,
  body: { title: string; content: string; color: string | null; isPinned: boolean }
): Promise<NoteDto> {
  return request<NoteDto>('PUT', `${NOTES}/${id}`, { body });
}

export async function deleteNote(id: string): Promise<void> {
  await request('DELETE', `${NOTES}/${id}`);
}


// ---------------------------------------------------------------------------
// Own account: password reset, profile, preferences (there is no self-registration)
// ---------------------------------------------------------------------------

function updateSessionUser(user: UserDto): void {
  const session = readSession();
  if (session) writeSession({ ...session, user });
}

/**
 * Emails a reset link to the account with this username or mobile number (to its email address,
 * if it has one). The answer is the same whether or not such an account exists.
 */
// ---------------------------------------------------------------------------
// Notifications stored by the server (the caller's own, in their own tenant)
// ---------------------------------------------------------------------------

export async function fetchMyNotifications(): Promise<ServerNotificationDto[]> {
  if (!readSession()) return [];
  return request<ServerNotificationDto[]>('GET', '/api/notifications', { query: { pageSize: 50 }, cache: 'no-store' });
}

export async function markNotificationRead(id: string): Promise<void> {
  await request('PUT', `/api/notifications/${requireGuid(id, 'اعلان')}/read`);
}

export async function markAllNotificationsRead(): Promise<void> {
  await request('PUT', '/api/notifications/read-all');
}

/**
 * Password recovery, step 1: the server sends a one-time code by SMS to the account's mobile
 * number. The answer is the same whether or not an account matches.
 */
export async function requestPasswordReset(identifier: string): Promise<{ message: string; codeLifetimeSeconds: number }> {
  return request('POST', '/api/identity/auth/forgot-password', {
    auth: false,
    retryOnUnauthorized: false,
    body: { identifier: identifier.trim(), tenantSlug: NEXUS_TENANT_SLUG || null },
  });
}

/**
 * Step 2: the server checks the code (only the server can) and answers with a short-lived token
 * for step 3. The token is kept in memory only, never stored.
 */
export async function verifyPasswordResetCode(identifier: string, code: string): Promise<string> {
  const result = await request<{ resetToken: string; expiresAtUtc: string }>('POST', '/api/identity/auth/forgot-password/verify', {
    auth: false,
    retryOnUnauthorized: false,
    body: { identifier: identifier.trim(), code: code.trim(), tenantSlug: NEXUS_TENANT_SLUG || null },
  });
  return result.resetToken;
}

/** Step 3: the new password, with the token from step 2. */
export async function confirmPasswordReset(token: string, newPassword: string): Promise<void> {
  await request('POST', '/api/identity/auth/reset-password', {
    auth: false,
    retryOnUnauthorized: false,
    body: { token: token.trim(), newPassword },
  });
}

/** Fields left undefined keep their current value. */
export async function updateMyProfile(updates: {
  name?: string;
  /** Ignored: the username (national code) is changed only by an administrator. */
  username?: string;
  avatar?: string;
  phoneNumber?: string;
  notifySms?: boolean;
}): Promise<User> {
  const me = readSession()?.user;
  if (!me) throw new NexusApiError('کاربر وارد سیستم نشده است.', 401);

  const saved = await request<UserDto>('PUT', '/api/identity/auth/me/profile', {
    body: {
      displayName: (updates.name ?? me.displayName).trim() || me.displayName,
      avatarUrl: updates.avatar !== undefined ? updates.avatar || null : me.avatarUrl ?? null,
      phoneNumber: (updates.phoneNumber !== undefined ? updates.phoneNumber : me.phoneNumber)?.trim() || null,
      notifySms: updates.notifySms ?? me.notifySms ?? true,
    },
  });
  updateSessionUser(saved);
  return mapUserDto(saved);
}

export async function updateMyPreferences(settings: { theme?: string; colorPalette?: string; themeMode?: string }): Promise<void> {
  const me = readSession()?.user;
  if (!me) return;
  const saved = await request<UserDto>('PUT', '/api/identity/auth/me/preferences', {
    body: {
      theme: settings.theme ?? me.theme ?? null,
      colorPalette: settings.colorPalette ?? me.colorPalette ?? null,
      themeMode: settings.themeMode ?? me.themeMode ?? null,
    },
  });
  updateSessionUser(saved);
}

// ---------------------------------------------------------------------------
// Administration (Settings → User management, Login history, SMS panel, LDAP)
// ---------------------------------------------------------------------------

/** A user as the administration grid shows it. */
export interface AdminUser {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string;
  username: string;
  phoneNumber: string;
  email: string;
  isActive: boolean;
  isSystem: boolean;
  roles: string[];
  lastLoginAtUtc: string | null;
}

function toAdminUser(u: UserDto & { firstName?: string | null; lastName?: string | null; isSystem?: boolean }): AdminUser {
  return {
    id: u.id,
    firstName: u.firstName || '',
    lastName: u.lastName || '',
    displayName: u.displayName || '',
    username: u.username || '',
    phoneNumber: u.phoneNumber || '',
    email: u.email || '',
    isActive: u.isActive,
    isSystem: !!u.isSystem,
    roles: u.roles || [],
    lastLoginAtUtc: u.lastLoginAtUtc,
  };
}

/** Permission names of the signed-in user, as the server grants them (roles, direct, groups). */
/** The permissions saved with the session at the last /me answer, if it is this user's; no network call. */
export function getKnownPermissions(userId: string): string[] | null {
  const session = readSession();
  return session?.user?.id === userId && session.permissions ? session.permissions : null;
}

let permissionsInFlight: Promise<string[]> | null = null;

/** GET /me's permissions (callers asking at the same time share one request), saved with the session. */
export async function getMyPermissions(): Promise<string[]> {
  if (!readSession()) return [];
  if (permissionsInFlight) return permissionsInFlight;
  permissionsInFlight = request<CurrentUserResponse>('GET', '/api/identity/auth/me')
    .then((me) => {
      const permissions = me.permissions || [];
      const latest = readSession();
      if (latest && latest.user?.id === me.user.id) writeSession({ ...latest, permissions });
      return permissions;
    })
    .finally(() => { permissionsInFlight = null; });
  return permissionsInFlight;
}

/** Server-side search (every searchable column) and paging of the caller's tenant users. */
export async function listUsersPage(options: { page: number; pageSize: number; search?: string }): Promise<PagedResult<AdminUser>> {
  const page = await request<PagedResult<UserDto>>('GET', '/api/identity/users', {
    query: { pageNumber: options.page, pageSize: options.pageSize, search: options.search?.trim() || undefined },
  });
  return { ...page, items: (page.items || []).map(toAdminUser) };
}

export interface AdminUserInput {
  firstName: string;
  lastName: string;
  username: string;
  phoneNumber: string;
  email?: string;
  password?: string;
}

/** Creates an account (users.create). Username is the national code; the server checks everything again. */
export async function adminCreateUser(input: AdminUserInput, roleIds: string[]): Promise<AdminUser> {
  const created = await request<UserDto>('POST', '/api/identity/users', {
    body: {
      tenantId: getSessionTenantId(),
      username: input.username.trim(),
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      phoneNumber: input.phoneNumber.trim(),
      password: input.password || '',
      email: input.email?.trim() || null,
      isActive: true,
    },
  });
  if (roleIds.length > 0) {
    await request('PUT', `/api/identity/users/${created.id}/roles`, { body: { roleIds } });
  }
  return toAdminUser(created);
}

/** Edits an account (users.update). An empty password keeps the current one. */
export async function adminUpdateUser(user: AdminUser, input: AdminUserInput): Promise<AdminUser> {
  const saved = await request<UserDto>('PUT', `/api/identity/users/${requireGuid(user.id, 'کاربر')}`, {
    body: {
      displayName: `${input.firstName.trim()} ${input.lastName.trim()}`.trim() || user.displayName,
      isActive: user.isActive,
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      username: input.username.trim(),
      phoneNumber: input.phoneNumber.trim(),
      email: (input.email ?? '').trim(),
      password: input.password?.trim() || null,
    },
  });
  return toAdminUser(saved);
}

/** Enables or disables an account (users.change_status). */
export async function setUserActive(userId: string, isActive: boolean): Promise<AdminUser> {
  const saved = await request<UserDto>('PATCH', `/api/identity/users/${requireGuid(userId, 'کاربر')}/status`, { body: { isActive } });
  return toAdminUser(saved);
}

export interface AdminRole {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
}

export async function listRoles(): Promise<AdminRole[]> {
  return request<AdminRole[]>('GET', '/api/identity/roles', { query: { tenantId: getSessionTenantId() } });
}

export interface UserAccessEntry {
  permissionId: string;
  name: string;
  module: string;
  description: string;
  /** Direct assignment flag (API versions may expose this as isDirect). */
  grantedDirectly?: boolean;
  isDirect?: boolean;
  grantedByRole: boolean;
  grantingRoles: string[];
  grantedByGroup: boolean;
  grantingGroups: string[];
  /** Explicitly denied to this user: overrides roles, groups and direct grants. */
  deniedForUser?: boolean;
  /** Whether the user actually has it, as the server enforces it. */
  effective?: boolean;
  /** Effective only because another permission of the user needs it. */
  grantedAsPrerequisite?: boolean;
}

export interface UserAccess {
  userId: string;
  displayName: string;
  roles: string[];
  permissions: UserAccessEntry[];
}

/** Every permission of the user: where it comes from (direct, role, group), whether it is denied and whether it is in effect. */
export async function getUserAccess(userId: string): Promise<UserAccess> {
  return request<UserAccess>('GET', `/api/identity/users/${requireGuid(userId, 'کاربر')}/permissions`);
}

export async function setUserRoles(userId: string, roleIds: string[]): Promise<void> {
  await request('PUT', `/api/identity/users/${requireGuid(userId, 'کاربر')}/roles`, { body: { roleIds } });
}

/** Replaces the user's direct grants and explicit denials (a denial wins over roles and groups). */
export async function setUserDirectPermissions(userId: string, permissionIds: string[], deniedPermissionIds: string[]): Promise<void> {
  await request('PUT', `/api/identity/users/${requireGuid(userId, 'کاربر')}/permissions`, { body: { permissionIds, deniedPermissionIds } });
}

export interface LoginHistoryEntry {
  id: string;
  action: string;
  details: string | null;
  ipAddress: string | null;
  occurredAtUtc: string;
  userDisplayName: string | null;
  username: string | null;
}

/** Sign-in history: the audit log's identity.login* entries (success, failure, blocked). */
export async function listLoginHistory(options: { page: number; pageSize: number; search?: string; newestFirst: boolean }): Promise<PagedResult<LoginHistoryEntry>> {
  return request<PagedResult<LoginHistoryEntry>>('GET', '/api/platform/audit-logs', {
    query: {
      action: 'identity.login',
      pageNumber: options.page,
      pageSize: options.pageSize,
      search: options.search?.trim() || undefined,
      sort: options.newestFirst ? 'desc' : 'asc',
    },
  });
}

// ---- Upload policy (max file size + accepted types, everywhere a file can be uploaded) -----

export interface UploadPolicy {
  maxFileSizeKb: number;
  allowedExtensions: string[];
}

/** The current admin-configured upload limit; falls back to the 200 KB default on any error. */
export async function fetchUploadPolicy(): Promise<UploadPolicy> {
  try {
    return await request<UploadPolicy>('GET', '/api/platform/upload-policy');
  } catch {
    return { maxFileSizeKb: 200, allowedExtensions: ['.xlsx', '.xls', '.doc', '.docx', '.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'] };
  }
}

/** Admin-only: changes the system-wide max upload size (settings.update). */
export async function updateMaxUploadSizeKb(maxFileSizeKb: number): Promise<void> {
  await request<unknown>('PUT', '/api/platform/settings', {
    body: { tenantId: null, key: 'Uploads.MaxFileSizeKb', value: String(Math.max(1, Math.round(maxFileSizeKb))), scope: 'System' },
  });
}

// ---- SMS panel -------------------------------------------------------------

const CHANNELS = '/api/platform/notification-channels';

export interface SmsPanelSettings {
  enabled: boolean;
  provider: string;
  apiUrl: string;
  /** Write-only: empty keeps the stored key. Never filled from the server. */
  apiKey: string;
  /** Write-only: empty keeps the stored value. Never filled from the server. */
  username: string;
  /** Write-only: empty keeps the stored value. Never filled from the server. */
  password: string;
  lineNumber: string;
  apiKeyConfigured: boolean;
  usernameConfigured: boolean;
  passwordConfigured: boolean;
  providers: SmsProviderConfiguration[];
}

export interface SmsProviderConfiguration {
  id: string;
  name: string;
  provider: string;
  enabled: boolean;
  apiUrl: string;
  apiKey: string;
  lineNumber: string;
  username: string;
  password: string;
  apiKeyConfigured: boolean;
  usernameConfigured: boolean;
  passwordConfigured: boolean;
}

export interface SmsProviderOption { key: string; displayName: string; defaultBaseUrl: string; }

export interface SmsTemplate {
  key: string;
  title: string;
  text: string;
  placeholders: string[];
  /** When it is sent; from the server's template catalog. */
  description?: string | null;
  /** Placeholders the text must keep, e.g. {Code}. */
  requiredPlaceholders?: string[] | null;
  defaultText?: string | null;
  /** Whether this SMS is sent at all (an older server always sends it). */
  enabled?: boolean;
  /** False for an SMS that can never be turned off, such as the password-reset code. */
  canDisable?: boolean;
}

export async function getSmsProviders(): Promise<SmsProviderOption[]> {
  return request<SmsProviderOption[]>('GET', `${CHANNELS}/providers`);
}

export async function getSmsPanelSettings(): Promise<SmsPanelSettings> {
  const s = await request<{ sms: any }>('GET', CHANNELS);
  const toProvider = (item: any, fallbackId: string): SmsProviderConfiguration => ({
    id: item?.id || fallbackId,
    name: item?.name || (item?.provider === 'kavenegar' ? 'کاوه‌نگار' : 'سرویس‌دهنده پیامک'),
    provider: item?.provider || 'kavenegar',
    enabled: !!item?.enabled,
    apiUrl: item?.apiUrl || '',
    apiKey: '',
    lineNumber: item?.lineNumber || '',
    username: '',
    password: '',
    apiKeyConfigured: !!item?.apiKeyConfigured,
    usernameConfigured: !!item?.usernameConfigured,
    passwordConfigured: !!item?.passwordConfigured,
  });
  const savedProviders = Array.isArray(s.sms?.providers)
    ? s.sms.providers.map((item: any, index: number) => toProvider(item, `provider-${index}`))
    : [toProvider(s.sms, '00000000-0000-0000-0000-000000000001')];
  return {
    enabled: !!s.sms?.enabled,
    provider: s.sms?.provider || 'kavenegar',
    apiUrl: s.sms?.apiUrl || '',
    apiKey: '',
    username: '',
    password: '',
    lineNumber: s.sms?.lineNumber || '',
    apiKeyConfigured: !!s.sms?.apiKeyConfigured,
    usernameConfigured: !!s.sms?.usernameConfigured,
    passwordConfigured: !!s.sms?.passwordConfigured,
    providers: savedProviders,
  };
}

export async function saveSmsPanelSettings(settings: SmsPanelSettings): Promise<SmsPanelSettings> {
  await request<{ sms: any }>('PUT', CHANNELS, {
    body: {
      sms: {
        enabled: settings.enabled,
        provider: settings.provider,
        apiUrl: settings.apiUrl.trim() || null,
        apiKey: settings.apiKey.trim() || null,
        username: settings.username.trim() || null,
        password: settings.password || null,
        lineNumber: settings.lineNumber.trim() || null,
        providers: settings.providers.map((provider) => ({
          id: provider.id,
          name: provider.name.trim(),
          provider: provider.provider,
          enabled: provider.enabled,
          apiUrl: provider.apiUrl.trim() || null,
          apiKey: provider.apiKey.trim() || null,
          username: provider.username.trim() || null,
          password: provider.password || null,
          lineNumber: provider.lineNumber.trim() || null,
        })),
      },
    },
  });
  return getSmsPanelSettings();
}

export async function sendTestSms(phoneNumber: string, message?: string): Promise<{ success: boolean; message: string }> {
  return request('POST', `${CHANNELS}/test-sms`, { body: { phoneNumber, message: message || null } });
}

export async function getSmsTemplates(): Promise<SmsTemplate[]> {
  return request<SmsTemplate[]>('GET', `${CHANNELS}/templates`);
}

export async function saveSmsTemplates(templates: { key: string; text: string; enabled?: boolean }[]): Promise<SmsTemplate[]> {
  return request<SmsTemplate[]>('PUT', `${CHANNELS}/templates`, { body: { templates } });
}

/** The hours no notification SMS is sent; messages that fall in them wait until they end. */
export interface SmsQuietHours {
  enabled: boolean;
  /** HH:mm, e.g. 22:00. */
  start: string;
  end: string;
}

/** Null when the server has no quiet hours (an older version). */
export async function getSmsQuietHours(): Promise<SmsQuietHours | null> {
  try {
    return await request<SmsQuietHours>('GET', `${CHANNELS}/quiet-hours`);
  } catch (err) {
    if (err instanceof NexusApiError && (err.httpStatus === 404 || err.httpStatus === 405)) return null;
    throw err;
  }
}

export async function saveSmsQuietHours(value: SmsQuietHours): Promise<SmsQuietHours> {
  return request<SmsQuietHours>('PUT', `${CHANNELS}/quiet-hours`, { body: value });
}

/** When tasks are reminded of, per organization. */
export interface TaskReminderSettings {
  dueSoonEnabled: boolean;
  /** How long before a due time the "due soon" reminder goes. */
  dueSoonHoursBefore: number;
  /** Tasks with a date only: the hour of the day before ("due soon") and of the day after ("overdue"). */
  morningHour: number;
  overdueEnabled: boolean;
  recurringSoonEnabled: boolean;
  /** How long before each occurrence of a recurring task. */
  recurringSoonMinutesBefore: number;
}

/**
 * Null when the server does not remind of tasks (an older version). Its presence also means the
 * server stores task notifications (comments, changes) itself.
 */
export async function getTaskReminderSettings(): Promise<TaskReminderSettings | null> {
  try {
    return await request<TaskReminderSettings>('GET', '/api/task-management/reminder-settings');
  } catch (err) {
    if (err instanceof NexusApiError && (err.httpStatus === 404 || err.httpStatus === 405)) return null;
    throw err;
  }
}

/** Whom the signed-in user may not make responsible for a task. */
/**
 * limited: by level (own level and below). allowedUserIds: where everyone is kept to their own
 * company, the only people one may choose (null/absent: not kept).
 */
export interface AssignmentLimit { limited: boolean; blockedUserIds: string[]; allowedUserIds?: string[] | null }

/** Null on a server that does not limit it (an older version). The server checks again on saving. */
/** Where tasks are given to posts: the posts to choose from. enabled false (or null): give them to people. */
export interface AssignablePost { postId: string; title: string; code: string; place: string; holderUserId: string | null; holderName: string | null; blocked: boolean }
export interface AssignablePosts { enabled: boolean; posts: AssignablePost[] }

export async function getAssignablePosts(): Promise<AssignablePosts | null> {
  try {
    return await request<AssignablePosts>('GET', '/api/task-management/assignable-posts');
  } catch (err) {
    if (err instanceof NexusApiError && (err.httpStatus === 404 || err.httpStatus === 405)) return null;
    throw err;
  }
}

export async function getAssignmentLimit(): Promise<AssignmentLimit | null> {
  try {
    return await request<AssignmentLimit>('GET', '/api/task-management/assignment-limit');
  } catch (err) {
    if (err instanceof NexusApiError && (err.httpStatus === 404 || err.httpStatus === 405)) return null;
    throw err;
  }
}

export async function saveTaskReminderSettings(value: TaskReminderSettings): Promise<TaskReminderSettings> {
  return request<TaskReminderSettings>('PUT', '/api/task-management/reminder-settings', { body: value });
}

// ---- LDAP ------------------------------------------------------------------

export interface LdapSettings {
  enabled: boolean;
  host: string;
  port: number;
  useSsl: boolean;
  useStartTls: boolean;
  domain: string;
  baseDn: string;
  bindUsername: string;
  /** Write-only: empty keeps the stored password. Never filled from the server. */
  bindPassword: string;
  userSearchBase: string;
  userFilter: string;
  connectionTimeoutSeconds: number;
  trustServerCertificate: boolean;
  bindPasswordConfigured: boolean;
}

export interface LdapTestResult { success: boolean; message: string; entriesFound: number | null; elapsedMilliseconds: number; }

function toLdapBody(s: LdapSettings) {
  const blank = (v: string) => (v.trim() ? v.trim() : null);
  return {
    enabled: s.enabled,
    host: blank(s.host),
    port: Number(s.port) || 389,
    useSsl: s.useSsl,
    useStartTls: s.useStartTls,
    domain: blank(s.domain),
    baseDn: blank(s.baseDn),
    bindUsername: blank(s.bindUsername),
    bindPassword: s.bindPassword || null,
    userSearchBase: blank(s.userSearchBase),
    userFilter: blank(s.userFilter),
    connectionTimeoutSeconds: Number(s.connectionTimeoutSeconds) || 10,
    trustServerCertificate: s.trustServerCertificate,
  };
}

function fromLdapDto(d: any): LdapSettings {
  return {
    enabled: !!d.enabled,
    host: d.host || '',
    port: d.port || 389,
    useSsl: !!d.useSsl,
    useStartTls: !!d.useStartTls,
    domain: d.domain || '',
    baseDn: d.baseDn || '',
    bindUsername: d.bindUsername || '',
    bindPassword: '',
    userSearchBase: d.userSearchBase || '',
    userFilter: d.userFilter || '',
    connectionTimeoutSeconds: d.connectionTimeoutSeconds || 10,
    trustServerCertificate: !!d.trustServerCertificate,
    bindPasswordConfigured: !!d.bindPasswordConfigured,
  };
}

export async function getLdapSettings(): Promise<LdapSettings> {
  return fromLdapDto(await request('GET', '/api/platform/ldap'));
}

export async function saveLdapSettings(settings: LdapSettings): Promise<LdapSettings> {
  return fromLdapDto(await request('PUT', '/api/platform/ldap', { body: toLdapBody(settings) }));
}

/** Tests the settings as entered (not saved); an empty password uses the stored one. */
export async function testLdapConnection(settings: LdapSettings): Promise<LdapTestResult> {
  return request<LdapTestResult>('POST', '/api/platform/ldap/test', { body: toLdapBody(settings) });
}

/** Changes the signed-in user's own password; the current one is required. */
export async function changeMyPassword(currentPassword: string, newPassword: string): Promise<void> {
  await request('PUT', '/api/identity/auth/me/password', { body: { currentPassword, newPassword } });
}

// ---------------------------------------------------------------------------
// Direct messages (chat)
// ---------------------------------------------------------------------------

interface DirectMessageDto {
  id: string;
  conversationId: string;
  senderUserId: string;
  receiverUserId: string;
  senderDisplayName: string;
  senderAvatarUrl: string | null;
  text: string;
  sentAtUtc: string;
  editedAtUtc: string | null;
  isRead: boolean;
  attachment: { fileName: string; contentType: string; sizeBytes: number } | null;
}

const CHAT = '/api/chat';

// The chat screen polls every few seconds; an attachment is downloaded once per message.
const attachmentUrls = new Map<string, Promise<string>>();

function attachmentUrlFor(messageId: string): Promise<string> {
  let url = attachmentUrls.get(messageId);
  if (!url) {
    url = request<Blob>('GET', `${CHAT}/messages/${messageId}/attachment`, { responseType: 'blob' })
      .then(toSafeBlob)
      .then((blob) => (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' && typeof window !== 'undefined'
        ? URL.createObjectURL(blob)
        : blobToDataUrl(blob)))
      .catch((err) => {
        attachmentUrls.delete(messageId);
        console.warn('Chat attachment could not be downloaded:', err instanceof Error ? err.message : err);
        return '';
      });
    attachmentUrls.set(messageId, url);
  }
  return url;
}

async function mapDirectMessage(m: DirectMessageDto): Promise<DirectMessage> {
  return {
    id: m.id,
    senderId: m.senderUserId,
    senderName: m.senderDisplayName || 'کاربر',
    senderAvatar: normalizeAvatar(m.senderAvatarUrl),
    receiverId: m.receiverUserId,
    text: m.text,
    attachmentUrl: m.attachment ? (await attachmentUrlFor(m.id)) || undefined : undefined,
    attachmentName: m.attachment?.fileName,
    isRead: m.isRead,
    createdAt: m.sentAtUtc,
  };
}

export async function fetchDirectMessages(partnerId: string): Promise<DirectMessage[]> {
  if (!readSession() || !isGuid(partnerId)) return [];
  const messages = await request<DirectMessageDto[]>('GET', `${CHAT}/direct/${partnerId}/messages`);
  return Promise.all((messages || []).map(mapDirectMessage));
}

/** The sender is the signed-in user; the server takes it from the token. */
export async function sendDirectMessage(msg: {
  receiverId: string;
  text: string;
  attachmentUrl?: string;
  attachmentName?: string;
}): Promise<DirectMessage> {
  const form = new FormData();
  form.append('text', msg.text || '');
  if (msg.attachmentUrl) {
    const blob = dataUrlToBlob(msg.attachmentUrl, 'application/octet-stream');
    form.append('file', blob, msg.attachmentName || 'attachment');
  }

  const sent = await request<DirectMessageDto>('POST', `${CHAT}/direct/${requireGuid(msg.receiverId, 'گیرنده')}/messages`, { form });
  if (msg.attachmentUrl) {
    // The sender already has the file; no need to download it back.
    attachmentUrls.set(sent.id, Promise.resolve(msg.attachmentUrl));
  }
  return mapDirectMessage(sent);
}

/** Marks everything the sender sent to the signed-in user as read. */
export async function markDirectMessagesRead(senderId: string): Promise<void> {
  if (!readSession() || !isGuid(senderId)) return;
  await request('POST', `${CHAT}/direct/${senderId}/read`);
}

export async function updateDirectMessage(messageId: string, text: string): Promise<void> {
  await request('PUT', `${CHAT}/messages/${messageId}`, { body: { text } });
}

export async function deleteDirectMessage(messageId: string): Promise<void> {
  await request('DELETE', `${CHAT}/messages/${messageId}`);
}

export async function fetchUnreadMessageCounts(): Promise<Record<string, number>> {
  if (!readSession()) return {};
  const counts = await request<{ senderUserId: string; count: number }[]>('GET', `${CHAT}/direct/unread-counts`);
  return Object.fromEntries((counts || []).map((c) => [c.senderUserId, c.count]));
}

// ---- Team conversations: one shared thread per team -------------------------

interface TeamMessageDto {
  id: string;
  conversationId: string;
  teamId: string;
  senderUserId: string;
  senderDisplayName: string;
  senderAvatarUrl: string | null;
  text: string;
  sentAtUtc: string;
  editedAtUtc: string | null;
  attachment: { fileName: string; contentType: string; sizeBytes: number } | null;
}

/** A team message in the same shape as a direct one; receiverId is the team's id. */
async function mapTeamMessage(m: TeamMessageDto): Promise<DirectMessage> {
  return {
    id: m.id,
    senderId: m.senderUserId,
    senderName: m.senderDisplayName || 'کاربر',
    senderAvatar: normalizeAvatar(m.senderAvatarUrl),
    receiverId: m.teamId,
    text: m.text,
    attachmentUrl: m.attachment ? (await attachmentUrlFor(m.id)) || undefined : undefined,
    attachmentName: m.attachment?.fileName,
    isRead: true,
    createdAt: m.sentAtUtc,
  };
}

export async function fetchTeamMessages(teamId: string): Promise<DirectMessage[]> {
  if (!readSession() || !isGuid(teamId)) return [];
  const messages = await request<TeamMessageDto[]>('GET', `${CHAT}/teams/${teamId}/messages`);
  return Promise.all((messages || []).map(mapTeamMessage));
}

/** Sends to the team's shared thread; the sender is the signed-in user (from the token). */
export async function sendTeamMessage(teamId: string, msg: { text: string; attachmentUrl?: string; attachmentName?: string }): Promise<DirectMessage> {
  const form = new FormData();
  form.append('text', msg.text || '');
  if (msg.attachmentUrl) {
    form.append('file', dataUrlToBlob(msg.attachmentUrl, 'application/octet-stream'), msg.attachmentName || 'attachment');
  }
  const sent = await request<TeamMessageDto>('POST', `${CHAT}/teams/${requireGuid(teamId, 'تیم')}/messages`, { form });
  if (msg.attachmentUrl) attachmentUrls.set(sent.id, Promise.resolve(msg.attachmentUrl));
  return mapTeamMessage(sent);
}

export async function markTeamMessagesRead(teamId: string): Promise<void> {
  if (!readSession() || !isGuid(teamId)) return;
  await request('POST', `${CHAT}/teams/${teamId}/read`);
}

/** Unread messages per team thread: { teamId: count }. */
export async function fetchTeamUnreadCounts(): Promise<Record<string, number>> {
  if (!readSession()) return {};
  const counts = await request<{ teamId: string; count: number }[]>('GET', `${CHAT}/teams/unread-counts`);
  return Object.fromEntries((counts || []).map((c) => [c.teamId, c.count]));
}

// ---- Presence ---------------------------------------------------------------

/**
 * Online (true) or offline (false) for users of the signed-in user's organization, from their
 * live connections on the server. Users the server does not report (another organization) are
 * left out - unknown, never shown as online.
 */
export async function fetchPresence(userIds: string[]): Promise<Record<string, boolean>> {
  const ids = Array.from(new Set(userIds.filter((id) => isGuid(id)))).slice(0, 200);
  if (!readSession() || ids.length === 0) return {};
  const query = ids.map((id) => `userIds=${encodeURIComponent(id)}`).join('&');
  const presence = await request<{ userId: string; isOnline: boolean }[]>('GET', `/api/identity/presence?${query}`);
  return Object.fromEntries((presence || []).map((p) => [p.userId, p.isOnline]));
}

// ---------------------------------------------------------------------------
// Task history entries written by the UI
// ---------------------------------------------------------------------------

/** Adds an entry to the task's history; the server records it under the signed-in user. */
export async function addTaskActivityEntry(taskId: string, action: string, details?: string): Promise<void> {
  await request('POST', `${TASKS}/${requireGuid(taskId, 'فعالیت')}/activity`, {
    body: { action: action.slice(0, 120), details: details ? details.slice(0, 2000) : null },
  });
}

// ---------------------------------------------------------------------------
// Live updates (SignalR hub of the TaskManagement module)
// ---------------------------------------------------------------------------

const taskChangeListeners = new Set<() => void>();
let taskHub: HubConnection | null = null;
/** Whose connection taskHub is: never reused for someone else signing in. */
let taskHubUserId: string | null = null;
let taskHubStopTimer: ReturnType<typeof setTimeout> | null = null;
let taskHubRetryTimer: ReturnType<typeof setTimeout> | null = null;
let taskHubRetryDelay = 15_000;
let changeTimer: ReturnType<typeof setTimeout> | null = null;

async function hubAccessToken(): Promise<string> {
  const session = readSession();
  if (!session) return '';
  // A token that is about to expire would get the connection rejected; renew it first.
  if (new Date(session.accessTokenExpiresAtUtc).getTime() - Date.now() < 30_000) {
    await refreshSession();
  }
  return readSession()?.accessToken || '';
}

function notifyTaskChange(): void {
  // Several writes in a row (a form save touches many endpoints) become one reload.
  if (changeTimer) clearTimeout(changeTimer);
  changeTimer = setTimeout(() => {
    changeTimer = null;
    taskChangeListeners.forEach((listener) => listener());
  }, 400);
}

/**
 * Calls onChange whenever tasks, subtasks, comments, files, tags or schedules change anywhere
 * in the tenant - whenever tasks change.
 */
export function subscribeToTaskChanges(onChange: () => void): () => void {
  const session = readSession();
  if (!session) return () => {};

  taskChangeListeners.add(onChange);
  // A stop asked for a moment ago (the screen re-subscribing) is called off - for the same user only.
  if (taskHubStopTimer) {
    clearTimeout(taskHubStopTimer);
    taskHubStopTimer = null;
  }
  if (taskHub && taskHubUserId !== session.user.id) stopTaskHub();
  if (!taskHub) startTaskHub(session.user.id);

  return () => {
    taskChangeListeners.delete(onChange);
    if (taskChangeListeners.size === 0 && taskHub && !taskHubStopTimer) {
      // Stopping while the connection is still being negotiated logs an error and wastes it when
      // the screen subscribes again right away (re-render, StrictMode), so the stop waits a moment.
      taskHubStopTimer = setTimeout(() => {
        taskHubStopTimer = null;
        if (taskChangeListeners.size === 0) stopTaskHub();
      }, 1_500);
    }
  };
}

function startTaskHub(userId: string): void {
  const hub = new HubConnectionBuilder()
    // The token travels as access_token; no cookies are needed. With credentials the browser's
    // negotiate request is refused by the API's CORS policy and live updates never connect.
    .withUrl(`${NEXUS_SIGNALR_BASE_URL}/hubs/task-management`, { accessTokenFactory: hubAccessToken, withCredentials: false })
    .withAutomaticReconnect()
    // The library's own console errors (a dropped or refused connection) are expected and handled
    // here: one warning, then a retry while anyone is still listening.
    .configureLogging(LogLevel.None)
    .build();
  hub.on('TasksChanged', notifyTaskChange);
  hub.onreconnected(() => {
    taskHubRetryDelay = 15_000;
    notifyTaskChange(); // changes made while disconnected
  });
  hub.onclose(() => {
    // Automatic reconnecting gave up (or the server closed it): try again later, while needed.
    if (taskHub === hub && taskChangeListeners.size > 0) scheduleTaskHubRetry(hub);
  });
  taskHub = hub;
  taskHubUserId = userId;
  hub.start()
    .then(() => { taskHubRetryDelay = 15_000; })
    .catch((err) => {
      console.warn('Live task updates are unavailable for now; retrying.', err instanceof Error ? err.message : err);
      if (taskHub === hub) scheduleTaskHubRetry(hub);
    });
}

function scheduleTaskHubRetry(hub: HubConnection): void {
  if (taskHubRetryTimer) return;
  taskHubRetryTimer = setTimeout(() => {
    taskHubRetryTimer = null;
    if (taskHub !== hub || taskChangeListeners.size === 0) return;
    const session = readSession();
    if (!session) return;
    taskHub = null;
    startTaskHub(session.user.id);
    notifyTaskChange(); // catch up on what changed meanwhile
  }, taskHubRetryDelay);
  taskHubRetryDelay = Math.min(taskHubRetryDelay * 2, 120_000);
}

function stopTaskHub(): void {
  const hub = taskHub;
  taskHub = null;
  taskHubUserId = null;
  if (taskHubRetryTimer) {
    clearTimeout(taskHubRetryTimer);
    taskHubRetryTimer = null;
  }
  hub?.stop().catch(() => undefined);
}
