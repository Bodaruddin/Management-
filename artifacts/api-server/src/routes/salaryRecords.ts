import { Router } from "express";
import { getAdapter } from "../lib/dbManager.js";

const router = Router();

router.get("/salary-records", async (_req, res) => {
  const rows = await getAdapter().salaryRecords.list();
  res.json(rows);
});

router.post("/salary-records", async (req, res) => {
  const body = req.body;
  if (!body.teacherId) { res.status(400).json({ error: "teacherId is required" }); return; }
  const row = await getAdapter().salaryRecords.create(body);
  res.status(201).json(row);
});

router.put("/salary-records/:id", async (req, res) => {
  const row = await getAdapter().salaryRecords.update(req.params.id, req.body);
  if (!row) { res.status(404).json({ error: "SalaryRecord not found" }); return; }
  res.json(row);
});

router.put("/salary-records/teacher/:teacherId/:month/:year", async (req, res) => {
  const { teacherId, month, year } = req.params;
  const { row, created } = await getAdapter().salaryRecords.upsertByTeacher(
    teacherId, month, Number(year), req.body,
  );
  res.status(created ? 201 : 200).json(row);
});

router.delete("/salary-records/:id", async (req, res) => {
  await getAdapter().salaryRecords.delete(req.params.id);
  res.status(204).send();
});

export default router;
