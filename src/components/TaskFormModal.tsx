import React, { useState, useEffect, useRef } from 'react';
import { PersianTimeInput } from './PersianTimeInput';
import { Task, TaskStatus, Priority, Attachment, STATUSES, PRIORITIES, AppColorPalette, User, WorkTeam, WorkTeamMember, RecurringFrequency, RecurringConfig, OccurrenceNth, ProjectCharter, ProjectSubTask, SubTaskImportance, SubTaskProgress, MAX_ATTACHMENT_BYTES, MAX_ATTACHMENT_LABEL } from '../types';
import { COLOR_PALETTES } from '../utils/theme';
import { readFileAsDataUrl } from '../utils/storage';
import { isAllowedUploadFile, UPLOAD_TYPE_ERROR_MESSAGE, ALLOWED_UPLOAD_ACCEPT } from '../utils/uploadPolicy';
import { formatFileSize, toPersianDigits, computeAutoTaskStatus, formatToJalali } from '../utils/helpers';
import { JalaliDateTimePicker } from './JalaliDateTimePicker';
import { endOfTodayISO, getNowISO, iranDateTimeToISO, isoToIranDateTimeParts } from '../utils/jalali';
import { fetchUserTeamsPB, fetchUserTeamsAsyncPB, fetchAllUsersPB } from '../services/dataService';
import { generateRecurringOccurrences } from '../utils/recurring';
import {
  X,
  UploadCloud,
  FileText,
  Trash2,
  AlertCircle,
  Plus,
  Check,
  Paperclip,
  Users,
  User as UserIcon,
  Search,
  UserX,
  ChevronDown,
  Tag,
  Repeat,
  Clock,
  Calendar,
  FolderKanban,
  ListChecks,
  Pencil,
  Circle,
  PlayCircle,
  CheckCircle2,
  Briefcase,
  Lock,
} from 'lucide-react';
import { can, isTaskAdmin, PERMISSIONS } from '../utils/permissions';
import PeoplePicker from './PeoplePicker';
import { isResponsibleFor, responsibleIdsOf } from '../utils/taskPeople';
import { getAssignmentLimit, getAssignablePosts, AssignablePosts } from '../services/nexusApi';
import { appAlert } from '../utils/appDialog';

/** One person the responsible-people picker offers. */
interface PersonOption {
  id: string;
  name: string;
  username: string;
  avatar?: string;
  email?: string;
}

interface TaskFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (taskData: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>, taskId?: string) => void;
  taskToEdit?: Task | null;
  initialStatus?: TaskStatus;
  initialDueDate?: string;
  initialTitle?: string;
  initialDescription?: string;
  /** The description given in `initialDescription` cannot be edited (a task made from a message or comment). */
  lockInitialDescription?: boolean;
  /** Set when the task is made from a comment of this activity: offers the «sub-activity» type. */
  parentTask?: { id: string; title: string } | null;
  appColorPalette?: AppColorPalette;
  currentUser?: User | null;
  existingTasks?: Task[];
  registeredUsers?: User[];
}

export const TaskFormModal: React.FC<TaskFormModalProps> = ({
  isOpen,
  onClose,
  onSave,
  taskToEdit,
  initialStatus = 'todo',
  initialDueDate,
  initialTitle = '',
  initialDescription = '',
  lockInitialDescription = false,
  parentTask = null,
  appColorPalette = 'indigo',
  currentUser,
  existingTasks = [],
  registeredUsers = [],
}) => {
  const palette = COLOR_PALETTES[appColorPalette] || COLOR_PALETTES.indigo;
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  // What the user adds after a description that cannot be edited (a task made from a message or comment).
  const [descriptionExtra, setDescriptionExtra] = useState('');
  const [dueDateISO, setDueDateISO] = useState<string>(() => initialDueDate || endOfTodayISO());
  const [priority, setPriority] = useState<Priority>('medium');
  const [status, setStatus] = useState<TaskStatus>(initialStatus);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  // Everyone responsible for doing the task (one or more); the first is sent as assignedUserId too.
  const [responsibleIds, setResponsibleIds] = useState<string[]>([]);
  // Where tasks are given to posts: the posts to choose from (null: give tasks to people) and the
  // responsible posts chosen; responsibleIds then follows their holders.
  const [postMode, setPostMode] = useState<AssignablePosts | null>(null);
  const [responsiblePostIds, setResponsiblePostIds] = useState<string[]>([]);
  const [allowAssigneeStatusUpdate, setAllowAssigneeStatusUpdate] = useState<boolean>(true);
  // «امکان بروزرسانی»: whether those responsible may change the task's status (to people or to posts).
  // isStatusOnlyEdit is read when it is rendered, after it is defined below.
  const assigneeStatusToggle = () => (
    <div className="mt-2.5 flex items-center gap-2 px-3 py-2 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/60 transition-all animate-in fade-in">
      <input
        type="checkbox"
        id="allowAssigneeStatusUpdate"
        checked={allowAssigneeStatusUpdate}
        disabled={isStatusOnlyEdit}
        onChange={(e) => setAllowAssigneeStatusUpdate(e.target.checked)}
        className="w-4 h-4 text-indigo-600 rounded-md border-slate-300 dark:border-slate-600 focus:ring-indigo-500 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
      />
      <label
        htmlFor="allowAssigneeStatusUpdate"
        className="text-xs font-bold text-slate-800 dark:text-slate-100 cursor-pointer select-none flex items-center gap-1.5"
      >
        <span>امکان بروزرسانی</span>
        <span className="text-[10px] text-slate-500 dark:text-slate-400 font-normal">
          (اجازه بروزرسانی و تغییر وضعیت فعالیت توسط مسئولان)
        </span>
      </label>
    </div>
  );
  const [allRegisteredUsers, setAllRegisteredUsers] = useState<User[]>(registeredUsers);
  // Where the organization limits it: the people this user may not make responsible (above them).
  const [assignmentLimited, setAssignmentLimited] = useState(false);
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set());
  // Kept to one's own company: only its people may be chosen (null: anyone not blocked).
  const [allowedIds, setAllowedIds] = useState<Set<string> | null>(null);
  const [userSearchQuery, setUserSearchQuery] = useState<string>('');
  const [isAssigneeDropdownOpen, setIsAssigneeDropdownOpen] = useState<boolean>(false);
  const assigneeDropdownRef = useRef<HTMLDivElement>(null);
  // People from outside the chosen team who may also see the task (not responsible for it).
  const [accessSearchQuery, setAccessSearchQuery] = useState<string>('');
  const [isAccessDropdownOpen, setIsAccessDropdownOpen] = useState<boolean>(false);
  const accessDropdownRef = useRef<HTMLDivElement>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState<string>('');
  const [showTagDropdown, setShowTagDropdown] = useState(false);
  const [isProject, setIsProject] = useState<boolean>(false);
  const [isRecurring, setIsRecurring] = useState<boolean>(false);
  // A sub-activity has the project's form and is linked to the activity it was made from.
  const [isSub, setIsSub] = useState<boolean>(false);

  // Project inline options state
  const [projectCharterManager, setProjectCharterManager] = useState<string>('');
  const [projectCharterDesc, setProjectCharterDesc] = useState<string>('');
  const [projectCharterStartDate, setProjectCharterStartDate] = useState<string>(getNowISO());
  const [projectCharterEndDate, setProjectCharterEndDate] = useState<string>(getNowISO());
  const [projectSubTasks, setProjectSubTasks] = useState<ProjectSubTask[]>([]);
  const [newSubTaskTitle, setNewSubTaskTitle] = useState<string>('');
  const [newSubTaskImportance, setNewSubTaskImportance] = useState<SubTaskImportance>('medium');
  const [newSubTaskStartDate, setNewSubTaskStartDate] = useState<string>('');
  const [newSubTaskEndDate, setNewSubTaskEndDate] = useState<string>('');
  const [newSubTaskAssigneeIds, setNewSubTaskAssigneeIds] = useState<string[]>([]);
  const [editingSubTaskId, setEditingSubTaskId] = useState<string | null>(null);

  // Recurring options state
  const [recurringFrequency, setRecurringFrequency] = useState<RecurringFrequency>('daily');
  const [recurringIntervalWeeks, setRecurringIntervalWeeks] = useState<number>(1);
  const [recurringNthOccurrence, setRecurringNthOccurrence] = useState<OccurrenceNth>('first');
  const [recurringNthWeekday, setRecurringNthWeekday] = useState<number>(2); // 2 = دوشنبه
  const [recurringStartTime, setRecurringStartTime] = useState<string>('09:00');
  const [recurringEndTime, setRecurringEndTime] = useState<string>('10:00');
  const [recurringWeeklyDays, setRecurringWeeklyDays] = useState<number[]>([0]); // 0 = شنبه
  const [recurringMonthlyDays, setRecurringMonthlyDays] = useState<number[]>([1]); // 1
  const [recurringStartDate, setRecurringStartDate] = useState<string>(getNowISO());
  const [recurringEndDate, setRecurringEndDate] = useState<string>('');

  const [availableTeams, setAvailableTeams] = useState<WorkTeam[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [errors, setErrors] = useState<{ title?: string; assignee?: string }>({});

  const fileInputRef = useRef<HTMLInputElement>(null);
  const tagDropdownRef = useRef<HTMLDivElement>(null);

  // Collect previous unique tags used across tasks
  const userPreviousTags = React.useMemo(() => {
    if (!existingTasks || existingTasks.length === 0) return [];
    const tagSet = new Set<string>();
    existingTasks.forEach((t) => {
      if (t.tags && Array.isArray(t.tags)) {
        t.tags.forEach((tag) => {
          if (tag && tag.trim()) {
            tagSet.add(tag.trim());
          }
        });
      }
    });
    return Array.from(tagSet);
  }, [existingTasks]);

  const filteredPreviousTags = userPreviousTags.filter(
    (t) => !tags.includes(t) && t.toLowerCase().includes(tagInput.trim().toLowerCase())
  );

  const isAdmin = isTaskAdmin(currentUser);

  const isAssignee = !!(taskToEdit && currentUser && isResponsibleFor(taskToEdit, currentUser));

  const isTeamMember = !!(
    taskToEdit &&
    currentUser &&
    ((taskToEdit.teamMemberIds && taskToEdit.teamMemberIds.includes(currentUser.id)) ||
      (taskToEdit.assignedTeamId && currentUser.teams?.some((t) => t.id === taskToEdit.assignedTeamId)))
  );

  const isTaskCreator = !!(taskToEdit && currentUser && taskToEdit.user && taskToEdit.user === currentUser.id);

  const isOwnerByDetails = !!(
    taskToEdit &&
    currentUser &&
    taskToEdit.ownerName &&
    (taskToEdit.ownerName.trim().toLowerCase() === (currentUser.name || '').trim().toLowerCase() ||
      taskToEdit.ownerName.trim().toLowerCase() === (currentUser.username || '').trim().toLowerCase() ||
      taskToEdit.ownerName.trim().toLowerCase() === (currentUser.email || '').trim().toLowerCase()) &&
    !isAssignee &&
    !isTeamMember
  );

  const isTaskOwner = isAdmin || isTaskCreator || isOwnerByDetails;

  const canUploadFiles = can(currentUser, PERMISSIONS.tasksUploadFiles);
  const isStatusOnlyEdit = !!(
    taskToEdit &&
    !isTaskOwner &&
    isAssignee &&
    taskToEdit.allowAssigneeStatusUpdate !== false
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (tagDropdownRef.current && !tagDropdownRef.current.contains(event.target as Node)) {
        setShowTagDropdown(false);
      }
      if (assigneeDropdownRef.current && !assigneeDropdownRef.current.contains(event.target as Node)) {
        setIsAssigneeDropdownOpen(false);
      }
      if (accessDropdownRef.current && !accessDropdownRef.current.contains(event.target as Node)) {
        setIsAccessDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    let alive = true;
    getAssignmentLimit()
      .then((limit) => {
        if (!alive) return;
        setAssignmentLimited(!!limit?.limited);
        setBlockedIds(new Set(limit?.blockedUserIds || []));
        setAllowedIds(limit?.allowedUserIds ? new Set(limit.allowedUserIds) : null);
      })
      .catch(() => {});
    getAssignablePosts()
      .then((posts) => { if (alive) setPostMode(posts?.enabled ? posts : null); })
      .catch(() => {});
    return () => { alive = false; };
  }, [isOpen, currentUser?.id]);

  // Given to posts: the responsible people are the chosen posts' holders.
  useEffect(() => {
    if (!postMode) return;
    const holderOf = new Map<string, string | null>([
      ...(taskToEdit?.posts || []).map((p) => [p.postId, p.holderUserId] as [string, string | null]),
      ...postMode.posts.map((p) => [p.postId, p.holderUserId] as [string, string | null]),
    ]);
    setResponsibleIds(Array.from(new Set(responsiblePostIds.map((id) => holderOf.get(id)).filter((id): id is string => !!id))));
  }, [postMode, responsiblePostIds, taskToEdit]);

  // Fetch all registered users for quick search & assignment
  useEffect(() => {
    if (registeredUsers && registeredUsers.length > 0) {
      setAllRegisteredUsers(registeredUsers);
    }
    fetchAllUsersPB()
      .then((users) => {
        if (users && users.length > 0) {
          setAllRegisteredUsers(users);
        }
      })
      .catch(() => {});
  }, [registeredUsers, isOpen]);

  // The teams to choose from. Only the teams: the form's own selections are set once when it
  // opens (below) and never reset here - the signed-in user object is replaced whenever the
  // window regains focus, and that used to throw away what had been picked before saving.
  const currentUserId = currentUser?.id;
  useEffect(() => {
    if (!currentUserId) return;
    // First load synchronously from local cache
    setAvailableTeams(fetchUserTeamsPB(currentUserId));

    // Then refresh from the server
    fetchUserTeamsAsyncPB(currentUserId).then((liveTeams) => {
      if (liveTeams && liveTeams.length > 0) {
        setAvailableTeams(liveTeams);
      }
    }).catch(() => {});
  }, [currentUserId, isOpen]);

  useEffect(() => {
    if (taskToEdit) {
      setTitle(taskToEdit.title);
      setDescription(taskToEdit.description || '');
      setDueDateISO(taskToEdit.dueDate || getNowISO());
      setPriority(taskToEdit.priority || 'medium');
      setStatus(taskToEdit.status || 'todo');
      setAttachments(taskToEdit.attachments || []);
      setSelectedTeamId(taskToEdit.assignedTeamId || '');
      // The access list as saved, without the responsible people (they have access anyway): so
      // taking someone off the responsible list does not silently leave them with access.
      const responsible = responsibleIdsOf(taskToEdit);
      setResponsibleIds(responsible);
      setResponsiblePostIds(taskToEdit.responsiblePostIds || []);
      setSelectedMemberIds((taskToEdit.teamMemberIds || []).filter((id) => !responsible.includes(id)));
      setAllowAssigneeStatusUpdate(taskToEdit.allowAssigneeStatusUpdate !== false);
      setTags(taskToEdit.tags || []);
      setTagInput('');
      const projectFlag = !!taskToEdit.isProject;
      const recurringFlag = !projectFlag && !!taskToEdit.isRecurring;
      setIsProject(projectFlag);
      setIsRecurring(recurringFlag);
      const pc = taskToEdit.projectCharter || {};
      setProjectCharterManager(
        pc.projectManager || taskToEdit.assignedUserName || taskToEdit.ownerName || (currentUser ? currentUser.name || currentUser.username : '')
      );
      setProjectCharterDesc(pc.description || '');
      setProjectCharterStartDate(pc.startDate || taskToEdit.createdAt || getNowISO());
      setProjectCharterEndDate(pc.endDate || taskToEdit.dueDate || getNowISO());
      setProjectSubTasks(taskToEdit.projectSubTasks || []);
      setNewSubTaskTitle('');
      setNewSubTaskImportance('medium');
      setNewSubTaskStartDate('');
      setNewSubTaskEndDate('');
      setNewSubTaskAssigneeIds([]);
      if (taskToEdit.recurringConfig) {
        setRecurringFrequency(taskToEdit.recurringConfig.frequency || 'daily');
        setRecurringIntervalWeeks(taskToEdit.recurringConfig.intervalWeeks || 1);
        setRecurringNthOccurrence(taskToEdit.recurringConfig.nthOccurrence || 'first');
        setRecurringNthWeekday(taskToEdit.recurringConfig.nthWeekday ?? 2);
        setRecurringStartTime(
          taskToEdit.recurringConfig.startTime ||
            taskToEdit.recurringConfig.dailyTime ||
            taskToEdit.recurringConfig.time ||
            '09:00'
        );
        setRecurringEndTime(taskToEdit.recurringConfig.endTime || '10:00');
        setRecurringWeeklyDays(taskToEdit.recurringConfig.weeklyDays || [0]);
        setRecurringMonthlyDays(taskToEdit.recurringConfig.monthlyDays || [1]);
        setRecurringStartDate(taskToEdit.recurringConfig.startDate || taskToEdit.dueDate || getNowISO());
        setRecurringEndDate(taskToEdit.recurringConfig.endDate || '');
      } else {
        setRecurringFrequency('daily');
        setRecurringIntervalWeeks(1);
        setRecurringNthOccurrence('first');
        setRecurringNthWeekday(2);
        setRecurringStartTime('09:00');
        setRecurringEndTime('10:00');
        setRecurringWeeklyDays([0]);
        setRecurringMonthlyDays([1]);
        setRecurringStartDate(taskToEdit.dueDate || getNowISO());
        setRecurringEndDate('');
      }
    } else {
      setTitle(initialTitle || '');
      setDescription(initialDescription || '');
      setDescriptionExtra('');
      const defaultDateTime = initialDueDate || getNowISO();
      // A new task is due by the end of today, not this very minute (it would be overdue at once).
      setDueDateISO(initialDueDate || endOfTodayISO());
      setPriority('medium');
      setStatus(initialStatus);
      setAttachments([]);
      setResponsibleIds([]);
      setTags([]);
      setTagInput('');
      setIsProject(false);
      setProjectCharterManager(currentUser ? currentUser.name || currentUser.username : '');
      setProjectCharterDesc('');
      setProjectCharterStartDate(defaultDateTime);
      setProjectCharterEndDate(defaultDateTime);
      setProjectSubTasks([]);
      setNewSubTaskTitle('');
      setNewSubTaskImportance('medium');
      setNewSubTaskStartDate('');
      setNewSubTaskEndDate('');
      setNewSubTaskAssigneeIds([]);
      setIsRecurring(false);
      setRecurringFrequency('daily');
      setRecurringIntervalWeeks(1);
      setRecurringNthOccurrence('first');
      setRecurringNthWeekday(2);
      setRecurringStartTime('09:00');
      setRecurringEndTime('10:00');
      setRecurringWeeklyDays([0]);
      setRecurringMonthlyDays([1]);
      setRecurringStartDate(defaultDateTime);
      setRecurringEndDate('');
      setSelectedTeamId('');
      setSelectedMemberIds(currentUser ? [currentUser.id] : []);
    }
    setErrors({});
  }, [taskToEdit, initialStatus, initialDueDate, isOpen]);

  // Auto update status if project or recurring or has subtasks
  const isAutoStatusTask = isProject || isRecurring || projectSubTasks.length > 0;
  // A recurring task is scheduled by its own recurrence settings and a project by its charter's
  // dates (its end date is its deadline); neither asks for the plain due date.
  const hideDueDate = isProject || isRecurring;
  // A task made from a message or comment keeps that text as its description: the title can be
  // changed, the text cannot, but more can be written after it.
  const lockedDescription = !taskToEdit && lockInitialDescription ? (initialDescription || '').trim() : '';
  // A task made from a message or comment keeps that text as its title.
  const titleLocked = !taskToEdit && (!!initialTitle?.trim() || (isSub && !!parentTask));

  useEffect(() => {
    if (isAutoStatusTask) {
      setStatus(computeAutoTaskStatus(projectSubTasks));
    }
  }, [isProject, isRecurring, projectSubTasks]);

  if (!isOpen) return null;

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsUploading(true);

    try {
      const newAttachments: Attachment[] = [];
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
        // The server refuses empty files, which would fail the whole save later on.
        if (file.size === 0) {
          void appAlert(`فایل «${file.name}» خالی است و قابل پیوست نیست.`);
          continue;
        }
        // Choosing the same file again would upload and store it twice.
        const isDuplicate = [...attachments, ...newAttachments].some(
          (att) => att.name === file.name && att.size === file.size
        );
        if (isDuplicate) {
          void appAlert(`فایل «${file.name}» قبلاً به این فعالیت پیوست شده است.`);
          continue;
        }
        // Read file content as base64
        const dataUrl = await readFileAsDataUrl(file);
        newAttachments.push({
          id: `att-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          name: file.name,
          size: file.size,
          type: file.type || 'application/octet-stream',
          dataUrl,
          createdAt: new Date().toISOString(),
        });
      }
      setAttachments((prev) => [...prev, ...newAttachments]);
    } catch (err) {
      console.error('Failed to attach file:', err);
      void appAlert('خطا در بارگذاری فایل. لطفاً دوباره تلاش کنید.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemoveAttachment = (attachmentId: string) => {
    setAttachments((prev) => prev.filter((att) => att.id !== attachmentId));
  };

  const handleAddTag = () => {
    const trimmed = tagInput.trim().replace(/^#/, '');
    if (trimmed && !tags.includes(trimmed)) {
      setTags((prev) => [...prev, trimmed]);
    }
    setTagInput('');
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags((prev) => prev.filter((t) => t !== tagToRemove));
  };

  const handleAddProjectSubTask = () => {
    if (!newSubTaskTitle.trim() || newSubTaskAssigneeIds.length === 0) return;
    const newSub: ProjectSubTask = {
      id: `sub-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      title: newSubTaskTitle.trim(),
      startDate: newSubTaskStartDate || projectCharterStartDate || dueDateISO || getNowISO(),
      endDate: newSubTaskEndDate || projectCharterEndDate || dueDateISO || getNowISO(),
      importance: newSubTaskImportance,
      completed: false,
      createdAt: getNowISO(),
      assignees: allRegisteredUsers
        .filter((u) => newSubTaskAssigneeIds.includes(u.id))
        .map((u) => ({ id: u.id, name: u.name || u.username })),
    };
    setProjectSubTasks((prev) => [...prev, newSub]);
    setNewSubTaskTitle('');
    setNewSubTaskStartDate('');
    setNewSubTaskEndDate('');
    setNewSubTaskAssigneeIds([]);
  };

  const handleRemoveProjectSubTask = (subId: string) => {
    setProjectSubTasks((prev) => prev.filter((s) => s.id !== subId));
  };

  const handleToggleModalSubTask = (subId: string) => {
    const nowIso = new Date().toISOString();
    setProjectSubTasks((prev) =>
      prev.map((s) => {
        if (s.id !== subId) return s;
        const current = s.status || (s.completed ? 'completed' : 'not_started');
        const next: SubTaskProgress =
          current === 'not_started' ? 'in_progress' : current === 'in_progress' ? 'completed' : 'not_started';
        return {
          ...s,
          status: next,
          completed: next === 'completed',
          actualStartDate: next === 'not_started' ? s.actualStartDate : s.actualStartDate || nowIso,
          actualCompletedDate: next === 'completed' ? s.actualCompletedDate || nowIso : s.actualCompletedDate,
        };
      })
    );
  };

  const handleUpdateProjectSubTask = (subId: string, patch: Partial<ProjectSubTask>) => {
    setProjectSubTasks((prev) => prev.map((s) => (s.id === subId ? { ...s, ...patch } : s)));
  };

  const handleToggleProjectSubTaskAssignee = (subId: string, userId: string) => {
    setProjectSubTasks((prev) =>
      prev.map((s) => {
        if (s.id !== subId) return s;
        const current = s.assignees || [];
        const exists = current.some((a) => a.id === userId);
        const user = allRegisteredUsers.find((u) => u.id === userId);
        if (!user) return s;
        return {
          ...s,
          assignees: exists ? current.filter((a) => a.id !== userId) : [...current, { id: user.id, name: user.name || user.username }],
        };
      })
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setErrors({ title: isProject ? 'عنوان پروژه الزامی است' : 'عنوان فعالیت الزامی است' });
      return;
    }
    // Every new task needs someone responsible for doing it (the server enforces this too).
    if (!taskToEdit && (postMode ? responsiblePostIds.length === 0 : responsibleIds.length === 0)) {
      setErrors({ assignee: 'لطفاً مسئول اجرای فعالیت را انتخاب کنید.' });
      assigneeDropdownRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }
    // Every subtask needs at least one responsible person (the server enforces this too).
    if (isProject && projectSubTasks.some((s) => !s.assignees || s.assignees.length === 0)) {
      setErrors({ assignee: 'لطفاً برای هر زیرفعالیت حداقل یک مسئول انتخاب کنید.' });
      return;
    }

    const selectedTeam = availableTeams.find((t) => t.id === selectedTeamId);
    let finalTeamMemberIds: string[] = [];
    if (selectedMemberIds.length > 0) {
      finalTeamMemberIds = [...selectedMemberIds];
    } else if (currentUser && !selectedTeamId && !postMode) {
      finalTeamMemberIds = [currentUser.id];
    }
    // Given to posts: access goes to people's posts, so only people who hold one are given it.
    if (postMode) {
      const holders = new Set(postMode.posts.map((p) => p.holderUserId).filter(Boolean));
      finalTeamMemberIds = finalTeamMemberIds.filter((id) => holders.has(id));
    }

    // Names of the responsible people, for display until the server's copy arrives. They are not
    // added to the access list: responsible people have access anyway, and the server keeps it.
    const allMembers = availableTeams.flatMap((t) => t.members);
    const personOf = (id: string): { name?: string; avatar?: string } => {
      const regUser = allRegisteredUsers.find((u) => u.id === id);
      if (regUser) return { name: regUser.name || regUser.username, avatar: regUser.avatar };
      const member = allMembers.find((m) => m.userId === id);
      if (member) return { name: member.name, avatar: member.avatar };
      if (currentUser && currentUser.id === id) return { name: currentUser.name || currentUser.username, avatar: currentUser.avatar };
      const known = (taskToEdit?.responsibleUserIds || []).indexOf(id);
      return { name: known >= 0 ? taskToEdit?.responsibleUserNames?.[known] : undefined };
    };
    const responsibleNames = responsibleIds.map((id) => personOf(id).name || 'کاربر');
    const assignedName = responsibleIds.length > 0 ? responsibleNames[0] : undefined;
    const assignedAvatar = responsibleIds.length > 0 ? personOf(responsibleIds[0]).avatar : undefined;

    const finalIsProject = isProject;
    const finalIsRecurring = !isProject && isRecurring;

    const recurringConfig: RecurringConfig | undefined = finalIsRecurring
      ? {
          frequency: recurringFrequency,
          intervalWeeks: recurringFrequency === 'weekly' ? recurringIntervalWeeks : undefined,
          startTime: recurringStartTime,
          endTime: recurringEndTime,
          dailyTime: recurringStartTime,
          time: recurringStartTime,
          weeklyDays: recurringFrequency === 'weekly' ? recurringWeeklyDays : undefined,
          monthlyDays: (recurringFrequency === 'monthly' || recurringFrequency === 'monthly_day') ? recurringMonthlyDays : undefined,
          nthOccurrence: recurringFrequency === 'monthly_nth_weekday' ? recurringNthOccurrence : undefined,
          nthWeekday: recurringFrequency === 'monthly_nth_weekday' ? recurringNthWeekday : undefined,
          startDate: recurringStartDate || dueDateISO || getNowISO(),
          endDate: recurringEndDate || undefined,
        }
      : undefined;

    const projectCharter: ProjectCharter | undefined = finalIsProject
      ? {
          description: projectCharterDesc.trim(),
          projectManager: projectCharterManager.trim(),
          startDate: projectCharterStartDate || dueDateISO || getNowISO(),
          endDate: projectCharterEndDate || dueDateISO || getNowISO(),
        }
      : undefined;

    let finalSubTasks = finalIsProject ? projectSubTasks : (taskToEdit?.projectSubTasks || []);
    if (finalIsRecurring && recurringConfig) {
      finalSubTasks = generateRecurringOccurrences(recurringConfig, finalSubTasks);
    }

    // A recurring task's date is its schedule's first occurrence (start date at the start time),
    // not the hidden due-date field.
    const recurrenceStartDay = isoToIranDateTimeParts(recurringStartDate || dueDateISO || getNowISO())?.date;
    const finalDueDate = finalIsRecurring
      ? iranDateTimeToISO(recurrenceStartDay, recurringStartTime) || recurringStartDate || dueDateISO || getNowISO()
      : finalIsProject
        ? projectCharterEndDate || dueDateISO || getNowISO()
        : dueDateISO || getNowISO();

    const finalStatus = (finalIsProject || finalIsRecurring || (finalSubTasks && finalSubTasks.length > 0))
      ? computeAutoTaskStatus(finalSubTasks)
      : status;

    onSave(
      {
        title: title.trim(),
        description: lockedDescription
          ? [lockedDescription, descriptionExtra.trim()].filter(Boolean).join('\n\n')
          : description.trim(),
        dueDate: finalDueDate,
        priority,
        status: finalStatus,
        attachments,
        tags,
        user: taskToEdit?.user || (currentUser ? currentUser.id : undefined),
        ownerName: taskToEdit?.ownerName || (currentUser ? currentUser.name || currentUser.username : undefined),
        ownerAvatar: taskToEdit?.ownerAvatar || (currentUser ? currentUser.avatar : undefined),
        assignedUserId: responsibleIds[0] || undefined,
        responsibleUserIds: responsibleIds,
        responsiblePostIds: postMode ? responsiblePostIds : undefined,
        responsibleUserNames: responsibleNames,
        assignedUserName: assignedName,
        assignedUserAvatar: assignedAvatar,
        assignedTeamId: selectedTeam ? selectedTeam.id : undefined,
        assignedTeamName: selectedTeam ? selectedTeam.name : undefined,
        teamMemberIds: finalTeamMemberIds,
        allowAssigneeStatusUpdate: responsibleIds.length > 0 ? allowAssigneeStatusUpdate : true,
        isProject: finalIsProject,
        parentTaskId: isSub && parentTask ? parentTask.id : taskToEdit?.parentTaskId,
        isRecurring: finalIsRecurring,
        recurringConfig,
        projectCharter,
        projectSubTasks: finalSubTasks,
        comments: taskToEdit?.comments || [],
      },
      taskToEdit ? taskToEdit.id : undefined
    );

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/55 backdrop-blur-md flex items-center justify-center p-3 sm:p-5">
      <div className="relative w-full max-w-2xl bg-white/95 dark:bg-slate-900/95 rounded-[28px] shadow-[0_28px_90px_-30px_rgba(15,23,42,0.75)] border border-white/80 dark:border-slate-700/80 ring-1 ring-indigo-100/70 dark:ring-indigo-500/15 overflow-hidden animate-in fade-in zoom-in-95 my-auto text-slate-800 dark:text-slate-100 max-h-[90vh] flex flex-col">
        
        <form onSubmit={handleSubmit} className="app-form flex flex-col h-full max-h-[90vh] overflow-hidden">
          {/* Header */}
          <div className="relative flex items-center justify-between px-5 sm:px-6 py-4.5 bg-gradient-to-l from-indigo-100/90 via-white to-violet-100/80 dark:from-indigo-950/70 dark:via-slate-900 dark:to-violet-950/50 border-b border-indigo-200/70 dark:border-indigo-900/60 shrink-0 overflow-hidden">
            <div className="absolute top-0 right-0 left-0 h-1 bg-gradient-to-l from-violet-500 via-indigo-500 to-sky-400" />
            <div className="absolute -top-14 -left-8 w-32 h-32 rounded-full bg-violet-400/20 blur-3xl pointer-events-none" />
            <div className="relative flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-500 via-indigo-600 to-violet-600 text-white flex items-center justify-center shadow-xl shadow-indigo-500/30 shrink-0 ring-4 ring-white/80 dark:ring-slate-800 rotate-[-4deg]">
                <Paperclip className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-black tracking-tight text-slate-900 dark:text-white">
                  {taskToEdit ? (isProject ? 'ویرایش پروژه' : 'ویرایش فعالیت') : isProject ? 'ثبت پروژه جدید' : 'ثبت فعالیت جدید'}
                </h2>
                <p className="text-xs text-indigo-700/70 dark:text-indigo-200/70 hidden sm:block">
                  {isProject ? 'مشخصات پروژه، زمان‌بندی، اولویت و فایل‌های ضمیمه را وارد کنید' : 'مشخصات فعالیت، موعد انجام، اولویت و فایل‌های ضمیمه را وارد کنید'}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="relative p-2 text-indigo-400 dark:text-indigo-300 hover:text-indigo-700 dark:hover:text-white bg-white/50 dark:bg-slate-800/50 hover:bg-white dark:hover:bg-slate-700 rounded-xl border border-indigo-100/80 dark:border-slate-600 shadow-sm transition-all hover:rotate-90 cursor-pointer"
              title="بستن"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Form Body */}
          <div className="p-5 sm:p-6 space-y-5 overflow-y-auto grow bg-gradient-to-b from-white to-slate-50/70 dark:from-slate-900 dark:to-slate-950/30">

          {/* Notice Banner for Assignees who can only update status */}
          {isStatusOnlyEdit && (
            <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-xs font-bold flex items-center gap-2.5 animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <span>شما به‌عنوان مسئول این فعالیت، مجاز به تغییر وضعیت فعالیت می‌باشید. سایر فیلدها قفل شده‌اند.</span>
            </div>
          )}

          {/* Activity type: each choice shows only its own form below. */}
          <div role="radiogroup" aria-label="نوع فعالیت" className={`grid grid-cols-1 gap-2 ${parentTask && !taskToEdit ? 'sm:grid-cols-2' : 'sm:grid-cols-3'}`}>
            {([
              { id: 'simple', label: 'فعالیت ساده', accent: 'accent-indigo-600', hover: 'hover:border-indigo-300' },
              { id: 'project', label: 'پروژه', accent: 'accent-emerald-600', hover: 'hover:border-emerald-300' },
              { id: 'recurring', label: 'فعالیت تکرارشونده', accent: 'accent-purple-600', hover: 'hover:border-purple-300' },
              ...(parentTask && !taskToEdit ? [{ id: 'sub', label: 'زیرمجموعه‌ی این فعالیت', accent: 'accent-amber-600', hover: 'hover:border-amber-300' }] : []),
            ] as const).map((opt) => {
              const current = isSub ? 'sub' : isProject ? 'project' : isRecurring ? 'recurring' : 'simple';
              return (
                <label
                  key={opt.id}
                  className={`flex items-center gap-2.5 p-2.5 rounded-xl bg-white dark:bg-slate-900 border transition-colors cursor-pointer text-xs font-bold text-slate-800 dark:text-slate-200 ${opt.hover} ${
                    current === opt.id ? 'border-indigo-400 ring-1 ring-indigo-300' : 'border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="task-kind"
                    checked={current === opt.id}
                    onChange={() => {
                      setIsSub(opt.id === 'sub');
                      setIsProject(opt.id === 'project' || opt.id === 'sub');
                      setIsRecurring(opt.id === 'recurring');
                    }}
                    className={`w-4 h-4 cursor-pointer ${opt.accent}`}
                  />
                  <span>{opt.label}</span>
                </label>
              );
            })}
          </div>
          {isSub && parentTask && (
            <div className="text-[11px] font-bold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl px-3 py-2">
              این فعالیت (با فرم پروژه) به‌عنوان زیرمجموعه‌ی «{parentTask.title}» ثبت می‌شود و کنار آن نمایش داده می‌شود.
            </div>
          )}

          {/* Project or recurring first: either one decides the dates (and hides the plain due date). */}
          <div className={`p-3.5 bg-slate-50/80 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700/80 space-y-2 ${hideDueDate ? '' : 'hidden'}`}>
            {/* Project Options Inline Panel */}
            {isProject && (
              <div className="mt-3 p-3.5 bg-emerald-50/70 dark:bg-emerald-950/40 rounded-2xl border border-emerald-200 dark:border-emerald-800/70 space-y-4 animate-in fade-in zoom-in-98">
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-900 dark:text-emerald-200 border-b border-emerald-200/60 dark:border-emerald-800/60 pb-2">
                  <FolderKanban className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>تنظیمات و جزئیات منشور و زیرفعالیت‌های پروژه</span>
                </div>

                {/* 1) Project Charter Fields */}
                <div className="space-y-3">
                  <h5 className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>منشور پروژه:</span>
                  </h5>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                      نام مدیر / مسئول پروژه:
                    </label>
                    <input
                      type="text"
                      value={projectCharterManager}
                      onChange={(e) => setProjectCharterManager(e.target.value)}
                      placeholder="نام مدیر پروژه..."
                      className="w-full px-3 py-1.5 bg-white dark:bg-slate-900 text-xs font-bold border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-emerald-500 text-slate-800 dark:text-slate-100"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                      اهداف و شرح منشور پروژه:
                    </label>
                    <textarea
                      rows={2}
                      value={projectCharterDesc}
                      onChange={(e) => setProjectCharterDesc(e.target.value)}
                      placeholder="توضیحات، خروجی‌ها و اهداف کلیدی پروژه..."
                      className="w-full px-3 py-1.5 bg-white dark:bg-slate-900 text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-emerald-500 text-slate-800 dark:text-slate-100 resize-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                        تاریخ شروع پروژه:
                      </label>
                      <JalaliDateTimePicker
                        valueISO={projectCharterStartDate}
                        onChangeISO={(iso) => setProjectCharterStartDate(iso)}
                        label=""
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                        تاریخ پایان پروژه (موعد پروژه): <span className="text-rose-500">*</span>
                      </label>
                      <JalaliDateTimePicker
                        valueISO={projectCharterEndDate}
                        onChangeISO={(iso) => setProjectCharterEndDate(iso)}
                        label=""
                      />
                    </div>
                  </div>
                </div>

                {/* 2) Subtasks / Milestones */}
                <div className="pt-3 border-t border-emerald-200/60 dark:border-emerald-800/60 space-y-2.5">
                  <h5 className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <ListChecks className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>زیرفعالیت‌ها / مایلستون‌های پروژه ({toPersianDigits(projectSubTasks.length)} مورد):</span>
                  </h5>

                  {/* Add Subtask Form Inline */}
                  <div className="p-2.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                    <input
                      type="text"
                      value={newSubTaskTitle}
                      onChange={(e) => setNewSubTaskTitle(e.target.value)}
                      placeholder="عنوان زیرفعالیت جدید..."
                      className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 text-xs font-bold border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100"
                    />

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1">تاریخ انجام کار</label>
                        <JalaliDateTimePicker valueISO={newSubTaskStartDate} onChangeISO={(iso) => setNewSubTaskStartDate(iso)} label="" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1">تاریخ اختتامیه</label>
                        <JalaliDateTimePicker valueISO={newSubTaskEndDate} onChangeISO={(iso) => setNewSubTaskEndDate(iso)} label="" />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                        مسئولین زیرفعالیت: <span className="text-rose-500">*</span>
                      </label>
                      <PeoplePicker
                        people={allRegisteredUsers.filter((u) => !allowedIds || allowedIds.has(u.id) || newSubTaskAssigneeIds.includes(u.id))}
                        selectedIds={newSubTaskAssigneeIds}
                        onToggle={(id) => setNewSubTaskAssigneeIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))}
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <select
                        value={newSubTaskImportance}
                        onChange={(e) => setNewSubTaskImportance(e.target.value as SubTaskImportance)}
                        className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 text-xs font-bold border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100 cursor-pointer"
                      >
                        <option value="low">اهمیت: کم (وزن ۱)</option>
                        <option value="medium">اهمیت: متوسط (وزن ۲)</option>
                        <option value="high">اهمیت: زیاد (وزن ۳)</option>
                      </select>

                      <button
                        type="button"
                        onClick={handleAddProjectSubTask}
                        disabled={!newSubTaskTitle.trim() || newSubTaskAssigneeIds.length === 0}
                        className="flex-1 py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>افزودن زیرفعالیت</span>
                      </button>
                    </div>
                  </div>

                  {/* Subtasks List */}
                  {projectSubTasks.length > 0 && (
                    <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                      {projectSubTasks.map((st) => {
                        const progress = st.status || (st.completed ? 'completed' : 'not_started');
                        return (
                        <div
                          key={st.id}
                          className="p-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 text-xs space-y-1.5"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 min-w-0 flex-1 pr-1">
                              <button
                                type="button"
                                onClick={() => handleToggleModalSubTask(st.id)}
                                title={progress === 'completed' ? 'انجام شده - کلیک برای بازگشت به شروع نشده' : progress === 'in_progress' ? 'درحال انجام - کلیک برای علامت زدن به انجام شده' : 'شروع نشده - کلیک برای شروع'}
                                className="shrink-0"
                              >
                                {progress === 'completed' ? (
                                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                ) : progress === 'in_progress' ? (
                                  <PlayCircle className="w-4 h-4 text-amber-500" />
                                ) : (
                                  <Circle className="w-4 h-4 text-slate-300 dark:text-slate-600" />
                                )}
                              </button>
                              <span className={`font-semibold truncate ${progress === 'completed' ? 'line-through text-slate-400' : 'text-slate-800 dark:text-slate-200'}`}>
                                {st.title}
                              </span>
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                st.importance === 'high' ? 'bg-rose-100 text-rose-800' : st.importance === 'medium' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                              }`}>
                                {st.importance === 'high' ? 'وزن ۳' : st.importance === 'medium' ? 'وزن ۲' : 'وزن ۱'}
                              </span>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => setEditingSubTaskId(editingSubTaskId === st.id ? null : st.id)}
                                className="p-1 text-slate-400 hover:text-emerald-600 transition-colors cursor-pointer"
                                title="ویرایش تاریخ و مسئولین"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemoveProjectSubTask(st.id)}
                                className="p-1 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                                title="حذف زیرفعالیت"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          <div className="text-[10px] text-slate-500 dark:text-slate-400 pr-6">
                            مسئولین: {(st.assignees && st.assignees.length > 0) ? st.assignees.map((a) => a.name).join('، ') : 'تعیین نشده'}
                          </div>

                          {progress === 'in_progress' && st.actualStartDate && (
                            <div className="text-[10px] text-amber-600 dark:text-amber-400 pr-6">
                              شروع: {formatToJalali(st.actualStartDate)}
                            </div>
                          )}
                          {progress === 'completed' && (st.actualStartDate || st.actualCompletedDate) && (
                            <div className="text-[10px] text-slate-500 dark:text-slate-400 pr-6">
                              {st.actualStartDate && <>شروع: {formatToJalali(st.actualStartDate)}</>}
                              {st.actualStartDate && st.actualCompletedDate && ' · '}
                              {st.actualCompletedDate && <>پایان: {formatToJalali(st.actualCompletedDate)}</>}
                            </div>
                          )}

                          {editingSubTaskId === st.id && (
                            <div className="pr-6 pt-1 space-y-2 border-t border-slate-100 dark:border-slate-800">
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1">تاریخ انجام کار</label>
                                  <JalaliDateTimePicker
                                    valueISO={st.startDate || ''}
                                    onChangeISO={(iso) => handleUpdateProjectSubTask(st.id, { startDate: iso })}
                                    label=""
                                  />
                                </div>
                                <div>
                                  <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1">تاریخ اختتامیه</label>
                                  <JalaliDateTimePicker
                                    valueISO={st.endDate || ''}
                                    onChangeISO={(iso) => handleUpdateProjectSubTask(st.id, { endDate: iso })}
                                    label=""
                                  />
                                </div>
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1">مسئولین زیرفعالیت</label>
                                <PeoplePicker
                                  people={allRegisteredUsers.filter((u) => !allowedIds || allowedIds.has(u.id) || (st.assignees || []).some((a) => a.id === u.id))}
                                  selectedIds={(st.assignees || []).map((a) => a.id)}
                                  onToggle={(id) => handleToggleProjectSubTaskAssignee(st.id, id)}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      );})}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Recurring Options Panel */}
            {isRecurring && (
              <div className="mt-3 p-3.5 bg-purple-50/70 dark:bg-purple-950/40 rounded-2xl border border-purple-200 dark:border-purple-800/70 space-y-3 animate-in fade-in zoom-in-98">
                <div className="flex items-center gap-2 text-xs font-bold text-purple-900 dark:text-purple-200">
                  <Repeat className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  <span>تنظیمات دوره تکرار فعالیت</span>
                </div>

                {/* Frequency selection tabs */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                    نوع و الگوی تکرار:
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <button
                      type="button"
                      onClick={() => setRecurringFrequency('daily')}
                      className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl border text-xs font-bold cursor-pointer transition-all ${
                        recurringFrequency === 'daily'
                          ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                          : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-purple-300'
                      }`}
                    >
                      <Clock className="w-3.5 h-3.5" />
                      <span>روزانه</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setRecurringFrequency('weekly')}
                      className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl border text-xs font-bold cursor-pointer transition-all ${
                        recurringFrequency === 'weekly'
                          ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                          : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-purple-300'
                      }`}
                    >
                      <Calendar className="w-3.5 h-3.5" />
                      <span>هفتگی</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setRecurringFrequency('monthly_day')}
                      className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl border text-xs font-bold cursor-pointer transition-all ${
                        recurringFrequency === 'monthly_day' || recurringFrequency === 'monthly'
                          ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                          : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-purple-300'
                      }`}
                    >
                      <Repeat className="w-3.5 h-3.5" />
                      <span>روز ماه</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setRecurringFrequency('monthly_nth_weekday')}
                      className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl border text-xs font-bold cursor-pointer transition-all ${
                        recurringFrequency === 'monthly_nth_weekday'
                          ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                          : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-purple-300'
                      }`}
                    >
                      <Repeat className="w-3.5 h-3.5" />
                      <span>پیشرفته ماه</span>
                    </button>
                  </div>
                </div>

                {/* Sub-options for Weekly */}
                {recurringFrequency === 'weekly' && (
                  <div className="pt-2 border-t border-purple-200/60 dark:border-purple-900/60 space-y-3">
                    {/* Interval selector */}
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                        فاصله زمانی هفته‌ها:
                      </label>
                      <div className="grid grid-cols-4 gap-1.5">
                        {[
                          { val: 1, label: 'هر هفته' },
                          { val: 2, label: '۲ هفته یکبار' },
                          { val: 3, label: '۳ هفته یکبار' },
                          { val: 4, label: '۴ هفته یکبار' },
                        ].map((item) => (
                          <button
                            key={item.val}
                            type="button"
                            onClick={() => setRecurringIntervalWeeks(item.val)}
                            className={`py-1.5 px-2 text-center rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                              recurringIntervalWeeks === item.val
                                ? 'bg-purple-600 text-white border-purple-600'
                                : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                            }`}
                          >
                            {item.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Weekdays */}
                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                        <span>روزهای هفته (از شنبه تا جمعه):</span>
                      </label>
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          { id: 0, name: 'شنبه' },
                          { id: 1, name: 'یکشنبه' },
                          { id: 2, name: 'دوشنبه' },
                          { id: 3, name: 'سه‌شنبه' },
                          { id: 4, name: 'چهارشنبه' },
                          { id: 5, name: 'پنج‌شنبه' },
                          { id: 6, name: 'جمعه' },
                        ].map((day) => {
                          const isSelected = recurringWeeklyDays.includes(day.id);
                          return (
                            <button
                              key={day.id}
                              type="button"
                              onClick={() => {
                                if (isSelected) {
                                  if (recurringWeeklyDays.length > 1) {
                                    setRecurringWeeklyDays(recurringWeeklyDays.filter((d) => d !== day.id));
                                  }
                                } else {
                                  setRecurringWeeklyDays([...recurringWeeklyDays, day.id].sort((a, b) => a - b));
                                }
                              }}
                              className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                                isSelected
                                  ? 'bg-purple-600 text-white border-purple-600 shadow-2xs'
                                  : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-purple-300'
                              }`}
                            >
                              {day.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* Sub-options for Monthly Day (1..31) */}
                {(recurringFrequency === 'monthly_day' || recurringFrequency === 'monthly') && (
                  <div className="pt-2 border-t border-purple-200/60 dark:border-purple-900/60 space-y-1.5">
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <Repeat className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                      <span>روزهای ماه (انتخاب از ۱ تا ۳۱):</span>
                    </label>
                    <div className="grid grid-cols-7 sm:grid-cols-10 gap-1">
                      {Array.from({ length: 31 }, (_, i) => i + 1).map((dayNum) => {
                        const isSelected = recurringMonthlyDays.includes(dayNum);
                        return (
                          <button
                            key={dayNum}
                            type="button"
                            onClick={() => {
                              if (isSelected) {
                                if (recurringMonthlyDays.length > 1) {
                                  setRecurringMonthlyDays(recurringMonthlyDays.filter((d) => d !== dayNum));
                                }
                              } else {
                                setRecurringMonthlyDays([...recurringMonthlyDays, dayNum].sort((a, b) => a - b));
                              }
                            }}
                            className={`py-1 text-center rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                              isSelected
                                ? 'bg-purple-600 text-white border-purple-600 shadow-2xs'
                                : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-purple-300'
                            }`}
                          >
                            {toPersianDigits(dayNum)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Sub-options for Monthly Nth Weekday (e.g. اولین/آخرین دوشنبه هر ماه) */}
                {recurringFrequency === 'monthly_nth_weekday' && (
                  <div className="pt-2 border-t border-purple-200/60 dark:border-purple-900/60 space-y-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                        مرتبه وقوع در ماه:
                      </label>
                      <div className="grid grid-cols-5 gap-1">
                        {[
                          { key: 'first', label: 'اولین' },
                          { key: 'second', label: 'دومین' },
                          { key: 'third', label: 'سومین' },
                          { key: 'fourth', label: 'چهارمین' },
                          { key: 'last', label: 'آخرین' },
                        ].map((nth) => (
                          <button
                            key={nth.key}
                            type="button"
                            onClick={() => setRecurringNthOccurrence(nth.key as OccurrenceNth)}
                            className={`py-1.5 text-center rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                              recurringNthOccurrence === nth.key
                                ? 'bg-purple-600 text-white border-purple-600 shadow-2xs'
                                : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                            }`}
                          >
                            {nth.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                        روز هفته:
                      </label>
                      <div className="flex flex-wrap gap-1">
                        {[
                          { id: 0, name: 'شنبه' },
                          { id: 1, name: 'یکشنبه' },
                          { id: 2, name: 'دوشنبه' },
                          { id: 3, name: 'سه‌شنبه' },
                          { id: 4, name: 'چهارشنبه' },
                          { id: 5, name: 'پنج‌شنبه' },
                          { id: 6, name: 'جمعه' },
                        ].map((day) => (
                          <button
                            key={day.id}
                            type="button"
                            onClick={() => setRecurringNthWeekday(day.id)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                              recurringNthWeekday === day.id
                                ? 'bg-purple-600 text-white border-purple-600 shadow-2xs'
                                : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                            }`}
                          >
                            {day.name}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="p-2.5 bg-purple-100/70 dark:bg-purple-900/40 rounded-xl text-xs text-purple-900 dark:text-purple-200 font-medium border border-purple-200 dark:border-purple-800">
                      💡 الگوی انتخابی: <span className="font-bold">
                        {recurringNthOccurrence === 'first' ? 'اولین' : recurringNthOccurrence === 'second' ? 'دومین' : recurringNthOccurrence === 'third' ? 'سومین' : recurringNthOccurrence === 'fourth' ? 'چهارمین' : 'آخرین'}{' '}
                        {['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه'][recurringNthWeekday]} هر ماه شمسی
                      </span>
                    </div>
                  </div>
                )}

                {/* 3) Start & End Time Fields (ساعت شروع و ساعت پایان) */}
                <div className="pt-2 border-t border-purple-200/60 dark:border-purple-900/60 grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 mb-1">
                      <Clock className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                      <span>ساعت شروع برگزاری:</span>
                    </label>
                    <PersianTimeInput
                      value={recurringStartTime}
                      onChange={setRecurringStartTime}
                      ariaLabel="ساعت شروع برگزاری"
                      className="w-full px-3 py-1.5 bg-white dark:bg-slate-900 text-xs font-bold border border-slate-200 dark:border-slate-700 rounded-xl focus-within:ring-2 focus-within:ring-purple-500 text-slate-800 dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 mb-1">
                      <Clock className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                      <span>ساعت پایان برگزاری:</span>
                    </label>
                    <PersianTimeInput
                      value={recurringEndTime}
                      onChange={setRecurringEndTime}
                      ariaLabel="ساعت پایان برگزاری"
                      className="w-full px-3 py-1.5 bg-white dark:bg-slate-900 text-xs font-bold border border-slate-200 dark:border-slate-700 rounded-xl focus-within:ring-2 focus-within:ring-purple-500 text-slate-800 dark:text-slate-100"
                    />
                  </div>
                </div>

                {/* Start & End Interval */}
                <div className="pt-2.5 border-t border-purple-200/60 dark:border-purple-900/60 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                      تاریخ شروع بازه تکرار:
                    </label>
                    <JalaliDateTimePicker
                      valueISO={recurringStartDate}
                      onChangeISO={(iso) => setRecurringStartDate(iso)}
                      label=""
                      popoverPosition="top"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                      تاریخ پایان بازه تکرار (اختیاری):
                    </label>
                    <JalaliDateTimePicker
                      valueISO={recurringEndDate}
                      onChangeISO={(iso) => setRecurringEndDate(iso)}
                      label=""
                      popoverPosition="top"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Title Input */}
          <div className="flex items-center gap-3 pt-1"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600 text-white text-xs font-black shadow-md shadow-indigo-500/25">۱</span><div><p className="text-sm font-black text-slate-900 dark:text-white">{isProject ? 'شرح پروژه' : 'شرح فعالیت'}</p><p className="text-[11px] text-slate-500 dark:text-slate-400">ابتدا عنوان روشن و توضیح کوتاه بنویسید.</p></div></div>
          <div className="rounded-2xl border border-indigo-100/80 dark:border-indigo-900/50 bg-white/80 dark:bg-slate-800/35 p-4 shadow-[0_8px_24px_-20px_rgba(79,70,229,0.55)]">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
              {isProject ? 'عنوان پروژه' : 'عنوان فعالیت'} <span className="text-rose-500">*</span>
            </label>
            <div className="relative flex items-center">
              <input
                type="text"
                value={title}
                disabled={isStatusOnlyEdit}
                onChange={(e) => {
                  setTitle(e.target.value);
                  if (e.target.value.trim()) setErrors({});
                }}
                placeholder={isProject ? 'مثال: پروژه‌ی بازطراحی داشبورد' : 'مثال: طراحی صفحات داشبورد جدید'}
                className={`w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 text-xs font-medium border rounded-xl focus:outline-hidden focus:ring-2 transition-all text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 ${
                  isStatusOnlyEdit ? 'opacity-60 cursor-not-allowed' : 'focus:bg-white dark:focus:bg-slate-800'
                } ${
                  errors.title
                    ? 'border-rose-400 focus:ring-rose-400'
                    : 'border-slate-200 dark:border-slate-700 focus:ring-indigo-500 focus:border-indigo-500'
                }`}
              />
            </div>
            {errors.title && (
              <p className="mt-1 text-xs text-rose-500 flex items-center gap-1 font-medium">
                <AlertCircle className="w-3.5 h-3.5" />
                {errors.title}
              </p>
            )}
          </div>

          {/* Description Input */}
          <div className="rounded-2xl border border-slate-200/80 dark:border-slate-700 bg-white/80 dark:bg-slate-800/35 p-4 shadow-[0_8px_24px_-20px_rgba(15,23,42,0.45)]">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
              {isProject ? 'شرح توضیحات پروژه' : 'شرح توضیحات'}
            </label>
            {lockedDescription ? (
              // One box: the text taken from the message or comment on top (cannot be changed),
              // and what the user adds right under it.
              <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus-within:ring-2 focus-within:ring-indigo-500">
                <div
                  className="flex items-start gap-2 whitespace-pre-wrap break-words border-b border-dashed border-slate-300 dark:border-slate-600 bg-slate-100/90 dark:bg-slate-700/50 px-3.5 py-2.5 text-xs font-medium leading-6 text-slate-600 dark:text-slate-300 select-text"
                  title="متن اصلی پیام یا کامنت قابل ویرایش نیست؛ می‌توانید زیر آن توضیح اضافه کنید."
                >
                  <Lock className="mt-1 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                  <span>{lockedDescription}</span>
                </div>
                <textarea
                  rows={3}
                  value={descriptionExtra}
                  disabled={isStatusOnlyEdit}
                  onChange={(e) => setDescriptionExtra(e.target.value)}
                  placeholder="توضیح خود را بعد از متن بالا بنویسید..."
                  aria-label="افزودن توضیح بعد از متن پیام یا کامنت"
                  className="block w-full resize-none bg-transparent px-3.5 py-2.5 text-xs font-medium text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-hidden"
                />
              </div>
            ) : (
              <textarea
                rows={3}
                value={description}
                disabled={isStatusOnlyEdit}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={isProject ? 'جزئیات و نکات مربوط به این پروژه...' : 'جزئیات و نکات مربوط به این فعالیت...'}
                className={`w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 resize-none ${
                  isStatusOnlyEdit ? 'opacity-60 cursor-not-allowed' : 'focus:bg-white dark:focus:bg-slate-800'
                }`}
              />
            )}
          </div>

          {/* Jalali Date Time Picker & Status Grid */}
          <div className="flex items-center gap-3 pt-2"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-600 text-white text-xs font-black shadow-md shadow-violet-500/25">۲</span><div><p className="text-sm font-black text-slate-900 dark:text-white">زمان‌بندی و مسئولیت</p><p className="text-[11px] text-slate-500 dark:text-slate-400">موعد، وضعیت و افراد مسئول را مشخص کنید.</p></div></div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-2xl border border-slate-200/80 dark:border-slate-700 bg-white/90 dark:bg-slate-800/35 p-4 shadow-sm">
            
            {/* Jalali Date & Time Picker (not for a recurring task: its schedule sets the dates) */}
            {!hideDueDate && (
              <div>
                <JalaliDateTimePicker
                  valueISO={dueDateISO}
                  onChangeISO={(iso) => setDueDateISO(iso)}
                  label="موعد انجام (تاریخ و ساعت شمسی)"
                  disabled={isStatusOnlyEdit}
                  required
                />
              </div>
            )}

            {/* Status Field */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                {isProject ? 'وضعیت پروژه' : 'وضعیت فعالیت'}
              </label>
              <select
                value={status}
                disabled={isStatusOnlyEdit ? false : isAutoStatusTask}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
                className={`w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500 transition-all ${
                  isAutoStatusTask && !isStatusOnlyEdit
                    ? 'opacity-70 bg-slate-100 dark:bg-slate-800/50 cursor-not-allowed'
                    : 'focus:bg-white dark:focus:bg-slate-800 cursor-pointer'
                }`}
              >
                {(Object.keys(STATUSES) as TaskStatus[]).map((st) => (
                  <option key={st} value={st} className="bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100">
                    {STATUSES[st].title}
                  </option>
                ))}
              </select>
              {isAutoStatusTask && (
                <p className="mt-1 text-[11px] text-indigo-600 dark:text-indigo-400 font-medium flex items-center gap-1">
                  <span>* وضعیت پروژه‌ها و فعالیت‌های تکرارشونده بر اساس زیرمجموعه‌ها به‌طور خودکار محاسبه می‌شود.</span>
                </p>
              )}
            </div>

          </div>

          {/* Work Team & Individual Member Selection */}
          <div className="space-y-3 bg-white dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-indigo-500" />
                  <span>اعضای تیم کاری</span>
                </span>
                {selectedMemberIds.length > 0 && selectedTeamId && (() => {
                  const teamIds = new Set((availableTeams.find((t) => t.id === selectedTeamId)?.members || []).map((m) => m.userId));
                  const inTeam = selectedMemberIds.filter((id) => teamIds.has(id)).length;
                  const outside = selectedMemberIds.length - inTeam;
                  return (
                    <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">
                      {toPersianDigits(inTeam)} کاربر عضو تیم
                      {outside > 0 && ` + ${toPersianDigits(outside)} نفر خارج از تیم`}
                    </span>
                  );
                })()}
              </label>
              <select
                value={selectedTeamId}
                disabled={isStatusOnlyEdit}
                onChange={(e) => {
                  const teamId = e.target.value;
                  setSelectedTeamId(teamId);
                  // A chosen team's members get access by default (as when the team itself gave it);
                  // each can be taken off below. No team: the task stays with its people.
                  // People added from outside the previous team stay when another team is chosen.
                  const team = availableTeams.find((t) => t.id === teamId);
                  const previousTeamIds = new Set((availableTeams.find((t) => t.id === selectedTeamId)?.members || []).map((m) => m.userId));
                  const addedOutside = selectedTeamId ? selectedMemberIds.filter((id) => !previousTeamIds.has(id)) : [];
                  setSelectedMemberIds(
                    team
                      ? Array.from(new Set([...team.members.map((m) => m.userId), ...addedOutside]))
                      : currentUser ? [currentUser.id] : []
                  );
                }}
                className={`w-full px-3.5 py-2 bg-white dark:bg-slate-900 text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500 transition-all ${
                  isStatusOnlyEdit ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
                }`}
              >
                <option value="" className="bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100">
                  بدون اختصاص به تیم (شخصی / دسترسی به همه کاربران)
                </option>
                {availableTeams.map((team) => (
                  <option key={team.id} value={team.id} className="bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100">
                    تیم: {team.name} ({toPersianDigits(team.members.length)} عضو)
                  </option>
                ))}
              </select>
            </div>

            {/* Responsible people: one or more, from inside or outside the team */}
            <div className="pt-2.5 border-t border-slate-200/80 dark:border-slate-700/80 space-y-2" ref={assigneeDropdownRef}>
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                  <UserIcon className="w-3.5 h-3.5 text-indigo-500" />
                  <span>{isProject ? 'مسئولان اجرای پروژه' : 'مسئولان اجرای فعالیت'}</span>
                  {!taskToEdit && <span className="text-rose-500">*</span>}
                </label>
                <span className="text-[10px] text-slate-500 dark:text-slate-400">
                  {responsibleIds.length > 0
                    ? `${toPersianDigits(responsibleIds.length)} نفر انتخاب شده`
                    : 'یک یا چند نفر را انتخاب کنید'}
                </span>
              </div>

              {postMode ? (() => {
                // Given to posts: a post someone holds (and the user may give tasks to) - or one the task has.
                const known = new Map<string, { postId: string; title: string; code: string; place: string; holderName: string | null; blocked?: boolean; vacant: boolean }>();
                for (const p of taskToEdit?.posts || []) {
                  if (p.role === 'responsible') known.set(p.postId, { ...p, vacant: !p.holderUserId });
                }
                for (const p of postMode.posts) known.set(p.postId, { ...p, vacant: !p.holderUserId });
                const label = (p: { title: string; code: string }) => `${p.title} · کد ${toPersianDigits(p.code)}`;
                const candidates = Array.from(known.values())
                  .filter((p) => responsiblePostIds.includes(p.postId) || (!p.vacant && !p.blocked))
                  .sort((a, b) => a.place.localeCompare(b.place, 'fa') || a.title.localeCompare(b.title, 'fa'));
                const selected = responsiblePostIds.map((id) => known.get(id)).filter((p): p is NonNullable<typeof p> => !!p);
                const query = userSearchQuery.trim().toLowerCase();
                const filtered = candidates.filter((p) => !query
                  || [p.title, p.code, p.place, p.holderName || ''].some((v) => v.toLowerCase().includes(query)));
                const toggle = (id: string) => {
                  setResponsiblePostIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
                  setErrors((prev) => ({ ...prev, assignee: undefined }));
                };
                return (
                  <div className="space-y-2" data-post-picker>
                    {selected.length > 0 && (
                      <div className="flex flex-wrap gap-1.5" data-responsible-list>
                        {selected.map((post) => (
                          <span key={post.postId} data-responsible-post={post.postId} className="inline-flex items-center gap-1.5 pl-1 pr-1.5 py-1 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 text-xs font-semibold text-indigo-900 dark:text-indigo-100">
                            <Briefcase className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                            <span>{label(post)}</span>
                            <span className={`text-[10px] ${post.vacant ? 'text-amber-600' : 'text-indigo-500 dark:text-indigo-300'}`}>{post.vacant ? '(خالی)' : `(${post.holderName})`}</span>
                            {!isStatusOnlyEdit && (
                              <button type="button" aria-label={`حذف ${label(post)} از مسئولان`} onClick={() => toggle(post.postId)} className="p-0.5 rounded-md text-indigo-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer">
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </span>
                        ))}
                      </div>
                    )}
                    {!isStatusOnlyEdit && (
                      <div className="relative">
                        <div className="relative flex items-center">
                          <Search className="w-4 h-4 absolute right-3 text-slate-400 pointer-events-none" />
                          <input
                            type="text"
                            placeholder={selected.length > 0 ? 'افزودن پست مسئول دیگر...' : `جستجو در میان پست‌ها (${toPersianDigits(candidates.length)} پست)...`}
                            value={userSearchQuery}
                            onFocus={() => setIsAssigneeDropdownOpen(true)}
                            onChange={(e) => { setUserSearchQuery(e.target.value); setIsAssigneeDropdownOpen(true); }}
                            className="w-full pl-9 pr-9 py-2 bg-white dark:bg-slate-900 text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500 transition-all placeholder:text-slate-400"
                          />
                          <button type="button" aria-label="نمایش فهرست پست‌ها" onClick={() => setIsAssigneeDropdownOpen((prev) => !prev)} className="absolute left-2.5 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer">
                            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isAssigneeDropdownOpen ? 'rotate-180' : ''}`} />
                          </button>
                        </div>
                        {isAssigneeDropdownOpen && (
                          <div className="absolute z-50 top-full mt-1.5 w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl max-h-60 overflow-y-auto p-1.5 space-y-1" data-responsible-options>
                            <div className="px-2 py-1 text-[10px] text-slate-400 flex items-center justify-between">
                              <span>پست‌های سازمانی:</span>
                              <span>{toPersianDigits(filtered.length)} پست</span>
                            </div>
                            {filtered.length === 0 ? (
                              <div className="py-4 text-center text-xs text-slate-400">پستی با این مشخصات یافت نشد.</div>
                            ) : filtered.map((post) => {
                              const isSelected = responsiblePostIds.includes(post.postId);
                              return (
                                <button key={post.postId} type="button" role="option" aria-selected={isSelected} data-option={post.postId} onClick={() => toggle(post.postId)}
                                  className={`w-full flex items-center justify-between p-2 rounded-lg text-xs text-right transition-colors cursor-pointer ${isSelected ? 'bg-indigo-50 dark:bg-indigo-950/70 text-indigo-900 dark:text-indigo-100 border border-indigo-200 dark:border-indigo-800' : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200'}`}>
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <div className="w-7 h-7 rounded-lg bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-300 flex items-center justify-center shrink-0"><Briefcase className="w-3.5 h-3.5" /></div>
                                    <div className="truncate">
                                      <p className="font-bold text-xs truncate text-slate-800 dark:text-slate-100">{label(post)}</p>
                                      <p className="text-[10px] text-slate-400 truncate">{post.vacant ? 'خالی' : post.holderName} · {post.place}</p>
                                    </div>
                                  </div>
                                  <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${isSelected ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300 dark:border-slate-600'}`}>
                                    {isSelected && <Check className="w-3 h-3 text-white" />}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">فعالیت به پست سازمانی داده می‌شود؛ اگر دارندهٔ پست عوض شود، فعالیت به نفر جدید می‌رسد.{assignmentLimited ? ' فقط پست‌های هم‌سطح شما و زیرمجموعه‌تان نمایش داده می‌شوند.' : ''}</p>
                    {errors.assignee && <p className="text-xs text-red-500 font-medium">{errors.assignee}</p>}
                    {/* As with people: may the posts' holders change the task's status? */}
                    {responsiblePostIds.length > 0 && assigneeStatusToggle()}
                  </div>
                );
              })() : (() => {
                const currentTeamObj = availableTeams.find((t) => t.id === selectedTeamId);
                const teamIds = new Set((currentTeamObj?.members || []).map((m) => m.userId));

                // Every active user of the organization can be responsible - the team's members are
                // listed first, but the team does not limit the choice. Disabled accounts cannot be
                // picked (the server refuses them); one already responsible on an edited task stays.
                const byId = new Map<string, PersonOption>();
                for (const u of allRegisteredUsers) {
                  if (u.disabled && !responsibleIds.includes(u.id)) continue;
                  byId.set(u.id, { id: u.id, name: u.name || u.username, username: u.username, avatar: u.avatar, email: u.email || '' });
                }
                // The signed-in user can always take the task themselves, even without the user list.
                if (currentUser && !currentUser.disabled && !byId.has(currentUser.id)) {
                  byId.set(currentUser.id, { id: currentUser.id, name: currentUser.name || currentUser.username, username: currentUser.username, avatar: currentUser.avatar, email: currentUser.email || '' });
                }
                for (const m of currentTeamObj?.members || []) {
                  if (!byId.has(m.userId) && !allRegisteredUsers.some((u) => u.id === m.userId && u.disabled)) {
                    byId.set(m.userId, { id: m.userId, name: m.name, username: m.username || m.name, avatar: m.avatar, email: '' });
                  }
                }
                // Names for people already responsible whom the list does not hold.
                (taskToEdit?.responsibleUserIds || []).forEach((id, i) => {
                  if (!byId.has(id) && responsibleIds.includes(id)) {
                    byId.set(id, { id, name: taskToEdit?.responsibleUserNames?.[i] || 'کاربر', username: '', email: '' });
                  }
                });

                // Someone the user may not give tasks to is not offered - unless already responsible.
                const candidates = Array.from(byId.values()).filter((p) => (!blockedIds.has(p.id) && (!allowedIds || allowedIds.has(p.id))) || responsibleIds.includes(p.id)).sort((a, b) => {
                  const rank = (p: PersonOption) => (p.id === currentUser?.id ? 0 : teamIds.has(p.id) ? 1 : 2);
                  return rank(a) - rank(b) || a.name.localeCompare(b.name, 'fa');
                });
                const selected = responsibleIds.map((id) => byId.get(id)).filter((p): p is PersonOption => !!p);

                const query = userSearchQuery.trim().toLowerCase();
                const filtered = candidates.filter((u) =>
                  !query ||
                  u.name.toLowerCase().includes(query) ||
                  (u.username || '').toLowerCase().includes(query) ||
                  (u.email || '').toLowerCase().includes(query)
                );

                const toggle = (id: string) => {
                  setResponsibleIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
                  setErrors((prev) => ({ ...prev, assignee: undefined }));
                };

                return (
                  <div className="space-y-2">
                    {/* Chosen people */}
                    {selected.length > 0 && (
                      <div className="flex flex-wrap gap-1.5" data-responsible-list>
                        {selected.map((person) => (
                          <span
                            key={person.id}
                            data-responsible={person.id}
                            className="inline-flex items-center gap-1.5 pl-1 pr-1.5 py-1 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 text-xs font-semibold text-indigo-900 dark:text-indigo-100"
                          >
                            <span className="w-5 h-5 rounded-lg bg-indigo-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0">
                              {person.name.charAt(0).toUpperCase()}
                            </span>
                            <span>{person.id === currentUser?.id ? `${person.name} (من)` : person.name}</span>
                            {teamIds.has(person.id) && <span className="text-[9px] text-indigo-500 dark:text-indigo-300">عضو تیم</span>}
                            {!isStatusOnlyEdit && (
                              <button
                                type="button"
                                aria-label={`حذف ${person.name} از مسئولان`}
                                onClick={() => toggle(person.id)}
                                className="p-0.5 rounded-md text-indigo-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Search and add */}
                    {!isStatusOnlyEdit && (
                      <div className="relative">
                        <div className="relative flex items-center">
                          <Search className="w-4 h-4 absolute right-3 text-slate-400 pointer-events-none" />
                          <input
                            type="text"
                            placeholder={selected.length > 0 ? 'افزودن مسئول دیگر (جستجوی نام)...' : `جستجو در میان افراد (${toPersianDigits(candidates.length)} نفر)...`}
                            value={userSearchQuery}
                            onFocus={() => setIsAssigneeDropdownOpen(true)}
                            onChange={(e) => {
                              setUserSearchQuery(e.target.value);
                              setIsAssigneeDropdownOpen(true);
                            }}
                            className="w-full pl-9 pr-9 py-2 bg-white dark:bg-slate-900 text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500 transition-all placeholder:text-slate-400"
                          />
                          <button
                            type="button"
                            aria-label="نمایش فهرست افراد"
                            onClick={() => setIsAssigneeDropdownOpen((prev) => !prev)}
                            className="absolute left-2.5 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                          >
                            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isAssigneeDropdownOpen ? 'rotate-180' : ''}`} />
                          </button>
                        </div>

                        {isAssigneeDropdownOpen && (
                          <div className="absolute z-50 top-full mt-1.5 w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl max-h-60 overflow-y-auto p-1.5 space-y-1 animate-in fade-in zoom-in-95 duration-150" data-responsible-options>
                            <div className="px-2 py-1 text-[10px] text-slate-400 flex items-center justify-between">
                              <span>{currentTeamObj ? 'اعضای تیم و سایر افراد:' : 'افراد سازمان:'}</span>
                              <span>{toPersianDigits(filtered.length)} نفر</span>
                            </div>
                            {filtered.length === 0 ? (
                              <div className="py-4 text-center text-xs text-slate-400">کاربری با این مشخصات یافت نشد.</div>
                            ) : (
                              filtered.map((user) => {
                                const isSelected = responsibleIds.includes(user.id);
                                return (
                                  <button
                                    key={user.id}
                                    type="button"
                                    role="option"
                                    aria-selected={isSelected}
                                    data-option={user.id}
                                    onClick={() => toggle(user.id)}
                                    className={`w-full flex items-center justify-between p-2 rounded-lg text-xs text-right transition-colors cursor-pointer ${
                                      isSelected
                                        ? 'bg-indigo-50 dark:bg-indigo-950/70 text-indigo-900 dark:text-indigo-100 border border-indigo-200 dark:border-indigo-800'
                                        : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2.5 min-w-0">
                                      {user.avatar ? (
                                        <img src={user.avatar} alt={user.name} className="w-7 h-7 rounded-lg object-cover border border-slate-200 dark:border-slate-700 shrink-0" />
                                      ) : (
                                        <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-[11px] shrink-0">
                                          {user.name.charAt(0).toUpperCase()}
                                        </div>
                                      )}
                                      <div className="truncate">
                                        <p className="font-bold text-xs truncate text-slate-800 dark:text-slate-100">
                                          {user.id === currentUser?.id ? `${user.name} (من)` : user.name}
                                        </p>
                                        {user.username && <p className="text-[10px] text-slate-400 truncate">@{user.username}</p>}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                      <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                                        {teamIds.has(user.id) ? 'عضو تیم' : currentTeamObj ? 'خارج از تیم' : 'کاربر'}
                                      </span>
                                      <span className={`w-4 h-4 rounded border flex items-center justify-center ${isSelected ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300 dark:border-slate-600'}`}>
                                        {isSelected && <Check className="w-3 h-3 text-white" />}
                                      </span>
                                    </div>
                                  </button>
                                );
                              })
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {assignmentLimited && !isStatusOnlyEdit && (
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">فقط افراد هم‌سطح شما و زیرمجموعه‌تان در چارت سازمانی نمایش داده می‌شوند.</p>
                    )}
                    {!assignmentLimited && allowedIds && !isStatusOnlyEdit && (
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">فقط افراد شرکت خودتان نمایش داده می‌شوند.</p>
                    )}

                    {errors.assignee && (
                      <p className="text-xs text-red-500 font-medium">{errors.assignee}</p>
                    )}

                    {/* Checkbox for status update permission when someone is responsible */}
                    {responsibleIds.length > 0 && assigneeStatusToggle()}
                  </div>
                );
              })()}
            </div>

            {/* Who may see the task (its access list): the team's members, and anyone added from
                outside the team. Responsible people always may. */}
            {selectedTeamId && (() => {
              const currentTeamObj = availableTeams.find((t) => t.id === selectedTeamId);
              if (!currentTeamObj) return null;

              const uniqueMembersMap = new Map<string, WorkTeamMember>();
              currentTeamObj.members.forEach((m) => uniqueMembersMap.set(m.userId, m));
              const uniqueMembers: WorkTeamMember[] = Array.from(uniqueMembersMap.values());
              const teamIds = new Set(uniqueMembers.map((m) => m.userId));

              // People added from outside the team, with names from the user list (or the saved task).
              const nameOf = (id: string): string => {
                const user = allRegisteredUsers.find((u) => u.id === id) || (currentUser?.id === id ? currentUser : undefined);
                if (user) return user.name || user.username;
                const saved = (taskToEdit?.teamMemberIds || []).indexOf(id);
                return (saved >= 0 && taskToEdit?.teamMemberNames?.[saved]) || 'کاربر';
              };
              const outsiders = selectedMemberIds.filter((id) => !teamIds.has(id));
              // Anyone else active in the organization; the task's owner sees it anyway.
              const ownerId = taskToEdit?.user || currentUser?.id;
              const accessQuery = accessSearchQuery.trim().toLowerCase();
              const outsideCandidates = allRegisteredUsers
                .filter((u) => !u.disabled && u.id !== ownerId && !teamIds.has(u.id) && !selectedMemberIds.includes(u.id) && !responsibleIds.includes(u.id))
                // Kept to one's own company: nobody of another company is offered.
                .filter((u) => !allowedIds || allowedIds.has(u.id))
                .filter((u) =>
                  !accessQuery ||
                  (u.name || '').toLowerCase().includes(accessQuery) ||
                  (u.username || '').toLowerCase().includes(accessQuery) ||
                  (u.email || '').toLowerCase().includes(accessQuery)
                )
                .sort((a, b) => (a.name || a.username).localeCompare(b.name || b.username, 'fa'));

              return (
                <div className="pt-2 border-t border-slate-200/80 dark:border-slate-700/80 space-y-2" data-access-list>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-700 dark:text-slate-300 text-[11px]">
                      اعضای تیم با دسترسی به این فعالیت:
                    </span>
                    {!isStatusOnlyEdit && (
                      <div className="flex items-center gap-2 text-[10px]">
                        <button
                          type="button"
                          onClick={() => setSelectedMemberIds(Array.from(new Set([...uniqueMembers.map((m) => m.userId), ...outsiders])))}
                          className="text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer font-semibold"
                        >
                          همه ({toPersianDigits(uniqueMembers.length)})
                        </button>
                        <span className="text-slate-300 dark:text-slate-600">|</span>
                        <button
                          type="button"
                          onClick={() => setSelectedMemberIds([])}
                          className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:underline cursor-pointer"
                        >
                          فقط مسئولان
                        </button>
                      </div>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">
                    فقط اعضای انتخاب‌شده (و مسئولان اجرا) این فعالیت را می‌بینند.
                  </p>

                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {uniqueMembers.map((member) => {
                      const isResponsible = responsibleIds.includes(member.userId);
                      const isSelected = isResponsible || selectedMemberIds.includes(member.userId);
                      return (
                        <button
                          key={member.userId}
                          type="button"
                          data-access-member={member.userId}
                          aria-pressed={isSelected}
                          disabled={isStatusOnlyEdit || isResponsible}
                          title={isResponsible ? 'مسئول اجرا همیشه به فعالیت دسترسی دارد' : undefined}
                          onClick={() => {
                            setSelectedMemberIds((prev) =>
                              prev.includes(member.userId) ? prev.filter((id) => id !== member.userId) : [...prev, member.userId]
                            );
                          }}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold border transition-all cursor-pointer disabled:cursor-default ${
                            isSelected
                              ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                              : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-indigo-300'
                          }`}
                        >
                          <div
                            className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold ${
                              isSelected ? 'bg-white text-indigo-700' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            {isSelected ? <Check className="w-3 h-3 text-indigo-600" /> : member.name.charAt(0).toUpperCase()}
                          </div>
                          <span>{member.name}</span>
                          {isResponsible && (
                            <span className="text-[9px] text-indigo-100">(مسئول)</span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* People from outside the team: they see the task too, without being responsible for it. */}
                  <div className="pt-2 space-y-1.5" ref={accessDropdownRef} data-access-outsiders>
                    <span className="block font-bold text-slate-700 dark:text-slate-300 text-[11px]">
                      افراد دیگر (خارج از تیم) با دسترسی به این فعالیت:
                    </span>
                    {outsiders.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {outsiders.map((id) => {
                          const name = nameOf(id);
                          const isResponsible = responsibleIds.includes(id);
                          return (
                            <span
                              key={id}
                              data-access-outsider={id}
                              className="inline-flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-xl bg-indigo-600 text-white border border-indigo-600 text-xs font-semibold shadow-2xs"
                            >
                              <span className="w-4 h-4 rounded-full bg-white text-indigo-700 flex items-center justify-center">
                                <Check className="w-3 h-3 text-indigo-600" />
                              </span>
                              <span>{name}</span>
                              <span className="text-[9px] text-indigo-100">{isResponsible ? '(مسئول)' : '(خارج از تیم)'}</span>
                              {!isStatusOnlyEdit && (
                                <button
                                  type="button"
                                  aria-label={`حذف دسترسی ${name}`}
                                  onClick={() => setSelectedMemberIds((prev) => prev.filter((x) => x !== id))}
                                  className="p-0.5 rounded-md text-indigo-200 hover:text-white hover:bg-indigo-500 cursor-pointer"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              )}
                            </span>
                          );
                        })}
                      </div>
                    )}
                    {!isStatusOnlyEdit && (
                      <div className="relative">
                        <div className="relative flex items-center">
                          <Search className="w-4 h-4 absolute right-3 text-slate-400 pointer-events-none" />
                          <input
                            type="text"
                            placeholder="افزودن شخص دیگر از خارج تیم (جستجوی نام)..."
                            value={accessSearchQuery}
                            onFocus={() => setIsAccessDropdownOpen(true)}
                            onChange={(e) => {
                              setAccessSearchQuery(e.target.value);
                              setIsAccessDropdownOpen(true);
                            }}
                            className="w-full pl-3 pr-9 py-2 bg-white dark:bg-slate-900 text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500 transition-all placeholder:text-slate-400"
                          />
                        </div>
                        {isAccessDropdownOpen && (
                          <div className="absolute z-50 top-full mt-1.5 w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl max-h-60 overflow-y-auto p-1.5 space-y-1 animate-in fade-in zoom-in-95 duration-150" data-access-outsider-options>
                            {outsideCandidates.length === 0 ? (
                              <div className="py-4 text-center text-xs text-slate-400">کاربر دیگری برای افزودن یافت نشد.</div>
                            ) : (
                              outsideCandidates.map((user) => {
                                const name = user.name || user.username;
                                return (
                                  <button
                                    key={user.id}
                                    type="button"
                                    data-option={user.id}
                                    onClick={() => {
                                      setSelectedMemberIds((prev) => (prev.includes(user.id) ? prev : [...prev, user.id]));
                                      setAccessSearchQuery('');
                                    }}
                                    className="w-full flex items-center gap-2.5 p-2 rounded-lg text-xs text-right transition-colors cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200"
                                  >
                                    {user.avatar ? (
                                      <img src={user.avatar} alt={name} className="w-7 h-7 rounded-lg object-cover border border-slate-200 dark:border-slate-700 shrink-0" />
                                    ) : (
                                      <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-[11px] shrink-0">
                                        {name.charAt(0).toUpperCase()}
                                      </div>
                                    )}
                                    <div className="truncate">
                                      <p className="font-bold text-xs truncate text-slate-800 dark:text-slate-100">{name}</p>
                                      {user.username && <p className="text-[10px] text-slate-400 truncate">@{user.username}</p>}
                                    </div>
                                  </button>
                                );
                              })
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Priority (درجه اهمیت: کم، متوسط، زیاد) */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
              درجه اهمیت (اولویت)
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(PRIORITIES) as Priority[]).map((prKey) => {
                const pr = PRIORITIES[prKey];
                const isSelected = priority === prKey;
                return (
                  <button
                    type="button"
                    key={prKey}
                    disabled={isStatusOnlyEdit}
                    onClick={() => setPriority(prKey)}
                    className={`flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl border text-xs font-bold transition-all ${
                      isStatusOnlyEdit ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
                    } ${
                      isSelected
                        ? `${pr.bgColor} ${pr.textColor} ${pr.borderColor} ring-2 ring-indigo-500 shadow-xs`
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    <span>{pr.title}</span>
                    {isSelected && <Check className="w-3.5 h-3.5" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tags / Labels Input Section */}
          <div className="p-3.5 bg-slate-50/80 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700/80 space-y-2">
            <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-indigo-500" />
                <span>برچسب‌های کاری (تگ)</span>
              </span>
              {tags.length > 0 && (
                <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">
                  {toPersianDigits(tags.length)} برچسب ثبت شده
                </span>
              )}
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1" ref={tagDropdownRef}>
                <input
                  type="text"
                  value={tagInput}
                  disabled={isStatusOnlyEdit}
                  onFocus={() => !isStatusOnlyEdit && setShowTagDropdown(true)}
                  onChange={(e) => {
                    setTagInput(e.target.value);
                    setShowTagDropdown(true);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddTag();
                      setShowTagDropdown(false);
                    }
                  }}
                  placeholder={isStatusOnlyEdit ? 'برچسب‌ها قفل شده‌اند' : 'کلیک کنید تا برچسب‌های قبلی انتخاب شود یا نام برچسب جدید را تایپ کنید...'}
                  className={`w-full px-3 py-2 bg-white dark:bg-slate-900 text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 ${
                    isStatusOnlyEdit ? 'opacity-60 cursor-not-allowed' : ''
                  }`}
                />

                {/* Dropdown Menu for Previous Tags */}
                {showTagDropdown && filteredPreviousTags.length > 0 && (
                  <div className="absolute right-0 left-0 top-full mt-1 z-30 max-h-48 overflow-y-auto bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 py-1 text-xs animate-in fade-in zoom-in-95">
                    <div className="px-3 py-1 text-[10px] font-bold text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-700/60 mb-1 flex items-center justify-between">
                      <span>برچسب‌های قبلی استفاده شده ({toPersianDigits(filteredPreviousTags.length)}):</span>
                      <Tag className="w-3 h-3 text-indigo-500" />
                    </div>
                    {filteredPreviousTags.map((pTag, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          if (!tags.includes(pTag)) {
                            setTags((prev) => [...prev, pTag]);
                          }
                          setTagInput('');
                          setShowTagDropdown(false);
                        }}
                        className="w-full flex items-center justify-between px-3 py-1.5 text-right text-slate-700 dark:text-slate-200 hover:bg-indigo-50 dark:hover:bg-indigo-950/80 hover:text-indigo-700 dark:hover:text-indigo-300 font-bold transition-colors cursor-pointer"
                      >
                        <span className="flex items-center gap-1.5">
                          <Tag className="w-3 h-3 text-indigo-500" />
                          <span>#{pTag}</span>
                        </span>
                        <Plus className="w-3.5 h-3.5 text-slate-400 hover:text-indigo-600" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  handleAddTag();
                  setShowTagDropdown(false);
                }}
                className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shrink-0"
              >
                افزودن
              </button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {tags.map((t, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold bg-indigo-50 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800"
                  >
                    #{t}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(t)}
                      className="text-indigo-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors cursor-pointer p-0.5 rounded-md"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* File Attachments Area (امکان اضافه کردن فایل ضمیمه) */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                <Paperclip className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                <span>فایل‌های ضمیمه</span>
                {attachments.length > 0 && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-semibold">
                    {toPersianDigits(attachments.length)} فایل
                  </span>
                )}
              </label>
              
              {!isStatusOnlyEdit && canUploadFiles && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="inline-flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-bold hover:underline cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>افزودن فایل</span>
                </button>
              )}
            </div>

            {/* Hidden Input File */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => handleFileUpload(e.target.files)}
              multiple
              accept={ALLOWED_UPLOAD_ACCEPT}
              className="hidden"
            />

            {/* Drag & Drop Dropzone */}
            {!isStatusOnlyEdit && canUploadFiles && (
              <div
                onClick={() => fileInputRef.current?.click()}
                // Without these the browser handles a dropped file itself: it opens the file in
                // the tab and the form is lost.
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'copy';
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (!isUploading) handleFileUpload(e.dataTransfer.files);
                }}
                className="border-2 border-dashed border-slate-200 dark:border-slate-700 hover:border-indigo-400 bg-slate-50/70 dark:bg-slate-800/50 hover:bg-indigo-50/30 dark:hover:bg-indigo-950/30 rounded-2xl p-4 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-1"
              >
                <UploadCloud className="w-6 h-6 text-indigo-500 dark:text-indigo-400" />
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  جهت آپلود فایل ضمیمه، اینجا کلیک کنید یا فایل را بکشید و رها کنید
                </p>
                <p className="text-[10px] text-slate-400 dark:text-slate-500">
                  پشتیبانی از تصاویر (PNG, JPG, SVG)، اسناد (PDF, DOCX) و سایر فایل‌ها
                </p>
              </div>
            )}

            {/* Attachments List */}
            {attachments.length > 0 && (
              <div className="mt-3 space-y-2">
                {attachments.map((att) => {
                  const isImage = att.type.startsWith('image/') || att.dataUrl.startsWith('data:image/');
                  return (
                    <div
                      key={att.id}
                      className="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
                    >
                      <div className="flex items-center gap-2.5 overflow-hidden">
                        {isImage ? (
                          <div className="w-8 h-8 rounded-lg overflow-hidden shrink-0 border border-slate-200 dark:border-slate-700 bg-slate-200 dark:bg-slate-700">
                            <img
                              src={att.dataUrl}
                              alt={att.name}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ) : (
                          <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 border border-amber-200 dark:border-amber-800">
                            <FileText className="w-4 h-4" />
                          </div>
                        )}
                        <div className="overflow-hidden">
                          <p className="font-semibold text-slate-800 dark:text-slate-200 truncate" title={att.name}>
                            {att.name}
                          </p>
                          <p className="text-[10px] text-slate-400 dark:text-slate-500">
                            {formatFileSize(att.size)}
                          </p>
                        </div>
                      </div>

                      {!isStatusOnlyEdit && (
                        <button
                          type="button"
                          onClick={() => handleRemoveAttachment(att.id)}
                          className="p-1.5 text-slate-400 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-slate-700 rounded-lg transition-colors shrink-0 cursor-pointer"
                          title="حذف ضمیمه"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          </div>

          {/* Form Actions Footer */}
          <div className="p-4 sm:px-6 bg-white/90 dark:bg-slate-900/90 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2.5 shrink-0 shadow-[0_-10px_30px_-24px_rgba(15,23,42,0.4)]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold transition-all cursor-pointer"
            >
              انصراف
            </button>
            <button
              type="submit"
              disabled={isUploading}
              className={`px-5 py-2.5 rounded-xl ${palette.accentBg} ${palette.accentHover} text-white text-xs font-bold shadow-lg shadow-indigo-500/25 transition-all hover:-translate-y-0.5 active:translate-y-0 flex items-center gap-1.5 cursor-pointer disabled:opacity-50`}
            >
              <Check className="w-4 h-4 stroke-[2.5]" />
              <span>{taskToEdit ? 'ذخیره تغییرات' : isProject ? 'ثبت پروژه جدید' : 'ثبت فعالیت جدید'}</span>
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
