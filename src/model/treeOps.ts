// FILE: src/model/treeOps.ts
import type { BoolLabelMode, DragContainerKey, DragMoveRequest, LoopKind, NsdNode, SelectionTarget, SequenceNode } from '../app/types'
import {
    createCaseNode,
    createDoWhileNode,
    createIfNode,
    createProcessNode,
    createSequenceNode,
    createWhileNode,
} from './factory'

type UpdateResult = Readonly<{
    root: SequenceNode
    changed: boolean
    selectedNodeId?: string | null
    selectedTarget?: SelectionTarget | null
}>

function cloneChildren(root: SequenceNode): NsdNode[] {
    return [...root.children]
}

function normalizeText(text: string): string {
    return text.trim().length > 0 ? text : ' '
}

function normalizeCaseBranchLabels(labels: string[] | undefined, branchCount: number): string[] {
    const safe = Array.isArray(labels) ? labels : []
    const next: string[] = []
    for (let i = 0; i < branchCount; i += 1) {
        next.push(safe[i] ?? String(i + 1))
    }
    return next
}

function mapNode(node: NsdNode, mapper: (node: NsdNode) => NsdNode): NsdNode {
    if (node.type === 'process') {
        return mapper(node)
    }

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
        const nextNode = sameBranches
            ? node
            : {
                ...node,
                trueBranch: nextTrueBranch,
                falseBranch: nextFalseBranch,
            }

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

function mapSequence(root: SequenceNode, mapper: (node: NsdNode) => NsdNode): SequenceNode {
    const nextChildren = root.children.map((child) => mapNode(child, mapper))
    const sameChildren = nextChildren.every((child, index) => child === root.children[index])

    if (sameChildren) return root
    return { ...root, children: nextChildren }
}

type Accumulator = Readonly<{
    changed: boolean
    selectedNodeId?: string | null
    selectedTarget?: SelectionTarget | null
}>

function mergeAcc(acc: Accumulator, next: Accumulator): Accumulator {
    if (!next.changed) return acc
    return {
        changed: true,
        selectedNodeId: next.selectedNodeId ?? acc.selectedNodeId,
        selectedTarget: next.selectedTarget ?? acc.selectedTarget,
    }
}

function updateIfNode(child: Extract<NsdNode, { type: 'if' }>, updater: (sequence: SequenceNode) => UpdateResult | null) {
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

function updateCaseNode(
    child: Extract<NsdNode, { type: 'case' }>,
    updater: (sequence: SequenceNode) => UpdateResult | null,
) {
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

function updateLoopNode(
    child: Extract<NsdNode, { type: 'loop' }>,
    updater: (sequence: SequenceNode) => UpdateResult | null,
): Readonly<{ node: typeof child; acc: Accumulator }> {
    const r = updateWithinSequence(child.body, updater)
    if (!r.changed) {
        return { node: child, acc: { changed: false } satisfies Accumulator }
    }

    return {
        node: { ...child, body: r.root },
        acc: {
            changed: true,
            selectedNodeId: r.selectedNodeId,
            selectedTarget: r.selectedTarget,
        } satisfies Accumulator,
    }
}

function updateChildNode(
    child: NsdNode,
    updater: (sequence: SequenceNode) => UpdateResult | null,
): Readonly<{ next: NsdNode; acc: Accumulator }> {
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

function updateWithinSequence(
    root: SequenceNode,
    updater: (sequence: SequenceNode) => UpdateResult | null,
): UpdateResult {
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

function appendIntoIfBranchEnd(
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

        return branch === 'true'
            ? {
                ...node,
                trueBranch: nextBranch,
            }
            : {
                ...node,
                falseBranch: nextBranch,
            }
    })

    return {
        root: nextRoot,
        changed,
        selectedNodeId,
    }
}

function prependIntoIfBranch(
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

        return branch === 'true'
            ? {
                ...node,
                trueBranch: nextBranch,
            }
            : {
                ...node,
                falseBranch: nextBranch,
            }
    })

    return {
        root: nextRoot,
        changed,
        selectedNodeId,
    }
}

function appendIntoCaseBranchEnd(
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

function prependIntoCaseBranch(
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

function prependIntoLoopBody(
    root: SequenceNode,
    loopNodeId: string,
    createNode: () => NsdNode,
): UpdateResult {
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

function createLoopByKind(kind: LoopKind): NsdNode {
    return kind === 'while' ? createWhileNode() : createDoWhileNode()
}

export function appendProcessAtEnd(root: SequenceNode): UpdateResult {
    const newNode = createProcessNode()

    return {
        root: {
            ...root,
            children: [...root.children, newNode],
        },
        changed: true,
        selectedNodeId: newNode.id,
    }
}

export function appendIfAtEnd(root: SequenceNode): UpdateResult {
    const newNode = createIfNode()

    return {
        root: {
            ...root,
            children: [...root.children, newNode],
        },
        changed: true,
        selectedNodeId: newNode.id,
    }
}

export function appendCaseAtEnd(root: SequenceNode): UpdateResult {
    const newNode = createCaseNode()

    return {
        root: {
            ...root,
            children: [...root.children, newNode],
        },
        changed: true,
        selectedNodeId: newNode.id,
    }
}

export function appendWhileAtEnd(root: SequenceNode): UpdateResult {
    const newNode = createWhileNode()
    return {
        root: {
            ...root,
            children: [...root.children, newNode],
        },
        changed: true,
        selectedNodeId: newNode.id,
    }
}

export function appendDoWhileAtEnd(root: SequenceNode): UpdateResult {
    const newNode = createDoWhileNode()
    return {
        root: {
            ...root,
            children: [...root.children, newNode],
        },
        changed: true,
        selectedNodeId: newNode.id,
    }
}

export function appendProcessToIfBranchEnd(
    root: SequenceNode,
    ifNodeId: string,
    branch: 'true' | 'false',
): UpdateResult {
    return appendIntoIfBranchEnd(root, ifNodeId, branch, () => createProcessNode())
}

export function appendIfToIfBranchEnd(
    root: SequenceNode,
    ifNodeId: string,
    branch: 'true' | 'false',
): UpdateResult {
    return appendIntoIfBranchEnd(root, ifNodeId, branch, () => createIfNode())
}

export function appendCaseToIfBranchEnd(
    root: SequenceNode,
    ifNodeId: string,
    branch: 'true' | 'false',
): UpdateResult {
    return appendIntoIfBranchEnd(root, ifNodeId, branch, () => createCaseNode())
}

export function appendWhileToIfBranchEnd(
    root: SequenceNode,
    ifNodeId: string,
    branch: 'true' | 'false',
): UpdateResult {
    return appendIntoIfBranchEnd(root, ifNodeId, branch, () => createWhileNode())
}

export function appendDoWhileToIfBranchEnd(
    root: SequenceNode,
    ifNodeId: string,
    branch: 'true' | 'false',
): UpdateResult {
    return appendIntoIfBranchEnd(root, ifNodeId, branch, () => createDoWhileNode())
}

export function prependProcessToIfBranch(
    root: SequenceNode,
    ifNodeId: string,
    branch: 'true' | 'false',
): UpdateResult {
    return prependIntoIfBranch(root, ifNodeId, branch, () => createProcessNode())
}

export function prependIfToIfBranch(
    root: SequenceNode,
    ifNodeId: string,
    branch: 'true' | 'false',
): UpdateResult {
    return prependIntoIfBranch(root, ifNodeId, branch, () => createIfNode())
}

export function prependCaseToIfBranch(
    root: SequenceNode,
    ifNodeId: string,
    branch: 'true' | 'false',
): UpdateResult {
    return prependIntoIfBranch(root, ifNodeId, branch, () => createCaseNode())
}

export function prependWhileToIfBranch(
    root: SequenceNode,
    ifNodeId: string,
    branch: 'true' | 'false',
): UpdateResult {
    return prependIntoIfBranch(root, ifNodeId, branch, () => createWhileNode())
}

export function prependDoWhileToIfBranch(
    root: SequenceNode,
    ifNodeId: string,
    branch: 'true' | 'false',
): UpdateResult {
    return prependIntoIfBranch(root, ifNodeId, branch, () => createDoWhileNode())
}

export function appendProcessToCaseBranchEnd(
    root: SequenceNode,
    caseNodeId: string,
    branchIndex: number,
): UpdateResult {
    return appendIntoCaseBranchEnd(root, caseNodeId, branchIndex, () => createProcessNode())
}

export function appendIfToCaseBranchEnd(
    root: SequenceNode,
    caseNodeId: string,
    branchIndex: number,
): UpdateResult {
    return appendIntoCaseBranchEnd(root, caseNodeId, branchIndex, () => createIfNode())
}

export function appendCaseToCaseBranchEnd(
    root: SequenceNode,
    caseNodeId: string,
    branchIndex: number,
): UpdateResult {
    return appendIntoCaseBranchEnd(root, caseNodeId, branchIndex, () => createCaseNode())
}

export function appendWhileToCaseBranchEnd(
    root: SequenceNode,
    caseNodeId: string,
    branchIndex: number,
): UpdateResult {
    return appendIntoCaseBranchEnd(root, caseNodeId, branchIndex, () => createWhileNode())
}

export function appendDoWhileToCaseBranchEnd(
    root: SequenceNode,
    caseNodeId: string,
    branchIndex: number,
): UpdateResult {
    return appendIntoCaseBranchEnd(root, caseNodeId, branchIndex, () => createDoWhileNode())
}

export function prependProcessToCaseBranch(
    root: SequenceNode,
    caseNodeId: string,
    branchIndex: number,
): UpdateResult {
    return prependIntoCaseBranch(root, caseNodeId, branchIndex, () => createProcessNode())
}

export function prependIfToCaseBranch(
    root: SequenceNode,
    caseNodeId: string,
    branchIndex: number,
): UpdateResult {
    return prependIntoCaseBranch(root, caseNodeId, branchIndex, () => createIfNode())
}

export function prependCaseToCaseBranch(
    root: SequenceNode,
    caseNodeId: string,
    branchIndex: number,
): UpdateResult {
    return prependIntoCaseBranch(root, caseNodeId, branchIndex, () => createCaseNode())
}

export function prependWhileToCaseBranch(
    root: SequenceNode,
    caseNodeId: string,
    branchIndex: number,
): UpdateResult {
    return prependIntoCaseBranch(root, caseNodeId, branchIndex, () => createWhileNode())
}

export function prependDoWhileToCaseBranch(
    root: SequenceNode,
    caseNodeId: string,
    branchIndex: number,
): UpdateResult {
    return prependIntoCaseBranch(root, caseNodeId, branchIndex, () => createDoWhileNode())
}

export function prependProcessToLoopBody(root: SequenceNode, loopNodeId: string): UpdateResult {
    return prependIntoLoopBody(root, loopNodeId, () => createProcessNode())
}

export function prependIfToLoopBody(root: SequenceNode, loopNodeId: string): UpdateResult {
    return prependIntoLoopBody(root, loopNodeId, () => createIfNode())
}

export function prependCaseToLoopBody(root: SequenceNode, loopNodeId: string): UpdateResult {
    return prependIntoLoopBody(root, loopNodeId, () => createCaseNode())
}

export function prependWhileToLoopBody(root: SequenceNode, loopNodeId: string): UpdateResult {
    return prependIntoLoopBody(root, loopNodeId, () => createWhileNode())
}

export function prependDoWhileToLoopBody(root: SequenceNode, loopNodeId: string): UpdateResult {
    return prependIntoLoopBody(root, loopNodeId, () => createDoWhileNode())
}

export function insertProcessAfter(root: SequenceNode, nodeId: string): UpdateResult {
    return updateWithinSequence(root, (sequence) => {
        const index = sequence.children.findIndex((node) => node.id === nodeId)
        if (index < 0) return null

        const newNode = createProcessNode()
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

export function insertIfAfter(root: SequenceNode, nodeId: string): UpdateResult {
    return updateWithinSequence(root, (sequence) => {
        const index = sequence.children.findIndex((node) => node.id === nodeId)
        if (index < 0) return null

        const newNode = createIfNode()
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

export function insertCaseAfter(root: SequenceNode, nodeId: string): UpdateResult {
    return updateWithinSequence(root, (sequence) => {
        const index = sequence.children.findIndex((node) => node.id === nodeId)
        if (index < 0) return null

        const newNode = createCaseNode()
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

function insertLoopAfter(root: SequenceNode, nodeId: string, kind: LoopKind): UpdateResult {
    return updateWithinSequence(root, (sequence) => {
        const index = sequence.children.findIndex((node) => node.id === nodeId)
        if (index < 0) return null

        const newNode = createLoopByKind(kind)
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

export function insertWhileAfter(root: SequenceNode, nodeId: string): UpdateResult {
    return insertLoopAfter(root, nodeId, 'while')
}

export function insertDoWhileAfter(root: SequenceNode, nodeId: string): UpdateResult {
    return insertLoopAfter(root, nodeId, 'doWhile')
}

export function addCaseBranchInRoot(root: SequenceNode, caseNodeId: string): UpdateResult {
    let changed = false
    let selectedTarget: SelectionTarget | null | undefined = undefined

    const nextRoot = mapSequence(root, (node) => {
        if (node.type !== 'case') return node
        if (node.id !== caseNodeId) return node

        const baseLabels = normalizeCaseBranchLabels(node.branchLabels, node.branches.length)
        const nextBranches = [...node.branches, createSequenceNode([])]
        const nextLabels = [...baseLabels, String(nextBranches.length)]

        changed = true
        selectedTarget = {
            kind: 'casePart',
            nodeId: node.id,
            part: 'branchLabel',
            branchIndex: nextBranches.length - 1,
        }

        return {
            ...node,
            branches: nextBranches,
            branchLabels: nextLabels,
        }
    })

    return {
        root: nextRoot,
        changed,
        selectedNodeId: caseNodeId,
        selectedTarget,
    }
}

export function deleteCaseBranchInRoot(root: SequenceNode, caseNodeId: string, branchIndex: number): UpdateResult {
    let changed = false

    const nextRoot = mapSequence(root, (node) => {
        if (node.type !== 'case') return node
        if (node.id !== caseNodeId) return node

        if (node.branches.length <= 2) return node
        if (branchIndex < 0 || branchIndex >= node.branches.length) return node

        const baseLabels = normalizeCaseBranchLabels(node.branchLabels, node.branches.length)
        const nextBranches = node.branches.filter((_, i) => i !== branchIndex)
        const nextLabels = baseLabels.filter((_, i) => i !== branchIndex)

        changed = true
        return {
            ...node,
            branches: nextBranches,
            branchLabels: nextLabels,
        }
    })

    return {
        root: nextRoot,
        changed,
        selectedNodeId: caseNodeId,
        selectedTarget: changed ? { kind: 'casePart', nodeId: caseNodeId, part: 'header' } : undefined,
    }
}

export function deleteNode(
    root: SequenceNode,
    nodeId: string,
    currentSelectedNodeId: string | null,
): UpdateResult {
    return updateWithinSequence(root, (sequence) => {
        const index = sequence.children.findIndex((node) => node.id === nodeId)
        if (index < 0) return null

        const nextChildren = sequence.children.filter((node) => node.id !== nodeId)

        let nextSelectedId: string | null | undefined = currentSelectedNodeId
        if (currentSelectedNodeId === nodeId) {
            const fallback = nextChildren[index] ?? nextChildren[index - 1] ?? null
            nextSelectedId = fallback?.id ?? null
        }

        return {
            root: {
                ...sequence,
                children: nextChildren,
            },
            changed: true,
            selectedNodeId: nextSelectedId,
        }
    })
}

export function moveNodeUp(root: SequenceNode, nodeId: string): UpdateResult {
    return updateWithinSequence(root, (sequence) => {
        const index = sequence.children.findIndex((node) => node.id === nodeId)
        if (index <= 0) return null

        const nextChildren = cloneChildren(sequence)
        const current = nextChildren[index]
        nextChildren[index] = nextChildren[index - 1]
        nextChildren[index - 1] = current

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

export function moveNodeDown(root: SequenceNode, nodeId: string): UpdateResult {
    return updateWithinSequence(root, (sequence) => {
        const index = sequence.children.findIndex((node) => node.id === nodeId)
        if (index < 0 || index >= sequence.children.length - 1) return null

        const nextChildren = cloneChildren(sequence)
        const current = nextChildren[index]
        nextChildren[index] = nextChildren[index + 1]
        nextChildren[index + 1] = current

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

    return {
        root: nextRoot,
        changed,
        selectedNodeId: changed ? req.nodeId : undefined,
        selectedTarget: changed ? { kind: 'node', nodeId: req.nodeId } : undefined,
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
 * 画布拖拽移动的唯一入口：用于 state.ts -> commitHistory
 */
export function applyDragMoveInRoot(root: SequenceNode, req: DragMoveRequest): UpdateResult {
    if (req.kind === 'node') return moveNodeDrag(root, req)
    if (req.kind === 'ifResult') return moveIfResult(root, req)
    return moveCaseResult(root, req)
}

export function updateProcessTextInRoot(root: SequenceNode, nodeId: string, text: string): UpdateResult {
    let changed = false
    const nextText = normalizeText(text)

    const nextRoot = mapSequence(root, (node) => {
        if (node.type !== 'process') return node
        if (node.id !== nodeId) return node
        if (node.text === nextText) return node

        changed = true
        return { ...node, text: nextText }
    })

    return {
        root: nextRoot,
        changed,
        selectedNodeId: nodeId,
    }
}

export function updateIfConditionTextInRoot(root: SequenceNode, nodeId: string, conditionText: string): UpdateResult {
    let changed = false
    const nextText = normalizeText(conditionText)

    const nextRoot = mapSequence(root, (node) => {
        if (node.type !== 'if') return node
        if (node.id !== nodeId) return node
        if (node.conditionText === nextText) return node

        changed = true
        return {
            ...node,
            conditionText: nextText,
        }
    })

    return {
        root: nextRoot,
        changed,
        selectedNodeId: nodeId,
    }
}

export function updateCaseConditionTextInRoot(root: SequenceNode, nodeId: string, conditionText: string): UpdateResult {
    let changed = false
    const nextText = normalizeText(conditionText)

    const nextRoot = mapSequence(root, (node) => {
        if (node.type !== 'case') return node
        if (node.id !== nodeId) return node
        if (node.conditionText === nextText) return node

        changed = true
        return {
            ...node,
            conditionText: nextText,
        }
    })

    return {
        root: nextRoot,
        changed,
        selectedNodeId: nodeId,
    }
}

export function updateLoopConditionTextInRoot(root: SequenceNode, nodeId: string, conditionText: string): UpdateResult {
    let changed = false
    const nextText = normalizeText(conditionText)

    const nextRoot = mapSequence(root, (node) => {
        if (node.type !== 'loop') return node
        if (node.id !== nodeId) return node
        if (node.conditionText === nextText) return node

        changed = true
        return {
            ...node,
            conditionText: nextText,
        }
    })

    return {
        root: nextRoot,
        changed,
        selectedNodeId: nodeId,
    }
}


export function updateCaseBranchLabelInRoot(
    root: SequenceNode,
    caseNodeId: string,
    branchIndex: number,
    label: string,
): UpdateResult {
    let changed = false
    const nextLabel = normalizeText(label)
    let selectedTarget: SelectionTarget | null | undefined = undefined

    const nextRoot = mapSequence(root, (node) => {
        if (node.type !== 'case') return node
        if (node.id !== caseNodeId) return node

        const branchCount = node.branches.length
        if (branchIndex < 0 || branchIndex >= branchCount) return node

        const baseLabels = normalizeCaseBranchLabels(node.branchLabels, branchCount)
        if (baseLabels[branchIndex] === nextLabel) return node

        const nextLabels = [...baseLabels]
        nextLabels[branchIndex] = nextLabel

        changed = true
        selectedTarget = { kind: 'casePart', nodeId: caseNodeId, part: 'branchLabel', branchIndex }

        return {
            ...node,
            branchLabels: nextLabels,
        }
    })

    return {
        root: nextRoot,
        changed,
        selectedNodeId: caseNodeId,
        selectedTarget: changed ? selectedTarget : undefined,
    }
}

export function updateIfBoolLabelModeInRoot(root: SequenceNode, nodeId: string, mode: BoolLabelMode): UpdateResult {
    let changed = false

    const nextRoot = mapSequence(root, (node) => {
        if (node.type !== 'if') return node
        if (node.id !== nodeId) return node
        if (node.boolLabelMode === mode) return node

        changed = true
        return {
            ...node,
            boolLabelMode: mode,
        }
    })

    return {
        root: nextRoot,
        changed,
        selectedNodeId: nodeId,
    }
}