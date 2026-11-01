// Settings updates and BMI recalculation, run ONLY against an isolated local database
// (e.g. a Docker container restored from a backup). vitest.local.config.mts refuses any
// DATABASE_URL that is not on localhost, so the shared Neon settings are never touched.

import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/dal", () => ({
  requireUser: vi.fn(async () => ({ email: "owner@example.com", name: "Owner", image: null })),
  getAuthorizedUser: vi.fn(async () => ({ email: "owner@example.com", name: "Owner", image: null })),
}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("next/server", () => ({ connection: vi.fn(async () => undefined) }));

import { createWeightEntry, updateWeightSettings } from "@/app/weight/actions";
import { prisma } from "@/lib/prisma";
import { getToday } from "@/lib/tasks/queries";
import { getWeightOverview, getWeightSettings } from "@/lib/weight/queries";
import { formatBmi } from "@/lib/weight/shared";

const IDLE = { status: "idle" } as const;
const fd = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
};

afterAll(async () => {
  await prisma.$disconnect();
});

describe("weight settings (isolated local database)", () => {
  it("starts with the migration's initial settings: 164 cm, 55 kg", async () => {
    expect(await getWeightSettings()).toEqual({ heightCm: 164, goalWeightKg: 55 });
  });

  it("changing the height recalculates every historical BMI; nothing is stored", async () => {
    const today = await getToday();
    expect(await createWeightEntry(IDLE, fd({ weightKg: "67.3", measuredOn: "2026-10-01" }))).toMatchObject({ status: "success" });
    expect(await createWeightEntry(IDLE, fd({ weightKg: "66.1", measuredOn: "2026-10-15" }))).toMatchObject({ status: "success" });

    let overview = await getWeightOverview("all", today);
    expect(overview.history.map((entry) => formatBmi(entry.bmi))).toEqual(["24.6", "25.0"]);
    expect(overview.difference).toBe(11.1);

    expect(await updateWeightSettings(IDLE, fd({ heightCm: "170", goalWeightKg: "60,5" }))).toMatchObject({ status: "success" });
    expect(await getWeightSettings()).toEqual({ heightCm: 170, goalWeightKg: 60.5 });
    overview = await getWeightOverview("all", today);
    expect(overview.history.map((entry) => formatBmi(entry.bmi))).toEqual(["22.9", "23.3"]);
    expect(overview.difference).toBe(5.6);

    const columns = await prisma.$queryRaw<{ column_name: string }[]>`
      select column_name from information_schema.columns where table_name = 'weight_entries'`;
    expect(columns.map((column) => column.column_name)).not.toContain("bmi");
  });

  it("rejects invalid settings without changing them", async () => {
    const result = await updateWeightSettings(IDLE, fd({ heightCm: "99", goalWeightKg: "55.555" }));
    expect(result).toMatchObject({ status: "error", fieldErrors: { heightCm: expect.any(String), goalWeightKg: expect.any(String) } });
    expect(await getWeightSettings()).toEqual({ heightCm: 170, goalWeightKg: 60.5 });
  });

  it("there is still exactly one settings row", async () => {
    expect(await prisma.weightSettings.count()).toBe(1);
  });
});
