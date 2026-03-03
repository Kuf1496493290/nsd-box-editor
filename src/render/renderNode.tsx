// FILE: src/render/renderNode.tsx
import { useState } from 'react'
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react'
import type { CasePartKey, IfPartKey, SelectionTarget, StyleConfig } from '../app/types'
import { canDeleteByTarget } from '../app/selection'
import type { LayoutBox } from '../layout/layoutTypes'
import { RenderProcess } from './renderProcess'
import { RenderIf } from './renderIf'
import { RenderCase } from './renderCase'
import { RenderLoop } from './renderLoop'
import { NodeActions } from '../components/NodeActions'

type RenderNodeProps = Readonly<{
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

    onNodePointerDown?: (nodeId: string, event: ReactPointerEvent<SVGGElement>) => void
}>

type InsertMenuProps = Readonly<{
    x: number
    y: number
    open: boolean
    onToggle: () => void
    onInsertProcess: () => void
    onInsertIf: () => void
    onInsertCase: () => void
    onInsertWhile: () => void
    onInsertDoWhile: () => void
    showAddCaseBranch?: boolean
    onAddCaseBranch?: () => void
}>

function stopAndRun(event: ReactMouseEvent<SVGGElement>, fn: () => void) {
    event.stopPropagation()
    fn()
}

function InsertMenu(props: InsertMenuProps) {
    const {
        x,
        y,
        open,
        onToggle,
        onInsertProcess,
        onInsertIf,
        onInsertCase,
        onInsertWhile,
        onInsertDoWhile,
        showAddCaseBranch = false,
        onAddCaseBranch,
    } = props

    function handleToggle(event: ReactMouseEvent<SVGGElement>) {
        event.stopPropagation()
        onToggle()
    }

    const menuX = x + 40
    const menuW = 132
    const itemH = 24

    const items: ReadonlyArray<Readonly<{ key: string; label: string; onClick: () => void }>> = (() => {
        const base = [
            { key: 'process', label: '插入步骤', onClick: onInsertProcess },
            { key: 'if', label: '插入 IF', onClick: onInsertIf },
            { key: 'case', label: '插入 CASE', onClick: onInsertCase },
            { key: 'while', label: '插入 WHILE', onClick: onInsertWhile },
            { key: 'doWhile', label: '插入 DO-WHILE', onClick: onInsertDoWhile },
        ] as const

        if (!showAddCaseBranch || !onAddCaseBranch) return base
        return [...base, { key: 'addCaseBranch', label: '增加分支', onClick: onAddCaseBranch }]
    })()

    const menuH = itemH * items.length
    const menuY = Math.round(y - 8 - menuH / 2)

    const closeHalf = 4
    const plusHalf = closeHalf * Math.SQRT2

    return (
        <g>
            <g
                transform={`translate(${x}, ${y})`}
                onClick={handleToggle}
                onPointerDown={(e) => e.stopPropagation()}
                style={{ cursor: 'pointer' }}
                aria-label="插入下一步"
            >
                <circle cx={0} cy={0} r={10} fill="white" stroke="black" strokeWidth={1} />
                <line
                    x1={-plusHalf}
                    y1={0}
                    x2={plusHalf}
                    y2={0}
                    stroke="black"
                    strokeWidth={1.5}
                    pointerEvents="none"
                />
                <line
                    x1={0}
                    y1={-plusHalf}
                    x2={0}
                    y2={plusHalf}
                    stroke="black"
                    strokeWidth={1.5}
                    pointerEvents="none"
                />
            </g>

            {open ? (
                <g transform={`translate(${menuX}, ${menuY})`} aria-label="插入类型菜单" onPointerDown={(e) => e.stopPropagation()}>
                    <rect x={0} y={0} width={menuW} height={menuH} rx={6} ry={6} fill="white" stroke="black" strokeWidth={1} />

                    {Array.from({ length: Math.max(0, items.length - 1) }, (_, i) => (
                        <line key={`sep-${i}`} x1={0} y1={itemH * (i + 1)} x2={menuW} y2={itemH * (i + 1)} stroke="black" strokeWidth={1} />
                    ))}

                    {items.map((it, idx) => (
                        <g key={it.key} onClick={(e) => stopAndRun(e, it.onClick)} style={{ cursor: 'pointer' }}>
                            <rect x={0} y={itemH * idx} width={menuW} height={itemH} fill="transparent" />
                            <text x={8} y={itemH * idx + 16} fontSize={12} fill="black">
                                {it.label}
                            </text>
                        </g>
                    ))}
                </g>
            ) : null}
        </g>
    )
}

function RenderSequenceNode(props: RenderNodeProps) {
    const {
        box,
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
        onNodePointerDown,
    } = props

    const [openInsertMenuForId, setOpenInsertMenuForId] = useState<string | null>(null)

    return (
        <g transform={`translate(${box.x}, ${box.y})`}>
            {box.children.map((c) => {
                const isInsertableNode =
                    c.node.type === 'process' || c.node.type === 'if' || c.node.type === 'case' || c.node.type === 'loop'

                const isSelected = selectedNodeId === c.node.id
                const isSelectedByTarget = selectedTarget?.nodeId === c.node.id
                const showAsSelected = isSelected || isSelectedByTarget

                const insertX = c.x + c.width + 18
                const insertY = c.y + c.height / 2

                const isLoopHoleSelected = selectedTarget?.kind === 'loopPart' && selectedTarget.nodeId === c.node.id
                const showHoverButtons = isInsertableNode && showAsSelected && !isLoopHoleSelected
                const isInsertMenuOpen = showHoverButtons && openInsertMenuForId === c.node.id

                const deleteEnabled =
                    showAsSelected &&
                    !isLoopHoleSelected &&
                    (selectedTarget?.nodeId === c.node.id ? canDeleteByTarget(selectedTarget) : selectedNodeId === c.node.id)

                const deleteX = insertX + 24

                const showAddCaseBranch =
                    c.node.type === 'case' &&
                    ((selectedTarget?.kind === 'node' && selectedTarget.nodeId === c.node.id) ||
                        (selectedTarget === null && selectedNodeId === c.node.id))

                return (
                    <g
                        key={c.id}
                        onPointerDown={
                            isInsertableNode && onNodePointerDown
                                ? (e) => {
                                    onNodePointerDown(c.node.id, e)
                                }
                                : undefined
                        }
                    >
                        <RenderNode
                            box={c}
                            style={props.style}
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
                            onNodePointerDown={onNodePointerDown}
                        />

                        {showHoverButtons ? (
                            <InsertMenu
                                x={insertX}
                                y={insertY}
                                open={isInsertMenuOpen}
                                onToggle={() => {
                                    setOpenInsertMenuForId((prev) => (prev === c.node.id ? null : c.node.id))
                                }}
                                onInsertProcess={() => {
                                    setOpenInsertMenuForId(null)
                                    onInsertProcessAfter(c.node.id)
                                }}
                                onInsertIf={() => {
                                    setOpenInsertMenuForId(null)
                                    onInsertIfAfter(c.node.id)
                                }}
                                onInsertCase={() => {
                                    setOpenInsertMenuForId(null)
                                    onInsertCaseAfter(c.node.id)
                                }}
                                onInsertWhile={() => {
                                    setOpenInsertMenuForId(null)
                                    onInsertWhileAfter(c.node.id)
                                }}
                                onInsertDoWhile={() => {
                                    setOpenInsertMenuForId(null)
                                    onInsertDoWhileAfter(c.node.id)
                                }}
                                showAddCaseBranch={showAddCaseBranch}
                                onAddCaseBranch={
                                    showAddCaseBranch && onAddCaseBranch
                                        ? () => {
                                            setOpenInsertMenuForId(null)
                                            onAddCaseBranch(c.node.id)
                                        }
                                        : undefined
                                }
                            />
                        ) : null}

                        {showHoverButtons ? (
                            <NodeActions
                                x={deleteX}
                                y={insertY}
                                disabled={!deleteEnabled}
                                onDelete={() => {
                                    setOpenInsertMenuForId(null)
                                    if (onDeleteSelected) {
                                        onDeleteSelected()
                                        return
                                    }
                                    onDeleteProcess(c.node.id)
                                }}
                            />
                        ) : null}
                    </g>
                )
            })}
        </g>
    )
}

export function RenderNode(props: RenderNodeProps) {
    const { box, style, selectedNodeId, selectedTarget } = props
    const n = box.node

    if (n.type === 'process') {
        return (
            <RenderProcess
                box={box}
                style={style}
                selected={selectedTarget?.kind === 'node' ? selectedTarget.nodeId === n.id : selectedNodeId === n.id}
                onSelect={() => props.onProcessSelect(n.id)}
                onDoubleClick={() => props.onProcessDoubleClick(n.id)}
            />
        )
    }

    if (n.type === 'if') {
        return <RenderIf {...props} />
    }

    if (n.type === 'case') {
        return <RenderCase {...props} />
    }

    if (n.type === 'loop') {
        return <RenderLoop {...props} />
    }

    if (n.type === 'sequence') {
        return <RenderSequenceNode {...props} />
    }

    return null
}