// «نمایش بر اساس پست»: a person who holds several posts can look at the system through one of
// them (or through every post of one unit) - or through all of them, as before. It only
// narrows what the screens show; it never changes what the server lets the person see or do
// (chat, meetings and the like are still the person's as a whole).
import { useSyncExternalStore } from 'react';
import type { HeldPosition } from '../services/orgStructureApi';

export const ALL_POSTS = 'all';

/** One thing to pick: a single post, or all the posts the person holds in one unit. */
export interface ActivePostOption {
  /** 'all', 'post:<unitPositionId>' or 'unit:<unitId>'. */
  key: string;
  label: string;
  /** The label in two lines for menus: the post (position) and, under it, its unit (or the count of posts). */
  title: string;
  subtitle?: string;
  /** The seats (unit position ids) this choice stands for. */
  postIds: string[];
  /** Position title and code of each seat, to match report rows (they carry no post id). */
  seats: { title: string; code: string }[];
}

interface State {
  userId: string | null;
  held: HeldPosition[];
  selected: string;
}

const STORAGE_PREFIX = 'tm_active_post_v1:';
const listeners = new Set<() => void>();
let state: State = { userId: null, held: [], selected: ALL_POSTS };

const read = (userId: string): string => {
  try {
    return localStorage.getItem(STORAGE_PREFIX + userId) || ALL_POSTS;
  } catch {
    return ALL_POSTS;
  }
};
const write = (userId: string, value: string) => {
  try {
    if (value === ALL_POSTS) localStorage.removeItem(STORAGE_PREFIX + userId);
    else localStorage.setItem(STORAGE_PREFIX + userId, value);
  } catch {
    // Storage unavailable: the choice just is not remembered.
  }
};
const emit = () => listeners.forEach((l) => l());

const seatLabel = (p: HeldPosition) => `${p.title}${p.unitName ? ` · ${p.unitName}` : ''}`;

/** All the choices for the held posts: «همه», each post, and a unit when the person holds 2+ posts in it. */
export function buildOptions(held: HeldPosition[]): ActivePostOption[] {
  const options: ActivePostOption[] = [{ key: ALL_POSTS, label: 'همهٔ پست‌ها', title: 'همهٔ پست‌ها', postIds: held.map((p) => p.unitPositionId), seats: held.map((p) => ({ title: p.title, code: p.code ?? '' })) }];
  for (const p of held) {
    options.push({ key: `post:${p.unitPositionId}`, label: seatLabel(p), title: p.title, subtitle: p.unitName || undefined, postIds: [p.unitPositionId], seats: [{ title: p.title, code: p.code ?? '' }] });
  }
  const byUnit = new Map<string, HeldPosition[]>();
  for (const p of held) {
    if (!p.unitId) continue;
    byUnit.set(p.unitId, [...(byUnit.get(p.unitId) ?? []), p]);
  }
  for (const [unitId, list] of byUnit) {
    if (list.length < 2) continue;
    options.push({ key: `unit:${unitId}`, label: `همهٔ پست‌های ${list[0].unitName}`, title: `همهٔ پست‌های ${list[0].unitName}`, subtitle: `${list.length} پست`, postIds: list.map((p) => p.unitPositionId), seats: list.map((p) => ({ title: p.title, code: p.code ?? '' })) });
  }
  return options;
}

/** Called when somebody signs in (null at sign-out): the saved choice of that person comes back. */
export function setActivePostUser(userId: string | null) {
  if (state.userId === userId) return;
  state = { userId, held: [], selected: userId ? read(userId) : ALL_POSTS };
  emit();
}

/** The posts the person holds now (from «جایگاه من»). A saved choice that no longer exists falls back to all. */
export function setHeldPosts(held: HeldPosition[]) {
  const options = buildOptions(held);
  const selected = options.some((o) => o.key === state.selected) ? state.selected : ALL_POSTS;
  state = { ...state, held, selected };
  emit();
}

export function selectActivePost(key: string) {
  if (!state.userId) return;
  state = { ...state, selected: key };
  write(state.userId, key);
  emit();
}

export interface ActivePostView {
  /** More than one post held: the switch is shown. */
  canSwitch: boolean;
  options: ActivePostOption[];
  selected: ActivePostOption;
  /** True when one post (or one unit) is chosen, that is the screens are narrowed. */
  narrowed: boolean;
  /** The seat ids to keep, or null for «همه» (nothing is narrowed). */
  postIds: Set<string> | null;
}

let cached: { src: State; view: ActivePostView } | null = null;
function viewOf(s: State): ActivePostView {
  if (cached && cached.src === s) return cached.view;
  const options = buildOptions(s.held);
  const selected = options.find((o) => o.key === s.selected) ?? options[0];
  const canSwitch = s.held.length > 1;
  const narrowed = canSwitch && selected.key !== ALL_POSTS;
  const view: ActivePostView = { canSwitch, options, selected, narrowed, postIds: narrowed ? new Set(selected.postIds) : null };
  cached = { src: s, view };
  return view;
}

export function useActivePost(): ActivePostView {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    () => viewOf(state),
    () => viewOf(state),
  );
}

/**
 * The posts the person works as, for the server (header X-Active-Posts): with one post, or one unit, chosen the
 * server gives only what those posts give (besides roles, groups and the person's own); null for «همه».
 */
export function activePostsHeader(): string | null {
  const ids = viewOf(state).postIds;
  return ids && ids.size > 0 ? [...ids].sort().join(',') : null;
}

/** What the chosen post hides, and why (for the note under the switch). */
export interface HiddenInfo { noPost: number; standIn: number; other: number; titles: string[] }
export const hiddenTotal = (h: HiddenInfo) => h.noPost + h.standIn + h.other;

/** A task is in the chosen post(s) when any of its posts (owner, responsible or access) is one of them. */
export function taskInPosts(task: { posts?: { postId: string }[] }, postIds: Set<string> | null): boolean {
  if (!postIds) return true;
  return (task.posts ?? []).some((p) => postIds.has(p.postId));
}

// ---- reports: the rows carry no post id, only the post's title and code of each period

import type { TaskReport, TaskReportRow } from '../services/taskReportApi';

/** A report row is in the chosen post(s) when someone was on it (not just its creator) through one of those posts. */
export function reportRowInPosts(row: TaskReportRow, seats: { title: string; code: string }[]): boolean {
  return (row.history ?? []).some((p) => p.role !== 'creator' && seats.some((s) => s.code === p.postCode && s.title === p.postTitle));
}

/** The summary cards recounted for the rows that are left. */
export function summarize(rows: TaskReportRow[]): TaskReport['summary'] {
  const count = (f: (r: TaskReportRow) => boolean) => rows.filter(f).length;
  return {
    total: rows.length,
    todo: count((r) => r.status === 'todo'),
    inProgress: count((r) => r.status === 'in_progress'),
    paused: count((r) => r.status === 'paused'),
    completed: count((r) => r.status === 'completed'),
    overdue: count((r) => r.isOverdue),
    normal: count((r) => r.type === 'normal'),
    project: count((r) => r.type === 'project'),
    recurring: count((r) => r.type === 'recurring'),
  };
}

/** The report narrowed to the chosen post(s); the report as it is when nothing is chosen. */
export function scopeReport(report: TaskReport | null, view: ActivePostView): TaskReport | null {
  if (!report || !view.narrowed) return report;
  const rows = report.rows.filter((r) => reportRowInPosts(r, view.selected.seats));
  return { ...report, rows, summary: summarize(rows) };
}
