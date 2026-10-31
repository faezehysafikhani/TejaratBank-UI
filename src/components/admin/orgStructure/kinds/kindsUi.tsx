// Pieces both drawings of the chart share: the actions a node offers, the person chips and the head chip.
import React from 'react';
import { toPersianDigits } from '../../../../utils/helpers';
import { KIND_INFO, type KindTreeNode, officialOf } from './orgKinds';

export interface KindActions {
  can: { create: boolean; update: boolean; remove: boolean; assign: boolean; move: boolean };
  onAdd: (parent: KindTreeNode | null) => void;
  onEdit: (node: KindTreeNode, focusPeople?: boolean) => void;
  onRemovePerson: (node: KindTreeNode, userId: string) => void;
  onSetPrimary: (node: KindTreeNode, userId: string) => void;
  onToggleHead: (node: KindTreeNode, parent: KindTreeNode) => void;
  onDelete: (node: KindTreeNode) => void;
  onMove: (node: KindTreeNode) => void;
}

const initial = (name: string) => (name.trim()[0] || '?').toUpperCase();

export const Avatar: React.FC<{ name: string; color: string }> = ({ name, color }) => (
  <i className="inline-grid place-items-center w-5 h-5 rounded-full text-white text-[11px] not-italic" style={{ backgroundColor: color }}>{initial(name)}</i>
);

/** The people of a position: a chip each (× removes, ★ marks the official one when there are several) and «+ شخص». */
export const PersonChips: React.FC<{ node: KindTreeNode; actions: KindActions; max?: number; query?: string }> = ({ node, actions, max, query }) => {
  const shown = max ? node.persons.slice(0, max) : node.persons;
  const color = KIND_INFO.position.color;
  const q = (query || '').trim().toLowerCase();
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {shown.map((p) => (
        <span key={p.userId} className={`group/chip inline-flex items-center gap-1 rounded-full border bg-slate-50 dark:bg-slate-800 ps-1 pe-2.5 py-0.5 text-xs ${q && p.displayName.toLowerCase().includes(q) ? 'border-amber-400 bg-amber-50' : 'border-slate-200 dark:border-slate-700'}`}>
          <Avatar name={p.displayName} color={color} />
          {p.displayName}
          {node.persons.length > 1 && (
            <button
              type="button"
              disabled={!actions.can.assign}
              title={p.isPrimary ? 'شخص رسمی این سمت' : 'رسمی کردن'}
              aria-label={p.isPrimary ? `${p.displayName} شخص رسمی است` : `رسمی کردن ${p.displayName}`}
              onClick={(e) => { e.stopPropagation(); if (!p.isPrimary) actions.onSetPrimary(node, p.userId); }}
              className={`text-[13px] leading-none ${p.isPrimary ? 'text-amber-500' : 'text-slate-300 hover:text-amber-500'} cursor-pointer disabled:cursor-default`}
            >{p.isPrimary ? '★' : '☆'}</button>
          )}
          {actions.can.assign && (
            <button type="button" aria-label={`حذف ${p.displayName}`} title="حذف شخص" onClick={(e) => { e.stopPropagation(); actions.onRemovePerson(node, p.userId); }} className="hidden group-hover/chip:inline text-slate-400 hover:text-rose-600 text-sm leading-none cursor-pointer">×</button>
          )}
        </span>
      ))}
      {max && node.persons.length > max && (
        <button type="button" onClick={(e) => { e.stopPropagation(); actions.onEdit(node, true); }} className="rounded-full border border-slate-200 dark:border-slate-700 px-2 py-0.5 text-xs cursor-pointer" aria-label="نمایش همه‌ی اشخاص">+{toPersianDigits(node.persons.length - max)}</button>
      )}
      {actions.can.assign && (node.persons.length > 0
        ? <button type="button" onClick={(e) => { e.stopPropagation(); actions.onEdit(node, true); }} className="rounded-full border border-dashed border-indigo-300 px-2 py-0.5 text-[11px] text-indigo-600 hover:bg-indigo-50 cursor-pointer">+ شخص</button>
        : <button type="button" onClick={(e) => { e.stopPropagation(); actions.onEdit(node, true); }} className="rounded-full border border-dashed border-amber-400 bg-amber-50 px-2.5 py-0.5 text-xs text-amber-800 cursor-pointer">+ تعیین شخص</button>)}
      {!actions.can.assign && node.persons.length === 0 && <span className="text-xs text-slate-400">خالی</span>}
    </span>
  );
};

/** On a unit: who its head is. */
export const HeadChip: React.FC<{ unit: KindTreeNode }> = ({ unit }) => {
  const head = unit.headNodeId ? unit.children.find((c) => c.id === unit.headNodeId) : null;
  if (!head) return <span className="rounded-full border border-slate-200 bg-slate-100 dark:bg-slate-800 dark:border-slate-700 px-2.5 py-0.5 text-[11.5px] text-slate-400">بدون رئیس</span>;
  const person = officialOf(head);
  return (
    <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11.5px] text-amber-800">
      ★ رئیس: <b>{head.name}</b>{person ? ` · ${person.displayName}` : ''}
    </span>
  );
};
