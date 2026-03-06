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

type Pt = Readonly<{ x: number; y: number }>
type Tri = readonly [Pt, Pt, Pt]

function toTuplePoints(points: ReadonlyArray<Pt>): ReadonlyArray<readonly [number, number]> {
    return points.map((p) => [p.x, p.y] as const)
}

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

function triArea2(a: Pt, b: Pt, c: Pt): number {
    return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
}

function normalize(v: Pt): Pt {
    const len = Math.hypot(v.x, v.y)
    if (len <= 1e-9) return { x: 0, y: 0 }
    return { x: v.x / len, y: v.y / len }
}

function lineIntersection(p1: Pt, d1: Pt, p2: Pt, d2: Pt): Pt | null {
    const cross = d1.x * d2.y - d1.y * d2.x
    if (Math.abs(cross) <= 1e-9) return null

    const dx = p2.x - p1.x
    const dy = p2.y - p1.y
    const t = (dx * d2.y - dy * d2.x) / cross
    return { x: p1.x + d1.x * t, y: p1.y + d1.y * t }
}

function insetTriangle(tri: Tri, inset: number): Tri {
    const [a0, b0, c0] = tri
    const insetSafe = Number.isFinite(inset) ? Math.max(0, inset) : 0
    if (insetSafe <= 0) return tri

    const area2 = triArea2(a0, b0, c0)
    if (Math.abs(area2) <= 1e-9) return tri

    const ccw = area2 > 0

    function inwardNormal(p: Pt, q: Pt): Pt {
        const dx = q.x - p.x
        const dy = q.y - p.y
        const n = ccw ? { x: -dy, y: dx } : { x: dy, y: -dx }
        return normalize(n)
    }

    const nAB = inwardNormal(a0, b0)
    const nBC = inwardNormal(b0, c0)
    const nCA = inwardNormal(c0, a0)

    const aAB: Pt = { x: a0.x + nAB.x * insetSafe, y: a0.y + nAB.y * insetSafe }
    const bAB: Pt = { x: b0.x + nAB.x * insetSafe, y: b0.y + nAB.y * insetSafe }

    const bBC: Pt = { x: b0.x + nBC.x * insetSafe, y: b0.y + nBC.y * insetSafe }
    const cBC: Pt = { x: c0.x + nBC.x * insetSafe, y: c0.y + nBC.y * insetSafe }

    const cCA: Pt = { x: c0.x + nCA.x * insetSafe, y: c0.y + nCA.y * insetSafe }
    const aCA: Pt = { x: a0.x + nCA.x * insetSafe, y: a0.y + nCA.y * insetSafe }

    const dAB: Pt = normalize({ x: bAB.x - aAB.x, y: bAB.y - aAB.y })
    const dBC: Pt = normalize({ x: cBC.x - bBC.x, y: cBC.y - bBC.y })
    const dCA: Pt = normalize({ x: aCA.x - cCA.x, y: aCA.y - cCA.y })

    const A = lineIntersection(aAB, dAB, aCA, dCA)
    const B = lineIntersection(bAB, dAB, bBC, dBC)
    const C = lineIntersection(cBC, dBC, cCA, dCA)

    if (!A || !B || !C) return tri
    return [A, B, C] as const
}

function renderBranchContent(params: Readonly<{
    ifNodeId: string
    box: LayoutBox
    bodyTopY: number
    trueBranchBox: LayoutBox | null
    falseBranchBox: LayoutBox | null
    style: StyleConfig
    selectedNodeId: string | null
    selectedTarget: SelectionTarget | null
    showTruePlaceholder: boolean
    showFalsePlaceholder: boolean
    bodyH: number
    leftW: number
    rightW: number
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
        ifNodeId,
        box,
        bodyTopY,
        trueBranchBox,
        falseBranchBox,
        style,
        selectedNodeId,
        selectedTarget,
        showTruePlaceholder,
        showFalsePlaceholder,
        bodyH,
        leftW,
        rightW,
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

    const contentH = Math.max(0, box.height - (bodyTopY - box.y))
    if (contentH <= 0) return null

    return (
        <g transform={`translate(${box.x}, ${bodyTopY})`}>
            <g data-drag-if-column-id={ifNodeId} data-drag-if-column-branch="true">
                {showTruePlaceholder
                    ? renderSelectablePlaceholder({
                        x: 0,
                        y: 0,
                        w: leftW,
                        h: bodyH,
                        selected:
                            selectedTarget?.kind === 'ifPart' &&
                            selectedTarget.nodeId === ifNodeId &&
                            selectedTarget.part === 'trueContainer',
                        noDrag: true,
                        onClick: (event) => {
                            event.stopPropagation()
                            onIfPartSelect(ifNodeId, 'trueContainer')
                        },
                    })
                    : null}

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
            </g>

            <g data-drag-if-column-id={ifNodeId} data-drag-if-column-branch="false">
                {showFalsePlaceholder
                    ? renderSelectablePlaceholder({
                        x: leftW,
                        y: 0,
                        w: rightW,
                        h: bodyH,
                        selected:
                            selectedTarget?.kind === 'ifPart' &&
                            selectedTarget.nodeId === ifNodeId &&
                            selectedTarget.part === 'falseContainer',
                        noDrag: true,
                        onClick: (event) => {
                            event.stopPropagation()
                            onIfPartSelect(ifNodeId, 'falseContainer')
                        },
                    })
                    : null}

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
    const selectedIfPart = getSelectedIfPart(selectedTarget, ifNode.id)

    const yMin = baseBlockHeight(style)
    const headerH = Math.max(yMin, Math.ceil(box.meta?.headerH ?? yMin))

    const x0 = box.x
    const y0 = box.y
    const w = box.width
    const xRight = x0 + w

    const splitLocalX = box.children[1]?.x ?? w / 2
    const leftW = Math.max(0, Math.ceil(splitLocalX))
    const rightW = Math.max(0, w - leftW)
    const splitX = x0 + leftW

    const diagLeftTop: Pt = { x: x0, y: y0 }
    const diagRightTop: Pt = { x: xRight, y: y0 }
    const bottomSplit: Pt = { x: splitX, y: y0 + headerH }

    const headerTriangle: ReadonlyArray<Pt> = [diagLeftTop, diagRightTop, bottomSplit]
    const trueTriangle: Tri = [diagLeftTop, bottomSplit, { x: x0, y: y0 + headerH }] as const
    const falseTriangle: Tri = [diagRightTop, { x: xRight, y: y0 + headerH }, bottomSplit] as const

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

    const trueDiagY = diagYOnTrueTriangle(trueTextX, x0, y0, splitX, headerH)
    const falseDiagY = diagYOnFalseTriangle(falseTextX, xRight, y0, splitX, headerH)

    const bottomY = y0 + headerH
    const trueTextY = (trueDiagY + bottomY) / 2
    const falseTextY = (falseDiagY + bottomY) / 2

    const partInset = Math.max(3, Math.ceil(style.lineWidth))
    const trueTriangleInset = insetTriangle(trueTriangle, partInset)
    const falseTriangleInset = insetTriangle(falseTriangle, partInset)

    return (
        <g>
            <rect x={x0} y={y0} width={w} height={headerH} fill="white" stroke="black" strokeWidth={style.lineWidth} />

            <line x1={x0} y1={y0} x2={bottomSplit.x} y2={bottomSplit.y} stroke="black" strokeWidth={style.lineWidth} />
            <line x1={xRight} y1={y0} x2={bottomSplit.x} y2={bottomSplit.y} stroke="black" strokeWidth={style.lineWidth} />

            {bodyH > 0 ? (
                <line x1={x0} y1={bodyTopY} x2={xRight} y2={bodyTopY} stroke="black" strokeWidth={style.lineWidth} />
            ) : null}

            <g onClick={handleHeaderClick} onDoubleClick={handleHeaderDoubleClick} style={{ cursor: 'pointer' }} aria-label="编辑 IF 条件">
                <path d={polygonPath(toTuplePoints(headerTriangle))} fill="transparent" />
                {selectedIfPart === 'header' ? dashedPolygonOutline(toTuplePoints(headerTriangle)) : null}

                <text
                    x={x0 + w / 2}
                    y={y0 + headerH * 0.38}
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
                <path d={polygonPath(toTuplePoints(trueTriangle))} fill="transparent" />
                {selectedIfPart === 'trueLabel' ? dashedPolygonOutline(toTuplePoints(trueTriangleInset)) : null}

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
                <path d={polygonPath(toTuplePoints(falseTriangle))} fill="transparent" />
                {selectedIfPart === 'falseLabel' ? dashedPolygonOutline(toTuplePoints(falseTriangleInset)) : null}

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

            {renderBranchContent({
                ifNodeId: ifNode.id,
                box,
                bodyTopY,
                trueBranchBox,
                falseBranchBox,
                style,
                selectedNodeId,
                selectedTarget,
                showTruePlaceholder,
                showFalsePlaceholder,
                bodyH,
                leftW,
                rightW,
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