import type { NsdNode, SelectionTarget } from './types'
export { findNodeById } from './stateCommon'

export type EditingKind = 'process' | 'ifCondition' | 'caseCondition' | 'loopCondition' | 'caseBranchLabel'

export type EnterEditRequest =
    | Readonly<{ kind: 'caseBranchLabel'; nodeId: string; branchIndex: number; text: string }>
    | Readonly<{ kind: Exclude<EditingKind, 'caseBranchLabel'>; nodeId: string; text: string }>

export type InsertOps = Readonly<{
    insertAfter: (nodeId: string) => void
    prependToIfBranch: (ifNodeId: string, branch: 'true' | 'false') => void
    appendToIfBranchEnd: (ifNodeId: string, branch: 'true' | 'false') => void
    prependToCaseBranch: (caseNodeId: string, branchIndex: number) => void
    appendToCaseBranchEnd: (caseNodeId: string, branchIndex: number) => void
    prependToLoopBody: (loopNodeId: string) => void
}>

export type ToolbarInsertOps = Readonly<InsertOps & {
    addAtEnd: () => void
}>


function isCaseBranchLabelTarget(
    target: SelectionTarget,
): target is Readonly<{ kind: 'casePart'; nodeId: string; part: 'branchLabel'; branchIndex: number }> {
    return target.kind === 'casePart' && target.part === 'branchLabel'
}

function isIfConditionTarget(target: SelectionTarget): boolean {
    return target.kind === 'node' || (target.kind === 'ifPart' && target.part === 'header')
}

function isCaseConditionTarget(target: SelectionTarget): boolean {
    return target.kind === 'node' || (target.kind === 'casePart' && target.part === 'header')
}

export function resolveCaseBranchAddRequest(
    target: SelectionTarget | null,
): Readonly<{ nodeId: string; insertAfterBranchIndex?: number }> | null {
    if (target?.kind !== 'casePart') return null

    if (target.part === 'header') {
        return { nodeId: target.nodeId }
    }

    if (target.part === 'branchLabel') {
        return {
            nodeId: target.nodeId,
            insertAfterBranchIndex: target.branchIndex,
        }
    }

    return null
}

export function pickEnterEditRequest(node: NsdNode, target: SelectionTarget): EnterEditRequest | null {
    if (isCaseBranchLabelTarget(target)) {
        if (node.type !== 'case') return null

        const labels =
            node.branchLabels.length === node.branches.length
                ? node.branchLabels
                : node.branches.map((_, i) => node.branchLabels[i] ?? String(i + 1))

        const text = labels[target.branchIndex] ?? String(target.branchIndex + 1)
        return { kind: 'caseBranchLabel', nodeId: node.id, branchIndex: target.branchIndex, text }
    }

    switch (node.type) {
        case 'process':
            return target.kind === 'node' ? { kind: 'process', nodeId: node.id, text: node.text } : null
        case 'if':
            return isIfConditionTarget(target) ? { kind: 'ifCondition', nodeId: node.id, text: node.conditionText } : null
        case 'case':
            return isCaseConditionTarget(target) ? { kind: 'caseCondition', nodeId: node.id, text: node.conditionText } : null
        case 'loop':
            return target.kind === 'node' ? { kind: 'loopCondition', nodeId: node.id, text: node.conditionText } : null
        default:
            return null
    }
}

export function insertByTarget(anchorNodeId: string, target: SelectionTarget | null, ops: InsertOps) {
    if (target?.nodeId !== anchorNodeId) {
        ops.insertAfter(anchorNodeId)
        return
    }

    if (target.kind === 'loopPart') {
        ops.prependToLoopBody(anchorNodeId)
        return
    }

    if (target.kind === 'node') {
        ops.insertAfter(anchorNodeId)
        return
    }

    if (target.kind === 'ifPart') {
        if (target.part === 'trueLabel') {
            ops.prependToIfBranch(anchorNodeId, 'true')
            return
        }

        if (target.part === 'falseLabel') {
            ops.prependToIfBranch(anchorNodeId, 'false')
            return
        }

        if (target.part === 'trueContainer') {
            ops.appendToIfBranchEnd(anchorNodeId, 'true')
            return
        }

        if (target.part === 'falseContainer') {
            ops.appendToIfBranchEnd(anchorNodeId, 'false')
            return
        }

        ops.insertAfter(anchorNodeId)
        return
    }

    if (target.part === 'header') {
        ops.insertAfter(anchorNodeId)
        return
    }

    if (target.part === 'branchLabel') {
        ops.prependToCaseBranch(anchorNodeId, target.branchIndex)
        return
    }

    ops.appendToCaseBranchEnd(anchorNodeId, target.branchIndex)
}

export function insertFromToolbarTarget(target: SelectionTarget | null, ops: ToolbarInsertOps) {
    if (!target) {
        ops.addAtEnd()
        return
    }

    if (target.kind === 'loopPart') {
        ops.prependToLoopBody(target.nodeId)
        return
    }

    if (target.kind === 'node') {
        ops.insertAfter(target.nodeId)
        return
    }

    if (target.kind === 'ifPart') {
        if (target.part === 'trueLabel') {
            ops.prependToIfBranch(target.nodeId, 'true')
            return
        }

        if (target.part === 'falseLabel') {
            ops.prependToIfBranch(target.nodeId, 'false')
            return
        }

        if (target.part === 'trueContainer') {
            ops.appendToIfBranchEnd(target.nodeId, 'true')
            return
        }

        if (target.part === 'falseContainer') {
            ops.appendToIfBranchEnd(target.nodeId, 'false')
            return
        }

        ops.insertAfter(target.nodeId)
        return
    }

    if (target.part === 'branchLabel') {
        ops.prependToCaseBranch(target.nodeId, target.branchIndex)
        return
    }

    if (target.part === 'branchContainer') {
        ops.appendToCaseBranchEnd(target.nodeId, target.branchIndex)
        return
    }

    ops.insertAfter(target.nodeId)
}