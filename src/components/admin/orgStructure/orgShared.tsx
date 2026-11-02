import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, X, UserRound } from 'lucide-react';
import { AdminUser, listUsersPage } from '../../../services/nexusApi';
import { inputClass, useDebounced } from '../AdminUi';
import { userErrorMessage } from '../../../utils/errorMessages';

/** Loads data once (and again on reload()); errors become a Persian message. */
export function useLoad<T>(load: () => Promise<T>, fallbackError: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadRef = useRef(load);
  loadRef.current = load;

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await loadRef.current());
    } catch (err) {
      setError(userErrorMessage(err, fallbackError));
    } finally {
      setLoading(false);
    }
  }, [fallbackError]);

  useEffect(() => { reload(); }, [reload]);
  return { data, loading, error, reload, setData };
}

/** Names of up to the first 100 users of the organization (for showing unit managers). */
export function useUserNames(): Map<string, string> {
  const [names, setNames] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    let alive = true;
    listUsersPage({ page: 1, pageSize: 100 })
      .then((page) => alive && setNames(new Map(page.items.map((u) => [u.id, u.displayName || u.username]))))
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  return names;
}

export const LoadingRow: React.FC<{ text?: string }> = ({ text = 'در حال دریافت اطلاعات...' }) => (
  <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500 dark:text-slate-400">
    <Loader2 className="w-4 h-4 animate-spin" />
    <span>{text}</span>
  </div>
);

export const EmptyRow: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">{children}</div>
);

/**
 * Picks one user of the organization by name, username or phone (searches the server).
 * Needs the users.view permission; without it, the field explains that instead.
 * Its clicks cancel their default action: inside a <label> (Field), a click that removes the
 * clicked option would otherwise be forwarded to the label's first control - the new chip's
 * clear button - and undo the choice at once.
 */
export const UserPicker: React.FC<{
  value: string | null;
  valueLabel?: string | null;
  onChange: (userId: string | null, displayName: string | null) => void;
  placeholder?: string;
  excludeIds?: string[];
  disabled?: boolean;
}> = ({ value, valueLabel, onChange, placeholder = 'جستجوی نام، کد ملی یا شماره همراه...', excludeIds = [], disabled }) => {
  const [query, setQuery] = useState('');
  const debounced = useDebounced(query, 300);
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<AdminUser[]>([]);
  // The search the results are for: results of an earlier search are never shown (or clickable)
  // under a newer one, so a quick click can't pick the wrong person.
  const [resultsFor, setResultsFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setBusy(true);
    listUsersPage({ page: 1, pageSize: 20, search: debounced })
      .then((page) => alive && (setResults(page.items), setResultsFor(debounced), setDenied(false)))
      .catch(() => alive && setDenied(true))
      .finally(() => alive && setBusy(false));
    return () => { alive = false; };
  }, [debounced, open]);

  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/60 dark:bg-indigo-950/40 text-sm">
        <span className="flex items-center gap-2 font-bold text-indigo-900 dark:text-indigo-200 min-w-0">
          <UserRound className="w-4 h-4 shrink-0" />
          <span className="truncate">{valueLabel || 'کاربر انتخاب‌شده'}</span>
        </span>
        {!disabled && (
          <button type="button" onClick={(e) => { e.preventDefault(); onChange(null, null); }} className="p-1 rounded-lg text-slate-400 hover:text-rose-600 cursor-pointer" aria-label="حذف انتخاب">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    );
  }

  const visible = results.filter((u) => !excludeIds.includes(u.id));
  return (
    <div className="relative">
      <input
        type="search"
        className={inputClass}
        value={query}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && (
        // In the flow of the form (not floating): a dialog grows to show it instead of cutting it off.
        <div role="listbox" aria-label="نتیجه‌ی جستجوی کاربر" className="mt-1.5 max-h-64 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800">
          {busy || resultsFor !== query ? (
            <div className="flex items-center gap-2 px-3 py-2.5 text-xs text-slate-500"><Loader2 className="w-3.5 h-3.5 animate-spin" /> در حال جستجو...</div>
          ) : denied ? (
            <div className="px-3 py-2.5 text-xs text-rose-600">برای انتخاب کاربر، دسترسی «مشاهده کاربران» لازم است.</div>
          ) : visible.length === 0 ? (
            <div className="px-3 py-2.5 text-xs text-slate-500">کاربری پیدا نشد.</div>
          ) : (
            visible.map((u) => (
              <button
                key={u.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => { e.preventDefault(); onChange(u.id, u.displayName || u.username); setQuery(''); setOpen(false); }}
                role="option"
                aria-selected="false"
                className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-right text-sm hover:bg-indigo-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                <span className="font-bold text-slate-800 dark:text-slate-100 truncate">{u.displayName || u.username}</span>
                <span className="text-[11px] text-slate-400 dir-ltr shrink-0">{u.username}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};
