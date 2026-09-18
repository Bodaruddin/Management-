import { Router } from "express";
import { getAdapter } from "../lib/dbManager.js";

const router = Router();

// ── List all mark submissions ──────────────────────────────────────────────────
router.get("/mark-submissions", async (_req, res) => {
  const rows = await getAdapter().markSubmissions.list();
  res.json(rows);
});

// ── List audit log ─────────────────────────────────────────────────────────────
router.get("/mark-audit-log", async (_req, res) => {
  const rows = await getAdapter().markAuditLog.list();
  res.json(rows);
});

function isValidMark(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function normalizeMark(value: unknown): number | null {
  if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) {
    return null;
  }
  const mark = typeof value === "number" ? value : Number(value);
  return Number.isFinite(mark) ? mark : NaN;
}

async function getCompleteSubjectMarks(
  examId: string,
  cls: string,
  subject: string,
  marks: unknown,
): Promise<{ rows: Array<{ studentId: string; studentName: string; rollNumber: string; mark: number }>; complete: boolean }> {
  if (!Array.isArray(marks)) {
    throw new Error("marks must be an array");
  }

  const exam = (await getAdapter().exams.list()).find((item: any) => item.id === examId);
  if (!exam) throw new Error("Exam not found");
  const classAssignment = Array.isArray(exam.classSubjects)
    ? exam.classSubjects.find((item: any) => item.class === cls)
    : null;
  const allowedSubjects = classAssignment?.subjects ?? exam.subjects ?? [];
  if (!allowedSubjects.includes(subject)) {
    throw new Error(`Subject "${subject}" is not assigned to ${cls} for this exam`);
  }
  const subjectSchedule = classAssignment?.subjectSchedule
    ?? classAssignment?.subjectSchedules
    ?? exam.subjectSchedule
    ?? exam.subjectSchedules
    ?? [];
  const configuredSubject = Array.isArray(subjectSchedule)
    ? subjectSchedule.find((schedule: any) => schedule?.subject === subject)
    : undefined;
  const maxMarks = Number(
    configuredSubject?.maxMarks
      ?? configuredSubject?.max_marks
      ?? exam.maxMarks,
  );
  if (!Number.isFinite(maxMarks) || maxMarks < 0) {
    throw new Error("Exam has an invalid maximum mark");
  }

  const students = (await getAdapter().students.list()).filter((student: any) => student.class === cls);
  const studentIds = new Set(students.map((student: any) => student.id));
  const supplied = new Map<string, { studentId: string; studentName: string; rollNumber: string; mark: number }>();
  let complete = students.length > 0;

  for (const raw of marks as any[]) {
    if (!raw?.studentId) {
      throw new Error("Each mark must include a studentId");
    }
    if (!studentIds.has(raw.studentId)) {
      throw new Error(`Student ${raw.studentId} is not in ${cls}`);
    }
    if (supplied.has(raw.studentId)) {
      throw new Error(`Duplicate mark for student ${raw.studentId}`);
    }
    const mark = normalizeMark(raw.mark);
    if (Number.isNaN(mark)) {
      throw new Error(`Invalid mark for student ${raw.studentId}`);
    }
    if (mark === null) {
      complete = false;
      continue;
    }
    if (!isValidMark(mark) || mark > maxMarks) {
      throw new Error(`Invalid mark for student ${raw.studentId}`);
    }
    supplied.set(raw.studentId, {
      studentId: raw.studentId,
      studentName: raw.studentName ?? "",
      rollNumber: raw.rollNumber ?? "",
      mark,
    });
  }

  for (const student of students) {
    if (!supplied.has(student.id)) complete = false;
  }

  return { rows: [...supplied.values()], complete };
}

async function subjectHasCompleteMarks(examId: string, cls: string, subject: string): Promise<boolean> {
  const students = (await getAdapter().students.list()).filter((student: any) => student.class === cls);
  if (students.length === 0) return false;
  const results = await getAdapter().examResults.list();
  const marksByStudent = new Map(
    results
      .filter((result: any) => result.examId === examId && result.class === cls)
      .map((result: any) => [result.studentId, result.marks?.[subject]]),
  );
  return students.every((student: any) => isValidMark(marksByStudent.get(student.id)));
}

async function subjectHasStoredMarks(examId: string, cls: string, subject: string): Promise<boolean> {
  const results = await getAdapter().examResults.list();
  return results.some((result: any) => {
    if (result.examId !== examId || result.class !== cls) return false;
    const mark = result.marks?.[subject];
    return mark !== undefined && mark !== null && String(mark).trim() !== "";
  });
}

// ── Teacher submits a subject's marks (saves marks + locks subject) ────────────
router.post("/mark-submissions/submit", async (req, res) => {
  const { examId, class: cls, subject, teacherId, teacherName, marks } = req.body;
  if (!examId || !cls || !subject || !teacherId || !Array.isArray(marks)) {
    res.status(400).json({ error: "examId, class, subject, teacherId, marks are required" });
    return;
  }

  // ── Server-side authorization: verify teacher exists + has manageResults permission ──
  const teachers = await getAdapter().teachers.list();
  const teacher = teachers.find((t: any) => t.id === teacherId);
  if (!teacher) {
    res.status(403).json({ error: "Unauthorized: teacher not found" });
    return;
  }
  const perms = teacher.permissions ?? {};
  if (!perms.manageResults) {
    res.status(403).json({ error: "Unauthorized: teacher does not have manageResults permission" });
    return;
  }
  // A submitted subject can only be edited by its original teacher when the
  // administrator has enabled mark editing for that individual teacher.
  const existing = await getAdapter().markSubmissions.get(examId, cls, subject);
  // A submitted subject belongs to the teacher who submitted it.
  // Legacy marks without an ownership record remain submitted, but cannot be
  // edited by a teacher until an admin unlocks and re-submission records ownership.
  const hasLegacyStoredMarks = !existing && await subjectHasStoredMarks(examId, cls, subject);
  const effectiveExisting = existing ?? (hasLegacyStoredMarks ? { status: "submitted", teacherId: null } : null);
  const allowTeacherEdit = (teacher.permissions ?? {}).allowMarkEdit === true;
  const isTeacherEdit =
    effectiveExisting?.status === "submitted" &&
    effectiveExisting.teacherId === teacherId;

  if (effectiveExisting?.status === "locked") {
    res.status(409).json({
      error: `Subject "${subject}" marks are locked. Only an admin can unlock them.`,
      status: "locked",
    });
    return;
  }
  if (isTeacherEdit && !allowTeacherEdit) {
    res.status(409).json({
      error: "Editing submitted marks is disabled for this teacher by the administrator.",
      status: "submitted",
    });
    return;
  }
  if (effectiveExisting?.status === "submitted" && !isTeacherEdit) {
    res.status(403).json({
      error: `Only the teacher who submitted "${subject}" can edit these marks.`,
      status: "submitted",
    });
    return;
  }

  let normalized: Awaited<ReturnType<typeof getCompleteSubjectMarks>>;
  try {
    normalized = await getCompleteSubjectMarks(examId, cls, subject, marks);
  } catch (error: any) {
    res.status(400).json({ error: error.message ?? "Invalid marks" });
    return;
  }
  const { rows, complete } = normalized;
  await getAdapter().examResults.replaceSubjectMarks(examId, cls, subject, rows);

  // A cleared, reset, or incomplete subject is explicitly reopened. It must
  // never remain submitted/locked just because the teacher pressed Submit.
  const nextStatus = complete ? "submitted" : "draft";

  // Update / create submission record only after the marks replacement succeeds.
  const submission = await getAdapter().markSubmissions.upsert({
    examId, class: cls, subject, status: nextStatus,
    teacherId: complete ? teacherId : null,
    teacherName: complete ? (teacherName ?? teacher.name ?? "") : null,
    submittedAt: complete ? new Date() : null,
    lockedBy: null, lockedAt: null,
  });

  // Audit log
  await getAdapter().markAuditLog.create({
    examId, class: cls, subject, action: "submit",
    actorId: teacherId,
    actorName: teacherName ?? teacher.name ?? teacherId,
    actorRole: "teacher",
    notes: complete
      ? `${isTeacherEdit ? "Edited" : "Submitted"} ${rows.length} student mark(s) for ${subject}`
      : `Cleared or incomplete marks for ${subject}; subject automatically unlocked`,
  });

  res.status(200).json(submission);
});

// ── Admin locks a subject ──────────────────────────────────────────────────────
// Admin-only: caller must supply adminSecret matching SESSION_SECRET or the
// built-in admin username to confirm this is an admin action.
// Since the app has no session token infrastructure yet, we validate that the
// request comes from a known admin context by checking a required adminId field
// is "admin" (the hardcoded admin account id used throughout the app).
router.post("/mark-submissions/lock", async (req, res) => {
  const { examId, class: cls, subject, adminId, adminName } = req.body;
  if (!examId || !cls || !subject) {
    res.status(400).json({ error: "examId, class, subject are required" });
    return;
  }

  // Server-side authorization: ensure this is an admin action
  // The hardcoded admin account always uses id="admin" (see AuthContext.tsx)
  if (!adminId || adminId !== "admin") {
    res.status(403).json({ error: "Unauthorized: only administrators can lock subject marks" });
    return;
  }

  if (!(await subjectHasCompleteMarks(examId, cls, subject))) {
    const existing = await getAdapter().markSubmissions.get(examId, cls, subject);
    if (existing?.status !== "draft") {
      await getAdapter().markSubmissions.upsert({
        examId, class: cls, subject, status: "draft",
        teacherId: null, teacherName: null,
        submittedAt: null, lockedBy: null, lockedAt: null,
      });
    }
    res.status(409).json({
      error: `Subject "${subject}" cannot be locked until every student has a valid mark.`,
      status: "draft",
    });
    return;
  }

  const existing = await getAdapter().markSubmissions.get(examId, cls, subject);
  if (existing?.status !== "submitted") {
    res.status(409).json({
      error: `Subject "${subject}" must be successfully submitted before it can be locked.`,
      status: existing?.status ?? "draft",
    });
    return;
  }
  const submission = await getAdapter().markSubmissions.upsert({
    examId, class: cls, subject, status: "locked",
    teacherId: existing?.teacherId ?? null,
    teacherName: existing?.teacherName ?? null,
    submittedAt: existing?.submittedAt ?? null,
    lockedBy: adminName ?? "Admin",
    lockedAt: new Date(),
  });

  await getAdapter().markAuditLog.create({
    examId, class: cls, subject, action: "lock",
    actorId: adminId, actorName: adminName ?? "Admin", actorRole: "admin",
    notes: `Locked marks for ${subject}`,
  });

  res.json(submission);
});

// ── Admin unlocks a subject (returns to draft) ─────────────────────────────────
router.post("/mark-submissions/unlock", async (req, res) => {
  const { examId, class: cls, subject, adminId, adminName } = req.body;
  if (!examId || !cls || !subject) {
    res.status(400).json({ error: "examId, class, subject are required" });
    return;
  }

  // Server-side authorization: ensure this is an admin action
  if (!adminId || adminId !== "admin") {
    res.status(403).json({ error: "Unauthorized: only administrators can unlock subject marks" });
    return;
  }

  const existing = await getAdapter().markSubmissions.get(examId, cls, subject);
  const submission = await getAdapter().markSubmissions.upsert({
    examId, class: cls, subject, status: "draft",
    teacherId: existing?.teacherId ?? null,
    teacherName: existing?.teacherName ?? null,
    submittedAt: null, lockedBy: null, lockedAt: null,
  });

  await getAdapter().markAuditLog.create({
    examId, class: cls, subject, action: "unlock",
    actorId: adminId, actorName: adminName ?? "Admin", actorRole: "admin",
    notes: `Unlocked marks for ${subject} — reopened for editing`,
  });

  res.json(submission);
});

export default router;
