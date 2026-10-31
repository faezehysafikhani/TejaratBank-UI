// A node's change log entry in words (the server keeps it as JSON with ids): «نام: الف ← ب».
import { toPersianDigits } from '../../../../utils/helpers';
import { gregorianToJalali } from '../../../../utils/jalali';

/** Names for the ids in a change; a missing one shows as «(حذف‌شده)». */
export interface ChangeNames {
  node?: (id: string) => string | undefined;
  type?: (id: string) => string | undefined;
  company?: (id: string) => string | undefined;
  user?: (id: string) => string | undefined;
}

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);

/** A field by name, whatever its case (the server writes both «code» and «LatinName»). */
const field = (value: unknown, name: string): unknown => {
  if (!isObject(value)) return undefined;
  const key = Object.keys(value).find((k) => k.toLowerCase() === name.toLowerCase());
  return key === undefined ? undefined : value[key];
};

const text = (value: unknown): string => (typeof value === 'string' && value.trim() ? value.trim() : '');

const day = (value: unknown): string => {
  const iso = text(value);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return '';
  const { jy, jm, jd } = gregorianToJalali(Number(m[1]), Number(m[2]), Number(m[3]));
  return toPersianDigits(`${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`);
};

const EMPTY = '—';
const named = (lookup: ((id: string) => string | undefined) | undefined, value: unknown, none = EMPTY): string => {
  const id = text(value);
  if (!id) return none;
  return lookup?.(id) || '(حذف‌شده)';
};

/** «برچسب: قبل ← بعد», only when it changed. */
const pair = (label: string, before: string, after: string): string[] =>
  before === after ? [] : [`${label}: ${before || EMPTY} ← ${after || EMPTY}`];

const DETAIL_FIELDS: [string, string][] = [
  ['code', 'کد گره'], ['LatinName', 'نام لاتین'], ['CorrespondenceTitle', 'عنوان مکاتباتی'], ['Phone', 'تلفن'], ['Address', 'نشانی'],
];

/** The change in short Persian lines; empty when there is nothing to add to its title. */
export function describeChange(action: string, details: string | null | undefined, names: ChangeNames = {}): string[] {
  let data: unknown;
  try {
    data = details ? JSON.parse(details) : {};
  } catch {
    return [];
  }

  const before = field(data, 'before');
  const after = field(data, 'after');
  switch (action) {
    case 'create': {
      const lines = [`نام: ${text(field(data, 'name')) || EMPTY}`];
      if (text(field(data, 'type'))) lines.push(`جزء چارت: ${named(names.type, field(data, 'type'))}`);
      lines.push(text(field(data, 'parent')) ? `زیر: ${named(names.node, field(data, 'parent'))}` : `بالاترین سطح ${named(names.company, field(data, 'company'), '')}`.trim());
      const autoLinks = field(data, 'autoLinks');
      if (Array.isArray(autoLinks) && autoLinks.length > 0) lines.push(`${toPersianDigits(autoLinks.length)} رابطه‌ی خودکار`);
      return lines;
    }
    case 'update':
      return [
        ...pair('نام', text(field(before, 'name')), text(field(after, 'name'))),
        ...pair('جزء چارت', named(names.type, field(before, 'type'), 'بدون جزء'), named(names.type, field(after, 'type'), 'بدون جزء')),
      ];
    case 'details':
      return DETAIL_FIELDS.flatMap(([key, label]) => pair(label, text(field(before, key)), text(field(after, key))));
    case 'manager':
      return pair('مدیر گره', named(names.user, before, 'ندارد'), named(names.user, after, 'ندارد'));
    case 'move': {
      const place = (value: unknown) => (text(field(value, 'parent'))
        ? `زیر ${named(names.node, field(value, 'parent'))}`
        : `بالاترین سطح ${named(names.company, field(value, 'company'), '')}`.trim());
      return pair('جا', place(before), place(after));
    }
    case 'reorder': {
      const position = field(data, 'position');
      return typeof position === 'number' ? [`جای تازه بین هم‌سطح‌ها: ${toPersianDigits(position + 1)}`] : [];
    }
    case 'validity':
      return [
        ...pair('از تاریخ', day(field(before, 'validFrom')), day(field(after, 'validFrom'))),
        ...pair('تا تاریخ', day(field(before, 'validTo')), day(field(after, 'validTo'))),
      ];
    case 'merge':
    case 'unmerge': {
      const count = (value: unknown) => (Array.isArray(value) ? value.length : typeof value === 'number' ? value : 0);
      const lines = [`${action === 'merge' ? 'در' : 'از'}: ${named(names.node, field(data, 'target'))}`];
      const parts = [
        count(field(data, 'children')) ? `${toPersianDigits(count(field(data, 'children')))} زیرمجموعه` : '',
        count(field(data, 'posts')) ? `${toPersianDigits(count(field(data, 'posts')))} پست` : '',
        count(field(data, 'people')) ? `${toPersianDigits(count(field(data, 'people')))} نفر` : '',
      ].filter(Boolean);
      if (parts.length) lines.push(`${action === 'merge' ? 'منتقل شد' : 'برگشت'}: ${parts.join('، ')}`);
      const ends = day(field(after, 'validTo'));
      if (action === 'merge' && ends) lines.push(`غیرفعال از ${ends}`);
      return lines;
    }
    default:
      return [];
  }
}
