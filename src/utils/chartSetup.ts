// Chart.js for the Kanban board's charts: only the pieces they use are registered (keeps the
// bundle small), with the app's Persian font, right-to-left tooltips and legends.
import {
  Chart as ChartJS,
  ArcElement,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  type Plugin,
} from 'chart.js';
import { toPersianDigits } from './helpers';

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

export const CHART_FONT_FAMILY = "'Vazirmatn', system-ui, -apple-system, sans-serif";

export const isDarkMode = (): boolean =>
  typeof document !== 'undefined' && document.documentElement.classList.contains('dark');

/** Tooltip look shared by the charts: the same dark card the board used before, right to left. */
export const rtlTooltip = {
  rtl: true,
  textDirection: 'rtl' as const,
  backgroundColor: 'rgba(15, 23, 42, 0.95)',
  borderColor: '#334155',
  borderWidth: 1,
  padding: 10,
  cornerRadius: 12,
  boxPadding: 4,
  usePointStyle: true,
  titleFont: { family: CHART_FONT_FAMILY, size: 12, weight: 'bold' as const },
  bodyFont: { family: CHART_FONT_FAMILY, size: 11 },
  footerFont: { family: CHART_FONT_FAMILY, size: 10, weight: 'normal' as const },
  footerColor: '#fcd34d',
};

/** Persian digits for whole-number axis ticks; fractional ticks are left blank. */
export const persianIntegerTick = (value: string | number): string => {
  const n = Number(value);
  return Number.isInteger(n) ? toPersianDigits(n) : '';
};

/**
 * Draws, for each bar, its count above it and the person's name under it, written straight (not turned): over two lines at
 * most, cut with «…» to the width of the bar's own column so neighbours never run into each other (the tooltip has the whole
 * name). `names` gives the label of each bar by index. The chart needs about 46px of bottom padding for the names.
 */
export const barNameLabels = (names: () => string[]): Plugin<'bar'> => ({
  id: 'barNameLabels',
  afterDatasetsDraw(chart) {
    const meta = chart.getDatasetMeta(0);
    const dataset = chart.data.datasets[0];
    if (!meta || !dataset) return;
    const { ctx, chartArea } = chart;
    const labels = names();
    const dark = isDarkMode();
    const countColor = dark ? '#e2e8f0' : '#334155';
    const nameColor = dark ? '#f1f5f9' : '#1e293b';
    const columnWidth = chartArea.width / Math.max(1, meta.data.length);
    const maxWidth = Math.max(24, columnWidth - 6);

    const fit = (text: string): string => {
      if (ctx.measureText(text).width <= maxWidth) return text;
      let cut = text;
      while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) cut = cut.slice(0, -1);
      return `${cut}…`;
    };
    // Words fill the first line, the rest the second; a single long word is cut.
    const lines = (text: string): string[] => {
      const words = text.trim().split(/\s+/).filter(Boolean);
      if (words.length <= 1) return [fit(text.trim())];
      let first = words[0];
      let k = 1;
      while (k < words.length && ctx.measureText(`${first} ${words[k]}`).width <= maxWidth) first = `${first} ${words[k++]}`;
      if (k >= words.length) return [first];
      return [fit(first), fit(words.slice(k).join(' '))];
    };

    ctx.save();
    meta.data.forEach((element, index) => {
      const bar = element as unknown as { x: number; y: number; base: number };
      const value = Number(dataset.data[index] ?? 0);
      const top = Math.min(bar.y, bar.base);

      // Count, right above the bar.
      ctx.fillStyle = countColor;
      ctx.font = `900 11px ${CHART_FONT_FAMILY}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.direction = 'ltr';
      ctx.fillText(toPersianDigits(value), bar.x, top - 6);

      // Name, under the axis.
      ctx.fillStyle = nameColor;
      ctx.font = `bold 11px ${CHART_FONT_FAMILY}`;
      ctx.direction = 'rtl';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      lines(labels[index] ?? '').forEach((line, row) => ctx.fillText(line, bar.x, chartArea.bottom + 8 + row * 14));
    });
    ctx.restore();
  },
});
