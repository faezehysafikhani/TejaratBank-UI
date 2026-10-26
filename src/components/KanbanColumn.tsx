import React, { useState } from 'react';
import { Task, TaskStatus, STATUSES, Attachment, User } from '../types';
import { TaskCardList } from './TaskCardList';
import { toPersianDigits } from '../utils/helpers';
import { Plus, ChevronDown, Move } from 'lucide-react';
import { can, PERMISSIONS } from '../utils/permissions';

interface KanbanColumnProps {
  status: TaskStatus;
  tasks: Task[];
  currentUser?: User | null;
  onOpenCreateForStatus: (status: TaskStatus) => void;
  onEditTask: (task: Task) => void;
  onDeleteTask: (taskId: string) => void;
  onStatusChange: (taskId: string, newStatus: TaskStatus) => void;
  onPreviewAttachment: (attachment: Attachment) => void;
  onViewDetails?: (task: Task) => void;
  onOpenProjectDetails?: (task: Task) => void;
  onToggleSubTask?: (taskId: string, subTaskId: string) => void;
  showDetails?: boolean;
}

const KanbanColumnBase: React.FC<KanbanColumnProps> = ({
  status,
  tasks,
  currentUser,
  onOpenCreateForStatus,
  onEditTask,
  onDeleteTask,
  onStatusChange,
  onPreviewAttachment,
  onViewDetails,
  onOpenProjectDetails,
  onToggleSubTask,
  showDetails = true,
}) => {
  // Columns start closed; the user opens the ones to look at.
  const [isCollapsed, setIsCollapsed] = useState<boolean>(true);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  const cfg = STATUSES[status];

  const dragHighlightStyles: Record<TaskStatus, string> = {
    todo: 'border-indigo-500 ring-4 ring-indigo-400/50 bg-indigo-50/70 dark:bg-indigo-950/50 shadow-xl scale-[1.01]',
    in_progress: 'border-blue-500 ring-4 ring-blue-400/50 bg-blue-50/70 dark:bg-blue-950/50 shadow-xl scale-[1.01]',
    paused: 'border-amber-500 ring-4 ring-amber-400/50 bg-amber-50/70 dark:bg-amber-950/50 shadow-xl scale-[1.01]',
    completed: 'border-emerald-500 ring-4 ring-emerald-400/50 bg-emerald-50/70 dark:bg-emerald-950/50 shadow-xl scale-[1.01]',
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (!isDragOver) setIsDragOver(true);
        if (isCollapsed) setIsCollapsed(false);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setIsDragOver(false);
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragOver(false);
        const taskId = e.dataTransfer.getData('text/plain');
        if (taskId) {
          onStatusChange(taskId, status);
        }
      }}
      className={`w-full max-w-full overflow-hidden flex flex-col rounded-3xl border transition-all duration-300 bg-gradient-to-b from-white to-slate-50/80 dark:from-slate-900 dark:to-slate-900/80 shadow-[0_10px_28px_-18px_rgba(15,23,42,0.55)] hover:shadow-[0_16px_34px_-18px_rgba(15,23,42,0.55)] ${
        isDragOver ? dragHighlightStyles[status] : `${cfg.borderColor} dark:border-slate-800`
      }`}
    >
      {/* Column Accordion Header */}
      <div
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="flex items-center justify-between p-3.5 sm:p-4 cursor-pointer hover:bg-indigo-50/40 dark:hover:bg-slate-700/50 rounded-3xl transition-colors select-none"
      >
        <div className="flex items-center gap-2.5">
          {/* Collapse/Expand Toggle Icon (+ / -) */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsCollapsed(!isCollapsed);
            }}
            className={`ui-raised w-7 h-7 rounded-xl flex items-center justify-center font-bold text-sm transition-all ${
              isCollapsed
                ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 hover:bg-indigo-200 dark:hover:bg-indigo-900'
                : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600'
            }`}
            title={isCollapsed ? 'باز کردن گروه‌بندی' : 'بستن گروه‌بندی'}
          >
            <ChevronDown className={`w-4 h-4 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
          </button>

          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              {cfg.title}
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:block">{cfg.description}</p>
          </div>
        </div>

        {/* Count Badge on the far left with word "مورد" */}
        <div className="shrink-0 flex items-center gap-2">
          {isDragOver && (
            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-indigo-600 text-white animate-pulse">
              رها کنید
            </span>
          )}
          <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${cfg.badgeBg} ${cfg.badgeText}`}>
            {toPersianDigits(tasks.length)} مورد
          </span>
        </div>

      </div>

      {/* Drop Indicator Header if Collapsed */}
      {isCollapsed && isDragOver && (
        <div className="px-4 py-2 bg-indigo-50 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 text-xs font-bold text-center border-t border-indigo-200 dark:border-indigo-800 animate-pulse">
          رها کنید تا کارت به «{cfg.title}» منتقل شود
        </div>
      )}

      {/* Accordion Body (Only rendered/visible when NOT collapsed) */}
      {!isCollapsed && (
        <div className="p-3 sm:p-4 pt-0 border-t border-slate-100 dark:border-slate-700/60 animate-in fade-in slide-in-from-top-2 duration-200">
          {/* Active Drag Over Drop Box */}
          {isDragOver && (
            <div className="my-3 p-3.5 rounded-2xl border-2 border-dashed border-indigo-500 dark:border-indigo-400 bg-indigo-100/80 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-200 text-center animate-pulse flex items-center justify-center gap-2 font-bold text-xs shadow-inner">
              <Move className="w-4 h-4 animate-bounce text-indigo-600 dark:text-indigo-400" />
              <span>کارت را اینجا رها کنید تا به «{cfg.title}» منتقل شود</span>
            </div>
          )}

          <div className="space-y-3 mt-3 overflow-y-auto max-h-[calc(100vh-280px)] pr-0.5 pl-0.5">
            {tasks.length === 0 ? (
              <div className="h-28 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl p-4 text-center">
                <p className="text-xs text-slate-400 dark:text-slate-500 font-medium mb-2">
                  هیچ فعالیتی در این بخش وجود ندارد
                </p>
                {can(currentUser, PERMISSIONS.tasksCreate) && (
                <button
                  type="button"
                  onClick={() => onOpenCreateForStatus(status)}
                  className="inline-flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-bold"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>ثبت فعالیت جدید</span>
                </button>
                )}
              </div>
            ) : (
              <TaskCardList
                tasks={tasks}
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

export const KanbanColumn = React.memo(KanbanColumnBase);
