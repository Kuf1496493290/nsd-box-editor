import type { CaseNode, LoopNode, NsdNode, SequenceNode, StyleConfig } from '../app/types'
import { measureTextWidth } from './measure'

let activeRequiredWidthCache: Map<string, number> | null = null

function requiredWidthCacheKey(node: NsdNode, depth: number): string {
    return `${node.id}|${depth}`
}

export function withRequiredWidthCache<T>(run: () => T): T {
    const prev = activeRequiredWidthCache
    activeRequiredWidthCache = new Map<string, number>()

    try {
        return run()
    } finally {
        activeRequiredWidthCache = prev
    }
}

export function lineBoxHeight(fontSize: number): number {
    return Math.ceil(fontSize * 1.2)
}

export function safePad(value: number): number {
    return Math.max(1, Math.ceil(value))
}

export function measureTextWidthSafe(text: string, style: StyleConfig): number {
    const base = measureTextWidth(text || '', style)
    const margin = 1
    return base + margin
}

export function processPadY(style: StyleConfig): number {
    return safePad(style.paddingProcessY)
}

export function processPadX(style: StyleConfig): number {
    return safePad(style.paddingProcessX)
}

export function baseBlockHeight(style: StyleConfig): number {
    const processPad = processPadY(style)
    return Math.ceil(lineBoxHeight(style.fontSize) + processPad * 2)
}

export function baseBlockWidth(style: StyleConfig): number {
    return Math.ceil(style.minBlockWidth)
}

export function loopArmSize(style: StyleConfig): number {
    return baseBlockHeight(style)
}

export function minLoopSide(style: StyleConfig): number {
    const x = baseBlockWidth(style)
    const a = loopArmSize(style)
    return Math.max(Math.ceil(x / 2), 2 * a)
}

export function softMinWidth(style: StyleConfig): number {
    const x = baseBlockWidth(style)
    return Math.max(48, Math.ceil(x / 4))
}

export function isLoopOnlyTopLevelSequence(node: SequenceNode): boolean {
    if (node.children.length <= 0) return false
    return node.children.every((c) => c.type === 'loop')
}

export function getCaseLabels(node: CaseNode): string[] {
    if (node.branchLabels.length === node.branches.length) return node.branchLabels
    return node.branches.map((_, i) => node.branchLabels[i] ?? String(i + 1))
}

export function sumNumbers(values: number[]): number {
    return values.reduce((s, v) => s + v, 0)
}

/**
 * 按比例扩展列宽，确保总宽不小于目标值。
 */
export function ensureMinTotalWidth(widths: number[], targetTotal: number): number[] {
    const w = widths.map((v) => Math.max(0, Math.ceil(v)))
    const cur = sumNumbers(w)
    if (cur >= targetTotal) return w

    const extra = targetTotal - cur
    const baseSum = cur

    if (baseSum <= 0) {
        const base = Math.floor(targetTotal / w.length)
        let rem = targetTotal - base * w.length
        return w.map(() => {
            const add = rem > 0 ? 1 : 0
            if (rem > 0) rem -= 1
            return base + add
        })
    }

    const out: number[] = []
    let used = 0
    for (let i = 0; i < w.length; i += 1) {
        if (i === w.length - 1) {
            out.push(w[i] + (extra - used))
            break
        }
        const add = Math.floor((extra * w[i]) / baseSum)
        out.push(w[i] + add)
        used += add
    }
    return out
}

/**
 * 计算 LOOP 节点最小边长需求，兼顾条件文本与 body 宽度。
 */
export function requiredLoopSide(node: LoopNode, style: StyleConfig, depth: number): number {
    const a = loopArmSize(style)
    const headerPad = safePad(style.paddingHeader)

    const conditionNeed = Math.ceil(measureTextWidthSafe(node.conditionText || '', style) + headerPad * 2)
    const baseMin = Math.max(minLoopSide(style), 2 * a, conditionNeed)

    if (node.body.children.length === 0) return baseMin

    const holeNeedW = requiredWidth(node.body, style, depth + 1)
    const sideNeed = Math.ceil(a + holeNeedW)

    return Math.max(baseMin, sideNeed)
}

function readRequiredWidthCache(node: NsdNode, depth: number): number | null {
    const cache = activeRequiredWidthCache
    if (!cache) return null

    const cacheKey = requiredWidthCacheKey(node, depth)
    const cached = cache.get(cacheKey)
    return cached === undefined ? null : cached
}

function writeRequiredWidthCache(node: NsdNode, depth: number, width: number): void {
    const cache = activeRequiredWidthCache
    if (!cache) return

    const cacheKey = requiredWidthCacheKey(node, depth)
    cache.set(cacheKey, width)
}

function requiredWidthForProcess(node: Extract<NsdNode, { type: 'process' }>, style: StyleConfig, softMin: number): number {
    const processPad = processPadX(style)
    const textW = measureTextWidthSafe(node.text || '', style)
    return Math.max(softMin, Math.ceil(textW + processPad * 2))
}

function requiredWidthForSequence(node: SequenceNode, style: StyleConfig, depth: number, softMin: number): number {
    if (node.children.length <= 0) return softMin

    const childReq = node.children.map((c) => requiredWidth(c, style, depth))
    if (depth > 0 && isLoopOnlyTopLevelSequence(node)) return Math.max(...childReq)
    return Math.max(softMin, ...childReq)
}

function requiredWidthForIf(node: Extract<NsdNode, { type: 'if' }>, style: StyleConfig, depth: number, softMin: number): number {
    const headerPad = safePad(style.paddingHeader)
    const labelPad = safePad(style.paddingBranchLabel)

    const conditionW = Math.ceil(measureTextWidthSafe(node.conditionText || '', style) + headerPad * 2)

    const trueLabel = node.boolLabelMode === 'YN' ? 'Y' : 'T'
    const falseLabel = node.boolLabelMode === 'YN' ? 'N' : 'F'
    const trueLabelNeed = Math.ceil(measureTextWidthSafe(trueLabel, style) + labelPad * 2)
    const falseLabelNeed = Math.ceil(measureTextWidthSafe(falseLabel, style) + labelPad * 2)

    const trueNeed = requiredWidth(node.trueBranch, style, depth + 1)
    const falseNeed = requiredWidth(node.falseBranch, style, depth + 1)

    const leftNeed = Math.max(softMinWidth(style), trueLabelNeed, trueNeed)
    const rightNeed = Math.max(softMinWidth(style), falseLabelNeed, falseNeed)

    return Math.max(softMin, conditionW, Math.ceil(leftNeed + rightNeed))
}

function requiredWidthForCase(node: Extract<NsdNode, { type: 'case' }>, style: StyleConfig, depth: number, softMin: number): number {
    const labels = getCaseLabels(node)
    const headerPad = safePad(style.paddingHeader)
    const labelPad = safePad(style.paddingBranchLabel)
    const conditionW = Math.ceil(measureTextWidthSafe(node.conditionText || '', style) + headerPad * 2)

    const branchNeeds = node.branches.map((b) => requiredWidth(b, style, depth + 1))
    const colNeeds = node.branches.map((_, i) => {
        const label = labels[i] ?? String(i + 1)
        const labelNeed = Math.ceil(measureTextWidthSafe(label, style) + labelPad * 2)
        const branchNeed = branchNeeds[i] ?? 0
        return Math.max(softMinWidth(style), labelNeed, branchNeed)
    })

    return Math.max(softMin, conditionW, Math.ceil(sumNumbers(colNeeds)))
}

function computeRequiredWidth(node: NsdNode, style: StyleConfig, depth: number): number {
    const softMin = softMinWidth(style)

    if (node.type === 'process') return requiredWidthForProcess(node, style, softMin)
    if (node.type === 'sequence') return requiredWidthForSequence(node, style, depth, softMin)
    if (node.type === 'if') return requiredWidthForIf(node, style, depth, softMin)
    if (node.type === 'case') return requiredWidthForCase(node, style, depth, softMin)
    if (node.type === 'loop') return requiredLoopSide(node, style, depth)

    return softMin
}

/**
 * 递归计算任意节点所需最小宽度，是布局阶段的核心输入。
 */
export function requiredWidth(node: NsdNode, style: StyleConfig, depth: number): number {
    const cached = readRequiredWidthCache(node, depth)
    if (cached !== null) return cached

    const result = computeRequiredWidth(node, style, depth)
    writeRequiredWidthCache(node, depth, result)
    return result
}

export function containsLoopDeep(node: NsdNode): boolean {
    if (node.type === 'loop') return true
    if (node.type === 'process') return false

    if (node.type === 'sequence') {
        return node.children.some((c) => containsLoopDeep(c))
    }

    if (node.type === 'if') {
        return containsLoopDeep(node.trueBranch) || containsLoopDeep(node.falseBranch)
    }

    if (node.type === 'case') {
        return node.branches.some((b) => containsLoopDeep(b))
    }

    return false
}

/**
 * 将总高度尽量均匀分配到 count 个槽位。
 */
export function distributeSlots(totalH: number, count: number): number[] {
    if (count <= 0) return []
    const base = Math.floor(totalH / count)
    let remainder = totalH - base * count

    const slots: number[] = []
    for (let i = 0; i < count; i += 1) {
        const extra = remainder > 0 ? 1 : 0
        if (remainder > 0) remainder -= 1
        slots.push(Math.max(0, base + extra))
    }
    return slots
}