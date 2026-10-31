import React, { lazy, Suspense, useMemo } from 'react';
import { Task, TaskStatus, Attachment, User } from '../types';
import { KanbanColumn } from './KanbanColumn';
import { TaskGroupColumn } from './TaskGroupColumn';
import { TaskListView } from './TaskListView';
import { getTaskLastModifiedTime } from '../utils/helpers';
import { BoardViewSettings, DEFAULT_BOARD_VIEW, buildTaskGroups, isCurrentTask } from '../utils/boardView';

const DashboardCharts = lazy(() => import('./DashboardCharts').then(m => ({ default: m.DashboardCharts })));

const STATUS_KEYS: TaskStatus[] = ['todo', 'in_progress', 'paused', 'completed'];

interface KanbanBoardProps {
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
  /** The grouping bar's choices; the plain status Kanban with full cards when omitted. */
  view?: BoardViewSettings;
}

export const KanbanBoard: React.FC<KanbanBoardProps> = ({
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
  view = DEFAULT_BOARD_VIEW,
}) => {
  // «فعالیت‌های جاری» narrows the board only; the charts below keep counting every task.
  const boardTasks = useMemo(
    () => (view.currentOnly ? tasks.filter(isCurrentTask) : tasks),
    [tasks, view.currentOnly],
  );

  // Group tasks by status in a single pass, then sort each column by last
  // modification time (newest first). Every status always gets a column, even with zero tasks
  // (all four statuses, also while only current tasks are shown).
  const columns = useMemo(() => {
    const byStatus = new Map<TaskStatus, Task[]>();
    for (const task of boardTasks) {
      const bucket = byStatus.get(task.status);
      if (bucket) {
        bucket.push(task);
      } else {
        byStatus.set(task.status, [task]);
      }
    }

    return STATUS_KEYS.map((st) => ({
      status: st,
      tasks: (byStatus.get(st) ?? [])
        .sort((a, b) => getTaskLastModifiedTime(b) - getTaskLastModifiedTime(a)),
    }));
  }, [boardTasks]);

  const groups = useMemo(
    () => (view.groupBy === 'status' || view.groupBy === 'none' ? [] : buildTaskGroups(boardTasks, view.groupBy)),
    [boardTasks, view.groupBy],
  );

  return (
    <div className="w-full space-y-6">
      {view.groupBy === 'status' && (
        <div className={`grid gap-4 sm:gap-4.5 items-start grid-cols-1 md:grid-cols-2 lg:grid-cols-4`}>
          {columns.map(({ status, tasks: columnTasks }) => (
            <KanbanColumn
              key={status}
              status={status}
              tasks={columnTasks}
              currentUser={currentUser}
              showDetails={view.showDetails}
              onOpenCreateForStatus={onOpenCreateForStatus}
              onEditTask={onEditTask}
              onDeleteTask={onDeleteTask}
              onStatusChange={onStatusChange}
              onPreviewAttachment={onPreviewAttachment}
              onViewDetails={onViewDetails}
              onOpenProjectDetails={onOpenProjectDetails}
              onToggleSubTask={onToggleSubTask}
            />
          ))}
        </div>
      )}

      {view.groupBy === 'none' && (
        <TaskListView tasks={boardTasks} showDetails={view.showDetails} onViewDetails={onViewDetails} />
      )}

      {view.groupBy !== 'status' && view.groupBy !== 'none' && (
        groups.length === 0 ? (
          <div className="h-32 flex items-center justify-center rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-700 bg-white/60 dark:bg-slate-900/40">
            <p className="text-sm text-slate-400 dark:text-slate-500 font-medium">هیچ فعالیتی برای نمایش وجود ندارد</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:gap-4.5 items-start grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
            {groups.map((group) => (
              <TaskGroupColumn
                key={`${view.groupBy}:${group.key}`}
                group={group}
                currentUser={currentUser}
                showDetails={view.showDetails}
                onEditTask={onEditTask}
                onDeleteTask={onDeleteTask}
                onStatusChange={onStatusChange}
                onPreviewAttachment={onPreviewAttachment}
                onViewDetails={onViewDetails}
                onOpenProjectDetails={onOpenProjectDetails}
                onToggleSubTask={onToggleSubTask}
              />
            ))}
          </div>
        )
      )}

      {/* Dashboard Charts: 2 side-by-side charts under grouping boxes */}
      <Suspense fallback={<div className="h-48 bg-slate-100/50 dark:bg-slate-800/50 rounded-2xl animate-pulse my-4" />}>
        <DashboardCharts
          tasks={tasks}
          currentUser={currentUser}
          onEditTask={onEditTask}
          onDeleteTask={onDeleteTask}
          onViewDetails={onViewDetails}
        />
      </Suspense>
    </div>
  );
};
