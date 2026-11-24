# AGENTS.md — 衣姿 PoseWear 开发与交接手册

给接手本项目的开发者 / AI 看的运行手册。用户向说明在 README.md（三语），这里只讲怎么开发、构建、测试、部署和避坑。

`hantanyany/posewear` 的部署按 README 的「原图库 Pages 版」执行。生产项目为 `posewear-iyoo` 和 `posewear-iyoo-media`，在本地使用已获公开部署授权的归档。以下的原站账号、R2 桶和分发方式适用于上游。

## 项目速览

- 纯静态站：Python 构建 + 原生 JS（无框架、无打包器），部署在 Cloudflare Pages。
- 线上：https://posewear.pages.dev ；图片分发：https://pwimg.0vo.pro （R2 桶 `posewear-assets`）。
- 内容：12 个素材库（姿势/深度姿势/服装/动画服装/人像/表情/发型/历代/场景/光影/道具/家具）+ 浏览器内 AI 试穿/生图（用户自备 API Key，直连或经本站代理转发）+ 生成记录页。
- 仓库不含素材图片：素材在 `assets-raw/`（gitignore），用 `scripts/fetch-assets.py` 从上游公开站抓取；构建产物 `dist/`、`dist-assets/` 同样不入库。

## 目录与职责

| 路径 | 职责 |
|---|---|
| `build.py` | 构建主入口：读 `assets-raw` 数据 → 生成每库 JSON、图片变体、SEO 页；内部依次 exec `post.py`、`seo.py` |
| `post.py` | 后处理：资源指纹（`/assets/<name>.<hash>.js|json`）、`_headers`（含 CSP）、index.html 组装 |
| `seo.py` | 每库/每条目的静态 SEO 落地页 |
| `src/index.html` | 单页骨架（所有栏目、试穿台、托盘、弹窗的 DOM 都在这里） |
| `src/app.js` | 图库 SPA：栏目切换、筛选、卡片、灯箱、收藏、组合与**悬浮生图工作台**（托盘） |
| `src/studio.js` | 试穿/生图核心：服务商协议（OpenAI/Gemini/Seedream/xAI/自定义中转）、生成管线、素材选择器（picker）、配置弹窗；对外接口是 `window.WB` |
| `src/history.js` | 生成记录页（数据在浏览器 IndexedDB `lk-studio` 的 `h` 表，上限 200 条） |
| `src/extras.js` | `window.X` 工具（下载、ZIP 等）；`src/zip.js` 打包 |
| `functions/api/proxy.js` | Pages Function：CORS 转发代理（只许本站来源、官方域名限标准 https、自定义中转放行任意端口、内网地址黑名单） |
| `scripts/fetch-assets.py` | 从上游站抓素材到 `assets-raw/`（低并发，勿反复全量抓） |
| `scripts/prep-modules.py` | 新模块（表情/发型等）素材预处理 |
| `scripts/sync-r2.py` | 把图片目录同步到 R2（断点续传，见下） |
| `tests/` | Playwright 回归（见「测试」） |

## 构建与部署（标准流程，勿改顺序）

```bash
python3 scripts/fetch-assets.py            # 首次或素材更新时
POSEWEAR_ASSET_HOST=https://pwimg.0vo.pro python3 build.py   # 约 7–16 分钟，产物 dist/（约 15,498 文件）
cp -r dist /tmp/staging                     # 关键：从副本测试与部署，别直接动 dist
python3 tests/check_csp.py /tmp/staging     # CSP 守卫，必须 PASS
# 起本地服务跑回归（见下），全绿后：
npx wrangler pages deploy /tmp/staging --project-name posewear --branch main
```

- **`--branch main` 不可省**：wrangler 按本地 git 分支决定部署目标，漏了会静默发到分支预览、生产不变。部署后必须线上验活（见清单），不能只看 deploy 成功。
- Pages 单站上限 20,000 文件；`POSEWEAR_ASSET_HOST` 让缩略图/原图走 R2，主站文件数才压得住。
- wrangler 用 OAuth 登录态（约 1 小时过期）：过期时 whoami 报未登录是假象，用 refresh_token 向 `https://dash.cloudflare.com/oauth2/token` 刷新（client_id `54d11594-84e4-41aa-b438-e81b8fa78ee7`，**必须带浏览器 UA**，否则 403/1010），或给 wrangler 传 `CLOUDFLARE_API_TOKEN` 环境变量。
- 图片变体分工：缩略图 `t/` 与原图 `o/` 在 R2（代码里经 `AH` 前缀访问）；中图 `m/`、`i/` 是主站同源文件。**拿 pwimg 测 m/i 会假 404**，别误判。
- 新增图片到 R2：`python3 scripts/sync-r2.py <图片目录>`（并发 ≤8，防 429；只传增量）。

### 部署后线上验活清单

1. 首页 200，公告/统计数字与本次改动一致；
2. 线上 `/assets/*.js` 哈希与 staging 一致，关键新代码字符串能 grep 到；
3. 响应头 CSP 的 img-src 覆盖全部图片源站（含热链站）；
4. 任选一库 JSON 条数正确；样本图各一张：pwimg 的 t/o 各 200、同源 m 200、热链图 200；
5. `curl -X OPTIONS https://posewear.pages.dev/api/proxy` 返回 204；
6. 本次改动的功能点在生产页面实际点一遍（或用线上地址跑对应测试套件）。

## 数据与素材

- 上游五站同作者 @giaaibusi（人像 @agi_aibusi，CC0）；深度姿势数据在 `depth/packs/`（已入库）；新模块素材档案在维护者本地 `posewear-assets-archive/`（不在仓库）。
- 发型与部分动画服装来自 CharaDB：**图片只能热链**（`charadb-2fi.pages.dev`），禁止再分发、不要下载进 R2/dist。
- 新增热链数据源时必须同步 CSP：`build.py` 会从 CharaDB 数据自动收集源站写入 img-src/connect-src，新数据源要照此处理，并跑 `tests/check_csp.py` 守卫（2026-11-23 发型库全灭就是漏了这一步）。
- 条目数据字段：`t/m/i/o` 是四档图片路径，`ext=1` 表示热链外站图，`ref` 为 referrerpolicy。

## 测试

```bash
npm i            # 装 playwright + wrangler（devDependencies）
python3 -m http.server 8902 -d <staging目录> &
CHROME_PATH=<playwright chromium 路径> NODE_PATH=$PWD/node_modules U=http://localhost:8902 \
  node tests/v13.js   # 其余套件同理
```

| 套件 | 覆盖 |
|---|---|
| v12 | 图库基础：栏目、筛选、灯箱、收藏、组合 |
| v13 | 试穿台全流程（四家服务商 mock、报错分类、安全审核、重试、多图、ZIP、记录增删） |
| v14-xai | xAI 协议 |
| v15-modules | 新模块各库条数/渲染/筛选 + 表情槽位 |
| v16-proxy | 代理函数单元测试（node 直跑 `.mjs`，不起浏览器） |
| v17-history | 生成记录页冒烟 |
| v18-quick | 悬浮工作台：常驻入口、面板内加素材、托盘内生图全流程 |

- 测试用 route 拦截把服务商 API 全部 mock 掉（fixtures 是本地假图），不消耗真实额度；**不要**改成真调。
- 已知环境坑：受限沙箱里 Chromium 经代理加载外站图片会 `ERR_TUNNEL_CONNECTION_FAILED`，v15 有 9 项这类基线失败（卡片渲染/页面错误断言），与改动无关；判断回归要和改版前基线逐项对比，新增失败才算回归。
- 改 studio 生成管线必须保 v13 全绿；改托盘/工作台保 v18 全绿。

## 关键机制速记

- **悬浮生图工作台**（app.js 托盘 + studio.js）：右下角常驻按钮 `#trayFab` 打开面板；面板内「添加素材」经 `WB.openPicker(type, sink)` 复用 studio 的选择器往组合里加；组合经 `WB.setSel` 同步进试穿台槽位（服装/动画/历代→服装≤2，姿势/深度→姿势≤6，人像→人物≤1，表情≤1，其余类型只进提示词补充段）；生成走 `WB.quick(opts)` = studio `run()` 的 quick 模式（跳过试穿台 UI、结果回托盘并存入生成记录）。试穿台本体是「完整工作台」，两者共用一套生成核心，不要另起炉灶。
- 服务商配置存 localStorage `wbCfg`；Key 只在浏览器，永不入库、永不上传本站。
- 公告条关闭键带版本号（当前 `annV2`）：换公告内容时记得 bump 键名，否则关过旧公告的用户看不到新公告。
- localStorage 键：`wbCfg`、`wbSel`（试穿台选材）、`sel`（组合）、`fav`、`theme`、`lang` 等，改名即丢用户数据，慎改。

## 约定

- UI 文案简体中文；品牌红 `#ff2442` 点缀、白底干净、**不用黄色/金色**；页面忌文字堆砌。
- 提交：显式列文件路径提交，**不要 `git add -A`**（工作区常有 dist-assets 等大目录未跟踪）。
- 发版：三语 README 更新日志各加一条（中/英/日），GitHub Release 用 API 建，tag 形如 `v1.2.1`。
- 生产红线：部署、合并 PR、回议题已获维护者长期授权（2026-11-22）；新功能/动架构/花钱的事先问维护者。
- Web Analytics：代码已支持（`POSEWEAR_WA_TOKEN` 构建注入 + CSP 放行），差 Cloudflare 后台 Pages → posewear → Metrics 开启或给站点令牌，开后验 beacon 上线。
