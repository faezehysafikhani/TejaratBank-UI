import React, { useMemo } from 'react';
import { Field } from '../AdminUi';
import {
  Company, CompanyUnitLink, OrgNode, OrgUnit, Position,
  listCompanies, listCompanyUnits, listNodes, listOrgUnits, listPositions,
} from '../../../services/orgStructureApi';
import { useLoad, UserPicker } from './orgShared';
import { OrgPlacementTree } from './OrgPlacementTree';

export interface OrgPlacementDraft {
  companyId: string;
  unitId: string;
  positionId: string;
  managerUserId: string | null;
  managerName: string | null;
}

export const EMPTY_PLACEMENT_DRAFT: OrgPlacementDraft = {
  companyId: '', unitId: '', positionId: '', managerUserId: null, managerName: null,
};

export interface OrgPlacementData {
  companies: Company[];
  positions: Position[];
  links: CompanyUnitLink[];
  units: OrgUnit[];
}

const EMPTY_PLACEMENT_DATA: OrgPlacementData = { companies: [], positions: [], links: [], units: [] };

/**
 * Every node of a company as a place to put someone: a nested node is named with the nodes above
 * it («معاونت مالی ‹ اداره کل حسابداری»), so the list reads as the structure does.
 */
export function linksOfNodes(nodes: OrgNode[], companies: Company[], topLinks: CompanyUnitLink[]): CompanyUnitLink[] {
  const byId = new Map<string, OrgNode>(nodes.map((n) => [n.id, n]));
  const companyName = new Map(companies.map((c) => [c.id, c.name]));
  const seen = new Set<string>();
  const nameOf = (node: OrgNode): string => {
    const names = [node.name];
    seen.clear();
    for (let parent = node.parentNodeId ? byId.get(node.parentNodeId) : undefined; parent && !seen.has(parent.id); parent = parent.parentNodeId ? byId.get(parent.parentNodeId) : undefined) {
      seen.add(parent.id);
      names.unshift(parent.name);
    }
    return names.join(' ‹ ');
  };
  const links = nodes
    .filter((n) => n.companyId && companyName.has(n.companyId))
    .map((n) => ({ unitId: n.id, unitName: nameOf(n), companyId: n.companyId!, companyName: companyName.get(n.companyId!)! }));
  // A company's top node the node list did not give a company to: keep its link.
  const listed = new Set(links.map((l) => l.unitId));
  return [...links, ...topLinks.filter((l) => !listed.has(l.unitId))];
}

/**
 * Companies, positions and units needed to render the placement fields below.
 * `enabled=false` skips the network calls entirely (the caller doesn't have the permission, or
 * the «جایگاه سازمانی» tab isn't shown) while still respecting the rules of hooks.
 */
export function useOrgPlacementData(canSeeUnits: boolean, enabled: boolean) {
  return useLoad<OrgPlacementData>(async () => {
    if (!enabled) return EMPTY_PLACEMENT_DATA;
    const [companies, positions, topLinks, units, nodes] = await Promise.all([
      listCompanies(), listPositions(), listCompanyUnits(),
      canSeeUnits ? listOrgUnits() : Promise.resolve([] as OrgUnit[]),
      // Nested nodes are in no company link (only a company's top nodes are); an older backend: none.
      listNodes().catch(() => [] as OrgNode[]),
    ]);
    return { companies, positions, links: nodes.length > 0 ? linksOfNodes(nodes, companies, topLinks) : topLinks, units };
  }, 'دریافت اطلاعات ساختار سازمانی ممکن نشد.');
}

/**
 * «شرکت / معاونت‌وواحد / سمت / مدیر مستقیم»: a user's place in the org structure. Shared by the
 * user-creation/edit dialog's «جایگاه سازمانی» tab (this module has no other caller left since
 * the organizational section's own assignment dialog was retired in favor of this one).
 */
export const OrgPlacementFields: React.FC<{
  draft: OrgPlacementDraft;
  onChange: (next: OrgPlacementDraft) => void;
  data: OrgPlacementData;
  excludeManagerIds?: string[];
}> = ({ draft, onChange, data, excludeManagerIds = [] }) => {
  // Deputies come from the company links (they carry the names); with the unit list at hand an
  // inactive deputy is left out unless it is the current choice.
  const links = useMemo(() => {
    const inactive = new Set(data.units.filter((u) => !u.isActive).map((u) => u.id));
    return data.links.filter((l) => !inactive.has(l.unitId) || l.unitId === draft.unitId);
  }, [data, draft.unitId]);

  return (
    <>
      {/* Not inside a <label> (Field): a label forwards clicks to its first control. */}
      <div className="space-y-1.5">
        <span className="block text-xs font-bold text-slate-700 dark:text-slate-300">شرکت، معاونت و سمت</span>
        <OrgPlacementTree
          companies={data.companies}
          links={links}
          positions={data.positions}
          value={{ companyId: draft.companyId, unitId: draft.unitId, positionId: draft.positionId }}
          onChange={(choice) => onChange({ ...draft, ...choice })}
        />
        <p className="text-[11px] text-slate-500 dark:text-slate-400">با + فهرست زیرمجموعه باز می‌شود؛ روی هر ردیف بزنید تا انتخاب شود.</p>
      </div>
      <Field label="مدیر مستقیم (اختیاری)" hint="خالی بگذارید تا مدیر از مدیر واحد یا رئیس کل شرکت گرفته شود.">
        <UserPicker
          value={draft.managerUserId}
          valueLabel={draft.managerName}
          onChange={(id, name) => onChange({ ...draft, managerUserId: id, managerName: name })}
          excludeIds={excludeManagerIds}
        />
      </Field>
    </>
  );
};
