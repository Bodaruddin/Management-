import { Router } from "express";
import { getAdapter } from "../lib/dbManager.js";

const router = Router();
const TEACHER_EDIT_KEY = "allow_teacher_edit";
const CLASS_ABSENT_LIMITS_KEY = "class_absent_limits";
const DOCUMENT_BRANDING_KEY = "document_branding";
const ADMIN_CREDENTIALS_KEY = "admin_credentials";

const DEFAULT_ADMIN = { username: "admin", password: "admin123" };

async function getAdminCredentials(): Promise<{ username: string; password: string }> {
  const setting = await getAdapter().appSettings.get(ADMIN_CREDENTIALS_KEY);
  if (!setting?.value) return { ...DEFAULT_ADMIN };
  const v = setting.value as Record<string, string>;
  return { username: v.username ?? DEFAULT_ADMIN.username, password: v.password ?? DEFAULT_ADMIN.password };
}

const EMPTY_DOCUMENT_BRANDING = {
  logoDataUrl: null,
  signatureDataUrl: null,
  principalSignatureDataUrl: null,
  teacherSignatureDataUrl: null,
  examInChargeSignatureDataUrl: null,
};

function isImageDataUrl(value: unknown): value is string {
  return typeof value === "string" && /^data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=\s]+$/i.test(value);
}

function validateBrandingValue(value: unknown, field: string): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (!isImageDataUrl(value)) throw new Error(`${field} must be a base64 image data URL`);
  if (value.length > 4_000_000) throw new Error(`${field} is too large; choose a smaller image`);
  return value;
}

// ─── Admin credentials ────────────────────────────────────────────────────────

/** POST /api/settings/admin-credentials/verify  { username, password } → { valid } */
router.post("/settings/admin-credentials/verify", async (req, res) => {
  const { username, password } = req.body ?? {};
  if (!username || !password) {
    res.status(400).json({ error: "username and password are required" });
    return;
  }
  const creds = await getAdminCredentials();
  const valid = username === creds.username && password === creds.password;
  res.json({ valid });
});

/** GET /api/settings/admin-credentials → { username } */
router.get("/settings/admin-credentials", async (_req, res) => {
  const creds = await getAdminCredentials();
  res.json({ username: creds.username });
});

/** PUT /api/settings/admin-credentials  { currentPassword, newUsername?, newPassword? } */
router.put("/settings/admin-credentials", async (req, res) => {
  const { currentPassword, newUsername, newPassword } = req.body ?? {};
  if (!currentPassword) {
    res.status(400).json({ error: "currentPassword is required" });
    return;
  }
  const creds = await getAdminCredentials();
  if (currentPassword !== creds.password) {
    res.status(403).json({ error: "Current password is incorrect" });
    return;
  }
  if (newUsername !== undefined && (typeof newUsername !== "string" || newUsername.trim().length < 3)) {
    res.status(400).json({ error: "Username must be at least 3 characters" });
    return;
  }
  if (newPassword !== undefined && (typeof newPassword !== "string" || newPassword.length < 6)) {
    res.status(400).json({ error: "Password must be at least 6 characters" });
    return;
  }
  const updated = {
    username: newUsername?.trim() ?? creds.username,
    password: newPassword ?? creds.password,
  };
  await getAdapter().appSettings.set(ADMIN_CREDENTIALS_KEY, updated);
  res.json({ username: updated.username });
});

// ─── Document branding ────────────────────────────────────────────────────────

router.get("/settings/document-branding", async (_req, res) => {
  const setting = await getAdapter().appSettings.get(DOCUMENT_BRANDING_KEY);
  res.json({ ...EMPTY_DOCUMENT_BRANDING, ...(setting?.value as Record<string, unknown> ?? {}) });
});

router.put("/settings/document-branding", async (req, res) => {
  const {
    logoDataUrl,
    signatureDataUrl,
    principalSignatureDataUrl,
    teacherSignatureDataUrl,
    examInChargeSignatureDataUrl,
    adminId,
  } = req.body ?? {};
  if (adminId !== "admin") {
    res.status(403).json({ error: "Unauthorized: only administrators can change document branding" });
    return;
  }
  try {
    const existing = await getAdapter().appSettings.get(DOCUMENT_BRANDING_KEY);
    const previous = (existing?.value as Record<string, unknown> | undefined) ?? {};
    const branding = {
      logoDataUrl: validateBrandingValue(
        logoDataUrl === undefined ? previous.logoDataUrl : logoDataUrl, "logoDataUrl",
      ),
      signatureDataUrl: validateBrandingValue(
        signatureDataUrl === undefined ? previous.signatureDataUrl : signatureDataUrl, "signatureDataUrl",
      ),
      principalSignatureDataUrl: validateBrandingValue(
        principalSignatureDataUrl === undefined ? previous.principalSignatureDataUrl : principalSignatureDataUrl,
        "principalSignatureDataUrl",
      ),
      teacherSignatureDataUrl: validateBrandingValue(
        teacherSignatureDataUrl === undefined ? previous.teacherSignatureDataUrl : teacherSignatureDataUrl,
        "teacherSignatureDataUrl",
      ),
      examInChargeSignatureDataUrl: validateBrandingValue(
        examInChargeSignatureDataUrl === undefined ? previous.examInChargeSignatureDataUrl : examInChargeSignatureDataUrl,
        "examInChargeSignatureDataUrl",
      ),
    };
    await getAdapter().appSettings.set(DOCUMENT_BRANDING_KEY, branding);
    res.json(branding);
  } catch (e: any) {
    res.status(400).json({ error: e?.message ?? "Invalid document branding" });
  }
});

router.get("/settings/teacher-edit", async (_req, res) => {
  const setting = await getAdapter().appSettings.get(TEACHER_EDIT_KEY);
  res.json({ allowTeacherEdit: setting?.value === true });
});

router.put("/settings/teacher-edit", async (req, res) => {
  const { allowTeacherEdit, adminId } = req.body;
  if (adminId !== "admin") {
    res.status(403).json({ error: "Unauthorized: only administrators can change teacher edit settings" });
    return;
  }
  if (typeof allowTeacherEdit !== "boolean") {
    res.status(400).json({ error: "allowTeacherEdit must be a boolean" });
    return;
  }
  await getAdapter().appSettings.set(TEACHER_EDIT_KEY, allowTeacherEdit);
  res.json({ allowTeacherEdit });
});

// ─── Class Absent Limits ──────────────────────────────────────────────────────

/** GET /api/settings/class-absent-limits → { "Class 1": 5, "Class 2": 7, … } */
router.get("/settings/class-absent-limits", async (_req, res) => {
  const setting = await getAdapter().appSettings.get(CLASS_ABSENT_LIMITS_KEY);
  res.json((setting?.value as Record<string, number>) ?? {});
});

/** PUT /api/settings/class-absent-limits { className, maxDays, adminId } */
router.put("/settings/class-absent-limits", async (req, res) => {
  const { className, maxDays, adminId } = req.body;
  if (adminId !== "admin") {
    res.status(403).json({ error: "Unauthorized: only administrators can change class absent limits" });
    return;
  }
  if (!className || typeof className !== "string") {
    res.status(400).json({ error: "className is required" });
    return;
  }
  const days = Number(maxDays);
  if (!Number.isInteger(days) || days < 0) {
    res.status(400).json({ error: "maxDays must be a non-negative integer (0 = no limit)" });
    return;
  }

  // Read current limits, update the entry for this class, and save
  const current = await getAdapter().appSettings.get(CLASS_ABSENT_LIMITS_KEY);
  const limits: Record<string, number> = (current?.value as any) ?? {};
  if (days === 0) {
    delete limits[className]; // 0 means "no limit" — remove the key
  } else {
    limits[className] = days;
  }
  await getAdapter().appSettings.set(CLASS_ABSENT_LIMITS_KEY, limits);
  res.json(limits);
});

// ─── Academic Sessions ────────────────────────────────────────────────────────

const ACADEMIC_SESSIONS_KEY = "academic_sessions";

interface AcademicSessionsData {
  sessions: string[];
  activeSession: string;
}

function defaultAcademicYear(): string {
  const y = new Date().getFullYear();
  return new Date().getMonth() >= 3 ? `${y}–${y + 1}` : `${y - 1}–${y}`;
}

/** GET /api/settings/academic-sessions → { sessions: string[], activeSession: string } */
router.get("/settings/academic-sessions", async (_req, res) => {
  const setting = await getAdapter().appSettings.get(ACADEMIC_SESSIONS_KEY);
  const data = setting?.value as AcademicSessionsData | undefined;
  const currentYear = defaultAcademicYear();
  if (!data) {
    res.json({ sessions: [currentYear], activeSession: currentYear });
    return;
  }
  const sessions = data.sessions?.length ? data.sessions : [currentYear];
  const activeSession = data.activeSession && sessions.includes(data.activeSession)
    ? data.activeSession
    : sessions[0];
  res.json({ sessions, activeSession });
});

/** PUT /api/settings/academic-sessions  { sessions?, activeSession?, adminId } */
router.put("/settings/academic-sessions", async (req, res) => {
  const { sessions, activeSession, adminId } = req.body ?? {};
  if (adminId !== "admin") {
    res.status(403).json({ error: "Unauthorized: only administrators can manage academic sessions" });
    return;
  }

  const setting = await getAdapter().appSettings.get(ACADEMIC_SESSIONS_KEY);
  const current = (setting?.value as AcademicSessionsData | undefined) ?? {
    sessions: [defaultAcademicYear()],
    activeSession: defaultAcademicYear(),
  };

  let updatedSessions: string[] = current.sessions;
  if (sessions !== undefined) {
    if (!Array.isArray(sessions) || sessions.some((s: unknown) => typeof s !== "string" || !(s as string).trim())) {
      res.status(400).json({ error: "sessions must be an array of non-empty strings" });
      return;
    }
    updatedSessions = sessions.map((s: string) => s.trim()).filter(Boolean);
    if (updatedSessions.length === 0) {
      res.status(400).json({ error: "At least one session is required" });
      return;
    }
  }

  let updatedActive = current.activeSession;
  if (activeSession !== undefined) {
    if (typeof activeSession !== "string" || !activeSession.trim()) {
      res.status(400).json({ error: "activeSession must be a non-empty string" });
      return;
    }
    updatedActive = activeSession.trim();
    if (!updatedSessions.includes(updatedActive)) {
      updatedSessions = [...updatedSessions, updatedActive];
    }
  }

  if (!updatedSessions.includes(updatedActive)) {
    updatedActive = updatedSessions[0];
  }

  const result: AcademicSessionsData = { sessions: updatedSessions, activeSession: updatedActive };
  await getAdapter().appSettings.set(ACADEMIC_SESSIONS_KEY, result);
  res.json(result);
});

/** DELETE /api/settings/academic-sessions/:session  ?adminId=admin */
router.delete("/settings/academic-sessions/:session", async (req, res) => {
  const { adminId } = req.query;
  if (adminId !== "admin") {
    res.status(403).json({ error: "Unauthorized: only administrators can delete academic sessions" });
    return;
  }
  const sessionToDelete = decodeURIComponent(req.params.session);

  const setting = await getAdapter().appSettings.get(ACADEMIC_SESSIONS_KEY);
  const current = (setting?.value as AcademicSessionsData | undefined) ?? {
    sessions: [defaultAcademicYear()],
    activeSession: defaultAcademicYear(),
  };

  const updatedSessions = current.sessions.filter(s => s !== sessionToDelete);
  if (updatedSessions.length === 0) {
    res.status(400).json({ error: "Cannot delete the last academic session" });
    return;
  }

  const updatedActive = updatedSessions.includes(current.activeSession)
    ? current.activeSession
    : updatedSessions[0];

  const result: AcademicSessionsData = { sessions: updatedSessions, activeSession: updatedActive };
  await getAdapter().appSettings.set(ACADEMIC_SESSIONS_KEY, result);
  res.json(result);
});

export default router;
