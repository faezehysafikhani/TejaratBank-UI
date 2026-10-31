import React from 'react';
import { Search, ChevronRight, ChevronLeft, AlertCircle, CheckCircle2, X } from 'lucide-react';
import { toPersianDigits } from '../../utils/helpers';

/** Shared building blocks of the administration screens (Settings), in one visual language. */

export const AdminCard: React.FC<{ className?: string; children: React.ReactNode }> = ({ className = '', children }) => (
  <div className={`bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-[0_8px_28px_-24px_rgba(15,23,42,0.4)] ${className}`}>
    {children}
  </div>
);

export interface TabItem<T extends string> {
  id: T;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

/** The main navigation of a settings page: a soft track with the active tab raised. */
export function SegmentedTabs<T extends string>({ tabs, active, onChange }: { tabs: TabItem<T>[]; active: T; onChange: (id: T) => void }) {
  return (
    <div className="flex gap-1 p-1.5 bg-slate-100/80 dark:bg-slate-800/70 rounded-2xl overflow-x-auto" role="tablist">
      {tabs.map(({ id, label, icon: Icon }) => {
        const selected = id === active;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold whitespace-nowrap transition-all cursor-pointer ${
              selected
                ? 'bg-white dark:bg-slate-900 text-indigo-800 dark:text-indigo-300 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Icon className="w-4 h-4" />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Secondary navigation inside a tab: separate pills, the active one filled. */
export function PillTabs<T extends string>({ tabs, active, onChange, compact = false }: { tabs: TabItem<T>[]; active: T; onChange: (id: T) => void; compact?: boolean }) {
  return (
    <div className={compact ? "grid grid-cols-2 sm:grid-cols-4 gap-1 rounded-xl bg-slate-100/80 dark:bg-slate-800/70 p-1" : "flex flex-wrap gap-2"} role="tablist">
      {tabs.map(({ id, label, icon: Icon }) => {
        const selected = id === active;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(id)}
            className={`flex items-center justify-center gap-1.5 rounded-lg font-bold border transition-all cursor-pointer ${compact ? 'px-2 py-2 text-xs' : 'px-4 py-2.5 text-sm'} ${
              selected
                ? 'bg-indigo-800 border-indigo-800 text-white shadow-sm dark:bg-indigo-600 dark:border-indigo-600'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-indigo-300'
            }`}
          >
            <Icon className="w-4 h-4" />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

export const SearchBox: React.FC<{ value: string; onChange: (value: string) => void; placeholder: string }> = ({ value, onChange, placeholder }) => (
  <div className="relative w-full sm:w-80">
    <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
    <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full pr-10 pl-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400"
    />
  </div>
);

export type BadgeTone = 'green' | 'red' | 'amber' | 'slate' | 'indigo';

const BADGE_TONES: Record<BadgeTone, string> = {
  green: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800',
  red: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800',
  amber: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800',
  slate: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
  indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-300 dark:border-indigo-800',
};

export const StatusBadge: React.FC<{ tone: BadgeTone; children: React.ReactNode; title?: string }> = ({ tone, children, title }) => (
  <span title={title} className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-xs font-bold whitespace-nowrap ${BADGE_TONES[tone]}`}>
    {children}
  </span>
);

export const IconAction: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  tone?: 'indigo' | 'rose' | 'emerald';
  disabled?: boolean;
  disabledReason?: string;
}> = ({ icon: Icon, label, onClick, tone = 'indigo', disabled, disabledReason }) => {
  const tones = {
    indigo: 'text-indigo-700 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-950/60',
    rose: 'text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/60',
    emerald: 'text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/60',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={disabled ? disabledReason || label : label}
      aria-label={label}
      className={`p-2 rounded-lg transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent ${tones[tone]}`}
    >
      <Icon className="w-[18px] h-[18px]" />
    </button>
  );
};

export const Pagination: React.FC<{ page: number; pageSize: number; total: number; onPage: (page: number) => void }> = ({ page, pageSize, total, onPage }) => {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-5 py-3.5 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
      <span>
        نمایش {toPersianDigits(from)} تا {toPersianDigits(to)} از {toPersianDigits(total)} مورد
      </span>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
          aria-label="صفحه قبل"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <span className="px-2 font-bold text-slate-700 dark:text-slate-200">
          صفحه {toPersianDigits(page)} از {toPersianDigits(pages)}
        </span>
        <button
          type="button"
          onClick={() => onPage(page + 1)}
          disabled={page >= pages}
          className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
          aria-label="صفحه بعد"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export const Field: React.FC<{ label: string; hint?: string; required?: boolean; children: React.ReactNode; className?: string }> = ({ label, hint, required, children, className = '' }) => (
  <label className={`block ${className}`}>
    <span className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
      {label} {required && <span className="text-rose-500">*</span>}
    </span>
    {children}
    {hint && <span className="block text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">{hint}</span>}
  </label>
);

export const inputClass =
  'w-full px-3 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400 disabled:bg-slate-50 disabled:text-slate-400 dark:disabled:bg-slate-800/50';

export const Toggle: React.FC<{ checked: boolean; onChange: (value: boolean) => void; label: string; description?: string; disabled?: boolean }> = ({ checked, onChange, label, description, disabled }) => (
  <label className={`flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 ${disabled ? 'opacity-60' : 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60'}`}>
    <span>
      <span className="block text-sm font-bold text-slate-800 dark:text-slate-100">{label}</span>
      {description && <span className="block text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{description}</span>}
    </span>
    <input type="checkbox" className="sr-only" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
    <span aria-hidden className={`w-10 h-6 rounded-full p-0.5 flex transition-colors shrink-0 ${checked ? 'bg-indigo-700 justify-start' : 'bg-slate-300 dark:bg-slate-600 justify-end'}`}>
      <span className="w-5 h-5 bg-white rounded-full shadow-sm" />
    </span>
  </label>
);

export const Notice: React.FC<{ type: 'success' | 'error' | 'info'; children: React.ReactNode; onClose?: () => void }> = ({ type, children, onClose }) => {
  const styles = {
    success: 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/50 dark:border-emerald-800 dark:text-emerald-200',
    error: 'bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/50 dark:border-rose-800 dark:text-rose-200',
    info: 'bg-indigo-50 border-indigo-200 text-indigo-800 dark:bg-indigo-950/50 dark:border-indigo-800 dark:text-indigo-200',
  };
  const Icon = type === 'success' ? CheckCircle2 : AlertCircle;
  return (
    <div role={type === 'error' ? 'alert' : 'status'} className={`flex items-start gap-2 p-3 rounded-xl border text-sm ${styles[type]}`}>
      <Icon className="w-4 h-4 shrink-0 mt-0.5" />
      <div className="flex-1 leading-relaxed">{children}</div>
      {onClose && (
        <button type="button" onClick={onClose} className="opacity-60 hover:opacity-100 cursor-pointer" aria-label="بستن">
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};

/** A modal dialog for the administration forms. */
export const AdminDialog: React.FC<{ title: string; onClose: () => void; children: React.ReactNode; footer: React.ReactNode; wide?: boolean; compact?: boolean }> = ({ title, onClose, children, footer, wide, compact = false }) => {
  const box = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    // Focus lands in the dialog (its first field, else the dialog itself) so the keyboard — Esc included — works at once.
    const el = box.current;
    if (el && !el.contains(document.activeElement)) (el.querySelector<HTMLElement>('input,select,textarea') ?? el).focus();
  }, []);
  return (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-xs" onClick={(e) => e.target === e.currentTarget && onClose()}>
    <div ref={box} tabIndex={-1} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }} role="dialog" aria-modal="true" aria-label={title} className={`w-full ${compact ? 'max-w-2xl' : wide ? 'max-w-3xl' : 'max-w-xl'} max-h-[90vh] flex flex-col bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 focus:outline-hidden`}>
      <div className={`flex items-center justify-between border-b border-slate-100 dark:border-slate-800 ${compact ? 'px-4 py-3' : 'px-5 py-4'}`}>
        <h3 className="text-base font-extrabold text-slate-900 dark:text-white">{title}</h3>
        <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer" aria-label="بستن">
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className={compact ? "px-4 py-3 overflow-y-auto overscroll-contain flex-1 space-y-3" : "px-5 py-4 overflow-y-auto flex-1 space-y-4"}>{children}</div>
      <div className={`flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 dark:border-slate-800 ${compact ? 'px-4 py-2.5' : 'px-5 py-3.5'}`}>{footer}</div>
    </div>
  </div>
  );
};

export const PrimaryButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ className = '', ...props }) => (
  <button
    {...props}
    className={`inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-800 hover:bg-indigo-900 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white text-sm font-bold shadow-sm transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
  />
);

export const SecondaryButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ className = '', ...props }) => (
  <button
    {...props}
    className={`inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
  />
);

/** Persian and Arabic-Indic digits typed into a numeric field become the digits they are. */
export function toLatinDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

/** Debounces a value (e.g. a search box) so the server is asked once the user pauses. */
export function useDebounced<T>(value: T, delayMs = 350): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
