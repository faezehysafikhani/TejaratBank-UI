// Checks the permission dependency table in src/utils/permissions.ts against the agreed snapshot
// (the same table is tested on the server in NexusCore.Tests/Identity/PermissionPrerequisitesTests.cs).
// Run: node scripts/check-permission-prerequisites.mjs
import { readFileSync } from 'node:fs';

const expected = {
  'users.create': ['users.view'], 'users.update': ['users.view'], 'users.delete': ['users.view'],
  'users.change_status': ['users.view'], 'users.assign_roles': ['users.view', 'roles.view'],
  'users.assign_permissions': ['users.view', 'permissions.view'],
  'roles.create': ['roles.view'], 'roles.update': ['roles.view'],
  'roles.assign_permissions': ['roles.view', 'permissions.view'],
  'groups.create': ['groups.view'], 'groups.update': ['groups.view'], 'groups.delete': ['groups.view'],
  'groups.manage_members': ['groups.view', 'users.view'], 'groups.assign_permissions': ['groups.view', 'permissions.view'],
  'groups.manage_own': ['groups.view_own', 'users.view'],
  'organization_units.create': ['organization_units.view'], 'organization_units.update': ['organization_units.view'],
  'organization_units.delete': ['organization_units.view'],
  'org_structure.manage_companies': ['org_structure.view', 'users.view', 'users.update'],
  'org_structure.manage_positions': ['org_structure.view', 'users.view', 'users.update'],
  'org_structure.manage_assignments': ['org_structure.view', 'users.view', 'users.update'],
  'org_structure.manage_position_permissions': ['org_structure.view', 'permissions.view'],
  'org_structure.manage_substitution': ['org_structure.view'],
  'org_structure.assign_tasks_any_level': ['org_structure.view'],
  'org_structure.team_members_any_unit': ['org_structure.view'],
  'org_structure.node.view': ['org_structure.view'],
  'org_structure.node.create': ['org_structure.node.view'], 'org_structure.node.update': ['org_structure.node.view'],
  'org_structure.node.move': ['org_structure.node.view'], 'org_structure.node.deactivate': ['org_structure.node.view'],
  'org_structure.node.assign': ['org_structure.node.view', 'users.view'],
  'org_structure.manage_rules': ['org_structure.node.view'],
  'org_structure.manage_templates': ['org_structure.node.view'],
  'settings.update': ['settings.view'], 'sms_settings.update': ['sms_settings.view'], 'sms_settings.test': ['sms_settings.view'],
  'ldap_settings.update': ['ldap_settings.view'], 'ldap_settings.test': ['ldap_settings.view'],
  'sessions.view': ['users.view'], 'sessions.revoke': ['sessions.view'], 'sessions.revoke_all': ['sessions.view'],
  'tenants.create': ['tenants.view'], 'tenants.manage_all': ['tenants.view'],
  'Tasks.Create': ['Tasks.View'], 'Tasks.Edit': ['Tasks.View'], 'Tasks.Delete': ['Tasks.View'], 'Tasks.Assign': ['Tasks.View'],
  'Tasks.Comment': ['Tasks.View'], 'Tasks.UploadFiles': ['Tasks.View'], 'Tasks.ManageAll': ['Tasks.View'],
  'Tasks.ManageRecurring': ['Tasks.View'], 'Tasks.ManageTags': ['Tasks.View'],
};
const base = ['users.view', 'roles.view', 'permissions.view', 'groups.view', 'groups.view_own', 'org_structure.view',
  'organization_units.view', 'audit_logs.view', 'settings.view', 'sms_settings.view', 'ldap_settings.view',
  'sso_settings.view', 'tenants.view', 'Tasks.View', 'Notes.Manage', 'Actions.View'];

const source = readFileSync(new URL('../src/utils/permissions.ts', import.meta.url), 'utf8');
const block = source.match(/const PERMISSION_PREREQUISITES[^{]*\{([\s\S]*?)\n\};/);
if (!block) { console.error('PERMISSION_PREREQUISITES not found'); process.exit(1); }
const actual = {};
for (const m of block[1].matchAll(/'([^']+)':\s*\[([^\]]*)\]/g)) {
  actual[m[1]] = [...m[2].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

const problems = [];
for (const [permission, prerequisites] of Object.entries(expected)) {
  const have = actual[permission];
  if (!have) { problems.push(`${permission}: missing`); continue; }
  for (const p of prerequisites) if (!have.includes(p)) problems.push(`${permission}: missing prerequisite ${p}`);
}
for (const permission of base) if (actual[permission]) problems.push(`${permission}: a base permission must not have prerequisites`);
// Every prerequisite must itself be a base permission or have a row (so closure terminates meaningfully).
for (const [permission, prerequisites] of Object.entries(actual)) {
  for (const p of prerequisites) if (!base.includes(p) && !actual[p]) problems.push(`${permission}: prerequisite ${p} is not a known permission`);
}

if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
console.log(`permission prerequisites OK (${Object.keys(actual).length} entries)`);
