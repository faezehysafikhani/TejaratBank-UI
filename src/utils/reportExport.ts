// Exports of «گزارش فعالیت‌ها»: a real .xlsx workbook (built here, zipped with fflate - no
// spreadsheet library, nothing fetched), and a PDF made from the printable pages
// (ReportPrintPages) with html2canvas + jsPDF, so Persian text keeps the app's own font and shaping.
import { zipSync, strToU8 } from 'fflate';
import { showToast } from './toast';
import { getCurrentJalali } from './jalali';

/** One sheet: header row (bold), then rows; the sheet reads right to left. */
export function buildXlsx(sheetName: string, header: string[], rows: (string | number)[][], columnWidths: number[], titleLines: string[] = []): Blob {
  const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    // characters XML 1.0 does not allow
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  const col = (i: number) => { let s = ''; for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
  const cell = (value: string | number, r: number, c: number, style: number) => typeof value === 'number'
    ? `<c r="${col(c)}${r}" s="${style}"><v>${value}</v></c>`
    : `<c r="${col(c)}${r}" t="inlineStr" s="${style}"><is><t xml:space="preserve">${esc(value)}</t></is></c>`;
  // Lines above the table (title, organization, date of the printout, who made it, the filters): one cell each, in bold.
  const top = titleLines.length ? titleLines.length + 1 : 0;
  const titleRows = titleLines.map((line, i) => `<row r="${i + 1}">${cell(line, i + 1, 0, 3)}</row>`).join('');
  const sheetRows = titleRows + [header, ...rows].map((row, i) => `<row r="${top + i + 1}">${row.map((v, c) => cell(v, top + i + 1, c, i === 0 ? 1 : 2)).join('')}</row>`).join('');

  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'),
    '_rels/.rels': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
    'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets><sheet name="${esc(sheetName.slice(0, 31))}" sheetId="1" r:id="rId1"/></sheets></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'),
    'xl/styles.xml': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="11"/><name val="Tahoma"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Tahoma"/></font><font><b/><sz val="12"/><name val="Tahoma"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF3730A3"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border/><border><left style="thin"><color rgb="FFD4D4D8"/></left><right style="thin"><color rgb="FFD4D4D8"/></right><top style="thin"><color rgb="FFD4D4D8"/></top><bottom style="thin"><color rgb="FFD4D4D8"/></bottom></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'),
    'xl/worksheets/sheet1.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView rightToLeft="1" workbookViewId="0"><pane ySplit="${top + 1}" topLeftCell="A${top + 2}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${columnWidths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${sheetRows}</sheetData><autoFilter ref="A${top + 1}:${col(header.length - 1)}${top + rows.length + 1}"/></worksheet>`),
  };
  return new Blob([zipSync(files)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/** Today's Jalali date for file names: 1405-07-21. */
export function jalaliStamp(): string {
  const now = getCurrentJalali();
  return `${now.jy}-${String(now.jm).padStart(2, '0')}-${String(now.jd).padStart(2, '0')}`;
}

/** Saves a blob. ASCII names on purpose: browsers reject some Persian file names (e.g. with a zero-width non-joiner). */
export function saveBlob(blob: Blob, fileName: string): void {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  // Attached while clicked: a detached link's file name is ignored by some browsers.
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  showToast(`فایل «${fileName}» آماده شد و دانلود شروع شد`, 'ok');
}

/**
 * One PDF page (A4 portrait) per element, captured as an image so Persian text is shaped and
 * drawn by the browser in the app's font. `onProgress(done, total)` reports each page.
 */
export async function pagesToPdf(pages: HTMLElement[], onProgress?: (done: number, total: number) => void): Promise<Blob> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);
  if (document.fonts?.ready) await document.fonts.ready;
  // Images (the logo) must be loaded before a page is captured.
  await Promise.all(pages.flatMap((page) => Array.from(page.querySelectorAll('img'))).map((img) =>
    img.complete ? Promise.resolve() : new Promise<void>((resolve) => { img.onload = img.onerror = () => resolve(); })));
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  // html2canvas reads the background of <html> and <body> in its copy of the document, and cannot
  // parse the oklch() colours Tailwind gives them (bg-slate-50, dark mode) - it throws. The copy
  // is made plain white here; the pages themselves use hex colours only.
  const onclone = (copy: Document) => {
    for (const el of [copy.documentElement, copy.body]) {
      el.removeAttribute('class');
      el.style.setProperty('background', '#ffffff', 'important');
      el.style.setProperty('color', '#0f172a', 'important');
    }
    for (const child of Array.from(copy.body.children)) {
      if (!child.classList.contains('report-print-root')) child.remove();
    }
  };
  for (let i = 0; i < pages.length; i++) {
    const canvas = await html2canvas(pages[i], { scale: 2, backgroundColor: '#ffffff', logging: false, useCORS: true, onclone });
    if (i > 0) pdf.addPage('a4', 'portrait');
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.88), 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
    onProgress?.(i + 1, pages.length);
    // Let the page repaint (progress) between pages.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return pdf.output('blob');
}

const PRINT_FRAME_ID = 'report-print-frame';

/**
 * Prints a PDF from a hidden frame. Browsers add no header or footer (address, page numbers)
 * to a printed PDF. The frame stays until the next print: removing it while the print dialog
 * is open would close the dialog.
 */
export function printPdf(blob: Blob): Promise<void> {
  const previous = document.getElementById(PRINT_FRAME_ID) as HTMLIFrameElement | null;
  if (previous) { URL.revokeObjectURL(previous.src); previous.remove(); }
  // Without a built-in PDF viewer the frame would download the file instead.
  if (navigator.pdfViewerEnabled === false) return Promise.reject(new Error('The browser has no PDF viewer.'));
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe');
    frame.id = PRINT_FRAME_ID;
    frame.title = 'print';
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;bottom:0;right:0;width:0;height:0;border:0;visibility:hidden';
    frame.onload = () => {
      try {
        frame.contentWindow!.focus();
        frame.contentWindow!.print();
        resolve();
      } catch (err) {
        reject(err);
      }
    };
    frame.src = URL.createObjectURL(blob);
    document.body.appendChild(frame);
  });
}
