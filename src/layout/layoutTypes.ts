// FILE: src/layout/layoutTypes.ts
import type { NsdNode } from '../app/types'

export interface LayoutBox {
    id: string
    node: NsdNode
    x: number
    y: number
    width: number
    height: number
    children: LayoutBox[]
}