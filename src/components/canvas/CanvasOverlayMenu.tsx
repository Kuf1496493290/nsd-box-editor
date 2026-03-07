import type { MouseEvent as ReactMouseEvent } from 'react'
import type { AppState, SelectionTarget } from '../../app/types'
import { canDeleteByTarget } from '../../app/stateCommon'
import type { LayoutBox } from '../../layout/layoutTypes'
import { baseBlockHeight } from '../../render/renderCommon'
import { NodeActions } from '../NodeActions'
import {
    isWholeNodeSelection,
    isWholeNodeType,
    type DragIndex,
} from './dragHelpers'

type AnchorRect = Readonly<{ absX: number; absY: number; width: number; height: number }>

export type HoverOverlay = Readonly<{
    nodeId: string
    insertX: number
    insertY: number
    deleteX: number
    deleteEnabled: boolean
    showAddCaseBranch: boolean
    addCaseBranchAfterIndex?: number
}>

export type InsertMenuProps = Readonly<{
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
    deleteX?: number
    deleteEnabled?: boolean
    onDelete?: () => void
}>

function resolveIfPartAnchor(
    nodeId: string,
    target: SelectionTarget | null,
    dragIndex: DragIndex,
    style: AppState['style'],
): AnchorRect | null {
    if (target?.kind !== 'ifPart' || target.nodeId !== nodeId) return null

    const owner = dragIndex.owners.get(nodeId)
    if (owner?.box.node.type !== 'if') return null

    const ifBox = owner.box
    const yMin = baseBlockHeight(style)
    const headerH = Math.max(yMin, Math.ceil(ifBox.meta?.headerH ?? yMin))

    const leftW = Math.max(0, Math.ceil(ifBox.children[1]?.x ?? ifBox.width / 2))
    const rightW = Math.max(0, Math.ceil(ifBox.width - leftW))

    if (target.part === 'header') {
        return { absX: owner.absX, absY: owner.absY, width: owner.width, height: owner.height }
    }

    if (target.part === 'trueLabel') {
        return { absX: owner.absX, absY: owner.absY, width: leftW, height: headerH }
    }

    if (target.part === 'falseLabel') {
        return { absX: owner.absX + leftW, absY: owner.absY, width: rightW, height: headerH }
    }

    if (target.part === 'trueContainer') {
        const b = ifBox.children[0]
        if (!b) return null
        return { absX: owner.absX + b.x, absY: owner.absY + b.y, width: b.width, height: b.height }
    }

    if (target.part === 'falseContainer') {
        const b = ifBox.children[1]
        if (!b) return null
        return { absX: owner.absX + b.x, absY: owner.absY + b.y, width: b.width, height: b.height }
    }

    return null
}

function resolveCasePartAnchor(
    nodeId: string,
    target: SelectionTarget | null,
    dragIndex: DragIndex,
    style: AppState['style'],
): AnchorRect | null {
    if (target?.kind !== 'casePart' || target.nodeId !== nodeId) return null

    const owner = dragIndex.owners.get(nodeId)
    if (owner?.box.node.type !== 'case') return null

    const caseBox = owner.box
    const yMin = baseBlockHeight(style)
    const headerH = Math.max(yMin, Math.ceil(caseBox.meta?.headerH ?? yMin))
    const labelH = Math.max(yMin, Math.ceil(caseBox.meta?.labelH ?? headerH))

    if (target.part === 'header') {
        return { absX: owner.absX, absY: owner.absY, width: owner.width, height: owner.height }
    }

    const idx = target.branchIndex
    const b = caseBox.children[idx]
    if (!b) return null

    if (target.part === 'branchLabel') {
        return { absX: owner.absX + b.x, absY: owner.absY + headerH, width: b.width, height: labelH }
    }

    return { absX: owner.absX + b.x, absY: owner.absY + b.y, width: b.width, height: b.height }
}

function resolveLoopHoleAnchor(nodeId: string, target: SelectionTarget | null, dragIndex: DragIndex): AnchorRect | null {
    if (target?.kind !== 'loopPart' || target.nodeId !== nodeId || target.part !== 'hole') return null

    const loc = dragIndex.nodeLocations.get(nodeId)
    if (loc?.box.node.type !== 'loop') return null

    const body = loc.box.children[0]
    if (!body) return null

    return { absX: loc.absX + body.x, absY: loc.absY + body.y, width: body.width, height: body.height }
}

function resolveDefaultAnchor(nodeId: string, dragIndex: DragIndex): AnchorRect | null {
    const loc = dragIndex.nodeLocations.get(nodeId)
    if (!loc) return null
    return { absX: loc.absX, absY: loc.absY, width: loc.width, height: loc.height }
}

function resolveAnchorRect(
    nodeId: string,
    target: SelectionTarget | null,
    dragIndex: DragIndex,
    style: AppState['style'],
): AnchorRect | null {
    return (
        resolveIfPartAnchor(nodeId, target, dragIndex, style)
        ?? resolveCasePartAnchor(nodeId, target, dragIndex, style)
        ?? resolveLoopHoleAnchor(nodeId, target, dragIndex)
        ?? resolveDefaultAnchor(nodeId, dragIndex)
    )
}

// eslint-disable-next-line react-refresh/only-export-components
export function buildHoverOverlay(params: Readonly<{
    selectedTarget: SelectionTarget | null
    selectedNodeId: string | null
    dragIndex: DragIndex
    style: AppState['style']
}>): HoverOverlay | null {
    const { selectedTarget, selectedNodeId, dragIndex, style } = params
    const activeNodeId = selectedTarget?.nodeId ?? selectedNodeId
    if (!activeNodeId) return null

    const loc = dragIndex.nodeLocations.get(activeNodeId)
    const nodeType = loc?.box.node.type
    const isInsertableNode = nodeType === 'process' || nodeType === 'if' || nodeType === 'case' || nodeType === 'loop'
    if (!isInsertableNode) return null

    const anchor = resolveAnchorRect(activeNodeId, selectedTarget, dragIndex, style)
    if (!anchor) return null

    const insertX = anchor.absX + anchor.width + 18
    const insertY = anchor.absY + anchor.height / 2
    const deleteX = insertX + 24

    const deleteEnabled =
        selectedTarget?.nodeId === activeNodeId
            ? canDeleteByTarget(selectedTarget)
            : selectedNodeId === activeNodeId

    const showAddCaseBranch =
        nodeType === 'case'
        && selectedTarget?.kind === 'casePart'
        && selectedTarget.nodeId === activeNodeId
        && (selectedTarget.part === 'header' || selectedTarget.part === 'branchLabel')

    const addCaseBranchAfterIndex =
        selectedTarget?.kind === 'casePart'
        && selectedTarget.nodeId === activeNodeId
        && selectedTarget.part === 'branchLabel'
            ? selectedTarget.branchIndex
            : undefined

    return {
        nodeId: activeNodeId,
        insertX,
        insertY,
        deleteX,
        deleteEnabled,
        showAddCaseBranch,
        addCaseBranchAfterIndex,
    }
}

// eslint-disable-next-line react-refresh/only-export-components
export function buildTopSelectionBox(selectedTarget: SelectionTarget | null, dragIndex: DragIndex): LayoutBox | null {
    if (!selectedTarget) return null
    if (!isWholeNodeSelection(selectedTarget)) return null

    const loc = dragIndex.nodeLocations.get(selectedTarget.nodeId)
    const nodeType = loc?.box.node.type
    if (!isWholeNodeType(nodeType)) return null
    if (!loc) return null

    return {
        ...loc.box,
        x: loc.absX,
        y: loc.absY,
        width: loc.width,
        height: loc.height,
    }
}

function stopAndRun(event: ReactMouseEvent<SVGGElement>, fn: () => void) {
    event.stopPropagation()
    fn()
}

export function InsertMenu(props: InsertMenuProps) {
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
        deleteX,
        deleteEnabled = true,
        onDelete,
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
        <g data-no-drag="1">
            <g
                transform={`translate(${x}, ${y})`}
                onClick={handleToggle}
                style={{ cursor: 'pointer' }}
                aria-label="插入下一步"
                data-no-drag="1"
            >
                <circle cx={0} cy={0} r={10} fill="white" stroke="black" strokeWidth={1} />
                <line x1={-plusHalf} y1={0} x2={plusHalf} y2={0} stroke="black" strokeWidth={1.5} pointerEvents="none" />
                <line x1={0} y1={-plusHalf} x2={0} y2={plusHalf} stroke="black" strokeWidth={1.5} pointerEvents="none" />
            </g>

            {open ? (
                <g transform={`translate(${menuX}, ${menuY})`} aria-label="插入类型菜单" data-no-drag="1">
                    <rect x={0} y={0} width={menuW} height={menuH} rx={6} ry={6} fill="white" stroke="black" strokeWidth={1} />

                    {Array.from({ length: Math.max(0, items.length - 1) }, (_, i) => (
                        <line key={`sep-${i}`} x1={0} y1={itemH * (i + 1)} x2={menuW} y2={itemH * (i + 1)} stroke="black" strokeWidth={1} />
                    ))}

                    {items.map((it, idx) => (
                        <g key={it.key} onClick={(e) => stopAndRun(e, it.onClick)} style={{ cursor: 'pointer' }} data-no-drag="1">
                            <rect x={0} y={itemH * idx} width={menuW} height={itemH} fill="transparent" />
                            <text x={8} y={itemH * idx + 16} fontSize={12} fill="black">
                                {it.label}
                            </text>
                        </g>
                    ))}
                </g>
            ) : null}

            {typeof deleteX === 'number' && onDelete ? (
                <NodeActions x={deleteX} y={y} disabled={!deleteEnabled} onDelete={onDelete} />
            ) : null}
        </g>
    )
}