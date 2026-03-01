import type { CaseNode, IfNode, LoopKind, LoopNode, ProcessNode, SequenceNode } from '../app/types'
import { nextId } from '../utils/id'

export function createSequenceNode(children: SequenceNode['children'] = []): SequenceNode {
    return {
        id: nextId('seq'),
        type: 'sequence',
        children,
    }
}

export function createProcessNode(text = '新步骤'): ProcessNode {
    return {
        id: nextId('p'),
        type: 'process',
        text,
    }
}

export function createIfNode(conditionText = '条件'): IfNode {
    return {
        id: nextId('if'),
        type: 'if',
        conditionText,
        boolLabelMode: 'TF',
        trueBranch: createSequenceNode([]),
        falseBranch: createSequenceNode([]),
    }
}

export function createCaseNode(conditionText = '条件', branchCount = 3): CaseNode {
    const count = Math.max(2, Math.floor(branchCount))
    const branches = Array.from({ length: count }, () => createSequenceNode([]))
    const branchLabels = Array.from({ length: count }, (_, i) => String(i + 1))

    return {
        id: nextId('case'),
        type: 'case',
        conditionText,
        branches,
        branchLabels,
    }
}

export function createLoopNode(loopKind: LoopKind, conditionText = '条件'): LoopNode {
    return {
        id: nextId('loop'),
        type: 'loop',
        loopKind,
        conditionText,
        body: createSequenceNode([]),
    }
}

export function createWhileNode(conditionText = '条件'): LoopNode {
    return createLoopNode('while', conditionText)
}

export function createDoWhileNode(conditionText = '条件'): LoopNode {
    return createLoopNode('doWhile', conditionText)
}