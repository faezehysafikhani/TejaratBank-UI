import React from 'react';
import { Layers, X, Check, Columns3, UserCheck, Users, AlertTriangle, CalendarDays, Tag, ListOrdered, Eye, PlayCircle } from 'lucide-react';
import { BoardGroupBy, BoardViewSettings, BOARD_GROUP_LABELS } from '../utils/boardView';

interface BoardViewBarProps {
  settings: BoardViewSettings;
  onChange: (next: BoardViewSettings) => void;
  onClose: () => void;
}

const OPTIONS: { id: BoardGroupBy; icon: React.ElementType; wide?: boolean }[] = [
  { id: 'status', icon: Columns3 },
  { id: 'owner', icon: UserCheck },
  { id: 'responsible', icon: Users },
  { id: 'priority', icon: AlertTriangle },
  { id: 'dueDate', icon: CalendarDays },
  { id: 'tag', icon: Tag },
  { id: 'none', icon: ListOrdered, wide: true },
];

const Toggle: React.FC<{
  icon: React.ElementType;
  title: string;
  hint: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}> = ({ icon: Icon, title, hint, checked, onChange }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    onClick={() => onChange(!checked)}
    className={`w-full flex items-center justify-between gap-3 px-3.5 py-3 rounded-2xl border text-right transition-colors cursor-pointer ${
      checked
        ? 'bg-indigo-50/70 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800'
        : 'bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
    }`}
  >
    <span className="flex items-center gap-2.5 min-w-0">
      <Icon className={`w-4.5 h-4.5 shrink-0 ${checked ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'}`} />
      <span className="min-w-0">
        <span className="block text-sm font-bold text-slate-800 dark:text-slate-100">{title}</span>
        <span className="block text-[11px] text-slate-500 dark:text-slate-400 truncate">{hint}</span>
      </span>
    </span>
    <span className={`relative inline-flex w-10 h-5.5 shrink-0 rounded-full transition-colors ${checked ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-600'}`}>
      <span className={`absolute top-0.5 w-4.5 h-4.5 rounded-full bg-white shadow transition-all ${checked ? 'left-0.5' : 'left-5'}`} />
    </span>
  </button>
);

/** «نوار گروه‌بندی و تنظیمات نمای کارت»: how the Kanban page groups its cards and what they show. */
export const BoardViewBar: React.FC<BoardViewBarProps> = ({ settings, onChange, onClose }) => {
  const set = (patch: Partial<BoardViewSettings>) => onChange({ ...settings, ...patch });

  return (
    <div className="bg-white dark:bg-slate-800/90 p-3.5 sm:p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs mb-6" dir="rtl">
      <div className="flex items-start sm:items-center justify-between gap-3 pb-3 mb-3 border-b border-slate-100 dark:border-slate-700/60">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 min-w-0">
          <h3 className="flex items-center gap-2 text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">
            <Layers className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0" />
            نوار گروه‌بندی و تنظیمات نمای کارت
          </h3>
          <span className="px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px] text-slate-500 dark:text-slate-400">
            حالت فعلی: <b className="text-slate-800 dark:text-slate-100">{BOARD_GROUP_LABELS[settings.groupBy]}</b>
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          title="بستن نوار گروه‌بندی"
          aria-label="بستن نوار گروه‌بندی"
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer shrink-0"
        >
          <X className="w-4.5 h-4.5" />
        </button>
      </div>

      <div className="flex flex-col lg:flex-row gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-2.5">
            انتخاب نحوه گروه‌بندی کارت‌ها:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {OPTIONS.map(({ id, icon: Icon, wide }) => {
              const active = settings.groupBy === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => set({ groupBy: id })}
                  aria-pressed={active}
                  className={`${wide ? 'sm:col-span-2' : ''} flex items-center justify-between gap-2 px-4 py-3.5 rounded-2xl border text-sm font-bold text-right transition-all cursor-pointer ${
                    active
                      ? 'ui-glow bg-indigo-600 border-indigo-600 text-white shadow-md'
                      : 'bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50 dark:hover:bg-slate-800'
                  }`}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <Icon className={`w-4.5 h-4.5 shrink-0 ${active ? 'text-white' : 'text-slate-400'}`} />
                    <span className="truncate">{BOARD_GROUP_LABELS[id]}</span>
                  </span>
                  {active && <Check className="w-4 h-4 shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>

        <div className="lg:w-64 shrink-0 flex flex-col gap-2.5 lg:border-r lg:border-slate-100 lg:dark:border-slate-700/60 lg:pr-4">
          <Toggle
            icon={Eye}
            title="نمایش اطلاعات"
            hint={settings.showDetails ? 'تگ‌های مالک، مسئول و برچسب‌ها' : 'کارت‌ها بدون تگ‌های مالک، مسئول و برچسب'}
            checked={settings.showDetails}
            onChange={(showDetails) => set({ showDetails })}
          />
          <Toggle
            icon={PlayCircle}
            title="فعالیت‌های جاری"
            hint={settings.currentOnly ? 'فقط فعالیت‌های خاتمه‌نیافته' : 'تمام فعالیت‌ها'}
            checked={settings.currentOnly}
            onChange={(currentOnly) => set({ currentOnly })}
          />
        </div>
      </div>
    </div>
  );
};
