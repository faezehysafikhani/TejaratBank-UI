import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Briefcase, Check, ChevronDown, X } from 'lucide-react';
import { ALL_POSTS, ActivePostOption, HiddenInfo, hiddenTotal, selectActivePost, useActivePost } from '../utils/activePost';
import { toPersianDigits } from '../utils/helpers';

const MENU_WIDTH = 270;
const GAP = 12;
const EDGE = 8;

const HIDDEN_NOTE = 'فقط فعالیت‌ها و گزارش‌های این پست دیده می‌شود و دسترسی‌ها همان دسترسی‌های شخصی شما به‌علاوهٔ دسترسی‌های این پست (و سمتش) است.';

/** «بدون پست ۱، جانشینی ۲، پست دیگر ۱» */
const reasons = (h: HiddenInfo) => [
  h.noPost ? `بدون پست ${toPersianDigits(h.noPost)}` : '',
  h.standIn ? `جانشینی ${toPersianDigits(h.standIn)}` : '',
  h.other ? `پست دیگر ${toPersianDigits(h.other)}` : '',
].filter(Boolean).join('، ');

interface Pos { top: number; left: number; from: 'left' | 'right' | 'top' }

/** Where the menu goes: beside the card (towards the page, 12px away) and flipped when there is no room; under a chip. */
function place(anchor: DOMRect, placement: 'side' | 'below', menuHeight: number): Pos {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const clampTop = (top: number) => Math.max(EDGE, Math.min(top, vh - menuHeight - EDGE));
  if (placement === 'below') {
    // RTL: the menu's end edge lines up with the chip's.
    const left = Math.max(EDGE, Math.min(anchor.right - MENU_WIDTH, vw - MENU_WIDTH - EDGE));
    return { top: clampTop(anchor.bottom + 8), left, from: 'top' };
  }
  const toTheLeft = anchor.left - GAP - MENU_WIDTH;
  if (toTheLeft >= EDGE) return { top: clampTop(anchor.top), left: toTheLeft, from: 'right' };
  const toTheRight = anchor.right + GAP;
  if (toTheRight + MENU_WIDTH <= vw - EDGE) return { top: clampTop(anchor.top), left: toTheRight, from: 'left' };
  return { top: clampTop(anchor.bottom + 8), left: Math.max(EDGE, Math.min(anchor.left, vw - MENU_WIDTH - EDGE)), from: 'top' };
}

const Menu: React.FC<{
  anchorRef: React.RefObject<HTMLElement | null>;
  placement: 'side' | 'below';
  options: ActivePostOption[];
  selectedKey: string;
  listId: string;
  activeIndex: number;
  setActiveIndex: (i: number) => void;
  onPick: (key: string) => void;
  onClose: () => void;
}> = ({ anchorRef, placement, options, selectedKey, listId, activeIndex, setActiveIndex, onPick, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Pos | null>(null);
  const [entered, setEntered] = useState(false);

  const reposition = useCallback(() => {
    const anchor = anchorRef.current;
    const menu = menuRef.current;
    if (!anchor || !menu) return;
    setPos(place(anchor.getBoundingClientRect(), placement, menu.offsetHeight));
  }, [anchorRef, placement]);

  useLayoutEffect(() => { reposition(); }, [reposition, options.length]);
  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true));
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    menuRef.current?.focus({ preventScroll: true });
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [reposition]);

  // A click outside (the trigger toggles by itself).
  useEffect(() => {
    const onPointer = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('touchstart', onPointer);
    return () => { document.removeEventListener('mousedown', onPointer); document.removeEventListener('touchstart', onPointer); };
  }, [anchorRef, onClose]);

  // Keys are read on the document while the menu is open (the menu itself may not hold focus yet).
  const keyState = useRef({ activeIndex, options, onPick, onClose, setActiveIndex });
  keyState.current = { activeIndex, options, onPick, onClose, setActiveIndex };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { activeIndex: idx, options: list, onPick: pick, onClose: close, setActiveIndex: setIdx } = keyState.current;
      const last = list.length - 1;
      if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(idx >= last ? 0 : idx + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx(idx <= 0 ? last : idx - 1); }
      else if (e.key === 'Home') { e.preventDefault(); setIdx(0); }
      else if (e.key === 'End') { e.preventDefault(); setIdx(last); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(list[idx].key); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
      else if (e.key === 'Tab') close();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, []);

  const offset = pos?.from === 'right' ? 'translateX(8px)' : pos?.from === 'left' ? 'translateX(-8px)' : 'translateY(-6px)';
  return createPortal(
    <div
      ref={menuRef}
      id={listId}
      role="listbox"
      tabIndex={-1}
      aria-label="پست نمایش"
      aria-activedescendant={`${listId}-${activeIndex}`}
      dir="rtl"
      className="fixed z-[70] rounded-2xl bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 p-1.5 outline-none"
      style={{
        width: MENU_WIDTH,
        top: pos?.top ?? 0,
        left: pos?.left ?? 0,
        visibility: pos ? 'visible' : 'hidden',
        boxShadow: '0 16px 40px rgba(15,23,42,.22)',
        opacity: entered && pos ? 1 : 0,
        transform: entered && pos ? 'none' : offset,
        transition: 'opacity 180ms ease, transform 180ms ease',
      }}
    >
      <div className="px-3 pt-1.5 pb-2 text-[11px] font-bold text-slate-500 dark:text-slate-400">سامانه را بر اساس این پست نمایش بده:</div>
      {options.map((o, i) => {
        const selected = o.key === selectedKey;
        return (
          <React.Fragment key={o.key}>
            <button
              type="button"
              id={`${listId}-${i}`}
              role="option"
              aria-selected={selected}
              tabIndex={-1}
              onClick={() => onPick(o.key)}
              onMouseEnter={() => setActiveIndex(i)}
              className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-right cursor-pointer transition-colors ${
                selected ? 'bg-indigo-50 dark:bg-indigo-500/15' : i === activeIndex ? 'bg-slate-100 dark:bg-slate-800' : ''
              }`}
            >
              <span className="min-w-0">
                <span className={`block text-xs leading-5 ${selected ? 'font-extrabold text-indigo-700 dark:text-indigo-200' : 'font-bold'}`}>{o.title}</span>
                {o.subtitle && <span className="block text-[10.5px] leading-4 text-slate-500 dark:text-slate-400">{o.key.startsWith('unit:') ? toPersianDigits(o.subtitle) : o.subtitle}</span>}
              </span>
              {selected && <Check className="w-4 h-4 text-indigo-600 dark:text-indigo-300 shrink-0" aria-hidden="true" />}
            </button>
            {i === 0 && <div className="my-1 mx-2 h-px bg-slate-200 dark:bg-slate-700" role="separator" />}
          </React.Fragment>
        );
      })}
    </div>,
    document.body,
  );
};

/**
 * «حالت نمایش پست»: only for a person who holds more than one post. variant «card» sits at the top of the
 * sidebar; «chip» is the one in the header (the sidebar no longer has it). Both open the same menu and use the
 * same state. It narrows what the screens show, and the server then counts only the chosen post's permissions
 * (besides the person's own).
 */
export const ActivePostSwitcher: React.FC<{ variant?: 'card' | 'chip'; hidden?: HiddenInfo; className?: string }> = ({ variant = 'card', hidden, className = '' }) => {
  const view = useActivePost();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const listId = useId();

  const close = useCallback(() => setOpen(false), []);
  const toggle = () => {
    if (!open) setActiveIndex(Math.max(0, view.options.findIndex((o) => o.key === view.selected.key)));
    setOpen((v) => !v);
  };
  const pick = (key: string) => { selectActivePost(key); setOpen(false); anchorRef.current?.focus(); };
  const onTriggerKey = (e: React.KeyboardEvent) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); toggle(); }
  };

  if (!view.canSwitch) return null;
  const aria = { 'aria-haspopup': 'listbox' as const, 'aria-expanded': open, 'aria-controls': open ? listId : undefined };
  const title = 'نمایش سامانه بر اساس یکی از پست‌های شما';

  const menu = open && (
    <Menu
      anchorRef={anchorRef}
      placement={variant === 'card' ? 'side' : 'below'}
      options={view.options}
      selectedKey={view.selected.key}
      listId={listId}
      activeIndex={activeIndex}
      setActiveIndex={setActiveIndex}
      onPick={pick}
      onClose={close}
    />
  );

  if (variant === 'chip') {
    return (
      <div className={className} data-testid="active-post-switcher-chip">
        <button
          ref={anchorRef}
          type="button"
          onClick={toggle}
          onKeyDown={onTriggerKey}
          {...aria}
          title={view.narrowed ? `${title}. ${HIDDEN_NOTE}${hidden && hiddenTotal(hidden) > 0 ? `\n${toPersianDigits(hiddenTotal(hidden))} فعالیت پنهان (${reasons(hidden)})` : ''}` : title}
          className={`inline-flex items-center gap-1.5 max-w-[11rem] px-2.5 py-1.5 rounded-full border text-[11px] font-bold cursor-pointer transition-colors ${
            view.narrowed ? 'bg-indigo-500/20 border-indigo-300/40 text-indigo-100' : 'bg-white/10 border-white/20 text-slate-200 hover:bg-white/15'
          }`}
        >
          <Briefcase className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{view.narrowed ? view.selected.title : 'همهٔ پست‌ها'}</span>
          {view.narrowed && hidden && hiddenTotal(hidden) > 0 && (
            <span className="shrink-0 min-w-[1.1rem] px-1 rounded-full bg-amber-400 text-amber-950 text-[10px] leading-4 text-center" data-testid="active-post-hidden-chip">{toPersianDigits(hiddenTotal(hidden))}</span>
          )}
          <ChevronDown className="w-3 h-3 shrink-0" aria-hidden="true" />
        </button>
        {menu}
      </div>
    );
  }

  return (
    <div className={`space-y-1 ${className}`} data-testid="active-post-switcher">
      <div className="flex items-center justify-between gap-2 px-0.5">
        <span className="flex items-center gap-1.5 text-[11px] font-extrabold opacity-75 text-slate-700 dark:text-slate-200">
          <span className="w-[3px] h-3 rounded-full bg-gradient-to-b from-indigo-500 to-violet-500 shrink-0" aria-hidden="true" />
          حالت نمایش پست
        </span>
        {view.narrowed && (
          <button
            type="button"
            onClick={() => selectActivePost(ALL_POSTS)}
            title="نمایش همهٔ پست‌ها"
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/10 text-indigo-700 dark:text-indigo-200 border border-indigo-500/25 hover:bg-indigo-500/20 cursor-pointer"
          >
            همه <X className="w-3 h-3" aria-hidden="true" />
          </button>
        )}
      </div>
      <button
        ref={anchorRef}
        type="button"
        onClick={toggle}
        onKeyDown={onTriggerKey}
        {...aria}
        title={title}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-right cursor-pointer border border-indigo-500/[0.28] hover:border-indigo-500/50 bg-gradient-to-br from-indigo-500/10 to-violet-500/[0.08] text-indigo-700 dark:text-indigo-200 hover:shadow-md hover:shadow-indigo-500/10 transition-all"
      >
        <Briefcase className="w-4 h-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1 text-xs font-bold leading-5 break-words line-clamp-2">{view.narrowed ? view.selected.label : 'همهٔ پست‌ها'}</span>
        <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${open ? '-rotate-90' : 'rotate-90'}`} aria-hidden="true" />
      </button>
      {view.narrowed && hidden && hiddenTotal(hidden) > 0 && (
        <button
          type="button"
          onClick={() => selectActivePost(ALL_POSTS)}
          className="w-full text-right inline-flex items-start gap-1.5 px-2 py-1 rounded-lg text-[10px] leading-4 font-semibold bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-500/30 cursor-pointer hover:bg-amber-100 dark:hover:bg-amber-500/20"
          title={`${HIDDEN_NOTE}\n${hidden.titles.map((t) => `• ${t}`).join('\n')}\nبرای دیدن همه کلیک کنید.`}
          data-testid="active-post-hidden-chip"
        >
          <span className="w-1.5 h-1.5 mt-1 rounded-full bg-amber-500 shrink-0" aria-hidden="true" />
          <span>{toPersianDigits(hiddenTotal(hidden))} فعالیت پنهان ({reasons(hidden)})</span>
        </button>
      )}
      {menu}
    </div>
  );
};
