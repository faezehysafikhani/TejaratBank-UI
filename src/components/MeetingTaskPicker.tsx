import React, { useEffect, useRef, useState } from 'react';
import { Search, X, Check, CheckSquare, Loader2, ChevronDown } from 'lucide-react';
import { Task } from '../types';
import { MeetingTaskOption, getMeetingTaskOptions, searchMeetingTasks } from '../services/meetingApi';
import { Notice, useDebounced } from './admin/AdminUi';
import { userErrorMessage } from '../utils/errorMessages';
import { toPersianDigits } from '../utils/helpers';
import { parseISOToJalali } from '../utils/jalali';

const statusLabel: Record<string,string> = { Todo:'انجام نشده',todo:'انجام نشده',InProgress:'در حال انجام',in_progress:'در حال انجام',Completed:'انجام شده',completed:'انجام شده',Paused:'متوقف',paused:'متوقف' };
export function MeetingTaskPicker({ selectedIds, onChange, initialTasks }: { selectedIds: string[]; onChange: (ids:string[])=>void; initialTasks: Task[] }) {
  const [search,setSearch]=useState(''); const term=useDebounced(search,250);
  const [page,setPage]=useState(1); const [rows,setRows]=useState<MeetingTaskOption[]>([]);const [total,setTotal]=useState(0);
  const [loading,setLoading]=useState(true);const [error,setError]=useState<string|null>(null);const [reload,setReload]=useState(0);
  const cache=useRef<Map<string,MeetingTaskOption>>(new Map(initialTasks.map(t=>[t.id,{id:t.id,title:t.title,status:t.status,dueDate:t.dueDate,isProject:!!t.isProject}])));
  const [,renderCache]=useState(0);
  useEffect(()=>{
    if (!selectedIds.length) return;
    let alive=true;
    getMeetingTaskOptions(selectedIds).then(result=>{if(!alive)return;result.items.forEach(t=>cache.current.set(t.id,t));renderCache(n=>n+1);}).catch(()=>{});
    return ()=>{alive=false;};
  },[selectedIds.join(',')]);
  useEffect(()=>{
    let alive=true;setLoading(true);setError(null);
    searchMeetingTasks(term,page).then(result=>{
      if(!alive)return;
      result.items.forEach(t=>cache.current.set(t.id,t));setRows(old=>page===1?result.items:[...new Map([...old,...result.items].map(t=>[t.id,t])).values()]);setTotal(result.totalCount);
    }).catch(e=>{if(alive)setError(userErrorMessage(e,'جستجوی وظایف انجام نشد.'));}).finally(()=>{if(alive)setLoading(false);});
    return()=>{alive=false;};
  },[term,page,reload]);
  const toggle=(id:string)=>onChange(selectedIds.includes(id)?selectedIds.filter(t=>t!==id):selectedIds.length<100?[...selectedIds,id]:selectedIds);
  const day=(value:string)=>{try{const d=parseISOToJalali(value);return toPersianDigits(`${d.jy}/${d.jm}/${d.jd}`);}catch{return '—';}};
  return <section className="space-y-4">
    <div className="flex items-start justify-between gap-3"><div><h4 className="font-extrabold text-slate-900 dark:text-white">وظایف مرتبط با جلسه</h4><p className="text-xs text-slate-500 mt-1">در همهٔ وظایف خودتان جستجو کنید و چند مورد را انتخاب کنید.</p></div><span className="shrink-0 rounded-full bg-indigo-100 dark:bg-indigo-950 px-3 py-1 text-xs font-bold text-indigo-700 dark:text-indigo-300">{toPersianDigits(selectedIds.length)} انتخاب</span></div>
    <div className="relative"><Search className="absolute right-3 top-3 w-4 h-4 text-slate-400" /><input aria-label="جستجوی وظایف من" autoComplete="off" value={search} maxLength={200} onChange={e=>{setSearch(e.target.value);setPage(1);setRows([]);}} placeholder="عنوان وظیفه را جستجو کنید…" className="w-full py-3 pr-10 pl-10 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-400" />{search && <button type="button" aria-label="پاک کردن جستجو" onClick={()=>{setSearch('');setPage(1);setRows([]);}} className="absolute left-3 top-3 text-slate-400"><X className="w-4 h-4" /></button>}</div>
    {selectedIds.length>0 && <div className="space-y-2"><div className="flex justify-between text-xs text-slate-500"><span>انتخاب‌شده‌ها</span><button type="button" className="text-rose-600" onClick={()=>onChange([])}>پاک کردن انتخاب‌ها</button></div><div className="flex flex-wrap gap-2 max-h-28 overflow-y-auto">{selectedIds.map(id=><span key={id} className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/40 px-2.5 py-1.5 text-xs text-indigo-800 dark:text-indigo-200"><Check className="w-3 h-3 shrink-0" /><span className="max-w-48 truncate">{cache.current.get(id)?.title || 'وظیفه انتخاب‌شده'}</span><button type="button" aria-label={`حذف انتخاب ${cache.current.get(id)?.title || id}`} onClick={()=>toggle(id)}><X className="w-3.5 h-3.5" /></button></span>)}</div></div>}
    {error && <Notice type="error">{error}<button type="button" className="mr-2 underline" onClick={()=>setReload(n=>n+1)}>تلاش دوباره</button></Notice>}
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-900">
      <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 px-4 py-2.5 text-xs text-slate-500"><span>وظایف من</span><span>{loading?'در حال جستجو…':`${toPersianDigits(total)} نتیجه`}</span></div>
      <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">{rows.map(task=>{const selected=selectedIds.includes(task.id);return <label key={task.id} className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors ${selected?'bg-indigo-50/70 dark:bg-indigo-950/30':'hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}><input type="checkbox" checked={selected} disabled={!selected && selectedIds.length>=100} onChange={()=>toggle(task.id)} className="mt-1 accent-indigo-600 w-4 h-4 shrink-0" /><span className="min-w-0 flex-1"><span className="block text-sm font-bold text-slate-800 dark:text-slate-100">{task.title}</span><span className="flex items-center gap-3 mt-1 text-[11px] text-slate-400"><span>{statusLabel[task.status]||task.status}</span><span>موعد {day(task.dueDate)}</span>{task.isProject&&<span>پروژه</span>}</span></span>{selected&&<CheckSquare className="w-4 h-4 mt-1 text-indigo-600 shrink-0" />}</label>;})}
      {loading&&<div className="flex items-center justify-center gap-2 py-6 text-xs text-slate-400"><Loader2 className="w-4 h-4 animate-spin" />در حال دریافت وظایف…</div>}
      {!loading&&!error&&rows.length===0&&<div className="py-9 text-center text-sm text-slate-400">{search?'وظیفه‌ای با این عنوان پیدا نشد.':'وظیفه‌ای برای انتخاب وجود ندارد.'}</div>}
      </div>
      {!error&&rows.length<total&&<button type="button" disabled={loading} onClick={()=>setPage(n=>n+1)} className="flex justify-center items-center gap-1 w-full py-3 text-xs font-bold text-indigo-600 bg-slate-50/70 dark:bg-slate-800/40"><ChevronDown className="w-4 h-4" />نمایش موارد بیشتر</button>}
    </div>
  </section>;
}
