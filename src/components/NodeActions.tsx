// FILE: src/components/NodeActions.tsx
import type { MouseEvent as ReactMouseEvent } from 'react'

type NodeActionsProps = Readonly<{
    x: number
    y: number
    onMoveUp: () => void
    onMoveDown: () => void
    onDelete: () => void
    disableMoveUp?: boolean
    disableMoveDown?: boolean
}>

type ActionButtonProps = Readonly<{
    x: number
    y: number
    label: string
    ariaLabel: string
    onClick: () => void
    disabled?: boolean
}>

function ActionButton(props: ActionButtonProps) {
    const { x, y, label, ariaLabel, onClick, disabled = false } = props

    function handleClick(event: ReactMouseEvent<SVGGElement>) {
        event.stopPropagation()
        if (disabled) return
        onClick()
    }

    return (
        <g
            transform={`translate(${x}, ${y})`}
            onClick={handleClick}
            style={{ cursor: disabled ? 'not-allowed' : 'pointer' }}
            aria-label={ariaLabel}
            aria-disabled={disabled}
        >
            <rect
                x={-10}
                y={-10}
                width={20}
                height={20}
                rx={4}
                ry={4}
                fill={disabled ? '#f5f5f5' : 'white'}
                stroke="#000"
                strokeWidth={1}
            />
            <text
                x={0}
                y={0}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={12}
                fill={disabled ? '#999' : 'black'}
                pointerEvents="none"
            >
                {label}
            </text>
        </g>
    )
}

export function NodeActions(props: NodeActionsProps) {
    const {
        x,
        y,
        onMoveUp,
        onMoveDown,
        onDelete,
        disableMoveUp = false,
        disableMoveDown = false,
    } = props

    return (
        <g aria-label="节点操作">
            <ActionButton
                x={x}
                y={y - 24}
                label="↑"
                ariaLabel="上移"
                onClick={onMoveUp}
                disabled={disableMoveUp}
            />
            <ActionButton
                x={x}
                y={y}
                label="↓"
                ariaLabel="下移"
                onClick={onMoveDown}
                disabled={disableMoveDown}
            />
            <ActionButton
                x={x}
                y={y + 24}
                label="×"
                ariaLabel="删除"
                onClick={onDelete}
            />
        </g>
    )
}