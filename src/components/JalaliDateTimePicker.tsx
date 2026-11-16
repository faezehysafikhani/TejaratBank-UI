import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  PERSIAN_MONTH_NAMES,
  PERSIAN_WEEK_DAYS_SHORT,
  getJalaliMonthDays,
  getJalaliMonthFirstDayOfWeek,
  getCurrentJalali,
  getNowISO,
  jalaliToISO,
  parseISOToJalali,
  getJalaliHoliday,
} from '../utils/jalali';
import { toPersianDigits } from '../utils/helpers';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Clock,
  Check,
  RotateCcw,
  X
} from 'lucide-react';

interface JalaliDateTimePickerProps {
  valueISO: string;
  onChangeISO: (isoString: string) => void;
  label?: string;
  popoverPosition?: 'top' | 'bottom' | 'auto';
  disabled?: boolean;
  /** Marks the field as required (red star after the label). */
  required?: boolean;
  /** The field may stay empty: it shows `emptyText` (not the current moment) until a date is picked, and has a ✕ to clear it. */
  optional?: boolean;
  emptyText?: string;
}

export const JalaliDateTimePicker: React.FC<JalaliDateTimePickerProps> = ({
  valueISO,
  onChangeISO,
  label = 'موعد انجام (تاریخ و ساعت)',
  popoverPosition = 'auto',
  disabled = false,
  required = false,
  optional = false,
  emptyText = 'بدون تاریخ',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [popoverCoords, setPopoverCoords] = useState<{
    top?: number;
    left?: number;
    right?: number;
    maxHeight?: number;
  }>({});

  // Selected date parts
  const parsed = parseISOToJalali(valueISO || getNowISO());
  const [selectedJy, setSelectedJy] = useState(parsed.jy);
  const [selectedJm, setSelectedJm] = useState(parsed.jm);
  const [selectedJd, setSelectedJd] = useState(parsed.jd);
  const [selectedHour, setSelectedHour] = useState(parsed.hour);
  const [selectedMinute, setSelectedMinute] = useState(parsed.minute);

  // Calendar view navigation state (year & month being viewed)
  const [viewJy, setViewJy] = useState(parsed.jy);
  const [viewJm, setViewJm] = useState(parsed.jm);

  const updatePosition = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    // The calendar's real height (it is taller than it looks: header, days, time and actions),
    // capped to the window - past that it scrolls inside itself.
    const maxHeight = windowHeight - 24;
    const calendarHeight = Math.min(popoverRef.current?.offsetHeight || 440, maxHeight);
    const calendarWidth = Math.min(320, windowWidth - 24);

    const spaceBelow = windowHeight - rect.bottom;
    const spaceAbove = rect.top;

    let shouldOpenTop = false;
    if (popoverPosition === 'top') {
      shouldOpenTop = spaceAbove >= 200 || spaceAbove > spaceBelow;
    } else if (popoverPosition === 'bottom') {
      shouldOpenTop = spaceBelow < 200 && spaceAbove > spaceBelow;
    } else {
      // 'auto'
      shouldOpenTop = spaceBelow < calendarHeight && spaceAbove > spaceBelow;
    }

    let finalTop: number;
    if (shouldOpenTop) {
      const calculatedTop = rect.top - calendarHeight - 6;
      finalTop = Math.max(12, Math.min(calculatedTop, windowHeight - calendarHeight - 12));
    } else {
      const calculatedTop = rect.bottom + 6;
      finalTop = Math.max(12, Math.min(calculatedTop, windowHeight - calendarHeight - 12));
    }

    const idealRight = windowWidth - rect.right;
    if (idealRight + calendarWidth <= windowWidth - 12 && idealRight >= 12) {
      setPopoverCoords({ top: finalTop, right: idealRight, maxHeight });
    } else {
      const calcLeft = Math.max(12, Math.min(rect.left, windowWidth - calendarWidth - 12));
      setPopoverCoords({ top: finalTop, left: calcLeft, maxHeight });
    }
  };

  // Before paint, so the calendar never shows at a stale position. It follows its field when the
  // form around it scrolls; scrolling inside the calendar itself does not move it.
  useLayoutEffect(() => {
    if (isOpen) {
      updatePosition();
      const handleScrollOrResize = (event: Event) => {
        if (popoverRef.current && event.target instanceof Node && popoverRef.current.contains(event.target)) return;
        updatePosition();
      };
      window.addEventListener('scroll', handleScrollOrResize, true);
      window.addEventListener('resize', handleScrollOrResize);
      return () => {
        window.removeEventListener('scroll', handleScrollOrResize, true);
        window.removeEventListener('resize', handleScrollOrResize);
      };
    }
  }, [isOpen, popoverPosition]);

  useEffect(() => {
    const p = parseISOToJalali(valueISO || getNowISO());
    setSelectedJy(p.jy);
    setSelectedJm(p.jm);
    setSelectedJd(p.jd);
    setSelectedHour(p.hour);
    setSelectedMinute(p.minute);

    setViewJy(p.jy);
    setViewJm(p.jm);
  }, [valueISO]);

  const monthDays = getJalaliMonthDays(viewJy, viewJm);
  const firstDayOfWeek = getJalaliMonthFirstDayOfWeek(viewJy, viewJm);

  const handlePrevMonth = () => {
    if (viewJm === 1) {
      setViewJm(12);
      setViewJy((y) => y - 1);
    } else {
      setViewJm((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewJm === 12) {
      setViewJm(1);
      setViewJy((y) => y + 1);
    } else {
      setViewJm((m) => m + 1);
    }
  };

  const handlePrevYear = () => {
    setViewJy((y) => y - 1);
  };

  const handleNextYear = () => {
    setViewJy((y) => y + 1);
  };

  // Every pick is applied to the value right away, so what the field shows is what is saved -
  // also when the calendar is closed by clicking outside it. "انصراف" restores the value it had
  // when the calendar was opened.
  const valueAtOpenRef = useRef(valueISO);
  const commit = (jy: number, jm: number, jd: number, hour: number, minute: number) => {
    onChangeISO(jalaliToISO(jy, jm, jd, hour, minute));
  };

  const handleSelectDay = (day: number) => {
    setSelectedJy(viewJy);
    setSelectedJm(viewJm);
    setSelectedJd(day);
    commit(viewJy, viewJm, day, selectedHour, selectedMinute);
  };

  const handleSelectHour = (hour: number) => {
    setSelectedHour(hour);
    commit(selectedJy, selectedJm, selectedJd, hour, selectedMinute);
  };

  const handleSelectMinute = (minute: number) => {
    setSelectedMinute(minute);
    commit(selectedJy, selectedJm, selectedJd, selectedHour, minute);
  };

  const handleOpen = () => {
    valueAtOpenRef.current = valueISO;
    setIsOpen(true);
  };

  const handleConfirm = () => {
    commit(selectedJy, selectedJm, selectedJd, selectedHour, selectedMinute);
    setIsOpen(false);
  };

  const handleCancel = () => {
    if (valueAtOpenRef.current !== valueISO) {
      onChangeISO(valueAtOpenRef.current);
    }
    setIsOpen(false);
  };

  const handleSetToday = () => {
    const cur = getCurrentJalali();
    setSelectedJy(cur.jy);
    setSelectedJm(cur.jm);
    setSelectedJd(cur.jd);
    setSelectedHour(cur.hour);
    setSelectedMinute(cur.minute);

    setViewJy(cur.jy);
    setViewJm(cur.jm);
    commit(cur.jy, cur.jm, cur.jd, cur.hour, cur.minute);
  };

  // Display text
  const padTwo = (n: number) => n.toString().padStart(2, '0');
  const formattedDisplay = `${toPersianDigits(selectedJy)}/${toPersianDigits(
    padTwo(selectedJm)
  )}/${toPersianDigits(padTwo(selectedJd))} - ${toPersianDigits(
    padTwo(selectedHour)
  )}:${toPersianDigits(padTwo(selectedMinute))}`;

  return (
    <div className="relative">
      {label && (
        <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1 flex items-center gap-1.5">
          <CalendarIcon className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
          <span>{label}</span>
          {required && <span className="text-rose-500">*</span>}
        </label>
      )}

      {/* Trigger Button */}
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && (isOpen ? setIsOpen(false) : handleOpen())}
        className={`w-full flex items-center justify-between px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 text-xs border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500 transition-all font-medium text-slate-800 dark:text-slate-100 ${
          disabled ? 'opacity-60 cursor-not-allowed' : 'hover:bg-slate-100/80 dark:hover:bg-slate-800 cursor-pointer'
        }`}
      >
        {optional && !valueISO
          ? <span className="text-xs font-medium text-slate-400 dark:text-slate-500">{emptyText}</span>
          : <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">{formattedDisplay}</span>}
        <Clock className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
      </button>
      {optional && valueISO && !disabled && (
        <button
          type="button"
          onClick={() => { onChangeISO(''); setIsOpen(false); }}
          className="absolute left-9 top-1/2 -translate-y-1/2 p-1 rounded-md text-slate-400 hover:text-rose-600 cursor-pointer"
          aria-label="حذف تاریخ"
          title="حذف تاریخ"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Date & Time Picker Modal / Dropdown. Rendered on <body>: inside a dialog whose overlay
          has a backdrop filter, position: fixed would be relative to that scrolling overlay
          instead of the window - the calendar made the dialog scrollable and jumped around as
          it was repositioned on every scroll. */}
      {isOpen && createPortal(
        <>
          <div className="fixed inset-0 z-[9998] bg-black/10 backdrop-blur-[0.5px]" onClick={() => setIsOpen(false)} />

          <div
            ref={popoverRef}
            dir="rtl"
            style={{
              position: 'fixed',
              top: popoverCoords.top !== undefined ? `${popoverCoords.top}px` : undefined,
              left: popoverCoords.left !== undefined ? `${popoverCoords.left}px` : undefined,
              right: popoverCoords.right !== undefined ? `${popoverCoords.right}px` : undefined,
              maxHeight: popoverCoords.maxHeight !== undefined ? `${popoverCoords.maxHeight}px` : undefined,
              overflowY: 'auto',
              overscrollBehavior: 'contain',
            }}
            className="z-[9999] w-[300px] sm:w-[320px] bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 p-4 animate-in fade-in zoom-in-95 text-slate-800 dark:text-slate-100"
          >
            
            {/* Header / Month Year Navigation */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-700 mb-3">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handlePrevYear}
                  className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 rounded-lg transition-colors cursor-pointer"
                  title="سال قبل"
                >
                  <ChevronsRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handlePrevMonth}
                  className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg transition-colors cursor-pointer"
                  title="ماه قبل"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <div className="text-center">
                <span className="text-sm font-bold text-slate-800 dark:text-slate-100">
                  {PERSIAN_MONTH_NAMES[viewJm - 1]} {toPersianDigits(viewJy)}
                </span>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleNextMonth}
                  className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg transition-colors cursor-pointer"
                  title="ماه بعد"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleNextYear}
                  className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 rounded-lg transition-colors cursor-pointer"
                  title="سال بعد"
                >
                  <ChevronsLeft className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Weekdays Header */}
            <div className="grid grid-cols-7 gap-1 text-center mb-1">
              {PERSIAN_WEEK_DAYS_SHORT.map((wd, idx) => (
                <div
                  key={idx}
                  className={`text-[11px] font-bold py-1 ${
                    idx === 5 || idx === 6
                      ? 'text-rose-500 dark:text-rose-400'
                      : 'text-slate-400 dark:text-slate-500'
                  }`}
                >
                  {wd}
                </div>
              ))}
            </div>

            {/* Days Grid */}
            <div className="grid grid-cols-7 gap-1 text-center mb-4">
              {/* Empty offset spaces */}
              {Array.from({ length: firstDayOfWeek }).map((_, idx) => (
                <div key={`empty-${idx}`} />
              ))}

              {/* Days */}
              {Array.from({ length: monthDays }).map((_, idx) => {
                const day = idx + 1;
                const isSelected =
                  selectedJy === viewJy && selectedJm === viewJm && selectedJd === day;
                const dayOfWeekIdx = (firstDayOfWeek + idx) % 7;
                const isWeekend = dayOfWeekIdx === 5 || dayOfWeekIdx === 6;
                const holidayInfo = getJalaliHoliday(viewJy, viewJm, day);
                const isRedDay = isWeekend || holidayInfo.isHoliday;

                const tooltipText = holidayInfo.isHoliday
                  ? holidayInfo.title
                  : isWeekend
                  ? dayOfWeekIdx === 5
                    ? 'پنج‌شنبه (تعطیل)'
                    : 'جمعه (تعطیل)'
                  : undefined;

                return (
                  <button
                    type="button"
                    key={day}
                    onClick={() => handleSelectDay(day)}
                    title={tooltipText}
                    className={`h-8 w-8 mx-auto rounded-xl flex items-center justify-center text-xs font-semibold transition-all cursor-pointer relative ${
                      isSelected
                        ? isRedDay
                          ? 'bg-rose-600 text-white shadow-xs font-bold'
                          : 'bg-indigo-600 text-white shadow-xs font-bold'
                        : isRedDay
                        ? 'bg-rose-50/70 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 font-bold hover:bg-rose-100 dark:hover:bg-rose-900/60 border border-rose-200/60 dark:border-rose-900/40'
                        : 'hover:bg-indigo-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 hover:text-indigo-700 dark:hover:text-indigo-300'
                    }`}
                  >
                    {toPersianDigits(day)}
                    {holidayInfo.isHoliday && (
                      <span className={`absolute top-1 left-1 w-1 h-1 rounded-full ${isSelected ? 'bg-white' : 'bg-rose-500 dark:bg-rose-400'}`} />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Hour & Minute Selectors */}
            <div className="pt-3 border-t border-slate-100 dark:border-slate-700 mb-4">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-200 mb-2">
                <span className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
                  <Clock className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span>تنظیم زمان:</span>
                </span>
                <span dir="ltr" className="text-indigo-700 dark:text-indigo-300 font-mono font-bold">
                  {toPersianDigits(padTwo(selectedHour))}:{toPersianDigits(padTwo(selectedMinute))}
                </span>
              </div>

              <div className="flex items-center justify-center gap-3 bg-slate-50 dark:bg-slate-900 p-2 rounded-xl border border-slate-100 dark:border-slate-700">
                {/* Minute Picker (راست: دقیقه) */}
                <div className="flex items-center gap-1">
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">دقیقه:</span>
                  <select
                    value={selectedMinute}
                    onChange={(e) => handleSelectMinute(parseInt(e.target.value, 10))}
                    className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-hidden focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                  >
                    {Array.from({ length: 60 }).map((_, m) => (
                      <option key={m} value={m} className="bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100">
                        {toPersianDigits(padTwo(m))}
                      </option>
                    ))}
                  </select>
                </div>

                <span className="text-slate-300 dark:text-slate-600 font-bold">:</span>

                {/* Hour Picker (چپ: ساعت) */}
                <div className="flex items-center gap-1">
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">ساعت:</span>
                  <select
                    value={selectedHour}
                    onChange={(e) => handleSelectHour(parseInt(e.target.value, 10))}
                    className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-hidden focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                  >
                    {Array.from({ length: 24 }).map((_, h) => (
                      <option key={h} value={h} className="bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100">
                        {toPersianDigits(padTwo(h))}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-700">
              <button
                type="button"
                onClick={handleSetToday}
                className="flex items-center gap-1 text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 px-2 py-1 hover:bg-indigo-50 dark:hover:bg-slate-700 rounded-lg cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>امروز</span>
              </button>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleCancel}
                  className="px-2.5 py-1.5 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg cursor-pointer"
                >
                  انصراف
                </button>

                <button
                  type="button"
                  onClick={handleConfirm}
                  className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>تأیید</span>
                </button>
              </div>
            </div>

          </div>
        </>,
        document.body
      )}
    </div>
  );
};

