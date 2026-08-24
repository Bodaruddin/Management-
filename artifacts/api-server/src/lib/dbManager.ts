/**
 * Database Connection Manager — supports PostgreSQL and Firebase Firestore.
 *
 * - Stores multiple named connections in ./data/connections.json (AES-256-CBC encrypted).
 * - Manages pg.Pool instances (PostgreSQL) and Firebase Admin app instances (Firebase).
 * - Exports getAdapter() used by all routes.
 * - On startup: restores the last-active connection, falls back to APP_DATABASE_URL env var.
 * - On activate: auto-initialises all required tables/collections if they don't exist.
 */
import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@workspace/db/schema";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { logger } from "./logger.js";
import { createPgAdapter } from "./pgAdapter.js";
import { createFirebaseAdapter } from "./firebaseAdapter.js";
import { initPostgresSchema, initFirebaseSchema } from "./schemaInit.js";
import type { DataAdapter } from "./adapter.js";

const { Pool } = pg;

// ─── Encryption (AES-256-CBC keyed from SESSION_SECRET) ─────────────────────
const RAW_SECRET = process.env.SESSION_SECRET ?? "school-mgmt-fallback-2026";
const ENC_KEY = crypto.createHash("sha256").update(RAW_SECRET).digest();

function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", ENC_KEY, iv);
  const enc = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return iv.toString("hex") + ":" + enc.toString("hex");
}

function decrypt(text: string): string {
  const [ivHex, encHex] = text.split(":");
  if (!ivHex || !encHex) throw new Error("Invalid encrypted value");
  const decipher = crypto.createDecipheriv("aes-256-cbc", ENC_KEY, Buffer.from(ivHex, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(encHex, "hex")), decipher.final()]).toString("utf8");
}

// ─── Persistent store ────────────────────────────────────────────────────────
const DATA_DIR = path.join(process.cwd(), "data");
const CONNECTIONS_FILE = path.join(DATA_DIR, "connections.json");

export type DbType = "postgresql" | "firebase";

interface StoredConnectionBase {
  id: string;
  name: string;
  dbType: DbType;
  createdAt: string;
  updatedAt: string;
}

interface StoredConnectionPg extends StoredConnectionBase {
  dbType: "postgresql";
  encryptedUrl: string;
  host: string;
  dbName: string;
}

interface StoredConnectionFirebase extends StoredConnectionBase {
  dbType: "firebase";
  encryptedConfig: string; // encrypted JSON of FirebaseConfig
  projectId: string;       // safe to store plain (not a secret)
}

type StoredConnection = StoredConnectionPg | StoredConnectionFirebase;

interface ConnectionsStore {
  activeId: string | null;
  connections: StoredConnection[];
}

export interface FirebaseConfig {
  projectId: string;
  apiKey: string;
  authDomain: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  serviceAccountJson: string; // raw JSON string of the service account
}

function loadStore(): ConnectionsStore {
  try {
    if (fs.existsSync(CONNECTIONS_FILE)) {
      const raw = JSON.parse(fs.readFileSync(CONNECTIONS_FILE, "utf8")) as ConnectionsStore;
      // Backward-compat: connections without dbType were always PostgreSQL
      raw.connections = raw.connections.map((c: any) => ({
        dbType: "postgresql",
        ...c,
      }));
      return raw;
    }
  } catch (e) {
    logger.error({ e }, "Failed to load connections store — using empty store");
  }
  return { activeId: null, connections: [] };
}

function saveStore(store: ConnectionsStore): void {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(CONNECTIONS_FILE, JSON.stringify(store, null, 2), "utf8");
  } catch (e) {
    logger.error({ e }, "Failed to save connections store");
  }
}

// ─── PostgreSQL pool cache ────────────────────────────────────────────────────
const poolCache = new Map<string, pg.Pool>();

function getOrCreatePool(id: string, url: string): pg.Pool {
  if (!poolCache.has(id)) {
    poolCache.set(id, new Pool({ connectionString: url, max: 5, connectionTimeoutMillis: 10_000 }));
  }
  return poolCache.get(id)!;
}

async function destroyPool(id: string): Promise<void> {
  const p = poolCache.get(id);
  if (p) { await p.end().catch(() => {}); poolCache.delete(id); }
}

function buildDrizzle(pool: pg.Pool): NodePgDatabase<typeof schema> {
  return drizzle(pool, { schema }) as NodePgDatabase<typeof schema>;
}

// ─── Firebase Admin app cache ────────────────────────────────────────────────
const firebaseApps = new Map<string, import("firebase-admin/app").App>();
const firestoreInstances = new Map<string, import("firebase-admin/firestore").Firestore>();

async function getOrCreateFirestore(id: string, config: FirebaseConfig) {
  if (!firestoreInstances.has(id)) {
    const { initializeApp, cert } = await import("firebase-admin/app");
    const { getFirestore } = await import("firebase-admin/firestore");

    const serviceAccount = JSON.parse(config.serviceAccountJson);
    const app = initializeApp({ credential: cert(serviceAccount), projectId: config.projectId }, `school-mgmt-${id}`);
    const firestore = getFirestore(app);
    firebaseApps.set(id, app);
    firestoreInstances.set(id, firestore);
  }
  return firestoreInstances.get(id)!;
}

async function destroyFirebase(id: string): Promise<void> {
  const app = firebaseApps.get(id);
  if (app) {
    try {
      const { deleteApp } = await import("firebase-admin/app");
      await deleteApp(app);
    } catch {}
    firebaseApps.delete(id);
    firestoreInstances.delete(id);
  }
}

// ─── Active state ─────────────────────────────────────────────────────────────
let _activeAdapter: DataAdapter | null = null;
let _activeId: string | null = null;
let _activeName = "None";
let _activeDbType: DbType | null = null;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function parseDisplayInfo(url: string): { host: string; dbName: string } {
  try {
    const u = new URL(url);
    return { host: u.hostname + (u.port ? `:${u.port}` : ""), dbName: u.pathname.slice(1) };
  } catch {
    return { host: "unknown", dbName: "unknown" };
  }
}

// ─── Init (called from src/index.ts before listen) ───────────────────────────
export async function initDbManager(): Promise<void> {
  const store = loadStore();

  // 1. Try saved active connection
  if (store.activeId) {
    const conn = store.connections.find((c) => c.id === store.activeId);
    if (conn) {
      try {
        await activateConnectionInternal(conn, store, false);
        logger.info({ id: conn.id, name: conn.name, dbType: conn.dbType }, "DB Manager: restored saved connection");
        return;
      } catch (e) {
        logger.warn({ e, id: store.activeId }, "DB Manager: saved connection failed, trying env var");
        if (conn.dbType === "postgresql") await destroyPool(conn.id);
        else await destroyFirebase(conn.id);
      }
    }
  }

  // 2. Fall back to APP_DATABASE_URL / DATABASE_URL
  const envUrl = process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL;
  if (envUrl) {
    try {
      const pool = getOrCreatePool("env", envUrl);
      await pool.query("SELECT 1");
      _activeAdapter = createPgAdapter(buildDrizzle(pool));
      _activeId = "env";
      _activeName = "Environment (APP_DATABASE_URL)";
      _activeDbType = "postgresql";

      if (!store.connections.find((c) => c.id === "env")) {
        const { host, dbName } = parseDisplayInfo(envUrl);
        store.connections.unshift({
          id: "env", name: "Environment Database", dbType: "postgresql",
          encryptedUrl: encrypt(envUrl), host, dbName,
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        });
        store.activeId = "env";
        saveStore(store);
      }
      logger.info("DB Manager: using APP_DATABASE_URL");
      // Auto-init schema on env connection too
      await initPostgresSchema(pool).catch((e) =>
        logger.warn({ e }, "DB Manager: schema init warning (non-fatal)"),
      );
    } catch (e) {
      logger.warn({ e }, "DB Manager: env var connection failed — running without DB");
    }
  } else {
    logger.warn("DB Manager: no database configured — add one via the Database Manager UI");
  }
}

// Internal activate — shared by initDbManager + activateConnection
async function activateConnectionInternal(
  conn: StoredConnection,
  store: ConnectionsStore,
  saveAfter: boolean,
): Promise<void> {
  if (conn.dbType === "firebase") {
    const config: FirebaseConfig = JSON.parse(decrypt(conn.encryptedConfig));
    const firestore = await getOrCreateFirestore(conn.id, config);
    await initFirebaseSchema(firestore);
    _activeAdapter = createFirebaseAdapter(firestore);
    _activeId = conn.id;
    _activeName = conn.name;
    _activeDbType = "firebase";
  } else {
    const url = decrypt(conn.encryptedUrl);
    await destroyPool(conn.id);
    const pool = getOrCreatePool(conn.id, url);
    await pool.query("SELECT 1");
    await initPostgresSchema(pool);
    _activeAdapter = createPgAdapter(buildDrizzle(pool));
    _activeId = conn.id;
    _activeName = conn.name;
    _activeDbType = "postgresql";
  }
  if (saveAfter) {
    store.activeId = conn.id;
    saveStore(store);
  }
}

// ─── Public read API ──────────────────────────────────────────────────────────
export function getAdapter(): DataAdapter {
  if (!_activeAdapter) {
    const err = new Error("No active database connection. Configure one in the Database Manager.") as any;
    err.code = "NO_DB_CONNECTION";
    throw err;
  }
  return _activeAdapter;
}

/** @deprecated Use getAdapter() — kept for any direct-drizzle callers */
export function getDb() {
  return getAdapter();
}

export function getActiveConnectionInfo() {
  // A deployment configured with DATABASE_URL / APP_DATABASE_URL has a valid
  // shared database even when it has no entry in the local connection manager.
  // Staff APKs use this endpoint to decide whether teacher login is available,
  // so any healthy active adapter must report ready — including the "env"
  // fallback used by hosted deployments.
  return { id: _activeId, name: _activeName, connected: _activeAdapter !== null, dbType: _activeDbType };
}

export interface PublicConnection {
  id: string;
  name: string;
  dbType: DbType;
  // PostgreSQL
  host?: string;
  dbName?: string;
  // Firebase
  projectId?: string;
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
}

export function listConnections(): PublicConnection[] {
  return loadStore().connections.map((c) => ({
    id: c.id,
    name: c.name,
    dbType: c.dbType,
    ...(c.dbType === "postgresql" ? { host: c.host, dbName: c.dbName } : { projectId: c.projectId }),
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    isActive: c.id === _activeId,
  }));
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────
export function createConnectionPg(input: { name: string; url: string }): PublicConnection {
  const store = loadStore();
  const id = crypto.randomUUID();
  const { host, dbName } = parseDisplayInfo(input.url);
  const conn: StoredConnectionPg = {
    id, name: input.name.trim(), dbType: "postgresql",
    encryptedUrl: encrypt(input.url), host, dbName,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  store.connections.push(conn);
  saveStore(store);
  return { id, name: conn.name, dbType: "postgresql", host, dbName, createdAt: conn.createdAt, updatedAt: conn.updatedAt, isActive: false };
}

export function createConnectionFirebase(input: { name: string; config: FirebaseConfig }): PublicConnection {
  const store = loadStore();
  const id = crypto.randomUUID();
  const conn: StoredConnectionFirebase = {
    id, name: input.name.trim(), dbType: "firebase",
    encryptedConfig: encrypt(JSON.stringify(input.config)),
    projectId: input.config.projectId,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  store.connections.push(conn);
  saveStore(store);
  return { id, name: conn.name, dbType: "firebase", projectId: conn.projectId, createdAt: conn.createdAt, updatedAt: conn.updatedAt, isActive: false };
}

export async function updateConnection(
  id: string,
  input: { name?: string; url?: string; config?: FirebaseConfig },
): Promise<PublicConnection | null> {
  const store = loadStore();
  const idx = store.connections.findIndex((c) => c.id === id);
  if (idx === -1) return null;

  const conn = { ...store.connections[idx] };
  if (input.name) conn.name = input.name.trim();

  if (conn.dbType === "postgresql" && input.url) {
    (conn as StoredConnectionPg).encryptedUrl = encrypt(input.url);
    const { host, dbName } = parseDisplayInfo(input.url);
    (conn as StoredConnectionPg).host = host;
    (conn as StoredConnectionPg).dbName = dbName;
    await destroyPool(id);
  }
  if (conn.dbType === "firebase" && input.config) {
    (conn as StoredConnectionFirebase).encryptedConfig = encrypt(JSON.stringify(input.config));
    (conn as StoredConnectionFirebase).projectId = input.config.projectId;
    await destroyFirebase(id);
  }

  conn.updatedAt = new Date().toISOString();
  store.connections[idx] = conn;
  saveStore(store);
  return {
    id: conn.id, name: conn.name, dbType: conn.dbType,
    ...(conn.dbType === "postgresql" ? { host: (conn as StoredConnectionPg).host, dbName: (conn as StoredConnectionPg).dbName } : { projectId: (conn as StoredConnectionFirebase).projectId }),
    createdAt: conn.createdAt, updatedAt: conn.updatedAt, isActive: conn.id === _activeId,
  };
}

export async function deleteConnection(id: string): Promise<boolean> {
  const store = loadStore();
  const idx = store.connections.findIndex((c) => c.id === id);
  if (idx === -1) return false;

  const conn = store.connections[idx];
  if (conn.dbType === "postgresql") await destroyPool(id);
  else await destroyFirebase(id);

  store.connections.splice(idx, 1);
  if (store.activeId === id) {
    store.activeId = null;
    _activeAdapter = null;
    _activeId = null;
    _activeName = "None";
    _activeDbType = null;
  }
  saveStore(store);
  return true;
}

// ─── Test ─────────────────────────────────────────────────────────────────────
export async function testConnection(
  id: string,
): Promise<{ success: boolean; message: string; latencyMs?: number; dbType?: DbType }> {
  const store = loadStore();
  const conn = store.connections.find((c) => c.id === id);
  if (!conn) return { success: false, message: "Connection not found" };

  const start = Date.now();
  try {
    if (conn.dbType === "firebase") {
      const config: FirebaseConfig = JSON.parse(decrypt(conn.encryptedConfig));
      const testId = `test_${id}`;
      // Use a temporary Firebase app for testing
      const { initializeApp, cert, deleteApp } = await import("firebase-admin/app");
      const { getFirestore } = await import("firebase-admin/firestore");
      const serviceAccount = JSON.parse(config.serviceAccountJson);
      const testApp = initializeApp({ credential: cert(serviceAccount), projectId: config.projectId }, testId);
      try {
        const db = getFirestore(testApp);
        await db.collection("_health").limit(1).get();
        return { success: true, message: "Firebase connected successfully", latencyMs: Date.now() - start, dbType: "firebase" };
      } finally {
        await deleteApp(testApp).catch(() => {});
      }
    } else {
      const url = decrypt((conn as any).encryptedUrl);
      const testPool = new Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 8_000, idleTimeoutMillis: 500 });
      try {
        await testPool.query("SELECT 1");
        return { success: true, message: "Connected successfully", latencyMs: Date.now() - start, dbType: "postgresql" };
      } finally {
        await testPool.end().catch(() => {});
      }
    }
  } catch (e: any) {
    return { success: false, message: e.message ?? "Connection failed", dbType: conn.dbType };
  }
}

// ─── Activate ─────────────────────────────────────────────────────────────────
export async function activateConnection(
  id: string,
): Promise<{ success: boolean; message: string; dbType?: DbType }> {
  const store = loadStore();
  const conn = store.connections.find((c) => c.id === id);
  if (!conn) return { success: false, message: "Connection not found" };

  try {
    // Tear down old Firebase app for this connection (to reinitialize fresh)
    if (conn.dbType === "firebase") await destroyFirebase(id);

    await activateConnectionInternal(conn, store, true);
    logger.info({ id, name: conn.name, dbType: conn.dbType }, "DB Manager: switched active connection");
    return { success: true, message: `Switched to "${conn.name}" (${conn.dbType})`, dbType: conn.dbType };
  } catch (e: any) {
    if (conn.dbType === "postgresql") await destroyPool(id);
    else await destroyFirebase(id);
    return { success: false, message: e.message ?? "Failed to connect" };
  }
}
