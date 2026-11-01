import React, { useEffect, useMemo, useState } from 'react';
import { CalendarCheck, CalendarDays, Eye, FileDown, FileText, Loader2, Users, Video, ListChecks } from 'lucide-react';
import { STATUSES, Task, User } from '../../types';
import { AdminCard, AdminDialog, Field, Notice, Pagination, PrimaryButton, SecondaryButton, StatusBadge, inputClass } from '../admin/AdminUi';
import { JalaliDatePicker } from '../JalaliDatePicker';
import { toPersianDigits } from '../../utils/helpers';
import { getIranTodayISO, parseISOToJalali, PERSIAN_MONTH_NAMES } from '../../utils/jalali';
import { userErrorMessage } from '../../utils/errorMessages';
import { buildXlsx, jalaliStamp, saveBlob } from '../../utils/reportExport';
import { MeetingReportData, PrintInfo, downloadMeetingReport, tableReportBlob } from '../../utils/meetingReportPdf';
import { useBranding } from '../../utils/branding';
import { Meeting, listMeetings } from '../../services/meetingApi';
import { FieldGroup, SummaryCard, jalaliDate, printedAtText } from './reportShared';
import { ReportActions, ProgressToast, useClampedPage, useListExport } from './ReportParts';

const PAGE_SIZE = 25;
const TYPE_LABELS = { meeting: 'جلسه حضوری', online: 'جلسه آنلاین', committee: 'کمیته' } as const;
const ACTION_STATUS = { todo: 'شروع نشده', in_progress: 'درحال اجرا', completed: 'خاتمه یافته' } as const;
const UNKNOWN_PERSON = 'فرد ثبت‌شده در جلسه';

type MinutesFilter = 'all' | 'with' | 'without';

interface Filters {
  /** yyyy-MM-dd (Gregorian), inclusive */
  from: string;
  to: string;
  type: '' | Meeting['details']['type'];
  organizerId: string;
  participantId: string;
  text: string;
  minutes: MinutesFilter;
}

const addDays = (iso: string, days: number) => {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
};

const defaultFilters = (): Filters => {
  const today = getIranTodayISO();
  return { from: addDays(today, -90), to: addDays(today, 30), type: '', organizerId: '', participantId: '', text: '', minutes: 'all' };
};

const dayText = (iso: string) => {
  const j = iso ? parseISOToJalali(iso.slice(0, 10)) : null;
  return j ? `${toPersianDigits(j.jd)} ${PERSIAN_MONTH_NAMES[j.jm - 1]} ${toPersianDigits(j.jy)}` : '';
};

/**
 * «گزارشات جلسات»: the meetings of a date range (the ones the user may see) with the whole report
 * of each - details, people, agenda, minutes, linked tasks - filtered, listed and exported the way the
 * activity report is. The full report of one meeting is its PDF (here, no longer in the meeting's dialog).
 */
export const MeetingsReport: React.FC<{ people: User[]; tasks: Task[]; generatedBy?: string }> = ({ people, tasks, generatedBy }) => {
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [meetings, setMeetings] = useState<Meeting[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState<Meeting | null>(null);
  const [pdfBusy, setPdfBusy] = useState<string | null>(null);
  const brand = useBranding();
  /** Logo, organization, the moment of the printout and the person: on every PDF and printout. */
  const printInfo = (): PrintInfo => ({ logo: brand.logo, orgName: brand.name, printedAtText: printedAtText(), printedBy: generatedBy || '' });

  // Only the date range goes to the server; everything else is a filter on what came back.
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    // The server's "to" is exclusive.
    listMeetings(filters.from, addDays(filters.to, 1))
      .then((rows) => alive && setMeetings(rows))
      .catch((err) => alive && (setMeetings([]), setError(userErrorMessage(err, 'دریافت جلسات ممکن نشد.'))))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [filters.from, filters.to]);

  const nameOf = (id: string | null | undefined) => (!id ? '' : people.find((p) => p.id === id)?.name || UNKNOWN_PERSON);
  const taskOf = (id: string) => tasks.find((t) => t.id === id);

  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));
  const fresh = defaultFilters();
  const hasFilters = JSON.stringify(filters) !== JSON.stringify(fresh);

  const organizers = useMemo(() => Array.from(new Set((meetings || []).map((m) => m.details.organizerUserId).filter(Boolean))), [meetings]);
  const participants = useMemo(() => Array.from(new Set((meetings || []).flatMap((m) => m.details.participantIds))), [meetings]);

  const rows = useMemo(() => (meetings || []).filter((m) => {
    const d = m.details;
    if (filters.type && d.type !== filters.type) return false;
    if (filters.organizerId && d.organizerUserId !== filters.organizerId) return false;
    if (filters.participantId && !d.participantIds.includes(filters.participantId)) return false;
    if (filters.minutes === 'with' && !d.minutes.trim()) return false;
    if (filters.minutes === 'without' && d.minutes.trim()) return false;
    const text = filters.text.trim();
    if (text && ![d.title, d.location, d.description, d.minutes, ...d.agenda.map((a) => a.title)].some((v) => (v || '').includes(text))) return false;
    return true;
  }), [meetings, filters]);

  const [page, setPage] = useClampedPage(rows.length, PAGE_SIZE);
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const all = meetings || [];
  const counts = {
    total: all.length,
    meeting: all.filter((m) => m.details.type === 'meeting').length,
    online: all.filter((m) => m.details.type === 'online').length,
    committee: all.filter((m) => m.details.type === 'committee').length,
    withMinutes: all.filter((m) => m.details.minutes.trim()).length,
    withoutMinutes: all.filter((m) => !m.details.minutes.trim()).length,
  };

  const timeOf = (m: Meeting) => (m.details.startTime && m.details.endTime ? `${toPersianDigits(m.details.startTime)} تا ${toPersianDigits(m.details.endTime)}` : '');
  /** «۰۹:۰۰–۱۰:۰۰» for the narrow column of the PDF. */
  const shortTime = (m: Meeting) => (m.details.startTime && m.details.endTime ? `${toPersianDigits(m.details.startTime)}–${toPersianDigits(m.details.endTime)}` : '—');
  const participantsText = (m: Meeting) => m.details.participantIds.map(nameOf).join('، ');

  const filtersText = (() => {
    const parts = [`از ${jalaliDate(filters.from)} تا ${jalaliDate(filters.to)}`];
    if (filters.type) parts.push(`نوع: ${TYPE_LABELS[filters.type]}`);
    if (filters.organizerId) parts.push(`برگزارکننده: ${nameOf(filters.organizerId)}`);
    if (filters.participantId) parts.push(`شرکت‌کننده: ${nameOf(filters.participantId)}`);
    if (filters.minutes !== 'all') parts.push(filters.minutes === 'with' ? 'دارای صورت‌جلسه' : 'بدون صورت‌جلسه');
    if (filters.text.trim()) parts.push(`جست‌وجو: ${filters.text.trim()}`);
    return parts.join(' • ');
  })();

  /** The data of one meeting's own PDF report (the whole report: details, people, agenda, minutes, tasks). */
  const reportOf = (m: Meeting): MeetingReportData => {
    const d = m.details;
    return {
      title: d.title, typeLabel: TYPE_LABELS[d.type], dateText: dayText(d.date), timeText: timeOf(m), location: d.location,
      organizer: nameOf(d.organizerUserId), description: d.description || '',
      participants: d.participantIds.map(nameOf),
      agenda: d.agenda.map((a) => ({ title: a.title, durationText: a.durationMinutes ? `${toPersianDigits(a.durationMinutes)} دقیقه` : '', presenter: nameOf(a.presenterUserId) })),
      minutes: d.minutes || '',
      tasks: d.taskIds.map(taskOf).filter((t): t is Task => !!t).map((t) => ({ title: t.title, statusText: STATUSES[t.status]?.title || t.status, dueText: dayText(t.dueDate || '') })),
      print: printInfo(),
    };
  };

  const downloadOne = async (m: Meeting) => {
    setPdfBusy(m.id);
    try {
      await downloadMeetingReport(reportOf(m), `meeting-report-${m.details.date}.pdf`);
    } catch (err) {
      setError(userErrorMessage(err, 'ساخت گزارش PDF انجام نشد.'));
    } finally {
      setPdfBusy(null);
    }
  };

  const exportExcel = () => {
    const header = ['ردیف', 'عنوان', 'نوع', 'تاریخ', 'ساعت شروع', 'ساعت پایان', 'مکان', 'برگزارکننده', 'تعداد شرکت‌کنندگان', 'شرکت‌کنندگان', 'دستور جلسه', 'مصوبات صورت‌جلسه', 'اقدامات صورت‌جلسه', 'وظایف مرتبط', 'توضیحات'];
    const data = rows.map((m, i) => {
      const d = m.details;
      return [
        i + 1, d.title, TYPE_LABELS[d.type], jalaliDate(d.date), d.startTime, d.endTime, d.location, nameOf(d.organizerUserId),
        d.participantIds.length, participantsText(m),
        d.agenda.map((a, n) => `${n + 1}. ${a.title}${a.durationMinutes ? ` (${a.durationMinutes} دقیقه)` : ''}${a.presenterUserId ? ` — ${nameOf(a.presenterUserId)}` : ''}`).join('\n'),
        d.minutes || '',
        d.actions.map((a) => `${a.title}${a.assigneeUserId ? ` — ${nameOf(a.assigneeUserId)}` : ''}${a.dueDate ? ` — ${jalaliDate(a.dueDate)}` : ''} — ${ACTION_STATUS[a.status] || a.status}`).join('\n'),
        d.taskIds.map(taskOf).filter((t): t is Task => !!t).map((t) => `${t.title} (${STATUSES[t.status]?.title || t.status})`).join('\n'),
        d.description || '',
      ];
    });
    const info = printInfo();
    saveBlob(buildXlsx('گزارش جلسات', header, data, [6, 34, 13, 13, 10, 10, 20, 20, 10, 40, 50, 60, 45, 45, 40], [
      `گزارش جلسات — ${info.orgName}`,
      `تاریخ چاپ: ${info.printedAtText}${info.printedBy ? ` | چاپ‌کننده: ${info.printedBy}` : ''}`,
      `فیلترها: ${filtersText}`,
      `${toPersianDigits(rows.length)} جلسه`,
    ]), `meetings-report-${jalaliStamp()}.xlsx`);
  };

  const exporter = useListExport(
    (onProgress) => tableReportBlob({
      title: 'گزارش جلسات',
      subtitle: `${toPersianDigits(rows.length)} جلسه از ${toPersianDigits(all.length)} جلسه‌ی بازه`,
      filtersText,
      // The cards of the screen, as they are now.
      summary: [
        { label: 'کل جلسات', value: toPersianDigits(counts.total) }, { label: 'حضوری', value: toPersianDigits(counts.meeting) },
        { label: 'آنلاین', value: toPersianDigits(counts.online) }, { label: 'کمیته', value: toPersianDigits(counts.committee) },
        { label: 'دارای صورت‌جلسه', value: toPersianDigits(counts.withMinutes) }, { label: 'بدون صورت‌جلسه', value: toPersianDigits(counts.withoutMinutes) },
      ],
      listTitle: 'فهرست جلسات',
      head: ['ردیف', 'عنوان', 'نوع', 'تاریخ', 'ساعت', 'مکان', 'برگزارکننده', 'شرکت‌کنندگان', 'دستور جلسه', 'صورت جلسه', 'وظایف'],
      widths: ['5%', '15%', '7%', '11%', '11%', '9%', '10%', '11%', '7%', '8%', '6%'],
      rows: rows.map((m, i) => [
        toPersianDigits(i + 1), m.details.title, TYPE_LABELS[m.details.type], jalaliDate(m.details.date), shortTime(m), m.details.location || '—',
        nameOf(m.details.organizerUserId) || '—', participantsText(m) || '—', `${toPersianDigits(m.details.agenda.length)} بند`,
        m.details.minutes.trim() ? 'دارد' : '—', toPersianDigits(m.details.taskIds.length),
      ]),
      print: printInfo(),
      emptyText: 'جلسه‌ای با این فیلترها پیدا نشد.',
    }, onProgress),
    `meetings-report-${jalaliStamp()}.pdf`,
    setError,
  );

  const th = 'px-3 py-2.5 text-right text-[11px] font-bold text-slate-500 dark:text-slate-400 whitespace-nowrap';
  const td = 'px-3 py-2.5 align-middle text-xs';

  return (
    <div className="w-full space-y-4" dir="rtl">
      <AdminCard className="p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-base font-extrabold text-slate-900 dark:text-white"><CalendarDays className="w-5 h-5 text-indigo-600" /> گزارشات جلسات</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">جلسه‌هایی که شما حق دیدن‌شان را دارید، با گزارش کامل هر جلسه</p>
          </div>
          <ReportActions
            hasFilters={hasFilters}
            onClear={() => setFilters(defaultFilters())}
            canExport={!loading && rows.length > 0}
            onExcel={exportExcel}
            onPdf={exporter.pdf}
            onPrint={exporter.print}
            busy={exporter.busy}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <FieldGroup label="جلسات از تاریخ"><JalaliDatePicker ariaLabel="جلسات از تاریخ" value={filters.from} onChange={(from) => from && set({ from })} /></FieldGroup>
          <FieldGroup label="جلسات تا تاریخ"><JalaliDatePicker ariaLabel="جلسات تا تاریخ" value={filters.to} onChange={(to) => to && set({ to })} /></FieldGroup>
          <Field label="نوع">
            <select className={inputClass} value={filters.type} onChange={(e) => set({ type: e.target.value as Filters['type'] })}>
              <option value="">همه انواع</option>
              {(Object.keys(TYPE_LABELS) as (keyof typeof TYPE_LABELS)[]).map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
            </select>
          </Field>
          <Field label="برگزارکننده">
            <select className={inputClass} value={filters.organizerId} onChange={(e) => set({ organizerId: e.target.value })}>
              <option value="">همه</option>
              {organizers.map((id) => <option key={id} value={id}>{nameOf(id)}</option>)}
            </select>
          </Field>
          <Field label="شرکت‌کننده">
            <select className={inputClass} value={filters.participantId} onChange={(e) => set({ participantId: e.target.value })}>
              <option value="">همه</option>
              {participants.map((id) => <option key={id} value={id}>{nameOf(id)}</option>)}
            </select>
          </Field>
          <Field label="صورت‌جلسه">
            <select className={inputClass} value={filters.minutes} onChange={(e) => set({ minutes: e.target.value as MinutesFilter })}>
              <option value="all">همه</option>
              <option value="with">دارای صورت‌جلسه</option>
              <option value="without">بدون صورت‌جلسه</option>
            </select>
          </Field>
          <Field label="جست‌وجو" hint="عنوان، مکان، توضیحات، دستور جلسه و مصوبات">
            <input className={inputClass} value={filters.text} onChange={(e) => set({ text: e.target.value })} placeholder="بخشی از متن" />
          </Field>
        </div>
      </AdminCard>

      {error && <Notice type="error" onClose={() => setError(null)}>{error}</Notice>}

      {meetings && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 lg:gap-x-2 justify-items-center">
          <SummaryCard label="کل جلسات" value={counts.total} theme="indigo" icon={CalendarCheck} active={!filters.type && filters.minutes === 'all'} onClick={() => set({ type: '', minutes: 'all' })} />
          <SummaryCard label="حضوری" value={counts.meeting} theme="slate" icon={Users} active={filters.type === 'meeting'} onClick={() => set({ type: 'meeting' })} />
          <SummaryCard label="آنلاین" value={counts.online} theme="blue" icon={Video} active={filters.type === 'online'} onClick={() => set({ type: 'online' })} />
          <SummaryCard label="کمیته" value={counts.committee} theme="amber" icon={ListChecks} active={filters.type === 'committee'} onClick={() => set({ type: 'committee' })} />
          <SummaryCard label="دارای صورت‌جلسه" value={counts.withMinutes} theme="emerald" icon={FileText} active={filters.minutes === 'with'} onClick={() => set({ minutes: 'with' })} />
          <SummaryCard label="بدون صورت‌جلسه" value={counts.withoutMinutes} theme="rose" icon={FileText} active={filters.minutes === 'without'} onClick={() => set({ minutes: 'without' })} />
        </div>
      )}

      <AdminCard>
        <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800">
          <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">فهرست جلسات</h3>
        </div>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> در حال تهیه گزارش...</div>
        ) : rows.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-500">جلسه‌ای با این فیلترها پیدا نشد.</div>
        ) : (
          <>
            <div className="relative overflow-x-auto">
              <table className="w-full min-w-[960px]">
                <thead className="bg-slate-50 dark:bg-slate-800/60"><tr>
                  <th className={`${th} w-12`}>ردیف</th><th className={th}>عنوان</th><th className={th}>نوع</th><th className={th}>تاریخ</th><th className={th}>ساعت</th>
                  <th className={th}>مکان</th><th className={th}>برگزارکننده</th><th className={th}>شرکت‌کنندگان</th><th className={th}>دستور جلسه</th><th className={th}>صورت‌جلسه</th><th className={th}>وظایف</th>
                  <th className={`${th} w-20`}><span className="sr-only">عملیات</span></th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {pageRows.map((m, i) => (
                    <tr key={m.id} onClick={() => setOpened(m)} className="cursor-pointer hover:bg-indigo-50/50 dark:hover:bg-slate-800/60">
                      <td className={`${td} text-slate-400 font-bold`}>{toPersianDigits((page - 1) * PAGE_SIZE + i + 1)}</td>
                      <td className={`${td} min-w-[200px] font-bold text-slate-800 dark:text-slate-100 text-sm`}><span className="line-clamp-1" title={m.details.title}>{m.details.title}</span></td>
                      <td className={`${td} whitespace-nowrap`}>{TYPE_LABELS[m.details.type]}</td>
                      <td className={`${td} whitespace-nowrap`}>{jalaliDate(m.details.date)}</td>
                      <td className={`${td} whitespace-nowrap`}>{timeOf(m) || '—'}</td>
                      <td className={td}>{m.details.location || '—'}</td>
                      <td className={`${td} whitespace-nowrap`}>{nameOf(m.details.organizerUserId) || '—'}</td>
                      <td className={td} title={participantsText(m)}>{toPersianDigits(m.details.participantIds.length)} نفر</td>
                      <td className={td}>{toPersianDigits(m.details.agenda.length)} بند</td>
                      <td className={td}>{m.details.minutes.trim() ? <StatusBadge tone="green">دارد</StatusBadge> : <span className="text-slate-400">—</span>}</td>
                      <td className={td}>{toPersianDigits(m.details.taskIds.length)}</td>
                      <td className={td}>
                        <div className="flex items-center gap-0.5">
                          <button type="button" onClick={(e) => { e.stopPropagation(); setOpened(m); }} className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 cursor-pointer" aria-label="مشاهده گزارش جلسه" title="مشاهده گزارش جلسه"><Eye className="w-4 h-4" /></button>
                          <button type="button" disabled={pdfBusy === m.id} onClick={(e) => { e.stopPropagation(); void downloadOne(m); }} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer disabled:opacity-50" aria-label="دریافت گزارش PDF جلسه" title="دریافت گزارش PDF جلسه">
                            {pdfBusy === m.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
                          </button>
                        </div>
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

      {opened && (
        <AdminDialog
          title={opened.details.title}
          onClose={() => setOpened(null)}
          footer={<>
            <SecondaryButton onClick={() => setOpened(null)}>بستن</SecondaryButton>
            <PrimaryButton disabled={pdfBusy === opened.id} onClick={() => downloadOne(opened)}>
              {pdfBusy === opened.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />} دریافت گزارش PDF
            </PrimaryButton>
          </>}
        >
          <MeetingReportBody meeting={opened} nameOf={nameOf} taskOf={taskOf} timeText={timeOf(opened)} />
        </AdminDialog>
      )}
      <ProgressToast text={exporter.progress} />
    </div>
  );
};

/** The whole report of one meeting on screen: details, people, agenda, minutes, actions and linked tasks. */
const MeetingReportBody: React.FC<{ meeting: Meeting; nameOf: (id: string | null | undefined) => string; taskOf: (id: string) => Task | undefined; timeText: string }> = ({ meeting, nameOf, taskOf, timeText }) => {
  const d = meeting.details;
  const heading = 'text-xs font-extrabold text-indigo-800 dark:text-indigo-300 border-b-2 border-indigo-700 pb-1 mb-2';
  const linked = d.taskIds.map(taskOf).filter((t): t is Task => !!t);
  return (
    <div className="space-y-5 text-sm">
      <section>
        <h4 className={heading}>مشخصات جلسه</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div><span className="text-slate-500">نوع: </span><b>{TYPE_LABELS[d.type]}</b></div>
          <div><span className="text-slate-500">تاریخ: </span><b>{dayText(d.date)}</b></div>
          <div><span className="text-slate-500">ساعت: </span><b>{timeText || '—'}</b></div>
          <div><span className="text-slate-500">مکان: </span><b>{d.location || '—'}</b></div>
          <div><span className="text-slate-500">برگزارکننده: </span><b>{nameOf(d.organizerUserId) || '—'}</b></div>
        </div>
        {d.description.trim() && <p className="mt-2 whitespace-pre-line text-justify text-slate-700 dark:text-slate-300">{d.description}</p>}
      </section>
      <section>
        <h4 className={heading}>افراد مرتبط ({toPersianDigits(d.participantIds.length)})</h4>
        <p className="leading-7 text-justify">{d.participantIds.map(nameOf).join('، ') || 'فردی ثبت نشده است.'}</p>
      </section>
      <section>
        <h4 className={heading}>دستور جلسه ({toPersianDigits(d.agenda.length)})</h4>
        {d.agenda.length === 0 ? <p className="text-slate-500">بندی ثبت نشده است.</p> : (
          <ol className="space-y-1">
            {d.agenda.map((a, i) => (
              <li key={i} className="rounded-lg bg-slate-50 dark:bg-slate-800/60 px-3 py-1.5">
                <b>{toPersianDigits(i + 1)}. {a.title}</b>
                <span className="text-slate-500 text-xs">{a.durationMinutes ? ` · ${toPersianDigits(a.durationMinutes)} دقیقه` : ''}{a.presenterUserId ? ` · ارائه: ${nameOf(a.presenterUserId)}` : ''}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
      <section>
        <h4 className={heading}>مصوبات صورت‌جلسه</h4>
        {d.minutes.trim() ? <p className="whitespace-pre-line leading-7 text-justify">{d.minutes}</p> : <p className="text-slate-500">صورت‌جلسه‌ای ثبت نشده است.</p>}
        {d.actions.length > 0 && (
          <ul className="mt-2 space-y-1">
            {d.actions.map((a, i) => (
              <li key={i} className="rounded-lg bg-slate-50 dark:bg-slate-800/60 px-3 py-1.5 text-xs">
                <b>{a.title}</b>{a.assigneeUserId ? ` — ${nameOf(a.assigneeUserId)}` : ''}{a.dueDate ? ` — ${jalaliDate(a.dueDate)}` : ''} — {ACTION_STATUS[a.status] || a.status}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h4 className={heading}>وظایف مرتبط ({toPersianDigits(d.taskIds.length)})</h4>
        {d.taskIds.length === 0 ? <p className="text-slate-500">وظیفه‌ای به این جلسه وصل نشده است.</p> : (
          <ul className="space-y-1">
            {linked.map((t) => <li key={t.id} className="rounded-lg bg-slate-50 dark:bg-slate-800/60 px-3 py-1.5 text-xs"><b>{t.title}</b> — {STATUSES[t.status]?.title || t.status}{t.dueDate ? ` — موعد: ${jalaliDate(t.dueDate)}` : ''}</li>)}
            {linked.length < d.taskIds.length && <li className="text-xs text-slate-500">{toPersianDigits(d.taskIds.length - linked.length)} وظیفه‌ی دیگر برای شما قابل نمایش نیست.</li>}
          </ul>
        )}
      </section>
    </div>
  );
};
