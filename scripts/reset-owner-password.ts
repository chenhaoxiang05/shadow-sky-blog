import { and, eq, isNull } from "drizzle-orm";
import { auditLogs, closeDb, getDb, sessions, users } from "../db";
import { hashPassword } from "../lib/security";

const handle = process.env.SEED_OWNER_HANDLE?.trim().toLowerCase();
const password = process.env.OWNER_RESET_PASSWORD;
if (!handle || !password) throw new Error("SEED_OWNER_HANDLE and OWNER_RESET_PASSWORD are required.");

const db = getDb();
await db.transaction(async (tx) => {
  const [owner] = await tx.select({ id: users.id, role: users.role }).from(users).where(and(eq(users.handle, handle), eq(users.role, "OWNER"), isNull(users.deletedAt))).limit(1).for("update");
  if (!owner) throw new Error("Active Owner account not found.");
  const now = new Date();
  await tx.update(users).set({ passwordHash: await hashPassword(password), mustChangePassword: false, passwordChangedAt: now, updatedAt: now }).where(eq(users.id, owner.id));
  await tx.update(sessions).set({ revokedAt: now }).where(and(eq(sessions.userId, owner.id), isNull(sessions.revokedAt)));
  await tx.insert(auditLogs).values({ action: "OWNER_PASSWORD_MAINTENANCE_RESET", targetType: "USER", targetId: owner.id, requestId: crypto.randomUUID(), reason: "SERVER_MAINTENANCE_COMMAND" });
});
await closeDb();
console.log("Owner password reset completed; all Owner sessions were revoked.");
