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
import { perfLogDuration, perfNow } from '../utils/perf'

/**
 * CASE 分支新增请求；为空时表示当前选中态不支持新增分支。
 */
type CaseBranchAddRequest = Readonly<{ nodeId: string; insertAfterBranchIndex?: number }> | null

/**
 * 文本编辑器相关能力集合，统一由外层注入，避免控制器直接依赖 UI 组件。
 */
type EditorFns = Readonly<{
    closeEditor: () => void
    openEditor: (nodeId: string, kind: Exclude<EditingKind, 'caseBranchLabel'>, text: string) => void
    openCaseBranchLabelEditor: (caseId: string, branchIndex: number, text: string) => void
}>

/**
 * 状态读写能力集合，封装对 state.ts 的关键更新入口。
 */
type StateFns = Readonly<{
    selectNodeWithDefaultTarget: (nodeId: string | null) => void
    selectTarget: (target: SelectionTarget | null) => void
    updateProcessText: (nodeId: string, text: string) => void
    updateIfConditionText: (nodeId: string, text: string) => void
    updateCaseConditionText: (nodeId: string, text: string) => void
    updateLoopConditionText: (nodeId: string, text: string) => void
    updateCaseBranchLabel: (caseId: string, branchIndex: number, text: string) => void
    updateIfBoolLabelMode: (nodeId: string, mode: BoolLabelMode) => void
}>

/**
 * 插入动作能力集合：覆盖 root、if/case 分支与 loop body 的所有插入路径。
 */
type InsertActions = Readonly<{
    addProcessAfter: (nodeId: string) => void
    addIfAfter: (nodeId: string) => void
    addCaseAfter: (nodeId: string) => void
    addWhileAfter: (nodeId: string) => void
    addDoWhileAfter: (nodeId: string) => void
    appendProcessToRoot: () => void
    appendIfToRoot: () => void
    appendCaseToRoot: () => void
    appendWhileToRoot: () => void
    appendDoWhileToRoot: () => void
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

/**
 * 结构变更能力集合：删除节点、增加/删除 CASE 分支。
 */
type MutationFns = Readonly<{
    deleteNodeById: (nodeId: string) => void
    addCaseBranch: (caseId: string, insertAfterBranchIndex?: number) => void
    deleteCaseBranch: (caseId: string, branchIndex: number) => void
}>

type DeleteIntent =
    | Readonly<{ kind: 'none' }>
    | Readonly<{ kind: 'deleteNode' }>
    | Readonly<{ kind: 'deleteCaseBranch'; branchIndex: number }>

/**
 * 基于“当前选中目标 + 节点类型”解析删除意图。
 * 规则：
 * - loop 空洞与 if/case 的容器区域只允许选中，不允许删除。
 * - case 分支标签在分支数大于 2 时优先删除分支，否则退化为删除整个 case。
 */
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

/**
 * 聚合并产出 App 控制器动作集合。
 * 该 Hook 负责把“选中态语义、编辑器状态、插入策略、结构变更策略”统一编排为 UI 可直接调用的回调。
 */
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
        stateFns.selectNodeWithDefaultTarget(nodeId)
        editor.closeEditor()
    }, [editor, stateFns])

    const onProcessDoubleClick = useCallback((nodeId: string) => {
        stateFns.selectNodeWithDefaultTarget(nodeId)
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
        stateFns.selectTarget({ kind: 'ifPart', nodeId, part })
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
        stateFns.selectNodeWithDefaultTarget(nodeId)
        editor.closeEditor()
    }, [editor, stateFns])

    const onLoopHoleSelect = useCallback((nodeId: string) => {
        stateFns.selectTarget({ kind: 'loopPart', nodeId, part: 'hole' })
        editor.closeEditor()
    }, [editor, stateFns])

    const onLoopConditionDoubleClick = useCallback((nodeId: string) => {
        stateFns.selectNodeWithDefaultTarget(nodeId)
        const node = findNodeById(state.root, nodeId)
        if (node?.type !== 'loop') return
        editor.openEditor(nodeId, 'loopCondition', node.conditionText)
    }, [editor, state.root, stateFns])

    const onEditorConfirm = useCallback((nextText: string) => {
        const start = perfNow()
        try {
            if (!editingNodeId) return

            /*
             * 文本保存按编辑类型分发到不同更新入口，确保各节点字段写入语义稳定。
             * caseBranchLabel 依赖 editingBranchIndex，因此在前置分支全部不命中后单独处理。
             */
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
        } finally {
            perfLogDuration('action.onEditorConfirm', start, { kind: editingKind })
        }
    }, [editingBranchIndex, editingKind, editingNodeId, editor, stateFns])

    const onCanvasBlankClick = useCallback(() => {
        stateFns.selectTarget(null)
        editor.closeEditor()
    }, [editor, stateFns])

    const onInsertProcessAtSelection = useCallback((nodeId: string) => {
        const start = perfNow()
        try {
            insertByTarget(nodeId, state.selectedTarget, {
                insertAfter: insertActions.addProcessAfter,
                prependToIfBranch: insertActions.prependProcessInIfBranch,
                appendToIfBranchEnd: insertActions.addProcessToIfBranchEnd,
                prependToCaseBranch: insertActions.prependProcessInCaseBranch,
                appendToCaseBranchEnd: insertActions.addProcessToCaseBranchEnd,
                prependToLoopBody: insertActions.prependProcessInLoopBody,
            })
        } finally {
            perfLogDuration('action.insertProcess', start)
        }
    }, [insertActions, state.selectedTarget])

    const onInsertIfAtSelection = useCallback((nodeId: string) => {
        const start = perfNow()
        try {
            insertByTarget(nodeId, state.selectedTarget, {
                insertAfter: insertActions.addIfAfter,
                prependToIfBranch: insertActions.prependIfInIfBranch,
                appendToIfBranchEnd: insertActions.addIfToIfBranchEnd,
                prependToCaseBranch: insertActions.prependIfInCaseBranch,
                appendToCaseBranchEnd: insertActions.addIfToCaseBranchEnd,
                prependToLoopBody: insertActions.prependIfInLoopBody,
            })
        } finally {
            perfLogDuration('action.insertIf', start)
        }
    }, [insertActions, state.selectedTarget])

    const onInsertCaseAtSelection = useCallback((nodeId: string) => {
        const start = perfNow()
        try {
            insertByTarget(nodeId, state.selectedTarget, {
                insertAfter: insertActions.addCaseAfter,
                prependToIfBranch: insertActions.prependCaseInIfBranch,
                appendToIfBranchEnd: insertActions.addCaseToIfBranchEnd,
                prependToCaseBranch: insertActions.prependCaseInCaseBranch,
                appendToCaseBranchEnd: insertActions.addCaseToCaseBranchEnd,
                prependToLoopBody: insertActions.prependCaseInLoopBody,
            })
        } finally {
            perfLogDuration('action.insertCase', start)
        }
    }, [insertActions, state.selectedTarget])

    const onInsertWhileAtSelection = useCallback((nodeId: string) => {
        const start = perfNow()
        try {
            insertByTarget(nodeId, state.selectedTarget, {
                insertAfter: insertActions.addWhileAfter,
                prependToIfBranch: insertActions.prependWhileInIfBranch,
                appendToIfBranchEnd: insertActions.addWhileToIfBranchEnd,
                prependToCaseBranch: insertActions.prependWhileInCaseBranch,
                appendToCaseBranchEnd: insertActions.addWhileToCaseBranchEnd,
                prependToLoopBody: insertActions.prependWhileInLoopBody,
            })
        } finally {
            perfLogDuration('action.insertWhile', start)
        }
    }, [insertActions, state.selectedTarget])

    const onInsertDoWhileAtSelection = useCallback((nodeId: string) => {
        const start = perfNow()
        try {
            insertByTarget(nodeId, state.selectedTarget, {
                insertAfter: insertActions.addDoWhileAfter,
                prependToIfBranch: insertActions.prependDoWhileInIfBranch,
                appendToIfBranchEnd: insertActions.addDoWhileToIfBranchEnd,
                prependToCaseBranch: insertActions.prependDoWhileInCaseBranch,
                appendToCaseBranchEnd: insertActions.addDoWhileToCaseBranchEnd,
                prependToLoopBody: insertActions.prependDoWhileInLoopBody,
            })
        } finally {
            perfLogDuration('action.insertDoWhile', start)
        }
    }, [insertActions, state.selectedTarget])

    const onAddCaseBranch = useCallback((caseId: string, insertAfterBranchIndex?: number) => {
        performAddCaseBranch(caseId, insertAfterBranchIndex)
    }, [performAddCaseBranch])

    const onDeleteSelected = useCallback(() => {
        const start = perfNow()
        try {
            if (!canDeleteSelected) return

            const target = state.selectedTarget
            const node = selectedNode
            if (!node || !target) return

            /*
             * 删除动作先解析意图，再执行具体 mutation，避免各类选中态分支在 UI 层重复实现。
             */
            const intent = resolveDeleteIntent(target, node)
            if (intent.kind === 'none') return

            editor.closeEditor()
            if (intent.kind === 'deleteCaseBranch') {
                mutationFns.deleteCaseBranch(node.id, intent.branchIndex)
                return
            }

            mutationFns.deleteNodeById(node.id)
        } finally {
            perfLogDuration('action.onDeleteSelected', start)
        }
    }, [canDeleteSelected, editor, mutationFns, selectedNode, state.selectedTarget])

    const onToolbarInsertProcess = useCallback(() => {
        insertFromToolbarTarget(state.selectedTarget, {
            addAtEnd: insertActions.appendProcessToRoot,
            insertAfter: insertActions.addProcessAfter,
            prependToIfBranch: insertActions.prependProcessInIfBranch,
            appendToIfBranchEnd: insertActions.addProcessToIfBranchEnd,
            prependToCaseBranch: insertActions.prependProcessInCaseBranch,
            appendToCaseBranchEnd: insertActions.addProcessToCaseBranchEnd,
            prependToLoopBody: insertActions.prependProcessInLoopBody,
        })
    }, [insertActions, state.selectedTarget])

    const onToolbarInsertIf = useCallback(() => {
        insertFromToolbarTarget(state.selectedTarget, {
            addAtEnd: insertActions.appendIfToRoot,
            insertAfter: insertActions.addIfAfter,
            prependToIfBranch: insertActions.prependIfInIfBranch,
            appendToIfBranchEnd: insertActions.addIfToIfBranchEnd,
            prependToCaseBranch: insertActions.prependIfInCaseBranch,
            appendToCaseBranchEnd: insertActions.addIfToCaseBranchEnd,
            prependToLoopBody: insertActions.prependIfInLoopBody,
        })
    }, [insertActions, state.selectedTarget])

    const onToolbarInsertCase = useCallback(() => {
        insertFromToolbarTarget(state.selectedTarget, {
            addAtEnd: insertActions.appendCaseToRoot,
            insertAfter: insertActions.addCaseAfter,
            prependToIfBranch: insertActions.prependCaseInIfBranch,
            appendToIfBranchEnd: insertActions.addCaseToIfBranchEnd,
            prependToCaseBranch: insertActions.prependCaseInCaseBranch,
            appendToCaseBranchEnd: insertActions.addCaseToCaseBranchEnd,
            prependToLoopBody: insertActions.prependCaseInLoopBody,
        })
    }, [insertActions, state.selectedTarget])

    const onToolbarInsertWhile = useCallback(() => {
        insertFromToolbarTarget(state.selectedTarget, {
            addAtEnd: insertActions.appendWhileToRoot,
            insertAfter: insertActions.addWhileAfter,
            prependToIfBranch: insertActions.prependWhileInIfBranch,
            appendToIfBranchEnd: insertActions.addWhileToIfBranchEnd,
            prependToCaseBranch: insertActions.prependWhileInCaseBranch,
            appendToCaseBranchEnd: insertActions.addWhileToCaseBranchEnd,
            prependToLoopBody: insertActions.prependWhileInLoopBody,
        })
    }, [insertActions, state.selectedTarget])

    const onToolbarInsertDoWhile = useCallback(() => {
        insertFromToolbarTarget(state.selectedTarget, {
            addAtEnd: insertActions.appendDoWhileToRoot,
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
        onInsertProcessAtSelection,
        onInsertIfAtSelection,
        onInsertCaseAtSelection,
        onInsertWhileAtSelection,
        onInsertDoWhileAtSelection,
        onDeleteSelected,
        onAddCaseBranch,
        onToolbarInsertProcess,
        onToolbarInsertIf,
        onToolbarInsertCase,
        onToolbarInsertWhile,
        onToolbarInsertDoWhile,
        onToolbarAddCaseBranch,
        onKeyboardEnter,
        onKeyboardTab,
        onKeyboardDelete,
    }
}