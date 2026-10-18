import app from "./app";
import { logger } from "./lib/logger";
import { initDbManager } from "./lib/dbManager";
import { runDailyNotificationScheduler } from "./lib/teacherNotifications";
import {
  markForgottenTeacherCheckouts,
  markMissedTeacherAttendance,
} from "./routes/teacherAttendance";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

await initDbManager();

const runAbsenceSweep = async () => {
  try {
    const result = await markMissedTeacherAttendance();
    if (result.created > 0) logger.info({ date: result.date, created: result.created }, "Automatic teacher absence records created");
  } catch (error) {
    logger.error({ error }, "Automatic teacher absence sweep failed");
  }
};

const runAutomaticCheckoutSweep = async () => {
  try {
    const result = await markForgottenTeacherCheckouts();
    if (result.closed > 0) {
      logger.info({ date: result.date, closed: result.closed }, "Automatic teacher checkout records created");
    }
  } catch (error) {
    logger.error({ error }, "Automatic teacher checkout sweep failed");
  }
};

await runAbsenceSweep();
const absenceSweepTimer = setInterval(runAbsenceSweep, 60_000);
absenceSweepTimer.unref?.();

void runDailyNotificationScheduler();
const notificationTimer = setInterval(() => {
  void runDailyNotificationScheduler();
}, 30_000);
notificationTimer.unref?.();

await runAutomaticCheckoutSweep();
const automaticCheckoutSweepTimer = setInterval(runAutomaticCheckoutSweep, 60_000);
automaticCheckoutSweepTimer.unref?.();

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
