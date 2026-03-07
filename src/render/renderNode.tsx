// FILE: src/render/renderNode.tsx
import type { CasePartKey, IfPartKey, SelectionTarget, StyleConfig } from '../app/types'
import type { LayoutBox } from '../layout/layoutTypes'
import { RenderProcess } from './renderProcess'
import { RenderIf } from './renderIf'
import { RenderCase } from './renderCase'
import { RenderLoop } from './renderLoop'

type RenderNodeProps = Readonly<{
    box: LayoutBox
    style: StyleConfig
    selectedNodeId: string | null
    selectedTarget: SelectionTarget | null

    onProcessSelect: (nodeId: string) => void
    onProcessDoubleClick: (nodeId: string) => void

    onIfHeaderSelect: (nodeId: string) => void
    onIfHeaderDoubleClick: (nodeId: string) => void
    onIfPartSelect: (nodeId: string, part: IfPartKey) => void
    onIfLabelDoubleClick: (nodeId: string, part: 'trueLabel' | 'falseLabel') => void

    onCaseHeaderSelect: (nodeId: string) => void
    onCaseHeaderDoubleClick: (nodeId: string) => void
    onCasePartSelect: (nodeId: string, part: CasePartKey, branchIndex?: number) => void
    onCaseBranchLabelDoubleClick: (nodeId: string, branchIndex: number) => void

    onLoopSelect: (nodeId: string) => void
    onLoopConditionDoubleClick: (nodeId: string) => void
    onLoopHoleSelect: (nodeId: string) => void

    onInsertProcessAtSelection: (nodeId: string) => void
    onInsertIfAtSelection: (nodeId: string) => void
    onInsertCaseAtSelection: (nodeId: string) => void
    onInsertWhileAtSelection: (nodeId: string) => void
    onInsertDoWhileAtSelection: (nodeId: string) => void

    onDeleteSelected?: () => void
    onAddCaseBranch?: (caseId: string) => void
}>

function RenderSequenceNode(props: RenderNodeProps) {
    const { box } = props

    return (
        <g transform={`translate(${box.x}, ${box.y})`}>
            {box.children.map((c) => (
                <g key={c.id} data-drag-node-id={c.node.id}>
                    <RenderNode {...props} box={c} />
                </g>
            ))}
        </g>
    )
}

export function RenderNode(props: RenderNodeProps) {
    const { box, style, selectedNodeId, selectedTarget } = props
    const n = box.node

    if (n.type === 'process') {
        return (
            <RenderProcess
                box={box}
                style={style}
                selected={selectedTarget?.kind === 'node' ? selectedTarget.nodeId === n.id : selectedNodeId === n.id}
                onSelect={() => props.onProcessSelect(n.id)}
                onDoubleClick={() => props.onProcessDoubleClick(n.id)}
            />
        )
    }

    if (n.type === 'if') {
        return <RenderIf {...props} />
    }

    if (n.type === 'case') {
        return <RenderCase {...props} />
    }

    if (n.type === 'loop') {
        return <RenderLoop {...props} />
    }

    if (n.type === 'sequence') {
        return <RenderSequenceNode {...props} />
    }

    return null
}