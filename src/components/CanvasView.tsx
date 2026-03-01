import { useMemo } from 'react'
import type { RefObject } from 'react'
import type { AppState, CasePartKey, IfPartKey } from '../app/types'
import { layoutRoot } from '../layout/layoutEngine'
import { RenderNode } from '../render/renderNode'

type CanvasViewProps = Readonly<{
    state: AppState
    svgRef: RefObject<SVGSVGElement | null>

    onProcessSelect: (nodeId: string) => void
    onProcessDoubleClick: (nodeId: string) => void

    onIfHeaderSelect: (nodeId: string) => void
    onIfHeaderDoubleClick: (nodeId: string) => void
    onIfPartSelect: (nodeId: string, part: IfPartKey) => void

    onCaseHeaderSelect: (nodeId: string) => void
    onCaseHeaderDoubleClick: (nodeId: string) => void
    onCasePartSelect: (nodeId: string, part: CasePartKey, branchIndex?: number) => void
    onCaseBranchLabelDoubleClick: (nodeId: string, branchIndex: number) => void

    onLoopSelect: (nodeId: string) => void
    onLoopHoleSelect: (nodeId: string) => void

    onCanvasBlankClick: () => void

    onInsertProcessAfter: (nodeId: string) => void
    onInsertIfAfter: (nodeId: string) => void
    onInsertCaseAfter: (nodeId: string) => void
    onInsertWhileAfter: (nodeId: string) => void
    onInsertDoWhileAfter: (nodeId: string) => void

    onMoveProcessUp: (nodeId: string) => void
    onMoveProcessDown: (nodeId: string) => void
    onDeleteProcess: (nodeId: string) => void
}>

export function CanvasView(props: CanvasViewProps) {
    const {
        state,
        svgRef,
        onProcessSelect,
        onProcessDoubleClick,
        onIfHeaderSelect,
        onIfHeaderDoubleClick,
        onIfPartSelect,
        onCaseHeaderSelect,
        onCaseHeaderDoubleClick,
        onCasePartSelect,
        onCaseBranchLabelDoubleClick,
        onLoopSelect,
        onLoopHoleSelect,
        onCanvasBlankClick,
        onInsertProcessAfter,
        onInsertIfAfter,
        onInsertCaseAfter,
        onInsertWhileAfter,
        onInsertDoWhileAfter,
        onMoveProcessUp,
        onMoveProcessDown,
        onDeleteProcess,
    } = props

    const rootBox = useMemo(() => layoutRoot(state.root, state.style), [state.root, state.style])

    const leftPad = 20
    const topPad = 20
    const rightPad = 140
    const bottomPad = 40

    const w = rootBox.width + leftPad + rightPad
    const h = rootBox.height + topPad + bottomPad

    return (
        <svg ref={svgRef} className="canvas" width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
            <rect x={0} y={0} width={w} height={h} fill="transparent" onClick={onCanvasBlankClick} />

            <g transform={`translate(${leftPad}, ${topPad})`}>
                <RenderNode
                    box={rootBox}
                    style={state.style}
                    selectedNodeId={state.selectedNodeId}
                    selectedTarget={state.selectedTarget}
                    onProcessSelect={onProcessSelect}
                    onProcessDoubleClick={onProcessDoubleClick}
                    onIfHeaderSelect={onIfHeaderSelect}
                    onIfHeaderDoubleClick={onIfHeaderDoubleClick}
                    onIfPartSelect={onIfPartSelect}
                    onCaseHeaderSelect={onCaseHeaderSelect}
                    onCaseHeaderDoubleClick={onCaseHeaderDoubleClick}
                    onCasePartSelect={onCasePartSelect}
                    onCaseBranchLabelDoubleClick={onCaseBranchLabelDoubleClick}
                    onLoopSelect={onLoopSelect}
                    onLoopHoleSelect={onLoopHoleSelect}
                    onInsertProcessAfter={onInsertProcessAfter}
                    onInsertIfAfter={onInsertIfAfter}
                    onInsertCaseAfter={onInsertCaseAfter}
                    onInsertWhileAfter={onInsertWhileAfter}
                    onInsertDoWhileAfter={onInsertDoWhileAfter}
                    onMoveProcessUp={onMoveProcessUp}
                    onMoveProcessDown={onMoveProcessDown}
                    onDeleteProcess={onDeleteProcess}
                />
            </g>
        </svg>
    )
}