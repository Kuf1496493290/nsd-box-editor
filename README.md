# NSD Box Editor / NSD 框图编辑器

一个基于 React + TypeScript + Vite 的 Nassi-Shneiderman Diagram (NSD) 可视化编辑器。  
A visual editor for Nassi-Shneiderman Diagrams (NSD), built with React + TypeScript + Vite.

## 1. 项目简介 / Overview

- 中文：用于创建、编辑和重排流程结构节点（Process / If / Case / Loop）的前端工具。  
- EN: A frontend tool to create, edit, and reorder structured flow nodes (Process / If / Case / Loop).

- 中文：支持树形结构数据编辑、画布交互和 JSON 导入导出。  
- EN: Supports tree-structured editing, canvas interactions, and JSON import/export.

## 2. 功能特性 / Features

- 中文：新增、插入、删除、上下移动节点。  
- EN: Add, insert, delete, and move nodes up/down.

- 中文：支持 If 分支、Case 多分支、While / Do-While 循环。  
- EN: Supports If branches, Case multi-branches, and While / Do-While loops.

- 中文：支持拖拽重排（同容器内节点与结果分支调整）。  
- EN: Supports drag-and-drop reordering (intra-container nodes and result branches).

- 中文：支持节点文本与条件文本编辑。  
- EN: Editable node text and condition text.

- 中文：支持项目 JSON 下载与加载。  
- EN: Project JSON download and load.

## 3. 技术栈 / Tech Stack

- React 19
- TypeScript 5
- Vite 7
- ESLint 9

## 4. 快速开始 / Quick Start

### 4.1 环境要求 / Prerequisites

- Node.js 18+（建议 LTS）  
- npm 9+

### 4.2 安装依赖 / Install Dependencies

```powershell
npm install
```

### 4.3 启动开发环境 / Start Dev Server

```powershell
npm run dev
```

### 4.4 构建生产版本 / Build for Production

```powershell
npm run build
```

### 4.5 代码检查 / Lint

```powershell
npm run lint
```

### 4.6 本地预览 / Preview Build

```powershell
npm run preview
```

## 5. 目录结构 / Project Structure

```text
src/
  app/          # 状态与类型定义 / app state and shared types
  components/   # 画布与交互组件 / canvas and UI components
  features/     # 功能模块（如键盘）/ feature modules (e.g. keyboard)
  layout/       # 布局计算 / layout engine
  model/        # 树结构操作 / tree operations
  render/       # 各节点渲染 / node renderers
  styles/       # 样式 / styles
  utils/        # 工具函数 / utilities
```

## 6. 数据与导入导出 / Data and I/O

- 中文：项目数据以树结构保存，核心类型定义在 `src/app/types.ts`。  
- EN: Project data is stored as a tree structure; core types are in `src/app/types.ts`.

- 中文：可通过下载导出 JSON，并通过加载恢复项目。  
- EN: You can export JSON via download and restore a project by loading it.

## 7. 开发说明 / Development Notes

- 中文：当前分支主入口为 `src/main.tsx`，应用壳在 `src/App.tsx`。  
- EN: Entry point is `src/main.tsx`, and the app shell is `src/App.tsx`.

- 中文：主要树操作逻辑在 `src/model/treeOps.ts`。  
- EN: Core tree operation logic is in `src/model/treeOps.ts`.

## 8. 许可证 / License

暂未声明开源许可证。  
No open-source license has been declared yet.