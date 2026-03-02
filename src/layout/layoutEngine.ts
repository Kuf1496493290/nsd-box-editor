// FILE: src/layout/layoutEngine.ts
import type { CaseNode, IfNode, LoopNode, NsdNode, SequenceNode, StyleConfig } from '../app/types'
import type { LayoutBox } from './layoutTypes'
import { measureTextWidth } from './measure'

const BORDER_GAP = 0

function lineBoxHeight(fontSize: number): number {
    return Math.ceil(fontSize * 1.2)
}

function safePad(value: number): number {
    return Math.max(1, Math.ceil(value))
}

function measureTextWidthSafe(text: string, style: StyleConfig): number {
    const base = measureTextWidth(text || '', style)
    const margin = 1
    return base + margin
}

/**
 * y：初始化矩形的固定高度（代码不改就不会变）
 * 这里以“步骤矩形的最小高度”为 y（由 DEFAULT_STYLE 决定）
 */
function baseBlockHeight(style: StyleConfig): number {
    const processPad = safePad(style.paddingProcess)
    return Math.ceil(lineBoxHeight(style.fontSize) + processPad * 2)
}

/**
 * x：初始化矩形的固定宽度（代码不改就不会变）
 * 当前用 style.minBlockWidth 作为 x
 */
function baseBlockWidth(style: StyleConfig): number {
    return Math.ceil(style.minBlockWidth)
}

/**
 * LOOP 内边距 a：固定等于 y
 */
function loopArmSize(style: StyleConfig): number {
    return baseBlockHeight(style)
}

/**
 * LOOP 最短边长 Lmin：固定等于 x/2
 * 但为了避免六边形退化：必须 >= 2a（即 2y）
 */
function minLoopSide(style: StyleConfig): number {
    const x = baseBlockWidth(style)
    const a = loopArmSize(style)
    return Math.max(Math.ceil(x / 2), 2 * a)
}

function softMinWidth(style: StyleConfig, depth: number): number {
    const y = baseBlockHeight(style)
    const floor = Math.max(48, Math.ceil(y + 2))

    if (depth <= 0) return Math.max(floor, Math.ceil(style.minBlockWidth))

    const divisor = Math.pow(1.8, depth)
    const v = style.minBlockWidth / divisor
    return Math.max(floor, Math.ceil(v))
}

function getCaseLabels(node: CaseNode): string[] {
    if (node.branchLabels.length === node.branches.length) return node.branchLabels
    return node.branches.map((_, i) => node.branchLabels[i] ?? String(i + 1))
}

function sumNumbers(values: number[]): number {
    return values.reduce((s, v) => s + v, 0)
}

/**
 * 仅“增宽”到 targetTotal：不回缩，按当前各列宽度占比追加，余数给最后一列。
 */
function ensureMinTotalWidth(widths: number[], targetTotal: number): number[] {
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
 * LOOP 自身的固有边长需求（不由 forcedWidth 反推 side，避免正反馈）
 */
function requiredLoopSide(node: LoopNode, style: StyleConfig, depth: number): number {
    const a = loopArmSize(style)
    const headerPad = safePad(style.paddingHeader)

    const conditionNeed = Math.ceil(measureTextWidthSafe(node.conditionText || '', style) + headerPad * 2)
    const baseMin = Math.max(minLoopSide(style), 2 * a, conditionNeed)

    if (node.body.children.length === 0) return baseMin

    const holeNeedW = requiredWidth(node.body, style, depth + 1)

    const childCount = node.body.children.length
    const maxMinChildH = maxNaturalChildHeightAtWidth(node.body, style, depth + 1, holeNeedW)
    const minHoleH = childCount <= 0 ? 0 : childCount * maxMinChildH

    const holeNeed = Math.max(holeNeedW, minHoleH)
    const sideNeed = Math.ceil(a + holeNeed)

    return Math.max(baseMin, sideNeed)
}

function requiredWidth(node: NsdNode, style: StyleConfig, depth: number): number {
    const headerPad = safePad(style.paddingHeader)
    const labelPad = safePad(style.paddingBranchLabel)
    const processPad = safePad(style.paddingProcess)

    const softMin = softMinWidth(style, depth)

    if (node.type === 'process') {
        const textW = measureTextWidthSafe(node.text || '', style)
        return Math.max(softMin, Math.ceil(textW + processPad * 2))
    }

    if (node.type === 'sequence') {
        if (node.children.length === 0) return softMin
        return Math.max(softMin, ...node.children.map((c) => requiredWidth(c, style, depth)))
    }

    if (node.type === 'if') {
        const conditionW = Math.ceil(measureTextWidthSafe(node.conditionText || '', style) + headerPad * 2)

        const trueLabel = node.boolLabelMode === 'YN' ? 'Y' : 'T'
        const falseLabel = node.boolLabelMode === 'YN' ? 'N' : 'F'
        const trueLabelNeed = Math.ceil(measureTextWidthSafe(trueLabel, style) + labelPad * 2)
        const falseLabelNeed = Math.ceil(measureTextWidthSafe(falseLabel, style) + labelPad * 2)

        const trueNeed = requiredWidth(node.trueBranch, style, depth + 1)
        const falseNeed = requiredWidth(node.falseBranch, style, depth + 1)

        const leftNeed = Math.max(softMinWidth(style, depth + 1), trueLabelNeed, trueNeed)
        const rightNeed = Math.max(softMinWidth(style, depth + 1), falseLabelNeed, falseNeed)

        return Math.max(softMin, conditionW, Math.ceil(leftNeed + rightNeed))
    }

    if (node.type === 'case') {
        const labels = getCaseLabels(node)
        const conditionW = Math.ceil(measureTextWidthSafe(node.conditionText || '', style) + headerPad * 2)

        const branchNeeds = node.branches.map((b) => requiredWidth(b, style, depth + 1))
        const colNeeds = node.branches.map((_, i) => {
            const label = labels[i] ?? String(i + 1)
            const labelNeed = Math.ceil(measureTextWidthSafe(label, style) + labelPad * 2)
            const branchNeed = branchNeeds[i] ?? 0
            return Math.max(softMinWidth(style, depth + 1), labelNeed, branchNeed)
        })

        const sumCols = Math.ceil(sumNumbers(colNeeds))
        return Math.max(softMin, conditionW, sumCols)
    }

    if (node.type === 'loop') {
        return requiredLoopSide(node, style, depth)
    }

    return softMin
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

function distributeSlots(totalH: number, count: number): number[] {
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

function stackChildrenAtTop(childBoxes: LayoutBox[], width: number): number {
    let y = 0
    for (const c of childBoxes) {
        c.x = 0
        c.y = y
        c.width = width
        y += c.height + BORDER_GAP
    }

    return (
        childBoxes.reduce((sum, c) => sum + c.height, 0) + Math.max(0, childBoxes.length - 1) * BORDER_GAP
    )
}

/**
 * 用“自然布局（无 forcedHeight）”得到的 height 作为 minChildHeight。
 */
function maxNaturalChildHeightAtWidth(node: SequenceNode, style: StyleConfig, depth: number, width: number): number {
    let maxH = 0
    for (const c of node.children) {
        const box = layoutNode(c, style, depth, width)
        maxH = Math.max(maxH, box.height)
    }
    return maxH
}

function buildNaturalSequenceBoxes(node: SequenceNode, style: StyleConfig, depth: number, width: number): LayoutBox[] {
    return node.children.map((c) => layoutNode(c, style, depth, width))
}

function buildForcedSequenceBoxes(
    node: SequenceNode,
    style: StyleConfig,
    depth: number,
    width: number,
    totalH: number,
): LayoutBox[] {
    const slots = distributeSlots(totalH, node.children.length)
    const childBoxes: LayoutBox[] = []
    let y = 0

    for (let i = 0; i < node.children.length; i += 1) {
        const child = node.children[i]
        const slotH = slots[i] ?? 0

        const box = layoutNode(child, style, depth, width, slotH)
        box.x = 0
        box.y = y
        box.width = width

        childBoxes.push(box)
        y += slotH + BORDER_GAP
    }

    return childBoxes
}

function layoutSequence(
    node: SequenceNode,
    style: StyleConfig,
    depth: number,
    forcedWidth?: number,
    forcedHeight?: number,
): LayoutBox {
    const softMin = softMinWidth(style, depth)
    const childNeeds = node.children.map((c) => requiredWidth(c, style, depth))
    let targetW = node.children.length === 0 ? softMin : Math.max(softMin, ...childNeeds)
    targetW = Math.max(targetW, forcedWidth ?? 0)
    targetW = Math.ceil(targetW)

    if (node.children.length === 0) {
        const h = forcedHeight === undefined ? 0 : Math.max(0, Math.ceil(forcedHeight))
        return {
            id: node.id,
            node,
            x: 0,
            y: 0,
            width: targetW,
            height: h,
            children: [],
        }
    }

    if (forcedHeight === undefined) {
        for (let pass = 0; pass < 4; pass += 1) {
            const childBoxes = buildNaturalSequenceBoxes(node, style, depth, targetW)
            const maxChildW = Math.max(targetW, ...childBoxes.map((b) => b.width))
            if (maxChildW > targetW) {
                targetW = maxChildW
                continue
            }

            const h = stackChildrenAtTop(childBoxes, targetW)
            return {
                id: node.id,
                node,
                x: 0,
                y: 0,
                width: targetW,
                height: h,
                children: childBoxes,
            }
        }

        const childBoxes = buildNaturalSequenceBoxes(node, style, depth, targetW)
        const h = stackChildrenAtTop(childBoxes, targetW)
        return {
            id: node.id,
            node,
            x: 0,
            y: 0,
            width: targetW,
            height: h,
            children: childBoxes,
        }
    }

    let totalH = Math.max(0, Math.ceil(forcedHeight))

    for (let pass = 0; pass < 4; pass += 1) {
        const naturalBoxes = buildNaturalSequenceBoxes(node, style, depth, targetW)
        const maxNaturalW = Math.max(targetW, ...naturalBoxes.map((b) => b.width))
        if (maxNaturalW > targetW) {
            targetW = maxNaturalW
            continue
        }

        const maxMinH = Math.max(0, ...naturalBoxes.map((b) => b.height))
        totalH = Math.max(totalH, node.children.length * maxMinH)

        const forcedBoxes = buildForcedSequenceBoxes(node, style, depth, targetW, totalH)
        const maxForcedW = Math.max(targetW, ...forcedBoxes.map((b) => b.width))
        if (maxForcedW > targetW) {
            targetW = maxForcedW
            continue
        }

        return {
            id: node.id,
            node,
            x: 0,
            y: 0,
            width: targetW,
            height: totalH,
            children: forcedBoxes,
        }
    }

    const forcedBoxes = buildForcedSequenceBoxes(node, style, depth, targetW, totalH)
    return {
        id: node.id,
        node,
        x: 0,
        y: 0,
        width: targetW,
        height: totalH,
        children: forcedBoxes,
    }
}

type BranchAnalysis = Readonly<{
    loopCount: number
    nonLoopCount: number
    nonLoopMinSum: number
    loopMaxMinSide: number
    minEqualSlotTotal: number
}>

/**
 * 分支顶层分析：
 * - loop 的“最小边长”用 requiredLoopSide（固有需求），并且至少 >= 分支自身的 requiredWidth（同列宽口径下 loop 必须能跟随列宽）
 * - 非 loop 用自然 layoutNode 的 height
 * - minEqualSlotTotal 用“顶层孩子的最大最小高度”推导（确保均分槽位不低于最小高度）
 */
function analyzeBranchTopLevel(branch: SequenceNode, style: StyleConfig, depth: number, width: number): BranchAnalysis {
    if (branch.children.length === 0) {
        return { loopCount: 0, nonLoopCount: 0, nonLoopMinSum: 0, loopMaxMinSide: 0, minEqualSlotTotal: 0 }
    }

    const branchNeedW = Math.max(0, Math.ceil(requiredWidth(branch, style, depth)))

    let loopCount = 0
    let nonLoopCount = 0
    let nonLoopMinSum = 0
    let loopMaxMinSide = 0
    let maxMinH = 0

    for (const child of branch.children) {
        if (child.type === 'loop') {
            const loopMin = Math.max(requiredLoopSide(child, style, depth), branchNeedW)
            loopCount += 1
            loopMaxMinSide = Math.max(loopMaxMinSide, loopMin)
            maxMinH = Math.max(maxMinH, loopMin)
            continue
        }

        const box = layoutNode(child, style, depth, width)
        nonLoopCount += 1
        nonLoopMinSum += box.height
        maxMinH = Math.max(maxMinH, box.height)
    }

    return {
        loopCount,
        nonLoopCount,
        nonLoopMinSum: Math.ceil(nonLoopMinSum),
        loopMaxMinSide: Math.ceil(loopMaxMinSide),
        minEqualSlotTotal: Math.ceil(branch.children.length * maxMinH),
    }
}

function computeNonLoopCore(analyses: BranchAnalysis[], y: number): number {
    let core = 0
    for (const a of analyses) {
        if (a.nonLoopCount > 0) core = Math.max(core, a.nonLoopMinSum)
    }
    return Math.max(0, Math.ceil(core), y)
}

function computeLoopTotalCore(analyses: BranchAnalysis[]): number {
    let core = 0
    for (const a of analyses) {
        if (a.loopCount > 0) core = Math.max(core, a.loopCount * a.loopMaxMinSide)
    }
    return Math.max(0, Math.ceil(core))
}

function maxNoLoopMinNeed(analyses: BranchAnalysis[]): number {
    let v = 0
    for (const a of analyses) {
        if (a.loopCount <= 0) v = Math.max(v, a.minEqualSlotTotal)
    }
    return Math.max(0, Math.ceil(v))
}

type BodyDecision = Readonly<{
    bodyH: number
    nonLoopCore: number
    hasAnyLoop: boolean
    anyNonLoop: boolean
    anyMixed: boolean
    isCompetition: boolean
}>

function computeBodyForAnalyses(params: Readonly<{
    y: number
    forcedBodyH: number
    analyses: BranchAnalysis[]
}>): BodyDecision {
    const { y, forcedBodyH, analyses } = params

    const hasAnyLoop = analyses.some((a) => a.loopCount > 0)
    const anyNonLoop = analyses.some((a) => a.nonLoopCount > 0)
    const anyMixed = analyses.some((a) => a.loopCount > 0 && a.nonLoopCount > 0)
    const isCompetition = hasAnyLoop && anyNonLoop && !anyMixed

    if (!hasAnyLoop) {
        let maxNeed = y
        for (const a of analyses) maxNeed = Math.max(maxNeed, a.minEqualSlotTotal)
        const bodyH = Math.max(maxNeed, forcedBodyH)
        return { bodyH, nonLoopCore: bodyH, hasAnyLoop: false, anyNonLoop, anyMixed: false, isCompetition: false }
    }

    const nonLoopCore = computeNonLoopCore(analyses, 0)
    const loopTotalCore = computeLoopTotalCore(analyses)
    const noLoopNeed = maxNoLoopMinNeed(analyses)

    const bodyH = isCompetition
        ? Math.max(y, loopTotalCore, nonLoopCore, noLoopNeed, forcedBodyH)
        : Math.max(y, loopTotalCore + nonLoopCore, noLoopNeed, forcedBodyH)

    return { bodyH, nonLoopCore, hasAnyLoop: true, anyNonLoop, anyMixed, isCompetition }
}

function layoutBranchSequence(
    branch: SequenceNode,
    style: StyleConfig,
    depth: number,
    width: number,
    totalH: number,
    nonLoopTotalTarget: number,
): LayoutBox {
    const w = Math.max(0, Math.ceil(width))
    const h = Math.max(0, Math.ceil(totalH))

    if (branch.children.length === 0) {
        return { id: branch.id, node: branch, x: 0, y: 0, width: w, height: h, children: [] }
    }

    const analysis = analyzeBranchTopLevel(branch, style, depth, w)

    if (analysis.loopCount <= 0) {
        const slots = distributeSlots(h, branch.children.length)
        const boxes: LayoutBox[] = []
        let y = 0
        let index = 0

        for (const child of branch.children) {
            const slotH = slots[index] ?? 0
            index += 1

            const box = layoutNode(child, style, depth, w, slotH)
            box.x = 0
            box.y = y
            box.width = w
            boxes.push(box)
            y += slotH + BORDER_GAP
        }

        return { id: branch.id, node: branch, x: 0, y: 0, width: w, height: h, children: boxes }
    }

    const loopTotal = Math.max(0, h - Math.max(0, Math.ceil(nonLoopTotalTarget)))
    const loopSlots = distributeSlots(loopTotal, analysis.loopCount)

    const nonLoopChildren = branch.children.filter((c) => c.type !== 'loop')
    const nonLoopMinHeights = nonLoopChildren.map((c) => layoutNode(c, style, depth, w).height)
    const nonLoopMinSum = Math.ceil(sumNumbers(nonLoopMinHeights))
    const targetNonLoop = Math.max(nonLoopMinSum, Math.max(0, Math.ceil(nonLoopTotalTarget)))

    const extraNonLoop = Math.max(0, targetNonLoop - nonLoopMinSum)
    const extraSlots = distributeSlots(extraNonLoop, nonLoopChildren.length)

    let loopIndex = 0
    let nonLoopIndex = 0

    const boxes: LayoutBox[] = []
    let y = 0

    for (const child of branch.children) {
        if (child.type === 'loop') {
            const slotH = loopSlots[loopIndex] ?? 0
            loopIndex += 1

            const box = layoutNode(child, style, depth, w, slotH)
            box.x = 0
            box.y = y
            box.width = w
            boxes.push(box)
            y += slotH + BORDER_GAP
            continue
        }

        const minH = nonLoopMinHeights[nonLoopIndex] ?? baseBlockHeight(style)
        const add = extraSlots[nonLoopIndex] ?? 0
        nonLoopIndex += 1

        const slotH = Math.ceil(minH + add)
        const box = layoutNode(child, style, depth, w, slotH)
        box.x = 0
        box.y = y
        box.width = w
        boxes.push(box)
        y += slotH + BORDER_GAP
    }

    return { id: branch.id, node: branch, x: 0, y: 0, width: w, height: h, children: boxes }
}

function computeBranchWidthNeed(baseNeed: number, analysis: BranchAnalysis, bodyH: number, nonLoopCore: number): number {
    let need = Math.max(0, Math.ceil(baseNeed))

    if (analysis.loopCount <= 0) return need

    const nonLoopTarget = analysis.nonLoopCount > 0 ? nonLoopCore : 0
    const loopTotal = Math.max(0, Math.ceil(bodyH - nonLoopTarget))
    const loopSlot = Math.ceil(loopTotal / analysis.loopCount)

    need = Math.max(need, loopSlot)
    return Math.ceil(need)
}

type StabilizeResult = Readonly<{
    widths: number[]
    analyses: BranchAnalysis[]
    decision: BodyDecision
}>

function stabilizeBranches(params: Readonly<{
    branches: SequenceNode[]
    style: StyleConfig
    depth: number
    initWidths: number[]
    minTotalW: number
    y: number
    forcedBodyH: number
    passes: number
    baseNeedAt: (branch: SequenceNode, index: number) => number
}>): StabilizeResult {
    const { branches, style, depth, initWidths, minTotalW, y, forcedBodyH, passes, baseNeedAt } = params

    let widths = initWidths.map((v) => Math.max(0, Math.ceil(v)))
    let analyses: BranchAnalysis[] = []
    let decision: BodyDecision = { bodyH: 0, nonLoopCore: 0, hasAnyLoop: false, anyNonLoop: false, anyMixed: false, isCompetition: false }

    for (let pass = 0; pass < passes; pass += 1) {
        widths = ensureMinTotalWidth(widths, minTotalW)

        analyses = branches.map((b, i) => analyzeBranchTopLevel(b, style, depth, Math.ceil(widths[i] ?? 0)))
        decision = computeBodyForAnalyses({ y, forcedBodyH, analyses })

        const next = branches.map((b, i) => {
            const baseNeed = baseNeedAt(b, i)
            return computeBranchWidthNeed(baseNeed, analyses[i], decision.bodyH, decision.nonLoopCore)
        })

        const stable = next.length === widths.length && next.every((v, i) => Math.ceil(v) === Math.ceil(widths[i] ?? 0))
        widths = next

        if (stable) break
    }

    widths = ensureMinTotalWidth(widths, minTotalW)
    analyses = branches.map((b, i) => analyzeBranchTopLevel(b, style, depth, Math.ceil(widths[i] ?? 0)))
    decision = computeBodyForAnalyses({ y, forcedBodyH, analyses })

    return { widths, analyses, decision }
}

function computeNonLoopTargets(params: Readonly<{
    decision: BodyDecision
    analyses: BranchAnalysis[]
}>): number[] {
    const { decision, analyses } = params

    if (!decision.hasAnyLoop) return analyses.map(() => 0)
    if (decision.isCompetition) return analyses.map(() => 0)

    return analyses.map((a) => {
        const isMixed = a.loopCount > 0 && a.nonLoopCount > 0
        return isMixed ? decision.nonLoopCore : 0
    })
}

function layoutIf(node: IfNode, style: StyleConfig, depth: number, forcedWidth?: number, forcedHeight?: number): LayoutBox {
    const y = baseBlockHeight(style)
    const headerH = y
    const labelH = 0

    const headerPad = safePad(style.paddingHeader)
    const conditionW = Math.ceil(measureTextWidthSafe(node.conditionText || '', style) + headerPad * 2)

    const branchDepth = depth + 1
    const branches = [node.trueBranch, node.falseBranch]

    const initLeftW = Math.max(softMinWidth(style, branchDepth), requiredWidth(node.trueBranch, style, branchDepth))
    const initRightW = Math.max(softMinWidth(style, branchDepth), requiredWidth(node.falseBranch, style, branchDepth))

    const minTotalW = Math.max(conditionW, Math.ceil(forcedWidth ?? 0))
    const forcedBodyH = forcedHeight === undefined ? 0 : Math.max(0, Math.ceil(forcedHeight) - headerH - labelH)

    const stabilized = stabilizeBranches({
        branches,
        style,
        depth: branchDepth,
        initWidths: [initLeftW, initRightW],
        minTotalW,
        y,
        forcedBodyH,
        passes: 8,
        baseNeedAt: (b) => Math.max(softMinWidth(style, branchDepth), requiredWidth(b, style, branchDepth)),
    })

    const [leftW, rightW] = stabilized.widths
    const width = Math.ceil(leftW + rightW)

    const nonLoopTargets = computeNonLoopTargets({ decision: stabilized.decision, analyses: stabilized.analyses })

    const trueBox = layoutBranchSequence(node.trueBranch, style, branchDepth, leftW, stabilized.decision.bodyH, nonLoopTargets[0] ?? 0)
    const falseBox = layoutBranchSequence(node.falseBranch, style, branchDepth, rightW, stabilized.decision.bodyH, nonLoopTargets[1] ?? 0)

    trueBox.x = 0
    trueBox.y = headerH + labelH
    falseBox.x = leftW
    falseBox.y = headerH + labelH

    return {
        id: node.id,
        node,
        x: 0,
        y: 0,
        width,
        height: Math.ceil(headerH + labelH + stabilized.decision.bodyH),
        children: [trueBox, falseBox],
    }
}

function layoutCase(node: CaseNode, style: StyleConfig, depth: number, forcedWidth?: number, forcedHeight?: number): LayoutBox {
    const y = baseBlockHeight(style)
    const headerH = y
    const labelH = y

    const labels = getCaseLabels(node)
    const labelPad = safePad(style.paddingBranchLabel)
    const headerPad = safePad(style.paddingHeader)
    const conditionW = Math.ceil(measureTextWidthSafe(node.conditionText || '', style) + headerPad * 2)

    const branchCount = Math.max(2, node.branches.length)
    const branches = node.branches.slice(0, branchCount)

    const branchDepth = depth + 1
    const labelNeeds = branches.map((_, i) => {
        const t = labels[i] ?? String(i + 1)
        return Math.ceil(measureTextWidthSafe(t, style) + labelPad * 2)
    })

    const initWidths = branches.map((b, i) =>
        Math.max(softMinWidth(style, branchDepth), requiredWidth(b, style, branchDepth), labelNeeds[i] ?? 0),
    )

    const minTotalW = Math.max(conditionW, Math.ceil(forcedWidth ?? 0))
    const forcedBodyH = forcedHeight === undefined ? 0 : Math.max(0, Math.ceil(forcedHeight) - headerH - labelH)

    const stabilized = stabilizeBranches({
        branches,
        style,
        depth: branchDepth,
        initWidths,
        minTotalW,
        y,
        forcedBodyH,
        passes: 8,
        baseNeedAt: (b, i) =>
            Math.max(softMinWidth(style, branchDepth), requiredWidth(b, style, branchDepth), labelNeeds[i] ?? 0),
    })

    const nonLoopTargets = computeNonLoopTargets({ decision: stabilized.decision, analyses: stabilized.analyses })

    const branchBoxes: LayoutBox[] = []
    let x = 0

    for (let i = 0; i < branches.length; i += 1) {
        const w = Math.max(0, Math.ceil(stabilized.widths[i] ?? 0))
        const box = layoutBranchSequence(branches[i], style, branchDepth, w, stabilized.decision.bodyH, nonLoopTargets[i] ?? 0)
        box.x = x
        box.y = headerH + labelH
        branchBoxes.push(box)
        x += w
    }

    return {
        id: node.id,
        node,
        x: 0,
        y: 0,
        width: Math.ceil(x),
        height: Math.ceil(headerH + labelH + stabilized.decision.bodyH),
        children: branchBoxes,
    }
}

function layoutLoop(node: LoopNode, style: StyleConfig, depth: number, forcedWidth?: number, forcedHeight?: number): LayoutBox {
    const a = loopArmSize(style)

    let side = requiredLoopSide(node, style, depth)

    if (forcedWidth !== undefined) side = Math.max(side, Math.ceil(forcedWidth))
    if (forcedHeight !== undefined) side = Math.max(side, Math.ceil(forcedHeight))

    side = Math.ceil(side)

    const holeSide = Math.max(0, side - a)

    const bodyBox: LayoutBox =
        node.body.children.length === 0
            ? {
                id: node.body.id,
                node: node.body,
                x: 0,
                y: 0,
                width: holeSide,
                height: holeSide,
                children: [],
            }
            : layoutSequence(node.body, style, depth + 1, holeSide, holeSide)

    return {
        id: node.id,
        node,
        x: 0,
        y: 0,
        width: side,
        height: side,
        children: [bodyBox],
    }
}

function layoutNode(node: NsdNode, style: StyleConfig, depth: number, forcedWidth?: number, forcedHeight?: number): LayoutBox {
    const need = requiredWidth(node, style, depth)
    const w = Math.max(need, forcedWidth ?? 0)

    if (node.type === 'process') {
        return layoutProcessAtWidth(node, style, w, forcedHeight)
    }

    if (node.type === 'sequence') {
        return layoutSequence(node, style, depth, w, forcedHeight)
    }

    if (node.type === 'if') {
        return layoutIf(node, style, depth, w, forcedHeight)
    }

    if (node.type === 'case') {
        return layoutCase(node, style, depth, w, forcedHeight)
    }

    if (node.type === 'loop') {
        return layoutLoop(node, style, depth, w, forcedHeight)
    }

    throw new Error('Unsupported node type')
}

export function layoutRoot(root: SequenceNode, style: StyleConfig): LayoutBox {
    const box = layoutSequence(root, style, 0)
    box.x = 0
    box.y = 0
    box.width = Math.max(box.width, style.minBlockWidth)
    box.height = Math.max(box.height, style.fontSize * 2)
    return box
}