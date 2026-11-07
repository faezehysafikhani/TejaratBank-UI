import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, UserPlus, UserX } from 'lucide-react';
import { AdminCard, AdminDialog, Notice, SecondaryButton, StatusBadge, inputClass } from './admin/AdminUi';
import { OrgPlacementForm } from './admin/orgStructure/OrgPlacementForm';
import { PersonAvatar } from './admin/orgStructure/PersonAvatar';
import { LoadingRow } from './admin/orgStructure/orgShared';
import { OrgPlacementBoard, PlacementPick, loadPlacementBoard } from './admin/orgStructure/orgPlacementData';
import {
  ORG_STRUCTURE_PERMISSIONS as P, ORG_UNIT_PERMISSIONS as U, UnplacedUser, canNode, listUnplacedUsers,
} from '../services/orgStructureApi';
import { userErrorMessage } from '../utils/errorMessages';
import { toPersianDigits } from '../utils/helpers';

/** The people who are in no company, unit or post yet (the same list as the bar under the org chart). */
export const getUnplacedPeople = async (): Promise<UnplacedUser[] | null> => {
  try {
    return await listUnplacedUsers();
  } catch {
    return null;
  }
};

/**
 * «کارتابل افراد بدون پست»: everyone the organisation structure has not placed yet, in one list.
 * «تعیین پست» opens the same placement window as the chart (company, unit, post, start day, direct
 * manager) with the person already chosen. Sits beside «کارتابل جانشینی», which lists the opposite:
 * posts with nobody in them.
 */
export const UnplacedPeopleView: React.FC<{ can: (permission: string) => boolean; onChanged?: () => void }> = ({ can, onChanged }) => {
  const [people, setPeople] = useState<UnplacedUser[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [board, setBoard] = useState<OrgPlacementBoard | null>(null);
  const [placing, setPlacing] = useState<{ person: UnplacedUser; pick: PlacementPick } | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPeople(await listUnplacedUsers());
    } catch (err) {
      setError(userErrorMessage(err, 'دریافت فهرست افراد بدون پست ممکن نشد.'));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const canAssign = can(P.manageAssignments);

  const place = async (person: UnplacedUser) => {
    setOpening(person.userId);
    setError(null);
    try {
      // The window needs the whole structure (companies, units, posts); read it fresh each time.
      const fresh = await loadPlacementBoard();
      setBoard(fresh);
      setPlacing({
        person,
        pick: { at: Date.now(), companyId: fresh.companies.length === 1 ? fresh.companies[0].id : '', userId: person.userId, userName: person.displayName },
      });
    } catch (err) {
      setError(userErrorMessage(err, 'دریافت ساختار سازمانی ممکن نشد.'));
    } finally {
      setOpening(null);
    }
  };

  const shown = useMemo(() => {
    const q = query.trim();
    return (people ?? []).filter((p) => !q || p.displayName.includes(q));
  }, [people, query]);

  return (
    <div className="space-y-4" data-testid="unplaced-people">
      <AdminCard className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-extrabold text-slate-900 dark:text-white">
              <UserX className="w-5 h-5 text-amber-600" aria-hidden="true" /> کارتابل افراد بدون پست
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              افرادی که هنوز در هیچ شرکت یا پستی قرار نگرفته‌اند. تا وقتی پستی ندارند، جز خودشان کسی را نمی‌بینند و به کسی فعالیت نمی‌دهند. با «تعیین پست» همین‌جا جایگاهشان را مشخص کنید.
            </p>
          </div>
          <StatusBadge tone="amber">{toPersianDigits(people?.length ?? 0)} نفر</StatusBadge>
        </div>
        <div className="relative mt-4 max-w-sm">
          <Search className="w-4 h-4 absolute top-1/2 -translate-y-1/2 right-3 text-slate-400" aria-hidden="true" />
          <input className={`${inputClass} pr-9`} placeholder="جستجوی نام…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="جستجوی نام" />
        </div>
      </AdminCard>

      {message && <Notice type="success">{message}</Notice>}
      {error && <Notice type="error">{error}</Notice>}
      {loading && !people ? <LoadingRow /> : null}

      {people && shown.length === 0 && (
        <AdminCard className="p-8 text-center text-sm text-slate-500">
          {people.length === 0 ? 'همهٔ افراد در ساختار سازمانی جایگاه دارند.' : 'نتیجه‌ای پیدا نشد.'}
        </AdminCard>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {shown.map((person) => (
          <AdminCard key={person.userId} className="p-4 flex items-center gap-3">
            <PersonAvatar name={person.displayName} url={person.avatarUrl} size="md" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-extrabold text-slate-900 dark:text-white truncate">{person.displayName}</div>
              <div className="text-[11px] text-amber-600 dark:text-amber-400 font-bold">بدون جایگاه سازمانی</div>
            </div>
            {canAssign && (
              <button
                type="button"
                onClick={() => void place(person)}
                disabled={opening === person.userId}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-xs font-bold cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5" aria-hidden="true" /> تعیین پست
              </button>
            )}
          </AdminCard>
        ))}
      </div>

      {placing && board && (
        <AdminDialog wide title={`تعیین پست برای ${placing.person.displayName}`} onClose={() => setPlacing(null)} footer={<SecondaryButton onClick={() => setPlacing(null)}>بستن</SecondaryButton>}>
          <OrgPlacementForm
            embedded
            board={board}
            pick={placing.pick}
            canAssign={canAssign}
            canCreateUnits={canNode(can, 'create') || can(U.create)}
            canCreatePositions={can(P.managePositions)}
            onSaved={async () => {
              setMessage(`«${placing.person.displayName}» در ساختار قرار گرفت.`);
              await load();
              onChanged?.();
            }}
            onDone={() => setPlacing(null)}
          />
        </AdminDialog>
      )}
    </div>
  );
};

