import type { LoopNode, SequenceNode, StyleConfig } from '../app/types'
import type { LayoutBox } from './layoutTypes'
import { loopArmSize, relaxedRequiredWidth, requiredLoopSide, softMinHeight, softMinWidth } from './layoutCommon'

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
    if (node.body.children.length <= 0) return softMinHeight(style)

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


let activeLoopSquareSideCache: Map<string, number> | null = null

/**
 * 在一次 layoutRoot 会话内复用 loop 的 squareSide 计算（涉及 fullRelaxStyle 下的 body 探测，开销大）。
 */
export function withLoopSquareSideCache<T>(run: () => T): T {
    const prev = activeLoopSquareSideCache
    activeLoopSquareSideCache = new Map<string, number>()
    try {
        return run()
    } finally {
        activeLoopSquareSideCache = prev
    }
}

/**
 * 计算 LOOP 节点布局，确保内孔宽高满足主体内容与方形约束。
 * widthRelax/heightRelax=1 时退化为完全方形行为，=0 时退化为最小内容尺寸。
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

    const forcedW = forcedWidth === undefined ? 0 : Math.max(0, Math.ceil(forcedWidth))
    const forcedH = forcedHeight === undefined ? 0 : Math.max(0, Math.ceil(forcedHeight))

    /*
     * 设计语义：
     * - 默认 widthRelax=heightRelax=1 时，loop 必须为正方形（除非"无解"）。
     * - widthRelax 滑下来：只缩 width，最低到 canonicalContentW。
     * - heightRelax 滑下来：只缩 height，最低到 canonicalContentH。
     * - 两边滑动应严格独立——动 width 不能带 height。
     *
     * squareSide 必须满足：
     *   1) 不依赖当前 widthRelax/heightRelax 实际值（否则两轴互相牵动）；
     *   2) 等于"完全松弛(widthRelax=1)时的内禀宽度"，并尊重父序列给到的可用宽度；
     *      这样顶层新增 while 不会被收成 x/2，而是在 (1,1) 时 width=height=squareSide。
     * 实现：用一份临时的 fullRelaxStyle（widthRelax=1）跑一次 convergeLoopWidthByBodyWidth +
     * widenLoopToSquareIfPossible，得到 fullRelaxIntrinsicW；它只反映节点自身的"等宽展开后的宽度"，
     * forcedW 只作为最终方形参照的下限，不参与 fullRelaxIntrinsicW 的递归探测，避免回流污染。
     *
     * canonicalContentW/H 用作两滑块的"最低端"参考，是节点自身的最紧凑几何下限。
     */
    const canonicalBodyW = node.body.children.length === 0 ? softMinWidth(style) : Math.ceil(relaxedRequiredWidth(node.body, style, depth + 1))
    const canonicalContentW = Math.max(Math.ceil(relaxedRequiredWidth(node, style, depth)), Math.ceil(a + canonicalBodyW))
    const canonicalHoleW = Math.max(0, canonicalContentW - a)
    const canonicalBodyH = probeLoopBodyMinHeight(node, style, depth, canonicalHoleW, layoutSequence)
    const canonicalContentH = Math.max(0, Math.ceil(a + canonicalBodyH))

    const fullRelaxStyle: StyleConfig = { ...style, widthRelax: 1, heightRelax: 1 }
    const squareSideCacheKey = `${node.id}|${depth}|${forcedW}`
    const cachedSquareSide = activeLoopSquareSideCache?.get(squareSideCacheKey)
    let fullRelaxConvergedW: number
    let fullRelaxSquareW: number
    if (cachedSquareSide !== undefined) {
        fullRelaxConvergedW = cachedSquareSide
        fullRelaxSquareW = cachedSquareSide
    } else {
        // fullRelax 下需要重新算参考 baseW（用 fullRelaxStyle 重新执行 requiredLoopSide 的逻辑）
        const fullRelaxBaseW = Math.max(0, Math.ceil(requiredLoopSide(node, fullRelaxStyle, depth)))
        fullRelaxConvergedW = Math.ceil(convergeLoopWidthByBodyWidth({
            node, style: fullRelaxStyle, depth,
            startWidth: fullRelaxBaseW, baseW: fullRelaxBaseW, forcedW: 0, a, layoutSequence,
        }))
        fullRelaxSquareW = Math.ceil(widenLoopToSquareIfPossible({
            node, style: fullRelaxStyle, depth,
            width: fullRelaxConvergedW, baseW: fullRelaxBaseW, forcedW: 0, a, layoutSequence,
        }))
        activeLoopSquareSideCache?.set(squareSideCacheKey, Math.max(fullRelaxConvergedW, fullRelaxSquareW))
    }
    const squareSide = Math.max(canonicalContentW, canonicalContentH, fullRelaxConvergedW, fullRelaxSquareW, forcedW)

    const tW = style.widthRelax
    const widthFromRelax = Math.max(canonicalContentW, Math.ceil(canonicalContentW + (squareSide - canonicalContentW) * tW))
    // widthFromRelax 已经是松弛决定的最终值。只在低于 baseW 时补齐 baseW。
    // 绝不用 max(forcedW, contentWidth, squareWidth) 因为那些会破坏正方形约束（tW=tH=1 时 width == height == squareSide）。
    const width = Math.max(widthFromRelax, canonicalContentW, forcedW)

    const tH = style.heightRelax
    const heightFromRelax = Math.max(canonicalContentH, Math.ceil(canonicalContentH + (squareSide - canonicalContentH) * tH))
    const heightBase = Math.max(heightFromRelax, forcedH, canonicalContentH)

    const holeW = Math.max(0, width - a)
    const minBodyH = probeLoopBodyMinHeight(node, style, depth, holeW, layoutSequence)
    // 兜底：body 在此 holeW 上可能要求更多高度，但总高也要尊松弛指示，不能被无限拉大。
    const finalHeight = Math.max(heightBase, Math.ceil(a + minBodyH))
    const holeH = Math.max(0, finalHeight - a)

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
        height: finalHeight,
        children: [bodyBox],
    }
}
