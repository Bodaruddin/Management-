import type { DataAdapter } from "./adapter.js";

export const STUDENT_SUNDAY_HOLIDAY_KEY = "student_attendance_sunday_holiday";

export type StudentHolidaySettings = {
  sundayHoliday: boolean;
  holidays: any[];
};

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
  await adapter.attendance.clearGeneratedHolidaysExcept(Array.from(dates));
  if (!dates.size) return;

  const students = (await adapter.students.list()).filter((student: any) => student.status !== "inactive");
  const byClass = new Map<string, any[]>();
  for (const student of students) {
    const list = byClass.get(student.class) ?? [];
    list.push(student);
    byClass.set(student.class, list);
  }

  for (const date of dates) {
    const holidayName = settings.holidays.find((holiday: any) => holiday.date === date)?.name
      ?? (isSunday(date) ? "Sunday" : "School holiday");
    for (const [cls, classStudents] of byClass) {
      await adapter.attendance.bulkUpsert(date, cls, classStudents.map((student: any) => ({
        studentId: student.id,
        studentName: student.name,
        class: cls,
        date,
        status: "holiday",
        takenBy: `System — ${holidayName}`,
      })));
    }
  }
}