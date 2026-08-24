import { Router } from "express";
import { getAdapter } from "../lib/dbManager.js";

const router = Router();

router.get("/exam-results", async (_req, res) => {
  const rows = await getAdapter().examResults.list();
  res.json(rows);
});

router.post("/exam-results/bulk", async (req, res) => {
  const records: any[] = Array.isArray(req.body) ? req.body : req.body.results ?? [];
  if (!records.length) { res.status(400).json({ error: "results array required" }); return; }
  const adapter = getAdapter();
  const inserted = await adapter.examResults.bulkUpsert(records);

  // Bulk saves are also used when an admin clears/resets marks. Reconcile
  // submission state after the write so an old submitted/locked state can
  // never survive after any student no longer has a valid mark.
  const submissions = await adapter.markSubmissions.list();
  const students = await adapter.students.list();
  const results = await adapter.examResults.list();
  for (const submission of submissions) {
    if (submission.status !== "submitted" && submission.status !== "locked") continue;
    const classStudentIds = students
      .filter((student: any) => student.class === submission.class)
      .map((student: any) => student.id);
    const marksByStudent = new Map(
      results
        .filter((result: any) =>
          result.examId === submission.examId &&
          result.class === submission.class &&
          classStudentIds.includes(result.studentId),
        )
        .map((result: any) => [result.studentId, result.marks?.[submission.subject]]),
    );
    const complete = classStudentIds.length > 0 &&
      classStudentIds.every((studentId: string) => {
        const mark = marksByStudent.get(studentId);
        return typeof mark === "number" && Number.isFinite(mark) && mark >= 0;
      });
    if (!complete) {
      await adapter.markSubmissions.upsert({
        examId: submission.examId,
        class: submission.class,
        subject: submission.subject,
        status: "draft",
        teacherId: null,
        teacherName: null,
        submittedAt: null,
        lockedBy: null,
        lockedAt: null,
      });
    }
  }
  res.status(201).json(inserted);
});

router.post("/exam-results", async (req, res) => {
  const row = await getAdapter().examResults.create(req.body);
  res.status(201).json(row);
});

export default router;
