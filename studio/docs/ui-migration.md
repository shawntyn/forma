# 自有设计系统与 v2 迁移

2026-11-13，用户在早期「shadcn + React Aria + json-render」方案基础上明确要求移除 shadcn，也不需要兼容其 tokens。当前架构为 **自有设计系统 + React Aria Components + json-render**；全站主题改为受控 DTCG 2025.10 profile，完整项目与应用主题升级为 `version: 2`。

## 当前边界

| 层 | 职责 | 数据边界 |
| --- | --- | --- |
| 受控 DTCG 主题 | 基础值、语义角色及必要组件类型 tokens | 固定路径与类型；全站共享，禁止页面实例覆盖 |
| 自有设计系统 | 本地 React 组件、语义变体与 `ds-*` 样式 | 消费已解析的 `--ds-*` 变量 |
| React Aria Components | 按钮、链接、输入、模态框、提示等交互原语 | 事件、状态与渲染函数仅在源码中使用 |
| json-render | Catalog 定义契约，Registry 映射属性，Renderer 渲染页面树 | 仅接受受控 catalog 的组件与 props |

项目不再使用 shadcn 配置、组件生成器或运行时样式变量兼容层。旧色彩名称仅保留在一次性导入转换器内；迁移后的 CSS 只输出 `--ds-*`。

`src/components/ui/` 是开发者维护的组件实现边界。源码可以使用 CSS 类、受控状态和 React Aria 事件，但 registry 必须显式映射白名单 props，不能将文档中的任意对象透传给组件。

## React Aria 源码 API

| 用途 | 当前实现 |
| --- | --- |
| 按钮式链接 | `ButtonLink` 基于 React Aria `Link`，保留真实链接语义 |
| 按钮交互 | `onPress` / `isDisabled`；普通 DOM 工具控件仍按自身 API 使用 |
| 对话框 | `isOpen` / `onOpenChange`，组合 `ModalOverlay`、`Modal` 与 `Dialog` |
| 对话框标题、描述与关闭 | `Heading slot="title"`、`Text slot="description"`、`Button slot="close"` |
| 输入 | React Aria `Input`，导出 `TextField` 与 `Label` 供组合 |
| 提示 | `TooltipTrigger` 包住可聚焦控件与 `Tooltip`，通过 `placement` / `offset` 定位 |

卡片、徽章等纯展示组件由项目维护。按钮、输入框、卡片的类型级圆角和尺寸读取组件 tokens；其他样式读取全局语义 tokens。编辑态包裹层负责选择和拖放，预览态保留组件自身交互。两种模式使用相同的文档格式。

## 文档与主题版本

当前项目文件结构为 `{ version: 2, name, spec, theme }`；应用主题为 `{ version: 2, mode, preset, tokens }`。其中 `tokens` 才是纯 DTCG 树，`mode`、`preset` 和应用版本不是 DTCG token 字段。主题面板可单独导出纯 tokens，也可导出已解析的 CSS。

- `themeSchema` 只接受严格的 v2 主题，新主题 API 写入不能继续使用旧格式。
- `parseTheme` 在旧数据边界接受原主题格式，并单向转换为 v2。旧颜色映射到对应语义角色，独立定制色保留为全局语义值；旧圆角转换为基础圆角，再通过语义和组件别名使用。
- `parseDocument` 接受 v1 或 v2 完整项目，成功后始终返回 v2。原 `root` / `elements` spec、组件名称和内容属性继续兼容。
- 浏览器存储键仍为 `forma-studio-document-v1`，以便读取原草稿；内容通过解析升级，不需要用户清空存储。
- SQLite 启动迁移在一个事务中分别转换网站草稿主题和已发布主题，保留二者原有差异，不改变页面发布状态、修订号或更新时间；成功后数据库版本为 2。
- 正式 [Orbit 示例](../examples/orbit.forma.json) 已更新为 v2；原 v1 文件保存在 `tests/fixtures/orbit-v1.forma.json`，用于迁移回归。

迁移用于保留已有数据，不表示当前支持旧样式命名。旧文档迁移后再次导出只产生 v2。新系统加入了字体、间距、尺寸、阴影与动效等语义配置，因此不承诺旧组件外观逐像素一致。

后台页面始终使用网站主题。导入完整项目会验证其中的主题，但不会创建页面私有主题；全站主题需要独立保存、发布。迁移也不会把草稿主题发布到线上。

## 不变的样式约束

组件 JSON 只保存内容、受控结构和语义变体。`style`、`className`、`UNSAFE_style`、`UNSAFE_className`、`slot`、`themeOverride`、`render`、`onPress` 以及 props 内的 `children` 等额外属性仍被严格 schema 拒绝。字符串内容不能伪装成 render prop 或可执行表达式。

这里的 `children` 限制针对组件 **props**。文档 element 外层的 `children: string[]` 继续表示页面树，catalog 的 slots 继续描述开发者定义的容器能力。把样式属性移到 element 外层或主题的未知路径也无法通过校验。

全局主题只有已注册的 86 个 tokens，拒绝错类型、未知字段、缺失引用、跨类型引用、循环和数值注入。别名规则、支持类型和数值范围见 [design-tokens.md](design-tokens.md)。

## 回归检查

```sh
bun test src/lib/tokens.test.ts src/lib/document.test.ts server/app.test.ts
bun test
bun run build
```

主题测试覆盖别名传播、受控字段与值、循环、迁移及导出；文档测试覆盖完整 JSON 导入和样式逃逸；API 测试覆盖数据库迁移、事务回滚以及主题草稿／发布隔离。组件交互测试与浏览器检查负责按钮激活、禁用状态、输入标签、对话框焦点约束与关闭后的焦点恢复，不能仅靠 JSON 校验推断交互正确。

日程、气泡图、地图、外部数据 Adapter 和专业可视化引擎尚未实现。后续扩展可以使用已解析的主题值，但仍须经过 catalog、业务数据 schema 和显式 registry 映射，不能增加任意页面样式入口。
