import { randomUUID } from "node:crypto";
import { getAdapter } from "./dbManager.js";
import { logger } from "./logger.js";

const STORE_KEY = "teacher_notifications_v1";
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const MAX_HISTORY = 300;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface DailyNotificationSchedule {
  enabled: boolean;
  title: string;
  body: string;
  time: string;
  timeZone: string;
  teacherId: string | null;
  lastSentDate: string | null;
}

interface DeviceRegistration {
  teacherId: string;
  token: string;
  updatedAt: string;
}

interface StoredNotification {
  id: string;
  title: string;
  body: string;
  sentAt: string;
  teacherIds: string[];
  readAt: Record<string, string>;
  source: "manual" | "daily";
  pushAccepted: number;
  pushFailed: number;
  scheduleDate?: string;
}

interface NotificationState {
  devices: DeviceRegistration[];
  notifications: StoredNotification[];
  schedule: DailyNotificationSchedule;
}

interface PushResult {
  accepted: number;
  failed: number;
  invalidTokens: Set<string>;
}

const defaultTimeZone = (() => {
  const candidate = process.env.SCHOOL_TIME_ZONE || "Asia/Kolkata";
  try {
    new Intl.DateTimeFormat("en", { timeZone: candidate });
    return candidate;
  } catch {
    return "Asia/Kolkata";
  }
})();

function emptyState(): NotificationState {
  return {
    devices: [],
    notifications: [],
    schedule: {
      enabled: false,
      title: "",
      body: "",
      time: "08:00",
      timeZone: defaultTimeZone,
      teacherId: null,
      lastSentDate: null,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isExpoToken(value: unknown): value is string {
  return typeof value === "string"
    && value.length <= 200
    && /^(Expo|Exponent)PushToken\[[^\]\s]+\]$/.test(value);
}

async function loadState(): Promise<NotificationState> {
  const stored = await getAdapter().appSettings.get(STORE_KEY);
  const value = isRecord(stored?.value) ? stored.value : {};
  const defaults = emptyState();
  const rawSchedule = isRecord(value.schedule) ? value.schedule : {};
  const schedule: DailyNotificationSchedule = {
    enabled: rawSchedule.enabled === true,
    title: typeof rawSchedule.title === "string" ? rawSchedule.title : "",
    body: typeof rawSchedule.body === "string" ? rawSchedule.body : "",
    time: typeof rawSchedule.time === "string" && TIME_PATTERN.test(rawSchedule.time)
      ? rawSchedule.time
      : defaults.schedule.time,
    timeZone: typeof rawSchedule.timeZone === "string" ? rawSchedule.timeZone : defaultTimeZone,
    teacherId: typeof rawSchedule.teacherId === "string" ? rawSchedule.teacherId : null,
    lastSentDate: typeof rawSchedule.lastSentDate === "string" ? rawSchedule.lastSentDate : null,
  };
  try {
    new Intl.DateTimeFormat("en", { timeZone: schedule.timeZone });
  } catch {
    schedule.timeZone = defaultTimeZone;
  }

  const devices = Array.isArray(value.devices)
    ? value.devices.filter((device: unknown): device is DeviceRegistration => (
      isRecord(device)
      && typeof device.teacherId === "string"
      && isExpoToken(device.token)
      && typeof device.updatedAt === "string"
    ))
    : [];
  const notifications = Array.isArray(value.notifications)
    ? value.notifications.filter((item: unknown): item is StoredNotification => (
      isRecord(item)
      && typeof item.id === "string"
      && typeof item.title === "string"
      && typeof item.body === "string"
      && typeof item.sentAt === "string"
      && Array.isArray(item.teacherIds)
      && item.teacherIds.every((id) => typeof id === "string")
      && isRecord(item.readAt)
      && (item.source === "manual" || item.source === "daily")
    )).slice(0, MAX_HISTORY)
    : [];

  return { devices, notifications, schedule };
}

let stateQueue: Promise<unknown> = Promise.resolve();

async function updateState<T>(
  update: (state: NotificationState) => T | Promise<T>,
  shouldSave: (value: T) => boolean = () => true,
): Promise<T> {
  const result = stateQueue.then(async () => {
    const state = await loadState();
    const value = await update(state);
    if (shouldSave(value)) await getAdapter().appSettings.set(STORE_KEY, state);
    return value;
  });
  stateQueue = result.then(() => undefined, () => undefined);
  return result;
}

export async function getNotificationState(): Promise<NotificationState> {
  await stateQueue;
  return loadState();
}

function chunk<T>(items: T[], size: number): T[][] {
  const groups: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    groups.push(items.slice(index, index + size));
  }
  return groups;
}

async function sendPushMessages(
  notification: Pick<StoredNotification, "id" | "title" | "body">,
  devices: DeviceRegistration[],
): Promise<PushResult> {
  const result: PushResult = { accepted: 0, failed: 0, invalidTokens: new Set() };
  for (const batch of chunk(devices, 100)) {
    try {
      const response = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "Accept-Encoding": "gzip, deflate",
        },
        body: JSON.stringify(batch.map((device) => ({
          to: device.token,
          sound: "default",
          title: notification.title,
          body: notification.body,
          data: { notificationId: notification.id, screen: "notifications" },
        }))),
        signal: AbortSignal.timeout(12_000),
      });
      if (!response.ok) {
        result.failed += batch.length;
        logger.warn({ status: response.status, count: batch.length }, "Expo push delivery request failed");
        continue;
      }

      const payload = await response.json() as { data?: Array<{
        status?: string;
        details?: { error?: string };
      }> };
      const tickets = Array.isArray(payload.data) ? payload.data : [];
      for (let index = 0; index < batch.length; index += 1) {
        const ticket = tickets[index];
        if (ticket?.status === "ok") {
          result.accepted += 1;
        } else {
          result.failed += 1;
          if (ticket?.details?.error === "DeviceNotRegistered") {
            result.invalidTokens.add(batch[index].token);
          }
        }
      }
    } catch (error) {
      result.failed += batch.length;
      logger.warn({ error, count: batch.length }, "Expo push service could not be reached");
    }
  }
  return result;
}

async function createAndDeliver(input: {
  title: string;
  body: string;
  teacherId: string | null;
  source: "manual" | "daily";
  scheduleDate?: string;
}): Promise<{
  notificationId: string;
  targetCount: number;
  pushAccepted: number;
  pushFailed: number;
  inAppCount: number;
}> {
  const teachers = await getAdapter().teachers.list();
  const recipients = input.teacherId
    ? teachers.filter((teacher) => String(teacher.id) === input.teacherId)
    : teachers;
  const teacherIds = recipients.map((teacher) => String(teacher.id));
  const notification: StoredNotification = {
    id: randomUUID(),
    title: input.title,
    body: input.body,
    sentAt: new Date().toISOString(),
    teacherIds,
    readAt: {},
    source: input.source,
    pushAccepted: 0,
    pushFailed: 0,
    ...(input.scheduleDate ? { scheduleDate: input.scheduleDate } : {}),
  };

  const devices = await updateState((state) => {
    state.notifications.unshift(notification);
    state.notifications = state.notifications.slice(0, MAX_HISTORY);
    const recipientsSet = new Set(teacherIds);
    return state.devices.filter((device) => recipientsSet.has(device.teacherId));
  });

  const pushResult = await sendPushMessages(notification, devices);
  await updateState((state) => {
    const saved = state.notifications.find((item) => item.id === notification.id);
    if (saved) {
      saved.pushAccepted = pushResult.accepted;
      saved.pushFailed = pushResult.failed;
    }
    if (pushResult.invalidTokens.size > 0) {
      state.devices = state.devices.filter((device) => !pushResult.invalidTokens.has(device.token));
    }
  });

  return {
    notificationId: notification.id,
    targetCount: teacherIds.length,
    pushAccepted: pushResult.accepted,
    pushFailed: pushResult.failed,
    inAppCount: teacherIds.length,
  };
}

export async function sendTeacherNotification(input: {
  title: string;
  body: string;
  teacherId: string | null;
}): Promise<{
  notificationId: string;
  targetCount: number;
  pushAccepted: number;
  pushFailed: number;
  inAppCount: number;
}> {
  return createAndDeliver({ ...input, source: "manual" });
}

export async function saveDailyNotificationSchedule(input: {
  enabled: boolean;
  title: string;
  body: string;
  time: string;
  teacherId: string | null;
}): Promise<DailyNotificationSchedule> {
  return updateState((state) => {
    state.schedule = {
      ...state.schedule,
      enabled: input.enabled,
      title: input.title,
      body: input.body,
      time: input.time,
      teacherId: input.teacherId,
    };
    return state.schedule;
  });
}

export async function registerNotificationDevice(teacherId: string, token: string): Promise<void> {
  await updateState((state) => {
    state.devices = state.devices.filter((device) => device.token !== token);
    state.devices.push({ teacherId, token, updatedAt: new Date().toISOString() });
  });
}

export async function markNotificationRead(id: string, teacherId: string): Promise<boolean> {
  return updateState((state) => {
    const notification = state.notifications.find((item) => item.id === id);
    if (!notification || !notification.teacherIds.includes(teacherId)) return false;
    notification.readAt[teacherId] = new Date().toISOString();
    return true;
  });
}

function getSchoolClock(timeZone: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}`,
  };
}

let schedulerRunning = false;

export async function runDailyNotificationScheduler(): Promise<void> {
  if (schedulerRunning) return;
  schedulerRunning = true;
  try {
    const scheduled = await updateState((state) => {
      const schedule = state.schedule;
      if (!schedule.enabled || !schedule.title.trim() || !schedule.body.trim()) return null;
      const local = getSchoolClock(schedule.timeZone);
      if (local.time < schedule.time || schedule.lastSentDate === local.date) return null;
      schedule.lastSentDate = local.date;
      return {
        title: schedule.title,
        body: schedule.body,
        teacherId: schedule.teacherId,
        date: local.date,
      };
    }, (value) => value !== null);
    if (!scheduled) return;
    const result = await createAndDeliver({
      title: scheduled.title,
      body: scheduled.body,
      teacherId: scheduled.teacherId,
      source: "daily",
      scheduleDate: scheduled.date,
    });
    logger.info(
      { date: scheduled.date, targetCount: result.targetCount, pushAccepted: result.pushAccepted },
      "Daily teacher notification sent",
    );
  } catch (error) {
    logger.error({ error }, "Daily teacher notification scheduler failed");
  } finally {
    schedulerRunning = false;
  }
}

export { TIME_PATTERN, isExpoToken };
