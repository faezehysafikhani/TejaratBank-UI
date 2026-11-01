import React from 'react';
import { createPortal } from 'react-dom';
import { STATUSES } from '../types';
import { toPersianDigits } from '../utils/helpers';
import { REPORT_TYPE_TITLES, TaskReportRow, TaskReportSummary } from '../services/taskReportApi';
import { useBranding } from '../utils/branding';

/** Rows on the first page (under the title) and on each following page. */
const FIRST_PAGE_ROWS = 28;
const PAGE_ROWS = 31;

/** A history line under a row is this much of a row's height (20px of 30px). */
const HISTORY_LINE = 0.67;

// Plain hex colours and inline styles only: html2canvas (PDF) cannot read Tailwind's oklch()
// colours, and print must look the same in dark mode.
const C = { ink: '#0f172a', muted: '#64748b', line: '#e2e8f0', head: '#3730a3', zebra: '#f8fafc', red: '#be123c' };

export type PrintableRow = TaskReportRow & {
  dueDateText: string;
  completedText: string;
  /** Under the row: who was on the task when, with their position then (empty: nothing to add). */
  historyLines: string[];
};

/**
 * Long text is shortened here, not with CSS text-overflow: html2canvas draws an ellipsis over
 * right-to-left text as overlapping glyphs in the PDF.
 */
const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

const COLUMNS: { title: string; width: string; value: (r: PrintableRow, i: number) => React.ReactNode }[] = [
  { title: 'ردیف', width: '5%', value: (_r, i) => toPersianDigits(i + 1) },
  { title: 'عنوان', width: '20%', value: (r) => clip(r.title, 30) },
  { title: 'نوع', width: '7%', value: (r) => REPORT_TYPE_TITLES[r.type] },
  { title: 'وضعیت', width: '9%', value: (r) => STATUSES[r.status]?.title || r.status },
  { title: 'مسئول', width: '17%', value: (r) => clip(r.responsible.map((p) => (p.positionTitle ? `${p.displayName} (${p.positionTitle})` : p.displayName)).join('، '), 26) || '—' },
  { title: 'ایجادکننده', width: '11%', value: (r) => clip(r.owner?.displayName || '—', 14) },
  { title: 'موعد انجام', width: '9%', value: (r) => r.dueDateText },
  { title: 'تکمیل', width: '9%', value: (r) => r.completedText || '—' },
  { title: 'برچسب‌ها', width: '13%', value: (r) => clip(r.tags.join('، '), 16) || '—' },
];

const cell: React.CSSProperties = {
  padding: '0 4px', height: 30, lineHeight: '30px', verticalAlign: 'middle', borderBottom: `1px solid ${C.line}`, overflow: 'hidden', whiteSpace: 'nowrap', textAlign: 'right',
};

/**
 * The report as A4 portrait pages, rendered off screen into document.body. Printing shows only
 * these pages (see `.report-print-root` in index.css); the PDF export captures each page.
 */
export const ReportPrintPages: React.FC<{
  rows: PrintableRow[];
  summary: TaskReportSummary;
  scopeText: string;
  filtersText: string;
  generatedText: string;
}> = ({ rows, scopeText, filtersText, generatedText }) => {
  const brand = useBranding();
  // Rows fill each page by height: a row and its history lines stay together.
  const pages: PrintableRow[][] = [[]];
  let used = 0;
  for (const row of rows) {
    const height = 1 + row.historyLines.length * HISTORY_LINE;
    const room = pages.length === 1 ? FIRST_PAGE_ROWS : PAGE_ROWS;
    if (used + height > room && pages[pages.length - 1].length > 0) {
      pages.push([]);
      used = 0;
    }
    pages[pages.length - 1].push(row);
    used += height;
  }
  const offsets = pages.map((_, p) => pages.slice(0, p).reduce((n, page) => n + page.length, 0));

  return createPortal(
    <div className="report-print-root" dir="rtl" aria-hidden="true" style={{ fontFamily: "'Vazirmatn Variable', Tahoma, sans-serif", color: C.ink, background: '#ffffff' }}>
      {pages.map((pageRows, p) => (
        <div
          key={p}
          className="report-page"
          style={{ width: '210mm', height: '297mm', padding: '10mm', boxSizing: 'border-box', background: '#ffffff', color: C.ink, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        >
          {p === 0 ? (
            <div style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: `2px solid ${C.head}`, paddingBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <img src={brand.logo} alt="" style={{ width: 34, height: 34, objectFit: 'contain' }} />
                  <div style={{ fontSize: 20, fontWeight: 800, color: C.head }}>گزارش فعالیت‌ها</div>
                </div>
                <div style={{ fontSize: 11, color: C.muted }}>{generatedText}</div>
              </div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>{scopeText}</div>
              <div style={{ fontSize: 11, color: C.ink, marginTop: 2 }}>فیلترها: {filtersText}</div>
            </div>
          ) : (
            <div style={{ fontSize: 11, fontWeight: 700, color: C.head, marginBottom: 6 }}>گزارش فعالیت‌ها (ادامه)</div>
          )}

          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', fontSize: 9 }}>
            <colgroup>{COLUMNS.map((c) => <col key={c.title} style={{ width: c.width }} />)}</colgroup>
            <thead>
              <tr>
                {COLUMNS.map((c) => (
                  <th key={c.title} style={{ ...cell, height: 28, lineHeight: '28px', background: C.head, color: '#ffffff', fontWeight: 700, borderBottom: 'none' }}>{c.title}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r, i) => (
                <React.Fragment key={r.id}>
                  <tr style={{ background: i % 2 ? C.zebra : '#ffffff' }}>
                    {COLUMNS.map((c) => (
                      <td key={c.title} style={{ ...cell, color: c.title === 'موعد انجام' && r.isOverdue ? C.red : C.ink, fontWeight: c.title === 'عنوان' ? 700 : 400 }}>
                        {c.value(r, offsets[p] + i)}
                      </td>
                    ))}
                  </tr>
                  {r.historyLines.map((line, k) => (
                    <tr key={k} style={{ background: i % 2 ? C.zebra : '#ffffff' }}>
                      <td />
                      <td colSpan={COLUMNS.length - 1} style={{ ...cell, height: 20, lineHeight: '20px', fontSize: 9, color: C.muted }}>
                        {k === 0 ? 'سابقه: ' : '\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0'}{clip(line, 110)}
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
          {pageRows.length === 0 && <div style={{ textAlign: 'center', padding: 30, color: C.muted, fontSize: 12 }}>فعالیتی با این فیلترها پیدا نشد.</div>}

          <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', fontSize: 9, color: C.muted, paddingTop: 6 }}>
            <span>{brand.customName || 'سامانه مدیریت وظایف'}</span>
            <span>صفحه {toPersianDigits(p + 1)} از {toPersianDigits(pages.length)}</span>
          </div>
        </div>
      ))}
    </div>,
    document.body,
  );
};
