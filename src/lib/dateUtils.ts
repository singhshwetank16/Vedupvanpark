/**
 * Indian Standard Time (IST, Asia/Kolkata, UTC+05:30) date helpers.
 * Ensures that tickets, passes, gate scans, and daily shift summaries
 * are ALWAYS calculated according to the Indian calendar date,
 * preventing UTC midnight cut-off bugs.
 */

// Returns today's date formatted as "YYYY-MM-DD" in Indian Standard Time (IST)
export const getTodayIstYmd = (): string => {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
};

// Converts any ISO timestamp string or Date object into "YYYY-MM-DD" in Indian Standard Time (IST)
export const getIstDateYmd = (dateInput?: string | Date | null): string => {
  if (!dateInput) return '';
  try {
    const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    if (isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
  } catch {
    return '';
  }
};

// Returns the exact start and end UTC ISO timestamps for a given IST day (YYYY-MM-DD)
// In IST (UTC+5:30):
// 00:00:00.000 IST = (prev day) 18:30:00.000 UTC
// 23:59:59.999 IST = (same day) 18:29:59.999 UTC
export const getIstDayUtcRange = (istYmd: string): { startUtcIso: string; endUtcIso: string } => {
  if (!istYmd || !istYmd.includes('-')) {
    const today = getTodayIstYmd();
    return getIstDayUtcRange(today);
  }
  const [y, m, d] = istYmd.split('-').map(Number);
  const startUtc = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0) - 5.5 * 3600 * 1000);
  const endUtc = new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999) - 5.5 * 3600 * 1000);
  return {
    startUtcIso: startUtc.toISOString(),
    endUtcIso: endUtc.toISOString(),
  };
};

// Checks if a given timestamp falls on a specific IST day
export const isSameIstDay = (timestamp?: string | null, targetIstYmd?: string): boolean => {
  if (!timestamp) return false;
  const target = targetIstYmd || getTodayIstYmd();
  return getIstDateYmd(timestamp) === target;
};
