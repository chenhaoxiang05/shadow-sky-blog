import assert from "node:assert/strict";
import test from "node:test";
import { needsMediaContext, needsOperatorContext } from "../lib/view-context";

test("公开阅读和认证页面不预取受保护上下文", () => {
  for (const view of ["home", "articles", "article", "login", "invite", "bookmarks", "studio"]) {
    assert.equal(needsMediaContext(view), false, `${view} should not load media context`);
    assert.equal(needsOperatorContext(view), false, `${view} should not load operator context`);
  }
});

test("媒体能力只在头像或编辑器入口按需加载", () => {
  assert.equal(needsMediaContext("profile"), true);
  assert.equal(needsMediaContext("editor"), true);
  assert.equal(needsOperatorContext("profile"), false);
  assert.equal(needsOperatorContext("editor"), false);
});

test("操作者角色只在管理视图按需加载", () => {
  for (const view of ["admin", "users", "adminInvite", "audit"]) {
    assert.equal(needsOperatorContext(view), true);
    assert.equal(needsMediaContext(view), false);
  }
});
