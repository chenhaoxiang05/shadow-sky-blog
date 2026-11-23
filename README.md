# SHADOWSKY // 暗影苍穹 · 群聊共同志

ShadowSky 群聊共同博客的全新纯静态重构版本。零构建依赖、零外部框架、全交互式单页档案站，可直接部署至 GitHub Pages。

- **在线地址（部署后）**：`https://chenhaoxiang05.github.io/shadow-sky-blog/`
- **仓库地址**：`https://github.com/chenhaoxiang05/shadow-sky-blog`

---

## 本地预览

在项目根目录运行任意静态服务器即可预览：

```bash
python3 -m http.server 8765
```

然后在浏览器访问 `http://localhost:8765`。

---

## 自定义群成员与占位内容

目前站内使用预设的占位成员与示范文章，后续替换真实内容时，直接编辑 `index.html` 中 `<script>` 顶部的以下三个常量即可：

1. **`CREW`**：修改 6 位（或任意数量）群友的 `id`、`name`、`role`（头衔）、`freq`（频段标签）、`color`/`accent`（主题色）与 `quote`（签名语录）。
2. **`DEFAULT_POSTS`**：增删或替换群友文章，支持 `title`、`author`、`cat`（`TECH` / `ESSAY` / `MEDIA` / `CHAOS`）、`date`、`readTime`、`featured`、`tags`、`coverTheme`（`vortex` / `eclipse` / `prism` / `wolf` / `grid` / `wave`）、`excerpt`、`pullQuote` 以及 Markdown 风格的 `body`（支持 `##` 标题、`>` 引用、`*` 列表和 ` ``` ` 代码块）。
3. **`DEFAULT_SIGNALS` & `MARQUEE_PHRASES_1 / 2`**：替换「夜间信号壁」的初始群聊短讯与跑马灯语录。

> 提示：页面内置的「+ 投稿 / WRITE」、点赞共鸣、评论区及夜间信号发射功能默认保存在访问者的浏览器 `localStorage` 中；如需让所有访客看到新文章，直接把文章写进 `DEFAULT_POSTS` 并推送到 `main` 分支即可。

---

## GitHub Pages 部署说明

仓库已包含 `.nojekyll` 与 `.github/workflows/deploy-pages.yml` 自动部署工作流：

1. 确保 GitHub 仓库已设置为 **Public**（GitHub 免费账号的 Pages 功能要求公开仓库）。
2. 将本地 `main` 分支推送到 GitHub：
   - 若远程仓库为空：`git push -u origin main`
   - 若需用新版完全覆盖旧仓库历史：`git push -u origin main --force`
3. 打开 GitHub 仓库的 **Settings → Pages → Build and deployment**：
   - **Source** 选择 **GitHub Actions**（推荐，推送 `main` 后自动触发 `.github/workflows/deploy-pages.yml` 部署）；
   - 或者选择 **Deploy from a branch** → Branch 选 **`main`**、目录选 **`/ (root)`**。
4. 等待约 30 秒部署完成后，即可访问 `https://chenhaoxiang05.github.io/shadow-sky-blog/`。
