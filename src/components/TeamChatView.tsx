import React, { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react';
import {
  MessageSquare,
  Send,
  User as UserIcon,
  Search,
  Paperclip,
  CheckCircle,
  Clock,
  ChevronRight,
  ShieldAlert,
  Users,
  X,
  FileText,
  Globe,
  CheckSquare,
  Pencil,
  Trash2,
  Check,
  Copy,
  ExternalLink,
  ChevronDown,
  CornerUpLeft,
} from 'lucide-react';
import { User, WorkTeam, DirectMessage, AppColorPalette, Task, TaskStatus, STATUSES, PRIORITIES, MAX_ATTACHMENT_BYTES, MAX_ATTACHMENT_LABEL } from '../types';
import { toPersianDigits, formatTime24h, formatToJalali } from '../utils/helpers';
import { COLOR_PALETTES } from '../utils/theme';
import { responsibleIdsOf, responsibleNamesOf } from '../utils/taskPeople';
import {
  fetchDirectMessagesPB,
  sendDirectMessagePB,
  markDirectMessagesAsReadPB,
  fetchUnreadMessageCountsPB,
  fetchChatDirectoryPB,
  updateDirectMessagePB,
  deleteDirectMessagePB,
  fetchTeamMessagesPB,
  sendTeamMessagePB,
  markTeamMessagesReadPB,
  fetchTeamUnreadCountsPB,
  fetchPresencePB,
} from '../services/dataService';
import { userErrorMessage } from '../utils/errorMessages';
import { canSeeWorkTeams } from '../utils/permissions';
import { EmojiButton, VoiceButton, isVoiceName, containsEmoji } from './ChatExtras';
import { ReplyRef, splitReply, withReply } from '../utils/chatReply';
import { useMyPermissions } from './admin/SystemAdministration';
import { isAllowedUploadFile, UPLOAD_TYPE_ERROR_MESSAGE, ALLOWED_UPLOAD_ACCEPT } from '../utils/uploadPolicy';
import { appAlert, appConfirm } from '../utils/appDialog';

interface TeamChatViewProps {
  currentUser: User | null;
  teams: WorkTeam[];
  appColorPalette?: AppColorPalette;
  onConvertToTask?: (title: string, description?: string) => void;
  tasks?: Task[];
  onViewTaskDetails?: (task: Task) => void;
}

export interface ChatContact {
  userId: string;
  name: string;
  username: string;
  avatar?: string;
  role?: string;
  isExternal: boolean;
}

export const TeamChatView: React.FC<TeamChatViewProps> = ({
  currentUser,
  teams: allTeams,
  appColorPalette = 'indigo',
  onConvertToTask,
  tasks = [],
  onViewTaskDetails,
}) => {
  const palette = COLOR_PALETTES[appColorPalette] || COLOR_PALETTES.indigo;

  // Team conversations belong to the work-team feature: without its permissions the user has
  // none, even of teams they are in (the server refuses them too).
  const permissions = useMyPermissions(currentUser.id);
  const teamsAllowed = canSeeWorkTeams(permissions);
  const teams = useMemo(() => (teamsAllowed ? allTeams : []), [teamsAllowed, allTeams]);

  // The open conversation: a team's shared thread, or a direct one with a person. Never both.
  const [activeTeamChatId, setActiveTeamChatId] = useState<string | null>(null);
  const [activePartnerId, setActivePartnerId] = useState<string | null>(null);
  const openTeamChat = (teamId: string) => {
    setActivePartnerId(null);
    setActiveTeamChatId(teamId);
  };
  const openDirectChat = (userId: string) => {
    setActiveTeamChatId(null);
    setActivePartnerId(userId);
  };
  const closeConversation = () => {
    setActiveTeamChatId(null);
    setActivePartnerId(null);
  };
  // The task drawer's "current team" scope follows the open team thread.
  const selectedTeamId = activeTeamChatId || 'external_all';

  // All system users fetched from database
  const [allSystemUsers, setAllSystemUsers] = useState<User[]>([]);

  // Messages in active conversation
  const [messages, setMessages] = useState<DirectMessage[]>([]);

  // Input message text
  const [inputMessage, setInputMessage] = useState<string>('');

  // Task & Activity Description Drawer states
  const [showTaskDrawer, setShowTaskDrawer] = useState<boolean>(false);
  const [taskFilterScope, setTaskFilterScope] = useState<'partner' | 'team' | 'all'>('partner');
  const [taskSearchQuery, setTaskSearchQuery] = useState<string>('');
  const [taskStatusFilter, setTaskStatusFilter] = useState<string>('all');
  const [copiedTaskId, setCopiedTaskId] = useState<string | null>(null);

  // Unread badge counts: per person (direct) and per team (team threads)
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [teamUnreadCounts, setTeamUnreadCounts] = useState<Record<string, number>>({});

  // Online (true) / offline (false) from the server; a user missing here is unknown.
  const [presence, setPresence] = useState<Record<string, boolean>>({});

  // Search filter for member list
  const [memberSearch, setMemberSearch] = useState<string>('');

  // Attached file payload
  const [attachedFile, setAttachedFile] = useState<{ name: string; url: string } | null>(null);

  // Loading and sending state
  const [isLoadingMessages, setIsLoadingMessages] = useState<boolean>(false);
  const [isSending, setIsSending] = useState<boolean>(false);
  const [sendError, setSendError] = useState<string | null>(null);

  // Message Editing State
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState<string>('');
  const [replyTo, setReplyTo] = useState<ReplyRef | null>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  const handleStartEdit = (msg: DirectMessage) => {
    setEditingMessageId(msg.id);
    setEditingText(splitReply(msg.text).body);
  };

  const handleCancelEdit = () => {
    setEditingMessageId(null);
    setEditingText('');
  };

  const handleSaveEdit = async (messageId: string) => {
    const msg = messages.find((m) => m.id === messageId);
    if (!msg || msg.senderId !== currentUser?.id) return;
    if (!editingText.trim()) return;
    const newText = withReply(splitReply(msg.text).reply, editingText.trim());
    try {
      await updateDirectMessagePB(messageId, newText);
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, text: newText } : m))
      );
      setEditingMessageId(null);
      setEditingText('');
    } catch (err) {
      setSendError(userErrorMessage(err, 'ویرایش پیام انجام نشد. لطفاً دوباره تلاش کنید.'));
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    const msg = messages.find((m) => m.id === messageId);
    if (!msg || msg.senderId !== currentUser?.id) return;
    if (!(await appConfirm('آیا از حذف این پیام اطمینان دارید؟'))) return;
    try {
      await deleteDirectMessagePB(messageId);
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    } catch (err) {
      setSendError(userErrorMessage(err, 'حذف پیام انجام نشد. لطفاً دوباره تلاش کنید.'));
    }
  };

  // ---- Scrolling: only the message list scrolls, never the page ----------------------------
  const listRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef<boolean>(true);
  const lastMessageIdRef = useRef<string | null>(null);
  const scrollOnNextRenderRef = useRef<'instant' | 'smooth' | null>(null);
  const [newMessagesCount, setNewMessagesCount] = useState<number>(0);

  const scrollListToBottom = (behavior: ScrollBehavior = 'smooth') => {
    const list = listRef.current;
    if (!list) return;
    if (typeof list.scrollTo === 'function') list.scrollTo({ top: list.scrollHeight, behavior });
    else list.scrollTop = list.scrollHeight;
    nearBottomRef.current = true;
    setNewMessagesCount(0);
  };

  const handleListScroll = () => {
    const list = listRef.current;
    if (!list) return;
    nearBottomRef.current = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
    if (nearBottomRef.current) setNewMessagesCount(0);
  };

  // After each change of the list: a newly opened conversation starts at its last message; a
  // message of mine goes to the end; others' new messages follow only a reader who is at the
  // end - someone reading older messages stays put and gets a "new message" indicator instead.
  useLayoutEffect(() => {
    const last = messages.length > 0 ? messages[messages.length - 1] : null;
    const lastId = last?.id ?? null;
    const pending = scrollOnNextRenderRef.current;
    if (pending) {
      scrollOnNextRenderRef.current = null;
      scrollListToBottom(pending === 'instant' ? 'auto' : 'smooth');
    } else if (lastId && lastId !== lastMessageIdRef.current && lastMessageIdRef.current !== null) {
      if (last!.senderId === currentUser?.id || nearBottomRef.current) {
        scrollListToBottom('smooth');
      } else {
        const previousIndex = messages.findIndex((m) => m.id === lastMessageIdRef.current);
        setNewMessagesCount((n) => n + (previousIndex >= 0 ? messages.length - 1 - previousIndex : 1));
      }
    }
    lastMessageIdRef.current = lastId;
  }, [messages]);

  // Load all system users with cache-first approach
  useEffect(() => {
    let isMounted = true;

    // Load from local cache instantly to speed up initial rendering
    try {
      const raw = localStorage.getItem('parstask_managed_users_v2');
      if (raw) {
        const cached = JSON.parse(raw);
        if (Array.isArray(cached) && cached.length > 0) {
          setAllSystemUsers(cached);
        }
      }
    } catch (e) {
      console.warn('Failed to parse local users cache in chat view:', e);
    }

    // Chat's own directory - every active user of the tenant, reachable for direct chat
    // regardless of whether they hold users.view (an administrative permission chat does not need).
    fetchChatDirectoryPB().then((users) => {
      if (isMounted) {
        setAllSystemUsers(users);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  // The open team thread's team
  const activeTeam = activeTeamChatId ? teams.find((t) => t.id === activeTeamChatId) || null : null;

  // Everyone I share a team with (for the "هم‌تیمی" label only - it does not limit who I can write to)
  const teammateIds = useMemo(() => {
    const ids = new Set<string>();
    teams.forEach((t) => t.members.forEach((m) => ids.add(m.userId)));
    return ids;
  }, [teams]);

  // People for direct conversations: every active user, team members included.
  const contacts: ChatContact[] = useMemo(() => {
    const map = new Map<string, ChatContact>();
    allSystemUsers.forEach((u) => {
      if (u.id === currentUser?.id || u.disabled) return;
      map.set(u.id, {
        userId: u.id,
        name: u.name || u.username,
        username: u.username,
        avatar: u.avatar,
        role: teammateIds.has(u.id) ? 'هم‌تیمی' : undefined,
        isExternal: !teammateIds.has(u.id),
      });
    });
    // Team members the user list does not hold (e.g. without users.view).
    teams.forEach((t) =>
      t.members.forEach((m) => {
        if (m.userId !== currentUser?.id && !map.has(m.userId)) {
          map.set(m.userId, { userId: m.userId, name: m.name, username: m.username, avatar: m.avatar, role: 'هم‌تیمی', isExternal: false });
        }
      })
    );
    // Senders of unread messages even if not in the list
    Object.keys(unreadCounts).forEach((senderId) => {
      if (senderId !== currentUser?.id && !map.has(senderId)) {
        map.set(senderId, { userId: senderId, name: 'کاربر', username: 'user_' + senderId.slice(-4), isExternal: true });
      }
    });
    return Array.from(map.values());
  }, [allSystemUsers, currentUser, teams, teammateIds, unreadCounts]);

  const filteredContacts = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    return contacts
      .filter((c) => !q || c.name.toLowerCase().includes(q) || (c.username || '').toLowerCase().includes(q))
      .sort(
        (a, b) =>
          (unreadCounts[b.userId] || 0) - (unreadCounts[a.userId] || 0) ||
          Number(presence[b.userId] === true) - Number(presence[a.userId] === true) ||
          a.name.localeCompare(b.name, 'fa')
      );
  }, [contacts, memberSearch, unreadCounts, presence]);

  const filteredTeams = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    return teams.filter((t) => !q || t.name.toLowerCase().includes(q));
  }, [teams, memberSearch]);

  // Active partner contact details
  const activePartner: ChatContact | null = useMemo(() => {
    if (!activePartnerId) return null;
    return (
      contacts.find((c) => c.userId === activePartnerId) || {
        userId: activePartnerId,
        name: 'کاربر',
        username: 'user_' + activePartnerId.slice(-4),
        isExternal: true,
      }
    );
  }, [activePartnerId, contacts]);

  const conversationTitle = activeTeam ? activeTeam.name : activePartner?.name || '';
  const hasConversation = !!activeTeam || !!activePartner;

  // Calculate relevant tasks for active partner and current team
  const relevantTasks = useMemo(() => {
    if (!tasks || tasks.length === 0) return [];

    return tasks.filter((t) => {
      // Status filter
      if (taskStatusFilter !== 'all' && t.status !== taskStatusFilter) {
        return false;
      }

      // Search filter on title and description
      if (taskSearchQuery.trim()) {
        const q = taskSearchQuery.trim().toLowerCase();
        const matchesTitle = t.title.toLowerCase().includes(q);
        const matchesDesc = (t.description || '').toLowerCase().includes(q);
        if (!matchesTitle && !matchesDesc) return false;
      }

      // Scope filter
      if (taskFilterScope === 'partner' && activePartnerId) {
        return (
          responsibleIdsOf(t).includes(activePartnerId) ||
          t.user === activePartnerId ||
          (t.teamMemberIds && t.teamMemberIds.includes(activePartnerId))
        );
      }

      if (taskFilterScope === 'team' && selectedTeamId !== 'external_all') {
        const teamObj = teams.find((tm) => tm.id === selectedTeamId);
        const isAssignedToTeam = t.assignedTeamId === selectedTeamId;
        const isAssignedToMember = teamObj?.members.some((m) => responsibleIdsOf(t).includes(m.userId));
        return isAssignedToTeam || isAssignedToMember;
      }

      // Default or 'all'
      return true;
    });
  }, [tasks, activePartnerId, selectedTeamId, taskFilterScope, taskSearchQuery, taskStatusFilter, teams]);

  // Total count of tasks related to active partner
  const partnerTasksCount = useMemo(() => {
    if (!tasks || !activePartnerId) return 0;
    return tasks.filter(
      (t) =>
        responsibleIdsOf(t).includes(activePartnerId) ||
        t.user === activePartnerId ||
        (t.teamMemberIds && t.teamMemberIds.includes(activePartnerId))
    ).length;
  }, [tasks, activePartnerId]);

  // Insert task title and description directly into the chat input
  const handleInsertTaskIntoChat = (task: Task) => {
    const descText = task.description && task.description.trim() ? task.description.trim() : 'بدون توضیحات';
    const quote = `📌 [فعالیت: ${task.title}]\n📝 توضیحات: ${descText}\n`;
    setInputMessage((prev) => (prev.trim() ? `${prev}\n\n${quote}` : quote));
  };

  // Copy task description to clipboard
  const handleCopyTaskDescription = (task: Task) => {
    const textToCopy = task.description && task.description.trim()
      ? `فعالیت: ${task.title}\nتوضیحات:\n${task.description}`
      : `فعالیت: ${task.title}\n(بدون توضیحات ثبت‌شده)`;
    navigator.clipboard.writeText(textToCopy);
    setCopiedTaskId(task.id);
    setTimeout(() => setCopiedTaskId(null), 2000);
  };

  // 1. Unread counts, per person and per team (cache-first, refreshed every few seconds)
  useEffect(() => {
    if (!currentUser) return;

    const cacheKey = `parstask_unread_counts_${currentUser.id}`;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        setUnreadCounts(JSON.parse(cached));
      }
    } catch (err) {}

    const loadUnread = async () => {
      const counts = await fetchUnreadMessageCountsPB(currentUser.id);
      setUnreadCounts(counts);
      try {
        localStorage.setItem(cacheKey, JSON.stringify(counts));
      } catch (err) {}
      setTeamUnreadCounts(await fetchTeamUnreadCountsPB().catch(() => ({})));
    };

    loadUnread();
    const interval = setInterval(loadUnread, 4000);
    return () => clearInterval(interval);
  }, [currentUser?.id]);

  // 2. Presence of the people listed (and the open partner): from the server's live connections.
  const presenceIds = useMemo(() => {
    const ids = new Set(filteredContacts.slice(0, 150).map((c) => c.userId));
    if (activePartnerId) ids.add(activePartnerId);
    activeTeam?.members.forEach((m) => ids.add(m.userId));
    return Array.from(ids).sort();
  }, [filteredContacts, activePartnerId, activeTeam]);
  const presenceKey = presenceIds.join(',');

  useEffect(() => {
    if (!currentUser || presenceIds.length === 0) return;
    let isMounted = true;
    const load = () =>
      fetchPresencePB(presenceIds)
        .then((p) => isMounted && setPresence((prev) => ({ ...prev, ...p })))
        .catch(() => undefined);
    load();
    const interval = setInterval(load, 15000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [currentUser?.id, presenceKey]);

  // 3. The open conversation's messages: loaded when it opens, then refreshed every few seconds.
  const conversationKey = activeTeamChatId ? `team:${activeTeamChatId}` : activePartnerId ? `user:${activePartnerId}` : '';

  useEffect(() => {
    lastMessageIdRef.current = null;
    nearBottomRef.current = true;
    setNewMessagesCount(0);
    setSendError(null);

    if (!currentUser || !conversationKey) {
      setMessages([]);
      return;
    }

    let isMounted = true;
    const teamId = activeTeamChatId;
    const partnerId = activePartnerId;
    const cacheKey = teamId ? `parstask_team_chat_${currentUser.id}_${teamId}` : `parstask_chat_${currentUser.id}_${partnerId}`;
    const fetchMessages = () => (teamId ? fetchTeamMessagesPB(teamId) : fetchDirectMessagesPB(currentUser.id, partnerId!));
    const markRead = async () => {
      if (teamId) {
        await markTeamMessagesReadPB(teamId);
        setTeamUnreadCounts((prev) => ({ ...prev, [teamId]: 0 }));
      } else {
        await markDirectMessagesAsReadPB(partnerId!, currentUser.id);
        setUnreadCounts((prev) => ({ ...prev, [partnerId!]: 0 }));
      }
    };

    // Cached messages first, opened at the last one
    let hasCache = false;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        scrollOnNextRenderRef.current = 'instant';
        setMessages(JSON.parse(cached));
        hasCache = true;
      } else {
        setMessages([]);
      }
    } catch (err) {
      setMessages([]);
    }

    const loadChat = async () => {
      if (!hasCache) setIsLoadingMessages(true);
      try {
        const data = await fetchMessages();
        if (!isMounted) return;
        if (!hasCache) scrollOnNextRenderRef.current = 'instant';
        // The loading flag clears in the same commit as the messages: React can otherwise
        // flush a render where the messages have arrived but the spinner is still up (marking
        // read is awaited below), and the scroll-to-bottom effect fires against that empty
        // screen instead of the one with the messages in it.
        setMessages(data);
        setIsLoadingMessages(false);
        try {
          localStorage.setItem(cacheKey, JSON.stringify(data));
        } catch (err) {}
        markRead().catch(() => {});
      } catch (err) {
        if (isMounted) {
          setSendError(userErrorMessage(err, 'دریافت پیام‌ها ممکن نشد.'));
          setIsLoadingMessages(false);
        }
      }
    };

    loadChat();

    // Polling for live updates; the list only changes when something new arrived.
    const chatInterval = setInterval(async () => {
      try {
        const data = await fetchMessages();
        if (!isMounted) return;
        setMessages((prev) => {
          const changed =
            prev.length !== data.length ||
            (data.length > 0 && data[data.length - 1].id !== prev[prev.length - 1]?.id) ||
            data.some((m, i) => prev[i] && prev[i].text !== m.text);
          if (!changed) return prev;
          try {
            localStorage.setItem(cacheKey, JSON.stringify(data));
          } catch (err) {}
          return data;
        });
        await markRead();
      } catch (err) {
        // A failed refresh keeps what is shown; the next one tries again.
      }
    }, 3000);

    return () => {
      isMounted = false;
      clearInterval(chatInterval);
    };
  }, [currentUser?.id, conversationKey]);

  useEffect(() => { setReplyTo(null); }, [conversationKey]);

  // Handle File Upload Attachment
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!isAllowedUploadFile(file)) {
      void appAlert(UPLOAD_TYPE_ERROR_MESSAGE);
      return;
    }

    if (file.size > MAX_ATTACHMENT_BYTES) {
      void appAlert(`حجم فایل پیوست بیشتر از ${MAX_ATTACHMENT_LABEL} است.`);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setAttachedFile({
        name: file.name,
        url: reader.result as string,
      });
    };
    reader.readAsDataURL(file);
  };

  // Send Message Handler: the message appears once the server has it; on failure the text stays.
  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if ((!inputMessage.trim() && !attachedFile) || !currentUser || !hasConversation || isSending) return;

    const textToSend = withReply(replyTo || undefined, inputMessage.trim());
    const fileToSend = attachedFile;
    setIsSending(true);
    setSendError(null);

    try {
      const sent = activeTeamChatId
        ? await sendTeamMessagePB(activeTeamChatId, { text: textToSend, attachmentUrl: fileToSend?.url, attachmentName: fileToSend?.name })
        : await sendDirectMessagePB({
            senderId: currentUser.id,
            senderName: currentUser.name || currentUser.username,
            senderAvatar: currentUser.avatar,
            receiverId: activePartnerId!,
            text: textToSend,
            attachmentUrl: fileToSend?.url,
            attachmentName: fileToSend?.name,
          });
      setInputMessage('');
      setAttachedFile(null);
      setReplyTo(null);
      scrollOnNextRenderRef.current = 'smooth';
      setMessages((prev) => (prev.some((m) => m.id === sent.id) ? prev : [...prev, sent]));
    } catch (err) {
      setSendError(userErrorMessage(err, 'پیام ارسال نشد. لطفاً دوباره تلاش کنید.'));
    } finally {
      setIsSending(false);
    }
  };

  if (!currentUser) {
    return (
      <div className="bg-white dark:bg-slate-800/90 rounded-3xl p-8 text-center border border-slate-200 dark:border-slate-700 shadow-sm my-auto">
        <ShieldAlert className="w-12 h-12 text-rose-500 mx-auto mb-3" />
        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">جهت استفاده از گفتگوهای تیمی وارد حساب کاربری خود شوید</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">با ورود به سیستم می‌توانید با سایر اعضای تیم خود به صورت مستقیم گفتگو کنید.</p>
      </div>
    );
  }

  const onlineInTeam = activeTeam ? activeTeam.members.filter((m) => m.userId !== currentUser.id && presence[m.userId] === true).length : 0;
  const partnerPresence = activePartnerId ? presence[activePartnerId] : undefined;
  const isGroup = !!activeTeam;
  const nameOf = (userId: string, fallback: string) =>
    userId === currentUser.id ? 'شما' : contacts.find((c) => c.userId === userId)?.name || fallback;

  return (
    <div className="bg-white dark:bg-slate-800/90 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-md overflow-hidden flex flex-col md:flex-row h-[75vh] lg:h-[min(75vh,calc(100dvh-12rem))] min-h-[480px] relative" data-chat-root>

      {/* RIGHT SIDEBAR (RTL): team threads and people */}
      <div
        className={`w-full md:w-80 lg:w-88 min-h-0 border-b md:border-b-0 md:border-l border-slate-200 dark:border-slate-700/80 flex flex-col bg-slate-50/60 dark:bg-slate-900/60 ${
          hasConversation ? 'hidden md:flex' : 'flex'
        }`}
      >
        <div className="p-4 border-b border-slate-200 dark:border-slate-700/80 space-y-3 bg-white dark:bg-slate-800/90">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              <h2 className="font-bold text-base text-slate-800 dark:text-slate-100">گفتگوها</h2>
            </div>
            <button
              type="button"
              onClick={() => setShowTaskDrawer(!showTaskDrawer)}
              className={`p-1.5 rounded-xl border text-xs transition-colors cursor-pointer flex items-center gap-1 ${
                showTaskDrawer
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100'
              }`}
              title="مشاهده توضیحات و مشخصات فعالیت‌ها"
            >
              <FileText className="w-3.5 h-3.5" />
              <span className="text-[10px] font-bold hidden sm:inline">فعالیت‌ها</span>
            </button>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
              placeholder="جستجوی تیم یا فرد..."
              aria-label="جستجوی تیم یا فرد"
              className="w-full pr-9 pl-3 py-1.5 bg-slate-100 dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-100 rounded-xl border border-slate-200 dark:border-slate-700/80 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 placeholder:text-slate-400"
            />
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {/* Team threads: one shared conversation per team */}
          {filteredTeams.length > 0 && (
            <div data-chat-section="teams">
              <div className="px-3.5 py-2 bg-slate-100/70 dark:bg-slate-900/40 text-[10px] font-extrabold text-slate-500 dark:text-slate-400">
                گفتگوی تیمی ({toPersianDigits(filteredTeams.length)})
              </div>
              {filteredTeams.map((team) => {
                const isSelected = team.id === activeTeamChatId;
                const unread = teamUnreadCounts[team.id] || 0;
                return (
                  <button
                    key={team.id}
                    type="button"
                    data-chat-team={team.id}
                    onClick={() => openTeamChat(team.id)}
                    className={`w-full flex items-center justify-between gap-2 p-3.5 transition-colors cursor-pointer text-right border-b border-slate-100 dark:border-slate-800/60 ${
                      isSelected
                        ? 'bg-indigo-50/90 dark:bg-indigo-950/70 border-r-4 border-r-indigo-600 dark:border-r-indigo-400'
                        : 'hover:bg-slate-100/80 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
                        <Users className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-xs sm:text-sm text-slate-900 dark:text-slate-100 truncate">{team.name}</p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">{toPersianDigits(team.members.length)} عضو</p>
                      </div>
                    </div>
                    {unread > 0 && (
                      <span className="shrink-0 px-2 py-0.5 rounded-full bg-rose-600 text-white font-black text-[10px]">{toPersianDigits(unread)}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* People: direct conversations with anyone, team members included */}
          <div data-chat-section="people">
            <div className="px-3.5 py-2 bg-slate-100/70 dark:bg-slate-900/40 text-[10px] font-extrabold text-slate-500 dark:text-slate-400">
              گفتگوی مستقیم ({toPersianDigits(filteredContacts.length)})
            </div>
            {filteredContacts.length === 0 ? (
              <div className="p-8 text-center text-slate-400 dark:text-slate-500 space-y-2">
                <Globe className="w-8 h-8 mx-auto opacity-50 text-indigo-500" />
                <p className="text-xs">کاربری با این مشخصات یافت نشد.</p>
              </div>
            ) : (
              filteredContacts.map((contact) => (
                <ContactRowItem
                  key={contact.userId}
                  contact={contact}
                  isSelected={contact.userId === activePartnerId}
                  unreadCount={unreadCounts[contact.userId] || 0}
                  isOnline={presence[contact.userId]}
                  onClick={() => openDirectChat(contact.userId)}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {/* LEFT CHAT AREA: Conversation View */}
      <div
        className={`flex-1 min-w-0 min-h-0 flex flex-col bg-white dark:bg-slate-800/90 ${
          !hasConversation ? 'hidden md:flex' : 'flex'
        }`}
      >
        {hasConversation ? (
          <>
            {/* Conversation header */}
            <div className="px-3 py-2.5 sm:px-4 sm:py-3 border-b border-slate-200 dark:border-slate-700/80 flex items-center justify-between gap-2 bg-slate-50/50 dark:bg-slate-800/50 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  type="button"
                  onClick={closeConversation}
                  className="md:hidden p-1.5 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 rounded-lg cursor-pointer"
                  title="بازگشت به فهرست گفتگوها"
                  aria-label="بازگشت به فهرست گفتگوها"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>

                {isGroup ? (
                  <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
                    <Users className="w-5 h-5" />
                  </div>
                ) : activePartner?.avatar ? (
                  <img src={activePartner.avatar} alt={activePartner.name} className="w-10 h-10 rounded-2xl object-cover border border-slate-200 dark:border-slate-700 shrink-0" />
                ) : (
                  <div className="relative shrink-0">
                    <div className="w-10 h-10 rounded-2xl bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 flex items-center justify-center font-bold text-sm">
                      {(activePartner?.name || '?').charAt(0)}
                    </div>
                    {partnerPresence !== undefined && (
                      <span className={`w-3 h-3 rounded-full absolute -bottom-0.5 -left-0.5 border-2 border-white dark:border-slate-800 ${partnerPresence ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`} />
                    )}
                  </div>
                )}

                <div className="min-w-0">
                  <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-slate-100 truncate" data-chat-title>
                    {conversationTitle}
                  </h3>
                  {isGroup ? (
                    <span className="text-[11px] text-slate-500 dark:text-slate-400" data-chat-status>
                      گفتگوی تیمی • {toPersianDigits(activeTeam!.members.length)} عضو
                      {onlineInTeam > 0 && ` • ${toPersianDigits(onlineInTeam)} نفر آنلاین`}
                    </span>
                  ) : partnerPresence === true ? (
                    <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1" data-chat-status>
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      آنلاین
                    </span>
                  ) : partnerPresence === false ? (
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1" data-chat-status>
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                      آفلاین
                    </span>
                  ) : (
                    <span className="text-[11px] text-slate-400" data-chat-status>گفتگوی مستقیم</span>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowTaskDrawer(!showTaskDrawer)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border cursor-pointer shrink-0 ${
                  showTaskDrawer
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700/60'
                }`}
                title="مشاهده توضیحات و مشخصات فعالیت‌ها"
              >
                <FileText className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
                <span className="hidden sm:inline">فعالیت‌ها</span>
                {!isGroup && partnerTasksCount > 0 && (
                  <span className={`px-1.5 rounded-full text-[10px] font-extrabold ${showTaskDrawer ? 'bg-white/20 text-white' : 'bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300'}`}>
                    {toPersianDigits(partnerTasksCount)}
                  </span>
                )}
              </button>
            </div>

            {/* Message list: its own scroll container */}
            <div className="relative flex-1 min-h-0">
              <div
                ref={listRef}
                onScroll={handleListScroll}
                data-chat-messages
                className="absolute inset-0 overflow-y-auto overscroll-contain px-3 py-4 sm:px-5 space-y-2.5 bg-slate-50/40 dark:bg-slate-900/30"
              >
                {isLoadingMessages ? (
                  <div className="h-full flex items-center justify-center text-slate-400 text-xs">در حال دریافت پیام‌ها...</div>
                ) : messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 dark:text-slate-500 space-y-2 px-6" data-chat-empty>
                    <MessageSquare className="w-10 h-10 opacity-40" />
                    <p className="text-xs font-semibold">
                      {isGroup ? `هنوز پیامی در گفتگوی تیم ${conversationTitle} ارسال نشده است.` : `هنوز پیامی بین شما و ${conversationTitle} رد و بدل نشده است.`}
                    </p>
                    <p className="text-[11px] text-slate-400">نخستین پیام را ارسال کنید.</p>
                  </div>
                ) : (
                  messages.map((msg, index) => {
                    const isMine = msg.senderId === currentUser.id;
                    const previous = index > 0 ? messages[index - 1] : null;
                    const firstOfRun = !previous || previous.senderId !== msg.senderId;
                    const senderName = nameOf(msg.senderId, msg.senderName);

                    return (
                      <div
                        key={msg.id}
                        data-chat-message={msg.id}
                        data-mine={isMine ? 'true' : 'false'}
                        className={`flex items-end gap-2 ${isMine ? 'justify-start' : 'justify-end'} ${firstOfRun ? 'pt-1.5' : ''}`}
                      >
                        {/* Others' initials in a group (on the outer side of their bubbles) */}
                        {!isMine && isGroup && (
                          <div className={`w-7 h-7 rounded-xl shrink-0 flex items-center justify-center text-[11px] font-bold order-last ${firstOfRun ? 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200' : 'opacity-0'}`} aria-hidden="true">
                            {senderName.charAt(0)}
                          </div>
                        )}
                        <div
                          data-msg-id={msg.id}
                          className={`group/msg max-w-[85%] sm:max-w-[70%] px-3.5 py-2.5 rounded-2xl text-xs sm:text-sm leading-relaxed shadow-2xs space-y-1.5 ${
                            isMine
                              ? `${palette.accentBg} text-white rounded-br-md`
                              : 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700/80 rounded-bl-md'
                          }`}
                        >
                          {/* Sender name in group conversations */}
                          {!isMine && isGroup && firstOfRun && (
                            <div className="text-[11px] font-bold text-indigo-600 dark:text-indigo-300" data-chat-sender>
                              {senderName}
                            </div>
                          )}

                          {/* Message Content or Inline Edit Form */}
                          {editingMessageId === msg.id ? (
                            <div className="space-y-2 py-1">
                              <textarea
                                value={editingText}
                                onChange={(e) => setEditingText(e.target.value)}
                                className={`w-full p-2 text-xs sm:text-sm rounded-xl border focus:outline-none resize-none ${
                                  isMine
                                    ? 'bg-white/20 text-white border-white/40 placeholder:text-white/60 focus:ring-1 focus:ring-white'
                                    : 'bg-slate-100 dark:bg-slate-900 text-slate-900 dark:text-slate-100 border-slate-300 dark:border-slate-700 focus:ring-1 focus:ring-indigo-500'
                                }`}
                                rows={2}
                                autoFocus
                              />
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleSaveEdit(msg.id)}
                                  className="p-1 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 transition-colors cursor-pointer"
                                  title="ذخیره تغییرات"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={handleCancelEdit}
                                  className={`p-1 rounded-lg transition-colors cursor-pointer ${
                                    isMine
                                      ? 'bg-white/20 text-white hover:bg-white/30'
                                      : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600'
                                  }`}
                                  title="انصراف"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ) : (
                            (() => {
                              const { reply, body } = splitReply(msg.text);
                              return (
                                <>
                                  {reply && (
                                    <button
                                      type="button"
                                      onClick={() => document.querySelector(`[data-msg-id="${reply.id}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })}
                                      className={`block w-full min-w-[140px] text-right border-r-2 pr-2 py-0.5 rounded-sm text-[11px] cursor-pointer ${
                                        isMine ? 'border-white/60 bg-white/10 text-white/90' : 'border-indigo-400 bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-300'
                                      }`}
                                    >
                                      <span className="block font-bold truncate">{reply.name}</span>
                                      <span className="block truncate">{reply.snippet}</span>
                                    </button>
                                  )}
                                  {body && <p className="whitespace-pre-wrap break-words text-right" dir="rtl">{body}</p>}
                                </>
                              );
                            })()
                          )}

                          {/* File Attachment */}
                          {msg.attachmentUrl && isVoiceName(msg.attachmentName) && (
                            <audio controls src={msg.attachmentUrl} className="max-w-[220px] h-9" />
                          )}
                          {msg.attachmentUrl && !isVoiceName(msg.attachmentName) && (
                            <div
                              className={`p-2 rounded-xl flex items-center gap-2 border ${
                                isMine ? 'bg-white/10 border-white/20 text-white' : 'bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-slate-700'
                              }`}
                            >
                              <FileText className="w-4 h-4 shrink-0" />
                              <a href={msg.attachmentUrl} target="_blank" rel="noopener noreferrer" className="underline text-xs truncate max-w-[180px] hover:opacity-80">
                                {msg.attachmentName || 'فایل پیوست'}
                              </a>
                            </div>
                          )}

                          {/* Footer: actions and time */}
                          <div className={`flex items-center justify-between gap-2 text-[10px] ${isMine ? 'text-white/80' : 'text-slate-400'}`}>
                            <div className="flex items-center gap-1 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/msg:opacity-100 focus-within:opacity-100">
                              <button
                                type="button"
                                onClick={() => {
                                  const plain = splitReply(msg.text).body;
                                  setReplyTo({
                                    id: msg.id,
                                    name: senderName,
                                    snippet: isVoiceName(msg.attachmentName) ? '🎤 پیام صوتی' : plain || msg.attachmentName || 'پیوست',
                                  });
                                  composerRef.current?.focus();
                                }}
                                className={`p-1 rounded-md transition-colors cursor-pointer ${
                                  isMine
                                    ? 'hover:bg-white/20 text-white/90 hover:text-white'
                                    : 'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400'
                                }`}
                                title="پاسخ به این پیام"
                              >
                                <CornerUpLeft className="w-3.5 h-3.5 shrink-0" />
                              </button>
                              {onConvertToTask && !isVoiceName(msg.attachmentName) && !containsEmoji(splitReply(msg.text).body) && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const plain = splitReply(msg.text).body;
                                    const title = plain
                                      ? plain.length > 50
                                        ? plain.substring(0, 50) + '...'
                                        : plain
                                      : 'وظیفه جدید از پیام چت';
                                    const desc = `برگرفته از پیام گفتگو ${isGroup ? `تیم ${conversationTitle}` : `با ${conversationTitle}`}:\n${plain || ''}`;
                                    onConvertToTask(title, desc);
                                  }}
                                  className={`p-1 rounded-md transition-colors cursor-pointer ${
                                    isMine
                                      ? 'hover:bg-white/20 text-white/90 hover:text-white'
                                      : 'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400'
                                  }`}
                                  title="تبدیل این پیام به یک وظیفه جدید"
                                >
                                  <CheckSquare className="w-3.5 h-3.5 shrink-0" />
                                </button>
                              )}
                              {isMine && editingMessageId !== msg.id && (
                                <button
                                  type="button"
                                  onClick={() => handleStartEdit(msg)}
                                  className="p-1 rounded-md transition-colors cursor-pointer hover:bg-white/20 text-white/90 hover:text-white"
                                  title="ویرایش پیام"
                                >
                                  <Pencil className="w-3.5 h-3.5 shrink-0" />
                                </button>
                              )}
                              {isMine && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteMessage(msg.id)}
                                  className="p-1 rounded-md transition-colors cursor-pointer hover:bg-white/20 text-white/90 hover:text-rose-200"
                                  title="حذف پیام"
                                >
                                  <Trash2 className="w-3.5 h-3.5 shrink-0" />
                                </button>
                              )}
                            </div>
                            <div className="flex items-center gap-1 mr-auto">
                              <span>{formatTime24h(msg.createdAt)}</span>
                              {isMine && !isGroup && <CheckCircle className={`w-3 h-3 stroke-[2.5] ${msg.isRead ? '' : 'opacity-50'}`} />}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* New messages arrived while reading older ones */}
              {newMessagesCount > 0 && (
                <button
                  type="button"
                  onClick={() => scrollListToBottom('smooth')}
                  data-chat-new-indicator
                  className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-indigo-600 text-white text-[11px] font-bold shadow-lg flex items-center gap-1 cursor-pointer hover:bg-indigo-700"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                  {toPersianDigits(newMessagesCount)} پیام جدید
                </button>
              )}
            </div>

            {replyTo && (
              <div className="px-4 py-2 bg-slate-50 dark:bg-slate-900/80 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3 text-xs shrink-0">
                <div className="min-w-0 border-r-2 border-indigo-400 pr-2">
                  <div className="font-bold text-indigo-600 dark:text-indigo-300 truncate">پاسخ به {replyTo.name}</div>
                  <div className="text-slate-500 dark:text-slate-400 truncate">{replyTo.snippet}</div>
                </div>
                <button type="button" onClick={() => setReplyTo(null)} className="text-slate-400 hover:text-rose-500 p-1 cursor-pointer" aria-label="لغو پاسخ">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Attachment Preview Bar */}
            {attachedFile && (
              <div className="px-4 py-2 bg-indigo-50 dark:bg-indigo-950/80 border-t border-indigo-200 dark:border-indigo-800 flex items-center justify-between text-xs text-indigo-900 dark:text-indigo-200 shrink-0">
                <div className="flex items-center gap-2 truncate">
                  <Paperclip className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  <span className="truncate">{isVoiceName(attachedFile.name) ? 'پیام صوتی آماده ارسال' : `پیوست: ${attachedFile.name}`}</span>
                </div>
                <button type="button" onClick={() => setAttachedFile(null)} className="text-rose-500 hover:text-rose-700 p-1 cursor-pointer" aria-label="حذف پیوست">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {sendError && (
              <div role="alert" className="px-4 py-2 bg-rose-50 dark:bg-rose-950/60 border-t border-rose-200 dark:border-rose-800 text-[11px] font-semibold text-rose-700 dark:text-rose-300 shrink-0">
                {sendError}
              </div>
            )}

            {/* Input area */}
            <form
              onSubmit={handleSendMessage}
              className="p-2.5 sm:p-3 border-t border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800/90 flex items-end gap-1.5 sm:gap-2 shrink-0"
            >
              <label
                title="افزودن فایل پیوست"
                className="p-2.5 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-700/60 rounded-xl cursor-pointer transition-colors shrink-0"
              >
                <Paperclip className="w-5 h-5" />
                <input type="file" accept={ALLOWED_UPLOAD_ACCEPT} className="hidden" onChange={handleFileUpload} />
              </label>

              <EmojiButton onPick={(emoji) => setInputMessage((t) => t + emoji)} className="p-2.5 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-700/60 rounded-xl cursor-pointer transition-colors shrink-0" />

              <VoiceButton
                onRecorded={(v) => setAttachedFile({ name: v.name, url: v.url })}
                onError={setSendError}
                className="p-2.5 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-700/60 rounded-xl cursor-pointer transition-colors shrink-0"
              />

              <textarea
                ref={composerRef}
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyDown={(e) => {
                  // Enter sends; Shift+Enter starts a new line.
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                rows={1}
                dir="rtl"
                aria-label="متن پیام"
                placeholder={isGroup ? `پیام به تیم ${conversationTitle}...` : `پیام به ${conversationTitle}...`}
                className="flex-1 min-w-0 resize-none max-h-32 bg-slate-100 dark:bg-slate-900 text-xs sm:text-sm text-slate-900 dark:text-slate-100 px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 placeholder:text-slate-400"
              />

              <button
                type="submit"
                disabled={(!inputMessage.trim() && !attachedFile) || isSending}
                className={`h-10 px-3 sm:px-4 ${palette.accentBg} ${palette.accentHover} disabled:opacity-40 text-white rounded-2xl shadow-sm transition-all cursor-pointer shrink-0 flex items-center gap-1.5 text-xs font-bold`}
                title="ارسال پیام"
                aria-label="ارسال پیام"
              >
                <Send className="w-4 h-4 rotate-180" />
                <span className="hidden sm:inline">ارسال</span>
              </button>
            </form>
          </>
        ) : (
          <div className="h-full flex flex-col items-center justify-center p-8 text-center text-slate-400 dark:text-slate-500 space-y-3 my-auto">
            <MessageSquare className="w-14 h-14 text-indigo-400/40" />
            <h3 className="font-bold text-base text-slate-700 dark:text-slate-300">گفتگویی انتخاب نشده است</h3>
            <p className="text-xs max-w-xs leading-relaxed">
              یک تیم را برای گفتگوی گروهی، یا یک نفر را برای گفتگوی مستقیم از فهرست انتخاب کنید.
            </p>
          </div>
        )}
      </div>

      {/* ACTIVITY DESCRIPTIONS DRAWER / SIDE-PANEL (مشاهده توضیحات فعالیت) */}
      {showTaskDrawer && (
        <div className="w-full md:w-96 lg:w-[420px] border-t md:border-t-0 md:border-l border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-850 flex flex-col h-full shadow-xl md:shadow-none z-30 absolute md:static inset-0 transition-all">
          {/* Drawer Header */}
          <div className="p-4 border-b border-slate-200 dark:border-slate-700/80 bg-slate-50/70 dark:bg-slate-900/60 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                  توضیحات و جزئیات فعالیت‌ها
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {toPersianDigits(relevantTasks.length)} فعالیت یافت شد
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowTaskDrawer(false)}
              className="p-1.5 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors cursor-pointer"
              title="بستن پنل توضیحات"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Scope Filters */}
          <div className="p-3 border-b border-slate-200 dark:border-slate-700/80 space-y-2.5 bg-white dark:bg-slate-800/60">
            <div className="grid grid-cols-3 gap-1 bg-slate-100 dark:bg-slate-900 p-1 rounded-xl text-xs font-bold">
              {activePartner && (
                <button
                  type="button"
                  onClick={() => setTaskFilterScope('partner')}
                  className={`py-1.5 px-2 rounded-lg text-center truncate transition-colors cursor-pointer ${
                    taskFilterScope === 'partner'
                      ? 'bg-white dark:bg-slate-800 text-indigo-700 dark:text-indigo-300 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                  title={activePartner.name}
                >
                  هم‌تیمی
                </button>
              )}
              <button
                type="button"
                onClick={() => setTaskFilterScope('team')}
                className={`py-1.5 px-2 rounded-lg text-center truncate transition-colors cursor-pointer ${
                  taskFilterScope === 'team'
                    ? 'bg-white dark:bg-slate-800 text-indigo-700 dark:text-indigo-300 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                تیم جاری
              </button>
              <button
                type="button"
                onClick={() => setTaskFilterScope('all')}
                className={`py-1.5 px-2 rounded-lg text-center truncate transition-colors cursor-pointer ${
                  taskFilterScope === 'all'
                    ? 'bg-white dark:bg-slate-800 text-indigo-700 dark:text-indigo-300 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                همه فعالیت‌ها
              </button>
            </div>

            {/* Search within Tasks and Descriptions */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={taskSearchQuery}
                onChange={(e) => setTaskSearchQuery(e.target.value)}
                placeholder="جستجو در عنوان یا متن توضیحات..."
                className="w-full pr-8 pl-3 py-1.5 bg-slate-100 dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-200 rounded-xl border border-slate-200 dark:border-slate-700 focus:outline-hidden focus:ring-1 focus:ring-indigo-500 placeholder:text-slate-400"
              />
              {taskSearchQuery && (
                <button
                  type="button"
                  onClick={() => setTaskSearchQuery('')}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Quick Status Filters */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1 text-[11px]">
              <button
                type="button"
                onClick={() => setTaskStatusFilter('all')}
                className={`px-2.5 py-1 rounded-lg font-bold shrink-0 transition-colors cursor-pointer ${
                  taskStatusFilter === 'all'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                همه ({toPersianDigits(tasks.length)})
              </button>
              {(Object.keys(STATUSES) as TaskStatus[]).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setTaskStatusFilter(st)}
                  className={`px-2 py-0.5 rounded-lg font-medium shrink-0 transition-colors cursor-pointer text-[10px] ${
                    taskStatusFilter === st
                      ? 'bg-indigo-600 text-white font-bold'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {STATUSES[st].title}
                </button>
              ))}
            </div>
          </div>

          {/* Task List with Full Descriptions */}
          <div className="flex-1 overflow-y-auto p-3.5 space-y-3 bg-slate-50/50 dark:bg-slate-900/40">
            {relevantTasks.length === 0 ? (
              <div className="p-8 text-center text-slate-400 dark:text-slate-500 space-y-2 my-auto">
                <FileText className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto" />
                <p className="text-xs font-bold text-slate-600 dark:text-slate-300">
                  فعالیتی یافت نشد
                </p>
                <p className="text-[11px] max-w-xs mx-auto">
                  با تغییر فیلتر جستجو یا انتخاب دامنه دیگر می‌توانید فعالیت‌ها را مشاهده کنید.
                </p>
              </div>
            ) : (
              relevantTasks.map((t) => {
                const statusInfo = STATUSES[t.status];
                const priorityInfo = PRIORITIES[t.priority];
                const hasDesc = t.description && t.description.trim().length > 0;

                return (
                  <div
                    key={t.id}
                    className="p-3.5 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-2.5 shadow-2xs hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors"
                  >
                    {/* Header: Title & Status */}
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 leading-snug">
                        {t.title}
                      </h4>
                      {statusInfo && (
                        <span
                          className={`px-2 py-0.5 text-[10px] font-bold rounded-lg border shrink-0 ${statusInfo.badgeBg} ${statusInfo.badgeText} ${statusInfo.borderColor}`}
                        >
                          {statusInfo.title}
                        </span>
                      )}
                    </div>

                    {/* Metadata chips */}
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                      {t.dueDate && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                          <span>موعد: {formatToJalali(t.dueDate)}</span>
                        </span>
                      )}
                      {responsibleNamesOf(t) && (
                        <span className="flex items-center gap-1 font-medium text-slate-700 dark:text-slate-300">
                          <UserIcon className="w-3 h-3 text-indigo-500 shrink-0" />
                          <span>{responsibleNamesOf(t)}</span>
                        </span>
                      )}
                      {priorityInfo && (
                        <span className={`text-[10px] font-bold ${priorityInfo.color}`}>
                          • اولویت {priorityInfo.title}
                        </span>
                      )}
                    </div>

                    {/* Activity Description Box (توضیحات فعالیت) */}
                    <div className="space-y-1">
                      <div className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                        <span>توضیحات فعالیت:</span>
                      </div>
                      {hasDesc ? (
                        <div className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-wrap bg-slate-50 dark:bg-slate-900/80 p-2.5 rounded-xl border border-slate-200/70 dark:border-slate-700/60 max-h-48 overflow-y-auto select-text font-normal">
                          {t.description}
                        </div>
                      ) : (
                        <div className="text-xs text-slate-400 dark:text-slate-500 italic bg-slate-50/60 dark:bg-slate-900/40 p-2 rounded-lg border border-dashed border-slate-200 dark:border-slate-700">
                          توضیحاتی برای این فعالیت ثبت نشده است.
                        </div>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center justify-between gap-1.5 pt-2 border-t border-slate-100 dark:border-slate-700/60">
                      <div className="flex items-center gap-1.5">
                        {/* Insert into chat input */}
                        {activePartner && (
                          <button
                            type="button"
                            onClick={() => handleInsertTaskIntoChat(t)}
                            className="px-2.5 py-1 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900 text-indigo-700 dark:text-indigo-300 rounded-lg text-[11px] font-bold transition-colors flex items-center gap-1 cursor-pointer"
                            title="درج عنوان و توضیحات فعالیت در پیام گفتگو"
                          >
                            <MessageSquare className="w-3 h-3" />
                            <span>درج در گفتگو</span>
                          </button>
                        )}

                        {/* Copy description */}
                        <button
                          type="button"
                          onClick={() => handleCopyTaskDescription(t)}
                          className="px-2 py-1 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700/60 rounded-lg text-[11px] font-medium transition-colors flex items-center gap-1 cursor-pointer border border-slate-200/70 dark:border-slate-700"
                          title="کپی متن توضیحات فعالیت"
                        >
                          {copiedTaskId === t.id ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-500" />
                              <span className="text-emerald-600 text-[10px] font-bold">کپی شد</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span className="text-[10px]">کپی</span>
                            </>
                          )}
                        </button>
                      </div>

                      {/* View Full Task Details modal */}
                      {onViewTaskDetails && (
                        <button
                          type="button"
                          onClick={() => onViewTaskDetails(t)}
                          className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 flex items-center gap-1 transition-colors cursor-pointer px-1.5 py-1"
                        >
                          <span>جزئیات کامل</span>
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// Subcomponent for Contact Row
const ContactRowItem: React.FC<{
  contact: ChatContact;
  isSelected: boolean;
  unreadCount: number;
  /** true online, false offline, undefined unknown (no dot). */
  isOnline?: boolean;
  onClick: () => void;
}> = ({ contact, isSelected, unreadCount, isOnline, onClick }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      data-chat-contact={contact.userId}
      className={`w-full flex items-center justify-between p-3.5 transition-colors cursor-pointer text-right border-b border-slate-100 dark:border-slate-800/60 ${
        isSelected
          ? 'bg-indigo-50/90 dark:bg-indigo-950/70 border-r-4 border-indigo-600 dark:border-indigo-400'
          : 'hover:bg-slate-100/80 dark:hover:bg-slate-800/50'
      }`}
    >
      <div className="flex items-center gap-3 min-w-0">
        {/* Avatar */}
        <div className="relative shrink-0">
          {contact.avatar ? (
            <img
              src={contact.avatar}
              alt={contact.name}
              className="w-10 h-10 rounded-2xl object-cover border border-slate-200 dark:border-slate-700"
            />
          ) : (
            <div
              className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-sm ${
                contact.isExternal
                  ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300'
                  : 'bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300'
              }`}
            >
              {contact.name ? contact.name.charAt(0) : <UserIcon className="w-5 h-5" />}
            </div>
          )}
          {isOnline !== undefined && (
            <span
              data-presence={isOnline ? 'online' : 'offline'}
              title={isOnline ? 'آنلاین' : 'آفلاین'}
              className={`w-2.5 h-2.5 rounded-full absolute bottom-0 left-0 border-2 border-white dark:border-slate-800 ${isOnline ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`}
            />
          )}
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-xs sm:text-sm text-slate-900 dark:text-slate-100 truncate">
              {contact.name}
            </span>
            {!contact.isExternal && (
              <span className="px-1.5 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 text-[9px] font-bold shrink-0">
                هم‌تیمی
              </span>
            )}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
            {contact.username ? `@${contact.username}` : ''}
          </div>
        </div>
      </div>

      {/* Unread Count Badge */}
      {unreadCount > 0 && (
        <span className="shrink-0 px-2 py-0.5 rounded-full bg-rose-600 text-white font-black text-[10px] animate-pulse shadow-xs">
          {toPersianDigits(unreadCount)}
        </span>
      )}
    </button>
  );
};
