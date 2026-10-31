// «افزودن زیر X» / «ویرایش X»: the one form of the chart. Kind chips (only the kinds allowed here), a name box
// (one node per line when adding), the people of a position as chips, and «★ رئیس واحد است». Enter saves,
// Shift+Enter adds a line, Esc closes. Nothing is saved until the form is sent.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, X } from 'lucide-react';
import { PrimaryButton, SecondaryButton, inputClass } from '../../AdminUi';
import { listUsersPage } from '../../../../services/nexusApi';
import type { OrgKind } from '../../../../services/orgStructureApi';
import { userErrorMessage } from '../../../../utils/errorMessages';
import { toPersianDigits } from '../../../../utils/helpers';
import { ALLOWED_CHILDREN, DEFAULT_CHILD, KIND_INFO, type KindKey, canHaveHead } from './orgKinds';

export interface PersonChip { userId: string; displayName: string }

export interface KindFormValues {
  kind: OrgKind;
  /** One name per line. */
  names: string[];
  persons: PersonChip[];
  isHead: boolean;
}

interface Found { id: string; displayName: string }

/** The people of a position: chips, a search box; Enter picks the first result, Enter on an empty box sends the form. */
const PeopleField: React.FC<{ value: PersonChip[]; onChange: (next: PersonChip[]) => void; onSubmit: () => void; inputRef: React.RefObject<HTMLInputElement | null> }> = ({ value, onChange, onSubmit, inputRef }) => {
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<Found[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    const timer = setTimeout(() => {
      setBusy(true);
      listUsersPage({ page: 1, pageSize: 8, search: query })
        .then((page) => alive && setFound(page.items.filter((u) => !value.some((v) => v.userId === u.id)).map((u) => ({ id: u.id, displayName: u.displayName || u.username }))))
        .catch(() => alive && setFound([]))
        .finally(() => alive && setBusy(false));
    }, 250);
    return () => { alive = false; clearTimeout(timer); };
  }, [query, open, value]);

  const add = (user: Found) => {
    if (!value.some((v) => v.userId === user.id)) onChange([...value, { userId: user.id, displayName: user.displayName }]);
    setQuery('');
    setFound((prev) => prev.filter((f) => f.id !== user.id));
    inputRef.current?.focus();
  };

  return (
    <div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {value.map((p) => (
            <span key={p.userId} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 ps-3 pe-1.5 py-1 text-xs font-bold">
              {p.displayName}
              <button type="button" aria-label={`حذف ${p.displayName}`} onClick={() => onChange(value.filter((v) => v.userId !== p.userId))} className="rounded-full p-0.5 text-slate-400 hover:text-rose-600 cursor-pointer"><X className="w-3.5 h-3.5" /></button>
            </span>
          ))}
        </div>
      )}
      <input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        className={inputClass}
        value={query}
        placeholder="جستجوی کاربر؛ Enter برای افزودن..."
        aria-label="جستجوی کاربر"
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' || e.shiftKey) return;
          e.preventDefault();
          e.stopPropagation();
          if (query.trim() && found[0]) add(found[0]);
          else if (!query.trim()) onSubmit();
        }}
      />
      {open && (busy || found.length > 0) && (
        <div role="listbox" aria-label="نتیجه‌ی جستجو" className="mt-1.5 max-h-44 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
          {busy && found.length === 0 && <div className="flex items-center gap-2 px-3 py-2 text-xs text-slate-500"><Loader2 className="w-3.5 h-3.5 animate-spin" /> در حال جستجو...</div>}
          {found.map((u) => (
            <button key={u.id} type="button" role="option" aria-selected="false" onMouseDown={(e) => e.preventDefault()} onClick={() => add(u)} className="w-full text-right px-3 py-2 text-sm hover:bg-indigo-50 dark:hover:bg-slate-800 cursor-pointer">{u.displayName}</button>
          ))}
        </div>
      )}
    </div>
  );
};

export const KindNodeDialog: React.FC<{
  mode: 'add' | 'edit';
  /** The node's own kind when editing (cannot change); for adding: where it goes. */
  parentKind: KindKey;
  parentName: string;
  /** The names above, root first. */
  path: string[];
  initial?: { kind: OrgKind; name: string; persons: PersonChip[]; isHead: boolean };
  /** Whether «رئیس» is offered: the new node would be a direct position of a unit. */
  headAllowedUnder: boolean;
  /** Focus the people box first (from «+ شخص»). */
  focusPeople?: boolean;
  onSubmit: (values: KindFormValues, keepOpen: boolean) => Promise<void>;
  onClose: () => void;
}> = ({ mode, parentKind, parentName, path, initial, headAllowedUnder, focusPeople, onSubmit, onClose }) => {
  const kinds = mode === 'edit' ? [initial!.kind] : ALLOWED_CHILDREN[parentKind];
  const [kind, setKind] = useState<OrgKind>(initial?.kind ?? DEFAULT_CHILD[parentKind]);
  const [text, setText] = useState(initial?.name ?? '');
  const [persons, setPersons] = useState<PersonChip[]>(initial?.persons ?? []);
  const [isHead, setIsHead] = useState(initial?.isHead ?? false);
  const [keepOpen, setKeepOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const nameRef = useRef<HTMLTextAreaElement>(null);
  const peopleRef = useRef<HTMLInputElement>(null);
  const names = useMemo(() => text.split('\n').map((s) => s.trim()).filter(Boolean), [text]);

  useEffect(() => { (focusPeople && kind === 'position' ? peopleRef : nameRef).current?.focus(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async () => {
    if (busy) return;
    if (names.length === 0) { setInvalid(true); nameRef.current?.focus(); return; }
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ kind, names: mode === 'edit' ? [names.join(' ')] : names, persons: kind === 'position' ? persons : [], isHead: kind === 'position' && headAllowedUnder && isHead }, keepOpen);
      if (keepOpen && mode === 'add') { setText(''); setPersons([]); setIsHead(false); nameRef.current?.focus(); }
    } catch (err) {
      setError(userErrorMessage(err, 'ذخیره انجام نشد.'));
    } finally {
      setBusy(false);
    }
  };

  const title = mode === 'edit' ? `ویرایش «${initial!.name}»` : `افزودن زیر «${parentName}»`;
  const showHead = kind === 'position' && headAllowedUnder && (mode === 'add' || canHaveHead('unit'));

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        dir="rtl"
        className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 p-5 shadow-2xl max-h-[90vh] overflow-y-auto"
        onKeyDown={(e) => { if (e.key === 'Escape' && !busy) { e.stopPropagation(); onClose(); } }}
      >
        <h3 className="text-base font-extrabold text-slate-900 dark:text-white">{title}</h3>
        <p className="mt-1 mb-4 text-xs text-slate-500">{path.length > 0 ? path.join(' › ') : 'ریشه‌ی چارت'}</p>
        {error && <p role="alert" className="mb-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-xs px-3 py-2">{error}</p>}

        <div className="flex gap-2 mb-3" role="radiogroup" aria-label="نوع گره">
          {kinds.map((k) => {
            const info = KIND_INFO[k];
            const on = k === kind;
            return (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={mode === 'edit'}
                onClick={() => setKind(k)}
                className="flex-1 rounded-xl border-2 px-2 py-2 text-center text-sm cursor-pointer disabled:cursor-default"
                style={on ? { borderColor: info.color, backgroundColor: info.bg, color: info.color, fontWeight: 700 } : { borderColor: '#e3def8' }}
              >
                {info.label}
                <span className="block text-[10.5px] font-normal opacity-80 mt-0.5">{info.hint}</span>
              </button>
            );
          })}
        </div>

        <label className="block text-xs text-slate-600 dark:text-slate-300 mb-1" htmlFor="kind-names">
          نام {mode === 'add' && <span className="text-slate-400">(هر خط یک گره؛ Enter ثبت، Shift+Enter خط جدید)</span>}
        </label>
        <textarea
          id="kind-names"
          ref={nameRef}
          rows={mode === 'add' ? 3 : 1}
          className={`${inputClass} ${invalid ? 'border-rose-500' : ''}`}
          value={text}
          maxLength={mode === 'add' ? 4000 : 160}
          placeholder={kind === 'position' ? 'مثلاً: مدیر مالی' : 'مثلاً: معاونت مالی'}
          onChange={(e) => { setText(e.target.value); setInvalid(false); }}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
        />
        {mode === 'add' && names.length > 1 && <p className="mt-1 text-[11px] text-slate-500">{toPersianDigits(names.length)} گره ساخته می‌شود؛ شخص و رئیس فقط برای یک گره ثبت می‌شود.</p>}

        {kind === 'position' && (
          <div className="mt-3">
            <label className="block text-xs text-slate-600 dark:text-slate-300 mb-1">اشخاص (اختیاری؛ یک سمت می‌تواند چند شخص داشته باشد)</label>
            <PeopleField value={names.length > 1 && mode === 'add' ? [] : persons} onChange={setPersons} onSubmit={() => void send()} inputRef={peopleRef} />
          </div>
        )}

        {showHead && (
          <label className="mt-3 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 px-3 py-2 text-sm text-amber-800 dark:text-amber-200 cursor-pointer">
            <input type="checkbox" checked={isHead} onChange={(e) => setIsHead(e.target.checked)} className="accent-amber-600" />
            ★ رئیس «{parentName}» است
          </label>
        )}

        <div className="mt-5 flex items-center gap-3">
          {mode === 'add' && (
            <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
              <input type="checkbox" checked={keepOpen} onChange={(e) => setKeepOpen(e.target.checked)} className="accent-indigo-600" /> ثبت و افزودن بعدی
            </label>
          )}
          <span className="flex-1" />
          <SecondaryButton type="button" onClick={onClose} disabled={busy}>انصراف</SecondaryButton>
          <PrimaryButton type="button" onClick={() => void send()} disabled={busy}>{busy && <Loader2 className="w-4 h-4 animate-spin" />} {mode === 'add' ? 'افزودن' : 'ذخیره'}</PrimaryButton>
        </div>
      </div>
    </div>,
    document.body,
  );
};
