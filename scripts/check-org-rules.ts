// Checks the pure «what may sit under what» helpers of the chart screens (orgNodeRules.ts), on the
// mock charts. Run: npm run check:org-rules
import assert from 'node:assert/strict';
import { ORG_CHART_MOCKS } from '../src/mocks/orgChart/charts';
import type { NodeType, NodeTypeRule } from '../src/services/orgStructureApi';
import { allUnitsOf } from '../src/components/admin/orgStructure/orgChartModel';
import { addableTypes, canNestType, checkMove, moveTargets } from '../src/components/admin/orgStructure/orgNodeRules';

const company = ORG_CHART_MOCKS.postBank()[0];
const all = allUnitsOf(company);
const typeOf = (key: string) => all.find((u) => u.nodeType?.nodeTypeId === key || u.nodeType?.name === key)?.nodeType;
const byName = (name: string) => all.find((u) => u.name === name)!;

const assembly = byName('مجمع عمومی').nodeType!;
const board = byName('هیأت مدیره').nodeType!;
const ceo = byName('مدیریت عامل').nodeType!;
const deputy = byName('معاونت فناوری اطلاعات').nodeType!;
const department = byName('اداره کل امنیت و زیرساخت').nodeType!;
const rules: NodeTypeRule[] = [
  { parentNodeTypeId: null, childNodeTypeId: assembly.nodeTypeId },
  { parentNodeTypeId: assembly.nodeTypeId, childNodeTypeId: board.nodeTypeId },
  { parentNodeTypeId: board.nodeTypeId, childNodeTypeId: ceo.nodeTypeId },
  { parentNodeTypeId: ceo.nodeTypeId, childNodeTypeId: deputy.nodeTypeId },
  { parentNodeTypeId: deputy.nodeTypeId, childNodeTypeId: department.nodeTypeId },
];

// canNestType: no rules is flat; a node with no type is free; otherwise the rule must exist.
assert.equal(canNestType([], deputy.nodeTypeId, null), true);
assert.equal(canNestType([], deputy.nodeTypeId, ceo.nodeTypeId), false);
assert.equal(canNestType(rules, department.nodeTypeId, deputy.nodeTypeId), true);
assert.equal(canNestType(rules, department.nodeTypeId, ceo.nodeTypeId), false);
assert.equal(canNestType(rules, department.nodeTypeId, null), false);
assert.equal(canNestType(rules, null, deputy.nodeTypeId), true);

// addableTypes: only the types a rule allows there.
const types: NodeType[] = [assembly, board, ceo, deputy, department].map((t, i) => ({ id: t.nodeTypeId, code: t.nodeTypeId, name: t.name, color: t.color, icon: t.icon, isDomainBoundary: t.isDomainBoundary, sortOrder: i, isActive: true, nodeCount: 1 }));
assert.deepEqual(addableTypes(types, rules, byName('معاونت فناوری اطلاعات')).map((t) => t.name), [department.name]);
assert.deepEqual(addableTypes(types, rules, null).map((t) => t.name), [assembly.name]);
assert.equal(addableTypes(types, rules, byName('اداره کل امنیت و زیرساخت')).length, 0, 'nothing under a leaf type');
assert.equal(addableTypes(types, [], null).length, types.length, 'flat: every type at the top');
assert.equal(addableTypes(types, [], byName('معاونت فناوری اطلاعات')).length, 0, 'flat: nothing under a node');

// checkMove: into itself or its own subtree, onto the same parent, the wrong type, and a good move.
const it = byName('معاونت فناوری اطلاعات');
const security = byName('اداره کل امنیت و زیرساخت');
const finance = byName('معاونت مالی و سرمایه‌گذاری');
assert.equal(checkMove(it, it, rules).ok, false);
assert.equal(checkMove(ceoNode(), it, rules).ok, false, 'a node under its own descendant');
assert.equal(checkMove(security, it, rules).ok, false, 'the same parent');
assert.equal(checkMove(security, finance, rules).ok, true, 'a department to another deputy');
assert.equal(checkMove(security, null, rules).ok, false, 'a department at the top');
assert.equal(checkMove(it, byName('هیأت مدیره'), rules).ok, false, 'a deputy under the board');

// moveTargets: only valid parents; the top only where a rule allows it.
const targets = moveTargets(company, security, rules);
assert.ok(targets.targets.every((t) => t.unit.nodeType?.nodeTypeId === deputy.nodeTypeId), 'only deputies');
assert.ok(targets.targets.some((t) => t.unit.unitId === finance.unitId) && !targets.targets.some((t) => t.unit.unitId === it.unitId));
assert.equal(targets.top, false);
assert.equal(moveTargets(company, byName('مجمع عمومی'), []).targets.length, 0, 'flat: nowhere to nest');

function ceoNode() { return byName('مدیریت عامل'); }
void typeOf;
console.log('org rules OK');
