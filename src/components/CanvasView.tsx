// FILE: src/components/CanvasView.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react'
import type { AppState, CasePartKey, DragContainerKey, DragMoveRequest, IfPartKey } from '../app/types'
import { layoutRoot } from '../layout/layoutEngine'
import type { LayoutBox } from '../layout/layoutTypes'
import { RenderNode } from '../render/renderNode'

type CanvasViewProps = Readonly<{
    state: AppState
    svgRef: RefObject<SVGSVGElement | null>

    onCanvasSize?: (size: Readonly<{ width: number; height: number }>) => void

    onProcessSelect: (nodeId: string) => void
    onProcessDoubleClick: (nodeId: string) => void

    onIfHeaderSelect: (nodeId: string) => void
    onIfHeaderDoubleClick: (nodeId: string) => void
    onIfPartSelect: (nodeId: string, part: IfPartKey) => void
    onIfLabelDoubleClick: (nodeId: string, part: 'trueLabel' | 'falseLabel') => void

    onCaseHeaderSelect: (nodeId: string) => void
    onCaseHeaderDoubleClick: (nodeId: string) => void
    onCasePartSelect: (nodeId: string, part: CasePartKey, branchIndex?: number) => void
    onCaseBranchLabelDoubleClick: (nodeId: string, branchIndex: number) => void

    onLoopSelect: (nodeId: string) => void
    onLoopConditionDoubleClick: (nodeId: string) => void
    onLoopHoleSelect: (nodeId: string) => void

    onCanvasBlankClick: () => void

    onInsertProcessAfter: (nodeId: string) => void
    onInsertIfAfter: (nodeId: string) => void
    onInsertCaseAfter: (nodeId: string) => void
    onInsertWhileAfter: (nodeId: string) => void
    onInsertDoWhileAfter: (nodeId: string) => void

    onMoveProcessUp: (nodeId: string) => void
    onMoveProcessDown: (nodeId: string) => void
    onDeleteProcess: (nodeId: string) => void

    onDeleteSelected: () => void
    onAddCaseBranch: (caseId: string) => void

    onMoveByDrag: (req: DragMoveRequest) => void
}>

type Point = Readonly<{ x: number; y: number }>

type AbsNodeBox = Readonly<{
    nodeId: string
    absX: number
    absY: number
    width: number
    height: number
    box: LayoutBox
}>

type ContainerInfo = Readonly<{
    key: DragContainerKey
    absX: number
    absY: number
    width: number
    height: number
    children: ReadonlyArray<AbsNodeBox>
}>

type NodeLocation = Readonly<{
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

type DragIndex = Readonly<{
    containers: ReadonlyArray<ContainerInfo>
    nodeLocations: ReadonlyMap<string, NodeLocation>
    owners: ReadonlyMap<string, AbsOwnerBox>
}>

/**
 * 命中范围策略：
 * - Sequence 容器：X 基本严格，Y 给一点点 margin 方便“拖到顶部/底部也能插入”
 * - If/Case owner：同理，X 严格，Y 给一点点 margin
 * - Case 列重排：只允许在列内（或左右外边缘少量 margin）计算落点；中间以“半区规则”确定 before/after
 */
const CONTAINER_HIT_MARGIN_X = 6
const CONTAINER_HIT_MARGIN_Y = 24

const OWNER_HIT_MARGIN_X = 6
const OWNER_HIT_MARGIN_Y = 24

const CASE_EDGE_MARGIN_X = 24

function ownerKeyOfContainer(container: DragContainerKey): string {
    return container.kind === 'root' ? 'root' : container.nodeId
}

function isPointInRectWithMarginXY(
    p: Point,
    rect: Readonly<{ x: number; y: number; w: number; h: number }>,
    marginX: number,
    marginY: number,
): boolean {
    return (
        p.x >= rect.x - marginX &&
        p.x <= rect.x + rect.w + marginX &&
        p.y >= rect.y - marginY &&
        p.y <= rect.y + rect.h + marginY
    )
}

function pickDeepestContainer(containers: ReadonlyArray<ContainerInfo>, p: Point): ContainerInfo | null {
    let best: ContainerInfo | null = null
    let bestArea = Number.POSITIVE_INFINITY

    for (const c of containers) {
        if (c.width <= 0 || c.height <= 0) continue

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

function computeInsertIndexByY(container: ContainerInfo, p: Point): number {
    const children = container.children
    if (children.length <= 0) return 0

    for (let i = 0; i < children.length; i += 1) {
        const c = children[i]
        const midY = c.absY + c.height / 2
        if (p.y < midY) return i
    }

    return children.length
}

function clampInt(value: number, min: number, max: number): number {
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

function buildDragIndex(rootBox: LayoutBox): DragIndex {
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
            return {
                nodeId: c.node.id,
                absX: cx,
                absY: cy,
                width: c.width,
                height: c.height,
                box: c,
            }
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

        containers.push({
            key,
            absX,
            absY,
            width: seqBox.width,
            height: seqBox.height,
            children,
        })
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
    return { containers, nodeLocations, owners }
}

function clientToSvgPoint(svg: SVGSVGElement, clientX: number, clientY: number): Point {
    const pt = svg.createSVGPoint()
    pt.x = clientX
    pt.y = clientY

    const ctm = svg.getScreenCTM()
    if (!ctm) return { x: 0, y: 0 }

    const out = pt.matrixTransform(ctm.inverse())
    return { x: out.x, y: out.y }
}

type PendingDrag =
    | Readonly<{
    kind: 'node'
    pointerId: number
    nodeId: string
    startClientX: number
    startClientY: number
}>
    | Readonly<{
    kind: 'ifResult'
    pointerId: number
    ifId: string
    fromBranch: 'true' | 'false'
    startClientX: number
    startClientY: number
}>
    | Readonly<{
    kind: 'caseResult'
    pointerId: number
    caseId: string
    fromBranchIndex: number
    startClientX: number
    startClientY: number
}>

type ActiveDrag =
    | Readonly<{
    kind: 'node'
    nodeId: string
    from: DragContainerKey
    fromOwnerKey: string
    grabOffsetX: number
    grabOffsetY: number
    pointerX: number
    pointerY: number
    ghostBox: LayoutBox
}>
    | Readonly<{
    kind: 'ifResult'
    ifId: string
    fromBranch: 'true' | 'false'
    grabOffsetX: number
    grabOffsetY: number
    pointerX: number
    pointerY: number
    ghostBox: LayoutBox
}>
    | Readonly<{
    kind: 'caseResult'
    caseId: string
    fromBranchIndex: number
    grabOffsetX: number
    grabOffsetY: number
    pointerX: number
    pointerY: number
    ghostBox: LayoutBox
}>

export function CanvasView(props: CanvasViewProps) {
    const {
        state,
        svgRef,
        onCanvasSize,
        onProcessSelect,
        onProcessDoubleClick,
        onIfHeaderSelect,
        onIfHeaderDoubleClick,
        onIfPartSelect,
        onIfLabelDoubleClick,
        onCaseHeaderSelect,
        onCaseHeaderDoubleClick,
        onCasePartSelect,
        onCaseBranchLabelDoubleClick,
        onLoopSelect,
        onLoopConditionDoubleClick,
        onLoopHoleSelect,
        onCanvasBlankClick,
        onInsertProcessAfter,
        onInsertIfAfter,
        onInsertCaseAfter,
        onInsertWhileAfter,
        onInsertDoWhileAfter,
        onMoveProcessUp,
        onMoveProcessDown,
        onDeleteProcess,
        onDeleteSelected,
        onAddCaseBranch,
        onMoveByDrag,
    } = props

    const rootBox = useMemo(() => layoutRoot(state.root, state.style), [state.root, state.style])
    const dragIndex = useMemo(() => buildDragIndex(rootBox), [rootBox])

    const baseLeftPad = 20
    const menuTopSafe = 90
    const menuRightSafe = 220
    const menuBottomSafe = 80

    const padX = Math.max(baseLeftPad, menuRightSafe)
    const padY = Math.max(menuTopSafe, menuBottomSafe)

    const w = Math.ceil(rootBox.width + padX * 2)
    const h = Math.ceil(rootBox.height + padY * 2)

    useEffect(() => {
        onCanvasSize?.({ width: w, height: h })
    }, [h, onCanvasSize, w])

    const [pending, setPending] = useState<PendingDrag | null>(null)
    const [dragging, setDragging] = useState<ActiveDrag | null>(null)

    const hiddenElRef = useRef<Readonly<{ nodeId: string; prevOpacity: string }> | null>(null)
    const suppressNextClickRef = useRef(false)

    const restoreHiddenIfAny = useCallback(() => {
        const svg = svgRef.current
        const record = hiddenElRef.current
        if (!svg || !record) return

        const el = svg.querySelector<SVGGElement>(`[data-drag-node-id="${record.nodeId}"]`)
        if (el) el.style.opacity = record.prevOpacity

        hiddenElRef.current = null
    }, [svgRef])

    function getContentPoint(event: Readonly<{ clientX: number; clientY: number }>): Point | null {
        const svg = svgRef.current
        if (!svg) return null
        const p = clientToSvgPoint(svg, event.clientX, event.clientY)
        return { x: p.x - padX, y: p.y - padY }
    }

    function tryHideOriginalNode(nodeId: string) {
        const svg = svgRef.current
        if (!svg) return
        const el = svg.querySelector<SVGGElement>(`[data-drag-node-id="${nodeId}"]`)
        if (!el) return

        hiddenElRef.current = { nodeId, prevOpacity: el.style.opacity }
        el.style.opacity = '0'
    }

    function startNodeDrag(nodeId: string, p: Point) {
        const loc = dragIndex.nodeLocations.get(nodeId)
        if (!loc) return

        const boxNodeType = loc.box.node.type
        const isDraggableNode = boxNodeType === 'process' || boxNodeType === 'if' || boxNodeType === 'case' || boxNodeType === 'loop'
        if (!isDraggableNode) return

        const from = loc.container
        const fromOwnerKey = ownerKeyOfContainer(from)

        const grabOffsetX = p.x - loc.absX
        const grabOffsetY = p.y - loc.absY

        const ghostBox: LayoutBox = { ...loc.box, x: 0, y: 0 }

        tryHideOriginalNode(nodeId)
        suppressNextClickRef.current = true

        setDragging({
            kind: 'node',
            nodeId,
            from,
            fromOwnerKey,
            grabOffsetX,
            grabOffsetY,
            pointerX: p.x,
            pointerY: p.y,
            ghostBox,
        })
    }

    function startIfResultDrag(ifId: string, fromBranch: 'true' | 'false', p: Point) {
        const owner = dragIndex.owners.get(ifId)
        if (!owner) return
        if (owner.box.node.type !== 'if') return

        const ifBox = owner.box
        const leftW = Math.max(0, Math.ceil(ifBox.children[1]?.x ?? ifBox.width / 2))
        const trueBox = ifBox.children[0]
        const falseBox = ifBox.children[1]
        const branchBox = fromBranch === 'true' ? trueBox : falseBox
        if (!branchBox) return

        const branchAbsX = owner.absX + branchBox.x
        const branchAbsY = owner.absY + branchBox.y

        const grabOffsetX = p.x - branchAbsX
        const grabOffsetY = p.y - branchAbsY

        const ghostBox: LayoutBox = { ...branchBox, x: 0, y: 0, width: fromBranch === 'true' ? leftW : ifBox.width - leftW }
        suppressNextClickRef.current = true

        setDragging({
            kind: 'ifResult',
            ifId,
            fromBranch,
            grabOffsetX,
            grabOffsetY,
            pointerX: p.x,
            pointerY: p.y,
            ghostBox,
        })
    }

    function startCaseResultDrag(caseId: string, fromBranchIndex: number, p: Point) {
        const owner = dragIndex.owners.get(caseId)
        if (!owner) return
        if (owner.box.node.type !== 'case') return

        const caseBox = owner.box
        const branchBox = caseBox.children[fromBranchIndex]
        if (!branchBox) return

        const branchAbsX = owner.absX + branchBox.x
        const branchAbsY = owner.absY + branchBox.y

        const grabOffsetX = p.x - branchAbsX
        const grabOffsetY = p.y - branchAbsY

        const ghostBox: LayoutBox = { ...branchBox, x: 0, y: 0 }
        suppressNextClickRef.current = true

        setDragging({
            kind: 'caseResult',
            caseId,
            fromBranchIndex,
            grabOffsetX,
            grabOffsetY,
            pointerX: p.x,
            pointerY: p.y,
            ghostBox,
        })
    }

    function tryStartPendingIfResult(event: ReactPointerEvent<SVGSVGElement>, target: Element): boolean {
        const ifEl = target.closest<SVGGElement>('[data-drag-if-id][data-drag-if-branch]')
        if (!ifEl) return false

        const ifId = ifEl.dataset.dragIfId
        const branch = ifEl.dataset.dragIfBranch
        if (!ifId || (branch !== 'true' && branch !== 'false')) return false

        setPending({
            kind: 'ifResult',
            pointerId: event.pointerId,
            ifId,
            fromBranch: branch,
            startClientX: event.clientX,
            startClientY: event.clientY,
        })

        return true
    }

    function tryStartPendingCaseResult(event: ReactPointerEvent<SVGSVGElement>, target: Element): boolean {
        const caseEl = target.closest<SVGGElement>('[data-drag-case-id][data-drag-case-branch-index]')
        if (!caseEl) return false

        const caseId = caseEl.dataset.dragCaseId
        const idxRaw = caseEl.dataset.dragCaseBranchIndex
        const idx = idxRaw ? Number(idxRaw) : Number.NaN
        if (!caseId || !Number.isFinite(idx)) return false

        setPending({
            kind: 'caseResult',
            pointerId: event.pointerId,
            caseId,
            fromBranchIndex: Math.max(0, Math.floor(idx)),
            startClientX: event.clientX,
            startClientY: event.clientY,
        })

        return true
    }

    function tryStartPendingNode(event: ReactPointerEvent<SVGSVGElement>, target: Element): void {
        const dragNode = target.closest<SVGGElement>('[data-drag-node-id]')
        const nodeId = dragNode?.dataset.dragNodeId
        if (!nodeId) return

        setPending({
            kind: 'node',
            pointerId: event.pointerId,
            nodeId,
            startClientX: event.clientX,
            startClientY: event.clientY,
        })
    }

    function handlePointerDownCapture(event: ReactPointerEvent<SVGSVGElement>) {
        if (event.button !== 0) return
        if (dragging) return

        const svg = svgRef.current
        if (!svg) return

        const target = event.target as Element | null
        if (!target) return

        if (target.closest('[data-no-drag="1"]')) return

        if (tryStartPendingIfResult(event, target)) return
        if (tryStartPendingCaseResult(event, target)) return
        tryStartPendingNode(event, target)
    }

    function handlePointerMoveCapture(event: ReactPointerEvent<SVGSVGElement>) {
        const p = getContentPoint(event)
        if (!p) return

        if (pending) {
            if (pending.pointerId !== event.pointerId) return

            const dx = event.clientX - pending.startClientX
            const dy = event.clientY - pending.startClientY
            const dist2 = dx * dx + dy * dy
            const threshold = 5
            if (dist2 < threshold * threshold) return

            event.preventDefault()
            try {
                svgRef.current?.setPointerCapture(event.pointerId)
            } catch {
                // ignore
            }

            if (pending.kind === 'node') {
                setPending(null)
                startNodeDrag(pending.nodeId, p)
                return
            }

            if (pending.kind === 'ifResult') {
                setPending(null)
                startIfResultDrag(pending.ifId, pending.fromBranch, p)
                return
            }

            setPending(null)
            startCaseResultDrag(pending.caseId, pending.fromBranchIndex, p)
            return
        }

        if (!dragging) return

        event.preventDefault()

        setDragging((prev) => {
            if (!prev) return prev
            return { ...prev, pointerX: p.x, pointerY: p.y } as ActiveDrag
        })
    }

    function finishNodeDrag(d: Extract<ActiveDrag, { kind: 'node' }>, p: Point) {
        const targetContainer = pickDeepestContainer(dragIndex.containers, p)
        if (!targetContainer) return

        const to = targetContainer.key
        if (ownerKeyOfContainer(to) !== d.fromOwnerKey) return

        const toIndex = computeInsertIndexByY(targetContainer, p)

        onMoveByDrag({
            kind: 'node',
            nodeId: d.nodeId,
            from: d.from,
            to,
            toIndex,
        })
    }

    function finishIfResultDrag(d: Extract<ActiveDrag, { kind: 'ifResult' }>, p: Point) {
        const owner = dragIndex.owners.get(d.ifId)
        if (!owner) return
        if (owner.box.node.type !== 'if') return

        const rect = { x: owner.absX, y: owner.absY, w: owner.width, h: owner.height }
        const hit = isPointInRectWithMarginXY(p, rect, OWNER_HIT_MARGIN_X, OWNER_HIT_MARGIN_Y)
        if (!hit) return

        const split = owner.absX + Math.max(0, Math.ceil(owner.box.children[1]?.x ?? owner.box.width / 2))
        const toBranch: 'true' | 'false' = p.x < split ? 'true' : 'false'
        if (toBranch === d.fromBranch) return

        onMoveByDrag({
            kind: 'ifResult',
            nodeId: d.ifId,
            fromBranch: d.fromBranch,
            toBranch,
        })
    }

    function computeCaseResultInsertIndexByX(
        cols: ReadonlyArray<Readonly<{ x: number; w: number }>>,
        x: number,
    ): number | null {
        if (cols.length <= 1) return null

        const leftEdge = cols[0]?.x ?? 0
        const last = cols.at(-1)
        const rightEdge = last ? last.x + last.w : leftEdge

        if (x < leftEdge - CASE_EDGE_MARGIN_X || x > rightEdge + CASE_EDGE_MARGIN_X) return null
        if (x <= leftEdge) return 0
        if (x >= rightEdge) return cols.length

        const hovered = findHoveredColIndexStrict(cols, x)
        if (hovered < 0) return computeInsertIndexByX(cols, x)

        const c = cols[hovered]
        const center = c.x + c.w / 2
        return x < center ? hovered : hovered + 1
    }

    function finishCaseResultDrag(d: Extract<ActiveDrag, { kind: 'caseResult' }>, p: Point) {
        const owner = dragIndex.owners.get(d.caseId)
        if (!owner) return
        if (owner.box.node.type !== 'case') return

        const rect = { x: owner.absX, y: owner.absY, w: owner.width, h: owner.height }
        const hit = isPointInRectWithMarginXY(p, rect, OWNER_HIT_MARGIN_X, OWNER_HIT_MARGIN_Y)
        if (!hit) return

        const cols = owner.box.children.map((b) => ({
            x: owner.absX + b.x,
            w: b.width,
        }))

        const rawToIndex = computeCaseResultInsertIndexByX(cols, p.x)
        if (rawToIndex === null) return

        const toIndex = clampInt(rawToIndex, 0, cols.length)
        if (toIndex === d.fromBranchIndex || toIndex === d.fromBranchIndex + 1) return

        onMoveByDrag({
            kind: 'caseResult',
            nodeId: d.caseId,
            fromBranchIndex: d.fromBranchIndex,
            toIndex,
        })
    }

    function handlePointerUpCapture(event: ReactPointerEvent<SVGSVGElement>) {
        if (pending?.pointerId === event.pointerId) {
            setPending(null)
            return
        }

        if (!dragging) return

        const p = getContentPoint(event)
        restoreHiddenIfAny()

        const current = dragging
        setDragging(null)

        if (!p) return

        if (current.kind === 'node') {
            finishNodeDrag(current, p)
            return
        }

        if (current.kind === 'ifResult') {
            finishIfResultDrag(current, p)
            return
        }

        finishCaseResultDrag(current, p)
    }

    function handlePointerCancelCapture(event: ReactPointerEvent<SVGSVGElement>) {
        if (pending?.pointerId === event.pointerId) {
            setPending(null)
        }

        if (dragging) {
            restoreHiddenIfAny()
            setDragging(null)
        }
    }

    function handleClickCapture(event: ReactPointerEvent<SVGSVGElement>) {
        if (!suppressNextClickRef.current) return
        suppressNextClickRef.current = false
        event.stopPropagation()
        event.preventDefault()
    }

    return (
        <svg
            ref={svgRef}
            className="canvas"
            width={w}
            height={h}
            viewBox={`0 0 ${w} ${h}`}
            style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
                display: 'block',
            }}
            onPointerDownCapture={handlePointerDownCapture}
            onPointerMoveCapture={handlePointerMoveCapture}
            onPointerUpCapture={handlePointerUpCapture}
            onPointerCancelCapture={handlePointerCancelCapture}
            onClickCapture={handleClickCapture}
        >
            <rect x={0} y={0} width={w} height={h} fill="transparent" onClick={onCanvasBlankClick} />

            <g transform={`translate(${padX}, ${padY})`}>
                <RenderNode
                    box={rootBox}
                    style={state.style}
                    selectedNodeId={state.selectedNodeId}
                    selectedTarget={state.selectedTarget}
                    onProcessSelect={onProcessSelect}
                    onProcessDoubleClick={onProcessDoubleClick}
                    onIfHeaderSelect={onIfHeaderSelect}
                    onIfHeaderDoubleClick={onIfHeaderDoubleClick}
                    onIfPartSelect={onIfPartSelect}
                    onIfLabelDoubleClick={onIfLabelDoubleClick}
                    onCaseHeaderSelect={onCaseHeaderSelect}
                    onCaseHeaderDoubleClick={onCaseHeaderDoubleClick}
                    onCasePartSelect={onCasePartSelect}
                    onCaseBranchLabelDoubleClick={onCaseBranchLabelDoubleClick}
                    onLoopSelect={onLoopSelect}
                    onLoopConditionDoubleClick={onLoopConditionDoubleClick}
                    onLoopHoleSelect={onLoopHoleSelect}
                    onInsertProcessAfter={onInsertProcessAfter}
                    onInsertIfAfter={onInsertIfAfter}
                    onInsertCaseAfter={onInsertCaseAfter}
                    onInsertWhileAfter={onInsertWhileAfter}
                    onInsertDoWhileAfter={onInsertDoWhileAfter}
                    onMoveProcessUp={onMoveProcessUp}
                    onMoveProcessDown={onMoveProcessDown}
                    onDeleteProcess={onDeleteProcess}
                    onDeleteSelected={onDeleteSelected}
                    onAddCaseBranch={onAddCaseBranch}
                />

                {dragging ? (
                    <g
                        transform={`translate(${dragging.pointerX - dragging.grabOffsetX}, ${dragging.pointerY - dragging.grabOffsetY})`}
                        opacity={0.55}
                        pointerEvents="none"
                    >
                        <RenderNode
                            box={dragging.ghostBox}
                            style={state.style}
                            selectedNodeId={null}
                            selectedTarget={null}
                            onProcessSelect={() => {}}
                            onProcessDoubleClick={() => {}}
                            onIfHeaderSelect={() => {}}
                            onIfHeaderDoubleClick={() => {}}
                            onIfPartSelect={() => {}}
                            onIfLabelDoubleClick={() => {}}
                            onCaseHeaderSelect={() => {}}
                            onCaseHeaderDoubleClick={() => {}}
                            onCasePartSelect={() => {}}
                            onCaseBranchLabelDoubleClick={() => {}}
                            onLoopSelect={() => {}}
                            onLoopConditionDoubleClick={() => {}}
                            onLoopHoleSelect={() => {}}
                            onInsertProcessAfter={() => {}}
                            onInsertIfAfter={() => {}}
                            onInsertCaseAfter={() => {}}
                            onInsertWhileAfter={() => {}}
                            onInsertDoWhileAfter={() => {}}
                            onMoveProcessUp={() => {}}
                            onMoveProcessDown={() => {}}
                            onDeleteProcess={() => {}}
                            onDeleteSelected={() => {}}
                            onAddCaseBranch={() => {}}
                        />
                    </g>
                ) : null}
            </g>
        </svg>
    )
}