# dsh-plugin-abap-diff

**DeepSeek Harness (DSH)** 插件：为 `abap-adt` MCP Server 提供**类 Git 的只读 ABAP 代码变更追踪**与 **Web UI 内嵌分栏 Diff 对比面板**。

在 SAP ABAP 开发中，代码保存在 SAP 服务器数据库而非本地磁盘。AI 通过 ADT MCP 工具修改程序/类/函数后，开发者很难回溯“这一轮对话到底改了哪些对象、动了哪几行”。本插件在 DSH 启动追踪后无侵入监听所有 `abap-adt*` 写操作，在本地维护一份影子 Git 仓库（`~/.dsh/abap-diff/repo`），随时可按**对话轮次（Turn）**或**整次会话**查看精确红绿 Diff。

---

## 核心特性

- **零写回风险（纯只读追踪）**：仅监听 `tools/pre-execute` 与 `tools/post-execute`，绝不修改或阻塞 AI 的 SAP 工具调用，也不包含危险的逆向写回操作。
- **按需懒加载基线 + 改后回读**：在 AI 修改某个 ABAP 对象前按需拉取其 SAP 当前版本作为 Git 基线；修改成功后再次从 SAP 回读完整源码落盘，确保与 SAP 服务器代码 100% 一致。
- **自动隔离人工外部改动**：若同一对象在两次 AI 对话之间被开发者在 SAP GUI / Eclipse ADT 中手工修改过，插件会先自动记录一条 `[external]` 提交，避免把人工改动混入 AI 的 Diff。
- **多 SAP 系统 / Client 严格隔离**：按 `serverName`（如 `abap-adt-130`、`abap-adt-cspc-dev`）分目录存放，多系统同名对象互不覆盖。
- **按轮次 & 按会话双视角对比**：
  - 支持 **左右分栏（Split）** 与 **行内对比（Unified）** 一键切换
  - 内置 ABAP 关键字 / 注释 / 字符串语法高亮与未修改上下文折叠
  - 实时标记对象变更类型（`A` 新增 / `M` 修改 / `D` 删除）、激活状态（`已激活 / 未激活`）与 TR 请求号
- **原生融入 DSH 界面**：
  - 对话顶部快捷状态胶囊（一键启动 / 关闭追踪 + 快速跳转面板）
  - 左侧导航 `ABAP Diff` 全宽工作台
  - 支持斜杠命令 `/abap-diff start | stop | status`

---

## 支持的 ABAP ADT MCP 工具

自动匹配所有 `mcp__abap-adt*__*` 服务（或暴露 `GetSource` / `EditSource` 的 MCP 服务）：

- 源码编辑与写入：`EditSource`、`UpdateSource`、`WriteSource`、`WriteProgram`、`CreateAndActivateProgram`、`WriteClass`、`CreateClassWithTests`、`UpdateClassInclude`、`CreateTestInclude`
- 对象与文本元素：`CreateObject`、`DeleteObject`、`SetTextElements`
- 激活状态追踪：`Activate`、`ActivatePackage`

---

## 安装方式

### 通过 GitHub 直接安装（推荐）

```bash
# 安装到 desktop 配置档（桌面端）
dsh plugin --profile desktop add github:WyankinzZ/dsh-plugin-abap-diff

# 或安装到 web 配置档
dsh plugin --profile web add github:WyankinzZ/dsh-plugin-abap-diff
```

安装后在对应配置档的 `cordis.patch.yml` 中确认启用：

```yaml
- insert:
    - id: dsh-plugin-abap-diff
      name: 'dsh-plugin-abap-diff'
```

### 本地开发与构建

```bash
npm install
npm run typecheck
npm run build
npm test
```

---

## 使用方法

1. 启动 DSH Desktop 或 `dsh web`。
2. 在对话顶部点击 **`ABAP追踪: 关`** 按钮（或输入 `/abap-diff start`）开启追踪。
3. 正常让 AI 借助 `abap-adt` MCP 读取、修改、创建或激活 ABAP 对象。
4. 点击顶部的 **`Diff`** 或左侧导航栏 **`ABAP Diff`** 进入对比工作台，按 **轮次（Turn）** 或 **整次会话** 查看每次修改。
5. 完成后点击 **`关闭追踪`**（或 `/abap-diff stop`），历史追踪会话及本地 Git 仓库（`~/.dsh/abap-diff/repo`）将长期保留，随时可回看或直接用 VS Code 打开对比。

---

## License

MIT
