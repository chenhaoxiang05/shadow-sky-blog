import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

async function sourceFiles(root: string): Promise<string[]> { const entries = await readdir(root, { withFileTypes: true }); const nested = await Promise.all(entries.map(async (entry) => { const full = path.join(root, entry.name); return entry.isDirectory() ? sourceFiles(full) : /\.(ts|tsx)$/.test(entry.name) ? [full] : []; })); return nested.flat(); }
test("源码不存在邮件发送或邮箱验证调用", async () => { const root = path.resolve(import.meta.dirname, ".."); const files = (await Promise.all(["app", "lib", "db", "scripts"].map((dir) => sourceFiles(path.join(root, dir))))).flat(); const forbidden = /NotificationProvider|EmailProvider|sendMail|sendEmail|SMTP|emailVerifiedAt|SEED_OWNER_EMAIL/i; const hits: string[] = []; for (const file of files) if (forbidden.test(await readFile(file, "utf8"))) hits.push(path.relative(root, file)); assert.deepEqual(hits, []); });
