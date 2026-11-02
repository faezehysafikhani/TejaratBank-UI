// Small builders for org chart mock data (GET /api/org-structure/chart). Only for development,
// component previews and measurements: nothing in the app imports src/mocks, so none of it is in
// the production bundle. Ids are deterministic, so the same mock always gives the same chart.
import type {
  ChartCompany,
  ChartLink,
  ChartMember,
  ChartNodeType,
  ChartPosition,
  ChartUnit,
  OrgLineStyle,
  OrgUiLevel,
  PersonRef,
} from '../../services/orgStructureApi';

const FIRST = ['علی', 'مریم', 'رضا', 'زهرا', 'حسین', 'فاطمه', 'محمد', 'سارا', 'مهدی', 'نرگس', 'امیر', 'لیلا', 'حامد', 'الهام', 'سعید', 'نازنین'];
const LAST = ['احمدی', 'رضایی', 'محمدی', 'حسینی', 'کریمی', 'موسوی', 'جعفری', 'صادقی', 'رحیمی', 'نوری', 'قاسمی', 'یزدانی', 'تهرانی', 'شریفی'];

/** A deterministic id: prefix plus a zero-padded number (looks like nothing real). */
export const mockId = (prefix: string, n: number) => `${prefix}-${String(n).padStart(4, '0')}`;

export class ChartBuilder {
  private people = 0;
  private posts = 0;
  private linkCount = 0;
  /** Every node made, at any depth (the company's `units` are only the top ones, as GET /chart sends them). */
  readonly units: ChartUnit[] = [];

  constructor(private readonly prefix: string) {}

  person(positionTitle: string | null, managerUserId: string | null = null): ChartMember {
    const n = ++this.people;
    return {
      userId: mockId(`${this.prefix}-user`, n),
      displayName: `${FIRST[n % FIRST.length]} ${LAST[(n * 7) % LAST.length]}`,
      isActive: true,
      positionTitle,
      managerUserId,
      avatarUrl: null,
    };
  }

  /** A post; holder: someone in it, null: vacant. */
  post(title: string, sortOrder: number, holder: ChartMember | null, extra: Partial<ChartPosition> = {}): ChartPosition {
    const n = ++this.posts;
    return {
      unitPositionId: mockId(`${this.prefix}-post`, n),
      positionId: mockId(`${this.prefix}-position`, Math.abs(hash(title))),
      title,
      sortOrder,
      isActive: true,
      holders: holder ? [holder] : [],
      code: String(n),
      ...extra,
    };
  }

  /**
   * A node with a manager post (held unless vacant) and its other posts, each held by someone
   * reporting to the manager. It is added to its parent's children (nested, as GET /chart sends them).
   */
  node(input: {
    key: string;
    name: string;
    parent?: ChartUnit | null;
    type?: ChartNodeType | null;
    managerTitle?: string;
    vacantManager?: boolean;
    staff?: string[];
    links?: ChartLink[];
  }): ChartUnit {
    const manager = input.managerTitle && !input.vacantManager ? this.person(input.managerTitle) : null;
    const managerPost = input.managerTitle ? this.post(input.managerTitle, 0, manager) : null;
    const staffPosts = (input.staff || []).map((title, i) =>
      this.post(title, i + 1, this.person(title, manager?.userId ?? null), { parentPostId: managerPost?.unitPositionId ?? null }));
    const unit: ChartUnit = {
      unitId: mockId(`${this.prefix}-node`, this.units.length + 1),
      name: input.name,
      manager: manager ? asRef(manager) : null,
      members: [],
      isActive: true,
      positions: [...(managerPost ? [managerPost] : []), ...staffPosts],
      peopleCount: (manager ? 1 : 0) + staffPosts.length,
    };
    if (input.parent !== undefined || input.type !== undefined || input.links) {
      unit.parentNodeId = input.parent?.unitId ?? null;
      unit.children = [];
      unit.nodeType = input.type ?? null;
      unit.links = input.links || [];
      if (input.parent) input.parent.children = [...(input.parent.children || []), unit];
    }
    keys.set(unit, input.key);
    this.units.push(unit);
    return unit;
  }

  find(key: string): ChartUnit {
    const unit = this.units.find((u) => keys.get(u) === key);
    if (!unit) throw new Error(`No mock node '${key}'.`);
    return unit;
  }

  /** A secondary link from one node to another. */
  link(source: ChartUnit, target: ChartUnit, type: { linkTypeId: string; name: string; lineStyle: OrgLineStyle; countsAsManager?: boolean }) {
    const link: ChartLink = {
      linkId: mockId(`${this.prefix}-link`, ++this.linkCount),
      targetNodeId: target.unitId,
      linkTypeId: type.linkTypeId,
      name: type.name,
      lineStyle: type.lineStyle,
      countsAsManager: type.countsAsManager ?? false,
    };
    source.links = [...(source.links || []), link];
    return link;
  }

  company(input: { name: string; code: string; headTitle: string; headInCompany: boolean; uiLevel?: OrgUiLevel }): ChartCompany {
    const head = input.headInCompany ? this.person(input.headTitle) : null;
    const positions = input.headInCompany ? [this.post(input.headTitle, 0, head, { isHead: true })] : [];
    const company: ChartCompany = {
      companyId: mockId(`${this.prefix}-company`, 1),
      name: input.name,
      code: input.code,
      isActive: true,
      manager: head ? asRef(head) : null,
      members: [],
      units: this.units.filter((unit) => !unit.parentNodeId),
      positions,
      peopleCount: (head ? 1 : 0) + this.units.reduce((sum, unit) => sum + (unit.peopleCount ?? 0), 0),
    };
    if (input.uiLevel) company.uiLevel = input.uiLevel;
    return company;
  }
}

const keys = new WeakMap<ChartUnit, string>();

const asRef = (member: ChartMember): PersonRef => ({ userId: member.userId, displayName: member.displayName, isActive: member.isActive, avatarUrl: null });

function hash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return h % 10000;
}

// ------------------------------------------------------------------ node and link types (as in the bank template)

const type = (key: string, name: string, color: string, icon: string, isDomainBoundary: boolean): ChartNodeType =>
  ({ nodeTypeId: `type-${key}`, name, color, icon, isDomainBoundary });

export const NODE_TYPES = {
  assembly: type('general-assembly', 'مجمع عمومی', '#475569', 'landmark', true),
  board: type('board', 'هیأت مدیره', '#1e3a8a', 'users', true),
  committee: type('committee', 'کمیته', '#7c3aed', 'users-round', true),
  ceoOffice: type('ceo-office', 'مدیریت عامل', '#b45309', 'crown', true),
  staffUnit: type('staff-unit', 'واحد ستادی', '#4d7c0f', 'building', true),
  deputy: type('deputy', 'معاونت', '#0f766e', 'building-2', true),
  affairs: type('affairs-management', 'مدیریت امور', '#0369a1', 'briefcase', true),
  generalDepartment: type('general-department', 'اداره کل', '#2563eb', 'folder-tree', false),
  office: type('office', 'اداره', '#64748b', 'folder', false),
  branchManagement: type('branch-management', 'مدیریت شعب استان / منطقه', '#be123c', 'map-pin', true),
  branch: type('branch', 'شعبه', '#c2410c', 'store', false),
  unit: type('unit', 'واحد', '#2563eb', 'folder', false),
} as const;

export const LINK_TYPES = {
  boardCommittee: { linkTypeId: 'link-type-board-committee', name: 'کمیته‌ی هیأت مدیره', lineStyle: 'dotted' as const },
  oversight: { linkTypeId: 'link-type-oversight', name: 'نظارت تخصصی', lineStyle: 'dotted' as const },
  functional: { linkTypeId: 'link-type-functional', name: 'گزارش‌دهی تخصصی', lineStyle: 'dashed' as const },
};
