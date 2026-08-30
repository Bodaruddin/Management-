import { Router } from "express";
import { getAdapter } from "../lib/dbManager.js";

const router = Router();

router.get("/attendance", async (_req, res) => {
  const rows = await getAdapter().attendance.list();
  res.json(rows);
});

router.post("/attendance", async (req, res) => {
  const submittedRecords: any[] = Array.isArray(req.body) ? req.body : req.body.records ?? [];
  if (!submittedRecords.length) { res.status(400).json({ error: "records array is required" }); return; }
  const { date, class: cls } = submittedRecords[0];
  const adapter = getAdapter();

  // Keep an attendance row for every currently inactive student whenever a
  // class attendance day is submitted. Without this, inactive students
  // disappear from reports after their last active attendance record.
  const inactiveStudents = (await adapter.students.list())
    .filter((student: any) => student.class === cls && student.status === "inactive");
  const submittedStudentIds = new Set(submittedRecords.map((record: any) => record.studentId));
  const inactiveRecords = inactiveStudents
    .filter((student: any) => !submittedStudentIds.has(student.id))
    .map((student: any) => ({
      studentId: student.id,
      studentName: student.name,
      class: cls,
      date,
      status: "inactive",
      takenBy: "System",
    }));
  const records = [...submittedRecords, ...inactiveRecords];
  let inserted = await adapter.attendance.bulkUpsert(date, cls, records);

  // Auto-inactivate students who exceed their class's consecutive absent limit
  const absentIds = records
    .filter((r: any) => r.status === "absent")
    .map((r: any) => r.studentId)
    .filter(Boolean);

  let inactivated: string[] = [];
  try {
    inactivated = await adapter.attendance.checkAndMarkInactive(date, cls, absentIds);
  } catch {
    // Non-fatal: auto-inactive check failure should not block attendance submission
  }

  // The auto-inactivation check replaces a transition-day absence with an
  // inactive row. Return the final rows so the client does not briefly show
  // the old absent status until the next full refresh.
  if (inactivated.length > 0) {
    inserted = (await adapter.attendance.list())
      .filter((record: any) => record.class === cls && record.date === date);
  }

  res.status(201).json({ records: inserted, inactivated });
});

export default router;
