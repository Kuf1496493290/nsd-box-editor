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
    safePad,
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

function getIfLabels(node: IfNode): { trueLabel: string; falseLabel: string } {
    if (node.boolLabelMode === 'YN') return { trueLabel: 'Y', falseLabel: 'N' }
    return { trueLabel: 'T', falseLabel: 'F' }
}

function getSelectedIfPart(selectedTarget: SelectionTarget | null, ifNodeId: string): IfPartKey | null {
    if (selectedTarget?.kind !== 'ifPart') return null
    if (selectedTarget.nodeId !== ifNodeId) return null
    return selectedTarget.part
}

function clampNumber(value: number, min: number, max: number): number {
    if (Number.isNaN(value)) return min
    if (max < min) return (min + max) / 2
    return Math.max(min, Math.min(max, value))
}

function diagYOnTrueTriangle(x: number, xLeft: number, yTop: number, xSplit: number, yH: number): number {
    const denom = xSplit - xLeft
    if (denom <= 0) return yTop
    const t = (x - xLeft) / denom
    return yTop + yH * t
}

function diagYOnFalseTriangle(x: number, xRight: number, yTop: number, xSplit: number, yH: number): number {
    const denom = xRight - xSplit
    if (denom <= 0) return yTop
    const t = (xRight - x) / denom
    return yTop + yH * t
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
    if (node.type !== 'if') return null

    const ifNode = node
    const isSelected = selectedNodeId === ifNode.id || selectedTarget?.nodeId === ifNode.id
    const selectedIfPart = getSelectedIfPart(selectedTarget, ifNode.id)

    const y = baseBlockHeight(style)
    const headerH = y

    const x0 = box.x
    const y0 = box.y
    const w = box.width
    const xRight = x0 + w

    const splitLocalX = box.children[1]?.x ?? w / 2
    const leftW = Math.max(0, Math.ceil(splitLocalX))
    const rightW = Math.max(0, w - leftW)
    const splitX = x0 + leftW

    const diagLeftTop: readonly [number, number] = [x0, y0]
    const diagRightTop: readonly [number, number] = [xRight, y0]
    const bottomSplit: readonly [number, number] = [splitX, y0 + y]

    const headerTriangle = [diagLeftTop, diagRightTop, bottomSplit] as const
    const trueTriangle = [diagLeftTop, bottomSplit, [x0, y0 + y] as const] as const
    const falseTriangle = [diagRightTop, [xRight, y0 + y] as const, bottomSplit] as const

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

    const labelPad = safePad(style.paddingBranchLabel)
    const strokePad = Math.max(0, Math.ceil(style.lineWidth))
    const inset = labelPad + strokePad

    const trueTextX = clampNumber(x0 + inset, x0 + inset, splitX - inset)
    const falseTextX = clampNumber(xRight - inset, splitX + inset, xRight - inset)

    const trueDiagY = diagYOnTrueTriangle(trueTextX, x0, y0, splitX, y)
    const falseDiagY = diagYOnFalseTriangle(falseTextX, xRight, y0, splitX, y)

    const bottomY = y0 + y
    const trueTextY = (trueDiagY + bottomY) / 2
    const falseTextY = (falseDiagY + bottomY) / 2

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

            <line x1={x0} y1={y0} x2={bottomSplit[0]} y2={bottomSplit[1]} stroke="black" strokeWidth={style.lineWidth} />
            <line
                x1={xRight}
                y1={y0}
                x2={bottomSplit[0]}
                y2={bottomSplit[1]}
                stroke="black"
                strokeWidth={style.lineWidth}
            />

            {bodyH > 0 ? (
                <line x1={x0} y1={bodyTopY} x2={xRight} y2={bodyTopY} stroke="black" strokeWidth={style.lineWidth} />
            ) : null}

            <g
                onClick={handleHeaderClick}
                onDoubleClick={handleHeaderDoubleClick}
                style={{ cursor: 'pointer' }}
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
                data-drag-if-id={ifNode.id}
                data-drag-if-branch="true"
                onClick={(event) => {
                    event.stopPropagation()
                    onIfPartSelect(ifNode.id, 'trueLabel')
                }}
                onDoubleClick={(event) => {
                    event.stopPropagation()
                    onIfLabelDoubleClick(ifNode.id, 'trueLabel')
                }}
                style={{ cursor: 'pointer' }}
                aria-label="选择 IF trueLabel"
            >
                <path d={polygonPath(trueTriangle)} fill="transparent" />
                {selectedIfPart === 'trueLabel' ? dashedPolygonOutline(trueTriangle) : null}

                <text
                    x={trueTextX}
                    y={trueTextY}
                    textAnchor="start"
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
                data-drag-if-id={ifNode.id}
                data-drag-if-branch="false"
                onClick={(event) => {
                    event.stopPropagation()
                    onIfPartSelect(ifNode.id, 'falseLabel')
                }}
                onDoubleClick={(event) => {
                    event.stopPropagation()
                    onIfLabelDoubleClick(ifNode.id, 'falseLabel')
                }}
                style={{ cursor: 'pointer' }}
                aria-label="选择 IF falseLabel"
            >
                <path d={polygonPath(falseTriangle)} fill="transparent" />
                {selectedIfPart === 'falseLabel' ? dashedPolygonOutline(falseTriangle) : null}

                <text
                    x={falseTextX}
                    y={falseTextY}
                    textAnchor="end"
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
                    w: leftW,
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
                    x: splitX,
                    y: bodyTopY,
                    w: rightW,
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
            })}
        </g>
    )
}