// FILE: src/app/types.ts
export type BoolLabelMode = 'TF' | 'YN'

export interface SequenceNode {
    id: string
    type: 'sequence'
    children: NsdNode[]
}

export interface ProcessNode {
    id: string
    type: 'process'
    text: string
}

export interface IfNode {
    id: string
    type: 'if'
    conditionText: string
    boolLabelMode: BoolLabelMode
    trueBranch: SequenceNode
    falseBranch: SequenceNode
}

export interface CaseNode {
    id: string
    type: 'case'
    conditionText: string
    branches: SequenceNode[]
    branchLabels: string[]
}

export type LoopKind = 'while' | 'doWhile'

export interface LoopNode {
    id: string
    type: 'loop'
    loopKind: LoopKind
    conditionText: string
    body: SequenceNode
}

export type NsdNode = SequenceNode | ProcessNode | IfNode | CaseNode | LoopNode

export interface StyleConfig {
    fontFamily: string
    fontSize: number
    lineWidth: number
    paddingProcessY: number
    paddingProcessX: number
    paddingHeader: number
    paddingBranchLabel: number
    loopSidebarWidth: number
    minBlockWidth: number
}

export type IfPartKey = 'header' | 'trueLabel' | 'falseLabel' | 'trueContainer' | 'falseContainer'

export type CasePartKey = 'header' | 'branchLabel' | 'branchContainer'

export type LoopPartKey = 'hole'

export type SelectionTarget =
    | {
    kind: 'node'
    nodeId: string
}
    | {
    kind: 'ifPart'
    nodeId: string
    part: IfPartKey
}
    | {
    kind: 'casePart'
    nodeId: string
    part: 'header'
}
    | {
    kind: 'casePart'
    nodeId: string
    part: 'branchLabel' | 'branchContainer'
    branchIndex: number
}
    | {
    kind: 'loopPart'
    nodeId: string
    part: LoopPartKey
}

export interface AppState {
    style: StyleConfig
    root: SequenceNode
    scale: number
    selectedNodeId: string | null
    selectedTarget: SelectionTarget | null
}

export type DragContainerKey =
    | { kind: 'root' }
    | { kind: 'ifBranch'; nodeId: string; branch: 'true' | 'false' }
    | { kind: 'caseBranch'; nodeId: string; branchIndex: number }
    | { kind: 'loopBody'; nodeId: string }

export type DragMoveRequest =
    | Readonly<{
    kind: 'node'
    nodeId: string
    from: DragContainerKey
    to: DragContainerKey
    toIndex: number
}>
    | Readonly<{
    kind: 'ifResult'
    nodeId: string
    fromBranch: 'true' | 'false'
    toBranch: 'true' | 'false'
}>
    | Readonly<{
    kind: 'caseResult'
    nodeId: string
    fromBranchIndex: number
    toIndex: number
}>