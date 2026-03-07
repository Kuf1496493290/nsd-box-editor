// FILE: src/model/treeOps.ts
import type { LoopKind, SelectionTarget, SequenceNode } from '../app/types'
import {
    createCaseNode,
    createDoWhileNode,
    createIfNode,
    createProcessNode,
    createSequenceNode,
    createWhileNode,
} from './factory'
import {
    appendIntoCaseBranchEnd,
    appendIntoIfBranchEnd,
    clampIndex,
    insertNodeAfter,
    mapSequence,
    moveNodeByOffset,
    normalizeCaseBranchLabels,
    prependIntoCaseBranch,
    prependIntoIfBranch,
    prependIntoLoopBody,
    updateWithinSequence,
    type UpdateResult,
} from './treeOpsStructure'

function createLoopByKind(kind: LoopKind) {
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
    return insertNodeAfter(root, nodeId, () => createProcessNode())
}

export function insertIfAfter(root: SequenceNode, nodeId: string): UpdateResult {
    return insertNodeAfter(root, nodeId, () => createIfNode())
}

export function insertCaseAfter(root: SequenceNode, nodeId: string): UpdateResult {
    return insertNodeAfter(root, nodeId, () => createCaseNode())
}

function insertLoopAfter(root: SequenceNode, nodeId: string, kind: LoopKind): UpdateResult {
    return insertNodeAfter(root, nodeId, () => createLoopByKind(kind))
}

export function insertWhileAfter(root: SequenceNode, nodeId: string): UpdateResult {
    return insertLoopAfter(root, nodeId, 'while')
}

export function insertDoWhileAfter(root: SequenceNode, nodeId: string): UpdateResult {
    return insertLoopAfter(root, nodeId, 'doWhile')
}

export function addCaseBranchInRoot(
    root: SequenceNode,
    caseNodeId: string,
    insertAfterBranchIndex?: number,
): UpdateResult {
    let changed = false
    let selectedTarget: SelectionTarget | null | undefined = undefined

    const nextRoot = mapSequence(root, (node) => {
        if (node.type !== 'case') return node
        if (node.id !== caseNodeId) return node

        const baseLabels = normalizeCaseBranchLabels(node.branchLabels, node.branches.length)
        const insertAt =
            insertAfterBranchIndex === undefined
                ? node.branches.length
                : clampIndex(insertAfterBranchIndex + 1, node.branches.length)

        const nextBranches = [...node.branches]
        nextBranches.splice(insertAt, 0, createSequenceNode([]))

        const nextLabels = [...baseLabels]
        nextLabels.splice(insertAt, 0, String(node.branches.length + 1))

        changed = true
        selectedTarget = {
            kind: 'casePart',
            nodeId: node.id,
            part: 'branchLabel',
            branchIndex: insertAt,
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
        selectedNodeId: changed ? null : undefined,
        selectedTarget: changed ? null : undefined,
    }
}

export function deleteNode(root: SequenceNode, nodeId: string): UpdateResult {
    return updateWithinSequence(root, (sequence) => {
        const index = sequence.children.findIndex((node) => node.id === nodeId)
        if (index < 0) return null

        const nextChildren = sequence.children.filter((node) => node.id !== nodeId)

        return {
            root: {
                ...sequence,
                children: nextChildren,
            },
            changed: true,
            selectedNodeId: null,
            selectedTarget: null,
        }
    })
}

export function moveNodeUp(root: SequenceNode, nodeId: string): UpdateResult {
    return moveNodeByOffset(root, nodeId, -1)
}

export function moveNodeDown(root: SequenceNode, nodeId: string): UpdateResult {
    return moveNodeByOffset(root, nodeId, 1)
}

export { applyDragMoveInRoot } from './treeOpsMove'

export {
    updateProcessTextInRoot,
    updateIfConditionTextInRoot,
    updateCaseConditionTextInRoot,
    updateLoopConditionTextInRoot,
    updateCaseBranchLabelInRoot,
    updateIfBoolLabelModeInRoot,
} from './treeOpsTextOps'