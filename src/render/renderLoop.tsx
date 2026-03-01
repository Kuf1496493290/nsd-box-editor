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

    onCaseHeaderSelect: (nodeId: string) => void
    onCaseHeaderDoubleClick: (nodeId: string) => void
    onCasePartSelect: (nodeId: string, part: CasePartKey, branchIndex?: number) => void
    onCaseBranchLabelDoubleClick: (nodeId: string, branchIndex: number) => void

    onLoopSelect: (nodeId: string) => void
    onLoopHoleSelect: (nodeId: string) => void

    onInsertProcessAfter: (nodeId: string) => void
    onInsertIfAfter: (nodeId: string) => void
    onInsertCaseAfter: (nodeId: string) => void
    onInsertWhileAfter: (nodeId: string) => void
    onInsertDoWhileAfter: (nodeId: string) => void

    onMoveProcessUp: (nodeId: string) => void
    onMoveProcessDown: (nodeId: string) => void
    onDeleteProcess: (nodeId: string) => void
}>

function buildLoopPath(kind: 'while' | 'doWhile', L: number, a: number): string {
    const l = Math.max(0, L - a)

    /**
     * 按你给的“六条边连线坐标”实现：
     *
     * DO-WHILE（右下 L）：
     * (0,0),(L,0),(L,L),(l,L),(l,a),(0,a) 其中 a+l=L
     *
     * WHILE（左上 L）：
     * (0,0),(a,0),(a,l),(L,l),(L,L),(0,L)
     */
    if (kind === 'doWhile') {
        return `M 0 0 L ${L} 0 L ${L} ${L} L ${l} ${L} L ${l} ${a} L 0 ${a} Z`
    }

    return `M 0 0 L ${a} 0 L ${a} ${l} L ${L} ${l} L ${L} ${L} L 0 ${L} Z`
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
        onCaseHeaderSelect,
        onCaseHeaderDoubleClick,
        onCasePartSelect,
        onCaseBranchLabelDoubleClick,
        onLoopSelect,
        onLoopHoleSelect,
        onInsertProcessAfter,
        onInsertIfAfter,
        onInsertCaseAfter,
        onInsertWhileAfter,
        onInsertDoWhileAfter,
        onMoveProcessUp,
        onMoveProcessDown,
        onDeleteProcess,
    } = props

    const node = box.node
    if (node.type !== 'loop') return null

    const a = loopArmSize(style)

    /**
     * layoutEngine 已保证 loop 的 LayoutBox width=height=side（轴对称）。
     * 这里直接使用 height 作为 L。
     */
    const L = Math.ceil(box.height)
    const l = Math.max(0, L - a)

    const holeSelected =
        selectedTarget?.kind === 'loopPart' && selectedTarget.nodeId === node.id && selectedTarget.part === 'hole'

    const loopSelected =
        selectedTarget?.kind !== 'loopPart' && (selectedTarget?.nodeId === node.id || selectedNodeId === node.id)

    const hasBodyChildren = node.body.children.length > 0
    const showHole = !hasBodyChildren

    const isWhile = node.loopKind === 'while'
    const pathD = buildLoopPath(node.loopKind, L, a)

    /**
     * hole 坐标（按坐标定义推导）：
     * - DO-WHILE：hole 在 (0,a) 尺寸 l*l
     * - WHILE：hole 在 (a,0) 尺寸 l*l
     */
    const holeX = isWhile ? a : 0
    const holeY = isWhile ? 0 : a

    /**
     * 条件文本仅在“横臂”显示：
     * - DO-WHILE：横臂在顶部（y=0）
     * - WHILE：横臂在底部（y=l）
     */
    const textAreaY = isWhile ? l : 0

    /**
     * 点击命中区域（L 本体 = 同级操作）：
     * - DO-WHILE：横臂=顶部条，竖臂=右侧条
     * - WHILE：横臂=底部条，竖臂=左侧条
     */
    const verticalX = isWhile ? 0 : l
    const verticalW = a

    const horizontalY = isWhile ? l : 0
    const horizontalH = a

    function handleLoopClick(event: ReactMouseEvent<SVGGElement>) {
        event.stopPropagation()
        onLoopSelect(node.id)
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

            <g onClick={handleLoopClick} style={{ cursor: 'text' }} aria-label="LOOP 条件（横条）">
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
            ) : null}
        </g>
    )
}