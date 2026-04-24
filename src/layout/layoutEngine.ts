import type { NsdNode, SequenceNode, StyleConfig } from '../app/types'
import type { LayoutBox } from './layoutTypes'
import {
    baseBlockHeight,
    baseBlockWidth,
    distributeSlots,
    isLoopOnlyTopLevelSequence,
    requiredWidth,
    softMinHeight,
    softMinWidth,
    sumNumbers,
    withRequiredWidthCache,
} from './layoutCommon'
import { layoutCaseNode, layoutIfNode } from './layoutBranchLayout'
import { withBranchAnalysisCache } from './layoutBranchHelpers'
import { layoutLoopNode } from './layoutLoopLayout'
import { perfLogDuration, perfNow } from '../utils/perf'

const BORDER_GAP = 0
let activeLayoutNodeCache: Map<string, LayoutBox> | null = null
let activeNaturalSequenceCache: Map<string, LayoutBox[]> | null = null

function layoutNodeCacheKey(node: NsdNode, depth: number, forcedWidth?: number, forcedHeight?: number): string {
    const widthKey = forcedWidth === undefined ? 'u' : String(Math.max(0, Math.ceil(forcedWidth)))
    const heightKey = forcedHeight === undefined ? 'u' : String(Math.max(0, Math.ceil(forcedHeight)))
    return `${node.id}|${depth}|${widthKey}|${heightKey}`
}

function cloneLayoutBox(box: LayoutBox): LayoutBox {
    return {
        ...box,
        children: box.children.map((child) => cloneLayoutBox(child)),
        meta: box.meta ? { ...box.meta } : box.meta,
    }
}

function withLayoutNodeCache<T>(run: () => T): T {
    const prevLayoutNodeCache = activeLayoutNodeCache
    const prevNaturalSequenceCache = activeNaturalSequenceCache
    activeLayoutNodeCache = new Map<string, LayoutBox>()
    activeNaturalSequenceCache = new Map<string, LayoutBox[]>()

    try {
        return run()
    } finally {
        activeLayoutNodeCache = prevLayoutNodeCache
        activeNaturalSequenceCache = prevNaturalSequenceCache
    }
}

function naturalSequenceCacheKey(node: SequenceNode, depth: number, width: number): string {
    return `${node.id}|${depth}|${Math.max(0, Math.ceil(width))}`
}

function cloneLayoutBoxes(boxes: ReadonlyArray<LayoutBox>): LayoutBox[] {
    return boxes.map((b) => cloneLayoutBox(b))
}

function layoutProcessAtWidth(
    node: Extract<NsdNode, { type: 'process' }>,
    style: StyleConfig,
    width: number,
    forcedHeight?: number,
): LayoutBox {
    const minH = baseBlockHeight(style)
    const h = Math.max(minH, Math.ceil(forcedHeight ?? minH))

    return {
        id: node.id,
        node,
        x: 0,
        y: 0,
        width,
        height: h,
        children: [],
    }
}

function stackChildrenAtTop(childBoxes: LayoutBox[]): number {
    let y = 0
    for (const c of childBoxes) {
        c.x = 0
        c.y = y
        y += c.height + BORDER_GAP
    }
    return childBoxes.reduce((sum, c) => sum + c.height, 0) + Math.max(0, childBoxes.length - 1) * BORDER_GAP
}

function buildNaturalSequenceBoxes(
    node: SequenceNode,
    style: StyleConfig,
    depth: number,
    width: number,
): LayoutBox[] {
    const w = Math.max(0, Math.ceil(width))
    const cache = activeNaturalSequenceCache
    const cacheKey = cache ? naturalSequenceCacheKey(node, depth, w) : null

    if (cache && cacheKey) {
        const cached = cache.get(cacheKey)
        if (cached) return cloneLayoutBoxes(cached)
    }

    const boxes = node.children.map((c) => {
        const childW = childForcedWidthInSequence(node, depth, c, w)
        return layoutNode(c, style, depth, childW)
    })

    if (cache && cacheKey) cache.set(cacheKey, cloneLayoutBoxes(boxes))
    return boxes
}

function layoutSequenceChildAtSlot(params: Readonly<{
    seq: SequenceNode
    child: NsdNode
    style: StyleConfig
    depth: number
    seqWidth: number
    slotH: number
    y: number
    out: LayoutBox[]
}>): number {
    const { seq, child, style, depth, seqWidth, slotH, y, out } = params
    const w = Math.max(0, Math.ceil(seqWidth))
    const h = Math.max(0, Math.ceil(slotH))

    const childW = childForcedWidthInSequence(seq, depth, child, w)
    const box = layoutNode(child, style, depth, childW, h)
    box.x = 0
    box.y = y
    out.push(box)

    return y + h + BORDER_GAP
}

function buildForcedSequenceBoxes(
    node: SequenceNode,
    style: StyleConfig,
    depth: number,
    width: number,
    totalH: number,
): LayoutBox[] {
    const w = Math.max(0, Math.ceil(width))
    const slots = distributeSlots(totalH, node.children.length)
    const childBoxes: LayoutBox[] = []
    let y = 0

    for (let i = 0; i < node.children.length; i += 1) {
        const child = node.children[i]
        const slotH = slots[i] ?? 0

        y = layoutSequenceChildAtSlot({
            seq: node,
            child,
            style,
            depth,
            seqWidth: w,
            slotH,
            y,
            out: childBoxes,
        })
    }

    return childBoxes
}

type ConvergedSequence = Readonly<{
    width: number
    naturalBoxes: LayoutBox[]
}>

function isShrinkCandidateLoop(node: Extract<NsdNode, { type: 'loop' }>): boolean {
    if (node.body.children.length < 2) return false
    return node.body.children.every((c) => c.type === 'loop')
}

function hasTopLevelShrinkDriver(node: SequenceNode, depth: number): boolean {
    if (depth !== 0) return false
    return node.children.some((c) => c.type === 'loop' && isShrinkCandidateLoop(c))
}

function computeSequenceTargetWidth(node: SequenceNode, style: StyleConfig, depth: number, forcedWidth?: number): number {
    const softMin = softMinWidth(style)
    const x = baseBlockWidth(style)

    if (node.children.length === 0) {
        const base = depth === 0 ? x : softMin
        return Math.ceil(Math.max(base, forcedWidth ?? 0))
    }

    const childNeeds = node.children.map((c) => requiredWidth(c, style, depth))

    if (depth > 0 && isLoopOnlyTopLevelSequence(node)) {
        return Math.ceil(Math.max(Math.max(...childNeeds), forcedWidth ?? 0))
    }

    if (depth === 0) {
        const hasShrinkDriver = hasTopLevelShrinkDriver(node, depth)
        const base = hasShrinkDriver ? Math.max(softMin, ...childNeeds) : Math.max(x, ...childNeeds)
        return Math.ceil(Math.max(base, forcedWidth ?? 0))
    }

    const base = Math.max(softMin, ...childNeeds)
    return Math.ceil(Math.max(base, forcedWidth ?? 0))
}

/**
 * 在有限轮次内收敛序列宽度，直到自然布局不再推动宽度继续增长。
 */
function convergeSequenceWidth(
    node: SequenceNode,
    style: StyleConfig,
    depth: number,
    startWidth: number,
    passes: number,
): ConvergedSequence {
    const start = perfNow()
    let width = Math.max(0, Math.ceil(startWidth))
    const maxPasses = Math.max(1, Math.min(6, Math.floor(passes)))

    for (let pass = 0; pass < maxPasses; pass += 1) {
        const naturalBoxes = buildNaturalSequenceBoxes(node, style, depth, width)
        const maxNaturalW = Math.max(width, ...naturalBoxes.map((b) => Math.max(0, Math.ceil(b.width))))
        if (maxNaturalW > width) {
            width = Math.ceil(maxNaturalW)
            continue
        }

        perfLogDuration('layout.convergeSequenceWidth', start, {
            depth,
            childCount: node.children.length,
            passes: pass + 1,
        })
        return { width, naturalBoxes }
    }

    const naturalBoxes = buildNaturalSequenceBoxes(node, style, depth, width)
    perfLogDuration('layout.convergeSequenceWidth', start, {
        depth,
        childCount: node.children.length,
        passes: maxPasses,
        hitMaxPasses: true,
    })
    return { width, naturalBoxes }
}

function buildEmptySequenceBox(node: SequenceNode, width: number, forcedHeight?: number): LayoutBox {
    const h = forcedHeight === undefined ? 0 : Math.max(0, Math.ceil(forcedHeight))
    return {
        id: node.id,
        node,
        x: 0,
        y: 0,
        width: Math.max(0, Math.ceil(width)),
        height: h,
        children: [],
    }
}

function isMixedTopLevelSequence(node: SequenceNode): boolean {
    const hasLoop = node.children.some((c) => c.type === 'loop')
    const hasNonLoop = node.children.some((c) => c.type !== 'loop')
    return hasLoop && hasNonLoop
}

type MixedSlotPlan = Readonly<{
    totalH: number
    slots: number[]
}>

function childForcedWidthInSequence(
    _seq: SequenceNode,
    _depth: number,
    _child: NsdNode,
    seqWidth: number,
): number {
    return seqWidth
}

function computeMixedSlotPlan(node: SequenceNode, naturalBoxes: LayoutBox[], forcedTotalH: number): MixedSlotPlan {
    const minHeights = naturalBoxes.map((b) => Math.max(0, Math.ceil(b.height)))
    const minSum = sumNumbers(minHeights) + Math.max(0, node.children.length - 1) * BORDER_GAP

    const totalH = Math.max(Math.max(0, Math.ceil(forcedTotalH)), Math.ceil(minSum))
    const extra = Math.max(0, Math.ceil(totalH - minSum))
    const slots = minHeights.slice()

    if (extra <= 0) return { totalH, slots }

    const loopIndices: number[] = []
    for (let i = 0; i < node.children.length; i += 1) {
        if (node.children[i]?.type === 'loop') loopIndices.push(i)
    }
    if (loopIndices.length <= 0) return { totalH, slots }

    const extraSlots = distributeSlots(extra, loopIndices.length)
    for (let i = 0; i < loopIndices.length; i += 1) {
        const idx = loopIndices[i]
        slots[idx] = Math.max(0, Math.ceil((slots[idx] ?? 0) + (extraSlots[i] ?? 0)))
    }

    return { totalH, slots }
}

function buildCustomSlotSequenceBoxes(
    node: SequenceNode,
    style: StyleConfig,
    depth: number,
    width: number,
    slots: number[],
): LayoutBox[] {
    const w = Math.max(0, Math.ceil(width))
    const childBoxes: LayoutBox[] = []
    let y = 0

    for (let i = 0; i < node.children.length; i += 1) {
        const child = node.children[i]
        const slotH = Math.max(0, Math.ceil(slots[i] ?? 0))

        y = layoutSequenceChildAtSlot({
            seq: node,
            child,
            style,
            depth,
            seqWidth: w,
            slotH,
            y,
            out: childBoxes,
        })
    }

    return childBoxes
}

function computeEqualSlotTotalHeight(naturalBoxes: LayoutBox[], forcedTotalH: number): number {
    const maxMinH = Math.max(0, ...naturalBoxes.map((b) => Math.max(0, Math.ceil(b.height))))
    const equalNeed = Math.ceil(naturalBoxes.length * maxMinH)
    return Math.max(Math.max(0, Math.ceil(forcedTotalH)), equalNeed)
}

/**
 * 对不含 loop 的强制序列，按各子节点自然最小高度分配槽位，多余空间优先给 process 节点。
 */
function computeNonLoopForcedSlots(
    node: SequenceNode,
    style: StyleConfig,
    naturalBoxes: LayoutBox[],
    totalH: number,
): number[] {
    const minH = softMinHeight(style)
    const mins = naturalBoxes.map((b) => Math.max(minH, Math.ceil(b.height)))
    const minSum = sumNumbers(mins)
    const extra = Math.max(0, totalH - minSum)
    const slots = mins.slice()
    if (extra <= 0) return slots

    const supportIndices: number[] = []
    for (let i = 0; i < node.children.length; i += 1) {
        if (node.children[i]?.type === 'process') supportIndices.push(i)
    }

    const targets = supportIndices.length > 0 ? supportIndices : node.children.map((_, i) => i)
    const extraSlots = distributeSlots(extra, targets.length)
    for (let i = 0; i < targets.length; i += 1) {
        slots[targets[i]] = Math.max(0, (slots[targets[i]] ?? 0) + (extraSlots[i] ?? 0))
    }
    return slots
}

function layoutSequenceNaturalResolved(node: SequenceNode, width: number, naturalBoxes: LayoutBox[]): LayoutBox {
    const w = Math.max(0, Math.ceil(width))
    const h = stackChildrenAtTop(naturalBoxes)
    return {
        id: node.id,
        node,
        x: 0,
        y: 0,
        width: w,
        height: Math.max(0, Math.ceil(h)),
        children: naturalBoxes,
    }
}

function layoutSequenceForcedResolved(
    node: SequenceNode,
    style: StyleConfig,
    depth: number,
    width: number,
    forcedTotalH: number,
    naturalBoxes: LayoutBox[],
): LayoutBox {
    const w = Math.max(0, Math.ceil(width))
    const forcedH = Math.max(0, Math.ceil(forcedTotalH))

    if (isMixedTopLevelSequence(node)) {
        const plan = computeMixedSlotPlan(node, naturalBoxes, forcedH)
        const children = buildCustomSlotSequenceBoxes(node, style, depth, w, plan.slots)
        return { id: node.id, node, x: 0, y: 0, width: w, height: Math.max(0, Math.ceil(plan.totalH)), children }
    }

    const hasAnyLoop = node.children.some((c) => c.type === 'loop')
    if (!hasAnyLoop) {
        // Non-loop children: respect natural minimum heights and distribute extra to support nodes
        const minSum = sumNumbers(naturalBoxes.map((b) => Math.max(softMinHeight(style), Math.ceil(b.height))))
        const totalH = Math.max(forcedH, Math.ceil(minSum))
        const slots = computeNonLoopForcedSlots(node, style, naturalBoxes, totalH)
        const children = buildCustomSlotSequenceBoxes(node, style, depth, w, slots)
        return { id: node.id, node, x: 0, y: 0, width: w, height: Math.max(0, Math.ceil(totalH)), children }
    }

    // All-loop sequences: equalize all slots to the tallest
    const totalH = computeEqualSlotTotalHeight(naturalBoxes, forcedH)
    const children = buildForcedSequenceBoxes(node, style, depth, w, totalH)
    return { id: node.id, node, x: 0, y: 0, width: w, height: Math.max(0, Math.ceil(totalH)), children }
}

function layoutSequence(
    node: SequenceNode,
    style: StyleConfig,
    depth: number,
    forcedWidth?: number,
    forcedHeight?: number,
): LayoutBox {
    const targetW = computeSequenceTargetWidth(node, style, depth, forcedWidth)

    if (node.children.length === 0) {
        return buildEmptySequenceBox(node, targetW, forcedHeight)
    }

    const converged = convergeSequenceWidth(node, style, depth, targetW, 4)

    if (forcedHeight === undefined) {
        return layoutSequenceNaturalResolved(node, converged.width, converged.naturalBoxes)
    }

    const forcedTotalH = Math.max(0, Math.ceil(forcedHeight))
    return layoutSequenceForcedResolved(node, style, depth, converged.width, forcedTotalH, converged.naturalBoxes)
}

function layoutNode(node: NsdNode, style: StyleConfig, depth: number, forcedWidth?: number, forcedHeight?: number): LayoutBox {
    const cache = activeLayoutNodeCache
    const cacheKey = cache ? layoutNodeCacheKey(node, depth, forcedWidth, forcedHeight) : null
    if (cache && cacheKey) {
        const cached = cache.get(cacheKey)
        if (cached) return cloneLayoutBox(cached)
    }

    const need = requiredWidth(node, style, depth)
    const w = Math.max(need, forcedWidth ?? 0)

    let box: LayoutBox

    if (node.type === 'process') {
        box = layoutProcessAtWidth(node, style, w, forcedHeight)
    } else if (node.type === 'sequence') {
        box = layoutSequence(node, style, depth, w, forcedHeight)
    } else if (node.type === 'if') {
        box = layoutIfNode({ node, style, depth, forcedWidth: w, forcedHeight, layoutNode })
    } else if (node.type === 'case') {
        box = layoutCaseNode({ node, style, depth, forcedWidth: w, forcedHeight, layoutNode })
    } else if (node.type === 'loop') {
        box = layoutLoopNode({ node, style, depth, forcedWidth: w, forcedHeight, layoutSequence })
    } else {
        throw new Error('Unsupported node type')
    }

    if (cache && cacheKey) cache.set(cacheKey, cloneLayoutBox(box))
    return box
}

/**
 * 计算整棵根序列布局，并保证画布最小可见尺寸。
 */
export function layoutRoot(root: SequenceNode, style: StyleConfig): LayoutBox {
    const start = perfNow()
    const box = withRequiredWidthCache(() => withBranchAnalysisCache(() => withLayoutNodeCache(() => layoutSequence(root, style, 0))))
    box.x = 0
    box.y = 0
    const rootMinW = Math.max(48, Math.ceil(style.minBlockWidth / 4))
    box.width = Math.max(box.width, rootMinW)
    box.height = Math.max(box.height, style.fontSize * 2)

    perfLogDuration('layout.layoutRoot', start, {
        topLevelChildren: root.children.length,
        width: box.width,
        height: box.height,
    })
    return box
}