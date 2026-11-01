import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Building2, Network, UserRound, Pencil, Plus, UserPlus, Unlink, Zap, Loader2, Briefcase, LogOut, ArrowUp, ArrowDown, Trash2,
} from 'lucide-react';
import { AdminCard, AdminDialog, Field, Notice, PrimaryButton, SecondaryButton, StatusBadge, Toggle, inputClass } from '../AdminUi';
import { userErrorMessage } from '../../../utils/errorMessages';
import { toPersianDigits } from '../../../utils/helpers';
import {
  ChartCompany, ChartMember, ChartPosition, ChartUnit, Position, UnitPosition, UnplacedUser, UserAssignment, MANAGER_SOURCE_TITLES,
  ORG_STRUCTURE_PERMISSIONS as P, ORG_UNIT_PERMISSIONS as U,
  addUnitPosition, createOrgUnit, createPosition, getAssignment, linkUnitToCompany, listCompanies, listUnitPositions,
  orderUnitPositions, positionsForCompany, removeUnitPosition, setAssignment, unlinkUnit, updateCompany, updateOrgUnit,
  addCompanyPosition, postLabel, setPostParent, updateUnitPositionCode,
} from '../../../services/orgStructureApi';
import { UserPicker } from './orgShared';
import { ChartSelection, companyHeadcount, companyPostsOf, findMember, findPosition, findUnit, positionsOf, postTree, unitHeadcount, vacantCount } from './orgChartModel';
import { PersonAvatar } from './PersonAvatar';
import { appConfirm, appPrompt } from '../../../utils/appDialog';

type Dialog =
  | { kind: 'editCompany'; company: ChartCompany }
  | { kind: 'addUnit'; company: ChartCompany }
  | { kind: 'editUnit'; unit: ChartUnit }
  | { kind: 'addUnitMember'; company: ChartCompany; unit: ChartUnit }
  | { kind: 'addUnitPosition'; unit: ChartUnit }
  | { kind: 'addHolder'; company: ChartCompany; unit: ChartUnit | null; position: ChartPosition }
  | { kind: 'addCompanyPost'; company: ChartCompany }
  | { kind: 'memberPositions'; userId: string; name: string }
  | { kind: 'placeUser'; userId: string; name: string };

const InfoRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex items-start justify-between gap-3 py-2.5 border-b border-slate-100 dark:border-slate-800 last:border-0">
    <span className="text-xs text-slate-500 dark:text-slate-400 shrink-0">{label}</span>
    <span className="text-sm font-bold text-slate-800 dark:text-slate-100 text-left min-w-0">{children}</span>
  </div>
);

const PersonValue: React.FC<{ person: { displayName: string; avatarUrl?: string | null } | null; empty?: string; note?: string }> = ({ person, empty = '—', note }) => (
  person ? (
    <span className="flex items-center gap-2 justify-end">
      <span className="text-left">
        <span className="block">{person.displayName}</span>
        {note && <span className="block text-[11px] font-normal text-slate-500">{note}</span>}
      </span>
      <PersonAvatar name={person.displayName} url={person.avatarUrl} size="md" />
    </span>
  ) : <span className="text-slate-400 font-normal">{empty}</span>
);

/** One of the «عملیات سریع» tiles. */
const ActionTile: React.FC<{ icon: React.ComponentType<{ className?: string }>; label: string; onClick: () => void; tone?: 'indigo' | 'rose'; disabled?: boolean }> = ({ icon: Icon, label, onClick, tone = 'indigo', disabled }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className={`flex flex-col items-center justify-center gap-1.5 rounded-2xl border px-2 py-3 text-[11px] font-bold transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
      tone === 'rose'
        ? 'border-rose-100 bg-rose-50/60 text-rose-600 hover:bg-rose-50 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300'
        : 'border-slate-200 bg-white text-indigo-700 hover:border-indigo-300 hover:bg-indigo-50/60 dark:border-slate-700 dark:bg-slate-900 dark:text-indigo-300'
    }`}
  >
    <Icon className="w-5 h-5" />
    <span className="text-center leading-tight">{label}</span>
  </button>
);

const Header: React.FC<{ icon: React.ComponentType<{ className?: string }>; tone: string; title: string; subtitle: string; badge?: React.ReactNode }> = ({ icon: Icon, tone, title, subtitle, badge }) => (
  <div className="flex items-center gap-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 p-3">
    <span className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${tone}`}><Icon className="w-6 h-6" /></span>
    <span className="min-w-0 flex-1">
      <span className="block text-base font-extrabold text-slate-900 dark:text-white truncate">{title}</span>
      <span className="block text-xs text-slate-500 truncate">{subtitle}</span>
    </span>
    {badge}
  </div>
);

const ActiveBadge: React.FC<{ active: boolean }> = ({ active }) => <StatusBadge tone={active ? 'green' : 'red'}>{active ? 'فعال' : 'غیرفعال'}</StatusBadge>;

/** People listed inside a details panel; each opens its own details. */
const PeopleList: React.FC<{
  members: ChartMember[];
  onOpen: (userId: string) => void;
  onRemove?: (member: ChartMember) => void;
  busy?: boolean;
  /** What removing does, e.g. «برداشتن از این سمت». */
  removeLabel?: string;
  empty?: string;
}> = ({ members, onOpen, onRemove, busy, removeLabel = 'برداشتن', empty = 'کسی نیست.' }) => (
  members.length === 0 ? <p className="text-xs text-slate-400 py-2">{empty}</p> : (
    <div className="space-y-1 max-h-64 overflow-y-auto">
      {members.map((m) => (
        <div key={m.userId} className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/60">
          <button type="button" onClick={() => onOpen(m.userId)} className="flex items-center gap-2 min-w-0 flex-1 text-right cursor-pointer">
            <PersonAvatar name={m.displayName} url={m.avatarUrl} />
            <span className="min-w-0">
              <span className="block text-xs font-bold text-slate-800 dark:text-slate-100 truncate">{m.displayName}</span>
              <span className="block text-[10px] text-slate-500 truncate">{m.positionTitle || 'بدون سمت'}</span>
            </span>
          </button>
          {onRemove && (
            <button type="button" disabled={busy} onClick={() => onRemove(m)} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer disabled:opacity-40" title={removeLabel} aria-label={`${removeLabel}: ${m.displayName}`}>
              <LogOut className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ))}
    </div>
  )
);

/**
 * Gives someone one more deputy position, keeping where they sit and what else they hold; someone
 * with no place yet is placed in the position's deputy.
 */
async function addToPosition(userId: string, company: ChartCompany, unit: ChartUnit | null, position: ChartPosition) {
  const current = await getAssignment(userId);
  const held = current?.positions?.map((p) => p.unitPositionId) || [];
  if (held.includes(position.unitPositionId)) return;
  // Someone with no post left where they are placed moves with this post: its deputy (or company)
  // becomes their place and its position their main one, so their manager follows. Someone who
  // still holds a post where they are stays there, with this post as an extra one.
  const holdsPostWhereTheyAre = !!current && (current.positions || []).some((p) => p.unitId === current.unitId);
  const moves = !current || !holdsPostWhereTheyAre;
  await setAssignment(userId, {
    companyId: moves ? company.companyId : current!.companyId,
    unitId: moves ? unit?.unitId ?? null : current!.unitId,
    positionId: moves ? position.positionId : current!.positionId,
    managerUserId: current?.explicitManagerUserId ?? null,
    unitPositionIds: [...held, position.unitPositionId],
  });
}

/** Takes one deputy position from someone, keeping the rest. */
async function removeFromPosition(userId: string, unitPositionId: string) {
  const current = await getAssignment(userId);
  if (!current) return;
  await setAssignment(userId, {
    companyId: current.companyId,
    unitId: current.unitId,
    positionId: current.positionId,
    managerUserId: current.explicitManagerUserId,
    unitPositionIds: (current.positions || []).map((p) => p.unitPositionId).filter((id) => id !== unitPositionId),
  });
}

/**
 * The side panel of the org chart: everything about the selected company, deputy, position or
 * person, and the changes that fit it - each shown only to whoever may make it.
 */
export const OrgChartDetails: React.FC<{
  can: (permission: string) => boolean;
  chart: ChartCompany[];
  positions: Position[];
  unplaced: UnplacedUser[];
  selection: ChartSelection | null;
  onSelect: (selection: ChartSelection) => void;
  onChanged: () => Promise<void> | void;
}> = ({ can, chart, positions, unplaced, selection, onSelect, onChanged }) => {
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => setMessage(null), [JSON.stringify(selection)]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Runs a change, reports it and reloads the chart. */
  const run = async (action: () => Promise<unknown>, success: string, failure: string): Promise<boolean> => {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      await onChanged();
      setMessage({ type: 'success', text: success });
      return true;
    } catch (err) {
      setMessage({ type: 'error', text: userErrorMessage(err, failure) });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const openMember = (userId: string) => onSelect({ kind: 'member', userId });

  let body: React.ReactNode = <p className="text-sm text-slate-500 p-4">یک بخش از چارت را انتخاب کنید.</p>;

  if (selection?.kind === 'company' || selection?.kind === 'direct') {
    const company = chart.find((c) => c.companyId === selection.companyId);
    if (company) {
      const positionCount = company.units.reduce((n, u) => n + positionsOf(u).length, 0);
      const vacant = company.units.reduce((n, u) => n + vacantCount(u), 0);
      body = selection.kind === 'company' ? (
        <>
          <Header icon={Building2} tone="bg-indigo-600 text-white" title={company.name} subtitle={`شرکت · کد ${company.code}`} badge={<ActiveBadge active={company.isActive} />} />
          <div>
            <InfoRow label="رئیس کل"><PersonValue person={company.manager} empty="تعیین نشده" /></InfoRow>
            {!company.manager && (
              <p className="text-[11px] leading-5 text-slate-500 py-2">رئیس کل کسی است که سمتِ بدون مافوقِ این شرکت را مستقیم در شرکت (بدون معاونت) داشته باشد.</p>
            )}
            <InfoRow label="معاونت‌ها">{toPersianDigits(company.units.length)}</InfoRow>
            <InfoRow label="سمت‌ها">{toPersianDigits(positionCount)}{vacant > 0 ? ` (${toPersianDigits(vacant)} خالی)` : ''}</InfoRow>
            <InfoRow label="تعداد افراد">{toPersianDigits(companyHeadcount(company))} نفر</InfoRow>
          </div>
          {companyPostsOf(company).length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-bold text-slate-500">پست‌های مستقیم شرکت</p>
              {companyPostsOf(company).map((post) => (
                <button key={post.unitPositionId} type="button" onClick={() => onSelect({ kind: 'position', companyId: company.companyId, unitId: '', unitPositionId: post.unitPositionId })} className="w-full flex items-center justify-between gap-2 rounded-xl px-2 py-1.5 text-right hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer">
                  <span className="flex items-center gap-2 min-w-0 text-sm font-bold text-slate-800 dark:text-slate-100"><Briefcase className={`w-4 h-4 shrink-0 ${post.isHead ? 'text-amber-600' : 'text-sky-600'}`} /> <span className="truncate">{postLabel(post)}</span></span>
                  <span className={`text-[11px] truncate shrink-0 max-w-[45%] ${post.holders.length ? 'text-slate-500' : 'text-amber-600'}`}>{post.holders.length ? post.holders.map((h) => h.displayName).join('، ') : 'خالی'}</span>
                </button>
              ))}
            </div>
          )}
          {company.units.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-bold text-slate-500">معاونت‌ها</p>
              {company.units.map((u) => (
                <button key={u.unitId} type="button" onClick={() => onSelect({ kind: 'unit', companyId: company.companyId, unitId: u.unitId })} className="w-full flex items-center justify-between gap-2 rounded-xl px-2 py-1.5 text-right hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer">
                  <span className="flex items-center gap-2 min-w-0 text-sm font-bold text-slate-800 dark:text-slate-100"><Network className="w-4 h-4 text-emerald-600 shrink-0" /> {u.name}</span>
                  <span className="text-[11px] text-slate-500 whitespace-nowrap shrink-0">{toPersianDigits(unitHeadcount(u))} نفر</span>
                </button>
              ))}
            </div>
          )}
          <QuickActions>
            {can(P.manageCompanies) && <ActionTile icon={Pencil} label="ویرایش شرکت" onClick={() => setDialog({ kind: 'editCompany', company })} />}
            {can(P.manageCompanies) && can(U.create) && <ActionTile icon={Plus} label="افزودن معاونت" onClick={() => setDialog({ kind: 'addUnit', company })} />}
            {can(P.managePositions) && positions.some((p) => p.companyIds !== undefined) && <ActionTile icon={Briefcase} label="افزودن پست در شرکت" onClick={() => setDialog({ kind: 'addCompanyPost', company })} />}
          </QuickActions>
        </>
      ) : (
        <>
          <Header icon={UserRound} tone="bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200" title="مستقیم زیر شرکت" subtitle={`${company.name} · بدون معاونت`} />
          <PeopleList members={company.members} onOpen={openMember} />
        </>
      );
    }
  }

  if (selection?.kind === 'unit' || selection?.kind === 'noPosition') {
    const found = findUnit(chart, selection.unitId);
    if (found) {
      const { company, unit } = found;
      const unitPositions = positionsOf(unit);
      const canArrange = can(P.managePositions);
      const move = (index: number, by: number) => {
        const ids = unitPositions.map((p) => p.unitPositionId);
        [ids[index], ids[index + by]] = [ids[index + by], ids[index]];
        return run(() => orderUnitPositions(unit.unitId, ids), 'ترتیب سمت‌ها ذخیره شد.', 'تغییر ترتیب سمت‌ها انجام نشد.');
      };
      body = selection.kind === 'unit' ? (
        <>
          <Header icon={Network} tone="bg-emerald-600 text-white" title={unit.name} subtitle={`معاونت · ${company.name}`} badge={<ActiveBadge active={unit.isActive !== false} />} />
          <div>
            {unit.manager && <InfoRow label="مدیر معاونت"><PersonValue person={unit.manager} /></InfoRow>}
            <InfoRow label="سمت‌ها">{toPersianDigits(unitPositions.length)}{vacantCount(unit) > 0 ? ` (${toPersianDigits(vacantCount(unit))} خالی)` : ''}</InfoRow>
            <InfoRow label="تعداد افراد">{toPersianDigits(unitHeadcount(unit))} نفر</InfoRow>
            <InfoRow label="بدون سمت">{toPersianDigits(unit.members.length)} نفر</InfoRow>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-bold text-slate-500">سمت‌های این معاونت (به ترتیب)</p>
            {unitPositions.length === 0 ? <p className="text-xs text-slate-400">هنوز سمتی برای این معاونت تعریف نشده است.</p> : unitPositions.map((pos, i) => (
              <div key={pos.unitPositionId} className="flex items-center gap-1 rounded-xl px-2 py-1 hover:bg-slate-50 dark:hover:bg-slate-800/60">
                <button
                  type="button"
                  onClick={() => onSelect({ kind: 'position', companyId: company.companyId, unitId: unit.unitId, unitPositionId: pos.unitPositionId })}
                  className="flex items-center gap-2 min-w-0 flex-1 text-right cursor-pointer"
                >
                  <Briefcase className="w-4 h-4 text-sky-600 shrink-0" />
                  <span className={`text-sm font-bold truncate ${pos.isActive ? 'text-slate-800 dark:text-slate-100' : 'text-slate-400 line-through'}`}>{postLabel(pos)}</span>
                  <span className={`text-[11px] truncate shrink-0 max-w-[45%] ${pos.holders.length === 0 ? 'text-amber-600' : 'text-slate-500'}`}>
                    {pos.holders.length === 0 ? 'خالی' : pos.holders.map((h) => h.displayName).join('، ')}
                  </span>
                </button>
                {canArrange && (
                  <>
                    <button type="button" disabled={busy || i === 0} onClick={() => move(i, -1)} className="p-1 rounded-lg text-slate-400 hover:text-indigo-600 disabled:opacity-30 cursor-pointer" title="بالاتر" aria-label={`بالاتر بردن ${pos.title}`}><ArrowUp className="w-3.5 h-3.5" /></button>
                    <button type="button" disabled={busy || i === unitPositions.length - 1} onClick={() => move(i, 1)} className="p-1 rounded-lg text-slate-400 hover:text-indigo-600 disabled:opacity-30 cursor-pointer" title="پایین‌تر" aria-label={`پایین‌تر بردن ${pos.title}`}><ArrowDown className="w-3.5 h-3.5" /></button>
                    <button
                      type="button"
                      disabled={busy || pos.holders.length > 0}
                      onClick={async () => await appConfirm(`سمت «${pos.title}» از معاونت «${unit.name}» حذف شود؟`)
                        && run(() => removeUnitPosition(pos.unitPositionId), 'سمت از معاونت حذف شد.', 'حذف سمت انجام نشد.')}
                      className="p-1 rounded-lg text-slate-400 hover:text-rose-600 disabled:opacity-30 cursor-pointer"
                      title={pos.holders.length > 0 ? 'سمتی که کسی در آن هست حذف نمی‌شود' : 'حذف سمت از معاونت'}
                      aria-label={`حذف سمت ${pos.title}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
          <QuickActions>
            {can(U.update) && <ActionTile icon={Pencil} label="ویرایش معاونت" onClick={() => setDialog({ kind: 'editUnit', unit })} />}
            {canArrange && <ActionTile icon={Briefcase} label="افزودن سمت" onClick={() => setDialog({ kind: 'addUnitPosition', unit })} />}
            {can(P.manageAssignments) && <ActionTile icon={UserPlus} label="افزودن فرد" onClick={() => setDialog({ kind: 'addUnitMember', company, unit })} />}
            {can(P.manageCompanies) && (
              <ActionTile
                icon={Unlink}
                tone="rose"
                label="جدا کردن از شرکت"
                disabled={busy || unitHeadcount(unit) > 0}
                onClick={async () => await appConfirm(`معاونت «${unit.name}» از شرکت «${company.name}» جدا شود؟`)
                  && run(async () => {
                    await unlinkUnit(unit.unitId);
                    onSelect({ kind: 'company', companyId: company.companyId });
                  }, 'معاونت از شرکت جدا شد.', 'جدا کردن معاونت انجام نشد.')}
              />
            )}
          </QuickActions>
          {can(P.manageCompanies) && unitHeadcount(unit) > 0 && <p className="text-[11px] text-slate-400">برای جدا کردن معاونت از شرکت، ابتدا افراد آن را جابه‌جا کنید.</p>}
        </>
      ) : (
        <>
          <Header icon={UserRound} tone="bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200" title="بدون سمت" subtitle={`${unit.name} · افرادی که هیچ سمتی در این معاونت ندارند`} />
          <PeopleList members={unit.members} onOpen={openMember} />
        </>
      );
    }
  }

  if (selection?.kind === 'position') {
    const place = findPosition(chart, selection.unitPositionId);
    if (place) {
      const { company, unit, position } = place;
      const placeName = unit ? unit.name : `مستقیم در ${company.name}`;
      // Posts of the same place: the one above it may be any of them but itself and those below it.
      const samePlace = unit ? positionsOf(unit) : companyPostsOf(company);
      const below = new Set<string>([position.unitPositionId]);
      for (let grew = true; grew;) {
        grew = false;
        for (const p of samePlace) {
          if (p.parentPostId && below.has(p.parentPostId) && !below.has(p.unitPositionId)) { below.add(p.unitPositionId); grew = true; }
        }
      }
      const parentChoices = postTree(samePlace).filter(({ position: p }) => !below.has(p.unitPositionId));
      const parentPost = samePlace.find((p) => p.unitPositionId === position.parentPostId);
      const children = samePlace.filter((p) => p.parentPostId === position.unitPositionId);
      const holderLabel = (p: ChartPosition) => (p.holders.length ? p.holders.map((h) => h.displayName).join('، ') : 'خالی');
      const changeCode = async () => {
        const code = await appPrompt(`کد جدید پست «${position.title}» (در این شرکت یکتا):`, position.code || '');
        if (code && code.trim() && code.trim() !== position.code) {
          run(() => updateUnitPositionCode(position.unitPositionId, code.trim()), 'کد پست تغییر کرد.', 'تغییر کد پست انجام نشد.');
        }
      };
      body = (
        <>
          <Header icon={Briefcase} tone="bg-sky-600 text-white" title={postLabel(position)} subtitle={`${position.isHead ? 'پست رئیس کل' : 'پست'} · ${placeName}`} badge={position.holders.length === 0 ? <StatusBadge tone="amber">خالی</StatusBadge> : undefined} />
          <div>
            <InfoRow label={unit ? 'معاونت' : 'شرکت'}>
              <button type="button" className="text-indigo-700 dark:text-indigo-300 hover:underline cursor-pointer" onClick={() => onSelect(unit ? { kind: 'unit', companyId: company.companyId, unitId: unit.unitId } : { kind: 'company', companyId: company.companyId })}>
                {unit ? unit.name : company.name}
              </button>
            </InfoRow>
            <InfoRow label="کد پست">
              <span className="flex items-center gap-2 justify-end">
                {toPersianDigits(position.code || '—')}
                {can(P.managePositions) && <button type="button" onClick={changeCode} disabled={busy} className="text-[11px] text-indigo-600 hover:underline cursor-pointer">تغییر</button>}
              </span>
            </InfoRow>
            {!position.isHead && (
              <InfoRow label="پست مافوق">
                {can(P.managePositions) ? (
                  <select
                    className={`${inputClass} max-w-[14rem] py-1 text-xs`}
                    value={position.parentPostId || ''}
                    disabled={busy}
                    aria-label="پست مافوق"
                    onChange={(e) => run(() => setPostParent(position.unitPositionId, e.target.value || null), 'پست مافوق تغییر کرد.', 'تغییر پست مافوق انجام نشد.')}
                  >
                    <option value="">{unit ? (unit.manager ? 'ندارد (زیر مدیر معاونت)' : 'ندارد (زیر رئیس کل شرکت)') : 'ندارد'}</option>
                    {parentChoices.map(({ position: p, depth }) => (
                      <option key={p.unitPositionId} value={p.unitPositionId}>{'— '.repeat(depth)}{postLabel(p)} ({holderLabel(p)})</option>
                    ))}
                  </select>
                ) : parentPost ? `${postLabel(parentPost)} (${holderLabel(parentPost)})` : 'ندارد'}
              </InfoRow>
            )}
            {!position.isActive && <InfoRow label="وضعیت"><span className="text-rose-600">سمت غیرفعال است</span></InfoRow>}
          </div>
          {!position.isHead && (
            <p className="text-[11px] leading-5 text-slate-500">
              دارندهٔ پست مافوق، مدیر دارندهٔ این پست است (فعالیت‌ها، گزارش و کارتابل جانشینی). اگر پست مافوق خالی باشد، پست بالاترِ آن و در نهایت {unit?.manager ? 'مدیر معاونت' : 'رئیس کل شرکت'} جای آن را می‌گیرد.
            </p>
          )}
          {children.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-bold text-slate-500">پست‌های زیرمجموعه</p>
              {children.map((child) => (
                <button key={child.unitPositionId} type="button" onClick={() => onSelect({ ...selection, unitPositionId: child.unitPositionId })} className="w-full flex items-center justify-between gap-2 rounded-xl px-2 py-1.5 text-right hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer">
                  <span className="flex items-center gap-2 min-w-0 text-sm font-bold text-slate-800 dark:text-slate-100"><Briefcase className="w-4 h-4 shrink-0 text-sky-600" /> <span className="truncate">{postLabel(child)}</span></span>
                  <span className={`text-[11px] truncate shrink-0 max-w-[45%] ${child.holders.length ? 'text-slate-500' : 'text-amber-600'}`}>{holderLabel(child)}</span>
                </button>
              ))}
            </div>
          )}
          <div className="space-y-1">
            <p className="text-xs font-bold text-slate-500">دارندهٔ این پست</p>
            <PeopleList
              members={position.holders}
              onOpen={openMember}
              busy={busy}
              empty="این سمت خالی است."
              removeLabel="برداشتن از این سمت"
              onRemove={can(P.manageAssignments)
                ? async (m) => await appConfirm(`«${m.displayName}» از سمت «${position.title}» برداشته شود؟`)
                  && run(() => removeFromPosition(m.userId, position.unitPositionId), `«${m.displayName}» از سمت برداشته شد.`, 'برداشتن از سمت انجام نشد.')
                : undefined}
            />
          </div>
          <QuickActions>
            {can(P.manageAssignments) && position.isActive && position.holders.length === 0 && <ActionTile icon={UserPlus} label="گذاشتن فرد در این پست" onClick={() => setDialog({ kind: 'addHolder', company, unit, position })} />}
            {can(P.managePositions) && (
              <ActionTile
                icon={Trash2}
                tone="rose"
                label="حذف پست"
                disabled={busy || position.holders.length > 0 || children.length > 0}
                onClick={async () => await appConfirm(`پست «${postLabel(position)}» از «${placeName}» حذف شود؟`)
                  && run(async () => {
                    await removeUnitPosition(position.unitPositionId);
                    onSelect(unit ? { kind: 'unit', companyId: company.companyId, unitId: unit.unitId } : { kind: 'company', companyId: company.companyId });
                  }, 'پست حذف شد.', 'حذف پست انجام نشد.')}
              />
            )}
          </QuickActions>
          {position.holders.length > 0 && <p className="text-[11px] text-slate-400">هر پست فقط یک نفر دارد؛ برای گذاشتن فرد دیگر یا حذف پست، ابتدا دارندهٔ فعلی را بردارید.</p>}
        </>
      );
    }
  }

  if (selection?.kind === 'member') {
    const place = findMember(chart, selection.userId);
    if (place) {
      body = <MemberDetails key={selection.userId} place={place} chart={chart} can={can} onEditPositions={(name) => setDialog({ kind: 'memberPositions', userId: selection.userId, name })} onSelect={onSelect} />;
    }
  }

  if (selection?.kind === 'unplaced') {
    const person = unplaced.find((u) => u.userId === selection.userId);
    if (person) {
      body = (
        <>
          <div className="flex flex-col items-center gap-2 py-3">
            <PersonAvatar name={person.displayName} url={person.avatarUrl} size="lg" />
            <span className="text-base font-extrabold text-slate-900 dark:text-white">{person.displayName}</span>
            <StatusBadge tone="amber">بدون جایگاه سازمانی</StatusBadge>
          </div>
          <p className="text-xs text-slate-500">این فرد هنوز در هیچ شرکت یا معاونتی قرار نگرفته است.</p>
          <QuickActions>
            {can(P.manageAssignments) && <ActionTile icon={UserPlus} label="قرار دادن در ساختار" onClick={() => setDialog({ kind: 'placeUser', userId: person.userId, name: person.displayName })} />}
          </QuickActions>
        </>
      );
    }
  }

  return (
    <AdminCard className="p-4 space-y-4 2xl:h-full 2xl:overflow-y-auto">
      <div>
        <h3 className="flex items-center gap-2 text-base font-extrabold text-slate-900 dark:text-white"><Zap className="w-5 h-5 text-indigo-600" /> جزئیات</h3>
        <p className="text-xs text-slate-500 mt-0.5">اطلاعات و عملیات بخش انتخاب‌شده</p>
      </div>
      {message && <Notice type={message.type} onClose={() => setMessage(null)}>{message.text}</Notice>}
      {body}
      {/* At the page root: the panel is sticky, and the chart's cards would otherwise cover a dialog opened inside it. */}
      {dialog && createPortal(
        <ChartDialog
          dialog={dialog}
          chart={chart}
          positions={positions}
          can={can}
          busy={busy}
          run={run}
          onClose={() => setDialog(null)}
          onSelect={onSelect}
        />,
        document.body,
      )}
    </AdminCard>
  );
};

const QuickActions: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const items = React.Children.toArray(children).filter(Boolean);
  if (items.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1.5 text-xs font-bold text-slate-500"><Zap className="w-3.5 h-3.5" /> عملیات سریع</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-2 2xl:grid-cols-4 gap-2">{items}</div>
    </div>
  );
};

type Run = (action: () => Promise<unknown>, success: string, failure: string) => Promise<boolean>;

/** A person: where they sit (from their assignment), their manager, the positions they hold, and changing them. */
const MemberDetails: React.FC<{
  place: NonNullable<ReturnType<typeof findMember>>;
  chart: ChartCompany[];
  can: (permission: string) => boolean;
  onEditPositions: (name: string) => void;
  onSelect: (selection: ChartSelection) => void;
}> = ({ place, chart, can, onEditPositions, onSelect }) => {
  const { member } = place;
  const [assignment, setAssignmentState] = useState<UserAssignment | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    getAssignment(member.userId).then((a) => alive && setAssignmentState(a)).catch(() => alive && setAssignmentState(null));
    return () => { alive = false; };
  }, [member.userId, member.positionTitle]);

  const company = assignment ? chart.find((c) => c.companyId === assignment.companyId) : undefined;
  const path = assignment ? [assignment.companyName, assignment.unitName].filter(Boolean).join(' ‹ ') : null;
  const isHead = chart.some((c) => c.manager?.userId === member.userId);
  // Every position they hold, the main one first (from the chart while their place is loading).
  const held = assignment?.positions
    || place.positions.map((p) => ({ unitPositionId: p.position.unitPositionId, unitId: p.unit.unitId, unitName: p.unit.name, positionId: p.position.positionId, title: p.position.title }));
  // A position held directly in the company (e.g. the head's), outside any deputy.
  const companyPosition = assignment && !assignment.unitId && assignment.positionTitle && !held.some((h) => !h.unitId) ? assignment.positionTitle : null;
  const heldCount = held.length + (companyPosition ? 1 : 0);

  return (
    <>
      <div className="flex flex-col items-center gap-2 py-2">
        <PersonAvatar name={member.displayName} url={member.avatarUrl} size="lg" />
        <span className="text-base font-extrabold text-slate-900 dark:text-white text-center">{member.displayName}</span>
        <span className="text-xs text-slate-500 text-center">{[isHead ? 'رئیس کل' : null, member.positionTitle].filter(Boolean).join(' · ') || 'بدون سمت'}</span>
        {!member.isActive && <StatusBadge tone="red">حساب غیرفعال</StatusBadge>}
      </div>
      <div>
        <InfoRow label="جایگاه">
          {assignment === undefined ? '…' : !assignment ? <span className="text-amber-600 font-normal">بدون جایگاه سازمانی</span> : (
            <button type="button" className="text-indigo-700 dark:text-indigo-300 hover:underline cursor-pointer" onClick={() => company && onSelect(assignment.unitId
              ? { kind: 'unit', companyId: company.companyId, unitId: assignment.unitId }
              : { kind: 'company', companyId: company.companyId })}
            >
              {path}
            </button>
          )}
        </InfoRow>
        <InfoRow label="مدیر مستقیم">
          {assignment?.manager
            ? <PersonValue person={{ displayName: assignment.manager.displayName }} note={MANAGER_SOURCE_TITLES[assignment.manager.source]} />
            : <span className="text-slate-400 font-normal">ندارد</span>}
        </InfoRow>
      </div>

      <div className="space-y-1">
        <p className="text-xs font-bold text-slate-500">سمت‌ها ({toPersianDigits(heldCount)})</p>
        {companyPosition && (
          <div className="w-full flex items-center justify-between gap-2 rounded-xl px-2 py-1.5">
            <span className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100 min-w-0"><Briefcase className="w-4 h-4 text-amber-600 shrink-0" /> <span className="truncate">{companyPosition}</span></span>
            <span className="text-[11px] text-slate-500 whitespace-nowrap shrink-0">مستقیم در {assignment!.companyName}</span>
          </div>
        )}
        {heldCount === 0 ? <p className="text-xs text-slate-400">هیچ سمتی ندارد.</p> : held.map((h, i) => {
          const where = findPosition(chart, h.unitPositionId);
          return (
            <button
              key={h.unitPositionId}
              type="button"
              disabled={!where}
              onClick={() => where && onSelect({ kind: 'position', companyId: where.company.companyId, unitId: where.unit?.unitId ?? '', unitPositionId: h.unitPositionId })}
              className="w-full flex items-center justify-between gap-2 rounded-xl px-2 py-1.5 text-right hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer disabled:cursor-default"
            >
              <span className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100 min-w-0"><Briefcase className="w-4 h-4 text-sky-600 shrink-0" /> <span className="truncate">{postLabel(h)}</span></span>
              <span className="text-[11px] text-slate-500 whitespace-nowrap shrink-0">{h.unitId ? h.unitName : `مستقیم در ${h.unitName}`}{i === 0 && held.length > 1 ? ' · اصلی' : ''}</span>
            </button>
          );
        })}
        {can(P.manageAssignments) && assignment && (
          <SecondaryButton type="button" className="w-full mt-1" onClick={() => onEditPositions(member.displayName)}>
            <Briefcase className="w-4 h-4" /> تغییر سمت‌ها
          </SecondaryButton>
        )}
      </div>
    </>
  );
};

/** The add/edit dialogs opened from the panel. */
const ChartDialog: React.FC<{
  dialog: Dialog;
  chart: ChartCompany[];
  positions: Position[];
  can: (permission: string) => boolean;
  busy: boolean;
  run: Run;
  onClose: () => void;
  onSelect: (selection: ChartSelection) => void;
}> = ({ dialog, chart, positions, can, busy, run, onClose, onSelect }) => {
  const [name, setName] = useState(
    dialog.kind === 'editCompany' ? dialog.company.name : dialog.kind === 'editUnit' ? dialog.unit.name : '',
  );
  const [code, setCode] = useState(dialog.kind === 'editCompany' ? dialog.company.code : '');
  const initialPerson = dialog.kind === 'editCompany' ? dialog.company.manager : dialog.kind === 'editUnit' ? dialog.unit.manager : null;
  const [personId, setPersonId] = useState<string | null>(initialPerson?.userId || null);
  const [personName, setPersonName] = useState<string | null>(initialPerson?.displayName || null);
  const [active, setActive] = useState(
    dialog.kind === 'editCompany' ? dialog.company.isActive : dialog.kind === 'editUnit' ? dialog.unit.isActive !== false : true,
  );
  // Placing someone: the deputy (or company directly) and position.
  const destinations = chart.flatMap((c) => [
    { key: `${c.companyId}|`, label: `${c.name} (مستقیم زیر شرکت)`, companyId: c.companyId, unit: null as ChartUnit | null },
    ...c.units.map((u) => ({ key: `${c.companyId}|${u.unitId}`, label: `${c.name} ‹ ${u.name}`, companyId: c.companyId, unit: u as ChartUnit | null })),
  ]);
  const [destination, setDestination] = useState(destinations[0]?.key || '');
  const [positionId, setPositionId] = useState('');
  // Adding a position to a deputy: one from the list, or a new title (under a chosen superior).
  const [newTitle, setNewTitle] = useState('');
  const [newParent, setNewParent] = useState<string | null>(null);
  const [newCode, setNewCode] = useState('');
  const [parentPost, setParentPost] = useState('');
  // A person's positions: every deputy position, and those they hold.
  const [allSeats, setAllSeats] = useState<UnitPosition[] | null>(null);
  const [chosenSeats, setChosenSeats] = useState<string[]>([]);
  const [memberAssignment, setMemberAssignment] = useState<UserAssignment | null>(null);
  useEffect(() => {
    if (dialog.kind !== 'memberPositions') return;
    let alive = true;
    Promise.all([listUnitPositions(), getAssignment(dialog.userId)]).then(([seats, current]) => {
      if (!alive) return;
      setAllSeats(seats);
      setMemberAssignment(current);
      setChosenSeats((current?.positions || []).map((p) => p.unitPositionId));
    }).catch(() => alive && setAllSeats([]));
    return () => { alive = false; };
  }, [dialog]);

  const close = () => !busy && onClose();
  const done = (ok: boolean) => { if (ok) onClose(); };

  /** Moves someone into a deputy, keeping the positions they hold and any manager set on them. */
  const placeInUnit = async (userId: string, companyId: string, unitId: string | null) => {
    const current = await getAssignment(userId);
    await setAssignment(userId, {
      companyId,
      unitId,
      positionId: current?.positionId ?? null,
      managerUserId: current?.explicitManagerUserId ?? null,
      unitPositionIds: (current?.positions || []).map((p) => p.unitPositionId),
    });
  };

  let title = '';
  let content: React.ReactNode = null;
  let save: (() => void) | null = null;
  let canSave = !busy;

  switch (dialog.kind) {
    case 'editCompany': {
      title = 'ویرایش شرکت';
      canSave = canSave && !!name.trim() && !!code.trim();
      save = async () => {
        const full = (await listCompanies()).find((c) => c.id === dialog.company.companyId);
        done(await run(() => updateCompany(dialog.company.companyId, {
          name: name.trim(), code: code.trim(), description: full?.description ?? null, isActive: active,
        }), 'شرکت ویرایش شد.', 'ویرایش شرکت انجام نشد.'));
      };
      content = (
        <>
          <Field label="نام شرکت" required><input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={200} /></Field>
          <Field label="کد شرکت" required><input className={`${inputClass} dir-ltr text-right`} value={code} onChange={(e) => setCode(e.target.value)} maxLength={40} /></Field>
          <p className="text-[11px] leading-5 text-slate-500">رئیس کل اینجا تعیین نمی‌شود: کاربری که سمتِ بدون مافوقِ این شرکت را مستقیم در شرکت داشته باشد رئیس کل است.</p>
          <Toggle checked={active} onChange={setActive} label="فعال" />
        </>
      );
      break;
    }
    case 'addUnit': {
      title = `معاونت جدید در «${dialog.company.name}»`;
      canSave = canSave && !!name.trim();
      save = async () => done(await run(async () => {
        // A deputy is an empty node: its manager is whoever holds its top post (e.g. a «مدیر» position).
        const unit = await createOrgUnit({ name: name.trim() });
        await linkUnitToCompany(unit.id, dialog.company.companyId);
      }, `معاونت «${name.trim()}» اضافه شد.`, 'افزودن معاونت انجام نشد.'));
      content = (
        <>
          <Field label="نام معاونت" required><input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={200} autoFocus placeholder="مثلاً: معاونت فناوری اطلاعات" /></Field>
        </>
      );
      break;
    }
    case 'editUnit': {
      title = 'ویرایش معاونت';
      canSave = canSave && !!name.trim();
      save = async () => done(await run(() => updateOrgUnit(dialog.unit.unitId, { name: name.trim(), managerUserId: personId, isActive: active }), 'معاونت ویرایش شد.', 'ویرایش معاونت انجام نشد.'));
      content = (
        <>
          <Field label="نام معاونت" required><input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={200} /></Field>
          {can(U.update) && <Toggle checked={active} onChange={setActive} label="فعال" />}
        </>
      );
      break;
    }
    case 'addUnitMember': {
      title = `افزودن فرد به «${dialog.unit.name}»`;
      canSave = canSave && !!personId;
      save = async () => done(await run(() => placeInUnit(personId!, dialog.company.companyId, dialog.unit.unitId), `«${personName}» به معاونت اضافه شد.`, 'افزودن فرد انجام نشد.'));
      content = (
        <PersonField
          label="کاربر"
          personId={personId}
          personName={personName}
          onChange={(id, n) => { setPersonId(id); setPersonName(n); }}
          hint="سمت‌ها و مدیر تعیین‌شده‌اش حفظ می‌شود؛ سمتش در این معاونت را از خود سمت تعیین کنید."
        />
      );
      break;
    }
    case 'addUnitPosition': {
      const unitId = dialog.unit.unitId;
      const companyId = findUnit(chart, unitId)?.company.companyId || '';
      const perCompany = positions.some((p) => p.companyIds !== undefined);
      const ofCompany = perCompany ? positionsForCompany(positions, companyId) : positions;
      // A position may have several posts in a deputy (three «کارشناس»), so ones already here are
      // offered again. The head's position (no superior) is the company's, never a deputy's.
      const postsHere = new Map<string, number>();
      positionsOf(dialog.unit).forEach((p) => postsHere.set(p.positionId, (postsHere.get(p.positionId) || 0) + 1));
      const free = ofCompany.filter((p) => p.isActive && (!perCompany || !!p.parentPositionId));
      // A new position goes under the chosen superior: by default the deputy's first position, else the company's head's.
      const head = ofCompany.find((p) => !p.parentPositionId);
      const defaultParent = positionsOf(dialog.unit)[0]?.positionId || head?.id || '';
      const parent = newParent ?? defaultParent;
      title = `افزودن سمت به «${dialog.unit.name}»`;
      canSave = canSave && (!!positionId || (!!newTitle.trim() && (!perCompany || !!parent)));
      save = async () => done(await run(async () => {
        let id = positionId;
        if (!id) {
          const existing = positions.find((p) => p.title === newTitle.trim());
          id = existing ? existing.id : (await createPosition(newTitle.trim(), parent || null, companyId ? [companyId] : [])).id;
        }
        await addUnitPosition(unitId, id, newCode.trim() || undefined, parentPost || null);
      }, 'پست به معاونت اضافه شد.', 'افزودن پست انجام نشد.'));
      content = (
        <>
          <Field label="سمت از فهرست سمت‌ها">
            <select className={inputClass} value={positionId} onChange={(e) => { setPositionId(e.target.value); if (e.target.value) setNewTitle(''); }}>
              <option value="">— انتخاب کنید —</option>
              {free.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}{postsHere.get(p.id) ? ` (${toPersianDigits(postsHere.get(p.id)!)} پست در این معاونت)` : ''}
                </option>
              ))}
            </select>
          </Field>
          <Field label="یا عنوان سمت جدید">
            <input className={inputClass} value={newTitle} onChange={(e) => { setNewTitle(e.target.value); if (e.target.value) setPositionId(''); }} maxLength={120} placeholder="مثلاً: کارشناس ارشد شبکه" />
          </Field>
          {perCompany && newTitle.trim() && (
            <Field label="سمت مافوق سمت جدید" required>
              <select className={inputClass} value={parent} onChange={(e) => setNewParent(e.target.value)}>
                <option value="" disabled>— انتخاب کنید —</option>
                {ofCompany.filter((p) => p.isActive).map((p) => <option key={p.id} value={p.id}>{p.title}{p.parentPositionId ? '' : ' (بدون مافوق)'}</option>)}
              </select>
            </Field>
          )}
          {positionsOf(dialog.unit).length > 0 && (
            <Field label="پست مافوق (اختیاری)" hint={`دارندهٔ پست مافوق، مدیر دارندهٔ این پست می‌شود. خالی: زیر ${dialog.unit.manager ? 'مدیر معاونت' : 'رئیس کل شرکت'}.`}>
              <select className={inputClass} value={parentPost} onChange={(e) => setParentPost(e.target.value)}>
                <option value="">{dialog.unit.manager ? 'ندارد (زیر مدیر معاونت)' : 'ندارد (زیر رئیس کل شرکت)'}</option>
                {postTree(positionsOf(dialog.unit)).map(({ position: p, depth }) => (
                  <option key={p.unitPositionId} value={p.unitPositionId}>{'— '.repeat(depth)}{postLabel(p)} ({p.holders.length ? p.holders.map((h) => h.displayName).join('، ') : 'خالی'})</option>
                ))}
              </select>
            </Field>
          )}
          <Field label="کد پست (اختیاری)" hint="خالی بگذارید تا شمارهٔ بعدی شرکت داده شود. کد در هر شرکت یکتاست.">
            <input className={`${inputClass} dir-ltr text-right`} value={newCode} onChange={(e) => setNewCode(e.target.value)} maxLength={40} />
          </Field>
          <p className="text-[11px] text-slate-500">هر پست یک نفر دارد؛ برای چند نفر با یک سمت، چند پست اضافه کنید. تا کسی در پست قرار نگیرد «خالی» نمایش داده می‌شود.</p>
        </>
      );
      break;
    }
    case 'addHolder': {
      const { company, unit, position } = dialog;
      title = `گذاشتن فرد در پست «${postLabel(position)}»`;
      canSave = canSave && !!personId;
      save = async () => done(await run(() => addToPosition(personId!, company, unit, position), `«${personName}» در سمت «${position.title}» قرار گرفت.`, 'افزودن فرد به سمت انجام نشد.'));
      content = (
        <PersonField
          label="کاربر"
          personId={personId}
          personName={personName}
          onChange={(id, n) => { setPersonId(id); setPersonName(n); }}
          hint={`پست‌های دیگرش حفظ می‌شود. اگر در جایگاه فعلی‌اش پستی ندارد (یا هنوز جایگاهی ندارد)، جایگاهش به «${unit ? unit.name : company.name}» منتقل می‌شود.`}
        />
      );
      break;
    }
    case 'memberPositions': {
      title = `سمت‌های «${dialog.name}»`;
      canSave = canSave && !!memberAssignment && allSeats !== null;
      const byUnit = new Map<string, UnitPosition[]>();
      for (const seat of allSeats || []) {
        const where = seat.unitName ?? `${seat.companyName || ''} (مستقیم در شرکت)`;
        byUnit.set(where, [...(byUnit.get(where) || []), seat]);
      }
      const toggle = (id: string) => setChosenSeats((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
      save = async () => {
        if (!memberAssignment) return;
        done(await run(() => setAssignment(dialog.userId, {
          companyId: memberAssignment.companyId,
          unitId: memberAssignment.unitId,
          positionId: memberAssignment.positionId,
          managerUserId: memberAssignment.explicitManagerUserId,
          unitPositionIds: chosenSeats,
        }), 'سمت‌ها ذخیره شد.', 'ذخیره سمت‌ها انجام نشد.'));
      };
      content = allSeats === null ? <p className="text-sm text-slate-500">در حال دریافت سمت‌ها…</p> : allSeats.length === 0 ? (
        <p className="text-sm text-slate-500">هنوز برای هیچ معاونتی سمتی تعریف نشده است. ابتدا از بخش معاونت، «افزودن سمت» را بزنید.</p>
      ) : (
        <div className="space-y-3 max-h-[55vh] overflow-y-auto">
          <p className="text-[11px] text-slate-500">هر تعداد پست خالی را می‌توانید انتخاب کنید، از هر معاونتی. پستی که فرد دیگری دارد قابل انتخاب نیست. پست اول در معاونت خودش، سمت اصلی او حساب می‌شود.</p>
          {[...byUnit.entries()].map(([unitName, seats]) => (
            <div key={unitName} className="space-y-1">
              <p className="text-xs font-bold text-slate-600 dark:text-slate-300">{unitName}</p>
              {seats.map((seat) => {
                const chosen = chosenSeats.includes(seat.id);
                const heldByOther = seat.holders.some((h) => h.userId !== dialog.userId);
                const disabled = !chosen && (!seat.isPositionActive || heldByOther);
                return (
                  <label key={seat.id} className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${chosen ? 'border-indigo-300 bg-indigo-50 dark:bg-indigo-950/40 dark:border-indigo-700' : 'border-slate-200 dark:border-slate-700'} ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
                    <input type="checkbox" checked={chosen} disabled={disabled} onChange={() => toggle(seat.id)} />
                    <span className="font-bold flex-1">{postLabel(seat)}</span>
                    <span className="text-[11px] text-slate-500">{seat.holders.length === 0 ? 'خالی' : seat.holders.map((h) => h.displayName).join('، ')}</span>
                  </label>
                );
              })}
            </div>
          ))}
        </div>
      );
      break;
    }
    case 'addCompanyPost': {
      const company = dialog.company;
      const hasHead = companyPostsOf(company).some((p) => p.isHead);
      const options = positionsForCompany(positions, company.companyId).filter((p) => p.isActive && !(hasHead && !p.parentPositionId));
      title = `افزودن پست مستقیم در «${company.name}»`;
      canSave = canSave && !!positionId;
      save = async () => done(await run(() => addCompanyPosition(company.companyId, positionId, newCode.trim() || undefined), 'پست به شرکت اضافه شد.', 'افزودن پست انجام نشد.'));
      content = (
        <>
          <Field label="سمت" required hint="پستی که سمتش بدون مافوق است، پست رئیس کل است (هر شرکت یکی).">
            <select className={inputClass} value={positionId} onChange={(e) => setPositionId(e.target.value)}>
              <option value="">— انتخاب کنید —</option>
              {options.map((p) => <option key={p.id} value={p.id}>{p.title}{p.parentPositionId ? '' : ' (رئیس کل)'}</option>)}
            </select>
          </Field>
          <Field label="کد پست (اختیاری)" hint="خالی بگذارید تا شمارهٔ بعدی شرکت داده شود.">
            <input className={`${inputClass} dir-ltr text-right`} value={newCode} onChange={(e) => setNewCode(e.target.value)} maxLength={40} />
          </Field>
        </>
      );
      break;
    }
    case 'placeUser': {
      title = `قرار دادن «${dialog.name}» در ساختار`;
      const target = destinations.find((d) => d.key === destination);
      canSave = canSave && !!target && can(P.manageAssignments);
      save = async () => {
        if (!target) return;
        done(await run(async () => {
          const seat = target.unit ? positionsOf(target.unit).find((p) => p.unitPositionId === positionId) : undefined;
          await setAssignment(dialog.userId, {
            companyId: target.companyId,
            unitId: target.unit?.unitId ?? null,
            positionId: target.unit ? seat?.positionId ?? null : positionId || null,
            managerUserId: null,
            unitPositionIds: target.unit ? (seat ? [seat.unitPositionId] : []) : undefined,
          });
          onSelect({ kind: 'member', userId: dialog.userId });
        }, `«${dialog.name}» در ساختار قرار گرفت.`, 'قرار دادن در ساختار انجام نشد.'));
      };
      content = (
        <>
          <Field label="معاونت" required>
            <select className={inputClass} value={destination} onChange={(e) => { setDestination(e.target.value); setPositionId(''); }}>
              {destinations.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
            </select>
          </Field>
          {target && !target.unit && positions.some((p) => p.companyIds !== undefined) && (
            <Field label="سمت در شرکت (اختیاری)" hint="سمتِ بدون مافوق یعنی رئیس کل شرکت.">
              <select className={inputClass} value={positionId} onChange={(e) => setPositionId(e.target.value)}>
                <option value="">— بدون سمت —</option>
                {positionsForCompany(positions, target.companyId).filter((p) => p.isActive).map((p, _, all) => (
                  <option key={p.id} value={p.id}>
                    {p.title}{p.parentPositionId ? '' : all.filter((x) => !x.parentPositionId).length === 1 ? ' (رئیس کل)' : ' (بدون مافوق)'}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {target?.unit && (
            <Field label="پست خالی در این معاونت (اختیاری)">
              <select className={inputClass} value={positionId} onChange={(e) => setPositionId(e.target.value)}>
                <option value="">— بدون سمت —</option>
                {positionsOf(target.unit).filter((p) => p.isActive && p.holders.length === 0).map((p) => (
                  <option key={p.unitPositionId} value={p.unitPositionId}>{postLabel(p)} (خالی)</option>
                ))}
              </select>
            </Field>
          )}
        </>
      );
      break;
    }
  }

  return (
    <AdminDialog
      title={title}
      onClose={close}
      footer={<>
        <SecondaryButton type="button" onClick={close}>انصراف</SecondaryButton>
        <PrimaryButton type="button" onClick={() => save?.()} disabled={!canSave}>{busy && <Loader2 className="w-4 h-4 animate-spin" />} ذخیره</PrimaryButton>
      </>}
    >
      {content}
    </AdminDialog>
  );
};

/** A person chosen with the user search (not inside a <label>: see UserPicker). */
const PersonField: React.FC<{
  label: string;
  personId: string | null;
  personName: string | null;
  onChange: (id: string | null, name: string | null) => void;
  hint?: string;
}> = ({ label, personId, personName, onChange, hint }) => (
  <div className="space-y-1.5">
    <span className="block text-xs font-bold text-slate-700 dark:text-slate-300">{label}</span>
    <UserPicker value={personId} valueLabel={personName} onChange={onChange} />
    {hint && <p className="text-[11px] text-slate-500 dark:text-slate-400">{hint}</p>}
  </div>
);

