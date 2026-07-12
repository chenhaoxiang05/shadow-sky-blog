import { migrate } from "drizzle-orm/neon-serverless/migrator";
import { createDatabaseContext } from "../db";

const context = createDatabaseContext();
try {
  await migrate(context.db, { migrationsFolder: "./drizzle" });
  console.log("Database migrations applied.");
} finally {
  await context.close();
}
