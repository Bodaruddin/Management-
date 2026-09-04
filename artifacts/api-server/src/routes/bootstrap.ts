import { Router } from "express";
import { getAdapter } from "../lib/dbManager.js";

const router = Router();
const CLASS_ABSENT_LIMITS_KEY = "class_absent_limits";
const DOCUMENT_BRANDING_KEY = "document_branding";
const TEACHER_ATTENDANCE_SETTINGS_KEY = "teacher_attendance_settings";

const EMPTY_DOCUMENT_BRANDING = {
  logoDataUrl: null,
  signatureDataUrl: null,
  principalSignatureDataUrl: null,
  teacherSignatureDataUrl: null,
  examInChargeSignatureDataUrl: null,
};

const DEFAULT_TEACHER_ATTENDANCE_SETTINGS = {
  schoolLatitude: null,
  schoolLongitude: null,
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
  deductionType: "daily_rate",
};

const TIME_SETTING_KEYS = ["checkInStart", "checkInEnd", "checkOutStart", "checkOutEnd"] as const;

function normalizeTime(value: unknown): string | null {
  const normalized = String(value ?? "").trim().toUpperCase().replace(/\s+/g, " " );
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

function readTeacherAttendanceSettings(value: unknown) {
  let savedValue = value;
  if (typeof savedValue === "string") {
    try { savedValue = JSON.parse(savedValue); } catch { savedValue = {}; }
  }
  const settings = {
    ...DEFAULT_TEACHER_ATTENDANCE_SETTINGS,
    ...(savedValue && typeof savedValue === "object" && !Array.isArray(savedValue) ? savedValue : {}),
  };
  for (const key of TIME_SETTING_KEYS) {
    settings[key] = normalizeTime(settings[key]) ?? DEFAULT_TEACHER_ATTENDANCE_SETTINGS[key];
  }
  return settings;
}

function withoutDocuments(rows: any[]) {
  return rows.map((row) => {
    const { documentBase64: _documentBase64, ...summary } = row;
    return { ...summary, hasDocument: Boolean(row.documentBase64) };
  });
}

router.get("/bootstrap", async (_req, res) => {
  const adapter = getAdapter();

  // Keep the legacy alumni repair, but do it once before the single data load
  // instead of repeating it while several client requests are in flight.
  await adapter.alumni.syncGraduatedStudents();

  const [
    classes,
    sections,
    students,
    teachers,
    subjects,
    feeTypes,
    attendance,
    exams,
    results,
    fees,
    expenses,
    salaries,
    promotions,
    markSubmissions,
    markAuditLog,
    inactivationRequests,
    classAbsentLimitsSetting,
    documentBrandingSetting,
    alumni,
    teacherAttendance,
    teacherLeaves,
    teacherHolidays,
    teacherAttendanceSettingsSetting,
  ] = await Promise.all([
    adapter.classes.list(),
    adapter.sections.list(),
    adapter.students.list(true),
    adapter.teachers.list(),
    adapter.subjects.list(),
    adapter.feeTypes.list(),
    adapter.attendance.list(),
    adapter.exams.list(),
    adapter.examResults.list(),
    adapter.feeRecords.list(),
    adapter.expenses.list(),
    adapter.salaryRecords.list(),
    adapter.promotions.list(),
    adapter.markSubmissions.list(),
    adapter.markAuditLog.list(),
    adapter.inactivationRequests.list(),
    adapter.appSettings.get(CLASS_ABSENT_LIMITS_KEY),
    adapter.appSettings.get(DOCUMENT_BRANDING_KEY),
    adapter.alumni.list(),
    adapter.teacherAttendance.list(),
    adapter.teacherLeaveApplications.list(),
    adapter.teacherHolidays.list(),
    adapter.appSettings.get(TEACHER_ATTENDANCE_SETTINGS_KEY),
  ]);

  res.json({
    classes,
    sections,
    students,
    teachers,
    subjects,
    feeTypes,
    attendance,
    exams,
    results,
    fees,
    expenses,
    salaries,
    promotions,
    markSubmissions,
    markAuditLog,
    inactivationRequests: withoutDocuments(inactivationRequests),
    classAbsentLimits: classAbsentLimitsSetting?.value ?? {},
    documentBranding: { ...EMPTY_DOCUMENT_BRANDING, ...(documentBrandingSetting?.value ?? {}) },
    alumni,
    teacherAttendance,
    teacherLeaves,
    teacherHolidays,
    teacherAttendanceSettings: readTeacherAttendanceSettings(teacherAttendanceSettingsSetting?.value),
  });
});

export default router;
