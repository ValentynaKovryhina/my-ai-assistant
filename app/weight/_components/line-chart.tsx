// Server-rendered SVG line chart for the Weight Tracker. Points sit at their real dates and are
// joined in date order; no intermediate points are generated. Palette as in Task Manager charts
// (dataviz series-1); a single series needs no legend, the title names it.
import { formatShortDate, formatWeekdayDate } from "@/lib/tasks/dates";
import { lineChartGeometry, type ChartPoint } from "@/lib/weight/chart";

type LineChartProps = {
  title: string;
  points: ChartPoint[];
  from: string | null;
  to: string;
  today: string;
  format: (value: number) => string;
  unit: string;
  reference?: { value: number; label: string } | null;
};

export function LineChart({ title, points, from, to, today, format, unit, reference }: LineChartProps) {
  const chart = lineChartGeometry(points, { from, to, reference: reference?.value ?? null });
  const { plot } = chart;

  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{title}</figcaption>
      <svg
        viewBox={`0 0 ${chart.width} ${chart.height}`}
        className="h-auto w-full touch-pan-y"
        role="img"
        aria-label={`${title}: ${points.length} measurement${points.length === 1 ? "" : "s"} from ${formatShortDate(chart.domain.from, today)} to ${formatShortDate(chart.domain.to, today)}. Values are listed in the table below.`}
      >
        {chart.yTicks.map((tick) => (
          <g key={tick.value}>
            <line x1={plot.left} x2={plot.right} y1={tick.y} y2={tick.y} strokeWidth={1} className="stroke-[#e1e0d9] dark:stroke-[#2c2c2a]" />
            <text x={plot.left - 6} y={tick.y + 4} textAnchor="end" className="fill-zinc-500 text-[11px] tabular-nums dark:fill-zinc-400">
              {Number.isInteger(tick.value) ? tick.value : tick.value.toFixed(1)}
            </text>
          </g>
        ))}
        <line x1={plot.left} x2={plot.right} y1={plot.bottom} y2={plot.bottom} strokeWidth={1} className="stroke-[#c3c2b7] dark:stroke-[#383835]" />
        {chart.xTicks.map((tick, index) => (
          <text
            key={tick.date}
            x={tick.x}
            y={chart.height - 8}
            textAnchor={chart.xTicks.length === 1 ? "middle" : index === 0 ? "start" : index === chart.xTicks.length - 1 ? "end" : "middle"}
            className="fill-zinc-500 text-[11px] dark:fill-zinc-400"
          >
            {formatShortDate(tick.date, today)}
          </text>
        ))}

        {reference && chart.referenceY !== null && (
          <g>
            <line
              x1={plot.left}
              x2={plot.right}
              y1={chart.referenceY}
              y2={chart.referenceY}
              strokeWidth={1.5}
              strokeDasharray="5 4"
              className="stroke-zinc-400 dark:stroke-zinc-500"
            />
            <text x={plot.right} y={chart.referenceY - 5} textAnchor="end" className="fill-zinc-500 text-[11px] dark:fill-zinc-400">
              {reference.label}
            </text>
          </g>
        )}

        {reference && chart.referenceOutside && (
          <text
            x={plot.right}
            y={chart.referenceOutside === "below" ? plot.bottom - 6 : plot.top + 10}
            textAnchor="end"
            className="fill-zinc-500 text-[11px] dark:fill-zinc-400"
          >
            {reference.label} {chart.referenceOutside === "below" ? "↓" : "↑"}
          </text>
        )}

        {chart.path && <path d={chart.path} fill="none" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" className="stroke-[#2a78d6] dark:stroke-[#3987e5]" />}
        {chart.dots.map((dot) => (
          <g key={dot.date}>
            <title>{`${formatWeekdayDate(dot.date, today)}: ${format(dot.value)} ${unit}`}</title>
            {/* Hit target larger than the mark. */}
            <circle cx={dot.x} cy={dot.y} r={12} fill="transparent" />
            <circle cx={dot.x} cy={dot.y} r={4} strokeWidth={2} className="fill-[#2a78d6] stroke-white dark:fill-[#3987e5] dark:stroke-zinc-900" />
          </g>
        ))}
      </svg>
      <details className="text-sm">
        <summary className="flex min-h-10 cursor-pointer items-center text-zinc-600 dark:text-zinc-300">Show as table</summary>
        <div className="max-h-64 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs text-zinc-500">
                <th className="py-1 font-medium">Date</th>
                <th className="py-1 text-right font-medium">{title}</th>
              </tr>
            </thead>
            <tbody>
              {[...points].reverse().map((point) => (
                <tr key={point.date} className="border-t border-zinc-100 dark:border-zinc-800">
                  <td className="py-1">{formatWeekdayDate(point.date, today)}</td>
                  <td className="py-1 text-right tabular-nums">
                    {format(point.value)} {unit}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
