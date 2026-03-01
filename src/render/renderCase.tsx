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
    if (node.type !== 'case') return null
    const caseNode: CaseNode = node

    const branchCount = Math.max(2, caseNode.branches.length)
    const selected = getSelectedCasePart(selectedTarget, caseNode.id)
    const isSelectedNode = selectedNodeId === caseNode.id || selectedTarget?.nodeId === caseNode.id

    const y = baseBlockHeight(style)
    const headerH = y
    const labelH = y

    const x0 = box.x
    const y0 = box.y
    const w = box.width

    const colW = box.width / branchCount
    const triBase = colW / 2

    const trapPoints = [
        [x0, y0] as const,
        [x0 + w, y0] as const,
        [x0 + w - triBase, y0 + y] as const,
        [x0 + triBase, y0 + y] as const,
    ] as const

    const headerTextX = x0 + w / 2
    const headerTextY = y0 + headerH / 2

    const labelTextY = y0 + headerH + labelH / 2

    const bodyTopY = y0 + headerH + labelH
    const bodyH = Math.max(0, box.height - headerH - labelH)

    const counts = caseNode.branches.map((b) => b.children.length)

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

    return (
        <g>
            <rect
                x={x0}
                y={y0}
                width={w}
                height={headerH + labelH}
                fill="white"
                stroke="black"
                strokeWidth={style.lineWidth}
            />

            {renderSelectionOutline(isSelectedNode, box)}

            <line
                x1={x0}
                y1={y0 + headerH}
                x2={x0 + w}
                y2={y0 + headerH}
                stroke="black"
                strokeWidth={style.lineWidth}
            />

            <line
                x1={x0}
                y1={y0}
                x2={x0 + triBase}
                y2={y0 + headerH}
                stroke="black"
                strokeWidth={style.lineWidth}
            />
            <line
                x1={x0 + w}
                y1={y0}
                x2={x0 + w - triBase}
                y2={y0 + headerH}
                stroke="black"
                strokeWidth={style.lineWidth}
            />

            {Array.from({ length: branchCount - 1 }, (_, i) => {
                const x = x0 + colW * (i + 1)
                return (
                    <line
                        key={`sep-${caseNode.id}-${i + 1}`}
                        x1={x}
                        y1={y0 + headerH}
                        x2={x}
                        y2={y0 + headerH + labelH}
                        stroke="black"
                        strokeWidth={style.lineWidth}
                    />
                )
            })}

            {bodyH > 0 ? (
                <line
                    x1={x0}
                    y1={bodyTopY}
                    x2={x0 + w}
                    y2={bodyTopY}
                    stroke="black"
                    strokeWidth={style.lineWidth}
                />
            ) : null}

            <g
                onClick={handleHeaderClick}
                onDoubleClick={handleHeaderDoubleClick}
                style={{ cursor: 'text' }}
                aria-label="编辑 CASE 条件"
            >
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
                const colX = x0 + colW * i
                const selectedLabel = selected.part === 'branchLabel' && selected.branchIndex === i
                const label = labels[i] ?? String(i + 1)

                return (
                    <g
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
                    const colX = x0 + colW * i
                    const selectedContainer = selected.part === 'branchContainer' && selected.branchIndex === i

                    return (
                        <g key={`ph-${branch.id}`}>
                            {renderSelectablePlaceholder({
                                x: colX,
                                y: bodyTopY,
                                w: colW,
                                h: bodyH,
                                selected: selectedContainer,
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
                    {box.children.map((branchBox) => {
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
                        )
                    })}
                </g>
            ) : null}
        </g>
    )
}