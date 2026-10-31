// What may sit under what, as the screens ask it (the server checks every change again): which node
// types may be added at the top or under a node, and where a node may be moved. Pure functions of the
// chart and the rules, so the drag and drop, the «افزودن» button and the move dialog agree.
import type { ChartCompany, ChartUnit, NodeType, NodeTypeRule } from '../../../services/orgStructureApi';
import { allUnitsOf, ancestorsOf } from './orgChartModel';

/**
 * Whether a node of the child type may sit under a node of the parent type (parentTypeId null: at the
 * top, directly under the company). No rules at all is the flat structure: every type at the top and
 * nothing under anything. A node without a type is not restricted.
 */
export function canNestType(rules: NodeTypeRule[], childTypeId: string | null | undefined, parentTypeId: string | null | undefined): boolean {
  if (rules.length === 0) return !parentTypeId;
  if (!childTypeId) return true;
  return rules.some((r) => r.childNodeTypeId === childTypeId && (r.parentNodeTypeId ?? null) === (parentTypeId ?? null));
}

/** The active types a new node may have at the top (parent null) or under the given node. */
export function addableTypes(types: NodeType[], rules: NodeTypeRule[], parent: ChartUnit | null): NodeType[] {
  const parentTypeId = parent?.nodeType?.nodeTypeId ?? null;
  if (parent && !parentTypeId) return rules.length === 0 ? [] : types.filter((t) => t.isActive);
  return types.filter((t) => t.isActive && canNestType(rules, t.id, parentTypeId));
}

/** Whether `targetId` is the node itself or below it: a node cannot be put there. */
export function isInOwnSubtree(unit: ChartUnit, targetId: string): boolean {
  if (unit.unitId === targetId) return true;
  return (unit.children || []).some((child) => isInOwnSubtree(child, targetId));
}

export type MoveCheck = { ok: true } | { ok: false; reason: string };

/** Whether the node may be put under `target` (null: at the top of its company), and if not, why. */
export function checkMove(unit: ChartUnit, target: ChartUnit | null, rules: NodeTypeRule[]): MoveCheck {
  if (target && isInOwnSubtree(unit, target.unitId)) {
    return { ok: false, reason: target.unitId === unit.unitId ? 'گره را نمی‌شود زیر خودش گذاشت.' : 'گره را نمی‌شود زیر زیرمجموعه‌ی خودش گذاشت.' };
  }
  if ((unit.parentNodeId ?? null) === (target?.unitId ?? null)) return { ok: false, reason: 'گره همین‌جا هست.' };
  if (target && target.isActive === false) return { ok: false, reason: 'زیر گره‌ی غیرفعال نمی‌شود گذاشت.' };
  const childType = unit.nodeType?.nodeTypeId;
  const parentType = target?.nodeType?.nodeTypeId ?? null;
  if (!canNestType(rules, childType, parentType)) {
    if (rules.length === 0) return { ok: false, reason: 'هنوز قاعده‌ای برای «سلسله‌مراتب مجاز» تعریف نشده است؛ ساختار مسطح است.' };
    const childName = unit.nodeType?.name || 'این گره';
    return { ok: false, reason: target ? `«${childName}» را نمی‌شود زیر «${target.nodeType?.name || target.name}» گذاشت.` : `«${childName}» را نمی‌شود در بالاترین سطح گذاشت.` };
  }
  return { ok: true };
}

/** Where a node may be moved: each possible parent (nearest to the top first) with its path, and whether the top is possible. */
export function moveTargets(company: ChartCompany, unit: ChartUnit, rules: NodeTypeRule[]): { top: boolean; targets: { unit: ChartUnit; path: string }[] } {
  const targets = allUnitsOf(company)
    .filter((candidate) => checkMove(unit, candidate, rules).ok)
    .map((candidate) => ({ unit: candidate, path: [...ancestorsOf(company, candidate.unitId)].reverse().map((a) => a.name).concat(candidate.name).join(' ‹ ') }));
  return { top: checkMove(unit, null, rules).ok, targets };
}

/** The types of the nodes that no longer match the rules (for the rules page). */
export const ruleKey = (rule: NodeTypeRule) => `${rule.parentNodeTypeId ?? 'company'}>${rule.childNodeTypeId}`;
