import React, { useState, useEffect, useRef } from 'react';
import { X, Settings, Sun, Moon, Grid, Palette, Check, LogOut, LogIn, User as UserIcon, ChevronDown, ChevronUp, Upload, Camera, Loader2, ShieldCheck, Users, Bell, MessageSquare, Smartphone, FileText, Printer } from 'lucide-react';
import { AppTheme, AppColorPalette, User as UserType, WorkTeam, MAX_ATTACHMENT_BYTES } from '../types';
import { COLOR_PALETTES } from '../utils/theme';
import { PRESET_AVATARS, compressImageFile } from '../utils/avatars';
import { readFileAsDataUrl } from '../utils/storage';
import { WorkTeamManagement } from './WorkTeamManagement';
import { useMyPermissions } from './admin/SystemAdministration';
import { canSeeWorkTeams } from '../utils/permissions';
import { userErrorMessage } from '../utils/errorMessages';

export type ThemeMode = 'light' | 'dark';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  appColorTheme: AppTheme;
  setAppColorTheme: (theme: AppTheme) => void;
  appColorPalette: AppColorPalette;
  setAppColorPalette: (palette: AppColorPalette) => void;
  totalTasksCount: number;
  currentUser: UserType | null;
  onLogout: () => void;
  onOpenAuthModal: () => void;
  onSaveProfile?: (data: {
    name?: string;
    username?: string;
    avatar?: string;
    phoneNumber?: string;
    notifySms?: boolean;
  }) => Promise<void>;
  onTeamsUpdated?: (updatedTeams: WorkTeam[]) => void;
  onOpenPdfCatalog?: () => void;
}

const PATTERN_SCHEMES: { id: AppTheme; name: string; description: string; previewClass: string }[] = [
  { id: 'default', name: 'ساده و مدرن', description: 'زمینه خنثی', previewClass: 'bg-pattern-default' },
  { id: 'checkerboard', name: 'طرح شطرنجی', description: 'مربع‌های ریز', previewClass: 'bg-pattern-checkerboard' },
  { id: 'diagonal', name: 'خطوط مورب', description: 'خطوط اریب', previewClass: 'bg-pattern-diagonal' },
  { id: 'grid', name: 'طرح شبکه‌ای', description: 'جدول هندسی', previewClass: 'bg-pattern-grid' },
  { id: 'dots', name: 'طرح نقطه‌ای', description: 'نقطه‌چین ظریف', previewClass: 'bg-pattern-dots' },
  { id: 'cross', name: 'چهارخانه', description: 'متقاطع ریز', previewClass: 'bg-pattern-cross' },
  { id: 'waves', name: 'طرح موجی', description: 'قوس‌های دایره‌ای', previewClass: 'bg-pattern-waves' },
  { id: 'glass', name: 'شیشه‌ای', description: 'الماس‌های ظریف', previewClass: 'bg-pattern-glass' },
  { id: 'bubbles', name: 'حبابی', description: 'حباب‌های رنگی', previewClass: 'bg-pattern-bubbles' },
  { id: 'rain', name: 'بارانی', description: 'قطره‌های باران', previewClass: 'bg-pattern-rain' },
  { id: 'dandelion', name: 'قاصدکی', description: 'قاصدک‌های سبک', previewClass: 'bg-pattern-dandelion' },
  { id: 'snow', name: 'برفی', description: 'دانه‌های برف', previewClass: 'bg-pattern-snow' },
  { id: 'autumn', name: 'برگی پاییزی', description: 'برگ‌های پاییزی', previewClass: 'bg-pattern-autumn' },
  { id: 'spring', name: 'بهاری', description: 'شکوفه‌های بهاری', previewClass: 'bg-pattern-spring' },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  themeMode,
  setThemeMode,
  appColorTheme,
  setAppColorTheme,
  appColorPalette,
  setAppColorPalette,
  currentUser,
  onLogout,
  onOpenAuthModal,
  onSaveProfile,
  onTeamsUpdated,
  onOpenPdfCatalog,
}) => {
  // Accordion state: default CLOSED for all groups
  const [isProfileOpen, setIsProfileOpen] = useState<boolean>(false);
  const [isAdminMgmtOpen, setIsAdminMgmtOpen] = useState<boolean>(false);
  const [isTeamMgmtOpen, setIsTeamMgmtOpen] = useState<boolean>(false);
  // The work-team section is only for people given the work-team permissions.
  const myPermissions = useMyPermissions(currentUser?.id);
  const [isThemeModeOpen, setIsThemeModeOpen] = useState<boolean>(false);
  const [isPaletteOpen, setIsPaletteOpen] = useState<boolean>(false);
  const [isPatternOpen, setIsPatternOpen] = useState<boolean>(false);
  const [isCatalogOpen, setIsCatalogOpen] = useState<boolean>(false);

  // Profile Form States
  const [profileName, setProfileName] = useState<string>('');
  const [profileUsername, setProfileUsername] = useState<string>('');
  const [selectedAvatar, setSelectedAvatar] = useState<string>('');
  const [profilePhoneNumber, setProfilePhoneNumber] = useState<string>('');
  const [notifySms, setNotifySms] = useState<boolean>(true);

  const [isSavingProfile, setIsSavingProfile] = useState<boolean>(false);
  const [profileMsg, setProfileMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Re-initialize the form only when the signed-in user actually changes or the modal (re)opens,
  // not on every re-render of the currentUser object (e.g. a background refresh on window focus),
  // which would otherwise wipe an avatar/photo the user just picked before they could save it.
  useEffect(() => {
    if (currentUser) {
      setProfileName(currentUser.name || '');
      setProfileUsername(currentUser.username || '');
      setSelectedAvatar(currentUser.avatar || '');
      setProfilePhoneNumber(currentUser.phoneNumber || '');
      setNotifySms(currentUser.notifySms !== undefined ? !!currentUser.notifySms : true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id, isOpen]);

  if (!isOpen) return null;

  const handleCustomAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setProfileMsg({ type: 'error', text: 'لطفاً یک فایل تصویری (PNG, JPG, WEBP) انتخاب نمایید.' });
      return;
    }

    const MAX_ALLOWED_BYTES = MAX_ATTACHMENT_BYTES;
    const originalKb = (file.size / 1024).toFixed(0);

    try {
      let finalDataUrl = '';
      if (file.size > MAX_ALLOWED_BYTES) {
        // Auto compress / resize image to fit strictly under 200KB
        finalDataUrl = await compressImageFile(file, 220, 220, 0.8);
        const approxBytes = Math.round(finalDataUrl.length * 0.75);
        if (approxBytes > MAX_ALLOWED_BYTES) {
          finalDataUrl = await compressImageFile(file, 160, 160, 0.65);
        }
        const finalKb = (Math.round(finalDataUrl.length * 0.75) / 1024).toFixed(0);
        setSelectedAvatar(finalDataUrl);
        setProfileMsg({
          type: 'success',
          text: `تصویر اصلی (${originalKb} KB) برای رعایت حد مجاز ۲۰۰ کیلوبایت فشرده‌سازی گردید (${finalKb} KB). جهت ثبت، کلید «ذخیره آواتار و مشخصات» را بزنید.`,
        });
      } else {
        finalDataUrl = await readFileAsDataUrl(file);
        setSelectedAvatar(finalDataUrl);
        setProfileMsg({
          type: 'success',
          text: `تصویر آواتار انتخاب شد (${originalKb} KB). جهت ثبت، کلید «ذخیره آواتار و مشخصات» را بزنید.`,
        });
      }
    } catch (err: any) {
      console.error('Failed to process custom avatar:', err);
      setProfileMsg({ type: 'error', text: userErrorMessage(err, 'بارگذاری یا فشرده‌سازی تصویر با خطا مواجه شد.') });
    }
  };

  const handleSaveProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !onSaveProfile) return;
    setIsSavingProfile(true);
    setProfileMsg(null);
    try {
      await onSaveProfile({
        name: profileName.trim(),
        username: profileUsername.trim(),
        avatar: selectedAvatar,
        phoneNumber: profilePhoneNumber.trim(),
        notifySms: notifySms,
      });
      setProfileMsg({ type: 'success', text: 'تغییرات پروفایل، شماره همراه و تنظیمات اطلاع‌رسانی با موفقیت ذخیره شد 🎉' });
    } catch (err: any) {
      setProfileMsg({ type: 'error', text: userErrorMessage(err, 'خطا در ذخیره‌سازی پروفایل در دیتابیس.') });
    } finally {
      setIsSavingProfile(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="fixed inset-0"
        onClick={onClose}
      />

      <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden z-10 animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold">
            <Settings className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <h3>تنظیمات ظاهر، پالت رنگ و طرح زمینه</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-4 text-xs sm:text-sm overflow-y-auto">

          {/* Accordion Group 0: User Profile & Avatar Selection */}
          {currentUser && (
            <div className="border border-indigo-200 dark:border-indigo-900/60 rounded-2xl overflow-hidden bg-indigo-50/30 dark:bg-indigo-950/20">
              <button
                type="button"
                onClick={() => setIsProfileOpen(!isProfileOpen)}
                className="w-full flex items-center justify-between p-4 font-bold text-slate-900 dark:text-slate-100 text-xs hover:bg-indigo-100/50 dark:hover:bg-indigo-900/40 transition-colors cursor-pointer select-none"
              >
                <div className="flex items-center gap-2">
                  <UserIcon className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span>پروفایل و انتخاب آواتار کاربر</span>
                </div>
                <div className="flex items-center gap-2 text-slate-400">
                  <span className="text-[10px] font-normal text-indigo-600 dark:text-indigo-300">
                    {currentUser.name}
                  </span>
                  {isProfileOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </div>
              </button>

              {isProfileOpen && (
                <div className="p-4 pt-0 border-t border-indigo-200/60 dark:border-indigo-900/50 space-y-4 animate-in fade-in duration-150 mt-3">
                  
                  {/* Message Alert */}
                  {profileMsg && (
                    <div className={`p-3 rounded-xl text-xs font-semibold ${
                      profileMsg.type === 'success'
                        ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                        : 'bg-rose-50 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                    }`}>
                      {profileMsg.text}
                    </div>
                  )}

                  <form onSubmit={handleSaveProfileSubmit} className="space-y-4">
                    {/* Current Avatar Preview & Upload */}
                    <div className="flex flex-col sm:flex-row items-center gap-4 bg-white dark:bg-slate-800/80 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700">
                      <div className="relative shrink-0">
                        {selectedAvatar ? (
                          <img
                            src={selectedAvatar}
                            alt="آواتار انتخابی"
                            className="w-16 h-16 rounded-2xl object-cover border-2 border-indigo-500 shadow-md"
                          />
                        ) : (
                          <div className="w-16 h-16 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-bold text-xl border-2 border-indigo-400 shadow-md">
                            {profileName ? profileName.charAt(0).toUpperCase() : <UserIcon className="w-8 h-8" />}
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="absolute -bottom-1 -right-1 p-1.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-500 transition-colors shadow-xs cursor-pointer"
                          title="بارگذاری تصویر شخصی"
                        >
                          <Camera className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="flex-1 text-center sm:text-right space-y-2">
                        <div>
                          <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100">تصویر آواتار کاربر</h4>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                            می‌توانید از آلبوم ۲۴ آواتار پیش‌فرض انتخاب کنید یا عکس دلخواه خود را بارگذاری نمایید.
                          </p>
                        </div>

                        {/* Acceptable file size & format notice before upload */}
                        <div className="p-2.5 rounded-xl bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-800/60 text-right space-y-1">
                          <div className="flex items-center gap-1.5 text-[11px] font-bold text-indigo-900 dark:text-indigo-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 dark:bg-indigo-400 shrink-0" />
                            <span>حجم قابل قبول: <strong>حداکثر ۲۰۰ کیلوبایت (200 KB)</strong></span>
                          </div>
                          <p className="text-[10px] text-slate-600 dark:text-slate-400 leading-relaxed pr-3">
                            فرمت‌های مجاز: <strong>JPG, PNG, WEBP, GIF</strong> (تصاویر بزرگتر نیز به صورت خودکار و هوشمند فشرده‌سازی می‌شوند).
                          </p>
                        </div>

                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handleCustomAvatarUpload}
                          className="hidden"
                        />
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          title="حجم مجاز: حداکثر ۲۰۰ کیلوبایت (فرمت‌های JPG, PNG, WEBP)"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-xs"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          <span>بارگذاری تصویر شخصی (حداکثر ۲۰۰ KB)</span>
                        </button>
                      </div>
                    </div>

                    {/* Default Preset Avatar Album */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
                        انتخاب از آلبوم آواتارهای پیش‌فرض:
                      </label>
                      <div className="grid grid-cols-5 gap-2.5 max-h-40 overflow-y-auto p-1">
                        {PRESET_AVATARS.map((avatar) => {
                          const isSelected = selectedAvatar === avatar.url;
                          return (
                            <button
                              key={avatar.id}
                              type="button"
                              onClick={() => {
                                setSelectedAvatar(avatar.url);
                                setProfileMsg(null);
                              }}
                              className={`relative p-1 rounded-2xl border-2 transition-all cursor-pointer aspect-square flex items-center justify-center bg-white dark:bg-slate-800 hover:scale-105 ${
                                isSelected
                                  ? 'border-indigo-600 ring-2 ring-indigo-400/40 shadow-md scale-105'
                                  : 'border-slate-200 dark:border-slate-700 opacity-80 hover:opacity-100'
                              }`}
                              title={avatar.name}
                            >
                              <img src={avatar.url} alt={avatar.name} className="w-full h-full rounded-xl object-cover" />
                              {isSelected && (
                                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px]">
                                  ✓
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Name & Username Inputs */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                          نام و نام خانوادگی *
                        </label>
                        <input
                          type="text"
                          value={profileName}
                          onChange={(e) => setProfileName(e.target.value)}
                          placeholder="مثلاً: علی محمدی"
                          required
                          className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                          نام کاربری (در دیتابیس)
                        </label>
                        <input
                          type="text"
                          value={profileUsername}
                          onChange={(e) => setProfileUsername(e.target.value)}
                          placeholder="username"
                          className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 dir-ltr text-right"
                        />
                      </div>
                    </div>

                    {/* Notification Settings Section (SMS) */}
                    <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-3">
                      <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200">
                        <Bell className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                        <span>تنظیمات اطلاع‌رسانی شخصی کاربر (پیامک)</span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {/* Phone Number Field */}
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1.5">
                            <Smartphone className="w-3.5 h-3.5 text-indigo-500" />
                            <span>شماره تلفن همراه (ورود و پیامک):</span>
                          </label>
                          <input
                            type="tel"
                            value={profilePhoneNumber}
                            onChange={(e) => setProfilePhoneNumber(e.target.value)}
                            placeholder="09121234567"
                            className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 dir-ltr text-right"
                          />
                        </div>

                      </div>

                      {/* Notification Toggles */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                        {/* SMS Toggle Option */}
                        <label className={`flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer select-none ${
                          notifySms
                            ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-300 dark:border-indigo-700 text-indigo-900 dark:text-indigo-200'
                            : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                        }`}>
                          <div className="flex items-center gap-2">
                            <MessageSquare className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                            <span className="text-xs font-semibold">اطلاع‌رسانی با پیامک (SMS)</span>
                          </div>
                          <input
                            type="checkbox"
                            checked={notifySms}
                            onChange={(e) => setNotifySms(e.target.checked)}
                            className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                          />
                        </label>

                      </div>
                    </div>

                    {/* Submit Button */}
                    <div className="flex justify-end pt-1">
                      <button
                        type="submit"
                        disabled={isSavingProfile}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-all shadow-md cursor-pointer flex items-center gap-2 disabled:opacity-50"
                      >
                        {isSavingProfile ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>در حال ذخیره در دیتابیس...</span>
                          </>
                        ) : (
                          <>
                            <Check className="w-4 h-4" />
                            <span>ذخیره آواتار و مشخصات در دیتابیس</span>
                          </>
                        )}
                      </button>
                    </div>

                  </form>
                </div>
              )}
            </div>
          )}

          {/* Work Team Management Accordion (only with the work-team permissions) */}
          {currentUser && canSeeWorkTeams(myPermissions) && (
            <div className="border border-indigo-200 dark:border-indigo-900/60 rounded-2xl overflow-hidden bg-indigo-50/20 dark:bg-indigo-950/20">
              <button
                type="button"
                onClick={() => setIsTeamMgmtOpen(!isTeamMgmtOpen)}
                className="w-full flex items-center justify-between p-4 font-bold text-slate-900 dark:text-slate-100 text-xs hover:bg-indigo-100/50 dark:hover:bg-indigo-900/40 transition-colors cursor-pointer select-none"
              >
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span>مدیریت تیم کاری من</span>
                </div>
                <div className="flex items-center gap-2 text-slate-400">
                  <span className="text-[10px] font-normal text-indigo-600 dark:text-indigo-300">
                    ساخت و همکاران
                  </span>
                  {isTeamMgmtOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </div>
              </button>

              {isTeamMgmtOpen && (
                <div className="p-4 pt-0 border-t border-indigo-200/60 dark:border-indigo-900/50 animate-in fade-in duration-150 mt-3">
                  <WorkTeamManagement currentUser={currentUser} onTeamsUpdated={onTeamsUpdated} />
                </div>
              )}
            </div>
          )}

          {/* Accordion Group 1: Light / Dark Mode */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-slate-50/50 dark:bg-slate-800/30">
            <button
              type="button"
              onClick={() => setIsThemeModeOpen(!isThemeModeOpen)}
              className="w-full flex items-center justify-between p-4 font-bold text-slate-900 dark:text-slate-100 text-xs hover:bg-slate-100/60 dark:hover:bg-slate-800/60 transition-colors cursor-pointer select-none"
            >
              <div className="flex items-center gap-2">
                <Sun className="w-4 h-4 text-amber-500" />
                <span>حالت روز / شب (طرح روشن و تیره)</span>
              </div>
              <div className="flex items-center gap-2 text-slate-400">
                <span className="text-[10px] font-normal text-slate-500 dark:text-slate-400">
                  {themeMode === 'light' ? 'طرح روشن' : 'طرح تیره'}
                </span>
                {isThemeModeOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </div>
            </button>

            {isThemeModeOpen && (
              <div className="p-4 pt-0 border-t border-slate-200/60 dark:border-slate-800/60 space-y-3 animate-in fade-in duration-150 mt-3">
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setThemeMode('light')}
                    className={`flex items-center justify-center gap-2 py-3 px-4 rounded-2xl border transition-all cursor-pointer font-bold text-xs ${
                      themeMode === 'light'
                        ? 'bg-indigo-50 border-indigo-500 text-indigo-700 dark:bg-indigo-950/60 dark:border-indigo-400 dark:text-indigo-300 shadow-xs'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/60'
                    }`}
                  >
                    <Sun className="w-4 h-4 text-amber-500" />
                    <span>طرح روشن</span>
                    {themeMode === 'light' && <Check className="w-4 h-4 text-indigo-600 dark:text-indigo-400 mr-auto" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => setThemeMode('dark')}
                    className={`flex items-center justify-center gap-2 py-3 px-4 rounded-2xl border transition-all cursor-pointer font-bold text-xs ${
                      themeMode === 'dark'
                        ? 'bg-indigo-50 border-indigo-500 text-indigo-700 dark:bg-indigo-950/60 dark:border-indigo-400 dark:text-indigo-300 shadow-xs'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/60'
                    }`}
                  >
                    <Moon className="w-4 h-4 text-indigo-400" />
                    <span>طرح تیره</span>
                    {themeMode === 'dark' && <Check className="w-4 h-4 text-indigo-600 dark:text-indigo-400 mr-auto" />}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Accordion Group 2: Color Palette Selector */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-slate-50/50 dark:bg-slate-800/30">
            <button
              type="button"
              onClick={() => setIsPaletteOpen(!isPaletteOpen)}
              className="w-full flex items-center justify-between p-4 font-bold text-slate-900 dark:text-slate-100 text-xs hover:bg-slate-100/60 dark:hover:bg-slate-800/60 transition-colors cursor-pointer select-none"
            >
              <div className="flex items-center gap-2">
                <Palette className="w-4 h-4 text-indigo-500" />
                <span>پالت رنگی اصلی اپلیکیشن</span>
              </div>
              <div className="flex items-center gap-2 text-slate-400">
                <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold">
                  {COLOR_PALETTES[appColorPalette]?.name || 'نیلی'}
                </span>
                {isPaletteOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </div>
            </button>

            {isPaletteOpen && (
              <div className="p-4 pt-0 border-t border-slate-200/60 dark:border-slate-800/60 space-y-3 animate-in fade-in duration-150 mt-3">
                <p className="text-[10px] text-slate-400 font-normal">تغییر همزمان رنگ پالت عناصر و رنگ خطوط طرح زمینه (ذخیره در دیتابیس)</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {(Object.keys(COLOR_PALETTES) as AppColorPalette[]).map((key) => {
                    const palette = COLOR_PALETTES[key];
                    const isSelected = appColorPalette === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setAppColorPalette(key)}
                        className={`p-2.5 rounded-2xl border transition-all cursor-pointer flex flex-col items-start gap-1.5 overflow-hidden ${
                          isSelected
                            ? 'border-indigo-600 ring-2 ring-indigo-500/30 bg-indigo-50/50 dark:bg-indigo-950/50 shadow-xs'
                            : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-800/80'
                        }`}
                      >
                        <div className={`w-full h-8 rounded-xl ${palette.previewBg} flex items-center justify-end p-1.5 shadow-xs`}>
                          {isSelected && (
                            <div className="w-4 h-4 rounded-full bg-white text-slate-900 flex items-center justify-center shadow-xs">
                              <Check className="w-2.5 h-2.5" />
                            </div>
                          )}
                        </div>
                        <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200">
                          {palette.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Accordion Group 3: Pattern Theme Selector */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-slate-50/50 dark:bg-slate-800/30">
            <button
              type="button"
              onClick={() => setIsPatternOpen(!isPatternOpen)}
              className="w-full flex items-center justify-between p-4 font-bold text-slate-900 dark:text-slate-100 text-xs hover:bg-slate-100/60 dark:hover:bg-slate-800/60 transition-colors cursor-pointer select-none"
            >
              <div className="flex items-center gap-2">
                <Grid className="w-4 h-4 text-indigo-500" />
                <span>طرح بافت زمینه (پترن گرافیکی)</span>
              </div>
              <div className="flex items-center gap-2 text-slate-400">
                <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold">
                  {PATTERN_SCHEMES.find((s) => s.id === appColorTheme)?.name || 'ساده'}
                </span>
                {isPatternOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </div>
            </button>

            {isPatternOpen && (
              <div className="p-4 pt-0 border-t border-slate-200/60 dark:border-slate-800/60 space-y-3 animate-in fade-in duration-150 mt-3">
                <p className="text-[10px] text-slate-400 font-normal">تغییر الگوی زمینه صفحه و کارت‌های کاربری (ذخیره در دیتابیس)</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {PATTERN_SCHEMES.map((scheme) => {
                    const isSelected = appColorTheme === scheme.id;
                    return (
                      <button
                        key={scheme.id}
                        type="button"
                        onClick={() => setAppColorTheme(scheme.id)}
                        className={`relative p-2.5 rounded-2xl border transition-all cursor-pointer flex flex-col items-start gap-1.5 overflow-hidden ${
                          isSelected
                            ? 'border-indigo-600 ring-2 ring-indigo-500/30 bg-indigo-50/50 dark:bg-indigo-950/50 shadow-xs'
                            : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-800/80'
                        }`}
                      >
                        {/* Visual pattern preview mini box */}
                        <div className={`w-full h-10 rounded-xl border border-slate-200 dark:border-slate-700 ${scheme.previewClass} palette-${appColorPalette} flex items-center justify-end p-1.5 shadow-inner`}>
                          {isSelected && (
                            <div className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-xs">
                              <Check className="w-3 h-3" />
                            </div>
                          )}
                        </div>
                        <div>
                          <p className="text-[11px] font-bold text-slate-800 dark:text-slate-200 leading-tight">
                            {scheme.name}
                          </p>
                          <p className="text-[9px] text-slate-400 font-normal mt-0.5">
                            {scheme.description}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Accordion Group 4: Feature Catalog & PDF Handbook (Collapsible, closed by default) */}
          {onOpenPdfCatalog && (
            <div className="border border-emerald-200 dark:border-emerald-900/60 rounded-2xl overflow-hidden bg-emerald-50/30 dark:bg-emerald-950/20">
              <button
                type="button"
                onClick={() => setIsCatalogOpen(!isCatalogOpen)}
                className="w-full flex items-center justify-between p-4 font-bold text-slate-900 dark:text-slate-100 text-xs hover:bg-emerald-100/50 dark:hover:bg-emerald-900/40 transition-colors cursor-pointer select-none"
              >
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>دفترچه راهنما و کاتالوگ امکانات سامانه</span>
                </div>
                <div className="flex items-center gap-2 text-slate-400">
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold bg-emerald-100/80 dark:bg-emerald-950/80 px-2 py-0.5 rounded-lg border border-emerald-300 dark:border-emerald-800">
                    نسخه PDF
                  </span>
                  {isCatalogOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </div>
              </button>

              {isCatalogOpen && (
                <div className="p-4 pt-0 border-t border-emerald-200/60 dark:border-emerald-900/50 space-y-3 animate-in fade-in duration-150 mt-3">
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    مشاهده مستندات جامع، راهنمای تمام قابلیت‌ها و دریافت خروجی نسخه چاپی (PDF)
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenPdfCatalog();
                    }}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer active:scale-95"
                  >
                    <Printer className="w-4 h-4" />
                    <span>مشاهده و دریافت دفترچه راهنما (PDF)</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* User Account & Logout Section */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
            {currentUser ? (
              <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 p-3 rounded-2xl border border-slate-200/80 dark:border-slate-700/80">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-sm shrink-0">
                    {currentUser.name ? currentUser.name.charAt(0).toUpperCase() : <UserIcon className="w-4 h-4" />}
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-100">{currentUser.name}</p>
                    <p className="text-[10px] text-slate-400 dir-ltr text-right">@{currentUser.username}</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onLogout}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:hover:bg-rose-900/60 dark:text-rose-300 rounded-xl text-xs font-bold transition-colors cursor-pointer border border-rose-200 dark:border-rose-800"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>خروج</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between bg-indigo-50/50 dark:bg-indigo-950/40 p-3 rounded-2xl border border-indigo-100 dark:border-indigo-900/50">
                <span className="text-xs text-slate-600 dark:text-slate-300">وارد حساب کاربری نشده‌اید</span>
                <button
                  type="button"
                  onClick={onOpenAuthModal}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>ورود به سیستم</span>
                </button>
              </div>
            )}
          </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-100 dark:border-slate-800 flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer shadow-xs"
          >
            تایید و بستن
          </button>
        </div>

      </div>
    </div>
  );
};
