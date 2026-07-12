import { eq } from "drizzle-orm";
import { categories, users, withDatabase } from "../db";
import { hashPassword } from "../lib/security";

const password = process.env.SEED_OWNER_PASSWORD;
const handle = process.env.SEED_OWNER_HANDLE?.trim().toLowerCase();
const displayName = process.env.SEED_OWNER_DISPLAY_NAME?.trim();
if (!handle || !displayName || !password) throw new Error("SEED_OWNER_HANDLE, SEED_OWNER_DISPLAY_NAME and SEED_OWNER_PASSWORD are required; no password is stored in source control.");

const existing = await withDatabase(async (db) => {
  const [owner] = await db.select({ id: users.id }).from(users).where(eq(users.role, "OWNER")).limit(1);
  if (!owner) await db.insert(users).values({ handle, displayName, passwordHash: await hashPassword(password), role: "OWNER", publishingPolicy: "DIRECT_PUBLISH", status: "ACTIVE", mustChangePassword: false });

  for (const category of [
    { name: "AI Engineering", slug: "ai-engineering" }, { name: "Frontend", slug: "frontend" }, { name: "Backend", slug: "backend" }, { name: "DevOps", slug: "devops" }, { name: "Projects", slug: "projects" }, { name: "Learning", slug: "learning" },
  ]) await db.insert(categories).values(category).onConflictDoUpdate({ target: categories.slug, set: { name: category.name, updatedAt: new Date(), deletedAt: null } });
  return owner;
});
console.log(existing ? "Seed already present; categories synchronized." : "Owner and categories seeded.");
