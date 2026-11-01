// Lightweight server-rendered SVG/HTML charts (no chart library).
// Colors follow the dataviz reference palette: one series hue (series-1) for magnitude,
// reserved status colors (good/critical/warning) for occurrence states, always paired with
// an icon and a text label so state never relies on color alone.

import { formatShortDate, formatWeekdayDate } from "@/lib/tasks/dates";
import { monthGrid, type BucketUnit, type TimeBucket } from "@/lib/tasks/analytics";
import type { ResolvedSlot } from "@/lib/tasks/recurrence";
import { formatMinutes, type SlotState } from "@/lib/tasks/shared";

const BUCKET_LABEL: Record<BucketUnit, (start: string, today: string) => string> = {
  day: (start) => String(Number(start.slice(8, 10))),
  week: (start, today) => formatShortDate(start, today),
  month: (start) => new Date(`${start}T00:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "short" }),
  year: (start) => start.slice(0, 4),
};

const BUCKET_TOOLTIP: Record<BucketUnit, (start: string, today: string) => string> = {
  day: (start, today) => formatWeekdayDate(start, today),
  week: (start, today) => `Week of ${formatShortDate(start, today)}`,
  month: (start) => new Date(`${start}T00:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "long", year: "numeric" }),
  year: (start) => start.slice(0, 4),
};

function niceMax(value: number): number {
  if (value <= 0) return 60;
  const steps = [15, 30, 60, 90, 120, 180, 240, 300, 360, 480, 600, 900, 1200, 1800, 2400, 3000, 3600, 6000, 12000, 30000, 60000];
  return steps.find((step) => step >= value) ?? Math.ceil(value / 60000) * 60000;
}

/** Bar chart of actual minutes per bucket, with per-bar hover tooltips and a table view. */
export function TimeBarChart({ buckets, unit, today, title }: { buckets: TimeBucket[]; unit: BucketUnit; today: string; title: string }) {
  const width = 640;
  const height = 200;
  const pad = { top: 12, right: 8, bottom: 26, left: 44 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const max = niceMax(Math.max(...buckets.map((bucket) => bucket.minutes), 0));
  const slot = plotW / Math.max(buckets.length, 1);
  const barW = Math.max(2, Math.min(28, slot - 2)); // 2px gap between adjacent bars
  const labelEvery = Math.ceil(buckets.length / 10);
  const ticks = [0, max / 2, max];
  const y = (minutes: number) => pad.top + plotH - (minutes / max) * plotH;

  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{title}</figcaption>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label={`${title}. Bar chart; see the table below for values.`}>
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} className={tick === 0 ? "stroke-[#c3c2b7] dark:stroke-[#383835]" : "stroke-[#e1e0d9] dark:stroke-[#2c2c2a]"} strokeWidth={1} />
            <text x={pad.left - 6} y={y(tick) + 4} textAnchor="end" className="fill-zinc-500 text-[11px] dark:fill-zinc-400">
              {tick >= 60 ? `${Math.round((tick / 60) * 10) / 10}h` : `${tick}m`}
            </text>
          </g>
        ))}
        {buckets.map((bucket, index) => {
          const x = pad.left + index * slot + (slot - barW) / 2;
          const top = y(bucket.minutes);
          const h = pad.top + plotH - top;
          const r = Math.min(4, barW / 2, h);
          const tooltip = `${BUCKET_TOOLTIP[unit](bucket.start, today)}: ${bucket.minutes > 0 ? formatMinutes(bucket.minutes) : "no time"}${bucket.sessions > 0 ? ` · ${bucket.sessions} session${bucket.sessions === 1 ? "" : "s"}` : ""}`;
          return (
            <g key={bucket.start} className="group">
              <title>{tooltip}</title>
              {/* Hit target larger than the mark. */}
              <rect x={pad.left + index * slot} y={pad.top} width={slot} height={plotH} fill="transparent" />
              {bucket.minutes > 0 && (
                <path
                  d={`M${x},${pad.top + plotH} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${pad.top + plotH} Z`}
                  className="fill-[#2a78d6] group-hover:opacity-80 dark:fill-[#3987e5]"
                />
              )}
              {index % labelEvery === 0 && (
                <text x={pad.left + index * slot + slot / 2} y={height - 8} textAnchor="middle" className="fill-zinc-500 text-[11px] dark:fill-zinc-400">
                  {BUCKET_LABEL[unit](bucket.start, today)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <details className="text-sm">
        <summary className="flex min-h-10 cursor-pointer items-center text-zinc-600 dark:text-zinc-300">Show as table</summary>
        <div className="max-h-64 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs text-zinc-500">
                <th className="py-1 font-medium">Period</th>
                <th className="py-1 text-right font-medium">Time</th>
                <th className="py-1 text-right font-medium">Sessions</th>
              </tr>
            </thead>
            <tbody>
              {buckets.map((bucket) => (
                <tr key={bucket.start} className="border-t border-zinc-100 dark:border-zinc-800">
                  <td className="py-1">{BUCKET_TOOLTIP[unit](bucket.start, today)}</td>
                  <td className="py-1 text-right tabular-nums">{bucket.minutes > 0 ? formatMinutes(bucket.minutes) : "—"}</td>
                  <td className="py-1 text-right tabular-nums">{bucket.sessions || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

// ---------------- Occurrence calendar ----------------

const STATE_META: Record<SlotState, { label: string; icon: string; cell: string }> = {
  completed: { label: "Completed", icon: "✓", cell: "bg-[#0ca30c] text-white" },
  missed: { label: "Missed", icon: "✕", cell: "bg-[#d03b3b] text-white" },
  skipped: { label: "Skipped", icon: "–", cell: "bg-[#fab219] text-[#0b0b0b]" },
  pending: { label: "Open now", icon: "○", cell: "ring-2 ring-inset ring-zinc-900 text-zinc-900 dark:ring-zinc-100 dark:text-zinc-100" },
  upcoming: { label: "Upcoming", icon: "·", cell: "border border-dashed border-zinc-400 text-zinc-500 dark:border-zinc-500" },
};

export function StateLegend({ states }: { states: SlotState[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-600 dark:text-zinc-300" aria-label="Legend">
      {states.map((state) => (
        <li key={state} className="flex items-center gap-1.5">
          <span aria-hidden="true" className={`flex h-4 w-4 items-center justify-center rounded text-[10px] font-bold ${STATE_META[state].cell}`}>
            {STATE_META[state].icon}
          </span>
          {STATE_META[state].label}
        </li>
      ))}
      <li className="flex items-center gap-1.5">
        <span aria-hidden="true" className="relative h-4 w-4 rounded border border-zinc-200 dark:border-zinc-700">
          <span className="absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-[#2a78d6] dark:bg-[#3987e5]" />
        </span>
        Activity logged
      </li>
    </ul>
  );
}

/** Month grids for calendar tasks: each scheduled day shows its state; journal days get a dot. */
export function OccurrenceCalendar({ months, slots, activityDates, today }: { months: string[]; slots: ResolvedSlot[]; activityDates: string[]; today: string }) {
  const byDate = new Map(slots.map((slot) => [slot.scheduledDate, slot]));
  const activity = new Set(activityDates);
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {months.map((month) => (
        <div key={month}>
          <p className="mb-1 text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {new Date(`${month}T00:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "long", year: "numeric" })}
          </p>
          <table className="w-full table-fixed border-separate border-spacing-0.5 text-center text-xs">
            <thead>
              <tr className="text-zinc-400">
                {["M", "T", "W", "T", "F", "S", "S"].map((day, index) => (
                  <th key={index} scope="col" className="font-normal">
                    {day}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {monthGrid(month).map((week, row) => (
                <tr key={row}>
                  {week.map((date, col) => {
                    if (!date) return <td key={col} />;
                    const slot = byDate.get(date);
                    const meta = slot ? STATE_META[slot.state] : null;
                    const hasActivity = activity.has(date);
                    const label = `${formatWeekdayDate(date, today)}: ${meta ? meta.label : "not scheduled"}${slot?.completedOn && slot.completedOn !== date ? ` (done ${formatShortDate(slot.completedOn, today)})` : ""}${hasActivity ? ", activity logged" : ""}`;
                    return (
                      <td key={col} title={label} aria-label={label} className="p-0">
                        <span
                          className={`relative mx-auto flex aspect-square max-w-9 items-center justify-center rounded-md font-medium ${
                            meta ? meta.cell : "text-zinc-400 dark:text-zinc-600"
                          } ${date === today ? "underline decoration-2 underline-offset-2" : ""}`}
                        >
                          <span aria-hidden="true">{meta && slot!.state !== "upcoming" && slot!.state !== "pending" ? meta.icon : Number(date.slice(8, 10))}</span>
                          {hasActivity && (
                            <span aria-hidden="true" className="absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-[#2a78d6] ring-1 ring-white dark:bg-[#3987e5] dark:ring-zinc-900" />
                          )}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

/** Period list for window tasks (one row per period). */
export function PeriodList({ slots, today }: { slots: ResolvedSlot[]; today: string }) {
  const rows = [...slots].reverse();
  return (
    <ul className="flex flex-col divide-y divide-zinc-100 dark:divide-zinc-800">
      {rows.map((slot) => {
        const meta = STATE_META[slot.state];
        return (
          <li key={slot.scheduledDate} className="flex items-center gap-3 py-2 text-sm">
            <span aria-hidden="true" className={`flex h-6 w-6 shrink-0 items-center justify-center rounded text-xs font-bold ${meta.cell}`}>
              {meta.icon}
            </span>
            <span className="flex-1">
              <span className="font-medium text-zinc-900 dark:text-zinc-100">
                {formatShortDate(slot.availableFrom, today)} – {formatShortDate(slot.dueDate, today)}
              </span>
              <span className="ml-2 text-zinc-500 dark:text-zinc-400">
                {meta.label}
                {slot.completedOn ? ` on ${formatShortDate(slot.completedOn, today)}${slot.completedOn > slot.dueDate ? " (late)" : ""}` : ""}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
