import React from 'react';
import { Doughnut, Bar } from 'react-chartjs-2';
import type { ChartData, ChartOptions } from 'chart.js';
import { BarChart3, PieChart, Table2 } from 'lucide-react';
import { CHART_FONT_FAMILY, barNameLabels, isDarkMode, persianIntegerTick, rtlTooltip } from '../../utils/chartSetup';
import { toPersianDigits } from '../../utils/helpers';

// The chart view of a report: the same look as the dashboard charts on the board (doughnut with
// a legend, bars with the name written on each bar), fed with the rows the report shows.

export type ReportViewMode = 'table' | 'chart';

export interface ChartDatum { label: string; value: number; color: string }

export const CHART_PALETTE = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#3b82f6', '#06b6d4'];

/** Counts the items by a key; biggest first, the tail beyond `max` folded into «سایر». */
export function countBy<T>(items: readonly T[], keyOf: (item: T) => string | string[], max = 10): ChartDatum[] {
  const map = new Map<string, number>();
  items.forEach((item) => {
    const keys = keyOf(item);
    (Array.isArray(keys) ? (keys.length ? keys : ['—']) : [keys || '—']).forEach((k) => map.set(k, (map.get(k) || 0) + 1));
  });
  const sorted = Array.from(map.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fa'));
  const head = sorted.slice(0, max);
  const rest = sorted.slice(max).reduce((sum, [, n]) => sum + n, 0);
  if (rest > 0) head.push(['سایر', rest]);
  return head.map(([label, value], i) => ({ label, value, color: label === 'سایر' ? '#94a3b8' : CHART_PALETTE[i % CHART_PALETTE.length] }));
}

/** «جدول | نمودار»: switches a report between its list and its charts. */
export const ViewModeSwitch: React.FC<{ value: ReportViewMode; onChange: (mode: ReportViewMode) => void }> = ({ value, onChange }) => (
  <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl" role="radiogroup" aria-label="نوع نمایش گزارش">
    {([['table', 'جدول', Table2], ['chart', 'نمودار', PieChart]] as const).map(([id, label, Icon]) => (
      <button
        key={id}
        type="button"
        role="radio"
        aria-checked={value === id}
        onClick={() => onChange(id)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
          value === id ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
        }`}
      >
        <Icon className="w-3.5 h-3.5" /> {label}
      </button>
    ))}
  </div>
);

const Panel: React.FC<{ title: string; subtitle?: string; span: string; children: React.ReactNode }> = ({ title, subtitle, span, children }) => (
  <div className={`dashboard-chart-panel rounded-3xl p-5 border border-slate-200/90 dark:border-slate-800 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.45)] flex flex-col ${span}`}>
    <div className="flex items-center gap-2 mb-2">
      <div className="p-2 bg-indigo-50 dark:bg-indigo-950/60 rounded-xl text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900"><BarChart3 className="w-4 h-4" /></div>
      <div>
        <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">{title}</h4>
        {subtitle && <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
    </div>
    <div className="h-72 sm:h-80 w-full relative my-auto">{children}</div>
  </div>
);

const Empty: React.FC = () => (
  <div className="h-full flex items-center justify-center text-xs text-slate-500 dark:text-slate-400 font-medium">داده‌ای برای نمایش در نمودار نیست</div>
);

export const ReportDoughnut: React.FC<{ title: string; subtitle?: string; data: ChartDatum[]; span?: string }> = ({ title, subtitle, data, span = 'md:col-span-5 lg:col-span-4' }) => {
  const shown = data.filter((d) => d.value > 0);
  const total = shown.reduce((sum, d) => sum + d.value, 0);
  const chart: ChartData<'doughnut'> = {
    labels: shown.map((d) => d.label),
    datasets: [{ data: shown.map((d) => d.value), backgroundColor: shown.map((d) => d.color), hoverBackgroundColor: shown.map((d) => `${d.color}cc`), borderWidth: 0, spacing: 4 }],
  };
  const options: ChartOptions<'doughnut'> = {
    responsive: true, maintainAspectRatio: false, animation: false, radius: 80, cutout: 48,
    plugins: {
      legend: {
        position: 'bottom', rtl: true, textDirection: 'rtl',
        labels: { boxWidth: 10, boxHeight: 10, padding: 14, color: isDarkMode() ? '#cbd5e1' : '#334155', font: { family: CHART_FONT_FAMILY, size: 11, weight: 500 } },
      },
      tooltip: {
        ...rtlTooltip,
        callbacks: {
          label: (item) => `تعداد: ${toPersianDigits(shown[item.dataIndex].value)}`,
          afterLabel: (item) => `درصد: ٪${toPersianDigits(Math.round((shown[item.dataIndex].value / total) * 100))}`,
        },
      },
    },
  };
  return (
    <Panel title={title} subtitle={subtitle} span={span}>
      {total > 0 ? <Doughnut data={chart} options={options} aria-label={title} /> : <Empty />}
    </Panel>
  );
};

export const ReportBar: React.FC<{ title: string; subtitle?: string; data: ChartDatum[]; span?: string }> = ({ title, subtitle, data, span = 'md:col-span-7 lg:col-span-8' }) => {
  const names = React.useRef<string[]>([]);
  names.current = data.map((d) => d.label);
  const plugin = React.useMemo(() => barNameLabels(() => names.current), []);
  const max = data.reduce((m, d) => Math.max(m, d.value), 0);
  const chart: ChartData<'bar'> = {
    labels: names.current,
    datasets: [{
      data: data.map((d) => d.value), backgroundColor: data.map((d) => d.color), hoverBackgroundColor: data.map((d) => `${d.color}d9`),
      borderRadius: { topLeft: 6, topRight: 6, bottomLeft: 0, bottomRight: 0 }, borderSkipped: false, maxBarThickness: 46, minBarLength: 22,
    }],
  };
  const options: ChartOptions<'bar'> = {
    responsive: true, maintainAspectRatio: false, animation: false,
    layout: { padding: { top: 36, right: 15, bottom: 15, left: 4 } },
    scales: {
      x: { ticks: { display: false }, grid: { display: false }, border: { color: '#94a3b8', width: 1.5 } },
      y: {
        beginAtZero: true, max: Math.max(max + 1.2, 3.5),
        ticks: { stepSize: 1, callback: persianIntegerTick, color: '#64748b', font: { family: CHART_FONT_FAMILY, size: 11 } },
        grid: { color: 'rgba(51, 65, 85, 0.2)' }, border: { color: '#94a3b8', width: 1.5, dash: [3, 3] },
      },
    },
    plugins: {
      legend: { display: false },
      tooltip: { ...rtlTooltip, callbacks: { title: (items) => data[items[0].dataIndex].label, label: (item) => `تعداد: ${toPersianDigits(data[item.dataIndex].value)}` } },
    },
  };
  return (
    <Panel title={title} subtitle={subtitle} span={span}>
      {data.some((d) => d.value > 0) ? <Bar data={chart} options={options} plugins={[plugin]} aria-label={title} /> : <Empty />}
    </Panel>
  );
};

export const ChartGrid: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="grid grid-cols-1 md:grid-cols-12 gap-4 p-5">{children}</div>
);
