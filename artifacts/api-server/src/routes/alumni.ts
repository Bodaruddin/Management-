import { Router } from "express";
import { getAdapter } from "../lib/dbManager.js";

const router = Router();

function normalizeImportRecord(data: any) {
  const studentId = String(data?.studentId ?? data?.student_id ?? "").trim();
  const studentName = String(data?.studentName ?? data?.student_name ?? data?.name ?? "").trim();
  const className = String(data?.class ?? data?.passOutClass ?? "").trim();
  const graduationYear = String(
    data?.graduationYear ?? data?.graduation_year ?? data?.batch ?? "",
  ).trim();

  if (!studentId || !studentName || !className || !graduationYear) {
    throw new Error(
      "Each imported student must include a student ID, name, class, and graduation year.",
    );
  }

  return {
    ...data,
    studentId,
    studentName,
    class: className,
    section: data?.section == null || data.section === "" ? null : String(data.section),
    rollNumber: data?.rollNumber ?? data?.roll_number ?? "",
    graduationYear,
    // Keep the existing Alumni display model in sync with the import columns.
    name: studentName,
    batch: graduationYear,
    passOutClass: className,
  };
}

router.get("/alumni", async (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  await getAdapter().alumni.syncGraduatedStudents();
  const rows = await getAdapter().alumni.list();
  res.json(rows);
});

router.post("/alumni", async (req, res) => {
  const body = req.body;
  if (!body.name || !body.batch || !body.passOutClass) {
    res.status(400).json({ error: "name, batch, and passOutClass are required" });
    return;
  }
  const row = await getAdapter().alumni.create(body);
  res.status(201).json(row);
});

router.put("/alumni/:id", async (req, res) => {
  const row = await getAdapter().alumni.update(req.params.id, req.body);
  if (!row) { res.status(404).json({ error: "Alumni not found" }); return; }
  res.json(row);
});

router.post("/alumni/bulk", async (req, res) => {
  const { records } = req.body ?? {};
  if (!Array.isArray(records) || records.length === 0) {
    res.status(400).json({ error: "records array is required" });
    return;
  }
  try {
    // Remove duplicate IDs from a single request before it reaches PostgreSQL.
    // PostgreSQL rejects a multi-row upsert when two values conflict with the
    // same target row in that same statement.
    const normalized = Array.from(
      new Map(records.map((record: any) => {
        const value = normalizeImportRecord(record);
        return [value.studentId, value];
      })).values(),
    );
    const rows = await getAdapter().alumni.bulkCreate(normalized);
    res.status(201).json(rows);
  } catch (error) {
    req.log.error({ err: error }, "Alumni bulk import failed");
    const message = error instanceof Error && error.message.startsWith("Each imported")
      ? error.message
      : "We couldn't import these students. Please check the student data and try again.";
    res.status(400).json({ error: message });
  }
});

router.delete("/alumni/:id", async (req, res) => {
  await getAdapter().alumni.delete(req.params.id);
  res.status(204).send();
});

export default router;
