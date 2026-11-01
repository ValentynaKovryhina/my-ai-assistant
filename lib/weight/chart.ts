// Weight Tracker chart data (pure). The x axis is proportional to real measurement dates;
// recorded points are joined in date order and nothing is interpolated or invented.
import { addMonths, daysBetween } from "@/lib/tasks/dates";
import type { WeightEntryView, WeightPeriod } from "./shared";

/** First date included for a period ("last month" = since the same day one month ago). */
export function periodStart(period: WeightPeriod, today: string): string | null {
  switch (period) {
    case "1m":
      return addMonths(today, -1);
    case "3m":
      return addMonths(today, -3);
    case "6m":
      return addMonths(today, -6);
    case "1y":
      return addMonths(today, -12);
    case "all":
      return null;
  }
}

/** Entries in the period, oldest first (chart order). */
export function entriesForPeriod(entries: WeightEntryView[], period: WeightPeriod, today: string): WeightEntryView[] {
  const start = periodStart(period, today);
  return entries
    .filter((entry) => (start === null || entry.measuredOn >= start) && entry.measuredOn <= today)
    .sort((a, b) => a.measuredOn.localeCompare(b.measuredOn));
}

export type ChartPoint = { date: string; value: number };

export type LineChartGeometry = {
  width: number;
  height: number;
  plot: { left: number; right: number; top: number; bottom: number };
  /** SVG path through the points in date order ("" for fewer than 2 points). */
  path: string;
  dots: { x: number; y: number; date: string; value: number }[];
  yTicks: { y: number; value: number }[];
  xTicks: { x: number; date: string }[];
  /** y of the reference (goal) line, or null when it's outside the shown range. */
  referenceY: number | null;
  /** Where a reference outside the shown range lies, so the UI can point to it. */
  referenceOutside: "above" | "below" | null;
  domain: { from: string; to: string; min: number; max: number };
};

type GeometryOptions = {
  width?: number;
  height?: number;
  /** Start of the x domain (period start); defaults to the first point. */
  from?: string | null;
  /** End of the x domain; defaults to the last point. */
  to?: string;
  /** Optional horizontal reference line (goal weight). */
  reference?: number | null;
};

function niceStep(span: number): number {
  const raw = span / 4;
  const power = 10 ** Math.floor(Math.log10(raw));
  const fraction = raw / power;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
  return nice * power;
}

export function lineChartGeometry(points: ChartPoint[], options: GeometryOptions = {}): LineChartGeometry {
  const width = options.width ?? 640;
  const height = options.height ?? 220;
  const plot = { left: 44, right: width - 12, top: 12, bottom: height - 28 };
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));

  const first = sorted[0]?.date ?? options.to ?? "2000-01-01";
  const last = sorted[sorted.length - 1]?.date ?? first;
  const from = options.from && options.from < first ? options.from : first;
  const to = options.to && options.to > last ? options.to : last;
  const spanDays = Math.max(daysBetween(from, to), 0);

  const values = sorted.map((point) => point.value);
  let min = values.length ? Math.min(...values) : 0;
  let max = values.length ? Math.max(...values) : 1;
  const dataSpan = Math.max(max - min, 1);
  // Show the reference line only when it's near the data, so it never flattens the series.
  const reference = options.reference ?? null;
  // "Near" = within 1.5× the data span or 25% of the values, whichever is larger
  // (e.g. 67 kg with a 55 kg goal still shows the line; a far goal gets an edge label instead).
  const margin = Math.max(dataSpan * 1.5, max * 0.25);
  const showReference = reference !== null && reference >= min - margin && reference <= max + margin;
  if (showReference) {
    min = Math.min(min, reference);
    max = Math.max(max, reference);
  }
  const step = niceStep(Math.max(max - min, 1));
  min = Math.floor((min - step * 0.25) / step) * step;
  max = Math.ceil((max + step * 0.25) / step) * step;

  const x = (date: string) =>
    spanDays === 0 ? (plot.left + plot.right) / 2 : plot.left + (daysBetween(from, date) / spanDays) * (plot.right - plot.left);
  const y = (value: number) => plot.bottom - ((value - min) / (max - min)) * (plot.bottom - plot.top);

  const dots = sorted.map((point) => ({ x: x(point.date), y: y(point.value), date: point.date, value: point.value }));
  const path = dots.length >= 2 ? dots.map((dot, index) => `${index === 0 ? "M" : "L"}${dot.x.toFixed(1)},${dot.y.toFixed(1)}`).join(" ") : "";

  const yTicks: { y: number; value: number }[] = [];
  for (let value = min; value <= max + step / 1000; value += step) {
    yTicks.push({ y: y(value), value: Math.round(value * 100) / 100 });
  }

  const tickCount = spanDays === 0 ? 1 : Math.min(4, spanDays + 1);
  const xTicks: { x: number; date: string }[] = [];
  for (let i = 0; i < tickCount; i++) {
    const offset = tickCount === 1 ? 0 : Math.round((spanDays * i) / (tickCount - 1));
    const date = new Date(`${from}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + offset);
    const iso = date.toISOString().slice(0, 10);
    xTicks.push({ x: x(iso), date: iso });
  }

  return {
    width,
    height,
    plot,
    path,
    dots,
    yTicks,
    xTicks,
    referenceY: showReference ? y(reference) : null,
    referenceOutside: reference === null || showReference || values.length === 0 ? null : reference < min ? "below" : "above",
    domain: { from, to, min, max },
  };
}
