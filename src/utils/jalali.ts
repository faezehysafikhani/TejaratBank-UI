// Lightweight Jalali (Shamsi) date library helpers for calculations and formatting

export const PERSIAN_MONTH_NAMES = [
  'فروردین',
  'اردیبهشت',
  'خرداد',
  'تیر',
  'مرداد',
  'شهریور',
  'مهر',
  'آبان',
  'آذر',
  'دی',
  'بهمن',
  'اسفند',
];

export const PERSIAN_WEEK_DAYS = [
  'شنبه',
  'یکشنبه',
  'دوشنبه',
  'سه‌شنبه',
  'چهارشنبه',
  'پنج‌شنبه',
  'جمعه',
];

export const PERSIAN_WEEK_DAYS_SHORT = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];

// Convert Gregorian to Jalali
export function gregorianToJalali(gy: number, gm: number, gd: number): { jy: number; jm: number; jd: number } {
  const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  let jy = gy <= 1600 ? 0 : 979;
  gy -= gy <= 1600 ? 621 : 1600;

  const gy2 = gm > 2 ? gy + 1 : gy;
  let days =
    365 * gy +
    Math.floor((gy2 + 3) / 4) -
    Math.floor((gy2 + 99) / 100) +
    Math.floor((gy2 + 399) / 400) -
    80 +
    gd +
    g_d_m[gm - 1];

  jy += 33 * Math.floor(days / 12053);
  days %= 12053;
  jy += 4 * Math.floor(days / 1461);
  days %= 1461;

  if (days > 365) {
    jy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }

  const jm = days < 186 ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
  const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);

  return { jy, jm, jd };
}

// Convert Jalali to Gregorian
export function jalaliToGregorian(jy: number, jm: number, jd: number): { gy: number; gm: number; gd: number } {
  let gy = jy <= 979 ? 621 : 1600;
  jy -= jy <= 979 ? 0 : 979;

  let days =
    365 * jy +
    Math.floor(jy / 33) * 8 +
    Math.floor(((jy % 33) + 3) / 4) +
    78 +
    jd +
    (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);

  gy += 400 * Math.floor(days / 146097);
  days %= 146097;

  if (days > 36524) {
    gy += 100 * Math.floor(--days / 36524);
    days %= 36524;
    if (days >= 365) days++;
  }

  gy += 4 * Math.floor(days / 1461);
  days %= 1461;

  if (days > 365) {
    gy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }

  let gd = days + 1;
  const sal_a = [
    0,
    31,
    (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0 ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];

  let gm = 0;
  for (gm = 0; gm < 13 && gd > sal_a[gm]; gm++) {
    gd -= sal_a[gm];
  }

  return { gy, gm, gd };
}

// Is Jalali Leap Year
export function isJalaliLeapYear(jy: number): boolean {
  const breaks = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];
  let jp = breaks[0];
  let jump = 0;

  for (let i = 1; i < breaks.length; i++) {
    const jm = breaks[i];
    jump = jm - jp;
    if (jy < jm) break;
    jp = jm;
  }

  let n = jy - jp;
  if (jump - n < 6) n = n - jump + Math.floor((jump + 4) / 33) * 33;
  let leap = ((((n + 1) % 33) - 1) % 4);
  if (leap === -1) leap = 4;
  return leap === 0;
}

// Get number of days in Jalali month
export function getJalaliMonthDays(jy: number, jm: number): number {
  if (jm >= 1 && jm <= 6) return 31;
  if (jm >= 7 && jm <= 11) return 30;
  if (jm === 12) return isJalaliLeapYear(jy) ? 30 : 29;
  return 30;
}

// Get first day of week for a Jalali month (0 = Shanbeh, 6 = Jomeh)
export function getJalaliMonthFirstDayOfWeek(jy: number, jm: number): number {
  const g = jalaliToGregorian(jy, jm, 1);
  const date = new Date(g.gy, g.gm - 1, g.gd);
  const day = date.getDay(); // 0 = Sunday, 1 = Monday ... 6 = Saturday
  // Map to Shanbeh (0) to Jomeh (6)
  // Sunday = 1, Monday = 2, Tuesday = 3, Wednesday = 4, Thursday = 5, Friday = 6, Saturday = 0
  return (day + 1) % 7;
}

// Get current Jalali date object in Iran local time (UTC+3:30)
export function getCurrentJalali(): { jy: number; jm: number; jd: number; hour: number; minute: number } {
  const d = new Date();
  // Shift UTC time to Iran local time (UTC+3:30)
  d.setTime(d.getTime() + (3.5 * 3600 * 1000));
  const gy = d.getUTCFullYear();
  const gm = d.getUTCMonth() + 1;
  const gd = d.getUTCDate();
  const hour = d.getUTCHours();
  const minute = d.getUTCMinutes();
  const j = gregorianToJalali(gy, gm, gd);
  return {
    ...j,
    hour,
    minute,
  };
}

// Get current date-time ISO string in UTC
export function getNowISO(): string {
  return new Date().toISOString();
}

/** Today at 23:59 Iran time, as an ISO string in UTC: the default due time of a new task. */
export function endOfTodayISO(): string {
  const today = isoToIranDateTimeParts(new Date().toISOString())!.date;
  return iranDateTimeToISO(today, '23:59')!;
}

// Parse ISO string safely ensuring timezone offsets and server date strings are properly parsed
export function parseDateSafely(str: string): Date | null {
  if (!str) return null;
  const raw = String(str).trim();
  if (!raw) return null;

  let formatted = raw.replace(' ', 'T');
  // If no timezone offset (+/-HH:mm or Z) is present, append 'Z' so it is parsed as UTC
  if (!formatted.endsWith('Z') && !/[+-]\d{2}(:\d{2})?$/.test(formatted)) {
    formatted += 'Z';
  }

  const d = new Date(formatted);
  if (!isNaN(d.getTime())) {
    return d;
  }

  // Fallback to standard Date constructor
  const fallback = new Date(raw);
  return isNaN(fallback.getTime()) ? null : fallback;
}

// Convert ISO string / YYYY-MM-DDTHH:mm to Jalali formatted string in Iran local time (UTC+3:30)
export function formatISOToJalaliDateTime(isoString: string): string {
  if (!isoString) return 'بدون تاریخ';
  try {
    const d = parseDateSafely(isoString);
    if (!d) return isoString;

    // Shift UTC storage time to Iran local time (UTC+3:30 -> +3.5 hours)
    d.setTime(d.getTime() + (3.5 * 3600 * 1000));

    const gy = d.getUTCFullYear();
    const gm = d.getUTCMonth() + 1;
    const gd = d.getUTCDate();
    const hour = d.getUTCHours();
    const minute = d.getUTCMinutes();

    const j = gregorianToJalali(gy, gm, gd);
    const pad = (n: number) => n.toString().padStart(2, '0');
    const persianDigits = (s: string | number) => s.toString().replace(/\d/g, (x) => ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'][parseInt(x, 10)]);

    const hourStr = pad(hour);
    const minStr = pad(minute);

    return `${persianDigits(j.jy)}/${persianDigits(pad(j.jm))}/${persianDigits(pad(j.jd))} - ${persianDigits(hourStr)}:${persianDigits(minStr)}`;
  } catch {
    return isoString;
  }
}

// Format to ISO string for storage in UTC (converting Iran local wall-clock hour and minute to UTC)
export function jalaliToISO(jy: number, jm: number, jd: number, hour: number = 0, minute: number = 0): string {
  const g = jalaliToGregorian(jy, jm, jd);
  const utcDate = new Date(Date.UTC(g.gy, g.gm - 1, g.gd, hour, minute, 0));
  // Subtract 3.5 hours to convert Iran local time (UTC+3:30) to true UTC storage
  utcDate.setTime(utcDate.getTime() - (3.5 * 3600 * 1000));
  return utcDate.toISOString();
}

const IRAN_OFFSET_MS = 3.5 * 3600 * 1000;

/**
 * Number of the Iran (UTC+3:30) calendar day an instant falls on. Two instants on the same
 * Iranian day give the same number, whatever the browser's own time zone is.
 */
export function iranDayNumber(d: Date): number {
  return Math.floor((d.getTime() + IRAN_OFFSET_MS) / 86400000);
}

/**
 * Splits an instant into the Iranian calendar date and wall-clock time the user picked:
 * { date: 'YYYY-MM-DD', time: 'HH:mm:00' }. A bare 'YYYY-MM-DD' is a date with no time.
 */
export function isoToIranDateTimeParts(value: string): { date: string; time: string | null } | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return { date: value, time: null };
  const d = parseDateSafely(value);
  if (!d) return null;
  const shifted = new Date(d.getTime() + IRAN_OFFSET_MS);
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`,
    time: `${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}:00`,
  };
}

/**
 * The inverse: an Iranian calendar date ('YYYY-MM-DD') plus an optional wall-clock time
 * ('HH:mm' or 'HH:mm:ss') as an ISO instant. Without a time it is the start of that day.
 */
export function iranDateTimeToISO(date: string | null | undefined, time?: string | null): string | undefined {
  if (!date) return undefined;
  const d = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!d) return undefined;
  const t = time ? /^(\d{1,2}):(\d{2})/.exec(time) : null;
  const utc = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), t ? Number(t[1]) : 0, t ? Number(t[2]) : 0);
  return new Date(utc - IRAN_OFFSET_MS).toISOString();
}

// Parse ISO string to Jalali parts in Iran local time (UTC+3:30)
export function parseISOToJalali(isoString: string): { jy: number; jm: number; jd: number; hour: number; minute: number } {
  if (!isoString) return getCurrentJalali();
  const d = parseDateSafely(isoString);
  if (!d) return getCurrentJalali();

  // Shift UTC storage time to Iran local time (UTC+3:30 -> +3.5 hours)
  d.setTime(d.getTime() + (3.5 * 3600 * 1000));

  const gy = d.getUTCFullYear();
  const gm = d.getUTCMonth() + 1;
  const gd = d.getUTCDate();
  const hour = d.getUTCHours();
  const minute = d.getUTCMinutes();

  const j = gregorianToJalali(gy, gm, gd);
  return {
    ...j,
    hour,
    minute,
  };
}

export interface JalaliHolidayInfo {
  isHoliday: boolean;
  title?: string;
}

// Fixed Jalali Solar Holidays (apply every Jalali year)
const FIXED_SOLAR_HOLIDAYS: Record<string, string> = {
  '1-1': 'آغاز نوروز / عید نوروز',
  '1-2': 'عید نوروز',
  '1-3': 'عید نوروز',
  '1-4': 'عید نوروز',
  '1-12': 'روز جمهوری اسلامی ایران',
  '1-13': 'روز طبیعت (سیزده بدر)',
  '3-14': 'رحلت حضرت امام خمینی (ره)',
  '3-15': 'قیام خونین ۱۵ خرداد',
  '11-22': 'پیروزی انقلاب اسلامی ایران',
  '12-29': 'روز ملی شدن صنعت نفت ایران',
};

// Variable / Lunar Jalali Official Holidays for Iranian Years (1402 to 1406)
const YEARLY_HOLIDAYS: Record<string, string> = {
  // 1403
  '1403-1-12': 'شهادت حضرت علی (ع)',
  '1403-1-22': 'عید سعید فطر',
  '1403-1-23': 'تعطیل به مناسبت عید سعید فطر',
  '1403-2-15': 'شهادت امام جعفر صادق (ع)',
  '1403-3-29': 'عید سعید قربان',
  '1403-4-5': 'عید سعید غدیر خم',
  '1403-4-25': 'تاسوعای حسینی',
  '1403-4-26': 'عاشورای حسینی',
  '1403-6-4': 'اربعین حسینی',
  '1403-6-12': 'رحلت رسول اکرم (ص) و شهادت امام حسن مجتبی (ع)',
  '1403-6-14': 'شهادت امام رضا (ع)',
  '1403-6-22': 'شهادت امام حسن عسکری (ع)',
  '1403-6-31': 'ولادت پیامبر اکرم (ص) و امام جعفر صادق (ع)',
  '1403-9-15': 'شهادت حضرت فاطمه زهرا (س)',
  '1403-10-24': 'ولادت حضرت علی (ع) و روز پدر',
  '1403-11-8': 'مبعث حضرت رسول اکرم (ص)',
  '1403-11-26': 'ولادت حضرت قائم (عج)',

  // 1404
  '1404-1-1': 'شهادت حضرت علی (ع)',
  '1404-1-11': 'عید سعید فطر',
  '1404-1-12': 'تعطیل به مناسبت عید سعید فطر',
  '1404-2-4': 'شهادت امام جعفر صادق (ع)',
  '1404-3-17': 'عید سعید قربان',
  '1404-3-23': 'عید سعید غدیر خم',
  '1404-4-14': 'تاسوعای حسینی',
  '1404-4-15': 'عاشورای حسینی',
  '1404-5-24': 'اربعین حسینی',
  '1404-6-1': 'رحلت رسول اکرم (ص) و شهادت امام حسن مجتبی (ع)',
  '1404-6-3': 'شهادت امام رضا (ع)',
  '1404-6-11': 'شهادت امام حسن عسکری (ع)',
  '1404-6-20': 'ولادت پیامبر اکرم (ص) و امام جعفر صادق (ع)',
  '1404-9-4': 'شهادت حضرت فاطمه زهرا (س)',
  '1404-10-13': 'ولادت حضرت علی (ع) و روز پدر',
  '1404-10-27': 'مبعث حضرت رسول اکرم (ص)',
  '1404-11-15': 'ولادت حضرت قائم (عج)',

  // 1405 (بر اساس تقویم رسمی مرکز تقویم دانشگاه تهران و time.ir)
  '1405-1-1': 'عید سعید فطر',
  '1405-1-2': 'تعطیل به مناسبت عید سعید فطر',
  '1405-1-25': 'شهادت امام جعفر صادق (ع)',
  '1405-3-6': 'عید سعید قربان',
  '1405-3-15': 'عید سعید غدیر خم',
  '1405-4-3': 'تاسوعای حسینی',
  '1405-4-4': 'عاشورای حسینی',
  '1405-5-13': 'اربعین حسینی',
  '1405-5-21': 'رحلت رسول اکرم (ص) و شهادت امام حسن مجتبی (ع)',
  '1405-5-22': 'شهادت امام رضا (ع)',
  '1405-5-30': 'شهادت امام حسن عسکری (ع)',
  '1405-6-8': 'ولادت پیامبر اکرم (ص) و امام جعفر صادق (ع)',
  '1405-8-22': 'شهادت حضرت فاطمه زهرا (س)',
  '1405-10-2': 'ولادت حضرت علی (ع) و روز پدر',
  '1405-10-16': 'مبعث حضرت رسول اکرم (ص)',
  '1405-11-4': 'ولادت حضرت قائم (عج)',
  '1405-12-9': 'شهادت حضرت علی (ع)',
  '1405-12-19': 'عید سعید فطر',
  '1405-12-20': 'تعطیل به مناسبت عید سعید فطر',

  // 1406 (بر اساس تقویم رسمی مرکز تقویم دانشگاه تهران و time.ir)
  '1406-1-14': 'شهادت امام جعفر صادق (ع)',
  '1406-2-27': 'عید سعید قربان',
  '1406-3-4': 'عید سعید غدیر خم',
  '1406-3-25': 'تاسوعای حسینی',
  '1406-3-26': 'عاشورای حسینی',
  '1406-5-3': 'اربعین حسینی',
  '1406-5-11': 'رحلت رسول اکرم (ص) و شهادت امام حسن مجتبی (ع)',
  '1406-5-12': 'شهادت امام رضا (ع)',
  '1406-5-20': 'شهادت امام حسن عسکری (ع)',
  '1406-5-29': 'ولادت پیامبر اکرم (ص) و امام جعفر صادق (ع)',
  '1406-8-12': 'شهادت حضرت فاطمه زهرا (س)',
  '1406-9-21': 'ولادت حضرت علی (ع) و روز پدر',
  '1406-10-5': 'مبعث حضرت رسول اکرم (ص)',
  '1406-10-23': 'ولادت حضرت قائم (عج)',
  '1406-11-29': 'شهادت حضرت علی (ع)',
  '1406-12-8': 'عید سعید فطر',
  '1406-12-9': 'تعطیل به مناسبت عید سعید فطر',
};

export function getJalaliHoliday(jy: number, jm: number, jd: number): JalaliHolidayInfo {
  const fixedKey = `${jm}-${jd}`;
  const yearKey = `${jy}-${jm}-${jd}`;

  const yearlyTitle = YEARLY_HOLIDAYS[yearKey];
  const fixedTitle = FIXED_SOLAR_HOLIDAYS[fixedKey];

  if (yearlyTitle && fixedTitle) {
    if (yearlyTitle === fixedTitle || fixedTitle.includes(yearlyTitle) || yearlyTitle.includes(fixedTitle)) {
      return { isHoliday: true, title: fixedTitle };
    }
    return { isHoliday: true, title: `${fixedTitle} / ${yearlyTitle}` };
  }

  const title = yearlyTitle || fixedTitle;
  if (title) {
    return { isHoliday: true, title };
  }
  return { isHoliday: false };
}
