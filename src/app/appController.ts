import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import type { AppState, DragMoveRequest } from './types'
import { useAppState } from './state'
import { canDeleteByTarget } from './stateCommon'
import { useCanvasViewport, useImportNotice, useProjectIo, useTextEditorState } from './appControllerUi'
import { findNodeById, resolveCaseBranchAddRequest } from './appControllerHelpers'
import { useAppControllerActions } from './appControllerActions'
import { installKeyboardShortcuts } from '../features/keyboard'

/**
 * 应用主控制器：聚合状态、编辑器、导入导出、拖拽与快捷键能力。
 */
export function useAppController() {
    const {
        state,
        reset,
        replaceState,
        updateScale,
        updateHeightRelax,
        updateWidthRelax,

        appendProcessToRoot,
        appendIfToRoot,
        appendCaseToRoot,
        appendWhileToRoot,
        appendDoWhileToRoot,

        addProcessAfter,
        addIfAfter,
        addCaseAfter,
        addWhileAfter,
        addDoWhileAfter,

        addProcessToIfBranchEnd,
        addIfToIfBranchEnd,
        addCaseToIfBranchEnd,
        addWhileToIfBranchEnd,
        addDoWhileToIfBranchEnd,

        prependProcessInIfBranch,
        prependIfInIfBranch,
        prependCaseInIfBranch,
        prependWhileInIfBranch,
        prependDoWhileInIfBranch,

        addProcessToCaseBranchEnd,
        addIfToCaseBranchEnd,
        addCaseToCaseBranchEnd,
        addWhileToCaseBranchEnd,
        addDoWhileToCaseBranchEnd,

        prependProcessInCaseBranch,
        prependIfInCaseBranch,
        prependCaseInCaseBranch,
        prependWhileInCaseBranch,
        prependDoWhileInCaseBranch,

        prependProcessInLoopBody,
        prependIfInLoopBody,
        prependCaseInLoopBody,
        prependWhileInLoopBody,
        prependDoWhileInLoopBody,

        addCaseBranch,
        deleteCaseBranch,

        moveByDrag,
        deleteNodeById,

        updateProcessText,
        updateIfConditionText,
        updateCaseConditionText,
        updateLoopConditionText,
        updateCaseBranchLabel,
        updateIfBoolLabelMode,

        selectNodeWithDefaultTarget,
        selectTarget,

        canUndo,
        canRedo,
        undo,
        redo,
    } = useAppState()

    const svgRef = useRef<SVGSVGElement>(null)
    const { canvasWrapRef, viewportWidth, viewportHeight, onCanvasSizeChange, recenterViewport, centerViewportOnNode } = useCanvasViewport(svgRef)
    const { importNotice, showImportNotice } = useImportNotice()

    const [dragActive, setDragActive] = useState(false)

    /*
     * 视角策略：
     * - 初始化 / 导入 → 等下一次 state 更新落到画布上后整体居中（'recenter'）
     * - 撤销 / 重做  → 等下一次 state 更新后定位到被还原内容的代表节点（'centerSelected'）
     * - 普通新增 / 删除 / 编辑 → 不做任何视角调整，保持当前 scrollLeft / scrollTop。
     */
    const pendingViewportRef = useRef<'recenter' | 'centerSelected' | null>(null)

    const selectedNode = useMemo(() => findNodeById(state.root, state.selectedNodeId), [state.root, state.selectedNodeId])
    const caseBranchAddRequest = useMemo(() => resolveCaseBranchAddRequest(state.selectedTarget), [state.selectedTarget])
    const canAddCaseBranch = caseBranchAddRequest !== null
    const canDeleteSelected = useMemo(() => canDeleteByTarget(state.selectedTarget), [state.selectedTarget])

    const {
        editingNodeId,
        editingText,
        editingKind,
        editingBranchIndex,
        editorTitle,
        closeEditor,
        openEditor,
        openCaseBranchLabelEditor,
    } = useTextEditorState()

    const performUndo = useCallback(() => {
        if (!canUndo) return
        closeEditor()
        pendingViewportRef.current = 'centerSelected'
        undo()
    }, [canUndo, closeEditor, undo])

    const performRedo = useCallback(() => {
        if (!canRedo) return
        closeEditor()
        pendingViewportRef.current = 'centerSelected'
        redo()
    }, [canRedo, closeEditor, redo])

    const onInitialize = useCallback(() => {
        closeEditor()
        pendingViewportRef.current = 'recenter'
        reset()
    }, [closeEditor, reset])

    // 在 state 实际更新到下一次渲染后，按 pending 标记执行视角动作。
    useEffect(() => {
        const action = pendingViewportRef.current
        if (!action) return
        pendingViewportRef.current = null

        if (action === 'recenter') {
            recenterViewport()
            return
        }
        centerViewportOnNode(state.selectedNodeId)
    }, [centerViewportOnNode, recenterViewport, state])

    // 导入时让 replaceState 之后自动触发一次居中。
    const replaceStateWithRecenter = useCallback(
        (next: AppState) => {
            pendingViewportRef.current = 'recenter'
            replaceState(next)
        },
        [replaceState],
    )

    const {
        importProjectInputRef,
        onExportImage,
        onExportProject,
        onImportProject,
        onImportProjectChange,
    } = useProjectIo({
        state,
        svgRef,
        closeEditor,
        replaceState: replaceStateWithRecenter,
        showImportNotice,
    })

    const onMoveByDrag = useCallback(
        (req: DragMoveRequest) => {
            closeEditor()
            moveByDrag(req)
        },
        [closeEditor, moveByDrag],
    )

    const actions = useAppControllerActions({
        state,
        selectedNode,
        canDeleteSelected,
        caseBranchAddRequest,
        editingNodeId,
        editingKind,
        editingBranchIndex,
        editor: {
            closeEditor,
            openEditor,
            openCaseBranchLabelEditor,
        },
        stateFns: {
            selectNodeWithDefaultTarget,
            selectTarget,
            updateProcessText,
            updateIfConditionText,
            updateCaseConditionText,
            updateLoopConditionText,
            updateCaseBranchLabel,
            updateIfBoolLabelMode,
        },
        insertActions: {
            addProcessAfter,
            addIfAfter,
            addCaseAfter,
            addWhileAfter,
            addDoWhileAfter,
            appendProcessToRoot,
            appendIfToRoot,
            appendCaseToRoot,
            appendWhileToRoot,
            appendDoWhileToRoot,
            addProcessToIfBranchEnd,
            addIfToIfBranchEnd,
            addCaseToIfBranchEnd,
            addWhileToIfBranchEnd,
            addDoWhileToIfBranchEnd,
            prependProcessInIfBranch,
            prependIfInIfBranch,
            prependCaseInIfBranch,
            prependWhileInIfBranch,
            prependDoWhileInIfBranch,
            addProcessToCaseBranchEnd,
            addIfToCaseBranchEnd,
            addCaseToCaseBranchEnd,
            addWhileToCaseBranchEnd,
            addDoWhileToCaseBranchEnd,
            prependProcessInCaseBranch,
            prependIfInCaseBranch,
            prependCaseInCaseBranch,
            prependWhileInCaseBranch,
            prependDoWhileInCaseBranch,
            prependProcessInLoopBody,
            prependIfInLoopBody,
            prependCaseInLoopBody,
            prependWhileInLoopBody,
            prependDoWhileInLoopBody,
        },
        mutationFns: {
            deleteNodeById,
            addCaseBranch,
            deleteCaseBranch,
        },
    })

    // 键盘快捷键统一在控制器层安装，避免各组件重复订阅全局事件。
    useEffect(() => {
        return installKeyboardShortcuts({
            onUndo: performUndo,
            onRedo: performRedo,
            onDelete: actions.onKeyboardDelete,
            onEnter: actions.onKeyboardEnter,
            onTab: actions.onKeyboardTab,
            isEditing: () => editingNodeId !== null,
            isDragActive: () => dragActive,
        })
    }, [actions.onKeyboardDelete, actions.onKeyboardEnter, actions.onKeyboardTab, dragActive, editingNodeId, performRedo, performUndo])

    const onScaleChange = useCallback(
        (event: ChangeEvent<HTMLInputElement>) => {
            const raw = Number(event.target.value)
            updateScale(raw)
        },
        [updateScale],
    )

    const onHeightRelaxChange = useCallback(
        (event: ChangeEvent<HTMLInputElement>) => {
            updateHeightRelax(Number(event.target.value))
        },
        [updateHeightRelax],
    )

    const onWidthRelaxChange = useCallback(
        (event: ChangeEvent<HTMLInputElement>) => {
            updateWidthRelax(Number(event.target.value))
        },
        [updateWidthRelax],
    )

    return {
        state,
        svgRef,
        canvasWrapRef,
        importProjectInputRef,
        importNotice,
        viewportWidth,
        viewportHeight,
        canUndo,
        canRedo,
        canAddCaseBranch,
        canDeleteSelected,
        editingNodeId,
        editingText,
        editorTitle,
        setDragActive,

        performUndo,
        performRedo,
        onInitialize,
        onExportImage,
        onExportProject,
        onImportProject,
        onImportProjectChange,

        onScaleChange,
        onHeightRelaxChange,
        onWidthRelaxChange,
        onCanvasSizeChange,
        onProcessSelect: actions.onProcessSelect,
        onProcessDoubleClick: actions.onProcessDoubleClick,
        onIfHeaderSelect: actions.onIfHeaderSelect,
        onIfHeaderDoubleClick: actions.onIfHeaderDoubleClick,
        onIfPartSelect: actions.onIfPartSelect,
        onIfLabelDoubleClick: actions.onIfLabelDoubleClick,
        onCaseHeaderSelect: actions.onCaseHeaderSelect,
        onCaseHeaderDoubleClick: actions.onCaseHeaderDoubleClick,
        onCasePartSelect: actions.onCasePartSelect,
        onCaseBranchLabelDoubleClick: actions.onCaseBranchLabelDoubleClick,
        onLoopSelect: actions.onLoopSelect,
        onLoopConditionDoubleClick: actions.onLoopConditionDoubleClick,
        onLoopHoleSelect: actions.onLoopHoleSelect,
        onCanvasBlankClick: actions.onCanvasBlankClick,
        onInsertProcessAtSelection: actions.onInsertProcessAtSelection,
        onInsertIfAtSelection: actions.onInsertIfAtSelection,
        onInsertCaseAtSelection: actions.onInsertCaseAtSelection,
        onInsertWhileAtSelection: actions.onInsertWhileAtSelection,
        onInsertDoWhileAtSelection: actions.onInsertDoWhileAtSelection,
        onDeleteSelected: actions.onDeleteSelected,
        onAddCaseBranch: actions.onAddCaseBranch,
        onMoveByDrag,
        onToolbarInsertProcess: actions.onToolbarInsertProcess,
        onToolbarInsertIf: actions.onToolbarInsertIf,
        onToolbarInsertCase: actions.onToolbarInsertCase,
        onToolbarInsertWhile: actions.onToolbarInsertWhile,
        onToolbarInsertDoWhile: actions.onToolbarInsertDoWhile,
        onToolbarAddCaseBranch: actions.onToolbarAddCaseBranch,
        onEditorConfirm: actions.onEditorConfirm,
        closeEditor,
    }
}