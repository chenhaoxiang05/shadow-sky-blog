"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useEditorAutosave } from "./use-editor-autosave";
import { useRadialThemeTransition } from "./use-radial-theme-transition";
import {
  applyEditorMediaResult,
  editorAsyncCompletionIsCurrent,
  editorDraftCanEdit,
  serverSaveContainsLatestFields,
  type EditorAsyncTarget,
  type EditorDraftFields,
} from "@/lib/editor-autosave";

type View = "home" | "articles" | "article" | "profile" | "bookmarks" | "studio" | "editor" | "admin" | "users" | "adminInvite" | "audit" | "login" | "invite" | "changePassword" | "forbidden";

const articles = [
  { title: "把一个 AI Agent 从 Demo 带到生产环境", excerpt: "从评估、可观测性到权限边界，我们整理了这次落地中最重要的工程判断。", author: "Lin Chen", initials: "LC", category: "AI Engineering", read: "8 min", date: "7 月 9 日", accent: "violet", featured: true, tags: ["Agent", "Production"] },
  { title: "PostgreSQL 索引设计：一次真实的慢查询复盘", excerpt: "一个看似合理的复合索引，为什么让关键查询越来越慢？", author: "Mika", initials: "MK", category: "Backend", read: "11 min", date: "7 月 7 日", accent: "blue", featured: false, tags: ["PostgreSQL", "Performance"] },
  { title: "用 Next.js 构建可迁移的内容平台", excerpt: "把运行时、存储和身份能力放在清晰的适配层后面。", author: "Sky Pan", initials: "SP", category: "Frontend", read: "6 min", date: "7 月 5 日", accent: "mint", featured: false, tags: ["Next.js", "Architecture"] },
  { title: "我们如何组织每周技术共学", excerpt: "不追求信息量，追求可复用的知识沉淀与持续反馈。", author: "Alice Zhou", initials: "AZ", category: "Community", read: "5 min", date: "7 月 2 日", accent: "amber", featured: false, tags: ["Learning", "Team"] },
];

const categories = [
  ["AI Engineering", "32 篇", "⌁"], ["Frontend", "28 篇", "◇"], ["Backend", "24 篇", "⌘"], ["DevOps", "19 篇", "△"], ["Projects", "16 篇", "□"], ["Learning", "41 篇", "○"],
];

const authors = [
  ["Sky Pan", "SP", "18 篇文章", "Azure · Next.js"], ["Lin Chen", "LC", "14 篇文章", "AI Engineering"], ["Mika", "MK", "11 篇文章", "Backend · Data"], ["Alice Zhou", "AZ", "9 篇文章", "Design · Community"],
];

const delegatedRoles = ["MEMBER", "CONTRIBUTOR", "AUTHOR", "EDITOR"] as const;
const initialEditorForm: EditorDraftFields = { title: "", summary: "", content: "# 开始写作\n\n把这次实践中最值得复用的判断记录下来。", visibility: "PUBLIC", tags: "Next.js, Architecture", coverImage: "" };

function Avatar({ initials, small = false }: { initials: string; small?: boolean }) {
  return <span className={`avatar ${small ? "avatar-small" : ""}`}>{initials}</span>;
}

function ArticleCard({ article, onOpen }: { article: (typeof articles)[number]; onOpen: () => void }) {
  return (
    <article className="article-card" onClick={onOpen} tabIndex={0} onKeyDown={(event) => event.key === "Enter" && onOpen()}>
      <div className={`cover cover-${article.accent}`}><span>{article.category}</span><b>{article.title.slice(0, 1)}</b></div>
      <div className="article-card-body">
        <div className="meta-row"><span>{article.category}</span><span>·</span><span>{article.read}</span></div>
        <h3>{article.title}</h3>
        <p>{article.excerpt}</p>
        <div className="author-row"><Avatar initials={article.initials} small /><span>{article.author}</span><span className="spacer" /><span>{article.date}</span></div>
      </div>
    </article>
  );
}

export default function Home() {
  const [view, setView] = useState<View>("home");
  const themeButtonRef = useRef<HTMLButtonElement>(null);
  const { theme, toggleTheme, toggleLabel } = useRadialThemeTransition(themeButtonRef);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("全部");
  const [toast, setToast] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loginForm, setLoginForm] = useState({ login: "", password: "" });
  const [inviteForm, setInviteForm] = useState({ token: "", handle: "", displayName: "", password: "", confirmPassword: "" });
  const [changePasswordForm, setChangePasswordForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [adminInviteForm, setAdminInviteForm] = useState({ role: "MEMBER", publishingPolicy: "REVIEW_REQUIRED", expiresInHours: 72, note: "" });
  const [generatedInviteLink, setGeneratedInviteLink] = useState("");
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [operatorRole, setOperatorRole] = useState<"OWNER" | "ADMIN">("ADMIN");
  const [liked, setLiked] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [commentBody, setCommentBody] = useState("");
  const [editorForm, setEditorForm] = useState<EditorDraftFields>(initialEditorForm);
  const editorFormRef = useRef<EditorDraftFields>(initialEditorForm);
  const editorAsyncTargetRef = useRef<EditorAsyncTarget>({ userId: null, draftId: "new", generation: 0 });
  const editorOperationRef = useRef(0);
  const [editorDraftId, setEditorDraftId] = useState("new");
  const [editorDirty, setEditorDirty] = useState(false);
  const [saveState, setSaveState] = useState("尚未保存");
  const [mediaUploadEnabled, setMediaUploadEnabled] = useState(false);
  const [editorUserId, setEditorUserId] = useState<string | null>(null);
  const [editorIdentityResolved, setEditorIdentityResolved] = useState(false);
  const localDraft = useEditorAutosave({ userId: editorUserId, draftId: editorDraftId, fields: editorForm, enabled: view === "editor" && editorIdentityResolved, dirty: editorDirty });

  const filtered = useMemo(() => articles.filter((article) =>
    (filter === "全部" || article.category === filter) &&
    `${article.title}${article.excerpt}${article.tags.join("")}`.toLowerCase().includes(query.toLowerCase())
  ), [query, filter]);
  const editorCanEdit = editorDraftCanEdit({ identityResolved: editorIdentityResolved, userId: editorUserId, recoveryChecked: localDraft.ready, recoveryPending: Boolean(localDraft.recovery) });
  const editorStatus = !editorIdentityResolved ? "正在确认账户…"
    : !editorUserId ? "请先登录后编辑"
      : !localDraft.ready ? "正在检查本地草稿…"
        : localDraft.status === "saving" ? "正在保存到本地…"
    : localDraft.status === "saved" ? "已保存到本地"
      : localDraft.status === "error" ? "本地保存不可用，请手动保存"
        : localDraft.status === "recovery" ? "发现可恢复的本地草稿"
          : saveState;

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) return;
    const timer = window.setTimeout(() => {
      setInviteForm((current) => ({ ...current, token }));
      setView("invite");
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/media").then((response) => response.ok ? response.json() : null).then((data) => { if (active) setMediaUploadEnabled(data?.uploadEnabled === true); }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/session", { credentials: "include" }).then(async (response) => response.ok ? response.json() : null).then((data) => {
      if (!active) return;
      const userId = typeof data?.user?.id === "string" ? data.user.id : null;
      editorOperationRef.current += 1;
      editorAsyncTargetRef.current = { ...editorAsyncTargetRef.current, userId, generation: editorAsyncTargetRef.current.generation + 1 };
      setEditorUserId(userId);
      if (data?.user?.role === "OWNER" || data?.user?.role === "ADMIN") setOperatorRole(data.user.role);
    }).catch(() => { if (active) { editorOperationRef.current += 1; editorAsyncTargetRef.current = { ...editorAsyncTargetRef.current, userId: null, generation: editorAsyncTargetRef.current.generation + 1 }; setEditorUserId(null); } }).finally(() => { if (active) setEditorIdentityResolved(true); });
    return () => { active = false; };
  }, []);

  function navigate(next: View) {
    if (view === "editor" && next !== "editor") { editorOperationRef.current += 1; editorAsyncTargetRef.current = { ...editorAsyncTargetRef.current, generation: editorAsyncTargetRef.current.generation + 1 }; setBusy(false); }
    setView(next); setMobileOpen(false); window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function notify(message: string) {
    setToast(message); window.setTimeout(() => setToast(""), 2200);
  }

  function openEditor(draftId: string) {
    editorOperationRef.current += 1;
    editorAsyncTargetRef.current = { userId: editorAsyncTargetRef.current.userId, draftId, generation: editorAsyncTargetRef.current.generation + 1 };
    setEditorDraftId(draftId);
    editorFormRef.current = initialEditorForm;
    setEditorForm(initialEditorForm);
    setEditorDirty(false);
    setBusy(false);
    setSaveState("尚未保存");
    navigate("editor");
  }

  function updateEditorField<Key extends keyof EditorDraftFields>(key: Key, value: EditorDraftFields[Key]) {
    setEditorForm((current) => {
      const next = { ...current, [key]: value };
      editorFormRef.current = next;
      return next;
    });
    setEditorDirty(true);
    setSaveState("有未保存的修改");
  }

  function restoreLocalDraft() {
    const restored = localDraft.acceptRecovery();
    if (!restored) return;
    editorFormRef.current = restored;
    setEditorForm(restored);
    setEditorDirty(true);
    setSaveState("已恢复本地草稿");
    notify("已恢复本地草稿");
  }

  function discardLocalDraft() {
    localDraft.discardRecovery();
    notify("已放弃本地恢复内容");
  }

  function csrfToken() { return document.cookie.split(";").map((part) => part.trim().split("=")).find(([key]) => key === "shadow_sky_csrf")?.slice(1).join("=") ?? ""; }
  async function api(path: string, init: RequestInit = {}) {
    const response = await fetch(path, { ...init, credentials: "include", headers: { ...(init.body instanceof FormData ? {} : { "content-type": "application/json" }), ...(init.method && init.method !== "GET" ? { "x-csrf-token": csrfToken() } : {}), ...init.headers } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { if (response.status === 401) notify("登录状态已失效，请重新登录"); throw new Error(data?.error?.message ?? "请求失败，请稍后重试"); }
    return data;
  }
  async function submitLogin(event: FormEvent) { event.preventDefault(); setBusy(true); try { const data = await api("/api/auth/login", { method: "POST", body: JSON.stringify(loginForm) }); const userId = typeof data.user.id === "string" ? data.user.id : null; editorOperationRef.current += 1; editorAsyncTargetRef.current = { ...editorAsyncTargetRef.current, userId, generation: editorAsyncTargetRef.current.generation + 1 }; setEditorUserId(userId); setEditorIdentityResolved(true); if (data.user.role === "OWNER" || data.user.role === "ADMIN") setOperatorRole(data.user.role); if (data.user.mustChangePassword) { notify("请先修改管理员设置的临时密码"); navigate("changePassword"); } else { notify("登录成功"); navigate("studio"); } } catch (error) { notify(error instanceof Error ? error.message : "登录失败"); } finally { setBusy(false); } }
  async function submitInvite(event: FormEvent) { event.preventDefault(); setBusy(true); try { await api("/api/auth/invite", { method: "POST", body: JSON.stringify(inviteForm) }); notify("注册成功，请使用新账户登录"); navigate("login"); } catch (error) { notify(error instanceof Error ? error.message : "邀请无效"); } finally { setBusy(false); } }
  async function submitPasswordChange(event: FormEvent) { event.preventDefault(); if (changePasswordForm.newPassword !== changePasswordForm.confirmPassword) { notify("两次新密码输入不一致"); return; } setBusy(true); try { await api("/api/auth/change-password", { method: "POST", body: JSON.stringify({ currentPassword: changePasswordForm.currentPassword, newPassword: changePasswordForm.newPassword }) }); editorOperationRef.current += 1; editorAsyncTargetRef.current = { ...editorAsyncTargetRef.current, userId: null, generation: editorAsyncTargetRef.current.generation + 1 }; setEditorUserId(null); setEditorIdentityResolved(true); notify("密码已修改，请重新登录"); navigate("login"); } catch (error) { notify(error instanceof Error ? error.message : "修改失败"); } finally { setBusy(false); } }
  async function createAdminInvitation(event: FormEvent) { event.preventDefault(); setBusy(true); try { const data = await api("/api/admin/invitations", { method: "POST", body: JSON.stringify(adminInviteForm) }); setGeneratedInviteLink(data.inviteLink); notify("一次性邀请已生成"); } catch (error) { notify(error instanceof Error ? error.message : "创建邀请失败"); } finally { setBusy(false); } }
  async function resetUserPassword(userId: string) { setBusy(true); try { const data = await api("/api/admin/users/reset-password", { method: "POST", body: JSON.stringify({ userId }) }); setTemporaryPassword(data.temporaryPassword); notify("临时密码已生成，旧 Session 已撤销"); } catch (error) { notify(error instanceof Error ? error.message : "重置失败"); } finally { setBusy(false); } }
  async function uploadImage(file: File, purpose: "AVATAR" | "COVER" | "CONTENT") {
    const started = { ...editorAsyncTargetRef.current };
    const operationId = ++editorOperationRef.current;
    const isCurrent = () => purpose === "AVATAR"
      ? editorOperationRef.current === operationId
      : editorAsyncCompletionIsCurrent(editorAsyncTargetRef.current, started, editorOperationRef.current, operationId);
    const form = new FormData(); form.set("file", file); form.set("purpose", purpose); setBusy(true);
    try {
      const data = await api("/api/media", { method: "POST", body: form });
      if (purpose === "AVATAR") {
        await api("/api/profile", { method: "PATCH", body: JSON.stringify({ avatarKey: data.asset.url }) });
      } else {
        if (!isCurrent()) return;
        setEditorForm((current) => {
          if (!isCurrent()) return current;
          const next = applyEditorMediaResult(editorAsyncTargetRef.current, started, current, purpose, data.asset.url);
          if (!next) return current;
          editorFormRef.current = next;
          return next;
        });
        setEditorDirty(true);
        setSaveState("有未保存的修改");
      }
      if (isCurrent()) notify("图片已安全上传");
    } catch (error) { if (isCurrent()) notify(error instanceof Error ? error.message : "上传失败"); } finally { if (isCurrent()) setBusy(false); }
  }

  async function createDraft(action: "SAVE" | "SUBMIT") {
    const started = { ...editorAsyncTargetRef.current };
    const operationId = ++editorOperationRef.current;
    const isCurrent = () => editorAsyncCompletionIsCurrent(editorAsyncTargetRef.current, started, editorOperationRef.current, operationId);
    const submitted = { ...editorFormRef.current };
    setBusy(true); setSaveState("正在保存…");
    try {
      const data = await api("/api/posts", { method: "POST", body: JSON.stringify({ title: submitted.title, summary: submitted.summary, content: submitted.content, visibility: submitted.visibility, coverImage: submitted.coverImage || null, tags: submitted.tags.split(",").map((tag) => tag.trim()).filter(Boolean) }) });
      if (action === "SUBMIT") await api(`/api/posts/${data.post.id}/actions`, { method: "POST", body: JSON.stringify({ action: "SUBMIT" }) });
      if (!isCurrent()) return;
      const latest = editorFormRef.current;
      if (serverSaveContainsLatestFields(latest, submitted)) {
        localDraft.clearAfterServerSave(submitted);
        setEditorDirty(false);
        setSaveState(action === "SUBMIT" ? "已提交审核" : "草稿已安全保存");
        notify(action === "SUBMIT" ? "文章已提交审核" : "草稿已保存");
      } else {
        localDraft.persistNow(latest);
        setEditorDirty(true);
        setSaveState("服务器已保存较早版本，本地仍有未保存修改");
        notify("服务器已保存较早版本，本地修改仍保留");
      }
    } catch (error) {
      if (isCurrent()) {
        localDraft.persistNow(editorFormRef.current);
        setSaveState("保存失败，本地草稿仍保留");
        notify(error instanceof Error ? error.message : "保存失败");
      }
    } finally { if (isCurrent()) setBusy(false); }
  }

  return (
    <div className={`site ${theme}`}>
      <header className="topbar">
        <button className="brand" onClick={() => navigate("home")} aria-label="返回首页"><span className="brand-mark">S</span><span>Shadow Sky</span><i>LAB</i></button>
        <nav className={mobileOpen ? "nav open" : "nav"}>
          <button className={view === "home" ? "active" : ""} onClick={() => navigate("home")}>首页</button>
          <button className={view === "articles" || view === "article" ? "active" : ""} onClick={() => navigate("articles")}>文章</button>
          <button onClick={() => navigate("profile")}>成员</button>
          <button onClick={() => navigate("studio")}>创作中心</button>
        </nav>
        <div className="top-actions">
          <button
            ref={themeButtonRef}
            type="button"
            className="icon-btn theme-toggle"
            data-theme={theme}
            onClick={() => { void toggleTheme(); }}
            aria-label={toggleLabel}
          >
            <span className="theme-icon-stack" aria-hidden="true">
              <span className="theme-icon theme-icon-sun" />
              <span className="theme-icon theme-icon-moon" />
            </span>
          </button>
          <button className="search-shortcut" onClick={() => navigate("articles")}>⌕ <span>搜索</span><kbd>⌘ K</kbd></button>
          <button className="btn-secondary" onClick={() => navigate("login")}>登录</button>
          <button className="btn-primary" onClick={() => navigate("studio")}>写文章 <span>↗</span></button>
          <button className="menu-btn" onClick={() => setMobileOpen(!mobileOpen)} aria-label="打开菜单">☰</button>
        </div>
      </header>

      <main>
        {view === "home" && <>
          <section className="hero">
            <div className="eyebrow"><span className="live-dot" /> 群聊之外，知识继续生长</div>
            <h1>分享正在发生的<br /><em>思考与创造。</em></h1>
            <p>一个由群成员共同维护的技术知识社区。记录学习，分享项目，让每一次讨论都成为可检索、可复用的长期价值。</p>
            <div className="hero-actions"><button className="btn-primary btn-large" onClick={() => navigate("articles")}>开始阅读 <span>→</span></button><button className="btn-ghost btn-large" onClick={() => navigate("studio")}>分享你的想法</button></div>
            <div className="community-line"><div className="avatar-stack">{authors.slice(0, 4).map((a) => <Avatar key={a[0]} initials={a[1]} small />)}</div><span><b>24 位成员</b> 正在共同创作</span></div>
          </section>

          <section className="section featured-section">
            <div className="section-head"><div><span className="kicker">FEATURED</span><h2>本周推荐</h2></div><button className="text-link" onClick={() => navigate("articles")}>查看全部文章 →</button></div>
            <div className="featured-grid">
              <button className="featured-art" onClick={() => navigate("article")}><div className="code-window"><span /><span /><span /><pre>agent.run({`{\n  `}<b>trustBoundary</b>: true,{`\n  evaluate: continuous\n}`})</pre></div><div className="orb orb-one" /><div className="orb orb-two" /></button>
              <div className="featured-copy"><span className="pill">AI Engineering</span><h2>把一个 AI Agent<br />从 Demo 带到生产环境</h2><p>从评估、可观测性到权限边界，我们整理了这次落地中最重要的工程判断。</p><div className="feature-author"><Avatar initials="LC" /><div><b>Lin Chen</b><span>7 月 9 日 · 8 分钟阅读</span></div></div><button className="round-arrow" onClick={() => navigate("article")} aria-label="阅读文章">↗</button></div>
            </div>
          </section>

          <section className="section">
            <div className="section-head"><div><span className="kicker">LATEST</span><h2>最新发布</h2></div><div className="segmented"><button className="selected">全部</button><button>技术</button><button>学习</button><button>项目</button></div></div>
            <div className="cards-grid">{articles.slice(1).map((article) => <ArticleCard key={article.title} article={article} onOpen={() => navigate("article")} />)}</div>
          </section>

          <section className="section category-section">
            <div className="section-head"><div><span className="kicker">EXPLORE</span><h2>探索分类</h2></div></div>
            <div className="category-grid">{categories.map(([name, count, icon]) => <button className="category-card" key={name} onClick={() => { setFilter(name); navigate("articles"); }}><span className="category-icon">{icon}</span><span><b>{name}</b><small>{count}</small></span><i>↗</i></button>)}</div>
          </section>

          <section className="section authors-section">
            <div className="section-head"><div><span className="kicker">COMMUNITY</span><h2>活跃作者</h2></div><button className="text-link" onClick={() => navigate("profile")}>认识所有成员 →</button></div>
            <div className="author-grid">{authors.map(([name, initials, count, focus]) => <button className="author-card" key={name} onClick={() => navigate("profile")}><Avatar initials={initials} /><span><b>{name}</b><small>{focus}</small></span><i>{count}</i></button>)}</div>
          </section>
        </>}

        {view === "articles" && <section className="page section page-enter">
          <div className="page-heading"><span className="kicker">LIBRARY</span><h1>文章</h1><p>来自社区成员的技术实践、学习记录与项目复盘。</p></div>
          <div className="library-toolbar"><label className="search-box">⌕<input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索文章、标签或作者…" /></label><select value={filter} onChange={(e) => setFilter(e.target.value)}><option>全部</option>{categories.map(([c]) => <option key={c}>{c}</option>)}</select></div>
          <div className="filter-chips">{["全部", "AI Engineering", "Frontend", "Backend", "Community"].map((item) => <button key={item} className={filter === item ? "selected" : ""} onClick={() => setFilter(item)}>{item}</button>)}</div>
          <div className="cards-grid library-grid">{filtered.map((article) => <ArticleCard key={article.title} article={article} onOpen={() => navigate("article")} />)}</div>
          {!filtered.length && <div className="empty-state"><span>⌕</span><h3>没有找到相关内容</h3><p>试试更短的关键词或其他分类。</p></div>}
        </section>}

        {view === "article" && <article className="reading-page page-enter">
          <button className="back-link" onClick={() => navigate("articles")}>← 返回文章</button>
          <div className="article-hero"><span className="pill">AI Engineering</span><h1>把一个 AI Agent<br />从 Demo 带到生产环境</h1><p>从评估、可观测性到权限边界，我们整理了这次落地中最重要的工程判断。</p><div className="article-byline"><Avatar initials="LC" /><div><b>Lin Chen</b><span>2026 年 7 月 9 日 · 8 分钟阅读</span></div><button onClick={() => { setLiked(!liked); notify(liked ? "已取消点赞" : "已点赞"); }}>{liked ? "♥ 已赞" : "♡ 点赞"}</button><button onClick={() => { setBookmarked(!bookmarked); notify(bookmarked ? "已取消收藏" : "已加入我的收藏"); }}>{bookmarked ? "★ 已收藏" : "☆ 收藏"}</button></div></div>
          <div className="reading-cover"><div className="code-window large"><span /><span /><span /><pre>production_ready = evaluation + observability + boundaries</pre></div></div>
          <div className="reading-layout"><aside><b>本文目录</b><a href="#context">01 背景</a><a href="#evaluation">02 持续评估</a><a href="#boundary">03 权限边界</a><a href="#summary">04 总结</a></aside><div className="prose"><p className="lead">真正困难的部分从来不是让 Agent 跑起来，而是让它在不确定的输入、变化的依赖和真实权限边界中保持可靠。</p><h2 id="context">从 Demo 到系统</h2><p>Demo 验证的是能力上限；生产系统需要定义可接受的失败方式。我们把每个工具调用都视为一个需要审计的动作，把模型输出当作非可信输入。</p><blockquote>可靠性不是一个开关，而是一组可以被观察、被验证、被回滚的约束。</blockquote><h2 id="evaluation">建立持续评估</h2><p>离线样本只能建立初始信心。上线后还需要匿名化的真实流量回放、关键路径指标和人工复核队列。</p><div className="inline-code">evaluate → observe → review → improve</div><h2 id="boundary">把权限放在服务端</h2><p>前端隐藏按钮不等于权限控制。每一次读取、发布、审核和管理操作都必须经过服务端策略判断，并留下结构化审计记录。</p><h2 id="summary">结语</h2><p>一个成熟的 Agent 系统，最终看起来更像一套严谨的软件工程系统，而不是一段漂亮的 Prompt。</p></div></div><section className="comments-panel"><h2>成员讨论</h2><p>评论继承文章可见性，并在服务端进行 XSS 清理和频率限制。</p><form onSubmit={(event) => { event.preventDefault(); if (commentBody.trim()) { notify("评论已提交"); setCommentBody(""); } }}><textarea value={commentBody} onChange={(event) => setCommentBody(event.target.value)} maxLength={4000} placeholder="分享你的想法，或回复其他成员…" /><button className="btn-primary">发表评论</button></form><div className="comment-item"><Avatar initials="MK" small /><div><b>Mika</b><p>权限边界这部分很实用，尤其是把可见性检查放在收藏和搜索之后再次执行。</p><button>回复</button></div></div></section>
        </article>}

        {view === "editor" && <div className="editor-media-tools"><span><b>媒体</b><small>{mediaUploadEnabled ? "仅 PNG、JPEG、WebP、GIF；服务端校验真实 MIME。" : "预览环境尚未接入持久对象存储，媒体上传暂不可用。"}</small></span>{mediaUploadEnabled && editorCanEdit && <><label className="btn-secondary upload-button">上传封面<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => event.target.files?.[0] && uploadImage(event.target.files[0], "COVER")} /></label><label className="btn-secondary upload-button">插入正文图片<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => event.target.files?.[0] && uploadImage(event.target.files[0], "CONTENT")} /></label></>}</div>}

        {view === "profile" && <section className="page section page-enter"><div className="profile-hero"><Avatar initials="SP" /><div><h1>Sky Pan</h1><p>@sky_pan · 关注云原生、Next.js 与高质量技术社区。正在把群聊里的灵感变成长期知识。</p><p><a href="https://github.com/" target="_blank" rel="noreferrer">GitHub</a> · <a href="https://shadowskypan.asia" target="_blank" rel="noreferrer">个人网站</a></p><div className="profile-stats"><span><b>18</b>公开文章</span><span><b>1.2k</b>获赞</span></div></div>{mediaUploadEnabled && <label className="btn-secondary upload-button">更新头像<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => event.target.files?.[0] && uploadImage(event.target.files[0], "AVATAR")} /></label>}</div><div className="profile-tabs"><button className="selected">文章</button><button onClick={() => navigate("bookmarks")}>我的收藏</button><button>关于</button></div><div className="cards-grid">{articles.slice(0, 3).map((article) => <ArticleCard key={article.title} article={article} onOpen={() => navigate("article")} />)}</div></section>}

        {view === "bookmarks" && <section className="page section page-enter"><div className="studio-head"><div><span className="kicker">PRIVATE LIBRARY</span><h1>我的收藏</h1><p>收藏列表会重新执行文章可见性检查，不能用于读取已失去权限的内容。</p></div><button className="btn-secondary" onClick={() => navigate("profile")}>返回个人主页</button></div><div className="cards-grid">{articles.slice(0, 2).map((article) => <ArticleCard key={article.title} article={article} onOpen={() => navigate("article")} />)}</div></section>}

        {view === "studio" && <section className="page section page-enter"><div className="studio-head"><div><span className="kicker">CREATOR STUDIO</span><h1>我的文章</h1><p>管理草稿、提交审核并追踪发布状态。发布路径由账户的 publishingPolicy 决定。</p></div><button className="btn-primary" onClick={() => openEditor("new")}>＋ 新建文章</button></div><div className="policy-banner"><span>当前发布策略</span><b>REVIEW_REQUIRED</b><p>新文章需要 Editor、Admin 或 Owner 审核。策略由管理员按用户单独设置。</p></div><div className="stat-grid"><div><span>草稿</span><b>3</b><small>其中 1 篇本周更新</small></div><div><span>待审核</span><b>2</b><small>平均 1.4 天完成</small></div><div><span>已发布</span><b>18</b><small>累计 8,492 次阅读</small></div><div><span>被退回</span><b>1</b><small>等待修改后重新提交</small></div></div><div className="table-card"><div className="table-row table-head"><span>文章</span><span>状态</span><span>可见性</span><span>更新时间</span><span /></div>{[["Azure 上的容器化 Next.js 实践","草稿","PRIVATE","今天"],["用 Next.js 构建可迁移的内容平台","已发布","PUBLIC","7 月 5 日"],["群聊知识库的内容治理","待审核","MEMBERS_ONLY","7 月 3 日"],["一次失败的缓存优化复盘","被退回","MEMBERS_ONLY","6 月 28 日"]].map((row) => <div className="table-row" key={row[0]}><span><b>{row[0]}</b><small>技术文章</small></span><span><i className={`status status-${row[1]}`}>{row[1]}</i></span><span>{row[2]}</span><span>{row[3]}</span><button onClick={() => openEditor(row[0])}>编辑</button></div>)}</div></section>}

        {view === "editor" && <section className="editor-page page-enter"><div className="editor-top"><button className="back-link" onClick={() => navigate("studio")}>← 我的文章</button><span role="status" aria-live="polite">{editorStatus}</span><div><button className="btn-secondary" disabled={!editorCanEdit} onClick={() => notify("预览使用与详情页相同的安全 Markdown 渲染器")}>预览</button><button className="btn-secondary" disabled={busy || !editorCanEdit} onClick={() => createDraft("SAVE")}>保存草稿</button><button className="btn-primary" disabled={busy || !editorCanEdit} onClick={() => createDraft("SUBMIT")}>提交审核</button></div></div>{localDraft.recovery && <div className="draft-recovery" role="status"><div><b>发现本地草稿</b><span>保存于 {new Date(localDraft.recovery.savedAt).toLocaleString("zh-CN", { hour12: false })}。请先恢复或放弃；在此之前编辑器保持锁定，避免覆盖本地内容。</span></div><button className="btn-primary" type="button" onClick={restoreLocalDraft}>恢复内容</button><button className="btn-ghost" type="button" onClick={discardLocalDraft}>放弃恢复</button></div>}<div className="editor-shell"><fieldset className="editor-fields" disabled={!editorCanEdit}><label>文章标题<input value={editorForm.title} onChange={(e) => updateEditorField("title", e.target.value)} placeholder="一个清晰、具体的标题" /></label><label>摘要<textarea value={editorForm.summary} onChange={(e) => updateEditorField("summary", e.target.value)} placeholder="用两句话说明读者会获得什么" /></label><div className="editor-meta"><label>可见性<select value={editorForm.visibility} onChange={(e) => updateEditorField("visibility", e.target.value as EditorDraftFields["visibility"])}><option value="PUBLIC">公开</option><option value="MEMBERS_ONLY">仅成员</option><option value="PRIVATE">私密</option></select></label><label>标签<input value={editorForm.tags} onChange={(e) => updateEditorField("tags", e.target.value)} /></label></div><label className="content-field">Markdown 正文<textarea value={editorForm.content} onChange={(e) => updateEditorField("content", e.target.value)} /></label></fieldset><aside className="editor-guide"><span className="secure-badge">● Server validated</span><h3>发布检查</h3><div><span>标题与摘要</span><b>{editorForm.title && editorForm.summary ? "✓" : "—"}</b></div><div><span>正文内容</span><b>{editorForm.content.length > 50 ? "✓" : "—"}</b></div><div><span>XSS 清理</span><b>提交时执行</b></div><div><span>审核策略</span><b>REVIEW_REQUIRED</b></div><p>未提交的编辑内容会防抖保存到此设备；离开页面前会同步刷新。正式保存只会清理与提交快照完全一致的本地副本。</p></aside></div></section>}

        {view === "admin" && <section className="page section page-enter"><div className="studio-head"><div><span className="kicker">ADMIN CONSOLE</span><h1>内容审核</h1><p>Editor、Admin、Owner 可审核他人的待审核文章；自审会被服务端拒绝。</p></div><span className="secure-badge">● Server protected</span></div><div className="admin-tabs"><button className="selected">待审核 2</button><button onClick={() => navigate("users")}>用户管理</button><button onClick={() => navigate("audit")}>审计日志</button></div><div className="review-grid"><div className="review-card"><div><span className="pill">PENDING_REVIEW</span><h3>群聊知识库的内容治理</h3><p>提交者：Mika · 2 小时前 · MEMBERS_ONLY</p><blockquote>文章阐述如何从即时讨论中提取结构化、可复用的群体知识。</blockquote></div><div><button className="btn-secondary" onClick={() => notify("退回操作要求填写原因，并会写入审计日志")}>请求修改</button><button className="btn-primary" onClick={() => notify("审核 API 会再次检查审核人与作者不同")}>批准发布</button></div></div><div className="permission-panel"><h3>权限边界</h3>{[["文章审核","Editor +"],["修改发布策略","Admin +"],["修改用户角色","Admin +"],["网站设置","Owner"]].map((r) => <div key={r[0]}><span>{r[0]}</span><b>{r[1]}</b></div>)}</div></div></section>}

        {view === "users" && <section className="page section page-enter"><div className="studio-head"><div><span className="kicker">ACCESS CONTROL</span><h1>用户管理</h1><p>当前操作者：{operatorRole}。Owner 由服务器维护，任何 Web API 都不能创建或分配 Owner。</p></div><button className="btn-primary" onClick={() => navigate("adminInvite")}>＋ 创建邀请</button></div><div className="admin-tabs"><button onClick={() => navigate("admin")}>待审核</button><button className="selected">用户管理</button><button onClick={() => navigate("audit")}>审计日志</button></div>{temporaryPassword && <div className="one-time-secret"><span>一次性临时密码</span><code>{temporaryPassword}</code><button onClick={() => navigator.clipboard.writeText(temporaryPassword)}>复制</button><small>仅显示一次。请通过私聊发送，并要求用户登录后立即修改。</small></div>}<div className="user-list"><div className="user-row user-head"><span>成员</span><span>角色</span><span>发布策略</span><span>状态</span><span>操作</span></div>{[["00000000-0000-4000-8000-000000000001","Sky Pan","SP","OWNER","DIRECT_PUBLISH","ACTIVE"],["00000000-0000-4000-8000-000000000002","Lin Chen","LC","AUTHOR","DIRECT_PUBLISH","ACTIVE"],["00000000-0000-4000-8000-000000000003","Mika","MK","CONTRIBUTOR","REVIEW_REQUIRED","ACTIVE"],["00000000-0000-4000-8000-000000000004","Alice Zhou","AZ","EDITOR","DIRECT_PUBLISH","ACTIVE"],["00000000-0000-4000-8000-000000000005","Dev Admin","DA","ADMIN","DIRECT_PUBLISH","ACTIVE"]].map((user) => { const manageable = user[3] !== "OWNER" && (operatorRole === "OWNER" || user[3] !== "ADMIN"); const assignableRoles = operatorRole === "OWNER" ? [...delegatedRoles, "ADMIN"] : [...delegatedRoles]; return <div className="user-row" key={user[0]}><span><Avatar initials={user[2]} small /><span><b>{user[1]}</b><small>@{user[1].toLowerCase().replace(" ", "_")}</small></span></span>{manageable ? <select defaultValue={user[3]} aria-label={`${user[1]} 角色`}>{assignableRoles.map((role) => <option key={role}>{role}</option>)}</select> : <span className="role-pill">{user[3]}</span>}<select defaultValue={user[4]} aria-label={`${user[1]} 发布策略`} disabled={!manageable}><option>REVIEW_REQUIRED</option><option>DIRECT_PUBLISH</option></select><i className={`member-state ${user[5].toLowerCase()}`}>{user[5]}</i><span className="user-actions">{manageable ? <><button onClick={() => notify("服务端会再次校验操作者与目标角色")}>保存</button><button disabled={busy} onClick={() => resetUserPassword(user[0])}>重置密码</button></> : <small>不可管理</small>}</span></div>; })}</div></section>}

        {view === "adminInvite" && <section className="page section page-enter"><div className="studio-head"><div><span className="kicker">INVITATION CONTROL</span><h1>创建邀请</h1><p>当前操作者：{operatorRole}。Admin 只能邀请 Editor 及以下角色；Owner 可额外邀请 Admin。</p></div><button className="btn-secondary" onClick={() => navigate("users")}>返回用户管理</button></div><div className="invite-admin-grid"><form className="permission-panel" onSubmit={createAdminInvitation}><h3>邀请设置</h3><label>初始角色<select value={adminInviteForm.role} onChange={(e) => setAdminInviteForm({ ...adminInviteForm, role: e.target.value })}>{[...delegatedRoles, ...(operatorRole === "OWNER" ? ["ADMIN" as const] : [])].map((role) => <option key={role}>{role}</option>)}</select></label><label>发布策略<select value={adminInviteForm.publishingPolicy} onChange={(e) => setAdminInviteForm({ ...adminInviteForm, publishingPolicy: e.target.value })}><option>REVIEW_REQUIRED</option><option>DIRECT_PUBLISH</option></select></label><label>有效小时数<input type="number" min="1" max="720" value={adminInviteForm.expiresInHours} onChange={(e) => setAdminInviteForm({ ...adminInviteForm, expiresInHours: Number(e.target.value) })} /></label><label>备注（可选）<input value={adminInviteForm.note} onChange={(e) => setAdminInviteForm({ ...adminInviteForm, note: e.target.value })} placeholder="例如：周末聚会新成员" /></label><button className="btn-primary" disabled={busy}>{busy ? "正在生成…" : "生成一次性邀请"}</button></form><div className="permission-panel"><h3>一次性结果</h3>{generatedInviteLink ? <div className="generated-link"><p>数据库只保存哈希；以下链接离开页面后不会再次显示。</p><code>{generatedInviteLink}</code><button className="btn-secondary" onClick={() => navigator.clipboard.writeText(generatedInviteLink)}>复制邀请链接</button></div> : <div className="empty-mini">创建邀请后在这里显示一次性链接。</div>}<h3 className="subheading">最近邀请</h3>{[["给线下朋友","AUTHOR · REVIEW_REQUIRED","72 小时","可使用"],["项目协作者","CONTRIBUTOR · DIRECT_PUBLISH","24 小时","已使用"],["旧邀请","MEMBER · REVIEW_REQUIRED","已过期","已作废"]].map((item) => <div className="invite-row" key={item[0]}><span><b>{item[0]}</b><small>{item[1]} · {item[2]}</small></span><i>{item[3]}</i><button onClick={() => notify("邀请已作废并写入审计日志")}>作废</button></div>)}</div></div></section>}

        {view === "audit" && <section className="page section page-enter"><div className="studio-head"><div><span className="kicker">AUDIT TRAIL</span><h1>审计日志</h1><p>重要操作至少保留 180 天，不记录密码、Session Token 或正文私密内容。</p></div><button className="btn-secondary" onClick={() => notify("审计导出将在管理 API 权限下执行")}>导出</button></div><div className="admin-tabs"><button onClick={() => navigate("admin")}>待审核</button><button onClick={() => navigate("users")}>用户管理</button><button className="selected">审计日志</button></div><div className="audit-list">{[["ADMIN_PASSWORD_RESET","Sky Pan","@lin_chen","旧 Session 已撤销","刚刚"],["PUBLISHING_POLICY_CHANGED","Sky Pan","Lin Chen","REVIEW_REQUIRED → DIRECT_PUBLISH","8 分钟前"],["POST_APPROVED","Alice Zhou","群聊知识库的内容治理","审核通过","12 分钟前"],["LOGIN_FAILURE","—","@mika","INVALID_CREDENTIALS","34 分钟前"],["INVITATION_CREATED","Sky Pan","线下朋友邀请","AUTHOR · REVIEW_REQUIRED","2 天前"]].map((event) => <div className="audit-row" key={`${event[0]}${event[4]}`}><span className="audit-icon">{event[0].startsWith("LOGIN") ? "!" : "✓"}</span><span><b>{event[0]}</b><small>操作人：{event[1]}</small></span><span><b>{event[2]}</b><small>{event[3]}</small></span><time>{event[4]}</time></div>)}</div></section>}

        {view === "login" && <section className="auth-page page-enter"><form className="auth-card" onSubmit={submitLogin}><span className="brand-mark large">S</span><span className="kicker">MEMBER ACCESS</span><h1>欢迎回来</h1><p>仅受邀请的社区成员可以登录。</p><label>用户名<input autoComplete="username" value={loginForm.login} onChange={(e) => setLoginForm({ ...loginForm, login: e.target.value.toLowerCase() })} placeholder="例如 sky_pan" /></label><label>密码<input type="password" autoComplete="current-password" value={loginForm.password} onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })} placeholder="至少 12 位" /></label><div className="auth-options"><span>安全 Session · HttpOnly Cookie</span><span>忘记密码请联系管理员重置</span></div><button className="btn-primary auth-submit" disabled={busy}>{busy ? "正在验证…" : "登录"}</button><div className="auth-divider"><span>邀请注册</span></div><button type="button" className="btn-secondary auth-submit" onClick={() => navigate("invite")}>使用邀请码</button><small>不开放公共注册，不使用邮箱验证或邮件找回密码。</small></form></section>}

        {view === "invite" && <section className="auth-page page-enter"><form className="auth-card wide-auth" onSubmit={submitInvite}><span className="brand-mark large">S</span><span className="kicker">INVITATION</span><h1>加入 Shadow Sky</h1><p>邀请码不绑定邮箱，只能使用一次，并受有效期和作废状态保护。</p><label>邀请码<input value={inviteForm.token} onChange={(e) => setInviteForm({ ...inviteForm, token: e.target.value })} placeholder="粘贴管理员发送的邀请码" /></label><div className="form-two"><label>用户名<input value={inviteForm.handle} onChange={(e) => setInviteForm({ ...inviteForm, handle: e.target.value.toLowerCase() })} placeholder="sky_pan" /></label><label>显示名称<input value={inviteForm.displayName} onChange={(e) => setInviteForm({ ...inviteForm, displayName: e.target.value })} placeholder="Sky Pan" /></label></div><label>设置密码<input type="password" autoComplete="new-password" value={inviteForm.password} onChange={(e) => setInviteForm({ ...inviteForm, password: e.target.value })} placeholder="至少 12 位" /></label><label>确认密码<input type="password" autoComplete="new-password" value={inviteForm.confirmPassword} onChange={(e) => setInviteForm({ ...inviteForm, confirmPassword: e.target.value })} placeholder="再次输入密码" /></label><button className="btn-primary auth-submit" disabled={busy}>{busy ? "正在创建账户…" : "接受邀请并注册"}</button><button type="button" className="text-link auth-back" onClick={() => navigate("login")}>已有账户？返回登录</button></form></section>}

        {view === "changePassword" && <section className="auth-page page-enter"><form className="auth-card" onSubmit={submitPasswordChange}><span className="brand-mark large">S</span><span className="kicker">PASSWORD REQUIRED</span><h1>请先修改密码</h1><p>管理员重置了你的密码。完成修改前，其他受保护功能不可访问。</p><label>临时密码<input type="password" autoComplete="current-password" value={changePasswordForm.currentPassword} onChange={(e) => setChangePasswordForm({ ...changePasswordForm, currentPassword: e.target.value })} /></label><label>新密码<input type="password" autoComplete="new-password" value={changePasswordForm.newPassword} onChange={(e) => setChangePasswordForm({ ...changePasswordForm, newPassword: e.target.value })} placeholder="至少 12 位" /></label><label>确认新密码<input type="password" autoComplete="new-password" value={changePasswordForm.confirmPassword} onChange={(e) => setChangePasswordForm({ ...changePasswordForm, confirmPassword: e.target.value })} /></label><button className="btn-primary auth-submit" disabled={busy}>{busy ? "正在更新…" : "修改密码并重新登录"}</button></form></section>}

        {view === "forbidden" && <section className="empty-page page-enter"><span>403</span><h1>权限不足</h1><p>当前账户没有访问此页面的权限。权限由服务器根据角色、账户状态与资源归属判断。</p><button className="btn-primary" onClick={() => navigate("home")}>返回首页</button></section>}
      </main>

      <footer><div><button className="brand" onClick={() => navigate("home")}><span className="brand-mark">S</span><span>Shadow Sky</span></button><p>把群聊里的灵感，沉淀成长期知识。</p></div><div><b>探索</b><button onClick={() => navigate("articles")}>全部文章</button><button onClick={() => navigate("profile")}>社区成员</button><button onClick={() => navigate("studio")}>创作中心</button></div><div><b>管理</b><button onClick={() => navigate("admin")}>管理后台</button><button onClick={() => notify("权限模型说明已写入 Phase 1 架构文档")}>权限说明</button><button onClick={() => notify("安全设计已写入 Phase 1 架构文档")}>安全</button></div><div><b>环境</b><span>preview.shadowskypan.asia</span><span>blog.shadowskypan.asia</span></div></footer>
      {toast && <div className="toast">✓ {toast}</div>}
    </div>
  );
}
