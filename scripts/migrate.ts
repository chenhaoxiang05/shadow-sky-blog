import { migrate } from "drizzle-orm/postgres-js/migrator";
import { closeDb, getDb } from "../db";

await migrate(getDb(), { migrationsFolder: "./drizzle" });
await closeDb();
console.log("Database migrations applied.");
