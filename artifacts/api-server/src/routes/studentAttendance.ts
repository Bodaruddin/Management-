import { Router } from "express";
import { getAdapter } from "../lib/dbManager.js";
import {
  getStudentHolidaySettings,
  syncStudentHolidayAttendance,
  syncStudentHolidayAttendanceForDates,
  STUDENT_SUNDAY_HOLIDAY_KEY,
} from "../lib/studentHolidayAttendance.js";

const router = Router();
const HOLIDAY_ALREADY_EXISTS_MESSAGE = "A holiday already exists for this date.";

function isUniqueConstraintViolation(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;

  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const candidate = current as { code?: unknown; cause?: unknown };
    if (candidate.code === "23505") return true;
    current = candidate.cause;
  }

  return false;
}

router.get("/student-attendance/settings", async (_req, res) => {
  const adapter = getAdapter();
  await syncStudentHolidayAttendance(adapter);
  res.json(await getStudentHolidaySettings(adapter));
});

router.put("/student-attendance/settings", async (req, res) => {
  if (req.body?.adminId !== "admin") {
    res.status(403).json({ error: "Only administrators can change student attendance settings" });
    return;
  }
  if (typeof req.body?.sundayHoliday !== "boolean") {
    res.status(400).json({ error: "sundayHoliday must be a boolean" });
    return;
  }

  const adapter = getAdapter();
  await adapter.appSettings.set(STUDENT_SUNDAY_HOLIDAY_KEY, { enabled: req.body.sundayHoliday });
  await syncStudentHolidayAttendance(adapter);
  res.json(await getStudentHolidaySettings(adapter));
});

router.post("/student-attendance/holidays", async (req, res) => {
  if (req.body?.adminId !== "admin") {
    res.status(403).json({ error: "Only administrators can create holidays" });
    return;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(req.body?.date) || !String(req.body?.name ?? "").trim()) {
    res.status(400).json({ error: "A valid date and holiday name are required" });
    return;
  }

  const adapter = getAdapter();
  const date = String(req.body.date);
  const holidays = await adapter.teacherHolidays.list();
  if (holidays.some((holiday) => String(holiday.date).slice(0, 10) === date)) {
    res.status(409).json({ error: HOLIDAY_ALREADY_EXISTS_MESSAGE });
    return;
  }

  let row: Awaited<ReturnType<typeof adapter.teacherHolidays.create>>;
  try {
    row = await adapter.teacherHolidays.create({
      id: req.body.id,
      date,
      name: String(req.body.name).trim(),
    });
  } catch (error) {
    if (isUniqueConstraintViolation(error)) {
      res.status(409).json({ error: HOLIDAY_ALREADY_EXISTS_MESSAGE });
      return;
    }
    throw error;
  }
  await syncStudentHolidayAttendanceForDates(adapter, [row.date]);
  res.status(201).json(row);
});

router.put("/student-attendance/holidays/:id", async (req, res) => {
  if (req.body?.adminId !== "admin") {
    res.status(403).json({ error: "Only administrators can edit holidays" });
    return;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(req.body?.date) || !String(req.body?.name ?? "").trim()) {
    res.status(400).json({ error: "A valid date and holiday name are required" });
    return;
  }

  const adapter = getAdapter();
  const existing = await adapter.teacherHolidays.get(req.params.id);
  if (!existing) {
    res.status(404).json({ error: "Holiday not found" });
    return;
  }
  const date = String(req.body.date);
  const holidays = await adapter.teacherHolidays.list();
  if (holidays.some((holiday) => holiday.id !== req.params.id && String(holiday.date).slice(0, 10) === date)) {
    res.status(409).json({ error: HOLIDAY_ALREADY_EXISTS_MESSAGE });
    return;
  }

  let row: Awaited<ReturnType<typeof adapter.teacherHolidays.update>>;
  try {
    row = await adapter.teacherHolidays.update(req.params.id, {
      date,
      name: String(req.body.name).trim(),
    });
  } catch (error) {
    if (isUniqueConstraintViolation(error)) {
      res.status(409).json({ error: HOLIDAY_ALREADY_EXISTS_MESSAGE });
      return;
    }
    throw error;
  }
  if (!row) {
    res.status(404).json({ error: "Holiday not found" });
    return;
  }
  await syncStudentHolidayAttendanceForDates(adapter, [existing.date, row.date]);
  res.json(row);
});

router.delete("/student-attendance/holidays/:id", async (req, res) => {
  if (req.query.adminId !== "admin") {
    res.status(403).json({ error: "Only administrators can delete holidays" });
    return;
  }
  const adapter = getAdapter();
  const existing = await adapter.teacherHolidays.get(req.params.id);
  if (!existing) {
    res.status(404).json({ error: "Holiday not found" });
    return;
  }
  await adapter.teacherHolidays.delete(req.params.id);
  await syncStudentHolidayAttendanceForDates(adapter, [existing.date]);
  res.status(204).send();
});

export default router;