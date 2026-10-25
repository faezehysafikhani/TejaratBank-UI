# مدیریت وظایف (Task Manager)

سامانه مدیریت وظایف و پروژه با بورد کانبان، تقویم شمسی، فیلترهای ترکیبی، گفتگوی تیمی و یادداشت‌های شخصی.

ساخته‌شده با React، TypeScript، Express و Tailwind CSS؛ بک‌اند آن NexusCore (ASP.NET Core) است.

## قابلیت‌ها

- بورد کانبان با جابه‌جایی کشیدنی و وضعیت‌های قابل تنظیم
- مدیریت پروژه‌ها، زیرفعالیت‌ها و تحلیل انحراف زمان‌بندی
- تقویم جلالی و نمای کارهای معوقه
- جستجو و فیلترهای ترکیبی و سفارشی
- گفتگوی تیمی، اعلان‌ها و مدیریت کاربران و تیم‌ها
- یادداشت‌های شخصی، تم روشن/تیره و پالت‌های رنگی
- خروجی PDF از فهرست قابلیت‌ها
- نصب به‌صورت PWA

## پیش‌نیازها

- Node.js نسخه ۲۰ یا بالاتر
- یک نمونه در حال اجرا از API سامانه NexusCore. در Production آدرس API از
  `config/runtime-config.json` داخل خروجی build خوانده می‌شود و بدون rebuild قابل تغییر است.

## راه‌اندازی

۱. نصب وابستگی‌ها:

```bash
npm install
```

۲. برای توسعه محلی، در صورت نیاز فایل `.env.development` را بر اساس
`.env.development.example` بسازید.

۳. اجرای برنامه در حالت توسعه:

```bash
npm run dev
```

برنامه روی `http://localhost:3000` بالا می‌آید.

## ساخت نسخه تولید

```bash
npm run build
npm start
```

بعد از build، برای استقرار same-origin پشت IIS مقدارهای زیر را در
`dist/config/runtime-config.json` خالی بگذارید (این فایل فقط داده است، نه اسکریپت، و هنگام
شروع برنامه اعتبارسنجی می‌شود):

```json
{
  "apiBaseUrl": "",
  "signalRBaseUrl": "",
  "tenantSlug": "",
  "requestTimeoutMs": 30000
}
```

در این حالت فرانت‌اند API را از `/api` و SignalR را از `/hubs/...` مصرف می‌کند.
اگر Backend روی origin جداست، فقط همین فایل runtime را روی سرور تغییر دهید؛ نیازی به
تغییر سورس یا اجرای دوباره `npm run build` نیست.

## دستورات

| دستور | کاربرد |
| --- | --- |
| `npm run dev` | اجرای سرور توسعه به‌همراه Vite |
| `npm run build` | ساخت خروجی فرانت‌اند و باندل سرور |
| `npm start` | اجرای نسخه ساخته‌شده |
| `npm run lint` | بررسی نوع‌ها با TypeScript و هماهنگی هدرهای امنیتی |
| `npm test` | آزمون‌های امنیتی (اعتبارسنجی تنظیمات runtime، پاک‌سازی داده‌ی خصوصی، هدرها، پیوست‌ها) |
| `npm run headers:sync` | ساخت دوباره‌ی `public/web.config` و `vercel.json` از `security-headers.json` |
| `npm run clean` | پاک‌کردن خروجی‌های ساخت |

## امنیت

- **نشست:** توکن دسترسی فقط در حافظه‌ی صفحه نگه‌داری می‌شود و عمر آن ۱۵ دقیقه است. توکن
  تازه‌سازی (refresh) در کوکی `HttpOnly; Secure; SameSite=Strict` است که سرور تنظیم می‌کند و
  هیچ اسکریپتی نمی‌تواند آن را بخواند. API و فرانت باید هم‌مبدأ (پشت یک reverse proxy) باشند؛
  در غیر این صورت `Cors:AllowedOrigins` در میزبان و `connect-src` در هدر CSP باید تنظیم شود.
  با باز شدن صفحه، یک درخواست `POST /api/identity/auth/refresh` توکن دسترسی را می‌گیرد؛ دو تب
  با `navigator.locks` نوبت می‌گیرند.
- **خروج:** همه‌ی داده‌ی خصوصی مرورگر (گفتگو، یادداشت، کش‌ها) پاک می‌شود؛ فقط تنظیمات ظاهری
  (پالت رنگ، نوار کناری، چیدمان بورد) می‌ماند.
- **هدرهای پاسخ:** در `security-headers.json` تعریف شده‌اند: CSP، HSTS و Permissions-Policy.
  CSP ابتدا در حالت `report-only` است و تخلف‌ها به `/api/platform/csp-report` گزارش می‌شوند؛
  بعد از حدود دو هفته و بررسی گزارش‌ها، `"cspMode": "enforce"` را بگذارید و
  `npm run headers:sync` را اجرا کنید. `web.config` و `vercel.json` از همین فایل ساخته می‌شوند.
- **پیوست‌ها:** فقط نوع‌های امن (تصویر، PDF، صوت، Word، Excel) درون برنامه باز می‌شوند؛ بقیه
  فقط دانلود می‌شوند.
- **فایل تنظیمات runtime:** `config/runtime-config.json` فقط داده است و هنگام شروع اعتبارسنجی
  می‌شود (فقط آدرس http/https بدون نام کاربری و query). اگر هنگام build مقدار
  `VITE_ALLOWED_API_ORIGINS` داده شود، فقط همان originها پذیرفته می‌شوند. دسترسی نوشتن روی
  پوشه‌ی انتشار را محدود کنید.
- **لاگ IIS:** SignalR توکن را ناچار در `?access_token=` می‌فرستد. در IIS Manager → Logging →
  Select Fields، فیلد `URI Query (cs-uri-query)` را غیرفعال کنید تا توکن در لاگ نماند.
- **وابستگی‌ها:** `npm audit --omit=dev` در CI اجرا می‌شود (`.github/workflows/security-checks.yml`).
- **سرور Node:** خروجی `server.cjs` کنار `dist` ساخته می‌شود، نه داخل آن، و source map ندارد؛
  فقط محتوای `dist` را روی وب‌سرور منتشر کنید.

## ساختار پروژه

```
api/          نقطه ورود برای استقرار روی Vercel
public/       آیکون‌ها، manifest و service worker
scripts/      ابزار ساخت آیکون‌ها
src/
  components/ کامپوننت‌های رابط کاربری
  services/   ارتباط با API سامانه NexusCore
  utils/      توابع کمکی، تاریخ شمسی، تم و ذخیره‌سازی
server.ts     سرور Express
```
