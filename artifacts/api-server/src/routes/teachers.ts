import { Router } from "express";
import { getAdapter } from "../lib/dbManager.js";

const router = Router();

router.get("/teachers", async (_req, res) => {
  const rows = await getAdapter().teachers.list();
  res.json(rows);
});

/** POST /api/teachers/login  { username, password } → teacher (without password) */
router.post("/teachers/login", async (req, res) => {
  const { username, password } = req.body ?? {};
  if (!username || !password) {
    res.status(400).json({ error: "username and password are required" });
    return;
  }
  let teachers: any[];
  try {
    teachers = await getAdapter().teachers.list() as any[];
  } catch (error: any) {
    if (error?.code === "NO_DB_CONNECTION") {
      res.status(503).json({ error: "DATABASE_NOT_READY" });
      return;
    }
    throw error;
  }
  const teacher = teachers.find((t) => t.username === username && t.password === password);
  if (!teacher) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  // Never send the password back to the client
  const { password: _pw, ...safeTeacher } = teacher;
  res.json(safeTeacher);
});

router.post("/teachers", async (req, res) => {
  const body = req.body;
  if (!body.name || !body.username || (body.salary !== undefined && (!Number.isInteger(body.salary) || body.salary < 0))) {
    res.status(400).json({ error: "name and username are required; monthly salary must be a non-negative integer when provided" });
    return;
  }
  const row = await getAdapter().teachers.create(body);
  res.status(201).json(row);
});

router.put("/teachers/:id", async (req, res) => {
  if (req.body.salary !== undefined && (!Number.isInteger(req.body.salary) || req.body.salary < 0)) {
    res.status(400).json({ error: "monthly salary must be a non-negative integer" });
    return;
  }
  const row = await getAdapter().teachers.update(req.params.id, req.body);
  if (!row) { res.status(404).json({ error: "Teacher not found" }); return; }
  res.json(row);
});

router.delete("/teachers/:id", async (req, res) => {
  await getAdapter().teachers.delete(req.params.id);
  res.status(204).send();
});

export default router;
