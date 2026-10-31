import React from 'react';
import {
  Printer,
  FileText,
  CheckCircle2,
  Sparkles,
  Kanban,
  MessageSquare,
  Users,
  Filter,
  ListTodo,
  FolderPlus,
  BookOpen,
  BarChart3,
  Network,
  ShieldCheck,
  Smartphone,
  Repeat,
} from 'lucide-react';
import { toPersianDigits, formatToJalali } from '../utils/helpers';
import pkg from '../../package.json';

type Tone = 'indigo' | 'purple' | 'blue' | 'amber' | 'teal' | 'rose' | 'orange' | 'cyan' | 'slate' | 'emerald';

// Full class names per tone, so Tailwind keeps them.
const TONES: Record<Tone, { head: string; icon: string }> = {
  indigo: { head: 'text-indigo-700 border-indigo-600 bg-indigo-50/50', icon: 'text-indigo-600' },
  purple: { head: 'text-purple-700 border-purple-600 bg-purple-50/50', icon: 'text-purple-600' },
  blue: { head: 'text-blue-700 border-blue-600 bg-blue-50/50', icon: 'text-blue-600' },
  amber: { head: 'text-amber-700 border-amber-600 bg-amber-50/50', icon: 'text-amber-600' },
  teal: { head: 'text-teal-700 border-teal-600 bg-teal-50/50', icon: 'text-teal-600' },
  rose: { head: 'text-rose-700 border-rose-600 bg-rose-50/50', icon: 'text-rose-600' },
  orange: { head: 'text-orange-700 border-orange-600 bg-orange-50/50', icon: 'text-orange-600' },
  cyan: { head: 'text-cyan-700 border-cyan-600 bg-cyan-50/50', icon: 'text-cyan-600' },
  slate: { head: 'text-slate-800 border-slate-700 bg-slate-100', icon: 'text-slate-700' },
  emerald: { head: 'text-emerald-700 border-emerald-600 bg-emerald-50/50', icon: 'text-emerald-600' },
};

interface CatalogSection {
  title: string;
  icon: React.ElementType;
  tone: Tone;
  items: [string, string][];
}

// Every line below was checked against the code of the app. Items marked «در صورت فعال بودن»
// depend on a module the server turns on.
const SECTIONS: CatalogSection[] = [
  {
    title: 'مدیریت فعالیت‌ها (Task Management)',
    icon: ListTodo,
    tone: 'indigo',
    items: [
      ['انواع فعالیت', 'فعالیت ساده، پروژه، فعالیت تکرارشونده و «زیرمجموعه‌ی یک فعالیت دیگر» (هنگام تبدیل کامنت یا پیام به وظیفه)؛ هر نوع فرم مخصوص خودش را نشان می‌دهد'],
      ['ثبت فعالیت', 'عنوان، شرح، موعد انجام با تقویم و ساعت شمسی، درجه اهمیت و برچسب کاری (می‌توانید از برچسب‌های قبلی استفاده کنید)'],
      ['وضعیت‌ها', 'شروع نشده، درحال اجرا، متوقف و خاتمه یافته؛ وضعیت پروژه و فعالیت تکرارشونده از روی زیرمجموعه‌ها خودکار حساب می‌شود'],
      ['درجه اهمیت', 'سه سطح: کم، متوسط و زیاد'],
      ['تیم کاری فعالیت', 'فعالیت را به یک تیم کاری بدهید یا بدون تیم بگذارید؛ اعضای تیم به فعالیت دسترسی پیدا می‌کنند و هرکدام را می‌توانید کنار بگذارید'],
      ['چند مسئول اجرا', 'یک یا چند نفر از کل سازمان (نه فقط اعضای تیم) را مسئول کنید؛ جستجو در نام‌ها دارد'],
      ['مسئول با پست سازمانی', 'در صورت فعال بودن، فعالیت را به یک پست می‌دهید و اگر دارنده‌ی پست عوض شود، فعالیت به نفر جدید می‌رسد'],
      ['امکان بروزرسانی', 'روشن یا خاموش کردن اجازه‌ی تغییر وضعیت و بروزرسانی فعالیت توسط مسئولان'],
      ['افراد دیگر با دسترسی', 'افرادی خارج از تیم که فعالیت را می‌بینند ولی مسئول آن نیستند'],
      ['پیوست فایل', 'افزودن فایل با کلیک یا کشیدن و رها کردن؛ فایل تکراری یا خالی و فایل بزرگ‌تر از سقف تعیین‌شده پذیرفته نمی‌شود'],
      ['تبدیل به زیرفعالیت', 'کامنت یا پیام را به فعالیت جدید تبدیل کنید؛ می‌توانید آن را زیرمجموعه‌ی همان فعالیت کنید تا زیر کارت اصلی دیده شود'],
    ],
  },
  {
    title: 'فعالیت‌های تکرارشونده (Recurring Tasks)',
    icon: Repeat,
    tone: 'purple',
    items: [
      ['تکرار روزانه', 'فعالیتی که هر روز تکرار می‌شود'],
      ['تکرار هفتگی', 'هر هفته یا هر ۲ تا ۴ هفته یک‌بار، با انتخاب روزهای هفته از شنبه تا جمعه'],
      ['روزهای ماه', 'انتخاب یک یا چند روز از ۱ تا ۳۱ ماه'],
      ['الگوی پیشرفته‌ی ماه', 'مثلاً «اولین / دومین / سومین / چهارمین / آخرین» روز مشخصی از هفته در هر ماه'],
      ['ساعت برگزاری', 'ساعت شروع و پایان هر نوبت'],
      ['بازه‌ی تکرار', 'تاریخ شروع و تاریخ پایان (اختیاری) برای دوره‌ی تکرار'],
    ],
  },
  {
    title: 'مدیریت پروژه‌ها و کنترل انحراف (Project Management & Variance)',
    icon: FolderPlus,
    tone: 'emerald',
    items: [
      ['منشور پروژه', 'شرح و اهداف کلی، مدیر پروژه، تاریخ شروع و تاریخ پایان'],
      ['زیرفعالیت‌های پروژه', 'افزودن، ویرایش و حذف با تاریخ شروع و پایان، مسئول (جستجو در کاربران) و درجه اهمیت'],
      ['وزن زیرفعالیت', 'اهمیت کم = وزن ۱، متوسط = وزن ۲، زیاد = وزن ۳'],
      ['پیشرفت واقعی', 'درصد پیشرفت پروژه بر اساس وزن زیرفعالیت‌های خاتمه‌یافته'],
      ['پیشرفت برنامه‌ای', 'پیشرفتی که طبق زمان‌بندی تا امروز باید انجام می‌شد'],
      ['انحراف از برنامه', 'مقایسه‌ی خودکار واقعی و برنامه‌ای: جلوتر از برنامه، مطابق برنامه یا عقب‌تر از برنامه'],
      ['داشبورد پروژه', 'کارت‌های پیشرفت و انحراف، نمودار سهم وزن‌های خاتمه‌یافته و تفکیک پیشرفت بر اساس درجه اهمیت'],
    ],
  },
  {
    title: 'جزئیات فعالیت و گفتگوی فعالیت (Task Details & Comments)',
    icon: MessageSquare,
    tone: 'rose',
    items: [
      ['نظر روی فعالیت', 'نوشتن نظر با ایموجی، ضبط پیام صوتی و پیوست فایل؛ نویسنده یا مدیر می‌تواند آن را ویرایش یا حذف کند'],
      ['تبدیل نظر به وظیفه', 'هر نظر متنی با یک کلیک فعالیت جدید می‌شود (نظر صوتی یا دارای ایموجی قابل تبدیل نیست)'],
      ['تاریخچه‌ی تغییرات', 'لاگ باز و بسته‌شدنی از همه‌ی تغییرات فعالیت با نام کاربر، نوع کار و جزئیات'],
      ['جانشین', 'نمایش جانشین فعالیت و نظرهایی که جانشین پست خالی نوشته است'],
      ['پیش‌نمایش پیوست', 'دیدن و دانلود فایل‌ها و تصاویر ضمیمه‌ی فعالیت و نظرها'],
    ],
  },
  {
    title: 'نماها، تقویم و پایش موعدها (Kanban, Calendar, List & Overdue)',
    icon: Kanban,
    tone: 'blue',
    items: [
      ['بورد کانبان', 'ستون‌های وضعیت با جابه‌جایی کارت بین ستون‌ها؛ زیرفعالیت‌ها زیر کارت اصلی و کمی کوچک‌تر نمایش داده می‌شوند'],
      ['گروه‌بندی کارت‌ها', 'گروه‌بندی بر اساس وضعیت، مالک، مسئول، اولویت، موعد انجام یا برچسب؛ گزینه‌ی «نمایش اطلاعات» و «فقط فعالیت‌های جاری» هم دارد و انتخاب شما ذخیره می‌شود'],
      ['نمای لیست', 'گزینه‌ی «بدون گروه‌بندی» همه‌ی فعالیت‌ها را در یک جدول ردیف‌دار با وضعیت، اولویت، مسئول و موعد نشان می‌دهد'],
      ['تقویم شمسی', 'رفتن به ماه یا سال قبل و بعد، دکمه‌ی «امروز»، نمایش تعطیلات، افزودن فعالیت در همان روز و نمایش یا پنهان‌کردن کارهای خاتمه‌یافته و متوقف'],
      ['موعد گذشته', 'فعالیت‌های دارای تاخیر، مرتب بر اساس بیشترین تاخیر و اولویت، با نشان «تاخیر شدید»؛ کشیدن کارت به چپ یا دکمه‌ی «تبدیل به خاتمه یافته» آن را سریع تمام می‌کند'],
      ['منوی پایین موبایل', 'در گوشی، نوار پایین با دکمه‌های بورد، تقویم، افزودن، موعد گذشته و تنظیمات و منوی «بیشتر» برای گفتگو، یادداشت‌ها، گزارش‌ها و کارتابل جانشینی'],
    ],
  },
  {
    title: 'جستجو و فیلترها (Search & Filters)',
    icon: Filter,
    tone: 'amber',
    items: [
      ['جستجوی لحظه‌ای', 'جستجو در عنوان، شرح، نام فایل‌های پیوست و برچسب‌ها'],
      ['فیلترهای ترکیبی', 'همزمان بر اساس وضعیت، اولویت، مسئول (از جمله «بدون مسئول») و برچسب (از جمله پروژه‌ها و تکرارشونده‌ها)'],
      ['فیلترهای ذخیره‌شده', 'ترکیب فیلتر فعلی را با نام دلخواه ذخیره و هر وقت خواستید حذف کنید'],
      ['فیلترهای آماده', 'کارهای با اهمیت زیاد، کارهای درحال اجرا و پروژه‌ها و زیرفعالیت‌ها'],
    ],
  },
  {
    title: 'گزارش‌ها و داشبورد (Reports & Dashboard)',
    icon: BarChart3,
    tone: 'teal',
    items: [
      ['گزارش فعالیت‌ها', 'گزارش فعالیت‌های خودتان و زیرمجموعه‌تان (یا کل سازمان برای مدیران) در جدول با جزئیات هر ردیف'],
      ['کارت‌های خلاصه', 'کل، شروع نشده، درحال اجرا، متوقف، خاتمه یافته و موعد گذشته؛ با کلیک روی هر کارت فهرست همان‌ها فیلتر می‌شود'],
      ['فیلتر گزارش', 'فرد، نقش فرد (مسئول یا ایجادکننده)، سمت، برچسب، نوع فعالیت، وضعیت (یا موعد گذشته) و بازه‌ی موعد انجام'],
      ['خروجی', 'دانلود Excel، دانلود PDF (A4 عمودی با لوگو، فیلترهای فعال، تاریخ و نام تهیه‌کننده) و چاپ'],
      ['نمودارهای آمار', 'نمودار وضعیت تاخیر و نمودار تعداد فعالیت‌ها به تفکیک مسئول؛ با کلیک روی هر بخش فهرست فعالیت‌ها باز می‌شود'],
      ['خلاصه‌ی ورود', 'پنجره‌ی خوش‌آمد روزی یک‌بار با تعداد فعالیت‌ها، موعد گذشته‌ها، نرخ خاتمه‌یافته‌ها و پروژه‌ها (از دکمه‌ی نوار بالا هم باز می‌شود)'],
    ],
  },
  {
    title: 'گفتگو، یادداشت و اعلان‌ها (Chat, Notes & Notifications)',
    icon: MessageSquare,
    tone: 'rose',
    items: [
      ['گفتگوی تیمی و مستقیم', 'گفتگو با تیم یا یک نفر، جستجوی تیم یا فرد، ارسال فایل، ایموجی و پیام صوتی و شمارنده‌ی پیام‌های خوانده‌نشده'],
      ['پاسخ، ویرایش و حذف', 'پاسخ به یک پیام با نقل‌قول، ویرایش و حذف پیام‌های خودتان'],
      ['پنل توضیحات فعالیت‌ها', 'جستجو در فعالیت‌ها و دیدن توضیحات آن‌ها کنار گفتگو؛ در گفتگوی مستقیم می‌توانید فعالیت را در پیام درج کنید و توضیحاتش را کپی کنید'],
      ['تبدیل پیام به وظیفه', 'پیام متنی با یک کلیک فعالیت می‌شود (پیام صوتی یا دارای ایموجی قابل تبدیل نیست)'],
      ['یادداشت‌های شخصی', 'جستجو، پیوست فایل، رنگ کارت، سنجاق‌کردن، رونوشت متن و تبدیل یادداشت به وظیفه'],
      ['مرکز اعلان‌ها', 'اعلان رخدادها با «خوانده‌شدن همه»، علامت خوانده یا خوانده‌نشده برای هر مورد و رفتن مستقیم به فعالیت'],
      ['راهنمای کاربری تصویری', 'با دکمه‌ی «؟» نوار بالا چند صفحه‌ی تصویری درباره‌ی محیط کار و ثبت فعالیت باز می‌شود'],
      ['ساعت و تاریخ', 'تاریخ شمسی و ساعت دستگاه شما در نوار بالا'],
    ],
  },
  {
    title: 'ساختار سازمانی و جانشینی (Organization & Substitution)',
    icon: Network,
    tone: 'orange',
    items: [
      ['شرکت‌ها', 'تعریف شرکت با نام، کد و توضیحات و تعیین معاونت‌های هر شرکت'],
      ['معاونت‌ها و واحدها', 'تعریف واحد و تعیین مدیر آن؛ غیرفعال و فعال‌کردن واحد'],
      ['سمت‌ها', 'عنوان سمت، شرکت‌ها و «سمت مافوق»؛ سمتی که مافوق ندارد بالاترین سمت شرکت است'],
      ['عناوین', 'عناوینی مثل «جناب مهندس» که قبل از نام کاربر نمایش داده می‌شود؛ با ترتیب، ویرایش و حذف'],
      ['جایگاه من', 'شرکت، واحد، سمت و مدیر مستقیم خودتان و فهرست همکاران زیر مجموعه (مستقیم یا همه‌ی سطوح)'],
      ['چارت سازمانی', 'نمودار قابل بزرگ‌نمایی و جابه‌جایی با جستجو، باز و بسته‌کردن همه، تمام‌صفحه و دریافت PDF'],
      ['پست‌ها و پست خالی', 'هر پست یک نفر دارد؛ پست بدون دارنده «خالی» نشان داده می‌شود'],
      ['کارتابل جانشینی', 'مدیران بالادست فعالیت‌های باز پست‌های خالی را می‌بینند و می‌توانند پستی را سرپرست آن کنند یا سرپرستی را پایان دهند'],
    ],
  },
  {
    title: 'حساب کاربری و مدیریت کاربران (Account & Users)',
    icon: Users,
    tone: 'cyan',
    items: [
      ['ورود', 'ورود با نام کاربری یا شماره موبایل؛ پس از ورود ناموفق کد امنیتی تصویری خواسته می‌شود'],
      ['بازیابی رمز عبور', 'ارسال کد تأیید پیامکی به موبایل ثبت‌شده، بررسی کد و تعیین رمز جدید'],
      ['تغییر رمز عبور', 'تغییر رمز با وارد کردن رمز فعلی (رمز جدید حداقل ۸ کاراکتر)'],
      ['آواتار', 'انتخاب از آلبوم ۲۴ آواتار آماده یا آپلود عکس خودتان؛ عکس بزرگ خودکار کوچک می‌شود'],
      ['پیامک شخصی', 'روشن یا خاموش‌کردن اطلاع‌رسانی با پیامک و ثبت شماره موبایل'],
      ['تیم کاری من', 'ساخت تیم، افزودن و حذف اعضا (از افراد محدوده‌ی خودتان)، حذف تیم و گفتگو با تیم'],
      ['مدیریت کاربران', 'جستجو، ایجاد، ویرایش، فعال و غیرفعال‌کردن کاربر و دیدن زمان آخرین ورود'],
      ['نقش و مجوز', 'اختصاص نقش‌ها و مجوزهای مستقیم به کاربر با نشان منبع هر مجوز (مستقیم، از نقش یا از گروه) و رعایت مجوزهای وابسته'],
      ['جایگاه سازمانی کاربر', 'در صورت فعال بودن، شرکت، واحد، سمت و مدیر مستقیم کاربر هنگام ویرایش تعیین می‌شود'],
    ],
  },
  {
    title: 'امنیت و یکپارچه‌سازی (LDAP / SSO / تاریخچه ورود)',
    icon: ShieldCheck,
    tone: 'slate',
    items: [
      ['تاریخچه ورود', 'فهرست ورودهای موفق، ناموفق، مسدود و کد امنیتی نادرست با کاربر، زمان، علت و IP و امکان جستجو'],
      ['اتصال LDAP / Active Directory', 'تنظیم سرور، پورت، دامنه، Base DN، حساب اتصال، فیلتر کاربران، SSL یا StartTLS و مهلت اتصال؛ رمز اتصال رمزشده ذخیره می‌شود'],
      ['تست اتصال', 'دکمه‌ی «تست اتصال» نتیجه و زمان پاسخ را نشان می‌دهد'],
      ['آماده‌سازی SSO', 'ثبت پیش‌نویس تنظیمات (پروتکل OIDC یا SAML، شناسه‌ی برنامه، نشانی صادرکننده و بازگشت)؛ ورود با SSO هنوز فعال نیست'],
      ['سقف حجم فایل', 'مدیر حداکثر حجم فایل آپلودی را تنظیم می‌کند (پیش‌فرض ۲۰۰ کیلوبایت) و در فعالیت‌ها، گفتگو و یادداشت‌ها اعمال می‌شود'],
      ['نوع فایل مجاز', 'فقط فایل‌های Excel، Word، PDF و تصویر؛ پیام صوتی هم پذیرفته می‌شود'],
    ],
  },
  {
    title: 'تنظیمات پیامک (SMS Settings)',
    icon: Smartphone,
    tone: 'emerald',
    items: [
      ['سرویس‌دهنده‌ی پیامک', 'تعریف چند سرویس با نام، آدرس سرویس (Base URL)، کلید API، نام کاربری و رمز اختیاری و شماره فرستنده؛ در هر زمان یک سرویس فعال است'],
      ['متن پیامک‌ها', 'ویرایش متن هر پیامک (رمز عبور، ارجاع فعالیت، تغییر موعد، نزدیک شدن موعد، گذشتن موعد، یادآوری و نوبت تکرارشونده) با متغیرهای آماده و روشن یا خاموش‌کردن هرکدام'],
      ['ساعات سکوت', 'در بازه‌ی سکوت پیامک نگه داشته می‌شود و پس از پایان آن ارسال می‌شود'],
      ['یادآوری پیش از موعد', 'ارسال پیامک چند ساعت قبل از موعد و ساعت یادآوری برای فعالیت‌های بدون ساعت'],
      ['اطلاع گذشتن موعد', 'یک‌بار پیامک به مسئولان و ایجادکننده وقتی موعد گذشت'],
      ['یادآوری تکرارشونده', 'ارسال پیامک چند دقیقه پیش از هر نوبت فعالیت تکرارشونده'],
      ['ارسال آزمایشی', 'ارسال یک پیامک تست به شماره‌ی دلخواه برای اطمینان از تنظیمات'],
    ],
  },
  {
    title: 'ظاهر و شخصی‌سازی (Appearance)',
    icon: BookOpen,
    tone: 'slate',
    items: [
      ['حالت روز و شب', 'طرح روشن یا تیره برای همه‌ی صفحه‌ها'],
      ['۶ پالت رنگی', 'نیلی / بنفش، زمردی / سبز، سرخ / گلبهی، طلایی / کهربایی، فیروزه‌ای / آبی و زغالی / تیره'],
      ['۱۴ طرح بافت زمینه', 'ساده و مدرن، شطرنجی، خطوط مورب، شبکه‌ای، نقطه‌ای، چهارخانه، موجی، شیشه‌ای، حبابی، بارانی، قاصدکی، برفی، برگی پاییزی و بهاری؛ پالت رنگی روی طرح‌های هندسی اثر دارد'],
      ['ذخیره‌ی انتخاب', 'حالت، پالت و بافت انتخابی شما در حساب کاربری ذخیره می‌شود'],
    ],
  },
];

interface FeatureListPdfModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FeatureListPdfModal: React.FC<FeatureListPdfModalProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  const openCatalogPrintWindow = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      window.print();
      return;
    }

    const contentElement = document.getElementById('pdf-report-content');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="fa" dir="rtl">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>دفترچه راهنما و کاتالوگ امکانات سامانه</title>
        <style>
          body { font-family: 'Vazirmatn Variable', sans-serif; background: #f8fafc; color: #0f172a; padding: 16px; margin: 0; }
          @media print {
            body { background: #ffffff; padding: 0; }
            .no-print { display: none !important; }
            .print-container { border: none !important; shadow: none !important; padding: 0 !important; }
          }
        </style>
      </head>
      <body class="dir-rtl text-right">
        <div class="no-print max-w-3xl mx-auto mb-6 p-4 bg-slate-900 text-white rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-xl border border-slate-800">
          <div>
            <h3 class="font-black text-sm sm:text-base flex items-center gap-2 text-emerald-400">
              <span>🖨️ پیش‌نمایش دفترچه راهنما و لیست امکانات</span>
            </h3>
            <p class="text-xs text-slate-300 mt-1">جهت چاپ یا ذخیره فایل PDF روی گزینه چاپ کلیک کرده یا در صورت اتمام کار صفحه را ببندید.</p>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <button id="print-report" class="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-xl text-xs shadow-md transition-all cursor-pointer flex items-center gap-1.5 active:scale-95">
              <span>🖨️ چاپ دفترچه / ذخیره PDF</span>
            </button>
            <button id="close-report" class="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl text-xs border border-slate-700 transition-all cursor-pointer active:scale-95">
              <span>✕ بستن صفحه</span>
            </button>
          </div>
        </div>

        <div id="print-content" class="max-w-3xl mx-auto bg-white p-6 sm:p-10 rounded-2xl border border-slate-200 print-container shadow-sm"></div>
      </body>
      </html>
    `);
    printWindow.document.close();
    document.querySelectorAll('link[rel="stylesheet"], style').forEach((element) => {
      printWindow.document.head.appendChild(printWindow.document.importNode(element, true));
    });
    if (contentElement) {
      printWindow.document.getElementById('print-content')?.appendChild(printWindow.document.importNode(contentElement, true));
    }
    printWindow.document.getElementById('print-report')?.addEventListener('click', () => printWindow.print());
    printWindow.document.getElementById('close-report')?.addEventListener('click', () => printWindow.close());
    printWindow.setTimeout(() => printWindow.print(), 600);
  };

  const currentDateJalali = formatToJalali(new Date().toISOString());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-6 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-4xl max-h-[94vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95">
        
        {/* Modal Header Actions */}
        <div className="p-4 sm:p-5 bg-slate-900 text-white flex items-center justify-center text-center border-b border-slate-800 shrink-0">
          <div className="flex items-center justify-center gap-3 max-w-full">
            <div className="p-2.5 bg-emerald-600/30 border border-emerald-400/30 rounded-2xl shrink-0">
              <FileText className="w-6 h-6 text-emerald-400" />
            </div>
            <div className="text-center min-w-0">
              <h2 className="text-base sm:text-lg font-black tracking-tight text-white whitespace-nowrap overflow-hidden text-ellipsis">
                دفترچه راهنما و لیست امکانات سامانه
              </h2>
              <p className="text-xs text-slate-400 mt-0.5 whitespace-nowrap overflow-hidden text-ellipsis">
                مستندات و شناسنامه جامع کلیه ابزارها و قابلیتهای فعال
              </p>
            </div>
          </div>
        </div>

        {/* Printable Document View */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-8 bg-slate-100 dark:bg-slate-950 text-slate-800 dark:text-slate-100">
          <div
            id="pdf-report-content"
            className="bg-white text-slate-900 p-6 sm:p-10 rounded-2xl shadow-sm border border-slate-200 max-w-3xl mx-auto font-sans leading-relaxed text-right space-y-8 dir-rtl"
            style={{ direction: 'rtl' }}
          >
            {/* Document Header */}
            <div className="border-b-2 border-emerald-600 pb-6 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="space-y-1 text-center sm:text-right">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700 font-bold text-xs mb-1">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>سامانه مدیریت وظایف (TM) و پروژه‌های تیمی</span>
                </div>
                <h1 className="text-xl sm:text-2xl font-black text-slate-900">
                  دفترچه راهنما و شناسنامه امکانات سامانه
                </h1>
                <p className="text-xs text-slate-500 font-medium">
                  لیست کامل و به‌روز کلیه قابلیت‌ها، ابزارها و ماژول‌های فعال اپلیکیشن
                </p>
              </div>

              <div className="text-left text-xs text-slate-500 bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1 shrink-0">
                <div>
                  <strong>تاریخ انتشار:</strong> {toPersianDigits(currentDateJalali)}
                </div>
                <div>
                  <strong>نسخه سامانه:</strong> {toPersianDigits(pkg.version)}
                </div>
                <div>
                  <strong>پایگاه داده:</strong> NexusCore / SQL Server
                </div>
              </div>
            </div>

            {SECTIONS.map((section, index) => {
              const tone = TONES[section.tone];
              const Icon = section.icon;
              return (
                <section key={section.title} className="space-y-3">
                  <div className={`flex items-center gap-2.5 font-black text-base border-r-4 pr-3 py-1 rounded-l-xl ${tone.head}`}>
                    <Icon className={`w-5 h-5 shrink-0 ${tone.icon}`} />
                    <h2>{toPersianDigits(index + 1)}. {section.title}</h2>
                  </div>
                  <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-slate-700">
                    {section.items.map(([name, text]) => (
                      <li key={name} className="flex items-start gap-2 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        <span><strong>{name}:</strong> {text}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}

            {/* Document Footer */}
            <div className="border-t border-slate-200 pt-4 text-center text-xs text-slate-500 space-y-1">
              <p className="font-bold">
                این دفترچه به صورت خودکار مطابق آخرین وضعیت و امکانات فعال برنامه به‌روزرسانی می‌شود.
              </p>
              <p className="text-[10px] text-slate-400">
                طراحی شده با React, TypeScript, Express, NexusCore (ASP.NET Core) & Tailwind CSS
              </p>
            </div>
          </div>
        </div>

        {/* Modal Bottom Footer */}
        <div className="p-3.5 sm:p-4 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between text-xs shrink-0 gap-3">
          <span className="text-slate-500 dark:text-slate-400 font-medium text-center sm:text-right text-[11px] sm:text-xs">
            جهت چاپ یا ذخیره فایل PDF روی کلید «چاپ» کلیک فرمایید.
          </span>
          <div className="flex items-center justify-center sm:justify-end gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={openCatalogPrintWindow}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-xl transition-all cursor-pointer shadow-md active:scale-95"
              title="چاپ یا ذخیره نسخه PDF"
            >
              <Printer className="w-4 h-4" />
              <span>چاپ</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-initial px-4 py-2.5 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-xl transition-all cursor-pointer active:scale-95"
            >
              بستن صفحه
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

