import React, { useEffect, useState } from 'react';
import { CalendarDays, Users, ListOrdered, CheckSquare, Plus, Trash2, Loader2, Clock3, Video, Building2, BellRing, FileText, ListPlus } from 'lucide-react';
import { Task, User } from '../types';
import { Meeting, MeetingInput, MeetingPeopleOptions, getMeetingPeople, saveMeeting } from '../services/meetingApi';
import { userErrorMessage } from '../utils/errorMessages';
import { toPersianDigits } from '../utils/helpers';
import { JalaliDatePicker } from './JalaliDatePicker';
import { MeetingTimeField, normalizeMeetingTime } from './MeetingTimeField';
import { MeetingDialog } from './MeetingDialog';
import { MeetingTaskPicker } from './MeetingTaskPicker';
import { parseISOToJalali, PERSIAN_MONTH_NAMES, schedulingBlockReason } from '../utils/jalali';
import PeoplePicker from './PeoplePicker';
import { Field, inputClass, Notice, PrimaryButton, SecondaryButton } from './admin/AdminUi';
import { PERMISSIONS } from '../utils/permissions';

const tabs = [
  { id: 'details', label: 'مشخصات رویداد', icon: CalendarDays },
  { id: 'people', label: 'افراد مرتبط', icon: Users },
  { id: 'agenda', label: 'دستور جلسه', icon: ListOrdered },
  { id: 'minutes', label: 'صورت‌جلسه', icon: FileText },
  { id: 'tasks', label: 'ارتباط با وظایف', icon: CheckSquare },
] as const;
type Tab = typeof tabs[number]['id'];

export function MeetingFormModal({ initialDate, meeting, currentUser, people, tasks, onClose, onSaved, onConvertToTask }: {
  initialDate: string; meeting?: Meeting; currentUser: User; people: User[]; tasks: Task[];
  onClose: () => void; onSaved: (meeting: Meeting) => void;
  /** Opens the ordinary new-task form with the meeting's title; unset when the user may not create tasks. */
  onConvertToTask?: (title: string, isoDate: string) => void;
}) {
  const [form, setForm] = useState<MeetingInput>(() => meeting ? { ...meeting.details, version: meeting.version } : {
    title: '', type: 'meeting', date: initialDate, startTime: '09:00', endTime: '10:00', location: '', organizerUserId: currentUser.id,
    description: '', participantIds: [], agenda: [], minutes: '', actions: [], taskIds: [], sendInvitationSms: false,
  });
  const [active, setActive] = useState<Tab>('details');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const readonly = !!meeting && !meeting.canEdit;
  const [peopleOptions, setPeopleOptions] = useState<MeetingPeopleOptions | null>(null);
  const [peopleError, setPeopleError] = useState<string | null>(null);
  const [peopleReload, setPeopleReload] = useState(0);
  useEffect(() => {
    let alive = true; setPeopleOptions(null); setPeopleError(null);
    getMeetingPeople().then(value => {if (alive) setPeopleOptions(value);})
      .catch(e => {if (alive) setPeopleError(userErrorMessage(e, 'دریافت محدوده افراد جلسه انجام نشد.'));});
    return () => {alive = false;};
  }, [currentUser.id, peopleReload]);
  const roster = peopleOptions?.people || [];
  const allowedPeople = new Set(roster.map(p => p.id));
  const referencedPeople = [form.organizerUserId,...form.participantIds,...form.agenda.flatMap(a=>a.presenterUserId?[a.presenterUserId]:[]),];
  const outsideIds = Array.from(new Set(referencedPeople.filter(id=>!allowedPeople.has(id))));
  const scopeReady = !!peopleOptions && allowedPeople.has(currentUser.id) && (!!meeting || peopleOptions.canCreate);
  const set = <K extends keyof MeetingInput>(key: K, value: MeetingInput[K]) => {
    setForm(f => ({ ...f, [key]: value }));
    setError(null);
  };
  const toggle = (key: 'participantIds' | 'taskIds', id: string) => set(key, form[key].includes(id) ? form[key].filter(x => x !== id) : [...form[key], id]);
  const personOptions = <><option value="">— انتخاب فرد —</option>{roster.map(p => <option value={p.id} key={p.id}>{p.name} — {p.positionTitle}{p.relation==='superior'?' (بالادست)':''}</option>)}{outsideIds.map(id=><option key={id} value={id} disabled>{readonly?(people.find(p=>p.id===id)?.name || 'فرد ثبت‌شده در جلسه'):'فرد خارج از محدودهٔ فعلی — تغییر دهید'}</option>)}</>;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (busy || readonly) return;
    if (!scopeReady || outsideIds.length) {setError('افراد جلسه را مطابق محدودهٔ فعلی چارت انتخاب کنید.'); return;}
    let problem: string | null = null; let tab: Tab = 'details';
    if (!form.title.trim() || !form.date || !form.organizerUserId) problem = 'عنوان، تاریخ و برگزارکننده را تکمیل کنید.';
    else if (!meeting && schedulingBlockReason(form.date)) problem = schedulingBlockReason(form.date);
    else if (meeting && form.date !== meeting.details.date && schedulingBlockReason(form.date)) problem = schedulingBlockReason(form.date);
    else if (!normalizeMeetingTime(form.startTime) || !normalizeMeetingTime(form.endTime)) problem = 'ساعت شروع و پایان را با فرمت ۲۴ ساعته وارد کنید؛ مانند ۰۹:۳۰.';
    else if (normalizeMeetingTime(form.endTime)! <= normalizeMeetingTime(form.startTime)!) problem = 'ساعت پایان باید بعد از ساعت شروع همان روز باشد.';
    else if (form.agenda.some(a => !a.title.trim() || !Number.isInteger(a.durationMinutes) || a.durationMinutes < 1 || a.durationMinutes > 480)) { problem = 'عنوان و مدت هر بند دستور جلسه را تکمیل کنید.'; tab = 'agenda'; }
    if (problem) { setActive(tab); setError(problem); return; }
    setError(null); setBusy(true);
    try { onSaved(await saveMeeting({...form,startTime:normalizeMeetingTime(form.startTime)!,endTime:normalizeMeetingTime(form.endTime)!}, meeting?.id)); }
    catch (e) { setError(userErrorMessage(e, 'ذخیره جلسه انجام نشد.')); setPeopleReload(n=>n+1); }
    finally { setBusy(false); }
  };

  // The minutes belong to a meeting that already exists: the first save has no such tab.
  const visibleTabs = meeting ? tabs : tabs.filter(t => t.id !== 'minutes');
  const counts:Record<Tab,number>={details:0,people:form.participantIds.length,agenda:form.agenda.length,minutes:form.minutes.trim()?1:0,tasks:form.taskIds.length};
  const start=normalizeMeetingTime(form.startTime),end=normalizeMeetingTime(form.endTime);
  const toMinutes=(time:string)=>Number(time.slice(0,2))*60+Number(time.slice(3));
  const duration=start&&end?toMinutes(end)-toMinutes(start):0;
  const durationLabel=duration>0 ? [Math.floor(duration/60)>0?toPersianDigits(Math.floor(duration/60))+' ساعت':'',duration%60?toPersianDigits(duration%60)+' دقیقه':''].filter(Boolean).join(' و ') : 'زمان را مشخص کنید';
  const date=form.date?parseISOToJalali(form.date):null;
  const dateSummary=date?toPersianDigits(date.jd)+' '+PERSIAN_MONTH_NAMES[date.jm-1]:'';
  const navigation=<nav role="tablist" aria-label="بخش‌های جلسه" className={'grid gap-1 '+(visibleTabs.length>4?'grid-cols-5':'grid-cols-4')}>
    {visibleTabs.map(({id,label,icon:Icon})=><button type="button" role="tab" title={label} aria-label={label} aria-selected={active===id} key={id} onClick={()=>setActive(id)} className={'flex items-center justify-center gap-1.5 py-3.5 text-xs font-bold border-b-2 transition-colors '+(active===id?'border-indigo-600 text-indigo-700 dark:text-indigo-300':'border-transparent text-slate-400 hover:text-slate-700 dark:hover:text-slate-200')}><Icon className="w-[18px] h-[18px] shrink-0"/><span className="hidden md:inline whitespace-nowrap">{label}</span>{counts[id]>0&&<span className={'rounded-md px-1.5 py-0.5 text-[10px] '+(active===id?'bg-indigo-100 dark:bg-indigo-950':'bg-slate-100 dark:bg-slate-800')}>{toPersianDigits(counts[id])}</span>}</button>)}
  </nav>;
  return <MeetingDialog title={meeting ? (readonly ? 'مشاهده جلسه «'+form.title+'»' : 'ویرایش جلسه') : 'ایجاد جلسه جدید'} subtitle="زمان و افراد جلسه را مشخص کنید؛ تصمیم‌ها را همین‌جا پیگیری کنید." summary={meeting && <div className="text-left space-y-1"><div>{dateSummary}</div><div dir="ltr" className="text-[11px]">{start&&end?toPersianDigits(start)+' — '+toPersianDigits(end):''}</div></div>} navigation={navigation} onClose={()=>!busy&&onClose()}
    footer={<><span className="text-[11px] text-slate-400 hidden sm:inline">{toPersianDigits(form.participantIds.length)} نفر · {toPersianDigits(form.agenda.length)} بند · {toPersianDigits(form.taskIds.length)} وظیفه</span><div className="flex items-center gap-2 mr-auto"><SecondaryButton type="button" disabled={busy} onClick={onClose}>{readonly?'بستن':'انصراف'}</SecondaryButton>{!readonly&&<PrimaryButton type="submit" form="meeting-form" disabled={busy || !scopeReady || outsideIds.length>0}>{busy?<Loader2 className="w-4 h-4 animate-spin"/>:<CheckSquare className="w-4 h-4"/>}ذخیره جلسه</PrimaryButton>}</div></>}>
    <div className="md:hidden text-sm font-extrabold text-slate-800 dark:text-white mb-4">{visibleTabs.find(t=>t.id===active)?.label}</div>
    <form id="meeting-form" onSubmit={submit} className="space-y-3" noValidate>
      {error && <Notice type="error">{error}</Notice>}
      {!readonly && peopleError && <Notice type="error">{peopleError}<button type="button" className="mr-2 underline" onClick={()=>setPeopleReload(n=>n+1)}>تلاش دوباره</button></Notice>}
      {!readonly && !peopleOptions && !peopleError && <p className="text-xs text-slate-500">در حال بررسی دسترسی و چارت سازمانی…</p>}
      {!readonly && peopleOptions?.message && <Notice type="error">{peopleOptions.message}</Notice>}
      {!readonly && peopleOptions && outsideIds.length>0 && <Notice type="error">افراد خارج از محدودهٔ فعلی چارت را از جلسه حذف یا جایگزین کنید.</Notice>}
      <fieldset disabled={readonly || busy} className="space-y-3 disabled:opacity-80">
        {active === 'details' && <div className="space-y-4">
          <Field label="عنوان جلسه" required><input autoFocus className={inputClass+' font-bold text-base'} value={form.title} placeholder="مثلاً: هماهنگی برنامه‌های ماه آینده" maxLength={200} onChange={e=>set('title',e.target.value)}/></Field>
          <div role="radiogroup" aria-label="نوع رویداد" className="grid grid-cols-3 gap-2">{([{value:'meeting',label:'جلسه حضوری',icon:Users},{value:'online',label:'جلسه آنلاین',icon:Video},{value:'committee',label:'کمیته',icon:Building2}] as const).map(({value,label,icon:Icon})=><label key={value} className={'flex items-center justify-center gap-2 py-2.5 rounded-xl border text-xs font-bold cursor-pointer transition-colors '+(form.type===value?'border-indigo-300 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300':'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-500')}><input type="radio" name="meeting-type" className="sr-only" value={value} checked={form.type===value} onChange={()=>set('type',value)}/><Icon className="w-4 h-4 shrink-0"/>{label}</label>)}</div>
          <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-700 p-4 space-y-3 shadow-sm">
            <div className="flex items-center gap-2"><Clock3 className="w-4 h-4 text-indigo-500"/><h4 className="text-xs font-bold text-slate-700 dark:text-slate-200">زمان برگزاری</h4><span className="mr-auto text-[11px] bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-300 rounded-full px-2.5 py-1">{durationLabel}</span></div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="تاریخ شمسی" required><JalaliDatePicker value={form.date||undefined} onChange={date=>set('date',date||'')} ariaLabel="تاریخ جلسه" blockOffDays/></Field>
              <Field label="ساعت شروع" required><MeetingTimeField value={form.startTime} onChange={v=>set('startTime',v)} ariaLabel="ساعت شروع جلسه" disabled={readonly||busy}/></Field>
              <Field label="ساعت پایان" required><MeetingTimeField value={form.endTime} onChange={v=>set('endTime',v)} ariaLabel="ساعت پایان جلسه" disabled={readonly||busy}/></Field>
            </div>
          </section>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="مکان / نشانی جلسه آنلاین"><input className={inputClass} value={form.location||''} placeholder={form.type==='online'?'پیوند ورود به جلسه':'مثلاً: سالن جلسات، طبقه دوم'} maxLength={300} onChange={e=>set('location',e.target.value)}/></Field>
            <Field label="برگزارکننده" required><select className={inputClass} value={form.organizerUserId} onChange={e=>set('organizerUserId',e.target.value)}>{personOptions}</select></Field>
          </div>
          <Field label="توضیحات"><textarea className={inputClass} rows={2} maxLength={4000} placeholder="هدف جلسه یا توضیحی برای شرکت‌کنندگان…" value={form.description||''} onChange={e=>set('description',e.target.value)}/></Field>
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-sky-100 bg-sky-50/70 px-3 py-2 text-[11px] text-sky-800 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-200">
            <span className="font-bold">کنترل تداخل هنگام ذخیره:</span><span>✓ افراد</span><span>✓ تاریخ</span><span>✓ ساعت</span><span className={form.location?.trim()?'':'opacity-50'}>{form.location?.trim()?'✓':'○'} مکان</span>
          </div>
          <label className="flex items-center gap-3 rounded-xl border border-slate-200/70 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 cursor-pointer"><span className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-950/30 text-amber-500 flex items-center justify-center shrink-0"><BellRing className="w-4 h-4"/></span><span className="flex-1"><span className="block text-xs font-bold text-slate-700 dark:text-slate-200">دعوت‌نامه پیامکی</span><span className="block text-[11px] text-slate-400 mt-1">ارسال برای افراد مرتبط، با پنل پیامکی فعال</span></span><input type="checkbox" aria-label="ارسال دعوت‌نامه پیامکی" checked={form.sendInvitationSms} onChange={e=>set('sendInvitationSms',e.target.checked)} className="w-4 h-4 accent-indigo-600"/></label>
        </div>}
        {active === 'people' && <div className="space-y-3 min-h-80 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-4"><p className="text-sm font-bold text-slate-700 dark:text-slate-200">افراد مرتبط با جلسه</p><PeoplePicker people={roster.map(p=>({...p,name:p.name+' — '+p.positionTitle+(p.relation==='superior'?' (بالادست)':'')}))} selectedIds={form.participantIds} onToggle={id => {if(allowedPeople.has(id))toggle('participantIds', id);}} placeholder="جستجو در افراد مجاز چارت سازمانی…" />
          {form.participantIds.filter(id=>!allowedPeople.has(id)).map(id=><div key={id} className="flex items-center gap-2 text-xs text-slate-500"><span>{people.find(p=>p.id===id)?.name || 'فرد ثبت‌شده در جلسه'}{!readonly&&' — خارج از محدودهٔ فعلی'}</span>{!readonly&&<button type="button" className="text-rose-600 underline" onClick={()=>toggle('participantIds',id)}>حذف از افراد مرتبط</button>}</div>)}
          
<p className="text-xs text-slate-500">
  {currentUser.permissions?.includes(
    PERMISSIONS.meetingsAccessAllPeople
  )
    ? 'دسترسی به همه افراد جلسات فعال است. می‌توانید تمام کاربران فعال این سازمان را انتخاب کنید.'
    : (
      <>
        افراد قابل انتخاب بر اساس محدوده مجاز
        چارت سازمانی شما تعیین می‌شوند.
        {' '}
        {peopleOptions?.canInviteHigher
          ? 'دعوت از بالادست‌های مجاز نیز فعال است.'
          : 'دعوت از بالادست نیازمند مجوز مخصوص جلسات است.'}
      </>
    )}
</p>
</div>}
        {active === 'agenda' && <div className="space-y-3">
          <div className="flex items-center justify-between"><p className="text-sm font-bold text-slate-700 dark:text-slate-200">دستور جلسه را تعریف کنید</p><SecondaryButton type="button" disabled={form.agenda.length >= 50} onClick={() => set('agenda', [...form.agenda, {title: '', durationMinutes: 15, presenterUserId: null}])}><Plus className="w-4 h-4" />افزودن بند</SecondaryButton></div>
          {form.agenda.length === 0 && <Empty text="هنوز بندی برای دستور جلسه ثبت نشده است." />}
          {form.agenda.map((item, i) => <div key={i} className="grid grid-cols-2 sm:grid-cols-6 gap-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm">
            <Field label={`عنوان بند ${toPersianDigits(i + 1)}`} className="col-span-2 sm:col-span-3"><input className={inputClass} maxLength={500} value={item.title} onChange={e => set('agenda', form.agenda.map((a,n) => n === i ? {...a,title:e.target.value} : a))} /></Field>
            <Field label="مدت (دقیقه)"><input className={inputClass} type="number" min={1} max={480} value={item.durationMinutes || ''} onChange={e => set('agenda', form.agenda.map((a,n) => n === i ? {...a,durationMinutes:Number(e.target.value)} : a))} /></Field>
            <Field label="ارائه‌دهنده" className="sm:col-span-2"><select className={inputClass} value={item.presenterUserId || ''} onChange={e => set('agenda', form.agenda.map((a,n) => n === i ? {...a,presenterUserId:e.target.value || null} : a))}>{personOptions}</select></Field>
            <Remove label={`حذف بند ${i+1}`} onClick={() => set('agenda', form.agenda.filter((_,n) => n !== i))} />
          </div>)}
        </div>}
        {active === 'minutes' && meeting && <div className="space-y-3">
          <Field label="صورت‌جلسه"><textarea className={inputClass} rows={10} maxLength={12000} placeholder="خلاصه مذاکرات، مصوبات و تصمیم‌های جلسه…" value={form.minutes||''} onChange={e=>set('minutes',e.target.value)}/></Field>
        </div>}
        {active === 'tasks' && <MeetingTaskPicker selectedIds={form.taskIds} onChange={ids=>set('taskIds',ids)} initialTasks={tasks}/>}
      </fieldset>
    </form>
    {active === 'minutes' && meeting && onConvertToTask && <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-indigo-100 dark:border-indigo-900 bg-indigo-50/60 dark:bg-indigo-950/30 p-3">
      <SecondaryButton type="button" onClick={()=>onConvertToTask(form.title.trim(), form.date)}><ListPlus className="w-4 h-4" />تبدیل به وظیفه</SecondaryButton>
      <span className="text-[11px] text-slate-500">فرم ثبت فعالیت با عنوان جلسه باز می‌شود؛ عنوان قابل ویرایش است.</span>
    </div>}
  </MeetingDialog>;
}
function Empty({text}:{text:string}) { return <p className="text-center text-xs text-slate-400 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl p-6">{text}</p>; }
function Remove({label,onClick}:{label:string;onClick:()=>void}) { return <button type="button" aria-label={label} onClick={onClick} className="inline-flex w-fit items-center gap-1 text-rose-600 text-xs rounded-lg p-1.5 hover:bg-rose-50 dark:hover:bg-rose-950 cursor-pointer"><Trash2 className="w-3.5 h-3.5" />حذف</button>; }
