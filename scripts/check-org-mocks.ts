// Checks the org chart mocks (src/mocks/orgChart) and the chart model's nested-structure helpers:
// every mock is a consistent chart in the shape GET /chart sends (units: the top nodes; children:
// the nodes under each, nested), the flat one is exactly today's shape, and the helpers give
// today's results on flat data. Run: npm run check:org-mocks
import assert from 'node:assert/strict';
import { ORG_CHART_MOCKS, type OrgChartMockName } from '../src/mocks/orgChart/charts';
import type { ChartUnit } from '../src/services/orgStructureApi';
import { allPositions, allUnitsOf, ancestorsOf, companyHeadcount, findMember, isNested, linksOf, unitTree } from '../src/components/admin/orgStructure/orgChartModel';

const NEW_FIELDS = ['parentNodeId', 'children', 'nodeType', 'links'] as const;
const expectedNodes: Record<OrgChartMockName, number> = { flat: 3, nested: 5, postBank: 52, large40: 40, large400: 400 };

for (const name of Object.keys(ORG_CHART_MOCKS) as OrgChartMockName[]) {
  const chart = ORG_CHART_MOCKS[name]();
  assert.equal(chart.length, 1, `${name}: one company`);
  const company = chart[0];
  const all = allUnitsOf(company);
  const byId = new Map(all.map((u) => [u.unitId, u] as const));
  assert.equal(byId.size, all.length, `${name}: unique node ids`);
  assert.equal(all.length, expectedNodes[name], `${name}: node count`);

  // Same mock, same chart.
  assert.deepEqual(ORG_CHART_MOCKS[name](), chart, `${name}: deterministic`);

  // The company's units are its top nodes; every child points back at the node it is nested in.
  for (const top of company.units) assert.ok(!top.parentNodeId, `${name}: ${top.name} at the top has no parent`);
  for (const unit of all) {
    for (const child of unit.children || []) {
      assert.equal(child.parentNodeId, unit.unitId, `${name}: child ${child.name} of ${unit.name} points back`);
    }
    for (const link of unit.links || []) {
      assert.ok(byId.has(link.targetNodeId) && link.targetNodeId !== unit.unitId, `${name}: link of ${unit.name} has a target`);
      if (link.lineStyle === 'dotted') assert.equal(link.countsAsManager, false, `${name}: dotted link counts as manager`);
    }
    assert.ok(ancestorsOf(company, unit.unitId).length < all.length, `${name}: ancestors end`);
  }

  // The tree shows every node once, parents before their children, at the depth of its ancestors.
  const tree = unitTree(company);
  assert.equal(tree.length, all.length, `${name}: tree covers every node`);
  const at = new Map(tree.map((t, i) => [t.unit.unitId, i] as const));
  for (const { unit, depth } of tree) {
    if (unit.parentNodeId) assert.ok(at.get(unit.parentNodeId)! < at.get(unit.unitId)!, `${name}: parent before child`);
    assert.equal(depth, ancestorsOf(company, unit.unitId).length, `${name}: depth = number of ancestors`);
    if (depth > 0) assert.equal(ancestorsOf(company, unit.unitId)[0].unitId, unit.parentNodeId, `${name}: nearest ancestor = parent`);
  }

  // One company head, wherever its post is (directly in the company, or the CEO office's).
  const posts = [...(company.positions || []), ...all.flatMap((u: ChartUnit) => u.positions || [])];
  assert.equal(posts.filter((p) => p.isHead).length, 1, `${name}: one company head`);
  assert.ok(companyHeadcount(company) > 0, `${name}: people counted`);

  if (name === 'flat') {
    // Exactly what an older backend / a flat company sends: none of the new fields.
    for (const unit of company.units) for (const field of NEW_FIELDS) assert.ok(!(field in unit), `flat: no ${field}`);
    assert.ok(!('uiLevel' in company), 'flat: no uiLevel');
    assert.equal(isNested(company), false);
    assert.deepEqual(tree.map((t) => [t.unit.unitId, t.depth]), company.units.map((u) => [u.unitId, 0]), 'flat: tree = list order, depth 0');
    assert.equal(linksOf(company).length, 0);
    // Today's helpers, on today's data.
    const head = allPositions(chart).find((p) => p.position.isHead)!;
    assert.ok(findMember(chart, head.position.holders[0].userId), 'flat: head found as a member');
  } else {
    assert.equal(isNested(company), true, `${name}: nested`);
  }

  const depth = Math.max(...tree.map((t) => t.depth));
  console.log(`${name.padEnd(9)} nodes=${String(all.length).padStart(3)} top=${String(company.units.length).padStart(3)} posts=${String(posts.length).padStart(4)} people=${String(companyHeadcount(company)).padStart(4)} depth=${depth} links=${linksOf(company).length}`);
}

// Post Bank: the five committees (top nodes) each have a dotted line to the board; the path of a department.
const bank = ORG_CHART_MOCKS.postBank()[0];
const bankAll = allUnitsOf(bank);
const board = bankAll.find((u) => u.name === 'هیأت مدیره')!;
const committees = bankAll.filter((u) => u.nodeType?.nodeTypeId === 'type-committee');
assert.equal(committees.length, 5);
for (const committee of committees) {
  assert.ok(bank.units.includes(committee), 'a committee is a top node');
  assert.ok(committee.links?.some((l) => l.targetNodeId === board.unitId && l.lineStyle === 'dotted'));
}
assert.deepEqual(ancestorsOf(bank, bankAll.find((u) => u.name === 'اداره کل اعتبارات')!.unitId).map((u) => u.name),
  ['معاونت اعتباری و بین‌الملل', 'مدیریت عامل', 'هیأت مدیره', 'مجمع عمومی']);

console.log('org chart mocks OK');
