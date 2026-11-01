import { describe, expect, it } from "vitest";
import { todayInTimeZone } from "@/lib/tasks/dates";
import { calculateBmi, goalDifference } from "@/lib/weight/bmi";
import { entriesForPeriod, lineChartGeometry, periodStart } from "@/lib/weight/chart";
import { formatBmi, formatDifference, formatKg, parsePeriod, type WeightEntryView } from "@/lib/weight/shared";
import { parseDecimal, parseSettingsForm, parseWeight, parseWeightForm } from "@/lib/weight/validation";
import { form } from "./helpers";

describe("BMI", () => {
  it("weight / (height in metres)²", () => {
    expect(calculateBmi(67.3, 164)).toBeCloseTo(67.3 / (1.64 * 1.64), 10);
    expect(formatBmi(calculateBmi(67.3, 164))).toBe("25.0");
    expect(formatBmi(calculateBmi(55, 164))).toBe("20.4");
    expect(formatBmi(calculateBmi(70, 175))).toBe("22.9");
  });

  it("recalculates when the height changes (nothing stored)", () => {
    expect(formatBmi(calculateBmi(67.3, 170))).toBe("23.3");
  });

  it("returns null for unusable input", () => {
    expect(calculateBmi(70, 0)).toBeNull();
    expect(calculateBmi(Number.NaN, 164)).toBeNull();
    expect(formatBmi(null)).toBe("—");
  });

  it("goal difference without float noise", () => {
    expect(goalDifference(59.3, 55)).toBe(4.3);
    expect(goalDifference(54.85, 55)).toBe(-0.15);
    expect(formatDifference(4.3)).toBe("+4.3 kg");
    expect(formatDifference(-0.15)).toBe("−0.15 kg");
    expect(formatDifference(0)).toBe("0.0 kg");
  });
});

describe("decimal weight validation", () => {
  it("accepts dot and comma decimals, up to 2 places, and normalizes", () => {
    expect(parseWeight("67.3")).toEqual({ ok: true, weight: { text: "67.3", value: 67.3 } });
    expect(parseWeight("67,35")).toEqual({ ok: true, weight: { text: "67.35", value: 67.35 } });
    expect(parseWeight(" 67 ")).toEqual({ ok: true, weight: { text: "67", value: 67 } });
    expect(parseWeight("67.30")).toEqual({ ok: true, weight: { text: "67.3", value: 67.3 } });
    expect(parseWeight("067.0")).toEqual({ ok: true, weight: { text: "67", value: 67 } });
  });

  it("rejects too many decimals, out-of-range values and non-numbers", () => {
    for (const [raw, reason] of [
      ["67.355", "decimal place"],
      ["19.9", "from 20 to 400"],
      ["400.01", "from 20 to 400"],
      ["-67", "e.g."],
      ["1e2", "e.g."],
      ["67.3.1", "e.g."],
      ["sixty", "e.g."],
      ["67 3", "e.g."],
      [".5", "e.g."],
      ["", "Enter your weight"],
    ] as const) {
      const result = parseWeight(raw);
      expect(result.ok, raw).toBe(false);
      expect(!result.ok && result.message, raw).toContain(reason);
    }
  });

  it("height allows one decimal", () => {
    expect(parseDecimal("164.5", 1, 100, 250)).toEqual({ text: "164.5", value: 164.5 });
    expect(parseDecimal("164.55", 1, 100, 250)).toBe("decimals");
    expect(parseDecimal("99", 1, 100, 250)).toBe("range");
  });
});

describe("measurement form and dates (Europe/Prague)", () => {
  const today = "2026-11-02";

  it("defaults the date to today and accepts retroactive dates", () => {
    expect(parseWeightForm(form({ weightKg: "67,3" }), today)).toMatchObject({ ok: true, data: { measuredOn: today, weight: { text: "67.3" } } });
    expect(parseWeightForm(form({ weightKg: "68", measuredOn: "2025-06-01" }), today)).toMatchObject({ ok: true, data: { measuredOn: "2025-06-01" } });
  });

  it("rejects future and invalid dates, keeping the typed values", () => {
    const future = parseWeightForm(form({ weightKg: "67", measuredOn: "2026-11-03" }), today);
    expect(!future.ok && future.fieldErrors.measuredOn).toContain("future");
    expect(future.values).toEqual({ weightKg: "67", measuredOn: "2026-11-03" });
    const invalid = parseWeightForm(form({ weightKg: "67", measuredOn: "2026-02-30" }), today);
    expect(!invalid.ok && invalid.fieldErrors.measuredOn).toBeTruthy();
  });

  it("'today' is the Prague date, not the UTC date", () => {
    // 23:30 UTC on Nov 1 is already Nov 2 in Prague: a measurement dated Nov 2 is not in the future.
    const prague = todayInTimeZone("Europe/Prague", new Date("2026-11-01T23:30:00Z"));
    expect(prague).toBe("2026-11-02");
    expect(parseWeightForm(form({ weightKg: "67", measuredOn: "2026-11-02" }), prague).ok).toBe(true);
    expect(todayInTimeZone("UTC", new Date("2026-11-01T23:30:00Z"))).toBe("2026-11-01");
  });

  it("settings: height (cm, 1 decimal) and goal (kg, 2 decimals)", () => {
    expect(parseSettingsForm(form({ heightCm: "164", goalWeightKg: "55" }))).toMatchObject({ ok: true, data: { height: { text: "164" }, goal: { text: "55" } } });
    const bad = parseSettingsForm(form({ heightCm: "300", goalWeightKg: "5" }));
    expect(!bad.ok && Object.keys(bad.fieldErrors).sort()).toEqual(["goalWeightKg", "heightCm"]);
  });

  it("formats weights as entered", () => {
    expect(formatKg(67)).toBe("67.0");
    expect(formatKg(67.3)).toBe("67.3");
    expect(formatKg(67.35)).toBe("67.35");
    expect(formatKg(67.1)).toBe("67.1");
  });
});

describe("chart data: periods, ordering, geometry", () => {
  const today = "2026-11-02";
  const entry = (measuredOn: string, weightKg: number): WeightEntryView => ({ id: measuredOn, measuredOn, weightKg, bmi: calculateBmi(weightKg, 164) });
  const newestFirst = [entry("2026-11-01", 66.8), entry("2026-10-20", 67.4), entry("2026-08-15", 68.1), entry("2026-01-10", 70), entry("2025-06-01", 72)];

  it("period starts", () => {
    expect(periodStart("1m", today)).toBe("2026-10-02");
    expect(periodStart("3m", today)).toBe("2026-08-02");
    expect(periodStart("6m", today)).toBe("2026-05-02");
    expect(periodStart("1y", today)).toBe("2025-11-02");
    expect(periodStart("all", today)).toBeNull();
    expect(periodStart("1m", "2026-03-31")).toBe("2026-02-28");
    expect(parsePeriod("bogus")).toBe("3m");
  });

  it("filters by period and orders oldest first", () => {
    expect(entriesForPeriod(newestFirst, "1m", today).map((e) => e.measuredOn)).toEqual(["2026-10-20", "2026-11-01"]);
    expect(entriesForPeriod(newestFirst, "3m", today).map((e) => e.measuredOn)).toEqual(["2026-08-15", "2026-10-20", "2026-11-01"]);
    expect(entriesForPeriod(newestFirst, "all", today)).toHaveLength(5);
    expect(entriesForPeriod(newestFirst, "all", today)[0].measuredOn).toBe("2025-06-01");
  });

  it("empty state: no measurements → nothing to plot", () => {
    expect(entriesForPeriod([], "all", today)).toEqual([]);
    const chart = lineChartGeometry([], { from: "2026-10-02", to: today });
    expect(chart.dots).toEqual([]);
    expect(chart.path).toBe("");
  });

  it("places points proportionally to real dates and joins only recorded points", () => {
    const points = [
      { date: "2026-10-02", value: 68 },
      { date: "2026-10-12", value: 67 }, // 10 days later
      { date: "2026-11-01", value: 66 }, // 20 days later
    ];
    const chart = lineChartGeometry(points, { from: "2026-10-02", to: "2026-11-01" });
    expect(chart.dots).toHaveLength(3);
    const [a, b, c] = chart.dots;
    expect((b.x - a.x) / (c.x - b.x)).toBeCloseTo(0.5, 5); // gap of 10 days vs 20 days
    expect(chart.path.split(/[ML]/).filter(Boolean)).toHaveLength(3); // no fabricated points
    expect(a.y).toBeLessThan(c.y); // the heavier first point is drawn higher (smaller SVG y)
  });

  it("sorts unsorted input chronologically", () => {
    const chart = lineChartGeometry([{ date: "2026-11-01", value: 66 }, { date: "2026-10-01", value: 68 }]);
    expect(chart.dots.map((dot) => dot.date)).toEqual(["2026-10-01", "2026-11-01"]);
  });

  it("a single measurement is one dot without a line", () => {
    const chart = lineChartGeometry([{ date: "2026-10-20", value: 67 }], { from: "2026-10-02", to: today });
    expect(chart.dots).toHaveLength(1);
    expect(chart.path).toBe("");
  });

  it("shows the goal line only when it is near the data", () => {
    const near = lineChartGeometry([{ date: "2026-10-01", value: 58 }, { date: "2026-11-01", value: 57 }], { reference: 55 });
    expect(near.referenceY).not.toBeNull();
    expect(near.domain.min).toBeLessThanOrEqual(55);
    const far = lineChartGeometry([{ date: "2026-10-01", value: 90 }, { date: "2026-11-01", value: 89.5 }], { reference: 55 });
    expect(far.referenceY).toBeNull();
    expect(far.referenceOutside).toBe("below");
    expect(far.domain.min).toBeGreaterThan(80);
    // Realistic case: ~67 kg with a 55 kg goal keeps the line visible.
    const realistic = lineChartGeometry([{ date: "2026-10-01", value: 68.4 }, { date: "2026-11-01", value: 66.95 }], { reference: 55 });
    expect(realistic.referenceY).not.toBeNull();
    expect(realistic.referenceOutside).toBeNull();
  });
});
