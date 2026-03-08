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

    onInsertProcessAtSelection: (nodeId: string) => void
    onInsertIfAtSelection: (nodeId: string) => void
    onInsertCaseAtSelection: (nodeId: string) => void
    onInsertWhileAtSelection: (nodeId: string) => void
    onInsertDoWhileAtSelection: (nodeId: string) => void

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

function columnKey(caseId: string, branchId: string | undefined, index: number): string {
    if (branchId) return `col-${branchId}`
    return `col-${caseId}-${index}`
}

/**
 * 渲染 CASE 节点，包含头部、分支标签行与各分支内容区域。
 */
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
        onInsertProcessAtSelection,
        onInsertIfAtSelection,
        onInsertCaseAtSelection,
        onInsertWhileAtSelection,
        onInsertDoWhileAtSelection,
        onDeleteSelected,
        onAddCaseBranch,
    } = props

    const node = box.node
    if (node.type !== 'case') return null
    const caseNode: CaseNode = node

    const selected = getSelectedCasePart(selectedTarget, caseNode.id)

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
                const branchBox = branchBoxes[i]
                const { colX, colW } = cols[i]
                const selectedLabel = selected.part === 'branchLabel' && selected.branchIndex === i
                const selectedContainer = selected.part === 'branchContainer' && selected.branchIndex === i
                const label = labels[i] ?? String(i + 1)

                const contentBox = branchBox
                    ? ({
                        ...branchBox,
                        y: 0,
                    } satisfies LayoutBox)
                    : null

                return (
                    <g
                        key={columnKey(caseNode.id, branch?.id, i)}
                        data-drag-case-column-id={caseNode.id}
                        data-drag-case-column-index={String(i)}
                    >
                        <g
                            data-drag-case-id={caseNode.id}
                            data-drag-case-branch-index={String(i)}
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

                        {bodyH > 0 && counts[i] === 0
                            ? renderSelectablePlaceholder({
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
                            })
                            : null}

                        {bodyH > 0 && contentBox ? (
                            <g transform={`translate(${x0}, ${bodyTopY})`}>
                                <RenderNode
                                    box={contentBox}
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
                            </g>
                        ) : null}
                    </g>
                )
            })}

            {selected.part === 'branchLabel'
                ? Array.from({ length: branchCount }, (_, i) => {
                    if (selected.branchIndex !== i) return null
                    const { colX, colW } = cols[i]
                    return dashedPolygonOutline([
                        [colX + 3, y0 + headerH + 3],
                        [colX + colW - 3, y0 + headerH + 3],
                        [colX + colW - 3, y0 + headerH + labelH - 3],
                        [colX + 3, y0 + headerH + labelH - 3],
                    ] as const)
                })
                : null}
        </g>
    )
}