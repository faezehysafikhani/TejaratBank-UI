// «افزودن پست»: a job title (an existing one, or a new one made right here) and how many posts of
// it a unit gets. Nothing has to be made first: a missing title is made, linked to the company and
// put under the right superior; a company with no head title yet gets one (it is asked in the same box).
import React, { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { AdminDialog, Field, Notice, PrimaryButton, SecondaryButton, Toggle, inputClass } from '../../AdminUi';
import { userErrorMessage } from '../../../../utils/errorMessages';
import { toPersianDigits } from '../../../../utils/helpers';
import {
  type ChartCompany, type ChartUnit, type Position,
  addCompanyPosition, addUnitPosition, createPosition, positionsForCompany, setManagerPost, updatePosition,
} from '../../../../services/orgStructureApi';
import { allUnitsOf, positionsOf } from '../orgChartModel';

export const AddPostsDialog: React.FC<{
  company: ChartCompany;
  /** The unit that gets the posts; none: the user chooses one. */
  unit: ChartUnit | null;
  /** Every position (the titles). */
  positions: Position[];
  onDone: (text: string) => Promise<void> | void;
  onClose: () => void;
}> = ({ company, unit: fixedUnit, positions, onDone, onClose }) => {
  const units = useMemo(() => allUnitsOf(company).filter((u) => u.isActive !== false), [company]);
  const [unitId, setUnitId] = useState(fixedUnit?.unitId ?? (units.length === 1 ? units[0].unitId : ''));
  const unit = fixedUnit ?? units.find((u) => u.unitId === unitId) ?? null;
  const ofCompany = positionsForCompany(positions, company.companyId).filter((p) => p.isActive);
  const head = ofCompany.find((p) => !p.parentPositionId);
  const [title, setTitle] = useState('');
  const [count, setCount] = useState(1);
  const [headTitle, setHeadTitle] = useState('مدیرعامل');
  const [headPostChoice, setHeadPostChoice] = useState<boolean | null>(null);
  const [parentId, setParentId] = useState('');
  const [manager, setManager] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const typed = title.trim();
  /** The first title asked for is the head's own («مدیرعامل» in the CEO's unit): it is the unit's post, so a separate post directly in the company is off unless asked for. */
  const sameAsHeadTyped = !!typed && typed === headTitle.trim();
  const headPost = headPostChoice ?? !sameAsHeadTyped;
  const existing = positions.find((p) => p.title === typed);
  const known = ofCompany.find((p) => p.title === typed);
  const isNewTitle = !!typed && !existing;
  const linksExisting = !!existing && !known;
  const unitPosts = unit ? positionsOf(unit) : [];
  // A title that sounds like a manager's goes under the company's head; any other goes under the highest title the unit already has.
  const depthOf = (id: string) => { let n = 0; for (let p = ofCompany.find((x) => x.id === id); p?.parentPositionId && n < 20; p = ofCompany.find((x) => x.id === p!.parentPositionId)) n++; return n; };
  const highestHere = [...unitPosts].sort((x, y) => depthOf(x.positionId) - depthOf(y.positionId))[0]?.positionId;
  const defaultParent = /مدیر|رئیس|معاون|سرپرست/.test(typed) ? head?.id || '' : highestHere || head?.id || '';
  const parent = parentId || defaultParent;
  const needsHead = !head;
  const firstPosts = unit != null && unitPosts.length === 0;
  const ready = !!unit && !!typed && count >= 1 && count <= 50 && (!needsHead || !!headTitle.trim()) && (!isNewTitle || needsHead || !!parent);

  const save = async () => {
    if (!unit) return;
    setBusy(true);
    setError(null);
    try {
      // The head's title first, when the company has none (the first title has no superior).
      let headId = head?.id ?? null;
      if (needsHead) {
        const found = positions.find((p) => p.title === headTitle.trim());
        const made = found
          ? await updatePosition(found.id, found.title, found.parentPositionId, true, [...new Set([...(found.companyIds ?? []), company.companyId])])
          : await createPosition(headTitle.trim(), null, [company.companyId]);
        headId = made.id;
        if (headPost) await addCompanyPosition(company.companyId, made.id);
      }
      let positionId = needsHead && typed === headTitle.trim() ? headId ?? undefined : (known ?? existing)?.id;
      if (existing && !known) {
        // A title that exists for other companies: it is turned on for this one too.
        await updatePosition(existing.id, existing.title, existing.parentPositionId, existing.isActive, [...new Set([...(existing.companyIds ?? []), company.companyId])]);
      }
      if (!positionId) {
        const under = needsHead ? headId : (parent || headId);
        positionId = (await createPosition(typed, under, [company.companyId])).id;
      }
      for (let i = 0; i < count; i++) {
        const post = await addUnitPosition(unit.unitId, positionId);
        if (i === 0 && firstPosts && manager) await setManagerPost(post.id, true);
      }
      await onDone(`${toPersianDigits(count)} پست «${typed}» به «${unit.name}» اضافه شد.`);
      onClose();
    } catch (err) {
      setError(userErrorMessage(err, 'افزودن پست انجام نشد.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminDialog
      title={unit ? `افزودن پست به «${unit.name}»` : 'افزودن پست'}
      onClose={() => !busy && onClose()}
      footer={<>
        <SecondaryButton type="button" onClick={onClose} disabled={busy}>انصراف</SecondaryButton>
        <PrimaryButton type="button" onClick={save} disabled={busy || !ready} data-testid="add-posts-save">{busy && <Loader2 className="w-4 h-4 animate-spin" />} افزودن</PrimaryButton>
      </>}
    >
      {error && <Notice type="error" onClose={() => setError(null)}>{error}</Notice>}
      {!fixedUnit && (
        <Field label="واحد" required>
          <select className={inputClass} value={unitId} onChange={(e) => setUnitId(e.target.value)} aria-label="واحد">
            <option value="">— انتخاب کنید —</option>
            {units.map((u) => <option key={u.unitId} value={u.unitId}>{u.name}</option>)}
          </select>
        </Field>
      )}
      {needsHead && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/20 p-3 space-y-2" data-testid="head-title-box">
          <Field label="عنوان رئیس کل شرکت" required hint="اولین سمت هر شرکت بالاترین سمت آن است و همه‌ی سمت‌های دیگر زیر آن قرار می‌گیرند.">
            <input className={inputClass} value={headTitle} onChange={(e) => setHeadTitle(e.target.value)} maxLength={120} aria-label="عنوان رئیس کل شرکت" />
          </Field>
          <Toggle checked={headPost} onChange={setHeadPostChoice} label="یک پست رئیس کل هم مستقیماً زیر شرکت ساخته شود" />
        </div>
      )}
      <Field label="عنوان پست" required hint={ofCompany.length > 0 ? 'از فهرست انتخاب کنید یا عنوان تازه بنویسید؛ عنوان تازه همین‌جا ساخته می‌شود.' : 'مثلاً: مدیر کل، رئیس اداره، کارشناس.'}>
        <input
          className={inputClass}
          list="org-position-titles"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          autoFocus={!!fixedUnit}
          aria-label="عنوان پست"
          placeholder="مثلاً: کارشناس"
        />
        <datalist id="org-position-titles">
          {ofCompany.filter((p) => !!p.parentPositionId).map((p) => <option key={p.id} value={p.title} />)}
        </datalist>
      </Field>
      {linksExisting && <Notice type="info">عنوان «{typed}» در سامانه هست؛ برای این شرکت هم فعال می‌شود (برای شرکت‌های دیگر تغییری نمی‌کند).</Notice>}
      {/* A unit that has posts already: the superior box is there from the start, before anything is typed. The first post of a unit has nothing above it to ask about. */}
      {!needsHead && unitPosts.length > 0 && (
        <Field
          label="سمت مافوق"
          hint={existing
            ? 'این عنوان از قبل مافوق دارد و همان می‌ماند.'
            : 'دارنده‌ی سمت مافوق، مدیر دارنده‌ی این پست می‌شود. از پست‌های همین واحد (یا رئیس کل شرکت) انتخاب کنید؛ پیش‌فرض مناسب انتخاب شده است.'}
        >
          {existing ? (
            <select className={inputClass} disabled aria-label="سمت مافوق" data-testid="parent-select" value="">
              <option value="">{positions.find((p) => p.id === existing.parentPositionId)?.title ?? 'رئیس کل شرکت'}</option>
            </select>
          ) : (
            <select className={inputClass} value={parent} onChange={(e) => setParentId(e.target.value)} aria-label="سمت مافوق" data-testid="parent-select">
              {head && <option value={head.id}>{head.title} (رئیس کل شرکت)</option>}
              {[...new Map(unitPosts.map((p) => [p.positionId, p.title])).entries()].filter(([id]) => id !== head?.id).map(([id, t]) => <option key={id} value={id}>{t} (همین واحد)</option>)}
            </select>
          )}
        </Field>
      )}
      <Field label="چند پست؟" hint="هر پست یک نفر دارد؛ برای سه کارشناس عدد ۳ را بگذارید.">
        <input className={`${inputClass} w-28`} type="number" min={1} max={50} value={count} onChange={(e) => setCount(Math.max(1, Math.min(50, Number(e.target.value) || 1)))} aria-label="تعداد پست" />
      </Field>
      {firstPosts && <Toggle checked={manager} onChange={setManager} label="اولین پست، پست مدیر این واحد باشد" />}
      <p className="text-[11px] text-slate-500">پست‌ها خالی ساخته می‌شوند؛ هر وقت خواستید فرد را در «افزودن نفر به پست» یا از خود پست بگذارید.</p>
    </AdminDialog>
  );
};
