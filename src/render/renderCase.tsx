// FILE: src/render/renderCase.tsx
import type { MouseEvent as ReactMouseEvent } from 'react'
import type { CaseNode, CasePartKey, IfPartKey, SelectionTarget, StyleConfig } from '../app/types'
import type { LayoutBox } from '../layout/layoutTypes'
import { RenderNode } from './renderNode'
import {
    baseBlockHeight,
    dashedPolygonOutline,
    polygonPath,
    renderSelectableLabel,
    renderSelectablePlaceholder,
    renderSelectionOutline,
} from './renderCommon'

type RenderCaseProps = Readonly<{
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

type SelectedCasePart = Readonly<
    | { part: 'header' }
    | { part: 'branchLabel' | 'branchContainer'; branchIndex: number }
    | { part: 'none' }
>

function getSelectedCasePart(selectedTarget: SelectionTarget | null, caseId: string): SelectedCasePart {
    if (selectedTarget?.kind !== 'casePart') return { part: 'none' }
    if (selectedTarget.nodeId !== caseId) return { part: 'none' }

    if (selectedTarget.part === 'header') return { part: 'header' }
    return { part: selectedTarget.part, branchIndex: selectedTarget.branchIndex }
}

function labelKey(caseId: string, branchId: string | undefined, index: number): string {
    if (branchId) return `label-${branchId}`
    return `label-${caseId}-${index}`
}

function placeholderKey(caseId: string, branchId: string | undefined, index: number): string {
    if (branchId) return `ph-${branchId}`
    return `ph-${caseId}-${index}`
}

export function RenderCase(props: RenderCaseProps) {
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
    if (node.type !== 'case') return null
    const caseNode: CaseNode = node

    const selected = getSelectedCasePart(selectedTarget, caseNode.id)
    const wholeCaseSelected = selected.part === 'header'

    const yMin = baseBlockHeight(style)
    const headerH = Math.max(yMin, Math.ceil(box.meta?.headerH ?? yMin))
    const labelH = Math.max(yMin, Math.ceil(box.meta?.labelH ?? headerH))

    const x0 = box.x
    const y0 = box.y
    const w = box.width

    const branchBoxes = box.children
    const branchCount = Math.max(2, branchBoxes.length)

    const cols = Array.from({ length: branchCount }, (_, i) => {
        const b = branchBoxes[i]
        const colX = x0 + (b?.x ?? 0)
        const colW = b?.width ?? w / branchCount
        return { colX, colW }
    })

    const maxBranchW = Math.max(0, ...cols.map((c) => c.colW))
    const triBase = Math.min(w / 2, maxBranchW / 2)

    const trapPoints = [
        [x0, y0] as const,
        [x0 + w, y0] as const,
        [x0 + w - triBase, y0 + headerH] as const,
        [x0 + triBase, y0 + headerH] as const,
    ] as const

    const headerTextX = x0 + w / 2
    const headerTextY = y0 + headerH / 2
    const labelTextY = y0 + headerH + labelH / 2

    const bodyTopY = y0 + headerH + labelH
    const bodyH = Math.max(0, box.height - headerH - labelH)

    const counts = Array.from({ length: branchCount }, (_, i) => caseNode.branches[i]?.children.length ?? 0)
    const labels =
        caseNode.branchLabels.length === caseNode.branches.length
            ? caseNode.branchLabels
            : caseNode.branches.map((_, i) => caseNode.branchLabels[i] ?? String(i + 1))

    function handleHeaderClick(event: ReactMouseEvent<SVGGElement>) {
        event.stopPropagation()
        onCaseHeaderSelect(caseNode.id)
    }

    function handleHeaderDoubleClick(event: ReactMouseEvent<SVGGElement>) {
        event.stopPropagation()
        onCaseHeaderDoubleClick(caseNode.id)
    }

    const boundaries = cols
        .slice(0, Math.max(0, branchCount - 1))
        .map((c) => c.colX + c.colW)

    return (
        <g>
            <rect x={x0} y={y0} width={w} height={headerH + labelH} fill="white" stroke="black" strokeWidth={style.lineWidth} />

            {renderSelectionOutline(wholeCaseSelected, box)}

            <line x1={x0} y1={y0 + headerH} x2={x0 + w} y2={y0 + headerH} stroke="black" strokeWidth={style.lineWidth} />

            <line x1={x0} y1={y0} x2={x0 + triBase} y2={y0 + headerH} stroke="black" strokeWidth={style.lineWidth} />
            <line x1={x0 + w} y1={y0} x2={x0 + w - triBase} y2={y0 + headerH} stroke="black" strokeWidth={style.lineWidth} />

            {boundaries.map((x, i) => (
                <line
                    key={`sep-${caseNode.id}-${i}`}
                    x1={x}
                    y1={y0 + headerH}
                    x2={x}
                    y2={y0 + headerH + labelH}
                    stroke="black"
                    strokeWidth={style.lineWidth}
                />
            ))}

            {bodyH > 0 ? (
                <line x1={x0} y1={bodyTopY} x2={x0 + w} y2={bodyTopY} stroke="black" strokeWidth={style.lineWidth} />
            ) : null}

            <g onClick={handleHeaderClick} onDoubleClick={handleHeaderDoubleClick} style={{ cursor: 'pointer' }} aria-label="编辑 CASE 条件">
                <rect x={x0} y={y0} width={w} height={headerH} fill="transparent" />
                <path d={polygonPath(trapPoints)} fill="transparent" />
                {selected.part === 'header' ? dashedPolygonOutline(trapPoints) : null}

                <text
                    x={headerTextX}
                    y={headerTextY}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontFamily={style.fontFamily}
                    fontSize={style.fontSize}
                    fill="black"
                    pointerEvents="none"
                >
                    {caseNode.conditionText || '条件'}
                </text>
            </g>

            {Array.from({ length: branchCount }, (_, i) => {
                const branch = caseNode.branches[i]
                const { colX, colW } = cols[i]
                const selectedLabel = selected.part === 'branchLabel' && selected.branchIndex === i
                const label = labels[i] ?? String(i + 1)

                return (
                    <g
                        data-drag-case-id={caseNode.id}
                        data-drag-case-branch-index={String(i)}
                        key={labelKey(caseNode.id, branch?.id, i)}
                        onDoubleClick={(event) => {
                            event.stopPropagation()
                            onCaseBranchLabelDoubleClick(caseNode.id, i)
                        }}
                    >
                        {renderSelectableLabel({
                            x: colX,
                            y: y0 + headerH,
                            w: colW,
                            h: labelH,
                            textX: colX + colW / 2,
                            textY: labelTextY,
                            text: label,
                            style,
                            selected: selectedLabel,
                            onClick: (event) => {
                                event.stopPropagation()
                                onCasePartSelect(caseNode.id, 'branchLabel', i)
                            },
                        })}
                    </g>
                )
            })}

            {bodyH > 0
                ? counts.map((c, i) => {
                    if (c > 0) return null

                    const branch = caseNode.branches[i]
                    const { colX, colW } = cols[i]
                    const selectedContainer = selected.part === 'branchContainer' && selected.branchIndex === i

                    return (
                        <g key={placeholderKey(caseNode.id, branch?.id, i)}>
                            {renderSelectablePlaceholder({
                                x: colX,
                                y: bodyTopY,
                                w: colW,
                                h: bodyH,
                                selected: selectedContainer,
                                noDrag: true,
                                onClick: (event) => {
                                    event.stopPropagation()
                                    onCasePartSelect(caseNode.id, 'branchContainer', i)
                                },
                            })}
                        </g>
                    )
                })
                : null}

            {bodyH > 0 ? (
                <g transform={`translate(${x0}, ${bodyTopY})`}>
                    {branchBoxes.map((branchBox) => {
                        const b = {
                            ...branchBox,
                            y: 0,
                        } satisfies LayoutBox

                        return (
                            <RenderNode
                                key={b.id}
                                box={b}
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
                        )
                    })}
                </g>
            ) : null}
        </g>
    )
}