// FILE: src/app/constants.ts
import type { AppState, SequenceNode, StyleConfig } from './types'
import { createProcessNode } from '../model/factory'

/**
 * 初始矩形的宽 x / 高 y —— 代码层固定常量（不随 style 动态变化）
 *
 * 说明：
 * - 这里的 x/y 是“默认风格”的基准值（新建工程时使用）
 * - 导入 JSON 时会使用文件里的 style，所以老工程不会被强行改样式
 */
export const BASE_BLOCK_WIDTH = 240
export const BASE_BLOCK_HEIGHT = 36

export const DEFAULT_STYLE: StyleConfig = {
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", Arial, sans-serif',
    // 让 baseBlockHeight(style) 恰好算到 36：
    // lineBoxHeight(15)=18，paddingProcess=9 => 18 + 18 = 36
    fontSize: 15,
    lineWidth: 1,
    paddingProcess: 9,
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