import assert from "node:assert/strict";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(new Request("http://localhost/", { headers: { accept: "text/html" } }), { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
}

test("server-renders the Shadow Sky Phase 3 shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>Shadow Sky/);
  assert.match(html, /分享正在发生的/);
  assert.match(html, /可检索、可复用/);
  assert.match(html, /<html[^>]+data-theme="dark"/);
  assert.match(html, /id="shadow-sky-theme-bootstrap"/);
  assert.match(html, /aria-label="切换到浅色模式"/);
  assert.match(html, /aria-label="打开全局搜索"/);
  assert.match(html, /aria-haspopup="dialog"/);
  assert.match(html, /<button[^>]+type="button"[^>]+class="icon-btn theme-toggle"/);
  assert.ok(html.indexOf("shadow-sky-theme-bootstrap") < html.indexOf("分享正在发生的"));
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});
