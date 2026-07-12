import { Pool, type PoolConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";

export type Database = ReturnType<typeof drizzle<typeof schema>>;
export type NeonPoolFactory = (config: PoolConfig) => Pool;

export interface DatabaseContext {
  db: Database;
  close(): Promise<void>;
}

export class DatabaseConfigurationError extends Error {
  readonly code = "DATABASE_NOT_CONFIGURED";

  constructor() {
    super("Database configuration is unavailable");
    this.name = "DatabaseConfigurationError";
  }
}

function requestPoolSize() {
  const configured = Number(process.env.DATABASE_POOL_SIZE ?? 1);
  return Number.isInteger(configured) && configured > 0 ? Math.min(configured, 10) : 1;
}

export function createDatabaseContext(options: { url?: string; poolFactory?: NeonPoolFactory } = {}): DatabaseContext {
  const url = options.url ?? process.env.DATABASE_URL;
  if (!url) throw new DatabaseConfigurationError();

  const pool = (options.poolFactory ?? ((config) => new Pool(config)))({
    connectionString: url,
    max: requestPoolSize(),
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 20_000,
  });
  const db = drizzle(pool, { schema });
  let closed = false;

  return {
    db,
    async close() {
      if (closed) return;
      closed = true;
      await pool.end();
    },
  };
}

export async function withDatabase<T>(work: (db: Database) => Promise<T>) {
  const context = createDatabaseContext();
  try {
    return await work(context.db);
  } finally {
    await context.close();
  }
}

export * from "./schema";
