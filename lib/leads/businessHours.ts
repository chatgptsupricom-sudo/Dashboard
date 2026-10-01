// Venezuela is UTC-4 (no DST)
const VEN_OFFSET_MS = -4 * 60 * 60 * 1000;

const START_HOUR = 8;  // 8am
const END_HOUR = 17;   // 5pm

function toVen(date: Date): Date {
  return new Date(date.getTime() + VEN_OFFSET_MS);
}

// Given a UTC date, return the earliest moment (in Venezuela local as a shifted Date)
// from which the business hours counter should start.
function effectiveLocalStart(utc: Date): Date {
  const local = toVen(utc);
  const day = local.getUTCDay(); // 0=Sun … 6=Sat (in shifted representation)
  const h = local.getUTCHours();
  const m = local.getUTCMinutes();
  const mins = h * 60 + m;

  const result = new Date(local.getTime());
  result.setUTCSeconds(0, 0);

  if (day === 0) {
    // Sunday → Monday 8am
    result.setUTCDate(result.getUTCDate() + 1);
    result.setUTCHours(START_HOUR, 0, 0, 0);
  } else if (day === 6) {
    // Saturday → Monday 8am
    result.setUTCDate(result.getUTCDate() + 2);
    result.setUTCHours(START_HOUR, 0, 0, 0);
  } else if (mins < START_HOUR * 60) {
    // Before 8am → 8am same day
    result.setUTCHours(START_HOUR, 0, 0, 0);
  } else if (mins >= END_HOUR * 60) {
    // After 5pm → 8am next weekday
    const daysAhead = day === 5 ? 3 : 1; // Friday → Monday
    result.setUTCDate(result.getUTCDate() + daysAhead);
    result.setUTCHours(START_HOUR, 0, 0, 0);
  }
  // Within 8am–5pm: use as-is

  return result;
}

/**
 * Returns the number of business-hours minutes elapsed between two UTC dates.
 * Business hours: Monday–Friday, 8:00am–5:00pm Venezuela time (UTC-4).
 * If `desde` falls outside business hours, counting starts from the next
 * business hour opening.
 */
export function minutosLaborales(desde: Date, hasta: Date): number {
  const localHasta = toVen(hasta);
  let current = effectiveLocalStart(desde);

  if (current >= localHasta) return 0;

  let total = 0;
  let guard = 0;

  while (current < localHasta && guard++ < 400) {
    const day = current.getUTCDay();

    // Safety: skip weekends
    if (day === 0 || day === 6) {
      const jump = day === 6 ? 2 : 1;
      current.setUTCDate(current.getUTCDate() + jump);
      current.setUTCHours(START_HOUR, 0, 0, 0);
      continue;
    }

    const dayEnd = new Date(current.getTime());
    dayEnd.setUTCHours(END_HOUR, 0, 0, 0);

    const periodEnd = localHasta < dayEnd ? localHasta : dayEnd;
    if (current < periodEnd) {
      total += (periodEnd.getTime() - current.getTime()) / 60000;
    }

    // Advance to next business day 8am
    const daysAhead = day === 5 ? 3 : 1;
    current = new Date(dayEnd.getTime());
    current.setUTCDate(current.getUTCDate() + daysAhead);
    current.setUTCHours(START_HOUR, 0, 0, 0);
  }

  return Math.round(total);
}
