import React, { useState, useEffect, useRef } from 'react';
import {
  FileText,
  Plus,
  Pin,
  Trash2,
  Edit2,
  Search,
  Check,
  Copy,
  X,
  Lock,
  Sparkles,
  Paperclip,
  Download,
  Image as ImageIcon,
  File,
  UploadCloud,
  CheckSquare,
} from 'lucide-react';
import { User, PersonalNote, NoteAttachment, AppColorPalette, MAX_ATTACHMENT_BYTES, MAX_ATTACHMENT_LABEL } from '../types';
import { toPersianDigits, formatFileSize } from '../utils/helpers';
import { COLOR_PALETTES } from '../utils/theme';
import { readFileAsDataUrl } from '../utils/storage';
import { isAllowedUploadFile, UPLOAD_TYPE_ERROR_MESSAGE, ALLOWED_UPLOAD_ACCEPT } from '../utils/uploadPolicy';
import {
  fetchPersonalNotesPB,
  createPersonalNotePB,
  updatePersonalNotePB,
  deletePersonalNotePB,
} from '../services/dataService';
import { appAlert, appConfirm } from '../utils/appDialog';
import { copyText } from '../utils/clipboard';
import { showToast } from '../utils/toast';

interface PersonalNotesViewProps {
  currentUser: User | null;
  appColorPalette?: AppColorPalette;
  /** `onCreated` runs with the new task's id once the task has really been saved. */
  onConvertToTask?: (title: string, description?: string, onCreated?: (taskId: string) => void) => void;
}

const COLOR_CONFIGS: Record<string, { bg: string; border: string; badge: string; text: string }> = {
  amber: {
    bg: 'bg-amber-50/80 dark:bg-amber-950/40',
    border: 'border-amber-200 dark:border-amber-800/80',
    badge: 'bg-amber-200 dark:bg-amber-900 text-amber-900 dark:text-amber-200',
    text: 'text-amber-900 dark:text-amber-100',
  },
  indigo: {
    bg: 'bg-indigo-50/80 dark:bg-indigo-950/40',
    border: 'border-indigo-200 dark:border-indigo-800/80',
    badge: 'bg-indigo-200 dark:bg-indigo-900 text-indigo-900 dark:text-indigo-200',
    text: 'text-indigo-900 dark:text-indigo-100',
  },
  emerald: {
    bg: 'bg-emerald-50/80 dark:bg-emerald-950/40',
    border: 'border-emerald-200 dark:border-emerald-800/80',
    badge: 'bg-emerald-200 dark:bg-emerald-900 text-emerald-900 dark:text-emerald-200',
    text: 'text-emerald-900 dark:text-emerald-100',
  },
  rose: {
    bg: 'bg-rose-50/80 dark:bg-rose-950/40',
    border: 'border-rose-200 dark:border-rose-800/80',
    badge: 'bg-rose-200 dark:bg-rose-900 text-rose-900 dark:text-rose-200',
    text: 'text-rose-900 dark:text-rose-100',
  },
  cyan: {
    bg: 'bg-cyan-50/80 dark:bg-cyan-950/40',
    border: 'border-cyan-200 dark:border-cyan-800/80',
    badge: 'bg-cyan-200 dark:bg-cyan-900 text-cyan-900 dark:text-cyan-200',
    text: 'text-cyan-900 dark:text-cyan-100',
  },
  slate: {
    bg: 'bg-slate-100/80 dark:bg-slate-800/80',
    border: 'border-slate-300 dark:border-slate-700',
    badge: 'bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200',
    text: 'text-slate-900 dark:text-slate-100',
  },
};

export const PersonalNotesView: React.FC<PersonalNotesViewProps> = ({
  currentUser,
  appColorPalette = 'indigo',
  onConvertToTask,
}) => {
  const palette = COLOR_PALETTES[appColorPalette] || COLOR_PALETTES.indigo;

  const [notes, setNotes] = useState<PersonalNote[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Modal State for Note Form
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingNote, setEditingNote] = useState<PersonalNote | null>(null);

  // Note Form Fields
  const [formTitle, setFormTitle] = useState<string>('');
  const [formContent, setFormContent] = useState<string>('');
  const [formColor, setFormColor] = useState<string>('amber');
  const [formIsPinned, setFormIsPinned] = useState<boolean>(false);
  const [formAttachments, setFormAttachments] = useState<NoteAttachment[]>([]);
  const [copiedNoteId, setCopiedNoteId] = useState<string | null>(null);

  // Notes already made into a task (note id -> task id), kept in this browser per person so the card can show it.
  const convertedKey = `parstask_note_tasks_${currentUser?.id ?? ''}`;
  const [convertedNotes, setConvertedNotes] = useState<Record<string, string>>({});
  useEffect(() => {
    try { setConvertedNotes(JSON.parse(localStorage.getItem(convertedKey) || '{}') || {}); } catch { setConvertedNotes({}); }
  }, [convertedKey]);
  const markConverted = (noteId: string, taskId: string) => {
    setConvertedNotes((current) => {
      const next = { ...current, [noteId]: taskId };
      try { localStorage.setItem(convertedKey, JSON.stringify(next)); } catch { /* storage unavailable: shown until reload */ }
      return next;
    });
  };
  const [isUploading, setIsUploading] = useState<boolean>(false);

  const noteFileInputRef = useRef<HTMLInputElement>(null);

  // Load Notes with cache-first approach for instant initial load
  useEffect(() => {
    if (!currentUser) return;

    // Load from local storage cache first
    const cacheKey = `parstask_notes_${currentUser.id}`;
    let hasCache = false;
    try {
      const local = localStorage.getItem(cacheKey);
      if (local) {
        const cachedNotes = JSON.parse(local);
        if (Array.isArray(cachedNotes) && cachedNotes.length > 0) {
          setNotes(cachedNotes);
          setIsLoading(false);
          hasCache = true;
        }
      }
    } catch (err) {
      console.warn('Failed parsing cached personal notes', err);
    }

    const loadNotes = async () => {
      if (!hasCache) {
        setIsLoading(true);
      }
      const data = await fetchPersonalNotesPB(currentUser.id);
      setNotes(data);
      setIsLoading(false);
    };

    loadNotes();
  }, [currentUser]);

  // Open Form for Create
  const handleOpenCreate = () => {
    setEditingNote(null);
    setFormTitle('');
    setFormContent('');
    setFormColor('amber');
    setFormIsPinned(false);
    setFormAttachments([]);
    setIsModalOpen(true);
  };

  // Open Form for Edit
  const handleOpenEdit = (note: PersonalNote) => {
    setEditingNote(note);
    setFormTitle(note.title);
    setFormContent(note.content);
    setFormColor(note.color || 'amber');
    setFormIsPinned(!!note.isPinned);
    setFormAttachments(note.attachments || []);
    setIsModalOpen(true);
  };

  // Handle Note File Upload
  const handleNoteFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    const newAtts: NoteAttachment[] = [];

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
      try {
        const dataUrl = await readFileAsDataUrl(file);
        newAtts.push({
          id: 'att_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
          name: file.name,
          size: file.size,
          type: file.type,
          dataUrl,
          createdAt: new Date().toISOString(),
        });
      } catch (err) {
        console.error('Failed to read note attachment:', err);
      }
    }

    setFormAttachments((prev) => [...prev, ...newAtts]);
    setIsUploading(false);
    if (noteFileInputRef.current) noteFileInputRef.current.value = '';
  };

  // Handle Remove Attachment
  const handleRemoveAttachment = (attId: string) => {
    setFormAttachments((prev) => prev.filter((a) => a.id !== attId));
  };

  // Save Note (Create or Update)
  const handleSaveNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim() || !currentUser) return;

    if (editingNote) {
      // Update
      const updated = await updatePersonalNotePB(editingNote.id, currentUser.id, {
        title: formTitle.trim(),
        content: formContent.trim(),
        color: formColor,
        isPinned: formIsPinned,
        attachments: formAttachments,
      });

      setNotes((prev) => prev.map((n) => (n.id === editingNote.id ? updated : n)));
    } else {
      // Create
      const created = await createPersonalNotePB(currentUser.id, {
        title: formTitle.trim(),
        content: formContent.trim(),
        color: formColor,
        isPinned: formIsPinned,
        attachments: formAttachments,
      });

      setNotes((prev) => [created, ...prev]);
    }

    setIsModalOpen(false);
  };

  // Delete Note
  const handleDeleteNote = async (id: string) => {
    if (!currentUser) return;
    if (!(await appConfirm('آیا از حذف این یادداشت شخصی مطمئن هستید؟'))) return;

    await deletePersonalNotePB(id, currentUser.id);
    setNotes((prev) => prev.filter((n) => n.id !== id));
  };

  // Toggle Pin Status directly from card
  const handleTogglePin = async (note: PersonalNote) => {
    if (!currentUser) return;
    const newPinned = !note.isPinned;

    setNotes((prev) =>
      prev.map((n) => (n.id === note.id ? { ...n, isPinned: newPinned } : n))
    );

    await updatePersonalNotePB(note.id, currentUser.id, { isPinned: newPinned });
  };

  // Copy Note Text
  const handleCopyNote = async (note: PersonalNote) => {
    const fullText = `${note.title}\n\n${note.content}`;
    if (!(await copyText(fullText))) { showToast('کپی انجام نشد.', 'error'); return; }
    setCopiedNoteId(note.id);
    setTimeout(() => setCopiedNoteId(null), 2000);
  };

  // Filter & Sort Notes
  const filteredNotes = notes.filter(
    (n) =>
      n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      n.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Separate Pinned and Unpinned
  const pinnedNotes = filteredNotes.filter((n) => n.isPinned);
  const unpinnedNotes = filteredNotes.filter((n) => !n.isPinned);

  if (!currentUser) {
    return (
      <div className="bg-white dark:bg-slate-800/90 rounded-3xl p-8 text-center border border-slate-200 dark:border-slate-700 shadow-sm my-auto">
        <Lock className="w-12 h-12 text-amber-500 mx-auto mb-3" />
        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">یادداشت‌های شخصی و محرمانه</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">جهت ثبت و دسترسی به دفترچه یادداشت اختصاصی خود وارد حساب کاربری شوید.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      
      {/* Header Bar */}
      <div className="bg-white dark:bg-slate-800/90 p-4 sm:p-5 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={`p-3 rounded-2xl ${palette.accentBg} text-white shadow-md shadow-indigo-950/20 shrink-0`}>
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              یادداشت‌های شخصی
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              دفترچه یادداشت دیجیتال، ایده‌ها و یادآوری‌های اختصاصی ({toPersianDigits(notes.length)} یادداشت)
            </p>
          </div>
        </div>

        {/* Search & New Note Button */}
        <div className="flex items-center gap-2.5">
          <div className="relative flex-1 sm:w-60 min-w-0">
            <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="جستجو در یادداشت‌ها..."
              className="w-full pr-9 pl-3 py-2 bg-slate-50 dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-100 rounded-2xl border border-slate-200 dark:border-slate-700 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <button
            type="button"
            onClick={handleOpenCreate}
            className={`flex items-center gap-2 px-4 py-2.5 ${palette.accentBg} ${palette.accentHover} text-white text-xs font-bold rounded-2xl shadow-sm transition-all cursor-pointer shrink-0`}
          >
            <Plus className="w-4 h-4" />
            <span>یادداشت جدید</span>
          </button>
        </div>
      </div>

      {/* Main Grid Content */}
      {isLoading ? (
        <div className="py-20 text-center text-xs text-slate-400 font-semibold">
          در حال بارگذاری یادداشت‌ها...
        </div>
      ) : filteredNotes.length === 0 ? (
        <div className="bg-white dark:bg-slate-800/90 rounded-3xl p-12 text-center border border-slate-200 dark:border-slate-700 space-y-3">
          <Sparkles className="w-12 h-12 text-amber-400 mx-auto opacity-70" />
          <h3 className="font-bold text-base text-slate-800 dark:text-slate-100">{searchQuery.trim() ? 'یادداشتی با این جستجو پیدا نشد' : 'هیچ یادداشتی یافت نشد'}</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
            {searchQuery.trim()
              ? 'عبارت دیگری را جستجو کنید یا جستجو را پاک کنید.'
              : 'اولین یادداشت شخصی، ایده یا چک‌لیست خود را ثبت نمایید.'}
          </p>
          <button
            type="button"
            onClick={handleOpenCreate}
            className={`inline-flex items-center gap-2 px-4 py-2 ${palette.accentBg} text-white text-xs font-bold rounded-xl cursor-pointer shadow-xs mt-2`}
          >
            <Plus className="w-4 h-4" />
            <span>ثبت یادداشت جدید</span>
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          
          {/* Pinned Section */}
          {pinnedNotes.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider">
                <Pin className="w-4 h-4 text-amber-500 fill-amber-500" />
                <span>یادداشت‌های سنجاق شده ({toPersianDigits(pinnedNotes.length)})</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {pinnedNotes.map((note) => renderNoteCard(note))}
              </div>
            </div>
          )}

          {/* Unpinned Section */}
          {unpinnedNotes.length > 0 && (
            <div className="space-y-3">
              {pinnedNotes.length > 0 && (
                <div className="flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider pt-2">
                  <span>سایر یادداشت‌ها ({toPersianDigits(unpinnedNotes.length)})</span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {unpinnedNotes.map((note) => renderNoteCard(note))}
              </div>
            </div>
          )}

        </div>
      )}

      {/* CREATE / EDIT NOTE MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/55 backdrop-blur-md animate-in fade-in">
          <div className="bg-white/95 dark:bg-slate-800/95 w-full max-w-lg rounded-[28px] shadow-[0_28px_90px_-30px_rgba(15,23,42,0.75)] border border-white/80 dark:border-slate-700 ring-1 ring-indigo-100/70 dark:ring-indigo-500/15 overflow-hidden space-y-5 p-6 sm:p-7">
            
            {/* Modal Header */}
            <div className="relative -mx-6 -mt-6 sm:-mx-7 sm:-mt-7 px-6 sm:px-7 pt-7 pb-5 flex items-center justify-between border-b border-indigo-200/70 dark:border-indigo-900/60 bg-gradient-to-l from-indigo-100/90 via-white to-violet-100/80 dark:from-indigo-950/70 dark:via-slate-900 dark:to-violet-950/50 overflow-hidden">
              <div className="absolute top-0 right-0 left-0 h-1 bg-gradient-to-l from-violet-500 via-indigo-500 to-sky-400" />
              <div className="absolute -top-14 -left-8 w-32 h-32 rounded-full bg-violet-400/20 blur-3xl pointer-events-none" />
              <h3 className="relative font-black tracking-tight text-base text-slate-900 dark:text-white flex items-center gap-3">
                <span className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-500 via-indigo-600 to-violet-600 text-white flex items-center justify-center shadow-xl shadow-indigo-500/30 ring-4 ring-white/80 dark:ring-slate-800 rotate-[-4deg]"><FileText className="w-5 h-5" /></span>
                <span>{editingNote ? 'ویرایش یادداشت شخصی' : 'ثبت یادداشت شخصی جدید'}</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="relative p-2 text-indigo-400 dark:text-indigo-300 hover:text-indigo-700 dark:hover:text-white bg-white/50 dark:bg-slate-800/50 hover:bg-white dark:hover:bg-slate-700 rounded-xl border border-indigo-100/80 dark:border-slate-600 shadow-sm transition-all hover:rotate-90 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Note Form */}
            <form onSubmit={handleSaveNote} className="app-form space-y-4">
              {/* Title */}
              <div className="rounded-2xl border border-indigo-100/80 dark:border-indigo-900/50 bg-indigo-50/35 dark:bg-indigo-950/20 p-3.5">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  عنوان یادداشت <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="عنوان یا موضوع یادداشت..."
                  className="w-full px-4 py-3 bg-slate-50/80 dark:bg-slate-900 text-xs sm:text-sm font-semibold text-slate-900 dark:text-slate-100 rounded-2xl border border-slate-200 dark:border-slate-700 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:bg-white dark:focus:bg-slate-900 transition-all"
                />
              </div>

              {/* Content */}
              <div className="rounded-2xl border border-slate-200/80 dark:border-slate-700 bg-slate-50/55 dark:bg-slate-900/40 p-3.5">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  متن و جزئیات یادداشت
                </label>
                <textarea
                  rows={6}
                  value={formContent}
                  onChange={(e) => setFormContent(e.target.value)}
                  placeholder="متن یادداشت، ایده‌ها یا اطلاعات محرمانه..."
                  className="w-full px-4 py-3.5 bg-slate-50/80 dark:bg-slate-900 text-xs sm:text-sm text-slate-900 dark:text-slate-100 rounded-2xl border border-slate-200 dark:border-slate-700 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:bg-white dark:focus:bg-slate-900 transition-all leading-relaxed"
                />
              </div>

              {/* Attachments Section */}
              <div className="space-y-2 pt-1 border-t border-slate-100 dark:border-slate-700/80">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Paperclip className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    <span>پیوست فایل و تصویر ({toPersianDigits(formAttachments.length)})</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => noteFileInputRef.current?.click()}
                    disabled={isUploading}
                    className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <UploadCloud className="w-3.5 h-3.5" />
                    <span>افزودن فایل</span>
                  </button>
                  <input
                    ref={noteFileInputRef}
                    type="file"
                    multiple
                    accept={ALLOWED_UPLOAD_ACCEPT}
                    onChange={handleNoteFileSelect}
                    className="hidden"
                  />
                </div>

                {/* List of attached files */}
                {formAttachments.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-36 overflow-y-auto pr-1">
                    {formAttachments.map((att) => {
                      const isImg = att.type?.startsWith('image/') || att.dataUrl?.startsWith('data:image/');
                      return (
                        <div
                          key={att.id}
                          className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
                        >
                          <div className="flex items-center gap-2 min-w-0 pr-1">
                            {isImg ? (
                              <img
                                src={att.dataUrl}
                                alt={att.name}
                                className="w-7 h-7 object-cover rounded-lg shrink-0 border border-slate-200 dark:border-slate-700"
                              />
                            ) : (
                              <File className="w-5 h-5 text-slate-400 shrink-0" />
                            )}
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[120px]">
                                {att.name}
                              </p>
                              {att.size && (
                                <p className="text-[10px] text-slate-400">
                                  {formatFileSize(att.size)}
                                </p>
                              )}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleRemoveAttachment(att.id)}
                            className="p-1 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer shrink-0"
                            title="حذف پیوست"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Options Row: Color Picker & Pin Toggle */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                {/* Color Selector */}
                <div>
                  <span className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1.5">
                    رنگ کارت
                  </span>
                  <div className="flex items-center gap-2">
                    {Object.keys(COLOR_CONFIGS).map((colorKey) => {
                      const cfg = COLOR_CONFIGS[colorKey];
                      const isSelected = formColor === colorKey;
                      return (
                        <button
                          key={colorKey}
                          type="button"
                          onClick={() => setFormColor(colorKey)}
                          className={`w-7 h-7 rounded-xl ${cfg.bg} ${cfg.border} border-2 transition-transform cursor-pointer flex items-center justify-center ${
                            isSelected ? 'scale-110 ring-2 ring-indigo-500' : 'opacity-80 hover:opacity-100'
                          }`}
                        >
                          {isSelected && <Check className="w-3.5 h-3.5 text-slate-900 dark:text-slate-100" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Pin Toggle Button */}
                <button
                  type="button"
                  onClick={() => setFormIsPinned((prev) => !prev)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                    formIsPinned
                      ? 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-200 border-amber-300'
                      : 'bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <Pin className={`w-4 h-4 ${formIsPinned ? 'fill-amber-500 text-amber-600' : ''}`} />
                  <span>{formIsPinned ? 'سنجاق شده' : 'سنجاق کردن'}</span>
                </button>
              </div>

              {/* Form Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100 dark:border-slate-700/80">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-2xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                >
                  انصراف
                </button>

                <button
                  type="submit"
                  className={`px-5 py-2.5 ${palette.accentBg} ${palette.accentHover} text-white text-xs font-bold rounded-2xl shadow-lg shadow-indigo-500/25 hover:-translate-y-0.5 active:translate-y-0 transition-all cursor-pointer`}
                >
                  {editingNote ? 'ذخیره تغییرات' : 'ثبت یادداشت'}
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

    </div>
  );

  // Helper renderer for Note Card
  function renderNoteCard(note: PersonalNote) {
    const cfg = COLOR_CONFIGS[note.color || 'amber'] || COLOR_CONFIGS.amber;
    const dateStr = new Date(note.createdAt).toLocaleDateString('fa-IR');

    return (
      <div
        key={note.id}
        className={`p-4 sm:p-5 rounded-3xl border ${cfg.bg} ${cfg.border} shadow-2xs flex flex-col justify-between space-y-3 relative group transition-all hover:shadow-md`}
      >
        {/* Top Header Row */}
        <div className="flex items-start justify-between gap-2">
          <h3 className={`font-bold text-sm sm:text-base leading-snug break-words ${cfg.text}`}>
            {note.title}
          </h3>

          <div className="flex items-center gap-1 shrink-0">
            {/* Pin Button */}
            <button
              type="button"
              onClick={() => handleTogglePin(note)}
              className={`p-1.5 rounded-xl transition-colors cursor-pointer ${
                note.isPinned
                  ? 'bg-amber-200 dark:bg-amber-900 text-amber-800 dark:text-amber-100'
                  : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-white/50 dark:hover:bg-slate-800/50'
              }`}
              title={note.isPinned ? 'برداشتن سنجاق' : 'سنجاق کردن به ابتدا'}
            >
              <Pin className={`w-3.5 h-3.5 ${note.isPinned ? 'fill-amber-600 text-amber-600' : ''}`} />
            </button>
          </div>
        </div>

        {/* Content */}
        {note.content && (
          <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap break-words line-clamp-6">
            {note.content}
          </p>
        )}

        {/* Attachments rendering */}
        {note.attachments && note.attachments.length > 0 && (
          <div className="space-y-1.5 pt-1">
            <div className="flex flex-wrap gap-1.5">
              {note.attachments.map((att) => {
                const isImg = att.type?.startsWith('image/') || att.dataUrl?.startsWith('data:image/');
                return (
                  <a
                    key={att.id}
                    href={att.dataUrl}
                    download={att.name}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 px-2.5 py-1 bg-white/70 dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-700/80 rounded-xl text-[11px] font-medium text-slate-800 dark:text-slate-200 hover:border-indigo-400 transition-colors cursor-pointer group/att"
                    title={`دانلود / دانلود فایل ${att.name}`}
                  >
                    {isImg ? (
                      <ImageIcon className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                    ) : (
                      <Paperclip className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    )}
                    <span className="truncate max-w-[110px]">{att.name}</span>
                    <Download className="w-3 h-3 text-slate-400 group-hover/att:text-indigo-600 dark:group-hover/att:text-indigo-400 shrink-0" />
                  </a>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer Bar */}
        <div className="pt-2 border-t border-black/5 dark:border-white/5 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-2">
            <span>{toPersianDigits(dateStr)}</span>
            {onConvertToTask && (convertedNotes[note.id] ? (
              <span
                className="flex items-center gap-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-md bg-emerald-100/70 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/60"
                title="از این یادداشت یک وظیفه ساخته شده است"
              >
                <CheckSquare className="w-3 h-3" />
                <span>به وظیفه تبدیل شد</span>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onConvertToTask(note.title, note.content || '', (taskId) => markConverted(note.id, taskId))}
                className="flex items-center gap-1 text-[10px] font-bold text-indigo-700 dark:text-indigo-400 hover:underline px-2 py-0.5 rounded-md bg-indigo-100/60 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800/60 cursor-pointer"
                title="تبدیل این یادداشت به یک وظیفه جدید"
              >
                <CheckSquare className="w-3 h-3" />
                <span>تبدیل به وظیفه</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 opacity-90 group-hover:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={() => handleCopyNote(note)}
              className="p-1 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg cursor-pointer"
              title="رونوشت از متن"
            >
              {copiedNoteId === note.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            </button>

            <button
              type="button"
              onClick={() => handleOpenEdit(note)}
              className="p-1 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg cursor-pointer"
              title="ویرایش"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => handleDeleteNote(note.id)}
              className="p-1 text-slate-500 hover:text-rose-600 rounded-lg cursor-pointer"
              title="حذف"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    );
  }
};
