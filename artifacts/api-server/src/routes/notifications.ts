import { Router, type Response } from "express";
import { getAdapter } from "../lib/dbManager.js";
import { bearerToken, findAuthSession } from "../lib/authSessions.js";
import {
  getNotificationState,
  deleteStoredNotification,
  editStoredNotification,
  hideNotificationForTeacher,
  isExpoToken,
  markNotificationRead,
  registerNotificationDevice,
  saveDailyNotificationSchedule,
  sendTeacherNotification,
  TIME_PATTERN,
} from "../lib/teacherNotifications.js";

const router = Router();

async function requireRole(
  authorization: string | undefined,
  role: "admin" | "teacher",
  res: Response,
) {
  const session = await findAuthSession(bearerToken(authorization));
  if (!session) {
    res.status(401).json({ error: "A valid session is required" });
    return null;
  }
  if (session.role !== role) {
    res.status(403).json({ error: `A ${role} session is required` });
    return null;
  }
  return session;
}

function parseTarget(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || value.length === 0 || value.length > 200) return undefined;
  return value;
}

router.get("/notifications/admin", async (req, res) => {
  if (!await requireRole(req.get("authorization"), "admin", res)) return;
  const [state, teachers] = await Promise.all([
    getNotificationState(),
    getAdapter().teachers.list(),
  ]);
  const tokenOwners = new Set(state.devices.map((device) => device.teacherId));
  res.json({
    teachers: teachers
      .map((teacher) => ({
        id: String(teacher.id),
        name: String(teacher.name ?? "Teacher"),
        hasPushToken: tokenOwners.has(String(teacher.id)),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    schedule: state.schedule,
    history: state.notifications.slice(0, 30).map((notification) => ({
      id: notification.id,
      title: notification.title,
      body: notification.body,
      sentAt: notification.sentAt,
      recipientCount: notification.teacherIds.length,
      pushAccepted: notification.pushAccepted,
      pushFailed: notification.pushFailed,
      teacherId: notification.teacherIds.length === 1 ? notification.teacherIds[0] : null,
      source: notification.source,
    })),
  });
});

router.post("/notifications/send", async (req, res) => {
  if (!await requireRole(req.get("authorization"), "admin", res)) return;
  const { title, body } = req.body ?? {};
  const teacherId = parseTarget(req.body?.teacherId);
  if (typeof title !== "string" || typeof body !== "string") {
    res.status(400).json({ error: "A title and message are required" });
    return;
  }
  const cleanTitle = title.trim();
  const cleanBody = body.trim();
  if (!cleanTitle || cleanTitle.length > 100 || !cleanBody || cleanBody.length > 500) {
    res.status(400).json({ error: "Title must be 1–100 characters and message 1–500 characters" });
    return;
  }
  if (teacherId === undefined) {
    res.status(400).json({ error: "Choose a valid teacher or all teachers" });
    return;
  }
  const teachers = await getAdapter().teachers.list();
  if (teacherId && !teachers.some((teacher) => String(teacher.id) === teacherId)) {
    res.status(404).json({ error: "Teacher not found" });
    return;
  }
  if (teachers.length === 0) {
    res.status(409).json({ error: "No teachers are available to notify" });
    return;
  }
  const result = await sendTeacherNotification({ title: cleanTitle, body: cleanBody, teacherId });
  res.json(result);
});

router.patch("/notifications/admin/:id", async (req, res) => {
  if (!await requireRole(req.get("authorization"), "admin", res)) return;
  const { title, body } = req.body ?? {};
  if (typeof title !== "string" || typeof body !== "string") {
    res.status(400).json({ error: "A title and message are required" });
    return;
  }
  const cleanTitle = title.trim();
  const cleanBody = body.trim();
  if (!cleanTitle || cleanTitle.length > 100 || !cleanBody || cleanBody.length > 500) {
    res.status(400).json({ error: "Title must be 1–100 characters and message 1–500 characters" });
    return;
  }
  const updated = await editStoredNotification(req.params.id, cleanTitle, cleanBody);
  if (!updated) {
    res.status(404).json({ error: "Notification not found" });
    return;
  }
  res.json({ success: true });
});

router.delete("/notifications/admin/:id", async (req, res) => {
  if (!await requireRole(req.get("authorization"), "admin", res)) return;
  const deleted = await deleteStoredNotification(req.params.id);
  if (!deleted) {
    res.status(404).json({ error: "Notification not found" });
    return;
  }
  res.json({ success: true });
});

router.put("/notifications/schedule", async (req, res) => {
  if (!await requireRole(req.get("authorization"), "admin", res)) return;
  const { enabled, title, body, time } = req.body ?? {};
  const teacherId = parseTarget(req.body?.teacherId);
  if (typeof enabled !== "boolean"
    || typeof title !== "string"
    || typeof body !== "string"
    || typeof time !== "string"
    || !TIME_PATTERN.test(time)) {
    res.status(400).json({ error: "Provide an enabled setting, message, and time in 24-hour HH:MM format" });
    return;
  }
  const cleanTitle = title.trim();
  const cleanBody = body.trim();
  if (cleanTitle.length > 100 || cleanBody.length > 500 || (enabled && (!cleanTitle || !cleanBody))) {
    res.status(400).json({ error: "An enabled daily notification needs a title and message (up to 100 and 500 characters)" });
    return;
  }
  if (teacherId === undefined) {
    res.status(400).json({ error: "Choose a valid teacher or all teachers" });
    return;
  }
  if (teacherId) {
    const teachers = await getAdapter().teachers.list();
    if (!teachers.some((teacher) => String(teacher.id) === teacherId)) {
      res.status(404).json({ error: "Teacher not found" });
      return;
    }
  }
  const schedule = await saveDailyNotificationSchedule({
    enabled,
    title: cleanTitle,
    body: cleanBody,
    time,
    teacherId,
  });
  res.json(schedule);
});

router.get("/notifications/inbox", async (req, res) => {
  const session = await requireRole(req.get("authorization"), "teacher", res);
  if (!session) return;
  const state = await getNotificationState();
  res.json({
    notifications: state.notifications
      .filter((notification) => (
        notification.teacherIds.includes(session.userId)
        && !notification.hiddenFor?.includes(session.userId)
      ))
      .slice(0, 100)
      .map((notification) => ({
        id: notification.id,
        title: notification.title,
        body: notification.body,
        sentAt: notification.sentAt,
        read: Boolean(notification.readAt[session.userId]),
        source: notification.source,
      })),
    pushEnabled: state.devices.some((device) => device.teacherId === session.userId),
  });
});

router.patch("/notifications/inbox/:id/read", async (req, res) => {
  const session = await requireRole(req.get("authorization"), "teacher", res);
  if (!session) return;
  const success = await markNotificationRead(req.params.id, session.userId);
  if (!success) {
    res.status(404).json({ error: "Notification not found for this teacher" });
    return;
  }
  res.json({ success: true });
});

router.delete("/notifications/inbox/:id", async (req, res) => {
  const session = await requireRole(req.get("authorization"), "teacher", res);
  if (!session) return;
  const deleted = await hideNotificationForTeacher(req.params.id, session.userId);
  if (!deleted) {
    res.status(404).json({ error: "Notification not found for this teacher" });
    return;
  }
  res.json({ success: true });
});

router.post("/notifications/device", async (req, res) => {
  const session = await requireRole(req.get("authorization"), "teacher", res);
  if (!session) return;
  const token = req.body?.token;
  if (!isExpoToken(token)) {
    res.status(400).json({ error: "A valid Expo push token is required" });
    return;
  }
  const teachers = await getAdapter().teachers.list();
  if (!teachers.some((teacher) => String(teacher.id) === session.userId)) {
    res.status(404).json({ error: "Teacher account not found" });
    return;
  }
  await registerNotificationDevice(session.userId, token);
  res.json({ registered: true });
});

export default router;
