// FILE: src/render/renderNode.tsx
import { useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import type { CasePartKey, IfPartKey, SelectionTarget, StyleConfig } from '../app/types'
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
}>

function stopAndRun(event: ReactMouseEvent<SVGGElement>, fn: () => void) {
    event.stopPropagation()
    fn()
}

function InsertMenu(props: InsertMenuProps) {
    const { x, y, open, onToggle, onInsertProcess, onInsertIf, onInsertCase, onInsertWhile, onInsertDoWhile } = props

    function handleToggle(event: ReactMouseEvent<SVGGElement>) {
        event.stopPropagation()
        onToggle()
    }

    const menuX = x + 16
    const menuY = y - 68
    const menuW = 132
    const itemH = 24
    const menuH = itemH * 5

    return (
        <g>
            <g
                transform={`translate(${x}, ${y})`}
                onClick={handleToggle}
                style={{ cursor: 'pointer' }}
                aria-label="插入下一步"
            >
                <circle cx={0} cy={0} r={10} fill="white" stroke="black" strokeWidth={1} />
                <line x1={-4} y1={0} x2={4} y2={0} stroke="black" strokeWidth={1.5} />
                <line x1={0} y1={-4} x2={0} y2={4} stroke="black" strokeWidth={1.5} />
            </g>

            {open ? (
                <g transform={`translate(${menuX}, ${menuY})`} aria-label="插入类型菜单">
                    <rect
                        x={0}
                        y={0}
                        width={menuW}
                        height={menuH}
                        rx={6}
                        ry={6}
                        fill="white"
                        stroke="black"
                        strokeWidth={1}
                    />

                    {Array.from({ length: 4 }, (_, i) => (
                        <line
                            key={`sep-${i}`}
                            x1={0}
                            y1={itemH * (i + 1)}
                            x2={menuW}
                            y2={itemH * (i + 1)}
                            stroke="black"
                            strokeWidth={1}
                        />
                    ))}

                    <g onClick={(e) => stopAndRun(e, onInsertProcess)} style={{ cursor: 'pointer' }}>
                        <rect x={0} y={0} width={menuW} height={itemH} fill="transparent" />
                        <text x={8} y={16} fontSize={12} fill="black">
                            插入步骤
                        </text>
                    </g>

                    <g onClick={(e) => stopAndRun(e, onInsertIf)} style={{ cursor: 'pointer' }}>
                        <rect x={0} y={itemH} width={menuW} height={itemH} fill="transparent" />
                        <text x={8} y={itemH + 16} fontSize={12} fill="black">
                            插入 IF
                        </text>
                    </g>

                    <g onClick={(e) => stopAndRun(e, onInsertCase)} style={{ cursor: 'pointer' }}>
                        <rect x={0} y={itemH * 2} width={menuW} height={itemH} fill="transparent" />
                        <text x={8} y={itemH * 2 + 16} fontSize={12} fill="black">
                            插入 CASE
                        </text>
                    </g>

                    <g onClick={(e) => stopAndRun(e, onInsertWhile)} style={{ cursor: 'pointer' }}>
                        <rect x={0} y={itemH * 3} width={menuW} height={itemH} fill="transparent" />
                        <text x={8} y={itemH * 3 + 16} fontSize={12} fill="black">
                            插入 WHILE
                        </text>
                    </g>

                    <g onClick={(e) => stopAndRun(e, onInsertDoWhile)} style={{ cursor: 'pointer' }}>
                        <rect x={0} y={itemH * 4} width={menuW} height={itemH} fill="transparent" />
                        <text x={8} y={itemH * 4 + 16} fontSize={12} fill="black">
                            插入 DO-WHILE
                        </text>
                    </g>
                </g>
            ) : null}
        </g>
    )
}

function RenderSequenceNode(props: RenderNodeProps) {
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
    } = props

    const [openInsertMenuForId, setOpenInsertMenuForId] = useState<string | null>(null)
    const processIds = box.children.filter((c) => c.node.type === 'process').map((c) => c.node.id)

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

                const disableInsertMenuWhenLoopHoleSelected =
                    selectedTarget?.kind === 'loopPart' && selectedTarget.nodeId === c.node.id

                const showInsertMenuButton =
                    isInsertableNode && showAsSelected && !disableInsertMenuWhenLoopHoleSelected

                const showActions = c.node.type === 'process' && showAsSelected
                const actionsX = c.x + c.width + 52
                const actionsY = c.y + c.height / 2

                const processIndex = c.node.type === 'process' ? processIds.indexOf(c.node.id) : -1
                const disableMoveUp = processIndex <= 0
                const disableMoveDown = processIndex < 0 || processIndex >= processIds.length - 1
                const isInsertMenuOpen = showInsertMenuButton && openInsertMenuForId === c.node.id

                return (
                    <g key={c.id}>
                        <RenderNode
                            box={c}
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
                        />

                        {showInsertMenuButton ? (
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
                            />
                        ) : null}

                        {showActions ? (
                            <NodeActions
                                x={actionsX}
                                y={actionsY}
                                onMoveUp={() => onMoveProcessUp(c.node.id)}
                                onMoveDown={() => onMoveProcessDown(c.node.id)}
                                onDelete={() => onDeleteProcess(c.node.id)}
                                disableMoveUp={disableMoveUp}
                                disableMoveDown={disableMoveDown}
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