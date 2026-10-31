// Picks a node type's colour (from the palette or any #rrggbb) and icon. Standalone: value in,
// onChange out; no API.
import React, { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { inputClass } from '../../AdminUi';
import { NODE_TYPE_COLORS, NODE_TYPE_ICONS, NodeTypeBadge, NodeTypeIcon, safeColor } from './nodeTypeStyle';

export interface NodeTypeStyle { color: string; icon: string }

export const NodeTypeStylePicker: React.FC<{
  value: NodeTypeStyle;
  onChange: (value: NodeTypeStyle) => void;
  /** Shown in the preview badge. */
  previewName?: string;
  disabled?: boolean;
}> = ({ value, onChange, previewName = 'نمونه', disabled }) => {
  const [hex, setHex] = useState(value.color);
  useEffect(() => setHex(value.color), [value.color]);
  const color = safeColor(value.color);

  const pickColor = (next: string) => {
    setHex(next);
    if (/^#[0-9a-fA-F]{6}$/.test(next)) onChange({ ...value, color: next.toLowerCase() });
  };

  return (
    <div className={`space-y-3 ${disabled ? 'opacity-60 pointer-events-none' : ''}`}>
      <div>
        <span className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">رنگ</span>
        <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="رنگ جزء چارت">
          {NODE_TYPE_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={c === color}
              aria-label={c}
              title={c}
              onClick={() => pickColor(c)}
              className={`w-7 h-7 rounded-full flex items-center justify-center cursor-pointer ring-offset-2 ring-offset-white dark:ring-offset-slate-900 ${c === color ? 'ring-2 ring-indigo-500' : ''}`}
              style={{ backgroundColor: c }}
            >
              {c === color && <Check className="w-4 h-4 text-white" />}
            </button>
          ))}
          <input
            type="text"
            dir="ltr"
            value={hex}
            maxLength={7}
            onChange={(e) => pickColor(e.target.value.trim())}
            className={`${inputClass} !w-28 !py-1.5 font-mono text-xs`}
            aria-label="کد رنگ"
            placeholder="#2563eb"
          />
        </div>
        {!/^#[0-9a-fA-F]{6}$/.test(hex) && <span className="block text-[11px] text-rose-600 mt-1">کد رنگ باید به شکل ‎#2563eb‎ باشد.</span>}
      </div>

      <div>
        <span className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">آیکون</span>
        <div className="grid grid-cols-7 sm:grid-cols-11 gap-1.5" role="radiogroup" aria-label="آیکون جزء چارت">
          {Object.entries(NODE_TYPE_ICONS).map(([name, { label }]) => (
            <button
              key={name}
              type="button"
              role="radio"
              aria-checked={name === value.icon}
              aria-label={label}
              title={label}
              onClick={() => onChange({ ...value, icon: name })}
              className={`h-9 rounded-lg border flex items-center justify-center cursor-pointer transition-colors ${
                name === value.icon
                  ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-950/50'
                  : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <NodeTypeIcon icon={name} className="w-4 h-4" color={name === value.icon ? color : undefined} />
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
        <span>پیش‌نمایش:</span>
        <NodeTypeBadge name={previewName} color={color} icon={value.icon} />
      </div>
    </div>
  );
};
