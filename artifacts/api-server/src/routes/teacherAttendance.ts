import { Router, type Request, type Response } from "express";
import { getAdapter } from "../lib/dbManager.js";
import { createFaceTemplate, faceMatchesAny } from "../lib/faceTemplate.js";
import { bearerToken, findAuthSession } from "../lib/authSessions.js";
import {
  isSundayDate,
  syncTeacherSundayAttendance,
  syncTeacherSundayAttendanceForDate,
} from "../lib/teacherHolidayAttendance.js";

const router = Router();
const SETTINGS_KEY = "teacher_attendance_settings";
const FACE_PROFILES_KEY = "teacher_face_profiles";
const FACE_PROFILE_KEY_PREFIX = "teacher_face_profile:";
const SCHOOL_TIME_ZONE = process.env.SCHOOL_TIME_ZONE ?? "Asia/Kolkata";
const TIME_SETTING_KEYS = ["checkInStart", "checkInEnd", "checkOutStart", "checkOutEnd"] as const;

const DEFAULT_SETTINGS = {
  schoolLatitude: null as number | null,
  schoolLongitude: null as number | null,
  radiusMeters: 150,
  checkInStart: "08:00",
  checkInEnd: "09:30",
  checkOutStart: "15:00",
  checkOutEnd: "18:00",
  requireFaceVerification: true,
  allowLateCheckIn: false,
  sundayHoliday: true,
  workingDaysPerMonth: 26,
  lateGraceMinutes: 0,
  lateDeductionAmount: 0,
  deductionType: "daily_rate" as "daily_rate" | "fixed",
};

function asDate(value: unknown): string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value : new Intl.DateTimeFormat("en-CA", {
      timeZone: SCHOOL_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date());
}

function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function normalizeTime(value: unknown): string | null {
  const normalized = String(value ?? "").trim().toUpperCase().replace(/\s+/g, " ");
  const twelveHour = normalized.match(/^(\d{1,2})(?::([0-5]\d))?\s*(AM|PM)$/);
  if (twelveHour) {
    const hour = Number(twelveHour[1]);
    if (hour < 1 || hour > 12) return null;
    const minute = twelveHour[2] ?? "00";
    const hour24 = (hour % 12) + (twelveHour[3] === "PM" ? 12 : 0);
    return `${String(hour24).padStart(2, "0")}:${minute}`;
  }

  const twentyFourHour = normalized.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  return twentyFourHour ? `${twentyFourHour[1]}:${twentyFourHour[2]}` : null;
}

function currentTimeMinutes(): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SCHOOL_TIME_ZONE, hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

function isValidCoordinate(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function distanceInMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const radius = 6371000;
  const toRadians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * radius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function dateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${startDate}T12:00:00Z`);
  const end = new Date(`${endDate}T12:00:00Z`);
  while (cursor <= end && dates.length < 366) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

async function getSettings() {
  const saved = await getAdapter().appSettings.get(SETTINGS_KEY);
  let savedValue: unknown = saved?.value;
  if (typeof savedValue === "string") {
    try {
      savedValue = JSON.parse(savedValue);
    } catch {
      savedValue = {};
    }
  }
  const settings = {
    ...DEFAULT_SETTINGS,
    ...(savedValue && typeof savedValue === "object" ? savedValue : {}),
  } as typeof DEFAULT_SETTINGS & Record<string, unknown>;

  // Normalize settings written by older clients that accepted 12-hour values.
  // Invalid legacy values fall back to the safe defaults instead of making the
  // whole attendance window unusable.
  for (const key of TIME_SETTING_KEYS) {
    settings[key] = normalizeTime(settings[key]) ?? DEFAULT_SETTINGS[key];
  }
  settings.sundayHoliday = settings.sundayHoliday !== false;
  return settings;
}

async function getFaceProfiles(): Promise<Record<string, string>> {
  const saved = await getAdapter().appSettings.get(FACE_PROFILES_KEY);
  if (!saved?.value) return {};

  // Older database adapters may return JSONB settings as a serialized
  // string. Normalize both forms so an existing profile is not lost or
  // overwritten when a teacher enrolls from a different client.
  let value: unknown = saved.value;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return {};
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] =>
      typeof entry[0] === "string"
      && typeof entry[1] === "string"
      && (entry[1].startsWith("v1:") || entry[1].startsWith("v2:") || entry[1].startsWith("v3:")),
    ),
  );
}

function faceProfileKey(teacherId: string): string {
  return `${FACE_PROFILE_KEY_PREFIX}${encodeURIComponent(teacherId)}`;
}

function readStoredFaceTemplate(value: unknown): string | null {
  if (typeof value === "string") {
    if (value.startsWith("v1:") || value.startsWith("v2:") || value.startsWith("v3:")) return value;
    try {
      return readStoredFaceTemplate(JSON.parse(value));
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const template = (value as { template?: unknown }).template;
  return typeof template === "string"
    && (template.startsWith("v1:") || template.startsWith("v2:") || template.startsWith("v3:"))
    ? template
    : null;
}

async function getFaceProfile(teacherId: string): Promise<string | null> {
  // New records are isolated per teacher, so two enrollments cannot
  // overwrite each other. Fall back to the original shared record for
  // profiles created before this storage format was introduced.
  const individual = await getAdapter().appSettings.get(faceProfileKey(teacherId));
  return readStoredFaceTemplate(individual?.value) ?? (await getFaceProfiles())[teacherId] ?? null;
}

async function saveFaceProfile(teacherId: string, template: string): Promise<void> {
  await getAdapter().appSettings.set(faceProfileKey(teacherId), {
    teacherId,
    template,
    enrolledAt: new Date().toISOString(),
    method: "camera_face_enrollment",
  });
}

function getFaceImages(body: any): string[] {
  const samples = Array.isArray(body?.faceSamplesBase64)
    ? body.faceSamplesBase64
    : [body?.faceImageBase64];
  return samples.filter((sample: unknown): sample is string =>
    typeof sample === "string" && sample.trim().length > 0,
  ).slice(0, 5);
}

async function getTeacherById(teacherId: string): Promise<any | null> {
  const teachers = await getAdapter().teachers.list();
  return teachers.find((teacher: any) => String(teacher.id) === teacherId) ?? null;
}

async function requireFacelessAttendancePermission(
  req: Request,
  res: Response,
  teacherId: string,
): Promise<any | null> {
  const session = await findAuthSession(bearerToken(req.get("authorization")));
  if (!session) {
    res.status(401).json({ error: "A valid teacher session is required for face-free attendance" });
    return null;
  }
  if (session.role !== "teacher" || session.userId !== teacherId) {
    res.status(403).json({ error: "You can only record attendance for your own teacher account" });
    return null;
  }

  const teacher = await getTeacherById(teacherId);
  if (!teacher) {
    res.status(404).json({ error: "Teacher not found" });
    return null;
  }
  if (teacher.permissions?.facelessAttendance !== true) {
    res.status(403).json({ error: "An administrator has not enabled face-free attendance for your account" });
    return null;
  }
  return teacher;
}

async function requireTeacherAttendanceSession(req: Request, res: Response) {
  const session = await findAuthSession(bearerToken(req.get("authorization")));
  if (!session) {
    res.status(401).json({ error: "A valid teacher session is required" });
    return null;
  }
  if (session.role !== "teacher") {
    res.status(403).json({ error: "Only teachers can manage their automatic checkout" });
    return null;
  }
  return session;
}

function toIsoTimestamp(value: unknown): string | null {
  const date = value instanceof Date ? value : new Date(String(value ?? ""));
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function hasFaceReEnrollmentPermission(teacher: any): boolean {
  return teacher?.permissions?.reEnrollFace === true;
}

async function verifyFace(teacherId: string, images: string[]) {
  const existing = await getFaceProfile(teacherId);
  if (!existing) {
    throw new Error("Face verification is not set up yet. Complete face setup before checking attendance.");
  }
  const result = faceMatchesAny(existing, images);
  if (!result.matched) {
    throw new Error("Face did not match the enrolled teacher. Please look directly at the camera and try again.");
  }
  return { method: "camera_face_match", score: result.score };
}


let absenceSweepInProgress = false;
let autoCheckoutSweepInProgress = false;

/** Mark teachers absent after the configured attendance cutoff.
 *  This is intentionally server-side so it runs even when a teacher never opens the app.
 *  When late check-in is disabled, the cutoff is the check-in closing time. If late
 *  check-in is enabled, keep the window open until check-out closes so late teachers
 *  can still record a late arrival.
 */
export async function markMissedTeacherAttendance() {
  const date = asDate(undefined);
  if (absenceSweepInProgress) return { date, created: 0, skipped: true, reason: "in_progress" };
  absenceSweepInProgress = true;
  try {
    const settings = await getSettings();
    const adapter = getAdapter();
    await syncTeacherSundayAttendanceForDate(adapter, date, settings.sundayHoliday !== false);
    const absenceCutoff = settings.allowLateCheckIn ? settings.checkOutEnd : settings.checkInEnd;
    const absenceCutoffLabel = settings.allowLateCheckIn ? "check-out" : "check-in";
    if (currentTimeMinutes() < timeToMinutes(absenceCutoff)) {
      return { date, created: 0, skipped: true, reason: `before_${absenceCutoffLabel}_end` };
    }

    const weekday = new Date(date + "T12:00:00Z").getUTCDay();
    if (weekday === 0 && settings.sundayHoliday) {
      return { date, created: 0, skipped: true, reason: "sunday_holiday" };
    }
    if (weekday === 6) {
      return { date, created: 0, skipped: true, reason: "weekend" };
    }

    const [teachers, records, leaves, holidays] = await Promise.all([
      adapter.teachers.list(),
      adapter.teacherAttendance.list({ month: date.slice(0, 7) }),
      adapter.teacherLeaveApplications.list({ status: "approved" }),
      adapter.teacherHolidays.list(),
    ]);
    if ((holidays as any[]).some((holiday) => String(holiday.date) === date)) {
      return { date, created: 0, skipped: true, reason: "holiday" };
    }

    const existing = new Set((records as any[]).map((record) => String(record.teacherId) + ":" + String(record.date)));
    const leaveDatesByTeacher = new Map<string, Set<string>>();
    for (const leave of leaves as any[]) {
      const teacherId = String(leave.teacherId ?? "");
      if (!teacherId) continue;
      const dates = leaveDatesByTeacher.get(teacherId) ?? new Set<string>();
      for (const leaveDate of dateRange(String(leave.startDate ?? ""), String(leave.endDate ?? ""))) dates.add(leaveDate);
      leaveDatesByTeacher.set(teacherId, dates);
    }

    let created = 0;
    for (const teacher of teachers as any[]) {
      const teacherId = String(teacher.id ?? "");
      if (!teacherId || leaveDatesByTeacher.get(teacherId)?.has(date)) continue;
      const key = teacherId + ":" + date;
      if (existing.has(key)) continue;
      const result = await adapter.teacherAttendance.createIfAbsent(teacherId, date, {
        teacherName: teacher.name,
        status: "absent",
        checkInAt: null,
        faceVerified: false,
        faceVerificationMethod: "automatic_absence",
        note: `Automatically marked absent after ${absenceCutoffLabel} time (${absenceCutoff})`,
      });
      if (result.created) {
        created += 1;
        existing.add(key);
      }
    }
    return { date, created, skipped: false };
  } finally {
    absenceSweepInProgress = false;
  }
}

/** Close opted-in open attendance after the checkout window, using the final
 *  server-verified GPS point received inside the school geofence.
 */
export async function markForgottenTeacherCheckouts() {
  const date = asDate(undefined);
  if (autoCheckoutSweepInProgress) {
    return { date, closed: 0, skipped: true, reason: "in_progress" };
  }
  autoCheckoutSweepInProgress = true;
  try {
    const settings = await getSettings();
    const fallbackMinute = Math.min(1439, timeToMinutes(settings.checkOutEnd) + 15);
    if (currentTimeMinutes() < fallbackMinute) {
      return { date, closed: 0, skipped: true, reason: "before_checkout_fallback" };
    }

    const adapter = getAdapter();
    const firstDate = new Date(`${date}T12:00:00Z`);
    firstDate.setUTCDate(firstDate.getUTCDate() - 6);
    const datesToCheck = dateRange(firstDate.toISOString().slice(0, 10), date);
    const currentMinutes = currentTimeMinutes();
    let closed = 0;
    for (const attendanceDate of datesToCheck) {
      if (attendanceDate === date && currentMinutes < fallbackMinute) continue;
      const candidates = await adapter.teacherAttendance.listAutoCheckoutCandidates(attendanceDate);
      for (const record of candidates as any[]) {
        const lastSchoolAt = toIsoTimestamp(record.lastSchoolAt);
        const checkInAt = toIsoTimestamp(record.checkInAt);
        const latitude = Number(record.lastSchoolLatitude);
        const longitude = Number(record.lastSchoolLongitude);
        if (
          !lastSchoolAt
          || !checkInAt
          || String(record.date) !== attendanceDate
          || asDate(lastSchoolAt) !== attendanceDate
          || Date.parse(lastSchoolAt) <= Date.parse(checkInAt)
          || !isValidCoordinate(latitude, -90, 90)
          || !isValidCoordinate(longitude, -180, 180)
        ) continue;

        const row = await adapter.teacherAttendance.autoCheckOutIfOpen(String(record.id), {
          checkOutAt: lastSchoolAt,
          checkOutLatitude: latitude,
          checkOutLongitude: longitude,
          checkOutMethod: "automatic_end_of_day",
        });
        if (row) closed += 1;
      }
    }
    return { date, closed, skipped: false };
  } finally {
    autoCheckoutSweepInProgress = false;
  }
}

router.get("/settings/teacher-attendance", async (_req, res) => {
  res.json(await getSettings());
});

router.put("/settings/teacher-attendance", async (req, res) => {
  if (req.body?.adminId !== "admin") {
    res.status(403).json({ error: "Only administrators can change teacher attendance settings" });
    return;
  }
  const body = req.body ?? {};
  const currentSettings = await getSettings();
  const checkInStart = normalizeTime(body.checkInStart);
  const checkInEnd = normalizeTime(body.checkInEnd);
  const checkOutStart = normalizeTime(body.checkOutStart);
  const checkOutEnd = normalizeTime(body.checkOutEnd);
  const settings = {
    ...currentSettings,
    schoolLatitude: body.schoolLatitude === null || body.schoolLatitude === undefined ? null : Number(body.schoolLatitude),
    schoolLongitude: body.schoolLongitude === null || body.schoolLongitude === undefined ? null : Number(body.schoolLongitude),
    radiusMeters: Number(body.radiusMeters),
    checkInStart: checkInStart ?? "",
    checkInEnd: checkInEnd ?? "",
    checkOutStart: checkOutStart ?? "",
    checkOutEnd: checkOutEnd ?? "",
    requireFaceVerification: Boolean(body.requireFaceVerification),
    allowLateCheckIn: Boolean(body.allowLateCheckIn),
    sundayHoliday: typeof body.sundayHoliday === "boolean" ? body.sundayHoliday : currentSettings.sundayHoliday,
    workingDaysPerMonth: Number(body.workingDaysPerMonth),
    lateGraceMinutes: Number(body.lateGraceMinutes),
    lateDeductionAmount: Number(body.lateDeductionAmount),
    deductionType: body.deductionType === "fixed" ? "fixed" : "daily_rate",
  };
  const hasLatitude = settings.schoolLatitude !== null;
  const hasLongitude = settings.schoolLongitude !== null;
  if (hasLatitude !== hasLongitude
    || (hasLatitude && !isValidCoordinate(settings.schoolLatitude, -90, 90))
    || (hasLongitude && !isValidCoordinate(settings.schoolLongitude, -180, 180))
    || !Number.isFinite(settings.radiusMeters) || settings.radiusMeters <= 0
    || !checkInStart || !checkInEnd || !checkOutStart || !checkOutEnd
    || !Number.isInteger(settings.workingDaysPerMonth) || settings.workingDaysPerMonth < 1
    || !Number.isInteger(settings.lateGraceMinutes) || settings.lateGraceMinutes < 0
    || !Number.isFinite(settings.lateDeductionAmount) || settings.lateDeductionAmount < 0) {
    res.status(400).json({ error: "Invalid teacher attendance settings. Use times such as 4:30 PM or 16:30." });
    return;
  }
  if (timeToMinutes(checkInEnd) <= timeToMinutes(checkInStart)) {
    res.status(400).json({ error: "Check-in closing time must be later than the check-in start time." });
    return;
  }
  if (timeToMinutes(checkOutEnd) <= timeToMinutes(checkOutStart)) {
    res.status(400).json({ error: "Check-out closing time must be later than the check-out start time." });
    return;
  }
  const adapter = getAdapter();
  await adapter.appSettings.set(SETTINGS_KEY, settings);
  await syncTeacherSundayAttendance(adapter, settings.sundayHoliday);
  res.json(settings);
});

router.get("/teacher-attendance", async (req, res) => {
  const teacherId = typeof req.query.teacherId === "string" ? req.query.teacherId : undefined;
  const month = typeof req.query.month === "string" ? req.query.month : undefined;
  const adapter = getAdapter();
  const settings = await getSettings();
  await syncTeacherSundayAttendance(adapter, settings.sundayHoliday !== false);
  res.json(await adapter.teacherAttendance.list({ teacherId, month }));
});

router.post("/teacher-attendance/reset", async (req, res) => {
  if (req.body?.adminId !== "admin") {
    res.status(403).json({ error: "Only administrators can reset teacher attendance" });
    return;
  }
  const teacherId = typeof req.body?.teacherId === "string" && req.body.teacherId.trim()
    ? req.body.teacherId.trim()
    : undefined;
  const adapter = getAdapter();
  const deletedCount = await adapter.teacherAttendance.reset(teacherId);
  const settings = await getSettings();
  await syncTeacherSundayAttendance(adapter, settings.sundayHoliday !== false, undefined, true);
  res.json({ deletedCount, teacherId: teacherId ?? null });
});

router.get("/teacher-attendance/face-status", async (req, res) => {
  const teacherId = typeof req.query.teacherId === "string" ? req.query.teacherId : "";
  if (!teacherId) {
    res.status(400).json({ error: "teacherId is required" });
    return;
  }
  const teacher = await getTeacherById(teacherId);
  res.json({
    enrolled: Boolean(await getFaceProfile(teacherId)),
    canReEnroll: hasFaceReEnrollmentPermission(teacher),
  });
});

router.get("/teacher-attendance/faceless-permission", async (req, res) => {
  const session = await findAuthSession(bearerToken(req.get("authorization")));
  if (!session) {
    res.status(401).json({ error: "A valid teacher session is required" });
    return;
  }
  if (session.role !== "teacher") {
    res.status(403).json({ error: "Only teachers can check this permission" });
    return;
  }
  const teacher = await getTeacherById(session.userId);
  if (!teacher) {
    res.status(404).json({ error: "Teacher not found" });
    return;
  }
  res.json({ enabled: teacher.permissions?.facelessAttendance === true });
});

router.post("/teacher-attendance/face-enroll", async (req, res) => {
  const teacherId = String(req.body?.teacherId ?? "");
  const images = getFaceImages(req.body);
  const replaceExisting = req.body?.replaceExisting === true;
  if (!teacherId || images.length === 0) {
    res.status(400).json({ error: "teacherId and camera face samples are required" });
    return;
  }
  try {
    let teacherForReEnrollment: any | null = null;
    if (replaceExisting) {
      teacherForReEnrollment = await getTeacherById(teacherId);
      if (!teacherForReEnrollment) {
        res.status(404).json({ error: "Teacher not found" });
        return;
      }
      if (!hasFaceReEnrollmentPermission(teacherForReEnrollment)) {
        res.status(403).json({ error: "An administrator must grant face re-enrollment permission before replacing this profile" });
        return;
      }
    }
    if (!replaceExisting && await getFaceProfile(teacherId)) {
      res.status(409).json({ enrolled: true, error: "Face verification is already set up for this teacher" });
      return;
    }
    await saveFaceProfile(teacherId, createFaceTemplate(images));
    if (replaceExisting && teacherForReEnrollment) {
      await getAdapter().teachers.update(teacherId, {
        permissions: {
          ...(teacherForReEnrollment.permissions ?? {}),
          reEnrollFace: false,
        },
      });
    }
    res.status(201).json({
      enrolled: true,
      replaced: replaceExisting,
      permissionRevoked: replaceExisting,
      method: "camera_face_enrollment",
      sampleCount: images.length,
    });
  } catch (error: any) {
    const message = error?.message ?? "Face enrollment failed. Please capture your face again.";
    const databaseFailure = error?.code === "NO_DB_CONNECTION"
      || /database|connection|postgres|firestore|app.?settings/i.test(message);
    res.status(databaseFailure ? 503 : 400).json({ error: message });
  }
});

router.post("/teacher-attendance/check-in", async (req, res) => {
  const body = req.body ?? {};
  const teacherId = String(body.teacherId ?? "");
  const teacherName = String(body.teacherName ?? "");
  const date = asDate(body.skipFaceVerification === true ? undefined : body.date);
  if (!teacherId || !teacherName) {
    res.status(400).json({ error: "teacherId and teacherName are required" });
    return;
  }
  const settings = await getSettings();
  let attendanceTeacherName = teacherName;
  let faceVerified = false;
  let faceVerificationMethod = "disabled_by_admin";
  if (settings.requireFaceVerification) {
    if (body.skipFaceVerification === true) {
      const teacher = await requireFacelessAttendancePermission(req, res, teacherId);
      if (!teacher) return;
      attendanceTeacherName = String(teacher.name ?? teacherName);
      faceVerificationMethod = "admin_authorized_without_face";
    } else {
      const faceImages = getFaceImages(body);
      if (faceImages.length === 0) {
        res.status(400).json({ error: "Camera face samples are required for face verification" });
        return;
      }
      try {
        faceVerificationMethod = (await verifyFace(teacherId, faceImages)).method;
        faceVerified = true;
      } catch (error: any) {
        res.status(403).json({ error: error?.message ?? "Face verification failed" });
        return;
      }
    }
  }
  const adapter = getAdapter();
  if (settings.sundayHoliday && isSundayDate(date)) {
    await syncTeacherSundayAttendanceForDate(adapter, date, true);
    const record = await adapter.teacherAttendance.getByTeacherDate(teacherId, date);
    res.status(409).json({
      error: "Sunday is a holiday. Attendance has been submitted automatically.",
      record,
    });
    return;
  }
  const latitude = Number(body.latitude);
  const longitude = Number(body.longitude);
  if (!isValidCoordinate(latitude, -90, 90) || !isValidCoordinate(longitude, -180, 180)) {
    res.status(400).json({ error: "A valid GPS location is required" });
    return;
  }
  if (settings.schoolLatitude === null || settings.schoolLongitude === null) {
    res.status(400).json({ error: "School attendance location has not been configured by an administrator" });
    return;
  }
  const distance = distanceInMeters(settings.schoolLatitude, settings.schoolLongitude, latitude, longitude);
  if (distance > settings.radiusMeters) {
    res.status(403).json({ error: `You are ${Math.round(distance)}m from school; check-in is allowed within ${settings.radiusMeters}m` });
    return;
  }
  const nowMinutes = currentTimeMinutes();
  const checkInStart = timeToMinutes(settings.checkInStart);
  const checkInEnd = timeToMinutes(settings.checkInEnd);
  if (nowMinutes < checkInStart) {
    res.status(403).json({ error: `Check-in is available from ${settings.checkInStart} to ${settings.checkInEnd}` });
    return;
  }
  if (nowMinutes > checkInEnd && !settings.allowLateCheckIn) {
    res.status(403).json({ error: `Check-in closed at ${settings.checkInEnd}. Ask an administrator to allow late check-in.` });
    return;
  }
  // A check-in inside the configured window is on time. Grace applies only after closing.
  const late = nowMinutes > checkInEnd + settings.lateGraceMinutes;
   try {
      const result = await adapter.teacherAttendance.createIfAbsent(teacherId, date, {
        id: body.id, teacherId, teacherName: attendanceTeacherName, date,
       status: late ? "late" : "present",
       checkInAt: body.checkInAt ?? new Date().toISOString(),
       checkInLatitude: latitude, checkInLongitude: longitude,
        distanceFromSchool: distance, faceVerified,
        faceVerificationMethod,
       note: typeof body.note === "string" ? body.note.trim() : null,
     });
     if (!result.created) {
       res.status(409).json({ error: "Attendance has already been checked in for today", record: result.row });
       return;
     }
     res.status(201).json(result.row);
   } catch (error: any) {
     if (error?.code === "23505") {
        const existing = await adapter.teacherAttendance.getByTeacherDate(teacherId, date);
       res.status(409).json({ error: "Attendance has already been checked in for today", record: existing });
       return;
     }
     throw error;
   }
});

router.post("/teacher-attendance/:id/check-out", async (req, res) => {
  const body = req.body ?? {};
  const teacherId = String(body.teacherId ?? "");
  const settings = await getSettings();
  if (settings.requireFaceVerification && body.skipFaceVerification === true) {
    const teacher = await requireFacelessAttendancePermission(req, res, teacherId);
    if (!teacher) return;
  }
  const existing = (await getAdapter().teacherAttendance.list({ teacherId }))
    .find((record: any) => record.id === req.params.id);
  if (!existing) { res.status(404).json({ error: "Attendance record not found" }); return; }
  if (!existing.checkInAt) {
    res.status(409).json({
      error: "Check-out is unavailable because no check-in was recorded for today",
      record: existing,
    });
    return;
  }
  if (existing.checkOutAt) { res.status(409).json({ error: "Attendance has already been checked out", record: existing }); return; }
  const latitude = Number(body.latitude);
  const longitude = Number(body.longitude);
  if (!isValidCoordinate(latitude, -90, 90) || !isValidCoordinate(longitude, -180, 180)) {
    res.status(400).json({ error: "A valid GPS location is required" });
    return;
  }
  if (settings.schoolLatitude === null || settings.schoolLongitude === null) {
    res.status(400).json({ error: "School attendance location has not been configured by an administrator" });
    return;
  }
  const distance = distanceInMeters(settings.schoolLatitude, settings.schoolLongitude, latitude, longitude);
  if (distance > settings.radiusMeters) {
    res.status(403).json({ error: `You are ${Math.round(distance)}m from school; check-out is allowed within ${settings.radiusMeters}m` });
    return;
  }
  const nowMinutes = currentTimeMinutes();
  const checkOutStart = timeToMinutes(settings.checkOutStart);
  const checkOutEnd = timeToMinutes(settings.checkOutEnd);
  if (nowMinutes < checkOutStart || nowMinutes > checkOutEnd) {
    res.status(403).json({ error: `Check-out is available from ${settings.checkOutStart} to ${settings.checkOutEnd}` });
    return;
  }
  if (settings.requireFaceVerification) {
    if (body.skipFaceVerification !== true) {
      const faceImages = getFaceImages(body);
      if (faceImages.length === 0) {
        res.status(400).json({ error: "Camera face samples are required for face verification" });
        return;
      }
      try {
        await verifyFace(teacherId, faceImages);
      } catch (error: any) {
        res.status(403).json({ error: error?.message ?? "Face verification failed" });
        return;
      }
    }
  }
  const row = await getAdapter().teacherAttendance.updateCheckOut(req.params.id, {
    checkOutAt: body.checkOutAt ?? new Date().toISOString(),
    checkOutLatitude: latitude, checkOutLongitude: longitude,
    checkOutMethod: "manual",
  });
  res.json(row);
});

router.post("/teacher-attendance/:id/auto-checkout", async (req, res) => {
  const session = await requireTeacherAttendanceSession(req, res);
  if (!session) return;
  const body = req.body ?? {};
  const date = body.date;
  if (typeof body.enabled !== "boolean" || typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ error: "date and enabled are required" });
    return;
  }
  const record = await getAdapter().teacherAttendance.getByTeacherDate(session.userId, date);
  if (!record || String(record.id) !== req.params.id) {
    res.status(404).json({ error: "Today's teacher attendance record was not found" });
    return;
  }
  if (record.checkOutAt) {
    res.json({ checkedOut: true, record });
    return;
  }
  if (!record.checkInAt) {
    res.status(409).json({ error: "Automatic checkout requires a recorded check-in", record });
    return;
  }
  const updated = await getAdapter().teacherAttendance.setAutoCheckoutEnabled(
    String(record.id),
    session.userId,
    body.enabled,
  );
  if (!updated) {
    res.status(409).json({ error: "Automatic checkout could not be enabled for this attendance record" });
    return;
  }
  res.json({ checkedOut: false, record: updated });
});

router.post("/teacher-attendance/:id/location-samples", async (req, res) => {
  const session = await requireTeacherAttendanceSession(req, res);
  if (!session) return;
  const body = req.body ?? {};
  const date = body.date;
  const locations = body.locations;
  if (
    typeof date !== "string"
    || !/^\d{4}-\d{2}-\d{2}$/.test(date)
    || !Array.isArray(locations)
    || locations.length === 0
    || locations.length > 50
  ) {
    res.status(400).json({ error: "date and 1–50 location samples are required" });
    return;
  }

  const adapter = getAdapter();
  let record = await adapter.teacherAttendance.getByTeacherDate(session.userId, date);
  if (!record || String(record.id) !== req.params.id) {
    res.status(404).json({ error: "Teacher attendance record was not found" });
    return;
  }
  if (record.checkOutAt) {
    res.json({ checkedOut: true, record });
    return;
  }
  if (!record.autoCheckoutEnabled) {
    res.status(409).json({ error: "Automatic checkout location tracking is not enabled" });
    return;
  }

  const settings = await getSettings();
  if (settings.schoolLatitude === null || settings.schoolLongitude === null) {
    res.status(409).json({ error: "School attendance location has not been configured" });
    return;
  }
  const checkInMs = Date.parse(String(record.checkInAt));
  const nowMs = Date.now();
  const sortedLocations = locations
    .map((sample: any) => {
      const at = typeof sample?.timestamp === "number"
        ? new Date(sample.timestamp)
        : new Date(String(sample?.timestamp ?? ""));
      return {
        latitude: Number(sample?.latitude),
        longitude: Number(sample?.longitude),
        accuracy: sample?.accuracy === undefined || sample?.accuracy === null
          ? undefined : Number(sample.accuracy),
        at,
      };
    })
    .filter((sample: any) =>
      Number.isFinite(sample.at.getTime())
      && isValidCoordinate(sample.latitude, -90, 90)
      && isValidCoordinate(sample.longitude, -180, 180)
      && (sample.accuracy === undefined || (
        Number.isFinite(sample.accuracy) && sample.accuracy >= 0 && sample.accuracy <= 200
      ))
      && sample.at.getTime() >= checkInMs
      && sample.at.getTime() <= nowMs + 120_000
      && asDate(sample.at.toISOString()) === date,
    )
    .sort((left: any, right: any) => left.at.getTime() - right.at.getTime());

  if (sortedLocations.length === 0) {
    res.status(400).json({ error: "No valid same-day location samples were provided" });
    return;
  }

  for (const sample of sortedLocations) {
    const sampleAt = sample.at.toISOString();
    const distance = distanceInMeters(
      Number(settings.schoolLatitude),
      Number(settings.schoolLongitude),
      sample.latitude,
      sample.longitude,
    );
    if (distance <= settings.radiusMeters) {
      const updated = await adapter.teacherAttendance.updateLastSchoolLocation(
        String(record.id),
        session.userId,
        { at: sampleAt, latitude: sample.latitude, longitude: sample.longitude },
      );
      if (updated) record = updated;
      continue;
    }

    // Require the location to be clearly outside the boundary so GPS jitter at
    // the edge does not close attendance prematurely.
    const exitMargin = Math.max(25, Math.min(sample.accuracy ?? 25, 100));
    if (distance <= settings.radiusMeters + exitMargin) continue;
    const lastSchoolAt = toIsoTimestamp(record.lastSchoolAt);
    const lastSchoolLatitude = Number(record.lastSchoolLatitude);
    const lastSchoolLongitude = Number(record.lastSchoolLongitude);
    if (
      !lastSchoolAt
      || asDate(lastSchoolAt) !== date
      || Date.parse(lastSchoolAt) >= sample.at.getTime()
      || !isValidCoordinate(lastSchoolLatitude, -90, 90)
      || !isValidCoordinate(lastSchoolLongitude, -180, 180)
    ) continue;

    const closed = await adapter.teacherAttendance.autoCheckOutIfOpen(String(record.id), {
      checkOutAt: lastSchoolAt,
      checkOutLatitude: lastSchoolLatitude,
      checkOutLongitude: lastSchoolLongitude,
      checkOutMethod: "automatic_location",
    });
    if (closed) {
      res.json({ checkedOut: true, record: closed });
      return;
    }
    record = await adapter.teacherAttendance.getByTeacherDate(session.userId, date) ?? record;
    if (record.checkOutAt) {
      res.json({ checkedOut: true, record });
      return;
    }
  }

  res.json({ checkedOut: Boolean(record.checkOutAt), record });
});

router.get("/teacher-leaves", async (req, res) => {
  const teacherId = typeof req.query.teacherId === "string" ? req.query.teacherId : undefined;
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  res.json(await getAdapter().teacherLeaveApplications.list({ teacherId, status }));
});

router.post("/teacher-leaves", async (req, res) => {
  const body = req.body ?? {};
  if (!body.teacherId || !body.teacherName || !/^\d{4}-\d{2}-\d{2}$/.test(body.startDate)
    || !/^\d{4}-\d{2}-\d{2}$/.test(body.endDate) || body.startDate > body.endDate || !String(body.reason ?? "").trim()) {
    res.status(400).json({ error: "teacher, valid date range, and reason are required" });
    return;
  }
  const row = await getAdapter().teacherLeaveApplications.create({
    id: body.id, teacherId: body.teacherId, teacherName: body.teacherName,
    startDate: body.startDate, endDate: body.endDate, reason: String(body.reason).trim(),
  });
  res.status(201).json(row);
});

router.put("/teacher-leaves/:id", async (req, res) => {
  const body = req.body ?? {};
  const teacherId = String(body.teacherId ?? "");
  if (!teacherId || !/^\d{4}-\d{2}-\d{2}$/.test(body.startDate)
    || !/^\d{4}-\d{2}-\d{2}$/.test(body.endDate) || body.startDate > body.endDate
    || !String(body.reason ?? "").trim()) {
    res.status(400).json({ error: "teacher, valid date range, and reason are required" });
    return;
  }
  const row = await getAdapter().teacherLeaveApplications.update(req.params.id, teacherId, {
    startDate: body.startDate,
    endDate: body.endDate,
    reason: String(body.reason).trim(),
  });
  if (!row) {
    res.status(404).json({ error: "Only your pending leave applications can be edited" });
    return;
  }
  res.json(row);
});

router.delete("/teacher-leaves/:id", async (req, res) => {
  const teacherId = typeof req.query.teacherId === "string" ? req.query.teacherId : "";
  if (!teacherId) {
    res.status(400).json({ error: "teacherId is required" });
    return;
  }
  const deleted = await getAdapter().teacherLeaveApplications.delete(req.params.id, teacherId);
  if (!deleted) {
    res.status(404).json({ error: "Only your pending leave applications can be deleted" });
    return;
  }
  res.status(204).send();
});

router.put("/teacher-leaves/:id/approve", async (req, res) => {
  if (req.body?.adminId !== "admin") { res.status(403).json({ error: "Only administrators can approve leave" }); return; }
  const row = await getAdapter().teacherLeaveApplications.updateStatus(req.params.id, "approved", req.body?.adminNote);
  if (!row) { res.status(404).json({ error: "Leave application not found" }); return; }
  res.json(row);
});

router.put("/teacher-leaves/:id/reject", async (req, res) => {
  if (req.body?.adminId !== "admin") { res.status(403).json({ error: "Only administrators can reject leave" }); return; }
  const row = await getAdapter().teacherLeaveApplications.updateStatus(req.params.id, "rejected", req.body?.adminNote);
  if (!row) { res.status(404).json({ error: "Leave application not found" }); return; }
  res.json(row);
});

router.get("/teacher-holidays", async (_req, res) => {
  res.json(await getAdapter().teacherHolidays.list());
});

router.post("/teacher-holidays", async (req, res) => {
  if (req.body?.adminId !== "admin" || !/^\d{4}-\d{2}-\d{2}$/.test(req.body?.date) || !String(req.body?.name ?? "").trim()) {
    res.status(400).json({ error: "adminId, valid date, and holiday name are required" });
    return;
  }
  const row = await getAdapter().teacherHolidays.create({ id: req.body.id, date: req.body.date, name: String(req.body.name).trim() });
  res.status(201).json(row);
});

router.put("/teacher-holidays/:id", async (req, res) => {
  if (req.body?.adminId !== "admin") { res.status(403).json({ error: "Only administrators can edit holidays" }); return; }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(req.body?.date) || !String(req.body?.name ?? "").trim()) {
    res.status(400).json({ error: "A valid date and holiday name are required" });
    return;
  }
  const row = await getAdapter().teacherHolidays.update(req.params.id, { date: req.body.date, name: String(req.body.name ?? "").trim() });
  if (!row) { res.status(404).json({ error: "Holiday not found" }); return; }
  res.json(row);
});

router.delete("/teacher-holidays/:id", async (req, res) => {
  if (req.query.adminId !== "admin") { res.status(403).json({ error: "Only administrators can delete holidays" }); return; }
  await getAdapter().teacherHolidays.delete(req.params.id);
  res.status(204).send();
});

router.post("/teacher-attendance/payroll/calculate", async (req, res) => {
  if (req.body?.adminId !== "admin") { res.status(403).json({ error: "Only administrators can calculate payroll" }); return; }
  const month = String(req.body?.month ?? "");
  const year = Number(req.body?.year);
  if (!/^(January|February|March|April|May|June|July|August|September|October|November|December)$/.test(month)
    || !Number.isInteger(year) || year < 2000) {
    res.status(400).json({ error: "month must be a month name and year must be valid" });
    return;
  }
  const monthIndex = ["January","February","March","April","May","June","July","August","September","October","November","December"].indexOf(month);
  const monthKey = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
  const settings = await getSettings();
  const adapter = getAdapter();
  const [teachers, records, leaves, holidays] = await Promise.all([
    adapter.teachers.list(), adapter.teacherAttendance.list({ month: monthKey }),
    adapter.teacherLeaveApplications.list({ status: "approved" }), adapter.teacherHolidays.list(),
  ]);
  const holidayDates = new Set(holidays.filter((h: any) => String(h.date).startsWith(monthKey)).map((h: any) => h.date));
  const approvedLeaveDates = new Set(leaves.flatMap((leave: any) =>
    dateRange(leave.startDate, leave.endDate).filter(date => date.startsWith(monthKey)),
  ));
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  if (settings.sundayHoliday) {
    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = `${monthKey}-${String(day).padStart(2, "0")}`;
      if (isSundayDate(date)) holidayDates.add(date);
    }
  }
  const workingDates = Array.from({ length: daysInMonth }, (_, index) => {
    const date = `${monthKey}-${String(index + 1).padStart(2, "0")}`;
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    return weekday !== 6 && !holidayDates.has(date) && !approvedLeaveDates.has(date) ? date : null;
  }).filter((date): date is string => Boolean(date));
  const dailyRateDivisor = daysInMonth;
  const result = [];
  for (const teacher of teachers as any[]) {
    const teacherRecords = records.filter((record: any) => record.teacherId === teacher.id);
    const recordByDate = new Map(teacherRecords.map((record: any) => [record.date, record]));
    const absentDates = workingDates.filter(date => {
      const record = recordByDate.get(date);
      return !record || record.status === "absent";
    });
    const lateRecords = teacherRecords.filter((record: any) => record.status === "late");
    const absentDeduction = settings.deductionType === "fixed"
      ? absentDates.length * settings.lateDeductionAmount
      : absentDates.length * (Number(teacher.salary ?? 0) / dailyRateDivisor);
    const lateDeduction = lateRecords.length * settings.lateDeductionAmount;
    const amount = Math.max(0, Math.round(Number(teacher.salary ?? 0) - absentDeduction - lateDeduction));
    const salary = await adapter.salaryRecords.upsertByTeacher(teacher.id, month, year, {
      teacherName: teacher.name, amount, status: "pending",
    });
    result.push({
      teacherId: teacher.id, teacherName: teacher.name, month, year, baseSalary: Number(teacher.salary ?? 0),
      presentDays: teacherRecords.filter((record: any) => record.status === "present").length,
      lateDays: lateRecords.length, absentDays: absentDates.length,
      excludedHolidayDays: holidayDates.size, excludedLeaveDays: approvedLeaveDates.size,
      absentDeduction: Math.round(absentDeduction), lateDeduction: Math.round(lateDeduction),
      payableAmount: amount, salaryRecord: salary.row,
    });
  }
  res.json({
    month,
    year,
    workingDays: workingDates.length,
    scheduledWorkingDays: workingDates.length,
    daysInMonth,
    result,
  });
});

export default router;