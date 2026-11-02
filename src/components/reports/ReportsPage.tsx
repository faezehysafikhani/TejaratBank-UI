import React, { useEffect, useState } from 'react';
import { BarChart3, CalendarDays, ListChecks, Users } from 'lucide-react';
import { Task, User } from '../../types';
import { AdminCard } from '../admin/AdminUi';
import { ReportTab, reportTabsFor } from '../../utils/reportTabs';
import { ReportScope } from '../../services/taskReportApi';
import { ReportsView } from '../ReportsView';
import { MeetingsReport } from './MeetingsReport';
import { UsersReport } from './UsersReport';

/**
 * «گزارشات»: one page, three reports as tabs - activities (with its filters), meetings (the whole
 * report of each meeting) and users (status, position, place, last sign-in).
 */
export const ReportsPage: React.FC<{
  currentUser: User | null;
  scope: ReportScope | null;
  visibleTasks: Task[];
  people: User[];
  refreshKey?: number;
  onOpenTask: (task: Task) => void;
  generatedBy?: string;
}> = ({ currentUser, scope, visibleTasks, people, refreshKey, onOpenTask, generatedBy }) => {
  const allowed = reportTabsFor(currentUser, scope);
  const tabs = ([
    { id: 'tasks', label: 'گزارشات فعالیت‌ها', icon: ListChecks },
    { id: 'meetings', label: 'گزارشات جلسات', icon: CalendarDays },
    { id: 'users', label: 'گزارشات کاربران', icon: Users },
  ] as const).filter((tab) => allowed[tab.id]);
  const [active, setActive] = useState<ReportTab>('tasks');
  const current = tabs.some((t) => t.id === active) ? active : tabs[0]?.id;
  // A tab that is left is not kept mounted: coming back reads the data again.
  useEffect(() => { if (current && current !== active) setActive(current); }, [current, active]);

  return (
    <div className="w-full space-y-4" dir="rtl">
      <AdminCard className="px-5 pt-5 pb-0">
        <h2 className="flex items-center gap-2 text-xl font-extrabold text-slate-900 dark:text-white">
          <BarChart3 className="w-6 h-6 text-indigo-600" /> گزارشات
        </h2>
        <div className="flex gap-1 overflow-x-auto mt-4 border-b border-slate-200 dark:border-slate-800" role="tablist" aria-label="گزارشات">
          {tabs.map(({ id, label, icon: Icon }) => {
            const selected = id === current;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setActive(id)}
                className={`flex items-center gap-2 px-4 py-3 -mb-px text-sm font-bold whitespace-nowrap border-b-2 transition-colors cursor-pointer ${
                  selected
                    ? 'border-indigo-700 text-indigo-800 dark:border-indigo-400 dark:text-indigo-300'
                    : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </AdminCard>

      <div role="tabpanel">
        {current === 'tasks' && scope && <ReportsView scope={scope} refreshKey={refreshKey} visibleTasks={visibleTasks} onOpenTask={onOpenTask} generatedBy={generatedBy} />}
        {current === 'meetings' && <MeetingsReport people={people} tasks={visibleTasks} generatedBy={generatedBy} />}
        {current === 'users' && <UsersReport generatedBy={generatedBy} />}
      </div>
    </div>
  );
};
