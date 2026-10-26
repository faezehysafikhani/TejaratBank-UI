import React, { useState, useEffect, useRef } from 'react';
import { Task, TaskComment, TaskLog, TaskStatus, User, STATUSES, PRIORITIES, Attachment, MAX_ATTACHMENT_BYTES, MAX_ATTACHMENT_LABEL } from '../types';
import { formatToJalali, formatFileSize, toPersianDigits, computeAutoTaskStatus, isCompletionDelayed } from '../utils/helpers';
import { readFileAsDataUrl } from '../utils/storage';
import { isAllowedUploadFile, UPLOAD_TYPE_ERROR_MESSAGE, ALLOWED_UPLOAD_ACCEPT } from '../utils/uploadPolicy';
import {
  fetchCommentsForTaskPB,
  createTaskCommentPB,
  deleteTaskCommentPB,
  updateTaskCommentPB,
  fetchTaskLogsPB
} from '../services/dataService';
import {
  X,
  Calendar,
  Clock,
  Users,
  Paperclip,
  FileText,
  Image as ImageIcon,
  Edit2,
  Trash2,
  MessageSquare,
  Send,
  AlertCircle,
  ChevronDown,
  ChevronLeft,
  Check,
  CheckCircle2,
  History,
  FolderKanban,
  Repeat,
  Tag,
  CheckSquare,
  ExternalLink,
  Loader2,
  Circle,
  PlayCircle,
} from 'lucide-react';
import { can, isTaskAdmin, PERMISSIONS } from '../utils/permissions';
import { userErrorMessage } from '../utils/errorMessages';
import { EmojiButton, VoiceButton, isVoiceName, containsEmoji } from './ChatExtras';
import { isResponsibleFor, responsibleNamesOf } from '../utils/taskPeople';
import { appAlert, appConfirm } from '../utils/appDialog';
import { showToast } from '../utils/toast';
import { NexusApiError } from '../services/nexusApi';

interface TaskDetailModalProps {
  isOpen: boolean;
  task: Task | null;
  currentUser: User;
  onClose: () => void;
  onEditTask: (task: Task) => void;
  onDeleteTask: (taskId: string) => void;
  onStatusChange?: (taskId: string, newStatus: TaskStatus) => void;
  onUpdateComments: (taskId: string, comments: TaskComment[]) => void;
  onPreviewAttachment: (attachment: Attachment) => void;
  onOpenProjectDetails?: (task: Task) => void;
  onToggleSubTask?: (taskId: string, subTaskId: string) => void;
  onConvertToTask?: (title: string, description?: string, parent?: { id: string; title: string }) => void;
}

const LOGS_PAGE_SIZE = 10;

// Test only: set VITE_FAKE_LOGS=30 in .env.development to pad the history with fake entries.
const fakeLogs = (taskId: string): TaskLog[] =>
  Array.from({ length: Number((import.meta as any).env?.VITE_FAKE_LOGS) || 0 }, (_, i) => ({
    id: `fake-${i}`,
    taskId,
    userId: 'fake',
    userName: i % 2 ? 'علی رضایی' : 'مریم احمدی',
    action: i % 3 ? 'ویرایش فعالیت' : 'تغییر وضعیت',
    details: 'تغییر موعد انجام: ۱۴۰۵/۰۷/۱۰ ← ۱۴۰۵/۰۷/۲۰ | تغییر اولویت: متوسط ← زیاد',
    createdAt: new Date(Date.now() - i * 3600_000).toISOString(),
  }));

export const TaskDetailModal: React.FC<TaskDetailModalProps> = ({
  isOpen,
  task,
  currentUser,
  onClose,
  onEditTask,
  onDeleteTask,
  onStatusChange,
  onUpdateComments,
  onPreviewAttachment,
  onOpenProjectDetails,
  onToggleSubTask,
  onConvertToTask,
}) => {
  if (!isOpen || !task) return null;

  const [commentsList, setCommentsList] = useState<TaskComment[]>(
    [...(task.comments || [])].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  );
  const [logsList, setLogsList] = useState<TaskLog[]>(task.logs || []);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [logsOpen, setLogsOpen] = useState(false);
  const [visibleLogCount, setVisibleLogCount] = useState(LOGS_PAGE_SIZE);
  const [isLoadingComments, setIsLoadingComments] = useState<boolean>(false);
  const [isLoadingLogs, setIsLoadingLogs] = useState<boolean>(false);
  const [newCommentText, setNewCommentText] = useState('');
  const [commentAttachments, setCommentAttachments] = useState<Attachment[]>([]);
  const [isUploadingCommentFiles, setIsUploadingCommentFiles] = useState(false);
  const [isDraggingOverComment, setIsDraggingOverComment] = useState(false);
  const commentFileInputRef = useRef<HTMLInputElement>(null);

  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentText, setEditingCommentText] = useState('');
  const [editingCommentAttachments, setEditingCommentAttachments] = useState<Attachment[]>([]);
  const [isUploadingEditCommentFiles, setIsUploadingEditCommentFiles] = useState(false);
  const editCommentFileInputRef = useRef<HTMLInputElement>(null);
  const [showStatusMenu, setShowStatusMenu] = useState(false);

  // Escape closes the dialog (unless the emoji list is open: Escape closes that first).
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('[data-emoji-picker]')) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  // Load comments & activity logs from the server
  const toldGoneRef = useRef(false);
  useEffect(() => {
    if (task && task.id) {
      setIsLoadingComments(true);
      fetchCommentsForTaskPB(task.id)
        .then((fetched) => {
          const sorted = [...fetched].sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
          setCommentsList(sorted);
          onUpdateComments(task.id, sorted);
        })
        .catch((err) => {
          // The server no longer shows this task to the user (taken off it, or deleted) - e.g.
          // opened from an old notification: say so instead of showing what the screen had.
          if (err instanceof NexusApiError && err.httpStatus === 404) {
            // Once, even if the comments were asked for twice.
            if (!toldGoneRef.current) {
              toldGoneRef.current = true;
              showToast('این فعالیت دیگر در دسترس شما نیست.', 'info');
            }
            onClose();
            return;
          }
          const sorted = [...(task.comments || [])].sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
          setCommentsList(sorted);
        })
        .finally(() => {
          setIsLoadingComments(false);
        });

      setIsLoadingLogs(true);
      fetchTaskLogsPB(task.id)
        .then((fetchedLogs) => {
          // Exclude comments / discussions from activity logs
          const filtered = fetchedLogs.filter(
            (l) => !l.action.includes('نظر') && !l.action.includes('گفتگو') && !l.action.includes('پیام')
          );
          setLogsList([...filtered, ...fakeLogs(task.id)]);
        })
        .catch(() => {
          const filtered = (task.logs || []).filter(
            (l) => !l.action.includes('نظر') && !l.action.includes('گفتگو') && !l.action.includes('پیام')
          );
          setLogsList(filtered);
        })
        .finally(() => {
          setIsLoadingLogs(false);
        });
    }
  }, [task?.id]);

  const isAdmin = isTaskAdmin(currentUser);

  const isAssignee = isResponsibleFor(task, currentUser);

  const isTeamMember = !!(
    currentUser &&
    ((task.teamMemberIds && task.teamMemberIds.includes(currentUser.id)) ||
      (task.assignedTeamId && currentUser.teams?.some((t) => t.id === task.assignedTeamId)))
  );

  // Task Creator Check
  const isTaskCreator = !!(currentUser && task.user && task.user === currentUser.id);

  // Task Owner by details
  const isOwnerByDetails = !!(
    currentUser &&
    task.ownerName &&
    (task.ownerName.trim().toLowerCase() === (currentUser.name || '').trim().toLowerCase() ||
      task.ownerName.trim().toLowerCase() === (currentUser.username || '').trim().toLowerCase() ||
      task.ownerName.trim().toLowerCase() === (currentUser.email || '').trim().toLowerCase()) &&
    !isAssignee &&
    !isTeamMember
  );

  // Real Owner: Creator OR OwnerByDetails when NOT an assignee/team member assigned by another user
  const isTaskOwner = isTaskCreator || isOwnerByDetails;
  const isOwnerOrAdmin = isAdmin || isTaskOwner;

  const allowStatusUpdateForAssignee = task.allowAssigneeStatusUpdate !== false;

  const isAutoStatusTask = task.isProject || task.isRecurring || (task.projectSubTasks && task.projectSubTasks.length > 0);
  const currentComputedStatus = isAutoStatusTask ? computeAutoTaskStatus(task.projectSubTasks) : task.status;

  // Permissions:
  // Status Change: allowed for the admin/ManageAll, the task's real owner, or its assignee (when
  // allowStatusUpdateForAssignee is true) - never a team member who is not also an assignee, to
  // match the server's own resource-level rule (Nexus.TaskManagement CanChangeStatus).
  const canChangeStatus = (isAdmin || isTaskOwner || (isAssignee && allowStatusUpdateForAssignee)) && !isAutoStatusTask && can(currentUser, PERMISSIONS.tasksEdit);

  // Edit / Delete: STRICTLY for System Admin or Task Creator / Real Owner.
  // Assignees and Team Members who are NOT the original creator/admin can NEVER edit or delete!
  const isOwnerOrTaskAdmin = isAdmin || (isTaskCreator && (!isAssignee && !isTeamMember || isTaskCreator)) || isOwnerByDetails;
  const canEditTask = isOwnerOrTaskAdmin && can(currentUser, PERMISSIONS.tasksEdit);
  const canDeleteTask = isOwnerOrTaskAdmin && can(currentUser, PERMISSIONS.tasksDelete);
  const canComment = can(currentUser, PERMISSIONS.tasksComment);

  const statusCfg = STATUSES[currentComputedStatus] || STATUSES.todo;

  const handleSelectStatus = (newStatus: TaskStatus) => {
    if (!onStatusChange || newStatus === task.status) return;
    // onStatusChange already goes through the server's status-change endpoint, which records
    // its own clear "Status changed" log entry - logging it again here only duplicated it.
    onStatusChange(task.id, newStatus);
    setShowStatusMenu(false);
  };

  const handleCommentFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsUploadingCommentFiles(true);
    try {
      const newAtts: Attachment[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!isAllowedUploadFile(file)) {
          void appAlert(UPLOAD_TYPE_ERROR_MESSAGE);
          continue;
        }
        if (file.size > MAX_ATTACHMENT_BYTES) {
          void appAlert(`حجم فایل «${file.name}» بیشتر از ${MAX_ATTACHMENT_LABEL} است.`);
          continue;
        }
        const dataUrl = await readFileAsDataUrl(file);
        newAtts.push({
          id: `att-cmt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          name: file.name,
          size: file.size,
          type: file.type || 'application/octet-stream',
          dataUrl,
          createdAt: new Date().toISOString(),
        });
      }
      setCommentAttachments((prev) => [...prev, ...newAtts]);
    } catch (err) {
      console.error('Failed to attach file to comment:', err);
      void appAlert('خطا در بارگذاری فایل. لطفاً مجدداً تلاش کنید.');
    } finally {
      setIsUploadingCommentFiles(false);
      if (commentFileInputRef.current) {
        commentFileInputRef.current.value = '';
      }
    }
  };

  const handleRemoveCommentAttachment = (attId: string) => {
    setCommentAttachments((prev) => prev.filter((a) => a.id !== attId));
  };

  const handleEditCommentFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsUploadingEditCommentFiles(true);
    try {
      const newAtts: Attachment[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!isAllowedUploadFile(file)) {
          void appAlert(UPLOAD_TYPE_ERROR_MESSAGE);
          continue;
        }
        if (file.size > MAX_ATTACHMENT_BYTES) {
          void appAlert(`حجم فایل «${file.name}» بیشتر از ${MAX_ATTACHMENT_LABEL} است.`);
          continue;
        }
        const dataUrl = await readFileAsDataUrl(file);
        newAtts.push({
          id: `att-cmt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          name: file.name,
          size: file.size,
          type: file.type || 'application/octet-stream',
          dataUrl,
          createdAt: new Date().toISOString(),
        });
      }
      setEditingCommentAttachments((prev) => [...prev, ...newAtts]);
    } catch (err) {
      console.error('Failed to attach file to edit comment:', err);
      void appAlert('خطا در بارگذاری فایل. لطفاً مجدداً تلاش کنید.');
    } finally {
      setIsUploadingEditCommentFiles(false);
      if (editCommentFileInputRef.current) {
        editCommentFileInputRef.current.value = '';
      }
    }
  };

  const handleRemoveEditCommentAttachment = (attId: string) => {
    setEditingCommentAttachments((prev) => prev.filter((a) => a.id !== attId));
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCommentText.trim() && commentAttachments.length === 0) return;

    const textToSubmit = newCommentText.trim();
    const attsToSubmit = [...commentAttachments];

    setNewCommentText('');
    setCommentAttachments([]);

    try {
      const createdComment = await createTaskCommentPB({
        taskId: task.id,
        userId: currentUser.id,
        userName: currentUser.name || currentUser.username,
        userAvatar: currentUser.avatar,
        text: textToSubmit,
        attachments: attsToSubmit.length > 0 ? attsToSubmit : undefined,
      });

      const updatedComments = [createdComment, ...commentsList];
      setCommentsList(updatedComments);
      onUpdateComments(task.id, updatedComments);
    } catch (err) {
      console.error('Failed to post comment to task_comments:', err);
    }
  };

  const handleStartEditComment = (comment: TaskComment) => {
    setEditingCommentId(comment.id);
    setEditingCommentText(comment.text);
    setEditingCommentAttachments(comment.attachments || []);
  };

  const handleSaveEditComment = (commentId: string) => {
    if (!editingCommentText.trim() && editingCommentAttachments.length === 0) return;
    const previousAttachments = commentsList.find((c) => c.id === commentId)?.attachments || [];
    // Stored on the server when there is one; a failure is reported and the list reloaded.
    updateTaskCommentPB(commentId, editingCommentText.trim(), editingCommentAttachments, previousAttachments).catch((err) => {
      void appAlert(userErrorMessage(err, 'خطا در ذخیره ویرایش نظر'));
      fetchCommentsForTaskPB(task.id).then((fresh) => setCommentsList(fresh)).catch(() => {});
    });
    const updatedComments = commentsList.map((c) => {
      if (c.id === commentId) {
        return {
          ...c,
          text: editingCommentText.trim(),
          attachments: editingCommentAttachments.length > 0 ? editingCommentAttachments : undefined,
          updatedAt: new Date().toISOString(),
        };
      }
      return c;
    });
    setCommentsList(updatedComments);
    onUpdateComments(task.id, updatedComments);
    setEditingCommentId(null);
    setEditingCommentText('');
    setEditingCommentAttachments([]);
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!(await appConfirm('آیا از حذف این نظر اطمینان دارید؟'))) return;
    
    // Optimistic removal
    const updatedComments = commentsList.filter((c) => c.id !== commentId);
    setCommentsList(updatedComments);
    onUpdateComments(task.id, updatedComments);

    await deleteTaskCommentPB(commentId);
  };

  const handleToggleSubTaskInModal = (subTaskId: string) => {
    if (!task) return;
    if (onToggleSubTask) {
      onToggleSubTask(task.id, subTaskId);
    } else {
      const currentSubTasks = task.projectSubTasks || [];
      const updated = currentSubTasks.map((st) =>
        st.id === subTaskId ? { ...st, completed: !st.completed } : st
      );
      onEditTask({ ...task, projectSubTasks: updated });
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-100 dark:border-slate-800 overflow-hidden animate-in fade-in zoom-in-95 my-auto text-slate-800 dark:text-slate-100">
        
        {/* Header Bar */}
        <div className="flex items-center justify-between px-5 py-4 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
                گفتگو و جزئیات: {task.title}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                مشاهده مشخصات و گفتگوهای اعضای تیم کاری
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Project Details Button */}
            {task.isProject && (
              <button
                type="button"
                onClick={() => {
                  if (onOpenProjectDetails) {
                    onOpenProjectDetails(task);
                  }
                }}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                title="مشاهده منشور، زیرفعالیت‌ها و داشبورد پروژه"
              >
                <FolderKanban className="w-4 h-4" />
                <span>داشبورد پروژه</span>
              </button>
            )}

            {/* Edit Button for Owner/Admin */}
            {canEditTask && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onEditTask(task);
                }}
                className="p-2 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-slate-700/60 rounded-xl transition-colors cursor-pointer"
                title="ویرایش کامل فعالیت"
              >
                <Edit2 className="w-4 h-4" />
              </button>
            )}

            {/* Delete Button for Owner/Admin */}
            {canDeleteTask && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onDeleteTask(task.id);
                }}
                className="order-first me-3 p-2 text-rose-500 hover:text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-slate-700/60 rounded-xl transition-colors cursor-pointer"
                title="حذف فعالیت"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}

            <button
              onClick={onClose}
              title="بستن"
              aria-label="بستن"
              className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-700/60 rounded-xl transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">

          {/* Status & Permission Control Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">وضعیت فعالیت:</span>
              {canChangeStatus ? (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowStatusMenu(!showStatusMenu)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer border ${statusCfg.badgeBg} ${statusCfg.badgeText} ${statusCfg.borderColor}`}
                  >
                    <span>{statusCfg.title}</span>
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>

                  {showStatusMenu && (
                    <div className="absolute right-0 mt-1.5 w-44 bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-800 py-1 z-30 animate-in fade-in zoom-in-95">
                      {(Object.keys(STATUSES) as TaskStatus[]).map((stKey) => {
                        const cfg = STATUSES[stKey];
                        return (
                          <button
                            key={stKey}
                            type="button"
                            onClick={() => handleSelectStatus(stKey)}
                            className={`w-full text-right px-3 py-2 text-xs font-bold flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer ${
                              task.status === stKey ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-700 dark:text-slate-200'
                            }`}
                          >
                            <span>{cfg.title}</span>
                            {task.status === stKey && <Check className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className={`px-3 py-1.5 rounded-xl text-xs font-bold border ${statusCfg.badgeBg} ${statusCfg.badgeText} ${statusCfg.borderColor}`}>
                    {statusCfg.title}
                  </span>
                  {isAutoStatusTask && (
                    <span className="text-[11px] text-indigo-600 dark:text-indigo-400 font-medium">
                      (محاسبه بر اساس زیرمجموعه‌ها)
                    </span>
                  )}
                </div>
              )}
            </div>

            {task.standIns && task.standIns.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 text-xs" data-stand-in>
                <span className="text-slate-500 dark:text-slate-400 font-medium">جانشین:</span>
                {task.standIns.map((s) => (
                  <span key={s.userId} className="font-bold text-violet-700 dark:text-violet-300">
                    {s.name}{s.note ? <span className="font-medium text-slate-500 dark:text-slate-400"> ({s.note})</span> : null}
                  </span>
                ))}
              </div>
            )}

            {/* Assignee and Update Permission Info */}
            {task.assignedUserId && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-500 dark:text-slate-400 font-medium">مسئول اجرا:</span>
                <span className="font-bold text-slate-800 dark:text-slate-100">{responsibleNamesOf(task) || 'مشخص شده'}</span>
                {allowStatusUpdateForAssignee ? (
                  <span className="px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold border border-emerald-200 dark:border-emerald-800">
                    امکان بروزرسانی فعال
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 text-[10px] font-bold border border-amber-200 dark:border-amber-800">
                    امکان بروزرسانی غیرفعال
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Task Description Section (توضیحات فعالیت) */}
          <div className="p-4 rounded-2xl bg-indigo-50/50 dark:bg-slate-800/80 border border-indigo-100 dark:border-slate-700/80 space-y-2.5 shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-slate-100">
                <FileText className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                <span>توضیحات فعالیت</span>
              </div>

              {/* Due date & Priority chips */}
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                {task.dueDate && (
                  <span className="px-2.5 py-1 rounded-lg bg-white/80 dark:bg-slate-900/80 text-slate-700 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700/80 flex items-center gap-1.5 font-medium">
                    <Calendar className="w-3.5 h-3.5 text-indigo-500" />
                    <span>موعد: {formatToJalali(task.dueDate)}</span>
                  </span>
                )}
                {task.status === 'completed' && (task.actualCompletionDate || task.updatedAt) && (() => {
                  const completionDate = task.actualCompletionDate || task.updatedAt;
                  const isDelayed = isCompletionDelayed(task.dueDate, completionDate);
                  return (
                    <span
                      className={`px-2.5 py-1 rounded-lg border flex items-center gap-1.5 font-bold transition-colors ${
                        isDelayed
                          ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200/80 dark:border-rose-800/80'
                          : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200/80 dark:border-emerald-800/80'
                      }`}
                      title={isDelayed ? 'تکمیل با تاخیر نسبت به تاریخ برنامه‌ریزی شده' : 'تکمیل در موعد برنامه‌ریزی شده (به‌موقع)'}
                    >
                      <CheckCircle2
                        className={`w-3.5 h-3.5 ${
                          isDelayed ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
                        }`}
                      />
                      <span>تکمیل واقعی: {formatToJalali(completionDate)}</span>
                      {isDelayed && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-rose-200/80 dark:bg-rose-900/80 text-rose-800 dark:text-rose-200 font-normal mr-1">
                          (با تاخیر)
                        </span>
                      )}
                    </span>
                  );
                })()}
                {task.priority && PRIORITIES[task.priority] && (
                  <span className={`px-2.5 py-1 rounded-lg border font-bold flex items-center gap-1.5 ${PRIORITIES[task.priority].badgeBg} ${PRIORITIES[task.priority].badgeText} ${PRIORITIES[task.priority].borderColor}`}>
                    <AlertCircle className="w-3 h-3" />
                    <span>اولویت {PRIORITIES[task.priority].title}</span>
                  </span>
                )}
              </div>
            </div>

            {task.description && task.description.trim() ? (
              <div className="text-xs sm:text-sm text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-wrap bg-white dark:bg-slate-900/90 p-3.5 rounded-xl border border-slate-200/70 dark:border-slate-700/60 select-text">
                {task.description}
              </div>
            ) : (
              <div className="text-xs text-slate-400 dark:text-slate-500 italic bg-white/50 dark:bg-slate-900/40 p-3 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
                توضیحاتی برای این فعالیت ثبت نشده است.
              </div>
            )}

            {/* Tags if present */}
            {task.tags && task.tags.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <Tag className="w-3 h-3 text-slate-400 shrink-0" />
                {task.tags.map((tag, idx) => (
                  <span
                    key={idx}
                    className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-200/70 dark:bg-slate-700 text-slate-700 dark:text-slate-300"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>
          
          {/* Attachments Section */}
          {task.attachments && task.attachments.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Paperclip className="w-3.5 h-3.5 text-indigo-600" />
                <span>فایل‌های ضمیمه ({toPersianDigits(task.attachments.length)})</span>
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {task.attachments.map((att) => {
                  const isImage = att.type.startsWith('image/') || att.dataUrl.startsWith('data:image/');
                  return (
                    <button
                      key={att.id}
                      type="button"
                      onClick={() => onPreviewAttachment(att)}
                      className="flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 border border-slate-200 dark:border-slate-700 transition-colors text-right cursor-pointer"
                    >
                      {isImage ? (
                        <ImageIcon className="w-4 h-4 text-indigo-500 shrink-0" />
                      ) : (
                        <FileText className="w-4 h-4 text-amber-500 shrink-0" />
                      )}
                      <div className="overflow-hidden">
                        <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">{att.name}</p>
                        <p className="text-[10px] text-slate-400">{formatFileSize(att.size)}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Subtasks / Recurring Occurrences Section */}
          {task.projectSubTasks && task.projectSubTasks.length > 0 && (
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                  <Repeat className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  <span>
                    {task.isRecurring ? 'زیرفعالیت‌ها / تکرارها' : 'زیرفعالیت‌ها'} ({toPersianDigits(task.projectSubTasks.filter((s) => s.completed).length)} از {toPersianDigits(task.projectSubTasks.length)} انجام شده)
                  </span>
                </h4>
              </div>

              <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                {task.projectSubTasks.map((st) => {
                  const progress = st.status || (st.completed ? 'completed' : 'not_started');
                  const isDone = progress === 'completed';
                  const isInProgress = progress === 'in_progress';
                  return (
                    <div
                      key={st.id}
                      onClick={() => handleToggleSubTaskInModal(st.id)}
                      className={`flex items-center justify-between p-2.5 rounded-xl border text-xs transition-all cursor-pointer ${
                        isDone
                          ? 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 text-slate-400 dark:text-slate-500 line-through'
                          : isInProgress
                            ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900 text-slate-800 dark:text-slate-100 hover:border-amber-300'
                            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 hover:border-purple-300'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1 pr-1">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleToggleSubTaskInModal(st.id); }}
                          title={isDone ? 'انجام شده - کلیک برای بازگشت به شروع نشده' : isInProgress ? 'درحال انجام - کلیک برای علامت زدن به انجام شده' : 'شروع نشده - کلیک برای شروع'}
                          className="shrink-0"
                        >
                          {isDone ? (
                            <CheckCircle2 className="w-4 h-4 text-purple-600" />
                          ) : isInProgress ? (
                            <PlayCircle className="w-4 h-4 text-amber-500" />
                          ) : (
                            <Circle className="w-4 h-4 text-slate-300 dark:text-slate-600" />
                          )}
                        </button>
                        <div className="min-w-0 flex-1">
                          <span className="font-bold text-xs truncate block">{st.title}</span>
                          {st.assignees && st.assignees.length > 0 && (
                            <span className="text-[10px] text-slate-400 dark:text-slate-500 truncate block">
                              مسئول: {st.assignees.map((a) => a.name).join('، ')}
                            </span>
                          )}
                          {isInProgress && st.actualStartDate && (
                            <span className="text-[10px] text-amber-600 dark:text-amber-400 truncate block">
                              شروع: {formatToJalali(st.actualStartDate)}
                            </span>
                          )}
                          {isDone && (st.actualStartDate || st.actualCompletedDate) && (
                            <span className="text-[10px] text-slate-400 dark:text-slate-500 truncate block">
                              {st.actualStartDate && <>شروع: {formatToJalali(st.actualStartDate)}</>}
                              {st.actualStartDate && st.actualCompletedDate && ' · '}
                              {st.actualCompletedDate && <>پایان: {formatToJalali(st.actualCompletedDate)}</>}
                            </span>
                          )}
                        </div>
                      </div>

                      {(st.startDate || st.endDate) && (
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 shrink-0 font-medium dir-rtl mr-2 text-left">
                          {st.startDate && <span>{formatToJalali(st.startDate)}</span>}
                          {st.endDate && st.endDate !== st.startDate && (
                            <span> - {formatToJalali(st.endDate)}</span>
                          )}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Discussion & Chat Section */}
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <MessageSquare className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span>گفتگو فعالیت ({toPersianDigits(commentsList.length)})</span>
              </h4>
              {isLoadingComments && (
                <span className="text-[10px] text-indigo-600 dark:text-indigo-400 animate-pulse font-medium">
                  در حال بروزرسانی گفتگوها...
                </span>
              )}
            </div>

            {/* Discussion Visibility Banner */}
            <div className="px-3 py-1.5 bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/60 rounded-xl flex items-center gap-2 text-[11px] text-indigo-700 dark:text-indigo-300 font-medium">
              <Users className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
              <span>
                گفتگوهای این فعالیت برای تمامی افراد شامل مالک ({task.ownerName || 'سازنده'})، مسئولان ({responsibleNamesOf(task) || 'بدون مسئول'}) و اعضای تیم قابل مشاهده است.
              </span>
            </div>

            {/* Comments List */}
            {commentsList.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
                هنوز هیچ نظری برای این فعالیت ثبت نشده است. اولین پیام یا نظر را بنویسید!
              </div>
            ) : (
              <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                {commentsList.map((cmt) => {
                  const isMyComment = cmt.userId === currentUser.id;
                  const canDelete = isMyComment || isOwnerOrAdmin;
                  const isEditingThis = editingCommentId === cmt.id;

                  return (
                    <div
                      key={cmt.id}
                      className={`p-3 rounded-2xl border text-xs space-y-2 transition-all ${
                        isMyComment
                          ? 'mr-6 sm:mr-10 bg-indigo-50/90 dark:bg-indigo-950/70 border-indigo-200 dark:border-indigo-800/80 shadow-2xs'
                          : 'ml-6 sm:ml-10 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700/80 shadow-2xs'
                      }`}
                    >
                      {/* Author Header */}
                      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700/50 pb-1.5">
                        <div className="flex items-center gap-2">
                          {cmt.userAvatar ? (
                            <img
                              src={cmt.userAvatar}
                              alt={cmt.userName}
                              className="w-5 h-5 rounded-full object-cover border border-slate-200 shrink-0"
                            />
                          ) : (
                            <div className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-[9px] shrink-0">
                              {cmt.userName ? cmt.userName.charAt(0).toUpperCase() : 'U'}
                            </div>
                          )}

                          <span
                            className={`font-extrabold text-xs ${
                              isMyComment
                                ? 'text-indigo-600 dark:text-indigo-400'
                                : 'text-slate-800 dark:text-slate-100'
                            }`}
                          >
                            {isMyComment ? 'شما' : cmt.userName}
                          </span>
                          {cmt.actingNote && (
                            <span className="px-1.5 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 text-[10px] font-bold" title="به‌عنوان جانشین پست خالی">
                              {cmt.actingNote.replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)])}
                            </span>
                          )}
                        </div>

                        {/* Date & Time display in violet/indigo font */}
                        <div className="flex items-center gap-1.5 text-[11px] font-bold text-indigo-600 dark:text-indigo-400">
                          <Clock className="w-3 h-3 text-indigo-500" />
                          <span>{formatToJalali(cmt.createdAt)}</span>
                        </div>
                      </div>

                      {/* Comment Body or Edit Form */}
                      {isEditingThis ? (
                        <div className="space-y-2 pt-1">
                          <textarea
                            rows={2}
                            value={editingCommentText}
                            onChange={(e) => setEditingCommentText(e.target.value)}
                            placeholder="متن نظر یا پیام..."
                            className="w-full p-2 bg-white dark:bg-slate-900 border border-indigo-300 dark:border-indigo-700 rounded-xl text-xs focus:outline-none text-slate-800 dark:text-slate-100"
                          />

                          {/* Existing/Edited Comment Attachments */}
                          {editingCommentAttachments.length > 0 && (
                            <div className="space-y-1">
                              <p className="text-[10px] font-bold text-slate-500">فایل‌های ضمیمه این نظر:</p>
                              <div className="flex flex-wrap gap-1.5">
                                {editingCommentAttachments.map((att) => {
                                  const isImg = att.type.startsWith('image/') || att.dataUrl.startsWith('data:image/');
                                  return (
                                    <div
                                      key={att.id}
                                      className="flex items-center gap-1.5 pl-1.5 pr-2 py-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-[11px] text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700"
                                    >
                                      {isImg ? (
                                        <ImageIcon className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                                      ) : (
                                        <FileText className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                      )}
                                      <span className="truncate max-w-[120px] font-medium">{att.name}</span>
                                      <span className="text-[10px] text-slate-400">({formatFileSize(att.size)})</span>
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveEditCommentAttachment(att.id)}
                                        className="text-slate-400 hover:text-rose-500 mr-0.5 cursor-pointer"
                                        title="حذف فایل از این نظر"
                                      >
                                        <X className="w-3 h-3" />
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          <div className="flex items-center justify-between gap-1.5 pt-1">
                            <div>
                              <input
                                type="file"
                                ref={editCommentFileInputRef}
                                onChange={(e) => handleEditCommentFileUpload(e.target.files)}
                                multiple
                                accept={ALLOWED_UPLOAD_ACCEPT}
                                className="hidden"
                              />
                              <button
                                type="button"
                                onClick={() => editCommentFileInputRef.current?.click()}
                                disabled={isUploadingEditCommentFiles}
                                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 rounded-lg font-bold cursor-pointer transition-colors"
                              >
                                {isUploadingEditCommentFiles ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Paperclip className="w-3 h-3" />
                                )}
                                <span>افزودن فایل ضمیمه</span>
                              </button>
                            </div>

                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingCommentId(null);
                                  setEditingCommentText('');
                                  setEditingCommentAttachments([]);
                                }}
                                className="px-2.5 py-1 text-[11px] text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
                              >
                                انصراف
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSaveEditComment(cmt.id)}
                                disabled={!editingCommentText.trim() && editingCommentAttachments.length === 0}
                                className="px-2.5 py-1 text-[11px] bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-bold rounded-lg cursor-pointer"
                              >
                                ثبت تغییرات
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {cmt.text && (
                            <p className="text-slate-800 dark:text-slate-100 font-medium leading-relaxed whitespace-pre-line py-0.5">
                              {cmt.text}
                            </p>
                          )}

                          {/* Render Comment Attachments */}
                          {cmt.attachments && cmt.attachments.length > 0 && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                              {cmt.attachments.map((att) => {
                                if (isVoiceName(att.name)) {
                                  return <audio key={att.id} controls src={att.dataUrl} className="w-full h-9 sm:col-span-2" />;
                                }
                                const isImg = att.type.startsWith('image/') || att.dataUrl.startsWith('data:image/');
                                return (
                                  <div
                                    key={att.id}
                                    onClick={() => onPreviewAttachment(att)}
                                    className="flex items-center gap-2.5 p-2 rounded-xl bg-white dark:bg-slate-900/90 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 border border-slate-200/80 dark:border-slate-700 transition-colors cursor-pointer group text-right overflow-hidden shadow-2xs"
                                    title={`مشاهده فایل: ${att.name}`}
                                  >
                                    {isImg ? (
                                      <div className="w-9 h-9 rounded-lg overflow-hidden shrink-0 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center">
                                        <img src={att.dataUrl} alt={att.name} className="w-full h-full object-cover" />
                                      </div>
                                    ) : (
                                      <div className="w-9 h-9 rounded-lg shrink-0 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 flex items-center justify-center text-amber-600 dark:text-amber-400">
                                        <FileText className="w-4 h-4" />
                                      </div>
                                    )}
                                    <div className="overflow-hidden flex-1 min-w-0">
                                      <p className="text-[11px] font-bold text-slate-800 dark:text-slate-200 truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                                        {att.name}
                                      </p>
                                      <p className="text-[10px] text-slate-400 dark:text-slate-500">
                                        {formatFileSize(att.size)}
                                      </p>
                                    </div>
                                    <ExternalLink className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-500 shrink-0 ml-1 opacity-70 group-hover:opacity-100 transition-opacity" />
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Actions Footer for Comments */}
                      {!isEditingThis && (
                        <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-slate-100 dark:border-slate-700/50 text-[11px]">
                          {onConvertToTask && !cmt.attachments?.some((att) => isVoiceName(att.name)) && !containsEmoji(cmt.text) && (
                            <button
                              type="button"
                              onClick={() => {
                                const title = cmt.text
                                  ? cmt.text.length > 50
                                    ? cmt.text.substring(0, 50) + '...'
                                    : cmt.text
                                  : 'وظیفه جدید از گفتگو';
                                const desc = `برگرفته از گفتگو و نظر روی فعالیت «${task.title}» (نویسنده: ${cmt.userName || 'کاربر'}):\n${cmt.text}`;
                                onClose();
                                onConvertToTask(title, desc, { id: task.id, title: task.title });
                              }}
                              className="flex items-center gap-1 text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-bold cursor-pointer"
                              title="تبدیل این نظر به یک وظیفه جدید"
                            >
                              <CheckSquare className="w-3 h-3" />
                              <span>تبدیل به وظیفه</span>
                            </button>
                          )}

                          {(isMyComment || canDelete) && (
                            <div className="flex items-center gap-2 mr-auto">
                              {isMyComment && (
                                <button
                                  type="button"
                                  onClick={() => handleStartEditComment(cmt)}
                                  className="flex items-center gap-1 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 font-bold cursor-pointer"
                                >
                                  <Edit2 className="w-3 h-3" />
                                  <span>ویرایش</span>
                                </button>
                              )}

                              {isMyComment && canDelete && (
                                <span className="text-slate-300 dark:text-slate-600">|</span>
                              )}

                              {canDelete && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteComment(cmt.id)}
                                  className="flex items-center gap-1 text-rose-600 dark:text-rose-400 hover:text-rose-800 font-bold cursor-pointer"
                                >
                                  <Trash2 className="w-3 h-3" />
                                  <span>حذف</span>
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* New Comment Input Form with File Upload & Drag & Drop (Tasks.Comment) */}
            {canComment && (
            <form
              onSubmit={handleAddComment}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDraggingOverComment(true);
              }}
              onDragLeave={() => setIsDraggingOverComment(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDraggingOverComment(false);
                handleCommentFileUpload(e.dataTransfer.files);
              }}
              className={`p-2.5 rounded-2xl border transition-all ${
                isDraggingOverComment
                  ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/40 ring-2 ring-indigo-400/40'
                  : 'border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/60'
              }`}
            >
              {/* Hidden File Input */}
              <input
                type="file"
                ref={commentFileInputRef}
                onChange={(e) => handleCommentFileUpload(e.target.files)}
                multiple
                accept={ALLOWED_UPLOAD_ACCEPT}
                className="hidden"
              />

              {/* Pending Attachments List */}
              {commentAttachments.length > 0 && (
                <div className="mb-2 p-2 bg-white dark:bg-slate-900/90 rounded-xl border border-indigo-100 dark:border-indigo-900/60 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] text-indigo-700 dark:text-indigo-300 font-bold">
                    <span className="flex items-center gap-1">
                      <Paperclip className="w-3.5 h-3.5 text-indigo-500" />
                      <span>فایل‌های پیوست شده ({toPersianDigits(commentAttachments.length)})</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setCommentAttachments([])}
                      className="text-[10px] text-slate-400 hover:text-rose-500 cursor-pointer"
                    >
                      حذف همه
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {commentAttachments.map((att) => {
                      const isImg = att.type.startsWith('image/') || att.dataUrl.startsWith('data:image/');
                      return (
                        <div
                          key={att.id}
                          className="flex items-center gap-1.5 pl-1.5 pr-2 py-1 bg-indigo-50/80 dark:bg-indigo-950/60 border border-indigo-200/80 dark:border-indigo-800/80 rounded-lg text-xs text-slate-800 dark:text-slate-200"
                        >
                          {isImg ? (
                            <div className="w-4 h-4 rounded overflow-hidden shrink-0 border border-indigo-300 dark:border-indigo-700">
                              <img src={att.dataUrl} alt={att.name} className="w-full h-full object-cover" />
                            </div>
                          ) : (
                            <FileText className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                          )}
                          <span className="font-bold text-[11px] truncate max-w-[130px]">{att.name}</span>
                          <span className="text-[10px] text-slate-400">({formatFileSize(att.size)})</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveCommentAttachment(att.id)}
                            className="p-0.5 text-slate-400 hover:text-rose-500 rounded hover:bg-rose-50 dark:hover:bg-rose-950 transition-colors cursor-pointer mr-0.5"
                            title="حذف این فایل"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Text Area */}
              <textarea
                rows={2}
                value={newCommentText}
                onChange={(e) => setNewCommentText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if ((newCommentText.trim() || commentAttachments.length > 0) && !isUploadingCommentFiles) {
                      handleAddComment(e);
                    }
                  }
                }}
                placeholder="نظر یا پیام خود را بنویسید..."
                className="w-full p-2 bg-transparent text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none resize-none"
              />

              {/* Toolbar Controls: Side-by-side icon-only Send & Attachment buttons without extra labels or text */}
              <div className="flex items-center justify-end gap-1.5 pt-1.5 border-t border-slate-200/70 dark:border-slate-700/60 mt-1">
                <EmojiButton onPick={(emoji) => setNewCommentText((t) => t + emoji)} className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors cursor-pointer shrink-0" iconClassName="w-4 h-4" />
                <VoiceButton
                  onRecorded={(v) =>
                    setCommentAttachments((prev) => [
                      ...prev,
                      {
                        id: `att-cmt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
                        name: v.name,
                        size: v.size,
                        type: v.type,
                        dataUrl: v.url,
                        createdAt: new Date().toISOString(),
                      },
                    ])
                  }
                  onError={(msg) => void appAlert(msg)}
                  className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors cursor-pointer shrink-0"
                  iconClassName="w-4 h-4"
                />
                <button
                  type="button"
                  onClick={() => commentFileInputRef.current?.click()}
                  disabled={isUploadingCommentFiles}
                  className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors cursor-pointer disabled:opacity-40 shrink-0"
                  title="ضمیمه فایل"
                >
                  {isUploadingCommentFiles ? (
                    <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
                  ) : (
                    <Paperclip className="w-4 h-4" />
                  )}
                </button>

                <button
                  type="submit"
                  disabled={(!newCommentText.trim() && commentAttachments.length === 0) || isUploadingCommentFiles}
                  className="w-8 h-8 flex items-center justify-center bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl transition-all cursor-pointer shadow-xs shrink-0"
                  title="ارسال"
                >
                  <Send className="w-4 h-4 rotate-180" />
                </button>
              </div>
            </form>
            )}

          </div>

          {/* Activity Log / Change History Timeline */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setLogsOpen((v) => !v)}
                aria-expanded={logsOpen}
                className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5 cursor-pointer"
              >
                <ChevronLeft
                  className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${logsOpen ? '-rotate-90' : ''}`}
                />
                <History className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span>تاریخچه و لاگ تغییرات فعالیت ({toPersianDigits(logsList.length)})</span>
              </button>
              {isLoadingLogs && (
                <span className="text-[10px] text-indigo-600 dark:text-indigo-400 animate-pulse font-medium">
                  در حال بارگذاری تغییرات...
                </span>
              )}
            </div>

            {!logsOpen ? null : logsList.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-400 bg-slate-50/50 dark:bg-slate-800/30 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
                هنوز هیچ لاگ رویداد یا تغییری ثبت نشده است.
              </div>
            ) : (
              <div
                className="space-y-2 max-h-80 overflow-y-auto pr-1"
                onScroll={(e) => {
                  const el = e.currentTarget;
                  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24) {
                    setVisibleLogCount((n) => Math.min(n + LOGS_PAGE_SIZE, logsList.length));
                  }
                }}
              >
                {logsList.slice(0, visibleLogCount).map((log) => {
                  const isOpen = expandedLogId === log.id;
                  return (
                    <div
                      key={log.id}
                      className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/60 rounded-xl text-xs"
                    >
                      <button
                        type="button"
                        onClick={() => setExpandedLogId(isOpen ? null : log.id)}
                        aria-expanded={isOpen}
                        className="w-full p-3 flex items-center justify-between gap-2 text-right cursor-pointer"
                      >
                        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                          <ChevronLeft
                            className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${isOpen ? '-rotate-90' : ''}`}
                          />
                          <span className="font-bold text-slate-800 dark:text-slate-100 bg-slate-200/60 dark:bg-slate-700/60 px-2 py-0.5 rounded-md text-[11px]">
                            {log.userName || 'کاربر سیستم'}
                          </span>
                          <span className="font-bold text-indigo-700 dark:text-indigo-300">
                            {log.action}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 text-[10px] text-slate-400 font-medium shrink-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-2 py-1 rounded-lg">
                          <Clock className="w-3 h-3 text-indigo-500" />
                          <span>{formatToJalali(log.createdAt)}</span>
                        </div>
                      </button>
                      {isOpen && log.details && (
                        <div className="mx-3 mb-3 text-[11px] text-slate-600 dark:text-slate-300 font-medium leading-relaxed bg-white/70 dark:bg-slate-900/60 p-2 rounded-lg border border-slate-200/60 dark:border-slate-700/50">
                          {log.details.includes(' | ') ? (
                            <ul className="space-y-1 list-disc list-inside">
                              {log.details.split(' | ').map((item, idx) => (
                                <li key={idx} className="text-slate-700 dark:text-slate-200">{item}</li>
                              ))}
                            </ul>
                          ) : (
                            <p>{log.details}</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>

      </div>
    </div>
  );
};
