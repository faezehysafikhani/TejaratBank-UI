// Organization structure: companies, the units (deputies) each owns, positions, and every
// user's company / unit / position / manager. Backed by NexusCore's optional Nexus.OrgStructure
// module and Nexus.Organization's units. A backend without the module answers 404, and the
// whole section stays hidden (see isOrgStructureAvailable).
import { apiRequest, getSessionTenantId, NexusApiError } from './nexusApi';

export interface PersonRef { userId: string; displayName: string; isActive: boolean; avatarUrl?: string | null }

export interface Company {
  id: string;
  name: string;
  code: string;
  description: string | null;
  manager: PersonRef | null;
  isActive: boolean;
  linkedUnitIds: string[];
  parentCompanyId?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  nationalId?: string | null;
  economicCode?: string | null;
  address?: string | null;
  /** What the chart calls the company's head; empty: «رئیس کل». */
  headTitle?: string | null;
  /** The logo's address (behind sign-in: read it with companyLogoUrl). */
  logoUrl?: string | null;
}

/** A company's optional details; saving replaces all of them (empty means none). */
export interface CompanyDetails {
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  nationalId?: string | null;
  economicCode?: string | null;
  address?: string | null;
  headTitle?: string | null;
}

/** The head is not chosen here: it is whoever holds the company's position with no superior. */
export interface CompanyInput { name: string; code: string; description?: string | null }

/**
 * A new company, optionally made from a structure template (a copy of its types, rules, positions and nodes).
 * code: empty makes one. unitIds: top deputies with no company yet, linked to the new one.
 */
export interface CompanyCreateInput {
  name: string;
  code?: string | null;
  description?: string | null;
  templateId?: string | null;
  parentCompanyId?: string | null;
  details?: CompanyDetails | null;
  unitIds?: string[];
}

export interface CompanyUnitLink { unitId: string; unitName: string; companyId: string; companyName: string }

/**
 * companyIds: the companies the position is for (given only there). In each company the one
 * position with no superior is the head's (رئیس کل).
 */
export interface Position { id: string; title: string; parentPositionId: string | null; isActive: boolean; companyIds?: string[] }

/** Positions for a company: those it is for. */
export const positionsForCompany = (positions: Position[], companyId: string) =>
  positions.filter((p) => (p.companyIds || []).includes(companyId));

export type ManagerSource = 'Explicit' | 'UnitManager' | 'CompanyManager' | 'PostSuperior';

export interface Manager { userId: string; displayName: string; isActive: boolean; source: ManagerSource }

export interface UserAssignment {
  userId: string;
  displayName: string;
  isUserActive: boolean;
  companyId: string;
  companyName: string;
  unitId: string | null;
  unitName: string | null;
  positionId: string | null;
  positionTitle: string | null;
  explicitManagerUserId: string | null;
  manager: Manager | null;
  /** Every deputy position the person holds, the main one first (absent on an older backend). */
  positions?: HeldPosition[];
}

/** One of a deputy's positions that someone holds. */
/** A post someone holds. unitId null: directly in the company (unitName is then the company's). */
export interface HeldPosition { unitPositionId: string; unitId: string | null; unitName: string; positionId: string; title: string; code?: string | null }

/**
 * unitPositionIds, when sent, is every deputy position the person holds (replacing the list);
 * without it, positionId is their main position in unitId and their other positions stay.
 */
export interface AssignmentInput {
  startDate?: string | null;
  endDate?: string | null;
  companyId: string;
  unitId: string | null;
  positionId: string | null;
  managerUserId: string | null;
  unitPositionIds?: string[];
}

/** A position a deputy has, in the deputy's order, with whoever holds it (none: vacant). */
/** A post: one person at most (holders). unitId null: directly in the company. */
export interface UnitPosition {
  id: string;
  unitId: string | null;
  unitName: string | null;
  positionId: string;
  title: string;
  sortOrder: number;
  isPositionActive: boolean;
  holders: PersonRef[];
  code?: string;
  companyId?: string;
  companyName?: string | null;
  /** The post above this one in its place (its holder manages this post's holder). */
  parentPostId?: string | null;
  /** The node's manager post (at most one per node): its holder is the node's manager. */
  isManagerPost?: boolean;
}

export interface Subordinate {
  userId: string;
  displayName: string;
  isActive: boolean;
  depth: number;
  managerUserId: string;
  companyName: string;
  unitName: string | null;
  positionTitle: string | null;
}

export interface MyPlacement { assignment: UserAssignment | null; managementChain: PersonRef[] }

export interface ChartMember {
  userId: string;
  displayName: string;
  isActive: boolean;
  positionTitle: string | null;
  managerUserId: string | null;
  avatarUrl?: string | null;
  positionId?: string | null;
}

/**
 * A work team (built by someone for their tasks and chat), shown under the unit of the person
 * who built it, with all its members - who may sit in other units, or in several teams.
 */
export interface ChartTeam { teamId: string; name: string; description: string | null; owner: PersonRef; members: ChartMember[] }

/** A deputy's position in the chart; no holders: vacant. */
/** A post in the chart: at most one holder; code unique in its company; isHead: the company head's post. */
export interface ChartPosition {
  unitPositionId: string;
  positionId: string;
  title: string;
  sortOrder: number;
  isActive: boolean;
  holders: ChartMember[];
  code?: string;
  isHead?: boolean;
  /** The post above this one in its place (its holder manages this post's holder). */
  parentPostId?: string | null;
}

/** «کارشناس · کد ۷»: a post's title with its code. */
export const postLabel = (post: { title: string; code?: string | null }) =>
  post.code ? `${post.title} · کد ${post.code.replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)])}` : post.title;

/** How much of the structure screens a company sees (hiding only): simple, normal or advanced. */
export type OrgUiLevel = 'simple' | 'normal' | 'advanced';

/** How a link is drawn in the chart. */
export type OrgLineStyle = 'solid' | 'dotted' | 'dashed';

/**
 * A node's type (معاونت، اداره کل، کمیته...): its colour and lucide icon name.
 * isDomainBoundary: the node starts its own domain («همان معاونت»); otherwise it belongs to the
 * domain of the nearest node above it that does.
 */
export interface ChartNodeType {
  nodeTypeId: string;
  name: string;
  color: string;
  icon: string;
  isDomainBoundary: boolean;
}

/**
 * A secondary link from this node to another (besides its main parent), e.g. a committee's dotted
 * line to the board. countsAsManager: the target's manager also counts as a manager (never for a
 * dotted line).
 */
export interface ChartLink {
  linkId: string;
  targetNodeId: string;
  linkTypeId: string;
  name: string;
  lineStyle: OrgLineStyle;
  countsAsManager: boolean;
}

/**
 * A node of the structure (a deputy, a general department, a committee...).
 * positions: the deputy's positions in its order, vacant ones too (absent on an older backend).
 * members: the deputy's people who hold none of its positions. teams: no longer shown.
 *
 * Nested structure (GET /chart v2; the new fields are optional, absent on an older backend):
 * `ChartCompany.units` are the company's top nodes, and `children` the nodes directly under each
 * node, nested, in their order (always empty on a flat structure). parentNodeId is the node above
 * (null: directly under the company), nodeType its type and links its secondary links.
 */
export interface ChartUnit {
  unitId: string;
  name: string;
  manager: PersonRef | null;
  members: ChartMember[];
  teams?: ChartTeam[];
  isActive?: boolean;
  peopleCount?: number;
  positions?: ChartPosition[];
  parentNodeId?: string | null;
  children?: ChartUnit[];
  nodeType?: ChartNodeType | null;
  links?: ChartLink[];
}

export interface ChartCompany {
  companyId: string;
  name: string;
  code: string;
  isActive: boolean;
  manager: PersonRef | null;
  members: ChartMember[];
  units: ChartUnit[];
  /** How many people the company has (its people in a deputy and those directly under it). */
  peopleCount?: number;
  /** Posts directly in the company (the head's first); absent on an older backend. */
  positions?: ChartPosition[];
  /** How much of the structure screens show for this company; absent: as today. */
  uiLevel?: OrgUiLevel;
  /** What the chart calls the company's head; empty: «رئیس کل». */
  headTitle?: string | null;
  logoUrl?: string | null;
}

/** What the company's head is called (its own title, or «رئیس کل»). */
export const headTitleOf = (company: { headTitle?: string | null } | null | undefined): string => company?.headTitle?.trim() || 'رئیس کل';

/** An organization unit (a deputy, a department...) from Nexus.Organization. */
export interface OrgUnit { id: string; name: string; managerUserId: string | null; isActive: boolean }

export interface OrgUnitInput { name: string; managerUserId: string | null; isActive: boolean }

const BASE = '/api/org-structure';

export const MANAGER_SOURCE_TITLES: Record<ManagerSource, string> = {
  Explicit: 'تعیین‌شده مستقیم',
  UnitManager: 'مدیر واحد',
  CompanyManager: 'رئیس کل شرکت',
  PostSuperior: 'پست مافوق',
};

export const ORG_STRUCTURE_PERMISSIONS = {
  view: 'org_structure.view',
  manageCompanies: 'org_structure.manage_companies',
  managePositions: 'org_structure.manage_positions',
  manageAssignments: 'org_structure.manage_assignments',
} as const;

/**
 * The nodes' own permissions (each operation on its own). The server also accepts the older
 * permission that covered the same thing, so the user's permission list can hold either: use
 * canNode() to ask.
 */
export const ORG_NODE_PERMISSIONS = {
  view: 'org_structure.node.view',
  create: 'org_structure.node.create',
  update: 'org_structure.node.update',
  move: 'org_structure.node.move',
  deactivate: 'org_structure.node.deactivate',
  assign: 'org_structure.node.assign',
  manageRules: 'org_structure.manage_rules',
  manageTemplates: 'org_structure.manage_templates',
} as const;

export type OrgNodeOperation = keyof typeof ORG_NODE_PERMISSIONS;

/** Which permissions let a user do each operation: its own, or the older one that covered it. */
const NODE_OPERATION_PERMISSIONS: Record<OrgNodeOperation, string[]> = {
  view: [ORG_NODE_PERMISSIONS.view, 'org_structure.view', 'org_structure.manage_companies', 'org_structure.manage_positions', 'org_structure.manage_assignments', 'organization_units.view'],
  create: [ORG_NODE_PERMISSIONS.create, 'organization_units.create'],
  update: [ORG_NODE_PERMISSIONS.update, 'organization_units.update'],
  move: [ORG_NODE_PERMISSIONS.move, 'org_structure.manage_companies'],
  deactivate: [ORG_NODE_PERMISSIONS.deactivate, 'organization_units.delete'],
  assign: [ORG_NODE_PERMISSIONS.assign, 'organization_units.update'],
  manageRules: [ORG_NODE_PERMISSIONS.manageRules],
  manageTemplates: [ORG_NODE_PERMISSIONS.manageTemplates],
};

/** Whether the user may do a node operation (hiding only: the server checks again). */
export const canNode = (can: (permission: string) => boolean, operation: OrgNodeOperation): boolean =>
  NODE_OPERATION_PERMISSIONS[operation].some(can);

export const ORG_UNIT_PERMISSIONS = {
  view: 'organization_units.view',
  create: 'organization_units.create',
  update: 'organization_units.update',
  delete: 'organization_units.delete',
} as const;

/** The signed-in user's place; also tells whether the backend has the module (null = it does not). */
export async function getMyPlacement(): Promise<MyPlacement | null> {
  try {
    return await apiRequest<MyPlacement>('GET', `${BASE}/me`);
  } catch (err) {
    if (err instanceof NexusApiError && err.httpStatus === 404) return null;
    throw err;
  }
}

/** Whether the backend has the organization-structure module (products without it answer 404). */
export async function isOrgStructureAvailable(): Promise<boolean> {
  return (await getMyPlacement()) !== null;
}

/** Where the last answer of isOrgStructureAvailable is kept for this user (see lookupCache). */
export const orgStructureLookupKey = (userId: string) => `${userId}:org-structure`;

export const getMySubordinates = (all: boolean) => apiRequest<Subordinate[]>('GET', `${BASE}/me/subordinates`, { query: { all } });

/** asOf (a date): only the nodes that exist on that day (a node's dates say when it exists; not where it sat then). */
export const getChart = (companyId?: string, asOf?: string) => apiRequest<ChartCompany[]>('GET', `${BASE}/chart`, { query: { companyId, asOf } });

export const listCompanies = () => apiRequest<Company[]>('GET', `${BASE}/companies`);
export const createCompany = (input: CompanyCreateInput) => apiRequest<Company>('POST', `${BASE}/companies`, { body: input });
export const updateCompany = (id: string, input: CompanyInput & { isActive: boolean }) =>
  apiRequest<Company>('PUT', `${BASE}/companies/${id}`, { body: input });
export const deleteCompany = (id: string) => apiRequest<void>('DELETE', `${BASE}/companies/${id}`);
export const setCompanyDetails = (id: string, details: CompanyDetails) =>
  apiRequest<Company>('PUT', `${BASE}/companies/${id}/details`, { body: details });
/** PNG, JPEG or WebP, at most 512 KB. */
export const setCompanyLogo = (id: string, file: File) => {
  const form = new FormData();
  form.append('logo', file);
  return apiRequest<Company>('PUT', `${BASE}/companies/${id}/logo`, { form });
};
export const removeCompanyLogo = (id: string) => apiRequest<Company>('DELETE', `${BASE}/companies/${id}/logo`);

// The logo is behind sign-in, so an <img> cannot load its address: it is read once and shown from memory.
const logoUrls = new Map<string, Promise<string>>();
/** A displayable address for the company's logo (its logoUrl), or '' when it cannot be read. */
export function companyLogoUrl(logoUrl: string): Promise<string> {
  let url = logoUrls.get(logoUrl);
  if (!url) {
    url = apiRequest<Blob>('GET', logoUrl, { responseType: 'blob' })
      .then((blob) => URL.createObjectURL(blob))
      .catch(() => {
        logoUrls.delete(logoUrl);
        return '';
      });
    logoUrls.set(logoUrl, url);
  }
  return url;
}

export const listCompanyUnits = () => apiRequest<CompanyUnitLink[]>('GET', `${BASE}/company-units`);
export const linkUnitToCompany = (unitId: string, companyId: string) =>
  apiRequest<CompanyUnitLink>('PUT', `${BASE}/company-units/${unitId}`, { body: { companyId } });
export const unlinkUnit = (unitId: string) => apiRequest<void>('DELETE', `${BASE}/company-units/${unitId}`);

export const listPositions = () => apiRequest<Position[]>('GET', `${BASE}/positions`);
export const createPosition = (title: string, parentPositionId: string | null, companyIds: string[]) =>
  apiRequest<Position>('POST', `${BASE}/positions`, { body: { title, parentPositionId, companyIds } });
export const updatePosition = (id: string, title: string, parentPositionId: string | null, isActive: boolean, companyIds: string[]) =>
  apiRequest<Position>('PUT', `${BASE}/positions/${id}`, { body: { title, parentPositionId, isActive, companyIds } });
export const deletePosition = (id: string) => apiRequest<void>('DELETE', `${BASE}/positions/${id}`);

/** A deputy's positions (or every deputy's), each with its holders. */
export const listUnitPositions = (unitId?: string) => apiRequest<UnitPosition[]>('GET', `${BASE}/unit-positions`, { query: { unitId } });
export const addUnitPosition = (unitId: string, positionId: string, code?: string, parentPostId?: string | null) =>
  apiRequest<UnitPosition>('POST', `${BASE}/units/${unitId}/positions`, { body: { positionId, code: code || null, parentPostId: parentPostId || null } });
/** A post directly in the company (the head's, a board member's...). */
export const addCompanyPosition = (companyId: string, positionId: string, code?: string, parentPostId?: string | null) =>
  apiRequest<UnitPosition>('POST', `${BASE}/companies/${companyId}/positions`, { body: { positionId, code: code || null, parentPostId: parentPostId || null } });
export const updateUnitPositionCode = (unitPositionId: string, code: string) =>
  apiRequest<UnitPosition>('PUT', `${BASE}/unit-positions/${unitPositionId}`, { body: { code } });
/** Puts a post under another post of its place (null: under none). */
export const setPostParent = (unitPositionId: string, parentPostId: string | null) =>
  apiRequest<UnitPosition>('PUT', `${BASE}/unit-positions/${unitPositionId}/parent`, { body: { parentPostId } });
/** Every position of the deputy, in the new order. */
export const orderUnitPositions = (unitId: string, unitPositionIds: string[]) =>
  apiRequest<UnitPosition[]>('PUT', `${BASE}/units/${unitId}/positions/order`, { body: { unitPositionIds } });
export const removeUnitPosition = (unitPositionId: string) => apiRequest<void>('DELETE', `${BASE}/unit-positions/${unitPositionId}`);

/** The substitution inbox (کارتابل جانشینی): vacant posts' open tasks and who stands in for them. */
export interface ActingPost { postId: string; title: string; code: string; place: string; holderUserId: string | null; holderName: string | null }
export interface SubstitutionTask { taskId: string; title: string; dueDate: string; status: string }
export interface VacantPost { postId: string; title: string; code: string; place: string; acting: ActingPost | null; tasks: SubstitutionTask[]; candidates: ActingPost[] }
export interface SubstitutionInbox { enabled: boolean; canManageAll: boolean; posts: VacantPost[] }

/** Null where the backend has no inbox (404). */
export async function getSubstitutionInbox(): Promise<SubstitutionInbox | null> {
  try {
    return await apiRequest<SubstitutionInbox>('GET', `${BASE}/substitution`);
  } catch (err) {
    if (err instanceof NexusApiError && (err.httpStatus === 404 || err.httpStatus === 405)) return null;
    throw err;
  }
}
export const setActingPost = (vacantPostId: string, actingPostId: string) =>
  apiRequest<void>('PUT', `${BASE}/substitution/${vacantPostId}`, { body: { actingPostId } });
export const clearActingPost = (vacantPostId: string) => apiRequest<void>('DELETE', `${BASE}/substitution/${vacantPostId}`);

export const listAssignments = (filter: { companyId?: string; unitId?: string } = {}) =>
  apiRequest<UserAssignment[]>('GET', `${BASE}/assignments`, { query: filter });

/** A single user's current placement; null when none has been set yet. */
export async function getAssignment(userId: string): Promise<UserAssignment | null> {
  try {
    return await apiRequest<UserAssignment>('GET', `${BASE}/assignments/${userId}`);
  } catch (err) {
    if (err instanceof NexusApiError && err.httpStatus === 404) return null;
    throw err;
  }
}

export const setAssignment = (userId: string, input: AssignmentInput) =>
  apiRequest<UserAssignment>('PUT', `${BASE}/assignments/${userId}`, { body: input });
export const removeAssignment = (userId: string) => apiRequest<void>('DELETE', `${BASE}/assignments/${userId}`);

export const getSubordinatesOf = (userId: string, all: boolean) =>
  apiRequest<Subordinate[]>('GET', `${BASE}/users/${userId}/subordinates`, { query: { all } });

/**
 * Units, without those of other companies where the user is kept to their own company (the
 * server says which; an older server, or none kept: every unit).
 */
export const listOrgUnits = async (): Promise<OrgUnit[]> => {
  const [units, hidden] = await Promise.all([
    apiRequest<OrgUnit[]>('GET', '/api/organization/units'),
    apiRequest<string[]>('GET', `${BASE}/other-companies-units`).catch(() => [] as string[]),
  ]);
  if (!hidden?.length) return units;
  const other = new Set(hidden);
  return units.filter((unit) => !other.has(unit.id));
};
export const createOrgUnit = (input: { name: string }) =>
  apiRequest<OrgUnit>('POST', '/api/organization/units', { body: { ...input, tenantId: getSessionTenantId() } });
export const updateOrgUnit = (id: string, input: OrgUnitInput) => apiRequest<OrgUnit>('PUT', `/api/organization/units/${id}`, { body: input });
export const deactivateOrgUnit = (id: string) => apiRequest<void>('DELETE', `/api/organization/units/${id}`);

/** Units are independent entries, ordered alphabetically for selectors and lists. */
export function sortOrgUnits(units: OrgUnit[]): OrgUnit[] {
  return [...units].sort((a, b) => a.name.localeCompare(b.name, 'fa'));
}

// ---------------------------------------------------------------- the chart's other lists

export interface UnplacedUser { userId: string; displayName: string; avatarUrl: string | null }

/** People with no place in the structure yet. */
export const listUnplacedUsers = () => apiRequest<UnplacedUser[]>('GET', `${BASE}/unplaced-users`);
/** Work teams whose builder is in no deputy (the chart shows the others under their deputy). */
export const listTeamsOutsideUnits = () => apiRequest<ChartTeam[]>('GET', `${BASE}/teams-outside-units`);

// ---------------------------------------------------------------- titles before names

/** A title such as «آقای» or «جناب مهندس»; the user's display name starts with it. */
export interface Honorific { id: string; title: string; sortOrder: number; isActive: boolean; userCount: number }

export interface UserTitle { userId: string; honorificId: string | null; title: string | null }

/** Managing the list: whoever may add users. Giving a user a title: whoever may add or edit users. */
export const TITLE_PERMISSIONS = { manage: 'users.create', assign: ['users.create', 'users.update'] } as const;

export const listTitles = () => apiRequest<Honorific[]>('GET', `${BASE}/titles`);
export const createTitle = (title: string) => apiRequest<Honorific>('POST', `${BASE}/titles`, { body: { title } });
export const updateTitle = (id: string, input: { title: string; sortOrder: number; isActive: boolean }) =>
  apiRequest<Honorific>('PUT', `${BASE}/titles/${id}`, { body: input });
export const deleteTitle = (id: string) => apiRequest<void>('DELETE', `${BASE}/titles/${id}`);
export const getUserTitle = (userId: string) => apiRequest<UserTitle>('GET', `${BASE}/users/${userId}/title`);
export const setUserTitle = (userId: string, honorificId: string | null) =>
  apiRequest<UserTitle>('PUT', `${BASE}/users/${userId}/title`, { body: { honorificId } });

// ---------------------------------------------------------------- nodes, their types and rules

/**
 * A node as the node API gives it. rowVersion is the node's version: send back the one you read
 * and a save over someone else's newer change is refused (409). parentNodeId null: at the top.
 */
export interface OrgNode {
  id: string;
  name: string;
  parentNodeId: string | null;
  nodeTypeId: string | null;
  nodeTypeName: string | null;
  companyId: string | null;
  managerUserId: string | null;
  isActive: boolean;
  sortOrder: number;
  childCount: number;
  rowVersion: string;
  /** Only right after the node is made: automatic links with several possible targets, to choose from (POST /links). */
  autoLinkChoices?: AutoLinkChoice[] | null;
  /** Optional: its code (unique in its company), latin name, the title used in letters, phone and address. */
  code?: string | null;
  latinName?: string | null;
  correspondenceTitle?: string | null;
  phone?: string | null;
  address?: string | null;
}

export interface NodePathItem { id: string; name: string }

/** matchedOn: «name», «code» (one of its posts) or «person» (its manager or a post holder). */
export interface NodeSearchResult { node: OrgNode; path: NodePathItem[]; matchedOn: 'name' | 'code' | 'person'; companyName: string | null }

export interface NodeType {
  id: string;
  code: string;
  name: string;
  color: string;
  icon: string;
  isDomainBoundary: boolean;
  sortOrder: number;
  isActive: boolean;
  nodeCount: number;
}

export interface NodeTypeInput { name: string; code?: string | null; color?: string | null; icon?: string | null; isDomainBoundary?: boolean }
export interface NodeTypeUpdate { name: string; color: string | null; icon: string | null; isDomainBoundary: boolean; sortOrder: number; isActive: boolean }

/** A node of the child type may sit under a node of the parent type (parentNodeTypeId null: directly under the company). */
export interface NodeTypeRule { parentNodeTypeId: string | null; childNodeTypeId: string }

/** A node that does not match the rules (nothing is changed or removed: it is only listed). */
export interface RuleConflict { nodeId: string; nodeName: string; nodeTypeName: string | null; parentNodeId: string | null; parentName: string | null; parentTypeName: string | null }

/** No rules at all: every node stays at the top (the flat structure). */
export interface NodeTypeRules { rules: NodeTypeRule[]; conflicts: RuleConflict[] }

export interface CreateNodeInput { name: string; parentNodeId?: string | null; companyId?: string | null; nodeTypeId?: string | null; code?: string | null }

export const listNodes = (companyId?: string) => apiRequest<OrgNode[]>('GET', `${BASE}/nodes`, { query: { companyId } });
export const searchNodes = (q: string, companyId?: string) => apiRequest<NodeSearchResult[]>('GET', `${BASE}/nodes/search`, { query: { q, companyId } });
export const getNodeAncestors = (id: string) => apiRequest<NodePathItem[]>('GET', `${BASE}/nodes/${id}/ancestors`);
export const createNode = (input: CreateNodeInput) => apiRequest<OrgNode>('POST', `${BASE}/nodes`, { body: input });
export const updateNode = (id: string, input: { name: string; nodeTypeId?: string | null; rowVersion?: string | null }) =>
  apiRequest<OrgNode>('PUT', `${BASE}/nodes/${id}`, { body: input });
export const setNodeManager = (id: string, managerUserId: string | null, rowVersion?: string | null) =>
  apiRequest<OrgNode>('PUT', `${BASE}/nodes/${id}/manager`, { body: { managerUserId, rowVersion } });
/** parentNodeId null: to the top of companyId (or of the node's own company). */
export const moveNode = (id: string, input: { parentNodeId: string | null; companyId?: string | null; rowVersion?: string | null }) =>
  apiRequest<OrgNode>('POST', `${BASE}/nodes/${id}/move`, { body: input });
/** position: the node's new place among the nodes beside it, from 0. */
export const reorderNode = (id: string, position: number, rowVersion?: string | null) =>
  apiRequest<OrgNode>('POST', `${BASE}/nodes/${id}/reorder`, { body: { position, rowVersion } });
export const deactivateNode = (id: string, rowVersion?: string | null) => apiRequest<OrgNode>('POST', `${BASE}/nodes/${id}/deactivate`, { body: { rowVersion } });
export const activateNode = (id: string, rowVersion?: string | null) => apiRequest<OrgNode>('POST', `${BASE}/nodes/${id}/activate`, { body: { rowVersion } });

export const listNodeTypes = () => apiRequest<NodeType[]>('GET', `${BASE}/node-types`);
export const createNodeType = (input: NodeTypeInput) => apiRequest<NodeType>('POST', `${BASE}/node-types`, { body: input });
export const updateNodeType = (id: string, input: NodeTypeUpdate) => apiRequest<NodeType>('PUT', `${BASE}/node-types/${id}`, { body: input });
export const deleteNodeType = (id: string) => apiRequest<void>('DELETE', `${BASE}/node-types/${id}`);
export const getNodeTypeRules = () => apiRequest<NodeTypeRules>('GET', `${BASE}/node-type-rules`);
/** Replaces all the rules; answers with the new rules and the nodes that no longer match them. */
export const setNodeTypeRules = (rules: NodeTypeRule[]) => apiRequest<NodeTypeRules>('PUT', `${BASE}/node-type-rules`, { body: { rules } });

// ---------------------------------------------------------------- impact preview

/**
 * One proposed change. kind: «move» (nodeId under parentNodeId, or to the top of companyId),
 * «add» (a new empty node: name, parentNodeId or companyId), «manager» (nodeId gets managerUserId;
 * null: none) or «unlink» (nodeId loses its company link).
 */
export interface ImpactChange {
  kind: 'move' | 'add' | 'manager' | 'unlink' | 'link' | 'unlink-link' | 'merge';
  nodeId?: string | null;
  /** «link»: the node the secondary link goes to, and its type. «unlink-link»: the link that goes. */
  toNodeId?: string | null;
  linkTypeId?: string | null;
  linkId?: string | null;
  parentNodeId?: string | null;
  companyId?: string | null;
  managerUserId?: string | null;
  name?: string | null;
}

export interface ImpactPost { postId: string; title: string; code: string; place: string }

/** What changes for one person; only what changes is listed. */
export interface ImpactPerson {
  person: PersonRef;
  managerChanged: boolean;
  managerBefore: PersonRef | null;
  managerAfter: PersonRef | null;
  subordinatesAdded: PersonRef[];
  subordinatesRemoved: PersonRef[];
  cannotAssignAdded: PersonRef[];
  cannotAssignRemoved: PersonRef[];
  substitutionAdded: ImpactPost[];
  substitutionRemoved: ImpactPost[];
  teamAdded: PersonRef[];
  teamRemoved: PersonRef[];
  /** The managers someone gets / loses through secondary links that count as manager (their main manager does not change). */
  extraManagersAdded?: PersonRef[] | null;
  extraManagersRemoved?: PersonRef[] | null;
}

/** taskLimitOn: whether «cannot give tasks to» was compared (OrgStructure:LimitTaskAssignment). */
export interface ImpactPreview { peopleAffected: number; people: ImpactPerson[]; taskLimitOn: boolean }

/** What the changes would do to people before they are made. Nothing is written. */
export const previewImpact = (changes: ImpactChange[]) => apiRequest<ImpactPreview>('POST', `${BASE}/impact-preview`, { body: { changes } });

/** A save over someone else's newer change, or a business conflict: both answer 409. */
/**
 * Someone else changed it meanwhile (or is changing it now): reading again and retrying resolves it, so the
 * screens offer «بارگذاری دوباره». Other 409s (a code or a name already in use...) are not offered it.
 */
export const isConflict = (err: unknown): boolean => err instanceof NexusApiError && err.httpStatus === 409 && err.code === 'conflict.changed';

// ---------------------------------------------------------------- secondary links (phase 4)

/** A kind of secondary link. lineStyle: how the chart draws it; a dotted one never counts as manager. */
export interface LinkType { id: string; code: string; name: string; lineStyle: OrgLineStyle; countsAsManager: boolean; isActive: boolean; linkCount: number }
export interface LinkTypeInput { name: string; code?: string | null; lineStyle: OrgLineStyle; countsAsManager: boolean }

/** A node of the source type, when made, is linked to the one node of the target type (in its company). */
export interface AutoLinkRule { sourceNodeTypeId: string; targetNodeTypeId: string; linkTypeId: string }

export interface OrgLink {
  id: string;
  fromNodeId: string;
  fromName: string;
  toNodeId: string;
  toName: string;
  linkTypeId: string;
  linkTypeName: string;
  lineStyle: OrgLineStyle;
  countsAsManager: boolean;
}

/** An automatic link with several possible targets: the user picks one. */
export interface AutoLinkChoice { nodeId: string; nodeName: string; linkTypeId: string; linkTypeName: string; targets: NodePathItem[] }
export interface ProposedLink { fromNodeId: string; fromName: string; toNodeId: string; toName: string; linkTypeId: string; linkTypeName: string }
/** What the automatic rules would add to the existing nodes: links (one target each) and ambiguous ones (several targets: not added). */
export interface AutoLinkPlan { links: ProposedLink[]; ambiguous: AutoLinkChoice[] }

export const listLinkTypes = () => apiRequest<LinkType[]>('GET', `${BASE}/link-types`);
export const createLinkType = (input: LinkTypeInput) => apiRequest<LinkType>('POST', `${BASE}/link-types`, { body: input });
export const updateLinkType = (id: string, input: { name: string; lineStyle: OrgLineStyle; countsAsManager: boolean; isActive: boolean }) =>
  apiRequest<LinkType>('PUT', `${BASE}/link-types/${id}`, { body: input });
export const deleteLinkType = (id: string) => apiRequest<void>('DELETE', `${BASE}/link-types/${id}`);
export const listAutoLinkRules = () => apiRequest<AutoLinkRule[]>('GET', `${BASE}/auto-link-rules`);
export const setAutoLinkRules = (rules: AutoLinkRule[]) => apiRequest<AutoLinkRule[]>('PUT', `${BASE}/auto-link-rules`, { body: { rules } });
/** What the automatic rules would add to the nodes that exist now (nothing is written). */
export const planAutoLinks = () => apiRequest<AutoLinkPlan>('POST', `${BASE}/auto-link-rules/preview`);
export const applyAutoLinks = (links: { fromNodeId: string; toNodeId: string; linkTypeId: string }[]) =>
  apiRequest<OrgLink[]>('POST', `${BASE}/auto-link-rules/apply`, { body: { links } });
export const listLinks = (nodeId?: string) => apiRequest<OrgLink[]>('GET', `${BASE}/links`, { query: { nodeId } });
export const createLink = (input: { fromNodeId: string; toNodeId: string; linkTypeId: string }) => apiRequest<OrgLink>('POST', `${BASE}/links`, { body: input });
export const deleteLink = (id: string) => apiRequest<void>('DELETE', `${BASE}/links/${id}`);
export const setCompanyUiLevel = (companyId: string, uiLevel: OrgUiLevel) => apiRequest<void>('PUT', `${BASE}/companies/${companyId}/ui-level`, { body: { uiLevel } });
/** The people who also count as someone's manager through a link (not the main manager). */
export const getExtraManagers = (userId: string) => apiRequest<PersonRef[]>('GET', `${BASE}/users/${userId}/extra-managers`);

// ---------------------------------------------------------------- structure templates (phase 4)

/** A structure template: built in (isSystem) or saved from a company of this organization. */
export interface StructureTemplate { id: string; code: string; name: string; description: string | null; isSystem: boolean; uiLevel: OrgUiLevel; nodeCount: number; nodeTypeCount: number }

/** The template and its whole content (types, rules, positions, nodes, links...), in the shape of the template files. */
export interface StructureTemplateDetail { template: StructureTemplate; content: TemplateContent }

export interface TemplateNodeType { key: string; name: string; color?: string; icon?: string; isDomainBoundary?: boolean }
export interface TemplateNode { key: string; name: string; type?: string | null; children?: TemplateNode[] }
export interface TemplateContent {
  nodeTypes?: TemplateNodeType[];
  nodes?: TemplateNode[];
  linkTypes?: { key: string; name: string; lineStyle?: string }[];
  links?: unknown[];
  positions?: { key: string; name: string }[];
}

export const listTemplates = () => apiRequest<StructureTemplate[]>('GET', `${BASE}/templates`);
export const getTemplate = (id: string) => apiRequest<StructureTemplateDetail>('GET', `${BASE}/templates/${id}`);
/** Saves a company's structure as a template of this organization (a copy). */
export const saveTemplate = (input: { companyId: string; name: string; code?: string | null; description?: string | null }) =>
  apiRequest<StructureTemplate>('POST', `${BASE}/templates`, { body: input });
export const deleteTemplate = (id: string) => apiRequest<void>('DELETE', `${BASE}/templates/${id}`);

// ---------------------------------------------------------------- volume and history (phase 6)

/** The details of a node (each empty: none). They replace all of the node's details at once. */
export interface NodeDetailsInput { code?: string | null; latinName?: string | null; correspondenceTitle?: string | null; phone?: string | null; address?: string | null; rowVersion?: string | null }
export const setNodeDetails = (id: string, input: NodeDetailsInput) => apiRequest<OrgNode>('PUT', `${BASE}/nodes/${id}/details`, { body: input });

/** When the node exists (each null: no limit). It only matters for the chart on a day (asOf). */
export const setNodeValidity = (id: string, input: { validFrom: string | null; validTo: string | null; rowVersion?: string | null }) =>
  apiRequest<OrgNode>('PUT', `${BASE}/nodes/${id}/validity`, { body: input });

/** The node goes into targetNodeId (same company): its sub-nodes, posts (with holders) and people move; it ends on effectiveDate. */
export const mergeNode = (id: string, input: { targetNodeId: string; effectiveDate?: string | null; rowVersion?: string | null }) =>
  apiRequest<OrgNode>('POST', `${BASE}/nodes/${id}/merge`, { body: input });

/** One change of a node, newest first. details: what changed (JSON text). canUndo: the kind can be undone (only the last one is). */
export interface NodeChange { id: string; action: string; userId: string | null; atUtc: string; details: string | null; canUndo: boolean }
export const listNodeChanges = (id: string, take?: number) => apiRequest<NodeChange[]>('GET', `${BASE}/nodes/${id}/changes`, { query: { take } });
export const undoNodeChange = (id: string, rowVersion?: string | null) => apiRequest<OrgNode>('POST', `${BASE}/nodes/${id}/undo`, { body: { rowVersion } });

/** A company and the companies under it in its group (a holding), at any depth. */
export interface CompanyGroup { id: string; name: string; code: string; isActive: boolean; children: CompanyGroup[] }
export const listCompanyGroups = () => apiRequest<CompanyGroup[]>('GET', `${BASE}/company-groups`);
/** parentCompanyId null: a company of its own. A loop is refused (409). */
export const setCompanyParent = (id: string, parentCompanyId: string | null) => apiRequest<void>('PUT', `${BASE}/companies/${id}/parent`, { body: { parentCompanyId } });

// ---- posts from a pattern

/** A post a node type gets: of this position; isManagerPost: the node's manager post (at most one). */
export interface NodeTypePost { positionId: string; title: string; isManagerPost: boolean; sortOrder: number }
export const getNodeTypePosts = (nodeTypeId: string) => apiRequest<NodeTypePost[]>('GET', `${BASE}/node-types/${nodeTypeId}/posts`);
export const setNodeTypePosts = (nodeTypeId: string, posts: { positionId: string; isManagerPost: boolean }[]) =>
  apiRequest<NodeTypePost[]>('PUT', `${BASE}/node-types/${nodeTypeId}/posts`, { body: { posts } });
/** A post of the pattern that was not made, and why. */
export interface SkippedPost { nodeId: string; nodeName: string; positionTitle: string | null; reason: string }
export interface ApplyPostTemplatesResult { created: UnitPosition[]; skipped: SkippedPost[] }
/** Makes the posts a node (or every active node of a type) lacks; running it again makes nothing. */
export const applyPostTemplates = (target: { nodeId?: string; nodeTypeId?: string }) => apiRequest<ApplyPostTemplatesResult>('POST', `${BASE}/post-templates/apply`, { body: target });
export const setManagerPost = (unitPositionId: string, isManagerPost: boolean) =>
  apiRequest<UnitPosition>('PUT', `${BASE}/unit-positions/${unitPositionId}/manager-post`, { body: { isManagerPost } });

// ---------------------------------------------------------------- appointments over time (phase 9)

/** One appointment: who held (holds, will hold) which post, from when until when (null: no limit). */
export interface Appointment {
  id: string;
  unitPositionId: string;
  postTitle: string | null;
  postCode: string | null;
  place: string | null;
  person: PersonRef;
  startDate: string | null;
  endDate: string | null;
  /** On now (a later start or a past end: false). */
  isActive: boolean;
}

/** The person takes the post now (startDate empty) or from a later day; whoever holds it ends then, in the same save. Never in the past. */
export const appointToPost = (unitPositionId: string, userId: string, startDate?: string | null) =>
  apiRequest<Appointment>('POST', `${BASE}/unit-positions/${unitPositionId}/appointment`, { body: { userId, startDate: startDate || null } });
/** The present appointment ends now (endDate empty) or on a later day. */
export const endPostAppointment = (unitPositionId: string, endDate?: string | null) =>
  apiRequest<Appointment>('POST', `${BASE}/unit-positions/${unitPositionId}/appointment/end`, { body: { endDate: endDate || null } });
/** Cancels the post's appointment that has not started yet (the present holder stays on). */
export const cancelUpcomingAppointment = (unitPositionId: string) =>
  apiRequest<Appointment>('POST', `${BASE}/unit-positions/${unitPositionId}/appointment/cancel`);
export const getPostHistory = (unitPositionId: string) => apiRequest<Appointment[]>('GET', `${BASE}/unit-positions/${unitPositionId}/history`);
export const getUserPositionHistory = (userId: string) => apiRequest<Appointment[]>('GET', `${BASE}/users/${userId}/positions/history`);

/** Where an appointment stands now: «current», «waiting» (starts later) or «ended». */
export const appointmentState = (a: Pick<Appointment, 'isActive' | 'startDate' | 'endDate'>, now = Date.now()): 'current' | 'waiting' | 'ended' =>
  a.isActive ? 'current' : a.startDate && Date.parse(a.startDate) > now ? 'waiting' : 'ended';
