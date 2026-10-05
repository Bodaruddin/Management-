import { Router } from "express";
import { getAdapter } from "../lib/dbManager.js";
import {
  bearerToken,
  createAuthSession,
  findAuthSession,
  revokeTeacherSessions,
} from "../lib/authSessions.js";

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
  const normalizedUsername = String(username).trim().toLowerCase();
  const teacher = teachers.find(
    (t) => String(t.username ?? "").trim().toLowerCase() === normalizedUsername && t.password === password,
  );
  if (!teacher) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  // Never send the password back to the client
  const { password: _pw, ...safeTeacher } = teacher;
  const session = await createAuthSession(String(teacher.id), "teacher");
  res.json({ ...safeTeacher, ...session });
});

router.post("/teachers/:id/force-logout", async (req, res) => {
  const session = await findAuthSession(bearerToken(req.get("authorization")));
  if (!session) {
    res.status(401).json({ error: "ADMIN_SESSION_REQUIRED" });
    return;
  }
  if (session.role !== "admin") {
    res.status(403).json({ error: "Only an administrator can sign out a teacher" });
    return;
  }

  const teacherId = req.params.id;
  const teacher = (await getAdapter().teachers.list()).find(
    (row: any) => String(row.id) === teacherId,
  );
  if (!teacher) {
    res.status(404).json({ error: "Teacher not found" });
    return;
  }

  const revokedSessions = await revokeTeacherSessions(teacherId);
  res.json({ success: true, revokedSessions });
});

router.post("/teachers", async (req, res) => {
  const body = req.body;
  if (!body.name || !body.username || (body.salary !== undefined && (!Number.isInteger(body.salary) || body.salary < 0))) {
    res.status(400).json({ error: "name and username are required; monthly salary must be a non-negative integer when provided" });
    return;
  }
  if (body.permissions?.facelessAttendance === true) {
    const session = await findAuthSession(bearerToken(req.get("authorization")));
    if (!session) {
      res.status(401).json({ error: "A valid administrator session is required to grant face-free attendance" });
      return;
    }
    if (session.role !== "admin") {
      res.status(403).json({ error: "Only administrators can grant face-free attendance" });
      return;
    }
  }
  const row = await getAdapter().teachers.create(body);
  res.status(201).json(row);
});

router.put("/teachers/:id", async (req, res) => {
  const body = req.body ?? {};
  if (body.salary !== undefined && (!Number.isInteger(body.salary) || body.salary < 0)) {
    res.status(400).json({ error: "monthly salary must be a non-negative integer" });
    return;
  }
  if (body.permissions && Object.prototype.hasOwnProperty.call(body.permissions, "facelessAttendance")) {
    const session = await findAuthSession(bearerToken(req.get("authorization")));
    if (!session) {
      res.status(401).json({ error: "A valid administrator session is required to change face-free attendance permission" });
      return;
    }
    if (session.role !== "admin") {
      res.status(403).json({ error: "Only administrators can change face-free attendance permission" });
      return;
    }
  }

  // Keep the new, separately-administered permission when older profile-edit
  // screens send an object containing only the established permission fields.
  let changes = body;
  if (body.permissions && body.permissions.facelessAttendance === undefined) {
    const currentTeacher = (await getAdapter().teachers.list()).find(
      (teacher: any) => String(teacher.id) === req.params.id,
    );
    if (currentTeacher) {
      changes = {
        ...body,
        permissions: { ...(currentTeacher.permissions ?? {}), ...body.permissions },
      };
    }
  }

  const row = await getAdapter().teachers.update(req.params.id, changes);
  if (!row) { res.status(404).json({ error: "Teacher not found" }); return; }
  res.json(row);
});

router.put("/teachers/:id/faceless-attendance-permission", async (req, res) => {
  const session = await findAuthSession(bearerToken(req.get("authorization")));
  if (!session) {
    res.status(401).json({ error: "A valid administrator session is required" });
    return;
  }
  if (session.role !== "admin") {
    res.status(403).json({ error: "Only administrators can change face-free attendance permission" });
    return;
  }

  const enabled = req.body?.enabled;
  if (typeof enabled !== "boolean") {
    res.status(400).json({ error: "enabled must be a boolean" });
    return;
  }
  const adapter = getAdapter();
  const teacher = (await adapter.teachers.list()).find(
    (row: any) => String(row.id) === req.params.id,
  );
  if (!teacher) {
    res.status(404).json({ error: "Teacher not found" });
    return;
  }
  await adapter.teachers.update(req.params.id, {
    permissions: { ...(teacher.permissions ?? {}), facelessAttendance: enabled },
  });
  res.json({ teacherId: req.params.id, enabled });
});

router.delete("/teachers/:id", async (req, res) => {
  await getAdapter().teachers.delete(req.params.id);
  res.status(204).send();
});

export default router;
