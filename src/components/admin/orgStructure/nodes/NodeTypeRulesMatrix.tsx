// «سلسله‌مراتب مجاز»: a check table of which node type may sit under which (a row: the parent, the first
// row: directly under the company; a column: the child). Standalone: rules in, onChange out.
// usage (optional) says how many existing nodes sit under each pair: unticking such a pair is
// allowed, but marked - the nodes stay and are listed as not matching the rules (nothing is deleted).
import React from 'react';
import { AlertTriangle } from 'lucide-react';
import type { ChartNodeType } from '../../../../services/orgStructureApi';
import { toPersianDigits } from '../../../../utils/helpers';
import { NodeTypeIcon, safeColor } from './nodeTypeStyle';

/** parentTypeId null: directly under the company. */
export interface NodeTypeRule { parentTypeId: string | null; childTypeId: string }

const pairKey = (parentTypeId: string | null, childTypeId: string) => `${parentTypeId ?? 'company'}>${childTypeId}`;

export const NodeTypeRulesMatrix: React.FC<{
  types: ChartNodeType[];
  rules: NodeTypeRule[];
  onChange?: (rules: NodeTypeRule[]) => void;
  /** Existing nodes under each pair, by `${parentTypeId ?? 'company'}>${childTypeId}`. */
  usage?: Record<string, number>;
  readOnly?: boolean;
}> = ({ types, rules, onChange, usage = {}, readOnly = !onChange }) => {
  const allowed = new Set(rules.map((r) => pairKey(r.parentTypeId, r.childTypeId)));
  const toggle = (parentTypeId: string | null, childTypeId: string) => {
    if (readOnly || !onChange) return;
    const key = pairKey(parentTypeId, childTypeId);
    onChange(allowed.has(key)
      ? rules.filter((r) => pairKey(r.parentTypeId, r.childTypeId) !== key)
      : [...rules, { parentTypeId, childTypeId }]);
  };
  // Pairs that are in use but no longer allowed.
  const conflicts: [string, number][] = Object.entries(usage as Record<string, number>).filter(([key, count]) => count > 0 && !allowed.has(key));
  const rows: { id: string | null; name: string; type?: ChartNodeType }[] = [
    { id: null, name: 'مستقیم زیر شرکت' },
    ...types.map((type) => ({ id: type.nodeTypeId, name: type.name, type })),
  ];

  if (types.length === 0) {
    return <div className="py-6 text-center text-sm text-slate-500">هنوز جزئی برای چارت تعریف نشده؛ شرکت بدون اجزای چارت، ساختار مسطح دارد.</div>;
  }

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
        <table className="min-w-full text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-800/60">
              <th scope="col" className="sticky start-0 z-10 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-right font-bold text-slate-600 dark:text-slate-300 whitespace-nowrap">
                والد ↓ / زیرمجموعه ←
              </th>
              {types.map((type) => (
                <th key={type.nodeTypeId} scope="col" className="px-2 py-2 font-bold text-slate-700 dark:text-slate-200 whitespace-nowrap">
                  <span className="inline-flex flex-col items-center gap-1">
                    <NodeTypeIcon icon={type.icon} color={type.color} />
                    {type.name}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id ?? 'company'} className="border-t border-slate-100 dark:border-slate-800">
                <th scope="row" className="sticky start-0 z-10 bg-white dark:bg-slate-900 px-3 py-2 text-right font-bold whitespace-nowrap">
                  <span className="inline-flex items-center gap-1.5" style={row.type ? { color: safeColor(row.type.color) } : undefined}>
                    {row.type && <NodeTypeIcon icon={row.type.icon} />}
                    <span className={row.type ? '' : 'text-slate-500'}>{row.name}</span>
                  </span>
                </th>
                {types.map((child) => {
                  const key = pairKey(row.id, child.nodeTypeId);
                  const on = allowed.has(key);
                  const used = usage[key] ?? 0;
                  const conflict = used > 0 && !on;
                  return (
                    <td key={child.nodeTypeId} className={`px-2 py-1.5 text-center ${conflict ? 'bg-amber-50 dark:bg-amber-950/40' : ''}`}>
                      <label className={`inline-flex items-center gap-1 ${readOnly ? '' : 'cursor-pointer'}`} title={used > 0 ? `${toPersianDigits(used)} گره با این ترکیب وجود دارد` : undefined}>
                        <input
                          type="checkbox"
                          checked={on}
                          disabled={readOnly}
                          onChange={() => toggle(row.id, child.nodeTypeId)}
                          aria-label={`${child.name} زیر ${row.name}`}
                          className="w-4 h-4 accent-indigo-700"
                        />
                        {used > 0 && <span className={`text-[10px] ${conflict ? 'text-amber-700 font-bold' : 'text-slate-400'}`}>{toPersianDigits(used)}</span>}
                      </label>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {conflicts.length > 0 && (
        <div role="status" className="flex items-start gap-2 p-2.5 rounded-xl border border-amber-200 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-200 text-xs leading-relaxed">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            {toPersianDigits(conflicts.reduce((sum, [, count]) => sum + count, 0))} گره‌ی موجود با قاعده‌های جدید جور نیست. این گره‌ها حذف نمی‌شوند؛ فقط در فهرست «ناسازگار» می‌آیند تا جابه‌جا شوند.
          </span>
        </div>
      )}
    </div>
  );
};

/** How many existing nodes of a company sit under each pair of types (for `usage`). */
export function ruleUsage(units: { unitId: string; parentNodeId?: string | null; nodeType?: ChartNodeType | null }[]): Record<string, number> {
  const typeOf = new Map(units.map((u) => [u.unitId, u.nodeType?.nodeTypeId ?? null] as const));
  const usage: Record<string, number> = {};
  for (const unit of units) {
    if (!unit.nodeType) continue;
    const parentType = unit.parentNodeId ? typeOf.get(unit.parentNodeId) ?? null : null;
    const key = pairKey(parentType, unit.nodeType.nodeTypeId);
    usage[key] = (usage[key] ?? 0) + 1;
  }
  return usage;
}
