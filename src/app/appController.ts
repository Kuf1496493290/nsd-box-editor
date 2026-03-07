import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import type { DragMoveRequest } from './types'
import { useAppState } from './state'
import { canDeleteByTarget } from './stateCommon'
import { useCanvasViewport, useImportNotice, useProjectIo, useTextEditorState } from './appControllerUi'
import { findNodeById, getCaseBranchAddRequest } from './appControllerHelpers'
import { useAppControllerActions } from './appControllerActions'
import { installKeyboardShortcuts } from '../features/keyboard'

export function useAppController() {
    const {
        state,
        reset,
        replaceState,
        updateScale,

        addProcessAfterEnd,
        addIfAfterEnd,
        addCaseAfterEnd,
        addWhileAfterEnd,
        addDoWhileAfterEnd,

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

        moveProcessUp,
        moveProcessDown,
        moveByDrag,
        deleteProcess,

        updateProcessText,
        updateIfConditionText,
        updateCaseConditionText,
        updateLoopConditionText,
        updateCaseBranchLabel,
        updateIfBoolLabelMode,

        selectNode,
        selectTarget,

        canUndo,
        canRedo,
        undo,
        redo,
    } = useAppState()

    const svgRef = useRef<SVGSVGElement>(null)
    const { canvasWrapRef, viewportWidth, viewportHeight, onCanvasSizeChange } = useCanvasViewport()
    const { importNotice, showImportNotice } = useImportNotice()

    const [dragActive, setDragActive] = useState(false)

    const selectedNode = useMemo(() => findNodeById(state.root, state.selectedNodeId), [state.root, state.selectedNodeId])
    const caseBranchAddRequest = useMemo(() => getCaseBranchAddRequest(state.selectedTarget), [state.selectedTarget])
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
        undo()
    }, [canUndo, closeEditor, undo])

    const performRedo = useCallback(() => {
        if (!canRedo) return
        closeEditor()
        redo()
    }, [canRedo, closeEditor, redo])

    const onInitialize = useCallback(() => {
        closeEditor()
        reset()
    }, [closeEditor, reset])

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
        replaceState,
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
            selectNode,
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
            addProcessAfterEnd,
            addIfAfterEnd,
            addCaseAfterEnd,
            addWhileAfterEnd,
            addDoWhileAfterEnd,
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
            moveProcessUp,
            moveProcessDown,
            deleteProcess,
            addCaseBranch,
            deleteCaseBranch,
        },
    })

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
        onInsertProcessAfter: actions.onInsertProcessAfter,
        onInsertIfAfter: actions.onInsertIfAfter,
        onInsertCaseAfter: actions.onInsertCaseAfter,
        onInsertWhileAfter: actions.onInsertWhileAfter,
        onInsertDoWhileAfter: actions.onInsertDoWhileAfter,
        onMoveProcessUp: actions.onMoveProcessUp,
        onMoveProcessDown: actions.onMoveProcessDown,
        onDeleteProcess: actions.onDeleteProcess,
        onDeleteSelected: actions.onDeleteSelected,
        onAddCaseBranch: actions.onAddCaseBranch,
        onMoveByDrag,
        onToolbarAddProcess: actions.onToolbarAddProcess,
        onToolbarAddIf: actions.onToolbarAddIf,
        onToolbarAddCase: actions.onToolbarAddCase,
        onToolbarAddWhile: actions.onToolbarAddWhile,
        onToolbarAddDoWhile: actions.onToolbarAddDoWhile,
        onToolbarAddCaseBranch: actions.onToolbarAddCaseBranch,
        onEditorConfirm: actions.onEditorConfirm,
        closeEditor,
    }
}