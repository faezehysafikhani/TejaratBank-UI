import React, { useEffect, useMemo, useState } from 'react';
import { Ban, CheckCircle2, Loader2, UserX, Users } from 'lucide-react';
import { AdminCard, Field, Notice, Pagination, StatusBadge, inputClass } from '../admin/AdminUi';
import { JalaliDatePicker } from '../JalaliDatePicker';
import { toPersianDigits } from '../../utils/helpers';
import { userErrorMessage } from '../../utils/errorMessages';
import { buildXlsx, jalaliStamp, saveBlob } from '../../utils/reportExport';
import { PrintInfo, tableReportBlob } from '../../utils/meetingReportPdf';
import { useBranding } from '../../utils/branding';
import { UsersReport as UsersReportData, UsersReportRow, getUsersReport } from '../../services/usersReportApi';
import { FieldGroup, SummaryCard, iranDay, jalaliDate, printedAtText } from './reportShared';
import { ChartGrid, ReportBar, ReportDoughnut, ReportViewMode, ViewModeSwitch, countBy } from './ReportCharts';
import { ReportActions, ProgressToast, useClampedPage, useListExport } from './ReportParts';


type StatusFilter = 'all' | 'active' | 'inactive';
type LoginFilter = 'all' | 'signed' | 'never';

interface Filters {
  status: StatusFilter;
  login: LoginFilter;
  name: string;
  nationalCode: string;
  ip: string;
  position: string;
  place: string;
  /** yyyy-MM-dd (Gregorian), inclusive; the day of the last sign-in in Iran time */
  loginFrom?: string;
  loginTo?: string;
}

const NO_FILTERS: Filters = { status: 'all', login: 'all', name: '', nationalCode: '', ip: '', position: '', place: '' };

const timeText = (utc: string) => toPersianDigits(new Date(new Date(utc).getTime() + 3.5 * 3600 * 1000).toISOString().slice(11, 16));
const loginText = (utc: string | null) => (utc ? `${jalaliDate(iranDay(utc))} ${timeText(utc)}` : 'هرگز');

/** The digits of a Persian or Arabic-Indic text as Latin digits, so a national code matches however it was typed. */
const latin = (value: string) => value.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));

/**
 * «گزارشات کاربران»: every user of the organization with their national code, status, position,
 * place in the chart and last sign-in (time and address), filtered the way the activity report is.
 */
export const UsersReport: React.FC<{ generatedBy?: string }> = ({ generatedBy }) => {
  const [data, setData] = useState<UsersReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const brand = useBranding();
  const printInfo = (): PrintInfo => ({ logo: brand.logo, orgName: brand.name, printedAtText: printedAtText(), printedBy: generatedBy || '' });

  useEffect(() => {
    let alive = true;
    getUsersReport()
      .then((result) => alive && setData(result))
      .catch((err) => alive && setError(userErrorMessage(err, 'دریافت گزارش کاربران ممکن نشد.')))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));
  const hasFilters = JSON.stringify(filters) !== JSON.stringify(NO_FILTERS);

  const positions = useMemo(() => Array.from(new Set<string>((data?.rows || []).flatMap((r) => r.positions))).sort((a, b) => a.localeCompare(b, 'fa')), [data]);
  const places = useMemo(() => Array.from(new Set<string>((data?.rows || []).flatMap((r) => r.places))).sort((a, b) => a.localeCompare(b, 'fa')), [data]);

  const rows = useMemo(() => (data?.rows || []).filter((r) => {
    if (filters.status === 'active' && !r.isActive) return false;
    if (filters.status === 'inactive' && r.isActive) return false;
    if (filters.login === 'never' && r.lastLoginAtUtc) return false;
    if (filters.login === 'signed' && !r.lastLoginAtUtc) return false;
    if (filters.name.trim() && !r.name.includes(filters.name.trim())) return false;
    if (filters.nationalCode.trim() && !latin(r.nationalCode || '').includes(latin(filters.nationalCode.trim()))) return false;
    if (filters.ip.trim() && !(r.lastIp || '').includes(latin(filters.ip.trim()))) return false;
    if (filters.position && !r.positions.includes(filters.position)) return false;
    if (filters.place && !r.places.includes(filters.place)) return false;
    if (filters.loginFrom || filters.loginTo) {
      if (!r.lastLoginAtUtc) return false;
      const day = iranDay(r.lastLoginAtUtc);
      if (filters.loginFrom && day < filters.loginFrom) return false;
      if (filters.loginTo && day > filters.loginTo) return false;
    }
    return true;
  }), [data, filters]);

  const [pageSize, setPageSize] = useState(25);
  const [viewMode, setViewMode] = useState<ReportViewMode>('table');
  const [page, setPage] = useClampedPage(rows.length, pageSize);
  const pageRows = rows.slice((page - 1) * pageSize, page * pageSize);
  const all = data?.rows || [];
  const counts = { total: all.length, active: all.filter((r) => r.isActive).length, inactive: all.filter((r) => !r.isActive).length, never: all.filter((r) => !r.lastLoginAtUtc).length };

  const filtersText = (() => {
    const parts: string[] = [];
    if (filters.status !== 'all') parts.push(filters.status === 'active' ? 'فعال' : 'غیرفعال');
    if (filters.login === 'never') parts.push('هرگز وارد نشده');
    if (filters.login === 'signed') parts.push('وارد شده');
    if (filters.name.trim()) parts.push(`نام: ${filters.name.trim()}`);
    if (filters.nationalCode.trim()) parts.push(`کد ملی: ${filters.nationalCode.trim()}`);
    if (filters.ip.trim()) parts.push(`IP: ${filters.ip.trim()}`);
    if (filters.position) parts.push(`سمت: ${filters.position}`);
    if (filters.place) parts.push(`جایگاه: ${filters.place}`);
    if (filters.loginFrom) parts.push(`آخرین ورود از ${jalaliDate(filters.loginFrom)}`);
    if (filters.loginTo) parts.push(`آخرین ورود تا ${jalaliDate(filters.loginTo)}`);
    return parts.length ? parts.join(' • ') : 'بدون فیلتر';
  })();

  const hasAddresses = !!data?.hasAddresses;
  const hasStructure = !!data?.hasStructure;
  const cells = (r: UsersReportRow) => [
    r.name, r.nationalCode || '', r.isActive ? 'فعال' : 'غیرفعال',
    ...(hasStructure ? [r.positions.join('، '), r.places.join('، ')] : []),
    loginText(r.lastLoginAtUtc),
    ...(hasAddresses ? [r.lastIp || ''] : []),
  ];
  const head = ['نام', 'کد ملی', 'وضعیت', ...(hasStructure ? ['سمت', 'جایگاه سازمانی'] : []), 'آخرین ورود', ...(hasAddresses ? ['IP آخرین ورود'] : [])];

  const exportExcel = () => {
    const info = printInfo();
    saveBlob(
      buildXlsx('گزارش کاربران', ['ردیف', ...head], rows.map((r, i) => [i + 1, ...cells(r)]), [6, 26, 14, 10, ...(hasStructure ? [26, 40] : []), 20, ...(hasAddresses ? [18] : [])], [
        `گزارش کاربران — ${info.orgName}`,
        `تاریخ چاپ: ${info.printedAtText}${info.printedBy ? ` | چاپ‌کننده: ${info.printedBy}` : ''}`,
        `فیلترها: ${filtersText}`,
        `${toPersianDigits(rows.length)} کاربر از ${toPersianDigits(all.length)} کاربر`,
      ]),
      `users-report-${jalaliStamp()}.xlsx`,
    );
  };

  const widths = hasStructure
    ? (hasAddresses ? ['5%', '16%', '11%', '8%', '15%', '20%', '13%', '12%'] : ['5%', '18%', '13%', '9%', '17%', '24%', '14%'])
    : (hasAddresses ? ['6%', '28%', '18%', '12%', '20%', '16%'] : ['7%', '33%', '22%', '14%', '24%']);
  const exporter = useListExport(
    (onProgress) => tableReportBlob({
      title: 'گزارش کاربران',
      subtitle: `${toPersianDigits(rows.length)} کاربر از ${toPersianDigits(all.length)} کاربر`,
      filtersText,
      summary: [
        { label: 'همه کاربران', value: toPersianDigits(counts.total) }, { label: 'فعال', value: toPersianDigits(counts.active) },
        { label: 'غیرفعال', value: toPersianDigits(counts.inactive) }, { label: 'هرگز وارد نشده', value: toPersianDigits(counts.never) },
      ],
      listTitle: 'فهرست کاربران',
      head: ['ردیف', ...head],
      widths,
      rows: rows.map((r, i) => [toPersianDigits(i + 1), ...cells(r)]),
      print: printInfo(),
      emptyText: 'کاربری با این فیلترها پیدا نشد.',
    }, onProgress),
    `users-report-${jalaliStamp()}.pdf`,
    setError,
  );

  const th = 'px-3 py-2.5 text-right text-[11px] font-bold text-slate-500 dark:text-slate-400 whitespace-nowrap';
  const td = 'px-3 py-2.5 align-middle text-xs';

  return (
    <div className="w-full space-y-4" dir="rtl">
      <AdminCard className="p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-base font-extrabold text-slate-900 dark:text-white"><Users className="w-5 h-5 text-indigo-600" /> گزارشات کاربران</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">کاربران سازمان، با وضعیت، سمت و جایگاه سازمانی{hasAddresses ? ' و آخرین ورود' : ''}</p>
          </div>
          <ReportActions
            hasFilters={hasFilters}
            onClear={() => setFilters(NO_FILTERS)}
            canExport={!!data && !loading && rows.length > 0}
            onExcel={exportExcel}
            onPdf={exporter.pdf}
            onPrint={exporter.print}
            busy={exporter.busy}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Field label="نام"><input className={inputClass} value={filters.name} onChange={(e) => set({ name: e.target.value })} placeholder="بخشی از نام" /></Field>
          <Field label="کد ملی"><input className={`${inputClass} dir-ltr text-right`} inputMode="numeric" value={filters.nationalCode} onChange={(e) => set({ nationalCode: e.target.value })} placeholder="کد ملی" /></Field>
          <Field label="وضعیت کاربر">
            <select className={inputClass} value={filters.status} onChange={(e) => set({ status: e.target.value as StatusFilter })}>
              <option value="all">فعال و غیرفعال</option>
              <option value="active">فقط فعال</option>
              <option value="inactive">فقط غیرفعال</option>
            </select>
          </Field>
          <Field label="ورود به سامانه">
            <select className={inputClass} value={filters.login} onChange={(e) => set({ login: e.target.value as LoginFilter })}>
              <option value="all">همه</option>
              <option value="signed">وارد شده‌اند</option>
              <option value="never">هرگز وارد نشده‌اند</option>
            </select>
          </Field>
          {data?.hasStructure && (
            <>
              <Field label="سمت">
                <select className={inputClass} value={filters.position} onChange={(e) => set({ position: e.target.value })}>
                  <option value="">همه سمت‌ها</option>
                  {positions.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </Field>
              <Field label="جایگاه سازمانی">
                <select className={inputClass} value={filters.place} onChange={(e) => set({ place: e.target.value })}>
                  <option value="">همه جایگاه‌ها</option>
                  {places.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </Field>
            </>
          )}
          {data?.hasAddresses && (
            <Field label="IP آخرین ورود"><input className={`${inputClass} dir-ltr text-right`} value={filters.ip} onChange={(e) => set({ ip: e.target.value })} placeholder="مثلاً 10.1.2" /></Field>
          )}
          <FieldGroup label="آخرین ورود از"><JalaliDatePicker ariaLabel="آخرین ورود از" value={filters.loginFrom} onChange={(loginFrom) => set({ loginFrom })} /></FieldGroup>
          <FieldGroup label="آخرین ورود تا"><JalaliDatePicker ariaLabel="آخرین ورود تا" value={filters.loginTo} onChange={(loginTo) => set({ loginTo })} /></FieldGroup>
        </div>
      </AdminCard>

      {error && <Notice type="error" onClose={() => setError(null)}>{error}</Notice>}

      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 lg:gap-x-2 justify-items-center">
          <SummaryCard label="همه کاربران" value={counts.total} theme="indigo" icon={Users} active={filters.status === 'all' && filters.login === 'all'} onClick={() => set({ status: 'all', login: 'all' })} />
          <SummaryCard label="فعال" value={counts.active} theme="emerald" icon={CheckCircle2} active={filters.status === 'active'} onClick={() => set({ status: 'active' })} />
          <SummaryCard label="غیرفعال" value={counts.inactive} theme="rose" icon={Ban} active={filters.status === 'inactive'} onClick={() => set({ status: 'inactive' })} />
          <SummaryCard label="هرگز وارد نشده" value={counts.never} theme="amber" icon={UserX} active={filters.login === 'never'} onClick={() => set({ login: 'never' })} />
        </div>
      )}

      <AdminCard>
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5 border-b border-slate-100 dark:border-slate-800">
          <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">فهرست کاربران</h3>
          <ViewModeSwitch value={viewMode} onChange={setViewMode} />
        </div>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> در حال تهیه گزارش...</div>
        ) : rows.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-500">کاربری با این فیلترها پیدا نشد.</div>
        ) : viewMode === 'chart' ? (
          <ChartGrid>
            <ReportDoughnut title="وضعیت کاربران" subtitle={`${toPersianDigits(rows.length)} کاربر در گزارش`}
              data={[
                { label: 'فعال', value: rows.filter((r) => r.isActive).length, color: '#10b981' },
                { label: 'غیرفعال', value: rows.filter((r) => !r.isActive).length, color: '#ef4444' },
              ]} />
            {hasStructure
              ? <ReportBar title="تعداد کاربران بر اساس سمت" subtitle="۱۰ سمت پرتعداد" data={countBy<UsersReportRow>(rows, (r) => (r.positions.length ? r.positions[0] : '—'))} />
              : <ReportBar title="آخرین ورود کاربران" data={countBy<UsersReportRow>(rows, (r) => (r.lastLoginAtUtc ? jalaliDate(iranDay(r.lastLoginAtUtc)).slice(0, 7) : 'هرگز'), 12)} />}
            <ReportDoughnut title="ورود به سامانه"
              data={[
                { label: 'وارد شده', value: rows.filter((r) => r.lastLoginAtUtc).length, color: '#6366f1' },
                { label: 'هرگز وارد نشده', value: rows.filter((r) => !r.lastLoginAtUtc).length, color: '#f59e0b' },
              ]} />
            {hasStructure && <ReportBar title="تعداد کاربران بر اساس جایگاه سازمانی" subtitle="۱۰ جایگاه پرتعداد" data={countBy<UsersReportRow>(rows, (r) => (r.places.length ? r.places[0] : '—'))} />}
          </ChartGrid>
        ) : (
          <>
            <div className="relative overflow-x-auto">
              <table className="w-full min-w-[820px]">
                <thead className="bg-slate-50 dark:bg-slate-800/60"><tr>
                  <th className={`${th} w-12`}>ردیف</th><th className={th}>نام</th><th className={th}>کد ملی</th><th className={th}>وضعیت</th>
                  {hasStructure && <><th className={th}>سمت</th><th className={th}>جایگاه سازمانی</th></>}
                  <th className={th}>آخرین ورود</th>{hasAddresses && <th className={th}>IP آخرین ورود</th>}
                </tr></thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {pageRows.map((r, i) => (
                    <tr key={r.id} className="hover:bg-indigo-50/50 dark:hover:bg-slate-800/60">
                      <td className={`${td} text-slate-400 font-bold`}>{toPersianDigits((page - 1) * pageSize + i + 1)}</td>
                      <td className={`${td} font-bold text-slate-800 dark:text-slate-100 text-sm whitespace-nowrap`}>{r.name}</td>
                      <td className={`${td} font-mono dir-ltr text-right whitespace-nowrap`}>{r.nationalCode ? toPersianDigits(r.nationalCode) : '—'}</td>
                      <td className={td}>{r.isActive ? <StatusBadge tone="green">فعال</StatusBadge> : <StatusBadge tone="red">غیرفعال</StatusBadge>}</td>
                      {hasStructure && <>
                        <td className={td}>{r.positions.length ? r.positions.join('، ') : '—'}</td>
                        <td className={td}>{r.places.length ? r.places.join('، ') : '—'}</td>
                      </>}
                      <td className={`${td} whitespace-nowrap ${r.lastLoginAtUtc ? '' : 'text-slate-400'}`}>{loginText(r.lastLoginAtUtc)}</td>
                      {hasAddresses && <td className={`${td} font-mono dir-ltr text-right whitespace-nowrap`}>{r.lastIp ? toPersianDigits(r.lastIp) : '—'}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={pageSize} total={rows.length} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1); }} />
          </>
        )}
      </AdminCard>
      <ProgressToast text={exporter.progress} />
    </div>
  );
};
