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
    teacherAttendanceSettings: {
      ...DEFAULT_TEACHER_ATTENDANCE_SETTINGS,
      ...(teacherAttendanceSettingsSetting?.value ?? {}),
    },
  });
});

export default router;
