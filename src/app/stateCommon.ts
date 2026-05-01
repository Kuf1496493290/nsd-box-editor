import type { AppState, NsdNode, SelectionTarget, SequenceNode } from './types'

export type HistoryState = Readonly<{
    past: AppState[]
    present: AppState
    future: AppState[]
}>

/**
 * 撤销栈上限，超出后丢弃最早历史快照。
 */
export const HISTORY_LIMIT = 200

function traversalChildren(node: NsdNode): NsdNode[] {
    if (node.type === 'sequence') return node.children
    if (node.type === 'if') return [node.falseBranch, node.trueBranch]
    if (node.type === 'case') return node.branches
    if (node.type === 'loop') return [node.body]
    return []
}

export function containsNode(root: SequenceNode, nodeId: string): boolean {
    const stack: NsdNode[] = [root]

    while (stack.length > 0) {
        const current = stack.pop()
        if (!current) break

        if (current.id === nodeId) return true

        const children = traversalChildren(current)
        for (let i = children.length - 1; i >= 0; i -= 1) {
            stack.push(children[i])
        }
    }

    return false
}

export function findNodeById(root: SequenceNode, nodeId: string | null): NsdNode | null {
    if (!nodeId) return null

    const stack: NsdNode[] = [root]
    while (stack.length > 0) {
        const current = stack.pop()
        if (!current) break

        if (current.id === nodeId) return current

        const children = traversalChildren(current)
        for (let i = children.length - 1; i >= 0; i -= 1) {
            stack.push(children[i])
        }
    }

    return null
}

/**
 * 根据节点类型推导默认选中目标。
 */
export function defaultTargetForNode(root: SequenceNode, nodeId: string | null): SelectionTarget | null {
    if (!nodeId) return null

    const node = findNodeById(root, nodeId)
    if (!node) return { kind: 'node', nodeId }

    if (node.type === 'if') return { kind: 'ifPart', nodeId, part: 'header' }
    if (node.type === 'case') return { kind: 'casePart', nodeId, part: 'header' }

    return { kind: 'node', nodeId }
}

function normalizeTargetKind(root: SequenceNode, target: SelectionTarget): SelectionTarget {
    if (target.kind !== 'node') return target
    return defaultTargetForNode(root, target.nodeId) ?? target
}

type NormalizedSelection = Readonly<{ selectedNodeId: string | null; selectedTarget: SelectionTarget | null }>

/**
 * 规范化 selectedNodeId/selectedTarget，清理失效选中并补齐默认目标。
 */
export function normalizeSelection(next: AppState): AppState {
    const root = next.root
    const selectedNodeId0 = next.selectedNodeId
    const selectedTarget0 = next.selectedTarget

    const targetValid = selectedTarget0 ? containsNode(root, selectedTarget0.nodeId) : true
    const nodeValid = selectedNodeId0 ? containsNode(root, selectedNodeId0) : true

    const base: NormalizedSelection = (() => {
        if (!targetValid || !nodeValid) {
            return { selectedNodeId: null, selectedTarget: null }
        }

        if (selectedTarget0) {
            const normalizedTarget = normalizeTargetKind(root, selectedTarget0)
            return { selectedNodeId: normalizedTarget.nodeId, selectedTarget: normalizedTarget }
        }

        if (selectedNodeId0) {
            const filled = defaultTargetForNode(root, selectedNodeId0)
            return { selectedNodeId: filled ? filled.nodeId : null, selectedTarget: filled }
        }

        return { selectedNodeId: null, selectedTarget: null }
    })()

    const sameNode = base.selectedNodeId === next.selectedNodeId
    const sameTarget = base.selectedTarget === next.selectedTarget
    if (sameNode && sameTarget) return next

    return { ...next, selectedNodeId: base.selectedNodeId, selectedTarget: base.selectedTarget }
}

/**
 * 提交一次历史记录：写入 past、重置 future，并规范化 present 选中态。
 */
export function commitHistory(prev: HistoryState, nextPresent: AppState): HistoryState {
    const normalizedPresent = normalizeSelection(nextPresent)

    const nextPast = [...prev.past, prev.present]
    const trimmedPast = nextPast.length > HISTORY_LIMIT ? nextPast.slice(nextPast.length - HISTORY_LIMIT) : nextPast

    return {
        past: trimmedPast,
        present: normalizedPresent,
        future: [],
    }
}

export function clampScale(value: number): number {
    const v = Number.isFinite(value) ? value : 1
    const clamped = Math.max(0.5, Math.min(2, v))
    return Math.round(clamped * 10) / 10
}

export function clampRelax(value: number): number {
    const v = Number.isFinite(value) ? value : 1
    const clamped = Math.max(0, Math.min(1, v))
    return Math.round(clamped * 10) / 10
}

/**
 * 判断当前选中目标是否允许执行删除操作。
 */
export function canDeleteByTarget(target: SelectionTarget | null): boolean {
    if (!target) return false
    if (target.kind === 'node') return true

    if (target.kind === 'ifPart') {
        return target.part !== 'trueContainer' && target.part !== 'falseContainer'
    }

    if (target.kind === 'casePart') {
        return target.part !== 'branchContainer'
    }

    return false
}