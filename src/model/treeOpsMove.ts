import type { DragContainerKey, DragMoveRequest, NsdNode, SequenceNode } from '../app/types'
import { mapSequence, normalizeCaseBranchLabels, type UpdateResult } from './treeOpsStructure'

function clampIndex(index: number, length: number): number {
    if (!Number.isFinite(index)) return 0
    return Math.max(0, Math.min(length, Math.floor(index)))
}

function ownerKeyOfContainer(container: DragContainerKey): string {
    switch (container.kind) {
        case 'root':
            return 'root'
        case 'loopBody':
        case 'ifBranch':
        case 'caseBranch':
            return container.nodeId
    }
}

/**
 * 在源/目标 children 列表中移动节点，统一处理同列表重排与跨列表迁移。
 */
function moveWithinChildren(params: Readonly<{
    sourceChildren: NsdNode[]
    targetChildren: NsdNode[]
    sourceIndex: number
    toIndex: number
    isSameList: boolean
}>): Readonly<{ nextSource: NsdNode[]; nextTarget: NsdNode[]; moved: NsdNode | null; changed: boolean }> {
    const { sourceChildren, targetChildren, sourceIndex, toIndex, isSameList } = params
    if (sourceIndex < 0 || sourceIndex >= sourceChildren.length) {
        return { nextSource: sourceChildren, nextTarget: targetChildren, moved: null, changed: false }
    }

    const moved = sourceChildren[sourceIndex]
    if (!moved) return { nextSource: sourceChildren, nextTarget: targetChildren, moved: null, changed: false }

    if (isSameList) {
        const remaining = sourceChildren.filter((_, i) => i !== sourceIndex)

        let insertIndex = toIndex
        if (toIndex > sourceIndex) insertIndex = toIndex - 1
        const insertAt = clampIndex(insertIndex, remaining.length)

        if (insertAt === sourceIndex) {
            return { nextSource: sourceChildren, nextTarget: targetChildren, moved: null, changed: false }
        }

        const next = [...remaining]
        next.splice(insertAt, 0, moved)

        const changed = next.length === sourceChildren.length && next.some((n, i) => n !== sourceChildren[i])
        return { nextSource: next, nextTarget: next, moved, changed }
    }

    const nextSource = sourceChildren.filter((_, i) => i !== sourceIndex)
    const insertAt = clampIndex(toIndex, targetChildren.length)
    const nextTarget = [...targetChildren]
    nextTarget.splice(insertAt, 0, moved)
    return { nextSource, nextTarget, moved, changed: true }
}

function moveFromRoot(root: SequenceNode, req: Extract<DragMoveRequest, { kind: 'node' }>): UpdateResult {
    if (req.to.kind !== 'root') return { root, changed: false }

    const nodeId = req.nodeId
    const sourceIndex = root.children.findIndex((n) => n.id === nodeId)
    if (sourceIndex < 0) return { root, changed: false }

    const movedResult = moveWithinChildren({
        sourceChildren: root.children,
        targetChildren: root.children,
        sourceIndex,
        toIndex: req.toIndex,
        isSameList: true,
    })

    if (!movedResult.changed) return { root, changed: false }

    return {
        root: { ...root, children: movedResult.nextSource },
        changed: true,
        selectedNodeId: nodeId,
        selectedTarget: { kind: 'node', nodeId },
    }
}

function moveFromLoopBody(root: SequenceNode, req: Extract<DragMoveRequest, { kind: 'node' }>): UpdateResult {
    if (req.from.kind !== 'loopBody') return { root, changed: false }
    if (req.to.kind !== 'loopBody') return { root, changed: false }

    const from = req.from
    const to = req.to
    if (from.nodeId !== to.nodeId) return { root, changed: false }

    const nodeId = req.nodeId
    const toIndex = req.toIndex
    let changed = false

    const nextRoot = mapSequence(root, (node) => {
        if (node.type !== 'loop') return node
        if (node.id !== from.nodeId) return node

        const sourceIndex = node.body.children.findIndex((n) => n.id === nodeId)
        if (sourceIndex < 0) return node

        const movedResult = moveWithinChildren({
            sourceChildren: node.body.children,
            targetChildren: node.body.children,
            sourceIndex,
            toIndex,
            isSameList: true,
        })

        if (!movedResult.changed) return node
        changed = true
        return { ...node, body: { ...node.body, children: movedResult.nextSource } }
    })

    return {
        root: nextRoot,
        changed,
        selectedNodeId: changed ? nodeId : undefined,
        selectedTarget: changed ? { kind: 'node', nodeId } : undefined,
    }
}

function moveFromIfBranch(root: SequenceNode, req: Extract<DragMoveRequest, { kind: 'node' }>): UpdateResult {
    if (req.from.kind !== 'ifBranch') return { root, changed: false }
    if (req.to.kind !== 'ifBranch') return { root, changed: false }

    const from = req.from
    const to = req.to
    if (from.nodeId !== to.nodeId) return { root, changed: false }

    const nodeId = req.nodeId
    const toIndex = req.toIndex
    let changed = false

    const nextRoot = mapSequence(root, (node) => {
        if (node.type !== 'if') return node
        if (node.id !== from.nodeId) return node

        const fromBranchSeq = from.branch === 'true' ? node.trueBranch : node.falseBranch
        const toBranchSeq = to.branch === 'true' ? node.trueBranch : node.falseBranch

        const sourceIndex = fromBranchSeq.children.findIndex((n) => n.id === nodeId)
        if (sourceIndex < 0) return node

        const sameList = from.branch === to.branch
        const movedResult = moveWithinChildren({
            sourceChildren: fromBranchSeq.children,
            targetChildren: toBranchSeq.children,
            sourceIndex,
            toIndex,
            isSameList: sameList,
        })

        if (!movedResult.changed) return node
        changed = true

        let nextTrue = node.trueBranch
        let nextFalse = node.falseBranch

        if (from.branch === 'true') nextTrue = { ...nextTrue, children: movedResult.nextSource }
        if (from.branch === 'false') nextFalse = { ...nextFalse, children: movedResult.nextSource }

        if (to.branch === 'true') nextTrue = { ...nextTrue, children: movedResult.nextTarget }
        if (to.branch === 'false') nextFalse = { ...nextFalse, children: movedResult.nextTarget }

        return { ...node, trueBranch: nextTrue, falseBranch: nextFalse }
    })

    return {
        root: nextRoot,
        changed,
        selectedNodeId: changed ? nodeId : undefined,
        selectedTarget: changed ? { kind: 'node', nodeId } : undefined,
    }
}

function moveFromCaseBranch(root: SequenceNode, req: Extract<DragMoveRequest, { kind: 'node' }>): UpdateResult {
    if (req.from.kind !== 'caseBranch') return { root, changed: false }
    if (req.to.kind !== 'caseBranch') return { root, changed: false }

    const from = req.from
    const to = req.to
    if (from.nodeId !== to.nodeId) return { root, changed: false }

    const nodeId = req.nodeId
    const toIndex = req.toIndex
    let changed = false

    const nextRoot = mapSequence(root, (node) => {
        if (node.type !== 'case') return node
        if (node.id !== from.nodeId) return node

        const fromIndex = from.branchIndex
        const toBranchIndex = to.branchIndex

        const sourceBranch = node.branches[fromIndex]
        const targetBranch = node.branches[toBranchIndex]
        if (!sourceBranch || !targetBranch) return node

        const sourceChildIndex = sourceBranch.children.findIndex((n) => n.id === nodeId)
        if (sourceChildIndex < 0) return node

        const sameList = fromIndex === toBranchIndex
        const movedResult = moveWithinChildren({
            sourceChildren: sourceBranch.children,
            targetChildren: targetBranch.children,
            sourceIndex: sourceChildIndex,
            toIndex,
            isSameList: sameList,
        })

        if (!movedResult.changed) return node
        changed = true

        const nextBranches = [...node.branches]
        nextBranches[fromIndex] = { ...sourceBranch, children: movedResult.nextSource }
        nextBranches[toBranchIndex] = { ...targetBranch, children: movedResult.nextTarget }

        return { ...node, branches: nextBranches }
    })

    return {
        root: nextRoot,
        changed,
        selectedNodeId: changed ? nodeId : undefined,
        selectedTarget: changed ? { kind: 'node', nodeId } : undefined,
    }
}

function moveNodeDrag(root: SequenceNode, req: Extract<DragMoveRequest, { kind: 'node' }>): UpdateResult {
    if (ownerKeyOfContainer(req.from) !== ownerKeyOfContainer(req.to)) return { root, changed: false }

    switch (req.from.kind) {
        case 'root':
            return moveFromRoot(root, req)
        case 'loopBody':
            return moveFromLoopBody(root, req)
        case 'ifBranch':
            return moveFromIfBranch(root, req)
        case 'caseBranch':
            return moveFromCaseBranch(root, req)
    }
}

function moveIfResult(root: SequenceNode, req: Extract<DragMoveRequest, { kind: 'ifResult' }>): UpdateResult {
    if (req.fromBranch === req.toBranch) return { root, changed: false }

    let changed = false
    const nextRoot = mapSequence(root, (node) => {
        if (node.type !== 'if') return node
        if (node.id !== req.nodeId) return node

        changed = true
        return {
            ...node,
            trueBranch: node.falseBranch,
            falseBranch: node.trueBranch,
        }
    })

    const nextSelectedPart: 'trueLabel' | 'falseLabel' = req.toBranch === 'true' ? 'trueLabel' : 'falseLabel'

    return {
        root: nextRoot,
        changed,
        selectedNodeId: changed ? req.nodeId : undefined,
        selectedTarget: changed ? { kind: 'ifPart', nodeId: req.nodeId, part: nextSelectedPart } : undefined,
    }
}

function moveCaseResult(root: SequenceNode, req: Extract<DragMoveRequest, { kind: 'caseResult' }>): UpdateResult {
    let changed = false
    let selectedBranchIndex: number | null = null

    const nextRoot = mapSequence(root, (node) => {
        if (node.type !== 'case') return node
        if (node.id !== req.nodeId) return node

        const branchCount = node.branches.length
        if (branchCount <= 1) return node

        const from = clampIndex(req.fromBranchIndex, branchCount - 1)
        const movingBranch = node.branches[from]
        if (!movingBranch) return node

        const fixedLabels = normalizeCaseBranchLabels(node.branchLabels, branchCount)

        const remainingBranches = node.branches.filter((_, i) => i !== from)

        let insertAt = clampIndex(req.toIndex, remainingBranches.length)
        if (req.toIndex > from) insertAt = clampIndex(req.toIndex - 1, remainingBranches.length)

        if (insertAt === from) return node

        const nextBranches = [...remainingBranches]
        nextBranches.splice(insertAt, 0, movingBranch)

        changed = true
        selectedBranchIndex = insertAt

        return {
            ...node,
            branches: nextBranches,
            branchLabels: fixedLabels,
        }
    })

    return {
        root: nextRoot,
        changed,
        selectedNodeId: changed ? req.nodeId : undefined,
        selectedTarget:
            changed && selectedBranchIndex !== null
                ? { kind: 'casePart', nodeId: req.nodeId, part: 'branchLabel', branchIndex: selectedBranchIndex }
                : undefined,
    }
}

/**
 * 画布拖拽移动统一入口：按请求类型分发到节点重排、IF 结果交换或 CASE 分支重排。
 */
export function applyDragMoveInRoot(root: SequenceNode, req: DragMoveRequest): UpdateResult {
    if (req.kind === 'node') return moveNodeDrag(root, req)
    if (req.kind === 'ifResult') return moveIfResult(root, req)
    return moveCaseResult(root, req)
}