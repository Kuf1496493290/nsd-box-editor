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

function branchHasLoopAtTopLevel(branch: SequenceNode): boolean {
    return branch.children.some((c) => c.type === 'loop')
}

/**
 * 对于包含 loop 的分支：slotHeight = bodyH / childCount
 * loop 在槽位内会变成正方形（side = slotHeight），因此列宽需要至少 >= slotHeight
 */
function loopWidthNeedForBranch(bodyH: number, branch: SequenceNode): number {
    if (!branchHasLoopAtTopLevel(branch)) return 0
    const cnt = branch.children.length
    if (cnt <= 0) return 0
    return Math.ceil(bodyH / cnt)
}

function maxLoopWidthNeed(bodyH: number, branches: SequenceNode[]): number {
    let need = 0
    for (const b of branches) {
        need = Math.max(need, loopWidthNeedForBranch(bodyH, b))
    }
    return need
}

type BodyHeightResult = Readonly<{ bodyH: number; totalH: number }>

function computeBodyHeight(params: Readonly<{
    headerH: number
    labelH: number
    rows: number
    rowH: number
    hasAny: boolean
    forcedHeight?: number
}>): BodyHeightResult {
    const { headerH, labelH, rows, rowH, hasAny, forcedHeight } = params

    const baseBodyH = hasAny ? rows * rowH : 0
    const totalNeedH = headerH + labelH + baseBodyH
    const totalH = forcedHeight === undefined ? totalNeedH : Math.max(totalNeedH, Math.ceil(forcedHeight))
    const bodyH = Math.max(0, totalH - headerH - labelH)

    return { bodyH, totalH }
}

/**
 * LOOP 自身的固有边长需求（不受 forcedWidth 反推 side，避免正反馈）
 * - a 固定 = y
 * - Lmin 固定 = x/2（并保证 >= 2a）
 * - 条件文本可撑大 L
 * - body 非空时，holeSide 需要容纳 body 的“固有宽/高”
 */
function requiredLoopSide(node: LoopNode, style: StyleConfig, depth: number): number {
    const a = loopArmSize(style)
    const headerPad = safePad(style.paddingHeader)

    const conditionNeed = Math.ceil(measureTextWidthSafe(node.conditionText || '', style) + headerPad * 2)

    const baseMin = Math.max(minLoopSide(style), 2 * a, conditionNeed)

    if (node.body.children.length === 0) return baseMin

    const bodyNeedW = requiredWidth(node.body, style, depth + 1)
    const naturalBody = layoutSequence(node.body, style, depth + 1, bodyNeedW)
    const holeNeed = Math.max(bodyNeedW, naturalBody.height)

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

        const childColNeed = Math.max(
            softMinWidth(style, depth + 1),
            trueLabelNeed,
            falseLabelNeed,
            trueNeed,
            falseNeed,
        )
        return Math.max(softMin, conditionW, Math.ceil(childColNeed * 2))
    }

    if (node.type === 'case') {
        const branchCount = Math.max(2, node.branches.length)
        const conditionW = Math.ceil(measureTextWidthSafe(node.conditionText || '', style) + headerPad * 2)

        const labels = getCaseLabels(node)
        const labelNeed = Math.max(0, ...labels.map((t) => Math.ceil(measureTextWidthSafe(t, style) + labelPad * 2)))

        const branchNeeds = node.branches.map((b) => requiredWidth(b, style, depth + 1))
        const childColNeed = Math.max(softMinWidth(style, depth + 1), labelNeed, ...branchNeeds)

        return Math.max(softMin, conditionW, Math.ceil(childColNeed * branchCount))
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
 * “同级列高总和一致 + 列内均分”前提下：
 * 若某个子节点自身的“最小高度”过大，则必须抬高整列总高，使每个槽位 slotH 都 >= max(minChildHeight)
 *
 * 这里用“自然布局（无 forcedHeight）”得到的 height 作为 minChildHeight。
 */
function maxNaturalChildHeightAtWidth(node: SequenceNode, style: StyleConfig, depth: number, width: number): number {
    let maxH = 0
    for (const c of node.children) {
        const box = layoutNode(c, style, depth, width)
        maxH = Math.max(maxH, box.height)
    }
    return maxH
}

/**
 * 分支层：为了保证“分支内多个同级节点均分槽位”时不发生覆盖，
 * bodyH 至少需要满足：childCount * max(minChildHeight)
 */
function minBodyHeightByTopLevelChildren(
    style: StyleConfig,
    branches: SequenceNode[],
    depth: number,
    colW: number,
): number {
    let minH = 0

    for (const b of branches) {
        const cnt = b.children.length
        if (cnt <= 0) continue

        const maxMinH = maxNaturalChildHeightAtWidth(b, style, depth, colW)
        minH = Math.max(minH, cnt * maxMinH)
    }

    return minH
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

function layoutIf(node: IfNode, style: StyleConfig, depth: number, forcedWidth?: number, forcedHeight?: number): LayoutBox {
    const y = baseBlockHeight(style)

    const needW = requiredWidth(node, style, depth)
    let width = Math.max(needW, forcedWidth ?? 0)

    let colW = Math.ceil(width / 2)
    width = colW * 2

    const headerH = y
    const labelH = 0

    const branches = [node.trueBranch, node.falseBranch]

    let bodyH = 0
    let totalH = headerH + labelH

    for (let pass = 0; pass < 3; pass += 1) {
        const trueCount = node.trueBranch.children.length
        const falseCount = node.falseBranch.children.length
        const rows = Math.max(trueCount, falseCount, 1)

        const hasAny = true

        const naturalTrue = layoutSequence(node.trueBranch, style, depth + 1, colW)
        const naturalFalse = layoutSequence(node.falseBranch, style, depth + 1, colW)

        const trueNaturalRow = Math.ceil((naturalTrue.height || 0) / rows)
        const falseNaturalRow = Math.ceil((naturalFalse.height || 0) / rows)
        const rowH = Math.max(y, trueNaturalRow, falseNaturalRow)

        const computed = computeBodyHeight({
            headerH,
            labelH,
            rows,
            rowH,
            hasAny,
            forcedHeight,
        })

        bodyH = computed.bodyH

        const minByTopLevel = minBodyHeightByTopLevelChildren(style, branches, depth + 1, colW)
        bodyH = Math.max(bodyH, minByTopLevel)

        totalH = headerH + labelH + bodyH
        if (forcedHeight !== undefined) totalH = Math.max(totalH, Math.ceil(forcedHeight))

        const needByLoop = maxLoopWidthNeed(bodyH, branches)
        if (needByLoop > colW) {
            colW = needByLoop
            width = colW * 2
            continue
        }

        break
    }

    const trueBox = layoutSequence(node.trueBranch, style, depth + 1, colW, bodyH)
    const falseBox = layoutSequence(node.falseBranch, style, depth + 1, colW, bodyH)

    trueBox.x = 0
    trueBox.y = headerH + labelH
    falseBox.x = colW
    falseBox.y = headerH + labelH

    return {
        id: node.id,
        node,
        x: 0,
        y: 0,
        width,
        height: totalH,
        children: [trueBox, falseBox],
    }
}

function layoutCase(node: CaseNode, style: StyleConfig, depth: number, forcedWidth?: number, forcedHeight?: number): LayoutBox {
    const y = baseBlockHeight(style)

    const branchCount = Math.max(2, node.branches.length)

    const needW = requiredWidth(node, style, depth)
    let width = Math.max(needW, forcedWidth ?? 0)

    let colW = Math.ceil(width / branchCount)
    width = colW * branchCount

    const headerH = y
    const labelH = y

    const counts = node.branches.map((b) => b.children.length)
    const rows = Math.max(1, ...counts)

    const hasAny = true

    let bodyH = 0
    let totalH = headerH + labelH

    for (let pass = 0; pass < 3; pass += 1) {
        const naturalHeights = node.branches.map((b) => layoutSequence(b, style, depth + 1, colW).height)
        const naturalRowH =
            naturalHeights.length > 0 ? Math.max(...naturalHeights.map((h) => Math.ceil(h / rows))) : 0

        const rowH = Math.max(y, naturalRowH)

        const computed = computeBodyHeight({
            headerH,
            labelH,
            rows,
            rowH,
            hasAny,
            forcedHeight,
        })

        bodyH = computed.bodyH

        const minByTopLevel = minBodyHeightByTopLevelChildren(style, node.branches, depth + 1, colW)
        bodyH = Math.max(bodyH, minByTopLevel)

        totalH = headerH + labelH + bodyH
        if (forcedHeight !== undefined) totalH = Math.max(totalH, Math.ceil(forcedHeight))

        const needByLoop = maxLoopWidthNeed(bodyH, node.branches)
        if (needByLoop > colW) {
            colW = needByLoop
            width = colW * branchCount
            continue
        }

        break
    }

    const branchBoxes = node.branches.map((b, i) => {
        const box = layoutSequence(b, style, depth + 1, colW, bodyH)
        box.x = colW * i
        box.y = headerH + labelH
        return box
    })

    return {
        id: node.id,
        node,
        x: 0,
        y: 0,
        width,
        height: totalH,
        children: branchBoxes,
    }
}

function layoutLoop(node: LoopNode, style: StyleConfig, depth: number, forcedWidth?: number, forcedHeight?: number): LayoutBox {
    const a = loopArmSize(style)

    const intrinsic = requiredLoopSide(node, style, depth)

    const forcedW = forcedWidth === undefined ? 0 : Math.ceil(forcedWidth)

    let side = intrinsic
    if (forcedHeight !== undefined) side = Math.max(side, Math.ceil(forcedHeight))

    side = Math.max(side, forcedW)
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