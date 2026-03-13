import type { DragContainerKey, SelectionTarget } from '../../app/types'
import type { LayoutBox } from '../../layout/layoutTypes'
import { perfLogDuration, perfNow } from '../../utils/perf'

export type Point = Readonly<{ x: number; y: number }>

type AbsNodeBox = Readonly<{
    nodeId: string
    absX: number
    absY: number
    width: number
    height: number
    box: LayoutBox
}>

export type ContainerInfo = Readonly<{
    key: DragContainerKey
    absX: number
    absY: number
    width: number
    height: number
    children: ReadonlyArray<AbsNodeBox>
}>

export type NodeLocation = Readonly<{
    container: DragContainerKey
    index: number
    absX: number
    absY: number
    width: number
    height: number
    box: LayoutBox
}>

type AbsOwnerBox = Readonly<{
    absX: number
    absY: number
    width: number
    height: number
    box: LayoutBox
}>

export type DragIndex = Readonly<{
    containers: ReadonlyArray<ContainerInfo>
    nodeLocations: ReadonlyMap<string, NodeLocation>
    owners: ReadonlyMap<string, AbsOwnerBox>
}>

const CONTAINER_HIT_MARGIN_X = 6
const CONTAINER_HIT_MARGIN_Y = 24
export const OWNER_HIT_MARGIN_X = 6
export const OWNER_HIT_MARGIN_Y = 24
export const EDGE_MARGIN_X = 24

/**
 * 约束画布缩放值到可交互区间，并保留一位小数。
 */
export function clampScale(value: number): number {
    const v = Number.isFinite(value) ? value : 1
    const clamped = Math.max(0.5, Math.min(2, v))
    return Math.round(clamped * 10) / 10
}

export function ownerKeyOfContainer(container: DragContainerKey): string {
    return container.kind === 'root' ? 'root' : container.nodeId
}

export function isPointInRectWithMarginXY(
    p: Point,
    rect: Readonly<{ x: number; y: number; w: number; h: number }>,
    marginX: number,
    marginY: number,
): boolean {
    return p.x >= rect.x - marginX && p.x <= rect.x + rect.w + marginX && p.y >= rect.y - marginY && p.y <= rect.y + rect.h + marginY
}

export function pickDeepestContainer(containers: ReadonlyArray<ContainerInfo>, p: Point, ownerKey?: string): ContainerInfo | null {
    let best: ContainerInfo | null = null
    let bestArea = Number.POSITIVE_INFINITY

    for (const c of containers) {
        if (c.width <= 0 || c.height <= 0) continue
        if (ownerKey && ownerKeyOfContainer(c.key) !== ownerKey) continue

        const hit = isPointInRectWithMarginXY(
            p,
            { x: c.absX, y: c.absY, w: c.width, h: c.height },
            CONTAINER_HIT_MARGIN_X,
            CONTAINER_HIT_MARGIN_Y,
        )
        if (!hit) continue

        const area = c.width * c.height
        if (area < bestArea) {
            bestArea = area
            best = c
        }
    }

    return best
}

export function computeInsertIndexByY(container: ContainerInfo, p: Point): number {
    const children = container.children
    if (children.length <= 0) return 0

    for (let i = 0; i < children.length; i += 1) {
        const c = children[i]
        const midY = c.absY + c.height / 2
        if (p.y < midY) return i
    }

    return children.length
}

export function clampInt(value: number, min: number, max: number): number {
    const v = Number.isFinite(value) ? Math.floor(value) : min
    return Math.max(min, Math.min(max, v))
}

function findHoveredColIndexStrict(cols: ReadonlyArray<Readonly<{ x: number; w: number }>>, x: number): number {
    for (let i = 0; i < cols.length; i += 1) {
        const c = cols[i]
        if (x >= c.x && x <= c.x + c.w) return i
    }
    return -1
}

function computeInsertIndexByX(cols: ReadonlyArray<Readonly<{ x: number; w: number }>>, x: number): number {
    if (cols.length <= 0) return 0
    const mids = cols.map((c) => c.x + c.w / 2)

    for (let i = 0; i < mids.length; i += 1) {
        if (x < (mids[i] ?? 0)) return i
    }

    return cols.length
}

/**
 * 计算 CASE/IF 分支横向重排时的目标插入下标。
 * 当指针越界或列数不足时返回 null。
 */
export function computeReorderInsertIndexByX(cols: ReadonlyArray<Readonly<{ x: number; w: number }>>, x: number, edgeMarginX: number): number | null {
    if (cols.length <= 1) return null

    const leftEdge = cols[0]?.x ?? 0
    const last = cols.at(-1)
    const rightEdge = last ? last.x + last.w : leftEdge

    if (x < leftEdge - edgeMarginX || x > rightEdge + edgeMarginX) return null
    if (x <= leftEdge) return 0
    if (x >= rightEdge) return cols.length

    const hovered = findHoveredColIndexStrict(cols, x)
    if (hovered < 0) return computeInsertIndexByX(cols, x)

    const c = cols[hovered]
    const center = c.x + c.w / 2
    return x < center ? hovered : hovered + 1
}

/**
 * 从布局树构建拖拽索引，供命中检测与拖拽落点计算复用。
 */
export function buildDragIndex(rootBox: LayoutBox): DragIndex {
    const start = perfNow()
    const containers: ContainerInfo[] = []
    const nodeLocations = new Map<string, NodeLocation>()
    const owners = new Map<string, AbsOwnerBox>()

    function recordOwner(absX: number, absY: number, box: LayoutBox) {
        const t = box.node.type
        if (t !== 'if' && t !== 'case') return
        owners.set(box.node.id, { absX, absY, width: box.width, height: box.height, box })
    }

    function addContainer(seqBox: LayoutBox, key: DragContainerKey, absX: number, absY: number) {
        const children: AbsNodeBox[] = seqBox.children.map((c) => {
            const cx = absX + c.x
            const cy = absY + c.y
            return { nodeId: c.node.id, absX: cx, absY: cy, width: c.width, height: c.height, box: c }
        })

        for (let i = 0; i < children.length; i += 1) {
            const c = children[i]
            nodeLocations.set(c.nodeId, {
                container: key,
                index: i,
                absX: c.absX,
                absY: c.absY,
                width: c.width,
                height: c.height,
                box: c.box,
            })
        }

        containers.push({ key, absX, absY, width: seqBox.width, height: seqBox.height, children })
    }

    function walkSequenceBox(seq: LayoutBox, absX: number, absY: number, containerKey?: DragContainerKey) {
        if (containerKey) addContainer(seq, containerKey, absX, absY)
        for (const child of seq.children) {
            walkBox(child, absX + child.x, absY + child.y)
        }
    }

    function walkIfBox(ifBox: LayoutBox, absX: number, absY: number) {
        recordOwner(absX, absY, ifBox)

        const trueSeq = ifBox.children[0]
        const falseSeq = ifBox.children[1]

        if (trueSeq) {
            walkBox(trueSeq, absX + trueSeq.x, absY + trueSeq.y, { kind: 'ifBranch', nodeId: ifBox.node.id, branch: 'true' })
        }

        if (falseSeq) {
            walkBox(falseSeq, absX + falseSeq.x, absY + falseSeq.y, { kind: 'ifBranch', nodeId: ifBox.node.id, branch: 'false' })
        }
    }

    function walkCaseBox(caseBox: LayoutBox, absX: number, absY: number) {
        recordOwner(absX, absY, caseBox)

        for (let i = 0; i < caseBox.children.length; i += 1) {
            const b = caseBox.children[i]
            if (!b) continue
            walkBox(b, absX + b.x, absY + b.y, { kind: 'caseBranch', nodeId: caseBox.node.id, branchIndex: i })
        }
    }

    function walkLoopBox(loopBox: LayoutBox, absX: number, absY: number) {
        const body = loopBox.children[0]
        if (body) {
            walkBox(body, absX + body.x, absY + body.y, { kind: 'loopBody', nodeId: loopBox.node.id })
        }
    }

    function walkBox(box: LayoutBox, absX: number, absY: number, containerKey?: DragContainerKey) {
        if (box.node.type === 'sequence') {
            walkSequenceBox(box, absX, absY, containerKey)
            return
        }

        if (box.node.type === 'if') {
            walkIfBox(box, absX, absY)
            return
        }

        if (box.node.type === 'case') {
            walkCaseBox(box, absX, absY)
            return
        }

        if (box.node.type === 'loop') {
            walkLoopBox(box, absX, absY)
        }
    }

    walkBox(rootBox, 0, 0, { kind: 'root' })
    perfLogDuration('drag.buildDragIndex', start, {
        containers: containers.length,
        nodeLocations: nodeLocations.size,
        owners: owners.size,
    })
    return { containers, nodeLocations, owners }
}

/**
 * 将浏览器客户端坐标转换为 SVG 局部坐标。
 */
export function clientToSvgPoint(svg: SVGSVGElement, clientX: number, clientY: number): Point {
    const pt = svg.createSVGPoint()
    pt.x = clientX
    pt.y = clientY

    const ctm = svg.getScreenCTM()
    if (!ctm) return { x: 0, y: 0 }

    const out = pt.matrixTransform(ctm.inverse())
    return { x: out.x, y: out.y }
}

/**
 * 判断当前选中是否为“整节点选中”语义。
 */
export function isWholeNodeSelection(target: SelectionTarget): boolean {
    if (target.kind === 'node') return true
    if (target.kind === 'ifPart') return target.part === 'header'
    return target.kind === 'casePart' && target.part === 'header'
}

/**
 * 判断节点类型是否支持整节点高亮框。
 */
export function isWholeNodeType(type: string | undefined): boolean {
    return type === 'if' || type === 'case' || type === 'loop'
}