import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Building2, Network, Users, UserRound, ChevronDown, ChevronUp, GitBranch, GitFork, Maximize2, Minimize2, ChevronsDownUp, ChevronsUpDown, UserX, ZoomIn, ZoomOut, Scan, Search, X, FileDown, Loader2, Briefcase, Crown } from 'lucide-react';
import { AdminCard, Notice } from '../AdminUi';
import { toPersianDigits } from '../../../utils/helpers';
import { ChartCompany, ChartMember, ChartPosition, ChartUnit, AutoLinkChoice, LinkType, NodeType, NodeTypeRule, OrgNode, PersonRef, canNode, getChart, getNodeTypeRules, listLinkTypes, listNodeTypes, listNodes, listPositions, listUnplacedUsers, headTitleOf, postLabel } from '../../../services/orgStructureApi';
import { EmptyRow, LoadingRow, useLoad } from './orgShared';
import { ChartSelection, allUnitsOf, ancestorsOf, companyHeadcount, companyPostsOf, depthsOf, findMember, findPosition, headPostOf, isNested, nodeCount, positionsOf, postTree, unitHeadcount, vacantCount } from './orgChartModel';
import { NodeTypeIcon, safeColor } from './nodes/nodeTypeStyle';
import { AddNodeDialog, MoveNodeDialog } from './nodes/NodeDialogs';
import { AutoLinkChoiceDialog } from './nodes/LinkDialogs';
import { addableTypes, checkMove } from './orgNodeRules';
import { atLeast, highestLevel, levelOf } from './orgUiLevel';
import { PersonAvatar } from './PersonAvatar';
import { TidyBoundary, TidyOrgChart } from './TidyOrgChart';
import { CompanyLogo } from './nodes/CompanyLogo';
import { type ChartView, allOpenSet, defaultView, pathTo, readSavedCompany, readSavedView, saveCompany, saveView, vacantKey } from './tidyChartModel';
import { OrgChartDetails } from './OrgChartDetails';
import { PanZoomView, usePanZoom } from './usePanZoom';
import { OrgLinkLayer } from './OrgLinkLayer';
import { appAlert } from '../../../utils/appDialog';
import { JalaliDatePicker } from '../../JalaliDatePicker';
import { jalaliDay } from './nodes/HistoryDialogs';

const PersonLine: React.FC<{ person: PersonRef | null; empty: string }> = ({ person, empty }) => (
  person ? (
    <span className="flex items-center gap-1.5 min-w-0">
      <PersonAvatar name={person.displayName} url={person.avatarUrl} />
      <span className="text-xs text-slate-600 dark:text-slate-300 truncate">{person.displayName}</span>
    </span>
  ) : <span className="text-xs text-slate-400">{empty}</span>
);

const Toggle: React.FC<{ open: boolean; onClick: () => void; label: string }> = ({ open, onClick, label }) => (
  <button
    type="button"
    onClick={(e) => { e.stopPropagation(); onClick(); }}
    aria-expanded={open}
    aria-label={`${open ? 'بستن' : 'باز کردن'} ${label}`}
    className="w-8 h-8 shrink-0 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-500 hover:text-indigo-600 hover:border-indigo-300 flex items-center justify-center cursor-pointer"
  >
    {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
  </button>
);

/** A card of the chart; the selected one is outlined. */
const NodeCard: React.FC<{
  /** Finds the card when it is chosen elsewhere (side panel, search), to bring it into view. */
  node: string;
  label: string;
  selected: boolean;
  onSelect: () => void;
  className?: string;
  children: React.ReactNode;
  /** Keys the card answers beside Enter (select): M moves the node, N adds under it. */
  onShortcut?: (key: string) => void;
  /** Moving a node by dragging: this card can be dragged, and/or dropped on. */
  dnd?: {
    draggable?: boolean;
    over?: 'ok' | 'bad' | null;
    onDragStart?: (e: React.DragEvent) => void;
    onDragEnd?: () => void;
    onDragOver?: (e: React.DragEvent) => void;
    onDragLeave?: (e: React.DragEvent) => void;
    onDrop?: (e: React.DragEvent) => void;
  };
}> = ({ node, label, selected, onSelect, className = '', children, dnd, onShortcut }) => (
  <div
    data-node={node}
    data-draggable-node={dnd?.draggable ? '' : undefined}
    draggable={dnd?.draggable || undefined}
    onDragStart={dnd?.onDragStart}
    onDragEnd={dnd?.onDragEnd}
    onDragOver={dnd?.onDragOver}
    onDragLeave={dnd?.onDragLeave}
    onDrop={dnd?.onDrop}
    title={label}
    role="button"
    tabIndex={0}
    onClick={onSelect}
    onKeyDown={(e) => {
      if (e.target !== e.currentTarget) return;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); }
      else if (onShortcut && !e.ctrlKey && !e.metaKey && !e.altKey) onShortcut(e.key.toLowerCase());
    }}
    aria-pressed={selected}
    className={`relative rounded-2xl border bg-white dark:bg-slate-900 cursor-pointer transition-all focus:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-400 ${
      dnd?.over === 'ok' ? 'border-emerald-500 ring-2 ring-emerald-200 dark:ring-emerald-900'
        : dnd?.over === 'bad' ? 'border-rose-400 ring-2 ring-rose-200 dark:ring-rose-900 opacity-80'
        : selected
          ? 'border-indigo-500 ring-2 ring-indigo-200 dark:ring-indigo-900 shadow-lg shadow-indigo-500/10'
          : 'border-slate-200 dark:border-slate-700 hover:border-indigo-300 hover:shadow-md'
    } ${dnd?.draggable ? 'active:cursor-grabbing' : ''} ${className}`}
  >
    {children}
  </div>
);

const MemberRow: React.FC<{ member: ChartMember; selected: boolean; onSelect: () => void }> = ({ member, selected, onSelect }) => (
  <button
    data-node={`member:${member.userId}`}
    type="button"
    onClick={(e) => { e.stopPropagation(); onSelect(); }}
    className={`w-full flex items-center gap-2 rounded-xl px-2 py-1.5 text-right cursor-pointer ${selected ? 'bg-indigo-50 dark:bg-indigo-950/50' : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'}`}
  >
    <PersonAvatar name={member.displayName} url={member.avatarUrl} />
    <span className="min-w-0">
      <span className={`block text-xs font-bold truncate ${member.isActive ? 'text-slate-800 dark:text-slate-100' : 'text-slate-400 line-through'}`}>{member.displayName}</span>
      {member.positionTitle && <span className="block text-[10px] text-slate-500 truncate">{member.positionTitle}</span>}
    </span>
  </button>
);

/** A position of a deputy (or the deputy's people with no position) under it, with a branch line to it. */
const BranchCard: React.FC<{
  node: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
  title: string;
  subtitle?: string;
  count: number;
  members: ChartMember[];
  open: boolean;
  onToggle: () => void;
  selected: boolean;
  onSelect: () => void;
  selectedUserId: string | null;
  onSelectMember: (userId: string) => void;
  muted?: boolean;
  /** A position nobody holds yet: drawn with a dashed border. */
  vacant?: boolean;
}> = ({ node, icon: Icon, tone, title, subtitle, count, members, open, onToggle, selected, onSelect, selectedUserId, onSelectMember, muted, vacant }) => (
  <div className="relative">
    <span className="absolute -start-4 top-7 w-4 h-0.5 bg-slate-200 dark:bg-slate-700" aria-hidden="true" />
    <NodeCard node={node} label={title} selected={selected} onSelect={onSelect} className={`w-60 ${muted ? 'opacity-70' : ''} ${vacant && !selected ? 'border-dashed' : ''}`}>
      <div className="flex items-center gap-2.5 p-3">
        <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${tone}`}><Icon className="w-[18px] h-[18px]" /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-extrabold text-slate-800 dark:text-slate-100 truncate">{title}</span>
          <span className="flex items-center gap-1 text-[11px] text-slate-500 min-w-0">
            <Users className="w-3 h-3 shrink-0" />
            <span className="truncate">{vacant ? 'خالی' : `${toPersianDigits(count)} نفر`}{subtitle ? ` · ${subtitle}` : ''}</span>
          </span>
        </span>
        {count > 0 && <Toggle open={open} onClick={onToggle} label={title} />}
      </div>
      {open && members.length > 0 && (
        <div data-scrollable className="relative border-t border-slate-100 dark:border-slate-800 p-1.5 space-y-0.5 max-h-60 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
          {members.map((m) => <MemberRow key={m.userId} member={m} selected={selectedUserId === m.userId} onSelect={() => onSelectMember(m.userId)} />)}
        </div>
      )}
    </NodeCard>
  </div>
);

/** The card of a selection on the chart (a person can hold several positions: the first one). */
function nodeOf(selection: ChartSelection): string | null {
  switch (selection.kind) {
    case 'company': return `company:${selection.companyId}`;
    case 'direct': return `direct:${selection.companyId}`;
    case 'unit': return `unit:${selection.unitId}`;
    case 'noPosition': return `noPosition:${selection.unitId}`;
    case 'position': return `position:${selection.unitPositionId}`;
    case 'member': return `member:${selection.userId}`;
    default: return null;
  }
}

// ---------------------------------------------------------------- layout

/** Width of a deputy's column: its card, or its branch of position cards beside the line. */
const COLUMN_WIDTH = 322;

/** Nodes under one node in a row; more go on to the next row. */
const CHILDREN_PER_ROW = 4;

/** Roughly how tall a deputy's column is with its positions closed. */
function columnHeight(unit: ChartUnit): number {
  const branches = positionsOf(unit).length + (unit.members.length > 0 ? 1 : 0);
  return 112 + (branches > 0 ? 16 + branches * 78 : 0);
}

/**
 * Many deputies in one row make a chart too wide to read when zoomed out, so they are laid out
 * in balanced rows - as many per row as lets the whole chart show biggest in the canvas.
 */
function chooseColumns(units: ChartUnit[], width: number, height: number): number {
  const n = units.length;
  if (n <= 2 || !width || !height) return Math.max(1, n);
  let best = n;
  let bestScale = 0;
  for (let k = 1; k <= n; k++) {
    const perRow = Math.ceil(n / Math.ceil(n / k));
    let total = 170;
    for (let i = 0; i < n; i += perRow) total += 80 + Math.max(...units.slice(i, i + perRow).map(columnHeight));
    const scale = Math.min((width - 48) / (perRow * COLUMN_WIDTH + 80), (height - 48) / total);
    // Fewer, wider rows read more like a chart: they win unless they are clearly smaller.
    if (scale >= bestScale * 0.95) {
      best = perRow;
      bestScale = Math.max(bestScale, scale);
    }
  }
  return best;
}

function rowsOf<T>(items: T[], perRow: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += perRow) rows.push(items.slice(i, i + perRow));
  return rows;
}

// ---------------------------------------------------------------- canvas controls

const controlClass = 'w-9 h-9 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 cursor-pointer';

/** Zoom in/out, the current zoom (click: real size) and the whole chart. */
const ZoomControls: React.FC<{
  subscribe: (listener: (view: PanZoomView) => void) => () => void;
  zoomBy: (factor: number) => void;
  fit: (animate?: boolean) => void;
}> = ({ subscribe, zoomBy, fit }) => {
  const [scale, setScale] = useState(1);
  useEffect(() => subscribe((view) => setScale(view.s)), [subscribe]);
  return (
    <div dir="ltr" className="absolute left-3 top-3 sm:top-auto sm:bottom-3 z-10 flex items-center rounded-xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 shadow-md overflow-hidden" onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
      <button type="button" className={controlClass} onClick={() => zoomBy(1 / 1.3)} title="کوچک‌نمایی" aria-label="کوچک‌نمایی"><ZoomOut className="w-4 h-4" /></button>
      <button type="button" className="h-9 min-w-14 px-1 text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-indigo-600 cursor-pointer tabular-nums" onClick={() => zoomBy(1 / scale)} title="اندازهٔ واقعی" aria-label="اندازهٔ واقعی">
        {toPersianDigits(Math.round(scale * 100))}٪
      </button>
      <button type="button" className={controlClass} onClick={() => zoomBy(1.3)} title="بزرگ‌نمایی" aria-label="بزرگ‌نمایی"><ZoomIn className="w-4 h-4" /></button>
      <span className="w-px h-5 bg-slate-200 dark:bg-slate-700" aria-hidden="true" />
      <button type="button" className={`${controlClass} gap-1 w-auto px-2.5 text-xs font-bold`} onClick={() => fit(true)} title="دیدن کل چارت" aria-label="دیدن کل چارت"><Scan className="w-4 h-4" /> کل چارت</button>
    </div>
  );
};

/** Persian text compared loosely: Arabic ی/ك, half-spaces and case do not matter. */
const normalize = (text: string) => text.replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/‌/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

interface SearchHit { key: string; label: string; detail: string; kind: 'unit' | 'position' | 'person'; go: () => void }

/** Finds a deputy, a position or a person in the chart and takes the chart to it. */
const ChartSearch: React.FC<{ hits: SearchHit[] }> = ({ hits }) => {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const query = normalize(text);
  const found = query ? hits.filter((h) => normalize(h.label).includes(query)).slice(0, 8) : [];
  const choose = (hit: SearchHit) => { hit.go(); setText(''); setOpen(false); };
  const icons = { unit: Network, position: Briefcase, person: UserRound };
  const tones = {
    unit: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300',
    position: 'bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-300',
    person: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  };
  return (
    <div className="relative w-full sm:w-64">
      <Search className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3 pointer-events-none" />
      <input
        value={text}
        onChange={(e) => { setText(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && found[0]) { e.preventDefault(); choose(found[0]); }
          if (e.key === 'Escape') { setText(''); setOpen(false); }
        }}
        placeholder="جستجوی معاونت، سمت یا فرد…"
        aria-label="جستجو در چارت"
        className="w-full ps-9 pe-8 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400 focus:outline-hidden focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900"
      />
      {text && (
        <button type="button" onClick={() => setText('')} className="absolute top-1/2 -translate-y-1/2 end-2 p-1 text-slate-400 hover:text-slate-600 cursor-pointer" aria-label="پاک کردن جستجو"><X className="w-3.5 h-3.5" /></button>
      )}
      {open && query && (
        <div className="absolute z-30 mt-1 w-full sm:w-80 end-0 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl p-1 max-h-80 overflow-y-auto">
          {found.length === 0 ? <p className="text-xs text-slate-400 px-3 py-2">چیزی پیدا نشد.</p> : found.map((hit) => {
            const Icon = icons[hit.kind];
            return (
              <button key={hit.key} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => choose(hit)} className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-right hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer">
                <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${tones[hit.kind]}`}><Icon className="w-3.5 h-3.5" /></span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{hit.label}</span>
                  <span className="block text-[11px] text-slate-500 truncate">{hit.detail}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

/** A failure in the details panel stays in the panel (the page is not blanked); choosing something else starts it again. */
class DetailsBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  declare props: { children: React.ReactNode };
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { console.error('Org chart details failed:', error); }
  render() {
    return this.state.failed
      ? <p role="alert" className="m-4 rounded-xl bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-200 px-3 py-2 text-sm">نمایش جزئیات این مورد انجام نشد؛ مورد دیگری را انتخاب کنید یا صفحه را دوباره بارگذاری کنید.</p>
      : this.props.children;
  }
}

/**
 * «چارت سازمانی»: the company at the top, its head (رئیس کل) under it, then its deputies, under each
 * deputy its positions in the deputy's order - vacant ones too - and who holds each (a person holding
 * several positions shows in each), the deputy's people with no position, the company's people in no
 * deputy, and people with no place at all. Clicking any of them shows it in the side panel, where it
 * can be changed right away (as the user's permissions allow; the server checks again).
 *
 * The chart is a canvas: it opens at half size from the top, the wheel (or two fingers) zooms where the
 * pointer is, dragging moves it, and choosing a card while zoomed out - on the chart, in the side
 * panel or by searching - takes the chart to it.
 */
/** Today as the date picker gives it (yyyy-MM-dd, local day). */
const localToday = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

/** «چارت درختی | چارت مرتب»: two pressed-state buttons; the arrow keys move between them. */
const ViewSwitch: React.FC<{ view: ChartView; onChange: (view: ChartView) => void }> = ({ view, onChange }) => {
  const items: { id: ChartView; label: string }[] = [{ id: 'tree', label: 'چارت درختی' }, { id: 'tidy', label: 'چارت مرتب' }];
  return (
    <div role="group" aria-label="نوع نمایش چارت" data-testid="chart-view-switch" className="inline-flex rounded-xl border border-slate-200 dark:border-slate-700 p-0.5 bg-slate-50 dark:bg-slate-800"
      onKeyDown={(e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        const next = items.find((i) => i.id !== view)!;
        const group = e.currentTarget as HTMLElement;
        onChange(next.id);
        requestAnimationFrame(() => (group.querySelector(`[data-view="${next.id}"]`) as HTMLElement | null)?.focus());
      }}>
      {items.map((item) => (
        <button key={item.id} type="button" data-view={item.id} aria-pressed={view === item.id} onClick={() => onChange(item.id)}
          className={`px-3 py-1.5 rounded-[10px] text-xs font-bold cursor-pointer whitespace-nowrap ${view === item.id ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 shadow-xs' : 'text-slate-600 dark:text-slate-300 hover:text-indigo-600'}`}>
          {item.label}
        </button>
      ))}
    </div>
  );
};

export const OrgChartBoard: React.FC<{
  can: (permission: string) => boolean;
  /** Told after each load: the highest display level among the companies (the section's tabs follow it). */
  onLevelChange?: (level: import('../../../services/orgStructureApi').OrgUiLevel) => void;
  /** Opens the chart on this company (from the group chart). */
  initialCompanyId?: string;
  /** Told when the selection changes: where it is (company, unit, position) and who, for the placement form beside the chart. */
  /** Changes when the data was changed elsewhere (the placement form): the chart is read again. */
  reloadToken?: number;
  onPlacementPick?: (pick: { companyId: string; unitId?: string; positionId?: string; userId?: string | null; userName?: string | null }) => void;
}> = ({ can: realCan, onLevelChange, initialCompanyId, onPlacementPick, reloadToken }) => {
  /** «نمایش به تاریخ»: the chart as of a day (only which nodes existed); nothing can be changed then. */
  const [asOf, setAsOf] = useState<string | undefined>(undefined);
  const asOfRef = useRef(asOf);
  asOfRef.current = asOf;
  const can = asOf ? () => false : realCan;
  const data = useLoad(async () => {
    const [chart, positions, unplaced, nodes, nodeTypes, nodeRules, linkTypes] = await Promise.all([
      getChart(undefined, asOfRef.current),
      listPositions().catch(() => []),
      listUnplacedUsers().catch(() => []),
      // The nodes' versions (for the «changed meanwhile» check); an older backend or no permission: none.
      listNodes().catch(() => [] as OrgNode[]),
      listNodeTypes().catch(() => [] as NodeType[]),
      getNodeTypeRules().then((r) => r.rules).catch(() => [] as NodeTypeRule[]),
      listLinkTypes().catch(() => [] as LinkType[]),
    ]);
    return { chart, positions, unplaced, nodes, nodeTypes, nodeRules, linkTypes };
  }, 'دریافت چارت سازمانی ممکن نشد.');

  const [companyId, setCompanyIdState] = useState<string | null>(() => initialCompanyId ?? readSavedCompany());
  const setCompanyId = (id: string) => { setCompanyIdState(id); saveCompany(id); };
  const [selection, setSelection] = useState<ChartSelection | null>(null);
  /** Nodes whose posts are hidden, and nodes whose sub-nodes are hidden. */
  // null: as a company opens (see openingState); a set: what the user has opened or closed since.
  const [userCollapsedUnits, setUserCollapsedUnits] = useState<Set<string> | null>(null);
  const [userCollapsedBranches, setUserCollapsedBranches] = useState<Set<string> | null>(null);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [fullscreen, setFullscreen] = useState(false);
  /** A node being moved (dragged to a place, or from its «جابه‌جایی»), or being added under a node. */
  const [moveRequest, setMoveRequest] = useState<{ unitId: string; parentId?: string | null } | null>(null);
  const [addRequest, setAddRequest] = useState<{ parentId: string | null } | null>(null);
  /** Dragging a card: which one, and the card it is over (with whether it may go there). */
  const [dragId, setDragId] = useState<string | null>(null);
  /** The card being dragged over, whether the node may go there, and (if not) why - shown while hovering. */
  const [dropOver, setDropOver] = useState<{ id: string | null; ok: boolean; reason?: string } | null>(null);
  const [dragNote, setDragNote] = useState<string | null>(null);
  const [linkChoices, setLinkChoices] = useState<AutoLinkChoice[] | null>(null);
  const [exporting, setExporting] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  /** How to move around, until the user first does. */
  const [hint, setHint] = useState(true);
  /** A card to bring into view once it is on the page (`force`: even if it is already in view). */
  const [reveal, setReveal] = useState<{ node: string; force: boolean; seq: number } | null>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);

  const chart = data.data?.chart || [];
  const company: ChartCompany | undefined = chart.find((c) => c.companyId === companyId) || chart[0];
  // A company opens with its first two levels drawn and the posts of nodes with sub-nodes closed, so a big structure stays
  // readable (and is drawn small the first time, not as hundreds of open cards); a flat company opens exactly as before.
  const opening = useMemo(() => {
    if (!company) return { units: new Set<string>(), branches: new Set<string>() };
    const depths = depthsOf(company);
    const parents = allUnitsOf(company).filter((u) => (u.children?.length ?? 0) > 0);
    return {
      units: new Set(parents.map((u) => u.unitId)),
      branches: new Set(parents.filter((u) => (depths.get(u.unitId) ?? 0) >= 2).map((u) => u.unitId)),
    };
  }, [company]);
  const collapsedUnits = userCollapsedUnits ?? opening.units;
  const collapsedBranches = userCollapsedBranches ?? opening.branches;
  const setCollapsedUnits: React.Dispatch<React.SetStateAction<Set<string>>> = (next) =>
    setUserCollapsedUnits((prev) => (typeof next === 'function' ? next(prev ?? opening.units) : next));
  const setCollapsedBranches: React.Dispatch<React.SetStateAction<Set<string>>> = (next) =>
    setUserCollapsedBranches((prev) => (typeof next === 'function' ? next(prev ?? opening.branches) : next));
  // Another company: it opens as a company opens, not as the last one was left.
  const lastCompany = useRef<string | null>(null);
  useEffect(() => {
    if (!company || lastCompany.current === company.companyId) return;
    lastCompany.current = company.companyId;
    setUserCollapsedUnits(null);
    setUserCollapsedBranches(null);
    setTidyOpenUser(null);
  }, [company?.companyId]); // eslint-disable-line react-hooks/exhaustive-deps
  // Which drawing: the tree chart (as it always was) or the tidy chart; the user's choice (saved) beats the size-based default.
  const [userView, setUserView] = useState<ChartView | null>(() => readSavedView());
  const view: ChartView = userView ?? defaultView(company ? nodeCount(company) : 0);
  const chooseView = (next: ChartView) => { setUserView(next); saveView(next); };
  // The company on screen is remembered, so leaving the page and coming back opens on it.
  useEffect(() => { if (company) saveCompany(company.companyId); }, [company?.companyId]); // eslint-disable-line react-hooks/exhaustive-deps
  const [showEmpty, setShowEmpty] = useState(false);
  /** Tidy chart: what is open (null: as a company opens - its nodes that have people). */
  const [tidyOpenUser, setTidyOpenUser] = useState<Set<string> | null>(null);
  // The list view shows the whole structure at first: every node open (the bars of vacant posts stay closed).
  const tidyDefault = useMemo(() => (company ? new Set<string>(allUnitsOf(company).map((u) => u.unitId)) : new Set<string>()), [company]);
  const tidyOpen = tidyOpenUser ?? tidyDefault;
  const toggleTidy = (key: string) => setTidyOpenUser((prev) => { const next = new Set(prev ?? tidyDefault); if (!next.delete(key)) next.add(key); return next; });
  const tidyRoot = useRef<HTMLDivElement>(null);
  /** Printing the tidy chart: everything open, no buttons, for the moment of the capture. */
  const [printingTidy, setPrintingTidy] = useState(false);
  const { fit, home, zoomBy, focus, subscribe } = usePanZoom(viewport, content, !!company && view === 'tree');
  const level = levelOf(company);
  // The display level only hides: simple has no node tools, advanced adds the secondary links.
  const nodeApi = (data.data?.nodes.length ?? 0) > 0 && atLeast(level, 'normal') && !asOf;
  const showLinks = atLeast(level, 'advanced');
  const rules = data.data?.nodeRules || [];
  const canMoveNodes = nodeApi && canNode(can, 'move');
  const unitById = useMemo(() => new Map((company ? allUnitsOf(company) : []).map((u) => [u.unitId, u] as const)), [company]);
  const versionOf = (unitId: string) => data.data?.nodes.find((n) => n.id === unitId)?.rowVersion ?? null;

  // The company first shown is selected, so the side panel is never empty.
  useEffect(() => {
    if (company && !selection) setSelection({ kind: 'company', companyId: company.companyId });
  }, [company?.companyId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setCanvasSize((prev) => (
      prev.width === el.clientWidth && prev.height === el.clientHeight ? prev : { width: el.clientWidth, height: el.clientHeight })));
    observer.observe(el);
    return () => observer.disconnect();
  }, [!!company, view]); // eslint-disable-line react-hooks/exhaustive-deps



  const firstAsOf = useRef(true);
  useEffect(() => {
    if (firstAsOf.current) { firstAsOf.current = false; return; }
    void data.reload();
  }, [asOf]); // eslint-disable-line react-hooks/exhaustive-deps
  // Opened from the group chart on another company.
  useEffect(() => {
    if (initialCompanyId) { setCompanyId(initialCompanyId); setSelection({ kind: 'company', companyId: initialCompanyId }); void data.reload(); }
  }, [initialCompanyId]); // eslint-disable-line react-hooks/exhaustive-deps

  const units = company?.units || [];
  useEffect(() => { if (data.data) onLevelChange?.(highestLevel(data.data.chart)); }, [data.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const firstToken = useRef(reloadToken);
  useEffect(() => {
    if (reloadToken === firstToken.current) return;
    firstToken.current = reloadToken;
    void data.reload();
  }, [reloadToken]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!onPlacementPick || !selection || !data.data) return;
    const chart = data.data.chart;
    switch (selection.kind) {
      case 'company': case 'direct': onPlacementPick({ companyId: selection.companyId }); break;
      case 'unit': case 'noPosition': onPlacementPick({ companyId: selection.companyId, unitId: selection.unitId }); break;
      case 'position': {
        const place = findPosition(chart, selection.unitPositionId);
        const holder = place?.position.holders[0];
        onPlacementPick({ companyId: selection.companyId, unitId: selection.unitId || undefined, positionId: place?.position.positionId, userId: holder?.userId, userName: holder?.displayName });
        break;
      }
      case 'member': {
        const found = findMember(chart, selection.userId);
        const place = found?.positions[0];
        if (found && place) onPlacementPick({ companyId: place.company.companyId, unitId: place.unit?.unitId, positionId: place.position.positionId, userId: found.member.userId, userName: found.member.displayName });
        break;
      }
      default: break;
    }
  }, [selection]); // eslint-disable-line react-hooks/exhaustive-deps
  // A nested company's few top nodes stand in one row (their sub-nodes make them tall); a flat company's
  // many deputies are laid out in balanced rows.
  const nested = !!company && isNested(company);
  const perRow = useMemo(() => (nested ? Math.max(1, Math.min(units.length, 5)) : chooseColumns(units, canvasSize.width, canvasSize.height)), [nested, units, canvasSize.width, canvasSize.height]);

  // The chart opens at half size from the top: for another company, another layout or full screen too.
  useLayoutEffect(() => { if (view === 'tree') home(); }, [company?.companyId, perRow, fullscreen, home, view]);

  useEffect(() => {
    if (!reveal) return;
    const el = content.current?.querySelector<HTMLElement>(`[data-node="${CSS.escape(reveal.node)}"]`);
    if (el) focus(el, { onlyIfNeeded: !reveal.force });
  }, [reveal, focus]);

  useEffect(() => {
    if (!dragNote) return;
    const timer = setTimeout(() => setDragNote(null), 5000);
    return () => clearTimeout(timer);
  }, [dragNote]);

  useEffect(() => {
    if (!fullscreen) return;
    const close = (e: KeyboardEvent) => { if (e.key === 'Escape') setFullscreen(false); };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [fullscreen]);

  const toggleIn = (set: React.Dispatch<React.SetStateAction<Set<string>>>, key: string) => set((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const addTo = (set: React.Dispatch<React.SetStateAction<Set<string>>>, key: string) => set((prev) => (prev.has(key) ? prev : new Set([...prev, key])));
  const removeFrom = (set: React.Dispatch<React.SetStateAction<Set<string>>>, key: string) => set((prev) => {
    if (!prev.has(key)) return prev;
    const next = new Set(prev);
    next.delete(key);
    return next;
  });

  /** Selects, and takes the chart to the card when it is out of sight or too small to read. */
  const choose = (next: ChartSelection, options: { force?: boolean; node?: string } = {}) => {
    setSelection(next);
    // A card inside a closed branch: open the branches above it first.
    const unitId = 'unitId' in next && next.unitId ? next.unitId : null;
    if (company && unitId) {
      // Functional update: the search hits keep the `choose` of an earlier render, so the current set must not be read here.
      const above = new Set(ancestorsOf(company, unitId).map((a) => a.unitId));
      setCollapsedBranches((prev) => (prev.size === 0 || ![...prev].some((id) => above.has(id)) ? prev : new Set([...prev].filter((id) => !above.has(id)))));
    }
    const node = options.node || nodeOf(next);
    if (node) setReveal((prev) => ({ node, force: !!options.force, seq: (prev?.seq || 0) + 1 }));
  };

  // The tidy chart opens what a chosen node, post or person sits under (search, side panel, a click).
  useEffect(() => {
    if (!company || !selection || view !== 'tidy') return;
    let unitId: string | null = 'unitId' in selection && selection.unitId ? selection.unitId : null;
    if (selection.kind === 'member') unitId = findMember(chart, selection.userId)?.positions[0]?.unit?.unitId ?? null;
    if (!unitId) return;
    const keys = [...pathTo(company, unitId), vacantKey(unitId)];
    setTidyOpenUser((prev) => { const base = prev ?? tidyDefault; return keys.every((k) => base.has(k)) ? prev : new Set([...base, ...keys]); });
  }, [selection, view]); // eslint-disable-line react-hooks/exhaustive-deps

  const allGroupKeys = useMemo(() => (company ? allUnitsOf(company).flatMap((u) => [`none:${u.unitId}`, ...positionsOf(u).map((p) => `pos:${p.unitPositionId}`)]) : []), [company]);
  const allTreeOpen = !!company && collapsedUnits.size === 0 && collapsedBranches.size === 0 && allGroupKeys.every((k) => openGroups.has(k));
  const allTidyOpen = !!company && [...allOpenSet(company)].every((k) => tidyOpen.has(k));
  const allOpen = view === 'tidy' ? allTidyOpen : allTreeOpen;
  const expandAll = () => { if (view === 'tidy') { if (company) setTidyOpenUser(allOpenSet(company)); return; } setCollapsedUnits(new Set()); setCollapsedBranches(new Set()); setOpenGroups(new Set(allGroupKeys)); };
  const collapseAll = () => { if (view === 'tidy') { setTidyOpenUser(new Set()); return; } setOpenGroups(new Set()); };

  const searchHits = useMemo<SearchHit[]>(() => {
    if (!company) return [];
    const hits: SearchHit[] = [];
    const people = new Set<string>();
    const openUnit = (unitId: string) => removeFrom(setCollapsedUnits, unitId);
    for (const post of companyPostsOf(company)) {
      const select: ChartSelection = { kind: 'position', companyId: company.companyId, unitId: '', unitPositionId: post.unitPositionId };
      hits.push({
        key: `position:${post.unitPositionId}`, kind: 'position', label: postLabel(post),
        detail: `پست مستقیم شرکت${post.holders.length === 0 ? ' · خالی' : ''}`,
        go: () => choose(select, { force: true }),
      });
      for (const member of post.holders) {
        if (people.has(member.userId)) continue;
        people.add(member.userId);
        hits.push({
          key: `person:${member.userId}`, kind: 'person', label: member.displayName, detail: `${postLabel(post)} · ${company.name}`,
          go: () => choose({ kind: 'member', userId: member.userId }, { force: true }),
        });
      }
    }
    for (const unit of allUnitsOf(company)) {
      const path = ancestorsOf(company, unit.unitId).map((a) => a.name).reverse();
      hits.push({
        key: `unit:${unit.unitId}`, kind: 'unit', label: unit.name,
        detail: `${unit.nodeType?.name || 'معاونت'} · ${toPersianDigits(unitHeadcount(unit))} نفر${path.length ? ` · ${path.join(' ‹ ')}` : ''}`,
        go: () => { openUnit(unit.unitId); choose({ kind: 'unit', companyId: company.companyId, unitId: unit.unitId }, { force: true }); },
      });
      for (const position of positionsOf(unit)) {
        const select: ChartSelection = { kind: 'position', companyId: company.companyId, unitId: unit.unitId, unitPositionId: position.unitPositionId };
        hits.push({
          key: `position:${position.unitPositionId}`, kind: 'position', label: postLabel(position),
          detail: `پست · ${unit.name}${position.holders.length === 0 ? ' · خالی' : ''}`,
          go: () => { openUnit(unit.unitId); choose(select, { force: true }); },
        });
        for (const member of position.holders) {
          if (people.has(member.userId)) continue;
          people.add(member.userId);
          hits.push({
            key: `person:${member.userId}`, kind: 'person', label: member.displayName, detail: `${position.title} · ${unit.name}`,
            go: () => { openUnit(unit.unitId); addTo(setOpenGroups, `pos:${position.unitPositionId}`); choose({ kind: 'member', userId: member.userId }, { force: true }); },
          });
        }
      }
    }
    for (const unit of allUnitsOf(company)) {
      for (const member of unit.members) {
        if (people.has(member.userId)) continue;
        people.add(member.userId);
        hits.push({
          key: `person:${member.userId}`, kind: 'person', label: member.displayName, detail: `${unit.name} · بدون سمت`,
          go: () => { openUnit(unit.unitId); addTo(setOpenGroups, `none:${unit.unitId}`); choose({ kind: 'member', userId: member.userId }, { force: true }); },
        });
      }
    }
    for (const member of company.members) {
      if (people.has(member.userId)) continue;
      people.add(member.userId);
      hits.push({
        key: `person:${member.userId}`, kind: 'person', label: member.displayName, detail: 'مستقیم زیر شرکت',
        go: () => choose({ kind: 'member', userId: member.userId }, { force: true, node: `direct:${company.companyId}` }),
      });
    }
    return hits;
  }, [company]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedUserId = selection && (selection.kind === 'member' || selection.kind === 'unplaced') ? selection.userId : null;
  const isSelected = (s: ChartSelection) => JSON.stringify(s) === JSON.stringify(selection);
  const selectMember = (userId: string) => choose({ kind: 'member', userId });

  if (data.loading && !data.data) return <AdminCard><LoadingRow /></AdminCard>;
  if (data.error) return <Notice type="error">{data.error}</Notice>;
  if (!company) return <AdminCard><EmptyRow>هنوز شرکتی تعریف نشده است. ابتدا در بخش «شرکت‌ها» یک شرکت بسازید.</EmptyRow></AdminCard>;

  const line = 'bg-slate-300 dark:bg-slate-600';

  /** Moving a node by dragging its card onto another (a node) or onto the company (the top); the preview comes before it is saved. */
  const dndOf = (unit: ChartUnit | null) => {
    const targetId = unit?.unitId ?? null;
    return {
      draggable: !!unit && canMoveNodes,
      over: dragId && dropOver && dropOver.id === targetId ? (dropOver.ok ? 'ok' as const : 'bad' as const) : null,
      onDragStart: unit && canMoveNodes ? (e: React.DragEvent) => {
        e.dataTransfer.setData('text/plain', unit.unitId);
        e.dataTransfer.effectAllowed = 'move';
        setDragId(unit.unitId);
        setDragNote(null);
      } : undefined,
      onDragEnd: () => { setDragId(null); setDropOver(null); },
      onDragOver: canMoveNodes ? (e: React.DragEvent) => {
        const dragged = dragId ? unitById.get(dragId) : undefined;
        if (!dragged) return;
        const check = checkMove(dragged, unit, rules);
        const ok = check.ok;
        e.preventDefault();
        e.dataTransfer.dropEffect = ok ? 'move' : 'none';
        if (dropOver?.id !== targetId || dropOver.ok !== ok) setDropOver({ id: targetId, ok, reason: 'reason' in check ? check.reason : undefined });
      } : undefined,
      onDragLeave: canMoveNodes ? (e: React.DragEvent) => {
        if (!(e.currentTarget as Node).contains(e.relatedTarget as Node | null)) setDropOver((prev) => (prev?.id === targetId ? null : prev));
      } : undefined,
      onDrop: canMoveNodes ? (e: React.DragEvent) => {
        e.preventDefault();
        const dragged = dragId ? unitById.get(dragId) : undefined;
        setDragId(null);
        setDropOver(null);
        if (!dragged) return;
        const check = checkMove(dragged, unit, rules);
        if ('reason' in check) setDragNote(check.reason);
        else setMoveRequest({ unitId: dragged.unitId, parentId: targetId });
      } : undefined,
    };
  };

  const renderUnit = (unit: ChartUnit): React.ReactNode => {
    const open = !collapsedUnits.has(unit.unitId);
    const positions = positionsOf(unit);
    const vacant = vacantCount(unit);
    const children = unit.children || [];
    const branchOpen = children.length > 0 && !collapsedBranches.has(unit.unitId);
    const type = unit.nodeType;
    const color = safeColor(type?.color);
    return (
      <div className="flex flex-col items-center">
        <NodeCard
          node={`unit:${unit.unitId}`}
          label={unit.name}
          selected={isSelected({ kind: 'unit', companyId: company.companyId, unitId: unit.unitId })}
          onSelect={() => choose({ kind: 'unit', companyId: company.companyId, unitId: unit.unitId })}
          className={`w-64 ${unit.isActive === false ? 'opacity-60 border-dashed' : ''} ${dragId === unit.unitId ? 'opacity-40' : ''}`}
          dnd={dndOf(unit)}
          onShortcut={nodeApi ? (key) => {
            if (key === 'm' && canMoveNodes) setMoveRequest({ unitId: unit.unitId });
            if (key === 'n' && canNode(can, 'create') && unit.isActive !== false && addableTypes(data.data?.nodeTypes || [], rules, unit).length > 0) setAddRequest({ parentId: unit.unitId });
          } : undefined}
        >
          {type && <span className="absolute inset-x-3 top-0 h-1 rounded-b-full" style={{ backgroundColor: color }} aria-hidden="true" />}
          <div className="flex items-center gap-2.5 p-3.5">
            {type ? (
              <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${color}1a`, color }}>
                <NodeTypeIcon icon={type.icon} className="w-5 h-5" />
              </span>
            ) : (
              <span className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300 flex items-center justify-center shrink-0"><Network className="w-5 h-5" /></span>
            )}
            <span className="min-w-0 flex-1 space-y-1">
              {type && type.name !== unit.name && <span className="block text-[10px] font-bold truncate" style={{ color }}>{type.name}</span>}
              <span className={`block text-sm font-extrabold truncate ${unit.isActive === false ? 'line-through text-slate-400' : 'text-slate-900 dark:text-white'}`}>{unit.name}</span>
              {unit.manager && <PersonLine person={unit.manager} empty="" />}
            </span>
            {(positions.length > 0 || unit.members.length > 0) && (
              <Toggle open={open} onClick={() => toggleIn(setCollapsedUnits, unit.unitId)} label={`پست‌های ${unit.name}`} />
            )}
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-slate-100 dark:border-slate-800 px-3.5 py-1.5 text-[11px] text-slate-500">
            <span>{toPersianDigits(positions.length)} پست{vacant > 0 ? ` · ${toPersianDigits(vacant)} خالی` : ''}</span>
            {children.length > 0 && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); toggleIn(setCollapsedBranches, unit.unitId); }}
                aria-expanded={branchOpen}
                aria-label={`${branchOpen ? 'بستن' : 'باز کردن'} زیرمجموعه‌ی ${unit.name}`}
                className="flex items-center gap-1 rounded-full border border-slate-200 dark:border-slate-700 px-2 py-0.5 font-bold text-slate-600 dark:text-slate-300 hover:text-indigo-600 hover:border-indigo-300 cursor-pointer"
              >
                <GitBranch className="w-3 h-3" />{toPersianDigits(children.length)} زیرمجموعه {branchOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            )}
            <span>{toPersianDigits(unitHeadcount(unit))} نفر</span>
          </div>
        </NodeCard>
        {open && (positions.length > 0 || unit.members.length > 0) && (
          <div className="self-stretch flex justify-center">
            <div className="relative mt-0 ms-8 ps-4 pt-4 space-y-3 border-s-2 border-slate-200 dark:border-slate-700">
              {postTree(positions).map(({ position, depth }: { position: ChartPosition; depth: number }) => (
                <div key={position.unitPositionId} style={depth ? { marginInlineStart: `${depth * 1.25}rem` } : undefined} className={depth ? 'relative before:absolute before:-start-3 before:top-5 before:w-2.5 before:h-0.5 before:bg-slate-300 dark:before:bg-slate-600' : undefined} data-post-depth={depth}>
                <BranchCard
                  node={`position:${position.unitPositionId}`}
                  icon={Briefcase}
                  tone="bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-300"
                  title={postLabel(position)}
                  subtitle={position.holders.length === 1 ? position.holders[0].displayName : undefined}
                  count={position.holders.length}
                  members={position.holders}
                  vacant={position.holders.length === 0}
                  muted={!position.isActive}
                  open={openGroups.has(`pos:${position.unitPositionId}`)}
                  onToggle={() => toggleIn(setOpenGroups, `pos:${position.unitPositionId}`)}
                  selected={isSelected({ kind: 'position', companyId: company.companyId, unitId: unit.unitId, unitPositionId: position.unitPositionId })}
                  onSelect={() => choose({ kind: 'position', companyId: company.companyId, unitId: unit.unitId, unitPositionId: position.unitPositionId })}
                  selectedUserId={selectedUserId}
                  onSelectMember={selectMember}
                />
                </div>
              ))}
              {unit.members.length > 0 && (
                <BranchCard
                  node={`noPosition:${unit.unitId}`}
                  icon={UserRound}
                  tone="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                  title="بدون سمت"
                  count={unit.members.length}
                  members={unit.members}
                  open={openGroups.has(`none:${unit.unitId}`)}
                  onToggle={() => toggleIn(setOpenGroups, `none:${unit.unitId}`)}
                  selected={isSelected({ kind: 'noPosition', companyId: company.companyId, unitId: unit.unitId })}
                  onSelect={() => choose({ kind: 'noPosition', companyId: company.companyId, unitId: unit.unitId })}
                  selectedUserId={selectedUserId}
                  onSelectMember={selectMember}
                />
              )}
            </div>
          </div>
        )}

        {branchOpen && (
          <>
            <span className={`w-0.5 h-8 ${line}`} aria-hidden="true" />
            {childRows(children)}
          </>
        )}
      </div>
    );
  };

  /** The nodes under a node: a few per row, so a node with many does not make the chart wide. */
  const childRows = (nodes: ChartUnit[]) => {
    const rows = rowsOf(nodes, CHILDREN_PER_ROW);
    return rows.length === 1 ? unitRow(rows[0], false) : (
      <div className="flex flex-col items-start">
        {rows.map((row, r) => (
          <div key={row[0].unitId} className={`relative ${r > 0 ? 'pt-14' : ''}`}>
            {r < rows.length - 1
              ? <span aria-hidden="true" className={`absolute start-0 top-0 bottom-0 w-0.5 ${line}`} />
              : <span aria-hidden="true" className={`absolute start-0 top-0 h-14 w-0.5 ${line}`} />}
            {unitRow(row, true)}
          </div>
        ))}
      </div>
    );
  };

  const rows = rowsOf(units, perRow);

  /** One row of deputies hanging from a bar; with several rows the bar runs from the line down their start side. */
  const unitRow = (row: ChartUnit[], joinedAtStart: boolean) => (
    <div className="flex items-start">
      {row.map((unit, i) => {
        const first = i === 0;
        const last = i === row.length - 1;
        const bar = joinedAtStart
          ? (last ? 'start-0 end-1/2' : 'start-0 end-0')
          : row.length === 1 ? null : first ? 'start-1/2 end-0' : last ? 'start-0 end-1/2' : 'start-0 end-0';
        return (
          <div key={unit.unitId} className="relative px-4 pt-8 flex flex-col items-center">
            {bar && <span aria-hidden="true" className={`absolute top-0 h-0.5 ${line} ${bar}`} />}
            <span className={`absolute top-0 start-1/2 w-0.5 h-8 ${line}`} aria-hidden="true" />
            {renderUnit(unit)}
          </div>
        );
      })}
    </div>
  );

  const board = (
    <AdminCard className={fullscreen ? 'overflow-hidden flex flex-col h-full' : 'overflow-hidden'}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 border-b border-slate-100 dark:border-slate-800">
        <div>
          <h3 className="flex items-center gap-2 text-base font-extrabold text-slate-900 dark:text-white" title="روی هر بخش بزنید تا جزئیاتش را ببینید و همان‌جا تغییرش دهید."><GitFork className="w-5 h-5 text-indigo-600" /> چارت سازمانی</h3>
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {showLinks && (
            <div className="flex items-center gap-1.5" data-testid="as-of">
              <span className="text-[11px] font-bold text-slate-500 whitespace-nowrap">نمایش به تاریخ</span>
              <JalaliDatePicker
                value={asOf}
                // Today is the live chart (editable), not a view «as of today».
                onChange={(day) => setAsOf(day && day !== localToday() ? day : undefined)}
                ariaLabel="نمایش چارت به تاریخ"
                placeholder="امروز"
              />
            </div>
          )}
          <ViewSwitch view={view} onChange={chooseView} />
          {view === 'tidy' && (
            <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-300 cursor-pointer whitespace-nowrap">
              <input type="checkbox" checked={showEmpty} onChange={(e) => setShowEmpty(e.target.checked)} className="accent-indigo-600" /> نمایش پست‌های خالی
            </label>
          )}
          <ChartSearch hits={searchHits} />
          {chart.length > 1 && (
            <select
              className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-bold"
              value={company.companyId}
              onChange={(e) => {
                setCompanyId(e.target.value);
                setSelection({ kind: 'company', companyId: e.target.value });
                // Whatever changed meanwhile (another tab, another person, the API) shows on arrival.
                void data.reload();
              }}
              aria-label="شرکت"
            >
              {chart.map((c) => <option key={c.companyId} value={c.companyId}>{c.name}</option>)}
            </select>
          )}
          <button type="button" onClick={allOpen ? collapseAll : expandAll} className="w-9 h-9 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-indigo-600 flex items-center justify-center cursor-pointer" title={allOpen ? 'بستن همه' : 'باز کردن همه'} aria-label={allOpen ? 'بستن همه' : 'باز کردن همه'}>
            {allOpen ? <ChevronsDownUp className="w-4 h-4" /> : <ChevronsUpDown className="w-4 h-4" />}
          </button>
          <button
            type="button"
            disabled={exporting}
            onClick={async () => {
              if (view === 'tree' && !content.current) return;
              setExporting(true);
              try {
                // The tidy chart is printed with everything open and without its buttons; the tree chart as it was.
                if (view === 'tidy') {
                  setPrintingTidy(true);
                  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
                }
                const { downloadOrgChartPdf } = await import('../../../utils/orgChartPdf');
                const { jalaliStamp } = await import('../../../utils/reportExport');
                // The company's code and today's Jalali date (or the chart's day); ASCII on purpose, as every export here.
                const code = (company.code || '').replace(/[^A-Za-z0-9_-]+/g, '') || 'company';
                const day = asOf ? jalaliDay(asOf).replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/\//g, '-') : jalaliStamp();
                await downloadOrgChartPdf((view === 'tidy' ? tidyRoot.current : content.current)!, `چارت سازمانی ${company.name}`, `org-chart-${code}-${day}.pdf`);
              } catch (err) {
                console.error('Org chart PDF failed:', err);
                void appAlert('دریافت فایل PDF چارت انجام نشد.');
              } finally {
                setPrintingTidy(false);
                setExporting(false);
              }
            }}
            className="w-9 h-9 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-indigo-600 flex items-center justify-center cursor-pointer disabled:opacity-50 disabled:cursor-wait"
            title="دریافت PDF چارت"
            aria-label="دریافت PDF چارت"
          >
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
          </button>
          <button type="button" onClick={() => setFullscreen(!fullscreen)} className="w-9 h-9 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-indigo-600 flex items-center justify-center cursor-pointer" title={fullscreen ? 'خروج از تمام‌صفحه' : 'تمام‌صفحه'} aria-label={fullscreen ? 'خروج از تمام‌صفحه' : 'تمام‌صفحه'}>
            {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {view === 'tidy' ? (
        <div className={`relative overflow-auto ${fullscreen ? 'flex-1 min-h-0' : 'max-h-[75vh] xl:max-h-[calc(100vh-170px)]'}`}>
          <TidyBoundary onFail={() => setUserView('tree')}>
            <TidyOrgChart
              company={company}
              selection={selection}
              onSelect={(next) => choose(next)}
              open={printingTidy ? allOpenSet(company) : tidyOpen}
              onToggle={toggleTidy}
              showEmpty={showEmpty}
              printing={printingTidy}
              rootRef={tidyRoot}
            />
          </TidyBoundary>
          {asOf && (
            <p role="status" className="sticky bottom-3 mx-3 mb-3 w-fit rounded-lg bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200 px-3 py-1.5 text-xs font-bold shadow-md">
              چارت در تاریخ {jalaliDay(asOf)} (فقط نمایش)
            </p>
          )}
        </div>
      ) : (
      <div
        ref={viewport}
        tabIndex={0}
        onPointerDown={() => setHint(false)}
        onWheel={() => setHint(false)}
        aria-label="چارت سازمانی؛ با چرخ ماوس یا دو انگشت بزرگ‌نمایی کنید و با کشیدن جابه‌جا کنید"
        className={`relative overflow-hidden touch-none select-none outline-hidden cursor-grab data-[dragging=true]:cursor-grabbing data-[dragging=true]:[&_*]:cursor-grabbing bg-slate-50/60 dark:bg-slate-950/40 ${fullscreen ? 'flex-1 min-h-0' : 'h-[65vh] min-h-[420px] xl:h-[calc(100vh-170px)] xl:min-h-[620px]'}`}
      >
        <div ref={content} className="absolute top-0 left-0 origin-top-left w-max px-10 py-10 flex flex-col items-center">
          {/* secondary links (dotted / dashed lines between nodes), behind the cards; none: nothing */}
          {showLinks && <OrgLinkLayer company={company} content={content} highlightNodeId={selection?.kind === 'unit' ? selection.unitId : null} />}
          {/* the company */}
          <NodeCard
            node={`company:${company.companyId}`}
            label={company.name}
            selected={isSelected({ kind: 'company', companyId: company.companyId })}
            onSelect={() => choose({ kind: 'company', companyId: company.companyId })}
            className="w-72 bg-gradient-to-br from-indigo-50/80 to-white dark:from-indigo-950/40 dark:to-slate-900"
            dnd={dndOf(null)}
          >
            <div className="flex items-center gap-3 p-4">
              <CompanyLogo logoUrl={company.logoUrl} name={company.name} fallback={<span className="w-11 h-11 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-indigo-500/30"><Building2 className="w-5 h-5" /></span>} />
              <span className="min-w-0 flex-1">
                <span className="block text-base font-extrabold text-slate-900 dark:text-white truncate">{company.name}</span>
              </span>
            </div>
            <div className="flex items-center justify-between border-t border-indigo-100/70 dark:border-slate-800 px-4 py-1.5 text-[11px] text-slate-500">
              <span>{toPersianDigits(nodeCount(company))} گره</span>
              <span>{toPersianDigits(companyHeadcount(company))} نفر</span>
            </div>
          </NodeCard>

          {/* the head of the company, between it and its deputies */}
          <span className={`w-0.5 h-6 ${line}`} aria-hidden="true" />
          {!company.manager && headPostOf(company) ? (
            <NodeCard
              node={`position:${headPostOf(company)!.unitPositionId}`}
              label={`${headTitleOf(company)}: ${postLabel(headPostOf(company)!)}`}
              selected={isSelected({ kind: 'position', companyId: company.companyId, unitId: '', unitPositionId: headPostOf(company)!.unitPositionId })}
              onSelect={() => choose({ kind: 'position', companyId: company.companyId, unitId: '', unitPositionId: headPostOf(company)!.unitPositionId })}
              className="w-64 border-dashed"
            >
              <div className="flex items-center gap-2.5 p-3">
                <span className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-300 flex items-center justify-center shrink-0"><Crown className="w-[18px] h-[18px]" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] font-bold text-amber-700 dark:text-amber-300 truncate">{headTitleOf(company)} · {postLabel(headPostOf(company)!)}</span>
                  <span className="block text-xs text-slate-400">خالی</span>
                </span>
              </div>
            </NodeCard>
          ) : company.manager ? (
            <NodeCard
              node={`member:${company.manager.userId}`}
              label={`${headTitleOf(company)}: ${company.manager.displayName}`}
              selected={selectedUserId === company.manager.userId}
              onSelect={() => choose({ kind: 'member', userId: company.manager!.userId })}
              className="w-64"
            >
              <div className="flex items-center gap-2.5 p-3">
                <span className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-300 flex items-center justify-center shrink-0"><Crown className="w-[18px] h-[18px]" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] font-bold text-amber-700 dark:text-amber-300 truncate">{headTitleOf(company)}{headPostOf(company)?.code ? ` · کد ${toPersianDigits(headPostOf(company)!.code!)}` : ''}</span>
                  <PersonLine person={company.manager} empty="" />
                </span>
              </div>
            </NodeCard>
          ) : (
            <div className="w-64 rounded-2xl border border-dashed border-slate-300 dark:border-slate-600 bg-white/70 dark:bg-slate-900/70 p-3 flex items-center gap-2.5">
              <span className="w-9 h-9 rounded-xl bg-slate-100 text-slate-400 dark:bg-slate-800 flex items-center justify-center shrink-0"><Crown className="w-[18px] h-[18px]" /></span>
              <span className="min-w-0">
                <span className="block text-[11px] font-bold text-slate-500">{headTitleOf(company)}</span>
                <span className="block text-xs text-slate-400">تعیین نشده</span>
              </span>
            </div>
          )}

          {/* the company's other posts (board members, advisers...), right under its head */}
          {companyPostsOf(company).some((p) => !p.isHead) && (
            <div className="mt-2 flex flex-wrap justify-center gap-2 max-w-3xl">
              {companyPostsOf(company).filter((p) => !p.isHead).map((post) => {
                const select: ChartSelection = { kind: 'position', companyId: company.companyId, unitId: '', unitPositionId: post.unitPositionId };
                const holder = post.holders[0];
                return (
                  <NodeCard
                    key={post.unitPositionId}
                    node={`position:${post.unitPositionId}`}
                    label={postLabel(post)}
                    selected={isSelected(select)}
                    onSelect={() => choose(select)}
                    className={`w-56 ${holder ? '' : 'border-dashed'} ${post.isActive ? '' : 'opacity-70'}`}
                  >
                    <div className="flex items-center gap-2.5 p-2.5">
                      <span className="w-8 h-8 rounded-xl bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-300 flex items-center justify-center shrink-0"><Briefcase className="w-4 h-4" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-extrabold text-slate-800 dark:text-slate-100 truncate">{postLabel(post)}</span>
                        <span className="block text-[11px] text-slate-500 truncate">{holder ? holder.displayName : 'خالی'}</span>
                      </span>
                    </div>
                  </NodeCard>
                );
              })}
            </div>
          )}

          {company.members.length > 0 && (
            <button
              type="button"
              data-node={`direct:${company.companyId}`}
              onClick={() => choose({ kind: 'direct', companyId: company.companyId })}
              className={`mt-2 px-3 py-1 rounded-full border bg-white dark:bg-slate-900 text-[11px] font-bold cursor-pointer ${isSelected({ kind: 'direct', companyId: company.companyId }) ? 'border-indigo-400 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300' : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:border-indigo-300'}`}
            >
              مستقیم زیر شرکت · {toPersianDigits(company.members.length)} نفر
            </button>
          )}

          {units.length === 0 ? (
            <p className="mt-6 text-sm text-slate-500">این شرکت هنوز گره‌ای ندارد. از پنل کنار، «افزودن معاونت» را بزنید.</p>
          ) : (
            <>
              <span className={`w-0.5 h-8 ${line}`} aria-hidden="true" />
              {rows.length === 1 ? unitRow(rows[0], false) : (
                <div className="flex flex-col items-start">
                  {rows.map((row, r) => (
                    <div key={row[0].unitId} className={`relative ${r > 0 ? 'pt-14' : ''}`}>
                      {/* the line down the start side that joins the rows */}
                      {r < rows.length - 1
                        ? <span aria-hidden="true" className={`absolute start-0 top-0 bottom-0 w-0.5 ${line}`} />
                        : <span aria-hidden="true" className={`absolute start-0 top-0 h-14 w-0.5 ${line}`} />}
                      {unitRow(row, true)}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {hint && <p className="pointer-events-none absolute top-3 left-3 z-10 hidden sm:block rounded-lg bg-white/80 dark:bg-slate-900/80 px-2.5 py-1 text-[11px] text-slate-500 shadow-xs">
          <span className="pointer-coarse:hidden">چرخ ماوس: بزرگ‌نمایی · کشیدن: جابه‌جایی · دوبار کلیک: نزدیک‌تر</span>
          <span className="hidden pointer-coarse:inline">دو انگشت: بزرگ‌نمایی · کشیدن: جابه‌جایی</span>
        </p>}
        {asOf && (
          <p role="status" className="pointer-events-none absolute top-3 end-3 z-10 max-w-sm rounded-lg bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200 px-3 py-1.5 text-xs font-bold shadow-md">
            چارت در تاریخ {jalaliDay(asOf)} (فقط نمایش؛ کدام گره‌ها وجود داشتند، نه جای آن‌ها آن روز)
          </p>
        )}
        {(dragId || dragNote) && (
          <p role="status" className={`pointer-events-none absolute top-3 start-3 z-10 max-w-md rounded-lg px-3 py-1.5 text-xs font-bold shadow-md ${dragNote || (dragId && dropOver?.reason) ? 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-200' : 'bg-white/90 dark:bg-slate-900/90 text-slate-600 dark:text-slate-300'}`}>
            {/* While hovering a place the node may not go: why, at once (not only after letting go). */}
            {dragNote || (dragId && dropOver?.reason) || 'کارت را روی گره‌ی بالاتر جدید (یا روی شرکت، برای بالاترین سطح) رها کنید؛ پیش‌نمایش اثر قبل از ذخیره نشان داده می‌شود.'}
          </p>
        )}
        <ZoomControls subscribe={subscribe} zoomBy={zoomBy} fit={fit} />
      </div>
      )}

      {(data.data?.unplaced.length || 0) > 0 && (
        <div className="border-t border-slate-100 dark:border-slate-800 px-4 py-2 flex items-center gap-3">
          <p className="shrink-0 flex items-center gap-1.5 text-xs font-bold text-amber-700 dark:text-amber-300">
            <UserX className="w-4 h-4" /> افراد بدون جایگاه سازمانی ({toPersianDigits(data.data!.unplaced.length)})
          </p>
          {/* One row (scrolling sideways when long), so the chart keeps the height. */}
          <div className="flex gap-1.5 overflow-x-auto min-w-0 py-0.5">
            {data.data!.unplaced.map((u) => (
              <button
                key={u.userId}
                type="button"
                onClick={() => setSelection({ kind: 'unplaced', userId: u.userId })}
                className={`shrink-0 whitespace-nowrap flex items-center gap-1.5 rounded-full border ps-1 pe-3 py-1 text-xs cursor-pointer ${selectedUserId === u.userId ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-950/50' : 'border-slate-200 dark:border-slate-700 hover:border-indigo-300'}`}
              >
                <PersonAvatar name={u.displayName} url={u.avatarUrl} />
                <span className="font-bold text-slate-700 dark:text-slate-200">{u.displayName}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </AdminCard>
  );

  return (
    <>
    {fullscreen && <div className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-xs" onClick={() => setFullscreen(false)} />}
    {/* The chart takes the page's width from the start (right) edge; on wide screens its details
        sit beside it at the end, exactly as tall as the chart and scrolling inside when longer, and
        below that they come under the chart. Full screen keeps them beside it. */}
    <div className={fullscreen
      ? 'fixed inset-3 z-50 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-3 items-stretch'
      : 'grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_380px] gap-4 items-start 2xl:items-stretch'}
    >
      <div className={fullscreen ? 'min-h-0 flex flex-col' : ''}>{board}</div>
      <div className={fullscreen ? 'overflow-y-auto min-h-0' : '2xl:relative'}>
      <div className={fullscreen ? '' : '2xl:absolute 2xl:inset-0'}>
      <DetailsBoundary key={JSON.stringify(selection)}>
      <OrgChartDetails
        can={can}
        chart={chart}
        positions={data.data?.positions || []}
        unplaced={data.data?.unplaced || []}
        nodes={nodeApi ? data.data?.nodes || [] : []}
        nodeTypes={data.data?.nodeTypes || []}
        linkTypes={data.data?.linkTypes || []}
        rules={rules}
        onRequestMove={(unitId) => setMoveRequest({ unitId })}
        onRequestAdd={(parentId) => setAddRequest({ parentId })}
        selection={selection}
        onSelect={(next) => choose(next)}
        onChanged={data.reload}
      />
      </DetailsBoundary>
      </div>
      </div>
    </div>
    {moveRequest && unitById.get(moveRequest.unitId) && createPortal(
      <MoveNodeDialog
        company={company}
        unit={unitById.get(moveRequest.unitId)!}
        rules={rules}
        initialParentId={moveRequest.parentId}
        rowVersion={versionOf(moveRequest.unitId)}
        onMoved={async () => { await data.reload(); choose({ kind: 'unit', companyId: company.companyId, unitId: moveRequest.unitId }, { force: true }); }}
        onReload={data.reload}
        onClose={() => setMoveRequest(null)}
      />,
      document.body,
    )}
    {linkChoices && createPortal(
      <AutoLinkChoiceDialog choices={linkChoices} onDone={data.reload} onClose={() => setLinkChoices(null)} />,
      document.body,
    )}
    {addRequest && createPortal(
      <AddNodeDialog
        company={company}
        parent={addRequest.parentId ? unitById.get(addRequest.parentId) ?? null : null}
        types={addableTypes(data.data?.nodeTypes || [], rules, addRequest.parentId ? unitById.get(addRequest.parentId) ?? null : null)}
        onCreated={async (node) => {
          await data.reload();
          // Stay on the node the new one was added to, so more can be added there.
          choose(addRequest.parentId
            ? { kind: 'unit', companyId: company.companyId, unitId: addRequest.parentId }
            : { kind: 'company', companyId: company.companyId }, { force: true });
          // An automatic link rule with several possible targets: the user picks.
          if (node.autoLinkChoices?.length) setLinkChoices(node.autoLinkChoices);
        }}
        onClose={() => setAddRequest(null)}
      />,
      document.body,
    )}
    </>
  );
};
