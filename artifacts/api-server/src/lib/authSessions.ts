import { createHash, randomBytes } from "node:crypto";
import { getAdapter } from "./dbManager.js";

const SESSION_STORE_KEY = "auth_sessions_v1";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type AuthSessionRole = "admin" | "teacher";

export interface AuthSession {
  tokenHash: string;
  userId: string;
  role: AuthSessionRole;
  expiresAt: number;
}

function isAuthSession(value: unknown): value is AuthSession {
  if (!value || typeof value !== "object") return false;
  const session = value as Partial<AuthSession>;
  return typeof session.tokenHash === "string"
    && typeof session.userId === "string"
    && (session.role === "admin" || session.role === "teacher")
    && typeof session.expiresAt === "number";
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function readSessions(): Promise<AuthSession[]> {
  const stored = await getAdapter().appSettings.get(SESSION_STORE_KEY);
  const value = stored?.value as { sessions?: unknown } | undefined;
  return Array.isArray(value?.sessions) ? value.sessions.filter(isAuthSession) : [];
}

async function writeSessions(sessions: AuthSession[]): Promise<void> {
  await getAdapter().appSettings.set(SESSION_STORE_KEY, { sessions });
}

function removeExpired(sessions: AuthSession[], now = Date.now()): AuthSession[] {
  return sessions.filter((session) => session.expiresAt > now);
}

export async function createAuthSession(
  userId: string,
  role: AuthSessionRole,
): Promise<{ sessionToken: string; expiresAt: number }> {
  const now = Date.now();
  const expiresAt = now + SESSION_TTL_MS;
  const sessionToken = randomBytes(32).toString("base64url");
  const sessions = removeExpired(await readSessions(), now);
  sessions.push({ tokenHash: hashToken(sessionToken), userId, role, expiresAt });
  await writeSessions(sessions);
  return { sessionToken, expiresAt };
}

export async function findAuthSession(sessionToken: string | undefined): Promise<AuthSession | null> {
  if (!sessionToken || sessionToken.length > 256) return null;
  const now = Date.now();
  const sessions = await readSessions();
  const activeSessions = removeExpired(sessions, now);
  if (activeSessions.length !== sessions.length) {
    await writeSessions(activeSessions);
  }
  const tokenHash = hashToken(sessionToken);
  return activeSessions.find((session) => session.tokenHash === tokenHash) ?? null;
}

export async function revokeAuthSession(sessionToken: string | undefined): Promise<void> {
  if (!sessionToken || sessionToken.length > 256) return;
  const tokenHash = hashToken(sessionToken);
  const sessions = await readSessions();
  const activeSessions = removeExpired(sessions);
  const remaining = activeSessions.filter((session) => session.tokenHash !== tokenHash);
  if (remaining.length !== sessions.length) {
    await writeSessions(remaining);
  }
}

export async function revokeTeacherSessions(teacherId: string): Promise<number> {
  const sessions = removeExpired(await readSessions());
  const remaining = sessions.filter(
    (session) => session.role !== "teacher" || session.userId !== teacherId,
  );
  const revokedCount = sessions.length - remaining.length;
  await writeSessions(remaining);
  return revokedCount;
}

export function bearerToken(authorization: string | undefined): string | undefined {
  if (!authorization) return undefined;
  const match = /^Bearer\s+(\S+)$/i.exec(authorization);
  return match?.[1];
}