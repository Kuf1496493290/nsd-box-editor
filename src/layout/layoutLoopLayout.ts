import type { LoopNode, SequenceNode, StyleConfig } from '../app/types'
import type { LayoutBox } from './layoutTypes'
import { loopArmSize, requiredLoopSide } from './layoutCommon'

type LayoutSequenceFn = (
    node: SequenceNode,
    style: StyleConfig,
    depth: number,
    forcedWidth?: number,
    forcedHeight?: number,
) => LayoutBox

function probeLoopBodyMinHeight(
    node: LoopNode,
    style: StyleConfig,
    depth: number,
    holeW: number,
    layoutSequence: LayoutSequenceFn,
): number {
    if (node.body.children.length <= 0) return 0

    const w = Math.max(0, Math.ceil(holeW))
    // Use natural layout (no forced height) to avoid equal-slot inflation
    const probe = layoutSequence(node.body, style, depth + 1, w)
    return Math.max(0, Math.ceil(probe.height))
}

function convergeLoopWidthByBodyWidth(params: Readonly<{
    node: LoopNode
    style: StyleConfig
    depth: number
    startWidth: number
    baseW: number
    forcedW: number
    a: number
    layoutSequence: LayoutSequenceFn
}>): number {
    const { node, style, depth, startWidth, baseW, forcedW, a, layoutSequence } = params
    let width = Math.max(0, Math.ceil(startWidth))

    if (node.body.children.length <= 0) return width

    for (let pass = 0; pass < 12; pass += 1) {
        const holeW0 = Math.max(0, width - a)
        const probe = layoutSequence(node.body, style, depth + 1, holeW0)
        const needHoleW = Math.max(holeW0, Math.max(0, Math.ceil(probe.width)))
        const nextW = Math.max(width, Math.ceil(a + needHoleW), baseW, forcedW)

        if (nextW <= width) break
        width = nextW
    }

    return width
}

function widenLoopToSquareIfPossible(params: Readonly<{
    node: LoopNode
    style: StyleConfig
    depth: number
    width: number
    baseW: number
    forcedW: number
    a: number
    layoutSequence: LayoutSequenceFn
}>): number {
    const { node, style, depth, baseW, forcedW, a, layoutSequence } = params
    const startW = Math.max(0, Math.ceil(params.width))

    if (node.body.children.length <= 0) return startW

    const holeW = Math.max(0, startW - a)
    const minBodyH = probeLoopBodyMinHeight(node, style, depth, holeW, layoutSequence)

    if (minBodyH <= holeW) return startW

    const candidateW = Math.max(startW, Math.ceil(a + minBodyH), baseW, forcedW)
    const holeW2 = Math.max(0, candidateW - a)
    const minBodyH2 = probeLoopBodyMinHeight(node, style, depth, holeW2, layoutSequence)

    return minBodyH2 <= holeW2 ? candidateW : startW
}

function resolveLoopHeight(params: Readonly<{
    width: number
    forcedH: number
    a: number
    minHoleHNeed: number
}>): number {
    const { width, forcedH, a, minHoleHNeed } = params
    const w = Math.max(0, Math.ceil(width))
    const fh = Math.max(0, Math.ceil(forcedH))
    const need = Math.max(0, Math.ceil(a + minHoleHNeed))

    return Math.ceil(Math.max(w, fh, need))
}

/**
 * 计算 LOOP 节点布局，确保内孔宽高满足主体内容与方形约束。
 */
export function layoutLoopNode(params: Readonly<{
    node: LoopNode
    style: StyleConfig
    depth: number
    forcedWidth?: number
    forcedHeight?: number
    layoutSequence: LayoutSequenceFn
}>): LayoutBox {
    const { node, style, depth, forcedWidth, forcedHeight, layoutSequence } = params

    const a = loopArmSize(style)
    const isWhile = node.loopKind === 'while'
    const holeX = isWhile ? a : 0
    const holeY = isWhile ? a : 0

    const baseW = Math.max(0, Math.ceil(requiredLoopSide(node, style, depth)))
    const forcedW = forcedWidth === undefined ? 0 : Math.max(0, Math.ceil(forcedWidth))
    const forcedH = forcedHeight === undefined ? 0 : Math.max(0, Math.ceil(forcedHeight))

    let width = Math.max(baseW, forcedW)
    width = convergeLoopWidthByBodyWidth({
        node,
        style,
        depth,
        startWidth: width,
        baseW,
        forcedW,
        a,
        layoutSequence,
    })
    width = widenLoopToSquareIfPossible({
        node,
        style,
        depth,
        width,
        baseW,
        forcedW,
        a,
        layoutSequence,
    })
    width = Math.max(0, Math.ceil(width))

    const holeW = Math.max(0, width - a)
    const minBodyH = probeLoopBodyMinHeight(node, style, depth, holeW, layoutSequence)
    const minHoleHNeed = Math.max(holeW, minBodyH)

    const height = resolveLoopHeight({ width, forcedH, a, minHoleHNeed })
    const holeH = Math.max(0, height - a)

    const bodyLayout =
        node.body.children.length === 0
            ? { id: node.body.id, node: node.body, x: 0, y: 0, width: holeW, height: holeH, children: [] }
            : layoutSequence(node.body, style, depth + 1, holeW, holeH)

    const bodyBox: LayoutBox = {
        ...bodyLayout,
        x: holeX,
        y: holeY,
        width: holeW,
        height: holeH,
    }

    return {
        id: node.id,
        node,
        x: 0,
        y: 0,
        width,
        height,
        children: [bodyBox],
    }
}