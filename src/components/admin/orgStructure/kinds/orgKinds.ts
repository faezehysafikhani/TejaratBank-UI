// The simple organization chart: three kinds, one table (the server has the same one in OrgNodeKinds.cs;
// scripts/check-org-kinds.ts keeps this file's rules honest). Pure functions only, so they can be checked.
//   org      - «سازمان»: the company, the one root; nobody sits in it. Not a node.
//   unit     - «واحد سازمانی» (e.g. a deputy): no person; may have a head (one of its direct positions).
//   position - «سمت / پست سازمانی»: one or more people; only positions sit under it.
import type { KindNode, OrgKind } from '../../../../services/orgStructureApi';

export type KindKey = 'org' | OrgKind;

export const KIND_INFO: Record<KindKey, { label: string; color: string; bg: string; hint: string }> = {
  org: { label: 'سازمان', color: '#6a4fe0', bg: '#efeaff', hint: 'بالاترین گره، بدون شخص' },
  unit: { label: 'واحد سازمانی', color: '#0e9384', bg: '#e0f6f2', hint: 'مثل معاونت، بدون شخص؛ می‌تواند رئیس داشته باشد' },
  position: { label: 'سمت / پست سازمانی', color: '#c9731a', bg: '#fff0dc', hint: 'یک یا چند شخص' },
};

/** What may sit under a node of this kind (the organization, the root, is `org`). */
export const ALLOWED_CHILDREN: Record<KindKey, OrgKind[]> = {
  org: ['unit', 'position'],
  unit: ['unit', 'position'],
  position: ['position'],
};

/** The kind that is pre-selected under each kind: under the organization a unit, under a unit a position, under a position a position. */
export const DEFAULT_CHILD: Record<KindKey, OrgKind> = { org: 'unit', unit: 'position', position: 'position' };

export const canContain = (parent: KindKey, child: OrgKind): boolean => ALLOWED_CHILDREN[parent].includes(child);
export const holdsPeople = (kind: KindKey): boolean => kind === 'position';
export const canHaveHead = (kind: KindKey): boolean => kind === 'unit';

export interface KindTreeNode extends KindNode {
  children: KindTreeNode[];
}

/** The nodes of one company as a tree: top nodes (parent null) in order; a unit's head first among its children. */
export function buildTree(nodes: KindNode[], companyId: string): KindTreeNode[] {
  const byId = new Map<string, KindTreeNode>();
  for (const n of nodes) byId.set(n.id, { ...n, children: [] });
  const tops: KindTreeNode[] = [];
  for (const n of byId.values()) {
    const parent = n.parentNodeId ? byId.get(n.parentNodeId) : undefined;
    if (parent) parent.children.push(n);
    else if (n.companyId === companyId) tops.push(n);
  }
  const order = (list: KindTreeNode[], headId: string | null) => {
    list.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'fa'));
    if (headId) {
      const index = list.findIndex((c) => c.id === headId);
      if (index > 0) list.unshift(...list.splice(index, 1));
    }
    for (const c of list) order(c.children, c.headNodeId);
  };
  order(tops, null);
  return tops;
}

export const countBelow = (node: KindTreeNode): number => node.children.reduce((n, c) => n + 1 + countBelow(c), 0);

export function walk(nodes: KindTreeNode[], visit: (node: KindTreeNode, parent: KindTreeNode | null) => void, parent: KindTreeNode | null = null): void {
  for (const n of nodes) { visit(n, parent); walk(n.children, visit, n); }
}

/** Whether the node, or something under it, matches the text (its name or a person's name). */
export function matches(node: KindTreeNode, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return self(node, q) || node.children.some((c) => matches(c, q));
}
export const self = (node: KindTreeNode, query: string): boolean => {
  const q = query.trim().toLowerCase();
  return !!q && (node.name.toLowerCase().includes(q) || node.persons.some((p) => p.displayName.toLowerCase().includes(q)));
};

/** The ids of the nodes that must be open to show every match. */
export function pathsToMatches(roots: KindTreeNode[], query: string): Set<string> {
  const open = new Set<string>();
  if (!query.trim()) return open;
  const visit = (node: KindTreeNode): boolean => {
    const below = node.children.map(visit).some(Boolean);
    if (below) open.add(node.id);
    return below || self(node, query);
  };
  roots.forEach(visit);
  return open;
}

/** The official person of a position (the marked one, else the first). */
export const officialOf = (node: Pick<KindNode, 'persons'>) => node.persons.find((p) => p.isPrimary) ?? node.persons[0] ?? null;

export interface OutlineLine { line: number; depth: number; name: string; kind: OrgKind; persons: string[] }

const POSITION_PREFIX = /^(سمت|پست|سمت\s*\/\s*پست)\s*[:：]\s*/;
const UNIT_PREFIX = /^(واحد|واحد سازمانی)\s*[:：]\s*/;

/**
 * An indented list as nodes (templates): two spaces or a tab or one «-» per level. A line is a unit unless it
 * starts with «سمت:» (a position). Under a position only positions may sit.
 */
export function parseOutline(text: string, rootKind: KindKey = 'org'): { lines: OutlineLine[]; errors: string[] } {
  const lines: OutlineLine[] = [];
  const errors: string[] = [];
  const stack: KindKey[] = [];
  text.split(/\r?\n/).forEach((raw, index) => {
    if (!raw.trim()) return;
    const no = index + 1;
    const lead = /^[\s-]*/.exec(raw)![0];
    const depth = (lead.match(/-/g) || []).length + Math.floor(lead.replace(/-/g, '').replace(/\t/g, '  ').length / 2);
    let name = raw.slice(lead.length).trim();
    let kind: OrgKind = 'unit';
    if (POSITION_PREFIX.test(name)) { kind = 'position'; name = name.replace(POSITION_PREFIX, '').trim(); }
    else if (UNIT_PREFIX.test(name)) { name = name.replace(UNIT_PREFIX, '').trim(); }
    if (!name) { errors.push(`سطر ${no}: عنوان خالی است.`); return; }
    if (name.length > 160) { errors.push(`سطر ${no}: عنوان بیش از ۱۶۰ نویسه است.`); return; }
    if (depth > stack.length) { errors.push(`سطر ${no}: تورفتگی یک‌باره بیش از یک سطح است.`); return; }
    stack.length = depth;
    const above: KindKey = depth === 0 ? rootKind : stack[depth - 1];
    if (!canContain(above, kind)) { errors.push(`سطر ${no}: ${KIND_INFO[kind].label} زیر ${KIND_INFO[above].label} مجاز نیست.`); return; }
    stack.push(kind);
    lines.push({ line: no, depth, name, kind, persons: [] });
  });
  if (lines.length === 0 && errors.length === 0) errors.push('متنی وارد نشده است.');
  return { lines, errors };
}

export const TEMPLATES: { id: 'small' | 'bank' | 'holding'; title: string; text: string }[] = [
  {
    id: 'small', title: 'شرکت کوچک',
    text: 'سمت: مدیرعامل\nسمت: مالی و اداری\n  سمت: حسابدار\nسمت: فروش\n  سمت: کارشناس فروش\n  سمت: کارشناس بازاریابی',
  },
  {
    id: 'bank', title: 'بانک',
    text: [
      'سمت: مجمع عمومی', 'سمت: هیأت مدیره', 'سمت: مدیرعامل',
      'معاونت مالی', '  سمت: مدیر مالی', '    سمت: کارشناس مالی', '    سمت: حسابدار',
      'معاونت اعتباری', '  سمت: اداره کل اعتبارات', '  سمت: اداره کل وصول مطالبات',
      'معاونت فناوری اطلاعات', '  سمت: اداره کل امنیت و زیرساخت', '  سمت: اداره کل بانکداری الکترونیک',
      'مدیریت امور شعب', '  سمت: شعبه مرکزی', '  سمت: شعبه ۲',
    ].join('\n'),
  },
  {
    id: 'holding', title: 'هلدینگ',
    text: ['سمت: هیأت مدیره هلدینگ', 'شرکت الف', '  سمت: مدیرعامل شرکت الف', '  سمت: مالی', 'شرکت ب', '  سمت: مدیرعامل شرکت ب', 'شرکت ج'].join('\n'),
  },
];
