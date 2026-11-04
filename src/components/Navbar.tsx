import React, { useEffect, useRef, useState } from 'react';
import { Filter, Layers, LogIn, Bell, LayoutDashboard, CircleHelp, BookOpen, User as UserIcon, CalendarDays, Clock3, LogOut } from 'lucide-react';
import { toPersianDigits } from '../utils/helpers';
import { User as UserType, AppTheme, AppColorPalette } from '../types';
import { COLOR_PALETTES } from '../utils/theme';
import { useBranding } from '../utils/branding';
import { OPEN_PROFILE_EVENT } from '../utils/profileEvents';
import { ActivePostSwitcher } from './ActivePostSwitcher';

interface NavbarProps {
  totalTasks: number;
  completedTasks: number;
  /** Only on the Kanban page, the one the filters apply to: the filter button is not shown elsewhere. */
  onToggleFilterBar?: () => void;
  isFilterBarOpen: boolean;
  /** Kanban only, like the filter button: opens «نوار گروه‌بندی و تنظیمات نمای کارت». */
  onToggleGroupingBar?: () => void;
  isGroupingBarOpen?: boolean;
  currentUser: UserType | null;
  currentTheme: AppTheme;
  appColorPalette?: AppColorPalette;
  onOpenAuthModal: () => void;
  unreadNotificationsCount?: number;
  onOpenNotificationModal?: () => void;
  onOpenWelcomeModal?: () => void;
  /** Opens the slide user guide (header "?" button). */
  onOpenUserGuide?: () => void;
  /** Opens the training videos («تنظیمات و پروفایل» › «آموزش سامانه»). */
  onOpenTutorials?: () => void;
  /** Avatar button: opens the signed-in user's own profile (Settings, "پروفایل" tab). */
  onOpenSettings?: () => void;
  /** «خروج» in the avatar menu. */
  onLogout?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  totalTasks,
  completedTasks,
  onToggleFilterBar,
  isFilterBarOpen,
  onToggleGroupingBar,
  isGroupingBarOpen = false,
  currentUser,
  currentTheme,
  appColorPalette = 'indigo',
  onOpenAuthModal,
  unreadNotificationsCount = 0,
  onOpenNotificationModal,
  onOpenWelcomeModal,
  onOpenUserGuide,
  onOpenTutorials,
  onOpenSettings,
  onLogout,
}) => {
  const brand = useBranding();
  // The avatar opens a small menu (profile, sign out); it closes on a click elsewhere or Escape.
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onPointer = (event: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('touchstart', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('touchstart', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);
  const openProfile = () => {
    setMenuOpen(false);
    onOpenSettings?.();
    // The settings page may already be open on another tab: bring the profile to the front.
    window.setTimeout(() => window.dispatchEvent(new CustomEvent(OPEN_PROFILE_EVENT, { detail: { tab: 'avatar' } })), 0);
  };
  const palette = COLOR_PALETTES[appColorPalette] || COLOR_PALETTES.indigo;
  const [systemNow, setSystemNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setSystemNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const systemDate = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(systemNow);
  const systemTime = new Intl.DateTimeFormat('fa-IR', { hour: '2-digit', minute: '2-digit', hour12: false }).format(systemNow);

  return (
    <header className="ui-bar sticky top-0 z-30 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 shadow-md text-white transition-colors duration-300">
      <div className="w-full max-w-[1920px] mx-auto px-2 sm:px-3 lg:px-3 py-3 sm:py-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          
          {/* Logo & Title */}
          <div className="flex items-center gap-3.5">
            <img 
              src={brand.logo}
              style={{ visibility: brand.ready ? 'visible' : 'hidden' }}
              alt={`لوگوی ${brand.name}`}
              className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl shadow-md shrink-0 object-cover border border-white/20 cursor-pointer hover:opacity-90 transition-opacity" 
              onClick={onOpenWelcomeModal}
            />
            <div>
              <h1 className="text-base sm:text-lg lg:text-xl font-bold text-white tracking-tight flex items-center gap-2 whitespace-nowrap">
                {brand.name}
              </h1>
              {currentUser ? (
                <button 
                  type="button" 
                  onClick={onOpenWelcomeModal}
                  className="flex items-center gap-1.5 mt-0.5 hover:text-indigo-300 transition-colors cursor-pointer text-right"
                  title="نمایش خلاصه وضعیت کاربری"
                >
                  {currentUser.avatar ? (
                    <img
                      src={currentUser.avatar}
                      alt={currentUser.name || 'آواتار کاربر'}
                      className="w-4.5 h-4.5 rounded-full object-cover border border-white/30 shrink-0"
                    />
                  ) : null}
                  <p className="text-xs text-indigo-200/90 font-medium truncate">
                    کاربر: {currentUser.name}
                  </p>
                </button>
              ) : (
                <p className="text-xs text-slate-300/80 hidden sm:block mt-0.5">
                  سامانه مدیریت فعالیت‌ها و کانبان بورد
                </p>
              )}
            </div>
          </div>

          {currentUser && <ActivePostSwitcher />}

          <div className="navbar-clock order-3 w-full sm:order-none sm:w-auto flex items-center justify-center gap-3.5 px-5 py-1.5" title="تاریخ و ساعت دستگاه شما؛ بدون نیاز به اینترنت">
            <span className="relative z-10 flex items-center gap-2 text-xs sm:text-sm font-bold text-indigo-100"><CalendarDays className="w-4 h-4 text-indigo-300 drop-shadow-[0_0_8px_rgba(165,180,252,0.8)]" />{systemDate}</span>
            <span className="relative z-10 h-6 w-px bg-gradient-to-b from-transparent via-indigo-300/40 to-transparent" />
            <span className="relative z-10 flex items-center gap-2 tabular-nums text-base sm:text-lg font-black tracking-wide text-white"><Clock3 className="w-4.5 h-4.5 text-indigo-300 drop-shadow-[0_0_8px_rgba(165,180,252,0.8)]" />{systemTime}</span>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2 sm:gap-2.5">
            {/* Dashboard Executive Summary Button */}
            


            {/* Notification Bell Button */}
            {onOpenNotificationModal && (
              <button
                type="button"
                onClick={onOpenNotificationModal}
                title="اطلاعیه‌ها و هشدارها"
                className="ui-raised-dark relative p-2.5 text-slate-200 hover:text-white bg-slate-800/60 hover:bg-slate-800 rounded-xl border border-slate-700/80 transition-all shrink-0 cursor-pointer flex items-center justify-center my-auto"
              >
                <Bell className={`w-4 h-4 ${unreadNotificationsCount > 0 ? palette.accentText : ''}`} />
                {unreadNotificationsCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[10px] font-black min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center border-2 border-slate-900 shadow-xs animate-pulse">
                    {toPersianDigits(unreadNotificationsCount)}
                  </span>
                )}
              </button>
            )}

            {/* Training videos (Icon Only) */}
            {onOpenTutorials && (
              <button
                type="button"
                onClick={onOpenTutorials}
                title="آموزش ویدیویی"
                aria-label="آموزش ویدیویی"
                className="ui-raised-dark p-2.5 text-slate-200 hover:text-white bg-slate-800/60 hover:bg-slate-800 rounded-xl border border-slate-700/80 transition-all shrink-0 cursor-pointer flex items-center justify-center my-auto"
              >
                <BookOpen className="w-4 h-4" />
              </button>
            )}

            {/* User Guide Button (Icon Only) */}
            {onOpenUserGuide && (
              <button
                type="button"
                onClick={onOpenUserGuide}
                title="راهنمای کاربری"
                aria-label="راهنمای کاربری"
                className="ui-raised-dark p-2.5 text-slate-200 hover:text-white bg-slate-800/60 hover:bg-slate-800 rounded-xl border border-slate-700/80 transition-all shrink-0 cursor-pointer flex items-center justify-center my-auto"
              >
                <CircleHelp className="w-4 h-4" />
              </button>
            )}

            {/* Filter Toggle Button (Icon Only) - Kanban only */}
            {onToggleFilterBar && (
              <button
                type="button"
                onClick={onToggleFilterBar}
                title={isFilterBarOpen ? 'بستن فیلترها' : 'نمایش فیلترها'}
                className={`ui-raised-dark p-2.5 rounded-xl border transition-all shrink-0 cursor-pointer flex items-center justify-center my-auto ${
                  isFilterBarOpen
                    ? `${palette.accentBg} text-white ${palette.accentBorder} shadow-xs`
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/80 border-slate-700/80'
                }`}
              >
                <Filter className="w-4 h-4" />
              </button>
            )}

            {/* Grouping & Card View Button (Icon Only) - Kanban only */}
            {onToggleGroupingBar && (
              <button
                type="button"
                onClick={onToggleGroupingBar}
                title={isGroupingBarOpen ? 'بستن گروه‌بندی و نمای کارت' : 'گروه‌بندی و تنظیمات نمای کارت'}
                aria-label="گروه‌بندی و تنظیمات نمای کارت"
                aria-pressed={isGroupingBarOpen}
                className={`ui-raised-dark p-2.5 rounded-xl border transition-all shrink-0 cursor-pointer flex items-center justify-center my-auto ${
                  isGroupingBarOpen
                    ? `${palette.accentBg} text-white ${palette.accentBorder} shadow-xs`
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/80 border-slate-700/80'
                }`}
              >
                <Layers className="w-4 h-4" />
              </button>
            )}

            {/* If not logged in, show simple login button */}
            {!currentUser && (
              <button
                type="button"
                onClick={onOpenAuthModal}
                className={`flex items-center gap-1.5 px-3 py-2 ${palette.accentBg} ${palette.accentHover} text-white rounded-xl text-xs font-semibold shadow-sm transition-colors cursor-pointer my-auto`}
              >
                <LogIn className="w-4 h-4" />
                <span>ورود</span>
              </button>
            )}

            {/* Profile avatar: a menu with the profile page and sign-out */}
            {currentUser && onOpenSettings && (
              <div className="relative my-auto" ref={menuRef}>
                <button
                  type="button"
                  onClick={() => setMenuOpen((open) => !open)}
                  title="حساب کاربری"
                  aria-label="حساب کاربری"
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  className="ui-raised-dark p-1 rounded-xl border border-slate-700/80 hover:border-indigo-400 transition-all shrink-0 cursor-pointer flex items-center justify-center"
                >
                  {currentUser.avatar ? (
                    <img
                      src={currentUser.avatar}
                      alt={currentUser.name || 'آواتار کاربر'}
                      className="w-8 h-8 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-sm">
                      {currentUser.name ? currentUser.name.charAt(0).toUpperCase() : <UserIcon className="w-4 h-4" />}
                    </div>
                  )}
                </button>

                {menuOpen && (
                  <div
                    role="menu"
                    className="absolute left-0 top-full mt-2 w-48 z-50 rounded-2xl bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 shadow-xl overflow-hidden"
                    dir="rtl"
                  >
                    <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                      <p className="text-xs font-extrabold truncate">{currentUser.name}</p>
                      {currentUser.username && <p className="text-[10px] text-slate-400 font-mono dir-ltr text-right truncate">@{currentUser.username}</p>}
                    </div>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={openProfile}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer text-right"
                    >
                      <UserIcon className="w-4 h-4 text-slate-500" />
                      <span>پروفایل</span>
                    </button>
                    {onLogout && (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => { setMenuOpen(false); onLogout(); }}
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 border-t border-slate-100 dark:border-slate-800 cursor-pointer text-right"
                      >
                        <LogOut className="w-4 h-4" />
                        <span>خروج</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

        </div>
      </div>
    </header>
  );
};

