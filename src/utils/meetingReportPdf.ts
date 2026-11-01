// The PDFs of «گزارشات جلسات» and «گزارشات کاربران»: the report of one meeting, and a list report.
// Drawn into off-screen A4 pages in the same framed look as the screen (boxes with borders, summary
// cards, a bordered table), with the organization's logo, the date and time of the printout and who
// printed it; then captured with the same helper as the activity report (html2canvas + jsPDF), so
// Persian text keeps the app's font and shaping.
import { pagesToPdf, saveBlob } from './reportExport';

/** Who the printout is for and when it was made: the header and footer of every PDF / print. */
export interface PrintInfo {
  /** The organization's logo (a data URL, as the branding keeps it). */
  logo: string;
  /** The organization's name (the system name), at the foot of every page. */
  orgName: string;
  /** «۱۴۰۵/۰۸/۱۱ — ساعت ۱۰:۳۰» */
  printedAtText: string;
  /** The person who prints (their name); empty when unknown. */
  printedBy: string;
}

export interface MeetingReportData {
  title: string;
  typeLabel: string;
  dateText: string;
  timeText: string;
  location: string;
  organizer: string;
  description: string;
  participants: string[];
  agenda: { title: string; durationText: string; presenter: string }[];
  minutes: string;
  tasks: { title: string; statusText: string; dueText: string }[];
  print: PrintInfo;
}

// Plain hex colours and inline styles only: html2canvas cannot read Tailwind's oklch() colours.
/** Long text sits flush on both sides, so a printed page looks tidy (the last line stays at the start). */
const JUSTIFY = 'text-align:justify;text-justify:inter-word;';
const C = { ink: '#0f172a', muted: '#64748b', line: '#cbd5e1', soft: '#e2e8f0', head: '#3730a3', headSoft: '#eef2ff', zebra: '#f8fafc', card: '#f1f5f9' };
const PAGE_W = 794, PAGE_H = 1123, PAD = 40;

const el = (tag: string, css: string, text?: string): HTMLElement => {
  const node = document.createElement(tag);
  node.style.cssText = css;
  if (text !== undefined) node.textContent = text;
  return node;
};

const digits = (text: string) => text.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);

/** The top of every report: logo and title on one side, the date of the printout and the person on the other, in a frame. */
function headerBlock(title: string, subtitle: string, print: PrintInfo): HTMLElement {
  const box = el('div', `border:1.5px solid ${C.head};border-radius:12px;padding:12px 16px;margin-bottom:12px;display:flex;align-items:center;justify-content:space-between;gap:16px;background:${C.headSoft}`);
  const right = el('div', 'display:flex;align-items:center;gap:12px;min-width:0;flex:1');
  if (print.logo) {
    const img = el('img', 'width:46px;height:46px;object-fit:contain;flex:none;background:#ffffff;border-radius:8px;padding:3px;border:1px solid ' + C.soft) as HTMLImageElement;
    img.src = print.logo;
    img.alt = '';
    right.append(img);
  }

  const names = el('div', 'min-width:0;flex:1');
  names.append(el('div', `font-size:11px;color:${C.muted}`, print.orgName), el('div', `font-size:20px;font-weight:800;color:${C.head};margin-top:2px`, title));
  if (subtitle) names.append(el('div', `font-size:11px;color:${C.muted};margin-top:3px;${JUSTIFY}`, subtitle));
  right.append(names);

  const left = el('div', `font-size:11px;line-height:1.9;color:${C.ink};text-align:left;flex:none`);
  left.append(el('div', '', `تاریخ چاپ: ${print.printedAtText}`));
  if (print.printedBy) left.append(el('div', '', `چاپ‌کننده: ${print.printedBy}`));
  box.append(right, left);
  return box;
}

/** A section in a frame: a heading band over a bordered body. */
const section = (heading: string, body: HTMLElement): HTMLElement => {
  const box = el('div', `border:1px solid ${C.line};border-radius:10px;overflow:hidden;margin-bottom:12px`);
  box.append(el('div', `background:${C.head};color:#ffffff;font-size:13px;font-weight:700;padding:4px 12px 8px`, heading));
  body.style.padding = '10px 12px';
  box.append(body);
  return box;
};

const row = (label: string, value: string) => {
  const line = el('div', `display:flex;gap:8px;padding:5px 0;font-size:13px;border-bottom:1px dashed ${C.soft}`);
  line.append(el('span', `width:110px;flex:none;color:${C.muted}`, label), el('span', `color:${C.ink};flex:1;${JUSTIFY}`, value || '—'));
  return line;
};

/** A bordered table: every cell has its frame, the heading row is filled, rows alternate. */
const table = (head: string[], widths: string[], rows: string[][], fontSize = 12) => {
  const t = el('table', `width:100%;border-collapse:collapse;font-size:${fontSize}px;table-layout:fixed;border:1px solid ${C.line}`) as HTMLTableElement;
  const addRow = (cells: string[], header: boolean, index: number) => {
    const tr = el('tr', header ? `background:${C.head}` : index % 2 ? `background:${C.zebra}` : '');
    cells.forEach((text, i) => {
      tr.append(el(header ? 'th' : 'td', `padding:${header ? (fontSize < 12 ? 4 : 5) : (fontSize < 12 ? 5 : 6)}px ${fontSize < 12 ? 4 : 7}px ${header ? (fontSize < 12 ? 8 : 9) : (fontSize < 12 ? 5 : 6)}px;${header ? 'text-align:right;' : JUSTIFY}vertical-align:top;border:1px solid ${C.line};width:${widths[i]};word-break:break-word;${header ? 'color:#ffffff;font-weight:700' : `color:${C.ink}`}`, text));
    });
    t.append(tr);
  };
  addRow(head, true, 0);
  rows.forEach((cells, i) => addRow(cells, false, i));
  return t;
};

/** Blocks of one meeting's report in reading order; each is kept whole on one page where it fits. */
function buildBlocks(data: MeetingReportData): HTMLElement[] {
  const blocks: HTMLElement[] = [headerBlock('گزارش جلسه', data.title, data.print)];

  const details = el('div', '');
  details.append(row('نوع', data.typeLabel), row('تاریخ', data.dateText), row('ساعت', data.timeText), row('مکان', data.location), row('برگزارکننده', data.organizer));
  if (data.description.trim()) details.append(row('توضیحات', data.description));
  blocks.push(section('مشخصات جلسه', details));

  blocks.push(section(`افراد مرتبط (${digits(String(data.participants.length))})`, el('div', `font-size:13px;line-height:1.9;color:${C.ink};${JUSTIFY}`, data.participants.join('، ') || 'فردی ثبت نشده است.')));

  blocks.push(section(`دستور جلسه (${digits(String(data.agenda.length))})`, data.agenda.length
    ? table(['ردیف', 'عنوان', 'مدت', 'ارائه‌دهنده'], ['8%', '50%', '16%', '26%'], data.agenda.map((a, i) => [digits(String(i + 1)), a.title, a.durationText, a.presenter || '—']))
    : el('div', `font-size:13px;color:${C.muted}`, 'بندی برای دستور جلسه ثبت نشده است.')));

  // Long minutes are split by paragraph so they can flow onto the next page.
  const minutesParts = data.minutes.trim() ? data.minutes.trim().split(/\n+/) : [];
  if (minutesParts.length) {
    minutesParts.forEach((part, i) => {
      const p = el('div', `font-size:13px;line-height:1.9;color:${C.ink};${JUSTIFY}${i === 0 ? '' : `border:1px solid ${C.line};border-radius:10px;padding:8px 12px;margin-bottom:8px`}`, part);
      blocks.push(i === 0 ? section('مصوبات صورت‌جلسه', p) : p);
    });
  }

  blocks.push(section(`وظایف مرتبط (${digits(String(data.tasks.length))})`, data.tasks.length
    ? table(['ردیف', 'عنوان', 'وضعیت', 'موعد'], ['8%', '52%', '18%', '22%'], data.tasks.map((t, i) => [digits(String(i + 1)), t.title, t.statusText, t.dueText || '—']))
    : el('div', `font-size:13px;color:${C.muted}`, 'وظیفه‌ای به این جلسه وصل نشده است.')));
  return blocks;
}

/** Lays the blocks out on A4 pages (a block that does not fit goes to the next page) and makes the PDF. */
async function blocksToPdf(blocks: HTMLElement[], orgName: string, onProgress?: (done: number, total: number) => void): Promise<Blob> {
  const root = el('div', 'position:fixed;top:0;left:-20000px;z-index:-1');
  root.className = 'report-print-root';
  document.body.appendChild(root);
  try {
    const pages: HTMLElement[] = [];
    const newPage = () => {
      const page = el('div', `width:${PAGE_W}px;height:${PAGE_H}px;box-sizing:border-box;padding:${PAD}px;background:#ffffff;color:${C.ink};direction:rtl;overflow:hidden;position:relative;font-family:inherit;line-height:1.6`);
      page.className = 'report-page';
      const body = el('div', `height:${PAGE_H - PAD * 2 - 26}px;overflow:hidden`);
      const footer = el('div', `position:absolute;right:${PAD}px;left:${PAD}px;bottom:20px;font-size:11px;color:${C.muted};display:flex;justify-content:space-between;border-top:1px solid ${C.soft};padding-top:6px`);
      footer.append(el('span', '', orgName), el('span', ''));
      page.append(body, footer);
      root.append(page);
      pages.push(page);
      return body;
    };
    let body = newPage();
    for (const block of blocks) {
      body.append(block);
      if (body.scrollHeight > body.clientHeight && body.children.length > 1) {
        body.removeChild(block);
        body = newPage();
        body.append(block);
      }
    }
    pages.forEach((page, i) => { (page.lastElementChild!.lastElementChild as HTMLElement).textContent = digits(`صفحه ${i + 1} از ${pages.length}`); });
    return await pagesToPdf(pages, onProgress);
  } finally {
    root.remove();
  }
}

/** The report of one meeting as a PDF. */
export function meetingReportBlob(data: MeetingReportData): Promise<Blob> {
  return blocksToPdf(buildBlocks(data), data.print.orgName);
}

/** Builds the report pages, turns them into a PDF and downloads it. */
export async function downloadMeetingReport(data: MeetingReportData, fileName: string): Promise<void> {
  saveBlob(await meetingReportBlob(data), fileName);
}

export interface TableReportData {
  title: string;
  /** What the report covers («n جلسه از m جلسه»); under the title. */
  subtitle: string;
  /** The filters in words, shown in a box of their own. */
  filtersText: string;
  /** The cards of the screen (label and number), in a row. */
  summary: { label: string; value: string }[];
  /** The heading of the list, as on the screen. */
  listTitle: string;
  head: string[];
  /** Column widths, as percentages that add up to 100. */
  widths: string[];
  rows: string[][];
  print: PrintInfo;
  emptyText: string;
}

/**
 * Any report as a list, laid out like the screen: the header frame (logo, title, date and person),
 * the filters box, the summary cards, then the list in a framed, fully bordered table. Rows go on
 * the pages in small groups, each with its heading row, so a page break never splits a row.
 * Used by the meetings and the users reports.
 */
export function tableReportBlob(data: TableReportData, onProgress?: (done: number, total: number) => void): Promise<Blob> {
  const blocks: HTMLElement[] = [headerBlock(data.title, data.subtitle, data.print)];

  const filters = el('div', `border:1px solid ${C.line};border-radius:10px;padding:8px 12px;margin-bottom:12px;font-size:12px;line-height:1.8;background:${C.zebra}`);
  filters.append(el('span', `font-weight:700;color:${C.head}`, 'فیلترهای اعمال‌شده: '), el('span', `color:${C.ink}`, data.filtersText));
  blocks.push(filters);

  if (data.summary.length) {
    const cards = el('div', 'display:flex;gap:8px;margin-bottom:12px');
    data.summary.forEach((card) => {
      const box = el('div', `flex:1;border:1px solid ${C.line};border-radius:10px;padding:6px 10px;background:${C.card}`);
      box.append(el('div', `font-size:11px;color:${C.muted}`, card.label), el('div', `font-size:18px;font-weight:800;color:${C.head}`, card.value));
      cards.append(box);
    });
    blocks.push(cards);
  }

  blocks.push(el('div', `font-size:14px;font-weight:800;color:${C.ink};margin:2px 0 6px`, data.listTitle));
  const CHUNK = 6;
  for (let i = 0; i < data.rows.length; i += CHUNK) {
    blocks.push(table(data.head, data.widths, data.rows.slice(i, i + CHUNK), 10));
  }

  if (data.rows.length === 0) blocks.push(el('div', `font-size:13px;color:${C.muted};border:1px dashed ${C.line};border-radius:10px;padding:16px;text-align:center`, data.emptyText));
  return blocksToPdf(blocks, data.print.orgName, onProgress);
}
