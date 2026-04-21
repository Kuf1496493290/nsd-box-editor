# NSD Box Editor

> 一款面向结构化程序设计的 Nassi–Shneiderman 图（盒图）专用可视化编辑器

---

## 目录

1. [项目背景](#项目背景)
2. [核心亮点](#核心亮点)
3. [什么是 N-S 图](#什么是-n-s-图)
4. [预览](#预览)
5. [功能概览](#功能概览)
6. [技术架构](#技术架构)
7. [使用方式](#使用方式)
8. [项目结构](#项目结构)
9. [数据格式](#数据格式)
10. [样式配置](#样式配置)
11. [分发与部署](#分发与部署)

---

## 项目背景

Nassi–Shneiderman 图（又称 N-S 图、盒图、结构图）是计算机科学课程中描述结构化程序逻辑的标准图形工具，广泛用于算法设计、程序分析与教学文档。

然而，当前可用的绘制工具极为有限：

- **通用作图软件**（如 Visio、draw.io、Lucidchart）均面向通用流程图，没有原生的 N-S 图节点类型。用户需要手动拼凑矩形、手工维护嵌套关系，稍作修改便要大量返工，极不适合结构频繁调整的场景。
- **在线专用工具**数量极少，且多为付费订阅制，或功能残缺（不支持 Case 多分支、Do-While 等常见结构），导出格式也受限。
- **代码生成方案**（如基于 LaTeX 的 struktex 宏包）有较高的学习门槛，且所见非所得，调试繁琐。

本项目旨在填补这一空白：提供一个**完全免费、开箱即用、无需联网**的桌面级 N-S 图编辑器，让用户像操作思维导图一样自然地构建和调整程序结构图，专注于逻辑本身而非排版细节。

---

## 核心亮点

| 维度 | NSD Box Editor | Visio / draw.io | 在线专用工具 | struktex (LaTeX) |
|------|---------------|-----------------|--------------|------------------|
| N-S 图原生支持 | ✅ 全部五种结构 | ❌ 需手工拼凑 | ⚠️ 通常残缺 | ✅ 但无可视化 |
| 免费 | ✅ 完全免费 | ❌ 付费 | ⚠️ 多为订阅制 | ✅ |
| 无需联网 | ✅ 纯桌面 | ✅ | ❌ | ✅ |
| 所见即所得 | ✅ | ✅ | ✅ | ❌ |
| 撤销 / 重做 | ✅ 零副作用 | ✅ | ⚠️ 不一 | ❌ |
| Win7 兼容 | ✅ | ⚠️ | ❌ | ✅ |
| 开源 | ✅ | ❌ | ❌ | ✅ |

**工程差异化说明：**

- **原生 N-S 图语义**：应用内部的数据模型直接对应 Process / If / Case / While / Do-While 五种结构，而非在通用图形库上二次拼凑。结构的合法性由类型系统在编译期保障，运行时不可能产生不合法的嵌套。
- **不可变树使撤销零副作用**：所有操作均在内存中产生新树，旧树作为历史快照保留在撤销栈中。`Ctrl+Z` 的实现等价于将指针前移一格，没有复杂的反向操作逻辑，也不存在状态回滚失败的可能性。
- **语义感知选区系统**：同一块画布区域根据点击目标的语义（节点本身、If 分支标签、Case 分支容器、Loop 内部空洞）触发截然不同的插入行为，操作意图与视觉位置完全对应，无需额外的模式切换。
- **双平台桌面发行**：同一份源码经 electron-builder 分别打包为面向 Win10/11（现代 Chromium）和 Win7（降级 Electron）的独立可执行文件，终端用户无需安装任何运行时。

---

## 什么是 N-S 图

N-S 图由 Isaac Nassi 和 Ben Shneiderman 于 1973 年提出，是结构化程序设计中消除 GOTO 语句之后用于可视化描述控制流的主流方案。其核心思想是**以矩形嵌套代替箭头连线**，每种控制结构均有固定的图形表示：

| 结构类型 | 图形特征 |
|----------|----------|
| **顺序（Process）** | 单行矩形，逐行堆叠 |
| **条件（If/Else）** | 顶部三角标注条件，下方分左右两列真/假分支 |
| **多分支（Case）** | 顶部标注判断量，下方按分支数平均分列 |
| **当型循环（While）** | 条件在顶，循环体嵌套在内部矩形 |
| **直到型循环（Do-While）** | 条件在底，循环体在上方 |

这种图形消除了任意跳转的可能性，使程序结构一眼可见，特别适合教学与文档交付场景。

---

## 预览

### 主界面

![主界面运行截图](运行截图.png)

*主界面展示：左侧工具栏、中央画布（含 If / Case / Loop 嵌套示例）、浮动文本编辑器*

---

## 功能概览

### 节点操作

- **添加节点**：在当前选中位置之后插入 Process、If、Case、Loop（While / Do-While）节点
- **选择感知插入**：根据当前选中目标的语义（节点本身 / 分支标签 / 分支容器 / Loop 内部空洞）自动决定插入位置，操作逻辑符合直觉
- **删除节点**：删除当前选中节点及其所有子结构，Case 分支标签选中时删除对应分支
- **上下移动**：在同一容器内调整节点顺序

### 拖拽重排

- 同容器内节点支持拖拽排序，拖动时实时显示插入位置指示线
- If 的真 / 假分支、Case 的任意分支均支持拖拽换序
- 拖拽范围严格限定于同级容器，不允许跨层级移动，确保结构合法性

### 文本编辑

- 双击节点文本或条件头部文字，进入浮动文本编辑器
- `Enter` 键在选中状态下直接激活编辑，`Escape` 退出编辑
- If 节点支持切换分支标签模式：`T/F`（True/False）或 `Y/N`（Yes/No）
- `Tab` 键在 Case 节点选中时快速追加新分支

### 撤销 / 重做

- 全操作撤销栈，`Ctrl+Z` 撤销，`Ctrl+Shift+Z` / `Ctrl+Y` 重做
- 撤销历史跨越所有结构变更操作（插入、删除、移动、文本修改）

### 项目保存与加载

- 一键导出项目为 JSON 文件，完整保存树结构与样式配置
- 加载 JSON 文件恢复项目，支持跨设备流转

### 键盘快捷键汇总

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+Z` | 撤销 |
| `Ctrl+Shift+Z` / `Ctrl+Y` | 重做 |
| `Delete` | 删除选中节点 / 分支 |
| `Enter` | 进入选中节点的文本编辑 |
| `Tab` | Case 节点追加分支 |
| `Escape` | 退出编辑模式 |

---

## 技术架构

### 技术栈

| 层次 | 技术 | 版本 | 作用 |
|------|------|------|------|
| UI 框架 | **React** | 19.2 | 组件化界面、事件驱动 |
| 类型系统 | **TypeScript** | 5.9 | 全量类型覆盖，编译期保障结构安全 |
| 构建工具 | **Vite** | 7.3 | 极速 HMR 开发体验与生产构建 |
| 代码规范 | **ESLint** | 9.39 | 含 react-hooks / react-refresh 插件 |
| 桌面封装 | **Electron** | 37.3 | 打包为独立桌面应用，无需浏览器 |
| 安装包构建 | **electron-builder** | 26.0 | 支持 Win10/11 与 Win7 双目标产物 |

### 架构设计

整个应用采用**纯前端树结构模型驱动**的设计：

```
用户交互 (Canvas / Toolbar / Keyboard)
        ↓
  AppController 层（统一指令派发）
        ↓
  TreeOps 层（不可变树操作，产生新树）
        ↓
  React 状态更新 → 重新渲染
        ↓
  Canvas 布局引擎（尺寸计算 + SVG/Canvas 绘制）
```

**不可变树操作（Immutable Tree Operations）**是核心设计原则：所有结构变更均产生新的树对象，原树不被修改。这使得撤销 / 重做只需在历史快照栈中前后移动，实现简洁且无副作用。

**布局引擎**在每次渲染时对整棵树进行自底向上的尺寸计算：叶节点的宽高由文本度量决定，父节点宽度取所有子节点中的最大值，保证嵌套矩形不出现内容溢出。

**选区系统（Selection System）**使用带有语义标签的选中目标（`SelectionTarget`），区分"节点本身"、"If 头部"、"Case 分支标签"、"Case 分支容器"、"Loop 内部"等不同点击目标，使同一套插入逻辑可以根据上下文表达截然不同的意图。

### 关键技术决策

**① 为什么选择不可变树，而非可变树？**

可变树的 undo/redo 需要为每种操作单独实现逆操作（删除 ↔ 插入、移动 ↔ 反向移动），操作种类越多，维护成本越高，且逆操作与正操作之间的状态一致性难以保证。不可变树将"历史"天然外化为快照数组，undo 就是 `historyIndex--`，redo 就是 `historyIndex++`，整个撤销系统无需了解任何具体操作的语义。

**② 布局引擎为什么自底向上推导尺寸？**

N-S 图的宽度约束是从叶节点向上传播的：最宽的叶节点决定其所在分支的宽度，分支宽度之和决定父节点的宽度。若自顶向下分配宽度，则需要多次遍历才能收敛，且面对文本变长时容易产生溢出。自底向上一次遍历即可确定所有节点的精确尺寸，并天然保证父节点不窄于任何子节点。

**③ 语义选区系统的设计动机是什么？**

传统编辑器通常将"当前选中的对象"建模为单一节点引用，导致在结构复杂的图中（如 Case 多分支）只能通过额外的弹窗或侧边栏来选择操作目标。本项目将选区建模为带有结构语义的 `SelectionTarget` 联合类型，点击 Case 分支标签、分支容器或 Loop 内部空洞都会产生不同的 target 值，工具栏与键盘的插入逻辑直接读取 target 的 `kind` 字段即可决定行为，无需额外模式。这使得所有操作均可在单一画布点击后直接触发，保持了交互的连贯性。

---

## 使用方式

### 开发模式

#### 环境要求

- Node.js 18+（建议 LTS 版本）
- npm 9+

#### 安装依赖

```bash
npm install
```

#### 浏览器开发模式（Vite Dev Server）

```bash
npm run dev
```

启动后在浏览器访问 `http://localhost:5173`，支持热模块替换（HMR），适合快速迭代 UI。

#### Electron 桌面开发模式

```bash
npm run desktop:run
```

先执行生产构建，再以 Electron 窗口启动，用于验证桌面集成行为（窗口管理、进程退出等）。

#### 生产 Web 构建与预览

```bash
npm run build
npm run preview
```

### 基本操作流程

1. **新建图表**：应用启动后默认生成一个空的 Process 节点作为起点。
2. **选中节点**：在画布区域单击任意节点、分支标签或容器区域。
3. **添加结构**：在工具栏点击 Process / If / Case / While / Do-While 按钮，节点将插入到当前选中位置的下方（若选中的是容器，则插入容器内部）。
4. **编辑文本**：双击节点文字，或选中后按 `Enter`，在弹出的浮动编辑框中修改文字，按 `Escape` 或点击外部确认。
5. **调整顺序**：拖拽节点到目标位置，出现蓝色插入线时松开鼠标。
6. **撤销操作**：`Ctrl+Z` 逐步撤销，`Ctrl+Y` 重做。
7. **保存项目**：点击工具栏「下载」按钮，导出 `.json` 文件；下次点击「加载」选择该文件即可恢复。

---

## 项目结构

```
nsd-box-editor/
├── electron/
│   └── main.cjs          # Electron 主进程入口
├── src/
│   ├── main.tsx          # Web 应用入口
│   ├── App.tsx           # 应用顶层壳组件
│   ├── app/
│   │   ├── types.ts      # 全局类型定义（节点、选区、样式配置）
│   │   ├── constants.ts  # 默认常量（字体、尺寸、颜色）
│   │   ├── state.ts      # 应用状态结构
│   │   ├── stateActions.ts     # 状态变更 Actions
│   │   ├── appController.ts    # 指令派发中枢
│   │   ├── appControllerActions.ts  # 具体操作实现
│   │   ├── appControllerHelpers.ts  # 操作辅助函数
│   │   └── appControllerUi.ts       # UI 相关控制逻辑
│   ├── model/
│   │   ├── factory.ts          # 节点工厂函数
│   │   ├── treeOps.ts          # 树操作入口（查找、遍历）
│   │   ├── treeOpsMove.ts      # 节点移动操作
│   │   ├── treeOpsStructure.ts # 节点增删操作
│   │   └── treeOpsTextOps.ts   # 文本修改操作
│   ├── layout/           # 布局计算引擎（尺寸自底向上推导）
│   ├── render/
│   │   ├── renderProcess.tsx   # Process 节点渲染
│   │   ├── renderIf.tsx        # If 节点渲染
│   │   ├── renderCase.tsx      # Case 节点渲染
│   │   ├── renderLoop.tsx      # Loop 节点渲染
│   │   ├── renderNode.tsx      # 节点分发渲染
│   │   └── renderCommon.tsx    # 公共渲染工具
│   ├── components/
│   │   ├── CanvasView.tsx      # 画布容器与交互主入口
│   │   ├── Toolbar.tsx         # 工具栏
│   │   ├── NodeActions.tsx     # 节点操作面板
│   │   ├── FloatingTextEditor.tsx  # 浮动文本编辑器
│   │   └── canvas/
│   │       ├── canvasInteractionHelpers.ts  # 点击命中检测
│   │       └── dragHelpers.ts               # 拖拽逻辑
│   ├── features/         # 功能模块（键盘事件处理）
│   ├── styles/           # 全局样式
│   └── utils/
│       └── projectJson.ts  # JSON 导入导出
├── build/
│   └── icon.ico          # 应用图标
├── 运行截图.png           # 主界面截图
├── electron-builder.modern.json  # Win10/11 打包配置
├── electron-builder.win7.json    # Win7 打包配置
└── package.json
```

---

## 数据格式

项目以 JSON 格式持久化，核心是一棵以 `SequenceNode` 为根的递归树。各节点类型结构如下：

```typescript
// 顺序容器（根节点及各分支内部均为此类型）
{ id, type: 'sequence', children: NsdNode[] }

// 处理块
{ id, type: 'process', text: string }

// 条件分支
{ id, type: 'if', conditionText: string,
  boolLabelMode: 'TF' | 'YN',
  trueBranch: SequenceNode, falseBranch: SequenceNode }

// 多路分支
{ id, type: 'case', conditionText: string,
  branches: SequenceNode[], branchLabels: string[] }

// 循环
{ id, type: 'loop', loopKind: 'while' | 'doWhile',
  conditionText: string, body: SequenceNode }
```

导出的 JSON 文件同时包含当前的样式配置（`StyleConfig`），保证在不同设备加载后外观一致。

---

## 样式配置

样式参数定义于 `src/app/types.ts` 的 `StyleConfig` 接口，在项目 JSON 中持久化：

| 参数 | 含义 |
|------|------|
| `fontFamily` | 画布字体族 |
| `fontSize` | 基准字号（px） |
| `lineWidth` | 线框宽度（px） |
| `paddingProcessX` / `paddingProcessY` | Process 节点文本内边距 |
| `paddingHeader` | If / Case / Loop 条件头部文本水平内边距，影响块最小宽度 |
| `paddingBranchLabel` | If / Case 分支标签文本水平内边距 |
| `minBlockWidth` | 节点块最小宽度（px） |

---

## 分发与部署

应用通过 Electron 打包为独立的 Windows 桌面程序，**无需安装 Node.js、无需浏览器、无需联网**。

### 构建

```bash
npm install

# 同时构建 Win10/11 + Win7 两个版本
npm run desktop:build
```

产物目录：

| 目录 | 适用平台 |
|------|----------|
| `release/modern/win-unpacked/` | Windows 10 / 11（x64） |
| `release/win7/win-unpacked/` | Windows 7（x64） |

分发时将对应的 `win-unpacked` 文件夹交给用户，双击其中的 `NSD Box Editor.exe` 即可启动，关闭窗口后进程自动退出。

### 可选：单文件便携版

```bash
npm run desktop:portable
```

产物示例：`release/modern/NSD Box Editor v0.0.1.exe`，单文件即可运行，便于 U 盘携带。

### 仅构建 Win7 包

```bash
npm run desktop:build:win7
```

构建完成后会自动验证 Win7 产物的 PE 文件头，确认架构为 x64、文件大小合理，防止打包异常。
