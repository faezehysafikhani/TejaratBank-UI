// Task reports (NexusCore's optional Nexus.Integrations.TaskReporting): the caller's own tasks plus
// every task of anyone below them in the organization structure. A backend without it answers
// 404 and the «گزارش فعالیت‌ها» page stays hidden (see getReportScope).
import { apiRequest, NexusApiError } from './nexusApi';
import type { TaskStatus } from '../types';

export type ReportPersonRole = 'responsible' | 'creator';
export type ReportTaskType = 'normal' | 'project' | 'recurring';

export interface ReportPerson { userId: string; displayName: string; positionTitle: string | null }

/**
 * One stretch of time someone was on a task through one of its posts (where tasks are given to
 * posts), with the position they had then. role «acting»: stand-in (جانشین) of its vacant post
 * (postTitle / postCode). toUtc null: still on it.
 */
export interface ReportPeriod {
  userId: string;
  displayName: string;
  role: 'creator' | 'responsible' | 'acting';
  positionTitle: string;
  postTitle: string;
  postCode: string;
  place: string;
  fromUtc: string;
  toUtc: string | null;
}

export interface ReportScopePerson extends ReportPerson { relation: 'self' | 'direct' | 'indirect' | 'all'; depth: number }

export interface ReportScope {
  seesAll: boolean;
  people: ReportScopePerson[];
  positions: { id: string; title: string }[];
  tags: string[];
}

export interface TaskReportFilters {
  personId?: string;
  personRole: ReportPersonRole;
  positionId?: string;
  tag?: string;
  type?: ReportTaskType;
  status?: TaskStatus;
  /** yyyy-MM-dd (Gregorian), inclusive */
  dueFrom?: string;
  dueTo?: string;
}

export interface TaskReportRow {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  type: ReportTaskType;
  priority: 'low' | 'medium' | 'high';
  dueDate: string;
  dueTime: string | null;
  isOverdue: boolean;
  createdAtUtc: string;
  completedAtUtc: string | null;
  owner: ReportPerson | null;
  responsible: ReportPerson[];
  tags: string[];
  /** False: the task is in the report only because its people are the caller's subordinates. */
  canOpen: boolean;
  /** Who was on the task when, oldest first (empty or missing where tasks are given to people). */
  history?: ReportPeriod[];
}

export interface TaskReportSummary {
  total: number;
  todo: number;
  inProgress: number;
  paused: number;
  completed: number;
  overdue: number;
  normal: number;
  project: number;
  recurring: number;
}

export interface TaskReport { summary: TaskReportSummary; rows: TaskReportRow[]; truncated: boolean }

/** Who the caller may report on; null when the backend has no task reports (the page stays hidden). */
export async function getReportScope(): Promise<ReportScope | null> {
  try {
    return await apiRequest<ReportScope>('GET', '/api/task-reports/scope');
  } catch (err) {
    if (err instanceof NexusApiError && err.httpStatus === 404) return null;
    throw err;
  }
}

export function getTaskReport(filters: TaskReportFilters): Promise<TaskReport> {
  return apiRequest<TaskReport>('GET', '/api/task-reports/tasks', {
    cache: 'no-store',
    query: {
      personId: filters.personId,
      personRole: filters.personId || filters.positionId ? filters.personRole : undefined,
      positionId: filters.positionId,
      tag: filters.tag,
      type: filters.type,
      statuses: filters.status,
      dueFrom: filters.dueFrom,
      dueTo: filters.dueTo,
    },
  });
}

export const REPORT_TYPE_TITLES: Record<ReportTaskType, string> = {
  normal: 'عادی',
  project: 'پروژه',
  recurring: 'تکرارشونده',
};
