import React from 'react';
import { toPersianDigits } from '../../utils/helpers';
import { gregorianToJalali } from '../../utils/jalali';

// Pieces the three report pages share: Jalali day text, a titled group of controls, a summary card.

/** A Gregorian yyyy-MM-dd as a Jalali date (۱۴۰۵/۰۷/۲۰). */
export function jalaliDate(isoDate: string | null | undefined): string {
  if (!isoDate) return '';
  const [gy, gm, gd] = isoDate.slice(0, 10).split('-').map(Number);
  if (!gy || !gm || !gd) return '';
  const { jy, jm, jd } = gregorianToJalali(gy, gm, gd);
  return toPersianDigits(`${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`);
}

/** The Iran-calendar day (UTC+03:30) of a UTC timestamp, as yyyy-MM-dd. */
export const iranDay = (utc: string) => new Date(new Date(utc).getTime() + 3.5 * 3600 * 1000).toISOString().slice(0, 10);


/**
 * A titled group of several controls. Not a <label> like Field: a label forwards clicks to its
 * first control, so clearing the date (whose button then disappears) would set it again.
 */
export const FieldGroup: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
  <div role="group" aria-label={label}>
    <span className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">{label}</span>
    {children}
    {hint && <span className="block text-[11px] text-slate-500 dark:text-slate-400 mt-1">{hint}</span>}
  </div>
);

export type CardTheme = 'indigo' | 'slate' | 'blue' | 'amber' | 'emerald' | 'rose';

const CARD_THEMES: Record<CardTheme, { box: string; value: string; icon: string }> = {
  indigo: { box: 'bg-indigo-50 border-indigo-200 dark:bg-indigo-950/40 dark:border-indigo-900', value: 'text-indigo-700 dark:text-indigo-300', icon: 'text-indigo-400 dark:text-indigo-500' },
  slate: { box: 'bg-slate-50 border-slate-200 dark:bg-slate-800/60 dark:border-slate-700', value: 'text-slate-700 dark:text-slate-200', icon: 'text-slate-400 dark:text-slate-500' },
  blue: { box: 'bg-sky-50 border-sky-200 dark:bg-sky-950/40 dark:border-sky-900', value: 'text-sky-700 dark:text-sky-300', icon: 'text-sky-400 dark:text-sky-500' },
  amber: { box: 'bg-amber-50 border-amber-200 dark:bg-amber-950/40 dark:border-amber-900', value: 'text-amber-700 dark:text-amber-300', icon: 'text-amber-400 dark:text-amber-500' },
  emerald: { box: 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-900', value: 'text-emerald-700 dark:text-emerald-300', icon: 'text-emerald-400 dark:text-emerald-500' },
  rose: { box: 'bg-rose-50 border-rose-200 dark:bg-rose-950/40 dark:border-rose-900', value: 'text-rose-700 dark:text-rose-300', icon: 'text-rose-400 dark:text-rose-500' },
};

export const SummaryCard: React.FC<{
  label: string; value: number; theme: CardTheme; icon: React.ElementType; active?: boolean; onClick?: () => void;
}> = ({ label, value, theme, icon: Icon, active, onClick }) => {
  const t = CARD_THEMES[theme];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`relative w-full lg:w-[68%] text-right px-2.5 py-1.5 rounded-lg border transition-all ${t.box} ${onClick ? 'cursor-pointer hover:shadow-md' : 'cursor-default'} ${
        active ? 'ring-[3px] ring-indigo-500 shadow-lg shadow-indigo-500/25 -translate-y-0.5' : ''
      }`}
    >
      {active && <span className="absolute -top-2 left-2 text-[10px] font-bold bg-indigo-600 text-white rounded-full px-2 py-px">فیلتر فعال</span>}
      <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">{label}</div>
      <div className={`text-lg font-black leading-tight ${t.value}`}>{toPersianDigits(value)}</div>
      <Icon className={`absolute bottom-1 left-1.5 w-3.5 h-3.5 ${t.icon}`} aria-hidden="true" />
    </button>
  );
};


/** The date and time of a printout in Iran time: «۱۴۰۵/۰۸/۱۱ — ساعت ۱۰:۳۰». */
export function printedAtText(): string {
  const now = new Date();
  const iran = new Date(now.getTime() + 3.5 * 3600 * 1000).toISOString();
  return `${jalaliDate(iran.slice(0, 10))} — ساعت ${toPersianDigits(iran.slice(11, 16))}`;
}
