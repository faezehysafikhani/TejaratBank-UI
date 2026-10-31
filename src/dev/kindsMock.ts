// Development only: answers the simple chart's requests (org / unit / position) from memory, so the page can be
// driven in a browser without an API. It applies the same rules as the server (what may sit under what, people only
// in positions, a head is a direct position of its unit). Not part of the app.
import type { KindNode } from '../services/orgStructureApi';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const problem = (status: number, message: string) => new Response(JSON.stringify({ title: 'validation.error', detail: message, status }), { status, headers: { 'Content-Type': 'application/problem+json' } });

const USERS = ['نیما قهرمانیان', 'سارا احمدی', 'علی رضایی', 'مریم کریمی', 'حسین موسوی', 'زهرا صادقی'].map((displayName, i) => ({ id: `u${i + 1}`, displayName }));

export function installKindsMock(options: { empty?: boolean; seed?: number; bank?: boolean } = {}): { nodes: () => KindNode[] } {
  const TYPE_UNIT = 'type-unit';
  const TYPE_POSITION = 'type-position';
  const companies = options.empty ? [] : [
    { id: 'c1', name: 'بانک نمونه', code: 'B1', description: null, manager: null, isActive: true, linkedUnitIds: [], parentCompanyId: null },
    { id: 'c2', name: 'شرکت تابعه‌ی الف', code: 'A1', description: null, manager: null, isActive: true, linkedUnitIds: [], parentCompanyId: 'c1' },
  ];
  let seq = 1;
  const nodes: KindNode[] = [];
  const heads = new Map<string, string>();
  const kindOfType = (id?: string | null) => (id === TYPE_POSITION ? 'position' : 'unit');
  const find = (id: string) => nodes.find((n) => n.id === id);
  const view = (): KindNode[] => nodes.map((n) => ({ ...n, headNodeId: (() => { const h = heads.get(n.id); const hn = h ? find(h) : undefined; return hn && hn.parentNodeId === n.id && hn.isActive ? hn.id : null; })() }));
  const orgNode = (n: KindNode) => ({ id: n.id, name: n.name, parentNodeId: n.parentNodeId, nodeTypeId: n.kind === 'position' ? TYPE_POSITION : TYPE_UNIT, nodeTypeName: '', companyId: n.companyId, managerUserId: null, isActive: n.isActive, sortOrder: n.sortOrder, childCount: 0, rowVersion: n.rowVersion });
  const companyOf = (n: KindNode | undefined): string | null => (n ? (n.parentNodeId ? companyOf(find(n.parentNodeId)) : n.companyId) : null);

  // ?seed=N: a big chart to measure with: a chain of positions, then N units each with 12 branches (a unit may sit under a position).
  if (options.seed && companies.length) {
    const add = (name: string, kind: 'unit' | 'position', parent: string | null) => { const n: KindNode = { id: `n${seq++}`, name, kind, parentNodeId: parent, companyId: parent ? null : 'c1', isActive: true, sortOrder: nodes.length, rowVersion: '1', headNodeId: null, persons: [] }; nodes.push(n); return n; };
    const assembly = add('مجمع عمومی', 'position', null);
    const board = add('هیأت مدیره', 'position', assembly.id);
    const ceo = add('مدیرعامل', 'position', board.id);
    ceo.persons.push({ userId: 'u1', displayName: USERS[0].displayName, isPrimary: true });
    for (let i = 1; i <= options.seed; i++) {
      const unit = add(`مدیریت شعب ${i}`, 'unit', ceo.id);
      for (let j = 1; j <= 12; j++) add(`شعبه ${i}-${j}`, 'position', unit.id);
    }
  }

  // ?bank=1: a chart like the real one (53 nodes): a chain of positions, then the CEO with 19 children - 9 units that each have branches, and 10 positions.
  if (options.bank && companies.length) {
    const add = (name: string, kind: 'unit' | 'position', parent: string | null) => { const n: KindNode = { id: `n${seq++}`, name, kind, parentNodeId: parent, companyId: parent ? null : 'c1', isActive: true, sortOrder: nodes.length, rowVersion: '1', headNodeId: null, persons: [] }; nodes.push(n); return n; };
    const assembly = add('مجمع عمومی', 'position', null);
    const board = add('هیأت مدیره', 'position', assembly.id);
    const ceo = add('مدیرعامل', 'position', board.id);
    ceo.persons.push({ userId: 'u1', displayName: USERS[0].displayName, isPrimary: true });
    const units = ['معاونت اعتباری و بین‌الملل', 'معاونت فناوری اطلاعات', 'معاونت مالی و سرمایه‌گذاری', 'مدیریت امور استان‌ها و مناطق', 'بانکداری شرکتی و بازاریابی', 'بازرسی و نظارت و صیانت از مشتریان', 'حراست', 'معاونت سازمان و برنامه‌ریزی', 'معاونت توسعه سرمایه انسانی و پشتیبانی'];
    for (const [i, name] of units.entries()) {
      const unit = add(name, 'unit', ceo.id);
      for (let j = 1; j <= (i < 4 ? 4 : 3); j++) add(`اداره کل ${j} — ${name.split(' ')[0]}`, 'position', unit.id);
    }
    for (let j = 1; j <= 10; j++) add(`مشاور مدیرعامل ${j}`, 'position', ceo.id);
  }

  const handle = async (url: URL, init?: RequestInit): Promise<Response | null> => {
    const method = (init?.method || 'GET').toUpperCase();
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    const path = url.pathname.replace(/^.*\/api\/org-structure/, '');
    if (url.pathname.endsWith('/api/identity/users')) {
      const q = (url.searchParams.get('search') || '').trim();
      const items = USERS.filter((u) => !q || u.displayName.includes(q)).map((u) => ({ ...u, userName: u.id, isActive: true, roles: [] }));
      return json({ items, pageNumber: 1, pageSize: 8, totalCount: items.length, totalPages: 1 });
    }
    if (!url.pathname.includes('/api/org-structure')) return null;
    if (method === 'GET' && path === '/companies') return json(companies);
    if (method === 'GET' && path === '/unplaced-users') return json(USERS.slice(4).map((u) => ({ userId: u.id, displayName: u.displayName, avatarUrl: null })));
    if (method === 'POST' && path === '/kinds/ensure') return json({ unitTypeId: TYPE_UNIT, positionTypeId: TYPE_POSITION });
    if (method === 'GET' && path === '/kinds/chart') return json({ nodes: view() });
    if (method === 'POST' && path === '/nodes') {
      const kind = kindOfType(body.nodeTypeId);
      const parent = body.parentNodeId ? find(body.parentNodeId) : undefined;
      const parentKind = parent ? parent.kind : 'org';
      if (parentKind === 'position' && kind !== 'position' && kind !== 'unit') return problem(422, 'این جزء چارت زیر این گره مجاز نیست.');
      if (nodes.some((n) => n.parentNodeId === (body.parentNodeId ?? null) && n.isActive && n.name === body.name && (body.parentNodeId || n.companyId === body.companyId))) return problem(422, 'هم‌نام در همین سطح وجود دارد.');
      const node: KindNode = { id: `n${seq++}`, name: body.name, kind, parentNodeId: body.parentNodeId ?? null, companyId: body.parentNodeId ? null : body.companyId, isActive: true, sortOrder: nodes.length, rowVersion: '1', headNodeId: null, persons: [] };
      nodes.push(node);
      return json(orgNode(node));
    }
    const reorderMatch = path.match(/^\/nodes\/([^/]+)\/reorder$/);
    if (reorderMatch && method === 'POST') {
      const n = find(reorderMatch[1]); if (!n) return problem(404, 'گره پیدا نشد.');
      const sibs = nodes.filter((x) => x.isActive && x.parentNodeId === n.parentNodeId && (n.parentNodeId || x.companyId === n.companyId)).sort((a, b) => a.sortOrder - b.sortOrder);
      sibs.splice(sibs.indexOf(n), 1); sibs.splice(Math.max(0, Math.min(sibs.length, body.position)), 0, n);
      sibs.forEach((x, i) => { x.sortOrder = i; });
      return json(orgNode(n));
    }
    const moveMatch = path.match(/^\/nodes\/([^/]+)\/move$/);
    if (moveMatch && method === 'POST') {
      const n = find(moveMatch[1]); if (!n) return problem(404, 'گره پیدا نشد.');
      const target = body.parentNodeId ? find(body.parentNodeId) : undefined;
      for (let up: KindNode | undefined = target; up; up = up.parentNodeId ? find(up.parentNodeId) : undefined) if (up.id === n.id) return problem(422, 'گره را نمی‌شود زیر خودش یا زیرمجموعه‌هایش برد.');
      if (target?.kind === 'unit' || !target) { /* a unit or the organization holds both kinds */ } else if (target.kind === 'position' && n.kind !== 'position' && n.kind !== 'unit') return problem(422, 'مجاز نیست.');
      n.parentNodeId = target ? target.id : null; n.companyId = target ? null : body.companyId;
      return json(orgNode(n));
    }
    const nodeMatch = path.match(/^\/nodes\/([^/]+)(\/deactivate)?$/);
    if (nodeMatch && method === 'PUT') { const n = find(nodeMatch[1]); if (!n) return problem(404, 'گره پیدا نشد.'); n.name = body.name; return json(orgNode(n)); }
    if (nodeMatch && method === 'POST' && nodeMatch[2]) {
      const n = find(nodeMatch[1]); if (!n) return problem(404, 'گره پیدا نشد.');
      if (nodes.some((c) => c.parentNodeId === n.id && c.isActive)) return problem(409, 'زیرمجموعه‌ی فعال دارد.');
      if (n.persons.length) return problem(409, 'شخص در آن هست.');
      n.isActive = false; return json(orgNode(n));
    }
    const persons = path.match(/^\/kinds\/nodes\/([^/]+)\/persons(?:\/([^/]+)(\/primary)?)?$/);
    if (persons) {
      const n = find(persons[1]); if (!n) return problem(404, 'گره پیدا نشد.');
      if (n.kind !== 'position') return problem(422, 'فقط سمت / پست سازمانی شخص می‌گیرد.');
      if (method === 'POST') {
        const user = USERS.find((u) => u.id === body.userId); if (!user) return problem(422, 'کاربر پیدا نشد.');
        if (n.persons.some((p) => p.userId === user.id)) return problem(422, 'این شخص پیش‌تر در این سمت ثبت شده است.');
        n.persons.push({ userId: user.id, displayName: user.displayName, isPrimary: n.persons.length === 0 });
        return json({});
      }
      if (method === 'DELETE') {
        const was = n.persons.find((p) => p.userId === persons[2]); n.persons = n.persons.filter((p) => p.userId !== persons[2]);
        if (was?.isPrimary && n.persons[0]) n.persons[0].isPrimary = true;
        return json({});
      }
      if (method === 'PUT' && persons[3]) { n.persons.forEach((p) => { p.isPrimary = p.userId === persons[2]; }); return json({}); }
    }
    const head = path.match(/^\/kinds\/nodes\/([^/]+)\/head$/);
    if (head && method === 'PUT') {
      const unit = find(head[1]); if (!unit || unit.kind !== 'unit') return problem(422, 'فقط واحد سازمانی رئیس دارد.');
      if (body.headNodeId) { const h = find(body.headNodeId); if (!h || h.parentNodeId !== unit.id || h.kind !== 'position') return problem(422, 'رئیس باید یکی از سمت‌های مستقیم همین واحد باشد.'); heads.set(unit.id, h.id); } else heads.delete(unit.id);
      return json({});
    }
    return problem(404, `mock: ${method} ${path}`);
  };

  const real = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href);
    return (await handle(url, init)) ?? real(input, init);
  };
  void companyOf;
  return { nodes: () => nodes };
}
