import type { DataAdapter } from "./adapter.js";

export const STUDENT_SUNDAY_HOLIDAY_KEY = "student_attendance_sunday_holiday";

export type StudentHolidaySettings = {
  sundayHoliday: boolean;
  holidays: any[];
};

type SyncState = {
  fingerprint: string | null;
  promise: Promise<void> | null;
};

// Each active adapter gets its own sync state. This prevents multiple client
// requests during startup from rebuilding the same holiday rows concurrently,
// while still allowing a newly activated database to sync independently.
const syncStates = new WeakMap<object, SyncState>();

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function isSunday(date: string): boolean {
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.getUTCDay() === 0;
}

function getCurrentYearSundayDates(): string[] {
  const today = new Date();
  const start = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
  const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const dates: string[] = [];

  for (const cursor = start; cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const date = toDateString(cursor);
    if (isSunday(date)) dates.push(date);
  }
  return dates;
}

export async function getStudentHolidaySettings(adapter: DataAdapter): Promise<StudentHolidaySettings> {
  const [setting, holidays] = await Promise.all([
    adapter.appSettings.get(STUDENT_SUNDAY_HOLIDAY_KEY),
    adapter.teacherHolidays.list(),
  ]);

  return {
    sundayHoliday: setting?.value?.enabled !== false,
    holidays,
  };
}

export async function getStudentHolidayStatus(adapter: DataAdapter, date: string) {
  const settings = await getStudentHolidaySettings(adapter);
  const customHoliday = settings.holidays.find((holiday: any) => holiday.date === date);
  const sunday = isSunday(date);

  return {
    isHoliday: Boolean(customHoliday) || (settings.sundayHoliday && sunday),
    name: customHoliday?.name ?? (sunday ? "Sunday" : null),
    sunday,
    customHoliday: customHoliday ?? null,
  };
}

/**
 * Materialize holiday rows for the current school year and all configured
 * custom dates. This keeps attendance reports complete without requiring a
 * separate calendar join in every client.
 */
export async function syncStudentHolidayAttendance(adapter: DataAdapter): Promise<void> {
  const settings = await getStudentHolidaySettings(adapter);
  const dates = new Set<string>(settings.holidays.map((holiday: any) => holiday.date));
  if (settings.sundayHoliday) {
    getCurrentYearSundayDates().forEach((date) => dates.add(date));
  }
  const students = (await adapter.students.list()).filter((student: any) => student.status !== "inactive");
  const fingerprint = JSON.stringify({
    dates: Array.from(dates).sort(),
    students: students
      .map((student: any) => [student.id, student.name, student.class])
      .sort(([a], [b]) => String(a).localeCompare(String(b))),
    holidays: settings.holidays
      .map((holiday: any) => [holiday.date, holiday.name])
      .sort(([a], [b]) => String(a).localeCompare(String(b))),
  });
  const state = syncStates.get(adapter) ?? { fingerprint: null, promise: null };
  syncStates.set(adapter, state);
  if (state.fingerprint === fingerprint) return;
  if (state.promise) return state.promise;

  state.promise = (async () => {
    await adapter.attendance.clearGeneratedHolidaysExcept(Array.from(dates));
    if (!dates.size) return;

    const byClass = new Map<string, any[]>();
    for (const student of students) {
      const list = byClass.get(student.class) ?? [];
      list.push(student);
      byClass.set(student.class, list);
    }

    // These writes target different date/class pairs. Run them concurrently;
    // the PostgreSQL pool limits the actual database concurrency while
    // avoiding hundreds of round trips in series on Supabase.
    const writes: Array<() => Promise<unknown>> = [];
    for (const date of dates) {
      const holidayName = settings.holidays.find((holiday: any) => holiday.date === date)?.name
        ?? (isSunday(date) ? "Sunday" : "School holiday");
      for (const [cls, classStudents] of byClass) {
        const records = classStudents.map((student: any) => ({
          studentId: student.id,
          studentName: student.name,
          class: cls,
          date,
          status: "holiday",
          takenBy: `System — ${holidayName}`,
        }));
        writes.push(() => adapter.attendance.bulkUpsert(date, cls, records));
      }
    }

    // Keep a little headroom for the other bootstrap queries. Starting every
    // write at once would queue hundreds of transactions behind the pool and
    // make Supabase report "timeout exceeded when trying to connect".
    let nextWrite = 0;
    const worker = async () => {
      while (nextWrite < writes.length) {
        const write = writes[nextWrite++];
        await write();
      }
    };
    const workerCount = Math.min(4, writes.length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
  })();

  try {
    await state.promise;
    state.fingerprint = fingerprint;
  } catch (error) {
    state.fingerprint = null;
    throw error;
  } finally {
    state.promise = null;
  }
}