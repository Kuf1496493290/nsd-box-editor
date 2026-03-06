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
 * y：初始化矩形的固定高度（由 DEFAULT_STYLE 保证稳定）
 */
function baseBlockHeight(style: StyleConfig): number {
    const processPad = safePad(style.paddingProcess)
    return Math.ceil(lineBoxHeight(style.fontSize) + processPad * 2)
}

/**
 * x：初始化矩形的固定宽度（当前用 style.minBlockWidth 作为 x）
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

/**
 * 最小宽度口径：
 * - 你要求：所有图形宽最短 >= x/4（不再用 y 兜底）
 */
function softMinWidth(style: StyleConfig, depth: number): number {
    const x = baseBlockWidth(style)
    const floor = Math.max(48, Math.ceil(x / 4))

    if (depth <= 0) return floor

    const divisor = Math.pow(1.8, depth)
    const v = x / divisor
    return Math.max(floor, Math.ceil(v))
}

function isLoopOnlyTopLevelSequence(node: SequenceNode): boolean {
    if (node.children.length <= 0) return false
    return node.children.every((c) => c.type === 'loop')
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
 * （仅在“完全无 loop”的场景使用；有 loop 时会优先把额外宽度分配给“无 loop 兜底列”，避免正反馈）
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
 * LOOP 自身的固有边长需求（只看“横向必须”）：
 * - 纵向无解由 layoutLoop 负责：必要时只延长竖边
 */
function requiredLoopSide(node: LoopNode, style: StyleConfig, depth: number): number {
    const a = loopArmSize(style)
    const headerPad = safePad(style.paddingHeader)

    const conditionNeed = Math.ceil(measureTextWidthSafe(node.conditionText || '', style) + headerPad * 2)
    const baseMin = Math.max(minLoopSide(style), 2 * a, conditionNeed)

    if (node.body.children.length === 0) return baseMin

    const holeNeedW = requiredWidth(node.body, style, depth + 1)
    const sideNeed = Math.ceil(a + holeNeedW)

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

        const childReq = node.children.map((c) => requiredWidth(c, style, depth))

        // 顶层“纯 loop”序列：宽度应由 loop 的最小边长主导，不能被 softMinWidth(depth) 抬高
        if (depth > 0 && isLoopOnlyTopLevelSequence(node)) {
            return Math.max(...childReq)
        }

        return Math.max(softMin, ...childReq)
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

function containsLoopDeep(node: NsdNode): boolean {
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
    return node.children.map((c) => {
        const childW = childForcedWidthInSequence(node, depth, c, w)
        return layoutNode(c, style, depth, childW)
    })
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
    enforceFillWidth: boolean
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
    enforceFillWidth: boolean,
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
            enforceFillWidth,
        })
    }

    return childBoxes
}

type ConvergedSequence = Readonly<{
    width: number
    naturalBoxes: LayoutBox[]
}>

function isShrinkCandidateLoop(node: LoopNode): boolean {
    if (node.body.children.length < 2) return false
    return node.body.children.every((c) => c.type === 'loop')
}

function hasTopLevelShrinkDriver(node: SequenceNode, depth: number): boolean {
    if (depth !== 0) return false
    return node.children.some((c) => c.type === 'loop' && isShrinkCandidateLoop(c))
}

function computeSequenceTargetWidth(node: SequenceNode, style: StyleConfig, depth: number, forcedWidth?: number): number {
    const softMin = softMinWidth(style, depth)
    const x = baseBlockWidth(style)

    if (node.children.length === 0) {
        // 顶层空序列默认宽度也要是 x
        const base = depth === 0 ? x : softMin
        return Math.ceil(Math.max(base, forcedWidth ?? 0))
    }

    const childNeeds = node.children.map((c) => requiredWidth(c, style, depth))

    // 顶层纯 loop：仍然保持你之前的“不要用 softMin 抬高洞宽”的规则
    if (depth > 0 && isLoopOnlyTopLevelSequence(node)) {
        return Math.ceil(Math.max(Math.max(...childNeeds), forcedWidth ?? 0))
    }

    // 顶层默认宽度门控：
    // - 没有缩短触发器：默认宽度至少为 x（保持“最外层最小图形默认 x/y”）
    // - 有缩短触发器：允许脱离 x，转为“最大硬最小宽度”（= max(softMin, ...childNeeds)）
    if (depth === 0) {
        const hasShrinkDriver = hasTopLevelShrinkDriver(node, depth)
        const base = hasShrinkDriver ? Math.max(softMin, ...childNeeds) : Math.max(x, ...childNeeds)
        return Math.ceil(Math.max(base, forcedWidth ?? 0))
    }

    // 非顶层：保持原逻辑（最小值口径由 softMin 控制）
    const base = Math.max(softMin, ...childNeeds)
    return Math.ceil(Math.max(base, forcedWidth ?? 0))
}

function convergeSequenceWidth(
    node: SequenceNode,
    style: StyleConfig,
    depth: number,
    startWidth: number,
    passes: number,
): ConvergedSequence {
    let width = Math.max(0, Math.ceil(startWidth))
    const maxPasses = Math.max(1, Math.min(6, Math.floor(passes)))

    for (let pass = 0; pass < maxPasses; pass += 1) {
        const naturalBoxes = buildNaturalSequenceBoxes(node, style, depth, width)
        const maxNaturalW = Math.max(width, ...naturalBoxes.map((b) => Math.max(0, Math.ceil(b.width))))
        if (maxNaturalW > width) {
            width = Math.ceil(maxNaturalW)
            continue
        }
        return { width, naturalBoxes }
    }

    const naturalBoxes = buildNaturalSequenceBoxes(node, style, depth, width)
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
    // 关键：同列同级统一吃列宽（列宽会由 requiredWidth 的 max 自己收敛）
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
    enforceFillWidth: boolean,
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
            enforceFillWidth,
        })
    }

    return childBoxes
}

function computeEqualSlotTotalHeight(naturalBoxes: LayoutBox[], forcedTotalH: number): number {
    const maxMinH = Math.max(0, ...naturalBoxes.map((b) => Math.max(0, Math.ceil(b.height))))
    const equalNeed = Math.ceil(naturalBoxes.length * maxMinH)
    return Math.max(Math.max(0, Math.ceil(forcedTotalH)), equalNeed)
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
        const children = buildCustomSlotSequenceBoxes(node, style, depth, w, plan.slots, true)
        return { id: node.id, node, x: 0, y: 0, width: w, height: Math.max(0, Math.ceil(plan.totalH)), children }
    }

    const totalH = computeEqualSlotTotalHeight(naturalBoxes, forcedH)
    const children = buildForcedSequenceBoxes(node, style, depth, w, totalH, true)
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

type BranchAnalysis = Readonly<{
    loopCount: number
    nonLoopCount: number
    nonLoopMinSum: number
    loopMaxMinSide: number
    minEqualSlotTotal: number
}>

/**
 * 分支顶层分析（修复暴涨的关键点）：
 * - loopMaxMinSide 只用 requiredLoopSide（固有需求），不把“列宽 w”反灌进 loop 的最小边长
 */
function analyzeBranchTopLevel(branch: SequenceNode, style: StyleConfig, depth: number, width: number): BranchAnalysis {
    if (branch.children.length === 0) {
        return { loopCount: 0, nonLoopCount: 0, nonLoopMinSum: 0, loopMaxMinSide: 0, minEqualSlotTotal: 0 }
    }

    const w = Math.max(0, Math.ceil(width))

    let loopCount = 0
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

function layoutBranchChildAtSlot(params: Readonly<{
    child: NsdNode
    style: StyleConfig
    depth: number
    colW: number
    slotH: number
    y: number
    out: LayoutBox[]
}>): number {
    const { child, style, depth, colW, slotH, y, out } = params
    const w = Math.max(0, Math.ceil(colW))
    const h = Math.max(0, Math.ceil(slotH))

    const box = layoutNode(child, style, depth, w, h)
    box.x = 0
    box.y = y
    if (box.node.type !== 'loop') box.width = w
    out.push(box)

    return y + h + BORDER_GAP
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

            y = layoutBranchChildAtSlot({
                child,
                style,
                depth,
                colW: w,
                slotH,
                y,
                out: boxes,
            })
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

            y = layoutBranchChildAtSlot({
                child,
                style,
                depth,
                colW: w,
                slotH,
                y,
                out: boxes,
            })
            continue
        }

        const minH = nonLoopMinHeights[nonLoopIndex] ?? baseBlockHeight(style)
        const add = extraSlots[nonLoopIndex] ?? 0
        nonLoopIndex += 1

        const slotH = Math.ceil(minH + add)

        y = layoutBranchChildAtSlot({
            child,
            style,
            depth,
            colW: w,
            slotH,
            y,
            out: boxes,
        })
    }

    return { id: branch.id, node: branch, x: 0, y: 0, width: w, height: h, children: boxes }
}

type StabilizeResult = Readonly<{
    widths: number[]
    analyses: BranchAnalysis[]
    decision: BodyDecision
}>

function areSameWidths(a: number[], b: number[]): boolean {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i += 1) {
        if (Math.ceil(a[i] ?? 0) !== Math.ceil(b[i] ?? 0)) return false
    }
    return true
}

function computeBaseNeeds(branches: SequenceNode[], baseNeedAt: (b: SequenceNode, i: number) => number): number[] {
    return branches.map((b, i) => Math.max(0, Math.ceil(baseNeedAt(b, i))))
}

function collectAnalyses(branches: SequenceNode[], style: StyleConfig, depth: number, widths: number[]): BranchAnalysis[] {
    return branches.map((b, i) => analyzeBranchTopLevel(b, style, depth, Math.max(0, Math.ceil(widths[i] ?? 0))))
}

function computeLoopShare(bodyH: number, a: BranchAnalysis, nonLoopCore: number, isCompetition: boolean): number {
    if (a.loopCount <= 0) return 0
    if (isCompetition) return Math.max(0, Math.ceil(bodyH))
    const isMixed = a.nonLoopCount > 0
    return isMixed ? Math.max(0, Math.ceil(bodyH) - Math.max(0, Math.ceil(nonLoopCore))) : Math.max(0, Math.ceil(bodyH))
}

function computeStructuralWidths(baseNeeds: number[], analyses: BranchAnalysis[], decision: BodyDecision, bodyH: number): number[] {
    const nonLoopCore = Math.max(0, Math.ceil(decision.nonLoopCore))
    const isCompetition = decision.isCompetition

    const out: number[] = []
    for (let i = 0; i < analyses.length; i += 1) {
        const a = analyses[i]
        const baseNeed = baseNeeds[i] ?? 0

        if (a.loopCount <= 0) {
            out.push(Math.max(0, Math.ceil(baseNeed)))
            continue
        }

        const minSide = Math.max(0, Math.ceil(baseNeed), Math.ceil(a.loopMaxMinSide))
        const share = computeLoopShare(bodyH, a, nonLoopCore, isCompetition)
        const colW = Math.floor(share / Math.max(1, a.loopCount))
        out.push(Math.max(minSide, Math.max(0, colW)))
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
        for (const element of indices) {
            const idx = element
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

/**
 * 满足 minTotalW 时的“优先级分配”：
 * - 若存在 loopCount=0 的兜底列（空洞/无 loop 分支），优先把额外宽度塞给这些列（避免通过抬高 bodyH 去撑宽导致正反馈）
 * - 否则退化为按比例增宽（保持 loop-only 情况下的宽度比）
 */
function ensureMinTotalWidthWithSupportPriority(widths: number[], analyses: BranchAnalysis[], targetTotal: number): number[] {
    const w = widths.map((v) => Math.max(0, Math.ceil(v)))
    const cur = sumNumbers(w)
    if (cur >= targetTotal) return w

    const extra = targetTotal - cur
    const supportIndices: number[] = []
    for (let i = 0; i < analyses.length; i += 1) {
        if ((analyses[i]?.loopCount ?? 0) <= 0) supportIndices.push(i)
    }

    if (supportIndices.length > 0) {
        return distributeExtraToIndices(w, supportIndices, extra)
    }

    return ensureMinTotalWidth(w, targetTotal)
}

function minBodyHForLoopWidths(widths: number[], analyses: BranchAnalysis[], decision: BodyDecision): number {
    const isCompetition = decision.isCompetition
    const nonLoopCore = Math.max(0, Math.ceil(decision.nonLoopCore))

    let need = 0
    for (let i = 0; i < analyses.length; i += 1) {
        const a = analyses[i]
        if (a.loopCount <= 0) continue

        const colW = Math.max(0, Math.ceil(widths[i] ?? 0))
        const loops = Math.max(1, a.loopCount)

        const base = !isCompetition && a.nonLoopCount > 0 ? nonLoopCore : 0
        need = Math.max(need, base + loops * colW)
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

    let widths = computeStructuralWidths(baseNeeds, analyses, decision, bodyH)

    widths = ensureMinTotalWidthWithSupportPriority(widths, analyses, minTotalW)

    bodyH = Math.max(bodyH, minBodyHForLoopWidths(widths, analyses, decision))

    widths = computeStructuralWidths(baseNeeds, analyses, decision, bodyH)
    widths = ensureMinTotalWidthWithSupportPriority(widths, analyses, minTotalW)

    bodyH = Math.max(bodyH, minBodyHForLoopWidths(widths, analyses, decision))

    return { widths, bodyH: Math.ceil(bodyH) }
}

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

    const maxPasses = Math.max(1, Math.min(6, Math.floor(passes)))
    let prevBodyH = -1

    for (let pass = 0; pass < maxPasses; pass += 1) {
        const baseNeeds = computeBaseNeeds(branches, baseNeedAt)

        analyses = collectAnalyses(branches, style, depth, widths)
        const baseDecision = computeBodyForAnalyses({ y, forcedBodyH, analyses })

        if (!baseDecision.hasAnyLoop) {
            const nextWidths = ensureMinTotalWidth(baseNeeds, minTotalW)
            const stable = areSameWidths(nextWidths, widths)
            widths = nextWidths
            if (stable) break
            continue
        }

        const solved = computeLoopWidthsAndBodyH({
            baseNeeds,
            analyses,
            decision: baseDecision,
            minTotalW,
            forcedBodyH,
        })

        const nextWidths = solved.widths
        const bodyH = solved.bodyH

        const stable = areSameWidths(nextWidths, widths) && Math.ceil(bodyH) === Math.ceil(prevBodyH)

        widths = nextWidths
        prevBodyH = bodyH

        if (stable) break
    }

    analyses = collectAnalyses(branches, style, depth, widths)
    const finalBase = computeBodyForAnalyses({ y, forcedBodyH: Math.max(0, Math.ceil(forcedBodyH)), analyses })

    if (!finalBase.hasAnyLoop) {
        const baseNeeds = computeBaseNeeds(branches, baseNeedAt)
        const widened = ensureMinTotalWidth(baseNeeds, minTotalW)
        return { widths: widened, analyses, decision: { ...finalBase, bodyH: Math.max(finalBase.bodyH, forcedBodyH) } }
    }

    const baseNeeds = computeBaseNeeds(branches, baseNeedAt)
    const solved = computeLoopWidthsAndBodyH({
        baseNeeds,
        analyses,
        decision: finalBase,
        minTotalW,
        forcedBodyH,
    })

    return { widths: solved.widths, analyses, decision: { ...finalBase, bodyH: solved.bodyH } }
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
    const headerMin = y
    const labelH = 0

    const headerPad = safePad(style.paddingHeader)
    const conditionW = Math.ceil(measureTextWidthSafe(node.conditionText || '', style) + headerPad * 2)

    const branchDepth = depth + 1
    const branches = [node.trueBranch, node.falseBranch]

    const initLeftW = Math.max(softMinWidth(style, branchDepth), requiredWidth(node.trueBranch, style, branchDepth))
    const initRightW = Math.max(softMinWidth(style, branchDepth), requiredWidth(node.falseBranch, style, branchDepth))

    const minTotalW = Math.max(conditionW, Math.ceil(forcedWidth ?? 0))

    const stabilized = stabilizeBranches({
        branches,
        style,
        depth: branchDepth,
        initWidths: [initLeftW, initRightW],
        minTotalW,
        y,
        forcedBodyH: 0,
        passes: 6,
        baseNeedAt: (b) => Math.max(softMinWidth(style, branchDepth), requiredWidth(b, style, branchDepth)),
    })

    const [leftW, rightW] = stabilized.widths
    const width = Math.ceil(leftW + rightW)

    let headerH = headerMin
    let bodyH = Math.max(0, Math.ceil(stabilized.decision.bodyH))

    let decisionForNonLoop: BodyDecision = stabilized.decision

    if (forcedHeight !== undefined) {
        const forcedTotal = Math.max(0, Math.ceil(forcedHeight))
        const naturalTotal = Math.ceil(headerMin + labelH + bodyH)

        if (forcedTotal > naturalTotal) {
            const extra = forcedTotal - naturalTotal
            const allLoopBranchesHaveNonLoop = stabilized.analyses.every((a) => a.loopCount <= 0 || a.nonLoopCount > 0)

            if (allLoopBranchesHaveNonLoop) {
                headerH = headerMin
                bodyH = Math.ceil(bodyH + extra)
                decisionForNonLoop = {
                    ...stabilized.decision,
                    bodyH,
                    nonLoopCore: Math.ceil(stabilized.decision.nonLoopCore + extra),
                }
            } else {
                headerH = Math.ceil(headerMin + extra)
                bodyH = Math.max(0, Math.ceil(stabilized.decision.bodyH))
                decisionForNonLoop = stabilized.decision
            }
        }
    }

    const nonLoopTargets = computeNonLoopTargets({ decision: decisionForNonLoop, analyses: stabilized.analyses })

    const trueBox = layoutBranchSequence(node.trueBranch, style, branchDepth, leftW, bodyH, nonLoopTargets[0] ?? 0)
    const falseBox = layoutBranchSequence(node.falseBranch, style, branchDepth, rightW, bodyH, nonLoopTargets[1] ?? 0)

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
        height: Math.ceil(headerH + labelH + bodyH),
        children: [trueBox, falseBox],
        meta: { headerH },
    }
}

type CaseHeightDecision = Readonly<{ headerH: number; labelH: number; bodyH: number }>

function resolveCaseHeights(params: Readonly<{
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

function layoutCase(node: CaseNode, style: StyleConfig, depth: number, forcedWidth?: number, forcedHeight?: number): LayoutBox {
    const y = baseBlockHeight(style)
    const headerMin = y
    const labelMin = y

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

    const stabilized = stabilizeBranches({
        branches,
        style,
        depth: branchDepth,
        initWidths,
        minTotalW,
        y,
        forcedBodyH: 0,
        passes: 6,
        baseNeedAt: (b, i) =>
            Math.max(softMinWidth(style, branchDepth), requiredWidth(b, style, branchDepth), labelNeeds[i] ?? 0),
    })

    const bodyMinH = Math.max(0, Math.ceil(stabilized.decision.bodyH))

    let headerH = headerMin
    let labelH = labelMin
    let bodyH = bodyMinH
    let decisionForNonLoop: BodyDecision = stabilized.decision

    if (forcedHeight !== undefined) {
        const forcedTotal = Math.max(0, Math.ceil(forcedHeight))
        const naturalTotal = Math.ceil(headerMin + labelMin + bodyMinH)

        if (forcedTotal > naturalTotal) {
            const extra = forcedTotal - naturalTotal
            const allLoopBranchesHaveNonLoop = stabilized.analyses.every((a) => a.loopCount <= 0 || a.nonLoopCount > 0)

            if (allLoopBranchesHaveNonLoop) {
                headerH = headerMin
                labelH = labelMin
                bodyH = Math.ceil(bodyMinH + extra)
                decisionForNonLoop = {
                    ...stabilized.decision,
                    bodyH,
                    nonLoopCore: Math.ceil(stabilized.decision.nonLoopCore + extra),
                }
            } else {
                const bodyCanAbsorbExtra = branches.every((b) => !containsLoopDeep(b))
                const resolved = resolveCaseHeights({
                    headerMin,
                    labelMin,
                    bodyMinH,
                    forcedHeight,
                    bodyCanAbsorbExtra,
                })
                headerH = resolved.headerH
                labelH = resolved.labelH
                bodyH = resolved.bodyH
                decisionForNonLoop = stabilized.decision
            }
        } else {
            const bodyCanAbsorbExtra = branches.every((b) => !containsLoopDeep(b))
            const resolved = resolveCaseHeights({
                headerMin,
                labelMin,
                bodyMinH,
                forcedHeight,
                bodyCanAbsorbExtra,
            })
            headerH = resolved.headerH
            labelH = resolved.labelH
            bodyH = resolved.bodyH
        }
    }

    const nonLoopTargets = computeNonLoopTargets({ decision: decisionForNonLoop, analyses: stabilized.analyses })

    const branchBoxes: LayoutBox[] = []
    let x = 0

    for (let i = 0; i < branches.length; i += 1) {
        const w = Math.max(0, Math.ceil(stabilized.widths[i] ?? 0))
        const box = layoutBranchSequence(branches[i], style, branchDepth, w, bodyH, nonLoopTargets[i] ?? 0)
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
        height: Math.ceil(headerH + labelH + bodyH),
        children: branchBoxes,
        meta: { headerH, labelH },
    }
}

function probeLoopBodyMinHeight(node: LoopNode, style: StyleConfig, depth: number, holeW: number): number {
    if (node.body.children.length <= 0) return 0

    const w = Math.max(0, Math.ceil(holeW))

    /**
     * 关键：用 forcedHeight=0 触发“强制高度模式”的最小高度推导：
     * - 会启用 enforceFillWidth，避免内层纯 loop 序列压缩导致低估高度
     * - totalH 会取 >= equalNeed，从而得到该洞宽下“能放得下所有子节点”的最小高度
     */
    const probe = layoutSequence(node.body, style, depth + 1, w, 0)
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
}>): number {
    const { node, style, depth, startWidth, baseW, forcedW, a } = params
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
}>): number {
    const { node, style, depth, baseW, forcedW, a } = params
    const startW = Math.max(0, Math.ceil(params.width))

    if (node.body.children.length <= 0) return startW

    const holeW = Math.max(0, startW - a)
    const minBodyH = probeLoopBodyMinHeight(node, style, depth, holeW)

    // 已可正方形（或不需要增宽）
    if (minBodyH <= holeW) return startW

    // 先尝试“一步增宽”到理论可正方形（holeW'=minBodyH）
    const candidateW = Math.max(startW, Math.ceil(a + minBodyH), baseW, forcedW)
    const holeW2 = Math.max(0, candidateW - a)
    const minBodyH2 = probeLoopBodyMinHeight(node, style, depth, holeW2)

    // 只有“增宽后确实能解”才接受；否则保持宽度，交给纵向拉伸解决（避免发散）
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
 * LOOP 布局（方案1：仅在“纵向无解”时允许竖边延长）：
 * - 默认：hole 仍为正方形（holeH = holeW）
 * - 纵向无解判定：body 在固定 holeW 下的自然最小高度 > holeW
 *   此时只把 loop 外框高度抬到能容纳 body（hole 变长方形），宽度不跟着涨
 */
function layoutLoop(node: LoopNode, style: StyleConfig, depth: number, forcedWidth?: number, forcedHeight?: number): LayoutBox {
    const a = loopArmSize(style)
    const isWhile = node.loopKind === 'while'
    const holeX = isWhile ? a : 0
    const holeY = isWhile ? a : 0

    const baseW = Math.max(0, Math.ceil(requiredLoopSide(node, style, depth)))
    const forcedW = forcedWidth === undefined ? 0 : Math.max(0, Math.ceil(forcedWidth))
    const forcedH = forcedHeight === undefined ? 0 : Math.max(0, Math.ceil(forcedHeight))

    let width = Math.max(baseW, forcedW)
    width = convergeLoopWidthByBodyWidth({ node, style, depth, startWidth: width, baseW, forcedW, a })
    width = widenLoopToSquareIfPossible({ node, style, depth, width, baseW, forcedW, a })
    width = Math.max(0, Math.ceil(width))

    const holeW = Math.max(0, width - a)
    const minBodyH = probeLoopBodyMinHeight(node, style, depth, holeW)
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
    const rootMinW = Math.max(48, Math.ceil(style.minBlockWidth / 4))
    box.width = Math.max(box.width, rootMinW)
    box.height = Math.max(box.height, style.fontSize * 2)
    return box
}