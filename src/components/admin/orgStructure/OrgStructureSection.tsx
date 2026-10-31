import React, { useEffect, useState } from 'react';
import { Briefcase, Building2, Layers, Link2, LayoutTemplate, ListChecks, Network } from 'lucide-react';
import { AdminCard, AdminDialog, Notice, SecondaryButton } from '../AdminUi';
import { ORG_STRUCTURE_PERMISSIONS as P, ORG_UNIT_PERMISSIONS as U, type OrgUiLevel, canNode, getChart } from '../../../services/orgStructureApi';
import { OrgChartBoard } from './OrgChartBoard';
import { CompaniesPanel, PositionsPanel, UnitsPanel } from './OrgAdminPanels';
import { OrgRulesPanel } from './OrgRulesPanel';
import { OrgLinksPanel } from './OrgLinksPanel';
import { OrgTemplatesPanel } from './OrgTemplatesPanel';
import { OrgGroupPanel } from './OrgGroupPanel';
import { OrgPlacementForm } from './OrgPlacementForm';
import { LoadingRow, useLoad } from './orgShared';
import { PlacementPick, loadPlacementBoard } from './orgPlacementData';
import { atLeast, highestLevel } from './orgUiLevel';

const SIMPLE_KEY = 'org_structure_simple_v1';
const readSimple = (): boolean => { try { return localStorage.getItem(SIMPLE_KEY) !== '0'; } catch { return true; } };

type ToolId = 'companies' | 'units' | 'positions' | 'group' | 'links' | 'templates' | 'rules';

const TOOL_TITLES: Record<ToolId, string> = {
  companies: 'شرکت‌ها', units: 'معاونت‌ها و واحدها', positions: 'سمت‌ها', group: 'چارت گروه', links: 'رابطه‌ها', templates: 'قالب‌ها', rules: 'قواعد ساختار',
};
const TOOL_ICONS: Record<ToolId, React.ComponentType<{ className?: string }>> = {
  companies: Building2, units: Network, positions: Briefcase, group: Layers, links: Link2, templates: LayoutTemplate, rules: ListChecks,
};

/**
 * «ساختار سازمانی»: one page with two cards - the «ثبت جایگاه» form and the full org chart (every
 * feature it had). What used to be separate tabs (companies, units, positions, group chart, links,
 * templates, structure rules) opens from the chart card's header, each with its own permission and
 * display level as before. Shown only when the backend has the organization-structure module (see
 * SystemAdministration); the server checks every permission again. «جایگاه من» is on the profile page.
 */
export const OrgStructureSection: React.FC<{ can: (permission: string) => boolean }> = ({ can }) => {
  const reader = Object.values(P).some(can);
  // The display level (hiding only): simple shows posts and people, normal adds the nodes, advanced adds the rest.
  const [level, setLevel] = useState<OrgUiLevel>('normal');
  useEffect(() => {
    if (!reader) return;
    let alive = true;
    getChart().then((chart) => alive && setLevel(highestLevel(chart))).catch(() => {});
    return () => { alive = false; };
  }, [reader]);
  const advanced = atLeast(level, 'advanced');

  const board = useLoad(loadPlacementBoard, 'دریافت اطلاعات ساختار سازمانی ممکن نشد.');
  const [pick, setPick] = useState<PlacementPick | null>(null);
  /** The simple view (default): the chart, one add form, the node panel. «نمای کامل» brings back every older tool. */
  const [simple, setSimple] = useState<boolean>(readSimple);
  const chooseSimple = (next: boolean) => { setSimple(next); try { localStorage.setItem(SIMPLE_KEY, next ? '1' : '0'); } catch { /* storage blocked: kept for this visit */ } };
  const [tool, setTool] = useState<ToolId | null>(null);
  /** A company asked for from the group chart: the chart opens on it. */
  const [chartCompanyId, setChartCompanyId] = useState<string | undefined>(undefined);
  /** Bumped to draw the chart again after the form saved. */
  const [chartKey, setChartKey] = useState(0);

  const tools: ToolId[] = simple ? (reader ? ['companies' as const] : []) : [
    ...(reader ? ['companies' as const] : []),
    ...(can(U.view) && atLeast(level, 'normal') ? ['units' as const] : []),
    ...(reader ? ['positions' as const] : []),
    ...(advanced && reader ? ['group' as const] : []),
    ...(advanced && canNode(can, 'view') ? ['links' as const, 'templates' as const] : []),
    // Only with its own permission (the rules change what everyone may do with the structure).
    ...(advanced && canNode(can, 'manageRules') ? ['rules' as const] : []),
  ];

  if (!reader) return <Notice type="info">دسترسی به ساختار سازمانی برای شما فعال نیست.</Notice>;
  if (board.loading && !board.data) return <LoadingRow />;
  if (!board.data) return <Notice type="error">{board.error ?? 'دریافت اطلاعات ساختار سازمانی ممکن نشد.'}</Notice>;

  const close = () => { setTool(null); setChartKey((k) => k + 1); void board.reload(); };
  return (
    <div className="space-y-4">
      {board.error && <Notice type="error">{board.error}</Notice>}
      {!simple && <OrgPlacementForm
        board={board.data}
        pick={pick}
        canAssign={can(P.manageAssignments)}
        canCreateUnits={canNode(can, 'create') || can(U.create)}
        canCreatePositions={can(P.managePositions)}
        onSaved={async () => { setChartKey((k) => k + 1); await board.reload(); }}
        onTool={(id) => setTool(id)}
      />}
      <AdminCard className="p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-extrabold text-slate-900 dark:text-white">چارت سازمانی</h3>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => chooseSimple(!simple)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-200 dark:border-indigo-800 text-xs font-bold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 cursor-pointer">{simple ? 'نمای کامل (ابزارهای قدیمی)' : 'نمای ساده'}</button>
            {tools.map((id) => {
              const Icon = TOOL_ICONS[id];
              return (
                <button key={id} type="button" onClick={() => setTool(id)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer">
                  <Icon className="w-3.5 h-3.5" /> {TOOL_TITLES[id]}
                </button>
              );
            })}
          </div>
        </div>
        <OrgChartBoard
          reloadToken={chartKey}
          can={can}
          onLevelChange={setLevel}
          initialCompanyId={chartCompanyId}
          simple={simple}
          onPlacementPick={(next) => setPick({ ...next, at: Date.now() })}
        />
      </AdminCard>
      {tool && (
        <AdminDialog wide title={TOOL_TITLES[tool]} onClose={close} footer={<SecondaryButton onClick={close}>بستن</SecondaryButton>}>
          {tool === 'companies' && <CompaniesPanel canManage={can(P.manageCompanies)} canSeeUnits={can(U.view)} advanced={advanced} />}
          {tool === 'units' && <UnitsPanel canCreate={can(U.create)} canUpdate={can(U.update)} canDeactivate={can(U.delete)} />}
          {tool === 'positions' && <PositionsPanel canManage={can(P.managePositions)} />}
          {tool === 'group' && <OrgGroupPanel canEdit={can(P.manageCompanies)} onOpenCompany={(id) => { setChartCompanyId(id); close(); }} />}
          {tool === 'links' && <OrgLinksPanel canEditLinks={canNode(can, 'update')} canManageTypes={canNode(can, 'manageRules')} />}
          {tool === 'templates' && <OrgTemplatesPanel canManageTemplates={canNode(can, 'manageTemplates')} canCreateCompany={can(P.manageCompanies)} />}
          {tool === 'rules' && <OrgRulesPanel canApplyPosts={can(P.managePositions)} />}
        </AdminDialog>
      )}
    </div>
  );
};
