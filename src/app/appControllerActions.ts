import { useCallback } from 'react'
import type {
    AppState,
    BoolLabelMode,
    CasePartKey,
    IfPartKey,
    NsdNode,
    SelectionTarget,
} from './types'
import {
    findNodeById,
    insertByTarget,
    insertFromToolbarTarget,
    pickEnterEditRequest,
    type EditingKind,
} from './appControllerHelpers'

type CaseBranchAddRequest = Readonly<{ nodeId: string; insertAfterBranchIndex?: number }> | null

type EditorFns = Readonly<{
    closeEditor: () => void
    openEditor: (nodeId: string, kind: Exclude<EditingKind, 'caseBranchLabel'>, text: string) => void
    openCaseBranchLabelEditor: (caseId: string, branchIndex: number, text: string) => void
}>

type StateFns = Readonly<{
    selectNode: (nodeId: string | null) => void
    selectTarget: (target: SelectionTarget | null) => void
    updateProcessText: (nodeId: string, text: string) => void
    updateIfConditionText: (nodeId: string, text: string) => void
    updateCaseConditionText: (nodeId: string, text: string) => void
    updateLoopConditionText: (nodeId: string, text: string) => void
    updateCaseBranchLabel: (caseId: string, branchIndex: number, text: string) => void
    updateIfBoolLabelMode: (nodeId: string, mode: BoolLabelMode) => void
}>

type InsertActions = Readonly<{
    addProcessAfter: (nodeId: string) => void
    addIfAfter: (nodeId: string) => void
    addCaseAfter: (nodeId: string) => void
    addWhileAfter: (nodeId: string) => void
    addDoWhileAfter: (nodeId: string) => void
    addProcessAfterEnd: () => void
    addIfAfterEnd: () => void
    addCaseAfterEnd: () => void
    addWhileAfterEnd: () => void
    addDoWhileAfterEnd: () => void
    addProcessToIfBranchEnd: (nodeId: string, branch: 'true' | 'false') => void
    addIfToIfBranchEnd: (nodeId: string, branch: 'true' | 'false') => void
    addCaseToIfBranchEnd: (nodeId: string, branch: 'true' | 'false') => void
    addWhileToIfBranchEnd: (nodeId: string, branch: 'true' | 'false') => void
    addDoWhileToIfBranchEnd: (nodeId: string, branch: 'true' | 'false') => void
    prependProcessInIfBranch: (nodeId: string, branch: 'true' | 'false') => void
    prependIfInIfBranch: (nodeId: string, branch: 'true' | 'false') => void
    prependCaseInIfBranch: (nodeId: string, branch: 'true' | 'false') => void
    prependWhileInIfBranch: (nodeId: string, branch: 'true' | 'false') => void
    prependDoWhileInIfBranch: (nodeId: string, branch: 'true' | 'false') => void
    addProcessToCaseBranchEnd: (nodeId: string, branchIndex: number) => void
    addIfToCaseBranchEnd: (nodeId: string, branchIndex: number) => void
    addCaseToCaseBranchEnd: (nodeId: string, branchIndex: number) => void
    addWhileToCaseBranchEnd: (nodeId: string, branchIndex: number) => void
    addDoWhileToCaseBranchEnd: (nodeId: string, branchIndex: number) => void
    prependProcessInCaseBranch: (nodeId: string, branchIndex: number) => void
    prependIfInCaseBranch: (nodeId: string, branchIndex: number) => void
    prependCaseInCaseBranch: (nodeId: string, branchIndex: number) => void
    prependWhileInCaseBranch: (nodeId: string, branchIndex: number) => void
    prependDoWhileInCaseBranch: (nodeId: string, branchIndex: number) => void
    prependProcessInLoopBody: (nodeId: string) => void
    prependIfInLoopBody: (nodeId: string) => void
    prependCaseInLoopBody: (nodeId: string) => void
    prependWhileInLoopBody: (nodeId: string) => void
    prependDoWhileInLoopBody: (nodeId: string) => void
}>

type MutationFns = Readonly<{
    moveProcessUp: (nodeId: string) => void
    moveProcessDown: (nodeId: string) => void
    deleteProcess: (nodeId: string) => void
    addCaseBranch: (caseId: string, insertAfterBranchIndex?: number) => void
    deleteCaseBranch: (caseId: string, branchIndex: number) => void
}>

type DeleteIntent =
    | Readonly<{ kind: 'none' }>
    | Readonly<{ kind: 'deleteNode' }>
    | Readonly<{ kind: 'deleteCaseBranch'; branchIndex: number }>

function resolveDeleteIntent(target: SelectionTarget, node: NsdNode): DeleteIntent {
    if (target.kind === 'loopPart') return { kind: 'none' }

    if (target.kind === 'ifPart') {
        if (target.part === 'trueContainer' || target.part === 'falseContainer') return { kind: 'none' }
        if (node.type !== 'if') return { kind: 'none' }
        return { kind: 'deleteNode' }
    }

    if (target.kind === 'casePart') {
        if (target.part === 'branchContainer') return { kind: 'none' }
        if (target.part !== 'branchLabel') return { kind: 'deleteNode' }
        if (node.type !== 'case') return { kind: 'none' }
        if (node.branches.length <= 2) return { kind: 'deleteNode' }
        return { kind: 'deleteCaseBranch', branchIndex: target.branchIndex }
    }

    return { kind: 'deleteNode' }
}

export function useAppControllerActions(params: Readonly<{
    state: AppState
    selectedNode: NsdNode | null
    canDeleteSelected: boolean
    caseBranchAddRequest: CaseBranchAddRequest
    editingNodeId: string | null
    editingKind: EditingKind
    editingBranchIndex: number | null
    editor: EditorFns
    stateFns: StateFns
    insertActions: InsertActions
    mutationFns: MutationFns
}>) {
    const {
        state,
        selectedNode,
        canDeleteSelected,
        caseBranchAddRequest,
        editingNodeId,
        editingKind,
        editingBranchIndex,
        editor,
        stateFns,
        insertActions,
        mutationFns,
    } = params

    const performAddCaseBranch = useCallback(
        (caseId: string, insertAfterBranchIndex?: number) => {
            editor.closeEditor()
            mutationFns.addCaseBranch(caseId, insertAfterBranchIndex)
        },
        [editor, mutationFns],
    )

    const onProcessSelect = useCallback((nodeId: string) => {
        stateFns.selectNode(nodeId)
        editor.closeEditor()
    }, [editor, stateFns])

    const onProcessDoubleClick = useCallback((nodeId: string) => {
        stateFns.selectNode(nodeId)
        const node = findNodeById(state.root, nodeId)
        if (node?.type !== 'process') return
        editor.openEditor(nodeId, 'process', node.text)
    }, [editor, state.root, stateFns])

    const onIfHeaderSelect = useCallback((nodeId: string) => {
        stateFns.selectTarget({ kind: 'ifPart', nodeId, part: 'header' })
        editor.closeEditor()
    }, [editor, stateFns])

    const onIfHeaderDoubleClick = useCallback((nodeId: string) => {
        stateFns.selectTarget({ kind: 'ifPart', nodeId, part: 'header' })
        const node = findNodeById(state.root, nodeId)
        if (node?.type !== 'if') return
        editor.openEditor(nodeId, 'ifCondition', node.conditionText)
    }, [editor, state.root, stateFns])

    const onIfLabelDoubleClick = useCallback((nodeId: string, part: 'trueLabel' | 'falseLabel') => {
        stateFns.selectTarget({ kind: 'ifPart', nodeId, part })
        editor.closeEditor()
        const node = findNodeById(state.root, nodeId)
        if (node?.type !== 'if') return
        stateFns.updateIfBoolLabelMode(nodeId, node.boolLabelMode === 'TF' ? 'YN' : 'TF')
    }, [editor, state.root, stateFns])

    const onIfPartSelect = useCallback((nodeId: string, part: IfPartKey) => {
        stateFns.selectTarget({ kind: 'ifPart', nodeId, part })
        editor.closeEditor()
    }, [editor, stateFns])

    const onCaseHeaderSelect = useCallback((nodeId: string) => {
        stateFns.selectTarget({ kind: 'casePart', nodeId, part: 'header' })
        editor.closeEditor()
    }, [editor, stateFns])

    const onCaseHeaderDoubleClick = useCallback((nodeId: string) => {
        stateFns.selectTarget({ kind: 'casePart', nodeId, part: 'header' })
        const node = findNodeById(state.root, nodeId)
        if (node?.type !== 'case') return
        editor.openEditor(nodeId, 'caseCondition', node.conditionText)
    }, [editor, state.root, stateFns])

    const onCasePartSelect = useCallback((nodeId: string, part: CasePartKey, branchIndex?: number) => {
        if (part === 'header') {
            stateFns.selectTarget({ kind: 'casePart', nodeId, part: 'header' })
            editor.closeEditor()
            return
        }
        if (typeof branchIndex !== 'number') return
        stateFns.selectTarget({ kind: 'casePart', nodeId, part, branchIndex })
        editor.closeEditor()
    }, [editor, stateFns])

    const onCaseBranchLabelDoubleClick = useCallback((nodeId: string, branchIndex: number) => {
        stateFns.selectTarget({ kind: 'casePart', nodeId, part: 'branchLabel', branchIndex })
        const node = findNodeById(state.root, nodeId)
        if (node?.type !== 'case') return
        const labels =
            node.branchLabels.length === node.branches.length
                ? node.branchLabels
                : node.branches.map((_: unknown, i: number) => node.branchLabels[i] ?? String(i + 1))
        const text = labels[branchIndex] ?? String(branchIndex + 1)
        editor.openCaseBranchLabelEditor(nodeId, branchIndex, text)
    }, [editor, state.root, stateFns])

    const onLoopSelect = useCallback((nodeId: string) => {
        stateFns.selectNode(nodeId)
        editor.closeEditor()
    }, [editor, stateFns])

    const onLoopHoleSelect = useCallback((nodeId: string) => {
        stateFns.selectTarget({ kind: 'loopPart', nodeId, part: 'hole' })
        editor.closeEditor()
    }, [editor, stateFns])

    const onLoopConditionDoubleClick = useCallback((nodeId: string) => {
        stateFns.selectNode(nodeId)
        const node = findNodeById(state.root, nodeId)
        if (node?.type !== 'loop') return
        editor.openEditor(nodeId, 'loopCondition', node.conditionText)
    }, [editor, state.root, stateFns])

    const onEditorConfirm = useCallback((nextText: string) => {
        if (!editingNodeId) return
        if (editingKind === 'process') {
            stateFns.updateProcessText(editingNodeId, nextText)
            editor.closeEditor()
            return
        }
        if (editingKind === 'ifCondition') {
            stateFns.updateIfConditionText(editingNodeId, nextText)
            editor.closeEditor()
            return
        }
        if (editingKind === 'caseCondition') {
            stateFns.updateCaseConditionText(editingNodeId, nextText)
            editor.closeEditor()
            return
        }
        if (editingKind === 'loopCondition') {
            stateFns.updateLoopConditionText(editingNodeId, nextText)
            editor.closeEditor()
            return
        }
        if (editingBranchIndex === null) return
        stateFns.updateCaseBranchLabel(editingNodeId, editingBranchIndex, nextText)
        editor.closeEditor()
    }, [editingBranchIndex, editingKind, editingNodeId, editor, stateFns])

    const onCanvasBlankClick = useCallback(() => {
        stateFns.selectTarget(null)
        editor.closeEditor()
    }, [editor, stateFns])

    const onInsertProcessAfter = useCallback((nodeId: string) => {
        insertByTarget(nodeId, state.selectedTarget, {
            insertAfter: insertActions.addProcessAfter,
            prependToIfBranch: insertActions.prependProcessInIfBranch,
            appendToIfBranchEnd: insertActions.addProcessToIfBranchEnd,
            prependToCaseBranch: insertActions.prependProcessInCaseBranch,
            appendToCaseBranchEnd: insertActions.addProcessToCaseBranchEnd,
            prependToLoopBody: insertActions.prependProcessInLoopBody,
        })
    }, [insertActions, state.selectedTarget])

    const onInsertIfAfter = useCallback((nodeId: string) => {
        insertByTarget(nodeId, state.selectedTarget, {
            insertAfter: insertActions.addIfAfter,
            prependToIfBranch: insertActions.prependIfInIfBranch,
            appendToIfBranchEnd: insertActions.addIfToIfBranchEnd,
            prependToCaseBranch: insertActions.prependIfInCaseBranch,
            appendToCaseBranchEnd: insertActions.addIfToCaseBranchEnd,
            prependToLoopBody: insertActions.prependIfInLoopBody,
        })
    }, [insertActions, state.selectedTarget])

    const onInsertCaseAfter = useCallback((nodeId: string) => {
        insertByTarget(nodeId, state.selectedTarget, {
            insertAfter: insertActions.addCaseAfter,
            prependToIfBranch: insertActions.prependCaseInIfBranch,
            appendToIfBranchEnd: insertActions.addCaseToIfBranchEnd,
            prependToCaseBranch: insertActions.prependCaseInCaseBranch,
            appendToCaseBranchEnd: insertActions.addCaseToCaseBranchEnd,
            prependToLoopBody: insertActions.prependCaseInLoopBody,
        })
    }, [insertActions, state.selectedTarget])

    const onInsertWhileAfter = useCallback((nodeId: string) => {
        insertByTarget(nodeId, state.selectedTarget, {
            insertAfter: insertActions.addWhileAfter,
            prependToIfBranch: insertActions.prependWhileInIfBranch,
            appendToIfBranchEnd: insertActions.addWhileToIfBranchEnd,
            prependToCaseBranch: insertActions.prependWhileInCaseBranch,
            appendToCaseBranchEnd: insertActions.addWhileToCaseBranchEnd,
            prependToLoopBody: insertActions.prependWhileInLoopBody,
        })
    }, [insertActions, state.selectedTarget])

    const onInsertDoWhileAfter = useCallback((nodeId: string) => {
        insertByTarget(nodeId, state.selectedTarget, {
            insertAfter: insertActions.addDoWhileAfter,
            prependToIfBranch: insertActions.prependDoWhileInIfBranch,
            appendToIfBranchEnd: insertActions.addDoWhileToIfBranchEnd,
            prependToCaseBranch: insertActions.prependDoWhileInCaseBranch,
            appendToCaseBranchEnd: insertActions.addDoWhileToCaseBranchEnd,
            prependToLoopBody: insertActions.prependDoWhileInLoopBody,
        })
    }, [insertActions, state.selectedTarget])

    const onMoveProcessUp = useCallback((nodeId: string) => {
        editor.closeEditor()
        mutationFns.moveProcessUp(nodeId)
    }, [editor, mutationFns])

    const onMoveProcessDown = useCallback((nodeId: string) => {
        editor.closeEditor()
        mutationFns.moveProcessDown(nodeId)
    }, [editor, mutationFns])

    const onDeleteProcess = useCallback((nodeId: string) => {
        editor.closeEditor()
        mutationFns.deleteProcess(nodeId)
    }, [editor, mutationFns])

    const onAddCaseBranch = useCallback((caseId: string, insertAfterBranchIndex?: number) => {
        performAddCaseBranch(caseId, insertAfterBranchIndex)
    }, [performAddCaseBranch])

    const onDeleteSelected = useCallback(() => {
        if (!canDeleteSelected) return

        const target = state.selectedTarget
        const node = selectedNode
        if (!node || !target) return

        const intent = resolveDeleteIntent(target, node)
        if (intent.kind === 'none') return

        editor.closeEditor()
        if (intent.kind === 'deleteCaseBranch') {
            mutationFns.deleteCaseBranch(node.id, intent.branchIndex)
            return
        }

        mutationFns.deleteProcess(node.id)
    }, [canDeleteSelected, editor, mutationFns, selectedNode, state.selectedTarget])

    const onToolbarAddProcess = useCallback(() => {
        insertFromToolbarTarget(state.selectedTarget, {
            addAtEnd: insertActions.addProcessAfterEnd,
            insertAfter: insertActions.addProcessAfter,
            prependToIfBranch: insertActions.prependProcessInIfBranch,
            appendToIfBranchEnd: insertActions.addProcessToIfBranchEnd,
            prependToCaseBranch: insertActions.prependProcessInCaseBranch,
            appendToCaseBranchEnd: insertActions.addProcessToCaseBranchEnd,
            prependToLoopBody: insertActions.prependProcessInLoopBody,
        })
    }, [insertActions, state.selectedTarget])

    const onToolbarAddIf = useCallback(() => {
        insertFromToolbarTarget(state.selectedTarget, {
            addAtEnd: insertActions.addIfAfterEnd,
            insertAfter: insertActions.addIfAfter,
            prependToIfBranch: insertActions.prependIfInIfBranch,
            appendToIfBranchEnd: insertActions.addIfToIfBranchEnd,
            prependToCaseBranch: insertActions.prependIfInCaseBranch,
            appendToCaseBranchEnd: insertActions.addIfToCaseBranchEnd,
            prependToLoopBody: insertActions.prependIfInLoopBody,
        })
    }, [insertActions, state.selectedTarget])

    const onToolbarAddCase = useCallback(() => {
        insertFromToolbarTarget(state.selectedTarget, {
            addAtEnd: insertActions.addCaseAfterEnd,
            insertAfter: insertActions.addCaseAfter,
            prependToIfBranch: insertActions.prependCaseInIfBranch,
            appendToIfBranchEnd: insertActions.addCaseToIfBranchEnd,
            prependToCaseBranch: insertActions.prependCaseInCaseBranch,
            appendToCaseBranchEnd: insertActions.addCaseToCaseBranchEnd,
            prependToLoopBody: insertActions.prependCaseInLoopBody,
        })
    }, [insertActions, state.selectedTarget])

    const onToolbarAddWhile = useCallback(() => {
        insertFromToolbarTarget(state.selectedTarget, {
            addAtEnd: insertActions.addWhileAfterEnd,
            insertAfter: insertActions.addWhileAfter,
            prependToIfBranch: insertActions.prependWhileInIfBranch,
            appendToIfBranchEnd: insertActions.addWhileToIfBranchEnd,
            prependToCaseBranch: insertActions.prependWhileInCaseBranch,
            appendToCaseBranchEnd: insertActions.addWhileToCaseBranchEnd,
            prependToLoopBody: insertActions.prependWhileInLoopBody,
        })
    }, [insertActions, state.selectedTarget])

    const onToolbarAddDoWhile = useCallback(() => {
        insertFromToolbarTarget(state.selectedTarget, {
            addAtEnd: insertActions.addDoWhileAfterEnd,
            insertAfter: insertActions.addDoWhileAfter,
            prependToIfBranch: insertActions.prependDoWhileInIfBranch,
            appendToIfBranchEnd: insertActions.addDoWhileToIfBranchEnd,
            prependToCaseBranch: insertActions.prependDoWhileInCaseBranch,
            appendToCaseBranchEnd: insertActions.addDoWhileToCaseBranchEnd,
            prependToLoopBody: insertActions.prependDoWhileInLoopBody,
        })
    }, [insertActions, state.selectedTarget])

    const onToolbarAddCaseBranch = useCallback(() => {
        if (!caseBranchAddRequest) return
        performAddCaseBranch(caseBranchAddRequest.nodeId, caseBranchAddRequest.insertAfterBranchIndex)
    }, [caseBranchAddRequest, performAddCaseBranch])

    const onKeyboardEnter = useCallback((): boolean => {
        const target = state.selectedTarget
        if (!target) return false

        const node = findNodeById(state.root, target.nodeId)
        if (!node) return false

        const req = pickEnterEditRequest(node, target)
        if (!req) return false

        if (req.kind === 'caseBranchLabel') {
            editor.openCaseBranchLabelEditor(req.nodeId, req.branchIndex, req.text)
            return true
        }

        editor.openEditor(req.nodeId, req.kind, req.text)
        return true
    }, [editor, state.root, state.selectedTarget])

    const onKeyboardTab = useCallback((): boolean => {
        if (!caseBranchAddRequest) return false

        const node = findNodeById(state.root, caseBranchAddRequest.nodeId)
        if (node?.type !== 'case') return false

        performAddCaseBranch(caseBranchAddRequest.nodeId, caseBranchAddRequest.insertAfterBranchIndex)
        return true
    }, [caseBranchAddRequest, performAddCaseBranch, state.root])

    const onKeyboardDelete = useCallback((): boolean => {
        if (!canDeleteSelected) return false
        onDeleteSelected()
        return true
    }, [canDeleteSelected, onDeleteSelected])

    return {
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
        onEditorConfirm,
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
        onToolbarAddProcess,
        onToolbarAddIf,
        onToolbarAddCase,
        onToolbarAddWhile,
        onToolbarAddDoWhile,
        onToolbarAddCaseBranch,
        onKeyboardEnter,
        onKeyboardTab,
        onKeyboardDelete,
    }
}