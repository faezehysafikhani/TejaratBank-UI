import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Task, TaskStatus, Attachment, User } from '../types';
import { TaskCardList } from './TaskCardList';
import { toPersianDigits } from '../utils/helpers';
import { GROUP_TONES, TaskGroup } from '../utils/boardView';

interface TaskGroupColumnProps {
  group: TaskGroup;
  currentUser?: User | null;
  showDetails: boolean;
  onEditTask: (task: Task) => void;
  onDeleteTask: (taskId: string) => void;
  onStatusChange: (taskId: string, newStatus: TaskStatus) => void;
  onPreviewAttachment: (attachment: Attachment) => void;
  onViewDetails?: (task: Task) => void;
  onOpenProjectDetails?: (task: Task) => void;
  onToggleSubTask?: (taskId: string, subTaskId: string) => void;
}

/**
 * One column of the board when it is grouped by something other than status (owner, priority,
 * ...). Looks and folds like a Kanban column; dropping a card here changes nothing, since these
 * groups are not a field the card can be moved into.
 */
const TaskGroupColumnBase: React.FC<TaskGroupColumnProps> = ({
  group,
  currentUser,
  showDetails,
  onEditTask,
  onDeleteTask,
  onStatusChange,
  onPreviewAttachment,
  onViewDetails,
  onOpenProjectDetails,
  onToggleSubTask,
}) => {
  // Groups start closed, like the Kanban columns.
  const [isCollapsed, setIsCollapsed] = useState<boolean>(true);
  const tone = GROUP_TONES[group.tone];

  return (
    <div
      className={`w-full max-w-full overflow-hidden flex flex-col rounded-3xl border transition-all duration-300 bg-gradient-to-b from-white to-slate-50/80 dark:from-slate-900 dark:to-slate-900/80 shadow-[0_10px_28px_-18px_rgba(15,23,42,0.55)] hover:shadow-[0_16px_34px_-18px_rgba(15,23,42,0.55)] ${tone.border} dark:border-slate-800`}
    >
      <div
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="flex items-center justify-between gap-2 p-3.5 sm:p-4 cursor-pointer hover:bg-indigo-50/40 dark:hover:bg-slate-700/50 rounded-3xl transition-colors select-none"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsCollapsed(!isCollapsed);
            }}
            className={`ui-raised w-7 h-7 shrink-0 rounded-xl flex items-center justify-center font-bold text-sm transition-all ${
              isCollapsed
                ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 hover:bg-indigo-200 dark:hover:bg-indigo-900'
                : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600'
            }`}
            title={isCollapsed ? 'باز کردن گروه‌بندی' : 'بستن گروه‌بندی'}
          >
            <ChevronDown className={`w-4 h-4 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
          </button>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate" title={group.title}>{group.title}</h2>
            {group.description && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:block truncate">{group.description}</p>
            )}
          </div>
        </div>
        <span className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-bold border ${tone.badge}`}>
          {toPersianDigits(group.tasks.length)} مورد
        </span>
      </div>

      {!isCollapsed && (
        <div className="p-3 sm:p-4 pt-0 border-t border-slate-100 dark:border-slate-700/60 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="space-y-3 mt-3 overflow-y-auto max-h-[calc(100vh-280px)] pr-0.5 pl-0.5">
            {group.tasks.length === 0 ? (
              <div className="h-28 flex items-center justify-center border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl p-4 text-center">
                <p className="text-xs text-slate-400 dark:text-slate-500 font-medium">هیچ فعالیتی در این بخش وجود ندارد</p>
              </div>
            ) : (
              <TaskCardList
                tasks={group.tasks}
                currentUser={currentUser}
                showDetails={showDetails}
                onEdit={onEditTask}
                onDelete={onDeleteTask}
                onStatusChange={onStatusChange}
                onPreviewAttachment={onPreviewAttachment}
                onViewDetails={onViewDetails}
                onOpenProjectDetails={onOpenProjectDetails}
                onToggleSubTask={onToggleSubTask}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export const TaskGroupColumn = React.memo(TaskGroupColumnBase);
