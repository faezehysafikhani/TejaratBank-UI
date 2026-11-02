import React, { useCallback, useEffect, useState } from 'react';
import { Appointment, appointmentState, getUserPositionHistory, endPostAppointment, cancelUpcomingAppointment } from '../../services/orgStructureApi';
import { appConfirm } from '../../utils/appDialog';
import { formatToJalali } from '../../utils/helpers';
import { userErrorMessage } from '../../utils/errorMessages';
import { Notice, SecondaryButton, StatusBadge } from './AdminUi';

export function UserAppointmentsPanel({ userId, onChanged }: { userId: string; onChanged: () => void }) {
  const [rows, setRows] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setRows(await getUserPositionHistory(userId)); }
    catch (e) { setError(userErrorMessage(e, 'دریافت سابقه سمت‌ها ممکن نشد.')); }
    finally { setLoading(false); }
  }, [userId]);
  useEffect(() => { void load(); }, [load]);
  const end = async (a: Appointment) => {
    const waiting = appointmentState(a) === 'waiting';
    if (!await appConfirm(waiting ? 'انتصاب آینده لغو شود؟' : 'این سمت اکنون غیرفعال شود؟ سابقه حفظ می‌شود و وظیفه جدیدی به این انتصاب تخصیص نمی‌یابد.')) return;
    setBusy(true); setError(null);
    try {
      if (waiting) await cancelUpcomingAppointment(a.unitPositionId);
      else await endPostAppointment(a.unitPositionId);
      await load(); onChanged();
    } catch (e) { setError(userErrorMessage(e, 'تغییر وضعیت سمت انجام نشد.')); }
    finally { setBusy(false); }
  };
  return <section className="space-y-3">
    <h4 className="text-sm font-bold">سوابق سمت و پست سازمانی</h4>
    {error && <Notice type="error">{error}<SecondaryButton type="button" onClick={load}>تلاش دوباره</SecondaryButton></Notice>}
    {loading ? <p className="text-xs text-slate-500">در حال دریافت سوابق…</p> : <div className="overflow-x-auto"><table className="w-full text-xs text-right">
      <thead><tr className="bg-slate-50 dark:bg-slate-800">{['سمت / پست', 'محل', 'شروع', 'پایان', 'وضعیت', 'عملیات'].map(t => <th key={t} className="p-2">{t}</th>)}</tr></thead>
      <tbody>{rows.length === 0 ? <tr><td colSpan={6} className="p-3">سابقه‌ای ثبت نشده است.</td></tr> : [...rows].sort((a,b) => (b.startDate || '').localeCompare(a.startDate || '')).map(a => {
        const state = appointmentState(a);
        return <tr key={a.id} className="border-b border-slate-100 dark:border-slate-800">
          <td className="p-2">{a.postTitle || '—'} {a.postCode && `(${a.postCode})`}</td><td className="p-2">{a.place || '—'}</td>
          <td className="p-2 whitespace-nowrap">{a.startDate ? formatToJalali(a.startDate) : '—'}</td><td className="p-2 whitespace-nowrap">{a.endDate ? formatToJalali(a.endDate) : 'بدون پایان'}</td>
          <td className="p-2"><StatusBadge tone={state === 'current' ? 'green' : 'slate'}>{state === 'current' ? 'فعال' : state === 'waiting' ? 'در انتظار شروع' : 'غیرفعال'}</StatusBadge></td>
          <td className="p-2">{state !== 'ended' && <SecondaryButton type="button" disabled={busy} onClick={() => end(a)}>{state === 'waiting' ? 'لغو انتصاب' : 'غیرفعال‌کردن'}</SecondaryButton>}</td>
        </tr>;
      })}</tbody>
    </table></div>}
  </section>;
}
