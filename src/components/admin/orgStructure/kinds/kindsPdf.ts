// «دریافت PDF» of the organization chart, whole: the tree chart as one page as big as the chart, the list chart as A4 pages.
// Both are drawn off screen with plain inline styles (hex colours only: html2canvas cannot read Tailwind's oklch colours) and
// captured as images, so Persian text keeps the app's font and shaping (the same way the activity report's PDF is made).
import { jalaliStamp, pagesToPdf, saveBlob } from '../../../../utils/reportExport';
import { toPersianDigits } from '../../../../utils/helpers';
import { KIND_INFO, type KindTreeNode, countBelow, inRows, leafColumns, officialOf, shownChildren, splitChildren } from './orgKinds';

const C = { ink: '#0f172a', muted: '#64748b', line: '#d3cbf5', border: '#e3def8', head: '#b45309', headBg: '#fffbeb', zebra: '#f8fafc' };
const PAGE_W = 794;
const PAGE_H = 1123;
const PAD = 40;
/** Branches in a row of the tree page (the page is as wide as it needs to be; more branches go on the next row). */
const TREE_PER_ROW = 12;

const el = (tag: string, css: string, text?: string): HTMLElement => {
  const node = document.createElement(tag);
  node.style.cssText = css;
  if (text !== undefined) node.textContent = text;
  return node;
};

const countAll = (roots: KindTreeNode[]): number => roots.reduce((n, r) => n + 1 + countBelow(r), 0);
const stampText = (): string => {
  const now = new Date();
  return `تهیه‌شده در ${toPersianDigits(jalaliStamp().replace(/-/g, '/'))} ساعت ${toPersianDigits(now.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }))}`;
};
const personsText = (node: KindTreeNode): string =>
  node.persons.map((p) => (node.persons.length > 1 && p.isPrimary ? `★ ${p.displayName}` : p.displayName)).join('، ');

// ---------------------------------------------------------------- the tree chart

function treeCard(node: KindTreeNode, parent: KindTreeNode | null, real: KindTreeNode): HTMLElement {
  const info = KIND_INFO[node.kind];
  const isHead = !!parent && parent.headNodeId === node.id;
  const card = el('div', `position:relative;z-index:1;box-sizing:border-box;min-width:150px;max-width:230px;background:#ffffff;border:1px solid ${isHead ? '#fcd34d' : C.border};border-top:4px solid ${info.color};border-radius:10px;padding:7px 12px 9px;text-align:center;direction:rtl;font-size:12px;color:${C.ink}`);
  card.append(el('div', `font-size:10px;color:${info.color}`, `${isHead ? '★ رئیس · ' : ''}${info.label}`));
  card.append(el('div', 'font-weight:700;font-size:13px;margin:2px 0 4px', node.name));
  if (node.kind === 'unit') {
    const head = real.headNodeId ? real.children.find((c) => c.id === real.headNodeId) : null;
    const person = head ? officialOf(head) : null;
    card.append(el('div', `font-size:10.5px;color:${head ? C.head : C.muted}`, head ? `★ رئیس: ${head.name}${person ? ` · ${person.displayName}` : ''}` : 'بدون رئیس'));
  } else {
    card.append(el('div', `font-size:11px;line-height:1.7;color:${node.persons.length ? C.ink : C.muted}`, node.persons.length ? personsText(node) : 'خالی'));
  }
  return card;
}

/** A node and everything under it: its card, then rows of its branches (and the block of its leaves) joined with lines. */
function treeBranch(node: KindTreeNode, parent: KindTreeNode | null, real: KindTreeNode): HTMLElement {
  const box = el('div', 'display:flex;flex-direction:column;align-items:center');
  box.append(treeCard(node, parent, real));
  const kids = shownChildren(node);
  if (kids.length === 0) return box;
  const realOf = (c: KindTreeNode) => node.children.find((x) => x.id === c.id) ?? c;
  const { branches, leaves, grid } = splitChildren(kids);
  const items: HTMLElement[] = branches.map((c) => treeBranch(c, node, realOf(c)));
  if (grid) {
    const block = el('div', `display:grid;gap:8px;direction:rtl;grid-template-columns:repeat(${leafColumns(leaves.length)}, 170px)`);
    leaves.forEach((c) => block.append(treeCard(c, node, realOf(c))));
    items.push(block);
  } else {
    leaves.forEach((c) => items.push(treeBranch(c, node, realOf(c))));
  }
  const rows = inRows(items, TREE_PER_ROW);
  const stack = el('div', 'display:flex;flex-direction:column;align-items:center;gap:8px');
  rows.forEach((row, rowIndex) => {
    const wrap = el('div', 'position:relative;display:flex;justify-content:center');
    if (rowIndex < rows.length - 1) wrap.append(el('div', `position:absolute;left:50%;top:0;bottom:-8px;width:0;border-left:2px solid ${C.line}`));
    // Right to left: the first item is on the right; the lines are drawn left to right.
    const visual = [...row].reverse();
    const line = el('div', 'position:relative;z-index:1;display:flex;justify-content:center');
    visual.forEach((item, i) => {
      const cell = el('div', 'position:relative;padding:20px 8px 0;display:flex;flex-direction:column;align-items:center');
      cell.append(el('div', `position:absolute;top:0;left:50%;height:20px;width:0;border-left:2px solid ${C.line}`));
      if (visual.length > 1 && i > 0) cell.append(el('div', `position:absolute;top:0;left:0;width:50%;height:0;border-top:2px solid ${C.line}`));
      if (visual.length > 1 && i < visual.length - 1) cell.append(el('div', `position:absolute;top:0;right:0;width:50%;height:0;border-top:2px solid ${C.line}`));
      cell.append(item);
      line.append(cell);
    });
    wrap.append(line);
    stack.append(wrap);
  });
  const down = el('div', `width:0;height:0;border-left:2px solid ${C.line}`);
  box.append(down, stack);
  return box;
}

/** The whole tree chart as one PDF page the size of the chart. */
export async function downloadTreePdf(roots: KindTreeNode[], orgName: string, onProgress?: (text: string) => void): Promise<void> {
  const root = el('div', `position:fixed;top:0;left:-40000px;box-sizing:border-box;width:max-content;background:#ffffff;padding:32px;font-family:inherit;color:${C.ink}`);
  root.className = 'report-print-root';
  document.body.appendChild(root);
  try {
    onProgress?.('در حال ساخت چارت...');
    const header = el('div', 'direction:rtl;margin-bottom:18px;text-align:right');
    header.append(el('div', 'font-size:20px;font-weight:800', `چارت سازمانی «${orgName}»`), el('div', `font-size:12px;color:${C.muted};margin-top:4px`, `${toPersianDigits(countAll(roots))} گره · ${stampText()}`));
    const chart = el('div', 'display:flex;flex-direction:column;align-items:center;direction:ltr');
    const org = el('div', `box-sizing:border-box;min-width:150px;max-width:230px;background:#ffffff;border:1px solid ${C.border};border-top:4px solid ${KIND_INFO.org.color};border-radius:10px;padding:7px 12px 9px;text-align:center;direction:rtl;font-size:12px`);
    org.append(el('div', `font-size:10px;color:${KIND_INFO.org.color}`, KIND_INFO.org.label), el('div', 'font-weight:700;font-size:13px;margin-top:2px', orgName));
    chart.append(org);
    if (roots.length) {
      const ownRoots = roots.map((r) => ({ ...r }));
      const wrapper = el('div', '');
      // The organization's direct nodes hang from it as the children of a virtual node.
      const virtual: KindTreeNode = { id: '__org', name: orgName, kind: 'unit', parentNodeId: null, companyId: null, isActive: true, sortOrder: 0, rowVersion: '', headNodeId: null, persons: [], children: ownRoots };
      const below = treeBranch(virtual, null, virtual);
      // Reuse the rows of the virtual node, without its own card (the organization card above is the root).
      below.removeChild(below.firstChild!);
      wrapper.append(below);
      chart.append(wrapper);
    }
    root.append(header, chart);
    if (document.fonts?.ready) await document.fonts.ready;
    await new Promise((resolve) => setTimeout(resolve, 50));

    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);
    const w = root.offsetWidth;
    const h = root.offsetHeight;
    // The browser limits a canvas (about 16000 px a side, 268 million px): the picture is smaller for a huge chart.
    const scale = Math.max(0.25, Math.min(2, 14000 / Math.max(w, h), Math.sqrt(150e6 / (w * h))));
    onProgress?.('در حال ساخت تصویر چارت...');
    const canvas = await html2canvas(root, { scale, backgroundColor: '#ffffff', logging: false, useCORS: true, onclone: cleanClone });
    // 1 px = 0.2646 mm; a page may be at most about 5000 mm (200 inches) on a side.
    const k = Math.min(0.264583, 5000 / Math.max(w, h));
    const pdf = new jsPDF({ orientation: w >= h ? 'landscape' : 'portrait', unit: 'mm', format: [w * k, h * k], compress: true });
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, w * k, h * k, undefined, 'FAST');
    saveBlob(pdf.output('blob'), `org-chart-tree-${jalaliStamp()}.pdf`);
  } finally {
    root.remove();
  }
}

/** html2canvas copies the page and cannot parse Tailwind's oklch colours on it: the copy keeps only the chart, on white. */
function cleanClone(copy: Document): void {
  for (const node of [copy.documentElement, copy.body]) {
    node.removeAttribute('class');
    node.style.setProperty('background', '#ffffff', 'important');
  }
  for (const child of Array.from(copy.body.children)) {
    if (!(child as HTMLElement).classList.contains('report-print-root')) child.remove();
  }
  const own = copy.querySelector<HTMLElement>('.report-print-root');
  if (own) { own.style.left = '0'; own.style.top = '0'; own.style.position = 'absolute'; }
}

// ---------------------------------------------------------------- the list chart

/** The list chart (nested, every node open) as A4 pages. */
export async function downloadListPdf(roots: KindTreeNode[], orgName: string, onProgress?: (text: string) => void): Promise<void> {
  const root = el('div', 'position:fixed;top:0;left:-40000px');
  root.className = 'report-print-root';
  document.body.appendChild(root);
  try {
    const pages: HTMLElement[] = [];
    const total = countAll(roots);
    const newPage = (first: boolean) => {
      const page = el('div', `width:${PAGE_W}px;height:${PAGE_H}px;box-sizing:border-box;padding:${PAD}px;background:#ffffff;color:${C.ink};direction:rtl;overflow:hidden;position:relative;font-family:inherit`);
      page.className = 'report-page';
      const body = el('div', `height:${PAGE_H - PAD * 2 - 22}px;overflow:hidden`);
      const footer = el('div', `position:absolute;right:${PAD}px;left:${PAD}px;bottom:22px;font-size:10px;color:${C.muted};display:flex;justify-content:space-between`);
      footer.append(el('span', '', stampText()), el('span', ''));
      page.append(body, footer);
      root.append(page);
      pages.push(page);
      if (first) {
        body.append(el('div', 'font-size:18px;font-weight:800', `چارت سازمانی «${orgName}»`));
        body.append(el('div', `font-size:11px;color:${C.muted};margin:3px 0 12px`, `${toPersianDigits(total)} گره`));
      }
      return body;
    };
    let body = newPage(true);
    const place = (row: HTMLElement) => {
      body.append(row);
      if (body.scrollHeight > body.clientHeight && body.children.length > 1) {
        body.removeChild(row);
        body = newPage(false);
        body.append(row);
      }
    };
    const orgInfo = KIND_INFO.org;
    place(listRow(0, orgInfo.label, orgInfo.color, orgName, '', false));
    const emit = (nodes: KindTreeNode[], depth: number, parent: KindTreeNode | null) => nodes.forEach((node) => {
      const info = KIND_INFO[node.kind];
      const isHead = !!parent && parent.headNodeId === node.id;
      let extra = '';
      if (node.kind === 'unit') {
        const head = node.headNodeId ? node.children.find((c) => c.id === node.headNodeId) : null;
        const person = head ? officialOf(head) : null;
        extra = head ? `★ رئیس: ${head.name}${person ? ` · ${person.displayName}` : ''}` : 'بدون رئیس';
      } else {
        extra = node.persons.length ? personsText(node) : 'خالی';
      }
      place(listRow(depth, info.label, info.color, node.name, extra, isHead));
      emit(node.children, depth + 1, node);
    });
    emit(roots, 1, null);
    pages.forEach((page, i) => { (page.lastElementChild!.lastElementChild as HTMLElement).textContent = toPersianDigits(`صفحه ${i + 1} از ${pages.length}`); });
    if (document.fonts?.ready) await document.fonts.ready;
    const blob = await pagesToPdf(pages, (done, count) => onProgress?.(`در حال ساخت PDF: صفحه ${toPersianDigits(done)} از ${toPersianDigits(count)}`));
    saveBlob(blob, `org-chart-list-${jalaliStamp()}.pdf`);
  } finally {
    root.remove();
  }
}

function listRow(depth: number, kindLabel: string, color: string, name: string, extra: string, isHead: boolean): HTMLElement {
  const row = el('div', `display:flex;align-items:center;gap:8px;padding:3px 0;padding-right:${Math.min(depth, 14) * 16}px;font-size:12px;border-right:3px solid ${color};margin-bottom:2px;line-height:1.7`);
  row.append(el('span', `flex:none;font-size:10px;color:${color};min-width:78px`, kindLabel));
  if (isHead) row.append(el('span', `flex:none;font-size:10px;color:${C.head};background:${C.headBg};border:1px solid #fcd34d;border-radius:8px;padding:0 6px`, '★ رئیس'));
  row.append(el('span', 'font-weight:700', name));
  if (extra) row.append(el('span', `font-size:11px;color:${C.muted}`, extra));
  return row;
}
