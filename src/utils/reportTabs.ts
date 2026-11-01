import type { User } from '../types';
import type { ReportScope } from '../services/taskReportApi';
import { PERMISSIONS, can } from './permissions';

export type ReportTab = 'tasks' | 'meetings' | 'users';

/** Which of the three reports the user may open (the same rule the menu uses to show «گزارشات»). */
export function reportTabsFor(user: User | null | undefined, scope: ReportScope | null): Record<ReportTab, boolean> {
  return {
    tasks: scope !== null,
    meetings: can(user, PERMISSIONS.meetingsView),
    users: !!user?.permissions?.includes(PERMISSIONS.usersView),
  };
}
