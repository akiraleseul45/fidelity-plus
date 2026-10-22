/**
 * Timezone-aware date helpers for the booking engine.
 *
 * Availability is stored as local wall-clock minutes (minutes from midnight)
 * and ISO weekdays (1=Mon … 7=Sun). Bookings are stored as absolute epoch ms.
 * These helpers convert between the two for an arbitrary IANA timezone,
 * accounting for DST via Intl (no external dependency).
 */

// Offset (ms) of `timeZone` at the given instant: (local wall time) − (UTC).
function tzOffsetMs(utcMs, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = dtf.formatToParts(new Date(utcMs));
  const map = {};
  for (const p of parts) map[p.type] = p.value;
  let hour = parseInt(map.hour, 10);
  if (hour === 24) hour = 0; // some engines render midnight as 24
  const asIfUTC = Date.UTC(
    +map.year,
    +map.month - 1,
    +map.day,
    hour,
    +map.minute,
    +map.second,
  );
  return asIfUTC - utcMs;
}

// Convert a local wall-clock (dateStr 'YYYY-MM-DD' + minutes-from-midnight) in
// `timeZone` to an absolute epoch ms. Resolves the offset at the target instant
// (one correction pass handles DST boundaries at slot granularity).
function localToUtcMs(dateStr, minutes, timeZone) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const hh = Math.floor(minutes / 60);
  const mm = minutes % 60;
  const guess = Date.UTC(y, m - 1, d, hh, mm, 0);
  const offset = tzOffsetMs(guess, timeZone);
  const corrected = guess - offset;
  // Re-check once in case the first guess landed on the wrong side of a DST shift.
  const offset2 = tzOffsetMs(corrected, timeZone);
  return offset === offset2 ? corrected : guess - offset2;
}

// The current local date ('YYYY-MM-DD') in `timeZone`.
function todayStr(timeZone, now = Date.now()) {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return dtf.format(new Date(now)); // en-CA → YYYY-MM-DD
}

// ISO weekday (1=Mon … 7=Sun) for a 'YYYY-MM-DD' string.
function isoWeekday(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun … 6=Sat
  return ((dow + 6) % 7) + 1;
}

// 'YYYY-MM-DD' that is `n` days after another such string.
function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d) + n * 86400000;
  const dt = new Date(t);
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${dt.getUTCFullYear()}-${mm}-${dd}`;
}

// Validate a 'YYYY-MM-DD' string (format + real calendar date).
function isValidDateStr(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

// 'HH:MM' label from minutes-from-midnight.
function minutesToLabel(minutes) {
  const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
  const mm = String(minutes % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

module.exports = {
  tzOffsetMs,
  localToUtcMs,
  todayStr,
  isoWeekday,
  addDays,
  isValidDateStr,
  minutesToLabel,
};
