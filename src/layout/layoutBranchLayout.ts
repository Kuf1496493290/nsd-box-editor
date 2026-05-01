import type { CaseNode, IfNode, SequenceNode, StyleConfig } from '../app/types'
import type { LayoutBox } from './layoutTypes'
import {
    baseBlockHeight,
    containsLoopDeep,
    getCaseLabels,
    measureTextWidthSafe,
    relaxedRequiredWidth,
    requiredWidth,
    safePad,
    softMinWidth,
} from './layoutCommon'
import {
    analyzeBranchesAtWidths,
    computeNonLoopTargets,
    layoutBranchSequence,
    minBodyHeightForBranchWidths,
    resolveCaseHeights,
    stabilizeBranches,
    type LayoutNodeFn,
} from './layoutBranchHelpers'

function sumWidths(widths: ReadonlyArray<number>): number {
    return widths.reduce((sum, w) => sum + Math.max(0, Math.ceil(w)), 0)
}

function displayBranchWidths(params: Readonly<{
    naturalWidths: number[]
    stabilizedWidths: number[]
    minTotalW: number
    widthRelax: number
}>): number[] {
    const natural = params.naturalWidths.map((w) => Math.max(0, Math.ceil(w)))
    const stable = params.stabilizedWidths.map((w, i) => Math.max(natural[i] ?? 0, Math.ceil(w)))
    const tW = Math.max(0, Math.min(1, params.widthRelax))
    const minTotal = Math.max(0, Math.ceil(params.minTotalW))

    if (tW >= 1) {
        const perWidth = Math.max(
            0,
            ...natural,
            Math.ceil(Math.max(minTotal, sumWidths(stable)) / Math.max(1, stable.length)),
        )
        return stable.map(() => perWidth)
    }

    const out = stable.map((stableW, i) => {
        const naturalW = natural[i] ?? 0
        return Math.max(naturalW, Math.ceil(naturalW + (stableW - naturalW) * tW))
    })

    const deficit = minTotal - sumWidths(out)
    if (deficit <= 0 || out.length <= 0) return out

    const maxNatural = Math.max(...natural)
    const targets = natural.map((w, i) => (w === maxNatural ? i : -1)).filter((i) => i >= 0)
    const targetCount = Math.max(1, targets.length)
    const baseAdd = Math.floor(deficit / targetCount)
    let rem = deficit - baseAdd * targetCount

    for (const idx of targets) {
        out[idx] = Math.max(0, (out[idx] ?? 0) + baseAdd + (rem > 0 ? 1 : 0))
        if (rem > 0) rem -= 1
    }

    return out
}

/**
 * 计算 IF 节点布局，统一收敛左右分支宽度并分配头部/主体高度。
 */
export function layoutIfNode(params: Readonly<{
    node: IfNode
    style: StyleConfig
    depth: number
    layoutNode: LayoutNodeFn
    forcedWidth?: number
    forcedHeight?: number
}>): LayoutBox {
    const { node, style, depth, layoutNode, forcedWidth, forcedHeight } = params
    const y = baseBlockHeight(style)
    const headerMin = y
    const labelH = 0

    const headerPad = safePad(style.paddingHeader)
    const conditionW = Math.ceil(measureTextWidthSafe(node.conditionText || '', style) + headerPad * 2)

    const branchDepth = depth + 1
    const branches = [node.trueBranch, node.falseBranch]

    const initLeftW = Math.max(softMinWidth(style), requiredWidth(node.trueBranch, style, branchDepth))
    const initRightW = Math.max(softMinWidth(style), requiredWidth(node.falseBranch, style, branchDepth))
    const relaxedLeftW = Math.max(softMinWidth(style), relaxedRequiredWidth(node.trueBranch, style, branchDepth))
    const relaxedRightW = Math.max(softMinWidth(style), relaxedRequiredWidth(node.falseBranch, style, branchDepth))

    const forcedTotalW = forcedWidth === undefined ? undefined : Math.max(0, Math.ceil(forcedWidth))
    const structuralMinTotalW = Math.max(conditionW, forcedTotalW ?? 0)
    const relaxedMinTotalW = Math.max(conditionW, Math.ceil(relaxedLeftW + relaxedRightW))
    const tW = Math.max(0, Math.min(1, style.widthRelax))
    const minTotalW = forcedTotalW ?? Math.ceil(relaxedMinTotalW + (structuralMinTotalW - relaxedMinTotalW) * tW)

    const stabilized = stabilizeBranches({
        branches,
        style,
        depth: branchDepth,
        initWidths: [initLeftW, initRightW],
        minTotalW: structuralMinTotalW,
        y,
        forcedBodyH: 0,
        passes: 6,
        baseNeedAt: (b) => Math.max(softMinWidth(style), requiredWidth(b, style, branchDepth)),
        layoutNode,
    })

    const displayWidths = displayBranchWidths({
        naturalWidths: [relaxedLeftW, relaxedRightW],
        stabilizedWidths: stabilized.widths,
        minTotalW,
        widthRelax: style.widthRelax,
    })
    const [leftW, rightW] = displayWidths
    const width = Math.ceil(leftW + rightW)
    const displayAnalyses = analyzeBranchesAtWidths(branches, style, branchDepth, displayWidths, layoutNode)
    const bodyMinH = Math.max(
        0,
        Math.ceil(stabilized.decision.bodyH),
        minBodyHeightForBranchWidths(displayWidths, displayAnalyses),
    )

    let headerH = headerMin
    let bodyH = bodyMinH

    if (forcedHeight !== undefined) {
        const forcedTotal = Math.max(0, Math.ceil(forcedHeight))
        const naturalTotal = Math.ceil(headerMin + labelH + bodyH)

        if (forcedTotal > naturalTotal) {
            const extra = forcedTotal - naturalTotal
            const allLoopBranchesHaveNonLoop = displayAnalyses.every(
                (a) => a.loopCount <= 0 || a.nonLoopCount > 0 || a.supportCount > 0,
            )

            if (allLoopBranchesHaveNonLoop) {
                headerH = headerMin
                bodyH = Math.ceil(bodyH + extra)
            } else {
                headerH = Math.ceil(headerMin + extra)
                bodyH = bodyMinH
            }
        }
    }

    const nonLoopTargets = computeNonLoopTargets({
        bodyH,
        widths: displayWidths,
        analyses: displayAnalyses,
    })

    const trueBox = layoutBranchSequence(node.trueBranch, style, branchDepth, leftW, bodyH, nonLoopTargets[0] ?? 0, layoutNode)
    const falseBox = layoutBranchSequence(node.falseBranch, style, branchDepth, rightW, bodyH, nonLoopTargets[1] ?? 0, layoutNode)

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

/**
 * 计算 CASE 节点布局，包含头部、标签行与各分支主体的稳定化结果。
 */
export function layoutCaseNode(params: Readonly<{
    node: CaseNode
    style: StyleConfig
    depth: number
    layoutNode: LayoutNodeFn
    forcedWidth?: number
    forcedHeight?: number
}>): LayoutBox {
    const { node, style, depth, layoutNode, forcedWidth, forcedHeight } = params
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
        Math.max(softMinWidth(style), requiredWidth(b, style, branchDepth), labelNeeds[i] ?? 0),
    )
    const relaxedWidths = branches.map((b, i) =>
        Math.max(softMinWidth(style), relaxedRequiredWidth(b, style, branchDepth), labelNeeds[i] ?? 0),
    )

    const forcedTotalW = forcedWidth === undefined ? undefined : Math.max(0, Math.ceil(forcedWidth))
    const structuralMinTotalW = Math.max(conditionW, forcedTotalW ?? 0)
    const relaxedMinTotalW = Math.max(conditionW, Math.ceil(sumWidths(relaxedWidths)))
    const tW = Math.max(0, Math.min(1, style.widthRelax))
    const minTotalW = forcedTotalW ?? Math.ceil(relaxedMinTotalW + (structuralMinTotalW - relaxedMinTotalW) * tW)

    const stabilized = stabilizeBranches({
        branches,
        style,
        depth: branchDepth,
        initWidths,
        minTotalW: structuralMinTotalW,
        y,
        forcedBodyH: 0,
        passes: 6,
        baseNeedAt: (b, i) =>
            Math.max(softMinWidth(style), requiredWidth(b, style, branchDepth), labelNeeds[i] ?? 0),
        layoutNode,
    })

    const stabilizedBodyMinH = Math.max(0, Math.ceil(stabilized.decision.bodyH))
    const displayWidths = displayBranchWidths({
        naturalWidths: relaxedWidths,
        stabilizedWidths: stabilized.widths,
        minTotalW,
        widthRelax: style.widthRelax,
    })
    const displayAnalyses = analyzeBranchesAtWidths(branches, style, branchDepth, displayWidths, layoutNode)
    const bodyMinH = Math.max(stabilizedBodyMinH, minBodyHeightForBranchWidths(displayWidths, displayAnalyses))

    let headerH = headerMin
    let labelH = labelMin
    let bodyH = Math.max(bodyMinH, minBodyHeightForBranchWidths(displayWidths, displayAnalyses))

    if (forcedHeight !== undefined) {
        const forcedTotal = Math.max(0, Math.ceil(forcedHeight))
        const naturalTotal = Math.ceil(headerMin + labelMin + bodyMinH)

        if (forcedTotal > naturalTotal) {
            const extra = forcedTotal - naturalTotal
            const allLoopBranchesHaveNonLoop = displayAnalyses.every(
                (a) => a.loopCount <= 0 || a.nonLoopCount > 0 || a.supportCount > 0,
            )

            if (allLoopBranchesHaveNonLoop) {
                headerH = headerMin
                labelH = labelMin
                bodyH = Math.ceil(bodyMinH + extra)
            } else {
                const bodyCanAbsorbExtra = branches.every((b: SequenceNode) => !containsLoopDeep(b))
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
        } else {
            const bodyCanAbsorbExtra = branches.every((b: SequenceNode) => !containsLoopDeep(b))
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

    const nonLoopTargets = computeNonLoopTargets({
        bodyH,
        widths: displayWidths,
        analyses: displayAnalyses,
    })

    const branchBoxes: LayoutBox[] = []
    let x = 0

    for (let i = 0; i < branches.length; i += 1) {
        const w = Math.max(0, Math.ceil(displayWidths[i] ?? 0))
        const box = layoutBranchSequence(branches[i], style, branchDepth, w, bodyH, nonLoopTargets[i] ?? 0, layoutNode)
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
