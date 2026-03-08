import type { CaseNode, IfNode, LoopKind, LoopNode, ProcessNode, SequenceNode } from '../app/types'
import { nextId } from '../utils/id'

/**
 * 创建 sequence 节点，默认无子节点。
 */
export function createSequenceNode(children: SequenceNode['children'] = []): SequenceNode {
    return {
        id: nextId('seq'),
        type: 'sequence',
        children,
    }
}

/**
 * 创建 process 节点。
 */
export function createProcessNode(text = '新步骤'): ProcessNode {
    return {
        id: nextId('p'),
        type: 'process',
        text,
    }
}

/**
 * 创建 if 节点，并初始化 true/false 两个空分支。
 */
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

/**
 * 创建 case 节点，分支数最少为 2。
 */
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

/**
 * 创建 loop 节点，并初始化空 body。
 */
export function createLoopNode(loopKind: LoopKind, conditionText = '条件'): LoopNode {
    return {
        id: nextId('loop'),
        type: 'loop',
        loopKind,
        conditionText,
        body: createSequenceNode([]),
    }
}

/**
 * 创建 while 节点。
 */
export function createWhileNode(conditionText = '条件'): LoopNode {
    return createLoopNode('while', conditionText)
}

/**
 * 创建 do-while 节点。
 */
export function createDoWhileNode(conditionText = '条件'): LoopNode {
    return createLoopNode('doWhile', conditionText)
}