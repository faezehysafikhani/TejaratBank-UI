import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronLeft, Plus, Check, X } from 'lucide-react';
import { AdminCard, Notice, PrimaryButton, SecondaryButton, inputClass } from '../AdminUi';
import { JalaliDatePicker } from '../../JalaliDatePicker';
import { userErrorMessage } from '../../../utils/errorMessages';
import { showToast } from '../../../utils/toast';
import { toPersianDigits } from '../../../utils/helpers';
import {
  type HeldPosition, type UnitPosition,
  addUnitPosition, appointToPost, createNode, createPosition, endPostAppointment, getAssignment, positionsForCompany, setAssignment, updatePosition,
} from '../../../services/orgStructureApi';
import { type PostChoice, type PostOption, PostChoiceDialog, endPosts } from './nodes/PostChoices';
import { UserPicker } from './orgShared';
import { addableTypes } from './orgNodeRules';
import { createAllowedType } from './nodes/NodeDialogs';
import { OrgPlacementBoard, PlacementPick, nodePath } from './orgPlacementData';

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** What a save needs to know once the questions are answered. */
interface SaveContext { later: boolean; inCompany: boolean; sameHeld: UnitPosition | null; vacant: UnitPosition[] }

interface Draft {
  companyId: string;
  unitId: string;
  positionId: string;
  userId: string | null;
  userName: string | null;
  managerUserId: string | null;
  managerName: string | null;
  startDate: string | undefined;
}

const EMPTY: Draft = { companyId: '', unitId: '', positionId: '', userId: null, userName: null, managerUserId: null, managerName: null, startDate: undefined };

type Message = { type: 'success' | 'error'; text: string } | null;

/** A select with a «+» that makes a new entry on the spot. */
const SelectWithAdd: React.FC<{
  label: string;
  required?: boolean;
  value: string;
  onChange: (value: string) => void;
  options: { id: string; label: string }[];
  placeholder: string;
  disabled?: boolean;
  addLabel: string;
  addPlaceholder: string;
  onAdd: ((name: string, extra: { choice: string; typed: string }) => Promise<string>) | null;
  /** A second question in the «+» row: one of `options`, or - when there are none - a name typed. */
  extra?: { label: string; options: { id: string; label: string }[]; typedPlaceholder: string; hint?: string; defaultChoice?: string };
}> = ({ label, required, value, onChange, options, placeholder, disabled, addLabel, addPlaceholder, onAdd, extra }) => {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [choice, setChoice] = useState('');
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    if (!onAdd || !name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const id = await onAdd(name.trim(), { choice: choice || extra?.defaultChoice || '', typed: typed.trim() });
      onChange(id);
      setName('');
      setTyped('');
      setAdding(false);
    } catch (err) {
      setError(userErrorMessage(err, `${addLabel} انجام نشد.`));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <span className="block text-xs font-bold text-slate-700 dark:text-slate-300">{label}{required && <span className="text-rose-500"> *</span>}</span>
      <div className="flex gap-2">
        <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} aria-label={label} className={`${inputClass} flex-1 min-w-0`}>
          <option value="">{placeholder}</option>
          {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
        {onAdd && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => setAdding((v) => !v)}
            title={addLabel}
            aria-label={addLabel}
            aria-expanded={adding}
            className="shrink-0 w-11 rounded-xl border border-slate-200 dark:border-slate-700 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 disabled:opacity-40 flex items-center justify-center cursor-pointer"
          >
            {adding ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          </button>
        )}
      </div>
      {adding && onAdd && (
        <div className="flex gap-2">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void add(); } if (e.key === 'Escape') { e.stopPropagation(); setAdding(false); } }}
            placeholder={addPlaceholder}
            aria-label={addPlaceholder}
            maxLength={200}
            className={`${inputClass} flex-1 min-w-0`}
          />
          <SecondaryButton type="button" disabled={busy || !name.trim() || (!!extra && extra.options.length === 0 && !typed.trim())} onClick={() => void add()}><Check className="w-4 h-4" /> ساخت</SecondaryButton>
        </div>
      )}
      {adding && onAdd && extra && (
        <div className="space-y-1" data-testid="add-extra">
          <span className="block text-[11px] font-bold text-slate-600 dark:text-slate-300">{extra.label}</span>
          {extra.options.length > 0 ? (
            <select value={choice || extra.defaultChoice || extra.options[0].id} onChange={(e) => setChoice(e.target.value)} aria-label={extra.label} className={inputClass}>
              {extra.options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          ) : (
            <input value={typed} onChange={(e) => setTyped(e.target.value)} maxLength={120} aria-label={extra.label} placeholder={extra.typedPlaceholder} className={inputClass} />
          )}
          {extra.hint && <p className="text-[11px] text-slate-500">{extra.hint}</p>}
        </div>
      )}
      {error && <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
    </div>
  );
};

/**
 * «ثبت جایگاه»: the company, deputy/unit, position and person in one form. It uses the same
 * calls the chart and the user dialog always used (setAssignment; a start date in the future
 * appoints to the post from that day).
 */
/** The form's frame: a card on its own, or nothing inside a window. */
const Wrap: React.FC<{ embedded: boolean; children: React.ReactNode }> = ({ embedded, children }) => (embedded ? <div className="space-y-4">{children}</div> : <AdminCard className="p-5 space-y-4">{children}</AdminCard>);

export const OrgPlacementForm: React.FC<{
  board: OrgPlacementBoard;
  pick: PlacementPick | null;
  canAssign: boolean;
  canCreateUnits: boolean;
  canCreatePositions: boolean;
  onSaved: () => Promise<void>;
  onTool?: (tool: 'templates' | 'links') => void;
  /** Inside the «افزودن نفر به پست» window: no card or title of its own, and it is closed after a save (not after «ثبت و افزودن بعدی»). */
  embedded?: boolean;
  onDone?: () => void;
}> = ({ board, pick, canAssign, canCreateUnits, canCreatePositions, onSaved, onTool, embedded = false, onDone }) => {
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);

  // A click in the chart fills the form for editing.
  useEffect(() => {
    if (!pick) return;
    setDraft({
      ...EMPTY,
      companyId: pick.companyId,
      unitId: pick.unitId ?? '',
      positionId: pick.positionId ?? '',
      userId: pick.userId ?? null,
      userName: pick.userName ?? null,
    });
    setMessage(null);
  }, [pick?.at]); // eslint-disable-line react-hooks/exhaustive-deps

  const nodesById = useMemo(() => new Map(board.nodes.map((n) => [n.id, n])), [board.nodes]);
  const units = useMemo(
    () => board.nodes
      .filter((n) => n.companyId === draft.companyId && (n.isActive || n.id === draft.unitId))
      .map((n) => ({ id: n.id, label: nodePath(n, nodesById) }))
      .sort((a, b) => a.label.localeCompare(b.label, 'fa')),
    [board.nodes, nodesById, draft.companyId, draft.unitId],
  );
  const positions = useMemo(
    () => (draft.companyId ? positionsForCompany(board.positions, draft.companyId) : [])
      .filter((p) => p.isActive || p.id === draft.positionId)
      .map((p) => ({ id: p.id, label: p.title }))
      .sort((a, b) => a.label.localeCompare(b.label, 'fa')),
    [board.positions, draft.companyId, draft.positionId],
  );

  const companyPositions = useMemo(
    () => (draft.companyId ? positionsForCompany(board.positions, draft.companyId) : []).filter((p) => p.isActive),
    [board.positions, draft.companyId],
  );
  /** The types a unit made here may have: those the rules allow at the top of a company. */
  const topTypes = useMemo(() => addableTypes(board.nodeTypes, board.rules, null), [board.nodeTypes, board.rules]);
  // A unit whose vacant posts all have one title: that title is chosen (the person only has to be picked).
  useEffect(() => {
    if (!draft.unitId || draft.positionId) return;
    const titles = new Set(board.posts.filter((p) => p.unitId === draft.unitId && p.holders.length === 0 && p.isPositionActive).map((p) => p.positionId));
    if (titles.size === 1) setDraft((d) => (d.unitId === draft.unitId && !d.positionId ? { ...d, positionId: [...titles][0] } : d));
  }, [draft.unitId, draft.positionId, board.posts]);
  const set = (patch: Partial<Draft>) => { setDraft((d) => ({ ...d, ...patch })); setMessage(null); };
  const companyName = board.companies.find((c) => c.id === draft.companyId)?.name;
  const unitName = units.find((u) => u.id === draft.unitId)?.label;
  const positionTitle = positions.find((p) => p.id === draft.positionId)?.label;
  const ready = !!(draft.companyId && draft.unitId && draft.positionId && draft.userId);

  const crumbs = [
    { text: companyName, empty: 'شرکت' },
    { text: unitName, empty: 'واحد' },
    { text: positionTitle, empty: 'سمت' },
    { text: draft.userName, empty: 'کاربر' },
  ];

  // The questions asked before a save (previous posts; a filled post), and the save waiting on them.
  const [asking, setAsking] = useState<{ filled: PostOption[] | null; vacant: PostOption[]; allowReplace: boolean; previous: HeldPosition[]; andNext: boolean; context: SaveContext } | null>(null);

  const postLabelOf = (p: UnitPosition) => `${p.title}${p.code ? ` · کد ${toPersianDigits(p.code)}` : ''}`;

  const save = async (andNext: boolean) => {
    if (!ready || !canAssign) return;
    setBusy(true);
    setMessage(null);
    try {
      const userId = draft.userId!;
      const later = !!draft.startDate && draft.startDate > todayIso();
      const place = await getAssignment(userId);
      const held = place?.positions ?? [];
      const here = board.posts.filter((p) => p.unitId === draft.unitId && p.positionId === draft.positionId);
      const sameHeld = here.find((p) => held.some((h) => h.unitPositionId === p.id)) ?? null;
      const vacant = here.filter((p) => p.holders.length === 0);
      const filled = here.filter((p) => p.holders.length > 0 && !p.holders.some((h) => h.userId === userId));
      const previous = held.filter((h) => h.unitPositionId !== sameHeld?.id);
      const context: SaveContext = { later, inCompany: !!place && place.companyId === draft.companyId, sameHeld, vacant };
      const askTarget = !sameHeld && vacant.length === 0 && filled.length > 0;
      if (askTarget || previous.length > 0) {
        setAsking({
          filled: askTarget ? filled.map((p) => ({ postId: p.id, label: postLabelOf(p), holderName: p.holders[0]?.displayName })) : null,
          vacant: askTarget
            ? board.posts.filter((p) => p.unitId === draft.unitId && p.holders.length === 0).map((p) => ({ postId: p.id, label: postLabelOf(p) }))
            : [],
          allowReplace: true,
          previous,
          andNext,
          context,
        });
        return;
      }
      await perform({ target: null, endPostIds: [] }, andNext, context, previous);
    } catch (err) {
      setMessage({ type: 'error', text: userErrorMessage(err, 'ثبت جایگاه انجام نشد.') });
    } finally {
      setBusy(false);
    }
  };

  const perform = async (choice: PostChoice, andNext: boolean, context: SaveContext, previous: HeldPosition[]) => {
    const userId = draft.userId!;
    const { later } = context;
    // The post the person takes: the one chosen, else the one they hold here, else a vacant one, else a new one.
    let postId: string | null = choice.target && choice.target.kind !== 'new' ? choice.target.postId : null;
    if (!postId && choice.target?.kind !== 'new') postId = context.sameHeld?.id ?? context.vacant[0]?.id ?? null;
    if (!postId) {
      // A new post goes under the same post as the others of its position in this unit.
      const sibling = board.posts.find((p) => p.unitId === draft.unitId && p.positionId === draft.positionId && p.parentPostId);
      postId = (await addUnitPosition(draft.unitId, draft.positionId, undefined, sibling?.parentPostId ?? null)).id;
    }
    const positionId = board.posts.find((p) => p.id === postId)?.positionId ?? draft.positionId;

    if (later) {
      // From a later day: the person takes the post then; the posts they give up end the same day.
      await appointToPost(postId, userId, draft.startDate);
      await endPosts(choice.endPostIds, draft.startDate);
    } else {
      // Someone else's post: their appointment ends now (kept as history) and this person takes it -
      // also when this person has no place yet.
      if (choice.target?.kind === 'replace') await endPostAppointment(postId, null);
      const kept = previous.filter((h) => !choice.endPostIds.includes(h.unitPositionId)).map((h) => h.unitPositionId);
      await setAssignment(userId, {
        companyId: draft.companyId,
        unitId: draft.unitId,
        positionId,
        managerUserId: draft.managerUserId,
        unitPositionIds: [postId, ...kept.filter((id) => id !== postId)],
      });
    }
    await onSaved();
    const text = later ? `جایگاه «${draft.userName}» از تاریخ انتخاب‌شده ثبت شد.` : `«${draft.userName}» به پست اضافه شد.`;
    if (embedded && !andNext && onDone) {
      showToast(text, 'ok');
      onDone();
      return;
    }
    setMessage({ type: 'success', text });
    setDraft(andNext ? { ...EMPTY, companyId: draft.companyId, unitId: draft.unitId, positionId: '' } : draft);
  };

  const confirmAsked = async (choice: PostChoice) => {
    if (!asking) return;
    const { andNext, context, previous } = asking;
    setAsking(null);
    setBusy(true);
    try {
      await perform(choice, andNext, context, previous);
    } catch (err) {
      setMessage({ type: 'error', text: userErrorMessage(err, 'ثبت جایگاه انجام نشد.') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Wrap embedded={embedded}>
      {!embedded && <h3 className="text-base font-extrabold text-slate-900 dark:text-white">افزودن نفر به پست</h3>}

      <div className="flex flex-wrap items-center gap-1.5 text-xs" aria-label="مسیر زنده" data-testid="placement-path">
        {crumbs.map((c, i) => (
          <React.Fragment key={c.empty}>
            {i > 0 && <ChevronLeft className="w-3.5 h-3.5 text-slate-400" />}
            <span className={`px-2.5 py-1 rounded-lg font-bold ${c.text ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-200' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}>
              {c.text || c.empty}
            </span>
          </React.Fragment>
        ))}
      </div>

      {message && <Notice type={message.type} onClose={() => setMessage(null)}>{message.text}</Notice>}
      {!canAssign && <Notice type="info">برای ثبت جایگاه، دسترسی «مدیریت جایگاه کاربران» لازم است.</Notice>}

      <form className="grid grid-cols-1 md:grid-cols-2 gap-4" onSubmit={(e) => { e.preventDefault(); void save(false); }}>
        <div className="space-y-1.5">
          <span className="block text-xs font-bold text-slate-700 dark:text-slate-300">شرکت <span className="text-rose-500">*</span></span>
          <select value={draft.companyId} onChange={(e) => set({ companyId: e.target.value, unitId: '', positionId: '' })} aria-label="شرکت" className={inputClass}>
            <option value="">انتخاب شرکت…</option>
            {board.companies.filter((c) => c.isActive || c.id === draft.companyId).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <SelectWithAdd
          label="واحد"
          required
          value={draft.unitId}
          onChange={(unitId) => set({ unitId })}
          options={units}
          placeholder={draft.companyId ? 'انتخاب واحد…' : 'ابتدا شرکت را انتخاب کنید'}
          disabled={!draft.companyId}
          addLabel="ساخت واحد جدید"
          addPlaceholder="نام واحد جدید"
          extra={{
            label: 'نوع واحد',
            options: topTypes.map((t) => ({ id: t.id, label: t.name })),
            typedPlaceholder: 'نوع واحد تازه، مثلاً: معاونت',
            hint: 'نوع واحد مشخص می‌کند این واحد در چارت چه جایگاهی دارد.',
            defaultChoice: topTypes[0]?.id,
          }}
          onAdd={canCreateUnits ? async (name, extra) => {
            let typeId = extra.choice;
            if (!typeId && extra.typed) typeId = (await createAllowedType(extra.typed, null, board.nodeTypes)).id;
            const node = await createNode({ name, companyId: draft.companyId, parentNodeId: null, nodeTypeId: typeId || null });
            await onSaved();
            return node.id;
          } : null}
        />

        <SelectWithAdd
          label="سمت"
          required
          value={draft.positionId}
          onChange={(positionId) => set({ positionId })}
          options={positions}
          placeholder={draft.companyId ? 'انتخاب سمت…' : 'ابتدا شرکت را انتخاب کنید'}
          disabled={!draft.companyId}
          addLabel="ساخت سمت جدید"
          addPlaceholder="عنوان سمت جدید"
          extra={{
            label: companyPositions.length > 0 ? 'زیر کدام سمت؟' : 'عنوان رئیس کل شرکت',
            options: companyPositions.map((p) => ({ id: p.id, label: `${p.title}${p.parentPositionId ? '' : ' (رئیس کل)'}` })),
            typedPlaceholder: 'مثلاً: مدیرعامل',
            hint: companyPositions.length > 0
              ? 'سمت مافوق سمت تازه است؛ دارنده‌ی آن مدیر دارنده‌ی این سمت می‌شود.'
              : 'اولین سمت هر شرکت بالاترین سمت آن است؛ سمت‌های دیگر زیر آن قرار می‌گیرند. این عنوان هم ساخته می‌شود.',
            defaultChoice: (companyPositions.find((p) => !p.parentPositionId) ?? companyPositions[0])?.id,
          }}
          onAdd={canCreatePositions ? async (title, extra) => {
            let under = extra.choice || null;
            if (companyPositions.length === 0) {
              // The first title of a company is its head's; the new one goes under it.
              const head = await createPosition(extra.typed, null, [draft.companyId]);
              under = head.id;
            }
            const existing = board.positions.find((p) => p.title === title);
            if (existing) {
              if (!(existing.companyIds || []).includes(draft.companyId)) {
                await updatePosition(existing.id, existing.title, existing.parentPositionId, existing.isActive, [...(existing.companyIds || []), draft.companyId]);
              }
              await onSaved();
              return existing.id;
            }
            const position = await createPosition(title, under, [draft.companyId]);
            await onSaved();
            return position.id;
          } : null}
        />

        <div className="space-y-1.5">
          <span className="block text-xs font-bold text-slate-700 dark:text-slate-300">کاربر <span className="text-rose-500">*</span></span>
          <UserPicker value={draft.userId} valueLabel={draft.userName} onChange={(id, name) => set({ userId: id, userName: name })} />
        </div>

        <div className="space-y-1.5">
          <span className="block text-xs font-bold text-slate-700 dark:text-slate-300">مدیر مستقیم</span>
          {draft.managerUserId ? (
            <UserPicker value={draft.managerUserId} valueLabel={draft.managerName} onChange={(id, name) => set({ managerUserId: id, managerName: name })} excludeIds={draft.userId ? [draft.userId] : []} />
          ) : (
            <div className="space-y-1.5">
              <div className="px-3 py-2.5 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-sm text-slate-600 dark:text-slate-300">خودکار بر اساس سمت</div>
              <UserPicker value={null} onChange={(id, name) => set({ managerUserId: id, managerName: name })} placeholder="یا مدیر را جستجو کنید…" excludeIds={draft.userId ? [draft.userId] : []} />
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <span className="block text-xs font-bold text-slate-700 dark:text-slate-300">تاریخ شروع</span>
          <JalaliDatePicker value={draft.startDate} onChange={(startDate) => set({ startDate })} ariaLabel="تاریخ شروع" placeholder="از همین الان" />
        </div>

        <div className="md:col-span-2 flex flex-wrap items-center justify-end gap-2">
          {draft.companyId && <SecondaryButton type="button" disabled={busy} onClick={() => { setDraft(EMPTY); setMessage(null); }}>پاک کردن فرم</SecondaryButton>}
          <SecondaryButton type="button" disabled={busy || !ready || !canAssign} onClick={() => void save(true)}>ثبت و افزودن بعدی</SecondaryButton>
          <PrimaryButton type="submit" disabled={busy || !ready || !canAssign}>افزودن به پست</PrimaryButton>
        </div>
      </form>
      {draft.startDate && draft.startDate > todayIso() && (
        <p className="text-[11px] text-slate-500 dark:text-slate-400">با تاریخ شروع در آینده، کاربر از همان روز به این سمت منصوب می‌شود ({toPersianDigits(draft.startDate)}).</p>
      )}
      {asking && (
        <PostChoiceDialog
          personName={draft.userName || 'کاربر'}
          filled={asking.filled}
          vacant={asking.vacant}
          allowNew
          allowReplace={asking.allowReplace}
          previous={asking.previous}
          onConfirm={(choice) => void confirmAsked(choice)}
          onCancel={() => setAsking(null)}
        />
      )}
    </Wrap>
  );
};
