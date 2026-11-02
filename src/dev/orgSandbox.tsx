// Development only (dev/org-sandbox.html): the org structure components with mock data, to see
// and check them without an API. ?mock=flat|nested|postBank|large40|large400 picks the chart;
// ?view=section shows the whole «ساختار سازمانی» section (its tabs, the rules page too). ?view=board shows the real chart board (OrgChartBoard) on that mock, with this page's fetch
// answering its requests from memory (orgMockServer.ts); ?can=all gives it every permission.
import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import { ORG_CHART_MOCKS, type OrgChartMockName } from '../mocks/orgChart/charts';
import type { ChartNodeType } from '../services/orgStructureApi';
import { AdminCard } from '../components/admin/AdminUi';
import { allUnitsOf, unitTree } from '../components/admin/orgStructure/orgChartModel';
import { NodeTypeStylePicker, type NodeTypeStyle } from '../components/admin/orgStructure/nodes/NodeTypeStylePicker';
import { OrgNodeCard } from '../components/admin/orgStructure/nodes/OrgNodeCard';
import { NodeTypeRulesMatrix, ruleUsage, type NodeTypeRule } from '../components/admin/orgStructure/nodes/NodeTypeRulesMatrix';
import { MergeNodesForm, type MergeNodesInput } from '../components/admin/orgStructure/nodes/MergeNodesForm';
import { OrgChartBoard } from '../components/admin/orgStructure/OrgChartBoard';
import { createMockServer } from './orgMockServer';
import { OrgStructureSection } from '../components/admin/orgStructure/OrgStructureSection';

const params = new URLSearchParams(location.search);
const mockName = (params.get('mock') as OrgChartMockName) in ORG_CHART_MOCKS ? (params.get('mock') as OrgChartMockName) : 'postBank';
const boardView = params.get('view') === 'board' || params.get('view') === 'section';
const sectionView = params.get('view') === 'section';

if (boardView) {
  // This page only: the chart board's requests are answered from the mock, in memory (src/dev/orgMockServer.ts).
  const server = createMockServer(ORG_CHART_MOCKS[mockName]());
  (window as unknown as { __mockServer: typeof server }).__mockServer = server;
  window.fetch = server.fetch;
}

/** ?can=all: every permission; ?can=nomove: every one except moving (and the older permission that allowed it); else none. */
const canInSandbox = (permission: string) => {
  const mode = params.get('can');
  if (mode === 'nomove') return permission !== 'org_structure.node.move' && permission !== 'org_structure.manage_companies';
  return mode === 'all';
};

/** The real chart board on the mock, full width. */
const BoardView: React.FC = () => (
  <div className="p-4 space-y-2">
    <p className="text-xs text-slate-500">چارت واقعی روی داده‌ی ساختگی <b data-testid="mock-name">{mockName}</b> (فقط در محیط توسعه)</p>
    {sectionView ? <OrgStructureSection can={(permission) => canInSandbox(permission)} /> : <OrgChartBoard can={(permission) => canInSandbox(permission)} />}
  </div>
);

const Section: React.FC<{ id: string; title: string; children: React.ReactNode }> = ({ id, title, children }) => (
  <AdminCard className="p-5 space-y-4">
    <h2 id={id} className="text-base font-extrabold text-slate-900 dark:text-white">{title}</h2>
    {children}
  </AdminCard>
);

const Sandbox: React.FC = () => {
  const chart = useMemo(() => ORG_CHART_MOCKS[mockName](), []);
  const company = chart[0];
  const types = useMemo(() => {
    const seen = new Map<string, ChartNodeType>();
    allUnitsOf(company).forEach((u) => u.nodeType && seen.set(u.nodeType.nodeTypeId, u.nodeType));
    return [...seen.values()];
  }, [company]);

  const [style, setStyle] = useState<NodeTypeStyle>({ color: '#0f766e', icon: 'building-2' });
  const [selected, setSelected] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // The rules the mock's nodes use, as a start; the user ticks and unticks.
  const usage = useMemo(() => ruleUsage(allUnitsOf(company)), [company]);
  const [rules, setRules] = useState<NodeTypeRule[]>(() =>
    Object.keys(usage).map((key) => {
      const [parent, child] = key.split('>');
      return { parentTypeId: parent === 'company' ? null : parent, childTypeId: child };
    }));
  const [merged, setMerged] = useState<MergeNodesInput | null>(null);
  const sampleCards = unitTree(company).slice(0, 8);

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-xl font-extrabold text-slate-900 dark:text-white">پیش‌نمایش اجزای ساختار سازمانی</h1>
        <p className="text-sm text-slate-500">
          داده‌ی ساختگی: <b data-testid="mock-name">{mockName}</b> · {allUnitsOf(company).length} گره · فقط در محیط توسعه
        </p>
        <nav className="flex flex-wrap gap-2 text-xs">
          {(Object.keys(ORG_CHART_MOCKS) as OrgChartMockName[]).map((name) => (
            <a key={name} href={`?mock=${name}`} className={`px-2.5 py-1 rounded-full border ${name === mockName ? 'bg-indigo-700 text-white border-indigo-700' : 'border-slate-300 text-slate-600'}`}>{name}</a>
          ))}
        </nav>
      </header>

      <Section id="style" title="رنگ و آیکون نوع گره">
        <NodeTypeStylePicker value={style} onChange={setStyle} previewName="معاونت" />
        <p className="text-xs text-slate-500" data-testid="style-value">{style.color} · {style.icon}</p>
      </Section>

      <Section id="cards" title="کارت گره">
        <div className="flex flex-wrap gap-4">
          {sampleCards.map(({ unit }) => (
            <OrgNodeCard
              key={unit.unitId}
              unit={unit}
              selected={selected === unit.unitId}
              onSelect={() => setSelected(unit.unitId)}
              expanded={expanded.has(unit.unitId)}
              onToggle={() => setExpanded((prev) => {
                const next = new Set(prev);
                if (!next.delete(unit.unitId)) next.add(unit.unitId);
                return next;
              })}
            />
          ))}
          {sampleCards[0] && <OrgNodeCard unit={sampleCards[sampleCards.length - 1].unit} compact />}
        </div>
      </Section>

      <Section id="rules" title="سلسله‌مراتب مجاز">
        <NodeTypeRulesMatrix types={types} rules={rules} onChange={setRules} usage={usage} />
        <p className="text-xs text-slate-500" data-testid="rule-count">{rules.length} قاعده</p>
      </Section>

      <Section id="merge" title="ادغام دو گره">
        <MergeNodesForm company={company} onSubmit={setMerged} onCancel={() => setMerged(null)} />
        {merged && <pre dir="ltr" data-testid="merge-result" className="text-xs bg-slate-50 dark:bg-slate-800 p-3 rounded-xl">{JSON.stringify(merged, null, 2)}</pre>}
      </Section>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(boardView ? <BoardView /> : <Sandbox />);
