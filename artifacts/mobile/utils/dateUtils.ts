/**
 * Extracts MM-DD from a date string in any common format:
 *   YYYY-MM-DD, YYYY/MM/DD  → MM-DD
 *   DD-MM-YYYY, DD/MM/YYYY  → MM-DD
 *   MM-DD-YYYY, MM/DD/YYYY  → MM-DD  (US style, ambiguous but supported)
 * Returns null if the string can't be parsed.
 */
export function extractMMDD(dob: string): string | null {
  if (!dob) return null;

  const parts = dob.trim().split(/[-\/]/);
  if (parts.length !== 3) return null;

  const [a, b, c] = parts.map(Number);
  if ([a, b, c].some(isNaN)) return null;

  // YYYY-MM-DD  (a >= 1000 → year first)
  if (a >= 1000) {
    const month = b, day = c;
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  // DD-MM-YYYY  (c >= 1000 → year last, b is month)
  if (c >= 1000) {
    const day = a, month = b;
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  return null;
}

/** Returns today's MM-DD string using local time (avoids UTC-shift bugs). */
export function todayMMDD(): string {
  const now = new Date();
  return `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** Returns true if the given dateOfBirth string falls on today (any common format). */
export function isBirthdayToday(dob: string | undefined): boolean {
  if (!dob) return false;
  return extractMMDD(dob) === todayMMDD();
}

/**
 * Returns the number of days until the next birthday (0 = today).
 * Returns Infinity if the date cannot be parsed.
 */
export function daysUntilBirthday(dob: string | undefined): number {
  if (!dob) return Infinity;
  const mmdd = extractMMDD(dob);
  if (!mmdd) return Infinity;
  const [month, day] = mmdd.split('-').map(Number);
  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let bday = new Date(now.getFullYear(), month - 1, day);
  if (bday < todayMidnight) bday = new Date(now.getFullYear() + 1, month - 1, day);
  return Math.round((bday.getTime() - todayMidnight.getTime()) / 86400000);
}
