# NSD Box Editor

## 中文说明

### 项目简介

这是一个基于 React + TypeScript + Vite 的 Nassi-Shneiderman Diagram (NSD) 可视化编辑器。

该编辑器用于创建、编辑和重排流程结构节点（Process / If / Case / Loop），支持树形结构数据编辑、画布交互，以及 JSON 导入导出。

### 功能特性

- 新增、插入、删除、上下移动节点
- 支持 If 分支、Case 多分支、While / Do-While 循环
- 支持拖拽重排（同容器内节点与结果分支调整）
- 支持节点文本与条件文本编辑
- 支持项目 JSON 下载与加载

### 技术栈

- React 19
- TypeScript 5
- Vite 7
- ESLint 9

### 快速开始

#### 环境要求

- Node.js 18+（建议 LTS）
- npm 9+

#### 安装依赖

```powershell
npm install
```

#### 启动开发环境

```powershell
npm run dev
```

#### 构建生产版本

```powershell
npm run build
```

#### 代码检查

```powershell
npm run lint
```

#### 本地预览

```powershell
npm run preview
```

### 目录结构

```text
src/
  app/          # 状态与类型定义
  components/   # 画布与交互组件
  features/     # 功能模块（如键盘）
  layout/       # 布局计算
  model/        # 树结构操作
  render/       # 各节点渲染
  styles/       # 样式
  utils/        # 工具函数
```

### 数据与导入导出

项目数据以树结构保存，核心类型定义在 `src/app/types.ts`。

可通过下载导出 JSON，并通过加载恢复项目。

### 开发说明

当前应用入口为 `src/main.tsx`，应用壳在 `src/App.tsx`。

主要树操作逻辑在 `src/model/treeOps.ts`。

### 许可证

暂未声明开源许可证。

---

## English

### Overview

This is a visual Nassi-Shneiderman Diagram (NSD) editor built with React + TypeScript + Vite.

It is designed for creating, editing, and reordering structured flow nodes (Process / If / Case / Loop), with tree-based data editing, canvas interaction, and JSON import/export.

### Features

- Add, insert, delete, and move nodes up/down
- Supports If branches, Case multi-branches, and While / Do-While loops
- Drag-and-drop reordering (intra-container nodes and result branches)
- Editable node text and condition text
- Project JSON download and load

### Tech Stack

- React 19
- TypeScript 5
- Vite 7
- ESLint 9

### Quick Start

#### Prerequisites

- Node.js 18+ (LTS recommended)
- npm 9+

#### Install Dependencies

```powershell
npm install
```

#### Start Dev Server

```powershell
npm run dev
```

#### Build for Production

```powershell
npm run build
```

#### Lint

```powershell
npm run lint
```

#### Preview Build

```powershell
npm run preview
```

### Project Structure

```text
src/
  app/          # app state and shared types
  components/   # canvas and UI components
  features/     # feature modules (e.g. keyboard)
  layout/       # layout engine
  model/        # tree operations
  render/       # node renderers
  styles/       # styles
  utils/        # utilities
```

### Data and I/O

Project data is stored as a tree structure, and core types are defined in `src/app/types.ts`.

You can export JSON via download and restore a project by loading it.

### Development Notes

The app entry is `src/main.tsx`, and the app shell is `src/App.tsx`.

Core tree operation logic is in `src/model/treeOps.ts`.

### License

No open-source license has been declared yet.