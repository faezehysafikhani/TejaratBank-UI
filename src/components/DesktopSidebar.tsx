import React, { useEffect, useState } from 'react';
import { Kanban, Calendar, AlertCircle, Settings, LogOut, MessageSquare, FileText, PanelRightClose, Plus, BarChart3, UserCog } from 'lucide-react';
import { toPersianDigits } from '../utils/helpers';
import { AppColorPalette, User as UserType } from '../types';
import { COLOR_PALETTES } from '../utils/theme';
import { ActiveTab } from './SandwichBar';

interface DesktopSidebarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  onOpenCreateModal?: () => void;
  onOpenSettings: () => void;
  onOpenPdfCatalog?: () => void;
  onLogout?: () => void;
  overdueCount: number;
  unreadChatCount?: number;
  appColorPalette?: AppColorPalette;
  totalTasks?: number;
  completedTasks?: number;
  currentUser?: UserType | null;
  isOpen?: boolean;
  onToggleOpen?: () => void;
  /** Whether a section is available to the user (permissions); all are when omitted. */
  canOpenTab?: (tab: ActiveTab) => boolean;
}

export const DesktopSidebar: React.FC<DesktopSidebarProps> = ({
  activeTab,
  setActiveTab,
  onOpenCreateModal,
  onOpenSettings,
  onOpenPdfCatalog,
  onLogout,
  overdueCount,
  unreadChatCount = 0,
  appColorPalette = 'indigo',
  totalTasks = 0,
  completedTasks = 0,
  currentUser,
  isOpen = true,
  onToggleOpen,
  canOpenTab = (_tab: ActiveTab) => true,
}) => {
  const palette = COLOR_PALETTES[appColorPalette] || COLOR_PALETTES.indigo;

  // The navbar's real height (it grows when its items wrap on narrower screens), so the gap under
  // it is the same on every monitor size.
  const [headerHeight, setHeaderHeight] = useState(77);
  useEffect(() => {
    const header = document.querySelector('header.ui-bar');
    if (!header) return;
    const update = () => setHeaderHeight(Math.round(header.getBoundingClientRect().height));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  if (!isOpen) {
    return null;
  }

  const progressRatio = totalTasks > 0 ? Math.min(1, completedTasks / totalTasks) : 0;
  const progressPercent = Math.round(progressRatio * 100);
  const RADIUS = 40;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

  // Fixed to the viewport on every page, same size everywhere: 15px below the sticky header and
  // 15px above the bottom of the screen. Never sticky (which unsticks near the end of its
  // container) and never measured from page content, so it doesn't move or resize.
  // Right offset replicates where this used to sit as a flex item (the ".../mx-auto .../px-3"
  // main container from App.tsx, right-most child in this RTL row): the page's own side padding,
  // plus, once the centered max-w-[1920px] container has margins of its own, that margin too.
  // The spacer div below keeps the width reserved in the flex row so the main content doesn't
  // shift into the space this now-fixed element used to occupy.
  const fixedRight = 'max(0.75rem, calc((100vw - 1920px) / 2 + 0.75rem))';
  const HEADER_HEIGHT_PX = headerHeight;
  const EDGE_GAP_PX = 15;

  return (
    <>
    {/* Reserves the sidebar's width/gap in the flex row; the sidebar itself is fixed (out of flow). */}
    <div className="hidden lg:block w-48 shrink-0" aria-hidden="true" />
    <aside
      className="hidden lg:flex flex-col w-48 shrink-0 gap-3 p-2.5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl shadow-sm fixed z-20 overflow-y-auto animate-in fade-in slide-in-from-right-4 duration-300"
      style={{ right: fixedRight, top: HEADER_HEIGHT_PX + EDGE_GAP_PX, bottom: EDGE_GAP_PX }}
    >

      {onOpenCreateModal && (
        <button
          type="button"
          onClick={onOpenCreateModal}
          className={`ui-glow w-full flex items-center justify-center gap-2 py-2.5 bg-gradient-to-tr ${palette.gradientFromTo} text-white font-bold text-xs rounded-xl shadow-sm hover:opacity-90 active:scale-98 transition-all cursor-pointer`}
        >
          <Plus className="w-4 h-4 shrink-0" />
          <span>افزودن فعالیت</span>
        </button>
      )}

      {/* Navigation Section */}
      <div className="space-y-1">
        <div className="flex items-center justify-between px-2 py-0.5 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
          <span>منوی دسترسی</span>
          {onToggleOpen && (
            <button
              type="button"
              onClick={onToggleOpen}
              title="مخفی‌سازی منوی سمت راست"
              className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer flex items-center justify-center"
            >
              <PanelRightClose className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* 1. Kanban View */}
        {canOpenTab('kanban') && (
        <button
          type="button"
          onClick={() => setActiveTab('kanban')}
          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'kanban'
              ? `ui-glow ${palette.accentBg} text-white shadow-md shadow-indigo-950/20`
              : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60'
          }`}
        >
          <div className="flex items-center gap-2">
            <Kanban className="w-4 h-4 shrink-0" />
            <span className="truncate">بورد کانبان</span>
          </div>
        </button>
        )}

        {/* 2. Jalali Calendar View */}
        {canOpenTab('calendar') && (
        <button
          type="button"
          onClick={() => setActiveTab('calendar')}
          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'calendar'
              ? `ui-glow ${palette.accentBg} text-white shadow-md shadow-indigo-950/20`
              : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60'
          }`}
        >
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 shrink-0" />
            <span className="truncate">نمای تقویم</span>
          </div>
        </button>
        )}

        {/* 3. Team Chat */}
        <button
          type="button"
          onClick={() => setActiveTab('chat')}
          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'chat'
              ? `ui-glow ${palette.accentBg} text-white shadow-md shadow-indigo-950/20`
              : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60'
          }`}
        >
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 shrink-0" />
            <span className="truncate">گفتگوی تیمی</span>
          </div>
          {unreadChatCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-rose-600 text-white font-black text-[9px] animate-pulse">
              {toPersianDigits(unreadChatCount)}
            </span>
          )}
        </button>

        {/* 4. Personal Notes */}
        {canOpenTab('notes') && (
        <button
          type="button"
          onClick={() => setActiveTab('notes')}
          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'notes'
              ? `ui-glow ${palette.accentBg} text-white shadow-md shadow-indigo-950/20`
              : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60'
          }`}
        >
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 shrink-0" />
            <span className="truncate">یادداشت شخصی</span>
          </div>
        </button>
        )}

        {/* 5. Overdue Tasks View */}
        {canOpenTab('overdue') && (
        <button
          type="button"
          onClick={() => setActiveTab('overdue')}
          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'overdue'
              ? 'bg-rose-600 text-white shadow-md shadow-rose-950/20'
              : 'text-slate-700 dark:text-slate-200 hover:bg-rose-50 dark:hover:bg-rose-950/30 hover:text-rose-600 dark:hover:text-rose-400'
          }`}
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="truncate">موعد گذشته</span>
          </div>
          {overdueCount > 0 && (
            <span
              className={`px-1.5 py-0.5 rounded-full text-[9px] font-black ${
                activeTab === 'overdue'
                  ? 'bg-white text-rose-700'
                  : 'bg-rose-500 text-white animate-pulse'
              }`}
            >
              {toPersianDigits(overdueCount)}
            </span>
          )}
        </button>
        )}

        {/* 6. Task Reports (only where the backend offers them) */}
        {canOpenTab('reports') && (
        <button
          type="button"
          onClick={() => setActiveTab('reports')}
          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'reports'
              ? `ui-glow ${palette.accentBg} text-white shadow-md shadow-indigo-950/20`
              : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60'
          }`}
        >
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 shrink-0" />
            <span className="truncate">گزارش فعالیت‌ها</span>
          </div>
        </button>
        )}

        {/* 7. Substitution inbox (only where tasks are given to posts and there is something for the user) */}
        {canOpenTab('substitution') && (
        <button
          type="button"
          onClick={() => setActiveTab('substitution')}
          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'substitution'
              ? `ui-glow ${palette.accentBg} text-white shadow-md shadow-indigo-950/20`
              : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60'
          }`}
        >
          <div className="flex items-center gap-2">
            <UserCog className="w-4 h-4 shrink-0" />
            <span className="truncate">کارتابل جانشینی</span>
          </div>
        </button>
        )}
      </div>


      <div className="border-t border-slate-100 dark:border-slate-800/80 my-0.5" />

      {/* System & Settings Section */}
      <div className="space-y-1">
        <div className="px-2 py-0.5 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
          تنظیمات برنامه
        </div>

        <button
          type="button"
          onClick={() => setActiveTab('settings')}
          className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'settings'
              ? `ui-glow ${palette.accentBg} text-white shadow-md shadow-indigo-950/20`
              : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60'
          }`}
        >
          <Settings className={`w-4 h-4 shrink-0 ${activeTab === 'settings' ? 'text-white' : 'text-slate-400'}`} />
          <span className="truncate">تنظیمات و پروفایل</span>
        </button>

        {currentUser && onLogout && (
          <button
            type="button"
            onClick={onLogout}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-all cursor-pointer"
          >
            <LogOut className="w-4 h-4 text-rose-500 shrink-0" />
            <span className="truncate">خروج از حساب</span>
          </button>
        )}
      </div>

      {/* Progress Summary Widget */}
      {totalTasks > 0 && (
        <div className="mt-auto pt-3 border-t border-slate-100 dark:border-slate-800/80 shrink-0 flex flex-col items-center justify-end gap-2">
          <div className="relative w-24 h-24 shrink-0">
            <svg viewBox="0 0 100 100" className="w-24 h-24 -rotate-90">
              <circle cx="50" cy="50" r={RADIUS} fill="none" strokeWidth="10" className="stroke-slate-100 dark:stroke-slate-800" />
              <circle
                cx="50"
                cy="50"
                r={RADIUS}
                fill="none"
                strokeWidth="10"
                strokeLinecap="round"
                className="stroke-emerald-500 transition-all duration-500"
                strokeDasharray={CIRCUMFERENCE}
                strokeDashoffset={CIRCUMFERENCE * (1 - progressRatio)}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-base font-black text-slate-800 dark:text-slate-100">
                {toPersianDigits(progressPercent)}٪
              </span>
            </div>
          </div>
          <div className="text-center">
            <div className="font-bold text-[11px] text-slate-800 dark:text-slate-200">
              وضعیت پیشرفت
            </div>
            <div className="mt-0.5 text-[9px] text-slate-500 dark:text-slate-400">
              {toPersianDigits(completedTasks)} از {toPersianDigits(totalTasks)} فعالیت
            </div>
          </div>
        </div>
      )}
    </aside>
    </>
  );
};
