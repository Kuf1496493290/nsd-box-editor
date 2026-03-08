import type { MouseEvent as ReactMouseEvent } from 'react'
import type { CasePartKey, IfPartKey, SelectionTarget, StyleConfig } from '../app/types'
import type { LayoutBox } from '../layout/layoutTypes'
import { RenderNode } from './renderNode'
import { loopArmSize, renderSelectablePlaceholder } from './renderCommon'

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

    onInsertProcessAtSelection: (nodeId: string) => void
    onInsertIfAtSelection: (nodeId: string) => void
    onInsertCaseAtSelection: (nodeId: string) => void
    onInsertWhileAtSelection: (nodeId: string) => void
    onInsertDoWhileAtSelection: (nodeId: string) => void

    onDeleteSelected?: () => void
    onAddCaseBranch?: (caseId: string) => void
}>

function buildLoopPath(kind: 'while' | 'doWhile', W: number, H: number, a: number): string {
    const wHole = Math.max(0, W - a)
    const hHole = Math.max(0, H - a)

    if (kind === 'while') {
        return `M 0 0 L ${W} 0 L ${W} ${a} L ${a} ${a} L ${a} ${H} L 0 ${H} Z`
    }

    return `M ${wHole} 0 L ${W} 0 L ${W} ${H} L 0 ${H} L 0 ${hHole} L ${wHole} ${hHole} Z`
}

/**
 * 渲染 LOOP 节点，包含外框路径、条件条与内孔内容区域。
 */
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
        onInsertProcessAtSelection,
        onInsertIfAtSelection,
        onInsertCaseAtSelection,
        onInsertWhileAtSelection,
        onInsertDoWhileAtSelection,
        onDeleteSelected,
        onAddCaseBranch,
    } = props

    const node = box.node
    if (node.type !== 'loop') return null

    const a = loopArmSize(style)

    const W = Math.max(0, Math.ceil(box.width))
    const H = Math.max(0, Math.ceil(box.height))

    const holeW = Math.max(0, W - a)
    const holeH = Math.max(0, H - a)

    const isWhile = node.loopKind === 'while'
    const holeX = isWhile ? a : 0
    const holeY = isWhile ? a : 0

    const holeSelected =
        selectedTarget?.kind === 'loopPart' && selectedTarget.nodeId === node.id && selectedTarget.part === 'hole'

    const hasBodyChildren = node.body.children.length > 0
    const showHole = !hasBodyChildren

    const pathD = buildLoopPath(node.loopKind, W, H, a)

    const textAreaY = isWhile ? 0 : Math.max(0, H - a)

    const verticalX = isWhile ? 0 : Math.max(0, W - a)
    const verticalW = a

    const horizontalY = isWhile ? 0 : Math.max(0, H - a)
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

    const bodyBox = box.children[0] ?? null

    return (
        <g transform={`translate(${box.x}, ${box.y})`}>
            <path d={pathD} fill="white" stroke="black" strokeWidth={style.lineWidth} />

            <g onClick={handleLoopClick} style={{ cursor: 'pointer' }} aria-label="选择 LOOP">
                <rect x={verticalX} y={0} width={verticalW} height={H} fill="transparent" />
                <rect x={0} y={horizontalY} width={W} height={horizontalH} fill="transparent" />
            </g>

            <g
                onClick={handleLoopClick}
                onDoubleClick={handleConditionDoubleClick}
                style={{ cursor: 'pointer' }}
                aria-label="LOOP 条件（横条）"
            >
                <rect x={0} y={textAreaY} width={W} height={a} fill="transparent" />
                <text
                    x={W / 2}
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

            {showHole
                ? renderSelectablePlaceholder({
                    x: holeX,
                    y: holeY,
                    w: holeW,
                    h: holeH,
                    selected: holeSelected,
                    noDrag: true,
                    onClick: handleHoleClick,
                })
                : null}

            {!showHole && bodyBox ? (
                <RenderNode
                    box={bodyBox}
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
                    onInsertProcessAtSelection={onInsertProcessAtSelection}
                    onInsertIfAtSelection={onInsertIfAtSelection}
                    onInsertCaseAtSelection={onInsertCaseAtSelection}
                    onInsertWhileAtSelection={onInsertWhileAtSelection}
                    onInsertDoWhileAtSelection={onInsertDoWhileAtSelection}
                    onDeleteSelected={onDeleteSelected}
                    onAddCaseBranch={onAddCaseBranch}
                />
            ) : null}
        </g>
    )
}