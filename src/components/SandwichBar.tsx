import React, { useState } from 'react';
import { Kanban, Calendar, Plus, AlertCircle, Settings, MessageSquare, FileText, Layers, X, BarChart3, UserCog, LayoutGrid } from 'lucide-react';
import { toPersianDigits } from '../utils/helpers';
import { AppColorPalette } from '../types';
import { COLOR_PALETTES } from '../utils/theme';

export type ActiveTab = 'kanban' | 'calendar' | 'matrix' | 'overdue' | 'chat' | 'notes' | 'reports' | 'substitution' | 'settings';

interface SandwichBarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  /** Omitted when the user may not create tasks: the add button is not shown. */
  onOpenCreateModal?: () => void;
  onOpenSettings?: () => void;
  /** Whether a section is available to the user (permissions); all are when omitted. */
  canOpenTab?: (tab: ActiveTab) => boolean;
  overdueCount: number;
  unreadChatCount?: number;
  appColorPalette?: AppColorPalette;
}

export const SandwichBar: React.FC<SandwichBarProps> = ({
  activeTab,
  setActiveTab,
  onOpenCreateModal,
  onOpenSettings,
  overdueCount,
  unreadChatCount = 0,
  appColorPalette = 'indigo',
  canOpenTab = (_tab: ActiveTab) => true,
}) => {
  const palette = COLOR_PALETTES[appColorPalette] || COLOR_PALETTES.indigo;
  const [isToolsMenuOpen, setIsToolsMenuOpen] = useState(false);

  return (
    <>
      {/* Global Backdrop when speed dial is open */}
      {isToolsMenuOpen && (
        <div
          className="lg:hidden fixed inset-0 z-30 bg-black/25 backdrop-blur-[2px] transition-opacity"
          onClick={() => setIsToolsMenuOpen(false)}
        />
      )}

      {/* Main Bottom Sandwich Bar */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-slate-900/95 backdrop-blur-md border-t border-slate-800/90 shadow-2xl py-2 px-3 sm:px-6">
        <div className="w-full max-w-xl mx-auto flex items-center justify-around sm:justify-center gap-2 sm:gap-6">
          
          {/* 1. Kanban / Card View Button + Floating "More Items" Menu directly above and aligned with it */}
          <div className="relative flex flex-col items-center">
            
            {/* Speed Dial Menu Stack - Anchored directly above the Card View icon */}
            <div data-more-fab className="absolute bottom-full mb-6 flex flex-col items-center gap-2.5 z-50">
              
              {/* Floating action icons (stacked vertically above the trigger) */}
              {isToolsMenuOpen && (
                <div className="flex flex-col items-center gap-2.5 mb-1 animate-in fade-in slide-in-from-bottom-4 duration-250 ease-out">
                  
                  {/* 1. Team Chat Icon Button */}
                  <button
                    type="button"
                    onClick={() => {
                      setIsToolsMenuOpen(false);
                      setActiveTab('chat');
                    }}
                    className={`relative w-11 h-11 rounded-full shadow-xl flex items-center justify-center hover:scale-110 active:scale-95 transition-all cursor-pointer ring-2 ring-white/20 animate-in fade-in slide-in-from-bottom-2 duration-200 ${
                      activeTab === 'chat'
                        ? 'bg-indigo-600 text-white ring-2 ring-indigo-400'
                        : 'bg-slate-800 hover:bg-slate-700 text-indigo-400'
                    }`}
                    title="گفتگوی تیمی"
                    aria-label="گفتگوی تیمی"
                  >
                    <MessageSquare className="w-5.5 h-5.5" />
                    {unreadChatCount > 0 && (
                      <span className="absolute -top-1 -right-1 px-1.5 py-0.2 rounded-full bg-rose-600 text-white font-black text-[10px] animate-pulse border border-slate-900">
                        {toPersianDigits(unreadChatCount)}
                      </span>
                    )}
                  
                    <span className="absolute right-full mr-2 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white shadow-lg pointer-events-none">گفتگوی تیمی</span>
                  </button>

                  {/* 2. Personal Notes Icon Button */}
                  {canOpenTab('notes') && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsToolsMenuOpen(false);
                      setActiveTab('notes');
                    }}
                    className={`relative w-11 h-11 rounded-full shadow-xl flex items-center justify-center hover:scale-110 active:scale-95 transition-all cursor-pointer ring-2 ring-white/20 animate-in fade-in slide-in-from-bottom-2 duration-150 ${
                      activeTab === 'notes'
                        ? 'bg-emerald-600 text-white ring-2 ring-emerald-400'
                        : 'bg-slate-800 hover:bg-slate-700 text-emerald-400'
                    }`}
                    title="یادداشت‌های شخصی"
                    aria-label="یادداشت‌های شخصی"
                  >
                    <FileText className="w-5.5 h-5.5" />
                  
                    <span className="absolute right-full mr-2 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white shadow-lg pointer-events-none">یادداشت‌های شخصی</span>
                  </button>
                  )}

                  {/* 3. Task Reports Icon Button (only where the backend offers them) */}
                  {canOpenTab('reports') && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsToolsMenuOpen(false);
                      setActiveTab('reports');
                    }}
                    className={`relative w-11 h-11 rounded-full shadow-xl flex items-center justify-center hover:scale-110 active:scale-95 transition-all cursor-pointer ring-2 ring-white/20 animate-in fade-in slide-in-from-bottom-2 duration-100 ${
                      activeTab === 'reports'
                        ? 'bg-indigo-600 text-white ring-2 ring-indigo-400'
                        : 'bg-slate-800 hover:bg-slate-700 text-sky-400'
                    }`}
                    title="گزارش فعالیت‌ها"
                    aria-label="گزارش فعالیت‌ها"
                  >
                    <BarChart3 className="w-5.5 h-5.5" />
                  
                    <span className="absolute right-full mr-2 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white shadow-lg pointer-events-none">گزارش فعالیت‌ها</span>
                  </button>
                  )}

                  {/* 4. Substitution inbox (only where tasks are given to posts and there is something for the user) */}
                  {canOpenTab('substitution') && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsToolsMenuOpen(false);
                      setActiveTab('substitution');
                    }}
                    className={`relative w-11 h-11 rounded-full shadow-xl flex items-center justify-center hover:scale-110 active:scale-95 transition-all cursor-pointer ring-2 ring-white/20 animate-in fade-in slide-in-from-bottom-2 duration-100 ${
                      activeTab === 'substitution'
                        ? 'bg-indigo-600 text-white ring-2 ring-indigo-400'
                        : 'bg-slate-800 hover:bg-slate-700 text-amber-400'
                    }`}
                    title="کارتابل جانشینی"
                    aria-label="کارتابل جانشینی"
                  >
                    <UserCog className="w-5.5 h-5.5" />
                  
                    <span className="absolute right-full mr-2 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white shadow-lg pointer-events-none">کارتابل جانشینی</span>
                  </button>
                  )}

                </div>
              )}

              {/* Main "More Items" (موارد بیشتر) Trigger Button */}
              <button
                type="button"
                onClick={() => setIsToolsMenuOpen((prev) => !prev)}
                className={`relative z-50 w-11 h-11 rounded-full flex items-center justify-center shadow-2xl transition-all cursor-pointer active:scale-95 border border-slate-700/80 ${
                  isToolsMenuOpen
                    ? 'bg-rose-600 text-white rotate-90 ring-4 ring-rose-950/40'
                    : 'bg-slate-800/95 hover:bg-slate-700 text-slate-200 ring-2 ring-slate-900'
                }`}
                title="موارد بیشتر"
                aria-label="موارد بیشتر"
              >
                {isToolsMenuOpen ? (
                  <X className="w-5.5 h-5.5" />
                ) : (
                  <Layers className="w-5.5 h-5.5 text-amber-300" />
                )}
                {!isToolsMenuOpen && unreadChatCount > 0 && (
                  <span className="absolute -top-1 -right-1 px-1.5 py-0.2 rounded-full bg-rose-600 text-white font-black text-[10px] animate-pulse border border-slate-900">
                    {toPersianDigits(unreadChatCount)}
                  </span>
                )}
              </button>

            </div>

            {/* Kanban / Card View Button */}
            {canOpenTab('kanban') && (
            <button
              type="button"
              onClick={() => setActiveTab('kanban')}
              className={`flex flex-col sm:flex-row items-center gap-0.5 sm:gap-1.5 px-2 sm:px-3 py-1.5 sm:py-2 rounded-2xl sm:rounded-full transition-all cursor-pointer ${
                activeTab === 'kanban'
                  ? `${palette.accentBg} text-white font-bold shadow-md shadow-slate-950 ring-2 ring-white/20`
                  : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/80'
              }`}
              title="بورد کانبان (نمای کارت)"
            >
              <Kanban className="w-7 h-7 shrink-0" />
              <span className="text-[11px] sm:text-xs leading-none whitespace-nowrap">کانبان</span>
            </button>
            )}
          </div>

          {/* 2. Calendar View Button */}
          {canOpenTab('calendar') && (
          <button
            type="button"
            onClick={() => setActiveTab('calendar')}
            className={`flex flex-col sm:flex-row items-center gap-0.5 sm:gap-1.5 px-2 sm:px-3 py-1.5 sm:py-2 rounded-2xl sm:rounded-full transition-all cursor-pointer ${
              activeTab === 'calendar'
                ? `${palette.accentBg} text-white font-bold shadow-md shadow-slate-950 ring-2 ring-white/20`
                : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/80'
            }`}
            title="نمای تقویم"
          >
            <Calendar className="w-7 h-7 shrink-0" />
            <span className="text-[11px] sm:text-xs leading-none whitespace-nowrap">تقویم</span>
          </button>
          )}

          {/* 2b. Eisenhower matrix */}
          {canOpenTab('matrix') && (
          <button
            type="button"
            onClick={() => setActiveTab('matrix')}
            className={`relative flex flex-col sm:flex-row items-center gap-0.5 sm:gap-1.5 px-2 sm:px-3 py-1.5 sm:py-2 rounded-2xl sm:rounded-full transition-all cursor-pointer ${
              activeTab === 'matrix'
                ? `${palette.accentBg} text-white font-bold shadow-md shadow-slate-950 ring-2 ring-white/20`
                : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/80'
            }`}
            title="ماتریس آیزنهاور"
          >
            <LayoutGrid className="w-7 h-7 shrink-0" />
            <span className="text-[11px] sm:text-xs leading-none whitespace-nowrap">ماتریس</span>
          </button>
          )}

          {/* 3. Central Add Task Plus Button */}
          {onOpenCreateModal && (
          <button
            type="button"
            onClick={onOpenCreateModal}
            className={`w-12 h-12 sm:w-14 sm:h-14 ${palette.accentBg} ${palette.accentHover} active:scale-95 text-white rounded-full flex items-center justify-center shadow-xl shadow-slate-950 transition-all cursor-pointer mx-1 shrink-0 ring-4 ring-slate-900`}
            title="افزودن فعالیت جدید"
            aria-label="افزودن فعالیت"
          >
            <Plus className="w-7.5 h-7.5 sm:w-8.5 sm:h-8.5 stroke-[2.5]" />
          </button>
          )}

          {/* 4. Overdue Tasks Button */}
          {canOpenTab('overdue') && (
          <button
            type="button"
            onClick={() => setActiveTab('overdue')}
            className={`relative flex flex-col sm:flex-row items-center gap-0.5 sm:gap-1.5 px-2 sm:px-3 py-1.5 sm:py-2 rounded-2xl sm:rounded-full transition-all cursor-pointer ${
              activeTab === 'overdue'
                ? 'bg-rose-600 text-white font-bold shadow-md shadow-rose-950 ring-2 ring-white/20'
                : 'text-slate-400 hover:text-rose-400 hover:bg-rose-950/40'
            }`}
            title="فعالیت‌های از موعد گذشته"
          >
            <AlertCircle className="w-7 h-7 shrink-0" />
            <span className="text-[11px] sm:text-xs leading-none whitespace-nowrap">موعد گذشته</span>
            {overdueCount > 0 && (
              <span
                className={`absolute -top-1 -right-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold border ${
                  activeTab === 'overdue'
                    ? 'bg-white text-rose-700 border-rose-200'
                    : 'bg-rose-600 text-white border-slate-900 animate-pulse'
                }`}
              >
                {toPersianDigits(overdueCount)}
              </span>
            )}
          </button>
          )}

          {/* 5. Settings Tab Button */}
          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className={`flex flex-col sm:flex-row items-center gap-0.5 sm:gap-1.5 px-2 sm:px-3 py-1.5 sm:py-2 rounded-2xl sm:rounded-full transition-all cursor-pointer ${
              activeTab === 'settings'
                ? `${palette.accentBg} text-white font-bold shadow-md shadow-slate-950 ring-2 ring-white/20`
                : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/80'
            }`}
            title="تنظیمات و پروفایل"
          >
            <Settings className="w-7 h-7 shrink-0" />
            <span className="text-[11px] sm:text-xs leading-none whitespace-nowrap">تنظیمات</span>
          </button>

        </div>
      </div>
    </>
  );
};
