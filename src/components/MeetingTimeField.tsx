import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Clock3, Check } from 'lucide-react';
import { toLatinDigits } from './admin/AdminUi';
import { toPersianDigits } from '../utils/helpers';

export function normalizeMeetingTime(value: string): string | null {
  let text=toLatinDigits(value).trim();
  if (/^\d{1,2}$/.test(text)) text=text+':00';
  else if (/^\d{3,4}$/.test(text)) text=text.padStart(4,'0').slice(0,2)+':'+text.padStart(4,'0').slice(2);
  const match=/^(\d{1,2}):(\d{1,2})$/.exec(text);
  if(!match || Number(match[1])>23 || Number(match[2])>59)return null;
  return match[1].padStart(2,'0')+':'+match[2].padStart(2,'0');
}

export function MeetingTimeField({value,onChange,ariaLabel,disabled=false}:{value:string;onChange:(value:string)=>void;ariaLabel:string;disabled?:boolean}) {
  const [open,setOpen]=useState(false);const root=useRef<HTMLDivElement>(null);const popup=useRef<HTMLDivElement>(null);const input=useRef<HTMLInputElement>(null);
  const [position,setPosition]=useState({top:0,left:0,width:288});
  const normalized=normalizeMeetingTime(value);const [hour,minute]=(normalized||'00:00').split(':').map(Number);
  const minutes=Array.from(new Set([...Array.from({length:12},(_,i)=>i*5),minute])).sort((a,b)=>a-b);
  const change=(h:number,m:number)=>onChange(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`);
  const close=()=>{setOpen(false);input.current?.focus({preventScroll:true});};
  useLayoutEffect(()=>{
    if(!open)return;
    const place=()=>{const box=root.current?.getBoundingClientRect();if(!box)return;const width=Math.min(288,window.innerWidth-16),height=popup.current?.offsetHeight||340;const top=window.innerHeight-box.bottom-8>=height?box.bottom+6:box.top-height-6;setPosition({width,left:Math.max(8,Math.min(box.right-width,window.innerWidth-width-8)),top:Math.max(8,Math.min(top,window.innerHeight-height-8))});};
    place();window.addEventListener('resize',place);window.addEventListener('scroll',place,true);
    return()=>{window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);};
  },[open,value]);
  useEffect(()=>{
    if(!open)return;
    const outside=(e:MouseEvent)=>{if(!root.current?.contains(e.target as Node)&&!popup.current?.contains(e.target as Node)){if(popup.current?.contains(document.activeElement))(document.activeElement as HTMLElement)?.blur();setOpen(false);}};
    const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}};
    const panel=popup.current;
    const wheel=(e:WheelEvent)=>{if(panel && panel.scrollHeight<=panel.clientHeight)e.preventDefault();};
    document.addEventListener('mousedown',outside);document.addEventListener('keydown',escape,true);panel?.addEventListener('wheel',wheel,{passive:false});
    return()=>{document.removeEventListener('mousedown',outside);document.removeEventListener('keydown',escape,true);panel?.removeEventListener('wheel',wheel);};
  },[open]);
  useEffect(()=>{if(disabled)setOpen(false);},[disabled]);
  return <div ref={root} className="relative flex items-center rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus-within:ring-2 focus-within:ring-indigo-400 focus-within:border-indigo-400 transition-shadow">
    <input ref={input} style={{outline:'none',boxShadow:'none'}} aria-label={ariaLabel} inputMode="numeric" autoComplete="off" dir="ltr" value={toPersianDigits(value)} disabled={disabled} maxLength={5}
      onFocus={e=>e.currentTarget.select()} onClick={()=>setOpen(true)}
      onChange={e=>onChange(toLatinDigits(e.target.value).replace(/[^0-9:]/g,''))} onBlur={()=>{const text=normalizeMeetingTime(value);if(text && text!==value)onChange(text);}}
      placeholder="۰۹:۰۰" className="w-full min-w-0 py-2.5 pl-4 pr-11 text-center text-sm tracking-wider font-extrabold tabular-nums bg-transparent focus:outline-hidden text-slate-800 dark:text-slate-100 disabled:opacity-60" />
    <button type="button" aria-label={`انتخاب ${ariaLabel}`} aria-haspopup="dialog" aria-expanded={open} disabled={disabled} onClick={()=>setOpen(v=>!v)} className="absolute right-2 p-2 rounded-lg text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-950 disabled:opacity-50"><Clock3 className="w-4 h-4" /></button>
    {open&&createPortal(<div ref={popup} role="dialog" aria-label={`انتخاب ${ariaLabel}`} dir="rtl" style={{...position,position:'fixed',zIndex:1000,maxHeight:'calc(100dvh - 16px)',overflowY:'auto',overscrollBehavior:'contain'}} className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl p-3 space-y-3">
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2"><span className="text-xs font-bold text-slate-600 dark:text-slate-300">{ariaLabel}</span><div dir="ltr" className="flex items-center gap-1 text-indigo-700 dark:text-indigo-300"><TimePart value={hour} max={23} label={`${ariaLabel}، ساعت`} onChange={h=>change(h,minute)}/><b>:</b><TimePart value={minute} max={59} label={`${ariaLabel}، دقیقه`} onChange={m=>change(hour,m)}/></div></div>
      <div><p className="text-[11px] text-slate-400 mb-1.5">ساعت</p><div className="grid grid-cols-6 gap-1" dir="ltr">{Array.from({length:24},(_,h)=><button type="button" key={h} aria-label={`ساعت ${toPersianDigits(String(h).padStart(2,'0'))}`} aria-pressed={h===hour} onClick={()=>change(h,minute)} className={`h-7 rounded-lg text-xs font-bold transition-colors ${h===hour?'bg-indigo-600 text-white shadow-sm':'text-slate-600 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-slate-800'}`}>{toPersianDigits(String(h).padStart(2,'0'))}</button>)}</div></div>
      <div><p className="text-[11px] text-slate-400 mb-1.5">دقیقه</p><div className="grid grid-cols-6 gap-1" dir="ltr">{minutes.map(m=><button type="button" key={m} aria-label={`دقیقه ${toPersianDigits(String(m).padStart(2,'0'))}`} aria-pressed={m===minute} onClick={()=>change(hour,m)} className={`h-7 rounded-lg text-xs font-bold ${m===minute?'bg-indigo-600 text-white':'text-slate-600 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-slate-800'}`}>{toPersianDigits(String(m).padStart(2,'0'))}</button>)}</div></div>
      <div className="flex justify-between items-center pt-2 border-t border-slate-100 dark:border-slate-800"><span className="text-[10px] text-slate-400">فرمت ۲۴ ساعته</span><button type="button" onClick={close} className="flex items-center gap-1 bg-indigo-600 text-white text-xs font-bold rounded-lg px-3 py-1.5"><Check className="w-3 h-3" />تأیید ساعت</button></div>
    </div>,document.body)}
  </div>;
}

function TimePart({value,max,label,onChange}:{value:number;max:number;label:string;onChange:(value:number)=>void}) {
  const field=useRef<HTMLInputElement>(null);
  const [draft,setDraft]=useState(String(value).padStart(2,'0'));
  useEffect(()=>{if(document.activeElement!==field.current)setDraft(String(value).padStart(2,'0'));},[value]);
  return <input ref={field} aria-label={label} inputMode="numeric" autoComplete="off" dir="ltr" maxLength={2}
    value={toPersianDigits(draft)} onFocus={e=>e.currentTarget.select()} aria-invalid={!!draft && Number(draft)>max}
    onChange={e=>setDraft(toLatinDigits(e.target.value).replace(/[^0-9]/g,''))}
    onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();e.currentTarget.blur();}}}
    onBlur={()=>{const number=Number(draft);if(draft && number<=max){onChange(number);setDraft(String(number).padStart(2,'0'));}else setDraft(String(value).padStart(2,'0'));}}
    className="w-10 h-9 text-center text-lg font-extrabold tabular-nums rounded-lg bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-100 dark:border-indigo-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-400"/>;
}
