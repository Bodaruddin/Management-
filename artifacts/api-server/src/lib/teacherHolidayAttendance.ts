import type { DataAdapter } from "./adapter.js";

const GENERATED_HOLIDAY_METHOD = "automatic_holiday";
const syncStates = new WeakMap<object, { fingerprint: string | null; promise: Promise<void> | null }>();
const dateFingerprints = new WeakMap<object, Map<string, string>>();
const SCHOOL_TIME_ZONE = process.env.SCHOOL_TIME_ZONE ?? "Asia/Kolkata";

function schoolDateToday(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SCHOOL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function isSundayDate(date: string): boolean {
  const parsed = new Date(`${date}T12:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(date)
    && !Number.isNaN(parsed.getTime())
    && parsed.getUTCDay() === 0;
}

function getSundaysThrough(today: string): string[] {
  const year = Number(today.slice(0, 4));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today) || !Number.isInteger(year)) return [];

  const end = new Date(`${today}T12:00:00Z`);
  if (Number.isNaN(end.getTime())) return [];

  const dates: string[] = [];
  const cursor = new Date(Date.UTC(year, 0, 1, 12));
  while (cursor <= end) {
    const date = cursor.toISOString().slice(0, 10);
    if (cursor.getUTCDay() === 0) dates.push(date);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

async function runSerialized(
  adapter: DataAdapter,
  work: (state: { fingerprint: string | null; promise: Promise<void> | null }) => Promise<void>,
): Promise<void> {
  const state = syncStates.get(adapter) ?? { fingerprint: null, promise: null };
  syncStates.set(adapter, state);
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

function generatedRows(date: string, teachers: any[]) {
  return teachers
    .filter((teacher) => String(teacher.id ?? ""))
    .map((teacher) => ({
      teacherId: String(teacher.id),
      teacherName: String(teacher.name ?? ""),
      date,
      status: "holiday",
      checkInAt: null,
      faceVerified: false,
      faceVerificationMethod: GENERATED_HOLIDAY_METHOD,
      note: "System — Sunday",
    }));
}

export async function syncTeacherSundayAttendance(
  adapter: DataAdapter,
  sundayHoliday: boolean,
  throughDate = schoolDateToday(),
  force = false,
): Promise<void> {
  await runSerialized(adapter, async (state) => {
    const dates = sundayHoliday ? getSundaysThrough(throughDate) : [];
    const teachers = await adapter.teachers.list();
    const fingerprint = JSON.stringify({
      sundayHoliday,
      dates,
      teachers: teachers
        .map((teacher: any) => [String(teacher.id ?? ""), String(teacher.name ?? "")])
        .sort(([a], [b]) => String(a).localeCompare(String(b))),
    });
    if (!force && state.fingerprint === fingerprint) return;

    state.fingerprint = null;
    await adapter.teacherAttendance.clearGeneratedHolidaysExcept(dates);
    const activeDates = new Set(dates);
    const knownDateFingerprints = dateFingerprints.get(adapter);
    if (knownDateFingerprints) {
      for (const date of knownDateFingerprints.keys()) {
        if (!activeDates.has(date)) knownDateFingerprints.delete(date);
      }
    }
    let nextDate = 0;
    const worker = async () => {
      while (nextDate < dates.length) {
        const date = dates[nextDate++];
        await adapter.teacherAttendance.reconcileGeneratedHolidays(date, generatedRows(date, teachers));
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, dates.length) }, () => worker()));
    state.fingerprint = fingerprint;
  });
}

export async function syncTeacherSundayAttendanceForDate(
  adapter: DataAdapter,
  date: string,
  sundayHoliday: boolean,
): Promise<void> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
  await runSerialized(adapter, async () => {
    if (!isSundayDate(date)) return;
    const teachers = sundayHoliday ? await adapter.teachers.list() : [];
    const fingerprint = JSON.stringify({
      sundayHoliday,
      teachers: teachers
        .map((teacher: any) => [String(teacher.id ?? ""), String(teacher.name ?? "")])
        .sort(([a], [b]) => String(a).localeCompare(String(b))),
    });
    const knownFingerprints = dateFingerprints.get(adapter) ?? new Map<string, string>();
    dateFingerprints.set(adapter, knownFingerprints);
    if (knownFingerprints.get(date) === fingerprint) return;
    await adapter.teacherAttendance.reconcileGeneratedHolidays(date, generatedRows(date, teachers));
    knownFingerprints.set(date, fingerprint);
  });
}