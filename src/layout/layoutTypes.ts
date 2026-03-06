// FILE: src/layout/layoutTypes.ts
import type { NsdNode } from '../app/types'

export type LayoutBoxMeta = Readonly<{
    headerH?: number
    labelH?: number
}>

export interface LayoutBox {
    id: string
    node: NsdNode
    x: number
    y: number
    width: number
    height: number
    children: LayoutBox[]
    meta?: LayoutBoxMeta
}