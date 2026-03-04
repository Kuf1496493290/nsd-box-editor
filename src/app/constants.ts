// FILE: src/app/constants.ts
import type { AppState, SequenceNode, StyleConfig } from './types'
import { createProcessNode } from '../model/factory'

/**
 * 初始矩形的宽 x / 高 y —— 代码层固定常量（不随 style 动态变化）
 */
export const BASE_BLOCK_WIDTH = 220
export const BASE_BLOCK_HEIGHT = 33

export const DEFAULT_STYLE: StyleConfig = {
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", Arial, sans-serif',
    fontSize: 14,
    lineWidth: 1,
    paddingProcess: 8,
    paddingHeader: 8,
    paddingBranchLabel: 6,
    loopSidebarWidth: Number(BASE_BLOCK_HEIGHT),
    minBlockWidth: BASE_BLOCK_WIDTH,
}

export function createDefaultRoot(): SequenceNode {
    return {
        id: 'root',
        type: 'sequence',
        children: [createProcessNode('在这里输入第一步')],
    }
}

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