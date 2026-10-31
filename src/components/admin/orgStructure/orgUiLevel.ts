// The display level of a company (hiding only): simple shows posts and people; normal adds nodes,
// their types and moving them; advanced adds secondary links, the rules, templates and the parent
// company. A lower level hides screens - it never deletes or changes data. A backend that does not
// say (older, or no level set) is «normal», as before.
import type { ChartCompany, OrgUiLevel } from '../../../services/orgStructureApi';

const RANK: Record<OrgUiLevel, number> = { simple: 0, normal: 1, advanced: 2 };

export const UI_LEVELS: { id: OrgUiLevel; title: string; hint: string }[] = [
  { id: 'simple', title: 'ساده', hint: 'فقط پست و کاربر.' },
  { id: 'normal', title: 'معمولی', hint: 'واحد و اجزای چارت، افزودن و کشیدن و رها کردن.' },
  { id: 'advanced', title: 'پیشرفته', hint: 'رابطه‌ی فرعی (مافوق دوم)، قواعد، قالب‌ها.' },
];

export const levelOf = (company?: Pick<ChartCompany, 'uiLevel'> | null): OrgUiLevel => company?.uiLevel ?? 'normal';

export const atLeast = (level: OrgUiLevel, min: OrgUiLevel): boolean => RANK[level] >= RANK[min];

/** The highest level among the companies (what the section's tabs follow); no companies: normal. */
export const highestLevel = (companies: Pick<ChartCompany, 'uiLevel'>[]): OrgUiLevel =>
  companies.reduce<OrgUiLevel>((best, c) => (RANK[levelOf(c)] > RANK[best] ? levelOf(c) : best), companies.length ? 'simple' : 'normal');
