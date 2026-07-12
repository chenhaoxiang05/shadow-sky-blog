import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { sql } from "drizzle-orm";
import { createDatabaseContext, DatabaseConfigurationError, type Database, type DatabaseContext } from "../db";
import { errorResponse, json, requestHandler, services } from "../lib/http";
import { MediaService, mediaUrl } from "../lib/media-service";
import { PostService } from "../lib/post-service";
import type { StorageProvider } from "../lib/storage";
import { MemoryRepository, actor } from "./helpers/memory-repository";

function fakePool() {
  let queries = 0;
  let closes = 0;
  const pool = {
    async query() { queries++; return { rows: [{ one: 1 }], rowCount: 1 }; },
    async end() { closes++; },
  };
  return { pool, queries: () => queries, closes: () => closes };
}

test("Neon Serverless 驱动可以执行 SELECT 1 并关闭请求连接", async () => {
  const fake = fakePool();
  const context = createDatabaseContext({ url: "postgresql://placeholder.invalid/test", poolFactory: () => fake.pool as never });
  const result = await context.db.execute(sql`select 1 as one`);
  assert.equal(result.rows[0]?.one, 1);
  await context.close();
  assert.equal(fake.queries(), 1);
  assert.equal(fake.closes(), 1);
});

test("DATABASE_URL 缺失时以安全配置错误失败", () => {
  const previous = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try { assert.throws(() => createDatabaseContext(), DatabaseConfigurationError); }
  finally { if (previous === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previous; }
});

test("数据库错误响应不泄露连接信息", async () => {
  const sensitive = "postgresql://private-user:private-password@private-host/database";
  const original = console.error;
  console.error = () => undefined;
  try {
    const response = errorResponse(new Error(sensitive));
    assert.equal(response.status, 500);
    assert.equal((await response.text()).includes(sensitive), false);
  } finally { console.error = original; }
});

function fakeContext(onClose: () => void): DatabaseContext {
  return { db: {} as Database, async close() { onClose(); } };
}

test("每个请求只创建一个数据库上下文并共享 Services", async () => {
  let contexts = 0;
  let closes = 0;
  const handler = requestHandler(async () => {
    const first = services();
    const second = services();
    assert.equal(first, second);
    return json({ ok: true });
  }, () => { contexts++; return fakeContext(() => { closes++; }); });
  assert.equal((await handler(new Request("https://example.test"))).status, 200);
  assert.equal(contexts, 1);
  assert.equal(closes, 1);
});

test("请求抛出异常后仍关闭连接且返回安全错误", async () => {
  let closes = 0;
  const original = console.error;
  console.error = () => undefined;
  try {
    const handler = requestHandler(async () => { throw new Error("connection detail"); }, () => fakeContext(() => { closes++; }));
    const response = await handler(new Request("https://example.test"));
    assert.equal(response.status, 500);
    assert.equal(closes, 1);
    assert.equal((await response.text()).includes("connection detail"), false);
  } finally { console.error = original; }
});

test("数据库上下文 close 幂等，避免重复释放", async () => {
  const fake = fakePool();
  const context = createDatabaseContext({ url: "postgresql://placeholder.invalid/test", poolFactory: () => fake.pool as never });
  await context.close();
  await context.close();
  assert.equal(fake.closes(), 1);
});

test("邀请注册和点赞继续由数据库交互式事务保护", async () => {
  const source = await readFile(new URL("../db/repository.ts", import.meta.url), "utf8");
  assert.match(source, /acceptInvitation[\s\S]*?this\.db\.transaction/);
  assert.match(source, /setLike[\s\S]*?this\.db\.transaction/);
});

test("文章与媒体绑定失败时不会留下部分文章状态", async () => {
  class FailingRepository extends MemoryRepository {
    override async bindMediaToPost(): Promise<never> { throw new Error("binding failed"); }
  }
  const repo = new FailingRepository();
  const author = actor("author", "AUTHOR");
  const asset = await repo.createMediaAsset({ ownerId: "author", purpose: "COVER", storageKey: "cover.png", mimeType: "image/png", byteSize: 10, sha256: "a".repeat(64) });
  const storage: StorageProvider = { async put() { return "unused"; }, async get() { return new Uint8Array(); }, async delete() {} };
  const service = new PostService(repo, new MediaService(repo, storage));
  await assert.rejects(service.create(author, { title: "Atomic", summary: "Atomic", content: "Body", visibility: "PUBLIC", coverImage: mediaUrl(asset.id), requestId: "atomic-post" }));
  assert.equal(repo.posts.size, 0);
  assert.equal(repo.media.get(asset.id)?.linkedPostId, null);
  assert.equal(repo.audits.length, 0);
});

test("运行时代码不再导入 postgres 或 drizzle postgres-js", async () => {
  const runtime = await Promise.all(["../db/index.ts", "../db/repository.ts", "../lib/http.ts"].map((path) => readFile(new URL(path, import.meta.url), "utf8")));
  assert.equal(runtime.some((source) => /drizzle-orm\/postgres-js|from ["']postgres["']/.test(source)), false);
});
