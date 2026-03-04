// FILE: src/components/CanvasView.tsx
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type MouseEvent as ReactMouseEvent,
    type PointerEvent as ReactPointerEvent,
    type RefObject,
} from 'react'
import type { AppState, CasePartKey, DragContainerKey, DragMoveRequest, IfPartKey, SelectionTarget } from '../app/types'
import { canDeleteByTarget } from '../app/selection'
import { layoutRoot } from '../layout/layoutEngine'
import type { LayoutBox } from '../layout/layoutTypes'
import { RenderNode } from '../render/renderNode'
import { renderSelectionOutline } from '../render/renderCommon'
import { NodeActions } from './NodeActions'

type CanvasViewProps = Readonly<{
    state: AppState
    svgRef: RefObject<SVGSVGElement | null>

    onCanvasSize?: (size: Readonly<{ width: number; height: number }>) => void
    onDragStateChange?: (active: boolean) => void

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

type InsertMenuProps = Readonly<{
    x: number
    y: number
    open: boolean
    onToggle: () => void
    onInsertProcess: () => void
    onInsertIf: () => void
    onInsertCase: () => void
    onInsertWhile: () => void
    onInsertDoWhile: () => void
    showAddCaseBranch?: boolean
    onAddCaseBranch?: () => void
}>

function stopAndRun(event: ReactMouseEvent<SVGGElement>, fn: () => void) {
    event.stopPropagation()
    fn()
}

function InsertMenu(props: InsertMenuProps) {
    const {
        x,
        y,
        open,
        onToggle,
        onInsertProcess,
        onInsertIf,
        onInsertCase,
        onInsertWhile,
        onInsertDoWhile,
        showAddCaseBranch = false,
        onAddCaseBranch,
    } = props

    function handleToggle(event: ReactMouseEvent<SVGGElement>) {
        event.stopPropagation()
        onToggle()
    }

    const menuX = x + 40
    const menuW = 132
    const itemH = 24

    const items: ReadonlyArray<Readonly<{ key: string; label: string; onClick: () => void }>> = (() => {
        const base = [
            { key: 'process', label: '插入步骤', onClick: onInsertProcess },
            { key: 'if', label: '插入 IF', onClick: onInsertIf },
            { key: 'case', label: '插入 CASE', onClick: onInsertCase },
            { key: 'while', label: '插入 WHILE', onClick: onInsertWhile },
            { key: 'doWhile', label: '插入 DO-WHILE', onClick: onInsertDoWhile },
        ] as const

        if (!showAddCaseBranch || !onAddCaseBranch) return base
        return [...base, { key: 'addCaseBranch', label: '增加分支', onClick: onAddCaseBranch }]
    })()

    const menuH = itemH * items.length
    const menuY = Math.round(y - 8 - menuH / 2)

    const closeHalf = 4
    const plusHalf = closeHalf * Math.SQRT2

    return (
        <g data-no-drag="1">
            <g
                transform={`translate(${x}, ${y})`}
                onClick={handleToggle}
                style={{ cursor: 'pointer' }}
                aria-label="插入下一步"
                data-no-drag="1"
            >
                <circle cx={0} cy={0} r={10} fill="white" stroke="black" strokeWidth={1} />
                <line x1={-plusHalf} y1={0} x2={plusHalf} y2={0} stroke="black" strokeWidth={1.5} pointerEvents="none" />
                <line x1={0} y1={-plusHalf} x2={0} y2={plusHalf} stroke="black" strokeWidth={1.5} pointerEvents="none" />
            </g>

            {open ? (
                <g transform={`translate(${menuX}, ${menuY})`} aria-label="插入类型菜单" data-no-drag="1">
                    <rect x={0} y={0} width={menuW} height={menuH} rx={6} ry={6} fill="white" stroke="black" strokeWidth={1} />

                    {Array.from({ length: Math.max(0, items.length - 1) }, (_, i) => (
                        <line
                            key={`sep-${i}`}
                            x1={0}
                            y1={itemH * (i + 1)}
                            x2={menuW}
                            y2={itemH * (i + 1)}
                            stroke="black"
                            strokeWidth={1}
                        />
                    ))}

                    {items.map((it, idx) => (
                        <g key={it.key} onClick={(e) => stopAndRun(e, it.onClick)} style={{ cursor: 'pointer' }} data-no-drag="1">
                            <rect x={0} y={itemH * idx} width={menuW} height={itemH} fill="transparent" />
                            <text x={8} y={itemH * idx + 16} fontSize={12} fill="black">
                                {it.label}
                            </text>
                        </g>
                    ))}
                </g>
            ) : null}
        </g>
    )
}

type HoverOverlay = Readonly<{
    nodeId: string
    insertX: number
    insertY: number
    deleteX: number
    deleteEnabled: boolean
    showAddCaseBranch: boolean
}>

const CONTAINER_HIT_MARGIN_X = 6
const CONTAINER_HIT_MARGIN_Y = 24

const OWNER_HIT_MARGIN_X = 6
const OWNER_HIT_MARGIN_Y = 24

const EDGE_MARGIN_X = 24

function clampScale(value: number): number {
    const v = Number.isFinite(value) ? value : 1
    const clamped = Math.max(0.5, Math.min(2, v))
    return Math.round(clamped * 10) / 10
}

function ownerKeyOfContainer(container: DragContainerKey): string {
    return container.kind === 'root' ? 'root' : container.nodeId
}

function isPointInRectWithMarginXY(
    p: Point,
    rect: Readonly<{ x: number; y: number; w: number; h: number }>,
    marginX: number,
    marginY: number,
): boolean {
    return p.x >= rect.x - marginX && p.x <= rect.x + rect.w + marginX && p.y >= rect.y - marginY && p.y <= rect.y + rect.h + marginY
}

function pickDeepestContainer(containers: ReadonlyArray<ContainerInfo>, p: Point, ownerKey?: string): ContainerInfo | null {
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

/** 抽出重复逻辑：列重排的“边界 + 半区规则”插入位计算 */
function computeReorderInsertIndexByX(cols: ReadonlyArray<Readonly<{ x: number; w: number }>>, x: number, edgeMarginX: number): number | null {
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
    | Readonly<{ kind: 'node'; pointerId: number; nodeId: string; startClientX: number; startClientY: number }>
    | Readonly<{ kind: 'ifResult'; pointerId: number; ifId: string; fromBranch: 'true' | 'false'; startClientX: number; startClientY: number }>
    | Readonly<{ kind: 'caseResult'; pointerId: number; caseId: string; fromBranchIndex: number; startClientX: number; startClientY: number }>

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

type AnchorRect = Readonly<{ absX: number; absY: number; width: number; height: number }>

function isWholeNodeSelection(target: SelectionTarget): boolean {
    if (target.kind === 'node') return true
    if (target.kind === 'ifPart') return target.part === 'header'
    return target.kind === 'casePart' && target.part === 'header'
}

function isWholeNodeType(type: string | undefined): boolean {
    return type === 'if' || type === 'case' || type === 'loop'
}

export function CanvasView(props: CanvasViewProps) {
    const {
        state,
        svgRef,
        onCanvasSize,
        onDragStateChange,
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

    const diagramScale = clampScale(state.scale)
    const rootBox = useMemo(() => layoutRoot(state.root, state.style), [state.root, state.style])
    const dragIndex = useMemo(() => buildDragIndex(rootBox), [rootBox])

    const baseLeftPad = 20
    const menuTopSafe = 90
    const menuRightSafe = 220
    const menuBottomSafe = 80

    const padX = Math.max(baseLeftPad, menuRightSafe)
    const padY = Math.max(menuTopSafe, menuBottomSafe)

    const w = Math.ceil((rootBox.width + padX * 2) * diagramScale)
    const h = Math.ceil((rootBox.height + padY * 2) * diagramScale)

    useEffect(() => {
        onCanvasSize?.({ width: w, height: h })
    }, [h, onCanvasSize, w])

    const [pending, setPending] = useState<PendingDrag | null>(null)
    const [dragging, setDragging] = useState<ActiveDrag | null>(null)

    useEffect(() => {
        onDragStateChange?.(pending !== null || dragging !== null)
    }, [dragging, onDragStateChange, pending])

    useEffect(() => {
        return () => {
            onDragStateChange?.(false)
        }
    }, [onDragStateChange])

    const [openInsertMenuNodeId, setOpenInsertMenuNodeId] = useState<string | null>(null)

    const suppressNextClickRef = useRef(false)
    const suppressClickTimerRef = useRef<number | null>(null)

    const armSuppressNextClick = useCallback(() => {
        suppressNextClickRef.current = true

        if (suppressClickTimerRef.current !== null) {
            globalThis.clearTimeout(suppressClickTimerRef.current)
            suppressClickTimerRef.current = null
        }

        suppressClickTimerRef.current = globalThis.setTimeout(() => {
            suppressNextClickRef.current = false
            suppressClickTimerRef.current = null
        }, 220)
    }, [])

    useEffect(() => {
        return () => {
            if (suppressClickTimerRef.current !== null) {
                globalThis.clearTimeout(suppressClickTimerRef.current)
                suppressClickTimerRef.current = null
            }
        }
    }, [])

    const hiddenElRef = useRef<Readonly<{ nodeId: string; prevOpacity: string }> | null>(null)
    const hiddenIfColumnRef = useRef<Readonly<{ ifId: string; branch: 'true' | 'false'; prevOpacity: string }> | null>(null)

    const restoreHiddenIfAny = useCallback(() => {
        const svg = svgRef.current
        const record = hiddenElRef.current
        if (!svg || !record) return

        const el = svg.querySelector<SVGGElement>(`[data-drag-node-id="${record.nodeId}"]`)
        if (el) el.style.opacity = record.prevOpacity

        hiddenElRef.current = null
    }, [svgRef])

    const restoreHiddenIfColumnIfAny = useCallback(() => {
        const svg = svgRef.current
        const record = hiddenIfColumnRef.current
        if (!svg || !record) return

        const el = svg.querySelector<SVGGElement>(
            `[data-drag-if-column-id="${record.ifId}"][data-drag-if-column-branch="${record.branch}"]`,
        )
        if (el) el.style.opacity = record.prevOpacity

        hiddenIfColumnRef.current = null
    }, [svgRef])

    const handleCanvasBlankClickLocal = useCallback(() => {
        setOpenInsertMenuNodeId(null)
        onCanvasBlankClick()
    }, [onCanvasBlankClick])

    const getContentPoint = useCallback(
        (event: Readonly<{ clientX: number; clientY: number }>): Point | null => {
            const svg = svgRef.current
            if (!svg) return null
            const p = clientToSvgPoint(svg, event.clientX, event.clientY)
            return { x: p.x / diagramScale - padX, y: p.y / diagramScale - padY }
        },
        [diagramScale, padX, padY, svgRef],
    )

    const tryHideOriginalNode = useCallback(
        (nodeId: string) => {
            const svg = svgRef.current
            if (!svg) return
            const el = svg.querySelector<SVGGElement>(`[data-drag-node-id="${nodeId}"]`)
            if (!el) return

            hiddenElRef.current = { nodeId, prevOpacity: el.style.opacity }
            el.style.opacity = '0'
        },
        [svgRef],
    )

    const tryHideIfColumn = useCallback(
        (ifId: string, branch: 'true' | 'false') => {
            const svg = svgRef.current
            if (!svg) return

            const el = svg.querySelector<SVGGElement>(
                `[data-drag-if-column-id="${ifId}"][data-drag-if-column-branch="${branch}"]`,
            )
            if (!el) return

            hiddenIfColumnRef.current = { ifId, branch, prevOpacity: el.style.opacity }
            el.style.opacity = '0'
        },
        [svgRef],
    )

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
        const isDraggableNode = boxNodeType === 'process' || boxNodeType === 'if' || boxNodeType === 'case' || boxNodeType === 'loop'
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

        const ghostBox: LayoutBox = { ...branchBox, x: 0, y: 0, width: fromBranch === 'true' ? leftW : ifBox.width - leftW }

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

    function tryStartPendingIfResult(event: ReactPointerEvent<SVGSVGElement>, target: Element): boolean {
        const ifEl = target.closest<SVGGElement>('[data-drag-if-id][data-drag-if-branch]')
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
        const caseEl = target.closest<SVGGElement>('[data-drag-case-id][data-drag-case-branch-index]')
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
        setDragging((prev) => (prev ? ({ ...prev, pointerX: p.x, pointerY: p.y } as ActiveDrag) : prev))
    }

    function finishNodeDrag(d: Extract<ActiveDrag, { kind: 'node' }>, p: Point) {
        const targetContainer = pickDeepestContainer(dragIndex.containers, p, d.fromOwnerKey)
        if (!targetContainer) return

        const to = targetContainer.key
        if (ownerKeyOfContainer(to) !== d.fromOwnerKey) return

        const toIndex = computeInsertIndexByY(targetContainer, p)
        onMoveByDrag({ kind: 'node', nodeId: d.nodeId, from: d.from, to, toIndex })
    }

    function finishIfResultDrag(d: Extract<ActiveDrag, { kind: 'ifResult' }>, p: Point) {
        const owner = dragIndex.owners.get(d.ifId)
        if (!owner || owner.box.node.type !== 'if') return

        const rect = { x: owner.absX, y: owner.absY, w: owner.width, h: owner.height }
        if (!isPointInRectWithMarginXY(p, rect, OWNER_HIT_MARGIN_X, OWNER_HIT_MARGIN_Y)) return

        const ifBox = owner.box
        const leftW = Math.max(0, Math.ceil(ifBox.children[1]?.x ?? ifBox.width / 2))
        const rightW = Math.max(0, ifBox.width - leftW)

        const cols = [
            { x: owner.absX, w: leftW },
            { x: owner.absX + leftW, w: rightW },
        ] as const

        const rawToIndex = computeReorderInsertIndexByX(cols, p.x, EDGE_MARGIN_X)
        if (rawToIndex === null) return

        const fromIndex = d.fromBranch === 'true' ? 0 : 1
        const toIndex = clampInt(rawToIndex, 0, 2)

        if (toIndex === fromIndex || toIndex === fromIndex + 1) return

        const toBranch: 'true' | 'false' = d.fromBranch === 'true' ? 'false' : 'true'
        onMoveByDrag({ kind: 'ifResult', nodeId: d.ifId, fromBranch: d.fromBranch, toBranch })
    }

    function finishCaseResultDrag(d: Extract<ActiveDrag, { kind: 'caseResult' }>, p: Point) {
        const owner = dragIndex.owners.get(d.caseId)
        if (!owner || owner.box.node.type !== 'case') return

        const rect = { x: owner.absX, y: owner.absY, w: owner.width, h: owner.height }
        if (!isPointInRectWithMarginXY(p, rect, OWNER_HIT_MARGIN_X, OWNER_HIT_MARGIN_Y)) return

        const cols = owner.box.children.map((b) => ({ x: owner.absX + b.x, w: b.width }))
        const rawToIndex = computeReorderInsertIndexByX(cols, p.x, EDGE_MARGIN_X)
        if (rawToIndex === null) return

        const toIndex = clampInt(rawToIndex, 0, cols.length)
        if (toIndex === d.fromBranchIndex || toIndex === d.fromBranchIndex + 1) return

        onMoveByDrag({ kind: 'caseResult', nodeId: d.caseId, fromBranchIndex: d.fromBranchIndex, toIndex })
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
            setDragging(null)
        }
    }

    function handleClickCapture(event: ReactPointerEvent<SVGSVGElement>) {
        if (!suppressNextClickRef.current) return

        suppressNextClickRef.current = false
        if (suppressClickTimerRef.current !== null) {
            globalThis.clearTimeout(suppressClickTimerRef.current)
            suppressClickTimerRef.current = null
        }

        event.stopPropagation()
        event.preventDefault()
    }

    const resolveCaseBranchContainerAnchor = useCallback(
        (nodeId: string, target: SelectionTarget | null): AnchorRect | null => {
            if (target?.kind !== 'casePart' || target.nodeId !== nodeId || target.part !== 'branchContainer') return null

            const owner = dragIndex.owners.get(nodeId)
            if (owner?.box.node.type !== 'case') return null

            const b = owner.box.children[target.branchIndex]
            if (!b) return null

            return { absX: owner.absX + b.x, absY: owner.absY + b.y, width: b.width, height: b.height }
        },
        [dragIndex.owners],
    )

    const resolveLoopHoleAnchor = useCallback(
        (nodeId: string, target: SelectionTarget | null): AnchorRect | null => {
            if (target?.kind !== 'loopPart' || target.nodeId !== nodeId || target.part !== 'hole') return null

            const loc = dragIndex.nodeLocations.get(nodeId)
            if (loc?.box.node.type !== 'loop') return null

            const body = loc.box.children[0]
            if (!body) return null

            return { absX: loc.absX + body.x, absY: loc.absY + body.y, width: body.width, height: body.height }
        },
        [dragIndex.nodeLocations],
    )

    const resolveDefaultAnchor = useCallback(
        (nodeId: string): AnchorRect | null => {
            const loc = dragIndex.nodeLocations.get(nodeId)
            if (!loc) return null
            return { absX: loc.absX, absY: loc.absY, width: loc.width, height: loc.height }
        },
        [dragIndex.nodeLocations],
    )

    const resolveAnchorRect = useCallback(
        (nodeId: string, target: SelectionTarget | null): AnchorRect | null => {
            return (
                resolveCaseBranchContainerAnchor(nodeId, target) ??
                resolveLoopHoleAnchor(nodeId, target) ??
                resolveDefaultAnchor(nodeId)
            )
        },
        [resolveCaseBranchContainerAnchor, resolveDefaultAnchor, resolveLoopHoleAnchor],
    )

    const hoverOverlay = useMemo<HoverOverlay | null>(() => {
        const target = state.selectedTarget
        const activeNodeId = target?.nodeId ?? state.selectedNodeId
        if (!activeNodeId) return null

        const loc = dragIndex.nodeLocations.get(activeNodeId)
        const nodeType = loc?.box.node.type
        const isInsertableNode = nodeType === 'process' || nodeType === 'if' || nodeType === 'case' || nodeType === 'loop'
        if (!isInsertableNode) return null

        const anchor = resolveAnchorRect(activeNodeId, target)
        if (!anchor) return null

        const insertX = anchor.absX + anchor.width + 18
        const insertY = anchor.absY + anchor.height / 2
        const deleteX = insertX + 24

        const deleteEnabled = target?.nodeId === activeNodeId ? canDeleteByTarget(target) : state.selectedNodeId === activeNodeId

        const showAddCaseBranch =
            nodeType === 'case' &&
            target?.kind === 'casePart' &&
            target.part === 'header' &&
            target.nodeId === activeNodeId

        return { nodeId: activeNodeId, insertX, insertY, deleteX, deleteEnabled, showAddCaseBranch }
    }, [dragIndex.nodeLocations, resolveAnchorRect, state.selectedNodeId, state.selectedTarget])

    const isInsertMenuOpen = hoverOverlay?.nodeId !== undefined && openInsertMenuNodeId === hoverOverlay?.nodeId

    const topSelectionBox = useMemo<LayoutBox | null>(() => {
        const t = state.selectedTarget
        if (!t) return null
        if (!isWholeNodeSelection(t)) return null

        const loc = dragIndex.nodeLocations.get(t.nodeId)
        const nodeType = loc?.box.node.type
        if (!isWholeNodeType(nodeType)) return null
        if (!loc) return null

        return {
            ...loc.box,
            x: loc.absX,
            y: loc.absY,
            width: loc.width,
            height: loc.height,
        }
    }, [dragIndex.nodeLocations, state.selectedTarget])

    return (
        <svg
            ref={svgRef}
            className="canvas"
            width={w}
            height={h}
            viewBox={`0 0 ${w} ${h}`}
            style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', display: 'block' }}
            onPointerDownCapture={handlePointerDownCapture}
            onPointerMoveCapture={handlePointerMoveCapture}
            onPointerUpCapture={handlePointerUpCapture}
            onPointerCancelCapture={handlePointerCancelCapture}
            onClickCapture={handleClickCapture}
        >
            <rect x={0} y={0} width={w} height={h} fill="transparent" onClick={handleCanvasBlankClickLocal} />

            <g transform={`scale(${diagramScale}) translate(${padX}, ${padY})`}>
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

                {topSelectionBox ? <g pointerEvents="none">{renderSelectionOutline(true, topSelectionBox)}</g> : null}
            </g>

            {hoverOverlay && !pending && !dragging ? (
                <g transform={`scale(${diagramScale}) translate(${padX}, ${padY})`} data-no-drag="1">
                    <InsertMenu
                        x={hoverOverlay.insertX}
                        y={hoverOverlay.insertY}
                        open={isInsertMenuOpen}
                        onToggle={() => {
                            setOpenInsertMenuNodeId((prev) => (prev === hoverOverlay.nodeId ? null : hoverOverlay.nodeId))
                        }}
                        onInsertProcess={() => {
                            setOpenInsertMenuNodeId(null)
                            onInsertProcessAfter(hoverOverlay.nodeId)
                        }}
                        onInsertIf={() => {
                            setOpenInsertMenuNodeId(null)
                            onInsertIfAfter(hoverOverlay.nodeId)
                        }}
                        onInsertCase={() => {
                            setOpenInsertMenuNodeId(null)
                            onInsertCaseAfter(hoverOverlay.nodeId)
                        }}
                        onInsertWhile={() => {
                            setOpenInsertMenuNodeId(null)
                            onInsertWhileAfter(hoverOverlay.nodeId)
                        }}
                        onInsertDoWhile={() => {
                            setOpenInsertMenuNodeId(null)
                            onInsertDoWhileAfter(hoverOverlay.nodeId)
                        }}
                        showAddCaseBranch={hoverOverlay.showAddCaseBranch}
                        onAddCaseBranch={
                            hoverOverlay.showAddCaseBranch
                                ? () => {
                                    setOpenInsertMenuNodeId(null)
                                    onAddCaseBranch(hoverOverlay.nodeId)
                                }
                                : undefined
                        }
                    />

                    <NodeActions
                        x={hoverOverlay.deleteX}
                        y={hoverOverlay.insertY}
                        disabled={!hoverOverlay.deleteEnabled}
                        onDelete={() => {
                            setOpenInsertMenuNodeId(null)
                            onDeleteSelected()
                        }}
                    />
                </g>
            ) : null}
        </svg>
    )
}