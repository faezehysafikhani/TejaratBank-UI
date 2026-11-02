// «+ افزودن»: one small button on a card (or a row) that opens a short menu of what can be added
// right there - a sub-unit, a post, a person. The menu is drawn on the page (not inside the chart),
// so zooming or scrolling the chart never cuts it off.
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus } from 'lucide-react';

export interface AddMenuItem {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  hint?: string;
  run: () => void;
}

export const AddMenu: React.FC<{
  items: (AddMenuItem | null | false | undefined)[];
  /** Names the card in the button's label for screen readers. */
  forName: string;
  /** compact: the plus alone (a tight row). */
  compact?: boolean;
  testId?: string;
}> = ({ items, forName, compact = false, testId = 'add-menu' }) => {
  const list = items.filter(Boolean) as AddMenuItem[];
  const button = useRef<HTMLButtonElement>(null);
  const [at, setAt] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!at) return undefined;
    const close = () => setAt(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [at]);

  if (list.length === 0) return null;
  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (at) { setAt(null); return; }
    const r = button.current?.getBoundingClientRect();
    if (r) setAt({ top: r.bottom + 6, left: Math.min(Math.max(8, r.left), window.innerWidth - 200) });
  };

  return (
    <>
      <button
        ref={button}
        type="button"
        data-testid={testId}
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={!!at}
        aria-label={`افزودن به ${forName}`}
        title={`افزودن به ${forName}`}
        className="inline-flex shrink-0 items-center justify-center w-6 h-6 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold cursor-pointer shadow-xs"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
      {at && createPortal(
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setAt(null)} aria-hidden="true" />
          <div role="menu" dir="rtl" style={{ top: at.top, left: at.left }} className="fixed z-[61] w-48 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl p-1.5">
            {list.map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                onClick={() => { setAt(null); item.run(); }}
                className="w-full flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-start hover:bg-indigo-50 dark:hover:bg-indigo-950/40 cursor-pointer"
              >
                <span className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-300 flex items-center justify-center shrink-0"><item.icon className="w-4 h-4" /></span>
                <span className="min-w-0">
                  <span className="block text-xs font-extrabold text-slate-800 dark:text-slate-100">{item.label}</span>
                </span>
              </button>
            ))}
          </div>
        </>,
        document.body,
      )}
    </>
  );
};
