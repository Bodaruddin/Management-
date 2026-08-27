import pg from "pg";
export declare function getPool(): pg.Pool;
export declare function getDb(): import("drizzle-orm/node-postgres").NodePgDatabase<Record<string, unknown>> & {
    $client: import("pg").Pool;
};
export declare const pool: import("pg").Pool;
export declare const db: import("drizzle-orm/node-postgres").NodePgDatabase<Record<string, unknown>> & {
    $client: import("pg").Pool;
};
export * from "./schema";
//# sourceMappingURL=index.d.ts.map