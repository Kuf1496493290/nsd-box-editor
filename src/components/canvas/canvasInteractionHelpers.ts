import type { Dispatch, RefObject, SetStateAction, PointerEvent as ReactPointerEvent } from 'react'
import type { CasePartKey, DragContainerKey, DragMoveRequest, IfPartKey } from '../../app/types'
import type { LayoutBox } from '../../layout/layoutTypes'
import {
    clampInt,
    computeInsertIndexByY,
    computeReorderInsertIndexByX,
    EDGE_MARGIN_X,
    isPointInRectWithMarginXY,
    ownerKeyOfContainer,
    OWNER_HIT_MARGIN_X,
    OWNER_HIT_MARGIN_Y,
    pickDeepestContainer,
    type DragIndex,
    type Point,
} from './dragHelpers'
import { perfEnabled, perfLogDuration, perfNow } from '../../utils/perf'

export type PendingDrag =
    | Readonly<{ kind: 'node'; pointerId: number; nodeId: string; startClientX: number; startClientY: number }>
    | Readonly<{ kind: 'ifResult'; pointerId: number; ifId: string; fromBranch: 'true' | 'false'; startClientX: number; startClientY: number }>
    | Readonly<{ kind: 'caseResult'; pointerId: number; caseId: string; fromBranchIndex: number; startClientX: number; startClientY: number }>

export type ActiveDrag =
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

type PointerHandlers = Readonly<{
    handlePointerDownCapture: (event: ReactPointerEvent<SVGSVGElement>) => void
    handlePointerMoveCapture: (event: ReactPointerEvent<SVGSVGElement>) => void
    handlePointerUpCapture: (event: ReactPointerEvent<SVGSVGElement>) => void
    handlePointerCancelCapture: (event: ReactPointerEvent<SVGSVGElement>) => void
}>

type DragLifecycle = Readonly<{
    selectNodeForPointerDown: (nodeId: string) => void
    selectIfResultForPointerDown: (ifId: string, branch: 'true' | 'false') => void
    selectCaseResultForPointerDown: (caseId: string, branchIndex: number) => void
    startNodeDrag: (nodeId: string, p: Point) => void
    startIfResultDrag: (ifId: string, fromBranch: 'true' | 'false', p: Point) => void
    startCaseResultDrag: (caseId: string, fromBranchIndex: number, p: Point) => void
    finishNodeDrag: (drag: Extract<ActiveDrag, { kind: 'node' }>, p: Point) => void
    finishIfResultDrag: (drag: Extract<ActiveDrag, { kind: 'ifResult' }>, p: Point) => void
    finishCaseResultDrag: (drag: Extract<ActiveDrag, { kind: 'caseResult' }>, p: Point) => void
}>

/**
 * 创建拖拽生命周期动作：负责选中同步、拖拽启动与落点提交。
 */
export function createDragLifecycle(params: Readonly<{
    dragIndex: DragIndex
    setOpenInsertMenuNodeId: (next: string | null | ((prev: string | null) => string | null)) => void
    setDragging: Dispatch<SetStateAction<ActiveDrag | null>>
    armSuppressNextClick: () => void
    tryHideOriginalNode: (nodeId: string) => void
    tryHideIfColumn: (ifId: string, branch: 'true' | 'false') => void
    tryHideCaseColumn: (caseId: string, branchIndex: number) => void
    onMoveByDrag: (req: DragMoveRequest) => void
    onProcessSelect: (nodeId: string) => void
    onLoopSelect: (nodeId: string) => void
    onIfHeaderSelect: (nodeId: string) => void
    onCaseHeaderSelect: (nodeId: string) => void
    onIfPartSelect: (nodeId: string, part: IfPartKey) => void
    onCasePartSelect: (nodeId: string, part: CasePartKey, branchIndex?: number) => void
}>): DragLifecycle {
    const {
        dragIndex,
        setOpenInsertMenuNodeId,
        setDragging,
        armSuppressNextClick,
        tryHideOriginalNode,
        tryHideIfColumn,
        tryHideCaseColumn,
        onMoveByDrag,
        onProcessSelect,
        onLoopSelect,
        onIfHeaderSelect,
        onCaseHeaderSelect,
        onIfPartSelect,
        onCasePartSelect,
    } = params

    function selectNodeForPointerDown(nodeId: string) {
        const loc = dragIndex.nodeLocations.get(nodeId)
        const t = loc?.box.node.type

        if (t === 'process') {
            onProcessSelect(nodeId)
            return
        }

        if (t === 'loop') {
            onLoopSelect(nodeId)
            return
        }

        if (t === 'if') {
            onIfHeaderSelect(nodeId)
            return
        }

        if (t === 'case') {
            onCaseHeaderSelect(nodeId)
            return
        }

        onProcessSelect(nodeId)
    }

    function selectIfResultForPointerDown(ifId: string, branch: 'true' | 'false') {
        onIfPartSelect(ifId, branch === 'true' ? 'trueLabel' : 'falseLabel')
    }

    function selectCaseResultForPointerDown(caseId: string, branchIndex: number) {
        onCasePartSelect(caseId, 'branchLabel', branchIndex)
    }

    function startNodeDrag(nodeId: string, p: Point) {
        setOpenInsertMenuNodeId(null)

        const loc = dragIndex.nodeLocations.get(nodeId)
        if (!loc) return

        const boxNodeType = loc.box.node.type
        const isDraggableNode =
            boxNodeType === 'process' || boxNodeType === 'if' || boxNodeType === 'case' || boxNodeType === 'loop'
        if (!isDraggableNode) return

        const from = loc.container
        const fromOwnerKey = ownerKeyOfContainer(from)

        const grabOffsetX = p.x - loc.absX
        const grabOffsetY = p.y - loc.absY

        const ghostBox: LayoutBox = { ...loc.box, x: 0, y: 0 }

        tryHideOriginalNode(nodeId)
        armSuppressNextClick()

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
        setOpenInsertMenuNodeId(null)

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

        const ghostBox: LayoutBox = {
            ...branchBox,
            x: 0,
            y: 0,
            width: fromBranch === 'true' ? leftW : ifBox.width - leftW,
        }

        tryHideIfColumn(ifId, fromBranch)
        armSuppressNextClick()

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
        setOpenInsertMenuNodeId(null)

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

        tryHideCaseColumn(caseId, fromBranchIndex)
        armSuppressNextClick()

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

    function finishNodeDrag(d: Extract<ActiveDrag, { kind: 'node' }>, p: Point) {
        const start = perfNow()
        const targetContainer = pickDeepestContainer(dragIndex.containers, p, d.fromOwnerKey)
        if (!targetContainer) {
            perfLogDuration('drag.finishNodeDrag', start, { dropped: false })
            return
        }

        const to = targetContainer.key
        if (ownerKeyOfContainer(to) !== d.fromOwnerKey) {
            perfLogDuration('drag.finishNodeDrag', start, { dropped: false, ownerMismatch: true })
            return
        }

        const toIndex = computeInsertIndexByY(targetContainer, p)
        onMoveByDrag({ kind: 'node', nodeId: d.nodeId, from: d.from, to, toIndex })
        perfLogDuration('drag.finishNodeDrag', start, { dropped: true })
    }

    function finishIfResultDrag(d: Extract<ActiveDrag, { kind: 'ifResult' }>, p: Point) {
        const start = perfNow()
        const owner = dragIndex.owners.get(d.ifId)
        if (owner?.box.node.type !== 'if') {
            perfLogDuration('drag.finishIfResultDrag', start, { dropped: false })
            return
        }

        const rect = { x: owner.absX, y: owner.absY, w: owner.width, h: owner.height }
        if (!isPointInRectWithMarginXY(p, rect, OWNER_HIT_MARGIN_X, OWNER_HIT_MARGIN_Y)) {
            perfLogDuration('drag.finishIfResultDrag', start, { dropped: false, outOfOwner: true })
            return
        }

        const ifBox = owner.box
        const leftW = Math.max(0, Math.ceil(ifBox.children[1]?.x ?? ifBox.width / 2))
        const rightW = Math.max(0, ifBox.width - leftW)

        const cols = [
            { x: owner.absX, w: leftW },
            { x: owner.absX + leftW, w: rightW },
        ] as const

        const rawToIndex = computeReorderInsertIndexByX(cols, p.x, EDGE_MARGIN_X)
        if (rawToIndex === null) {
            perfLogDuration('drag.finishIfResultDrag', start, { dropped: false, outOfEdge: true })
            return
        }

        const fromIndex = d.fromBranch === 'true' ? 0 : 1
        const toIndex = clampInt(rawToIndex, 0, 2)

        if (toIndex === fromIndex || toIndex === fromIndex + 1) {
            perfLogDuration('drag.finishIfResultDrag', start, { dropped: false, noMove: true })
            return
        }

        const toBranch: 'true' | 'false' = d.fromBranch === 'true' ? 'false' : 'true'
        onMoveByDrag({ kind: 'ifResult', nodeId: d.ifId, fromBranch: d.fromBranch, toBranch })
        perfLogDuration('drag.finishIfResultDrag', start, { dropped: true })
    }

    function finishCaseResultDrag(d: Extract<ActiveDrag, { kind: 'caseResult' }>, p: Point) {
        const start = perfNow()
        const owner = dragIndex.owners.get(d.caseId)
        if (owner?.box.node.type !== 'case') {
            perfLogDuration('drag.finishCaseResultDrag', start, { dropped: false })
            return
        }

        const rect = { x: owner.absX, y: owner.absY, w: owner.width, h: owner.height }
        if (!isPointInRectWithMarginXY(p, rect, OWNER_HIT_MARGIN_X, OWNER_HIT_MARGIN_Y)) {
            perfLogDuration('drag.finishCaseResultDrag', start, { dropped: false, outOfOwner: true })
            return
        }

        const cols = owner.box.children.map((b) => ({ x: owner.absX + b.x, w: b.width }))
        const rawToIndex = computeReorderInsertIndexByX(cols, p.x, EDGE_MARGIN_X)
        if (rawToIndex === null) {
            perfLogDuration('drag.finishCaseResultDrag', start, { dropped: false, outOfEdge: true })
            return
        }

        const toIndex = clampInt(rawToIndex, 0, cols.length)
        if (toIndex === d.fromBranchIndex || toIndex === d.fromBranchIndex + 1) {
            perfLogDuration('drag.finishCaseResultDrag', start, { dropped: false, noMove: true })
            return
        }

        onMoveByDrag({ kind: 'caseResult', nodeId: d.caseId, fromBranchIndex: d.fromBranchIndex, toIndex })
        perfLogDuration('drag.finishCaseResultDrag', start, { dropped: true })
    }

    return {
        selectNodeForPointerDown,
        selectIfResultForPointerDown,
        selectCaseResultForPointerDown,
        startNodeDrag,
        startIfResultDrag,
        startCaseResultDrag,
        finishNodeDrag,
        finishIfResultDrag,
        finishCaseResultDrag,
    }
}

/**
 * 创建 SVG 指针事件处理器：把 pending/dragging 状态机收敛为统一捕获流程。
 */
export function createDragPointerHandlers(params: Readonly<{
    pending: PendingDrag | null
    dragging: ActiveDrag | null
    setPending: Dispatch<SetStateAction<PendingDrag | null>>
    setDragging: Dispatch<SetStateAction<ActiveDrag | null>>
    svgRef: RefObject<SVGSVGElement | null>
    getContentPoint: (event: Readonly<{ clientX: number; clientY: number }>) => Point | null
    selectNodeForPointerDown: (nodeId: string) => void
    selectIfResultForPointerDown: (ifId: string, branch: 'true' | 'false') => void
    selectCaseResultForPointerDown: (caseId: string, branchIndex: number) => void
    startNodeDrag: (nodeId: string, p: Point) => void
    startIfResultDrag: (ifId: string, fromBranch: 'true' | 'false', p: Point) => void
    startCaseResultDrag: (caseId: string, fromBranchIndex: number, p: Point) => void
    finishNodeDrag: (drag: Extract<ActiveDrag, { kind: 'node' }>, p: Point) => void
    finishIfResultDrag: (drag: Extract<ActiveDrag, { kind: 'ifResult' }>, p: Point) => void
    finishCaseResultDrag: (drag: Extract<ActiveDrag, { kind: 'caseResult' }>, p: Point) => void
    restoreHiddenIfAny: () => void
    restoreHiddenIfColumnIfAny: () => void
    restoreHiddenCaseColumnIfAny: () => void
}>): PointerHandlers {
    const {
        pending,
        dragging,
        setPending,
        setDragging,
        svgRef,
        getContentPoint,
        selectNodeForPointerDown,
        selectIfResultForPointerDown,
        selectCaseResultForPointerDown,
        startNodeDrag,
        startIfResultDrag,
        startCaseResultDrag,
        finishNodeDrag,
        finishIfResultDrag,
        finishCaseResultDrag,
        restoreHiddenIfAny,
        restoreHiddenIfColumnIfAny,
        restoreHiddenCaseColumnIfAny,
    } = params

    let pointerMoveWindowStartMs = 0
    let pointerMoveCount = 0

    function samplePointerMoveRate(): void {
        if (!perfEnabled()) return

        const now = perfNow()
        if (pointerMoveWindowStartMs <= 0) pointerMoveWindowStartMs = now

        pointerMoveCount += 1
        const elapsed = now - pointerMoveWindowStartMs
        if (elapsed < 1000) return

        const perSecond = Math.round((pointerMoveCount * 1000) / Math.max(1, elapsed))
        console.info(`[perf] pointermove ${perSecond}/s`)
        pointerMoveWindowStartMs = now
        pointerMoveCount = 0
    }

    function tryStartPendingIfResult(event: ReactPointerEvent<SVGSVGElement>, target: Element): boolean {
        const ifEl = target.closest<SVGGraphicsElement>('[data-drag-if-id][data-drag-if-branch]')
        if (!ifEl) return false

        const ifId = ifEl.dataset.dragIfId
        const branch = ifEl.dataset.dragIfBranch
        if (!ifId || (branch !== 'true' && branch !== 'false')) return false

        selectIfResultForPointerDown(ifId, branch)
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
        const caseEl = target.closest<SVGGraphicsElement>('[data-drag-case-id][data-drag-case-branch-index]')
        if (!caseEl) return false

        const caseId = caseEl.dataset.dragCaseId
        const idxRaw = caseEl.dataset.dragCaseBranchIndex
        const idx = idxRaw ? Number(idxRaw) : Number.NaN
        if (!caseId || !Number.isFinite(idx)) return false

        selectCaseResultForPointerDown(caseId, Math.max(0, Math.floor(idx)))
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

        selectNodeForPointerDown(nodeId)
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

        const target = event.target as Element | null
        if (!target) return
        if (target.closest('[data-no-drag="1"]')) return

        if (tryStartPendingIfResult(event, target)) return
        if (tryStartPendingCaseResult(event, target)) return
        tryStartPendingNode(event, target)
    }

    function handlePointerMoveCapture(event: ReactPointerEvent<SVGSVGElement>) {
        samplePointerMoveRate()
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
                // 指针捕获失败时忽略，不影响后续拖拽流程。
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
        const dragMoveStart = perfNow()
        setDragging((prev) => (prev ? ({ ...prev, pointerX: p.x, pointerY: p.y } as ActiveDrag) : prev))
        perfLogDuration('drag.pointerMove.setDragging', dragMoveStart)
    }

    function handlePointerUpCapture(event: ReactPointerEvent<SVGSVGElement>) {
        if (pending?.pointerId === event.pointerId) {
            setPending(null)
            return
        }

        if (!dragging) return

        const p = getContentPoint(event)
        restoreHiddenIfAny()
        restoreHiddenIfColumnIfAny()
        restoreHiddenCaseColumnIfAny()

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
        if (pending?.pointerId === event.pointerId) setPending(null)

        if (dragging) {
            restoreHiddenIfAny()
            restoreHiddenIfColumnIfAny()
            restoreHiddenCaseColumnIfAny()
            setDragging(null)
        }
    }

    return {
        handlePointerDownCapture,
        handlePointerMoveCapture,
        handlePointerUpCapture,
        handlePointerCancelCapture,
    }
}