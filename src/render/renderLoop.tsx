// FILE: src/render/renderLoop.tsx
import type { MouseEvent as ReactMouseEvent } from 'react'
import type { CasePartKey, IfPartKey, SelectionTarget, StyleConfig } from '../app/types'
import type { LayoutBox } from '../layout/layoutTypes'
import { RenderNode } from './renderNode'
import { loopArmSize, renderInvisibleSelectableArea, renderSelectionOutline } from './renderCommon'

type RenderLoopProps = Readonly<{
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

    onInsertProcessAfter: (nodeId: string) => void
    onInsertIfAfter: (nodeId: string) => void
    onInsertCaseAfter: (nodeId: string) => void
    onInsertWhileAfter: (nodeId: string) => void
    onInsertDoWhileAfter: (nodeId: string) => void

    onMoveProcessUp: (nodeId: string) => void
    onMoveProcessDown: (nodeId: string) => void
    onDeleteProcess: (nodeId: string) => void

    onDeleteSelected?: () => void
    onAddCaseBranch?: (caseId: string) => void
}>

function buildLoopPath(kind: 'while' | 'doWhile', L: number, a: number): string {
    const l = Math.max(0, L - a)

    if (kind === 'while') {
        return `M 0 0 L ${L} 0 L ${L} ${a} L ${a} ${a} L ${a} ${L} L 0 ${L} Z`
    }

    return `M ${l} 0 L ${L} 0 L ${L} ${L} L 0 ${L} L 0 ${l} L ${l} ${l} Z`
}

export function RenderLoop(props: RenderLoopProps) {
    const {
        box,
        style,
        selectedNodeId,
        selectedTarget,
        onProcessSelect,
        onProcessDoubleClick,
        onIfHeaderSelect,
        onIfHeaderDoubleClick,
        onIfPartSelect,
        onIfLabelDoubleClick,
        onCaseHeaderSelect,
        onCaseHeaderDoubleClick,
        onCasePartSelect,
        onCaseBranchLabelDoubleClick,
        onLoopSelect,
        onLoopConditionDoubleClick,
        onLoopHoleSelect,
        onInsertProcessAfter,
        onInsertIfAfter,
        onInsertCaseAfter,
        onInsertWhileAfter,
        onInsertDoWhileAfter,
        onMoveProcessUp,
        onMoveProcessDown,
        onDeleteProcess,
        onDeleteSelected,
        onAddCaseBranch,
    } = props

    const node = box.node
    if (node.type !== 'loop') return null

    const a = loopArmSize(style)

    const L = Math.ceil(Math.min(box.width, box.height))
    const l = Math.max(0, L - a)

    const holeSelected =
        selectedTarget?.kind === 'loopPart' && selectedTarget.nodeId === node.id && selectedTarget.part === 'hole'

    const loopSelected =
        selectedTarget?.kind !== 'loopPart' && (selectedTarget?.nodeId === node.id || selectedNodeId === node.id)

    const hasBodyChildren = node.body.children.length > 0
    const showHole = !hasBodyChildren

    const isWhile = node.loopKind === 'while'
    const pathD = buildLoopPath(node.loopKind, L, a)

    const holeX = isWhile ? a : 0
    const holeY = isWhile ? a : 0

    const textAreaY = isWhile ? 0 : l

    const verticalX = isWhile ? 0 : l
    const verticalW = a

    const horizontalY = isWhile ? 0 : l
    const horizontalH = a

    function handleLoopClick(event: ReactMouseEvent<SVGGElement>) {
        event.stopPropagation()
        onLoopSelect(node.id)
    }

    function handleConditionDoubleClick(event: ReactMouseEvent<SVGGElement>) {
        event.stopPropagation()
        onLoopConditionDoubleClick(node.id)
    }

    function handleHoleClick(event: ReactMouseEvent<SVGGElement>) {
        event.stopPropagation()
        onLoopHoleSelect(node.id)
    }

    const bodyBox = box.children[0]
    const bodyBoxLocal = bodyBox
        ? ({
            ...bodyBox,
            x: 0,
            y: 0,
            width: l,
            height: l,
        } satisfies LayoutBox)
        : null

    return (
        <g transform={`translate(${box.x}, ${box.y})`}>
            <path d={pathD} fill="white" stroke="black" strokeWidth={style.lineWidth} />

            {renderSelectionOutline(loopSelected, { ...box, x: 0, y: 0 })}

            <g onClick={handleLoopClick} style={{ cursor: 'pointer' }} aria-label="选择 LOOP">
                <rect x={verticalX} y={0} width={verticalW} height={L} fill="transparent" />
                <rect x={0} y={horizontalY} width={L} height={horizontalH} fill="transparent" />
            </g>

            <g
                onClick={handleLoopClick}
                onDoubleClick={handleConditionDoubleClick}
                style={{ cursor: 'pointer' }}
                aria-label="LOOP 条件（横条）"
            >
                <rect x={0} y={textAreaY} width={L} height={a} fill="transparent" />
                <text
                    x={L / 2}
                    y={textAreaY + a / 2}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontFamily={style.fontFamily}
                    fontSize={style.fontSize}
                    fill="black"
                    pointerEvents="none"
                >
                    {node.conditionText || '条件'}
                </text>
            </g>

            {showHole ? (
                renderInvisibleSelectableArea({
                    x: holeX,
                    y: holeY,
                    w: l,
                    h: l,
                    selected: holeSelected,
                    onClick: handleHoleClick,
                })
            ) : null}

            {!showHole && bodyBoxLocal ? (
                <g transform={`translate(${holeX}, ${holeY})`}>
                    <RenderNode
                        box={bodyBoxLocal}
                        style={style}
                        selectedNodeId={selectedNodeId}
                        selectedTarget={selectedTarget}
                        onProcessSelect={onProcessSelect}
                        onProcessDoubleClick={onProcessDoubleClick}
                        onIfHeaderSelect={onIfHeaderSelect}
                        onIfHeaderDoubleClick={onIfHeaderDoubleClick}
                        onIfPartSelect={onIfPartSelect}
                        onIfLabelDoubleClick={onIfLabelDoubleClick}
                        onCaseHeaderSelect={onCaseHeaderSelect}
                        onCaseHeaderDoubleClick={onCaseHeaderDoubleClick}
                        onCasePartSelect={onCasePartSelect}
                        onCaseBranchLabelDoubleClick={onCaseBranchLabelDoubleClick}
                        onLoopSelect={onLoopSelect}
                        onLoopConditionDoubleClick={onLoopConditionDoubleClick}
                        onLoopHoleSelect={onLoopHoleSelect}
                        onInsertProcessAfter={onInsertProcessAfter}
                        onInsertIfAfter={onInsertIfAfter}
                        onInsertCaseAfter={onInsertCaseAfter}
                        onInsertWhileAfter={onInsertWhileAfter}
                        onInsertDoWhileAfter={onInsertDoWhileAfter}
                        onMoveProcessUp={onMoveProcessUp}
                        onMoveProcessDown={onMoveProcessDown}
                        onDeleteProcess={onDeleteProcess}
                        onDeleteSelected={onDeleteSelected}
                        onAddCaseBranch={onAddCaseBranch}
                    />
                </g>
            ) : null}
        </g>
    )
}