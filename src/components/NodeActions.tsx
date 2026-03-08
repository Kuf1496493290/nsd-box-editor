import type { MouseEvent as ReactMouseEvent } from 'react'

type NodeActionsProps = Readonly<{
    x: number
    y: number
    onDelete: () => void
    disabled?: boolean
}>

export function NodeActions(props: NodeActionsProps) {
    const { x, y, onDelete, disabled = false } = props

    function handleClick(event: ReactMouseEvent<SVGGElement>) {
        event.stopPropagation()
        if (disabled) return
        onDelete()
    }

    return (
        <g
            transform={`translate(${x}, ${y})`}
            onClick={handleClick}
            style={{ cursor: disabled ? 'not-allowed' : 'pointer' }}
            aria-label="删除"
            aria-disabled={disabled}
        >
            <circle cx={0} cy={0} r={10} fill={disabled ? '#f5f5f5' : 'white'} stroke="black" strokeWidth={1} />
            <line x1={-4} y1={-4} x2={4} y2={4} stroke={disabled ? '#999' : 'black'} strokeWidth={1.5} pointerEvents="none" />
            <line x1={-4} y1={4} x2={4} y2={-4} stroke={disabled ? '#999' : 'black'} strokeWidth={1.5} pointerEvents="none" />
        </g>
    )
}