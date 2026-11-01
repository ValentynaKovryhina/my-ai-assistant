// The app's scheduling time zone. Single-user app: an explicit zone (default Europe/Prague)
// instead of the server's zone (UTC on Vercel) or a zone guessed from the visitor's IP.
import { todayInTimeZone } from "./dates";

export const DEFAULT_TIME_ZONE = "Europe/Prague";

/** Returns the zone if Intl knows it, otherwise the default. */
export function resolveTimeZone(value: string | undefined | null): string {
  const zone = value?.trim();
  if (!zone) return DEFAULT_TIME_ZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return zone;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

export const APP_TIME_ZONE = resolveTimeZone(process.env.APP_TIME_ZONE);

/** Calendar date of an instant in the app time zone. */
export function dateInAppZone(instant: Date, timeZone = APP_TIME_ZONE): string {
  return todayInTimeZone(timeZone, instant);
}
