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

function getSyncState(adapter: DataAdapter): SyncState {
  const state = syncStates.get(adapter) ?? { fingerprint: null, promise: null };
  syncStates.set(adapter, state);
  return state;
}

async function runSerializedSync(
  adapter: DataAdapter,
  work: (state: SyncState) => Promise<void>,
): Promise<void> {
  const state = getSyncState(adapter);
  const previous = state.promise;
  const current = (previous ?? Promise.resolve())
    .catch(() => undefined)
    .then(() => work(state));
  state.promise = current;

  try {
    await current;
  } finally {
    if (state.promise === current) state.promise = null;
  }
}

function groupStudentsByClass(students: any[]): Map<string, any[]> {
  const byClass = new Map<string, any[]>();
  for (const student of students) {
    const classStudents = byClass.get(student.class) ?? [];
    classStudents.push(student);
    byClass.set(student.class, classStudents);
  }
  return byClass;
}

function buildGeneratedHolidayRecords(
  date: string,
  settings: StudentHolidaySettings,
  studentsByClass: Map<string, any[]>,
): any[] {
  const customHoliday = settings.holidays.find((holiday: any) => holiday.date === date);
  const sunday = settings.sundayHoliday && isSunday(date);
  if (!customHoliday && !sunday) return [];

  const holidayName = customHoliday?.name ?? (sunday ? "Sunday" : "School holiday");
  const records: any[] = [];
  for (const [cls, classStudents] of studentsByClass) {
    for (const student of classStudents) {
      records.push({
        studentId: student.id,
        studentName: student.name,
        class: cls,
        date,
        status: "holiday",
        takenBy: `System — ${holidayName}`,
      });
    }
  }
  return records;
}

async function reconcileDates(
  adapter: DataAdapter,
  dates: string[],
  settings: StudentHolidaySettings,
  students: any[],
): Promise<void> {
  if (!dates.length) return;

  const studentsByClass = groupStudentsByClass(students);
  let nextDate = 0;
  const worker = async () => {
    while (nextDate < dates.length) {
      const date = dates[nextDate++];
      const records = buildGeneratedHolidayRecords(date, settings, studentsByClass);
      await adapter.attendance.reconcileGeneratedHolidays(date, records);
    }
  };

  const workerCount = Math.min(4, dates.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
}

/**
 * Materialize holiday rows for the current school year and all configured
 * custom dates. This keeps attendance reports complete without requiring a
 * separate calendar join in every client.
 */
export async function syncStudentHolidayAttendance(adapter: DataAdapter): Promise<void> {
  await runSerializedSync(adapter, async (state) => {
    const settings = await getStudentHolidaySettings(adapter);
    const dates = new Set<string>(settings.holidays.map((holiday: any) => holiday.date));
    if (settings.sundayHoliday) {
      getCurrentYearSundayDates().forEach((date) => dates.add(date));
    }
    const dateList = Array.from(dates).sort();
    const students = (await adapter.students.list()).filter((student: any) => student.status !== "inactive");
    const fingerprint = JSON.stringify({
      dates: dateList,
      students: students
        .map((student: any) => [student.id, student.name, student.class])
        .sort(([a], [b]) => String(a).localeCompare(String(b))),
      holidays: settings.holidays
        .map((holiday: any) => [holiday.date, holiday.name])
        .sort(([a], [b]) => String(a).localeCompare(String(b))),
    });
    if (state.fingerprint === fingerprint) return;

    state.fingerprint = null;
    await adapter.attendance.clearGeneratedHolidaysExcept(dateList);
    await reconcileDates(adapter, dateList, settings, students);
    state.fingerprint = fingerprint;
  });
}

export async function syncStudentHolidayAttendanceForDates(
  adapter: DataAdapter,
  dates: string[],
): Promise<void> {
  const dateList = Array.from(new Set(dates.filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)))).sort();
  if (!dateList.length) return;

  await runSerializedSync(adapter, async (state) => {
    const settings = await getStudentHolidaySettings(adapter);
    const students = (await adapter.students.list()).filter((student: any) => student.status !== "inactive");
    await reconcileDates(adapter, dateList, settings, students);
  });
}
