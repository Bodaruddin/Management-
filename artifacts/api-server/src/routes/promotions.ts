import { Router } from "express";
import { getAdapter } from "../lib/dbManager.js";

const router = Router();

router.get("/promotion-records", async (_req, res) => {
  const rows = await getAdapter().promotions.list();
  res.json(rows);
});

router.post("/promotions/student", async (req, res) => {
  const { studentId, toClass } = req.body;
  if (!studentId || !toClass) {
    res.status(400).json({ error: "studentId and toClass are required" });
    return;
  }
  const record = await getAdapter().promotions.promoteStudent(studentId, toClass, req.body);
  res.status(201).json(record);
});

router.post("/promotions/bulk", async (req, res) => {
  const { fromClass, toClass, records } = req.body;
  if (!fromClass || !toClass || !Array.isArray(records)) {
    res.status(400).json({ error: "fromClass, toClass, and records[] are required" });
    return;
  }
  const inserted = await getAdapter().promotions.bulkPromote(fromClass, toClass, records);
  res.status(201).json(inserted);
});

export default router;
