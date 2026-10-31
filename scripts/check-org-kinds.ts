// Checks the simple chart's kinds table, tree building, search and the outline (templates).
import assert from 'node:assert/strict';
import type { KindNode } from '../src/services/orgStructureApi';
import { ALLOWED_CHILDREN, DEFAULT_CHILD, TEMPLATES, buildTree, canContain, countBelow, matches, parseOutline, pathsToMatches } from '../src/components/admin/orgStructure/kinds/orgKinds';

// The same table as OrgNodeKinds.cs (Pairs): 5 allowed pairs.
const pairs = (['org', 'unit', 'position'] as const).flatMap((p) => ALLOWED_CHILDREN[p].map((c) => `${p}>${c}`)).sort();
assert.deepEqual(pairs, ['org>position', 'org>unit', 'position>position', 'unit>position', 'unit>unit']);
assert.equal(canContain('position', 'unit'), false);
assert.deepEqual(DEFAULT_CHILD, { org: 'unit', unit: 'position', position: 'position' });

const node = (id: string, name: string, kind: 'unit' | 'position', parent: string | null, extra: Partial<KindNode> = {}): KindNode => ({
  id, name, kind, parentNodeId: parent, companyId: 'c1', isActive: true, sortOrder: 0, rowVersion: '', headNodeId: null, persons: [], ...extra,
});
const nodes: KindNode[] = [
  node('u1', 'معاونت مالی', 'unit', null, { headNodeId: 'p2', sortOrder: 1 }),
  node('p1', 'کارشناس مالی', 'position', 'u1', { sortOrder: 0, persons: [{ userId: 'a', displayName: 'نیما', isPrimary: true }, { userId: 'b', displayName: 'سارا', isPrimary: false }] }),
  node('p2', 'مدیر مالی', 'position', 'u1', { sortOrder: 5 }),
  node('p3', 'حسابدار', 'position', 'p1'),
  node('u2', 'معاونت فنی', 'unit', null, { sortOrder: 0 }),
  node('x', 'جای دیگر', 'unit', null, { companyId: 'c2' }),
];
const tree = buildTree(nodes, 'c1');
assert.deepEqual(tree.map((n) => n.name), ['معاونت فنی', 'معاونت مالی'], 'top nodes by order, other companies left out');
assert.deepEqual(tree[1].children.map((n) => n.id), ['p2', 'p1'], 'the head is first among a unit\'s children');
assert.equal(countBelow(tree[1]), 3);
assert.equal(matches(tree[1], 'سارا'), true, 'a person\'s name matches the unit above');
assert.equal(matches(tree[0], 'سارا'), false);
assert.deepEqual([...pathsToMatches(tree, 'حسابدار')].sort(), ['p1', 'u1'], 'the path to a match opens');

const ok = parseOutline('معاونت\n  سمت: مدیر\n    سمت: کارشناس', 'org');
assert.deepEqual(ok.errors, []);
assert.deepEqual(ok.lines.map((l) => [l.depth, l.kind]), [[0, 'unit'], [1, 'position'], [2, 'position']]);
assert.equal(parseOutline('سمت: مدیر\n  معاونت').errors.length, 1, 'a unit under a position is refused');
assert.equal(parseOutline('معاونت\n    سمت: مدیر').errors.length, 1, 'a jump of two levels is refused');
for (const t of TEMPLATES) assert.deepEqual(parseOutline(t.text).errors, [], `template ${t.id} is valid`);
console.log('org kinds OK');
