import React, { useState } from 'react';
import { AppNotification, AppColorPalette } from '../types';
import { COLOR_PALETTES } from '../utils/theme';
import {
  Bell,
  BellRing,
  X,
  MessageSquare,
  History,
  CheckCheck,
  Check,
  ExternalLink,
  Inbox,
  Cloud,
  Info,
  ArrowLeft
} from 'lucide-react';
import { formatToJalali, toPersianDigits } from '../utils/helpers';
import { CHANGE_SEPARATOR } from '../utils/taskChangeSummary';

interface NotificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: AppNotification[];
  onMarkAsRead: (notificationId: string) => void;
  onMarkAllAsRead: () => void;
  onSelectTask: (taskId: string) => void;
  appColorPalette?: AppColorPalette;
}

export const NotificationModal: React.FC<NotificationModalProps> = ({
  isOpen,
  onClose,
  notifications,
  onMarkAsRead,
  onMarkAllAsRead,
  onSelectTask,
  appColorPalette = 'indigo',
}) => {
  const [activeTab, setActiveTab] = useState<'all' | 'comments' | 'logs'>('all');
  // The item whose details are open in the small cloud popup.
  const [detailFor, setDetailFor] = useState<AppNotification | null>(null);

  if (!isOpen) return null;

  const palette = COLOR_PALETTES[appColorPalette] || COLOR_PALETTES.indigo;

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const filteredNotifications = notifications.filter((n) => {
    if (activeTab === 'comments') return n.type === 'comment';
    if (activeTab === 'logs') return n.type === 'task_log';
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-in fade-in zoom-in-95 my-auto text-slate-800 dark:text-slate-100 flex flex-col max-h-[85vh]">
        
        {/* Header Bar */}
        <div className="flex items-center justify-between px-5 py-4 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-2xl ${palette.accentBg} text-white flex items-center justify-center shadow-xs relative shrink-0`}>
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center border-2 border-white dark:border-slate-900 shadow-xs animate-pulse">
                  {toPersianDigits(unreadCount)}
                </span>
              )}
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                اطلاعیه‌ها و هشدارهای جدید
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                گفتگوهای جدید و آخرین تغییرات ثبت‌شده در فعالیت‌ها
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={onMarkAllAsRead}
                className="hidden sm:flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 rounded-xl transition-colors cursor-pointer"
                title="علامت‌گذاری همه به عنوان خوانده‌شده"
              >
                <CheckCheck className="w-4 h-4" />
                <span>خوانده‌شدن همه</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Filters */}
        <div className="flex items-center justify-between px-5 py-2.5 bg-slate-100/70 dark:bg-slate-800/40 border-b border-slate-200/80 dark:border-slate-800 shrink-0 gap-2 overflow-x-auto">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => { setActiveTab('all'); setDetailFor(null); }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'all'
                  ? `${palette.accentBg} text-white shadow-xs`
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-700/60'
              }`}
            >
              همه ({toPersianDigits(notifications.length)})
            </button>
            <button
              type="button"
              onClick={() => { setActiveTab('comments'); setDetailFor(null); }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'comments'
                  ? `${palette.accentBg} text-white shadow-xs`
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-700/60'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>گفتگوها ({toPersianDigits(notifications.filter((n) => n.type === 'comment').length)})</span>
            </button>
            <button
              type="button"
              onClick={() => { setActiveTab('logs'); setDetailFor(null); }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'logs'
                  ? `${palette.accentBg} text-white shadow-xs`
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-700/60'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>تغییرات فعالیت‌ها ({toPersianDigits(notifications.filter((n) => n.type === 'task_log').length)})</span>
            </button>
          </div>

          {unreadCount > 0 && (
            <button
              type="button"
              onClick={onMarkAllAsRead}
              className="sm:hidden text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer whitespace-nowrap"
            >
              خوانده‌شدن همه
            </button>
          )}
        </div>

        {/* Notifications List */}
        <div className="p-4 overflow-y-auto space-y-2.5 flex-1">
          {filteredNotifications.length === 0 ? (
            <div className="py-12 px-4 text-center space-y-3">
              <div className="w-14 h-14 mx-auto rounded-3xl bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 flex items-center justify-center">
                <Inbox className="w-7 h-7" />
              </div>
              <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
                هیچ اطلاعیه یا هشداری در این بخش یافت نشد.
              </p>
            </div>
          ) : (
            filteredNotifications.map((notification) => (
              <div
                key={notification.id}
                className={`p-3.5 rounded-2xl border transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                  notification.isRead
                    ? 'bg-slate-50/60 dark:bg-slate-800/30 border-slate-200/70 dark:border-slate-800 opacity-80'
                    : 'bg-white dark:bg-slate-800/90 border-indigo-200 dark:border-indigo-900/60 shadow-xs'
                }`}
              >
                {/* Content Left / Details */}
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className="shrink-0 mt-0.5">
                    {notification.actorAvatar ? (
                      <img
                        src={notification.actorAvatar}
                        alt={notification.actorName}
                        className="w-9 h-9 rounded-full object-cover border border-slate-200 dark:border-slate-700"
                      />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center text-xs font-bold">
                        {notification.type === 'comment' ? (
                          <MessageSquare className="w-4 h-4 text-indigo-500" />
                        ) : notification.type === 'reminder' ? (
                          <BellRing className="w-4 h-4 text-rose-500" />
                        ) : notification.type === 'system' ? (
                          <Bell className="w-4 h-4 text-sky-500" />
                        ) : (
                          <History className="w-4 h-4 text-emerald-500" />
                        )}
                      </div>
                    )}
                  </div>

                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                        {notification.actorName}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold ${
                          notification.type === 'comment'
                            ? 'bg-indigo-50 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800'
                            : notification.type === 'reminder'
                            ? 'bg-rose-50 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                            : notification.type === 'system'
                            ? 'bg-sky-50 dark:bg-sky-950/80 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800'
                            : notification.actionTitle.includes('ایجاد') || notification.actionTitle.includes('ثبت')
                            ? 'bg-amber-50 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                            : notification.actionTitle.includes('واگذار')
                            ? 'bg-purple-50 dark:bg-purple-950/80 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800'
                            : 'bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                        }`}
                      >
                        {notification.badge
                          ? notification.badge
                          : notification.type === 'comment'
                          ? 'دیدگاه جدید'
                          : notification.type === 'reminder'
                          ? 'یادآوری موعد'
                          : notification.type === 'system'
                          ? 'اطلاعیه'
                          : notification.actionTitle.includes('ایجاد') || notification.actionTitle.includes('ثبت')
                          ? 'فعالیت جدید'
                          : notification.actionTitle.includes('واگذار')
                          ? 'واگذاری فعالیت'
                          : 'تغییر فعالیت'}
                      </span>
                      {!notification.isRead && (
                        <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                      )}
                    </div>

                    <p className="text-xs font-medium text-slate-700 dark:text-slate-300 break-words leading-relaxed">
                      {notification.taskTitle && (
                        <>
                          <span className="text-slate-500 dark:text-slate-400">فعالیت </span>
                          <strong className="text-indigo-600 dark:text-indigo-400 font-bold">«{notification.taskTitle}»</strong>
                          <span className="text-slate-400 mx-1.5">—</span>
                        </>
                      )}
                      <span className={notification.type === 'comment' ? '' : 'font-bold'}>{notification.actionTitle}</span>
                    </p>
                    {/* An edit's changes, each on its own line. */}
                    {notification.details && !notification.popup && (
                      <ul className="space-y-0.5 text-xs text-slate-600 dark:text-slate-300 leading-relaxed break-words">
                        {notification.details.split(CHANGE_SEPARATOR).map((line, i) => (
                          <li key={i} className="flex gap-1.5">
                            <span className="text-slate-400 shrink-0">•</span>
                            <span>{line}</span>
                          </li>
                        ))}
                      </ul>
                    )}

                    <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium pt-0.5">
                      {formatToJalali(notification.createdAt)}
                    </p>
                  </div>
                </div>

                {/* Actions Right */}
                <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                  {notification.popup && notification.details && (
                    <button
                      type="button"
                      onClick={() => {
                        if (!notification.isRead) onMarkAsRead(notification.id);
                        setDetailFor(notification);
                      }}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-900/60 transition-all cursor-pointer"
                    >
                      <Info className="w-3.5 h-3.5" />
                      <span>جزئیات</span>
                    </button>
                  )}
                  {/* A server notification without a task the user can open has nothing to show. */}
                  {notification.taskId && (
                  <button
                    type="button"
                    onClick={() => {
                      onMarkAsRead(notification.id);
                      onSelectTask(notification.taskId);
                      onClose();
                    }}
                    className={`flex items-center gap-1 px-3 py-1.5 ${palette.accentBg} ${palette.accentHover} text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-2xs`}
                  >
                    <span>مشاهده فعالیت</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                  )}

                  <button
                    type="button"
                    onClick={() => onMarkAsRead(notification.id)}
                    title={notification.isRead ? 'علامت به‌عنوان خوانده‌نشده' : 'علامت به‌عنوان خوانده‌شده'}
                    className={`p-1.5 rounded-xl border transition-colors cursor-pointer ${
                      notification.isRead
                        ? 'text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                        : 'text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/60'
                    }`}
                  >
                    <Check className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-100 dark:border-slate-800 text-center text-xs text-slate-400 dark:text-slate-500 shrink-0">
          با کلیک بر روی هر اطلاعیه می‌توانید به جزئیات همان فعالیت منتقل شوید.
        </div>

      </div>

      {/* Details of a past-due task's change, in a small soft cloud. */}
      {detailFor && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 backdrop-blur-[2px] p-4"
          onClick={() => setDetailFor(null)}
          role="dialog"
          aria-modal="true"
          aria-label="جزئیات تغییر فعالیت موعدگذشته"
        >
          <div className="relative w-full max-w-sm pt-8 animate-in zoom-in-95 fade-in duration-200" onClick={(e) => e.stopPropagation()}>
            <span className="absolute top-3 right-10 h-14 w-14 rounded-full bg-sky-100 dark:bg-slate-700" />
            <span className="absolute top-0 right-20 h-[4.5rem] w-[4.5rem] rounded-full bg-sky-100 dark:bg-slate-700" />
            <span className="absolute top-4 right-36 h-12 w-12 rounded-full bg-sky-100 dark:bg-slate-700" />
            <div className="relative rounded-[2rem] border border-white/80 dark:border-slate-600 bg-gradient-to-b from-sky-100 via-sky-50 to-white dark:from-slate-700 dark:via-slate-800 dark:to-slate-800 p-5 shadow-[0_24px_60px_-24px_rgba(14,165,233,0.65)]">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/80 dark:bg-slate-900/60 text-sky-500 shadow-sm">
                    <Cloud className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-sm font-black text-slate-800 dark:text-white">تغییر فعالیت موعدگذشته</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-300">{formatToJalali(detailFor.createdAt)}</p>
                  </div>
                </div>
                <button type="button" onClick={() => setDetailFor(null)} aria-label="بستن" title="بستن" className="rounded-xl p-1.5 text-slate-400 hover:bg-white/70 dark:hover:bg-slate-700 cursor-pointer">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <p className="mt-3 rounded-2xl bg-white/80 dark:bg-slate-900/50 px-3.5 py-2.5 text-sm font-black leading-6 text-indigo-700 dark:text-indigo-300 shadow-sm">
                «{detailFor.taskTitle}»
              </p>

              <ul className="mt-2.5 max-h-[55vh] space-y-2 overflow-y-auto pr-0.5">
                {(detailFor.details || '').split(CHANGE_SEPARATOR).map((line, i) => {
                  const at = line.indexOf(': ');
                  const label = at >= 0 ? line.slice(0, at) : '';
                  const value = at >= 0 ? line.slice(at + 2) : line;
                  const steps = value.split(' ← ');
                  return (
                    <li key={i} className="rounded-2xl bg-white/70 dark:bg-slate-900/40 px-3.5 py-2 shadow-sm">
                      {label && <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">{label}</p>}
                      {steps.length === 2 ? (
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs font-black">
                          <span className="rounded-lg bg-slate-100 dark:bg-slate-700 px-2 py-0.5 text-slate-600 dark:text-slate-200">{steps[0]}</span>
                          <ArrowLeft className="h-3.5 w-3.5 text-sky-500" />
                          <span className="rounded-lg bg-emerald-100 dark:bg-emerald-950/60 px-2 py-0.5 text-emerald-700 dark:text-emerald-300">{steps[1]}</span>
                        </div>
                      ) : (
                        <p className="text-xs font-black text-slate-800 dark:text-slate-100">{value}</p>
                      )}
                    </li>
                  );
                })}
              </ul>

              <div className="mt-4 flex items-center justify-end gap-2">
                <button type="button" onClick={() => setDetailFor(null)} className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-200 hover:bg-white/70 dark:hover:bg-slate-700 cursor-pointer">
                  بستن
                </button>
                {detailFor.taskId && (
                  <button
                    type="button"
                    onClick={() => {
                      const taskId = detailFor.taskId;
                      setDetailFor(null);
                      onSelectTask(taskId);
                      onClose();
                    }}
                    className={`flex items-center gap-1 px-3.5 py-1.5 ${palette.accentBg} ${palette.accentHover} text-white rounded-xl text-xs font-bold shadow-sm cursor-pointer`}
                  >
                    <span>مشاهده فعالیت</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
