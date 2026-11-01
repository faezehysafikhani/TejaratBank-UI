import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BadgeCheck, Loader2, Plus, Search, Trash2 } from 'lucide-react';
import {
  Company, KindNode, addNodePerson, getKindChart, listCompanies, removeNodePerson, setPrimaryNodePerson,
} from '../../../services/orgStructureApi';
import { Notice, SecondaryButton, StatusBadge, inputClass } from '../AdminUi';
import { userErrorMessage } from '../../../utils/errorMessages';

interface PositionOption { node: KindNode; path: string }

/**
 * «سمت‌ها» in a user's edit dialog: the positions of the organization chart this person sits in. A
 * position is a node of the chart («کارشناس» under «معاونت فناوری»); it is told apart by where it
 * is, so every option shows its path from the company down. One person may hold several positions,
 * one position may have several people; the first person of a position is its official one (whose
 * word counts as the manager's for the positions under it) and that can be changed here.
 *
 * An existing user is changed at once (each action is saved when it is done). A user who is not saved
 * yet only collects choices (`pending`), which the dialog applies after it has made the account.
 */
export const UserPositionsPanel: React.FC<{
  userId: string | null;
  pending: string[];
  onPendingChange: (nodeIds: string[]) => void;
}> = ({ userId, pending, onPendingChange }) => {
  const [nodes, setNodes] = useState<KindNode[] | null>(null);
  const [companies, setCompanies] = useState<Map<string, string>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    try {
      const [chart, list] = await Promise.all([getKindChart(), listCompanies().catch((): Company[] => [])]);
      setNodes(chart);
      setCompanies(new Map<string, string>(list.map((c): [string, string] => [c.id, c.name])));
    } catch (err) {
      setError(userErrorMessage(err, 'دریافت چارت سازمانی ممکن نشد.'));
      setNodes([]);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const byId = useMemo(() => new Map((nodes || []).map((n) => [n.id, n])), [nodes]);
  /** «شرکت › معاونت › اداره › سمت»: where a node is. */
  const pathOf = useCallback((node: KindNode) => {
    const names: string[] = [];
    const seen = new Set<string>();
    for (let current: KindNode | undefined = node; current && !seen.has(current.id); current = current.parentNodeId ? byId.get(current.parentNodeId) : undefined) {
      seen.add(current.id);
      names.unshift(current.name);
    }
    const company = node.companyId ? companies.get(node.companyId) : undefined;
    return [company, ...names].filter(Boolean).join(' › ');
  }, [byId, companies]);

  const positions: PositionOption[] = useMemo(
    () => (nodes || []).filter((n) => n.kind === 'position' && n.isActive).map((node) => ({ node, path: pathOf(node) })),
    [nodes, pathOf],
  );

  const mine = useMemo(
    () => (userId
      ? positions.filter((p) => p.node.persons.some((person) => person.userId === userId))
      : positions.filter((p) => pending.includes(p.node.id))),
    [positions, userId, pending],
  );
  const heldIds = new Set(mine.map((p) => p.node.id));
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return positions
      .filter((p) => !heldIds.has(p.node.id) && (!q || p.path.toLowerCase().includes(q)))
      .sort((a, b) => a.path.localeCompare(b.path, 'fa'))
      .slice(0, 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positions, query, mine]);

  const run = async (key: string, action: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    try {
      await action();
      await load();
    } catch (err) {
      setError(userErrorMessage(err, 'انجام نشد.'));
    } finally {
      setBusy(null);
    }
  };

  const add = (option: PositionOption) => {
    setQuery('');
    if (!userId) {
      onPendingChange([...pending, option.node.id]);
      return;
    }

    void run(option.node.id, () => addNodePerson(option.node.id, userId));
  };

  const remove = (option: PositionOption) => {
    if (!userId) {
      onPendingChange(pending.filter((id) => id !== option.node.id));
      return;
    }

    void run(option.node.id, () => removeNodePerson(option.node.id, userId));
  };

  const makeOfficial = (option: PositionOption) => {
    if (userId) void run(option.node.id, () => setPrimaryNodePerson(option.node.id, userId));
  };

  if (nodes === null) return <div className="flex items-center gap-2 py-6 text-sm text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> در حال دریافت چارت سازمانی…</div>;

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500 dark:text-slate-400 leading-6">
        سمت‌های این شخص در چارت سازمانی. هر سمت با جایش در چارت (شرکت و واحدهای بالاترش) شناخته می‌شود.
        {userId ? ' هر تغییر همان لحظه ذخیره می‌شود.' : ' سمت‌ها بعد از ذخیره‌ی کاربر ثبت می‌شوند.'}
        {' '}اولین سمتِ شخص، جایگاه سازمانی اصلی او می‌شود و مدیرش از همان‌جا معلوم می‌شود.
      </p>

      {error && <Notice type="error" onClose={() => setError(null)}>{error}</Notice>}

      <div>
        <h4 className="text-xs font-extrabold text-slate-700 dark:text-slate-200 mb-2">سمت‌های فعلی ({mine.length})</h4>
        {mine.length === 0 ? (
          <p className="text-xs text-slate-500 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl p-4 text-center">این شخص در هیچ سمتی نیست.</p>
        ) : (
          <ul className="space-y-2">
            {mine.map((option) => {
              const official = option.node.persons.find((p) => p.isPrimary)?.userId === userId;
              const others = option.node.persons.filter((p) => p.userId !== userId);
              return (
                <li key={option.node.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold text-slate-800 dark:text-slate-100">{option.node.name}</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{option.path}</div>
                    {others.length > 0 && <div className="text-[11px] text-slate-400 mt-0.5">همراه با: {others.map((p) => p.displayName).join('، ')}</div>}
                  </div>
                  {userId && official && <StatusBadge tone="green">شخص رسمی سمت</StatusBadge>}
                  {userId && !official && option.node.persons.length > 0 && (
                    <SecondaryButton type="button" disabled={busy === option.node.id} onClick={() => makeOfficial(option)} title="مدیر سمت‌های زیر این سمت می‌شود">
                      <BadgeCheck className="w-4 h-4" /> شخص رسمی شود
                    </SecondaryButton>
                  )}
                  <button
                    type="button"
                    disabled={busy === option.node.id}
                    onClick={() => remove(option)}
                    className="p-2 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer disabled:opacity-50"
                    aria-label={`برداشتن سمت ${option.node.name}`}
                    title="برداشتن این سمت از شخص"
                  >
                    {busy === option.node.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div>
        <h4 className="text-xs font-extrabold text-slate-700 dark:text-slate-200 mb-2">افزودن سمت</h4>
        {positions.length === 0 ? (
          <Notice type="info">هنوز سمتی در چارت سازمانی ساخته نشده است. اول از «ساختار سازمانی» سمت بسازید.</Notice>
        ) : (
          <>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
              <input className={`${inputClass} pr-9`} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="جست‌وجو در سمت‌ها (نام سمت، واحد یا شرکت)" />
            </div>
            <ul className="mt-2 space-y-1">
              {matches.map((option) => (
                <li key={option.node.id}>
                  <button
                    type="button"
                    disabled={busy === option.node.id}
                    onClick={() => add(option)}
                    className="w-full flex items-center gap-2 text-right rounded-xl px-3 py-2 border border-transparent hover:border-indigo-300 hover:bg-indigo-50/60 dark:hover:bg-indigo-950/30 cursor-pointer disabled:opacity-50"
                  >
                    <Plus className="w-4 h-4 text-indigo-600 shrink-0" />
                    <span className="min-w-0">
                      <span className="block text-sm font-bold text-slate-800 dark:text-slate-100">{option.node.name}</span>
                      <span className="block text-[11px] text-slate-500 dark:text-slate-400">{option.path}</span>
                    </span>
                  </button>
                </li>
              ))}
              {matches.length === 0 && <li className="text-xs text-slate-500 px-1 py-2">سمتی با این جست‌وجو پیدا نشد.</li>}
            </ul>
          </>
        )}
      </div>
    </div>
  );
};
