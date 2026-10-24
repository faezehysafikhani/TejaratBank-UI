// What the signed-in user may do, from the permissions the server grants them (GET /auth/me:
// roles, direct grants and groups). The UI only hides what would be refused anyway - the server
// checks every request itself, so this is never the security boundary.
import type { User } from '../types';
import type { ActiveTab } from '../components/SandwichBar';
import type { UserAccessEntry } from '../services/nexusApi';

export const PERMISSIONS = {
  tasksView: 'Tasks.View',
  tasksCreate: 'Tasks.Create',
  tasksEdit: 'Tasks.Edit',
  tasksDelete: 'Tasks.Delete',
  tasksComment: 'Tasks.Comment',
  tasksUploadFiles: 'Tasks.UploadFiles',
  tasksManageAll: 'Tasks.ManageAll',
  notesManage: 'Notes.Manage',
} as const;

/**
 * True when the user holds the permission. While the permissions are not known yet (signed out,
 * or before the first /me answer) nothing is hidden: the server still refuses what is not allowed.
 */
export function can(user: User | null | undefined, permission: string): boolean {
  if (!user || !user.permissions) return true;
  return user.permissions.includes(permission);
}

/** The work-team permissions: see the «مدیریت تیم کاری» section, and build or manage teams in it. */
export const WORK_TEAM_PERMISSIONS = { view: 'groups.view_own', manage: 'groups.manage_own' } as const;

/**
 * Whether the «مدیریت تیم کاری» section is shown at all. Unlike `can`, unknown permissions hide
 * it: nobody without one of the two permissions should see it. Managing teams implies seeing them.
 */
export function canSeeWorkTeams(permissions: Iterable<string> | null | undefined): boolean {
  if (!permissions) return false;
  const held = new Set(permissions);
  return held.has(WORK_TEAM_PERMISSIONS.view) || held.has(WORK_TEAM_PERMISSIONS.manage);
}

/** Whether the user may build work teams and change their own teams' members (the server checks too). */
export function canManageWorkTeams(permissions: Iterable<string> | null | undefined): boolean {
  return !!permissions && new Set(permissions).has(WORK_TEAM_PERMISSIONS.manage);
}

/** Manages every task of the organization (and is treated as the UI's task administrator). */
export function isTaskAdmin(user: User | null | undefined): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return !!user.permissions?.includes(PERMISSIONS.tasksManageAll);
}

const TAB_PERMISSION: Partial<Record<ActiveTab, string>> = {
  kanban: PERMISSIONS.tasksView,
  calendar: PERMISSIONS.tasksView,
  matrix: PERMISSIONS.tasksView,
  overdue: PERMISSIONS.tasksView,
  notes: PERMISSIONS.notesManage,
  reports: PERMISSIONS.tasksView,
};

/** Whether a section (menu entry and page) is available to the user. Chat and settings always are. */
export function canOpenTab(user: User | null | undefined, tab: ActiveTab): boolean {
  const permission = TAB_PERMISSION[tab];
  return !permission || can(user, permission);
}

/** The first section the user may open, for when the current one is not allowed. */
export function firstAllowedTab(user: User | null | undefined): ActiveTab {
  const order: ActiveTab[] = ['kanban', 'calendar', 'overdue', 'notes', 'chat', 'settings'];
  return order.find((tab) => canOpenTab(user, tab)) || 'settings';
}

/**
 * One permission on the user access page, as the server will apply it after saving: the user
 * has it unless it is denied to them, when it is granted directly, by a role or group, or needed
 * by another permission they have. `direct` and `denied` are the page's current (unsaved) choices.
 */
export function accessIsEffective(entry: UserAccessEntry, direct: ReadonlySet<string>, denied: ReadonlySet<string>): boolean {
  if (denied.has(entry.permissionId)) return false;
  return direct.has(entry.permissionId) || entry.grantedByRole || entry.grantedByGroup || !!entry.grantedAsPrerequisite;
}

/**
 * Turning a permission on or off for this user. Off: the direct grant goes, and if a role, a
 * group or another permission would still give it, it is denied to the user. On: a denial goes,
 * and it is granted directly only when nothing else gives it.
 */
export function toggleUserAccess(
  entry: UserAccessEntry,
  enable: boolean,
  direct: ReadonlySet<string>,
  denied: ReadonlySet<string>,
): { direct: Set<string>; denied: Set<string> } {
  const nextDirect = new Set(direct);
  const nextDenied = new Set(denied);
  const inherited = entry.grantedByRole || entry.grantedByGroup || !!entry.grantedAsPrerequisite;
  if (enable) {
    nextDenied.delete(entry.permissionId);
    if (!inherited) nextDirect.add(entry.permissionId);
  } else {
    nextDirect.delete(entry.permissionId);
    if (inherited) nextDenied.add(entry.permissionId);
  }
  return { direct: nextDirect, denied: nextDenied };
}

// Dependent permission -> the permissions it needs. The server holds the same table
// (PermissionPrerequisites.cs) and also saves these with an assignment; keep the two in step
// (scripts/check-permission-prerequisites.mjs compares this table with the agreed snapshot).
const PERMISSION_PREREQUISITES: Readonly<Record<string, readonly string[]>> = {
  // Identity
  'users.create': ['users.view'],
  'users.update': ['users.view'],
  'users.delete': ['users.view'],
  'users.change_status': ['users.view'],
  'users.assign_roles': ['users.view', 'roles.view'],
  'users.assign_permissions': ['users.view', 'permissions.view'],
  'roles.create': ['roles.view'],
  'roles.update': ['roles.view'],
  'roles.assign_permissions': ['roles.view', 'permissions.view'],
  'groups.create': ['groups.view'],
  'groups.update': ['groups.view'],
  'groups.delete': ['groups.view'],
  'groups.manage_members': ['groups.view', 'users.view'],
  'groups.assign_permissions': ['groups.view', 'permissions.view'],
  // A team is built from the user list, so the server asks for users.view here too.
  'groups.manage_own': ['groups.view_own', 'users.view'],
  // Organization
  'organization_units.create': ['organization_units.view'],
  'organization_units.update': ['organization_units.view'],
  'organization_units.delete': ['organization_units.view'],
  'org_structure.manage_companies': ['org_structure.view', 'users.view', 'users.update'],
  'org_structure.manage_positions': ['org_structure.view', 'users.view', 'users.update'],
  'org_structure.manage_assignments': ['org_structure.view', 'users.view', 'users.update'],
  'org_structure.manage_substitution': ['org_structure.view'],
  'org_structure.assign_tasks_any_level': ['org_structure.view'],
  'org_structure.team_members_any_unit': ['org_structure.view'],
  // Platform
  'settings.update': ['settings.view'],
  'sms_settings.update': ['sms_settings.view'],
  'sms_settings.test': ['sms_settings.view'],
  'ldap_settings.update': ['ldap_settings.view'],
  'ldap_settings.test': ['ldap_settings.view'],
  'tenants.create': ['tenants.view'],
  'tenants.manage_all': ['tenants.view'],
  // Tasks
  'Tasks.Create': ['Tasks.View'],
  'Tasks.Edit': ['Tasks.View'],
  'Tasks.Delete': ['Tasks.View'],
  'Tasks.Assign': ['Tasks.View'],
  'Tasks.Comment': ['Tasks.View'],
  'Tasks.UploadFiles': ['Tasks.View'],
  'Tasks.ManageAll': ['Tasks.View'],
  'Tasks.ManageRecurring': ['Tasks.View'],
  'Tasks.ManageTags': ['Tasks.View'],
  // Actions
  'Actions.Create': ['Actions.View'],
  'Actions.Edit': ['Actions.View'],
  'Actions.Delete': ['Actions.View'],
  'Actions.Submit': ['Actions.View'],
};

export function hasKnownPermissionDependents(permissionName: string): boolean {
  return Object.values(PERMISSION_PREREQUISITES).some((prerequisites) => prerequisites.includes(permissionName));
}

export function rolePermissionNames(
  rolePermissions: readonly string[],
  entries: readonly UserAccessEntry[],
): string[] {
  const permissionsById = new Map(entries.map((entry) => [entry.permissionId.toLowerCase(), entry.name]));
  const namesByLowercase = new Map(entries.map((entry) => [entry.name.toLowerCase(), entry.name]));
  return rolePermissions.map((permission) =>
    permissionsById.get(permission.toLowerCase())
      || namesByLowercase.get(permission.toLowerCase())
      || permission
  );
}

/**
 * Find an active permission that depends on this one. This includes direct/group grants, the
 * roles currently selected in the dialog, and prerequisites implied by those active permissions.
 */
export function enabledDependentForPrerequisite(
  prerequisite: UserAccessEntry,
  entries: readonly UserAccessEntry[],
  direct: ReadonlySet<string>,
  denied: ReadonlySet<string>,
  selectedRoleNames: ReadonlySet<string>,
  selectedRolePermissions: ReadonlySet<string>,
): UserAccessEntry | undefined {
  const enabledNames = new Set<string>();
  for (const entry of entries) {
    if (denied.has(entry.permissionId)) continue;
    const grantedBySelectedRole = selectedRolePermissions.has(entry.name)
      || selectedRolePermissions.has(entry.permissionId)
      || (entry.grantedByRole && (
        entry.grantingRoles.length === 0
        || entry.grantingRoles.some((roleName) => selectedRoleNames.has(roleName))
      ));
    if (direct.has(entry.permissionId) || entry.grantedByGroup || grantedBySelectedRole) {
      enabledNames.add(entry.name);
    }
  }

  const entriesByName = new Map(entries.map((entry) => [entry.name, entry]));
  const pending = [...enabledNames];
  while (pending.length > 0) {
    const enabledName = pending.pop()!;
    for (const prerequisiteName of PERMISSION_PREREQUISITES[enabledName] || []) {
      const entry = entriesByName.get(prerequisiteName);
      if (!entry || denied.has(entry.permissionId) || enabledNames.has(prerequisiteName)) continue;
      enabledNames.add(prerequisiteName);
      pending.push(prerequisiteName);
    }
  }

  return entries.find((entry) =>
    enabledNames.has(entry.name)
    && (PERMISSION_PREREQUISITES[entry.name] || []).includes(prerequisite.name)
  );
}

/**
 * Remove explicit denials for prerequisites of an enabled permission. The server grants the
 * prerequisite itself; this only prevents a stale denial from overriding that grant.
 */
export function clearPrerequisiteDenials(
  entry: UserAccessEntry,
  entries: readonly UserAccessEntry[],
  denied: ReadonlySet<string>,
): Set<string> {
  return clearPrerequisiteDenialsForPermissions([entry.name], entries, denied);
}

export function clearPrerequisiteDenialsForPermissions(
  permissionNames: Iterable<string>,
  entries: readonly UserAccessEntry[],
  denied: ReadonlySet<string>,
): Set<string> {
  const entriesByName = new Map(entries.map((permission) => [permission.name, permission]));
  const nextDenied = new Set(denied);
  const pending = [...permissionNames].flatMap((name) => PERMISSION_PREREQUISITES[name] || []);
  const visited = new Set<string>();

  while (pending.length > 0) {
    const prerequisiteName = pending.pop()!;
    if (visited.has(prerequisiteName)) continue;
    visited.add(prerequisiteName);

    const prerequisite = entriesByName.get(prerequisiteName);
    if (!prerequisite) continue;
    nextDenied.delete(prerequisite.permissionId);
    pending.push(...(PERMISSION_PREREQUISITES[prerequisite.name] || []));
  }

  return nextDenied;
}

export function preservePermissionPrerequisites(
  permissionNames: Iterable<string>,
  entries: readonly UserAccessEntry[],
  direct: ReadonlySet<string>,
  denied: ReadonlySet<string>,
): Set<string> {
  const entriesByName = new Map(entries.map((permission) => [permission.name, permission]));
  const nextDirect = new Set(direct);
  const pending = [...permissionNames].flatMap((name) => PERMISSION_PREREQUISITES[name] || []);
  const visited = new Set<string>();

  while (pending.length > 0) {
    const prerequisiteName = pending.pop()!;
    if (visited.has(prerequisiteName)) continue;
    visited.add(prerequisiteName);

    const prerequisite = entriesByName.get(prerequisiteName);
    if (!prerequisite) continue;
    if (
      !denied.has(prerequisite.permissionId)
      && !prerequisite.grantedByRole
      && !prerequisite.grantedByGroup
    ) {
      nextDirect.add(prerequisite.permissionId);
    }
    pending.push(...(PERMISSION_PREREQUISITES[prerequisite.name] || []));
  }

  return nextDirect;
}

/**
 * Keep currently effective prerequisites when their dependent permission is turned off.
 * Otherwise a prerequisite that was only implied would disappear from the user's access.
 */
export function preservePrerequisitesWhenDisabling(
  entry: UserAccessEntry,
  entries: readonly UserAccessEntry[],
  direct: ReadonlySet<string>,
  denied: ReadonlySet<string>,
): Set<string> {
  const entriesByName = new Map(entries.map((permission) => [permission.name, permission]));
  const nextDirect = new Set(direct);
  const pending = [...(PERMISSION_PREREQUISITES[entry.name] || [])];
  const visited = new Set<string>();

  while (pending.length > 0) {
    const prerequisiteName = pending.pop()!;
    if (visited.has(prerequisiteName)) continue;
    visited.add(prerequisiteName);

    const prerequisite = entriesByName.get(prerequisiteName);
    if (!prerequisite) continue;
    if (
      !denied.has(prerequisite.permissionId)
      && !prerequisite.grantedByRole
      && !prerequisite.grantedByGroup
      && (nextDirect.has(prerequisite.permissionId) || prerequisite.grantedAsPrerequisite)
    ) {
      nextDirect.add(prerequisite.permissionId);
    }
    pending.push(...(PERMISSION_PREREQUISITES[prerequisite.name] || []));
  }

  return nextDirect;
}

/**
 * Permissions left out of the access list because this product has no use for them. They are
 * hidden, not removed - whatever a user already holds of them is kept when their access is saved.
 */
const UNLISTED_PERMISSIONS = new Set([
  // Organisational user groups (granting permissions to a whole group): managed only through the
  // API here. Personal work teams (groups.view_own, groups.manage_own) are different and stay.
  'groups.view', 'groups.create', 'groups.update', 'groups.assign_permissions', 'groups.manage_members', 'groups.delete',
  // No screen for them: deleting users (they are deactivated instead), managing roles, tenants
  // (one organization).
  'users.delete', 'roles.create', 'roles.update', 'roles.assign_permissions',
  'tenants.view', 'tenants.create', 'tenants.manage_all',
  // Assigning happens through creating and editing a task (Tasks.Create / Tasks.Edit); the
  // endpoints that need this one are not used by this app.
  'Tasks.Assign',
  // Nothing in this app needs them alone; the permissions that do imply them
  // (users.assign_permissions, settings.update).
  'permissions.view', 'settings.view',
  // Organizational teams were replaced by the work teams; a database may still list it.
  'org_structure.manage_teams',
]);

/** Whether a permission is shown in the access list. */
export function isListedPermission(name: string): boolean {
  return !UNLISTED_PERMISSIONS.has(name);
}

/** Persian titles of the permission groups (the server sends module ids such as "TaskManagement"). */
const MODULE_TITLES: Record<string, string> = {
  Identity: 'کاربران، نقش‌ها، گروه‌ها و تیم‌های کاری',
  Platform: 'تنظیمات سامانه و سازمان‌ها',
  TaskManagement: 'مدیریت فعالیت‌ها',
  Ticketing: 'تیکت‌ها',
  Organization: 'ساختار سازمانی',
  Calendar: 'تقویم کاری',
  Workflow: 'گردش‌کار',
  Actions: 'اقدامات',
  Knowledge: 'مدیریت دانش',
  Strategy: 'راهبرد',
  ProjectManagement: 'پروژه‌ها',
  WaterfallPlanning: 'برنامه‌ریزی آبشاری',
  AgilePlanning: 'برنامه‌ریزی چابک',
  ProjectTeam: 'تیم پروژه',
  Deliverables: 'تحویل‌دادنی‌ها',
  Kpi: 'شاخص‌های کلیدی عملکرد',
  RiskManagement: 'مدیریت ریسک',
  StakeholderManagement: 'مدیریت ذی‌نفعان',
  ProgressManagement: 'گزارش پیشرفت',
  ProjectDocuments: 'مستندات پروژه',
  ProjectWorkflow: 'گردش‌کار پروژه',
  ProjectStrategyAlignment: 'هم‌راستایی پروژه و راهبرد',
  Portfolio: 'سبد پروژه‌ها',
  Reporting: 'گزارش‌ها و داشبورد',
};

export function moduleTitle(module: string): string {
  return MODULE_TITLES[module] || module;
}
