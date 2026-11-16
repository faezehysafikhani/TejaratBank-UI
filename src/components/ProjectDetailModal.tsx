import React, { useState, useEffect } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { Task, ProjectCharter, ProjectSubTask, SubTaskImportance, AppColorPalette } from '../types';
import { COLOR_PALETTES } from '../utils/theme';
import { appConfirm } from '../utils/appDialog';
import { toPersianDigits, formatToJalali, computeAutoTaskStatus } from '../utils/helpers';
import { JalaliDateTimePicker } from './JalaliDateTimePicker';
import {
  X,
  FileText,
  BarChart3,
  Plus,
  Trash2,
  CheckCircle2,
  Circle,
  FolderKanban,
  Calendar,
  User as UserIcon,
  Clock,
  Sparkles,
  Info,
  Edit2,
  Save,
  ShieldCheck,
  TrendingUp,
  TrendingDown,
  Target,
} from 'lucide-react';

interface ProjectDetailModalProps {
  task: Task;
  isOpen: boolean;
  onClose: () => void;
  onUpdateTask: (taskId: string, updates: Partial<Task>) => void;
  appColorPalette?: AppColorPalette;
}

const IMPORTANCE_CONFIG: Record<
  SubTaskImportance,
  { label: string; weight: number; color: string; bg: string; border: string; text: string }
> = {
  low: {
    label: 'کم (وزن ۱)',
    weight: 1,
    color: 'emerald',
    bg: 'bg-emerald-50 dark:bg-emerald-950/60',
    border: 'border-emerald-200 dark:border-emerald-800',
    text: 'text-emerald-700 dark:text-emerald-300',
  },
  medium: {
    label: 'متوسط (وزن ۲)',
    weight: 2,
    color: 'amber',
    bg: 'bg-amber-50 dark:bg-amber-950/60',
    border: 'border-amber-200 dark:border-amber-800',
    text: 'text-amber-800 dark:text-amber-300',
  },
  high: {
    label: 'زیاد (وزن ۳)',
    weight: 3,
    color: 'rose',
    bg: 'bg-rose-50 dark:bg-rose-950/60',
    border: 'border-rose-200 dark:border-rose-800',
    text: 'text-rose-700 dark:text-rose-300',
  },
};

export const ProjectDetailModal: React.FC<ProjectDetailModalProps> = ({
  task,
  isOpen,
  onClose,
  onUpdateTask,
  appColorPalette = 'indigo',
}) => {
  const palette = COLOR_PALETTES[appColorPalette] || COLOR_PALETTES.indigo;
  const [activeTab, setActiveTab] = useState<'dashboard' | 'charter'>('dashboard');

  // Charter Form State
  const [charterDesc, setCharterDesc] = useState('');
  const [projectManager, setProjectManager] = useState('');
  const [charterStartDate, setCharterStartDate] = useState('');
  const [charterEndDate, setCharterEndDate] = useState('');
  const [isCharterSaved, setIsCharterSaved] = useState(false);

  // Subtask Form State
  const [subTitle, setSubTitle] = useState('');
  const [subStartDate, setSubStartDate] = useState('');
  const [subEndDate, setSubEndDate] = useState('');
  const [subImportance, setSubImportance] = useState<SubTaskImportance>('medium');
  const [editingSubId, setEditingSubId] = useState<string | null>(null);

  useEffect(() => {
    if (task) {
      const c = task.projectCharter || {};
      setCharterDesc(c.description || task.description || '');
      setProjectManager(c.projectManager || task.assignedUserName || task.ownerName || '');
      setCharterStartDate(c.startDate || task.createdAt || new Date().toISOString());
      setCharterEndDate(c.endDate || task.dueDate || new Date().toISOString());
    }
  }, [task]);

  if (!isOpen) return null;

  const subTasks: ProjectSubTask[] = task.projectSubTasks || [];

  // Save Charter handler
  const handleSaveCharter = (e: React.FormEvent) => {
    e.preventDefault();
    const updatedCharter: ProjectCharter = {
      description: charterDesc,
      projectManager,
      startDate: charterStartDate,
      endDate: charterEndDate,
    };
    onUpdateTask(task.id, {
      projectCharter: updatedCharter,
      description: charterDesc || task.description,
      dueDate: charterEndDate || task.dueDate,
    });
    setIsCharterSaved(true);
    setTimeout(() => setIsCharterSaved(false), 2500);
  };

  // Add / Edit Subtask handler
  const handleSaveSubTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subTitle.trim()) return;

    if (editingSubId) {
      // Edit existing
      const updatedList = subTasks.map((st) =>
        st.id === editingSubId
          ? {
              ...st,
              title: subTitle.trim(),
              startDate: subStartDate,
              endDate: subEndDate,
              importance: subImportance,
            }
          : st
      );
      onUpdateTask(task.id, {
        projectSubTasks: updatedList,
        status: computeAutoTaskStatus(updatedList),
      });
      setEditingSubId(null);
    } else {
      // Add new
      const newSub: ProjectSubTask = {
        id: 'sub_' + Date.now(),
        title: subTitle.trim(),
        startDate: subStartDate || new Date().toISOString(),
        endDate: subEndDate || task.dueDate || new Date().toISOString(),
        importance: subImportance,
        completed: false,
        createdAt: new Date().toISOString(),
      };
      const updatedList = [...subTasks, newSub];
      onUpdateTask(task.id, {
        projectSubTasks: updatedList,
        status: computeAutoTaskStatus(updatedList),
      });
    }

    setSubTitle('');
    setSubStartDate('');
    setSubEndDate('');
    setSubImportance('medium');
  };

  const handleStartEditSubTask = (st: ProjectSubTask) => {
    setEditingSubId(st.id);
    setSubTitle(st.title);
    setSubStartDate(st.startDate || '');
    setSubEndDate(st.endDate || '');
    setSubImportance(st.importance || 'medium');
  };

  const handleCancelEditSubTask = () => {
    setEditingSubId(null);
    setSubTitle('');
    setSubStartDate('');
    setSubEndDate('');
    setSubImportance('medium');
  };

  const handleToggleSubTask = (subId: string) => {
    const updated = subTasks.map((st) => (st.id === subId ? { ...st, completed: !st.completed } : st));
    onUpdateTask(task.id, {
      projectSubTasks: updated,
      status: computeAutoTaskStatus(updated),
    });
  };

  // «ثبت نهایی پروژه»: every subtask is finished and the project is closed in one step.
  const handleFinalizeProject = async () => {
    const open = subTasks.filter((st) => !st.completed).length;
    const question = open > 0
      ? `ثبت نهایی پروژه؟ ${toPersianDigits(open)} زیرفعالیت باز هم تکمیل‌شده ثبت می‌شود.`
      : 'ثبت نهایی پروژه؟';
    if (!(await appConfirm(question))) return;
    const nowIso = new Date().toISOString();
    const finished = subTasks.map((st) => ({
      ...st,
      completed: true,
      status: 'completed' as const,
      actualStartDate: st.actualStartDate || nowIso,
      actualCompletedDate: st.actualCompletedDate || nowIso,
    }));
    onUpdateTask(task.id, { projectSubTasks: finished, status: 'completed', actualCompletionDate: task.actualCompletionDate || nowIso });
  };

  const handleDeleteSubTask = (subId: string) => {
    const updated = subTasks.filter((st) => st.id !== subId);
    onUpdateTask(task.id, {
      projectSubTasks: updated,
      status: computeAutoTaskStatus(updated),
    });
  };

  // Dashboard Weighted Calculations
  let totalWeight = 0;
  let completedWeight = 0;
  let plannedWeightSum = 0;
  const nowMs = Date.now();

  const importanceStats: Record<
    SubTaskImportance,
    { total: number; completed: number; totalW: number; completedW: number }
  > = {
    low: { total: 0, completed: 0, totalW: 0, completedW: 0 },
    medium: { total: 0, completed: 0, totalW: 0, completedW: 0 },
    high: { total: 0, completed: 0, totalW: 0, completedW: 0 },
  };

  subTasks.forEach((st) => {
    const imp = st.importance || 'medium';
    const weight = IMPORTANCE_CONFIG[imp].weight;
    totalWeight += weight;

    importanceStats[imp].total += 1;
    importanceStats[imp].totalW += weight;

    if (st.completed) {
      completedWeight += weight;
      importanceStats[imp].completed += 1;
      importanceStats[imp].completedW += weight;
    }

    // Subtask Planned Progress Ratio based on schedule
    const stStart = st.startDate ? new Date(st.startDate).getTime() : (task.projectCharter?.startDate ? new Date(task.projectCharter.startDate).getTime() : (task.createdAt ? new Date(task.createdAt).getTime() : nowMs));
    const stEnd = st.endDate ? new Date(st.endDate).getTime() : (task.projectCharter?.endDate ? new Date(task.projectCharter.endDate).getTime() : (task.dueDate ? new Date(task.dueDate).getTime() : nowMs));

    let plannedRatio = 0;
    if (nowMs >= stEnd) {
      plannedRatio = 1;
    } else if (nowMs <= stStart) {
      plannedRatio = 0;
    } else if (stEnd > stStart) {
      plannedRatio = (nowMs - stStart) / (stEnd - stStart);
    } else {
      plannedRatio = 1;
    }
    plannedWeightSum += weight * plannedRatio;
  });

  const completionPercent = totalWeight > 0 ? Math.round((completedWeight / totalWeight) * 100) : 0;
  
  // Calculate Planned Progress %
  let plannedPercent = 0;
  if (totalWeight > 0) {
    plannedPercent = Math.round((plannedWeightSum / totalWeight) * 100);
  } else {
    // If no subtasks, calculate based on project charter / task dates
    const projStart = task.projectCharter?.startDate ? new Date(task.projectCharter.startDate).getTime() : (task.createdAt ? new Date(task.createdAt).getTime() : nowMs);
    const projEnd = task.projectCharter?.endDate ? new Date(task.projectCharter.endDate).getTime() : (task.dueDate ? new Date(task.dueDate).getTime() : nowMs);

    if (nowMs >= projEnd) {
      plannedPercent = 100;
    } else if (nowMs <= projStart) {
      plannedPercent = 0;
    } else if (projEnd > projStart) {
      plannedPercent = Math.round(((nowMs - projStart) / (projEnd - projStart)) * 100);
    } else {
      plannedPercent = task.status === 'completed' ? 100 : 50;
    }
  }
  plannedPercent = Math.max(0, Math.min(100, plannedPercent));

  // Calculate Variance (انحراف از برنامه)
  const variancePercent = completionPercent - plannedPercent;

  const completedCount = subTasks.filter((s) => s.completed).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-md animate-in fade-in duration-200 overflow-y-auto dir-rtl">
      <div className="relative w-full max-w-3xl my-auto bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80 shrink-0">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-2xl ${palette.badgeBg} ${palette.badgeText} shadow-xs`}>
              <FolderKanban className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/80 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                  مدیریت پروژه
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                  پیشرفت وزنی: {toPersianDigits(completionPercent)}٪
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 leading-snug line-clamp-1 mt-0.5">
                {task.title}
              </h2>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Buttons */}
        <div className="flex items-center gap-2 px-4 pt-3 pb-2 bg-slate-100/60 dark:bg-slate-800/40 border-b border-slate-200/80 dark:border-slate-800 overflow-x-auto shrink-0">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'dashboard'
                ? `${palette.accentBg} text-white shadow-md shadow-slate-900/10`
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>داشبورد و زیرفعالیت‌ها ({toPersianDigits(completionPercent)}٪)</span>
          </button>

          <button
            onClick={() => setActiveTab('charter')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'charter'
                ? `${palette.accentBg} text-white shadow-md shadow-slate-900/10`
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>منشور پروژه</span>
          </button>
        </div>

        {/* Modal Body Content */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-6">
          {/* TAB 1: منشور پروژه */}
          {activeTab === 'charter' && (
            <form onSubmit={handleSaveCharter} className="space-y-5 animate-in fade-in duration-150">
              <div className="bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/60 rounded-2xl p-3.5 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2.5">
                <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">منشور پروژه:</span> اهداف، کلیات، مدیر پروژه و بازه زمانی اصلی پروژه
                  را در این بخش ثبت و نگهداری کنید.
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  شرح و اهداف کلی پروژه
                </label>
                <textarea
                  rows={4}
                  value={charterDesc}
                  onChange={(e) => setCharterDesc(e.target.value)}
                  placeholder="توضیحات جامع پروژه، اهداف کلیدی و خروجی‌های مدنظر..."
                  className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-800 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 placeholder:text-slate-400 leading-relaxed"
                />
              </div>

              {/* Project Manager */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <UserIcon className="w-3.5 h-3.5 text-slate-500" />
                  <span>مدیر پروژه</span>
                </label>
                <input
                  type="text"
                  value={projectManager}
                  onChange={(e) => setProjectManager(e.target.value)}
                  placeholder="نام و نام خانوادگی مدیر پروژه..."
                  className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-800 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Start & End Dates */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <JalaliDateTimePicker
                    label="تاریخ شروع پروژه"
                    valueISO={charterStartDate}
                    onChangeISO={(iso) => setCharterStartDate(iso)}
                  />
                </div>
                <div>
                  <JalaliDateTimePicker
                    label="تاریخ پایان پروژه"
                    valueISO={charterEndDate}
                    onChangeISO={(iso) => setCharterEndDate(iso)}
                  />
                </div>
              </div>

              {/* Save Button */}
              <div className="pt-2 flex items-center justify-between">
                {isCharterSaved ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 animate-in fade-in">
                    <CheckCircle2 className="w-4 h-4" />
                    منشور پروژه با موفقیت ذخیره گردید.
                  </span>
                ) : (
                  <span />
                )}

                <button
                  type="submit"
                  className={`px-5 py-2.5 rounded-xl ${palette.accentBg} text-white font-bold text-xs sm:text-sm shadow-md hover:opacity-95 transition-all flex items-center gap-2 cursor-pointer`}
                >
                  <Save className="w-4 h-4" />
                  <span>ذخیره منشور پروژه</span>
                </button>
              </div>
            </form>
          )}

          {/* TAB 3: داشبورد پروژه */}
          {activeTab === 'dashboard' && (
            <div className="space-y-6 animate-in fade-in duration-150">
              {/* Main Progress Metric Banner */}
              <div className="p-5 sm:p-6 bg-gradient-to-br from-indigo-950 via-slate-900 to-slate-950 text-white rounded-3xl shadow-xl relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-400 via-indigo-400 to-purple-400" />

                <div className="relative z-10 flex flex-col sm:flex-row items-center justify-between gap-6">
                  <div className="space-y-2 text-center sm:text-right">
                    <div className="flex flex-wrap items-center gap-2 justify-center sm:justify-start">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-white/10 text-emerald-300 backdrop-blur-xs">
                        <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                        داشبورد کنترل پیشرفت و انحراف پروژه
                      </span>

                      {/* Variance Status Badge */}
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${
                        variancePercent > 0
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : variancePercent === 0
                          ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                          : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                      }`}>
                        {variancePercent > 0 ? (
                          <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                        ) : variancePercent === 0 ? (
                          <ShieldCheck className="w-3.5 h-3.5 text-indigo-300" />
                        ) : (
                          <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
                        )}
                        <span>
                          {variancePercent > 0
                            ? `جلوتر از برنامه (+${toPersianDigits(variancePercent)}٪)`
                            : variancePercent === 0
                            ? 'مطابق با برنامه زمان‌بندی'
                            : `عقب‌تر از برنامه (${toPersianDigits(Math.abs(variancePercent))}٪-)`}
                        </span>
                      </span>
                    </div>

                    <h3 className="text-xl sm:text-2xl font-black text-white">{task.title}</h3>
                    <p className="text-xs text-slate-300 max-w-md">
                      مقایسه هوشمند پیشرفت واقعی (بر اساس وزن زیرفعالیت‌ها) و پیشرفت برنامه‌ای تا امروز جهت انحراف‌سنجی پروژه.
                    </p>
                  </div>

                  {/* 3 Metric Cards inside Banner */}
                  <div className="grid grid-cols-3 gap-2 shrink-0 w-full sm:w-auto">
                    <div className="flex flex-col items-center justify-center p-3 bg-white/10 dark:bg-black/30 backdrop-blur-md rounded-2xl border border-white/15">
                      <span className="text-[10px] text-emerald-300 font-bold mb-0.5">پیشرفت واقعی</span>
                      <div className="text-2xl sm:text-3xl font-black text-emerald-400 tracking-tight">
                        {toPersianDigits(completionPercent)}٪
                      </div>
                    </div>

                    <div className="flex flex-col items-center justify-center p-3 bg-white/10 dark:bg-black/30 backdrop-blur-md rounded-2xl border border-white/15">
                      <span className="text-[10px] text-indigo-300 font-bold mb-0.5">برنامه‌ای تا‌کنون</span>
                      <div className="text-2xl sm:text-3xl font-black text-indigo-300 tracking-tight">
                        {toPersianDigits(plannedPercent)}٪
                      </div>
                    </div>

                    <div className="flex flex-col items-center justify-center p-3 bg-white/10 dark:bg-black/30 backdrop-blur-md rounded-2xl border border-white/15">
                      <span className="text-[10px] text-slate-300 font-bold mb-0.5">انحراف</span>
                      <div className={`text-2xl sm:text-3xl font-black tracking-tight ${
                        variancePercent > 0 ? 'text-emerald-400' : variancePercent === 0 ? 'text-indigo-300' : 'text-rose-400'
                      }`}>
                        {variancePercent > 0 ? `+${toPersianDigits(variancePercent)}٪` : `${toPersianDigits(variancePercent)}٪`}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Progress Comparison Bars */}
                <div className="mt-6 space-y-3 pt-4 border-t border-white/10">
                  {/* Actual Progress Bar */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs text-slate-300 font-bold">
                      <span className="flex items-center gap-1.5 text-emerald-300">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        پیشرفت واقعی (وزنی): {toPersianDigits(completedWeight)} از {toPersianDigits(totalWeight)}
                      </span>
                      <span className="text-emerald-400">{toPersianDigits(completionPercent)}٪</span>
                    </div>
                    <div className="w-full h-2.5 bg-white/15 rounded-full overflow-hidden p-0.5 border border-white/10">
                      <div
                        className="h-full bg-gradient-to-r from-emerald-400 via-teal-400 to-emerald-500 rounded-full transition-all duration-500"
                        style={{ width: `${completionPercent}%` }}
                      />
                    </div>
                  </div>

                  {/* Planned Progress Bar */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs text-slate-300 font-bold">
                      <span className="flex items-center gap-1.5 text-indigo-300">
                        <Target className="w-3.5 h-3.5 text-indigo-400" />
                        پیشرفت برنامه‌ای تا کنون:
                      </span>
                      <span className="text-indigo-300">{toPersianDigits(plannedPercent)}٪</span>
                    </div>
                    <div className="w-full h-2.5 bg-white/15 rounded-full overflow-hidden p-0.5 border border-white/10">
                      <div
                        className="h-full bg-gradient-to-r from-indigo-400 via-purple-400 to-indigo-500 rounded-full transition-all duration-500"
                        style={{ width: `${plannedPercent}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Metric Cards Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between">
                  <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block mb-1">
                    پیشرفت واقعی (کارهای تکمیل شده)
                  </span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-lg font-black text-emerald-600 dark:text-emerald-400">
                      {toPersianDigits(completionPercent)}٪
                    </span>
                    <span className="text-[11px] text-slate-500 font-medium">
                      ({toPersianDigits(completedCount)} از {toPersianDigits(subTasks.length)} زیرفعالیت)
                    </span>
                  </div>
                </div>

                <div className="p-3.5 bg-indigo-50/60 dark:bg-indigo-950/30 rounded-2xl border border-indigo-200/80 dark:border-indigo-800/50 flex flex-col justify-between">
                  <span className="text-[10px] font-bold text-indigo-700 dark:text-indigo-400 block mb-1">
                    پیشرفت برنامه‌ای تا امروز
                  </span>
                  <span className="text-lg font-black text-indigo-600 dark:text-indigo-400">
                    {toPersianDigits(plannedPercent)}٪
                  </span>
                </div>

                <div className={`p-3.5 rounded-2xl border flex flex-col justify-between ${
                  variancePercent > 0
                    ? 'bg-emerald-50/60 dark:bg-emerald-950/30 border-emerald-200/80 dark:border-emerald-800/50'
                    : variancePercent === 0
                    ? 'bg-indigo-50/60 dark:bg-indigo-950/30 border-indigo-200/80 dark:border-indigo-800/50'
                    : 'bg-rose-50/60 dark:bg-rose-950/30 border-rose-200/80 dark:border-rose-800/50'
                }`}>
                  <span className={`text-[10px] font-bold block mb-1 ${
                    variancePercent > 0
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : variancePercent === 0
                      ? 'text-indigo-700 dark:text-indigo-400'
                      : 'text-rose-700 dark:text-rose-400'
                  }`}>
                    انحراف از برنامه زمان‌بندی
                  </span>
                  <div className="flex items-center justify-between">
                    <span className={`text-lg font-black ${
                      variancePercent > 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : variancePercent === 0
                        ? 'text-indigo-600 dark:text-indigo-400'
                        : 'text-rose-600 dark:text-rose-400'
                    }`}>
                      {variancePercent > 0 ? `+${toPersianDigits(variancePercent)}٪` : `${toPersianDigits(variancePercent)}٪`}
                    </span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                      variancePercent > 0
                        ? 'bg-emerald-200/60 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300'
                        : variancePercent === 0
                        ? 'bg-indigo-200/60 dark:bg-indigo-900/40 text-indigo-800 dark:text-indigo-300'
                        : 'bg-rose-200/60 dark:bg-rose-900/40 text-rose-800 dark:text-rose-300'
                    }`}>
                      {variancePercent > 0 ? 'جلوتر' : variancePercent === 0 ? 'برابر' : 'عقب‌تر'}
                    </span>
                  </div>
                </div>

                <div className="p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between">
                  <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 block mb-1">
                    مجموع وزن‌ها
                  </span>
                  <span className="text-lg font-black text-slate-900 dark:text-slate-100">
                    {toPersianDigits(totalWeight)}
                  </span>
                </div>
              </div>

              {/* Chart & Importance Breakdown Grid */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                {/* Recharts Pie Visualization */}
                <div className="md:col-span-5 p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl flex flex-col justify-between">
                  <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 mb-2">
                    <TrendingUp className="w-4 h-4 text-emerald-500" />
                    <span>نسبت سهم وزن‌های تکمیل‌شده</span>
                  </h4>

                  <div className="h-44 w-full relative my-auto">
                    {totalWeight > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={[
                              { name: 'وزن تکمیل‌شده', value: completedWeight, color: '#10b981' },
                              { name: 'وزن باقی‌مانده', value: Math.max(0, totalWeight - completedWeight), color: '#6366f1' },
                            ]}
                            cx="50%"
                            cy="50%"
                            innerRadius={35}
                            outerRadius={60}
                            paddingAngle={5}
                            dataKey="value"
                            isAnimationActive={false}
                          >
                            <Cell fill="#10b981" />
                            <Cell fill="#6366f1" opacity={0.4} />
                          </Pie>
                          <Tooltip
                            formatter={(value: any) => [toPersianDigits(value), 'وزن']}
                            contentStyle={{
                              backgroundColor: '#0f172a',
                              borderColor: '#334155',
                              borderRadius: '12px',
                              color: '#fff',
                              fontSize: '11px',
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full flex items-center justify-center text-xs text-slate-400">
                        زیرفعالیتی تعریف نشده است
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-around text-[11px] font-bold text-slate-600 dark:text-slate-300 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                      تکمیل‌شده ({toPersianDigits(completedWeight)})
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-indigo-500/40 inline-block" />
                      باقی‌مانده ({toPersianDigits(Math.max(0, totalWeight - completedWeight))})
                    </span>
                  </div>
                </div>

                {/* Breakdown by Importance Levels */}
                <div className="md:col-span-7 p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl space-y-3">
                  <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <BarChart3 className="w-4 h-4 text-indigo-500" />
                    <span>تفکیک پیشرفت بر اساس وزن زیرفعالیت‌ها</span>
                  </h4>

                  <div className="space-y-3">
                    {(['high', 'medium', 'low'] as SubTaskImportance[]).map((impKey) => {
                      const cfg = IMPORTANCE_CONFIG[impKey];
                      const stat = importanceStats[impKey];
                      const pct = stat.totalW > 0 ? Math.round((stat.completedW / stat.totalW) * 100) : 0;

                      return (
                        <div
                          key={impKey}
                          className="p-3 bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 rounded-2xl space-y-2"
                        >
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${cfg.bg} ${cfg.border} ${cfg.text}`}
                              >
                                وزن {cfg.label}
                              </span>
                              <span className="text-slate-500 font-medium text-[11px]">
                                {toPersianDigits(stat.completed)} از {toPersianDigits(stat.total)} مورد تکمیل شده
                              </span>
                            </div>

                            <span className="font-bold text-slate-800 dark:text-slate-200">
                              {toPersianDigits(pct)}٪
                            </span>
                          </div>

                          {/* Progress Bar */}
                          <div className="w-full h-2 bg-slate-200/70 dark:bg-slate-700/80 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-300 ${
                                impKey === 'high'
                                  ? 'bg-rose-500'
                                  : impKey === 'medium'
                                  ? 'bg-amber-500'
                                  : 'bg-emerald-500'
                              }`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Interactive Subtasks Management */}
              <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-800">
                {/* Form to add or edit subtask */}
                <form
                  onSubmit={handleSaveSubTask}
                  className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-200 dark:border-slate-700/80 space-y-3.5"
                >
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <Plus className="w-4 h-4 text-indigo-500" />
                      <span>{editingSubId ? 'ویرایش زیرفعالیت' : 'افزودن زیرفعالیت جدید به پروژه'}</span>
                    </h4>

                    {editingSubId && (
                      <button
                        type="button"
                        onClick={handleCancelEditSubTask}
                        className="text-[11px] text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 underline cursor-pointer"
                      >
                        انصراف از ویرایش
                      </button>
                    )}
                  </div>

                  {/* Subtask Title */}
                  <input
                    type="text"
                    value={subTitle}
                    onChange={(e) => setSubTitle(e.target.value)}
                    placeholder="عنوان زیرفعالیت جدید را وارد کنید..."
                    className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-800 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />

                  {/* Subtask Importance Selection */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1.5">
                      درجه اهمیت زیرفعالیت (وزن در محاسبه پیشرفت):
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['low', 'medium', 'high'] as SubTaskImportance[]).map((impKey) => {
                        const cfg = IMPORTANCE_CONFIG[impKey];
                        const isSelected = subImportance === impKey;
                        return (
                          <button
                            key={impKey}
                            type="button"
                            onClick={() => setSubImportance(impKey)}
                            className={`px-3 py-2 rounded-xl text-xs font-bold border flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                              isSelected
                                ? `${cfg.bg} ${cfg.border} ${cfg.text} ring-2 ring-indigo-500/50 shadow-xs`
                                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100'
                            }`}
                          >
                            <span>{cfg.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Subtask Start & End dates */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <JalaliDateTimePicker
                      label="تاریخ شروع"
                      valueISO={subStartDate}
                      onChangeISO={(iso) => setSubStartDate(iso)}
                    />
                    <JalaliDateTimePicker
                      label="تاریخ پایان"
                      valueISO={subEndDate}
                      onChangeISO={(iso) => setSubEndDate(iso)}
                    />
                  </div>

                  <div className="flex justify-end pt-1">
                    <button
                      type="submit"
                      disabled={!subTitle.trim()}
                      className={`px-4 py-2 rounded-xl ${palette.accentBg} text-white font-bold text-xs shadow-xs hover:opacity-95 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50`}
                    >
                      <Plus className="w-4 h-4" />
                      <span>{editingSubId ? 'بروزرسانی زیرفعالیت' : 'افزودن زیرفعالیت'}</span>
                    </button>
                  </div>
                </form>

                {task.status !== 'completed' && (
                  <div className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/70 dark:border-emerald-900">
                    <p className="text-[11px] text-emerald-800 dark:text-emerald-300 font-medium">پروژه را بدون تکمیل تک‌تک زیرفعالیت‌ها به‌صورت نهایی ببندید.</p>
                    <button
                      type="button"
                      onClick={handleFinalizeProject}
                      className="shrink-0 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>ثبت نهایی پروژه</span>
                    </button>
                  </div>
                )}

                {/* List of subtasks */}
                <div className="space-y-2.5">
                  <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                    <span>مدیریت زیرفعالیت‌های پروژه ({toPersianDigits(subTasks.length)}):</span>
                    <span className="text-[11px] text-slate-500">
                      تکمیل‌شده: {toPersianDigits(completedCount)} از {toPersianDigits(subTasks.length)}
                    </span>
                  </h4>

                  {subTasks.length === 0 ? (
                    <div className="p-8 text-center bg-slate-50 dark:bg-slate-800/30 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 text-slate-400 text-xs">
                      هنوز زیرفعالیتی برای این پروژه تعریف نشده است.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {subTasks.map((st) => {
                        const impCfg = IMPORTANCE_CONFIG[st.importance || 'medium'];
                        return (
                          <div
                            key={st.id}
                            className={`p-3 rounded-2xl border flex items-center justify-between gap-3 transition-all ${
                              st.completed
                                ? 'bg-slate-50/80 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 opacity-80'
                                : 'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 shadow-2xs'
                            }`}
                          >
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <button
                                type="button"
                                onClick={() => handleToggleSubTask(st.id)}
                                className="text-indigo-600 dark:text-indigo-400 hover:scale-110 transition-transform cursor-pointer shrink-0"
                              >
                                {st.completed ? (
                                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                                ) : (
                                  <Circle className="w-5 h-5 text-slate-400 dark:text-slate-600" />
                                )}
                              </button>

                              <div className="min-w-0 flex-1">
                                <span
                                  className={`text-xs sm:text-sm font-bold block truncate ${
                                    st.completed
                                      ? 'line-through text-slate-400 dark:text-slate-500'
                                      : 'text-slate-800 dark:text-slate-100'
                                  }`}
                                >
                                  {st.title}
                                </span>

                                <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-500 dark:text-slate-400 flex-wrap">
                                  {st.startDate && (
                                    <span className="flex items-center gap-1">
                                      <Clock className="w-3 h-3 text-slate-400" />
                                      <span>شروع: {formatToJalali(st.startDate)}</span>
                                    </span>
                                  )}
                                  {st.endDate && (
                                    <span className="flex items-center gap-1">
                                      <Calendar className="w-3 h-3 text-slate-400" />
                                      <span>پایان: {formatToJalali(st.endDate)}</span>
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              {/* Importance Badge */}
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${impCfg.bg} ${impCfg.border} ${impCfg.text}`}
                              >
                                {impCfg.label}
                              </span>

                              {/* Edit Button */}
                              <button
                                type="button"
                                onClick={() => handleStartEditSubTask(st)}
                                className="p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                                title="ویرایش"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>

                              {/* Delete Button */}
                              <button
                                type="button"
                                onClick={() => handleDeleteSubTask(st.id)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                                title="حذف"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
