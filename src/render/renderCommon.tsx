// FILE: src/render/renderCommon.tsx
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react'
import type { StyleConfig } from '../app/types'
import type { LayoutBox } from '../layout/layoutTypes'

export function renderSelectionOutline(isSelected: boolean, box: LayoutBox): ReactNode {
    if (!isSelected) return null

    return (
        <rect
            x={box.x + 4}
            y={box.y + 4}
            width={Math.max(0, box.width - 8)}
            height={Math.max(0, box.height - 8)}
            fill="none"
            stroke="black"
            strokeWidth={1}
            strokeDasharray="6 4"
            pointerEvents="none"
        />
    )
}

export function renderSelectableLabel(params: Readonly<{
    x: number
    y: number
    w: number
    h: number
    textX: number
    textY: number
    text: string
    style: StyleConfig
    selected: boolean
    onClick: (event: ReactMouseEvent<SVGGElement>) => void
}>): ReactNode {
    const { x, y, w, h, textX, textY, text, style, selected, onClick } = params

    return (
        <g onClick={onClick} style={{ cursor: 'pointer' }}>
            <rect x={x} y={y} width={w} height={h} fill="transparent" />

            {selected ? (
                <rect
                    x={x + 3}
                    y={y + 3}
                    width={Math.max(0, w - 6)}
                    height={Math.max(0, h - 6)}
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
                pointerEvents="none"
            >
                {text}
            </text>
        </g>
    )
}

export function renderSelectablePlaceholder(params: Readonly<{
    x: number
    y: number
    w: number
    h: number
    selected: boolean
    noDrag?: boolean
    onClick: (event: ReactMouseEvent<SVGGElement>) => void
}>): ReactNode {
    const { x, y, w, h, selected, noDrag = false, onClick } = params
    if (h <= 0) return null

    return (
        <g onClick={onClick} style={{ cursor: 'pointer' }} data-no-drag={noDrag ? '1' : undefined}>
            <rect x={x} y={y} width={w} height={h} fill="transparent" />

            {selected ? (
                <rect
                    x={x + 3}
                    y={y + 3}
                    width={Math.max(0, w - 6)}
                    height={Math.max(0, h - 6)}
                    fill="none"
                    stroke="black"
                    strokeWidth={1}
                    strokeDasharray="4 3"
                    pointerEvents="none"
                />
            ) : null}

            <rect
                x={x + 2}
                y={y + 2}
                width={Math.max(0, w - 4)}
                height={Math.max(0, h - 4)}
                fill="none"
                stroke="black"
                strokeWidth={1}
                strokeDasharray="3 3"
                opacity={0.35}
                pointerEvents="none"
            />
        </g>
    )
}

export function polygonPath(points: ReadonlyArray<readonly [number, number]>): string {
    if (points.length <= 0) return ''
    const [x0, y0] = points[0]
    const rest = points.slice(1).map(([x, y]) => `L ${x} ${y}`).join(' ')
    return `M ${x0} ${y0} ${rest} Z`
}

export function dashedPolygonOutline(points: ReadonlyArray<readonly [number, number]>): ReactNode {
    const d = polygonPath(points)
    if (!d) return null
    return (
        <path
            d={d}
            fill="none"
            stroke="black"
            strokeWidth={1}
            strokeDasharray="4 3"
            pointerEvents="none"
        />
    )
}

export function lineBoxHeight(fontSize: number): number {
    return Math.ceil(fontSize * 1.2)
}

export function safePad(value: number): number {
    return Math.max(1, Math.ceil(value))
}

function processPadY(style: StyleConfig): number {
    return safePad(style.paddingProcessY ?? 9)
}

/**
 * y：初始化矩形固定高度（与 layoutEngine 口径一致）
 */
export function baseBlockHeight(style: StyleConfig): number {
    const processPad = processPadY(style)
    return Math.ceil(lineBoxHeight(style.fontSize) + processPad * 2)
}

/**
 * LOOP 内边距 a：固定等于 y
 */
export function loopArmSize(style: StyleConfig): number {
    return baseBlockHeight(style)
}