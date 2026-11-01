import React, { useEffect, useRef, useState } from 'react';
import { FileDown, FileSpreadsheet, FilterX, Loader2, Printer } from 'lucide-react';
import { SecondaryButton } from '../admin/AdminUi';
import { pagesToPdf, printPdf, saveBlob } from '../../utils/reportExport';

/** The row of buttons every report has: clear the filters, Excel, PDF, print. */
export const ReportActions: React.FC<{
  hasFilters: boolean;
  onClear: () => void;
  canExport: boolean;
  onExcel: () => void;
  onPdf: () => void;
  onPrint: () => void;
  busy: 'pdf' | 'print' | null;
}> = ({ hasFilters, onClear, canExport, onExcel, onPdf, onPrint, busy }) => (
  <div className="flex flex-wrap items-center gap-2">
    {hasFilters && <SecondaryButton onClick={onClear}><FilterX className="w-4 h-4" /> پاک کردن فیلترها</SecondaryButton>}
    <SecondaryButton onClick={onExcel} disabled={!canExport || !!busy}><FileSpreadsheet className="w-4 h-4 text-emerald-600" /> دانلود Excel</SecondaryButton>
    <SecondaryButton onClick={onPdf} disabled={!canExport || !!busy}>
      {busy === 'pdf' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4 text-rose-600" />} دانلود PDF
    </SecondaryButton>
    <SecondaryButton onClick={onPrint} disabled={!canExport || !!busy}>
      {busy === 'print' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4 text-indigo-600" />} چاپ
    </SecondaryButton>
  </div>
);

/**
 * PDF and print of a list report: `build` makes the PDF (the same pages as the activity report);
 * print sends that PDF to the printer, so the browser adds no header or footer of its own.
 */
export function useListExport(build: (onProgress: (done: number, total: number) => void) => Promise<Blob>, fileName: string, onError: (message: string) => void) {
  const [busy, setBusy] = useState<'pdf' | 'print' | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const run = async (kind: 'pdf' | 'print') => {
    setBusy(kind);
    const label = kind === 'print' ? 'در حال آماده‌سازی چاپ' : 'در حال ساخت PDF';
    try {
      const blob = await build((done, total) => setProgress(`${label}: صفحه ${done} از ${total}`.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)])));
      if (kind === 'pdf') {
        saveBlob(blob, fileName);
      } else {
        try {
          await printPdf(blob);
        } catch (err) {
          console.error('Report PDF print failed:', err);
          onError('چاپ ممکن نشد. فایل PDF را دانلود و از آن چاپ بگیرید.');
        }
      }
    } catch (err) {
      console.error('Report PDF export failed:', err);
      onError(kind === 'print' ? 'آماده‌سازی چاپ ممکن نشد. لطفاً دوباره تلاش کنید.' : 'ساخت فایل PDF ممکن نشد. لطفاً دوباره تلاش کنید.');
    } finally {
      setBusy(null);
      setProgress(null);
    }
  };
  return { busy, progress, pdf: () => run('pdf'), print: () => run('print') };
}

/** The toast under the page while a PDF is being made. */
export const ProgressToast: React.FC<{ text: string | null }> = ({ text }) =>
  text ? (
    <div role="status" className="fixed bottom-24 lg:bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm shadow-xl">
      <Loader2 className="w-4 h-4 animate-spin" /> {text}
    </div>
  ) : null;

/** Goes back to the last valid page when rows disappeared. */
export function useClampedPage(total: number, pageSize: number) {
  const [page, setPage] = useState(1);
  const last = useRef(1);
  useEffect(() => {
    last.current = Math.max(1, Math.ceil(total / pageSize));
    if (page > last.current) setPage(last.current);
  }, [total, page, pageSize]);
  return [page, setPage] as const;
}
