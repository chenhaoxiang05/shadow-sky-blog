"use client";

import { useMemo, useState } from "react";

type View = "home" | "articles" | "article" | "profile" | "studio" | "admin" | "login";

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
  const [dark, setDark] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("全部");
  const [toast, setToast] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);

  const filtered = useMemo(() => articles.filter((article) =>
    (filter === "全部" || article.category === filter) &&
    `${article.title}${article.excerpt}${article.tags.join("")}`.toLowerCase().includes(query.toLowerCase())
  ), [query, filter]);

  function navigate(next: View) {
    setView(next); setMobileOpen(false); window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function notify(message: string) {
    setToast(message); window.setTimeout(() => setToast(""), 2200);
  }

  return (
    <div className={dark ? "site dark" : "site light"}>
      <header className="topbar">
        <button className="brand" onClick={() => navigate("home")} aria-label="返回首页"><span className="brand-mark">S</span><span>Shadow Sky</span><i>LAB</i></button>
        <nav className={mobileOpen ? "nav open" : "nav"}>
          <button className={view === "home" ? "active" : ""} onClick={() => navigate("home")}>首页</button>
          <button className={view === "articles" || view === "article" ? "active" : ""} onClick={() => navigate("articles")}>文章</button>
          <button onClick={() => navigate("profile")}>成员</button>
          <button onClick={() => navigate("studio")}>创作中心</button>
        </nav>
        <div className="top-actions">
          <button className="icon-btn" onClick={() => setDark(!dark)} aria-label="切换主题">{dark ? "☼" : "◐"}</button>
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
          <div className="article-hero"><span className="pill">AI Engineering</span><h1>把一个 AI Agent<br />从 Demo 带到生产环境</h1><p>从评估、可观测性到权限边界，我们整理了这次落地中最重要的工程判断。</p><div className="article-byline"><Avatar initials="LC" /><div><b>Lin Chen</b><span>2026 年 7 月 9 日 · 8 分钟阅读</span></div><button onClick={() => notify("已收藏到「我的收藏」")}>♡ 收藏</button></div></div>
          <div className="reading-cover"><div className="code-window large"><span /><span /><span /><pre>production_ready = evaluation + observability + boundaries</pre></div></div>
          <div className="reading-layout"><aside><b>本文目录</b><a href="#context">01 背景</a><a href="#evaluation">02 持续评估</a><a href="#boundary">03 权限边界</a><a href="#summary">04 总结</a></aside><div className="prose"><p className="lead">真正困难的部分从来不是让 Agent 跑起来，而是让它在不确定的输入、变化的依赖和真实权限边界中保持可靠。</p><h2 id="context">从 Demo 到系统</h2><p>Demo 验证的是能力上限；生产系统需要定义可接受的失败方式。我们把每个工具调用都视为一个需要审计的动作，把模型输出当作非可信输入。</p><blockquote>可靠性不是一个开关，而是一组可以被观察、被验证、被回滚的约束。</blockquote><h2 id="evaluation">建立持续评估</h2><p>离线样本只能建立初始信心。上线后还需要匿名化的真实流量回放、关键路径指标和人工复核队列。</p><div className="inline-code">evaluate → observe → review → improve</div><h2 id="boundary">把权限放在服务端</h2><p>前端隐藏按钮不等于权限控制。每一次读取、发布、审核和管理操作都必须经过服务端策略判断，并留下结构化审计记录。</p><h2 id="summary">结语</h2><p>一个成熟的 Agent 系统，最终看起来更像一套严谨的软件工程系统，而不是一段漂亮的 Prompt。</p></div></div>
        </article>}

        {view === "profile" && <section className="page section page-enter"><div className="profile-hero"><Avatar initials="SP" /><div><span className="role-pill">OWNER</span><h1>Sky Pan</h1><p>关注云原生、Next.js 与高质量技术社区。正在把群聊里的灵感变成长期知识。</p><div className="profile-stats"><span><b>18</b>文章</span><span><b>1.2k</b>获赞</span><span><b>246</b>收藏</span></div></div><button className="btn-secondary" onClick={() => notify("个人资料编辑将在 Phase 2 接入")}>编辑资料</button></div><div className="profile-tabs"><button className="selected">文章</button><button onClick={() => notify("已切换到收藏预览")}>收藏</button><button>关于</button></div><div className="cards-grid">{articles.slice(0, 3).map((article) => <ArticleCard key={article.title} article={article} onOpen={() => navigate("article")} />)}</div></section>}

        {view === "studio" && <section className="page section page-enter"><div className="studio-head"><div><span className="kicker">CREATOR STUDIO</span><h1>我的文章</h1><p>管理草稿、提交审核并追踪发布状态。</p></div><button className="btn-primary" onClick={() => notify("文章编辑器将在 Phase 2 接入")}>＋ 新建文章</button></div><div className="stat-grid"><div><span>草稿</span><b>3</b><small>其中 1 篇本周更新</small></div><div><span>待审核</span><b>2</b><small>平均 1.4 天完成</small></div><div><span>已发布</span><b>18</b><small>累计 8,492 次阅读</small></div><div><span>本月获赞</span><b>126</b><small className="positive">↑ 18.6%</small></div></div><div className="table-card"><div className="table-row table-head"><span>文章</span><span>状态</span><span>可见性</span><span>更新时间</span><span /></div>{[["Azure 上的容器化 Next.js 实践","草稿","Private","今天"],["用 Next.js 构建可迁移的内容平台","已发布","Public","7 月 5 日"],["群聊知识库的内容治理","待审核","Members Only","7 月 3 日"],["一次失败的缓存优化复盘","已隐藏","Members Only","6 月 28 日"]].map((row) => <div className="table-row" key={row[0]}><span><b>{row[0]}</b><small>技术文章</small></span><span><i className={`status status-${row[1]}`}>{row[1]}</i></span><span>{row[2]}</span><span>{row[3]}</span><button onClick={() => notify("操作菜单预览")}>•••</button></div>)}</div></section>}

        {view === "admin" && <section className="page section page-enter"><div className="studio-head"><div><span className="kicker">ADMIN CONSOLE</span><h1>内容审核</h1><p>服务端权限策略：Editor 及以上角色可访问。</p></div><span className="secure-badge">● Server protected</span></div><div className="review-grid"><div className="review-card"><div><span className="pill">待审核</span><h3>群聊知识库的内容治理</h3><p>提交者：Mika · 2 小时前</p></div><div><button className="btn-secondary" onClick={() => notify("已退回并请求修改")}>请求修改</button><button className="btn-primary" onClick={() => notify("审核动作将在 Phase 2 写入审计日志")}>批准发布</button></div></div><div className="permission-panel"><h3>当前权限视图</h3>{[["文章审核","Editor +"],["评论管理","Admin +"],["用户管理","Admin +"],["网站设置","Owner"]].map((r) => <div key={r[0]}><span>{r[0]}</span><b>{r[1]}</b></div>)}</div></div></section>}

        {view === "login" && <section className="auth-page page-enter"><div className="auth-card"><span className="brand-mark large">S</span><span className="kicker">MEMBER ACCESS</span><h1>欢迎回来</h1><p>仅受邀请的社区成员可以登录。</p><label>邮箱<input type="email" placeholder="you@example.com" /></label><label>密码<input type="password" placeholder="至少 12 位" /></label><div className="auth-options"><label className="check"><input type="checkbox" /> 保持登录</label><button>忘记密码？</button></div><button className="btn-primary auth-submit" onClick={() => notify("Phase 1 仅演示界面；真实认证将在 Phase 2 接入")}>登录</button><div className="auth-divider"><span>邀请注册</span></div><button className="btn-secondary auth-submit" onClick={() => notify("请输入管理员发送的一次性邀请链接")}>使用邀请链接</button><small>登录即表示你同意社区内容规范与隐私政策。</small></div></section>}
      </main>

      <footer><div><button className="brand" onClick={() => navigate("home")}><span className="brand-mark">S</span><span>Shadow Sky</span></button><p>把群聊里的灵感，沉淀成长期知识。</p></div><div><b>探索</b><button onClick={() => navigate("articles")}>全部文章</button><button onClick={() => navigate("profile")}>社区成员</button><button onClick={() => navigate("studio")}>创作中心</button></div><div><b>管理</b><button onClick={() => navigate("admin")}>管理后台</button><button onClick={() => notify("权限模型说明已写入 Phase 1 架构文档")}>权限说明</button><button onClick={() => notify("安全设计已写入 Phase 1 架构文档")}>安全</button></div><div><b>环境</b><span>preview.shadowskypan.asia</span><span>blog.shadowskypan.asia</span></div></footer>
      {toast && <div className="toast">✓ {toast}</div>}
    </div>
  );
}
