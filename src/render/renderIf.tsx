// FILE: src/render/renderIf.tsx
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react'
import type { CasePartKey, IfNode, IfPartKey, SelectionTarget, StyleConfig } from '../app/types'
import type { LayoutBox } from '../layout/layoutTypes'
import { RenderNode } from './renderNode'
import {
    baseBlockHeight,
    dashedPolygonOutline,
    polygonPath,
    renderSelectablePlaceholder,
    renderSelectionOutline,
} from './renderCommon'

type RenderIfProps = Readonly<{
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

function getIfLabels(node: IfNode): { trueLabel: string; falseLabel: string } {
    if (node.boolLabelMode === 'YN') return { trueLabel: 'Y', falseLabel: 'N' }
    return { trueLabel: 'T', falseLabel: 'F' }
}

function getSelectedIfPart(selectedTarget: SelectionTarget | null, ifNodeId: string): IfPartKey | null {
    if (selectedTarget?.kind !== 'ifPart') return null
    if (selectedTarget.nodeId !== ifNodeId) return null
    return selectedTarget.part
}

function renderBranchContent(params: Readonly<{
    box: LayoutBox
    bodyTopY: number
    trueBranchBox: LayoutBox | null
    falseBranchBox: LayoutBox | null
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
}>): ReactNode {
    const {
        box,
        bodyTopY,
        trueBranchBox,
        falseBranchBox,
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
    } = params

    const bodyH = Math.max(0, box.height - (bodyTopY - box.y))
    if (bodyH <= 0) return null

    return (
        <g transform={`translate(${box.x}, ${bodyTopY})`}>
            {trueBranchBox ? (
                <RenderNode
                    box={trueBranchBox}
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
            ) : null}

            {falseBranchBox ? (
                <RenderNode
                    box={falseBranchBox}
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
            ) : null}
        </g>
    )
}

export function RenderIf(props: RenderIfProps) {
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
    if (node.type !== 'if') return null

    const ifNode = node
    const isSelected = selectedNodeId === ifNode.id || selectedTarget?.nodeId === ifNode.id
    const selectedIfPart = getSelectedIfPart(selectedTarget, ifNode.id)

    const y = baseBlockHeight(style)
    const headerH = y

    const colW = box.width / 2

    const x0 = box.x
    const y0 = box.y
    const w = box.width

    const diagLeftTop: readonly [number, number] = [x0, y0]
    const diagRightTop: readonly [number, number] = [x0 + w, y0]
    const bottomCenter: readonly [number, number] = [x0 + w / 2, y0 + y]

    const headerTriangle = [diagLeftTop, diagRightTop, bottomCenter] as const
    const trueTriangle = [diagLeftTop, bottomCenter, [x0, y0 + y] as const] as const
    const falseTriangle = [diagRightTop, [x0 + w, y0 + y] as const, bottomCenter] as const

    const { trueLabel, falseLabel } = getIfLabels(ifNode)

    const bodyTopY = y0 + headerH
    const bodyH = Math.max(0, box.height - headerH)

    const trueChildCount = ifNode.trueBranch.children.length
    const falseChildCount = ifNode.falseBranch.children.length

    const showTruePlaceholder = bodyH > 0 && trueChildCount === 0
    const showFalsePlaceholder = bodyH > 0 && falseChildCount === 0

    function handleHeaderClick(event: ReactMouseEvent<SVGGElement>) {
        event.stopPropagation()
        onIfHeaderSelect(ifNode.id)
    }

    function handleHeaderDoubleClick(event: ReactMouseEvent<SVGGElement>) {
        event.stopPropagation()
        onIfHeaderDoubleClick(ifNode.id)
    }

    const trueBranchBox = box.children[0]
        ? ({
            ...box.children[0],
            y: 0,
        } satisfies LayoutBox)
        : null

    const falseBranchBox = box.children[1]
        ? ({
            ...box.children[1],
            y: 0,
        } satisfies LayoutBox)
        : null

    return (
        <g>
            <rect
                x={x0}
                y={y0}
                width={w}
                height={headerH}
                fill="white"
                stroke="black"
                strokeWidth={style.lineWidth}
            />

            {renderSelectionOutline(isSelected, box)}

            <line
                x1={x0}
                y1={y0}
                x2={bottomCenter[0]}
                y2={bottomCenter[1]}
                stroke="black"
                strokeWidth={style.lineWidth}
            />
            <line
                x1={x0 + w}
                y1={y0}
                x2={bottomCenter[0]}
                y2={bottomCenter[1]}
                stroke="black"
                strokeWidth={style.lineWidth}
            />

            {bodyH > 0 ? (
                <>
                    <line
                        x1={x0}
                        y1={bodyTopY}
                        x2={x0 + w}
                        y2={bodyTopY}
                        stroke="black"
                        strokeWidth={style.lineWidth}
                    />
                    <line
                        x1={x0 + colW}
                        y1={bodyTopY}
                        x2={x0 + colW}
                        y2={bodyTopY + bodyH}
                        stroke="black"
                        strokeWidth={style.lineWidth}
                    />
                </>
            ) : null}

            <g
                onClick={handleHeaderClick}
                onDoubleClick={handleHeaderDoubleClick}
                style={{ cursor: 'text' }}
                aria-label="编辑 IF 条件"
            >
                <path d={polygonPath(headerTriangle)} fill="transparent" />
                {selectedIfPart === 'header' ? dashedPolygonOutline(headerTriangle) : null}

                <text
                    x={x0 + w / 2}
                    y={y0 + y * 0.38}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontFamily={style.fontFamily}
                    fontSize={style.fontSize}
                    fill="black"
                    pointerEvents="none"
                >
                    {ifNode.conditionText || '条件'}
                </text>
            </g>

            <g
                onClick={(event) => {
                    event.stopPropagation()
                    onIfPartSelect(ifNode.id, 'trueLabel')
                }}
                style={{ cursor: 'pointer' }}
                aria-label="选择 IF trueLabel"
            >
                <path d={polygonPath(trueTriangle)} fill="transparent" />
                {selectedIfPart === 'trueLabel' ? dashedPolygonOutline(trueTriangle) : null}

                <text
                    x={x0 + w * 0.25}
                    y={y0 + y * 0.72}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontFamily={style.fontFamily}
                    fontSize={style.fontSize}
                    fill="black"
                    pointerEvents="none"
                >
                    {trueLabel}
                </text>
            </g>

            <g
                onClick={(event) => {
                    event.stopPropagation()
                    onIfPartSelect(ifNode.id, 'falseLabel')
                }}
                style={{ cursor: 'pointer' }}
                aria-label="选择 IF falseLabel"
            >
                <path d={polygonPath(falseTriangle)} fill="transparent" />
                {selectedIfPart === 'falseLabel' ? dashedPolygonOutline(falseTriangle) : null}

                <text
                    x={x0 + w * 0.75}
                    y={y0 + y * 0.72}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontFamily={style.fontFamily}
                    fontSize={style.fontSize}
                    fill="black"
                    pointerEvents="none"
                >
                    {falseLabel}
                </text>
            </g>

            {showTruePlaceholder
                ? renderSelectablePlaceholder({
                    x: x0,
                    y: bodyTopY,
                    w: colW,
                    h: bodyH,
                    selected: selectedIfPart === 'trueContainer',
                    onClick: (event) => {
                        event.stopPropagation()
                        onIfPartSelect(ifNode.id, 'trueContainer')
                    },
                })
                : null}

            {showFalsePlaceholder
                ? renderSelectablePlaceholder({
                    x: x0 + colW,
                    y: bodyTopY,
                    w: colW,
                    h: bodyH,
                    selected: selectedIfPart === 'falseContainer',
                    onClick: (event) => {
                        event.stopPropagation()
                        onIfPartSelect(ifNode.id, 'falseContainer')
                    },
                })
                : null}

            {renderBranchContent({
                box,
                bodyTopY,
                trueBranchBox,
                falseBranchBox,
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
            })}
        </g>
    )
}