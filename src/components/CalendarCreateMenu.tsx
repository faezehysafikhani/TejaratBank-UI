import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, CheckSquare } from 'lucide-react';

export function CalendarCreateMenu({ anchor, onTask, onMeeting, onClose, canCreateMeeting, meetingReason,canCreateTask }: {
  anchor: DOMRect; onTask: () => void; onMeeting: () => void; onClose: () => void; canCreateMeeting: boolean; meetingReason?: string; canCreateTask: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    root.current?.querySelector<HTMLButtonElement>('button')?.focus({preventScroll:true});
    const outside = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => { if(e.key === 'Escape') {e.preventDefault();e.stopPropagation();onClose();} };
    const closeOnScroll = (e: Event) => { if (!root.current?.contains(e.target as Node)) onClose(); };
    document.addEventListener('mousedown',outside);document.addEventListener('keydown',key,true);
    window.addEventListener('scroll',closeOnScroll,true);window.addEventListener('resize',onClose);
    return () => {document.removeEventListener('mousedown',outside);document.removeEventListener('keydown',key,true);window.removeEventListener('scroll',closeOnScroll,true);window.removeEventListener('resize',onClose);};
  }, [onClose]);
  const left = Math.max(8,Math.min(anchor.right-208,window.innerWidth-216));
  const top = Math.max(8,Math.min(anchor.bottom+6,window.innerHeight-110));
  return createPortal(<div ref={root} role="menu" aria-label="ایجاد برنامه در تقویم" dir="rtl" style={{position:'fixed',left,top,zIndex:1000,width:208}} className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl">
    <button type="button" role="menuitem" disabled={!canCreateTask} onClick={onTask} className="w-full flex items-center gap-2 p-2.5 rounded-lg text-sm text-slate-700 dark:text-slate-200 hover:bg-indigo-50 dark:hover:bg-slate-800 focus:bg-indigo-50 focus:outline-hidden"><CheckSquare className="w-4 h-4 text-indigo-600" />ایجاد وظیفه</button>
    <button type="button" role="menuitem" disabled={!canCreateMeeting} title={meetingReason} onClick={onMeeting} className="w-full flex items-center gap-2 p-2.5 rounded-lg text-sm text-slate-700 dark:text-slate-200 hover:bg-sky-50 dark:hover:bg-slate-800 focus:bg-sky-50 focus:outline-hidden disabled:opacity-40 disabled:cursor-not-allowed"><CalendarDays className="w-4 h-4 text-sky-600" />ایجاد جلسه</button>
  </div>,document.body);
}
