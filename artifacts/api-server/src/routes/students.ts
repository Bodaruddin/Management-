import { Router } from "express";
import { getAdapter } from "../lib/dbManager.js";

const router = Router();

router.get("/students", async (req, res) => {
  // Repair legacy Alumni imports before returning the active student list.
  // This keeps parallel dashboard loads from briefly exposing graduated
  // students with their old class assignment.
  await getAdapter().alumni.syncGraduatedStudents();
  const includeGraduated = req.query.includeGraduated === "true";
  const rows = await getAdapter().students.list(includeGraduated);
  res.json(rows);
});

router.post("/students", async (req, res) => {
  const body = req.body;
  if (!body.name || !body.class || !body.rollNumber) {
    res.status(400).json({ error: "name, class, and rollNumber are required" });
    return;
  }
  const row = await getAdapter().students.create(body);
  res.status(201).json(row);
});

router.put("/students/:id", async (req, res) => {
  const row = await getAdapter().students.update(req.params.id, req.body);
  if (!row) { res.status(404).json({ error: "Student not found" }); return; }
  res.json(row);
});

router.put("/students/:id/status", async (req, res) => {
  const { status } = req.body;
  if (!["active", "inactive", "graduated"].includes(status)) {
    res.status(400).json({ error: "status must be 'active', 'inactive', or 'graduated'" });
    return;
  }
  const row = await getAdapter().students.setStatus(req.params.id, status as "active" | "inactive" | "graduated");
  if (!row) { res.status(404).json({ error: "Student not found" }); return; }
  res.json(row);
});

router.delete("/students/:id", async (req, res) => {
  await getAdapter().students.delete(req.params.id);
  res.status(204).send();
});

export default router;
