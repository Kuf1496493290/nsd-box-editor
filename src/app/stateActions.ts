import type { Dispatch, SetStateAction } from 'react'
import type { AppState, BoolLabelMode, DragMoveRequest, SelectionTarget } from './types'
import { commitHistory, defaultTargetForNode, normalizeSelection, type HistoryState } from './stateCommon'
import {
    addCaseBranchInRoot,
    appendCaseAtEnd,
    appendCaseToCaseBranchEnd,
    appendCaseToIfBranchEnd,
    appendDoWhileAtEnd,
    appendDoWhileToCaseBranchEnd,
    appendDoWhileToIfBranchEnd,
    appendIfAtEnd,
    appendIfToCaseBranchEnd,
    appendIfToIfBranchEnd,
    appendProcessAtEnd,
    appendProcessToCaseBranchEnd,
    appendProcessToIfBranchEnd,
    appendWhileAtEnd,
    appendWhileToCaseBranchEnd,
    appendWhileToIfBranchEnd,
    applyDragMoveInRoot,
    deleteCaseBranchInRoot,
    deleteNode,
    insertCaseAfter,
    insertDoWhileAfter,
    insertIfAfter,
    insertProcessAfter,
    insertWhileAfter,
    moveNodeDown,
    moveNodeUp,
    prependCaseToCaseBranch,
    prependCaseToIfBranch,
    prependCaseToLoopBody,
    prependDoWhileToCaseBranch,
    prependDoWhileToIfBranch,
    prependDoWhileToLoopBody,
    prependIfToCaseBranch,
    prependIfToIfBranch,
    prependIfToLoopBody,
    prependProcessToCaseBranch,
    prependProcessToIfBranch,
    prependProcessToLoopBody,
    prependWhileToCaseBranch,
    prependWhileToIfBranch,
    prependWhileToLoopBody,
    updateCaseBranchLabelInRoot,
    updateCaseConditionTextInRoot,
    updateIfBoolLabelModeInRoot,
    updateIfConditionTextInRoot,
    updateLoopConditionTextInRoot,
    updateProcessTextInRoot,
} from '../model/treeOps'

type RootUpdateResult = Readonly<{
    root: AppState['root']
    changed: boolean
    selectedNodeId?: string | null
    selectedTarget?: SelectionTarget | null
}>

function withSelection(
    prev: AppState,
    root: AppState['root'],
    selectedNodeId?: string | null,
    selectedTarget?: SelectionTarget | null,
): AppState {
    const nextSelectedNodeId = selectedNodeId ?? prev.selectedNodeId
    const resolvedTarget = selectedTarget ?? defaultTargetForNode(root, nextSelectedNodeId ?? null)

    return normalizeSelection({
        ...prev,
        root,
        selectedNodeId: nextSelectedNodeId ?? null,
        selectedTarget: resolvedTarget ?? null,
    })
}

type SetHistory = Dispatch<SetStateAction<HistoryState>>

export type TreeActionSet = Readonly<{
    addProcessAfterEnd: () => void
    addIfAfterEnd: () => void
    addCaseAfterEnd: () => void
    addWhileAfterEnd: () => void
    addDoWhileAfterEnd: () => void
    addProcessAfter: (nodeId: string) => void
    addIfAfter: (nodeId: string) => void
    addCaseAfter: (nodeId: string) => void
    addWhileAfter: (nodeId: string) => void
    addDoWhileAfter: (nodeId: string) => void
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
    addCaseBranch: (nodeId: string, insertAfterBranchIndex?: number) => void
    deleteCaseBranch: (nodeId: string, branchIndex: number) => void
    moveProcessUp: (nodeId: string) => void
    moveProcessDown: (nodeId: string) => void
    moveByDrag: (req: DragMoveRequest) => void
    deleteProcess: (nodeId: string) => void
    updateProcessText: (nodeId: string, text: string) => void
    updateIfConditionText: (nodeId: string, conditionText: string) => void
    updateCaseConditionText: (nodeId: string, conditionText: string) => void
    updateLoopConditionText: (nodeId: string, conditionText: string) => void
    updateCaseBranchLabel: (nodeId: string, branchIndex: number, label: string) => void
    updateIfBoolLabelMode: (nodeId: string, mode: BoolLabelMode) => void
}>

export function createTreeActions(setHistory: SetHistory): TreeActionSet {
    const commitSelectionOp = (op: (present: AppState) => RootUpdateResult) => {
        setHistory((prev) => {
            const present = prev.present
            const result = op(present)
            if (!result.changed) return prev
            return commitHistory(prev, withSelection(present, result.root, result.selectedNodeId, result.selectedTarget))
        })
    }

    const commitTextOp = (op: (present: AppState) => RootUpdateResult) => {
        setHistory((prev) => {
            const present = prev.present
            const result = op(present)
            if (!result.changed) return prev

            const nextSelectedNodeId = result.selectedNodeId ?? present.selectedNodeId
            return commitHistory(prev, {
                ...present,
                root: result.root,
                selectedNodeId: nextSelectedNodeId,
                selectedTarget: defaultTargetForNode(result.root, nextSelectedNodeId),
            })
        })
    }

    function addProcessAfterEnd() {
        commitSelectionOp((present) => appendProcessAtEnd(present.root))
    }

    function addIfAfterEnd() {
        commitSelectionOp((present) => appendIfAtEnd(present.root))
    }

    function addCaseAfterEnd() {
        commitSelectionOp((present) => appendCaseAtEnd(present.root))
    }

    function addWhileAfterEnd() {
        commitSelectionOp((present) => appendWhileAtEnd(present.root))
    }

    function addDoWhileAfterEnd() {
        commitSelectionOp((present) => appendDoWhileAtEnd(present.root))
    }

    function addProcessAfter(nodeId: string) {
        commitSelectionOp((present) => insertProcessAfter(present.root, nodeId))
    }

    function addIfAfter(nodeId: string) {
        commitSelectionOp((present) => insertIfAfter(present.root, nodeId))
    }

    function addCaseAfter(nodeId: string) {
        commitSelectionOp((present) => insertCaseAfter(present.root, nodeId))
    }

    function addWhileAfter(nodeId: string) {
        commitSelectionOp((present) => insertWhileAfter(present.root, nodeId))
    }

    function addDoWhileAfter(nodeId: string) {
        commitSelectionOp((present) => insertDoWhileAfter(present.root, nodeId))
    }

    function addProcessToIfBranchEnd(nodeId: string, branch: 'true' | 'false') {
        commitSelectionOp((present) => appendProcessToIfBranchEnd(present.root, nodeId, branch))
    }

    function addIfToIfBranchEnd(nodeId: string, branch: 'true' | 'false') {
        commitSelectionOp((present) => appendIfToIfBranchEnd(present.root, nodeId, branch))
    }

    function addCaseToIfBranchEnd(nodeId: string, branch: 'true' | 'false') {
        commitSelectionOp((present) => appendCaseToIfBranchEnd(present.root, nodeId, branch))
    }

    function addWhileToIfBranchEnd(nodeId: string, branch: 'true' | 'false') {
        commitSelectionOp((present) => appendWhileToIfBranchEnd(present.root, nodeId, branch))
    }

    function addDoWhileToIfBranchEnd(nodeId: string, branch: 'true' | 'false') {
        commitSelectionOp((present) => appendDoWhileToIfBranchEnd(present.root, nodeId, branch))
    }

    function prependProcessInIfBranch(nodeId: string, branch: 'true' | 'false') {
        commitSelectionOp((present) => prependProcessToIfBranch(present.root, nodeId, branch))
    }

    function prependIfInIfBranch(nodeId: string, branch: 'true' | 'false') {
        commitSelectionOp((present) => prependIfToIfBranch(present.root, nodeId, branch))
    }

    function prependCaseInIfBranch(nodeId: string, branch: 'true' | 'false') {
        commitSelectionOp((present) => prependCaseToIfBranch(present.root, nodeId, branch))
    }

    function prependWhileInIfBranch(nodeId: string, branch: 'true' | 'false') {
        commitSelectionOp((present) => prependWhileToIfBranch(present.root, nodeId, branch))
    }

    function prependDoWhileInIfBranch(nodeId: string, branch: 'true' | 'false') {
        commitSelectionOp((present) => prependDoWhileToIfBranch(present.root, nodeId, branch))
    }

    function addProcessToCaseBranchEnd(nodeId: string, branchIndex: number) {
        commitSelectionOp((present) => appendProcessToCaseBranchEnd(present.root, nodeId, branchIndex))
    }

    function addIfToCaseBranchEnd(nodeId: string, branchIndex: number) {
        commitSelectionOp((present) => appendIfToCaseBranchEnd(present.root, nodeId, branchIndex))
    }

    function addCaseToCaseBranchEnd(nodeId: string, branchIndex: number) {
        commitSelectionOp((present) => appendCaseToCaseBranchEnd(present.root, nodeId, branchIndex))
    }

    function addWhileToCaseBranchEnd(nodeId: string, branchIndex: number) {
        commitSelectionOp((present) => appendWhileToCaseBranchEnd(present.root, nodeId, branchIndex))
    }

    function addDoWhileToCaseBranchEnd(nodeId: string, branchIndex: number) {
        commitSelectionOp((present) => appendDoWhileToCaseBranchEnd(present.root, nodeId, branchIndex))
    }

    function prependProcessInCaseBranch(nodeId: string, branchIndex: number) {
        commitSelectionOp((present) => prependProcessToCaseBranch(present.root, nodeId, branchIndex))
    }

    function prependIfInCaseBranch(nodeId: string, branchIndex: number) {
        commitSelectionOp((present) => prependIfToCaseBranch(present.root, nodeId, branchIndex))
    }

    function prependCaseInCaseBranch(nodeId: string, branchIndex: number) {
        commitSelectionOp((present) => prependCaseToCaseBranch(present.root, nodeId, branchIndex))
    }

    function prependWhileInCaseBranch(nodeId: string, branchIndex: number) {
        commitSelectionOp((present) => prependWhileToCaseBranch(present.root, nodeId, branchIndex))
    }

    function prependDoWhileInCaseBranch(nodeId: string, branchIndex: number) {
        commitSelectionOp((present) => prependDoWhileToCaseBranch(present.root, nodeId, branchIndex))
    }

    function prependProcessInLoopBody(nodeId: string) {
        commitSelectionOp((present) => prependProcessToLoopBody(present.root, nodeId))
    }

    function prependIfInLoopBody(nodeId: string) {
        commitSelectionOp((present) => prependIfToLoopBody(present.root, nodeId))
    }

    function prependCaseInLoopBody(nodeId: string) {
        commitSelectionOp((present) => prependCaseToLoopBody(present.root, nodeId))
    }

    function prependWhileInLoopBody(nodeId: string) {
        commitSelectionOp((present) => prependWhileToLoopBody(present.root, nodeId))
    }

    function prependDoWhileInLoopBody(nodeId: string) {
        commitSelectionOp((present) => prependDoWhileToLoopBody(present.root, nodeId))
    }

    function addCaseBranch(nodeId: string, insertAfterBranchIndex?: number) {
        commitSelectionOp((present) => addCaseBranchInRoot(present.root, nodeId, insertAfterBranchIndex))
    }

    function deleteCaseBranch(nodeId: string, branchIndex: number) {
        commitSelectionOp((present) => deleteCaseBranchInRoot(present.root, nodeId, branchIndex))
    }

    function moveProcessUp(nodeId: string) {
        commitSelectionOp((present) => moveNodeUp(present.root, nodeId))
    }

    function moveProcessDown(nodeId: string) {
        commitSelectionOp((present) => moveNodeDown(present.root, nodeId))
    }

    function moveByDrag(req: DragMoveRequest) {
        commitSelectionOp((present) => applyDragMoveInRoot(present.root, req))
    }

    function deleteProcess(nodeId: string) {
        setHistory((prev) => {
            const present = prev.present
            const result = deleteNode(present.root, nodeId)
            if (!result.changed) return prev
            return commitHistory(prev, withSelection(present, result.root, null, null))
        })
    }

    function updateProcessText(nodeId: string, text: string) {
        commitTextOp((present) => updateProcessTextInRoot(present.root, nodeId, text))
    }

    function updateIfConditionText(nodeId: string, conditionText: string) {
        commitTextOp((present) => updateIfConditionTextInRoot(present.root, nodeId, conditionText))
    }

    function updateCaseConditionText(nodeId: string, conditionText: string) {
        commitTextOp((present) => updateCaseConditionTextInRoot(present.root, nodeId, conditionText))
    }

    function updateLoopConditionText(nodeId: string, conditionText: string) {
        commitTextOp((present) => updateLoopConditionTextInRoot(present.root, nodeId, conditionText))
    }

    function updateCaseBranchLabel(nodeId: string, branchIndex: number, label: string) {
        commitSelectionOp((present) => updateCaseBranchLabelInRoot(present.root, nodeId, branchIndex, label))
    }

    function updateIfBoolLabelMode(nodeId: string, mode: BoolLabelMode) {
        commitTextOp((present) => updateIfBoolLabelModeInRoot(present.root, nodeId, mode))
    }

    return {
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
    }
}