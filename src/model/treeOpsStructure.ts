import type { NsdNode, SelectionTarget, SequenceNode } from '../app/types'

export type UpdateResult = Readonly<{
    root: SequenceNode
    changed: boolean
    selectedNodeId?: string | null
    selectedTarget?: SelectionTarget | null
}>

type Accumulator = Readonly<{
    changed: boolean
    selectedNodeId?: string | null
    selectedTarget?: SelectionTarget | null
}>

type SequenceUpdater = (sequence: SequenceNode) => UpdateResult | null

export function normalizeCaseBranchLabels(labels: string[] | undefined, branchCount: number): string[] {
    const safe = Array.isArray(labels) ? labels : []
    const next: string[] = []
    for (let i = 0; i < branchCount; i += 1) {
        next.push(safe[i] ?? String(i + 1))
    }
    return next
}

export function mapNode(node: NsdNode, mapper: (node: NsdNode) => NsdNode): NsdNode {
    if (node.type === 'process') return mapper(node)

    if (node.type === 'sequence') {
        const nextChildren = node.children.map((child) => mapNode(child, mapper))
        const sameChildren = nextChildren.every((child, index) => child === node.children[index])
        const nextNode = sameChildren ? node : { ...node, children: nextChildren }
        return mapper(nextNode)
    }

    if (node.type === 'if') {
        const nextTrueBranch = mapSequence(node.trueBranch, mapper)
        const nextFalseBranch = mapSequence(node.falseBranch, mapper)
        const sameBranches = nextTrueBranch === node.trueBranch && nextFalseBranch === node.falseBranch
        const nextNode = sameBranches ? node : { ...node, trueBranch: nextTrueBranch, falseBranch: nextFalseBranch }
        return mapper(nextNode)
    }

    if (node.type === 'case') {
        const nextBranches = node.branches.map((b) => mapSequence(b, mapper))
        const sameBranches =
            nextBranches.length === node.branches.length && nextBranches.every((b, i) => b === node.branches[i])

        const nextNode = sameBranches ? node : { ...node, branches: nextBranches }
        return mapper(nextNode)
    }

    const nextBody = mapSequence(node.body, mapper)
    const nextNode = nextBody === node.body ? node : { ...node, body: nextBody }
    return mapper(nextNode)
}

export function mapSequence(root: SequenceNode, mapper: (node: NsdNode) => NsdNode): SequenceNode {
    const nextChildren = root.children.map((child) => mapNode(child, mapper))
    const sameChildren = nextChildren.every((child, index) => child === root.children[index])

    if (sameChildren) return root
    return { ...root, children: nextChildren }
}

function cloneChildren(root: SequenceNode): NsdNode[] {
    return [...root.children]
}

function mergeAcc(acc: Accumulator, next: Accumulator): Accumulator {
    if (!next.changed) return acc
    return {
        changed: true,
        selectedNodeId: next.selectedNodeId ?? acc.selectedNodeId,
        selectedTarget: next.selectedTarget ?? acc.selectedTarget,
    }
}

function updateIfNode(child: Extract<NsdNode, { type: 'if' }>, updater: SequenceUpdater) {
    const trueResult = updateWithinSequence(child.trueBranch, updater)
    const falseResult = trueResult.changed
        ? ({ root: child.falseBranch, changed: false as const } satisfies UpdateResult)
        : updateWithinSequence(child.falseBranch, updater)

    if (!trueResult.changed && !falseResult.changed) {
        return { node: child, acc: { changed: false } satisfies Accumulator }
    }

    const nextNode: typeof child = {
        ...child,
        trueBranch: trueResult.changed ? trueResult.root : child.trueBranch,
        falseBranch: falseResult.changed ? falseResult.root : child.falseBranch,
    }

    const picked = trueResult.changed ? trueResult : falseResult
    return {
        node: nextNode,
        acc: {
            changed: true,
            selectedNodeId: picked.selectedNodeId,
            selectedTarget: picked.selectedTarget,
        } satisfies Accumulator,
    }
}

function updateCaseNode(child: Extract<NsdNode, { type: 'case' }>, updater: SequenceUpdater) {
    let localChanged = false
    let localSelectedNodeId: string | null | undefined = undefined
    let localSelectedTarget: SelectionTarget | null | undefined = undefined

    const nextBranches = child.branches.map((b) => {
        const r = updateWithinSequence(b, updater)
        if (!r.changed) return b

        localChanged = true
        localSelectedNodeId = r.selectedNodeId
        localSelectedTarget = r.selectedTarget
        return r.root
    })

    if (!localChanged) {
        return { node: child, acc: { changed: false } satisfies Accumulator }
    }

    return {
        node: { ...child, branches: nextBranches },
        acc: {
            changed: true,
            selectedNodeId: localSelectedNodeId,
            selectedTarget: localSelectedTarget,
        } satisfies Accumulator,
    }
}

function updateLoopNode(child: Extract<NsdNode, { type: 'loop' }>, updater: SequenceUpdater) {
    const r = updateWithinSequence(child.body, updater)
    if (!r.changed) return { node: child, acc: { changed: false } satisfies Accumulator }

    return {
        node: { ...child, body: r.root },
        acc: {
            changed: true,
            selectedNodeId: r.selectedNodeId,
            selectedTarget: r.selectedTarget,
        } satisfies Accumulator,
    }
}

function updateChildNode(child: NsdNode, updater: SequenceUpdater): Readonly<{ next: NsdNode; acc: Accumulator }> {
    if (child.type === 'process') {
        return { next: child, acc: { changed: false } }
    }

    if (child.type === 'sequence') {
        const nested = updateWithinSequence(child, updater)
        if (!nested.changed) return { next: child, acc: { changed: false } }

        return {
            next: nested.root,
            acc: { changed: true, selectedNodeId: nested.selectedNodeId, selectedTarget: nested.selectedTarget },
        }
    }

    if (child.type === 'if') {
        const r = updateIfNode(child, updater)
        return { next: r.node, acc: r.acc }
    }

    if (child.type === 'case') {
        const r = updateCaseNode(child, updater)
        return { next: r.node, acc: r.acc }
    }

    const r = updateLoopNode(child, updater)
    return { next: r.node, acc: r.acc }
}

export function updateWithinSequence(root: SequenceNode, updater: SequenceUpdater): UpdateResult {
    const direct = updater(root)
    if (direct) return direct

    let acc: Accumulator = { changed: false }
    const nextChildren: NsdNode[] = root.children.map((child) => {
        const r = updateChildNode(child, updater)
        acc = mergeAcc(acc, r.acc)
        return r.next
    })

    if (!acc.changed) {
        return {
            root,
            changed: false,
        }
    }

    return {
        root: {
            ...root,
            children: nextChildren,
        },
        changed: true,
        selectedNodeId: acc.selectedNodeId,
        selectedTarget: acc.selectedTarget,
    }
}

export function appendIntoIfBranchEnd(
    root: SequenceNode,
    ifNodeId: string,
    branch: 'true' | 'false',
    createNode: () => NsdNode,
): UpdateResult {
    let changed = false
    let selectedNodeId: string | null | undefined = undefined

    const nextRoot = mapSequence(root, (node) => {
        if (node.type !== 'if') return node
        if (node.id !== ifNodeId) return node

        const newNode = createNode()
        const targetBranch = branch === 'true' ? node.trueBranch : node.falseBranch
        const nextBranch: SequenceNode = {
            ...targetBranch,
            children: [...targetBranch.children, newNode],
        }

        changed = true
        selectedNodeId = newNode.id

        return branch === 'true' ? { ...node, trueBranch: nextBranch } : { ...node, falseBranch: nextBranch }
    })

    return {
        root: nextRoot,
        changed,
        selectedNodeId,
    }
}

export function prependIntoIfBranch(
    root: SequenceNode,
    ifNodeId: string,
    branch: 'true' | 'false',
    createNode: () => NsdNode,
): UpdateResult {
    let changed = false
    let selectedNodeId: string | null | undefined = undefined

    const nextRoot = mapSequence(root, (node) => {
        if (node.type !== 'if') return node
        if (node.id !== ifNodeId) return node

        const newNode = createNode()
        const targetBranch = branch === 'true' ? node.trueBranch : node.falseBranch
        const nextBranch: SequenceNode = {
            ...targetBranch,
            children: [newNode, ...targetBranch.children],
        }

        changed = true
        selectedNodeId = newNode.id

        return branch === 'true' ? { ...node, trueBranch: nextBranch } : { ...node, falseBranch: nextBranch }
    })

    return {
        root: nextRoot,
        changed,
        selectedNodeId,
    }
}

export function appendIntoCaseBranchEnd(
    root: SequenceNode,
    caseNodeId: string,
    branchIndex: number,
    createNode: () => NsdNode,
): UpdateResult {
    let changed = false
    let selectedNodeId: string | null | undefined = undefined

    const nextRoot = mapSequence(root, (node) => {
        if (node.type !== 'case') return node
        if (node.id !== caseNodeId) return node

        const target = node.branches[branchIndex]
        if (!target) return node

        const newNode = createNode()
        const nextBranch: SequenceNode = {
            ...target,
            children: [...target.children, newNode],
        }

        const nextBranches = [...node.branches]
        nextBranches[branchIndex] = nextBranch

        changed = true
        selectedNodeId = newNode.id

        return {
            ...node,
            branches: nextBranches,
        }
    })

    return {
        root: nextRoot,
        changed,
        selectedNodeId,
    }
}

export function prependIntoCaseBranch(
    root: SequenceNode,
    caseNodeId: string,
    branchIndex: number,
    createNode: () => NsdNode,
): UpdateResult {
    let changed = false
    let selectedNodeId: string | null | undefined = undefined

    const nextRoot = mapSequence(root, (node) => {
        if (node.type !== 'case') return node
        if (node.id !== caseNodeId) return node

        const target = node.branches[branchIndex]
        if (!target) return node

        const newNode = createNode()
        const nextBranch: SequenceNode = {
            ...target,
            children: [newNode, ...target.children],
        }

        const nextBranches = [...node.branches]
        nextBranches[branchIndex] = nextBranch

        changed = true
        selectedNodeId = newNode.id

        return {
            ...node,
            branches: nextBranches,
        }
    })

    return {
        root: nextRoot,
        changed,
        selectedNodeId,
    }
}

export function prependIntoLoopBody(root: SequenceNode, loopNodeId: string, createNode: () => NsdNode): UpdateResult {
    let changed = false
    let selectedNodeId: string | null | undefined = undefined

    const nextRoot = mapSequence(root, (node) => {
        if (node.type !== 'loop') return node
        if (node.id !== loopNodeId) return node

        const newNode = createNode()
        const nextBody: SequenceNode = {
            ...node.body,
            children: [newNode, ...node.body.children],
        }

        changed = true
        selectedNodeId = newNode.id

        return {
            ...node,
            body: nextBody,
        }
    })

    return {
        root: nextRoot,
        changed,
        selectedNodeId,
    }
}

export function insertNodeAfter(root: SequenceNode, nodeId: string, createNode: () => NsdNode): UpdateResult {
    return updateWithinSequence(root, (sequence) => {
        const index = sequence.children.findIndex((node) => node.id === nodeId)
        if (index < 0) return null

        const newNode = createNode()
        const nextChildren = cloneChildren(sequence)
        nextChildren.splice(index + 1, 0, newNode)

        return {
            root: {
                ...sequence,
                children: nextChildren,
            },
            changed: true,
            selectedNodeId: newNode.id,
        }
    })
}

export function moveNodeByOffset(root: SequenceNode, nodeId: string, offset: -1 | 1): UpdateResult {
    return updateWithinSequence(root, (sequence) => {
        const index = sequence.children.findIndex((node) => node.id === nodeId)
        if (offset < 0 && index <= 0) return null
        if (offset > 0 && (index < 0 || index >= sequence.children.length - 1)) return null

        const nextChildren = cloneChildren(sequence)
        const current = nextChildren[index]
        const swapIndex = index + offset
        nextChildren[index] = nextChildren[swapIndex]
        nextChildren[swapIndex] = current

        return {
            root: {
                ...sequence,
                children: nextChildren,
            },
            changed: true,
            selectedNodeId: nodeId,
        }
    })
}

export function clampIndex(index: number, length: number): number {
    if (!Number.isFinite(index)) return 0
    return Math.max(0, Math.min(length, Math.floor(index)))
}