// «چارت سازمانی»: the one place the organization is built and edited. «چارت مرتب» is where nodes are made;
// «چارت درختی» draws the same data. The organization is the company; units and positions are its nodes.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Building2, ChevronsDownUp, ChevronsUpDown, Loader2, Plus, Search, UserX } from 'lucide-react';
import { AdminCard, Notice, PrimaryButton, SecondaryButton, inputClass } from '../../AdminUi';
import {
  type Company, type KindNode, type KindTypes, type UnplacedUser, ORG_STRUCTURE_PERMISSIONS as P, addNodePerson, canNode, createNode, deactivateNode,
  ensureKinds, getKindChart, listCompanies, listUnplacedUsers, moveNode, removeNodePerson, setNodeHead, setPrimaryNodePerson, updateNode,
} from '../../../../services/orgStructureApi';
import { userErrorMessage } from '../../../../utils/errorMessages';
import { appConfirm } from '../../../../utils/appDialog';
import { showToast } from '../../../../utils/toast';
import { toPersianDigits } from '../../../../utils/helpers';
import { CompanyFormDialog } from '../nodes/CompanyFormDialog';
import { KIND_INFO, TEMPLATES, buildTree, canHaveHead, countBelow, parseOutline, pathsToMatches, walk, type KindKey, type KindTreeNode } from './orgKinds';
import { KindNodeDialog, type KindFormValues } from './KindNodeDialog';
import { KindListView } from './KindListView';
import { KindTreeView } from './KindTreeView';
import { KindMoveDialog } from './KindMoveDialog';
import { NewOrgDialog } from './NewOrgDialog';
import type { PanZoomView } from '../usePanZoom';
import type { KindActions } from './kindsUi';

type View = 'list' | 'tree';
const VIEW_KEY = 'org_kinds_view_v1';
const COMPANY_KEY = 'org_kinds_company_v1';
const readStored = (key: string): string | null => { try { return localStorage.getItem(key); } catch { return null; } };
const store = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* storage blocked */ } };

type DialogState =
  | { mode: 'add'; parent: KindTreeNode | null }
  | { mode: 'edit'; node: KindTreeNode; parent: KindTreeNode | null; focusPeople: boolean };

export const KindsChart: React.FC<{ can: (permission: string) => boolean }> = ({ can }) => {
  const [companies, setCompanies] = useState<Company[] | null>(null);
  const [nodes, setNodes] = useState<KindNode[]>([]);
  const [unplaced, setUnplaced] = useState<UnplacedUser[]>([]);
  const [types, setTypes] = useState<KindTypes | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(readStored(COMPANY_KEY));
  const [view, setView] = useState<View>(readStored(VIEW_KEY) === 'tree' ? 'tree' : 'list');
  const [query, setQuery] = useState('');
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({});
  /** Where the tree chart was left (kept while the list is shown). */
  const treeView = useRef<PanZoomView | null>(null);
  const [moving, setMoving] = useState<KindTreeNode | null>(null);
  /** What the open form's save is doing now. */
  const [progress, setProgress] = useState<string | null>(null);
  /** Buttons wait while the list settles after a change (no click lands on a row that moved). */
  const [settling, setSettling] = useState(false);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [orgDialog, setOrgDialog] = useState<'new' | 'edit' | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showUnplaced, setShowUnplaced] = useState(false);
  const pendingTimer = useRef<ReturnType<typeof setTimeout>>();

  const allow = useMemo(() => ({
    create: canNode(can, 'create'), update: canNode(can, 'update'), remove: canNode(can, 'deactivate'), assign: canNode(can, 'assign'), move: canNode(can, 'move'),
  }), [can]);

  const reload = useCallback(async () => {
    try {
      const [list, chart, free] = await Promise.all([listCompanies(), getKindChart(), listUnplacedUsers().catch(() => [] as UnplacedUser[])]);
      setCompanies(list);
      setNodes(chart.filter((n) => n.isActive));
      setUnplaced(free);
      setError(null);
    } catch (err) {
      setError(userErrorMessage(err, 'دریافت چارت سازمانی ممکن نشد.'));
      setCompanies((prev) => prev ?? []);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);
  // The two kinds (and the rules between them) are made on the server the first time someone who may add opens the chart.
  useEffect(() => { if (allow.create) ensureKinds().then(setTypes).catch(() => setTypes(null)); }, [allow.create]);

  const company = companies?.find((c) => c.id === companyId) ?? companies?.find((c) => c.isActive) ?? companies?.[0] ?? null;
  const roots = useMemo(() => (company ? buildTree(nodes, company.id) : []), [nodes, company]);
  const childCompanies = useMemo(() => (company ? (companies || []).filter((c) => c.parentCompanyId === company.id && c.isActive) : []), [companies, company]);
  const total = useMemo(() => roots.reduce((n, r) => n + 1 + countBelow(r), 0), [roots]);

  const defaultOpen = useMemo(() => {
    const open: Record<string, boolean> = {};
    const depthLimit = total > 150 ? 1 : 99;
    const visit = (list: KindTreeNode[], depth: number) => list.forEach((n) => { open[n.id] = depth < depthLimit; visit(n.children, depth + 1); });
    visit(roots, 0);
    return open;
  }, [roots, total]);
  const isOpen = (id: string) => openMap[id] ?? defaultOpen[id] ?? true;
  const setAll = (value: boolean) => { const next: Record<string, boolean> = {}; walk(roots, (n) => { next[n.id] = value; }); setOpenMap(next); };

  const pickCompany = (id: string) => { setCompanyId(id); store(COMPANY_KEY, id); setOpenMap({}); setQuery(''); };
  const pickView = (next: View) => { setView(next); store(VIEW_KEY, next); };

  // Typing a search opens the way to every match.
  const forced = useMemo(() => pathsToMatches(roots, query), [roots, query]);
  const isOpenNow = (id: string) => (query.trim() ? forced.has(id) || isOpen(id) : isOpen(id));

  const flash = (id: string) => {
    setFlashId(id);
    setTimeout(() => {
      document.getElementById(`kind-${id}`)?.scrollIntoView({ block: 'center', inline: 'center' });
      document.getElementById(`kind-t-${id}`)?.scrollIntoView({ block: 'center', inline: 'center' });
    }, 60);
    setTimeout(() => setFlashId((current) => (current === id ? null : current)), 1800);
  };

  /** Runs `mutate` (a state change that moves rows) and then puts the page back so the row `id` stays where the eye was. */
  const keepPosition = (id: string, mutate: () => void) => {
    const row = document.getElementById(`kind-${id}`);
    const before = row?.getBoundingClientRect().top;
    mutate();
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const after = document.getElementById(`kind-${id}`)?.getBoundingClientRect().top;
      if (before == null || after == null || Math.abs(after - before) < 1) return;
      let holder: HTMLElement | null = row?.parentElement ?? null;
      while (holder && !(holder.scrollHeight > holder.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(holder).overflowY))) holder = holder.parentElement;
      if (holder) holder.scrollTop += after - before; else window.scrollBy(0, after - before);
    }));
  };

  /** Runs a change that reloads the chart; a failure is shown as a toast. */
  const run = async (action: () => Promise<void>, fallback: string): Promise<boolean> => {
    setBusy(true);
    try { await action(); await reload(); return true; }
    catch (err) { showToast(userErrorMessage(err, fallback), 'error'); await reload(); return false; }
    finally { setBusy(false); }
  };

  const typeIdOf = (kind: KindFormValues['kind']): string => {
    const id = kind === 'unit' ? types?.unitTypeId : types?.positionTypeId;
    if (!id) throw new Error('انواع گره هنوز آماده نشده است؛ کمی بعد دوباره امتحان کنید.');
    return id;
  };

  const submitAdd = async (parent: KindTreeNode | null, values: KindFormValues, keepOpen: boolean) => {
    if (!company) return;
    let lastId: string | null = null;
    try {
      for (const [index, name] of values.names.entries()) {
        const node = await createNode({ name, parentNodeId: parent?.id ?? null, companyId: parent ? null : company.id, nodeTypeId: typeIdOf(values.kind) });
        lastId = node.id;
        if (index === 0 && values.names.length === 1) {
          for (const person of values.persons) await addNodePerson(node.id, person.userId);
          if (values.isHead && parent) await setNodeHead(parent.id, node.id);
        }
      }
    } finally {
      await reload();
    }
    if (parent) setOpenMap((m) => ({ ...m, [parent.id]: true }));
    setQuery('');
    if (lastId) flash(lastId);
    showToast(values.names.length > 1 ? `${toPersianDigits(values.names.length)} گره افزوده شد.` : `«${values.names[0]}» افزوده شد.`, 'ok');
    if (!keepOpen) setDialog(null);
  };

  const submitEdit = async (node: KindTreeNode, parent: KindTreeNode | null, values: KindFormValues) => {
    try {
      if (values.names[0] !== node.name) await updateNode(node.id, { name: values.names[0], rowVersion: node.rowVersion });
      const wanted = new Set(values.persons.map((p) => p.userId));
      const had = new Set(node.persons.map((p) => p.userId));
      const removing = node.persons.filter((old) => !wanted.has(old.userId));
      const adding = values.persons.filter((person) => !had.has(person.userId));
      let step = 0;
      const tick = (what: string) => setProgress(`${what} (${toPersianDigits(++step)} از ${toPersianDigits(removing.length + adding.length)})`);
      for (const old of removing) { tick('حذف شخص'); await removeNodePerson(node.id, old.userId); }
      for (const person of adding) { tick('ثبت شخص'); await addNodePerson(node.id, person.userId); }
      setProgress(null);
      const wasHead = !!parent && parent.headNodeId === node.id;
      if (parent && canHaveHead(parent.kind) && values.isHead !== wasHead) await setNodeHead(parent.id, values.isHead ? node.id : null);
    } finally {
      await reload();
    }
    flash(node.id);
    showToast('ذخیره شد.', 'ok');
    setDialog(null);
  };

  const removeBranch = async (node: KindTreeNode) => {
    // People first (they hold a node), then the nodes from the bottom up.
    const order: KindTreeNode[] = [];
    walk([node], (n) => { order.push(n); });
    await run(async () => {
      for (const n of order) for (const p of n.persons) await removeNodePerson(n.id, p.userId);
      const fresh = new Map((await getKindChart()).map((n) => [n.id, n]));
      for (const n of [...order].reverse()) await deactivateNode(n.id, fresh.get(n.id)?.rowVersion ?? null);
      showToast(order.length > 1 ? `«${node.name}» و ${toPersianDigits(order.length - 1)} زیرمجموعه‌اش حذف شد.` : `«${node.name}» حذف شد.`, 'ok');
    }, 'حذف انجام نشد.');
  };

  const moveNodes = async (list: KindTreeNode[], targetId: string | null, report: (text: string) => void) => {
    if (!company) return;
    const fresh = new Map((await getKindChart()).map((n) => [n.id, n]));
    try {
      for (const [index, n] of list.entries()) {
        report(`انتقال «${n.name}» (${toPersianDigits(index + 1)} از ${toPersianDigits(list.length)})`);
        await moveNode(n.id, { parentNodeId: targetId, companyId: targetId ? null : company.id, rowVersion: fresh.get(n.id)?.rowVersion ?? n.rowVersion });
      }
    } finally {
      await reload();
    }
    if (targetId) setOpenMap((m) => ({ ...m, [targetId]: true }));
    flash(list[0].id);
    showToast(list.length > 1 ? `${toPersianDigits(list.length)} گره منتقل شد.` : `«${list[0].name}» منتقل شد.`, 'ok');
  };

  const actions: KindActions = {
    can: allow,
    onAdd: (parent) => setDialog({ mode: 'add', parent }),
    onEdit: (node, focusPeople = false) => setDialog({ mode: 'edit', node, parent: parentOf(roots, node), focusPeople }),
    onRemovePerson: (node, userId) => { void run(() => removeNodePerson(node.id, userId), 'حذف شخص انجام نشد.').then((ok) => ok && showToast('شخص حذف شد.', 'ok')); },
    onSetPrimary: (node, userId) => { void run(() => setPrimaryNodePerson(node.id, userId), 'تغییر شخص رسمی انجام نشد.'); },
    onToggleHead: (node, parent) => {
      const was = parent.headNodeId === node.id;
      const previous = nodes;
      // At once, on the screen; the server is told meanwhile, and the screen goes back if it refuses.
      setSettling(true);
      keepPosition(node.id, () => setNodes((all) => all.map((n) => (n.id === parent.id ? { ...n, headNodeId: was ? null : node.id } : n))));
      setFlashId(node.id);
      setTimeout(() => setFlashId((current) => (current === node.id ? null : current)), 1800);
      showToast(was ? 'رئیس برداشته شد.' : `«${node.name}» رئیس «${parent.name}» شد.`, 'ok');
      setNodeHead(parent.id, was ? null : node.id)
        .then(() => reload())
        .catch((err) => { setNodes(previous); showToast(userErrorMessage(err, 'تغییر رئیس انجام نشد.'), 'error'); })
        .finally(() => setTimeout(() => setSettling(false), 350));
    },
    onMove: (node) => setMoving(node),
    onDelete: (node) => {
      clearTimeout(pendingTimer.current);
      if (pendingDelete === node.id) { setPendingDelete(null); void removeBranch(node); return; }
      setPendingDelete(node.id);
      pendingTimer.current = setTimeout(() => setPendingDelete(null), 3000);
    },
  };

  const applyTemplate = async (id: string) => {
    const template = TEMPLATES.find((t) => t.id === id);
    if (!template || !company) return;
    if (nodes.some((n) => n.companyId === company.id) && !(await appConfirm('این سازمان از قبل گره دارد. قالب به گره‌های فعلی اضافه می‌شود و چیزی حذف نمی‌شود. ادامه می‌دهید؟'))) return;
    const parsed = parseOutline(template.text);
    await run(async () => {
      const ids: string[] = [];
      for (const line of parsed.lines) {
        const above = line.depth === 0 ? null : ids[line.depth - 1];
        const made = await createNode({ name: line.name, parentNodeId: above, companyId: above ? null : company.id, nodeTypeId: typeIdOf(line.kind) });
        ids[line.depth] = made.id;
      }
      showToast(`قالب «${template.title}» بارگذاری شد.`, 'ok');
    }, 'بارگذاری قالب انجام نشد.');
  };

  if (!companies) return <div className="flex items-center gap-2 p-6 text-sm text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> در حال دریافت چارت...</div>;

  const dialogParentKind: KindKey = dialog?.mode === 'add' ? (dialog.parent?.kind ?? 'org') : dialog?.mode === 'edit' ? (dialog.parent?.kind ?? 'org') : 'org';
  const pathOf = (node: KindTreeNode | null): string[] => (node ? [...ancestorNames(roots, node.id), node.name] : []);

  return (
    <AdminCard className="p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-base font-extrabold text-slate-900 dark:text-white me-2">چارت سازمانی</h3>
        <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1" role="tablist" aria-label="نمای چارت">
          {([['list', 'چارت مرتب'], ['tree', 'چارت درختی']] as const).map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={view === id} onClick={() => pickView(id)} className={`rounded-lg px-3.5 py-1.5 text-xs font-bold cursor-pointer ${view === id ? 'bg-white dark:bg-slate-900 text-indigo-700 shadow-sm' : 'text-slate-500'}`}>{label}</button>
          ))}
        </div>
        {companies.length > 0 && (
          <select aria-label="سازمان" className={`${inputClass} !w-auto`} value={company?.id ?? ''} onChange={(e) => pickCompany(e.target.value)}>
            {companies.filter((c) => c.isActive).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        <div className="relative">
          <Search className="w-4 h-4 absolute top-1/2 -translate-y-1/2 start-3 text-slate-400" />
          <input type="search" aria-label="جستجو در چارت" className={`${inputClass} !ps-9 !w-56`} placeholder="جستجوی نام گره یا شخص..." value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <SecondaryButton type="button" onClick={() => setAll(true)} title="باز کردن همه"><ChevronsUpDown className="w-4 h-4" /> باز کردن همه</SecondaryButton>
        <SecondaryButton type="button" onClick={() => setAll(false)} title="بستن همه"><ChevronsDownUp className="w-4 h-4" /> بستن همه</SecondaryButton>
        {allow.create && company && (
          <select aria-label="شروع از قالب" className={`${inputClass} !w-auto`} value="" onChange={(e) => { if (e.target.value) void applyTemplate(e.target.value); }}>
            <option value="">شروع از قالب…</option>
            {TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
        )}
        <span className="flex-1" />
        {company && can(P.manageCompanies) && <SecondaryButton type="button" onClick={() => setOrgDialog('edit')}>ویرایش اطلاعات سازمان</SecondaryButton>}
        {can(P.manageCompanies) && <PrimaryButton type="button" onClick={() => setOrgDialog('new')}><Plus className="w-4 h-4" /> ساخت سازمان</PrimaryButton>}
      </div>

      <div className="flex flex-wrap gap-4 text-[11.5px] text-slate-500">
        {(['org', 'unit', 'position'] as const).map((k) => (
          <span key={k}><b className="inline-block w-2.5 h-2.5 rounded-sm align-middle me-1.5" style={{ backgroundColor: KIND_INFO[k].color }} />{KIND_INFO[k].label}: {KIND_INFO[k].hint}</span>
        ))}
      </div>

      {error && <Notice type="error" onClose={() => setError(null)}>{error}</Notice>}
      {busy && <div className="flex items-center gap-2 text-xs text-slate-500"><Loader2 className="w-3.5 h-3.5 animate-spin" /> در حال ذخیره...</div>}

      {!company ? (
        <div className="text-center py-14">
          <Building2 className="w-10 h-10 mx-auto text-indigo-300" />
          <h4 className="mt-3 font-extrabold">هنوز سازمانی ساخته نشده</h4>
          <p className="text-sm text-slate-500 mt-1">اول «سازمان» را بسازید؛ بعد با «+» واحد و سمت اضافه کنید.</p>
          {can(P.manageCompanies) && <PrimaryButton type="button" className="mt-4" onClick={() => setOrgDialog('new')}><Plus className="w-4 h-4" /> ساخت سازمان</PrimaryButton>}
        </div>
      ) : (
        <>
          {view === 'list' && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 bg-indigo-50/50 dark:bg-slate-800/40" style={{ boxShadow: `inset -4px 0 0 ${KIND_INFO.org.color}` }}>
              <span className="rounded-full px-2.5 py-0.5 text-[11px]" style={{ color: KIND_INFO.org.color, backgroundColor: KIND_INFO.org.bg }}>{KIND_INFO.org.label}</span>
              <b className="text-sm">{company.name}</b>
              <span className="text-[11px] text-slate-400">{toPersianDigits(total)} گره</span>
              <span className="flex-1" />
              {allow.create && <button type="button" onClick={() => actions.onAdd(null)} title={`افزودن زیر ${company.name}`} aria-label={`افزودن زیرمجموعه به ${company.name}`} className="w-7 h-7 grid place-items-center rounded-full border-[1.5px] border-indigo-300 text-indigo-600 bg-white dark:bg-slate-900 hover:bg-indigo-600 hover:text-white cursor-pointer"><Plus className="w-4 h-4" /></button>}
            </div>
          )}
          <div aria-busy={busy || settling} className={busy || settling ? 'pointer-events-none opacity-80 transition-opacity' : 'transition-opacity'}>
          {roots.length === 0 ? (
            <div className="text-center py-10 text-sm text-slate-500">
              این سازمان هنوز گره‌ای ندارد. {allow.create ? 'با «+» شروع کنید یا از «شروع از قالب» یکی را بارگذاری کنید.' : ''}
            </div>
          ) : view === 'list' ? (
            <KindListView roots={roots} query={query} isOpen={isOpenNow} onToggle={(id) => setOpenMap((m) => ({ ...m, [id]: !isOpenNow(id) }))} flashId={flashId} pendingDelete={pendingDelete} actions={actions} />
          ) : (
            <KindTreeView roots={roots} viewStore={treeView} orgName={company.name} onAddRoot={() => actions.onAdd(null)} query={query} isOpen={isOpenNow} onToggle={(id) => setOpenMap((m) => ({ ...m, [id]: !isOpenNow(id) }))} flashId={flashId} pendingDelete={pendingDelete} actions={actions} />
          )}
          </div>
          {childCompanies.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-bold text-slate-500">سازمان‌های تابعه</p>
              {childCompanies.map((c) => (
                <button key={c.id} type="button" onClick={() => pickCompany(c.id)} className="w-full flex items-center gap-2 rounded-xl px-3 py-2 text-right hover:bg-indigo-50/60 dark:hover:bg-slate-800 cursor-pointer" style={{ boxShadow: `inset -4px 0 0 ${KIND_INFO.org.color}` }}>
                  <span className="rounded-full px-2.5 py-0.5 text-[11px]" style={{ color: KIND_INFO.org.color, backgroundColor: KIND_INFO.org.bg }}>{KIND_INFO.org.label}</span>
                  <b className="text-sm">{c.name}</b>
                  <span className="text-[11px] text-indigo-600 ms-auto">باز کردن چارت</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {unplaced.length > 0 && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
          <button type="button" onClick={() => setShowUnplaced((v) => !v)} aria-expanded={showUnplaced} className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200 cursor-pointer">
            <UserX className="w-4 h-4" /> افراد بدون جایگاه سازمانی ({toPersianDigits(unplaced.length)})
          </button>
          {showUnplaced && <div className="mt-2 flex flex-wrap gap-1.5">{unplaced.map((u) => <span key={u.userId} className="rounded-full border border-slate-200 dark:border-slate-700 px-2.5 py-0.5 text-xs">{u.displayName}</span>)}</div>}
        </div>
      )}

      {dialog && company && (
        <KindNodeDialog
          key={dialog.mode === 'edit' ? dialog.node.id : `add-${dialog.parent?.id ?? 'root'}`}
          mode={dialog.mode}
          parentKind={dialogParentKind}
          parentName={dialog.mode === 'add' ? (dialog.parent?.name ?? company.name) : (dialog.parent?.name ?? company.name)}
          path={dialog.mode === 'add' ? (dialog.parent ? [company.name, ...pathOf(dialog.parent)] : [company.name]) : [company.name, ...ancestorNames(roots, dialog.node.id)]}
          initial={dialog.mode === 'edit' ? { kind: dialog.node.kind, name: dialog.node.name, persons: dialog.node.persons.map((p) => ({ userId: p.userId, displayName: p.displayName })), isHead: !!dialog.parent && dialog.parent.headNodeId === dialog.node.id } : undefined}
          headAllowedUnder={dialog.mode === 'add' ? dialog.parent?.kind === 'unit' : dialog.parent?.kind === 'unit'}
          focusPeople={dialog.mode === 'edit' && dialog.focusPeople}
          progress={progress}
          onSubmit={(values, keepOpen) => (dialog.mode === 'add' ? submitAdd(dialog.parent, values, keepOpen) : submitEdit(dialog.node, dialog.parent, values))}
          onClose={() => setDialog(null)}
        />
      )}
      {moving && company && (
        <KindMoveDialog
          node={moving}
          siblings={(parentOf(roots, moving)?.children ?? roots).filter((n) => n.id !== moving.id && n.kind === moving.kind)}
          roots={roots}
          orgName={company.name}
          onMove={moveNodes}
          onClose={() => setMoving(null)}
        />
      )}
      {orgDialog === 'new' && <NewOrgDialog parents={companies} onCreated={async (saved) => { await reload(); pickCompany(saved.id); showToast(`سازمان «${saved.name}» ساخته شد.`, 'ok'); }} onClose={() => setOrgDialog(null)} />}
      {orgDialog === 'edit' && (
        <CompanyFormDialog
          company={company}
          parentChoices={companies}
          canLinkUnits={false}
          onSaved={async (saved) => { await reload(); pickCompany(saved.id); }}
          onClose={() => setOrgDialog(null)}
        />
      )}
    </AdminCard>
  );
};

function parentOf(roots: KindTreeNode[], node: KindTreeNode): KindTreeNode | null {
  let found: KindTreeNode | null = null;
  walk(roots, (n, parent) => { if (n.id === node.id) found = parent; });
  return found;
}

function ancestorNames(roots: KindTreeNode[], id: string): string[] {
  const path: string[] = [];
  const visit = (list: KindTreeNode[], trail: string[]): boolean => {
    for (const n of list) {
      if (n.id === id) { path.push(...trail); return true; }
      if (visit(n.children, [...trail, n.name])) return true;
    }
    return false;
  };
  visit(roots, []);
  return path;
}
