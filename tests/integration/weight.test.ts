// Weight Tracker integration tests against the shared Neon database (DATABASE_URL).
// Safety rules:
// - Only measurements dated in the year 2001 are created (real data never uses that year);
//   the suite aborts if any 2001 measurement already exists.
// - Cleanup deletes only ids created here AND dated in 2001.
// - Weight settings are never modified here (only an unauthorized attempt, which is rejected
//   before any database access). Settings updates are tested on an isolated local database.
// - All real measurements, the settings row and all Task Manager tables are fingerprinted
//   before and after and must be unchanged.

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ allowed: true }));

vi.mock("@/lib/dal", () => ({
  requireUser: vi.fn(async () => {
    if (!auth.allowed) throw new Error("NEXT_REDIRECT:/login");
    return { email: "owner@example.com", name: "Owner", image: null };
  }),
  getAuthorizedUser: vi.fn(async () => (auth.allowed ? { email: "owner@example.com", name: "Owner", image: null } : null)),
}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("next/server", () => ({ connection: vi.fn(async () => undefined) }));

import { createWeightEntry, deleteWeightEntry, updateWeightEntry, updateWeightSettings } from "@/app/weight/actions";
import { prisma } from "@/lib/prisma";
import { getToday } from "@/lib/tasks/queries";
import { calculateBmi } from "@/lib/weight/bmi";
import { getLatestWeight, getWeightOverview, getWeightSettings } from "@/lib/weight/queries";

const IDLE = { status: "idle" } as const;
const YEAR_FROM = new Date("2001-01-01T00:00:00Z");
const YEAR_TO = new Date("2001-12-31T00:00:00Z");
const created = new Set<string>();
let today = "";
let before = "";

function fd(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

/** Real data outside the test year + settings + Task Manager tables. */
async function protectedSnapshot(): Promise<string> {
  const [row] = await prisma.$queryRaw<{ entries: string; settings: string; tasks: string }[]>`
    select
      (select md5(coalesce(string_agg(w::text, '|' order by w.id), '')) || ':' || count(*)
         from weight_entries w where w.measured_on not between '2001-01-01' and '2001-12-31') as entries,
      (select md5(coalesce(string_agg(s::text, '|'), '')) from weight_settings s) as settings,
      (select md5(
         coalesce((select string_agg(t::text, '|' order by t.id) from tasks t), '') ||
         coalesce((select string_agg(r::text, '|' order by r.id) from recurrence_rules r), '') ||
         coalesce((select string_agg(o::text, '|' order by o.id) from task_occurrences o), '') ||
         coalesce((select string_agg(e::text, '|' order by e.id) from completion_events e), '') ||
         coalesce((select string_agg(a::text, '|' order by a.id) from activity_entries a), '') ||
         coalesce((select string_agg(c::text, '|' order by c.id) from categories c), ''))) as tasks`;
  return `${row.entries}/${row.settings}/${row.tasks}`;
}

const testEntries = () =>
  prisma.weightEntry.findMany({ where: { measuredOn: { gte: YEAR_FROM, lte: YEAR_TO } }, orderBy: { measuredOn: "asc" } });

async function track() {
  for (const entry of await testEntries()) created.add(entry.id);
}

beforeAll(async () => {
  auth.allowed = true;
  const existing = await prisma.weightEntry.count({ where: { measuredOn: { gte: YEAR_FROM, lte: YEAR_TO } } });
  if (existing > 0) throw new Error(`Refusing to run: ${existing} measurement(s) dated 2001 already exist.`);
  today = await getToday();
  before = await protectedSnapshot();
});

afterAll(async () => {
  auth.allowed = true;
  await track();
  if (created.size > 0) {
    await prisma.weightEntry.deleteMany({ where: { id: { in: [...created] }, measuredOn: { gte: YEAR_FROM, lte: YEAR_TO } } });
  }
  const leftovers = await prisma.weightEntry.count({ where: { measuredOn: { gte: YEAR_FROM, lte: YEAR_TO } } });
  const after = await protectedSnapshot();
  await prisma.$disconnect();
  expect(leftovers).toBe(0);
  expect(after).toBe(before);
});

describe("authorization", () => {
  it("every action and query redirects to /login when not signed in, and nothing changes", async () => {
    auth.allowed = false;
    try {
      await expect(createWeightEntry(IDLE, fd({ weightKg: "67.3", measuredOn: "2001-01-15" }))).rejects.toThrow("NEXT_REDIRECT:/login");
      await expect(updateWeightEntry(IDLE, fd({ id: "11111111-1111-4111-8111-111111111111", weightKg: "60", measuredOn: "2001-01-15" }))).rejects.toThrow("NEXT_REDIRECT:/login");
      await expect(deleteWeightEntry(IDLE, fd({ id: "11111111-1111-4111-8111-111111111111" }))).rejects.toThrow("NEXT_REDIRECT:/login");
      await expect(updateWeightSettings(IDLE, fd({ heightCm: "180", goalWeightKg: "80" }))).rejects.toThrow("NEXT_REDIRECT:/login");
      await expect(getWeightOverview("all", today)).rejects.toThrow("NEXT_REDIRECT:/login");
      await expect(getWeightSettings()).rejects.toThrow("NEXT_REDIRECT:/login");
      await expect(getLatestWeight()).rejects.toThrow("NEXT_REDIRECT:/login");
    } finally {
      auth.allowed = true;
    }
    expect(await testEntries()).toHaveLength(0);
    expect(await protectedSnapshot()).toBe(before);
  });
});

describe("measurements", () => {
  it("creates a decimal measurement (comma accepted) and rejects invalid input without saving", async () => {
    expect(await createWeightEntry(IDLE, fd({ weightKg: "67,3", measuredOn: "2001-03-01" }))).toMatchObject({ status: "success" });
    await track();
    expect(await createWeightEntry(IDLE, fd({ weightKg: "abc", measuredOn: "2001-03-02" }))).toMatchObject({ status: "error" });
    expect(await createWeightEntry(IDLE, fd({ weightKg: "67.355", measuredOn: "2001-03-02" }))).toMatchObject({ status: "error" });
    const rows = await testEntries();
    expect(rows).toHaveLength(1);
    expect(rows[0].weightKg.toString()).toBe("67.3");
  });

  it("duplicate date: nothing is overwritten until the user explicitly replaces", async () => {
    const duplicate = await createWeightEntry(IDLE, fd({ weightKg: "66.9", measuredOn: "2001-03-01" }));
    expect(duplicate).toMatchObject({ status: "duplicate", existingKg: 67.3, values: { weightKg: "66.9", measuredOn: "2001-03-01" } });
    let rows = await testEntries();
    expect(rows).toHaveLength(1);
    expect(rows[0].weightKg.toString()).toBe("67.3");

    const id = rows[0].id;
    expect(await createWeightEntry(IDLE, fd({ weightKg: "66.9", measuredOn: "2001-03-01", replace: "1" }))).toMatchObject({ status: "success" });
    rows = await testEntries();
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(id); // replaced in place
    expect(rows[0].weightKg.toString()).toBe("66.9");
  });

  it("edits a measurement; moving it onto an occupied date is rejected", async () => {
    expect(await createWeightEntry(IDLE, fd({ weightKg: "68.25", measuredOn: "2001-03-05" }))).toMatchObject({ status: "success" });
    await track();
    const entry = (await testEntries()).find((row) => row.measuredOn.toISOString().startsWith("2001-03-05"))!;

    const clash = await updateWeightEntry(IDLE, fd({ id: entry.id, weightKg: "68.25", measuredOn: "2001-03-01" }));
    expect(clash).toMatchObject({ status: "error", fieldErrors: { measuredOn: expect.stringContaining("already a measurement") } });

    expect(await updateWeightEntry(IDLE, fd({ id: entry.id, weightKg: "68.2", measuredOn: "2001-03-06" }))).toMatchObject({ status: "success" });
    const updated = await prisma.weightEntry.findUniqueOrThrow({ where: { id: entry.id } });
    expect(updated.measuredOn.toISOString().slice(0, 10)).toBe("2001-03-06");
    expect(updated.weightKg.toString()).toBe("68.2");

    expect(await updateWeightEntry(IDLE, fd({ id: entry.id, weightKg: "68.2", measuredOn: "2999-01-01" }))).toMatchObject({ status: "error" });
  });

  it("overview: newest-first history, BMI from the current height, chart oldest first, periods", async () => {
    const settings = await getWeightSettings();
    const overview = await getWeightOverview("all", today);
    const ours = overview.history.filter((entry) => entry.measuredOn.startsWith("2001-"));
    expect(ours.map((entry) => entry.measuredOn)).toEqual(["2001-03-06", "2001-03-01"]);
    for (const entry of ours) expect(entry.bmi).toBeCloseTo(calculateBmi(entry.weightKg, settings.heightCm)!, 10);
    const dates = overview.chartEntries.map((entry) => entry.measuredOn);
    expect(dates).toEqual([...dates].sort());
    expect(dates.indexOf("2001-03-01")).toBeLessThan(dates.indexOf("2001-03-06"));

    const lastYear = await getWeightOverview("1y", today);
    expect(lastYear.chartEntries.some((entry) => entry.measuredOn.startsWith("2001-"))).toBe(false);
  });

  it("deletes a measurement (idempotent)", async () => {
    const entry = (await testEntries()).find((row) => row.measuredOn.toISOString().startsWith("2001-03-06"))!;
    expect(await deleteWeightEntry(IDLE, fd({ id: entry.id }))).toMatchObject({ status: "success" });
    expect(await prisma.weightEntry.count({ where: { id: entry.id } })).toBe(0);
    expect(await deleteWeightEntry(IDLE, fd({ id: entry.id }))).toMatchObject({ status: "success" });
    expect(await deleteWeightEntry(IDLE, fd({ id: "not-a-uuid" }))).toMatchObject({ status: "error" });
  });
});
