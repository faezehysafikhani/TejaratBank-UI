// A node's card (a deputy, a general department, a committee...): its type's colour and icon,
// name, manager, people, vacant posts, nodes under it and secondary links. Standalone: shows a
// ChartUnit; selection and the expand button are the caller's.
import React from 'react';
import { ChevronDown, ChevronUp, GitBranch, Link2, UserX, Users } from 'lucide-react';
import type { ChartUnit } from '../../../../services/orgStructureApi';
import { toPersianDigits } from '../../../../utils/helpers';
import { unitHeadcount, vacantCount } from '../orgChartModel';
import { PersonAvatar } from '../PersonAvatar';
import { NodeTypeIcon, safeColor } from './nodeTypeStyle';

export const OrgNodeCard: React.FC<{
  unit: ChartUnit;
  selected?: boolean;
  onSelect?: () => void;
  /** Whether the nodes under it are shown; undefined: no expand button. */
  expanded?: boolean;
  onToggle?: () => void;
  /** A narrower card without the manager line (for big charts). */
  compact?: boolean;
}> = ({ unit, selected = false, onSelect, expanded, onToggle, compact = false }) => {
  const type = unit.nodeType;
  const color = safeColor(type?.color);
  const people = unitHeadcount(unit);
  const vacant = vacantCount(unit);
  const children = unit.children?.length ?? 0;
  const links = unit.links?.length ?? 0;
  const inactive = unit.isActive === false;
  const managerVacant = !unit.manager;

  return (
    <div
      data-node={`unit:${unit.unitId}`}
      role={onSelect ? 'button' : undefined}
      tabIndex={onSelect ? 0 : undefined}
      aria-pressed={onSelect ? selected : undefined}
      title={unit.name}
      onClick={onSelect}
      onKeyDown={(e) => { if (onSelect && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onSelect(); } }}
      className={`relative ${compact ? 'w-52' : 'w-64'} rounded-2xl border bg-white dark:bg-slate-900 transition-all focus:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-400 ${
        onSelect ? 'cursor-pointer' : ''
      } ${
        selected
          ? 'border-indigo-500 ring-2 ring-indigo-200 dark:ring-indigo-900 shadow-lg shadow-indigo-500/10'
          : 'border-slate-200 dark:border-slate-700 hover:shadow-md'
      } ${inactive ? 'opacity-60' : ''}`}
    >
      {/* The type's colour along the top. */}
      <span className="absolute inset-x-3 top-0 h-1 rounded-b-full" style={{ backgroundColor: color }} aria-hidden />
      <div className="flex items-start gap-2.5 p-3 pt-3.5">
        <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${color}1a`, color }}>
          <NodeTypeIcon icon={type?.icon} className="w-[18px] h-[18px]" />
        </span>
        <span className="min-w-0 flex-1">
          {type && type.name !== unit.name && <span className="block text-[10px] font-bold truncate" style={{ color }}>{type.name}</span>}
          <span className={`block text-sm font-extrabold leading-snug ${compact ? 'truncate' : 'line-clamp-2'} ${inactive ? 'line-through text-slate-400' : 'text-slate-800 dark:text-slate-100'}`}>
            {unit.name}
          </span>
        </span>
        {expanded !== undefined && children > 0 && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggle?.(); }}
            aria-expanded={expanded}
            aria-label={`${expanded ? 'بستن' : 'باز کردن'} زیرمجموعه‌ی ${unit.name}`}
            className="w-7 h-7 shrink-0 rounded-full border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-indigo-600 hover:border-indigo-300 flex items-center justify-center cursor-pointer"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        )}
      </div>

      {!compact && (
        <div className="px-3 pb-2 -mt-1">
          {unit.manager ? (
            <span className="flex items-center gap-1.5 min-w-0">
              <PersonAvatar name={unit.manager.displayName} url={unit.manager.avatarUrl} />
              <span className="text-xs text-slate-600 dark:text-slate-300 truncate">{unit.manager.displayName}</span>
            </span>
          ) : (
            <span className="text-xs text-slate-400">{(unit.positions?.length ?? 0) > 0 ? 'مدیر: خالی' : 'بدون مدیر'}</span>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500">
        <span className="flex items-center gap-1" title="تعداد نفرات"><Users className="w-3 h-3" />{toPersianDigits(people)} نفر</span>
        {vacant > 0 && (
          <span className={`flex items-center gap-1 ${managerVacant ? 'text-amber-600' : ''}`} title="پست‌های خالی">
            <UserX className="w-3 h-3" />{toPersianDigits(vacant)} خالی
          </span>
        )}
        {children > 0 && <span className="flex items-center gap-1" title="واحدهای زیرمجموعه"><GitBranch className="w-3 h-3" />{toPersianDigits(children)} زیرمجموعه</span>}
        {links > 0 && <span className="flex items-center gap-1" title="رابطه‌های فرعی"><Link2 className="w-3 h-3" />{toPersianDigits(links)} رابطه</span>}
      </div>
    </div>
  );
};
