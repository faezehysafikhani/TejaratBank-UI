import React from 'react';
import { AlertTriangle, Building2, ChevronDown, ChevronLeft, Crown, Briefcase, Users } from 'lucide-react';
import type { ChartCompany, ChartMember, ChartPosition, ChartUnit } from '../../../services/orgStructureApi';
import { headTitleOf, postLabel } from '../../../services/orgStructureApi';
import { toPersianDigits } from '../../../utils/helpers';
import { ChartSelection, allUnitsOf, headPostOf } from './orgChartModel';
import { PersonAvatar } from './PersonAvatar';
import { NodeTypeIcon, safeColor } from './nodes/nodeTypeStyle';
import { CompanyLogo } from './nodes/CompanyLogo';
import { PAGE_SIZE, peopleCountOf, postRowsOf, vacantKey } from './tidyChartModel';

/** A render crash in the tidy chart: the board falls back to the tree chart (see OrgChartBoard). */
export class TidyBoundary extends React.Component<{ onFail: () => void; children: React.ReactNode }, { failed: boolean }> {
  declare props: { onFail: () => void; children: React.ReactNode };
  declare setState: (state: { failed: boolean }) => void;
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { console.error('Tidy org chart failed:', error); this.props.onFail(); }
  render() {
    return this.state.failed
      ? <p role="alert" className="m-4 flex items-center gap-2 rounded-xl bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-200 px-3 py-2 text-sm"><AlertTriangle className="w-4 h-4" /> نمایش چارت مرتب انجام نشد؛ به چارت درختی برگشتیم.</p>
      : this.props.children;
  }
}

interface Ctx {
  company: ChartCompany;
  selection: ChartSelection | null;
  onSelect: (selection: ChartSelection) => void;
  open: Set<string>;
  toggle: (key: string) => void;
  showEmpty: boolean;
  /** Printing: everything open, no buttons for moving around. */
  printing: boolean;
  nameOf: Map<string, string>;
  shown: Map<string, number>;
  more: (key: string) => void;
}

const rowBase = 'w-full flex items-center gap-2 rounded-lg px-2 py-1 text-start transition-colors';
const pick = (on: boolean) => (on ? 'bg-indigo-50 dark:bg-indigo-950/50 ring-1 ring-indigo-300 dark:ring-indigo-700' : 'hover:bg-slate-50 dark:hover:bg-slate-800/60');

const Headcount: React.FC<{ n: number }> = ({ n }) => n > 0
  ? <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400 shrink-0" title={`${toPersianDigits(n)} نفر`}><Users className="w-3 h-3" aria-hidden="true" /><span aria-label={`${toPersianDigits(n)} نفر`}>{toPersianDigits(n)}</span></span>
  : null;

const PostRow: React.FC<{ ctx: Ctx; unit: ChartUnit; post: ChartPosition; holder: ChartMember }> = ({ ctx, unit, post, holder }) => {
  const isManager = unit.manager?.userId === holder.userId || !!post.isHead;
  const select: ChartSelection = { kind: 'member', userId: holder.userId };
  const on = ctx.selection?.kind === 'member' && ctx.selection.userId === holder.userId;
  return (
    <button type="button" onClick={() => ctx.onSelect(select)} aria-current={on ? 'true' : undefined} data-tidy-selected={on ? 'true' : undefined} className={`${rowBase} ${pick(on)} ${holder.isActive ? '' : 'opacity-50'}`}>
      <PersonAvatar name={holder.displayName} url={holder.avatarUrl} />
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-bold text-slate-800 dark:text-slate-100 truncate" title={holder.displayName}>{holder.displayName}</span>
        <span className="block text-[11px] text-slate-500 dark:text-slate-400 truncate" title={postLabel(post)}>{postLabel(post)}</span>
      </span>
      {isManager && <Crown className="w-3.5 h-3.5 text-amber-600 dark:text-amber-300 shrink-0" aria-label="پست مدیر" />}
    </button>
  );
};

const VacantRow: React.FC<{ ctx: Ctx; unit: ChartUnit; post: ChartPosition }> = ({ ctx, unit, post }) => {
  const select: ChartSelection = { kind: 'position', companyId: ctx.company.companyId, unitId: unit.unitId, unitPositionId: post.unitPositionId };
  const on = ctx.selection?.kind === 'position' && ctx.selection.unitPositionId === post.unitPositionId;
  return (
    <button type="button" onClick={() => ctx.onSelect(select)} aria-current={on ? 'true' : undefined} data-tidy-selected={on ? 'true' : undefined} className={`${rowBase} border border-dashed border-amber-400 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 ${on ? 'ring-1 ring-indigo-300' : ''}`}>
      <Briefcase className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span className="text-xs font-bold truncate" title={`${postLabel(post)} خالی`}>{postLabel(post)} خالی</span>
    </button>
  );
};

const Posts: React.FC<{ ctx: Ctx; unit: ChartUnit }> = ({ ctx, unit }) => {
  const rows = postRowsOf(unit, ctx.showEmpty);
  const barOpen = ctx.printing || ctx.open.has(vacantKey(unit.unitId));
  return (
    <div className="space-y-1">
      {rows.filled.map(({ post, holder }) => <PostRow key={`${post.unitPositionId}:${holder.userId}`} ctx={ctx} unit={unit} post={post} holder={holder} />)}
      {unit.members.map((m) => (
        <button key={m.userId} type="button" onClick={() => ctx.onSelect({ kind: 'member', userId: m.userId })} className={`${rowBase} ${pick(ctx.selection?.kind === 'member' && ctx.selection.userId === m.userId)}`}>
          <PersonAvatar name={m.displayName} url={m.avatarUrl} />
          <span className="min-w-0 flex-1"><span className="block text-xs font-bold text-slate-800 dark:text-slate-100 truncate" title={m.displayName}>{m.displayName}</span><span className="block text-[11px] text-slate-500 truncate">بدون سمت</span></span>
        </button>
      ))}
      {rows.collapseVacant ? (
        <>
          <button type="button" onClick={() => ctx.toggle(vacantKey(unit.unitId))} aria-expanded={barOpen} className={`${rowBase} border border-dashed border-amber-400 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200`}>
            <Briefcase className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span className="text-xs font-bold flex-1">{toPersianDigits(rows.vacant.length)} پست خالی</span>
            {!ctx.printing && (barOpen ? <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" /> : <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />)}
          </button>
          {barOpen && rows.vacant.map((p) => <VacantRow key={p.unitPositionId} ctx={ctx} unit={unit} post={p} />)}
        </>
      ) : rows.vacant.map((p) => <VacantRow key={p.unitPositionId} ctx={ctx} unit={unit} post={p} />)}
    </div>
  );
};

/** A node as a row that opens: its posts, then the nodes under it, indented under a thin line. */
const NodeRow: React.FC<{ ctx: Ctx; unit: ChartUnit; depth: number }> = ({ ctx, unit, depth }) => {
  const isOpen = ctx.printing || ctx.open.has(unit.unitId);
  const kids = unit.children || [];
  const hasInside = kids.length > 0 || (unit.positions || []).length > 0 || unit.members.length > 0;
  const people = peopleCountOf(unit);
  const on = ctx.selection?.kind === 'unit' && ctx.selection.unitId === unit.unitId;
  const inactive = unit.isActive === false;
  // Everything in one list: a node shows all of its children.
  const limit = kids.length;
  return (
    <li data-tidy-node={unit.unitId} className="space-y-1">
      <div data-tidy-row={unit.unitId} className={`flex items-center gap-1 rounded-lg ${pick(on)} ${inactive ? 'opacity-60 border border-dashed border-slate-300 dark:border-slate-600' : ''}`}>
        {!ctx.printing && (
          <button type="button" disabled={!hasInside} onClick={() => ctx.toggle(unit.unitId)} aria-expanded={isOpen} aria-label={`${isOpen ? 'بستن' : 'باز کردن'} ${unit.name}`} className="w-7 h-7 shrink-0 rounded-md text-slate-500 hover:text-indigo-600 disabled:opacity-30 flex items-center justify-center cursor-pointer">
            {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        )}
        <button type="button" onClick={() => ctx.onSelect({ kind: 'unit', companyId: ctx.company.companyId, unitId: unit.unitId })} aria-current={on ? 'true' : undefined} data-tidy-selected={on ? 'true' : undefined} className="flex-1 min-w-0 flex items-center gap-2 py-1 pe-2 text-start cursor-pointer">
          <NodeTypeIcon icon={unit.nodeType?.icon} className="w-[18px] h-[18px] shrink-0" color={unit.nodeType?.color} />
          <span className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate" title={unit.name}>{unit.name}{inactive ? ' (غیرفعال)' : ''}</span>
          {unit.nodeType && <span className="text-[11px] font-bold shrink-0" style={{ color: safeColor(unit.nodeType.color) }}>{unit.nodeType.name}</span>}
          <span className="flex-1" />
          <Headcount n={people} />
        </button>
      </div>
      {isOpen && hasInside && (
        <div className="ms-3 ps-3 border-s border-slate-200 dark:border-slate-700 space-y-1" data-depth={depth}>
          <Posts ctx={ctx} unit={unit} />
          {kids.length > 0 && (
            <ul className="space-y-1">
              {(ctx.printing ? kids : kids.slice(0, limit)).map((k) => <NodeRow key={k.unitId} ctx={ctx} unit={k} depth={depth + 1} />)}
              {!ctx.printing && kids.length > limit && (
                <li><button type="button" onClick={() => ctx.more(unit.unitId)} className="ms-2 text-xs font-bold text-indigo-700 dark:text-indigo-300 cursor-pointer">نمایش {toPersianDigits(Math.min(PAGE_SIZE, kids.length - limit))} مورد بعدی</button></li>
              )}
            </ul>
          )}
        </div>
      )}
    </li>
  );
};


/** The dashed arrows of the nodes' links (e.g. «گزارش‌دهی نقطه‌چین»): a half circle in the right margin, from the row of the node to the row of its target (each a little wider). A row that is closed away is not drawn. */
const LANE = 16;
const LinkArrows: React.FC<{ company: ChartCompany; deps: unknown[]; children: React.ReactNode }> = ({ company, deps, children }) => {
  const box = React.useRef<HTMLDivElement>(null);
  const links = React.useMemo(() => allUnitsOf(company).flatMap((u) => (u.links || []).map((l) => ({ ...l, from: u.unitId, fromName: u.name }))), [company]);
  const nameOf = React.useMemo(() => new Map(allUnitsOf(company).map((u) => [u.unitId, u.name] as const)), [company]);
  const [paths, setPaths] = React.useState<{ key: string; d: string; title: string; style: string }[]>([]);
  const gutter = links.length ? 24 + links.length * LANE : 0;

  const measure = React.useCallback(() => {
    const el = box.current;
    if (!el || links.length === 0) { setPaths([]); return; }
    const outer = el.getBoundingClientRect();
    const rowOf = (id: string) => el.querySelector(`[data-tidy-row="${CSS.escape(id)}"]`) as HTMLElement | null;
    const next: { key: string; d: string; title: string; style: string }[] = [];
    links.forEach((l, i) => {
      const a = rowOf(l.from);
      const b = rowOf(l.targetNodeId);
      if (!a || !b) return;
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      // Right to left: a row starts at its right edge.
      const xa = ra.right - outer.left + 2;
      const xb = rb.right - outer.left + 2;
      const ya = ra.top - outer.top + ra.height / 2;
      const yb = rb.top - outer.top + rb.height / 2;
      // A half circle (squeezed into the margin) from the start of one row to the start of the other.
      const edge = outer.width - gutter + 4;
      const rx = 16 + i * LANE;
      const ry = Math.abs(yb - ya) / 2;
      const sweep = ya < yb ? 1 : 0;
      next.push({ key: l.linkId, d: `M ${xa} ${ya} H ${edge} A ${rx} ${ry} 0 0 ${sweep} ${edge} ${yb} H ${xb + 4}`, title: `${l.fromName} ← ${l.name} ← ${nameOf.get(l.targetNodeId) ?? ''}`, style: l.lineStyle });
    });
    setPaths(next);
  }, [links, nameOf, gutter]);

  React.useLayoutEffect(() => { measure(); }, [measure, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(el);
    return () => observer.disconnect();
  }, [measure]);

  return (
    <div ref={box} className="relative" style={{ paddingInlineStart: gutter }}>
      {children}
      {paths.length > 0 && (
        <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible" aria-hidden="true" data-testid="tidy-links">
          <defs>
            <marker id="tidy-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L8,4 L0,8 z" className="fill-violet-500" />
            </marker>
          </defs>
          {paths.map((p) => (
            <path key={p.key} d={p.d} fill="none" className="stroke-violet-500" strokeWidth={1.6}
              strokeDasharray={p.style === 'solid' ? undefined : p.style === 'dashed' ? '6 4' : '2 3'} markerEnd="url(#tidy-arrow)">
              <title>{p.title}</title>
            </path>
          ))}
        </svg>
      )}
    </div>
  );
};

/**
 * «چارت مرتب»: the whole company as one indented list - the company, its head, then every node
 * with an open/close arrow, its icon and the name of its part of the chart; a node's posts and
 * people sit under it. Dotted links («مافوق دوم») are dashed arrows in the margin on the right.
 * Uses the board's selection, so a click shows the node in the details panel as before.
 */
export const TidyOrgChart: React.FC<{
  company: ChartCompany;
  selection: ChartSelection | null;
  onSelect: (selection: ChartSelection) => void;
  open: Set<string>;
  onToggle: (key: string) => void;
  showEmpty: boolean;
  printing?: boolean;
  rootRef?: React.Ref<HTMLDivElement>;
}> = ({ company, selection, onSelect, open, onToggle, showEmpty, printing = false, rootRef }) => {
  const nameOf = React.useMemo(() => new Map(allUnitsOf(company).map((u) => [u.unitId, u.name] as const)), [company]);
  const [shown, setShown] = React.useState<Map<string, number>>(new Map());
  const more = (key: string) => setShown((prev: Map<string, number>) => new Map<string, number>(prev).set(key, (prev.get(key) ?? PAGE_SIZE) + PAGE_SIZE));
  const ctx: Ctx = { company, selection, onSelect, open, toggle: onToggle, showEmpty, printing, nameOf, shown, more };

  // A node chosen elsewhere (search, side panel) is on a page of a long list: show up to it.
  React.useEffect(() => {
    if (!selection) return;
    // A person is on the page of the node they sit in (a post of it, or none).
    let id: string | null = 'unitId' in selection && selection.unitId ? selection.unitId : null;
    if (!id && selection.kind === 'member') {
      const userId = selection.userId;
      id = allUnitsOf(company).find((u) => u.members.some((m) => m.userId === userId) || (u.positions || []).some((p) => p.holders.some((h) => h.userId === userId)))?.unitId ?? null;
    }
    const lists: [string, ChartUnit[]][] = [
      ['top', company.units] as [string, ChartUnit[]],
      ...allUnitsOf(company).map((u) => [u.unitId, u.children || []] as [string, ChartUnit[]]),
    ];
    const grow = new Map<string, number>();
    const target = id;
    const has = (u: ChartUnit): boolean => u.unitId === target || (u.children || []).some(has);
    for (const [key, nodes] of (target ? lists : [])) {
      const at = nodes.findIndex(has);
      const page = key === 'top' ? PAGE_SIZE * 3 : PAGE_SIZE;
      if (at >= page) grow.set(key, Math.ceil((at + 1) / PAGE_SIZE) * PAGE_SIZE);
    }
    if (grow.size) setShown((prev: Map<string, number>) => { const next = new Map<string, number>(prev); grow.forEach((v: number, k: string) => next.set(k, Math.max(v, next.get(k) ?? 0))); return next; });
    // Bring the chosen card into view once it is drawn (its branches open and its page of the list shown first):
    // first inside the chart's own scroll box, then the page itself. Instant, because smooth scrolls of the
    // box and the page cancel each other; tried again after the side panel and the layout have settled.
    const reveal = () => {
      const el = document.querySelector('[data-testid="tidy-chart"] [data-tidy-selected="true"]') as HTMLElement | null;
      if (!el) return;
      const box = el.closest('.overflow-auto') as HTMLElement | null;
      if (box) {
        const inBox = el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
        box.scrollTop = Math.max(0, inBox - box.clientHeight / 2 + el.offsetHeight / 2);
      }
      el.scrollIntoView({ block: 'center', behavior: 'auto' });
    };
    const timers = [200, 700].map((ms) => window.setTimeout(reveal, ms));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [selection]); // eslint-disable-line react-hooks/exhaustive-deps

  const head = headPostOf(company);
  const companyOn = selection?.kind === 'company' && selection.companyId === company.companyId;
  const headSelect: ChartSelection | null = company.manager
    ? { kind: 'member', userId: company.manager.userId }
    : head ? { kind: 'position', companyId: company.companyId, unitId: '', unitPositionId: head.unitPositionId } : null;
  const headOn = !!headSelect && (headSelect.kind === 'member'
    ? selection?.kind === 'member' && selection.userId === headSelect.userId
    : selection?.kind === 'position' && selection.unitPositionId === (head?.unitPositionId ?? ''));
  const limit = company.units.length;
  return (
    <div ref={rootRef} data-testid="tidy-chart" className="p-3 sm:p-5 bg-slate-50/60 dark:bg-slate-950/40">
      <div className="relative rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 py-3 ps-3" style={{ paddingInlineEnd: 12 }}>
        <LinkArrows company={company} deps={[open, shown, showEmpty, printing]}>
          <ul className="space-y-1">
            <li>
              <button type="button" onClick={() => onSelect({ kind: 'company', companyId: company.companyId })} aria-current={companyOn ? 'true' : undefined} data-tidy-selected={companyOn ? 'true' : undefined} className={`${rowBase} ${pick(companyOn)}`}>
                <CompanyLogo logoUrl={company.logoUrl} name={company.name} className="w-7 h-7" fallback={<Building2 className="w-[18px] h-[18px] text-indigo-600 shrink-0" aria-hidden="true" />} />
                <span className="text-sm font-extrabold text-slate-900 dark:text-white truncate">{company.name}</span>
                <span className="text-[11px] font-bold text-indigo-600 dark:text-indigo-300 shrink-0">شرکت</span>
              </button>
            </li>
            {headSelect && (
              <li>
                <button type="button" onClick={() => onSelect(headSelect)} aria-current={headOn ? 'true' : undefined} data-tidy-selected={headOn ? 'true' : undefined} className={`${rowBase} ${pick(headOn)}`}>
                  <Crown className="w-[18px] h-[18px] text-amber-600 shrink-0" aria-hidden="true" />
                  <span className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">{company.manager?.displayName ?? (head ? `${postLabel(head)} (خالی)` : '')}</span>
                  <span className="text-[11px] font-bold text-amber-700 dark:text-amber-300 shrink-0">{headTitleOf(company)}</span>
                </button>
              </li>
            )}
            {company.units.length === 0
              ? <li className="p-4 text-sm text-slate-500">این شرکت هنوز گره‌ای ندارد.</li>
              : (printing ? company.units : company.units.slice(0, limit)).map((u) => <NodeRow key={u.unitId} ctx={ctx} unit={u} depth={0} />)}
            {!printing && company.units.length > limit && (
              <li><button type="button" onClick={() => more('top')} className="ms-2 text-xs font-bold text-indigo-700 dark:text-indigo-300 cursor-pointer">نمایش {toPersianDigits(Math.min(PAGE_SIZE, company.units.length - limit))} مورد بعدی</button></li>
            )}
          </ul>
        </LinkArrows>
      </div>
    </div>
  );
};
