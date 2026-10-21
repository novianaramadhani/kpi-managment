import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

const createPool = () => {
  const p = new Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
  });

  p.on("error", (err) => {
    console.error("PostgreSQL Pool unexpected error on idle client:", err.message);
  });

  return p;
};

export const pool =
  globalForDb.__arenaNextJsPostgresqlPool ?? createPool();

if (process.env.NODE_ENV !== "production") {
  globalForDb.__arenaNextJsPostgresqlPool = pool;
}

export const db = drizzle(pool);
