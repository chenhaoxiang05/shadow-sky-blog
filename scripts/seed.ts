import { eq } from "drizzle-orm";
import { categories, closeDb, getDb, users } from "../db";
import { hashPassword } from "../lib/security";

const email = process.env.SEED_OWNER_EMAIL?.trim().toLowerCase();
const password = process.env.SEED_OWNER_PASSWORD;
const handle = process.env.SEED_OWNER_HANDLE?.trim().toLowerCase() ?? "owner";
if (!email || !password) throw new Error("SEED_OWNER_EMAIL and SEED_OWNER_PASSWORD are required; no password is stored in source control.");

const db = getDb();
const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
if (!existing) await db.insert(users).values({ email, handle, displayName: process.env.SEED_OWNER_DISPLAY_NAME ?? "Site Owner", passwordHash: await hashPassword(password), role: "OWNER", publishingPolicy: "DIRECT_PUBLISH", status: "ACTIVE", emailVerifiedAt: new Date() });

for (const category of [
  { name: "AI Engineering", slug: "ai-engineering" }, { name: "Frontend", slug: "frontend" }, { name: "Backend", slug: "backend" }, { name: "DevOps", slug: "devops" }, { name: "Projects", slug: "projects" }, { name: "Learning", slug: "learning" },
]) await db.insert(categories).values(category).onConflictDoUpdate({ target: categories.slug, set: { name: category.name, updatedAt: new Date(), deletedAt: null } });

await closeDb();
console.log(existing ? "Seed already present; categories synchronized." : "Owner and categories seeded.");
