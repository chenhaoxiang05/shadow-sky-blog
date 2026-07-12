import { sql } from "drizzle-orm";
import { withDatabase } from "@/db";
import { json } from "@/lib/http";

export async function GET() {
  try {
    await withDatabase(async (db) => { await db.execute(sql`select 1`); });
    return json({ status: "ok", database: "reachable" });
  } catch {
    return json({ status: "degraded", database: "unavailable", error: "DATABASE_UNAVAILABLE" }, { status: 503 });
  }
}
