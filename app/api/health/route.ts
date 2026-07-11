import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { json } from "@/lib/http";

export async function GET() {
  try { await getDb().execute(sql`select 1`); return json({ status: "ok", database: "reachable" }); }
  catch { return json({ status: "degraded", database: "unavailable" }, { status: 503 }); }
}
