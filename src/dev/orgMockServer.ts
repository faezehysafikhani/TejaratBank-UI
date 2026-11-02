// Development only: answers the org-structure requests of the chart board from a mock chart, in
// memory, so the board can be driven (and checked) without an API. Changes it accepts change the
// chart it answers with next, as the real server would. Not part of the app.
import type { AutoLinkRule, ChartCompany, ChartLink, ChartNodeType, ChartUnit, ImpactChange, LinkType, NodeType, NodeTypeRule, OrgNode, StructureTemplate, TemplateContent } from '../services/orgStructureApi';
import { allUnitsOf } from '../components/admin/orgStructure/orgChartModel';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const problem = (status: number, message: string, code = 'validation.error') =>
  new Response(JSON.stringify({ title: code, detail: message, status }), { status, headers: { 'Content-Type': 'application/problem+json' } });

export interface MockServer {
  chart: () => ChartCompany[];
  /** Changes a node's version behind the page's back, as another user's save would. */
  bump: (unitId: string) => void;
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}

export function createMockServer(initial: ChartCompany[]): MockServer {
  let chart: ChartCompany[] = structuredClone(initial);
  const versions = new Map<string, number>();
  let rules: NodeTypeRule[] | null = null;
  const typeOverrides = new Map<string, Partial<NodeType>>();
  const extraTypes: NodeType[] = [];
  const patterns = new Map<string, { positionId: string; title: string; isManagerPost: boolean }[]>();
  const positionTitles = new Map<string, string>([['pos-vp', 'معاون'], ['pos-gm', 'مدیر کل'], ['pos-expert', 'کارشناس'], ['pos-secretary', 'منشی']]);
  const managerPosts = new Set<string>();
  let postSeq = 100;
  /** Per post, its appointments (the first holders are already on, with no start). */
  const appointments = new Map<string, { id: string; userId: string; displayName: string; startDate: string | null; endDate: string | null }[]>();
  const appointmentsOf = (post: { unitPositionId: string; holders: { userId: string; displayName: string }[] }) => {
    if (!appointments.has(post.unitPositionId)) appointments.set(post.unitPositionId, post.holders.map((h) => ({ id: crypto.randomUUID(), userId: h.userId, displayName: h.displayName, startDate: null, endDate: null })));
    return appointments.get(post.unitPositionId)!;
  };
  const findPost = (id: string) => { for (const c of chart) for (const u of allUnitsOf(c)) { const p = (u.positions || []).find((x) => x.unitPositionId === id); if (p) return { company: c, unit: u, post: p }; } return null; };
  const dto = (found: NonNullable<ReturnType<typeof findPost>>, a: { id: string; userId: string; displayName: string; startDate: string | null; endDate: string | null }) => {
    const now = Date.now();
    const active = (!a.startDate || Date.parse(a.startDate) <= now) && (!a.endDate || Date.parse(a.endDate) > now);
    return { id: a.id, unitPositionId: found.post.unitPositionId, postTitle: found.post.title, postCode: found.post.code ?? null, place: found.unit.name, person: { userId: a.userId, displayName: a.displayName, isActive: true }, startDate: a.startDate, endDate: a.endDate, isActive: active };
  };
  const sync = (found: NonNullable<ReturnType<typeof findPost>>) => {
    const now = Date.now();
    found.post.holders = appointmentsOf(found.post).filter((a) => (!a.startDate || Date.parse(a.startDate) <= now) && (!a.endDate || Date.parse(a.endDate) > now)).map((a) => ({ userId: a.userId, displayName: a.displayName, isActive: true, positionTitle: found.post.title, managerUserId: null }));
  };
  const validity = new Map<string, { from: string | null; to: string | null }>();
  const details = new Map<string, { code?: string | null; latinName?: string | null; correspondenceTitle?: string | null; phone?: string | null; address?: string | null }>();
  const parentCompany = new Map<string, string | null>();
  /** Per node, the changes (newest first) with what undoing the last one does. */
  const log = new Map<string, { id: string; action: string; atUtc: string; details: string | null; undo: (() => void) | null }[]>();
  const record = (unitId: string, action: string, undo: (() => void) | null, text: string | null = null) => {
    log.set(unitId, [{ id: crypto.randomUUID(), action, atUtc: new Date().toISOString(), details: text, undo }, ...(log.get(unitId) || [])]);
  };
  let autoRules: AutoLinkRule[] = [];
  const extraLinkTypes: LinkType[] = [];
  const linkTypeOverrides = new Map<string, Partial<LinkType>>();
  // Ready templates (small: the real ones are the core's template files) and the ones saved from companies.
  const templateContent = (name: string): TemplateContent => ({
    nodeTypes: [{ key: 'deputy', name: 'معاونت', color: '#0f766e', icon: 'building-2' }, { key: 'dept', name: 'اداره کل', color: '#2563eb', icon: 'folder-tree' }],
    nodes: [{ key: 'a', name: `معاونت نمونه‌ی ${name}`, type: 'deputy', children: [{ key: 'a1', name: 'اداره کل نمونه', type: 'dept' }] }],
  });
  const templates: { template: StructureTemplate; content: TemplateContent }[] = [
    { template: { id: 'tpl-simple', code: 'simple', name: 'ساده', description: 'فقط پست؛ بدون واحد.', isSystem: true, uiLevel: 'simple', nodeCount: 0, nodeTypeCount: 0 }, content: { nodeTypes: [], nodes: [] } },
    { template: { id: 'tpl-deputy', code: 'deputy', name: 'معاونتی', description: 'معاونت‌ها و واحدهای زیر آن‌ها.', isSystem: true, uiLevel: 'normal', nodeCount: 2, nodeTypeCount: 2 }, content: templateContent('معاونتی') },
    { template: { id: 'tpl-bank', code: 'bank', name: 'بانکی', description: 'مجمع، هیأت مدیره، کمیته‌ها با خط نقطه‌چین، معاونت‌ها و شعب.', isSystem: true, uiLevel: 'advanced', nodeCount: 2, nodeTypeCount: 2 }, content: templateContent('بانکی') },
  ];

  const typesOf = (): NodeType[] => {
    const seen = new Map<string, ChartNodeType>();
    chart.forEach((c) => allUnitsOf(c).forEach((u) => u.nodeType && seen.set(u.nodeType.nodeTypeId, u.nodeType)));
    return [...extraTypes, ...[...seen.values()].map((t, i) => ({
      id: t.nodeTypeId, code: t.nodeTypeId.replace(/^type-/, ''), name: t.name, color: t.color, icon: t.icon, isDomainBoundary: t.isDomainBoundary, sortOrder: i, isActive: true,
      nodeCount: chart.flatMap((c) => allUnitsOf(c)).filter((u) => u.nodeType?.nodeTypeId === t.nodeTypeId).length,
      ...typeOverrides.get(t.nodeTypeId),
    }))];
  };

  const currentRules = (): NodeTypeRule[] => {
    if (rules) return rules;
    const found = new Map<string, NodeTypeRule>();
    chart.forEach((c) => allUnitsOf(c).forEach((u) => {
      const parent = u.parentNodeId ? allUnitsOf(c).find((x) => x.unitId === u.parentNodeId) : null;
      if (!u.nodeType) return;
      const rule = { parentNodeTypeId: parent?.nodeType?.nodeTypeId ?? null, childNodeTypeId: u.nodeType.nodeTypeId };
      found.set(`${rule.parentNodeTypeId}>${rule.childNodeTypeId}`, rule);
    }));
    return [...found.values()];
  };

  const linkTypesOf = (): LinkType[] => {
    const seen = new Map<string, LinkType>();
    chart.forEach((c) => allUnitsOf(c).forEach((u) => (u.links || []).forEach((l: ChartLink) => {
      const known = seen.get(l.linkTypeId);
      seen.set(l.linkTypeId, { id: l.linkTypeId, code: l.linkTypeId, name: l.name, lineStyle: l.lineStyle, countsAsManager: l.countsAsManager, isActive: true, linkCount: (known?.linkCount ?? 0) + 1 });
    })));
    return [...seen.values(), ...extraLinkTypes].map((t) => ({ ...t, ...linkTypeOverrides.get(t.id) }));
  };
  const allLinks = () => chart.flatMap((c) => allUnitsOf(c).flatMap((u) => (u.links || []).map((l: ChartLink) => {
    const to = allUnitsOf(c).find((x) => x.unitId === l.targetNodeId);
    return { id: l.linkId, fromNodeId: u.unitId, fromName: u.name, toNodeId: l.targetNodeId, toName: to?.name ?? '', linkTypeId: l.linkTypeId, linkTypeName: l.name, lineStyle: l.lineStyle, countsAsManager: l.countsAsManager };
  })));

  const find = (unitId: string) => {
    for (const company of chart) {
      for (const unit of allUnitsOf(company)) if (unit.unitId === unitId) return { company, unit };
    }
    return null;
  };
  const siblingsOf = (company: ChartCompany, unit: ChartUnit) =>
    unit.parentNodeId ? find(unit.parentNodeId)!.unit.children! : company.units;
  const versionOf = (id: string) => String(versions.get(id) ?? 0);
  const bump = (id: string) => versions.set(id, (versions.get(id) ?? 0) + 1);

  const nodeOf = (company: ChartCompany, unit: ChartUnit): OrgNode => ({
    id: unit.unitId, name: unit.name, parentNodeId: unit.parentNodeId ?? null, nodeTypeId: unit.nodeType?.nodeTypeId ?? null,
    nodeTypeName: unit.nodeType?.name ?? null, companyId: company.companyId, managerUserId: unit.manager?.userId ?? null,
    isActive: unit.isActive !== false, sortOrder: siblingsOf(company, unit).indexOf(unit), childCount: unit.children?.length ?? 0, rowVersion: versionOf(unit.unitId),
    ...details.get(unit.unitId),
  });

  const subtreeIds = (unit: ChartUnit): string[] => [unit.unitId, ...(unit.children || []).flatMap(subtreeIds)];
  const isInSub = (unit: ChartUnit, id: string) => subtreeIds(unit).includes(id);

  /** Who would have a different manager if `moves` happened: everyone under the moved nodes. */
  const preview = (changes: ImpactChange[]) => {
    const people = new Map<string, { displayName: string }>();
    for (const change of changes) {
      const found = change.nodeId ? find(change.nodeId) : null;
      if (!found) continue;
      for (const id of (change.kind === 'link' ? [found.unit.unitId] : subtreeIds(found.unit))) {
        const unit = find(id)!.unit;
        [...unit.members, ...(unit.positions || []).flatMap((p) => p.holders)].forEach((m) => people.set(m.userId, { displayName: m.displayName }));
      }
    }
    const ref = (userId: string, displayName: string) => ({ userId, displayName, isActive: true });
    const result = [...people.entries()].map(([userId, p]) => ({
      person: ref(userId, p.displayName), managerChanged: true,
      managerBefore: ref('before', 'مدیر فعلی'), managerAfter: ref('after', 'مدیر جدید'),
      subordinatesAdded: [], subordinatesRemoved: [], cannotAssignAdded: [], cannotAssignRemoved: [],
      substitutionAdded: [], substitutionRemoved: [], teamAdded: [], teamRemoved: [],
    }));
    return { peopleAffected: result.length, people: result, taskLimitOn: true };
  };

  const wouldLoop = (unit: ChartUnit, parentId: string) => subtreeIds(unit).includes(parentId);

  const handle = async (method: string, path: string, query: URLSearchParams, body: any): Promise<Response> => {
    if (method === 'GET' && path === '/chart') {
      const asOf = query.get('asOf');
      if (!asOf) return json(chart);
      const day = asOf.slice(0, 10);
      const exists = (u: ChartUnit) => { const v = validity.get(u.unitId); return !v || ((!v.from || v.from <= day) && (!v.to || v.to >= day)); };
      const prune = (u: ChartUnit): ChartUnit | null => (exists(u) ? { ...u, children: (u.children || []).map(prune).filter(Boolean) as ChartUnit[] } : null);
      return json(chart.map((c) => ({ ...c, units: c.units.map(prune).filter(Boolean) })));
    }
    if (method === 'GET' && path === '/company-groups') {
      const node = (c: ChartCompany): unknown => ({ id: c.companyId, name: c.name, code: c.code, isActive: c.isActive, children: chart.filter((x) => parentCompany.get(x.companyId) === c.companyId).map(node) });
      return json(chart.filter((c) => !parentCompany.get(c.companyId)).map(node));
    }
    const cp = path.match(/^\/companies\/([^/]+)\/parent$/);
    if (cp && method === 'PUT') {
      let up: string | null | undefined = body.parentCompanyId;
      while (up) { if (up === cp[1]) return problem(409, 'شرکت را نمی‌شود زیر خودش یا زیرمجموعه‌اش گذاشت.', 'conflict'); up = parentCompany.get(up); }
      parentCompany.set(cp[1], body.parentCompanyId ?? null);
      return new Response(null, { status: 204 });
    }
    if (method === 'GET' && path === '/nodes') return json(chart.flatMap((c) => allUnitsOf(c).map((u) => nodeOf(c, u))));
    if (method === 'GET' && path === '/me') return json({ assignment: null, managementChain: [] });
    if (method === 'GET' && path === '/node-types') return json(typesOf());
    if (method === 'POST' && path === '/node-types') {
      const id = crypto.randomUUID();
      extraTypes.push({ id, code: id, name: body.name, color: body.color || '#2563eb', icon: body.icon || 'folder', isDomainBoundary: body.isDomainBoundary !== false, sortOrder: 99, isActive: true, nodeCount: 0 });
      return json(extraTypes[extraTypes.length - 1], 201);
    }
    if (method === 'DELETE' && path.startsWith('/node-types/')) {
      const id = path.split('/')[2];
      const type = typesOf().find((t) => t.id === id);
      if (type && type.nodeCount > 0) return problem(409, 'نوعی که گره‌ای از آن دارد حذف نمی‌شود.', 'conflict');
      const at = extraTypes.findIndex((t) => t.id === id);
      if (at >= 0) extraTypes.splice(at, 1);
      return new Response(null, { status: 204 });
    }
    if (method === 'GET' && path === '/node-type-rules') return json({ rules: currentRules(), conflicts: [] });
    if (method === 'PUT' && path === '/node-type-rules') {
      rules = body.rules;
      const allowed = new Set(rules!.map((r) => `${r.parentNodeTypeId}>${r.childNodeTypeId}`));
      const conflicts = chart.flatMap((c) => allUnitsOf(c)).filter((u) => {
        const parent = u.parentNodeId ? find(u.parentNodeId)?.unit : null;
        return u.nodeType && !allowed.has(`${parent?.nodeType?.nodeTypeId ?? null}>${u.nodeType.nodeTypeId}`);
      }).map((u) => {
        const parent = u.parentNodeId ? find(u.parentNodeId)?.unit : null;
        return { nodeId: u.unitId, nodeName: u.name, nodeTypeName: u.nodeType?.name ?? null, parentNodeId: parent?.unitId ?? null, parentName: parent?.name ?? null, parentTypeName: parent?.nodeType?.name ?? null };
      });
      return json({ rules, conflicts });
    }
    if (method === 'PUT' && /^\/node-types\/[^/]+$/.test(path)) {
      const id = path.split('/')[2];
      typeOverrides.set(id, { ...typeOverrides.get(id), ...body });
      return json(typesOf().find((t) => t.id === id));
    }
    if (method === 'POST' && path === '/impact-preview') return json(preview(body.changes));

    if (method === 'GET' && path === '/companies') return json(chart.map((c) => ({ id: c.companyId, name: c.name, code: c.code, description: null, manager: c.manager, isActive: c.isActive, linkedUnitIds: c.units.map((u) => u.unitId) })));
    const apt = path.match(/^\/unit-positions\/([^/]+)\/(appointment|appointment\/end|appointment\/cancel|history)$/);
    if (apt) {
      const found = findPost(apt[1]);
      if (!found) return problem(404, 'پست پیدا نشد.', 'not_found');
      const list = appointmentsOf(found.post);
      const now = Date.now();
      if (method === 'GET') return json([...list].reverse().map((a) => dto(found, a)));
      if (apt[2] === 'appointment' && method === 'POST') {
        const start = body.startDate ? Date.parse(body.startDate) : now;
        if (start < now - 60000) return problem(400, 'انتصاب از تاریخ گذشته ثبت نمی‌شود؛ سابقه بازنویسی نمی‌شود.');
        if (list.some((a) => a.startDate && Date.parse(a.startDate) > now)) return problem(409, 'این پست یک انتصاب آینده دارد؛ اول آن را لغو کنید.', 'conflict');
        if (found.post.holders.some((h) => h.userId === body.userId) && !body.startDate) return problem(409, 'این فرد همین حالا این پست را دارد.', 'conflict');
        const at = new Date(Math.max(start, now)).toISOString();
        list.filter((a) => !a.endDate || Date.parse(a.endDate) > Date.parse(at)).forEach((a) => { a.endDate = at; });
        const person = ((window as unknown as { __people?: Record<string, string> }).__people || {})[body.userId] || body.userId;
        const added = { id: crypto.randomUUID(), userId: body.userId, displayName: person, startDate: at, endDate: null };
        list.push(added);
        sync(found);
        return json(dto(found, added), 201);
      }
      // Cancelling the appointment waiting to start: it goes; the present one (ending when it started) stays on.
      if ((apt[2] === 'appointment/cancel' && method === 'POST') || (apt[2] === 'appointment' && method === 'DELETE')) {
        const waiting = list.find((a) => a.startDate && Date.parse(a.startDate) > now);
        if (!waiting) return problem(404, 'این پست انتصاب آینده‌ای ندارد.', 'not_found');
        list.filter((a) => a.endDate === waiting.startDate).forEach((a) => { a.endDate = null; });
        list.splice(list.indexOf(waiting), 1);
        sync(found);
        return json(dto(found, waiting));
      }
      if (apt[2] === 'appointment/end') {
        const end = body?.endDate ? Date.parse(body.endDate) : now;
        if (end < now - 60000) return problem(400, 'پایان انتصاب در گذشته ثبت نمی‌شود؛ سابقه بازنویسی نمی‌شود.');
        const present = list.find((a) => (!a.startDate || Date.parse(a.startDate) <= now) && (!a.endDate || Date.parse(a.endDate) > now));
        if (!present) return problem(409, 'این پست الان کسی را ندارد.', 'conflict');
        present.endDate = new Date(Math.max(end, now)).toISOString();
        sync(found);
        return json(dto(found, present));
      }
    }
    const uh = path.match(/^\/users\/([^/]+)\/positions\/history$/);
    if (uh && method === 'GET') {
      const out: unknown[] = [];
      for (const c of chart) for (const u of allUnitsOf(c)) for (const p of u.positions || []) { const f = findPost(p.unitPositionId)!; appointmentsOf(p).filter((a) => a.userId === uh[1]).forEach((a) => out.push(dto(f, a))); }
      return json(out);
    }
    if (method === 'GET' && path === '/templates') return json(templates.map((t) => t.template));
    const tpl = path.match(/^\/templates\/([^/]+)$/);
    if (tpl && method === 'GET') { const t = templates.find((x) => x.template.id === tpl[1]); return t ? json(t) : problem(404, 'قالب پیدا نشد.', 'not_found'); }
    if (tpl && method === 'DELETE') { const at = templates.findIndex((x) => x.template.id === tpl[1] && !x.template.isSystem); if (at < 0) return problem(409, 'قالب آماده حذف نمی‌شود.', 'conflict'); templates.splice(at, 1); return new Response(null, { status: 204 }); }
    if (method === 'POST' && path === '/templates') {
      const company = chart.find((c) => c.companyId === body.companyId);
      if (!company) return problem(404, 'شرکت پیدا نشد.', 'not_found');
      const template: StructureTemplate = { id: crypto.randomUUID(), code: crypto.randomUUID().slice(0, 8), name: body.name, description: body.description ?? null, isSystem: false, uiLevel: company.uiLevel ?? 'normal', nodeCount: allUnitsOf(company).length, nodeTypeCount: new Set(allUnitsOf(company).map((u) => u.nodeType?.nodeTypeId)).size };
      templates.push({ template, content: templateContent(body.name) });
      return json(template, 201);
    }
    if (method === 'POST' && path === '/companies') {
      const t = templates.find((x) => x.template.id === body.templateId);
      const company: ChartCompany = { companyId: crypto.randomUUID(), name: body.name, code: body.code, isActive: true, manager: null, members: [], units: [], peopleCount: 0, positions: [], uiLevel: t?.template.uiLevel ?? 'normal' };
      chart.push(company);
      if (body.parentCompanyId) parentCompany.set(company.companyId, body.parentCompanyId);
      return json({ id: company.companyId, name: company.name, code: company.code, description: body.description ?? null, manager: null, isActive: true, linkedUnitIds: [] }, 201);
    }
    const level = path.match(/^\/companies\/([^/]+)\/ui-level$/);
    if (level && method === 'PUT') { const c = chart.find((x) => x.companyId === level[1]); if (!c) return problem(404, 'شرکت پیدا نشد.', 'not_found'); c.uiLevel = body.uiLevel; return new Response(null, { status: 204 }); }
    if (method === 'GET' && path === '/link-types') return json(linkTypesOf());
    if (method === 'POST' && path === '/link-types') { const t: LinkType = { id: crypto.randomUUID(), code: body.name, name: body.name, lineStyle: body.lineStyle, countsAsManager: body.countsAsManager, isActive: true, linkCount: 0 }; extraLinkTypes.push(t); return json(t, 201); }
    const lt = path.match(/^\/link-types\/([^/]+)$/);
    if (lt && method === 'PUT') { linkTypeOverrides.set(lt[1], { name: body.name, lineStyle: body.lineStyle, countsAsManager: body.countsAsManager, isActive: body.isActive }); return json(linkTypesOf().find((t) => t.id === lt[1])); }
    if (lt && method === 'DELETE') { const t = linkTypesOf().find((x) => x.id === lt[1]); if (t && t.linkCount > 0) return problem(409, 'نوعی که رابطه دارد حذف نمی‌شود.', 'conflict'); const at = extraLinkTypes.findIndex((x) => x.id === lt[1]); if (at >= 0) extraLinkTypes.splice(at, 1); return new Response(null, { status: 204 }); }
    if (method === 'GET' && path === '/auto-link-rules') return json(autoRules);
    if (method === 'PUT' && path === '/auto-link-rules') { autoRules = body.rules; return json(autoRules); }
    if (method === 'POST' && path === '/auto-link-rules/preview') return json({ links: [], ambiguous: [] });
    if (method === 'POST' && path === '/auto-link-rules/apply') return json([]);
    if (method === 'GET' && path === '/links') return json(allLinks());
    if (method === 'POST' && path === '/links') {
      const from = find(body.fromNodeId);
      const type = linkTypesOf().find((t) => t.id === body.linkTypeId);
      if (!from || !type) return problem(404, 'گره یا نوع رابطه پیدا نشد.', 'not_found');
      from.unit.links = [...(from.unit.links || []), { linkId: crypto.randomUUID(), targetNodeId: body.toNodeId, linkTypeId: type.id, name: type.name, lineStyle: type.lineStyle, countsAsManager: type.countsAsManager }];
      return json(allLinks().find((l) => l.fromNodeId === body.fromNodeId && l.toNodeId === body.toNodeId), 201);
    }
    const dl = path.match(/^\/links\/([^/]+)$/);
    if (dl && method === 'DELETE') { chart.forEach((c) => allUnitsOf(c).forEach((u) => { u.links = (u.links || []).filter((l: ChartLink) => l.linkId !== dl[1]); })); return new Response(null, { status: 204 }); }

    const patternPath = path.match(/^\/node-types\/([^/]+)\/posts$/);
    if (patternPath && method === 'GET') return json((patterns.get(patternPath[1]) || []).map((p, i) => ({ ...p, sortOrder: i })));
    if (patternPath && method === 'PUT') {
      const list = (body.posts as { positionId: string; isManagerPost: boolean }[]).map((p) => ({ positionId: p.positionId, title: positionTitles.get(p.positionId) || p.positionId, isManagerPost: p.isManagerPost }));
      patterns.set(patternPath[1], list);
      return json(list.map((p, i) => ({ ...p, sortOrder: i })));
    }
    if (method === 'POST' && path === '/positions') {
      const id = crypto.randomUUID();
      positionTitles.set(id, body.title);
      return json({ id, title: body.title, parentPositionId: null, isActive: true, companyIds: body.companyIds || [] }, 201);
    }
    const asg = path.match(/^\/assignments\/([^/]+)$/);
    if (asg && method === 'PUT') {
      const found = body.unitId ? find(body.unitId) : null;
      if (!found) return problem(404, 'واحد پیدا نشد.', 'not_found');
      const unit = found.unit;
      let post = (unit.positions || []).find((p) => p.positionId === body.positionId);
      if (!post) {
        post = { unitPositionId: crypto.randomUUID(), positionId: body.positionId, title: positionTitles.get(body.positionId) || body.positionId, sortOrder: (unit.positions || []).length, isActive: true, holders: [], code: String(++postSeq) };
        unit.positions = [...(unit.positions || []), post];
      }
      if (!post.holders.some((h) => h.userId === asg[1])) post.holders = [...post.holders, { userId: asg[1], displayName: ((window as unknown as { __people?: Record<string, string> }).__people?.[asg[1]] ?? 'کاربر'), isActive: true, positionTitle: post.title, managerUserId: null }];
      return json({ userId: asg[1], companyId: found.company.companyId, unitId: unit.unitId, positionId: body.positionId });
    }
    if (method === 'GET' && path === '/positions') return json([...positionTitles].map(([id, title]) => ({ id, title, parentPositionId: null, isActive: true, companyIds: chart.map((c) => c.companyId) })));
    if (method === 'POST' && path === '/post-templates/apply') {
      const targets = body.nodeId ? [find(body.nodeId)?.unit].filter(Boolean) as ChartUnit[] : chart.flatMap((c) => allUnitsOf(c)).filter((u) => u.nodeType?.nodeTypeId === body.nodeTypeId && u.isActive !== false);
      let created = 0;
      for (const unit of targets) {
        for (const p of patterns.get(unit.nodeType?.nodeTypeId || '') || []) {
          if ((unit.positions || []).some((x) => x.positionId === p.positionId)) continue;
          unit.positions = [...(unit.positions || []), { unitPositionId: crypto.randomUUID(), positionId: p.positionId, title: p.title, sortOrder: (unit.positions || []).length, isActive: true, holders: [], code: String(++postSeq) }];
          created++;
        }
      }
      return json({ created: Array.from({ length: created }, () => ({})), skipped: [] });
    }
    if (method === 'GET' && path === '/unit-positions') {
      if (!query.get('unitId')) {
        return json(chart.flatMap((c) => allUnitsOf(c).flatMap((u) => (u.positions || []).map((p) => ({ id: p.unitPositionId, unitId: u.unitId, unitName: u.name, companyId: c.companyId, positionId: p.positionId, title: p.title, sortOrder: p.sortOrder, isPositionActive: true, holders: p.holders, code: p.code, isManagerPost: managerPosts.has(p.unitPositionId) })))));
      }
      const u = query.get('unitId') ? find(query.get('unitId')!)?.unit : null;
      return json((u?.positions || []).map((p) => ({ id: p.unitPositionId, unitId: u!.unitId, unitName: u!.name, positionId: p.positionId, title: p.title, sortOrder: p.sortOrder, isPositionActive: true, holders: p.holders, code: p.code, isManagerPost: managerPosts.has(p.unitPositionId) })));
    }
    const mp = path.match(/^\/unit-positions\/([^/]+)\/manager-post$/);
    if (mp && method === 'PUT') { if (body.isManagerPost) managerPosts.add(mp[1]); else managerPosts.delete(mp[1]); return json({}); }

    const nodeExtra = path.match(/^\/nodes\/([^/]+)\/(details|validity|merge|changes|undo)$/);
    if (nodeExtra) {
      const found = find(nodeExtra[1]);
      if (!found) return problem(404, 'گره پیدا نشد.', 'not_found');
      const { company, unit } = found;
      if (method === 'GET' && nodeExtra[2] === 'changes') return json((log.get(unit.unitId) || []).map((c, i) => ({ id: c.id, action: c.action, userId: null, atUtc: c.atUtc, details: c.details, canUndo: i === 0 && !!c.undo })));
      if (body?.rowVersion != null && body.rowVersion !== versionOf(unit.unitId)) return problem(409, 'این گره را کس دیگری همین حالا تغییر داده است؛ صفحه را تازه کنید و دوباره امتحان کنید.', 'conflict.changed');
      if (nodeExtra[2] === 'details') {
        const before = details.get(unit.unitId);
        details.set(unit.unitId, { code: body.code || null, latinName: body.latinName || null, correspondenceTitle: body.correspondenceTitle || null, phone: body.phone || null, address: body.address || null });
        bump(unit.unitId);
        record(unit.unitId, 'details', () => { if (before) details.set(unit.unitId, before); else details.delete(unit.unitId); });
        return json(nodeOf(company, unit));
      }
      if (nodeExtra[2] === 'validity') {
        const before = validity.get(unit.unitId);
        validity.set(unit.unitId, { from: body.validFrom ? String(body.validFrom).slice(0, 10) : null, to: body.validTo ? String(body.validTo).slice(0, 10) : null });
        bump(unit.unitId);
        record(unit.unitId, 'validity', () => { if (before) validity.set(unit.unitId, before); else validity.delete(unit.unitId); });
        return json(nodeOf(company, unit));
      }
      if (nodeExtra[2] === 'merge') {
        const target = find(body.targetNodeId)?.unit;
        if (!target || target.unitId === unit.unitId || isInSub(unit, target.unitId)) return problem(400, 'مقصد ادغام درست نیست.');
        const movedChildren = unit.children || [];
        movedChildren.forEach((c) => { c.parentNodeId = target.unitId; });
        target.children = [...(target.children || []), ...movedChildren];
        target.positions = [...(target.positions || []), ...(unit.positions || [])];
        target.members = [...target.members, ...unit.members];
        const before = { children: movedChildren, positions: unit.positions || [], members: unit.members };
        unit.children = []; unit.positions = []; unit.members = []; unit.isActive = false;
        bump(unit.unitId);
        record(unit.unitId, 'merge', () => {
          target.children = (target.children || []).filter((c) => !before.children.includes(c));
          target.positions = (target.positions || []).filter((p) => !before.positions.includes(p));
          target.members = target.members.filter((m) => !before.members.includes(m));
          before.children.forEach((c) => { c.parentNodeId = unit.unitId; });
          unit.children = before.children; unit.positions = before.positions; unit.members = before.members; unit.isActive = true;
        }, `به «${target.name}»`);
        return json(nodeOf(company, unit));
      }
      if (nodeExtra[2] === 'undo') {
        const last = (log.get(unit.unitId) || [])[0];
        if (!last?.undo) return problem(409, 'این تغییر برگردانده نمی‌شود.', 'conflict');
        last.undo();
        log.set(unit.unitId, (log.get(unit.unitId) || []).slice(1));
        bump(unit.unitId);
        record(unit.unitId, 'undo', null);
        return json(nodeOf(company, unit));
      }
    }

    const node = path.match(/^\/nodes\/([^/]+)(?:\/(\w+))?$/);
    if (node && method === 'POST') {
      const found = find(node[1]);
      if (!found) return problem(404, 'گره پیدا نشد.', 'not_found');
      if (body?.rowVersion != null && body.rowVersion !== versionOf(node[1])) return problem(409, 'این گره را کس دیگری همین حالا تغییر داده است؛ صفحه را تازه کنید و دوباره امتحان کنید.', 'conflict.changed');
      const { company, unit } = found;
      if (node[2] === 'move') {
        const parentId: string | null = body.parentNodeId;
        if (parentId && wouldLoop(unit, parentId)) return problem(400, 'گره را نمی‌شود زیر خودش یا زیرمجموعه‌اش گذاشت.');
        const list = siblingsOf(company, unit);
        const oldParent = unit.parentNodeId ?? null;
        list.splice(list.indexOf(unit), 1);
        unit.parentNodeId = parentId;
        (parentId ? find(parentId)!.unit.children! : company.units).push(unit);
        bump(unit.unitId);
        record(unit.unitId, 'move', () => {
          const now = siblingsOf(company, unit);
          now.splice(now.indexOf(unit), 1);
          unit.parentNodeId = oldParent;
          (oldParent ? find(oldParent)!.unit.children! : company.units).push(unit);
        });
        return json(nodeOf(company, unit));
      }
      if (node[2] === 'reorder') {
        const list = siblingsOf(company, unit);
        list.splice(list.indexOf(unit), 1);
        list.splice(Math.max(0, Math.min(body.position, list.length)), 0, unit);
        bump(unit.unitId);
        return json(nodeOf(company, unit));
      }
      if (node[2] === 'deactivate' || node[2] === 'activate') {
        const was = unit.isActive;
        unit.isActive = node[2] === 'activate';
        bump(unit.unitId);
        record(unit.unitId, node[2] as string, () => { unit.isActive = was; });
        return json(nodeOf(company, unit));
      }
    }
    if (method === 'POST' && path === '/nodes') {
      const company = body.companyId ? chart.find((c) => c.companyId === body.companyId) : body.parentNodeId ? find(body.parentNodeId)?.company : chart[0];
      if (!company) return problem(404, 'شرکت پیدا نشد.', 'not_found');
      const type = typesOf().find((t) => t.id === body.nodeTypeId);
      const unit: ChartUnit = {
        unitId: crypto.randomUUID(), name: body.name, manager: null, members: [], positions: [], children: [], isActive: true, peopleCount: 0,
        parentNodeId: body.parentNodeId ?? null,
        nodeType: type ? { nodeTypeId: type.id, name: type.name, color: type.color, icon: type.icon, isDomainBoundary: type.isDomainBoundary } : null,
      };
      (body.parentNodeId ? find(body.parentNodeId)!.unit.children! : company.units).push(unit);
      if (body.code) details.set(unit.unitId, { code: body.code });
      return json(nodeOf(company, unit), 201);
    }
    const put = path.match(/^\/nodes\/([^/]+)$/);
    if (put && method === 'PUT') {
      const found = find(put[1]);
      if (!found) return problem(404, 'گره پیدا نشد.', 'not_found');
      if (body?.rowVersion != null && body.rowVersion !== versionOf(put[1])) return problem(409, 'این گره را کس دیگری همین حالا تغییر داده است؛ صفحه را تازه کنید و دوباره امتحان کنید.', 'conflict.changed');
      found.unit.name = body.name;
      const type = typesOf().find((t) => t.id === body.nodeTypeId);
      found.unit.nodeType = type ? { nodeTypeId: type.id, name: type.name, color: type.color, icon: type.icon, isDomainBoundary: type.isDomainBoundary } : found.unit.nodeType;
      bump(put[1]);
      return json(nodeOf(found.company, found.unit));
    }
    return json([]);
  };

  return {
    chart: () => chart,
    bump,
    fetch: async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href);
      const marker = '/api/org-structure';
      if (url.pathname.endsWith('/api/identity/users')) {
        const people = chart.flatMap((c) => allUnitsOf(c).flatMap((u) => [...u.members, ...(u.positions || []).flatMap((p) => p.holders)]));
        const unique = [...new Map(people.map((m) => [m.userId, m] as const)).values()];
        (window as unknown as { __people?: Record<string, string> }).__people = Object.fromEntries(unique.map((m) => [m.userId, m.displayName]));
        const q = url.searchParams.get('search') || '';
        const items = unique.filter((m) => m.displayName.includes(q)).map((m) => ({ id: m.userId, tenantId: 't', username: m.userId, firstName: m.displayName, lastName: '', displayName: m.displayName, email: null, phoneNumber: '', isActive: true, roles: [] }));
        return json({ items, totalCount: items.length, pageNumber: 1, pageSize: 50 });
      }
      if (!url.pathname.includes(marker)) return json([]);
      const path = url.pathname.slice(url.pathname.indexOf(marker) + marker.length) || '/';
      let body: any = null;
      if (init?.body instanceof FormData) body = init.body;
      else { try { body = init?.body ? JSON.parse(String(init.body)) : null; } catch { /* not JSON */ } }
      if (path === '/chart') performance.mark('org-chart-response'); // scripts/measure-org-chart.mjs measures drawing from here
      return handle((init?.method || 'GET').toUpperCase(), path, url.searchParams, body);
    },
  };
}
