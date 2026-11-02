// Data of the «گزارشات کاربران» tab: every user of the organization, when and from where each last
// signed in, and each one's position and place in the organization chart. Each source is read on its
// own and may be missing (no permission, a product without the organization structure): the report
// then simply has no such column.
import { apiRequest, listUsersPage, NexusApiError, AdminUser } from './nexusApi';
import { listAssignments, UserAssignment } from './orgStructureApi';

export interface LastSignIn { userId: string; occurredAtUtc: string; ipAddress: string | null }

export interface UsersReportRow {
  id: string;
  name: string;
  /** The national code (the sign-in name). */
  nationalCode: string;
  isActive: boolean;
  lastLoginAtUtc: string | null;
  lastIp: string | null;
  /** The person's positions (the main one first). */
  positions: string[];
  /** Where they are in the chart: «company › unit», for each of their places. */
  places: string[];
}

export interface UsersReport {
  rows: UsersReportRow[];
  /** False: the caller may not read sign-in addresses; the column is left out. */
  hasAddresses: boolean;
  /** False: the product has no organization structure, or the caller may not read it. */
  hasStructure: boolean;
}

const optional = async <T,>(read: () => Promise<T>): Promise<T | null> => {
  try {
    return await read();
  } catch (err) {
    if (err instanceof NexusApiError && [401, 403, 404].includes(err.httpStatus)) return null;
    throw err;
  }
};

async function allUsers(): Promise<AdminUser[]> {
  const users: AdminUser[] = [];
  for (let page = 1; ; page++) {
    const result = await listUsersPage({ page, pageSize: 100 });
    users.push(...result.items);
    if (result.items.length === 0 || users.length >= result.totalCount) break;
  }
  return users;
}

const unique = (values: (string | null | undefined)[]) => Array.from(new Set(values.filter((v): v is string => !!v && v.trim().length > 0)));

export async function getUsersReport(): Promise<UsersReport> {
  const [users, signIns, assignments] = await Promise.all([
    allUsers(),
    optional(() => apiRequest<LastSignIn[]>('GET', '/api/platform/last-sign-ins', { cache: 'no-store' })),
    optional(() => listAssignments()),
  ]);
  const lastBy = new Map((signIns || []).map((s) => [s.userId, s]));
  const placeBy = new Map<string, UserAssignment>((assignments || []).map((a) => [a.userId, a]));
  const rows = users.map<UsersReportRow>((u) => {
    const a = placeBy.get(u.id);
    const last = lastBy.get(u.id);
    const held = a?.positions || [];
    return {
      id: u.id,
      name: u.displayName,
      nationalCode: u.username,
      isActive: u.isActive,
      // The sign-in log is the sharper source (it has the exact entry); the user's own field covers older data.
      lastLoginAtUtc: last?.occurredAtUtc || u.lastLoginAtUtc,
      lastIp: last?.ipAddress ?? null,
      positions: unique([a?.positionTitle, ...held.map((h) => h.title)]),
      places: unique([a ? [a.companyName, a.unitName].filter(Boolean).join(' › ') : null, ...held.map((h) => (a ? [a.companyName, h.unitName].filter(Boolean).join(' › ') : h.unitName))]),
    };
  });
  return { rows, hasAddresses: signIns !== null, hasStructure: assignments !== null };
}
