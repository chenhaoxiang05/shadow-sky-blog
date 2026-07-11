/**
 * Phase 1 exposes the portable PostgreSQL schema only.
 * Phase 2 will create a server-only connection pool from DATABASE_URL and keep
 * the chosen driver behind this module so domain code never imports a provider.
 */
export * from "./schema";
