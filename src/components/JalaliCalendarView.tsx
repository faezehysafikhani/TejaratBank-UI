import React, { useState, useRef, useEffect } from 'react';
import { Task, TaskStatus, Priority, Attachment, User } from '../types';
import {
  PERSIAN_MONTH_NAMES,
  PERSIAN_WEEK_DAYS,
  getJalaliMonthDays,
  getJalaliMonthFirstDayOfWeek,
  getCurrentJalali,
  parseISOToJalali,
  jalaliToISO,
  getJalaliHoliday,
  isPastDay,
} from '../utils/jalali';
import { toPersianDigits, getTaskLastModifiedTime } from '../utils/helpers';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Plus,
  CalendarDays,
  MessageSquare,
  Edit2,
  Trash2,
  AlertCircle,
  Check,
  Lock,
  Eye,
} from 'lucide-react';
import { can, isTaskAdmin, PERMISSIONS } from '../utils/permissions';
import { isResponsibleFor, responsibleNamesOf } from '../utils/taskPeople';
import { appAlert, appConfirm } from '../utils/appDialog';
import { Meeting, MeetingPeopleOptions, getMeetingPeople, listMeetings, deleteMeeting } from '../services/meetingApi';
import { MeetingFormModal } from './MeetingFormModal';
import { CalendarCreateMenu } from './CalendarCreateMenu';
import { isoToIranDateTimeParts } from '../utils/jalali';
import { Notice } from './admin/AdminUi';
import { userErrorMessage } from '../utils/errorMessages';
import { showToast } from '../utils/toast';

interface JalaliCalendarViewProps {
  tasks: Task[];
  registeredUsers?: User[];
  currentUser?: User | null;
  onOpenCreateForDate?: (isoDateString: string) => void;
  /** Opens the new-task form for a meeting: its title as the default, its day when still open for new work. */
  onConvertMeetingToTask?: (title: string, isoDate?: string) => void;
  onEditTask: (task: Task) => void;
  onDeleteTask: (taskId: string) => void;
  onStatusChange: (taskId: string, newStatus: TaskStatus) => void;
  onPreviewAttachment: (attachment: Attachment) => void;
  onViewDetails?: (task: Task) => void;
}

export interface CalendarItem {
  id: string;
  title: string;
  parentTask: Task;
  isSubTask: boolean;
  status: TaskStatus;
  priority: Priority;
  timeStr?: string;
  assignedUserName?: string;
}

const CalendarTaskCardItem: React.FC<{
  item: CalendarItem;
  index: number;
  parent: Task;
  commentCount: number;
  canEditTask: boolean;
  canDeleteTask: boolean;
  canChangeStatus: boolean;
  priorityStyle: string;
  onViewDetails?: (task: Task) => void;
  onEditTask: (task: Task) => void;
  onStatusChange: (taskId: string, newStatus: TaskStatus) => void;
  onDeleteRequest: (taskId: string) => void;
}> = ({
  item,
  index,
  parent,
  commentCount,
  canEditTask,
  canDeleteTask,
  canChangeStatus,
  priorityStyle,
  onViewDetails,
  onEditTask,
  onStatusChange,
  onDeleteRequest,
}) => {
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startXRef = useRef<number | null>(null);
  const startYRef = useRef<number | null>(null);
  const isHorizontalSwipeRef = useRef<boolean | null>(null);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button, a, input, select, textarea, [role="button"]')) return;
    startXRef.current = e.clientX;
    startYRef.current = e.clientY;
    isHorizontalSwipeRef.current = null;
    setIsDragging(true);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging || startXRef.current === null || startYRef.current === null) return;
    const deltaX = e.clientX - startXRef.current;
    const deltaY = e.clientY - startYRef.current;

    if (isHorizontalSwipeRef.current === null) {
      if (Math.abs(deltaX) > 6 || Math.abs(deltaY) > 6) {
        isHorizontalSwipeRef.current = Math.abs(deltaX) > Math.abs(deltaY);
      }
    }

    if (isHorizontalSwipeRef.current) {
      const clamped = Math.max(-120, Math.min(120, deltaX));
      setDragOffset(clamped);
    }
  };

  const handlePointerEnd = () => {
    if (isDragging) {
      if (Math.abs(dragOffset) >= 50) {
        if (canChangeStatus) {
          if (parent.status !== 'completed') {
            onStatusChange(parent.id, 'completed');
          }
        } else {
          void appAlert('شما دسترسی لازم برای تغییر وضعیت این فعالیت را ندارید.');
        }
      }
    }
    setIsDragging(false);
    setDragOffset(0);
    startXRef.current = null;
    startYRef.current = null;
    isHorizontalSwipeRef.current = null;
  };

  return (
    <div className="relative overflow-hidden rounded-2xl select-none">
      {/* Revealed Action Layer on Drag (Left or Right) */}
      <div
        className={`absolute inset-y-0 inset-x-0 ${
          canChangeStatus ? 'bg-emerald-600 dark:bg-emerald-700' : 'bg-rose-600 dark:bg-rose-700'
        } flex items-center ${
          dragOffset > 0 ? 'justify-start pl-3' : 'justify-end pr-3'
        } text-white font-bold text-xs transition-opacity rounded-2xl ${
          Math.abs(dragOffset) > 8 ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {canChangeStatus ? (
          <div className="flex items-center gap-1.5 bg-emerald-700/90 dark:bg-emerald-800/90 px-2.5 py-1 rounded-xl shadow-xs border border-white/20">
            <Check className="w-3.5 h-3.5 stroke-[3]" />
            <span>خاتمه یافته</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 bg-rose-700/90 dark:bg-rose-800/90 px-2.5 py-1 rounded-xl shadow-xs border border-white/20">
            <Lock className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>عدم دسترسی بروزرسانی</span>
          </div>
        )}
      </div>

      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onClick={() => (onViewDetails ? onViewDetails(parent) : onEditTask(parent))}
        style={{
          transform: `translateX(${dragOffset}px)`,
          transition: isDragging ? 'none' : 'transform 0.25s cubic-bezier(0.2, 0, 0, 1)',
          touchAction: 'pan-y',
        }}
        className={`group flex items-center justify-between gap-3 p-3 rounded-2xl bg-slate-50/90 dark:bg-slate-900/60 hover:bg-indigo-50/50 dark:hover:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 ${priorityStyle} transition-all cursor-pointer`}
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {/* Index Badge */}
          <span className="w-5 h-5 rounded-lg bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-[10px] flex items-center justify-center shrink-0">
            {toPersianDigits(index + 1)}
          </span>

          {/* Title */}
          <span
            className={`font-bold text-xs leading-snug break-words min-w-0 flex-1 transition-colors ${
              item.status === 'completed' ||
              item.status === 'paused' ||
              parent.status === 'completed' ||
              parent.status === 'paused'
                ? 'line-through text-slate-400 dark:text-slate-500'
                : 'text-slate-800 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400'
            }`}
          >
            {item.title}
          </span>
        </div>

        {/* Action Buttons on Left (RTL Far Left) */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Discussion / View Details Button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (onViewDetails) {
                onViewDetails(parent);
              } else {
                onEditTask(parent);
              }
            }}
            className="p-1.5 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-slate-700/80 rounded-lg transition-colors cursor-pointer flex items-center gap-1 text-[11px] font-bold"
            title="مشاهده جزئیات و گفتگو"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            {commentCount > 0 && <span>({toPersianDigits(commentCount)})</span>}
          </button>

          {/* Edit Button - STRICTLY for Owner/Admin */}
          {canEditTask && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEditTask(parent);
              }}
              className="p-1.5 text-slate-400 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-slate-700/80 rounded-lg transition-colors cursor-pointer"
              title="ویرایش کامل فعالیت (مالک)"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Delete Button - Strictly Owner/Admin */}
          {canDeleteTask && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteRequest(parent.id);
              }}
              className="p-1.5 text-slate-400 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-slate-700/80 rounded-lg transition-colors cursor-pointer"
              title="حذف فعالیت"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export const JalaliCalendarView: React.FC<JalaliCalendarViewProps> = ({
  tasks,
  registeredUsers = [],
  currentUser,
  onOpenCreateForDate,
  onConvertMeetingToTask,
  onEditTask,
  onDeleteTask,
  onStatusChange,
  onPreviewAttachment,
  onViewDetails,
}) => {
  const currentJ = getCurrentJalali();
  const [viewYear, setViewYear] = useState<number>(currentJ.jy);
  const [viewMonth, setViewMonth] = useState<number>(currentJ.jm);
  const [selectedDay, setSelectedDay] = useState<number>(
    viewYear === currentJ.jy && viewMonth === currentJ.jm ? currentJ.jd : 1
  );

  const [showAllTasks, setShowAllTasks] = useState<boolean>(false);
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);

  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [meetingsLoading, setMeetingsLoading] = useState(false);
  const [meetingError, setMeetingError] = useState<string | null>(null);
  const [reloadMeetings, setReloadMeetings] = useState(0);
  const [meetingDate, setMeetingDate] = useState<string | null>(null);
  const [editingMeeting, setEditingMeeting] = useState<Meeting | undefined>();
  const [createMenu, setCreateMenu] = useState<{day:number;anchor:DOMRect} | null>(null);
  const [meetingPeople, setMeetingPeople] = useState<MeetingPeopleOptions | null>(null);
  const [meetingPeopleError, setMeetingPeopleError] = useState<string | null>(null);
  useEffect(()=>{
    let alive=true;setMeetingPeople(null);setMeetingPeopleError(null);
    if(currentUser?.id) getMeetingPeople().then(value=>{if(alive)setMeetingPeople(value);})
      .catch(e=>{if(alive)setMeetingPeopleError(userErrorMessage(e,'دریافت دسترسی ایجاد جلسه انجام نشد.'));});
    return()=>{alive=false;};
  },[currentUser?.id,reloadMeetings]);
  useEffect(() => {
    setSelectedDay(day => Math.min(day, getJalaliMonthDays(viewYear, viewMonth)));
  }, [viewYear, viewMonth]);
  const dayDate = (day: number) => isoToIranDateTimeParts(jalaliToISO(viewYear,viewMonth,day))!.date;
  useEffect(() => {
    if (!currentUser?.id || !can(currentUser, PERMISSIONS.meetingsView)) {setMeetings([]);setMeetingError(null); return;}
    let alive = true; setMeetingsLoading(true); setMeetingError(null);
    const from = isoToIranDateTimeParts(jalaliToISO(viewYear,viewMonth,1))!.date;
    const to = isoToIranDateTimeParts(jalaliToISO(viewMonth === 12 ? viewYear+1 : viewYear,viewMonth === 12 ? 1 : viewMonth+1,1))!.date;
    listMeetings(from,to).then(rows => {if(alive)setMeetings(rows);}).catch(e => {if(alive){setMeetings([]);setMeetingError(userErrorMessage(e,'دریافت جلسه‌ها انجام نشد.'));}}).finally(()=>{if(alive)setMeetingsLoading(false);});
    return () => {alive=false;};
  }, [viewYear,viewMonth,currentUser?.id,reloadMeetings]);
  const dayMeetings = meetings.filter(m => m.details.date === dayDate(Math.min(selectedDay,getJalaliMonthDays(viewYear,viewMonth))));
  const openCreateMenu = (day:number,button:HTMLButtonElement) => {setSelectedDay(day);setCreateMenu({day,anchor:button.getBoundingClientRect()});};
  const savedMeeting = (m:Meeting) => {
    setMeetings(rows => [...rows.filter(old=>old.id!==m.id),m]);
    const date=parseISOToJalali(m.details.date);setViewYear(date.jy);setViewMonth(date.jm);setSelectedDay(date.jd);
    setMeetingDate(null);setEditingMeeting(undefined);setReloadMeetings(n=>n+1);showToast(m.notice || 'جلسه ذخیره شد.',m.notice ? 'info' : 'ok');
  };
  const removeMeeting = async (m:Meeting) => {
    if(!await appConfirm('جلسه «'+m.details.title+'» حذف شود؟'))return;
    try {await deleteMeeting(m);setMeetings(rows=>rows.filter(row=>row.id!==m.id));showToast('جلسه حذف شد.','ok');}
    catch(e){setMeetingError(userErrorMessage(e,'حذف جلسه انجام نشد.'));}
  };

  // Permission calculation helper for a task
  const checkTaskPermissions = (task: Task) => {
    const isAdmin = isTaskAdmin(currentUser);

    const isAssignee = isResponsibleFor(task, currentUser);

    const isTeamMember = !!(
      currentUser &&
      ((task.teamMemberIds && task.teamMemberIds.includes(currentUser.id)) ||
        (task.assignedTeamId && currentUser.teams?.some((t) => t.id === task.assignedTeamId)))
    );

    const isTaskCreator = !!(currentUser && task.user && task.user === currentUser.id);

    const isOwnerByDetails = !!(
      currentUser &&
      task.ownerName &&
      (task.ownerName.trim().toLowerCase() === (currentUser.name || '').trim().toLowerCase() ||
        task.ownerName.trim().toLowerCase() === (currentUser.username || '').trim().toLowerCase() ||
        task.ownerName.trim().toLowerCase() === (currentUser.email || '').trim().toLowerCase()) &&
      !isAssignee &&
      !isTeamMember
    );

    const isTaskOwner = isTaskCreator || isOwnerByDetails;
    const allowStatusUpdateForAssignee = task.allowAssigneeStatusUpdate !== false;
    // A team member who is not also an assignee may never change status - matches the server's
    // own resource-level rule (Nexus.TaskManagement CanChangeStatus).
    const canChangeStatus = (isAdmin || isTaskOwner || (isAssignee && allowStatusUpdateForAssignee)) && can(currentUser, PERMISSIONS.tasksEdit);

    const isOwnerOrTaskAdmin = isAdmin || (isTaskCreator && (!isAssignee && !isTeamMember || isTaskCreator)) || isOwnerByDetails;
    const canEditTask = isOwnerOrTaskAdmin && can(currentUser, PERMISSIONS.tasksEdit);
    const canDeleteTask = isOwnerOrTaskAdmin && can(currentUser, PERMISSIONS.tasksDelete);

    return { canEditTask, canDeleteTask, canChangeStatus };
  };

  // Month navigation
  const handlePrevMonth = () => {
    if (viewMonth === 1) {
      setViewMonth(12);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 12) {
      setViewMonth(1);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  const handlePrevYear = () => setViewYear(viewYear - 1);
  const handleNextYear = () => setViewYear(viewYear + 1);

  // Opens the new-activity form for a day of the month on view. The date is built from the
  // Jalali year/month/day that was clicked (in Iran time, like every date in the app), with the
  // current time of day - the same default the "افزودن" button has always used.
  const openCreateForDay = (day: number) => {
    if (!onOpenCreateForDate) return;
    const cur = getCurrentJalali();
    onOpenCreateForDate(jalaliToISO(viewYear, viewMonth, day, cur.hour, cur.minute));
  };

  // Clicking a day shows its activities; the new-activity form opens only from the day's + button.
  const handleSelectDay = (day: number) => {
    setSelectedDay(day);
  };

  const handleGoToToday = () => {
    const today = getCurrentJalali();
    setViewYear(today.jy);
    setViewMonth(today.jm);
    setSelectedDay(today.jd);
  };

  // Calendar calculations
  const totalDays = getJalaliMonthDays(viewYear, viewMonth);
  const firstDayOfWeek = getJalaliMonthFirstDayOfWeek(viewYear, viewMonth); // 0 = Shanbeh, 6 = Jomeh

  // Map tasks & subtasks/occurrences to days of the current month view
  const dayItemsMap: Record<number, CalendarItem[]> = {};

  tasks.forEach((task) => {
    // Exclude completed or paused tasks from calendar view unless showAllTasks is true
    if (!showAllTasks && (task.status === 'completed' || task.status === 'paused')) {
      return;
    }

    // 1) Main task mapping (if dueDate exists and not a recurring parent task with occurrences OR even if it has occurrences)
    if (task.dueDate) {
      const taskJ = parseISOToJalali(task.dueDate);
      if (taskJ.jy === viewYear && taskJ.jm === viewMonth) {
        if (!dayItemsMap[taskJ.jd]) {
          dayItemsMap[taskJ.jd] = [];
        }

        let timeStr = '';
        if (taskJ.hour !== undefined && taskJ.minute !== undefined) {
          const hStr = taskJ.hour.toString().padStart(2, '0');
          const mStr = taskJ.minute.toString().padStart(2, '0');
          if (hStr !== '00' || mStr !== '00') {
            timeStr = `${toPersianDigits(hStr)}:${toPersianDigits(mStr)}`;
          }
        }

        // Avoid adding duplicate main task if it's a recurring parent whose subtasks already cover occurrences
        // Unless it has no subtasks
        if (!task.isRecurring || !task.projectSubTasks || task.projectSubTasks.length === 0) {
          dayItemsMap[taskJ.jd].push({
            id: task.id,
            title: task.title,
            parentTask: task,
            isSubTask: false,
            status: task.status,
            priority: task.priority,
            timeStr,
            assignedUserName: responsibleNamesOf(task) || undefined,
          });
        }
      }
    }

    // 2) Subtasks / Occurrences mapping
    if (task.projectSubTasks && task.projectSubTasks.length > 0) {
      task.projectSubTasks.forEach((st) => {
        // Exclude completed subtasks unless showAllTasks is true
        if (!showAllTasks && st.completed) return;

        const dateISO = st.startDate || st.endDate;
        if (!dateISO) return;
        const stJ = parseISOToJalali(dateISO);
        if (stJ.jy === viewYear && stJ.jm === viewMonth) {
          if (!dayItemsMap[stJ.jd]) {
            dayItemsMap[stJ.jd] = [];
          }

          let timeStr = '';
          const cfg = task.recurringConfig;
          if (cfg && (cfg.startTime || cfg.dailyTime || cfg.time)) {
            const sT = cfg.startTime || cfg.dailyTime || cfg.time;
            const eT = cfg.endTime;
            if (sT && eT) {
              timeStr = `${toPersianDigits(sT)} تا ${toPersianDigits(eT)}`;
            } else if (sT) {
              timeStr = `${toPersianDigits(sT)}`;
            }
          } else if (stJ.hour !== undefined && stJ.minute !== undefined) {
            const hStr = stJ.hour.toString().padStart(2, '0');
            const mStr = stJ.minute.toString().padStart(2, '0');
            if (hStr !== '00' || mStr !== '00') {
              timeStr = `${toPersianDigits(hStr)}:${toPersianDigits(mStr)}`;
            }
          }

          dayItemsMap[stJ.jd].push({
            id: st.id,
            title: task.isRecurring ? `${task.title} (${st.title})` : `${task.title} > ${st.title}`,
            parentTask: task,
            isSubTask: true,
            status: st.completed ? 'completed' : 'todo',
            priority: (st.importance as any) || task.priority,
            timeStr,
            assignedUserName: responsibleNamesOf(task) || undefined,
          });
        }
      });
    }
  });

  const selectedDayItems = (dayItemsMap[selectedDay] || []).sort((a, b) => {
    return getTaskLastModifiedTime(b.parentTask) - getTaskLastModifiedTime(a.parentTask);
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      
      {/* Calendar Header & Grid Box */}
      <div className="lg:col-span-7 xl:col-span-8 bg-white dark:bg-slate-800/90 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm p-4 sm:p-6">
        
        {/* Navigation & Title Header */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pb-5 border-b border-slate-100 dark:border-slate-700/60">
          
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-2xl bg-indigo-50 dark:bg-indigo-950/80 border border-indigo-100 dark:border-indigo-800 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <CalendarIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">تقویم شمسی فعالیت‌ها</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                مشاهده و مدیریت برنامه‌ها بر اساس موعد انجام
              </p>
            </div>
          </div>

          {/* Month/Year Switchers, Today Button & All Tasks Switch */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Toggle Switch */}
            <button
              type="button"
              onClick={() => setShowAllTasks((prev) => !prev)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                showAllTasks
                  ? 'bg-indigo-50 dark:bg-indigo-950/80 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 shadow-2xs'
                  : 'bg-slate-100 dark:bg-slate-700/60 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
              }`}
              title="نمایش یا عدم نمایش کارهای خاتمه‌یافته و متوقف"
            >
              <div
                className={`w-7 h-4 rounded-full p-0.5 transition-colors flex items-center ${
                  showAllTasks ? 'bg-indigo-600 justify-end' : 'bg-slate-300 dark:bg-slate-600 justify-start'
                }`}
              >
                <div className="w-3 h-3 rounded-full bg-white shadow-xs" />
              </div>
              <span>{showAllTasks ? 'همه موارد' : 'فقط جاری'}</span>
            </button>

            <button
              type="button"
              onClick={handleGoToToday}
              className="px-3 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
            >
              امروز
            </button>

            <div className="flex items-center bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-1 gap-1">
              <button
                type="button"
                onClick={handlePrevYear}
                className="p-1.5 hover:bg-white dark:hover:bg-slate-800 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 rounded-xl transition-all cursor-pointer"
                title="سال قبل"
              >
                <ChevronsRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handlePrevMonth}
                className="p-1.5 hover:bg-white dark:hover:bg-slate-800 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 rounded-xl transition-all cursor-pointer"
                title="ماه قبل"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              <span className="px-3 text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100 min-w-[100px] text-center">
                {PERSIAN_MONTH_NAMES[viewMonth - 1]} {toPersianDigits(viewYear)}
              </span>

              <button
                type="button"
                onClick={handleNextMonth}
                className="p-1.5 hover:bg-white dark:hover:bg-slate-800 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 rounded-xl transition-all cursor-pointer"
                title="ماه بعد"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleNextYear}
                className="p-1.5 hover:bg-white dark:hover:bg-slate-800 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 rounded-xl transition-all cursor-pointer"
                title="سال بعد"
              >
                <ChevronsLeft className="w-4 h-4" />
              </button>
            </div>
          </div>

        </div>

        {/* Days of Week Header Grid */}
        <div className="grid grid-cols-7 gap-1 sm:gap-2 text-center pt-4 mb-2">
          {PERSIAN_WEEK_DAYS.map((dayName, idx) => (
            <div
              key={dayName}
              className={`py-1.5 text-xs font-bold rounded-xl ${
                idx === 6
                  ? 'text-rose-600 bg-rose-50/70 dark:bg-rose-950/50 dark:text-rose-400 border border-rose-200/50 dark:border-rose-900/40'
                  : 'text-slate-600 dark:text-slate-300 bg-slate-50/80 dark:bg-slate-700/60'
              }`}
            >
              {dayName}
            </div>
          ))}
        </div>

        {/* Calendar Days Grid */}
        <div
          className="grid grid-cols-7 gap-1 sm:gap-2 text-center"
          // Desktop: 5rem cells, shrunk (to 3.5rem at most) only when the month's rows would
          // otherwise push the page past the screen height.
          style={{ '--cal-cell-h': `clamp(3.5rem, calc((100dvh - 22rem) / ${Math.ceil((firstDayOfWeek + totalDays) / 7)} - 0.5rem), 5rem)` } as React.CSSProperties}
        >
          
          {/* Empty Cells Offset */}
          {Array.from({ length: firstDayOfWeek }).map((_, i) => (
            <div key={`offset-${i}`} className="h-14 sm:h-20 lg:h-(--cal-cell-h) rounded-2xl bg-slate-50/30 dark:bg-slate-900/30" />
          ))}

          {/* Month Day Cells */}
          {Array.from({ length: totalDays }).map((_, i) => {
            const dayNum = i + 1;
            const isToday =
              currentJ.jy === viewYear &&
              currentJ.jm === viewMonth &&
              currentJ.jd === dayNum;
            const isSelected = selectedDay === dayNum;
            const dayItems = dayItemsMap[dayNum] || [];
            const itemCount = dayItems.length + meetings.filter(m => m.details.date === dayDate(dayNum)).length;

            const dayOfWeekIdx = (firstDayOfWeek + i) % 7;
            const isFriday = dayOfWeekIdx === 6;
            const holidayInfo = getJalaliHoliday(viewYear, viewMonth, dayNum);
            const isRedDay = isFriday || holidayInfo.isHoliday;
            const creationBlocked = isRedDay || isPastDay(dayDate(dayNum));

            return (
              <div
                key={`day-${dayNum}`}
                role="button"
                tabIndex={0}
                onClick={() => handleSelectDay(dayNum)}
                onKeyDown={(e) => {
                  if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    handleSelectDay(dayNum);
                  }
                }}
                title={holidayInfo.isHoliday ? holidayInfo.title : undefined}
                className={`group/day relative h-14 sm:h-20 lg:h-(--cal-cell-h) p-1 sm:p-2 lg:p-1.5 rounded-2xl border transition-all duration-200 flex flex-col justify-between items-center cursor-pointer ${
                  isSelected
                    ? isRedDay
                      ? 'bg-rose-600 text-white border-rose-600 shadow-md shadow-rose-200 dark:shadow-none scale-102 z-10'
                      : 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-200 dark:shadow-none scale-102 z-10'
                    : isToday
                    ? isRedDay
                      ? 'bg-rose-100/90 dark:bg-rose-950/70 text-rose-950 dark:text-rose-100 border-rose-400 dark:border-rose-500 font-bold ring-2 ring-rose-400 dark:ring-rose-800'
                      : 'bg-indigo-50/80 dark:bg-indigo-950/60 text-indigo-900 dark:text-indigo-200 border-indigo-300 dark:border-indigo-500 font-bold'
                    : isRedDay
                    ? 'bg-rose-50/60 dark:bg-rose-950/35 hover:bg-rose-100/70 dark:hover:bg-rose-900/40 text-rose-600 dark:text-rose-400 border-rose-200/80 dark:border-rose-900/60'
                    : 'bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/70 text-slate-800 dark:text-slate-200 border-slate-200/80 dark:border-slate-700'
                }`}
              >
                {/* Day Number */}
                <div className="flex items-center justify-between w-full text-xs sm:text-sm font-semibold">
                  <span
                    className={
                      isSelected
                        ? 'text-white font-bold'
                        : isToday
                        ? isRedDay
                          ? 'text-rose-700 dark:text-rose-300 font-extrabold'
                          : 'text-indigo-700 dark:text-indigo-300'
                        : isRedDay
                        ? 'text-rose-600 dark:text-rose-400 font-extrabold'
                        : 'text-slate-700 dark:text-slate-200'
                    }
                  >
                    {toPersianDigits(dayNum)}
                  </span>
                  <span className="flex items-center gap-1">
                    {isToday && !isSelected && (
                      <span className={`w-1.5 h-1.5 rounded-full ${isRedDay ? 'bg-rose-600 dark:bg-rose-400' : 'bg-indigo-600 dark:bg-indigo-400'}`} />
                    )}
                    {/* New activity on this day: the only way a day opens the form */}
                    {(!!onOpenCreateForDate || !!meetingPeople?.canCreate) && !creationBlocked && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedDay(dayNum);
                          openCreateMenu(dayNum,e.currentTarget);
                        }}
                        title="افزودن فعالیت در این روز"
                        aria-label={`افزودن فعالیت در روز ${toPersianDigits(dayNum)}`}
                        className={`w-4 h-4 sm:w-5 sm:h-5 rounded-md flex items-center justify-center transition-all cursor-pointer [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/day:opacity-100 focus-visible:opacity-100 ${
                          isSelected
                            ? 'bg-white/20 hover:bg-white/35 text-white'
                            : isRedDay
                            ? 'text-rose-500 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/60'
                            : 'text-indigo-500 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/60'
                        }`}
                      >
                        <Plus className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                      </button>
                    )}
                  </span>
                </div>

                {/* Official Holiday Title Badge on Tile - removed per user request */}

                {/* Items Count Badge (Small Circle) */}
                {itemCount > 0 && (
                  <div className="w-full flex justify-center">
                    <span
                      className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center text-[10px] sm:text-xs font-bold leading-none transition-all ${
                        isSelected
                          ? isRedDay
                            ? 'bg-white text-rose-700 shadow-2xs'
                            : 'bg-white text-indigo-700 shadow-2xs'
                          : isRedDay
                          ? 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 border border-rose-200/80 dark:border-rose-800'
                          : 'bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-800'
                      }`}
                    >
                      {toPersianDigits(itemCount)}
                    </span>
                  </div>
                )}
              </div>
            );
          })}

        </div>

      </div>

      {/* Selected Day Task List Details Side Section */}
      {(() => {
        const selectedHolidayInfo = getJalaliHoliday(viewYear, viewMonth, selectedDay);
        const selectedDayOfWeekIdx = (firstDayOfWeek + selectedDay - 1) % 7;
        const isSelectedFriday = selectedDayOfWeekIdx === 6;
        const isSelectedPast = isPastDay(dayDate(selectedDay));
        const selectedCreationBlocked = selectedHolidayInfo.isHoliday || isSelectedFriday || isSelectedPast;

        return (
          <div className="lg:col-span-5 xl:col-span-4 bg-white dark:bg-slate-800/90 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm p-4 sm:p-5 space-y-4">
            
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-700/60">
              <div className="flex items-center gap-2">
                <CalendarDays className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">
                    روز {toPersianDigits(selectedDay)} {PERSIAN_MONTH_NAMES[viewMonth - 1]}
                  </h3>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    {toPersianDigits(selectedDayItems.length)} وظیفه · {toPersianDigits(dayMeetings.length)} جلسه
                  </span>
                </div>
              </div>

              {/* Quick Create for this Day */}
              {(!!onOpenCreateForDate || !!meetingPeople?.canCreate) && !selectedCreationBlocked && (
                <button
                  type="button"
                  onClick={e => openCreateMenu(selectedDay,e.currentTarget)}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-indigo-50 dark:bg-indigo-950 hover:bg-indigo-100 dark:hover:bg-indigo-900 text-indigo-700 dark:text-indigo-300 rounded-xl text-xs font-bold border border-indigo-200 dark:border-indigo-800 transition-colors cursor-pointer shrink-0"
                  title="افزودن فعالیت جدید"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>افزودن</span>
                </button>
              )}
            </div>

            {/* Holiday / Weekend Banner */}
            {selectedHolidayInfo.isHoliday ? (
              <div className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-rose-50 dark:bg-rose-950/70 border border-rose-200 dark:border-rose-800/80 text-rose-800 dark:text-rose-200 text-xs font-bold shadow-2xs">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0 animate-pulse"></span>
                <span>تعطیل رسمی: {selectedHolidayInfo.title}</span>
              </div>
            ) : isSelectedFriday ? (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-rose-50/80 dark:bg-rose-950/50 border border-rose-200/70 dark:border-rose-900/40 text-rose-700 dark:text-rose-300 text-xs font-bold">
                <span className="w-2 h-2 rounded-full bg-rose-400 shrink-0"></span>
                <span>تعطیل پایان هفته (جمعه)؛ امکان ایجاد وظیفه یا جلسه وجود ندارد.</span>
              </div>
            ) : isSelectedPast ? (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold">
                <span className="w-2 h-2 rounded-full bg-slate-400 shrink-0"></span>
                <span>روز گذشته؛ امکان ایجاد وظیفه یا جلسه وجود ندارد.</span>
              </div>
            ) : null}

        <section className="space-y-2" aria-label="جلسات روز انتخاب‌شده">
          <div className="flex items-center justify-between"><h4 className="text-sm font-bold text-sky-700 dark:text-sky-300">جلسات</h4><button type="button" onClick={()=>setReloadMeetings(n=>n+1)} className="text-xs text-slate-400 hover:text-indigo-600">تازه‌سازی</button></div>
          {meetingError && <Notice type="error">{meetingError}</Notice>}
          {meetingsLoading && <p className="text-xs text-slate-400">در حال دریافت جلسات…</p>}
          {!meetingsLoading && !meetingError && dayMeetings.length === 0 && <p className="text-xs text-slate-400 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl p-3">جلسه‌ای برای این روز ثبت نشده است.</p>}
          {dayMeetings.map(m=><div key={m.id} className="rounded-2xl border border-sky-200 dark:border-sky-900 bg-sky-50/60 dark:bg-sky-950/30 p-3 space-y-2">
            <div className="flex items-start justify-between gap-2"><span className="text-right font-bold text-sm text-sky-900 dark:text-sky-200">{m.details.title}</span><span className="flex items-center gap-1 shrink-0"><button type="button" title={m.canEdit ? 'جزئیات و ویرایش جلسه' : 'مشاهده جزئیات جلسه'} aria-label={(m.canEdit ? 'جزئیات و ویرایش جلسه ' : 'مشاهده جلسه ')+m.details.title} onClick={()=>{setEditingMeeting(m);setMeetingDate(m.details.date);}} className="p-1 rounded-lg text-sky-600 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-900/50 cursor-pointer"><Eye className="w-4 h-4" /></button>{m.canDelete && <button type="button" title="حذف جلسه" aria-label={'حذف جلسه '+m.details.title} onClick={()=>removeMeeting(m)} className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"><Trash2 className="w-4 h-4" /></button>}</span></div>
            <p className="text-xs text-sky-700 dark:text-sky-300">{toPersianDigits(m.details.startTime)} تا {toPersianDigits(m.details.endTime)}{m.details.location && ' · '+m.details.location}</p>
            <p className="text-[11px] text-slate-500">{toPersianDigits(m.details.participantIds.length)} فرد مرتبط · {toPersianDigits(m.details.agenda.length)} بند</p>          </div>)}
        </section>
        <h4 className="text-sm font-bold text-slate-700 dark:text-slate-200 border-t border-slate-100 dark:border-slate-700 pt-3">وظایف</h4>
        {/* Tasks List */}
        {selectedDayItems.length > 0 ? (
          <div className="space-y-2 max-h-[520px] overflow-y-auto pr-0.5">
            {selectedDayItems.map((item, index) => {
              const parent = item.parentTask;
              const commentCount = parent.comments?.length || 0;
              const { canEditTask, canDeleteTask, canChangeStatus } = checkTaskPermissions(parent);
              const itemPriority: Priority = item.priority || 'medium';
              const priorityStyle = {
                high: 'border-r-[5px] border-r-rose-500 shadow-[4px_0_10px_-2px_rgba(244,63,94,0.35)] dark:shadow-[4px_0_12px_-2px_rgba(244,63,94,0.45)]',
                medium: 'border-r-[5px] border-r-amber-400 dark:border-r-amber-500 shadow-[4px_0_10px_-2px_rgba(251,191,36,0.35)] dark:shadow-[4px_0_12px_-2px_rgba(245,158,11,0.45)]',
                low: 'border-r-[5px] border-r-emerald-500 shadow-[4px_0_10px_-2px_rgba(16,185,129,0.35)] dark:shadow-[4px_0_10px_-2px_rgba(16,185,129,0.45)]',
              }[itemPriority];

              return (
                <CalendarTaskCardItem
                  key={item.id + '_' + index}
                  item={item}
                  index={index}
                  parent={parent}
                  commentCount={commentCount}
                  canEditTask={canEditTask}
                  canDeleteTask={canDeleteTask}
                  canChangeStatus={canChangeStatus}
                  priorityStyle={priorityStyle}
                  onViewDetails={onViewDetails}
                  onEditTask={onEditTask}
                  onStatusChange={onStatusChange}
                  onDeleteRequest={(id) => setDeletingTaskId(id)}
                />
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8 px-3 bg-slate-50/60 dark:bg-slate-900/40 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
            <CalendarIcon className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              هیچ وظیفه‌ای برای این تاریخ ثبت نشده است.
            </p>
          </div>
        )}
      </div>
    );
  })()}

      {createMenu && <CalendarCreateMenu anchor={createMenu.anchor} canCreateMeeting={!!meetingPeople?.canCreate} canCreateTask={!!onOpenCreateForDate} meetingReason={meetingPeopleError || meetingPeople?.message || (!meetingPeople?'در حال بررسی دسترسی…':!meetingPeople.canCreate?'دسترسی ایجاد جلسه ندارید.':undefined)} onClose={()=>setCreateMenu(null)} onTask={()=>{const day=createMenu.day;setCreateMenu(null);openCreateForDay(day);}} onMeeting={()=>{if(!meetingPeople?.canCreate)return;setEditingMeeting(undefined);setMeetingDate(dayDate(createMenu.day));setCreateMenu(null);}} />}
      {meetingDate && currentUser && <MeetingFormModal initialDate={meetingDate} meeting={editingMeeting} currentUser={currentUser} people={registeredUsers} tasks={tasks} onClose={()=>{setMeetingDate(null);setEditingMeeting(undefined);}} onSaved={savedMeeting} onConvertToTask={onConvertMeetingToTask && ((title,isoDate)=>onConvertMeetingToTask(title,isoDate))} />}
      {/* Delete Confirmation Modal */}
      {deletingTaskId && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 max-w-sm w-full border border-rose-200 dark:border-rose-900 shadow-2xl text-center space-y-4 animate-in fade-in zoom-in-95">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                آیا از حذف این فعالیت اطمینان دارید؟
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                این اقدام غیرقابل بازگشت است.
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  onDeleteTask(deletingTaskId);
                  setDeletingTaskId(null);
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                حذف شود
              </button>
              <button
                type="button"
                onClick={() => setDeletingTaskId(null)}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                انصراف
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
