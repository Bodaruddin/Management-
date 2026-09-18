import { Router } from "express";
import { getAdapter } from "../lib/dbManager.js";

const router = Router();

router.get("/exams", async (_req, res) => {
  const rows = await getAdapter().exams.list();
  res.json(rows);
});

router.post("/exams", async (req, res) => {
  const body = req.body;
  if (!body.name || !body.class) { res.status(400).json({ error: "name and class are required" }); return; }
  const row = await getAdapter().exams.create(body);
  res.status(201).json(row);
});

router.put("/exams/:id", async (req, res) => {
  const row = await getAdapter().exams.update(req.params.id, req.body);
  if (!row) { res.status(404).json({ error: "Exam not found" }); return; }
  res.json(row);
});

router.delete("/exams/:id", async (req, res) => {
  await getAdapter().exams.delete(req.params.id);
  res.status(204).send();
});

export default router;
