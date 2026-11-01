// BMI = weight (kg) / (height in metres)². Calculated on read, never stored.

export function calculateBmi(weightKg: number, heightCm: number): number | null {
  if (!Number.isFinite(weightKg) || !Number.isFinite(heightCm) || weightKg <= 0 || heightCm <= 0) return null;
  const heightM = heightCm / 100;
  return weightKg / (heightM * heightM);
}

/** Difference between a weight and the goal, rounded to 2 decimals to avoid float noise. */
export function goalDifference(weightKg: number, goalKg: number): number {
  return Math.round((weightKg - goalKg) * 100) / 100;
}
