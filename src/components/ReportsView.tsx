import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, FileSpreadsheet, FileDown, Printer, Eye, FilterX, Loader2, Repeat, FolderKanban, AlertCircle, Tag, ListChecks, Clock, Play, Pause, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Task, TaskStatus, STATUSES, PRIORITIES } from '../types';
import { AdminCard, AdminDialog, Field, Notice, Pagination, SecondaryButton, StatusBadge, inputClass } from './admin/AdminUi';
import { toPersianDigits } from '../utils/helpers';
import { gregorianToJalali, getCurrentJalali } from '../utils/jalali';
import { JalaliDatePicker } from './JalaliDatePicker';
import { PrintableRow, ReportPrintPages } from './ReportPrintPages';
import { buildXlsx, jalaliStamp, pagesToPdf, printPdf, saveBlob } from '../utils/reportExport';
import { userErrorMessage } from '../utils/errorMessages';
import {
  REPORT_TYPE_TITLES, ReportPeriod, ReportPersonRole, ReportScope, ReportTaskType, TaskReport, TaskReportFilters, TaskReportRow, getTaskReport,
} from '../services/taskReportApi';

const PAGE_SIZE = 25;
const STATUS_KEYS: TaskStatus[] = ['todo', 'in_progress', 'paused', 'completed'];
const RELATION_TITLES = { self: 'خودم', direct: 'زیردست مستقیم', indirect: 'زیرمجموعه', all: '' } as const;

/** A Gregorian yyyy-MM-dd as a Jalali date (۱۴۰۵/۰۷/۲۰). */
function jalaliDate(isoDate: string | null | undefined): string {
  if (!isoDate) return '';
  const [gy, gm, gd] = isoDate.slice(0, 10).split('-').map(Number);
  if (!gy || !gm || !gd) return '';
  const { jy, jm, jd } = gregorianToJalali(gy, gm, gd);
  return toPersianDigits(`${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`);
}

/** The Iran-calendar day (UTC+03:30) of a UTC timestamp, as yyyy-MM-dd. */
const iranDay = (utc: string) => new Date(new Date(utc).getTime() + 3.5 * 3600 * 1000).toISOString().slice(0, 10);

const people = (list: TaskReportRow['responsible']) => list.map((p) => p.displayName).join('، ');

/** The Jalali day of a UTC timestamp. */
const dayOf = (utc: string) => jalaliDate(iranDay(utc));

/** «از ۱۴۰۵/۰۸/۰۱ تا ۱۴۰۵/۰۸/۱۰» - or «تا کنون» while still on the task. */
const spanText = (p: ReportPeriod) => `از ${dayOf(p.fromUtc)} تا ${p.toUtc ? dayOf(p.toUtc) : 'کنون'}`;

/** «جانشین کارشناس · کد ۷»: the vacant post a stand-in stood in for. */
const actingText = (p: ReportPeriod) => `جانشین ${p.postTitle}${p.postCode ? ` · کد ${toPersianDigits(p.postCode)}` : ''}`;

/** One period in words: «مهدی (کارشناس) — جانشین کارشناس · کد ۷ — از ... تا ...». */
const periodLine = (p: ReportPeriod) =>
  `${p.displayName}${p.positionTitle ? ` (${p.positionTitle})` : ''}${p.role === 'acting' ? ` — ${actingText(p)}` : ''} — ${spanText(p)}`;

/** The periods of those who worked on the task: responsible and stand-ins (not its creator). */
const workPeriods = (r: TaskReportRow) => (r.history || []).filter((p) => p.role !== 'creator');
const creatorPeriods = (r: TaskReportRow) => (r.history || []).filter((p) => p.role === 'creator');

/** Responsible people now with no period kept for them (tasks given to people): shown as they are. */
const responsibleWithoutHistory = (r: TaskReportRow) => {
  const periods = workPeriods(r);
  return r.responsible.filter((p) => !periods.some((w) => w.userId === p.userId));
};

/** Who worked on the task when, each with their position then (screen table). */
const WorkHistory: React.FC<{ row: TaskReportRow }> = ({ row }) => {
  const periods = workPeriods(row);
  const others = responsibleWithoutHistory(row);
  if (periods.length === 0 && others.length === 0) return <>—</>;
  return (
    <div className="space-y-1">
      {periods.map((p, i) => (
        <div key={`${p.userId}-${p.fromUtc}-${i}`} className={p.toUtc ? 'text-slate-500' : ''}>
          <div className="whitespace-nowrap">
            <b className={p.toUtc ? 'font-bold text-slate-600 dark:text-slate-300' : ''}>{p.displayName}</b>
            {p.positionTitle && <span className="text-slate-500"> — {p.positionTitle}</span>}
            {p.role === 'acting' && <span className="mr-1 inline-flex px-1.5 rounded-full text-[9px] font-bold bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800">{actingText(p)}</span>}
          </div>
          <div className="text-[10px] text-slate-400 whitespace-nowrap">{spanText(p)}</div>
        </div>
      ))}
      {others.map((p) => (
        <div key={p.userId} className="whitespace-nowrap"><b>{p.displayName}</b>{p.positionTitle && <span className="text-slate-500"> — {p.positionTitle}</span>}</div>
      ))}
    </div>
  );
};

/**
 * A titled group of several controls. Not a <label> like Field: a label forwards clicks to its
 * first control, so clearing the date (whose button then disappears) would set it again.
 */
const FieldGroup: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
  <div role="group" aria-label={label}>
    <span className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">{label}</span>
    {children}
    {hint && <span className="block text-[11px] text-slate-500 dark:text-slate-400 mt-1">{hint}</span>}
  </div>
);

type CardTheme = 'indigo' | 'slate' | 'blue' | 'amber' | 'emerald' | 'rose';

const CARD_THEMES: Record<CardTheme, { box: string; value: string; icon: string }> = {
  indigo: { box: 'bg-indigo-50 border-indigo-200 dark:bg-indigo-950/40 dark:border-indigo-900', value: 'text-indigo-700 dark:text-indigo-300', icon: 'text-indigo-400 dark:text-indigo-500' },
  slate: { box: 'bg-slate-50 border-slate-200 dark:bg-slate-800/60 dark:border-slate-700', value: 'text-slate-700 dark:text-slate-200', icon: 'text-slate-400 dark:text-slate-500' },
  blue: { box: 'bg-sky-50 border-sky-200 dark:bg-sky-950/40 dark:border-sky-900', value: 'text-sky-700 dark:text-sky-300', icon: 'text-sky-400 dark:text-sky-500' },
  amber: { box: 'bg-amber-50 border-amber-200 dark:bg-amber-950/40 dark:border-amber-900', value: 'text-amber-700 dark:text-amber-300', icon: 'text-amber-400 dark:text-amber-500' },
  emerald: { box: 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-900', value: 'text-emerald-700 dark:text-emerald-300', icon: 'text-emerald-400 dark:text-emerald-500' },
  rose: { box: 'bg-rose-50 border-rose-200 dark:bg-rose-950/40 dark:border-rose-900', value: 'text-rose-700 dark:text-rose-300', icon: 'text-rose-400 dark:text-rose-500' },
};

const SummaryCard: React.FC<{
  label: string; value: number; theme: CardTheme; icon: React.ElementType; active?: boolean; onClick?: () => void;
}> = ({ label, value, theme, icon: Icon, active, onClick }) => {
  const t = CARD_THEMES[theme];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`relative w-full lg:w-[68%] text-right px-2.5 py-1.5 rounded-lg border transition-all ${t.box} ${onClick ? 'cursor-pointer hover:shadow-md' : 'cursor-default'} ${
        active ? 'ring-[3px] ring-indigo-500 shadow-lg shadow-indigo-500/25 -translate-y-0.5' : ''
      }`}
    >
      {active && <span className="absolute -top-2 left-2 text-[10px] font-bold bg-indigo-600 text-white rounded-full px-2 py-px">فیلتر فعال</span>}
      <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">{label}</div>
      <div className={`text-lg font-black leading-tight ${t.value}`}>{toPersianDigits(value)}</div>
      <Icon className={`absolute bottom-1 left-1.5 w-3.5 h-3.5 ${t.icon}`} aria-hidden="true" />
    </button>
  );
};

/** The report as an .xlsx workbook (right to left, header row frozen, auto-filter). */
function exportExcel(rows: TaskReportRow[]) {
  const header = ['ردیف', 'عنوان', 'نوع', 'وضعیت', 'اولویت', 'مسئول', 'سمت مسئول', 'سابقه مسئولیت (سمت در همان زمان)', 'ایجادکننده', 'موعد انجام', 'عقب‌افتاده', 'تاریخ تکمیل', 'برچسب‌ها', 'شرح'];
  const data = rows.map((r, i) => [
    i + 1,
    r.title,
    REPORT_TYPE_TITLES[r.type],
    STATUSES[r.status]?.title || r.status,
    PRIORITIES[r.priority]?.title || r.priority,
    people(r.responsible),
    r.responsible.map((p) => p.positionTitle).filter(Boolean).join('، '),
    workPeriods(r).map(periodLine).join('\n'),
    creatorPeriods(r).length > 1 ? creatorPeriods(r).map(periodLine).join('\n') : r.owner?.displayName || '',
    jalaliDate(r.dueDate),
    r.isOverdue ? 'بله' : '',
    r.completedAtUtc ? jalaliDate(iranDay(r.completedAtUtc)) : '',
    r.tags.join('، '),
    r.description || '',
  ]);
  saveBlob(buildXlsx('گزارش فعالیت‌ها', header, data, [6, 40, 11, 12, 9, 30, 20, 60, 18, 13, 10, 13, 22, 45]), `task-report-${jalaliStamp()}.xlsx`);
}

/** Read-only view of a task that is in the report only as the manager of its people. */
const ReportTaskDialog: React.FC<{ row: TaskReportRow; onClose: () => void }> = ({ row, onClose }) => (
  <AdminDialog title={row.title} onClose={onClose} footer={<SecondaryButton onClick={onClose}>بستن</SecondaryButton>}>
    <Notice type="info">این فعالیت چون مربوط به زیرمجموعه شماست، یا خودتان پیش‌تر روی آن بوده‌اید، در گزارش آمده است؛ برای ویرایش یا گفتگو باید اکنون عضو آن باشید.</Notice>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
      <div><span className="text-slate-500">وضعیت: </span><b>{STATUSES[row.status]?.title}</b></div>
      <div><span className="text-slate-500">نوع: </span><b>{REPORT_TYPE_TITLES[row.type]}</b></div>
      <div><span className="text-slate-500">مسئول: </span><b>{people(row.responsible) || '—'}</b></div>
      <div><span className="text-slate-500">ایجادکننده: </span><b>{row.owner?.displayName || '—'}</b></div>
      <div><span className="text-slate-500">موعد انجام: </span><b className={row.isOverdue ? 'text-rose-600' : ''}>{jalaliDate(row.dueDate)}</b></div>
      {row.completedAtUtc && <div><span className="text-slate-500">تاریخ تکمیل: </span><b>{jalaliDate(iranDay(row.completedAtUtc))}</b></div>}
    </div>
    {(row.history?.length ?? 0) > 0 && (
      <div className="space-y-1.5">
        <h4 className="text-xs font-extrabold text-slate-700 dark:text-slate-200">سابقه افراد روی این فعالیت (با سمت هر نفر در همان زمان)</h4>
        <ul className="space-y-1 text-xs text-slate-700 dark:text-slate-300">
          {row.history!.map((p, i) => (
            <li key={`${p.userId}-${p.fromUtc}-${i}`} className="rounded-lg bg-slate-50 dark:bg-slate-800/60 px-2.5 py-1.5">
              <b>{p.displayName}</b>{p.positionTitle && ` — ${p.positionTitle}`}
              <span className="text-slate-500"> · {p.role === 'creator' ? 'ایجادکننده' : p.role === 'acting' ? actingText(p) : 'مسئول'}</span>
              {p.place && <span className="text-slate-400"> · {p.place}</span>}
              <div className="text-[11px] text-slate-500">{spanText(p)}</div>
            </li>
          ))}
        </ul>
      </div>
    )}
    {row.description && <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-line bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3">{row.description}</p>}
    {row.tags.length > 0 && <div className="flex flex-wrap gap-1.5">{row.tags.map((t) => <StatusBadge key={t} tone="indigo">#{t}</StatusBadge>)}</div>}
  </AdminDialog>
);

/**
 * «گزارش فعالیت‌ها»: the user's tasks and every task of the people below them in the organization
 * structure (everyone's, for Tasks.ManageAll), filtered by person (as responsible or creator),
 * position, tag, type, status and due date.
 */
export const ReportsView: React.FC<{
  scope: ReportScope;
  visibleTasks: Task[];
  /** Raised by the app after a task changes: reloads the report without a loading flash. */
  refreshKey?: number;
  onOpenTask: (task: Task) => void;
  /** Name of the signed-in user, printed next to the date on the PDF / printout. */
  generatedBy?: string;
}> = ({ scope, visibleTasks, refreshKey = 0, onOpenTask, generatedBy }) => {
  const [filters, setFilters] = useState<TaskReportFilters>({ personRole: 'responsible' });
  const [report, setReport] = useState<TaskReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  // Overdue is not a status: it is applied to the loaded rows, on top of the other filters.
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [readOnly, setReadOnly] = useState<TaskReportRow | null>(null);
  // The cards count every status, so they come from the same filters without the status one.
  const [overview, setOverview] = useState<TaskReport['summary'] | null>(null);

  const lastFilters = useRef(filters);
  useEffect(() => {
    let alive = true;
    // A new filter shows the loading state and starts at page 1; a refresh after a task changed
    // keeps the screen and the page as they are.
    const filtersChanged = lastFilters.current !== filters;
    lastFilters.current = filters;
    if (filtersChanged) setLoading(true);
    setError(null);
    getTaskReport(filters)
      .then((result) => { if (alive) { setReport(result); if (filtersChanged) setPage(1); } })
      .catch((err) => alive && setError(userErrorMessage(err, 'دریافت گزارش ممکن نشد.')))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [filters, refreshKey]);

  useEffect(() => {
    if (!filters.status) { setOverview(null); return; }
    let alive = true;
    getTaskReport({ ...filters, status: undefined })
      .then((result) => { if (alive) setOverview(result.summary); })
      .catch(() => alive && setOverview(null));
    return () => { alive = false; };
  }, [filters.personId, filters.personRole, filters.positionId, filters.tag, filters.type, filters.dueFrom, filters.dueTo, filters.status, refreshKey]);

  const set = (patch: Partial<TaskReportFilters>) => setFilters((f) => ({ ...f, ...patch }));
  const hasFilters = !!(filters.personId || filters.positionId || filters.tag || filters.type || filters.status || filters.dueFrom || filters.dueTo || onlyOverdue);
  const [printJob, setPrintJob] = useState<null | 'print' | 'pdf'>(null);
  const [pdfProgress, setPdfProgress] = useState<string | null>(null);
  const byId = useMemo(() => new Map(visibleTasks.map((t) => [t.id, t])), [visibleTasks]);
  const rows = useMemo(() => (report?.rows || []).filter((r) => !onlyOverdue || r.isOverdue), [report, onlyOverdue]);
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  // If rows disappeared and the page no longer exists, go back to the last valid one.
  useEffect(() => {
    const lastPage = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    if (page > lastPage) setPage(lastPage);
  }, [rows.length, page]);
  const subordinates = scope.people.filter((p) => p.relation === 'direct' || p.relation === 'indirect').length;
  const scopeText = scope.seesAll
    ? 'همه فعالیت‌های سازمان'
    : subordinates > 0
      ? `فعالیت‌های شما و ${toPersianDigits(subordinates)} نفر از زیرمجموعه‌تان`
      : 'فعالیت‌های شما (زیرمجموعه‌ای برای شما ثبت نشده است)';

  /** The active filters in words, for the printed / PDF header. */
  const filtersText = (() => {
    const parts: string[] = [];
    const person = scope.people.find((p) => p.userId === filters.personId);
    const role = filters.personRole === 'creator' ? 'ایجادکننده' : 'مسئول';
    if (person) parts.push(`${role}: ${person.displayName}`);
    const position = scope.positions.find((p) => p.id === filters.positionId);
    if (position) parts.push(`سمت ${role}: ${position.title}`);
    if (filters.tag) parts.push(`برچسب: ${filters.tag}`);
    if (filters.type) parts.push(`نوع: ${REPORT_TYPE_TITLES[filters.type]}`);
    if (filters.status) parts.push(`وضعیت: ${STATUSES[filters.status].title}`);
    if (onlyOverdue) parts.push('فقط موعد گذشته‌ها');
    if (filters.dueFrom) parts.push(`موعد از ${jalaliDate(filters.dueFrom)}`);
    if (filters.dueTo) parts.push(`موعد تا ${jalaliDate(filters.dueTo)}`);
    return parts.length ? parts.join(' • ') : 'بدون فیلتر';
  })();

  const printableRows: PrintableRow[] = useMemo(() => rows.map((r) => ({
    ...r,
    dueDateText: jalaliDate(r.dueDate),
    completedText: r.completedAtUtc ? jalaliDate(iranDay(r.completedAtUtc)) : '',
    // Under the row, when more than one person was on it (or a stand-in): who, with their position then, and when.
    historyLines: workPeriods(r).length > 1 || workPeriods(r).some((p) => p.role === 'acting') ? workPeriods(r).map(periodLine) : [],
  })), [rows]);

  // Print and PDF render the printable pages first (off screen), then make a PDF of them. Print
  // prints that PDF: printing the web page itself would let the browser add its header and footer
  // (address, page number) whenever its print dialog has margins.
  useEffect(() => {
    if (!printJob) return;
    let cancelled = false;
    const run = async () => {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      if (document.fonts?.ready) await document.fonts.ready;
      if (cancelled) return;
      const label = printJob === 'print' ? 'در حال آماده‌سازی چاپ' : 'در حال ساخت PDF';
      try {
        const pages = Array.from(document.querySelectorAll<HTMLElement>('.report-print-root .report-page'));
        const blob = await pagesToPdf(pages, (done, total) => setPdfProgress(`${label}: صفحه ${toPersianDigits(done)} از ${toPersianDigits(total)}`));
        if (printJob === 'pdf') {
          saveBlob(blob, `task-report-${jalaliStamp()}.pdf`);
        } else {
          try {
            await printPdf(blob);
          } catch (err) {
            // No PDF printing in this browser: print the pages themselves.
            console.error('Report PDF print failed, printing the page instead:', err);
            window.print();
          }
        }
      } catch (err) {
        console.error('Report PDF export failed:', err);
        setError(printJob === 'print' ? 'آماده‌سازی چاپ ممکن نشد. لطفاً دوباره تلاش کنید.' : 'ساخت فایل PDF ممکن نشد. لطفاً دوباره تلاش کنید.');
      }
      if (!cancelled) { setPrintJob(null); setPdfProgress(null); }
    };
    run();
    return () => { cancelled = true; };
  }, [printJob]);

  const open = (row: TaskReportRow) => {
    const task = row.canOpen ? byId.get(row.id) : undefined;
    if (task) onOpenTask(task); else setReadOnly(row);
  };

  const s = filters.status ? overview ?? report?.summary : report?.summary;
  const th = 'px-3 py-2.5 text-right text-[11px] font-bold text-slate-500 dark:text-slate-400 whitespace-nowrap';
  const td = 'px-3 py-2.5 align-middle text-xs';

  return (
    <div className="w-full space-y-4" dir="rtl">
      <AdminCard className="p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-extrabold text-slate-900 dark:text-white">
              <BarChart3 className="w-6 h-6 text-indigo-600" /> گزارش فعالیت‌ها
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{scopeText}</p>
          </div>
          <div className="flex items-center gap-2">
            {hasFilters && (
              <SecondaryButton onClick={() => { setFilters({ personRole: 'responsible' }); setOnlyOverdue(false); }}><FilterX className="w-4 h-4" /> پاک کردن فیلترها</SecondaryButton>
            )}
            <SecondaryButton onClick={() => exportExcel(rows)} disabled={!report || loading || !!printJob || rows.length === 0}><FileSpreadsheet className="w-4 h-4 text-emerald-600" /> دانلود Excel</SecondaryButton>
            <SecondaryButton onClick={() => setPrintJob('pdf')} disabled={!report || loading || !!printJob}>
              {printJob === 'pdf' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4 text-rose-600" />} دانلود PDF
            </SecondaryButton>
            <SecondaryButton onClick={() => setPrintJob('print')} disabled={!report || loading || !!printJob}>
              {printJob === 'print' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4 text-indigo-600" />} چاپ
            </SecondaryButton>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Field label="فرد">
            <select className={inputClass} value={filters.personId || ''} onChange={(e) => set({ personId: e.target.value || undefined })}>
              <option value="">همه افراد</option>
              {scope.people.map((p) => (
                <option key={p.userId} value={p.userId}>
                  {p.displayName}{p.positionTitle ? ` — ${p.positionTitle}` : ''}{RELATION_TITLES[p.relation] ? ` (${RELATION_TITLES[p.relation]})` : ''}
                </option>
              ))}
            </select>
          </Field>
          <FieldGroup label="نقش فرد در فعالیت" hint="برای فیلتر فرد و سمت">
            <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl" role="radiogroup">
              {([['responsible', 'مسئول'], ['creator', 'ایجادکننده']] as [ReportPersonRole, string][]).map(([id, label]) => (
                <button key={id} type="button" role="radio" aria-checked={filters.personRole === id} onClick={() => set({ personRole: id })}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${filters.personRole === id ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 shadow-sm' : 'text-slate-500'}`}>
                  {label}
                </button>
              ))}
            </div>
          </FieldGroup>
          <Field label="سمت">
            <select className={inputClass} value={filters.positionId || ''} onChange={(e) => set({ positionId: e.target.value || undefined })}>
              <option value="">همه سمت‌ها</option>
              {scope.positions.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </Field>
          <Field label="برچسب">
            <select className={inputClass} value={filters.tag || ''} onChange={(e) => set({ tag: e.target.value || undefined })}>
              <option value="">همه برچسب‌ها</option>
              {scope.tags.map((t) => <option key={t} value={t}>#{t}</option>)}
            </select>
          </Field>
          <Field label="نوع فعالیت">
            <select className={inputClass} value={filters.type || ''} onChange={(e) => set({ type: (e.target.value || undefined) as ReportTaskType | undefined })}>
              <option value="">همه انواع</option>
              {(Object.keys(REPORT_TYPE_TITLES) as ReportTaskType[]).map((t) => <option key={t} value={t}>{REPORT_TYPE_TITLES[t]}</option>)}
            </select>
          </Field>
          <Field label="وضعیت">
            <select
              className={inputClass}
              value={onlyOverdue ? 'overdue' : filters.status || ''}
              onChange={(e) => {
                const v = e.target.value;
                setOnlyOverdue(v === 'overdue');
                set({ status: (v && v !== 'overdue' ? v : undefined) as TaskStatus | undefined });
                setPage(1);
              }}
            >
              <option value="">همه وضعیت‌ها</option>
              {STATUS_KEYS.map((st) => <option key={st} value={st}>{STATUSES[st].title}</option>)}
              <option value="overdue">موعد گذشته</option>
            </select>
          </Field>
          <FieldGroup label="موعد انجام از">
            <JalaliDatePicker ariaLabel="موعد انجام از" value={filters.dueFrom} onChange={(dueFrom) => set({ dueFrom })} />
          </FieldGroup>
          <FieldGroup label="موعد انجام تا">
            <JalaliDatePicker ariaLabel="موعد انجام تا" value={filters.dueTo} onChange={(dueTo) => set({ dueTo })} />
          </FieldGroup>
        </div>
      </AdminCard>

      {error && <Notice type="error" onClose={() => setError(null)}>{error}</Notice>}

      {s && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 lg:gap-x-2 justify-items-center">
          <SummaryCard label="کل فعالیت‌ها" value={s.total} theme="indigo" icon={ListChecks} active={!filters.status && !onlyOverdue} onClick={() => { setOnlyOverdue(false); set({ status: undefined }); }} />
          <SummaryCard label="شروع نشده" value={s.todo} theme="slate" icon={Clock} active={filters.status === 'todo' && !onlyOverdue} onClick={() => { setOnlyOverdue(false); set({ status: 'todo' }); }} />
          <SummaryCard label="درحال اجرا" value={s.inProgress} theme="blue" icon={Play} active={filters.status === 'in_progress' && !onlyOverdue} onClick={() => { setOnlyOverdue(false); set({ status: 'in_progress' }); }} />
          <SummaryCard label="متوقف" value={s.paused} theme="amber" icon={Pause} active={filters.status === 'paused' && !onlyOverdue} onClick={() => { setOnlyOverdue(false); set({ status: 'paused' }); }} />
          <SummaryCard label="خاتمه یافته" value={s.completed} theme="emerald" icon={CheckCircle2} active={filters.status === 'completed' && !onlyOverdue} onClick={() => { setOnlyOverdue(false); set({ status: 'completed' }); }} />
          <SummaryCard label="موعد گذشته" value={s.overdue} theme="rose" icon={AlertTriangle} active={onlyOverdue} onClick={() => { setOnlyOverdue((v) => !v); set({ status: undefined }); setPage(1); }} />
        </div>
      )}

      <AdminCard>
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5 border-b border-slate-100 dark:border-slate-800">
          <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">فهرست فعالیت‌ها</h3>
          {s && (
            <div className="flex flex-wrap gap-1.5 text-[11px]">
              <StatusBadge tone="slate">عادی: {toPersianDigits(s.normal)}</StatusBadge>
              <StatusBadge tone="green">پروژه: {toPersianDigits(s.project)}</StatusBadge>
              <StatusBadge tone="indigo">تکرارشونده: {toPersianDigits(s.recurring)}</StatusBadge>
            </div>
          )}
        </div>
        {report?.truncated && (
          <div className="px-5 pt-3"><Notice type="info">فقط {toPersianDigits(rows.length)} فعالیت اول نمایش داده شده است؛ برای دیدن بقیه فیلترها را محدودتر کنید. آمار بالا همه موارد را شمرده است.</Notice></div>
        )}
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> در حال تهیه گزارش...</div>
        ) : rows.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-500">فعالیتی با این فیلترها پیدا نشد.</div>
        ) : (
          <>
            <div className="relative overflow-x-auto">
              <table className="w-full min-w-[900px]">
                <thead className="bg-slate-50 dark:bg-slate-800/60"><tr>
                  <th className={`${th} w-12`}>ردیف</th><th className={th}>عنوان</th><th className={th}>نوع</th><th className={th}>وضعیت</th>
                  <th className={th}>مسئول</th><th className={th}>ایجادکننده</th><th className={th}>موعد انجام</th><th className={th}>تکمیل</th><th className={`${th} w-12`}><span className="sr-only">جزئیات</span></th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {pageRows.map((r, i) => (
                    <tr key={r.id} onClick={() => open(r)} className="cursor-pointer hover:bg-indigo-50/50 dark:hover:bg-slate-800/60">
                      <td className={`${td} text-slate-400 font-bold`}>{toPersianDigits((page - 1) * PAGE_SIZE + i + 1)}</td>
                      <td className={`${td} min-w-[220px]`}>
                        <div className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-100 text-sm">
                          {r.type === 'project' && <FolderKanban className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
                          {r.type === 'recurring' && <Repeat className="w-3.5 h-3.5 text-violet-600 shrink-0" />}
                          <span className="line-clamp-1" title={r.title}>{r.title}</span>
                        </div>
                        {r.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {r.tags.map((t) => <span key={t} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-indigo-50 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800"><Tag className="w-2.5 h-2.5" />{t}</span>)}
                          </div>
                        )}
                      </td>
                      <td className={`${td} whitespace-nowrap`}>{REPORT_TYPE_TITLES[r.type]}</td>
                      <td className={td}><span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-bold border whitespace-nowrap ${STATUSES[r.status]?.badgeBg} ${STATUSES[r.status]?.badgeText}`}>{STATUSES[r.status]?.title}</span></td>
                      <td className={td}><WorkHistory row={r} /></td>
                      <td className={`${td} whitespace-nowrap`}>
                        {creatorPeriods(r).length > 1 ? creatorPeriods(r).map((p, i) => (
                          <div key={`${p.userId}-${i}`} className={p.toUtc ? 'text-slate-500' : ''}>
                            <b>{p.displayName}</b>{p.positionTitle && <span className="text-slate-500"> — {p.positionTitle}</span>}
                            <div className="text-[10px] text-slate-400">{spanText(p)}</div>
                          </div>
                        )) : r.owner?.displayName || '—'}
                      </td>
                      <td className={`${td} whitespace-nowrap ${r.isOverdue ? 'text-rose-600 font-bold' : ''}`}>
                        <span className="inline-flex items-center gap-1">{r.isOverdue && <AlertCircle className="w-3.5 h-3.5" />}{jalaliDate(r.dueDate)}</span>
                      </td>
                      <td className={`${td} whitespace-nowrap text-slate-500`}>{r.completedAtUtc ? jalaliDate(iranDay(r.completedAtUtc)) : '—'}</td>
                      <td className={td}>
                        <button type="button" onClick={(e) => { e.stopPropagation(); open(r); }} className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 cursor-pointer" aria-label="مشاهده جزئیات" title="مشاهده جزئیات">
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={PAGE_SIZE} total={rows.length} onPage={setPage} />
          </>
        )}
      </AdminCard>

      {readOnly && <ReportTaskDialog row={readOnly} onClose={() => setReadOnly(null)} />}
      {pdfProgress && (
        <div role="status" className="fixed bottom-24 lg:bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm shadow-xl">
          <Loader2 className="w-4 h-4 animate-spin" /> {pdfProgress}
        </div>
      )}
      {printJob && report && (
        <ReportPrintPages
          rows={printableRows}
          summary={report.summary}
          scopeText={scopeText}
          filtersText={filtersText}
          generatedText={`تاریخ تهیه: ${jalaliDate(iranDay(new Date().toISOString()))}${generatedBy ? ` | تهیه‌کننده: ${generatedBy}` : ''}`}
        />
      )}
    </div>
  );
};
