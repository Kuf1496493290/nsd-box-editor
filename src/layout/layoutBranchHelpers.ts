import type { NsdNode, SequenceNode, StyleConfig } from '../app/types'
import type { LayoutBox } from './layoutTypes'
import {
    baseBlockHeight,
    distributeSlots,
    ensureMinTotalWidth,
    requiredLoopSide,
    sumNumbers,
} from './layoutCommon'

const BORDER_GAP = 0

export type LayoutNodeFn = (
    node: NsdNode,
    style: StyleConfig,
    depth: number,
    forcedWidth?: number,
    forcedHeight?: number,
) => LayoutBox

type BranchAnalysis = Readonly<{
    loopCount: number
    supportCount: number
    nonLoopCount: number
    nonLoopMinSum: number
    loopMaxMinSide: number
    minEqualSlotTotal: number
}>

type BodyDecision = Readonly<{
    bodyH: number
    nonLoopCore: number
    hasAnyLoop: boolean
    anyNonLoop: boolean
    anyMixed: boolean
    isCompetition: boolean
}>

export type StabilizeResult = Readonly<{
    widths: number[]
    analyses: BranchAnalysis[]
    decision: BodyDecision
}>

export type CaseHeightDecision = Readonly<{ headerH: number; labelH: number; bodyH: number }>

function analyzeBranchTopLevel(
    branch: SequenceNode,
    style: StyleConfig,
    depth: number,
    width: number,
    layoutNode: LayoutNodeFn,
): BranchAnalysis {
    if (branch.children.length === 0) {
        return {
            loopCount: 0,
            supportCount: 0,
            nonLoopCount: 0,
            nonLoopMinSum: 0,
            loopMaxMinSide: 0,
            minEqualSlotTotal: 0,
        }
    }

    const w = Math.max(0, Math.ceil(width))

    let loopCount = 0
    let supportCount = 0
    let nonLoopCount = 0
    let nonLoopMinSum = 0
    let loopMaxMinSide = 0
    let maxMinH = 0

    for (const child of branch.children) {
        if (child.type === 'loop') {
            const loopMin = Math.max(0, Math.ceil(requiredLoopSide(child, style, depth)))
            loopCount += 1
            loopMaxMinSide = Math.max(loopMaxMinSide, loopMin)
            maxMinH = Math.max(maxMinH, loopMin)
            continue
        }

        const box = layoutNode(child, style, depth, w)
        maxMinH = Math.max(maxMinH, Math.max(0, Math.ceil(box.height)))

        if (child.type === 'process') {
            supportCount += 1
            continue
        }

        nonLoopCount += 1
        nonLoopMinSum += box.height
    }

    return {
        loopCount,
        supportCount,
        nonLoopCount,
        nonLoopMinSum: Math.ceil(nonLoopMinSum),
        loopMaxMinSide: Math.ceil(loopMaxMinSide),
        minEqualSlotTotal: Math.ceil(Math.max(maxMinH, baseBlockHeight(style)) * branch.children.length),
    }
}

function computeFlexUnits(analysis: BranchAnalysis): number {
    if (analysis.loopCount <= 0) return 0
    return Math.max(0, analysis.loopCount + analysis.supportCount)
}

function computeBranchMinTotal(baseNeed: number, analysis: BranchAnalysis): number {
    const unitNeed = Math.max(0, Math.ceil(baseNeed), Math.ceil(analysis.loopMaxMinSide))

    const flexUnits = computeFlexUnits(analysis)
    if (flexUnits > 0) {
        return Math.ceil(analysis.nonLoopMinSum + flexUnits * unitNeed)
    }

    return Math.max(Math.ceil(analysis.nonLoopMinSum), Math.ceil(analysis.minEqualSlotTotal))
}

function computeBodyForAnalyses(params: Readonly<{
    y: number
    forcedBodyH: number
    analyses: BranchAnalysis[]
    baseNeeds: number[]
}>): BodyDecision {
    const { y, forcedBodyH, analyses, baseNeeds } = params

    const hasAnyLoop = analyses.some((a) => a.loopCount > 0)
    const anyNonLoop = analyses.some((a) => a.nonLoopCount > 0 || a.supportCount > 0)
    const anyMixed = analyses.some((a) => a.loopCount > 0 && (a.nonLoopCount > 0 || a.supportCount > 0))

    let bodyH = Math.max(0, Math.ceil(y), Math.max(0, Math.ceil(forcedBodyH)))

    for (let i = 0; i < analyses.length; i += 1) {
        const analysis = analyses[i]
        const baseNeed = Math.max(0, Math.ceil(baseNeeds[i] ?? 0))
        bodyH = Math.max(bodyH, computeBranchMinTotal(baseNeed, analysis))
    }

    return {
        bodyH: Math.ceil(bodyH),
        nonLoopCore: 0,
        hasAnyLoop,
        anyNonLoop,
        anyMixed,
        isCompetition: false,
    }
}

function layoutBranchChildAtSlot(params: Readonly<{
    child: NsdNode
    style: StyleConfig
    depth: number
    colW: number
    slotH: number
    y: number
    out: LayoutBox[]
    layoutNode: LayoutNodeFn
}>): number {
    const { child, style, depth, colW, slotH, y, out, layoutNode } = params
    const w = Math.max(0, Math.ceil(colW))
    const h = Math.max(0, Math.ceil(slotH))

    const box = layoutNode(child, style, depth, w, h)
    box.x = 0
    box.y = y
    if (box.node.type !== 'loop') box.width = w
    out.push(box)

    return y + h + BORDER_GAP
}

export function layoutBranchSequence(
    branch: SequenceNode,
    style: StyleConfig,
    depth: number,
    width: number,
    totalH: number,
    nonLoopTotalTarget: number,
    layoutNode: LayoutNodeFn,
): LayoutBox {
    const w = Math.max(0, Math.ceil(width))
    const h = Math.max(0, Math.ceil(totalH))

    if (branch.children.length === 0) {
        return { id: branch.id, node: branch, x: 0, y: 0, width: w, height: h, children: [] }
    }

    const analysis = analyzeBranchTopLevel(branch, style, depth, w, layoutNode)

    if (analysis.loopCount <= 0) {
        const slots = distributeSlots(h, branch.children.length)
        const boxes: LayoutBox[] = []
        let y = 0
        let index = 0

        for (const child of branch.children) {
            const slotH = slots[index] ?? 0
            index += 1

            y = layoutBranchChildAtSlot({
                child,
                style,
                depth,
                colW: w,
                slotH,
                y,
                out: boxes,
                layoutNode,
            })
        }

        return { id: branch.id, node: branch, x: 0, y: 0, width: w, height: h, children: boxes }
    }

    const nonLoopChildren = branch.children.filter((c) => c.type !== 'loop')
    const nonLoopMinHeights = nonLoopChildren.map((c) => layoutNode(c, style, depth, w).height)
    const supportFlags = nonLoopChildren.map((c) => c.type === 'process')

    let rigidMinSum = 0
    let supportMinSum = 0

    for (let i = 0; i < nonLoopChildren.length; i += 1) {
        const minH = Math.max(0, Math.ceil(nonLoopMinHeights[i] ?? 0))
        if (supportFlags[i]) supportMinSum += minH
        else rigidMinSum += minH
    }

    const targetNonLoop = Math.max(Math.ceil(rigidMinSum + supportMinSum), Math.max(0, Math.ceil(nonLoopTotalTarget)))

    const loopTotal = Math.max(0, h - targetNonLoop)
    const loopSlots = distributeSlots(loopTotal, analysis.loopCount)

    const supportIndices = supportFlags.map((isSupport, index) => (isSupport ? index : -1)).filter((index) => index >= 0)

    const extraSupport = Math.max(0, targetNonLoop - rigidMinSum - supportMinSum)
    const supportExtraSlots = distributeSlots(extraSupport, supportIndices.length)

    let loopIndex = 0
    let nonLoopIndex = 0
    let supportIndex = 0

    const boxes: LayoutBox[] = []
    let y = 0

    for (const child of branch.children) {
        if (child.type === 'loop') {
            const slotH = loopSlots[loopIndex] ?? 0
            loopIndex += 1

            y = layoutBranchChildAtSlot({ child, style, depth, colW: w, slotH, y, out: boxes, layoutNode })
            continue
        }

        const minH = Math.max(0, Math.ceil(nonLoopMinHeights[nonLoopIndex] ?? baseBlockHeight(style)))
        const isSupport = supportFlags[nonLoopIndex] ?? false
        nonLoopIndex += 1

        const slotH = isSupport ? Math.ceil(minH + (supportExtraSlots[supportIndex++] ?? 0)) : minH

        y = layoutBranchChildAtSlot({ child, style, depth, colW: w, slotH, y, out: boxes, layoutNode })
    }

    return { id: branch.id, node: branch, x: 0, y: 0, width: w, height: h, children: boxes }
}

function areSameWidths(a: number[], b: number[]): boolean {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i += 1) {
        if (Math.ceil(a[i] ?? 0) !== Math.ceil(b[i] ?? 0)) return false
    }
    return true
}

function equalizeBranchWidths(widths: number[], targetTotal: number): number[] {
    if (widths.length <= 0) return []

    const normalized = widths.map((v) => Math.max(0, Math.ceil(v)))
    const target = Math.max(0, Math.ceil(targetTotal))

    const perWidth = Math.max(Math.max(...normalized), Math.ceil(target / normalized.length))
    return normalized.map(() => perWidth)
}

function computeBaseNeeds(branches: SequenceNode[], baseNeedAt: (b: SequenceNode, i: number) => number): number[] {
    return branches.map((b, i) => Math.max(0, Math.ceil(baseNeedAt(b, i))))
}

function collectAnalyses(
    branches: SequenceNode[],
    style: StyleConfig,
    depth: number,
    widths: number[],
    layoutNode: LayoutNodeFn,
): BranchAnalysis[] {
    return branches.map((b, i) => analyzeBranchTopLevel(b, style, depth, Math.max(0, Math.ceil(widths[i] ?? 0)), layoutNode))
}

function computeStructuralWidths(baseNeeds: number[], analyses: BranchAnalysis[], bodyH: number): number[] {
    const h = Math.max(0, Math.ceil(bodyH))
    const out: number[] = []

    for (let i = 0; i < analyses.length; i += 1) {
        const analysis = analyses[i]
        const baseNeed = Math.max(0, Math.ceil(baseNeeds[i] ?? 0), Math.ceil(analysis.loopMaxMinSide))

        const flexUnits = computeFlexUnits(analysis)
        if (flexUnits > 0) {
            const available = Math.max(0, h - Math.max(0, Math.ceil(analysis.nonLoopMinSum)))
            const unitW = Math.floor(available / flexUnits)
            out.push(Math.max(baseNeed, unitW))
            continue
        }

        out.push(baseNeed)
    }

    return out
}

function distributeExtraToIndices(widths: number[], indices: number[], extra: number): number[] {
    const out = widths.map((v) => Math.max(0, Math.ceil(v)))
    const extraW = Math.max(0, Math.ceil(extra))
    if (extraW <= 0 || indices.length <= 0) return out

    const baseSum = indices.reduce((s, idx) => s + (out[idx] ?? 0), 0)

    if (baseSum <= 0) {
        const base = Math.floor(extraW / indices.length)
        let rem = extraW - base * indices.length
        for (const idx of indices) {
            const add = rem > 0 ? 1 : 0
            if (rem > 0) rem -= 1
            out[idx] = Math.max(0, (out[idx] ?? 0) + base + add)
        }
        return out
    }

    let used = 0
    for (let i = 0; i < indices.length; i += 1) {
        const idx = indices[i]
        if (i === indices.length - 1) {
            out[idx] = Math.max(0, (out[idx] ?? 0) + (extraW - used))
            break
        }

        const w = out[idx] ?? 0
        const add = Math.floor((extraW * w) / baseSum)
        out[idx] = Math.max(0, w + add)
        used += add
    }

    return out
}

function ensureMinTotalWidthWithSupportPriority(widths: number[], analyses: BranchAnalysis[], targetTotal: number): number[] {
    const w = widths.map((v) => Math.max(0, Math.ceil(v)))
    const cur = sumNumbers(w)
    if (cur >= targetTotal) return w

    const extra = targetTotal - cur
    const supportIndices: number[] = []

    for (let i = 0; i < analyses.length; i += 1) {
        const analysis = analyses[i]
        if ((analysis?.loopCount ?? 0) <= 0 || (analysis?.supportCount ?? 0) > 0) supportIndices.push(i)
    }

    if (supportIndices.length > 0) return distributeExtraToIndices(w, supportIndices, extra)
    return ensureMinTotalWidth(w, targetTotal)
}

function minBodyHForBranchWidths(widths: number[], analyses: BranchAnalysis[]): number {
    let need = 0

    for (let i = 0; i < analyses.length; i += 1) {
        const analysis = analyses[i]
        const colW = Math.max(0, Math.ceil(widths[i] ?? 0))
        const flexUnits = computeFlexUnits(analysis)

        if (flexUnits > 0) {
            need = Math.max(need, Math.ceil(analysis.nonLoopMinSum + flexUnits * colW))
            continue
        }

        need = Math.max(need, Math.max(Math.ceil(analysis.nonLoopMinSum), Math.ceil(analysis.minEqualSlotTotal)))
    }

    return Math.max(0, Math.ceil(need))
}

function computeLoopWidthsAndBodyH(params: Readonly<{
    baseNeeds: number[]
    analyses: BranchAnalysis[]
    decision: BodyDecision
    minTotalW: number
    forcedBodyH: number
}>): Readonly<{ widths: number[]; bodyH: number }> {
    const { baseNeeds, analyses, decision, minTotalW, forcedBodyH } = params

    let bodyH = Math.max(0, Math.ceil(decision.bodyH), Math.max(0, Math.ceil(forcedBodyH)))

    let widths = computeStructuralWidths(baseNeeds, analyses, bodyH)
    widths = ensureMinTotalWidthWithSupportPriority(widths, analyses, minTotalW)

    bodyH = Math.max(bodyH, minBodyHForBranchWidths(widths, analyses))

    widths = computeStructuralWidths(baseNeeds, analyses, bodyH)
    widths = ensureMinTotalWidthWithSupportPriority(widths, analyses, minTotalW)

    bodyH = Math.max(bodyH, minBodyHForBranchWidths(widths, analyses))

    return { widths, bodyH: Math.ceil(bodyH) }
}

export function stabilizeBranches(params: Readonly<{
    branches: SequenceNode[]
    style: StyleConfig
    depth: number
    initWidths: number[]
    minTotalW: number
    y: number
    forcedBodyH: number
    passes: number
    baseNeedAt: (branch: SequenceNode, index: number) => number
    layoutNode: LayoutNodeFn
}>): StabilizeResult {
    const { branches, style, depth, initWidths, minTotalW, y, forcedBodyH, passes, baseNeedAt, layoutNode } = params

    let widths = initWidths.map((v) => Math.max(0, Math.ceil(v)))
    let analyses: BranchAnalysis[] = []

    const maxPasses = Math.max(1, Math.min(6, Math.floor(passes)))
    let prevBodyH = -1

    for (let pass = 0; pass < maxPasses; pass += 1) {
        const baseNeeds = computeBaseNeeds(branches, baseNeedAt)

        analyses = collectAnalyses(branches, style, depth, widths, layoutNode)
        const baseDecision = computeBodyForAnalyses({ y, forcedBodyH, analyses, baseNeeds })

        if (!baseDecision.hasAnyLoop) {
            const nextWidths = equalizeBranchWidths(baseNeeds, minTotalW)
            const stable = areSameWidths(nextWidths, widths)
            widths = nextWidths
            if (stable) break
            continue
        }

        const solved = computeLoopWidthsAndBodyH({ baseNeeds, analyses, decision: baseDecision, minTotalW, forcedBodyH })

        const nextWidths = solved.widths
        const bodyH = solved.bodyH

        const stable = areSameWidths(nextWidths, widths) && Math.ceil(bodyH) === Math.ceil(prevBodyH)

        widths = nextWidths
        prevBodyH = bodyH

        if (stable) break
    }

    const baseNeeds = computeBaseNeeds(branches, baseNeedAt)
    analyses = collectAnalyses(branches, style, depth, widths, layoutNode)

    const finalBase = computeBodyForAnalyses({ y, forcedBodyH: Math.max(0, Math.ceil(forcedBodyH)), analyses, baseNeeds })

    if (!finalBase.hasAnyLoop) {
        const equalized = equalizeBranchWidths(baseNeeds, minTotalW)
        return {
            widths: equalized,
            analyses,
            decision: { ...finalBase, bodyH: Math.max(finalBase.bodyH, forcedBodyH) },
        }
    }

    const solved = computeLoopWidthsAndBodyH({ baseNeeds, analyses, decision: finalBase, minTotalW, forcedBodyH })

    return {
        widths: solved.widths,
        analyses,
        decision: { ...finalBase, bodyH: solved.bodyH },
    }
}

export function computeNonLoopTargets(params: Readonly<{
    bodyH: number
    widths: number[]
    analyses: BranchAnalysis[]
}>): number[] {
    const { bodyH, widths, analyses } = params
    const h = Math.max(0, Math.ceil(bodyH))

    return analyses.map((analysis, index) => {
        const colW = Math.max(0, Math.ceil(widths[index] ?? 0))
        const loopTotal = Math.max(0, analysis.loopCount * colW)
        return Math.max(0, h - loopTotal)
    })
}

export function resolveCaseHeights(params: Readonly<{
    headerMin: number
    labelMin: number
    bodyMinH: number
    forcedHeight?: number
    bodyCanAbsorbExtra: boolean
}>): CaseHeightDecision {
    const { headerMin, labelMin, bodyMinH, forcedHeight, bodyCanAbsorbExtra } = params

    if (forcedHeight === undefined) {
        return { headerH: headerMin, labelH: labelMin, bodyH: bodyMinH }
    }

    const forcedTotal = Math.max(0, Math.ceil(forcedHeight))
    const minTotalH = headerMin + labelMin + bodyMinH

    if (forcedTotal > 0 && forcedTotal < minTotalH) {
        return { headerH: headerMin, labelH: labelMin, bodyH: bodyMinH }
    }

    if (bodyCanAbsorbExtra) {
        const bodyH = Math.max(bodyMinH, Math.max(0, forcedTotal - headerMin - labelMin))
        return { headerH: headerMin, labelH: labelMin, bodyH }
    }

    const diff = Math.max(0, forcedTotal - bodyMinH)
    const half = Math.floor(diff / 2)
    const head = Math.max(headerMin, labelMin, half)

    const headerH = head
    const labelH = head
    let bodyH = bodyMinH

    const total = headerH + labelH + bodyH
    if (forcedTotal > 0 && total < forcedTotal) {
        bodyH += forcedTotal - total
    }

    return { headerH, labelH, bodyH }
}