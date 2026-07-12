import { lt } from "drizzle-orm";
import { auditLogs, withDatabase } from "../db";

const days = Number(process.env.AUDIT_RETENTION_DAYS ?? 180);
if (!Number.isFinite(days) || days < 180) throw new Error("AUDIT_RETENTION_DAYS cannot be lower than 180");
const cutoff = new Date(Date.now() - days * 86_400_000);
await withDatabase(async (db) => { await db.delete(auditLogs).where(lt(auditLogs.createdAt, cutoff)); });
console.log(`Audit rows older than ${days} days pruned.`);
