import type { AppState, SequenceNode, StyleConfig } from './types'
import { createProcessNode } from '../model/factory'

// 默认样式使用的基础最小块宽。
export const BASE_BLOCK_WIDTH = 240

export const DEFAULT_STYLE: StyleConfig = {
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", Arial, sans-serif',
    // 节点文本默认字号。
    fontSize: 15,
    // 边框线默认宽度。
    lineWidth: 1,
    // 过程块默认纵向内边距。
    paddingProcessY: 9,
    // 过程块默认横向内边距。
    paddingProcessX: 7,
    // IF/CASE/LOOP 头部默认内边距。
    paddingHeader: 7,
    // 分支标签默认内边距。
    paddingBranchLabel: 7,
    // 全局最小块宽。
    minBlockWidth: BASE_BLOCK_WIDTH,
    // 纵向松弛比（0=最紧凑，1=自然方形）。
    heightRelax: 1,
    // 横向松弛比（0=最紧凑，1=自然等宽）。
    widthRelax: 1,
}

/**
 * 创建默认根序列，首次进入画布时会自动带一个过程节点。
 */
export function createDefaultRoot(): SequenceNode {
    return {
        id: 'root',
        type: 'sequence',
        children: [createProcessNode('在这里输入第一步')],
    }
}

/**
 * 创建应用初始状态，并将首个节点设为默认选中目标。
 */
export function createInitialState(): AppState {
    const root = createDefaultRoot()
    const first = root.children[0]

    return {
        style: { ...DEFAULT_STYLE },
        root,
        scale: 1,
        selectedNodeId: first ? first.id : null,
        selectedTarget: first ? { kind: 'node', nodeId: first.id } : null,
    }
}