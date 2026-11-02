// The «چارت مرتب» (tidy chart): the same GET /chart data laid out as a chain from the root down to the
// first node with several children, a strip of committees, and one column per node type below it.
// Pure functions only (no React), so scripts/check-org-tidy.ts can check them.
import type { ChartCompany, ChartMember, ChartPosition, ChartUnit } from '../../../services/orgStructureApi';
import { allUnitsOf, ancestorsOf } from './orgChartModel';

export type ChartView = 'tree' | 'tidy';

export const CHART_VIEW_KEY = 'orgchart_view_v1';
/** A company with more nodes than this opens in the tidy chart (until the user chooses). */
export const TIDY_DEFAULT_ABOVE = 30;
/** How many same-type nodes a column lists before «نمایش ۱۰ مورد بعدی». */
export const PAGE_SIZE = 10;

export const defaultView = (nodeCount: number): ChartView => (nodeCount > TIDY_DEFAULT_ABOVE ? 'tidy' : 'tree');

/** The user's saved choice; null when none is saved or storage fails (private mode, blocked, damaged). */
export function readSavedView(storage?: Pick<Storage, 'getItem'> | null): ChartView | null {
  try {
    const store = storage === undefined ? (typeof localStorage === 'undefined' ? null : localStorage) : storage;
    const value = store?.getItem(CHART_VIEW_KEY);
    return value === 'tree' || value === 'tidy' ? value : null;
  } catch {
    return null;
  }
}

export function saveView(view: ChartView, storage?: Pick<Storage, 'setItem'> | null): void {
  try {
    const store = storage === undefined ? (typeof localStorage === 'undefined' ? null : localStorage) : storage;
    store?.setItem(CHART_VIEW_KEY, view);
  } catch {
    /* the choice just does not last */
  }
}

/** Everyone in a node and the nodes under it (each person once). */
export function peopleIn(unit: ChartUnit): Set<string> {
  const ids = new Set<string>();
  const walk = (u: ChartUnit) => {
    for (const member of u.members) ids.add(member.userId);
    for (const post of u.positions || []) for (const holder of post.holders) ids.add(holder.userId);
    for (const child of u.children || []) walk(child);
  };
  walk(unit);
  return ids;
}

export const peopleCountOf = (unit: ChartUnit): number => peopleIn(unit).size;

const subtreeSize = (unit: ChartUnit): number => 1 + (unit.children || []).reduce((sum, child) => sum + subtreeSize(child), 0);

export interface TidyColumn {
  key: string;
  title: string;
  color: string | null;
  nodes: ChartUnit[];
  people: number;
}

/** One root of the company: its chain down to the first node with several children, and the columns below. */
export interface TidyRoot {
  chain: ChartUnit[];
  columns: TidyColumn[];
}

export interface TidyLayout {
  /** Every top-level node that is not a committee, the biggest first (a company may have several). */
  roots: TidyRoot[];
  /** The top-level nodes of the committee type. */
  committees: ChartUnit[];
}

/** A committee is told by its type's name (the chart data has no type code). */
export const isCommittee = (unit: ChartUnit): boolean => (unit.nodeType?.name ?? '').includes('کمیته');

function rootOf(top: ChartUnit): TidyRoot {
  const chain: ChartUnit[] = [top];
  while ((chain[chain.length - 1].children?.length ?? 0) === 1) chain.push(chain[chain.length - 1].children![0]);
  const last = chain[chain.length - 1];
  const byType = new Map<string, TidyColumn>();
  for (const child of last.children || []) {
    const key = child.nodeType?.nodeTypeId ?? 'none';
    let column = byType.get(key);
    if (!column) {
      column = { key: `${top.unitId}:${key}`, title: child.nodeType?.name ?? 'بدون جزء', color: child.nodeType?.color ?? null, nodes: [], people: 0 };
      byType.set(key, column);
    }
    column.nodes.push(child);
  }
  const columns = [...byType.values()];
  for (const column of columns) {
    const ids = new Set<string>();
    for (const node of column.nodes) peopleIn(node).forEach((id) => ids.add(id));
    column.people = ids.size;
  }
  return { chain, columns };
}

/**
 * The tidy chart's parts: committees (top-level nodes of the committee type) in their own strip,
 * every other top-level node as a root with its own chain and columns.
 */
export function layoutOf(company: ChartCompany): TidyLayout {
  const committees = company.units.filter(isCommittee);
  const roots = company.units.filter((u) => !isCommittee(u))
    .sort((a, b) => subtreeSize(b) - subtreeSize(a))
    .map(rootOf);
  return { roots, committees };
}

export interface PostRows {
  /** Filled posts, one row per holder. */
  filled: { post: ChartPosition; holder: ChartMember }[];
  vacant: ChartPosition[];
  /** Several vacant posts shown as one «n پست خالی» bar. */
  collapseVacant: boolean;
}

/** A node's active posts in sortOrder. With «show empty» off, two or more vacant posts become one bar. */
export function postRowsOf(unit: ChartUnit, showEmpty: boolean): PostRows {
  const posts = [...(unit.positions || [])].filter((p) => p.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
  const filled: PostRows['filled'] = [];
  const vacant: ChartPosition[] = [];
  for (const post of posts) {
    if (post.holders.length === 0) vacant.push(post);
    else for (const holder of post.holders) filled.push({ post, holder });
  }
  return { filled, vacant, collapseVacant: !showEmpty && vacant.length > 1 };
}

/** The ids a node is open under: its own and «vac:<id>» for its vacant bar. */
export const vacantKey = (unitId: string) => `vac:${unitId}`;

/** Nodes open at first: the ones with people in them. */
export function defaultOpenSet(company: ChartCompany): Set<string> {
  const open = new Set<string>();
  const walk = (unit: ChartUnit): number => {
    let count = new Set([...unit.members.map((m) => m.userId), ...(unit.positions || []).flatMap((p) => p.holders.map((h) => h.userId))]).size;
    for (const child of unit.children || []) count += walk(child);
    if (count > 0) open.add(unit.unitId);
    return count;
  };
  company.units.forEach(walk);
  return open;
}

export function allOpenSet(company: ChartCompany): Set<string> {
  const open = new Set<string>();
  for (const unit of allUnitsOf(company)) { open.add(unit.unitId); open.add(vacantKey(unit.unitId)); }
  return open;
}

/** A node and the nodes above it: what must be open for it to be seen. */
export const pathTo = (company: ChartCompany, unitId: string): string[] => [...ancestorsOf(company, unitId).map((u) => u.unitId), unitId];

const COMPANY_KEY = 'orgchart_company_v1';

/** The company last looked at (so leaving the page and coming back keeps it); null when none or storage fails. */
export function readSavedCompany(storage?: Pick<Storage, 'getItem'> | null): string | null {
  try {
    const store = storage === undefined ? (typeof sessionStorage === 'undefined' ? null : sessionStorage) : storage;
    return store?.getItem(COMPANY_KEY) || null;
  } catch {
    return null;
  }
}

export function saveCompany(companyId: string, storage?: Pick<Storage, 'setItem'> | null): void {
  try {
    const store = storage === undefined ? (typeof sessionStorage === 'undefined' ? null : sessionStorage) : storage;
    store?.setItem(COMPANY_KEY, companyId);
  } catch {
    /* it just does not last */
  }
}
