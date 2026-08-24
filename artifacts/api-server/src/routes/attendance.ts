import { Router } from "express";
import { getAdapter } from "../lib/dbManager.js";

const router = Router();

router.get("/attendance", async (_req, res) => {
  const rows = await getAdapter().attendance.list();
  res.json(rows);
});

router.post("/attendance", async (req, res) => {
  const records: any[] = Array.isArray(req.body) ? req.body : req.body.records ?? [];
  if (!records.length) { res.status(400).json({ error: "records array is required" }); return; }
  const { date, class: cls } = records[0];
  const inserted = await getAdapter().attendance.bulkUpsert(date, cls, records);

  // Auto-inactivate students who exceed their class's consecutive absent limit
  const absentIds = records
    .filter((r: any) => r.status === "absent")
    .map((r: any) => r.studentId)
    .filter(Boolean);

  let inactivated: string[] = [];
  try {
    inactivated = await getAdapter().attendance.checkAndMarkInactive(date, cls, absentIds);
  } catch {
    // Non-fatal: auto-inactive check failure should not block attendance submission
  }

  res.status(201).json({ records: inserted, inactivated });
});

export default router;
