import { Router } from "express";
import { getAdapter } from "../lib/dbManager.js";
import { createFaceTemplate, faceMatches } from "../lib/faceTemplate.js";

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
      && (entry[1].startsWith("v1:") || entry[1].startsWith("v2:")),
    ),
  );
}

function faceProfileKey(teacherId: string): string {
  return `${FACE_PROFILE_KEY_PREFIX}${encodeURIComponent(teacherId)}`;
}

function readStoredFaceTemplate(value: unknown): string | null {
  if (typeof value === "string") {
    if (value.startsWith("v1:") || value.startsWith("v2:")) return value;
    try {
      return readStoredFaceTemplate(JSON.parse(value));
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const template = (value as { template?: unknown }).template;
  return typeof template === "string"
    && (template.startsWith("v1:") || template.startsWith("v2:"))
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

async function verifyOrEnrollFace(teacherId: string, imageBase64: string) {
  const existing = await getFaceProfile(teacherId);
  if (!existing) {
    await saveFaceProfile(teacherId, createFaceTemplate(imageBase64));
    return { method: "camera_face_enrollment" };
  }
  if (!faceMatches(existing, imageBase64)) {
    throw new Error("Face did not match the enrolled teacher. Please look directly at the camera and try again.");
  }
  return { method: "camera_face_match" };
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
  const checkInStart = normalizeTime(body.checkInStart);
  const checkInEnd = normalizeTime(body.checkInEnd);
  const checkOutStart = normalizeTime(body.checkOutStart);
  const checkOutEnd = normalizeTime(body.checkOutEnd);
  const settings = {
    ...await getSettings(),
    schoolLatitude: body.schoolLatitude === null || body.schoolLatitude === undefined ? null : Number(body.schoolLatitude),
    schoolLongitude: body.schoolLongitude === null || body.schoolLongitude === undefined ? null : Number(body.schoolLongitude),
    radiusMeters: Number(body.radiusMeters),
    checkInStart: checkInStart ?? "",
    checkInEnd: checkInEnd ?? "",
    checkOutStart: checkOutStart ?? "",
    checkOutEnd: checkOutEnd ?? "",
    requireFaceVerification: Boolean(body.requireFaceVerification),
    allowLateCheckIn: Boolean(body.allowLateCheckIn),
    workingDaysPerMonth: Number(body.workingDaysPerMonth),
    lateGraceMinutes: Number(body.lateGraceMinutes),
    lateDeductionAmount: Number(body.lateDeductionAmount),
    deductionType: body.deductionType === "fixed" ? "fixed" : "daily_rate",
  };
  if ((settings.schoolLatitude !== null && !isValidCoordinate(settings.schoolLatitude, -90, 90))
    || (settings.schoolLongitude !== null && !isValidCoordinate(settings.schoolLongitude, -180, 180))
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
  await getAdapter().appSettings.set(SETTINGS_KEY, settings);
  res.json(settings);
});

router.get("/teacher-attendance", async (req, res) => {
  const teacherId = typeof req.query.teacherId === "string" ? req.query.teacherId : undefined;
  const month = typeof req.query.month === "string" ? req.query.month : undefined;
  res.json(await getAdapter().teacherAttendance.list({ teacherId, month }));
});

router.get("/teacher-attendance/face-status", async (req, res) => {
  const teacherId = typeof req.query.teacherId === "string" ? req.query.teacherId : "";
  if (!teacherId) {
    res.status(400).json({ error: "teacherId is required" });
    return;
  }
  res.json({ enrolled: Boolean(await getFaceProfile(teacherId)) });
});

router.post("/teacher-attendance/face-enroll", async (req, res) => {
  const teacherId = String(req.body?.teacherId ?? "");
  const imageBase64 = req.body?.faceImageBase64;
  if (!teacherId || typeof imageBase64 !== "string" || !imageBase64) {
    res.status(400).json({ error: "teacherId and a camera selfie are required" });
    return;
  }
  try {
    if (await getFaceProfile(teacherId)) {
      res.status(409).json({ enrolled: true, error: "Face verification is already set up for this teacher" });
      return;
    }
    await saveFaceProfile(teacherId, createFaceTemplate(imageBase64));
    res.status(201).json({ enrolled: true, method: "camera_face_enrollment" });
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
  const date = asDate(body.date);
  if (!teacherId || !teacherName) {
    res.status(400).json({ error: "teacherId and teacherName are required" });
    return;
  }
  const settings = await getSettings();
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
  let faceVerificationMethod = "disabled_by_admin";
  if (settings.requireFaceVerification) {
    if (typeof body.faceImageBase64 !== "string" || !body.faceImageBase64) {
      res.status(400).json({ error: "A camera selfie is required for face verification" });
      return;
    }
    try {
      faceVerificationMethod = (await verifyOrEnrollFace(teacherId, body.faceImageBase64)).method;
    } catch (error: any) {
      res.status(403).json({ error: error?.message ?? "Face verification failed" });
      return;
    }
  }
  const existing = await getAdapter().teacherAttendance.getByTeacherDate(teacherId, date);
  if (existing) {
    res.status(409).json({ error: "Attendance has already been checked in for today", record: existing });
    return;
  }
  const late = nowMinutes > checkInStart + settings.lateGraceMinutes;
  const row = await getAdapter().teacherAttendance.create({
    id: body.id, teacherId, teacherName, date,
    status: late ? "late" : "present",
    checkInAt: body.checkInAt ?? new Date().toISOString(),
    checkInLatitude: latitude, checkInLongitude: longitude,
    distanceFromSchool: distance, faceVerified: settings.requireFaceVerification,
    faceVerificationMethod: settings.requireFaceVerification
      ? faceVerificationMethod
      : "disabled_by_admin",
    note: typeof body.note === "string" ? body.note.trim() : null,
  });
  res.status(201).json(row);
});

router.post("/teacher-attendance/:id/check-out", async (req, res) => {
  const body = req.body ?? {};
  const teacherId = String(body.teacherId ?? "");
  const existing = (await getAdapter().teacherAttendance.list({ teacherId }))
    .find((record: any) => record.id === req.params.id);
  if (!existing) { res.status(404).json({ error: "Attendance record not found" }); return; }
  if (existing.checkOutAt) { res.status(409).json({ error: "Attendance has already been checked out", record: existing }); return; }
  const latitude = Number(body.latitude);
  const longitude = Number(body.longitude);
  if (!isValidCoordinate(latitude, -90, 90) || !isValidCoordinate(longitude, -180, 180)) {
    res.status(400).json({ error: "A valid GPS location is required" });
    return;
  }
  const settings = await getSettings();
  if (settings.schoolLatitude !== null && settings.schoolLongitude !== null) {
    const distance = distanceInMeters(settings.schoolLatitude, settings.schoolLongitude, latitude, longitude);
    if (distance > settings.radiusMeters) {
      res.status(403).json({ error: `You are ${Math.round(distance)}m from school; check-out is allowed within ${settings.radiusMeters}m` });
      return;
    }
  }
  const nowMinutes = currentTimeMinutes();
  const checkOutStart = timeToMinutes(settings.checkOutStart);
  const checkOutEnd = timeToMinutes(settings.checkOutEnd);
  if (nowMinutes < checkOutStart || nowMinutes > checkOutEnd) {
    res.status(403).json({ error: `Check-out is available from ${settings.checkOutStart} to ${settings.checkOutEnd}` });
    return;
  }
  if (settings.requireFaceVerification) {
    if (typeof body.faceImageBase64 !== "string" || !body.faceImageBase64) {
      res.status(400).json({ error: "A camera selfie is required for face verification" });
      return;
    }
    try {
      await verifyOrEnrollFace(teacherId, body.faceImageBase64);
    } catch (error: any) {
      res.status(403).json({ error: error?.message ?? "Face verification failed" });
      return;
    }
  }
  const row = await getAdapter().teacherAttendance.updateCheckOut(req.params.id, {
    checkOutAt: body.checkOutAt ?? new Date().toISOString(),
    checkOutLatitude: latitude, checkOutLongitude: longitude,
  });
  res.json(row);
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
  const [teachers, records, leaves, holidays] = await Promise.all([
    getAdapter().teachers.list(), getAdapter().teacherAttendance.list({ month: monthKey }),
    getAdapter().teacherLeaveApplications.list({ status: "approved" }), getAdapter().teacherHolidays.list(),
  ]);
  const holidayDates = new Set(holidays.filter((h: any) => String(h.date).startsWith(monthKey)).map((h: any) => h.date));
  const approvedLeaveDates = new Set(leaves.flatMap((leave: any) =>
    dateRange(leave.startDate, leave.endDate).filter(date => date.startsWith(monthKey)),
  ));
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const workingDates = Array.from({ length: daysInMonth }, (_, index) => {
    const date = `${monthKey}-${String(index + 1).padStart(2, "0")}`;
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    return weekday !== 0 && weekday !== 6 && !holidayDates.has(date) && !approvedLeaveDates.has(date) ? date : null;
  }).filter((date): date is string => Boolean(date));
  const dailyRateDivisor = settings.workingDaysPerMonth || workingDates.length || 26;
  const result = [];
  for (const teacher of teachers as any[]) {
    const teacherRecords = records.filter((record: any) => record.teacherId === teacher.id);
    const recordByDate = new Map(teacherRecords.map((record: any) => [record.date, record]));
    const absentDates = workingDates.filter(date => !recordByDate.has(date));
    const lateRecords = teacherRecords.filter((record: any) => record.status === "late");
    const absentDeduction = settings.deductionType === "fixed"
      ? absentDates.length * settings.lateDeductionAmount
      : absentDates.length * (Number(teacher.salary ?? 0) / dailyRateDivisor);
    const lateDeduction = lateRecords.length * settings.lateDeductionAmount;
    const amount = Math.max(0, Math.round(Number(teacher.salary ?? 0) - absentDeduction - lateDeduction));
    const salary = await getAdapter().salaryRecords.upsertByTeacher(teacher.id, month, year, {
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
  res.json({ month, year, workingDays: workingDates.length, result });
});

export default router;