import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

let client: ReturnType<typeof postgres> | undefined;
let database: ReturnType<typeof drizzle<typeof schema>> | undefined;

export function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured");
  if (!client) client = postgres(url, { max: Number(process.env.DATABASE_POOL_SIZE ?? 10), idle_timeout: 20, connect_timeout: 10, prepare: false });
  if (!database) database = drizzle(client, { schema });
  return database;
}

export async function closeDb() { if (client) await client.end(); client = undefined; database = undefined; }
export * from "./schema";
