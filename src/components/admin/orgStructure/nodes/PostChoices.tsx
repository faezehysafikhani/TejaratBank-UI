// Before someone takes a post: what happens to the posts they already hold (each one stays or is
// removed), and - when the post asked for is held by someone else - which post to use instead.
import React, { useState } from 'react';
import { AdminDialog, Notice, PrimaryButton, SecondaryButton } from '../../AdminUi';
import { toPersianDigits } from '../../../../utils/helpers';
import { type HeldPosition, endPostAppointment, getAssignment, setAssignment } from '../../../../services/orgStructureApi';

/** A post the person could take instead: a vacant one, a new one, or the filled one (its holder then ends). */
export type PostTarget = { kind: 'post'; postId: string } | { kind: 'new' } | { kind: 'replace'; postId: string };

export interface PostOption { postId: string; label: string; holderName?: string | null }

export interface PostChoice { target: PostTarget | null; endPostIds: string[] }

const heldLabel = (p: HeldPosition) => `${p.title}${p.code ? ` · کد ${toPersianDigits(p.code)}` : ''} — ${p.unitName}`;

/** The posts the person holds now (none, or no place yet: empty). */
export async function heldPostsOf(userId: string): Promise<HeldPosition[]> {
  const assignment = await getAssignment(userId);
  return assignment?.positions ?? [];
}

/** Ends the posts the person chose to give up, from `day` (empty: now). */
export async function endPosts(postIds: string[], day?: string | null): Promise<void> {
  for (const postId of postIds) await endPostAppointment(postId, day || null);
}

/**
 * After the person's main post was given up: the post they now hold (preferably `preferPostId`)
 * becomes the main one, so their place and their direct manager follow it.
 */
export async function moveMainToHeldPost(userId: string, preferPostId: string): Promise<void> {
  const place = await getAssignment(userId);
  const held = place?.positions ?? [];
  if (!place || held.length === 0 || held.some((p) => p.positionId === place.positionId && p.unitId === place.unitId)) return;
  const main = held.find((p) => p.unitPositionId === preferPostId) ?? held[0];
  await setAssignment(userId, {
    companyId: place.companyId,
    unitId: main.unitId,
    positionId: main.positionId,
    managerUserId: place.explicitManagerUserId,
    unitPositionIds: [main.unitPositionId, ...held.filter((p) => p !== main).map((p) => p.unitPositionId)],
  });
}

/**
 * The questions in one dialog. `filled`: the post asked for and whoever holds it (then `vacant`
 * lists the free posts of the same unit). `previous`: the posts the person holds now.
 */
export const PostChoiceDialog: React.FC<{
  personName: string;
  filled: PostOption[] | null;
  vacant: PostOption[];
  allowNew: boolean;
  allowReplace: boolean;
  previous: HeldPosition[];
  onConfirm: (choice: PostChoice) => void;
  onCancel: () => void;
}> = ({ personName, filled, vacant, allowNew, allowReplace, previous, onConfirm, onCancel }) => {
  const first: string = filled
    ? (vacant[0] ? `post:${vacant[0].postId}` : allowNew ? 'new' : allowReplace && filled[0] ? `replace:${filled[0].postId}` : '')
    : '';
  const [target, setTarget] = useState(first);
  const [ends, setEnds] = useState<Set<string>>(new Set());

  const toggle = (postId: string, remove: boolean) => setEnds((s) => {
    const next = new Set(s);
    if (remove) next.add(postId); else next.delete(postId);
    return next;
  });

  const confirm = () => {
    let chosen: PostTarget | null = null;
    if (target === 'new') chosen = { kind: 'new' };
    else if (target.startsWith('post:')) chosen = { kind: 'post', postId: target.slice(5) };
    else if (target.startsWith('replace:')) chosen = { kind: 'replace', postId: target.slice(8) };
    onConfirm({ target: chosen, endPostIds: [...ends] });
  };

  const replacing = target.startsWith('replace:');
  const radio = (value: string, text: React.ReactNode, testId: string) => (
    <label key={value} className="flex items-start gap-2 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 cursor-pointer" data-testid={testId}>
      <input type="radio" name="post-target" value={value} checked={target === value} onChange={() => setTarget(value)} className="mt-1" />
      <span className="text-sm text-slate-800 dark:text-slate-100">{text}</span>
    </label>
  );

  return (
    <AdminDialog
      title={`پیش از ثبت جایگاه «${personName}»`}
      onClose={onCancel}
      footer={<>
        <SecondaryButton type="button" onClick={onCancel}>انصراف</SecondaryButton>
        <PrimaryButton type="button" onClick={confirm} disabled={!!filled && !target} data-testid="post-choice-confirm">
          {replacing ? 'جایگزین کن و ثبت' : 'ثبت'}
        </PrimaryButton>
      </>}
    >
      <div className="space-y-4" data-testid="post-choice-dialog">
        {filled && (
          <div className="space-y-2">
            <Notice type="error">
              این پست پر است: {filled.map((f) => `«${f.label}» (${f.holderName})`).join('، ')}.
              {vacant.length > 0 ? ' پست‌های خالیِ همین واحد را می‌توانید انتخاب کنید.' : ' در این واحد پست خالی نیست.'}
            </Notice>
            {vacant.map((v) => radio(`post:${v.postId}`, <>پست خالی: {v.label}</>, 'post-choice-vacant'))}
            {allowNew && radio('new', <>یک پست تازه با همین سمت در همین واحد ساخته شود</>, 'post-choice-new')}
            {allowReplace && filled.map((f) => radio(`replace:${f.postId}`, <>جایگزینِ «{f.holderName}» در «{f.label}» شود (او از همان روز کنار می‌رود)</>, 'post-choice-replace'))}
            {replacing && <Notice type="error">با ثبت، مسئول فعلی این پست کنار می‌رود و در تاریخچه می‌ماند.</Notice>}
          </div>
        )}
        {previous.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-bold text-slate-800 dark:text-slate-100">«{personName}» الان این پست‌ها را دارد؛ هر کدام بماند یا برداشته شود؟</p>
            {previous.map((p) => (
              <div key={p.unitPositionId} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2" data-testid="post-choice-previous">
                <span className="text-sm text-slate-800 dark:text-slate-100">{heldLabel(p)}</span>
                <span className="flex gap-3 text-xs">
                  <label className="flex items-center gap-1 cursor-pointer"><input type="radio" name={`keep-${p.unitPositionId}`} checked={!ends.has(p.unitPositionId)} onChange={() => toggle(p.unitPositionId, false)} /> بماند</label>
                  <label className="flex items-center gap-1 cursor-pointer"><input type="radio" name={`keep-${p.unitPositionId}`} checked={ends.has(p.unitPositionId)} onChange={() => toggle(p.unitPositionId, true)} data-testid="post-choice-remove" /> برداشته شود</label>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminDialog>
  );
};
