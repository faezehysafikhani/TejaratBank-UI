import React, { useEffect, useRef } from 'react';
import { CalendarDays, X } from 'lucide-react';

export function MeetingDialog({title,subtitle,summary,navigation,footer,onClose,children}:{title:string;subtitle:string;summary?:React.ReactNode;navigation?:React.ReactNode;footer:React.ReactNode;onClose:()=>void;children:React.ReactNode}) {
  const box=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const before=document.body.style.overflow;document.body.style.overflow='hidden';
    box.current?.querySelector<HTMLInputElement>('input:not([type=hidden])')?.focus({preventScroll:true});
    return()=>{document.body.style.overflow=before;};
  },[]);
  return <div className="fixed inset-0 z-50 bg-slate-950/55 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
    <div ref={box} role="dialog" aria-modal="true" aria-label={title} dir="rtl" onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();onClose();}}} className="w-full max-w-4xl max-h-[92dvh] flex flex-col overflow-hidden rounded-3xl bg-white dark:bg-slate-900 border border-white/70 dark:border-slate-700 shadow-[0_32px_100px_-24px_rgba(15,23,42,0.55)]">
      <div className="h-1 shrink-0 bg-gradient-to-l from-indigo-600 via-violet-500 to-sky-400" />
      <header className="flex items-center gap-3 px-4 sm:px-6 py-4">
        <span className="flex items-center justify-center w-11 h-11 shrink-0 rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-200/60 dark:shadow-none"><CalendarDays className="w-5 h-5" /></span>
        <div className="min-w-0 flex-1"><h3 className="font-extrabold text-base sm:text-lg text-slate-900 dark:text-white">{title}</h3><p className="text-[11px] text-slate-400 mt-1 hidden sm:block">{subtitle}</p></div>
        {summary && <div className="hidden lg:block text-xs text-slate-500 dark:text-slate-400">{summary}</div>}
        <button type="button" aria-label="بستن" onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700"><X className="w-4 h-4" /></button>
      </header>
      {navigation ? <div className="shrink-0 px-3 sm:px-6 border-b border-slate-100 dark:border-slate-800">{navigation}</div> : <div className="border-b border-slate-100 dark:border-slate-800" />}
      <div className="px-4 sm:px-6 py-5 bg-slate-50/80 dark:bg-slate-950/30 overflow-y-auto overscroll-contain min-h-0">{children}</div>
      <footer className="shrink-0 flex items-center justify-between gap-2 px-4 sm:px-6 py-3 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">{footer}</footer>
    </div>
  </div>;
}
