// Org chart mocks: flat (today's data), a small nested company, the Post Bank chart (52 nodes, the
// bank template) and a large generated one (400 nodes by default). See build.ts.
import type { ChartCompany } from '../../services/orgStructureApi';
import { ChartBuilder, LINK_TYPES, NODE_TYPES } from './build';

/** Today's flat data: deputies side by side, no new fields at all (as an older backend sends). */
export function flatChart(): ChartCompany[] {
  const b = new ChartBuilder('flat');
  b.node({ key: 'it', name: 'معاونت فناوری اطلاعات', managerTitle: 'معاون', staff: ['کارشناس شبکه', 'کارشناس نرم‌افزار'] });
  b.node({ key: 'finance', name: 'معاونت مالی', managerTitle: 'معاون', staff: ['کارشناس مالی'] });
  b.node({ key: 'hr', name: 'معاونت منابع انسانی', managerTitle: 'معاون', vacantManager: true, staff: ['کارشناس آموزش'] });
  return [b.company({ name: 'شرکت نمونه', code: 'FLAT', headTitle: 'مدیرعامل', headInCompany: true })];
}

/** A medium company with nested nodes (deputy template) and one dashed secondary line. */
export function nestedChart(): ChartCompany[] {
  const b = new ChartBuilder('nested');
  const it = b.node({ key: 'it', name: 'معاونت فناوری اطلاعات', parent: null, type: NODE_TYPES.deputy, managerTitle: 'معاون' });
  const software = b.node({ key: 'software', name: 'واحد نرم‌افزار', parent: it, type: NODE_TYPES.unit, managerTitle: 'مدیر', staff: ['کارشناس', 'کارشناس'] });
  b.node({ key: 'network', name: 'واحد شبکه', parent: it, type: NODE_TYPES.unit, managerTitle: 'مدیر', vacantManager: true, staff: ['کارشناس'] });
  const finance = b.node({ key: 'finance', name: 'معاونت مالی', parent: null, type: NODE_TYPES.deputy, managerTitle: 'معاون' });
  b.node({ key: 'accounting', name: 'واحد حسابداری', parent: finance, type: NODE_TYPES.unit, managerTitle: 'مدیر', staff: ['کارشناس'] });
  b.link(software, finance, LINK_TYPES.functional);
  return [b.company({ name: 'شرکت متوسط', code: 'NEST', headTitle: 'مدیرعامل', headInCompany: true, uiLevel: 'normal' })];
}

/** The Post Bank chart as the bank template builds it: 52 nodes, the committees' dotted lines. */
export function postBankChart(): ChartCompany[] {
  const b = new ChartBuilder('bank');
  const T = NODE_TYPES;
  const assembly = b.node({ key: 'general-assembly', name: 'مجمع عمومی', parent: null, type: T.assembly });
  const board = b.node({ key: 'board', name: 'هیأت مدیره', parent: assembly, type: T.board });
  const ceo = b.node({ key: 'ceo-office', name: 'مدیریت عامل', parent: board, type: T.ceoOffice, managerTitle: 'مدیرعامل', staff: ['قائم‌مقام مدیرعامل'] });
  // The CEO's post is the company head's.
  ceo.positions![0].isHead = true;

  const staff = (key: string, name: string) => b.node({ key, name, parent: ceo, type: T.staffUnit, managerTitle: 'مدیر کل', staff: ['کارشناس'] });
  staff('internal-audit', 'اداره کل حسابرسی داخلی');
  staff('management-office', 'اداره کل حوزه مدیریت');
  staff('public-relations', 'اداره کل روابط عمومی');
  staff('legal', 'اداره کل حقوقی');
  staff('risk-management', 'اداره کل مدیریت ریسک');
  staff('compliance', 'اداره کل رعایت قوانین و مقررات (تطبیق)');
  staff('selection-core', 'هسته گزینش');
  staff('anti-money-laundering', 'اداره کل مبارزه با پولشویی و تأمین مالی تروریسم');

  const area = (key: string, name: string, kind: 'deputy' | 'affairs', departments: string[], branches: string[] = []) => {
    const node = b.node({ key, name, parent: ceo, type: kind === 'deputy' ? T.deputy : T.affairs, managerTitle: kind === 'deputy' ? 'معاون' : 'مدیر امور' });
    departments.forEach((dep, i) => b.node({ key: `${key}-${i + 1}`, name: dep, parent: node, type: T.generalDepartment, managerTitle: 'مدیر کل', vacantManager: i === 1, staff: ['کارشناس'] }));
    branches.forEach((branch, i) => b.node({ key: `${key}-branch-${i + 1}`, name: branch, parent: node, type: T.branch, managerTitle: 'رئیس شعبه', staff: ['معاون شعبه'] }));
  };
  area('credit-international', 'معاونت اعتباری و بین‌الملل', 'deputy', ['اداره کل اعتبارات', 'اداره کل بررسی و نظارت بر طرح‌ها', 'اداره کل امور بین‌الملل', 'اداره کل پیگیری وصول مطالبات', 'اداره کل تأمین مالی طرح‌های نوآورانه']);
  area('information-technology', 'معاونت فناوری اطلاعات', 'deputy', ['اداره کل تأمین و نظارت بر سامانه‌های نرم‌افزاری', 'اداره کل توسعه بانکداری الکترونیک', 'اداره کل امنیت و زیرساخت']);
  area('finance-investment', 'معاونت مالی و سرمایه‌گذاری', 'deputy', ['اداره کل حسابداری و امور سهام', 'اداره کل خزانه‌داری و نظام‌های پرداخت', 'اداره کل آمار و بودجه']);
  area('provinces-regions', 'مدیریت امور استان‌ها و مناطق', 'affairs', ['اداره کل امور شعب', 'اداره کل امور باجه‌های بانکی روستایی'], ['شعبه مستقل متمرکز (دیجیتال)']);
  area('corporate-banking', 'مدیریت امور بانکداری شرکتی و بازاریابی', 'affairs', ['اداره کل بانکداری شرکتی و امور مشتریان حقوقی', 'اداره کل بازاریابی و امور مشتریان حقیقی']);
  area('inspection', 'مدیریت امور بازرسی، نظارت و صیانت از مشتریان', 'affairs', ['اداره کل بازرسی و نظارت', 'اداره کل صیانت از مشتریان و سلامت اداری']);
  area('protection', 'مدیریت امور حراست', 'affairs', ['اداره کل حفاظت پرسنلی', 'اداره کل حفاظت فناوری اطلاعات و اسناد', 'اداره کل حفاظت فیزیکی']);
  area('organization-planning', 'معاونت سازمان و برنامه‌ریزی', 'deputy', ['اداره کل سازمان و بهبود روش‌ها', 'اداره کل برنامه‌ریزی، کنترل برنامه‌ها و پایش عملکرد واحدها']);
  area('human-capital', 'معاونت توسعه سرمایه انسانی و پشتیبانی', 'deputy', ['اداره کل سرمایه انسانی و رفاه', 'اداره کل آموزش و تحقیقات', 'اداره کل پشتیبانی و املاک']);
  b.node({ key: 'branch-management', name: 'مدیریت شعب استان / منطقه', parent: ceo, type: T.branchManagement, managerTitle: 'مدیر شعب استان / منطقه' });

  // The committees: top-level, each with a dotted line to the board (the template's automatic rule).
  for (const [key, name] of [
    ['it-committee', 'کمیته عالی فناوری اطلاعات'],
    ['remuneration-committee', 'کمیته جبران خدمات'],
    ['audit-committee', 'کمیته حسابرسی'],
    ['compliance-committee', 'کمیته رعایت قوانین و مقررات'],
    ['risk-committee', 'کمیته مدیریت ریسک'],
  ]) {
    b.link(b.node({ key, name, parent: null, type: T.committee }), board, LINK_TYPES.boardCommittee);
  }
  b.link(b.find('internal-audit'), board, LINK_TYPES.oversight);
  b.link(b.find('internal-audit'), b.find('audit-committee'), LINK_TYPES.oversight);
  b.link(b.find('risk-management'), b.find('risk-committee'), LINK_TYPES.oversight);
  b.link(b.find('compliance'), b.find('compliance-committee'), LINK_TYPES.oversight);

  return [b.company({ name: 'پست بانک ایران', code: 'PB', headTitle: 'مدیرعامل', headInCompany: false, uiLevel: 'advanced' })];
}

/**
 * A large bank-like company with exactly `nodeCount` nodes (at least 9): the governance bodies and
 * CEO office, then deputies with general departments and offices, then branches - for measuring
 * how the chart and its PDF cope. Every 7th manager post is vacant.
 */
export function largeChart(nodeCount = 400): ChartCompany[] {
  if (nodeCount < 9) throw new Error('largeChart needs at least 9 nodes.');
  const b = new ChartBuilder(`large${nodeCount}`);
  const T = NODE_TYPES;
  const assembly = b.node({ key: 'general-assembly', name: 'مجمع عمومی', parent: null, type: T.assembly });
  const board = b.node({ key: 'board', name: 'هیأت مدیره', parent: assembly, type: T.board });
  const ceo = b.node({ key: 'ceo-office', name: 'مدیریت عامل', parent: board, type: T.ceoOffice, managerTitle: 'مدیرعامل', staff: ['قائم‌مقام مدیرعامل'] });
  ceo.positions![0].isHead = true;
  for (let i = 1; i <= 3; i++) b.link(b.node({ key: `committee-${i}`, name: `کمیته ${i}`, parent: null, type: T.committee }), board, LINK_TYPES.boardCommittee);
  const branchManagement = b.node({ key: 'branch-management', name: 'مدیریت شعب استان / منطقه', parent: ceo, type: T.branchManagement, managerTitle: 'مدیر شعب استان / منطقه' });

  const left = () => nodeCount - b.units.length;
  const vacant = () => b.units.length % 7 === 0;
  // Deputies of 1 + 4 general departments × (1 + 4 offices) = 21 nodes each, while they fit with room for branches.
  for (let d = 1; left() >= 21 + 10; d++) {
    const deputy = b.node({ key: `deputy-${d}`, name: `معاونت ${d}`, parent: ceo, type: T.deputy, managerTitle: 'معاون', vacantManager: vacant() });
    for (let g = 1; g <= 4; g++) {
      const department = b.node({ key: `deputy-${d}-gd-${g}`, name: `اداره کل ${d}-${g}`, parent: deputy, type: T.generalDepartment, managerTitle: 'مدیر کل', vacantManager: vacant(), staff: ['کارشناس'] });
      for (let o = 1; o <= 4; o++) {
        b.node({ key: `deputy-${d}-gd-${g}-office-${o}`, name: `اداره ${d}-${g}-${o}`, parent: department, type: T.office, managerTitle: 'رئیس اداره', vacantManager: vacant(), staff: ['کارشناس', 'کارشناس'] });
      }
    }
  }
  for (let n = 1; left() > 0; n++) {
    b.node({ key: `branch-${n}`, name: `شعبه ${n}`, parent: branchManagement, type: T.branch, managerTitle: 'رئیس شعبه', vacantManager: vacant(), staff: ['معاون شعبه', 'کارمند شعبه'] });
  }
  return [b.company({ name: `شرکت آزمایشی ${nodeCount} گره`, code: `L${nodeCount}`, headTitle: 'مدیرعامل', headInCompany: false, uiLevel: 'advanced' })];
}

/** The mocks by name, for a preview page or a measurement. */
export const ORG_CHART_MOCKS = {
  flat: flatChart,
  nested: nestedChart,
  postBank: postBankChart,
  large40: () => largeChart(40),
  large400: () => largeChart(400),
} as const;

export type OrgChartMockName = keyof typeof ORG_CHART_MOCKS;
