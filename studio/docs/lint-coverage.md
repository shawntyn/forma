# Tailwind 与 lint 的执行边界

2026-11-17 使用项目实际安装的 **Biome 2.6.8** 完成 CLI 正反例验证。
版本固定在 `package.json` 和 `bun.lock`。从 `studio/` 运行：

```sh
bun scripts/verify-biome.ts
bun run lint
```

覆盖探针在临时目录生成独立的 TSX、清空默认值的 `@theme` 和已声明的 `.ds-button`，
读取项目启用的 Tailwind 规则，然后断言每个案例的实际诊断类别。它会明确验证已知缺口，
不会把“Biome 未报错”当作项目规范已通过。项目设计系统检查器负责拒绝这些缺口。

| 输入 | Biome 2.6.8 实测 | 项目处理 |
| --- | --- | --- |
| `bg-action p-md flex ds-button` | 通过 | 允许已注册 Token、结构 utility、真实 CSS recipe |
| `bg-blue-500`、`text-white` | `noTailwindRawColors` | 禁止默认色板，关闭 `allowBlackAndWhite` |
| `p-[17px]`、`[color:red]` | `noTailwindArbitraryValue` | 禁止任意值和任意属性 |
| 动态模板类名 | `useTailwindStaticClassStrings` | 使用完整静态类名或有限映射 |
| `cn()` 中的非法色板、任意值 | 同样诊断 | `cn`、`clsx`、`twMerge` 在配置中注册 |
| `opacity-50` | 配置后的 `noTailwindRestrictedClasses` | 状态透明度由组件 Token 管理 |
| `[&_p]:flex` | 配置后的 `noTailwindRestrictedClasses` | 仅开放注册的状态与响应式变体 |
| `bg-fake`、`typo-class` | 未诊断 | 专项检查器核对实际 Tailwind 生成能力和 CSS selector |
| 清空主题后的 `p-4` | 未诊断 | 专项检查器拒绝失效的默认 utility |
| `bg-(--unknown)` | 未诊断 | 专项检查器拒绝变量简写绕过 |
| `bg-action/50`、`bg-action/[.5]` | 未诊断 | 专项检查器拒绝未经批准的颜色透明度 modifier |

`noUndeclaredClasses` 另行实测：它识别 `.ds-button`，却把合法的 `bg-action`、`p-md` 和
`flex` 都报告为未声明。它核对 CSS selector，并不等同于 Tailwind 编译后的合法类集合，
因此项目没有启用此规则。`bg-action/*` 也不是 `noTailwindRestrictedClasses` 支持的
通配形式，不能用它假装封住所有透明度 modifier。

## 通用规则与有意保留的边界

Biome 使用推荐规则、两空格缩进、单引号、分号，并检查 TypeScript 类型导入。
以下建议规则经过项目审查后关闭：

- `noDescendingSpecificity`：组件 recipe、状态和响应式覆盖采用有意设计的层叠关系；
  单纯按 specificity 重新排序可能改变表现。设计值与变量边界仍由专项检查器约束。
- `noImportantStyles`：编辑器与 CMS 的已有隔离覆盖含有明确的优先级设置；本次保留现有视觉行为。
- `noNonNullAssertion`：现有 schema 校验、数据库结果和测试 fixture 后有已知非空边界。
  保留 TypeScript `strict`、未使用变量检查和运行时校验，不为满足这一风格建议重写模型。

少量规则采用带原因的局部抑制，而不是全局关闭：编辑器容器的拖放/选择事件委托、
具有重试或重新绑定语义的 effect 依赖，以及仅在模块初始化时执行的组件注册工厂。
页面 JSON 的 `style`、`className`、可执行 props 禁令不受这些源码例外影响。

`src/style-tokens.css` 是生成文件，由 Token 生成校验负责检查；它不参与手工格式化。
`dist/`、数据文件、导入 fixture 和示例数据同样不由代码格式检查器改写。

## 专项检查器的范围

`scripts/design-checker.ts` 是静态源码策略检查器，不是全程序数据流分析器。
它覆盖本地常量、具名静态映射、条件表达式、`cn`/`clsx`、React Aria 的 className 回调，
以及可以静态解析的 JSX 对象展开，并保留组件参数的合法 props 转发。跨模块的未知
class 工厂应改为显式静态映射，不能依赖运行时生成类名。

`lib/utils.ts` 和 `lib/runtime-styles.ts` 是有独立测试的实现边界，按文件明确豁免；
故意包含非法输入的测试 fixture 不参与应用源码扫描。SVG 坐标、图标 size 等结构
props 不在 CSS/class 检查范围内。CSS 检查禁止通过 `@apply` 绕过策略，也禁止在非生成
文件中新增 `@theme`；生成 Token CSS 必须与注册表输出精确一致。

## 官方依据

- [Biome Tailwind 配置](https://biomejs.dev/reference/configuration/#tailwindstylesheet)
- [任意值规则](https://biomejs.dev/linter/rules/no-tailwind-arbitrary-value/javascript/)
- [受限类规则](https://biomejs.dev/linter/rules/no-tailwind-restricted-classes/javascript/)
- [未声明类规则](https://biomejs.dev/linter/rules/no-undeclared-classes/javascript/)

升级 Biome 时应重跑覆盖探针，再根据实际变化调整职责；不能只根据规则名称推断覆盖范围。
