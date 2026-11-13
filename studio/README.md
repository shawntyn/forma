# Forma Studio

基于 **React、自有设计系统、React Aria Components 和 json-render** 的网站页面管理后台。多个管理员登录同一个网站，共享页面库，各自编辑和发布页面；全站使用同一份受控 DTCG 主题调整视觉，不允许页面或组件实例覆盖样式。

主题包含 86 个 tokens：30 个基础值、50 个语义角色、6 个全站组件类型配置。真实的别名引用将三层连接起来，统一控制颜色、排版、间距、圆角、控件尺寸、动效和阴影。项目不依赖 shadcn，不保留其配置或运行时变量兼容层。

后台包含多页面管理、账号登录、服务端草稿、发布快照与全站主题。页面编辑器保留画布、图层和属性面板；结构采用预设容器布局，不提供自由坐标布局或任意组件 CSS。

## 启动

在仓库根目录执行：

```sh
cd studio
bun install
bun run dev
```

打开终端打印的本地地址，通常是 `http://127.0.0.1:5173/admin`。开发模式运行 Vite 前端和 Bun API；SQLite 数据文件自动创建，不需要外部数据库或 API key。依赖版本锁定在 `package.json` 与 `bun.lock`。

```sh
bun test          # 模型、组件交互与后台 API 测试
bun run build     # TypeScript 检查，然后生成 dist/
bun start         # Bun API + dist/，默认 3001 端口
```

## 使用方式

### 网站后台

1. 首次打开 `/admin`，设置网站名称并创建第一位管理员。初始化只允许执行一次；后续使用邮箱和密码登录。
2. 在「页面」中新建空白页、使用 Orbit 示例，或导入已有的完整项目 JSON。
3. 点击页面进入编辑器，修改内容和结构后保存草稿。保存与发布是两个步骤：访客持续看到上次发布的快照。
4. 发布页面后，首页通过 `/` 访问，其他页面通过 `/<slug>` 访问（例如 `/about`）。页面可以下线，也可以归档后恢复；恢复不会自动重新发布。
5. 在「全站主题」编辑全局 tokens，保存主题草稿，再发布主题以统一更新所有线上页面。
6. 在「管理员」添加其他管理员。所有管理员拥有相同的页面、主题和账号创建权限；没有按客户隔离的独立网站。

页面地址 `home` 对应主站首页 `/`，其他地址例如 `about` 对应 `/about`。`admin`、`api`、`local`、`assets`、`p` 为系统保留地址。路由调整不会自动发布已有草稿；旧 `/p/...` 链接会跳转到正式地址。

同一页或同一套主题被其他管理员更新时，旧版本保存会返回冲突，避免静默覆盖。当前采用版本检查，不提供实时共同编辑或自动合并。数据结构、发布流程和运行配置见 [docs/cms.md](docs/cms.md)。

### 页面编辑器

- **组件与画布**：拖入组件，或点击组件添加到选中的容器。选中叶子组件时，点击添加会插入它的后方；没有选择时添加到页面根节点。
- **图层与排列**：在画布或图层列表拖动排序。拖到容器中部可嵌套；拖到节点上、下边缘可前后插入。也可在属性面板上移、下移、复制或删除。
- **内容编辑**：点击组件后修改文字、链接、语义变体和布局类型。文本字段是本地草稿，失去焦点时提交；单行 Enter、多行 ⌘/Ctrl + Enter 提交，Esc 放弃当前字段草稿。
- **统一主题**：在后台「全站主题」切换五种预设与亮暗模式，通过「基础／语义／组件」编辑器搜索、调整 typed tokens 或选择引用来源。颜色支持透明度，尺寸与时长有单位及范围限制，字体使用受控列表。预设与模式切换替换配色，保留非颜色自定义。页面编辑器沿用共享主题，不保存单页主题。
- **响应式预览**：桌面、平板和手机分别采用 1100、768、390 px 画布宽度；支持适应窗口与缩放。布局通过固定的响应式规则适配，不保存每个断点独立的组件样式。
- **历史与保存**：支持最多 80 步内存撤销历史。后台页面保存到服务器，撤销历史只在本次编辑期间保留。`/local` 保留旧版独立设计器，其草稿仍自动保存到当前浏览器的 `localStorage`；导出项目 JSON 可备份或导入后台。

预置示例为 Orbit 产品展示页。可通过帮助面板的「重新开始」重新载入，或导入 [examples/orbit.forma.json](examples/orbit.forma.json)。重新载入示例也是可撤销的操作。

### 快捷键

| 操作 | macOS | Windows / Linux |
| --- | --- | --- |
| 撤销 | ⌘ Z | Ctrl Z |
| 重做 | ⇧ ⌘ Z | Shift Ctrl Z |
| 复制选中组件 | ⌘ D | Ctrl D |
| 删除选中组件 | Delete / Backspace | Delete / Backspace |
| 保存后台草稿（`/local` 为导出） | ⌘ S | Ctrl S |
| 退出预览 / 取消选择 | Esc | Esc |

## 导入与导出

页面导出面板与主题面板提供不同用途的文件：

| 格式 | 内容 | 可重新导入编辑器 |
| --- | --- | --- |
| `project.forma.json` | `version: 2`、项目名、json-render spec 和完整主题 | 是；旧 v1 文件导入后升级为 v2 |
| `page.spec.json` | `root` 与 `elements`，对应本项目受控组件 catalog | 否，需使用配套 catalog 与 registry 渲染 |
| `theme.css` / `site-theme.css` | 已解析的 `--ds-*` CSS 变量；亮色为 `:root`，暗色为 `.dark` | 否，可用于配套页面的主题作用域 |
| `site-theme.tokens.json` | 纯 DTCG token 树，保留类型、引用和说明 | 可通过主题面板导入完整受控主题；后台仍需保存、发布 |

编辑器导入入口接受 1 MB 以内的完整项目 JSON。导入会校验组件类型、属性白名单、主题版本、token 路径、类型、数值范围和引用，以及树结构的完整性。最多 500 个组件，嵌套深度不超过 32 层；拒绝循环引用、重复挂载、未连接节点与不安全的按钮链接。后台导入沿用当前网站的全局主题，不采用文件中的独立主题。

Spec 不是独立网页，也不包含组件实现。将它接入另一项目时，需要一并提供本项目的 catalog、registry、React 组件实现、设计系统样式与主题变量。当前不提供 HTML 或 React 页面源码的一键导出。

## 为什么只开放全局 tokens

组件可以编辑内容、容器结构与预设语义变体，但不能传入 `style`、`className`、`UNSAFE_style`、`UNSAFE_className`、render props、单独的颜色、任意 CSS 或圆角覆盖。此限制同时存在于编辑界面和严格的 Zod 数据校验中，导入 JSON 也不能绕过。

视觉参数仅存在于全站主题中。按钮、卡片、输入框等从 `semantic.*` 或 `component.*` tokens 读取样式；例如按钮圆角通过 `component.button.radius → semantic.radius.control → primitive.dimension.radiusSmall` 解析。组件层表示整个网站的该类组件，不是某个页面实例。排版、间距、阴影和动效可以全局调整；页面布局仍使用事先定义的结构规则。

DTCG 导入采用项目受控 profile，不接受任意 token、任意 CSS 字符串、外部字体 URL、未知扩展或可执行表达式。详细范围、别名规则与 API 见 [docs/design-tokens.md](docs/design-tokens.md)。

编辑器自身的工具栏、侧栏与选中框属于固定工作台外观，不随被设计页面的主题一起修改。画布中的主题通过局部 CSS 变量作用域隔离。

## 源码边界

| 文件 | 职责 |
| --- | --- |
| `src/App.tsx` | 三栏工作台、选择状态、拖放交互、属性草稿、导入导出与预览 |
| `src/lib/catalog.ts` | 11 种组件的严格 Zod 属性、编辑器元数据，以及真正的 `@json-render/core` catalog |
| `src/lib/document.ts` | 文档格式、初始示例、不可变树操作、导入验证与结构限制 |
| `src/lib/tokens.ts` | DTCG 路径／类型白名单、分层引用、主题解析、旧主题迁移及导出 |
| `src/lib/use-document.ts` | 撤销/重做、本地自动保存与恢复 |
| `src/lib/cms.ts` | 后台 API 类型、请求与页面状态 |
| `src/lib/routes.ts` | 主站与后台路由、首页映射、旧链接规范化及保留地址 |
| `src/components/cms/` | 页面管理、全站主题和管理员界面 |
| `server/` | Bun API、SQLite、登录会话和发布快照 |
| `src/components/editor/CanvasRenderer.tsx` | `defineRegistry` 注册与 `@json-render/react` 的 `Renderer` 实际渲染；编辑态包裹层负责选择和拖放 |
| `src/components/editor/ThemePanel.tsx` | 全局主题编辑面板 |
| `src/components/ui/` | 项目自己的基础组件；React Aria Components 提供交互原语 |
| `src/design-system.css` | `ds-*` 组件类和语义／组件 tokens 的消费规则 |
| `src/index.css` | 固定工作台外观、设计系统默认主题与画布布局规则 |
| `src/lib/document.test.ts` | 文档操作、树完整性和样式约束的 Bun 测试 |
| `src/lib/tokens.test.ts` | 主题类型、别名传播、拒绝非法值、迁移与导出的回归 |

技术栈为 React 19、Vite、TypeScript、Tailwind CSS 4、React Aria Components、Zod 和 Bun。组件渲染使用已安装的 `@json-render/core` / `@json-render/react`。Catalog 定义组件契约；Registry 显式映射属性；Renderer 渲染组件树。基础组件由项目维护，不在运行时加载在线组件库。React Aria 的事件与渲染能力只在源码层使用，不向导入的 JSON 开放。

当前完整项目和应用主题均为 `version: 2`。旧 v1 项目、浏览器草稿和 SQLite 主题有明确的单向迁移路径；不会清空已有页面、账号或发布状态。决策、兼容边界与回归覆盖见 [docs/ui-migration.md](docs/ui-migration.md)。

参考：[json-render 文档](https://json-render.dev/docs) · [React Aria](https://react-aria.adobe.com/) · [DTCG 2025.10](https://www.designtokens.org/tr/2025.10/format/)

### 安全扩展组件

1. 在 `catalog.ts` 添加 `.strict()` 的属性 schema、组件元数据与 catalog 条目。仅开放业务内容、结构参数或明确的语义变体，继续禁止任意 CSS 属性。
2. 在 `CanvasRenderer.tsx` 的 registry 中实现组件，复用本地基础组件、React Aria 与全局语义 tokens，显式映射白名单 props。不要向组件透传未验证的属性、事件或 render props。若是容器，同步声明 catalog slot、元数据 `container` 与渲染器容器集合。
3. 让组件默认值通过 schema 校验；补充必要的模型测试。新增格式若影响已保存项目，应提供文档版本迁移，而不是绕过导入校验。
4. 执行 `bun test` 和 `bun run build`，再检查画布拖放、内容编辑、三种预览宽度及亮暗主题。

## 部署与当前范围

执行 `bun run build` 后使用 `bun start`，由 Bun 同时提供 API 与 `dist/` 静态资源。后台必须运行服务端并使用持久化 SQLite 目录；仅上传 `dist/` 到静态托管服务不能运行账号、保存或发布功能。部署参数和备份方式见 [docs/cms.md](docs/cms.md)。

2026-11-13 此前尝试通过 Sites 注册托管项目时，客户端返回 `Sites Git is not yet enabled for this client`。未创建 Site ID，未生成线上部署地址；本地开发和构建不依赖该服务。

当前提供单站点、多管理员、服务端持久化与页面发布，不含多租户、细分角色、实时协同、邮件邀请、找回密码或表单提交服务。预览可测试输入框和链接交互，导航栏链接仍使用示例锚点。日程、图表、地图、动态数据源与业务 Adapter 层尚未接入；已解析的全局 tokens 可以作为后续专业组件的主题输入。页面发布指切换当前服务器可访问的公开快照，不会自动购买域名或部署公网基础设施。
