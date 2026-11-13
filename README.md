# Forma · 网站页面管理后台

**同一个网站，多个管理员，共享页面和全站主题。** 管理员登录后创建和编辑页面，保存草稿，再将指定版本发布给访客。页面由 **自有设计系统 + React Aria + json-render** 渲染，视觉样式只能通过全站 design tokens 统一调整。

主题采用受控的 **DTCG 2025.10** 数据格式，包含基础、语义和组件类型三个层级。86 个 tokens 统一管理颜色、排版、尺寸、圆角、动效和阴影。组件读取自己的 `--ds-*` 变量；项目不依赖 shadcn，也不输出 shadcn 兼容变量。

应用源码位于 [`studio/`](studio/)。启动方式：

```sh
cd studio
bun install
bun run dev
```

首次打开后台时设置网站名称并创建第一位管理员，之后由管理员添加其他管理员。账号、页面草稿、已发布快照和全站主题保存在服务端 SQLite 中。

- `/admin`：页面、全站主题和管理员管理。
- `/`：主站首页（内部地址为 `home` 的已发布页面）。
- `/<slug>`：其他已发布页面，例如 `/about`、`/products`。
- `/local`：保留原有浏览器本地设计器与旧草稿。

页面地址 `home` 对应根路径 `/`，发布后访客即可访问。草稿不会因路由变更而自动发布；旧 `/p/...` 链接会跳转到新地址。

```sh
bun test
bun run build
bun start
```

详见 [使用与开发说明](studio/README.md)、[主题格式与扩展约定](studio/docs/design-tokens.md)、[后台的数据与发布机制](studio/docs/cms.md) 和 [v2 迁移说明](studio/docs/ui-migration.md)。[Orbit JSON 示例](studio/examples/orbit.forma.json) 已使用 v2 格式；旧 v1 文件会在导入时校验并迁移，导入到后台时始终沿用全站主题。当前代码可本地运行，尚未部署到公网。
