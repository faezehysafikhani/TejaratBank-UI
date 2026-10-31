// Checks the tidy chart's model (src/components/admin/orgStructure/tidyChartModel.ts): the chain, the
// committees, the columns by node type, filled and vacant posts, collapsing the vacant ones, and the
// saved choice of view (also with a broken localStorage). Run: npm run check:org-tidy
import assert from 'node:assert/strict';
import { ORG_CHART_MOCKS } from '../src/mocks/orgChart/charts';
import type { ChartCompany, ChartPosition, ChartUnit } from '../src/services/orgStructureApi';
import { allUnitsOf } from '../src/components/admin/orgStructure/orgChartModel';
import {
  CHART_VIEW_KEY, allOpenSet, defaultOpenSet, defaultView, isCommittee, layoutOf, peopleCountOf, postRowsOf, readSavedCompany, readSavedView, saveCompany, saveView,
} from '../src/components/admin/orgStructure/tidyChartModel';

// ---- the bank: a chain, five committees, columns by type
const bank = ORG_CHART_MOCKS.postBank()[0];
const layout = layoutOf(bank);
assert.equal(layout.roots.length, 1, 'one root');
const { chain, columns } = layout.roots[0];
console.log('chain:', chain.map((u) => u.name).join(' ‹ '));
console.log('committees:', layout.committees.length, 'columns:', columns.map((c) => `${c.title}=${c.nodes.length}`).join(', '));
assert.ok(chain.length >= 2, 'the chain runs down to the first node with several children');
assert.equal(layout.committees.length, 5, 'five committees');
assert.equal(columns.length, 4, 'four columns');
assert.equal(columns.reduce((n, c) => n + c.nodes.length, 0), chain[chain.length - 1].children!.length, 'every child is in a column');
for (const column of columns) assert.ok(column.nodes.every((n) => n.nodeType?.nodeTypeId === column.nodes[0].nodeType?.nodeTypeId), 'one type per column');
assert.ok(layout.committees.every(isCommittee), 'committees are of the committee type');

// ---- a second root of another type is its own root, not a committee
const second: ChartUnit = { ...bank.units.find((u) => !isCommittee(u))!, unitId: 'second-root', children: [], nodeType: { nodeTypeId: 'assembly', name: 'مجمع عمومی', color: '#000', icon: 'x', isDomainBoundary: true } };
const two = layoutOf({ ...bank, units: [...bank.units, second] });
assert.equal(two.roots.length, 2, 'two roots');
assert.equal(two.committees.length, 5, 'still five committees');
assert.equal(two.roots[0].chain[0].unitId !== 'second-root', true, 'the bigger root comes first');

// ---- everything is reachable, and a flat chart works too
for (const name of Object.keys(ORG_CHART_MOCKS) as (keyof typeof ORG_CHART_MOCKS)[]) {
  const company = ORG_CHART_MOCKS[name]()[0];
  const l = layoutOf(company);
  const shown = new Set<string>();
  const walk = (u: ChartUnit) => { shown.add(u.unitId); (u.children || []).forEach(walk); };
  for (const root of l.roots) { root.chain.slice(0, -1).forEach((u) => shown.add(u.unitId)); walk(root.chain[root.chain.length - 1]); }
  l.committees.forEach(walk);
  assert.equal(shown.size, allUnitsOf(company).length, `${name}: the tidy chart shows every node`);
}
assert.deepEqual(layoutOf({ ...bank, units: [] }), { roots: [], committees: [] }, 'empty company');

// ---- posts: filled, vacant, collapsing
const post = (id: string, sortOrder: number, holders: string[], isActive = true): ChartPosition => ({
  unitPositionId: id, positionId: id, title: id, sortOrder, isActive,
  holders: holders.map((h) => ({ userId: h, displayName: h, isActive: true, positionTitle: id, managerUserId: null })),
});
const unit = (positions: ChartPosition[]): ChartUnit => ({ unitId: 'u', name: 'u', manager: null, members: [], positions });
const rows = postRowsOf(unit([post('c', 3, []), post('a', 1, ['x']), post('b', 2, ['y', 'z']), post('off', 0, ['q'], false), post('d', 4, [])]), false);
assert.deepEqual(rows.filled.map((r) => `${r.post.unitPositionId}:${r.holder.userId}`), ['a:x', 'b:y', 'b:z'], 'filled posts in order, one row per holder, inactive left out');
assert.deepEqual(rows.vacant.map((p) => p.unitPositionId), ['c', 'd'], 'vacant in order');
assert.equal(rows.collapseVacant, true, 'two vacant posts become one bar');
assert.equal(postRowsOf(unit([post('c', 1, []), post('a', 2, ['x'])]), false).collapseVacant, false, 'one vacant post is shown as it is');
assert.equal(postRowsOf(unit([post('c', 1, []), post('d', 2, [])]), true).collapseVacant, false, 'show-empty lists them all');

// ---- people and the first open set
assert.equal(peopleCountOf({ ...unit([post('a', 1, ['x', 'y'])]), members: [{ userId: 'x', displayName: 'x', isActive: true, positionTitle: null, managerUserId: null }], children: [unit([post('b', 1, ['y', 'z'])])] }), 3, 'each person once');
const company: ChartCompany = { companyId: 'c', name: 'c', code: 'c', isActive: true, manager: null, members: [], units: [{ ...unit([post('a', 1, [])]), unitId: 'empty' }, { ...unit([post('a', 1, ['x'])]), unitId: 'full' }] };
assert.deepEqual([...defaultOpenSet(company)], ['full'], 'only nodes with people start open');
assert.ok(allOpenSet(company).has('vac:empty'), 'open all opens the vacant bars too');

// ---- the saved view, also with storage that fails
assert.equal(defaultView(30), 'tree');
assert.equal(defaultView(31), 'tidy');
const memory = new Map<string, string>();
const good = { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => { memory.set(k, v); } };
assert.equal(readSavedView(good), null, 'nothing saved');
saveView('tidy', good);
assert.equal(memory.get(CHART_VIEW_KEY), 'tidy');
assert.equal(readSavedView(good), 'tidy');
memory.set(CHART_VIEW_KEY, 'junk');
assert.equal(readSavedView(good), null, 'a damaged value is ignored');
const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
assert.equal(readSavedView(broken), null, 'a failing read gives the default');
assert.doesNotThrow(() => saveView('tree', broken), 'a failing write is ignored');
assert.equal(readSavedView(null), null);
assert.equal(readSavedCompany({ getItem: () => 'c1' }), 'c1');
assert.equal(readSavedCompany({ getItem: () => { throw new Error('blocked'); } }), null);
assert.doesNotThrow(() => saveCompany('c1', { setItem: () => { throw new Error('blocked'); } }));

console.log('org tidy chart OK');
