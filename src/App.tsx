import React, { useState, useEffect, useMemo, useCallback, lazy, Suspense } from 'react';
import type { MatrixItem } from './utils/eisenhower';
import { parseDateSafely } from './utils/jalali';
import { TaskTitleContext } from './components/TaskCardList';
import { Task, TaskStatus, Priority, Attachment, User, WorkTeam, AppTheme, AppColorPalette, TaskComment, STATUSES, PRIORITIES, AppNotification, setMaxAttachmentBytes, SubTaskProgress } from './types';
import { getUploadPolicy, refreshUploadPolicy } from './utils/uploadPolicy';
import { isOverdue, toPersianDigits, formatToJalali, getTaskLastModifiedTime, computeAutoTaskStatus } from './utils/helpers';
import { Navbar } from './components/Navbar';
import { FilterBar } from './components/FilterBar';
import { BoardViewBar } from './components/BoardViewBar';
import { BoardViewSettings, loadBoardView, saveBoardView } from './utils/boardView';
import { KanbanBoard } from './components/KanbanBoard';
import { SandwichBar, ActiveTab } from './components/SandwichBar';
import ToastHost from './components/ToastHost';
import { DesktopSidebar } from './components/DesktopSidebar';
import type { ThemeMode } from './components/SettingsModal';

import { UserWelcomeModal } from './components/UserWelcomeModal';
import { AuthModal } from './components/AuthModal';
import { PageViewLoader } from './components/PageViewLoader';
import { ErrorBoundary } from './components/ErrorBoundary';

// Lazy loaded views & modals for secondary views
const JalaliCalendarView = lazy(() => import('./components/JalaliCalendarView').then(m => ({ default: m.JalaliCalendarView })));
const OverdueTasksView = lazy(() => import('./components/OverdueTasksView').then(m => ({ default: m.OverdueTasksView })));
const EisenhowerView = lazy(() => import('./components/EisenhowerView').then(m => ({ default: m.EisenhowerView })));
const ReportsView = lazy(() => import('./components/ReportsView').then(m => ({ default: m.ReportsView })));
const SubstitutionInboxView = lazy(() => import('./components/SubstitutionInboxView').then(m => ({ default: m.SubstitutionInboxView })));
const TeamChatView = lazy(() => import('./components/TeamChatView').then(m => ({ default: m.TeamChatView })));
const PersonalNotesView = lazy(() => import('./components/PersonalNotesView').then(m => ({ default: m.PersonalNotesView })));
const SettingsView = lazy(() => import('./components/SettingsView').then(m => ({ default: m.SettingsView })));

const TaskFormModal = lazy(() => import('./components/TaskFormModal').then(m => ({ default: m.TaskFormModal })));
const TaskDetailModal = lazy(() => import('./components/TaskDetailModal').then(m => ({ default: m.TaskDetailModal })));
const ProjectDetailModal = lazy(() => import('./components/ProjectDetailModal').then(m => ({ default: m.ProjectDetailModal })));
const AttachmentPreviewModal = lazy(() => import('./components/AttachmentPreviewModal').then(m => ({ default: m.AttachmentPreviewModal })));
const NotificationModal = lazy(() => import('./components/NotificationModal').then(m => ({ default: m.NotificationModal })));
const UserGuideModal = lazy(() => import('./components/UserGuideModal').then(m => ({ default: m.UserGuideModal })));
const SettingsModal = lazy(() => import('./components/SettingsModal').then(m => ({ default: m.SettingsModal })));
const ResetPasswordModal = lazy(() => import('./components/ResetPasswordModal').then(m => ({ default: m.ResetPasswordModal })));
const FeatureListPdfModal = lazy(() => import('./components/FeatureListPdfModal').then(m => ({ default: m.FeatureListPdfModal })));

import {
  fetchTasksFromPB,
  fetchTaskByIdPB,
  createTaskInPB,
  updateTaskInPB,
  deleteTaskFromPB,
  subscribeToTasksPB,
  fetchTeamUnreadCountsPB,
  getCurrentUser,
  refreshCurrentUserPB,
  logoutPB,
  updateUserThemePB,
  updateUserProfilePB,
  saveTaskExtraMeta,
  createTaskLogPB,
  fetchUserTeamsPB,
  fetchUserTeamsAsyncPB,
  fetchAllUsersPB,
  fetchUnreadMessageCountsPB,
  extractResetTokenFromURL,
  ACTIVE_DATA_SERVER_URL,
  fetchServerNotificationsPB,
  serverTellsOfTasksPB,
  markServerNotificationReadPB,
  markAllServerNotificationsReadPB
} from './services/dataService';
import {
  ServerNotificationDto,
  isServerNotificationId,
  mergeNotifications,
  serverNotificationKey,
  toAppNotification,
} from './utils/serverNotifications';
import { Database, PanelRightOpen } from 'lucide-react';
import { showToast } from './utils/toast';
import { NexusApiError, SESSION_ENDED_EVENT, TASK_CREATED_ACTION, withoutEditDuplicates } from './services/nexusApi';
import { describeTaskChanges, summarizeTaskChanges, userNameLookup } from './utils/taskChangeSummary';
import { getReportScope, ReportScope } from './services/taskReportApi';
import { isOrgStructureAvailable, orgStructureLookupKey, getSubstitutionInbox, SubstitutionInbox } from './services/orgStructureApi';
import { readLookup, refreshLookup, useLookup } from './utils/lookupCache';
import { can, canOpenTab, firstAllowedTab, PERMISSIONS } from './utils/permissions';
import { userErrorMessage } from './utils/errorMessages';
import { isTaskVisibleTo, responsibleIdsOf, responsibleNamesOf } from './utils/taskPeople';
import { appAlert, appConfirm } from './utils/appDialog';

const PAGE_TITLES: Record<string, string> = {
  kanban: 'بورد کانبان',
  calendar: 'نمای تقویم',
  matrix: 'ماتریس آیزنهاور',
  overdue: 'موعد گذشته',
  chat: 'گفتگوی تیمی',
  notes: 'یادداشت‌های شخصی',
  reports: 'گزارش فعالیت‌ها',
  substitution: 'کارتابل جانشینی',
  settings: 'تنظیمات و پروفایل',
};

export default function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [pbError, setPbError] = useState<string | null>(null);
  // Raised after a task is saved, deleted or changes status, so the open report reloads.
  const [reportRefreshKey, setReportRefreshKey] = useState(0);

  // Desktop Sidebar visibility state (default: open, saved in localStorage)
  const [isDesktopSidebarOpen, setIsDesktopSidebarOpen] = useState<boolean>(() => {
    const saved = localStorage.getItem('tm_desktop_sidebar_open');
    return saved !== null ? saved === 'true' : true;
  });

  const handleToggleDesktopSidebar = () => {
    setIsDesktopSidebarOpen((prev) => {
      const next = !prev;
      localStorage.setItem('tm_desktop_sidebar_open', String(next));
      return next;
    });
  };

  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // User Auth & Theme States
  const [currentUser, setCurrentUser] = useState<User | null>(() => getCurrentUser());
  const [appColorTheme, setAppColorTheme] = useState<AppTheme>(() => {
    const user = getCurrentUser();
    return user?.theme || 'default';
  });

  const [appColorPalette, setAppColorPalette] = useState<AppColorPalette>(() => {
    const user = getCurrentUser();
    return user?.colorPalette || (localStorage.getItem('app_color_palette') as AppColorPalette) || 'indigo';
  });

  // Modals - Automatically open auth modal on startup if not logged in
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(() => !getCurrentUser());
  // The welcome summary shows once a day; the navbar button can still open it again.
  const [isWelcomeModalOpen, setIsWelcomeModalOpen] = useState<boolean>(() => {
    if (!getCurrentUser()) return false;
    const key = `tm_welcome_${new Date().toLocaleDateString('en-CA')}`;
    try {
      if (localStorage.getItem(key) === '1') return false;
      localStorage.setItem(key, '1');
    } catch {
      // Storage blocked: show it as before.
    }
    return true;
  });
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [isResetPasswordModalOpen, setIsResetPasswordModalOpen] = useState<boolean>(false);

  // Detect password reset token from URL on startup
  useEffect(() => {
    const token = extractResetTokenFromURL();
    if (token) {
      setResetToken(token);
      setIsResetPasswordModalOpen(true);
      setIsAuthModalOpen(false);
    }
  }, []);

  const [activeTab, setActiveTab] = useState<ActiveTab>('kanban');
  const [isPageTransitioning, setIsPageTransitioning] = useState<boolean>(false);

  const handleNavigateTab = useCallback((nextTab: ActiveTab) => {
    if (nextTab === activeTab) return;
    setIsPageTransitioning(true);
    setActiveTab(nextTab);
    const timer = setTimeout(() => {
      setIsPageTransitioning(false);
    }, 240);
    return () => clearTimeout(timer);
  }, [activeTab]);

  const [showFilterBar, setShowFilterBar] = useState(false);
  // «نوار گروه‌بندی و تنظیمات نمای کارت»: open state, and the choices (remembered in this browser).
  const [showGroupingBar, setShowGroupingBar] = useState(false);
  const [boardView, setBoardView] = useState<BoardViewSettings>(loadBoardView);
  const handleBoardViewChange = useCallback((next: BoardViewSettings) => {
    setBoardView(next);
    saveBoardView(next);
  }, []);
  // The user guide opens only from the header's "?" button, never on its own.
  const [isUserGuideOpen, setIsUserGuideOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all');
  const [priorityFilter, setPriorityFilter] = useState<Priority | 'all'>('all');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');
  const [tagFilter, setTagFilter] = useState<string>('all');

  // Theme & Color Palette States
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    const user = getCurrentUser();
    return user?.themeMode || 'light';
  });

  // Handle color pattern theme selection (saved to the server)
  const handleSelectColorTheme = async (newTheme: AppTheme) => {
    setAppColorTheme(newTheme);
    if (currentUser) {
      setCurrentUser((prev) => (prev ? { ...prev, theme: newTheme } : null));
      await updateUserThemePB({ theme: newTheme, colorPalette: appColorPalette, themeMode });
    }
  };

  // Handle color palette selection (saved to the server)
  const handleSelectColorPalette = async (newPalette: AppColorPalette) => {
    setAppColorPalette(newPalette);
    localStorage.setItem('app_color_palette', newPalette);
    if (currentUser) {
      setCurrentUser((prev) => (prev ? { ...prev, colorPalette: newPalette } : null));
      await updateUserThemePB({ theme: appColorTheme, colorPalette: newPalette, themeMode });
    }
  };

  // Handle theme mode selection (Light/Dark - saved to the server)
  const handleSelectThemeMode = async (newMode: ThemeMode) => {
    setThemeMode(newMode);
    if (currentUser) {
      setCurrentUser((prev) => (prev ? { ...prev, themeMode: newMode } : null));
      await updateUserThemePB({ theme: appColorTheme, colorPalette: appColorPalette, themeMode: newMode });
    }
  };

  // Effect to toggle dark mode class on document element
  useEffect(() => {
    if (themeMode === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [themeMode]);

  // Modal states
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isNotificationModalOpen, setIsNotificationModalOpen] = useState(false);
  const [isPdfCatalogOpen, setIsPdfCatalogOpen] = useState(false);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [allTeams, setAllTeams] = useState<WorkTeam[]>([]);
  const [taskToEdit, setTaskToEdit] = useState<Task | null>(null);
  const [initialStatusForNewTask, setInitialStatusForNewTask] = useState<TaskStatus>('todo');
  const [initialDueDateForNewTask, setInitialDueDateForNewTask] = useState<string | undefined>(undefined);
  const [initialTitleForNewTask, setInitialTitleForNewTask] = useState<string>('');
  const [parentForNewTask, setParentForNewTask] = useState<{ id: string; title: string } | null>(null);
  const [initialDescriptionForNewTask, setInitialDescriptionForNewTask] = useState<string>('');
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null);

  // Load all users and teams for team views. The organization-wide
  // user list needs users.view - a restricted user (a plain task assignee/team member) does
  // not have it, so this only asks for it when the user actually holds the permission, instead
  // of firing a request that is bound to 403 on every Dashboard/Home load.
  const loadUsersAndTeams = useCallback(async () => {
    try {
      const [usersList, teamsList] = await Promise.all([
        can(currentUser, 'users.view') ? fetchAllUsersPB() : Promise.resolve(null),
        currentUser ? fetchUserTeamsAsyncPB(currentUser.id) : Promise.resolve(null),
      ]);
      if (usersList) {
        setAllUsers(usersList);
      } else if (currentUser) {
        setAllUsers([currentUser]);
      }
      if (teamsList) setAllTeams(teamsList);
    } catch (err) {
      console.warn('Could not load user/team context:', err);
    }
  }, [currentUser]);

  useEffect(() => {
    loadUsersAndTeams();
  }, [loadUsersAndTeams]);

  const handleTeamsUpdated = useCallback(async (updatedTeams?: WorkTeam[]) => {
    if (updatedTeams) {
      setAllTeams(updatedTeams);
    }
    await loadUsersAndTeams();
  }, [loadUsersAndTeams]);

  const [totalUnreadChatCount, setTotalUnreadChatCount] = useState<number>(0);

  useEffect(() => {
    if (!currentUser) {
      setTotalUnreadChatCount(0);
      return;
    }
    const checkUnread = async () => {
      // Direct conversations and team threads alike.
      const [counts, teamCounts] = await Promise.all([fetchUnreadMessageCountsPB(currentUser.id), fetchTeamUnreadCountsPB()]);
      const sum = [...Object.values(counts), ...Object.values(teamCounts)].reduce((a, b) => a + b, 0);
      setTotalUnreadChatCount(sum);
    };
    checkUnread();
    const interval = setInterval(checkUnread, 4000);
    return () => clearInterval(interval);
  }, [currentUser]);

  const [readNotificationIds, setReadNotificationIds] = useState<string[]>(() => {
    try {
      const userKey = getCurrentUser()?.id || 'guest';
      const saved = localStorage.getItem(`read_notifications_${userKey}`);
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  // Fetch tasks
  const loadTasks = useCallback(async (showLoadingSpinner = false) => {
    if (showLoadingSpinner) {
      setIsLoading(true);
    }
    setIsSyncing(true);
    setPbError(null);
    try {
      const fetched = await fetchTasksFromPB();
      const processed = fetched.map((t) => {
        if (t.isProject || t.isRecurring || (t.projectSubTasks && t.projectSubTasks.length > 0)) {
          return { ...t, status: computeAutoTaskStatus(t.projectSubTasks) };
        }
        return t;
      });
      setTasks(processed);
    } catch (error: any) {
      console.error('Error connecting to database:', error);
      setPbError(userErrorMessage(error, 'دریافت فعالیت‌ها از سرور انجام نشد. لطفاً دوباره تلاش کنید.'));
    } finally {
      setIsLoading(false);
      setIsSyncing(false);
    }
  }, []);

  // Load tasks & sync user profile on mount
  useEffect(() => {
    function syncUserAndTasks() {
      if (getCurrentUser()) {
        refreshCurrentUserPB().then((liveUser) => {
          if (!liveUser) return;
          setCurrentUser(liveUser);
          if (liveUser.theme) setAppColorTheme(liveUser.theme);
          if (liveUser.colorPalette) setAppColorPalette(liveUser.colorPalette);
          if (liveUser.themeMode) setThemeMode(liveUser.themeMode);
        }).catch((err) => console.warn('Could not refresh user profile:', err));
      }
      getUploadPolicy().then((policy) => setMaxAttachmentBytes(policy.maxFileSizeKb)).catch(() => {});
      loadTasks(true);
    }

    syncUserAndTasks();
  }, [loadTasks]);

  // Live task updates need a session: connect whenever someone is signed in (also right after
  // signing in, not only on a page load with a saved session) and disconnect on sign-out.
  const liveUserId = currentUser?.id;
  useEffect(() => {
    if (!liveUserId) return undefined;
    return subscribeToTasksPB(() => {
      loadTasks(false);
      // A post falling vacant (or filled) changes the substitution inbox, and whether its menu shows
      // (only where the inbox exists: it answered with tasks given to posts).
      const key = `${liveUserId}:substitution`;
      if (readLookup<SubstitutionInbox | null>(key)?.enabled) refreshLookup(key, getSubstitutionInbox).catch(() => {});
    });
  }, [loadTasks, liveUserId]);

  // The server ended the session (account disabled, tokens revoked): back to sign-in.
  useEffect(() => {
    const onSessionEnded = () => {
      setCurrentUser(null);
      setIsAuthModalOpen(true);
    };
    window.addEventListener(SESSION_ENDED_EVENT, onSessionEnded);
    return () => window.removeEventListener(SESSION_ENDED_EVENT, onSessionEnded);
  }, []);

  // Permissions can change while signed in (the server applies them at once); the menus follow
  // when the window is focused again.
  useEffect(() => {
    const onFocus = async () => {
      if (!getCurrentUser()) return;
      // The upload size limit can be changed by an admin at any time too.
      refreshUploadPolicy().catch(() => {});
      const liveUser = await refreshCurrentUserPB();
      if (liveUser) setCurrentUser((prev) => (prev ? { ...prev, permissions: liveUser.permissions } : prev));
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  // Route guard: a section the user may not open (e.g. after a permission was withdrawn) is left
  // for the first one they may.
  useEffect(() => {
    if (!canOpenTab(currentUser, activeTab)) setActiveTab(firstAllowedTab(currentUser));
  }, [currentUser, activeTab]);

  // «گزارش فعالیت‌ها» exists only where the backend offers task reports (they follow the
  // organization structure); elsewhere this answers 404 and the section stays hidden. The scope
  // (whose tasks, which positions and tags) is read once per signed-in user.
  // The last known scope is used at once (so the menu item does not appear late) and read
  // again in the background.
  const currentUserId = currentUser?.id;
  const mayViewTasks = can(currentUser, PERMISSIONS.tasksView);
  const reportScope = useLookup<ReportScope | null>(
    currentUserId && mayViewTasks ? `${currentUserId}:report-scope` : null, getReportScope, null).value;
  // Read once at sign-in, so «ساختار سازمانی» in the settings is there as soon as they open.
  useEffect(() => {
    if (currentUserId) refreshLookup(orgStructureLookupKey(currentUserId), isOrgStructureAvailable).catch(() => {});
  }, [currentUserId]);
  // «کارتابل جانشینی» exists only where tasks are given to posts, for those who may put a stand-in
  // in charge of a vacant post (or have one below them with open tasks).
  const substitution = useLookup<SubstitutionInbox | null>(
    currentUserId ? `${currentUserId}:substitution` : null, getSubstitutionInbox, null).value;
  const showSubstitution = !!substitution?.enabled && (substitution.canManageAll || substitution.posts.length > 0);
  const canOpenSection = useCallback(
    (tab: ActiveTab) => canOpenTab(currentUser, tab)
      && (tab !== 'reports' || reportScope !== null)
      && (tab !== 'substitution' || showSubstitution),
    [currentUser, reportScope, showSubstitution],
  );

  const canCreateTask = can(currentUser, PERMISSIONS.tasksCreate);

  // Handle Logout
  const handleLogout = () => {
    logoutPB();
    setCurrentUser(null);
    setIsAuthModalOpen(true);
    loadTasks(true);
  };

  // Handle successful login or signup
  const handleAuthSuccess = async () => {
    const user = await refreshCurrentUserPB() || getCurrentUser();
    setCurrentUser(user);
    if (user?.theme) {
      setAppColorTheme(user.theme);
    }
    if (user?.colorPalette) {
      setAppColorPalette(user.colorPalette);
    }
    if (user?.themeMode) {
      setThemeMode(user.themeMode);
    }
    setIsAuthModalOpen(false);
    setIsSettingsOpen(false);
    setIsWelcomeModalOpen(true);
    setActiveTab('kanban');
    loadTasks(true);
  };

  // Handle Save User Profile & Avatar
  const handleSaveProfile = async (updates: { name?: string; username?: string; avatar?: string }) => {
    const updatedUser = await updateUserProfilePB(updates);
    setCurrentUser((prev) => (updatedUser ? { ...updatedUser, permissions: prev?.permissions } : updatedUser));
  };

  // Create or Update Task
  const handleSaveTask = async (
    taskData: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>,
    taskId?: string
  ) => {
    setIsSyncing(true);
    try {
      if (taskId) {
        const oldTask = tasks.find((t) => t.id === taskId);

        // Set or clear actualCompletionDate on edit
        if (taskData.status === 'completed') {
          if (!taskData.actualCompletionDate) {
            taskData.actualCompletionDate = oldTask?.actualCompletionDate || new Date().toISOString();
          }
        } else {
          taskData.actualCompletionDate = undefined;
        }

        // Optimistic UI update
        setTasks((prev) =>
          prev.map((t) => (t.id === taskId ? { ...t, ...taskData, updatedAt: new Date().toISOString() } : t))
        );
        if (selectedTaskForDetail && selectedTaskForDetail.id === taskId) {
          setSelectedTaskForDetail((prev) => (prev ? { ...prev, ...taskData } : null));
        }
        const saved = await updateTaskInPB(taskId, taskData);
        setReportRefreshKey((k) => k + 1);
        // Show what the server saved (who is responsible, the access list...), not the form's copy.
        setTasks((prev) =>
          prev.map((t) => (t.id === taskId ? { ...saved, comments: saved.comments ?? t.comments, logs: saved.logs ?? t.logs } : t))
        );
        if (selectedTaskForDetail && selectedTaskForDetail.id === taskId) {
          setSelectedTaskForDetail((prev) => (prev ? { ...prev, ...saved } : null));
        }

        // One history entry (and bell notification) saying exactly what changed: compared with
        // what the server saved, so names and values are the real ones.
        if (currentUser) {
          const { action, details } = summarizeTaskChanges(
            oldTask ? describeTaskChanges(oldTask, saved, userNameLookup([oldTask, saved], allUsers, allTeams)) : [],
          );
          const newLog = await createTaskLogPB({
            taskId,
            userId: currentUser.id,
            userName: currentUser.name || currentUser.username,
            userAvatar: currentUser.avatar,
            action,
            details,
          });
          setTasks((prev) =>
            prev.map((t) => (t.id === taskId ? { ...t, logs: withoutEditDuplicates([newLog, ...(t.logs || [])]) } : t))
          );
        }
      } else {
        // Create on the server
        if (taskData.status === 'completed' && !taskData.actualCompletionDate) {
          taskData.actualCompletionDate = new Date().toISOString();
        }
        const created = await createTaskInPB(taskData);
        setReportRefreshKey((k) => k + 1);
        setTasks((prev) => [created, ...prev.filter((t) => t.id !== created.id)]);

        // Log creation action for notifications (notifies assignee and team members)
        if (currentUser) {
          const assigneeName = responsibleNamesOf(created) || responsibleNamesOf(taskData);
          const teamName = created.assignedTeamName || taskData.assignedTeamName;
          let detailsText = `فعالیت با عنوان "${created.title}" ایجاد شد.`;
          if (assigneeName || teamName) {
            const assignees = [assigneeName, teamName].filter(Boolean).join(' - ');
            detailsText = `فعالیت جدید با عنوان "${created.title}" ایجاد و به ${assignees} واگذار گردید.`;
          }

          const newLog = await createTaskLogPB({
            taskId: created.id,
            userId: currentUser.id,
            userName: currentUser.name || currentUser.username,
            userAvatar: currentUser.avatar,
            action: TASK_CREATED_ACTION,
            details: detailsText,
          });
          // It replaces the server's own short "created" entry (see withoutDuplicateCreation).
          setTasks((prev) =>
            prev.map((t) => (t.id === created.id ? { ...t, logs: [newLog, ...(t.logs || []).filter((l) => l.action !== TASK_CREATED_ACTION)] } : t))
          );
        }
      }
      setPbError(null);
    } catch (err: any) {
      console.error('Error saving task:', err);
      const errMsg = userErrorMessage(err, 'خطا در ذخیره‌سازی فعالیت');
      setPbError(errMsg);
      void appAlert(`خطا در ذخیره‌سازی:\n${errMsg}`);
      loadTasks(false);
    } finally {
      setIsSyncing(false);
    }
  };

  // Delete Task
  const handleDeleteTask = useCallback(async (taskId: string) => {
    const targetTask = tasks.find((t) => t.id === taskId);
    if (!(await appConfirm('آیا از حذف این فعالیت اطمینان دارید؟'))) return;
    
    // Log delete action before removing
    if (currentUser && taskId) {
      createTaskLogPB({
        taskId,
        userId: currentUser.id,
        userName: currentUser.name || currentUser.username,
        userAvatar: currentUser.avatar,
        action: 'حذف کامل فعالیت',
        details: `فعالیت "${targetTask?.title || taskId}" حذف گردید.`,
      }).catch(() => {});
    }

    // Optimistic delete
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    setGoneTaskIds((prev) => [...prev, taskId]);
    setIsSyncing(true);
    try {
      await deleteTaskFromPB(taskId);
      setReportRefreshKey((k) => k + 1);
      setPbError(null);
    } catch (err: any) {
      console.error('Error deleting task:', err);
      const errMsg = userErrorMessage(err, 'خطا در حذف فعالیت.');
      setPbError(errMsg);
      void appAlert(errMsg);
      loadTasks(false);
      setReportRefreshKey((k) => k + 1);
    } finally {
      setIsSyncing(false);
    }
  }, [tasks, currentUser, loadTasks]);

  // Advance a subtask through its own lifecycle: not started -> in progress -> completed -> not started.
  const handleToggleSubTask = useCallback(async (taskId: string, subTaskId: string) => {
    const targetTask = tasks.find((t) => t.id === taskId);
    if (!targetTask || !targetTask.projectSubTasks) return;

    const nowIso = new Date().toISOString();
    const updatedSubTasks = targetTask.projectSubTasks.map((st) => {
      if (st.id !== subTaskId) return st;
      const current = st.status || (st.completed ? 'completed' : 'not_started');
      const next: SubTaskProgress =
        current === 'not_started' ? 'in_progress' : current === 'in_progress' ? 'completed' : 'not_started';
      return {
        ...st,
        status: next,
        completed: next === 'completed',
        actualStartDate: next === 'not_started' ? st.actualStartDate : st.actualStartDate || nowIso,
        actualCompletedDate: next === 'completed' ? st.actualCompletedDate || nowIso : st.actualCompletedDate,
      };
    });

    const autoStatus = computeAutoTaskStatus(updatedSubTasks);

    let actualCompletionDate = targetTask.actualCompletionDate;
    if (autoStatus === 'completed') {
      actualCompletionDate = actualCompletionDate || new Date().toISOString();
    } else {
      actualCompletionDate = undefined;
    }

    // Optimistic update
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? { ...t, projectSubTasks: updatedSubTasks, status: autoStatus, actualCompletionDate, updatedAt: new Date().toISOString() }
          : t
      )
    );

    setSelectedTaskForDetail((prev) =>
      prev && prev.id === taskId ? { ...prev, projectSubTasks: updatedSubTasks, status: autoStatus, actualCompletionDate } : prev
    );
    setSelectedProjectTask((prev) =>
      prev && prev.id === taskId ? { ...prev, projectSubTasks: updatedSubTasks, status: autoStatus, actualCompletionDate } : prev
    );

    try {
      await updateTaskInPB(taskId, { projectSubTasks: updatedSubTasks, status: autoStatus, actualCompletionDate });
      setReportRefreshKey((k) => k + 1);
      setPbError(null);
    } catch (err: any) {
      console.error('Error toggling subtask:', err);
      loadTasks(false);
    }
  }, [tasks, loadTasks]);

  // Quick Change Status
  const handleStatusChange = useCallback(async (taskId: string, newStatus: TaskStatus) => {
    const targetTask = tasks.find((t) => t.id === taskId);
    if (!targetTask) return;

    // Prevent manual status change for projects or recurring tasks or tasks with subtasks
    if (targetTask.isProject || targetTask.isRecurring || (targetTask.projectSubTasks && targetTask.projectSubTasks.length > 0)) {
      return;
    }

    let actualCompletionDate = targetTask.actualCompletionDate;
    if (newStatus === 'completed') {
      actualCompletionDate = actualCompletionDate || new Date().toISOString();
    } else {
      actualCompletionDate = undefined;
    }

    // Optimistic status change
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status: newStatus, actualCompletionDate, updatedAt: new Date().toISOString() } : t))
    );
    setSelectedTaskForDetail((prev) =>
      prev && prev.id === taskId ? { ...prev, status: newStatus, actualCompletionDate } : prev
    );
    try {
      // The server's own status-change endpoint already records a clear "Status changed" log
      // entry with the before/after status; logging it again here only duplicated it.
      await updateTaskInPB(taskId, { status: newStatus, actualCompletionDate });
      setReportRefreshKey((k) => k + 1);
      setPbError(null);
    } catch (err: any) {
      console.error('Error updating task status:', err);
      const errMsg = userErrorMessage(err, 'خطا در تغییر وضعیت.');
      setPbError(errMsg);
      loadTasks(false);
    }
  }, [tasks, currentUser, loadTasks]);

  // Eisenhower matrix: dropping an entry on another quarter changes its priority and/or due date.
  // For a project's sub-activity (or a recurring occurrence) that is its importance and end date.
  const handleMatrixMove = useCallback(async (item: MatrixItem, patch: { priority?: Task['priority']; dueDate?: string }) => {
    const task = tasks.find((t) => t.id === item.task.id);
    if (!task) return;

    let updates: Partial<Task> = patch;
    if (item.subTaskId) {
      updates = {
        projectSubTasks: (task.projectSubTasks || []).map((st) => {
          if (st.id !== item.subTaskId) return st;
          const next = { ...st };
          if (patch.priority) next.importance = patch.priority;
          if (patch.dueDate) {
            next.endDate = patch.dueDate;
            // An end before the start is not a valid sub-activity.
            if (st.startDate && (parseDateSafely(st.startDate)?.getTime() ?? 0) > new Date(patch.dueDate).getTime()) next.startDate = patch.dueDate;
          }
          return next;
        }),
      };
    }

    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, ...updates, updatedAt: new Date().toISOString() } : t)));
    try {
      await updateTaskInPB(task.id, updates);
      setReportRefreshKey((k) => k + 1);
      setPbError(null);
    } catch (err: any) {
      console.error('Error moving task in the matrix:', err);
      setPbError(userErrorMessage(err, 'جابه‌جایی فعالیت در ماتریس انجام نشد.'));
      loadTasks(false);
    }
  }, [tasks, loadTasks]);

  // Task Detail & Discussion Modal State
  const [selectedTaskForDetail, setSelectedTaskForDetail] = useState<Task | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  // Project Detail Modal State
  const [selectedProjectTask, setSelectedProjectTask] = useState<Task | null>(null);
  const [isProjectDetailOpen, setIsProjectDetailOpen] = useState(false);

  const handleOpenTaskDetail = useCallback((task: Task) => {
    setSelectedTaskForDetail(task);
    setIsDetailModalOpen(true);
  }, []);

  const handleOpenProjectDetails = useCallback((task: Task) => {
    setSelectedProjectTask(task);
    setIsProjectDetailOpen(true);
  }, []);

  const handleUpdateProjectTask = async (taskId: string, updates: Partial<Task>) => {
    const targetTask = tasks.find((t) => t.id === taskId);
    const updatedSubTasks = updates.projectSubTasks ?? targetTask?.projectSubTasks;
    const isAuto = updates.isProject ?? targetTask?.isProject ?? updates.isRecurring ?? targetTask?.isRecurring ?? (updatedSubTasks && updatedSubTasks.length > 0);

    const finalUpdates = { ...updates };
    if (isAuto && updatedSubTasks) {
      finalUpdates.status = computeAutoTaskStatus(updatedSubTasks);
    }

    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, ...finalUpdates, updatedAt: new Date().toISOString() } : t))
    );
    if (selectedProjectTask && selectedProjectTask.id === taskId) {
      setSelectedProjectTask((prev) => (prev ? { ...prev, ...finalUpdates } : null));
    }
    if (selectedTaskForDetail && selectedTaskForDetail.id === taskId) {
      setSelectedTaskForDetail((prev) => (prev ? { ...prev, ...finalUpdates } : null));
    }

    try {
      await updateTaskInPB(taskId, finalUpdates);
      setReportRefreshKey((k) => k + 1);
    } catch (err) {
      console.error('Error syncing project details to server:', err);
    }
  };

  const handleUpdateComments = (taskId: string, comments: TaskComment[]) => {
    const nowIso = new Date().toISOString();
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, comments, updatedAt: nowIso } : t))
    );
    if (selectedTaskForDetail && selectedTaskForDetail.id === taskId) {
      setSelectedTaskForDetail((prev) => (prev ? { ...prev, comments, updatedAt: nowIso } : null));
    }

    saveTaskExtraMeta(taskId, { comments, updatedAt: nowIso });
  };

  // Open Form Modal for Creating New Task
  const handleOpenCreateModal = useCallback((
    status: TaskStatus = 'todo',
    isoDate?: string,
    initialTitle: string = '',
    initialDescription: string = '',
    parent?: { id: string; title: string }
  ) => {
    if (!can(currentUser, PERMISSIONS.tasksCreate)) return;
    setTaskToEdit(null);
    setInitialStatusForNewTask(status);
    setInitialDueDateForNewTask(isoDate || new Date().toISOString());
    setInitialTitleForNewTask(initialTitle);
    setInitialDescriptionForNewTask(initialDescription);
    setParentForNewTask(parent || null);
    setIsFormModalOpen(true);
  }, [currentUser]);

  // Handler to convert chat messages, activity comments, or personal notes into a new task
  const handleConvertToTask = useCallback((title: string, description?: string, parent?: { id: string; title: string }) => {
    handleOpenCreateModal('todo', undefined, title, description || '', parent);
  }, [handleOpenCreateModal]);

  // Open Form Modal for Editing Task
  const handleOpenEditModal = useCallback((task: Task) => {
    setTaskToEdit(task);
    setInitialDueDateForNewTask(undefined);
    setInitialTitleForNewTask('');
    setInitialDescriptionForNewTask('');
    setParentForNewTask(null);
    setIsFormModalOpen(true);
  }, []);

  // Task Visibility Rule: owner, responsible people and the task's access list - the same rule
  // the server applies. Every view (dashboard, board, calendar, chat) shows only these tasks.
  const visibleTasks = useMemo(() => {
    if (!currentUser) return tasks;
    return tasks.filter((task) => isTaskVisibleTo(task, currentUser));
  }, [tasks, currentUser]);

  const taskTitleById = useMemo(() => new Map(visibleTasks.map((t) => [t.id, t.title])), [visibleTasks]);

  // Current User Team Members for Assignee Filter
  const currentUserTeamMembers = useMemo(() => {
    if (!currentUser) return [];
    const teams = fetchUserTeamsPB(currentUser.id);
    const memberMap = new Map<string, { id: string; name: string; avatar?: string }>();
    memberMap.set(currentUser.id, {
      id: currentUser.id,
      name: (currentUser.name || currentUser.username) + ' (شما)',
      avatar: currentUser.avatar,
    });
    teams.forEach((t) => {
      t.members.forEach((m) => {
        if (!memberMap.has(m.userId)) {
          memberMap.set(m.userId, { id: m.userId, name: m.name, avatar: m.avatar });
        }
      });
    });
    return Array.from(memberMap.values());
  }, [currentUser]);

  // Registered Tags of Current User Tasks for Tag Filter
  const currentUserTags = useMemo(() => {
    const tagSet = new Set<string>();
    visibleTasks.forEach((t) => {
      if (t.tags && Array.isArray(t.tags)) {
        t.tags.forEach((tag) => {
          if (tag.trim()) tagSet.add(tag.trim());
        });
      }
    });
    return Array.from(tagSet);
  }, [visibleTasks]);

  // Filtered Tasks for UI
  const filteredTasks = useMemo(() => {
    return visibleTasks.filter((task) => {
      // Status filter
      if (statusFilter !== 'all' && task.status !== statusFilter) {
        return false;
      }
      // Priority filter
      if (priorityFilter !== 'all' && task.priority !== priorityFilter) {
        return false;
      }
      // Assignee filter
      if (assigneeFilter !== 'all') {
        if (assigneeFilter === 'unassigned') {
          if (responsibleIdsOf(task).length > 0) return false;
        } else if (!responsibleIdsOf(task).includes(assigneeFilter)) {
          return false;
        }
      }
      // Tag filter
      if (tagFilter !== 'all') {
        if (tagFilter === '__is_project') {
          if (!task.isProject) return false;
        } else if (tagFilter === '__is_recurring') {
          if (!task.isRecurring) return false;
        } else {
          if (!task.tags || !task.tags.includes(tagFilter)) {
            return false;
          }
        }
      }
      // Search query filter
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        const matchTitle = task.title.toLowerCase().includes(query);
        const matchDesc = task.description?.toLowerCase().includes(query);
        const matchAtt = task.attachments.some((att) =>
          att.name.toLowerCase().includes(query)
        );
        const matchTag = task.tags?.some((t) => t.toLowerCase().includes(query));
        if (!matchTitle && !matchDesc && !matchAtt && !matchTag) {
          return false;
        }
      }
      return true;
    }).sort((a, b) => {
      return getTaskLastModifiedTime(b) - getTaskLastModifiedTime(a);
    });
  }, [visibleTasks, statusFilter, priorityFilter, assigneeFilter, tagFilter, searchQuery]);

  const completedCount = visibleTasks.filter((t) => t.status === 'completed').length;
  const overdueCount = useMemo(() => {
    let count = 0;
    visibleTasks.forEach((t) => {
      if (t.status === 'completed' || t.status === 'paused') return;

      if (t.isRecurring) {
        if (t.projectSubTasks && t.projectSubTasks.length > 0) {
          t.projectSubTasks.forEach((st) => {
            if (st.completed) return;
            const stStatus = st.completed ? 'completed' : t.status;
            const stDueDate = st.endDate || st.startDate || t.dueDate;
            if (isOverdue(stDueDate, stStatus)) {
              count++;
            }
          });
        }
      } else {
        if (t.projectSubTasks && t.projectSubTasks.length > 0) {
          t.projectSubTasks.forEach((st) => {
            if (st.completed) return;
            const stStatus = st.completed ? 'completed' : t.status;
            const stDueDate = st.endDate || st.startDate || t.dueDate;
            if (isOverdue(stDueDate, stStatus)) {
              count++;
            }
          });
        } else {
          if (isOverdue(t.dueDate, t.status)) {
            count++;
          }
        }
      }
    });
    return count;
  }, [visibleTasks]);

  // Login Gating: If user is not authenticated, render locked landing screen and uncloseable login modal
  // Computed Notifications for Bell Icon & Notification Modal
  // A newer server stores the task notifications itself (the same list on every device, and
  // also for tasks the browser has not loaded); then the bell shows only those.
  const [serverTellsOfTasks, setServerTellsOfTasks] = useState(false);
  useEffect(() => {
    if (!currentUser) {
      setServerTellsOfTasks(false);
      return;
    }
    let cancelled = false;
    serverTellsOfTasksPB().then((value) => {
      if (!cancelled) setServerTellsOfTasks(value);
    });
    return () => {
      cancelled = true;
    };
  }, [currentUser?.id]);

  const appNotifications = useMemo<AppNotification[]>(() => {
    if (!currentUser || serverTellsOfTasks) return [];
    const items: AppNotification[] = [];

    visibleTasks.forEach((t) => {
      // Comments
      if (t.comments && Array.isArray(t.comments)) {
        t.comments.forEach((c) => {
          const notifId = `cmt_${c.id}`;
          const isOwnComment =
            (c.userId && c.userId === currentUser.id) ||
            (c.userName &&
              (c.userName.trim().toLowerCase() === (currentUser.name || '').trim().toLowerCase() ||
                c.userName.trim().toLowerCase() === (currentUser.username || '').trim().toLowerCase()));

          // The author of a comment never gets a notification for their own comment.
          if (isOwnComment) return;

          items.push({
            id: notifId,
            type: 'comment',
            taskId: t.id,
            taskTitle: t.title,
            actorName: c.userName || 'کاربر',
            actorAvatar: c.userAvatar,
            actionTitle: c.text,
            createdAt: c.createdAt,
            isRead: readNotificationIds.includes(notifId),
          });
        });
      }

      // Task logs / activity updates for ALL fields
      if (t.logs && Array.isArray(t.logs)) {
        t.logs.forEach((l) => {
          if (
            !l.action.includes('نظر') &&
            !l.action.includes('گفتگو') &&
            !l.action.includes('پیام')
          ) {
            const notifId = `log_${l.id}`;
            const isOwnLog =
              (l.userId && l.userId === currentUser.id) ||
              (l.userName &&
                (l.userName.trim().toLowerCase() === (currentUser.name || '').trim().toLowerCase() ||
                  l.userName.trim().toLowerCase() === (currentUser.username || '').trim().toLowerCase()));

            // The person who made the change never gets a notification for their own change.
            if (isOwnLog) return;

            items.push({
              id: notifId,
              type: 'task_log',
              taskId: t.id,
              taskTitle: t.title,
              actorName: l.userName || 'کاربر',
              actorAvatar: l.userAvatar,
              actionTitle: l.action,
              details: l.details,
              createdAt: l.createdAt,
              isRead: readNotificationIds.includes(notifId),
            });
          }
        });
      }
    });

    return items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [visibleTasks, currentUser, readNotificationIds, serverTellsOfTasks]);

  // Notifications stored by the server: fetched on sign-in, whenever tasks change (live), every
  // minute (reminders) and when the window is focused again; their read state lives on the server.
  const [serverNotifications, setServerNotifications] = useState<ServerNotificationDto[]>([]);
  const loadServerNotifications = useCallback(async () => {
    const list = await fetchServerNotificationsPB();
    if (list) setServerNotifications(list);
  }, []);

  useEffect(() => {
    if (!currentUser) {
      setServerNotifications([]);
      return;
    }
    loadServerNotifications();
    const timer = window.setInterval(loadServerNotifications, 60_000);
    window.addEventListener('focus', loadServerNotifications);
    const unsubscribe = subscribeToTasksPB(loadServerNotifications);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', loadServerNotifications);
      unsubscribe();
    };
  }, [currentUser?.id, loadServerNotifications]);

  // Tasks known to be gone (deleted here, or the server said 404 when a notification was opened):
  // their notifications are hidden, except the «deleted» notice itself.
  const [goneTaskIds, setGoneTaskIds] = useState<string[]>([]);
  const allNotifications = useMemo(
    () =>
      mergeNotifications(appNotifications, serverNotifications.map((n) => toAppNotification(n, visibleTasks))).filter(
        (n) => !n.taskId || !goneTaskIds.includes(n.taskId) || n.badge === 'حذف فعالیت'
      ),
    [appNotifications, serverNotifications, visibleTasks, goneTaskIds]
  );

  // «مشاهده فعالیت»: from the loaded tasks, else by id from the server; clear message when it cannot be opened.
  const openTaskFromNotification = useCallback(async (taskId: string) => {
    if (goneTaskIds.includes(taskId)) {
      showToast('این فعالیت حذف شده است.', 'error');
      return;
    }
    const loaded = tasks.find((t) => t.id === taskId);
    if (loaded) {
      handleOpenTaskDetail(loaded);
      return;
    }
    try {
      handleOpenTaskDetail(await fetchTaskByIdPB(taskId));
    } catch (err) {
      const status = err instanceof NexusApiError ? err.httpStatus : 0;
      if (status === 404) {
        setGoneTaskIds((prev) => [...prev, taskId]);
        showToast('این فعالیت حذف شده است.', 'error');
      } else if (status === 403) {
        showToast('به این فعالیت دسترسی ندارید.', 'error');
      } else {
        showToast('بارگذاری فعالیت انجام نشد. دوباره تلاش کنید.', 'error');
      }
    }
  }, [tasks, goneTaskIds, handleOpenTaskDetail]);

  const unreadNotificationsCount = useMemo(
    () => allNotifications.filter((n) => !n.isRead).length,
    [allNotifications]
  );

  // Tab title and app badge show the same number as the bell: unread notifications
  const totalBadgeCount = unreadNotificationsCount;

  // Sync total badge count with PWA App Badge API, Service Worker and Document Title
  useEffect(() => {
    const applyAppBadge = async () => {
      // 1. Document Title Badge
      if (typeof document !== 'undefined') {
        const baseTitle = `${PAGE_TITLES[activeTab] || 'بورد کانبان'} · مدیریت وظایف`;
        if (totalBadgeCount > 0) {
          document.title = `(${toPersianDigits(totalBadgeCount)}) ${baseTitle}`;
        } else {
          document.title = baseTitle;
        }
      }

      // 2. Native PWA Badging API (for installed Home Screen PWA)
      if (typeof navigator !== 'undefined') {
        if ('setAppBadge' in navigator) {
          try {
            if (totalBadgeCount > 0) {
              await navigator.setAppBadge(totalBadgeCount);
            } else if ('clearAppBadge' in navigator) {
              await navigator.clearAppBadge();
            }
          } catch (err) {
            console.debug('Could not set PWA app badge via navigator:', err);
          }
        }

        // 3. Send message to active Service Worker controller
        if (navigator.serviceWorker && navigator.serviceWorker.controller) {
          try {
            navigator.serviceWorker.controller.postMessage({
              type: 'SET_BADGE',
              count: totalBadgeCount,
            });
          } catch (e) {
            console.debug('SW badge postMessage error:', e);
          }
        }
      }
    };

    applyAppBadge();
  }, [totalBadgeCount, activeTab]);

  // Request notification permission on first user interaction if default (Required on iOS 16.4+ for PWA Home Screen Badges)
  useEffect(() => {
    const handleFirstUserInteraction = () => {
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        Notification.requestPermission().then((permission) => {
          if (permission === 'granted' && typeof navigator !== 'undefined' && 'setAppBadge' in navigator && totalBadgeCount > 0) {
            navigator.setAppBadge(totalBadgeCount).catch(() => {});
          }
        }).catch((err) => {
          console.debug('Notification permission request error:', err);
        });
      }
    };

    window.addEventListener('click', handleFirstUserInteraction, { once: true });
    window.addEventListener('touchstart', handleFirstUserInteraction, { once: true });

    return () => {
      window.removeEventListener('click', handleFirstUserInteraction);
      window.removeEventListener('touchstart', handleFirstUserInteraction);
    };
  }, [overdueCount]);

  const handleMarkNotificationAsRead = (notificationId: string) => {
    if (isServerNotificationId(notificationId)) {
      const key = serverNotificationKey(notificationId);
      if (serverNotifications.some((n) => n.id === key && n.isRead)) return;
      setServerNotifications((prev) => prev.map((n) => (n.id === key ? { ...n, isRead: true } : n)));
      markServerNotificationReadPB(key).catch(() => loadServerNotifications());
      return;
    }
    setReadNotificationIds((prev) => {
      if (prev.includes(notificationId)) return prev;
      const updated = [...prev, notificationId];
      const userKey = currentUser ? currentUser.id : 'guest';
      localStorage.setItem(`read_notifications_${userKey}`, JSON.stringify(updated));
      return updated;
    });
  };

  const handleMarkAllNotificationsAsRead = () => {
    if (serverNotifications.some((n) => !n.isRead)) {
      setServerNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      markAllServerNotificationsReadPB().catch(() => loadServerNotifications());
    }
    const allIds = appNotifications.map((n) => n.id);
    setReadNotificationIds(allIds);
    const userKey = currentUser ? currentUser.id : 'guest';
    localStorage.setItem(`read_notifications_${userKey}`, JSON.stringify(allIds));
  };

  if (!currentUser) {
    return (
      <div className={`min-h-screen bg-pattern-${appColorTheme || 'default'} palette-${appColorPalette || 'indigo'} text-slate-800 dark:text-slate-100 flex flex-col items-center justify-center p-4 relative overflow-hidden font-sans select-none`}>
        {/* Darkened backdrop blur overlay */}
        <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-xl z-0" />

        {/* Irregular Floating Small White Balls in Background */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
          <div className="absolute top-[12%] left-[10%] w-3.5 h-3.5 rounded-full bg-white shadow-[0_0_12px_rgba(255,255,255,0.9)] animate-float-1" />
          <div className="absolute top-[22%] right-[15%] w-5 h-5 rounded-full bg-white/90 shadow-[0_0_14px_rgba(255,255,255,0.9)] animate-float-2" />
          <div className="absolute bottom-[18%] left-[14%] w-4 h-4 rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.95)] animate-float-3" />
          <div className="absolute bottom-[28%] right-[18%] w-3 h-3 rounded-full bg-white/95 shadow-[0_0_8px_rgba(255,255,255,0.9)] animate-float-4" />
          <div className="absolute top-[52%] left-[6%] w-4.5 h-4.5 rounded-full bg-white/90 shadow-[0_0_12px_rgba(255,255,255,0.95)] animate-float-5" />
          <div className="absolute top-[8%] right-[32%] w-3 h-3 rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.9)] animate-float-3" />
          <div className="absolute bottom-[10%] right-[38%] w-5 h-5 rounded-full bg-white/85 shadow-[0_0_14px_rgba(255,255,255,0.85)] animate-float-1" />
          <div className="absolute top-[42%] right-[8%] w-2.5 h-2.5 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.95)] animate-float-4" />
          <div className="absolute bottom-[45%] left-[22%] w-3.5 h-3.5 rounded-full bg-white/95 shadow-[0_0_10px_rgba(255,255,255,0.9)] animate-float-2" />
        </div>

        {/* Ambient App Title Card in Background */}
        <div className="relative z-10 text-center max-w-sm mx-auto space-y-4 p-8 rounded-3xl bg-white/10 dark:bg-slate-900/50 border border-white/10 shadow-2xl backdrop-blur-md">
          <img 
            src="/tm-logo.png"
            alt="لوگو" 
            className="w-16 h-16 mx-auto rounded-2xl shadow-xl object-cover border border-white/20" 
          />
          <div>
            <h1 className="text-xl font-black text-white tracking-tight">سامانه مدیریت وظایف (TM)</h1>
            <p className="text-xs text-indigo-200/80 mt-1.5 leading-relaxed">
              جهت ورود به سیستم و دسترسی به اطلاعات، لطفاً حساب کاربری خود را وارد فرمایید.
            </p>
          </div>
          <div className="pt-3 border-t border-white/10 text-center space-y-1">
            <p className="text-xs font-bold text-white/90">
              تهیه شده توسط شرکت مدیریت پروژه پارس
            </p>
            <p className="text-[11px] font-medium text-indigo-200/80 flex items-center justify-center gap-2 dir-ltr">
              <span>پشتیبانی: ۸۸۷۳۱۶۰۱</span>
              <span className="text-white/30">|</span>
              <span>info@parspmi.ir</span>
            </p>
          </div>
        </div>

        {/* Auth Modal forced open & strictly uncloseable */}
        <AuthModal
          isOpen={true}
          canClose={false}
          onClose={() => {}}
          onSuccess={handleAuthSuccess}
          currentTheme={appColorTheme}
          onThemeSelect={handleSelectColorTheme}
        />
      </div>
    );
  }

  // App Initial Splash Screen with Spinning App Logo & Progress Bar
  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950 text-white font-sans dir-rtl select-none transition-opacity duration-300 overflow-hidden">
        {/* Subtle Ambient Background Lighting */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-[30%] left-[35%] w-96 h-96 rounded-full bg-indigo-600/20 blur-3xl animate-pulse" />
          <div className="absolute bottom-[30%] right-[35%] w-96 h-96 rounded-full bg-purple-600/20 blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        </div>

        {/* Central Logo Container */}
        <div className="relative flex flex-col items-center justify-center z-10 space-y-6">
          <div className="relative flex items-center justify-center">
            {/* Outer Soft Spinning Glow Ring */}
            <div 
              className="absolute -inset-6 rounded-full border-2 border-transparent border-t-indigo-500/90 border-r-purple-500/70 shadow-lg shadow-indigo-500/25 animate-smooth-spin" 
              style={{ animationDuration: '1.6s' }}
            />

            {/* Secondary Counter-rotating Accent Ring */}
            <div 
              className="absolute -inset-3 rounded-full border border-indigo-400/25 border-b-cyan-400/50 animate-smooth-spin" 
              style={{ animationDirection: 'reverse', animationDuration: '2.8s' }}
            />
            
            {/* Glowing Aura */}
            <div className="absolute inset-0 rounded-2xl bg-indigo-500/30 blur-xl animate-pulse" />

            {/* App Logo Image */}
            <div className="relative p-2 rounded-2xl bg-slate-900 border border-white/15 shadow-2xl">
              <img 
                src="/tm-logo.png"
                alt="لوگوی برنامه" 
                className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl object-cover shadow-md"
              />
            </div>
          </div>

          {/* Title & Loading Status */}
          <div className="text-center space-y-2 mt-6 sm:mt-8">
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center justify-center gap-2">
              مدیریت وظایف (TM)
            </h1>
            <p className="text-xs sm:text-sm font-medium text-indigo-200/90 animate-pulse">
              در حال بارگذاری داده‌ها و ورود به سامانه...
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <TaskTitleContext.Provider value={taskTitleById}>
    <div className={`min-h-dvh bg-pattern-${appColorTheme || 'default'} palette-${appColorPalette || 'indigo'} text-slate-800 dark:text-slate-100 flex flex-col font-sans transition-colors duration-200`}>
      
      {/* Startup Summary Welcome Modal (Priority 1 Overlay) */}
      {isWelcomeModalOpen && (
        <UserWelcomeModal
          isOpen={isWelcomeModalOpen}
          onClose={() => setIsWelcomeModalOpen(false)}
          currentUser={currentUser}
          tasks={visibleTasks}
          isLoading={isLoading}
          onNavigateToTab={(tab) => handleNavigateTab(tab)}
          onOpenTaskFilter={(filter) => {
            setIsWelcomeModalOpen(false);
            setShowFilterBar(true);
            if (filter === 'completed') {
              setStatusFilter('completed');
              setTagFilter('all');
            } else {
              setStatusFilter('all');
              setTagFilter('__is_project');
            }
            handleNavigateTab('kanban');
          }}
        />
      )}

      {/* Top Navbar */}
      <Navbar
        totalTasks={visibleTasks.length}
        completedTasks={completedCount}
        onToggleFilterBar={activeTab === 'kanban' ? () => setShowFilterBar((prev) => !prev) : undefined}
        isFilterBarOpen={showFilterBar}
        onToggleGroupingBar={activeTab === 'kanban' ? () => setShowGroupingBar((prev) => !prev) : undefined}
        isGroupingBarOpen={showGroupingBar}
        currentUser={currentUser}
        currentTheme={appColorTheme}
        appColorPalette={appColorPalette}
        onOpenAuthModal={() => setIsAuthModalOpen(true)}
        unreadNotificationsCount={unreadNotificationsCount}
        onOpenNotificationModal={() => setIsNotificationModalOpen(true)}
        onOpenWelcomeModal={() => setIsWelcomeModalOpen(true)}
        onOpenUserGuide={currentUser ? () => setIsUserGuideOpen(true) : undefined}
        onOpenSettings={currentUser ? () => handleNavigateTab('settings') : undefined}
      />

      {!isDesktopSidebarOpen && (
        <button
          type="button"
          onClick={handleToggleDesktopSidebar}
          title="باز کردن منوی سمت راست"
          aria-label="باز کردن منوی سمت راست"
          className="hidden lg:flex fixed right-0 top-1/2 -translate-y-1/2 z-20 w-7 h-20 flex-col items-center justify-center gap-1 rounded-l-xl border border-r-0 border-sky-200 bg-sky-50 text-indigo-700 shadow-[0_4px_10px_-5px_rgba(30,64,175,0.4)] hover:bg-sky-100 focus-visible:outline-2 focus-visible:outline-indigo-600 transition-colors cursor-pointer"
        >
          <PanelRightOpen className="w-4 h-4" />
          <span className="text-[10px] font-bold [writing-mode:vertical-rl]">منو</span>
        </button>
      )}

      {/* Main Container with Right Desktop Sidebar */}
      <div className="flex-1 w-full max-w-[1920px] mx-auto px-2 sm:px-3 lg:px-3 pt-4 pb-4">
        <div className="flex flex-col lg:flex-row gap-6 items-start">
          
          {/* Desktop Sidebar (Renders on Right Side in RTL) */}
          <DesktopSidebar
            activeTab={activeTab}
            setActiveTab={handleNavigateTab}
            onOpenCreateModal={canCreateTask ? () => handleOpenCreateModal('todo') : undefined}
            canOpenTab={canOpenSection}
            onOpenSettings={() => handleNavigateTab('settings')}
            onOpenPdfCatalog={() => setIsPdfCatalogOpen(true)}
            onLogout={handleLogout}
            overdueCount={overdueCount}
            unreadChatCount={totalUnreadChatCount}
            appColorPalette={appColorPalette}
            totalTasks={visibleTasks.length}
            completedTasks={completedCount}
            currentUser={currentUser}
            isOpen={isDesktopSidebarOpen}
            onToggleOpen={handleToggleDesktopSidebar}
          />


          {/* Main Content Workspace */}
          <main className="flex-1 w-full lg:w-auto min-w-0">
        
        {/* Error Alert */}
        {pbError && (
          <div className="mb-6 p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 text-amber-900 dark:text-amber-200 shadow-xs">
            <div className="flex items-start gap-3">
              <Database className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1 text-xs">
                <h4 className="font-bold text-sm text-amber-800 dark:text-amber-300">خطا در انجام عملیات</h4>
                <p className="leading-relaxed">{pbError}</p>
                <button
                  type="button"
                  onClick={() => { setPbError(null); loadTasks(true); }}
                  className="mt-1 px-3 py-1 rounded-lg border border-amber-400 bg-white dark:bg-amber-950 text-amber-800 dark:text-amber-200 text-xs font-bold hover:bg-amber-100 dark:hover:bg-amber-900 cursor-pointer"
                >
                  تلاش دوباره
                </button>
              </div>
            </div>
          </div>
        )}

        {/* FilterBar (Toggleable) */}
        {showFilterBar && activeTab === 'kanban' && !isPageTransitioning && (
          <FilterBar
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            priorityFilter={priorityFilter}
            setPriorityFilter={setPriorityFilter}
            assigneeFilter={assigneeFilter}
            setAssigneeFilter={setAssigneeFilter}
            tagFilter={tagFilter}
            setTagFilter={setTagFilter}
            teamMembers={currentUserTeamMembers}
            availableTags={currentUserTags}
            currentUser={currentUser}
          />
        )}

        {/* Grouping & card view bar (Toggleable) */}
        {showGroupingBar && activeTab === 'kanban' && !isPageTransitioning && (
          <BoardViewBar settings={boardView} onChange={handleBoardViewChange} onClose={() => setShowGroupingBar(false)} />
        )}

        {/* Page Switch Loading Spinner with Active Theme Color */}
        {isPageTransitioning ? (
          <PageViewLoader appColorPalette={appColorPalette} />
        ) : (
          <>
            {/* Tab 1: Kanban View */}
            {activeTab === 'kanban' && canOpenTab(currentUser, 'kanban') && (
              <div className="space-y-6">
                <KanbanBoard
                  tasks={filteredTasks}
                  currentUser={currentUser}
                  onOpenCreateForStatus={handleOpenCreateModal}
                  onEditTask={handleOpenEditModal}
                  onDeleteTask={handleDeleteTask}
                  onStatusChange={handleStatusChange}
                  onPreviewAttachment={setPreviewAttachment}
                  onViewDetails={handleOpenTaskDetail}
                  onOpenProjectDetails={handleOpenProjectDetails}
                  onToggleSubTask={handleToggleSubTask}
                  view={boardView}
                />
              </div>
            )}

            {/* Tab 2: Jalali Calendar View */}
            {activeTab === 'calendar' && canOpenTab(currentUser, 'calendar') && (
              <Suspense fallback={<PageViewLoader appColorPalette={appColorPalette} />}>
                <JalaliCalendarView
                  tasks={visibleTasks}
                  currentUser={currentUser}
                  onOpenCreateForDate={canCreateTask ? (isoDate) => handleOpenCreateModal('todo', isoDate) : undefined}
                  onEditTask={handleOpenEditModal}
                  onDeleteTask={handleDeleteTask}
                  onStatusChange={handleStatusChange}
                  onPreviewAttachment={setPreviewAttachment}
                  onViewDetails={handleOpenTaskDetail}
                />
              </Suspense>
            )}

            {/* Eisenhower matrix */}
            {activeTab === 'matrix' && canOpenTab(currentUser, 'matrix') && (
              <Suspense fallback={<PageViewLoader appColorPalette={appColorPalette} />}>
                <EisenhowerView
                  tasks={visibleTasks}
                  onViewDetails={handleOpenTaskDetail}
                  onMoveTask={handleMatrixMove}
                />
              </Suspense>
            )}

            {/* Tab 3: Overdue Tasks View */}
            {activeTab === 'overdue' && canOpenTab(currentUser, 'overdue') && (
              <Suspense fallback={<PageViewLoader appColorPalette={appColorPalette} />}>
                <OverdueTasksView
                  tasks={visibleTasks}
                  currentUser={currentUser}
                  onEditTask={handleOpenEditModal}
                  onDeleteTask={handleDeleteTask}
                  onStatusChange={handleStatusChange}
                  onPreviewAttachment={setPreviewAttachment}
                  onViewDetails={handleOpenTaskDetail}
                  onToggleSubTask={handleToggleSubTask}
                />
              </Suspense>
            )}

            {/* Task reports (only where the backend offers them) */}
            {activeTab === 'reports' && reportScope && canOpenTab(currentUser, 'reports') && (
              <Suspense fallback={<PageViewLoader appColorPalette={appColorPalette} />}>
                <ReportsView scope={reportScope} refreshKey={reportRefreshKey} visibleTasks={visibleTasks} onOpenTask={handleOpenTaskDetail} generatedBy={currentUser?.name || currentUser?.username} />
              </Suspense>
            )}

            {/* The substitution inbox (only where tasks are given to posts) */}
            {activeTab === 'substitution' && showSubstitution && (
              <Suspense fallback={<PageViewLoader appColorPalette={appColorPalette} />}>
                <SubstitutionInboxView onChanged={() => currentUserId && refreshLookup(`${currentUserId}:substitution`, getSubstitutionInbox).catch(() => {})} />
              </Suspense>
            )}

            {/* Tab 4: Team Chat View */}
            {activeTab === 'chat' && (
              <Suspense fallback={<PageViewLoader appColorPalette={appColorPalette} />}>
                <ErrorBoundary title="خطا در نمایش گفتگو">
                  <TeamChatView
                    currentUser={currentUser}
                    teams={allTeams}
                    appColorPalette={appColorPalette}
                    onConvertToTask={handleConvertToTask}
                    // The same tasks the dashboard shows: chat is never a way around the task rule.
                    tasks={visibleTasks}
                    onViewTaskDetails={handleOpenTaskDetail}
                  />
                </ErrorBoundary>
              </Suspense>
            )}

            {/* Tab 5: Personal Notes View */}
            {activeTab === 'notes' && canOpenTab(currentUser, 'notes') && (
              <Suspense fallback={<PageViewLoader appColorPalette={appColorPalette} />}>
                <PersonalNotesView
                  currentUser={currentUser}
                  appColorPalette={appColorPalette}
                  onConvertToTask={handleConvertToTask}
                />
              </Suspense>
            )}

            {/* Tab 6: Settings View */}
            {activeTab === 'settings' && (
              <Suspense fallback={<PageViewLoader appColorPalette={appColorPalette} />}>
                <SettingsView
                  themeMode={themeMode}
                  setThemeMode={handleSelectThemeMode}
                  appColorTheme={appColorTheme}
                  setAppColorTheme={handleSelectColorTheme}
                  appColorPalette={appColorPalette}
                  setAppColorPalette={handleSelectColorPalette}
                  totalTasksCount={visibleTasks.length}
                  currentUser={currentUser}
                  onLogout={handleLogout}
                  onOpenAuthModal={() => setIsAuthModalOpen(true)}
                  onSaveProfile={handleSaveProfile}
                  onTeamsUpdated={handleTeamsUpdated}
                  onOpenPdfCatalog={() => setIsPdfCatalogOpen(true)}
                  onBackToKanban={() => handleNavigateTab('kanban')}
                />
              </Suspense>
            )}
          </>
        )}

          </main>
        </div>
      </div>

      {/* Footer Card Box styled like header: right after the content on long pages; on short
          pages the flex-1 main container above pushes it to the bottom of the screen. While the
          fixed desktop sidebar is open, it sits in the main column (sidebar 12rem + gap 1.5rem +
          page padding 0.75rem) so the sidebar never covers it. */}
      <footer className={`w-full max-w-[1920px] mx-auto px-2 sm:px-3 lg:px-3 pt-6 pb-24 lg:pt-3 lg:pb-3 ${isDesktopSidebarOpen ? 'lg:pr-[14.25rem]' : ''}`}>
        <div className="ui-bar bg-slate-900 text-white rounded-2xl p-4 lg:py-3 border border-slate-800 shadow-md flex flex-col sm:flex-row items-center justify-center gap-3 text-center text-xs select-none">
          <span className="font-bold tracking-tight text-white/95">
            تمام حقوق برای شرکت مدیریت پروژه پارس محفوظ است
          </span>
        </div>
      </footer>

      <ToastHost />
      <Suspense fallback={null}>
        {/* Form Modal for Add/Edit Task */}
        {isFormModalOpen && (
          <TaskFormModal
            isOpen={isFormModalOpen}
            onClose={() => setIsFormModalOpen(false)}
            onSave={handleSaveTask}
            taskToEdit={taskToEdit}
            initialStatus={initialStatusForNewTask}
            initialDueDate={initialDueDateForNewTask}
            initialTitle={initialTitleForNewTask}
            initialDescription={initialDescriptionForNewTask}
            parentTask={parentForNewTask}
            appColorPalette={appColorPalette}
            currentUser={currentUser}
            existingTasks={visibleTasks}
            registeredUsers={allUsers}
          />
        )}

        {/* Task Detail & Discussion Modal */}
        {isDetailModalOpen && (
          <TaskDetailModal
            isOpen={isDetailModalOpen}
            task={selectedTaskForDetail}
            currentUser={currentUser}
            onClose={() => setIsDetailModalOpen(false)}
            onEditTask={handleOpenEditModal}
            onDeleteTask={handleDeleteTask}
            onStatusChange={handleStatusChange}
            onUpdateComments={handleUpdateComments}
            onPreviewAttachment={setPreviewAttachment}
            onOpenProjectDetails={handleOpenProjectDetails}
            onToggleSubTask={handleToggleSubTask}
            onConvertToTask={handleConvertToTask}
          />
        )}

        {/* Project Detail Modal (3 Tabs: Charter, Subtasks, Weighted Dashboard) */}
        {isProjectDetailOpen && (
          <ProjectDetailModal
            isOpen={isProjectDetailOpen}
            task={selectedProjectTask}
            onClose={() => setIsProjectDetailOpen(false)}
            onUpdateTask={handleUpdateProjectTask}
            appColorPalette={appColorPalette}
          />
        )}

        {/* Attachment Lightbox / Preview Modal */}
        {previewAttachment && (
          <AttachmentPreviewModal
            attachment={previewAttachment}
            onClose={() => setPreviewAttachment(null)}
          />
        )}

        {/* Settings Modal */}
        {isSettingsOpen && (
          <SettingsModal
            isOpen={isSettingsOpen}
            onClose={() => setIsSettingsOpen(false)}
            themeMode={themeMode}
            setThemeMode={handleSelectThemeMode}
            appColorTheme={appColorTheme}
            setAppColorTheme={handleSelectColorTheme}
            appColorPalette={appColorPalette}
            setAppColorPalette={handleSelectColorPalette}
            totalTasksCount={tasks.length}
            currentUser={currentUser}
            onLogout={handleLogout}
            onOpenAuthModal={() => setIsAuthModalOpen(true)}
            onSaveProfile={handleSaveProfile}
            onTeamsUpdated={handleTeamsUpdated}
            onOpenPdfCatalog={() => setIsPdfCatalogOpen(true)}
          />
        )}

        {/* Auth Modal (Login / Sign Up) */}
        {isAuthModalOpen && (
          <AuthModal
            isOpen={isAuthModalOpen}
            canClose={true}
            onClose={() => setIsAuthModalOpen(false)}
            onSuccess={handleAuthSuccess}
            currentTheme={appColorTheme}
            onThemeSelect={handleSelectColorTheme}
            onOpenResetWithToken={() => {
              setIsAuthModalOpen(false);
              setIsResetPasswordModalOpen(true);
            }}
          />
        )}

        {/* Reset Password Modal (Confirm Password Reset) */}
        {isResetPasswordModalOpen && (
          <ResetPasswordModal
            isOpen={isResetPasswordModalOpen}
            onClose={() => setIsResetPasswordModalOpen(false)}
            initialToken={resetToken}
            onSuccessLogin={() => {
              setIsResetPasswordModalOpen(false);
              setIsAuthModalOpen(true);
            }}
          />
        )}

        {/* Notifications & Alerts Modal */}
        {isUserGuideOpen && (
          <UserGuideModal isOpen={isUserGuideOpen} onClose={() => setIsUserGuideOpen(false)} currentUser={currentUser} />
        )}

        {isNotificationModalOpen && (
          <NotificationModal
            isOpen={isNotificationModalOpen}
            onClose={() => setIsNotificationModalOpen(false)}
            notifications={allNotifications}
            onMarkAsRead={handleMarkNotificationAsRead}
            onMarkAllAsRead={handleMarkAllNotificationsAsRead}
            onSelectTask={openTaskFromNotification}
            appColorPalette={appColorPalette}
          />
        )}

        {/* PDF Feature Catalog Modal */}
        {isPdfCatalogOpen && (
          <FeatureListPdfModal
            isOpen={isPdfCatalogOpen}
            onClose={() => setIsPdfCatalogOpen(false)}
          />
        )}
      </Suspense>

      {/* Bottom Floating Sandwich Bar */}
      <SandwichBar
        activeTab={activeTab}
        setActiveTab={handleNavigateTab}
        onOpenCreateModal={canCreateTask ? () => handleOpenCreateModal('todo') : undefined}
        canOpenTab={canOpenSection}
        onOpenSettings={() => setIsSettingsOpen(true)}
        overdueCount={overdueCount}
        unreadChatCount={totalUnreadChatCount}
        appColorPalette={appColorPalette}
      />


    </div>
    </TaskTitleContext.Provider>
  );
}

