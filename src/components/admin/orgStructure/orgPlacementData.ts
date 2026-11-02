import {
  Company, NodeType, NodeTypeRule, OrgNode, Position, UnitPosition,
  getNodeTypeRules, listCompanies, listNodeTypes, listNodes, listPositions, listUnitPositions,
} from '../../../services/orgStructureApi';

/** What the placement form and the chart beside it both draw on. */
export interface OrgPlacementBoard {
  companies: Company[];
  nodes: OrgNode[];
  positions: Position[];
  posts: UnitPosition[];
  /** The types and rules (a unit made from the form gets one of the types allowed at the top). */
  nodeTypes: NodeType[];
  rules: NodeTypeRule[];
}

export const loadPlacementBoard = async (): Promise<OrgPlacementBoard> => {
  const [companies, nodes, positions, posts, nodeTypes, rules] = await Promise.all([
    listCompanies(), listNodes(), listPositions(), listUnitPositions(),
    listNodeTypes().catch(() => [] as NodeType[]),
    getNodeTypeRules().then((r) => r.rules).catch(() => [] as NodeTypeRule[]),
  ]);
  return { companies, nodes, positions, posts, nodeTypes, rules };
};

/** A node named with the ones above it, so a nested node reads as the structure does. */
export function nodePath(node: OrgNode, byId: Map<string, OrgNode>): string {
  const names = [node.name];
  const seen = new Set<string>([node.id]);
  for (let parent = node.parentNodeId ? byId.get(node.parentNodeId) : undefined; parent && !seen.has(parent.id); parent = parent.parentNodeId ? byId.get(parent.parentNodeId) : undefined) {
    seen.add(parent.id);
    names.unshift(parent.name);
  }
  return names.join(' ‹ ');
}

/** What the chart asks the form to fill (a click on a company, a unit or a post). */
export interface PlacementPick {
  /** Changes on every click, so the same card clicked twice fills the form twice. */
  at: number;
  companyId: string;
  unitId?: string;
  positionId?: string;
  userId?: string | null;
  userName?: string | null;
}
