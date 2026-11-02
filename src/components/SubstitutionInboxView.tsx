import React, { useEffect, useState } from 'react';
import { UserCog, Briefcase, Loader2, CalendarClock, X } from 'lucide-react';
import { AdminCard, Notice, PrimaryButton, SecondaryButton, StatusBadge, inputClass } from './admin/AdminUi';
import { toPersianDigits } from '../utils/helpers';
import { gregorianToJalali } from '../utils/jalali';
import { userErrorMessage } from '../utils/errorMessages';
import {
  SubstitutionInbox, VacantPost, clearActingPost, getSubstitutionInbox, setActingPost,
} from '../services/orgStructureApi';
import { appConfirm } from '../utils/appDialog';

const STATUS_TITLES: Record<string, string> = {
  Todo: 'شروع نشده', InProgress: 'در حال انجام', Paused: 'متوقف', Completed: 'تکمیل شده', Cancelled: 'لغو شده',
};

const postLabel = (p: { title: string; code: string }) => `${p.title} · کد ${toPersianDigits(p.code)}`;

function jalaliDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const { jy, jm, jd } = gregorianToJalali(y, m, d);
  return toPersianDigits(`${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`);
}

/**
 * «کارتابل جانشینی»: the open tasks of vacant posts, for the managers above each post (and
 * whoever may manage every one). Only titles, due dates and statuses show here. A post of the
 * company can be put in charge of a vacant one (سرپرستی): its holder then sees those tasks and
 * comments on them as a stand-in, nothing more, until someone takes the vacant post.
 */
export const SubstitutionInboxView: React.FC<{ onChanged?: () => void }> = ({ onChanged }) => {
  const [inbox, setInbox] = useState<SubstitutionInbox | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [choice, setChoice] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    try {
      setInbox(await getSubstitutionInbox());
    } catch (err) {
      setMessage({ type: 'error', text: userErrorMessage(err, 'دریافت کارتابل جانشینی ممکن نشد.') });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const act = async (post: VacantPost, action: () => Promise<unknown>, success: string) => {
    setBusy(post.postId);
    setMessage(null);
    try {
      await action();
      setMessage({ type: 'success', text: success });
      await load();
      onChanged?.();
    } catch (err) {
      setMessage({ type: 'error', text: userErrorMessage(err, 'انجام نشد.') });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4" data-substitution-inbox>
      <AdminCard>
        <div className="flex items-center gap-3 px-5 py-4">
          <span className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-300 flex items-center justify-center shrink-0"><UserCog className="w-5 h-5" /></span>
          <div>
            <h2 className="text-base font-extrabold text-slate-900 dark:text-white">کارتابل جانشینی</h2>
            <p className="text-xs text-slate-500 mt-0.5 leading-5">
              فعالیت‌های پست‌هایی که خالی شده‌اند. برای هر پست خالی می‌توانید یک پست دیگر را سرپرست کنید؛ دارندهٔ آن فقط فعالیت‌ها را می‌بیند و نظر می‌گذارد (با عنوان «جانشین»)، تا وقتی کسی در پست خالی قرار گیرد.
            </p>
          </div>
        </div>
      </AdminCard>

      {message && <Notice type={message.type} onClose={() => setMessage(null)}>{message.text}</Notice>}

      {loading && !inbox ? (
        <div className="flex justify-center py-10 text-slate-400"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : !inbox?.enabled || inbox.posts.length === 0 ? (
        <AdminCard><p className="p-8 text-center text-sm text-slate-500">پست خالی‌ای با فعالیت باز ندارید.</p></AdminCard>
      ) : inbox.posts.map((post) => (
        <AdminCard key={post.postId}>
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3" data-vacant-post={post.postId}>
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-9 h-9 rounded-xl bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-300 flex items-center justify-center shrink-0"><Briefcase className="w-4 h-4" /></span>
              <div className="min-w-0">
                <p className="text-sm font-extrabold text-slate-900 dark:text-white truncate">{postLabel(post)}</p>
                <p className="text-[11px] text-slate-500 truncate">{post.place}</p>
                {post.holderName && (
                  <p className="text-[11px] text-amber-700 dark:text-amber-300 truncate">
                    مسئول: {post.holderName}{post.actingUntil ? ` · جانشینی تا ${new Date(new Date(post.actingUntil).getTime() - 1).toLocaleDateString('fa-IR')}` : ''}
                  </p>
                )}
              </div>
              <StatusBadge tone="amber">خالی</StatusBadge>
            </div>
            <div className="text-xs">
              {post.acting ? (
                <span className="text-slate-600 dark:text-slate-300">
                  سرپرست: <b className="text-slate-900 dark:text-white">{postLabel(post.acting)}</b> ({post.acting.holderName || 'خالی'})
                </span>
              ) : (
                <span className="text-rose-600">بدون سرپرست</span>
              )}
            </div>
          </div>

          <div className="px-5 py-3 flex flex-wrap items-end gap-2 border-b border-slate-100 dark:border-slate-800">
            <label className="flex-1 min-w-[220px] space-y-1">
              <span className="block text-[11px] font-bold text-slate-600 dark:text-slate-300">{post.acting ? 'تغییر سرپرست' : 'تعیین سرپرست'}</span>
              <select
                className={inputClass}
                value={choice[post.postId] ?? ''}
                onChange={(e) => setChoice({ ...choice, [post.postId]: e.target.value })}
              >
                <option value="">— یک پست انتخاب کنید —</option>
                {post.candidates.map((c) => (
                  <option key={c.postId} value={c.postId}>{postLabel(c)} — {c.holderName} ({c.place})</option>
                ))}
              </select>
            </label>
            <PrimaryButton
              type="button"
              disabled={!!busy || !choice[post.postId]}
              onClick={() => act(post, () => setActingPost(post.postId, choice[post.postId]), 'سرپرست تعیین شد.')}
            >
              {busy === post.postId && <Loader2 className="w-4 h-4 animate-spin" />} ذخیره
            </PrimaryButton>
            {post.acting && (
              <SecondaryButton
                type="button"
                disabled={!!busy}
                onClick={async () => await appConfirm('سرپرستی این پست پایان یابد؟') && act(post, () => clearActingPost(post.postId), 'سرپرستی پایان یافت.')}
              >
                <X className="w-4 h-4" /> پایان سرپرستی
              </SecondaryButton>
            )}
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {post.tasks.length === 0 ? (
              <p className="px-5 py-4 text-xs text-slate-400">فعالیت بازی ندارد.</p>
            ) : post.tasks.map((task) => (
              <div key={task.taskId} className="px-5 py-2.5 flex items-center justify-between gap-3 text-sm">
                <span className="font-bold text-slate-800 dark:text-slate-100 truncate">{task.title}</span>
                <span className="flex items-center gap-3 shrink-0 text-[11px] text-slate-500">
                  <span className="flex items-center gap-1"><CalendarClock className="w-3.5 h-3.5" /> {jalaliDate(task.dueDate)}</span>
                  <StatusBadge tone="slate">{STATUS_TITLES[task.status] || task.status}</StatusBadge>
                </span>
              </div>
            ))}
          </div>
        </AdminCard>
      ))}
    </div>
  );
};
