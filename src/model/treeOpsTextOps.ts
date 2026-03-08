import type { BoolLabelMode, SelectionTarget, SequenceNode } from '../app/types'
import { mapSequence, normalizeCaseBranchLabels, type UpdateResult } from './treeOpsStructure'

function normalizeText(text: string): string {
    return text.trim().length > 0 ? text : ' '
}

/**
 * 更新 process 节点文本；空白文本会被规范化为占位空格。
 */
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

/**
 * 更新 if 条件文本。
 */
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

/**
 * 更新 case 条件文本。
 */
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

/**
 * 更新 loop 条件文本。
 */
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

/**
 * 更新 CASE 分支标签，并回传分支标签选中态。
 */
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

/**
 * 更新 IF 的布尔标签模式（TF/YN）。
 */
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