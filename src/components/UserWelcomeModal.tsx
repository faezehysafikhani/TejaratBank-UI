import React, { useState, useEffect } from 'react';
import { User, Task } from '../types';
import { toPersianDigits, isOverdue } from '../utils/helpers';
import { getCurrentJalali, PERSIAN_MONTH_NAMES } from '../utils/jalali';
import {
  X,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  FolderKanban,
  ShieldCheck,
  ArrowLeft,
  Calendar,
  Zap,
  BarChart2,
  ListTodo,
} from 'lucide-react';

interface AnimatedCounterProps {
  value: number;
  suffix?: string;
  prefix?: string;
  duration?: number;
}

const AnimatedCounter: React.FC<AnimatedCounterProps> = ({
  value,
  suffix = '',
  prefix = '',
  duration = 900,
}) => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let startTimestamp: number | null = null;
    let animationFrameId: number;

    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      // easeOutCubic easing function for pleasant deceleration
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      const currentVal = Math.floor(easeProgress * value);
      setCount(currentVal);

      if (progress < 1) {
        animationFrameId = window.requestAnimationFrame(step);
      } else {
        setCount(value);
      }
    };

    animationFrameId = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(animationFrameId);
  }, [value, duration]);

  return (
    <span>
      {prefix}
      {toPersianDigits(count)}
      {suffix}
    </span>
  );
};

interface UserWelcomeModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User | null;
  tasks: Task[];
  isLoading?: boolean;
  onNavigateToTab?: (tab: 'kanban' | 'calendar' | 'overdue' | 'chat' | 'notes') => void;
  onOpenTaskFilter?: (filter: 'completed' | 'projects') => void;
}

export const UserWelcomeModal: React.FC<UserWelcomeModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  tasks,
  isLoading = false,
  onNavigateToTab,
  onOpenTaskFilter,
}) => {
  if (!isOpen || !currentUser) return null;

  if (isLoading) return null;

  const nowISO = new Date().toISOString().slice(0, 10);
  const curJalali = getCurrentJalali();
  const shamsiToday = `${toPersianDigits(curJalali.jd)} ${PERSIAN_MONTH_NAMES[curJalali.jm - 1]} ${toPersianDigits(curJalali.jy)}`;

  // User Task Stats
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t) => t.status === 'completed');
  const completedCount = completedTasks.length;
  
  // Overdue Tasks Count
  const overdueTasks = tasks.filter((t) => {
    if (t.projectSubTasks && t.projectSubTasks.length > 0) {
      return t.projectSubTasks.some((st) => {
        const stStatus = st.completed ? 'completed' : t.status;
        const stDueDate = st.endDate || st.startDate || t.dueDate;
        return isOverdue(stDueDate, stStatus);
      });
    }
    return isOverdue(t.dueDate, t.status);
  });
  const overdueCount = overdueTasks.length;

  // Today Tasks
  const todayTasks = tasks.filter((t) => t.status !== 'completed' && t.dueDate === nowISO);

  // Projects Count
  const projectTasks = tasks.filter((t) => t.isProject || (t.projectSubTasks && t.projectSubTasks.length > 0));

  // In Progress
  const inProgressCount = tasks.filter((t) => t.status === 'in_progress' || t.status === 'review').length;

  // Calculate overall completion rate
  const completionRate = totalTasks > 0 ? Math.round((completedCount / totalTasks) * 100) : 0;

  const displayName = currentUser.name || currentUser.username || 'کاربر گرامی';
  const avatarUrl = currentUser.avatar;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-md animate-in fade-in duration-300 overflow-y-auto dir-rtl">
      {/* Decorative Floating Glass Background Lighting Flares */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[8%] left-[10%] w-72 h-72 rounded-full bg-emerald-500/8 blur-3xl animate-pulse" />
        <div className="absolute bottom-[10%] right-[8%] w-80 h-80 rounded-full bg-teal-500/8 blur-3xl animate-pulse" />
        <div className="absolute top-[35%] right-[25%] w-56 h-56 rounded-full bg-emerald-500/8 blur-3xl" />
        <div className="absolute bottom-[35%] left-[20%] w-48 h-48 rounded-full bg-cyan-500/10 blur-2xl" />
      </div>

      <div className="relative w-full max-w-2xl bg-gradient-to-br from-slate-900/85 via-emerald-950/55 to-slate-900/85 text-white rounded-3xl border border-white/30 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.5)] backdrop-blur-xl overflow-hidden z-10 my-auto animate-in zoom-in-95 duration-200">
        
        {/* Top Header Banner */}
        <div className="relative p-6 bg-white/10 dark:bg-white/5 backdrop-blur-md border-b border-white/15">
          <button
            onClick={onClose}
            className="absolute top-4 left-4 p-2 rounded-2xl bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition-all cursor-pointer backdrop-blur-md border border-white/15"
            title="بستن"
            aria-label="بستن"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-4">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={displayName}
                className="w-16 h-16 rounded-2xl object-cover border-2 border-emerald-400/60 shadow-lg shadow-emerald-950/50"
              />
            ) : (
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-600 flex items-center justify-center text-white font-black text-2xl border-2 border-emerald-400/60 shadow-lg">
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}

            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/30 text-emerald-200 border border-emerald-400/40 backdrop-blur-md">
                  <Sparkles className="w-3 h-3 text-emerald-300" />
                  {isLoading ? 'در حال همگام‌سازی داده‌ها...' : 'داشبورد خلاصه ورود'}
                </span>
                <span className="text-xs text-slate-300 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-emerald-300" />
                  امروز: {shamsiToday}
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight drop-shadow-sm">
                سلام {displayName} عزیز، خوش آمدید 👋
              </h2>
              <p className="text-xs text-slate-200/90 font-medium">
                خلاصه وضعیت فعالیت‌ها و پروژه‌های شما در یک نگاه
              </p>
            </div>
          </div>
        </div>

        {/* Modal Body: User Dashboard Summary */}
        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          
          {/* Main 4 Metric Cards Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* 1. Total Assigned Tasks */}
            <div className="p-4 rounded-2xl bg-white/10 dark:bg-white/5 backdrop-blur-md border border-white/20 flex flex-col justify-between space-y-2 hover:bg-white/15 hover:border-white/30 transition-all shadow-sm">
              <div className="flex items-center justify-between text-slate-300">
                <span className="text-[11px] font-bold">کل فعالیت‌ها</span>
                <ListTodo className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-2xl font-black text-white">
                <AnimatedCounter value={totalTasks} />
              </div>
              <span className="text-[10px] text-slate-300">تحت مسئولیت شما</span>
            </div>

            {/* 2. Overdue Tasks */}
            <div
              onClick={() => {
                onClose();
                onNavigateToTab?.('overdue');
              }}
              className={`p-4 rounded-2xl backdrop-blur-md border flex flex-col justify-between space-y-2 transition-all cursor-pointer shadow-sm ${
                overdueCount > 0
                  ? 'bg-rose-950/35 border-rose-500/40 text-rose-200 hover:bg-rose-900/45 hover:border-rose-400/60'
                  : 'bg-white/10 dark:bg-white/5 border-white/20 hover:bg-white/15 hover:border-white/30'
              }`}
            >
              <div className="flex items-center justify-between text-slate-300">
                <span className={`text-[11px] font-bold ${overdueCount > 0 ? 'text-rose-300' : ''}`}>
                  موعد گذشته
                </span>
                <AlertTriangle className={`w-4 h-4 ${overdueCount > 0 ? 'text-rose-400 animate-bounce' : 'text-slate-300'}`} />
              </div>
              <div className={`text-2xl font-black ${overdueCount > 0 ? 'text-rose-400' : 'text-white'}`}>
                <AnimatedCounter value={overdueCount} />
              </div>
              <span className={`text-[10px] ${overdueCount > 0 ? 'text-rose-300 font-bold' : 'text-slate-300'}`}>
                {overdueCount > 0 ? 'نیازمند اقدام فوری' : 'بدون تاخیر'}
              </span>
            </div>

            {/* 3. Completed & Success Rate */}
            <button type="button" onClick={() => onOpenTaskFilter?.('completed')} className="text-right p-4 rounded-2xl bg-emerald-950/35 backdrop-blur-md border border-emerald-500/40 flex flex-col justify-between space-y-2 hover:bg-emerald-900/45 hover:border-emerald-400/60 transition-all shadow-sm cursor-pointer">
              <div className="flex items-center justify-between text-emerald-300">
                <span className="text-[11px] font-bold">خاتمه یافته</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-black text-emerald-400">
                  <AnimatedCounter value={completedCount} />
                </span>
                <span className="text-xs text-emerald-300 font-bold">
                  (<AnimatedCounter value={completionRate} suffix="٪" />)
                </span>
              </div>
              <span className="text-[10px] text-emerald-200/90 font-medium">نرخ موفقیت کاری</span>
            </button>

            {/* 4. Active Projects */}
            <button type="button" onClick={() => onOpenTaskFilter?.('projects')} className="text-right p-4 rounded-2xl bg-teal-950/35 backdrop-blur-md border border-teal-500/40 flex flex-col justify-between space-y-2 hover:bg-teal-900/45 hover:border-teal-400/60 transition-all shadow-sm cursor-pointer">
              <div className="flex items-center justify-between text-teal-300">
                <span className="text-[11px] font-bold">پروژه‌ها</span>
                <FolderKanban className="w-4 h-4 text-teal-400" />
              </div>
              <div className="text-2xl font-black text-teal-200">
                <AnimatedCounter value={projectTasks.length} />
              </div>
              <span className="text-[10px] text-teal-200/90 font-medium">پروژه‌های کلان</span>
            </button>
          </div>

          {/* Quick Status Bar */}
          <div className="p-4 rounded-2xl bg-white/10 dark:bg-white/5 backdrop-blur-md border border-white/20 space-y-3 shadow-sm">
            <div className="flex items-center justify-between text-xs font-bold text-slate-200">
              <span className="flex items-center gap-1.5">
                <BarChart2 className="w-4 h-4 text-emerald-400" />
                وضعیت کلی پیشرفت کارهای شما
              </span>
              <span className="text-emerald-300 font-bold">
                <AnimatedCounter value={completionRate} suffix="٪ تکمیل شده" />
              </span>
            </div>
            
            <div className="w-full h-3 bg-black/20 rounded-full overflow-hidden p-0.5 border border-white/15">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-400 rounded-full transition-all duration-700 shadow-sm"
                style={{ width: `${completionRate}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-300 dir-rtl">
              <span>
                در حال انجام: <AnimatedCounter value={inProgressCount} suffix=" فعالیت" />
              </span>
              <span>
                کارهای امروز: <AnimatedCounter value={todayTasks.length} suffix=" فعالیت" />
              </span>
            </div>
          </div>

          {/* Smart Operational Insight */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-900/35 via-teal-900/35 to-emerald-900/35 backdrop-blur-md border border-emerald-400/40 flex items-start gap-3 shadow-sm">
            <div className="p-2 rounded-xl bg-emerald-500/30 text-emerald-300 border border-emerald-400/40 shrink-0 mt-0.5 backdrop-blur-md">
              <Zap className="w-5 h-5 text-emerald-300" />
            </div>
            <div className="space-y-1 text-xs">
              <h4 className="font-bold text-emerald-200">تحلیل هوشمند وضعیت کاری شما:</h4>
              <p className="text-slate-200 leading-relaxed font-medium">
                {overdueCount > 0
                  ? `شما تعداد ${toPersianDigits(overdueCount)} فعالیت از موعد گذشته دارید. پیشنهاد می‌شود جهت حفظ انضباط کاری، ابتدا فعالیت‌های معوقه خود را بررسی و تکمیل فرمایید.`
                  : todayTasks.length > 0
                  ? `امروز ${toPersianDigits(todayTasks.length)} فعالیت برنامه‌ریزی شده دارید. روز پرانرژی و موفقی را برای شما آرزومندیم.`
                  : `تمامی کارهای شما به‌روز است و هیچ فعالیت معوقه‌ای ندارید. می‌توانید کارهای جدید تعریف فرمایید.`}
              </p>
            </div>
          </div>

        </div>

        {/* Modal Footer: Action Buttons */}
        <div className="p-4 sm:p-5 bg-slate-950/50 backdrop-blur-md border-t border-white/15 flex flex-col sm:flex-row items-center justify-between gap-3 dir-rtl">
          <div className="text-xs text-slate-300 font-medium flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>سیستم آنلاین مدیریت پروژه و فعالیت‌های پارس</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-6 py-2.5 rounded-2xl bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-lg shadow-emerald-950/60 flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-95 border border-white/20"
          >
            <span>مشاهده داشبورد و ورود به برنامه</span>
            <ArrowLeft className="w-4 h-4" />
          </button>
        </div>

      </div>
    </div>
  );
};
