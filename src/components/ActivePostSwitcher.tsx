import React, { useEffect, useRef, useState } from 'react';
import { Briefcase, Check, ChevronDown, Eye, X } from 'lucide-react';
import { ALL_POSTS, selectActivePost, useActivePost } from '../utils/activePost';
import { toPersianDigits } from '../utils/helpers';

/**
 * «نمایش بر اساس پست» (header): only for a person who holds more than one post. Picks one post, all
 * the posts of one unit, or all of them. It narrows what the screens show; it does not change what
 * the person is allowed to see.
 */
export const ActivePostSwitcher: React.FC = () => {
  const view = useActivePost();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (e: MouseEvent | TouchEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('touchstart', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('touchstart', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!view.canSwitch) return null;

  return (
    <div ref={ref} className="relative" data-testid="active-post-switcher">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="نمایش سامانه بر اساس یکی از پست‌های شما"
        className={`flex items-center gap-2 max-w-[16rem] px-3 py-2 rounded-xl border text-xs font-bold cursor-pointer transition-colors ${
          view.narrowed ? 'bg-emerald-600/90 border-emerald-300/50 text-white' : 'bg-white/10 border-white/20 text-slate-100 hover:bg-white/15'
        }`}
      >
        <Briefcase className="w-4 h-4 shrink-0" aria-hidden="true" />
        <span className="truncate">{view.narrowed ? view.selected.label : 'همهٔ پست‌ها'}</span>
        <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <div role="listbox" className="absolute z-50 mt-2 end-0 min-w-[16rem] max-w-[22rem] rounded-2xl bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 shadow-2xl p-1.5">
          <div className="px-3 py-1.5 text-[11px] text-slate-500 dark:text-slate-400">سامانه را بر اساس این پست نمایش بده:</div>
          {view.options.map((o) => {
            const active = o.key === view.selected.key;
            return (
              <button
                key={o.key}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => { selectActivePost(o.key); setOpen(false); }}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-xs text-right cursor-pointer ${active ? 'bg-emerald-50 dark:bg-emerald-950/50 font-extrabold' : 'hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold'}`}
              >
                <span className="truncate">{o.label}{o.key.startsWith('unit:') ? ` (${toPersianDigits(o.postIds.length)} پست)` : ''}</span>
                {active && <Check className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

/** A strip under the header while one post is chosen: what is shown, and the way back to all. */
export const ActivePostBanner: React.FC<{ hiddenWithoutPost: number }> = ({ hiddenWithoutPost }) => {
  const view = useActivePost();
  if (!view.narrowed) return null;
  return (
    <div className="mb-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-900 dark:text-emerald-100" role="status" data-testid="active-post-banner">
      <div className="px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span className="flex items-center gap-1.5 font-extrabold"><Eye className="w-4 h-4" aria-hidden="true" /> نمایش بر اساس: {view.selected.label}</span>
        <span className="text-emerald-800/80 dark:text-emerald-200/80">
          فقط فعالیت‌ها و گزارش‌های این پست دیده می‌شود. دسترسی شما تغییر نکرده است.
          {hiddenWithoutPost > 0 && ` ${toPersianDigits(hiddenWithoutPost)} فعالیت بدون پست مشخص در این حالت نمایش داده نمی‌شود.`}
        </span>
        <button type="button" onClick={() => selectActivePost(ALL_POSTS)} className="ms-auto inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/70 dark:bg-white/10 border border-emerald-300 dark:border-emerald-800 font-bold cursor-pointer hover:bg-white">
          <X className="w-3.5 h-3.5" aria-hidden="true" /> نمایش همه
        </button>
      </div>
    </div>
  );
};
