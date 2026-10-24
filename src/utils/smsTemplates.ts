// The SMS texts this product sends. The server (NexusCore) may know more templates - those of
// other products - and this panel neither shows nor saves them.
import type { SmsTemplate } from '../services/nexusApi';
import { toPersianDigits } from './helpers';

export const PRODUCT_SMS_TEMPLATE_KEYS = [
  'password_reset',
  'task_assigned',
  'recurring_task_reminder',
  'task_due_changed',
  'task_due_soon',
  'task_overdue',
  'task_overdue_changed',
  'recurring_task_upcoming',
] as const;

/** Offered by every template when the server has a product name configured. */
const PRODUCT_NAME = 'ProductName';

export const SMS_TEMPLATE_MAX_LENGTH = 1000;

/** Only this product's templates, in a fixed order. */
export const productSmsTemplates = (templates: SmsTemplate[]): SmsTemplate[] =>
  PRODUCT_SMS_TEMPLATE_KEYS
    .map((key) => templates.find((t) => t.key === key))
    .filter((t): t is SmsTemplate => !!t);

const PLACEHOLDER = /\{([A-Za-z][A-Za-z0-9_]*)\}/g;

const usedPlaceholders = (text: string): string[] =>
  Array.from(new Set(Array.from(text.matchAll(PLACEHOLDER), (m) => m[1])));

/** The same rules the server applies on save, in Persian; null when the text is fine. */
export function validateSmsTemplate(template: SmsTemplate): string | null {
  const title = template.title || template.key;
  const text = template.text ?? '';
  if (!text.trim()) return `متن پیامک «${title}» نمی‌تواند خالی باشد.`;
  if (text.trim().length > SMS_TEMPLATE_MAX_LENGTH) {
    return `متن پیامک «${title}» نباید بیشتر از ${toPersianDigits(SMS_TEMPLATE_MAX_LENGTH)} کاراکتر باشد.`;
  }

  const allowed = new Set([...template.placeholders, PRODUCT_NAME].map((p) => p.toLowerCase()));
  const unknown = usedPlaceholders(text).filter((p) => !allowed.has(p.toLowerCase()));
  if (unknown.length > 0) {
    return `متن پیامک «${title}» عبارت ناشناخته دارد: ${unknown.map((p) => `{${p}}`).join('، ')}`;
  }

  const used = new Set(usedPlaceholders(text).map((p) => p.toLowerCase()));
  const missing = (template.requiredPlaceholders ?? []).filter((p) => !used.has(p.toLowerCase()));
  if (missing.length > 0) {
    return `متن پیامک «${title}» باید ${missing.map((p) => `{${p}}`).join('، ')} را داشته باشد.`;
  }
  return null;
}
