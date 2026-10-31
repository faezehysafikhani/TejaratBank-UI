// The three kinds of the simple organization chart:
//   سازمان        - the company itself (a holding is a company under a company); nobody sits in it;
//   پست سازمانی   - a unit with no person (a deputy, a department); under the company or another پست;
//   سمت سازمانی   - a seat one person holds; it is also a unit: it may have more پست / سمت under it.
// پست and سمت are two ordinary node types the first add creates (codes below) together with the
// rules between them, so nothing else of the structure changes and nobody has to set up rules.
import { type ChartCompany, type ChartUnit, type NodeType, type NodeTypeRule, createNodeType, getNodeTypeRules, listNodeTypes, setNodeTypeRules } from '../../../../services/orgStructureApi';

export type SimpleKind = 'post' | 'role';

export const SIMPLE_KINDS: Record<SimpleKind, { code: string; name: string; color: string; icon: string; hint: string }> = {
  post: { code: 'org_post', name: 'پست سازمانی', color: '#1e3a8a', icon: 'building-2', hint: 'واحدی بدون شخص؛ مثل معاونت یا اداره' },
  role: { code: 'org_role', name: 'سمت سازمانی', color: '#0f766e', icon: 'user', hint: 'یک نفر در آن قرار می‌گیرد؛ می‌تواند زیرمجموعه هم داشته باشد' },
};

export const kindOfType = (type: { code?: string | null } | null | undefined): SimpleKind | null =>
  type?.code === SIMPLE_KINDS.post.code ? 'post' : type?.code === SIMPLE_KINDS.role.code ? 'role' : null;

export const isSimpleType = (type: { code?: string | null } | null | undefined): boolean => kindOfType(type) !== null;

export const hasSimpleKinds = (types: { code?: string | null }[]): boolean =>
  types.some((t) => kindOfType(t) === 'post') && types.some((t) => kindOfType(t) === 'role');

/** The types to offer when adding: the two kinds, once they exist (the older, custom types stay in the data). */
export const typesToOffer = (allowed: NodeType[], all: NodeType[], showCustom: boolean): NodeType[] => {
  if (showCustom || !hasSimpleKinds(all)) return allowed;
  return allowed.filter(isSimpleType).sort((a, b) => (kindOfType(a) === 'post' ? 0 : 1) - (kindOfType(b) === 'post' ? 0 : 1));
};

/** Makes the two types and the rules between them when missing (added to the rules that exist; nothing is removed). */
export async function ensureSimpleKinds(): Promise<{ types: NodeType[]; rules: NodeTypeRule[] }> {
  let types = await listNodeTypes();
  for (const kind of ['post', 'role'] as const) {
    const spec = SIMPLE_KINDS[kind];
    if (types.some((t) => t.code === spec.code)) continue;
    await createNodeType({ name: spec.name, code: spec.code, color: spec.color, icon: spec.icon });
    types = await listNodeTypes();
  }
  const post = types.find((t) => kindOfType(t) === 'post')!;
  const role = types.find((t) => kindOfType(t) === 'role')!;
  const existing = (await getNodeTypeRules()).rules;
  const wanted: NodeTypeRule[] = [
    { parentNodeTypeId: null, childNodeTypeId: post.id },
    { parentNodeTypeId: post.id, childNodeTypeId: post.id },
    { parentNodeTypeId: null, childNodeTypeId: role.id },
    { parentNodeTypeId: post.id, childNodeTypeId: role.id },
    { parentNodeTypeId: role.id, childNodeTypeId: role.id },
  ];
  const key = (r: NodeTypeRule) => `${r.parentNodeTypeId ?? ''}>${r.childNodeTypeId}`;
  const have = new Set(existing.map(key));
  const missing = wanted.filter((r) => !have.has(key(r)));
  if (missing.length === 0) return { types, rules: existing };
  const saved = await setNodeTypeRules([...existing, ...missing]);
  return { types, rules: saved.rules };
}

export interface OutlineLine { line: number; depth: number; name: string; kind: SimpleKind }
export interface OutlineResult { lines: OutlineLine[]; errors: string[] }

const ROLE_PREFIX = /^(سمت|سمت سازمانی)\s*[:：]\s*/;
const POST_PREFIX = /^(پست|پست سازمانی)\s*[:：]\s*/;

/**
 * The «ساخت سریع» text: one node per line, a level of indentation (two spaces, a tab, or one «-») per depth.
 * A line is a پست unless it starts with «سمت:». Under a سمت only سمت may sit.
 */
export function parseOutline(text: string, parentKind: SimpleKind | null): OutlineResult {
  const lines: OutlineLine[] = [];
  const errors: string[] = [];
  const stack: SimpleKind[] = [];
  text.split(/\r?\n/).forEach((raw, index) => {
    if (!raw.trim()) return;
    const no = index + 1;
    const lead = /^[\s-]*/.exec(raw)![0];
    const depth = (lead.match(/-/g) || []).length + Math.floor(lead.replace(/-/g, '').replace(/\t/g, '  ').length / 2);
    let name = raw.slice(lead.length).trim();
    let kind: SimpleKind = 'post';
    if (ROLE_PREFIX.test(name)) { kind = 'role'; name = name.replace(ROLE_PREFIX, '').trim(); }
    else if (POST_PREFIX.test(name)) { name = name.replace(POST_PREFIX, '').trim(); }
    if (!name) { errors.push(`سطر ${no}: عنوان خالی است.`); return; }
    if (name.length > 200) { errors.push(`سطر ${no}: عنوان بیش از ۲۰۰ نویسه است.`); return; }
    if (depth > stack.length) { errors.push(`سطر ${no}: تورفتگی یک‌باره بیش از یک سطح است.`); return; }
    stack.length = depth;
    const above = depth === 0 ? parentKind : stack[depth - 1];
    if (above === 'role' && kind === 'post') { errors.push(`سطر ${no}: زیر یک سمت فقط سمت می‌آید، نه پست.`); return; }
    stack.push(kind);
    lines.push({ line: no, depth, name, kind });
  });
  if (lines.length === 0 && errors.length === 0) errors.push('متنی وارد نشده است.');
  return { lines, errors };
}

const withoutVacantUnit = (unit: ChartUnit): ChartUnit => ({
  ...unit,
  positions: unit.positions?.filter((p) => p.holders.length > 0),
  children: unit.children?.map(withoutVacantUnit),
});

/** The simple chart shows no empty older-style posts («۲ پست خالی»); a seat with no person is a سمت with «خالی». Nothing is deleted. */
export const withoutVacantPosts = (company: ChartCompany): ChartCompany => ({
  ...company,
  positions: company.positions?.filter((p) => p.holders.length > 0),
  units: company.units.map(withoutVacantUnit),
});
