import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

let _pool: pg.Pool | undefined;
let _db: ReturnType<typeof drizzle> | undefined;

export function getPool(): pg.Pool {
  if (!_pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error(
        "DATABASE_URL must be set. Did you forget to provision a database?",
      );
    }
    _pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return _pool;
}

export function getDb() {
  if (!_db) {
    _db = drizzle(getPool(), { schema });
  }
  return _db;
}

// Legacy exports for any existing code that imports pool/db directly
export const pool = new Proxy({} as pg.Pool, {
  get(_t, prop) { return (getPool() as any)[prop]; },
});
export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(_t, prop) { return (getDb() as any)[prop]; },
});

export * from "./schema";
