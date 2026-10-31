// Checks the simple chart's kinds table, tree building, search and the outline (templates).
import assert from 'node:assert/strict';
import type { KindNode } from '../src/services/orgStructureApi';
import { centerTop, clampScale, fitScaleFor, isInSight, zoomAround } from '../src/components/admin/orgStructure/panMath';
import { ALLOWED_CHILDREN, DEFAULT_CHILD, TEMPLATES, buildTree, canContain, countBelow, inListOrder, isSelfOrBelow, leafColumns, matches, moveTargets, parseOutline, pathsToMatches, rankTargets, serverOrder, splitChildren } from '../src/components/admin/orgStructure/kinds/orgKinds';

// The same table as OrgNodeKinds.cs (Pairs): 5 allowed pairs.
const pairs = (['org', 'unit', 'position'] as const).flatMap((p) => ALLOWED_CHILDREN[p].map((c) => `${p}>${c}`)).sort();
assert.deepEqual(pairs, ['org>position', 'org>unit', 'position>position', 'position>unit', 'unit>position', 'unit>unit']);
assert.equal(canContain('position', 'unit'), true, 'a position may hold units (a CEO with deputies)');
assert.equal(canContain('unit', 'position'), true);
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
assert.deepEqual(parseOutline('سمت: مدیرعامل\n  معاونت\n    اداره کل').errors, [], 'units under a position are allowed');
assert.equal(parseOutline('معاونت\n    سمت: مدیر').errors.length, 1, 'a jump of two levels is refused');
for (const t of TEMPLATES) assert.deepEqual(parseOutline(t.text).errors, [], `template ${t.id} is valid`);

// A bank chain: مجمع عمومی ← هیأت مدیره ← مدیرعامل ← معاونت ← اداره کل
const chain = parseOutline('سمت: مجمع عمومی\n  سمت: هیأت مدیره\n    سمت: مدیرعامل\n      معاونت اعتباری\n        اداره کل وصول', 'org');
assert.deepEqual(chain.errors, []);
assert.deepEqual(chain.lines.map((l) => l.kind), ['position', 'position', 'position', 'unit', 'unit']);

// Moving: never itself or what is below it; a unit may go under a position, a position under a unit.
const tree2 = buildTree([
  node('ceo', 'مدیرعامل', 'position', null),
  node('d1', 'معاونت مالی', 'unit', null),
  node('d1a', 'اداره کل حسابداری', 'unit', 'd1'),
  node('d1p', 'مدیر مالی', 'position', 'd1'),
], 'c1');
const d1 = tree2.find((n) => n.id === 'd1')!;
const targets = moveTargets(tree2, d1, 'بانک').map((t) => t.id);
assert.ok(targets.includes(null), 'the organization (top) is a place');
assert.ok(targets.includes('ceo'), 'a unit may go under the CEO (a position)');
assert.ok(!targets.includes('d1') && !targets.includes('d1a') && !targets.includes('d1p'), 'never itself or below it');
assert.equal(isSelfOrBelow(tree2, 'd1', 'd1a'), true);
assert.equal(isSelfOrBelow(tree2, 'd1a', 'd1'), false);

// ---- zoom around the pointer: the content point under the pointer stays under it
const v0 = { x: 40, y: 20, s: 0.5 };
const z = zoomAround(v0, 300, 200, 2, 0.1, 2);
assert.equal(z.s, 1);
assert.equal(z.x + ((300 - v0.x) / v0.s) * z.s, 300, 'the point under the pointer stays (x)');
assert.equal(z.y + ((200 - v0.y) / v0.s) * z.s, 200, 'the point under the pointer stays (y)');
assert.equal(zoomAround(v0, 0, 0, 100, 0.1, 2).s, 2, 'at most 200%');
assert.equal(zoomAround(v0, 0, 0, 0.001, 0.1, 2).s, 0.1, 'at least 10%');
assert.equal(clampScale(5, 0.1, 2), 2);

// ---- fit and centring
assert.equal(fitScaleFor({ w: 500, h: 300 }, { w: 1000, h: 700 }, 24, 24), 1, 'a small chart is not enlarged');
const fitBig = fitScaleFor({ w: 4000, h: 1000 }, { w: 1000, h: 600 }, 24, 24);
assert.ok(Math.abs(fitBig - (1000 - 48) / 4000) < 1e-9, 'a wide chart is fitted by its width');
assert.equal(fitScaleFor({ w: 0, h: 0 }, { w: 1000, h: 600 }, 24, 24), 1, 'no size yet: no change');
const c = centerTop({ x: 900, y: 10, w: 100, h: 50 }, 0.5, { w: 800 }, 24);
assert.equal(c.x + 950 * 0.5, 400, 'the card is in the middle');
assert.equal(c.y + 10 * 0.5, 24, 'and at the top');
assert.equal(isInSight({ x: 0, y: 0, s: 1 }, { w: 100, h: 100 }, { w: 500, h: 500 }), true);
assert.equal(isInSight({ x: 600, y: 0, s: 1 }, { w: 100, h: 100 }, { w: 500, h: 500 }), false, 'a chart off the canvas is not in sight (it would show empty)');

// ---- what the tree draws under a node: branches first, leaves after (a grid when there are many)
const kid = (id: string, name: string, kids: string[] = []) => ({ ...node(id, name, 'position', 'p'), children: kids.map((k) => ({ ...node(k, k, 'position', id), children: [] })) });
const nineteen = [
  ...Array.from({ length: 10 }, (_, i) => kid(`l${i}`, `مشاور ${i}`)),
  ...Array.from({ length: 9 }, (_, i) => kid(`u${i}`, `معاونت ${i}`, ['x'])),
];
const split = splitChildren(nineteen);
assert.equal(split.branches.length, 9);
assert.equal(split.leaves.length, 10);
assert.equal(split.grid, true, 'more than six children: the leaves are a block');
assert.deepEqual(split.branches.map((b) => b.id), nineteen.filter((n) => n.children.length).map((n) => n.id), 'units come first, in order');
assert.equal(splitChildren(nineteen.slice(0, 2)).grid, false, 'two children stay in a row');
assert.equal(splitChildren(nineteen.slice(0, 4)).grid, true, 'four leaves under a node make a block (a narrow chart)');
assert.equal(splitChildren([nineteen[10], nineteen[11], ...nineteen.slice(0, 3)]).grid, false, 'two branches and three leaves: five children stay in a row');
assert.equal(leafColumns(3), 1);
assert.equal(leafColumns(7), 2);
assert.equal(leafColumns(10), 2);
assert.equal(leafColumns(100), 4);
assert.equal(leafColumns(100), 4, 'at most four columns');

// ---- order: the server's order, and several moving together keep the list's order
const sibs = [node('a', 'ب', 'unit', null, { sortOrder: 2 }), node('b', 'الف', 'unit', null, { sortOrder: 0 }), node('c', 'ج', 'unit', null, { sortOrder: 1 })].map((n) => ({ ...n, children: [] }));
assert.deepEqual(serverOrder(sibs).map((n) => n.id), ['b', 'c', 'a']);
assert.deepEqual(inListOrder(serverOrder(sibs), new Set(['a', 'b'])).map((n) => n.id), ['b', 'a'], 'the order of the list, not of the clicks');

// ---- move search: the node's own name first
const ranked = rankTargets([
  { name: 'اداره کل', path: 'مدیرعامل › اداره کل' },
  { name: 'معاونت', path: 'مدیرعامل › معاونت' },
  { name: 'مدیرعامل', path: 'مجمع › مدیرعامل' },
  { name: 'مشاور', path: 'مدیرعامل › مشاور' },
], 'مدیرعامل');
assert.equal(ranked[0].name, 'مدیرعامل', 'the node named so comes before the nodes only below it');
assert.equal(ranked.length, 4);
assert.equal(rankTargets([{ name: 'الف', path: 'ب' }], 'zzz').length, 0);
console.log('org kinds OK');
