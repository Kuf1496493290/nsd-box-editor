import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type PointerEvent as ReactPointerEvent,
    type RefObject,
} from 'react'
import type { AppState, CasePartKey, DragMoveRequest, IfPartKey } from '../app/types'
import { layoutRoot } from '../layout/layoutEngine'
import type { LayoutBox } from '../layout/layoutTypes'
import { RenderNode } from '../render/renderNode'
import { renderSelectionOutline } from '../render/renderCommon'
import {
    buildHoverOverlay,
    buildTopSelectionBox,
    InsertMenu,
    type HoverOverlay,
} from './canvas/CanvasOverlayMenu'
import {
    createDragLifecycle,
    createDragPointerHandlers,
    type ActiveDrag,
    type PendingDrag,
} from './canvas/canvasInteractionHelpers'
import {
    buildDragIndex,
    clampScale,
    clientToSvgPoint,
    type Point,
} from './canvas/dragHelpers'
import { perfLogDuration, perfNow, perfSpan } from '../utils/perf'

const NOOP = () => {}

/**
 * 拖拽幽灵节点渲染时的占位动作集合，确保渲染层契约完整但不触发交互。
 */
const GHOST_RENDER_NODE_ACTIONS = {
    onProcessSelect: NOOP,
    onProcessDoubleClick: NOOP,
    onIfHeaderSelect: NOOP,
    onIfHeaderDoubleClick: NOOP,
    onIfPartSelect: NOOP,
    onIfLabelDoubleClick: NOOP,
    onCaseHeaderSelect: NOOP,
    onCaseHeaderDoubleClick: NOOP,
    onCasePartSelect: NOOP,
    onCaseBranchLabelDoubleClick: NOOP,
    onLoopSelect: NOOP,
    onLoopConditionDoubleClick: NOOP,
    onLoopHoleSelect: NOOP,
    onInsertProcessAtSelection: NOOP,
    onInsertIfAtSelection: NOOP,
    onInsertCaseAtSelection: NOOP,
    onInsertWhileAtSelection: NOOP,
    onInsertDoWhileAtSelection: NOOP,
    onDeleteSelected: NOOP,
    onAddCaseBranch: NOOP,
} as const

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

    onInsertProcessAtSelection: (nodeId: string) => void
    onInsertIfAtSelection: (nodeId: string) => void
    onInsertCaseAtSelection: (nodeId: string) => void
    onInsertWhileAtSelection: (nodeId: string) => void
    onInsertDoWhileAtSelection: (nodeId: string) => void

    onDeleteSelected: () => void
    onAddCaseBranch: (caseId: string, insertAfterBranchIndex?: number) => void

    onMoveByDrag: (req: DragMoveRequest) => void
}>

/**
 * 画布主视图：负责布局绘制、拖拽交互、悬浮菜单与选中态可视化。
 */
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
        onInsertProcessAtSelection,
        onInsertIfAtSelection,
        onInsertCaseAtSelection,
        onInsertWhileAtSelection,
        onInsertDoWhileAtSelection,
        onDeleteSelected,
        onAddCaseBranch,
        onMoveByDrag,
    } = props

    const renderStart = perfNow()
    const diagramScale = clampScale(state.scale)
    const rootBox = useMemo(
        () => perfSpan('canvas.layoutRoot.memo', () => layoutRoot(state.root, state.style)),
        [state.root, state.style],
    )
    const dragIndex = useMemo(
        () => perfSpan('canvas.dragIndex.memo', () => buildDragIndex(rootBox)),
        [rootBox],
    )

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
        perfLogDuration('canvas.commit', renderStart, {
            dragging: dragging !== null,
            pending: pending !== null,
            selected: state.selectedNodeId,
        })
    })

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
    const hiddenCaseColumnRef = useRef<Readonly<{ caseId: string; branchIndex: number; prevOpacity: string }> | null>(null)

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

        const el = svg.querySelector<SVGGElement>(`[data-drag-if-column-id="${record.ifId}"][data-drag-if-column-branch="${record.branch}"]`)
        if (el) el.style.opacity = record.prevOpacity

        hiddenIfColumnRef.current = null
    }, [svgRef])

    const restoreHiddenCaseColumnIfAny = useCallback(() => {
        const svg = svgRef.current
        const record = hiddenCaseColumnRef.current
        if (!svg || !record) return

        const el = svg.querySelector<SVGGElement>(
            `[data-drag-case-column-id="${record.caseId}"][data-drag-case-column-index="${String(record.branchIndex)}"]`,
        )
        if (el) el.style.opacity = record.prevOpacity

        hiddenCaseColumnRef.current = null
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

            const el = svg.querySelector<SVGGElement>(`[data-drag-if-column-id="${ifId}"][data-drag-if-column-branch="${branch}"]`)
            if (!el) return

            hiddenIfColumnRef.current = { ifId, branch, prevOpacity: el.style.opacity }
            el.style.opacity = '0'
        },
        [svgRef],
    )

    const tryHideCaseColumn = useCallback(
        (caseId: string, branchIndex: number) => {
            const svg = svgRef.current
            if (!svg) return

            const el = svg.querySelector<SVGGElement>(
                `[data-drag-case-column-id="${caseId}"][data-drag-case-column-index="${String(branchIndex)}"]`,
            )
            if (!el) return

            hiddenCaseColumnRef.current = { caseId, branchIndex, prevOpacity: el.style.opacity }
            el.style.opacity = '0'
        },
        [svgRef],
    )

    const pointerHandlersRef = useRef<ReturnType<typeof createDragPointerHandlers> | null>(null)

    useEffect(() => {
        const dragLifecycle = createDragLifecycle({
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
        })

        pointerHandlersRef.current = createDragPointerHandlers({
            pending,
            dragging,
            setPending,
            setDragging,
            svgRef,
            getContentPoint,
            selectNodeForPointerDown: dragLifecycle.selectNodeForPointerDown,
            selectIfResultForPointerDown: dragLifecycle.selectIfResultForPointerDown,
            selectCaseResultForPointerDown: dragLifecycle.selectCaseResultForPointerDown,
            startNodeDrag: dragLifecycle.startNodeDrag,
            startIfResultDrag: dragLifecycle.startIfResultDrag,
            startCaseResultDrag: dragLifecycle.startCaseResultDrag,
            finishNodeDrag: dragLifecycle.finishNodeDrag,
            finishIfResultDrag: dragLifecycle.finishIfResultDrag,
            finishCaseResultDrag: dragLifecycle.finishCaseResultDrag,
            restoreHiddenIfAny,
            restoreHiddenIfColumnIfAny,
            restoreHiddenCaseColumnIfAny,
        })
    }, [
        armSuppressNextClick,
        dragIndex,
        getContentPoint,
        onCaseHeaderSelect,
        onCasePartSelect,
        onIfHeaderSelect,
        onIfPartSelect,
        onLoopSelect,
        onMoveByDrag,
        onProcessSelect,
        pending,
        dragging,
        restoreHiddenIfAny,
        restoreHiddenIfColumnIfAny,
        restoreHiddenCaseColumnIfAny,
        svgRef,
        tryHideCaseColumn,
        tryHideIfColumn,
        tryHideOriginalNode,
    ])

    const handlePointerDownCapture = useCallback((event: ReactPointerEvent<SVGSVGElement>) => {
        pointerHandlersRef.current?.handlePointerDownCapture(event)
    }, [])

    const handlePointerMoveCapture = useCallback((event: ReactPointerEvent<SVGSVGElement>) => {
        pointerHandlersRef.current?.handlePointerMoveCapture(event)
    }, [])

    const handlePointerUpCapture = useCallback((event: ReactPointerEvent<SVGSVGElement>) => {
        pointerHandlersRef.current?.handlePointerUpCapture(event)
    }, [])

    const handlePointerCancelCapture = useCallback((event: ReactPointerEvent<SVGSVGElement>) => {
        pointerHandlersRef.current?.handlePointerCancelCapture(event)
    }, [])

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

    const hoverOverlay = useMemo<HoverOverlay | null>(
        () =>
            buildHoverOverlay({
                selectedTarget: state.selectedTarget,
                selectedNodeId: state.selectedNodeId,
                dragIndex,
                style: state.style,
            }),
        [dragIndex, state.selectedNodeId, state.selectedTarget, state.style],
    )

    const isInsertMenuOpen = hoverOverlay?.nodeId !== undefined && openInsertMenuNodeId === hoverOverlay?.nodeId

    const topSelectionBox = useMemo<LayoutBox | null>(
        () => buildTopSelectionBox(state.selectedTarget, dragIndex),
        [dragIndex, state.selectedTarget],
    )

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
                    onInsertProcessAtSelection={onInsertProcessAtSelection}
                    onInsertIfAtSelection={onInsertIfAtSelection}
                    onInsertCaseAtSelection={onInsertCaseAtSelection}
                    onInsertWhileAtSelection={onInsertWhileAtSelection}
                    onInsertDoWhileAtSelection={onInsertDoWhileAtSelection}
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
                            {...GHOST_RENDER_NODE_ACTIONS}
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
                            onInsertProcessAtSelection(hoverOverlay.nodeId)
                        }}
                        onInsertIf={() => {
                            setOpenInsertMenuNodeId(null)
                            onInsertIfAtSelection(hoverOverlay.nodeId)
                        }}
                        onInsertCase={() => {
                            setOpenInsertMenuNodeId(null)
                            onInsertCaseAtSelection(hoverOverlay.nodeId)
                        }}
                        onInsertWhile={() => {
                            setOpenInsertMenuNodeId(null)
                            onInsertWhileAtSelection(hoverOverlay.nodeId)
                        }}
                        onInsertDoWhile={() => {
                            setOpenInsertMenuNodeId(null)
                            onInsertDoWhileAtSelection(hoverOverlay.nodeId)
                        }}
                        showAddCaseBranch={hoverOverlay.showAddCaseBranch}
                        onAddCaseBranch={
                            hoverOverlay.showAddCaseBranch
                                ? () => {
                                    setOpenInsertMenuNodeId(null)
                                    onAddCaseBranch(hoverOverlay.nodeId, hoverOverlay.addCaseBranchAfterIndex)
                                }
                                : undefined
                        }
                        deleteX={hoverOverlay.deleteX}
                        deleteEnabled={hoverOverlay.deleteEnabled}
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