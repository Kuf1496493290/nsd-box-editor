import type { MouseEvent as ReactMouseEvent } from 'react'
import type { LayoutBox } from '../layout/layoutTypes'
import type { StyleConfig } from '../app/types'

type RenderProcessProps = Readonly<{
    box: LayoutBox
    style: StyleConfig
    selected: boolean
    onSelect: () => void
    onDoubleClick: () => void
}>

export function RenderProcess(props: RenderProcessProps) {
    const { box, style, selected, onSelect, onDoubleClick } = props
    const node = box.node
    if (node.type !== 'process') return null

    const textX = box.x + box.width / 2
    const textY = box.y + box.height / 2

    function handleClick(event: ReactMouseEvent<SVGGElement>) {
        event.stopPropagation()
        onSelect()
    }

    function handleDoubleClick(event: ReactMouseEvent<SVGGElement>) {
        event.stopPropagation()
        onDoubleClick()
    }

    return (
        <g onClick={handleClick} onDoubleClick={handleDoubleClick} style={{ cursor: 'pointer' }}>
            <rect
                x={box.x}
                y={box.y}
                width={box.width}
                height={box.height}
                fill="white"
                stroke="black"
                strokeWidth={style.lineWidth}
            />

            {selected ? (
                <rect
                    x={box.x + 3}
                    y={box.y + 3}
                    width={Math.max(0, box.width - 6)}
                    height={Math.max(0, box.height - 6)}
                    fill="none"
                    stroke="black"
                    strokeWidth={1}
                    strokeDasharray="4 3"
                    pointerEvents="none"
                />
            ) : null}

            <text
                x={textX}
                y={textY}
                textAnchor="middle"
                dominantBaseline="middle"
                fontFamily={style.fontFamily}
                fontSize={style.fontSize}
                fill="black"
            >
                {node.text}
            </text>
        </g>
    )
}