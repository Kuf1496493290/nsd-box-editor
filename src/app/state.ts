// FILE: src/app/state.ts
import { useMemo, useState } from 'react'
import type { AppState, BoolLabelMode, DragMoveRequest, NsdNode, SelectionTarget, SequenceNode } from './types'
import { createInitialState } from './constants'
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
    updateLoopConditionTextInRoot,
    updateIfBoolLabelModeInRoot,
    updateIfConditionTextInRoot,
    updateProcessTextInRoot,
} from '../model/treeOps'

type HistoryState = Readonly<{
    past: AppState[]
    present: AppState
    future: AppState[]
}>

const HISTORY_LIMIT = 200

function commitHistory(prev: HistoryState, nextPresent: AppState): HistoryState {
    const nextPast = [...prev.past, prev.present]
    const trimmedPast = nextPast.length > HISTORY_LIMIT ? nextPast.slice(nextPast.length - HISTORY_LIMIT) : nextPast

    return {
        past: trimmedPast,
        present: nextPresent,
        future: [],
    }
}

function defaultTargetForNode(nodeId: string | null): SelectionTarget | null {
    if (!nodeId) return null
    return { kind: 'node', nodeId }
}

function resolveSelectedTarget(
    prev: AppState,
    selectedNodeId: string | null | undefined,
    selectedTarget: SelectionTarget | null | undefined,
): SelectionTarget | null {
    if (selectedTarget !== undefined) return selectedTarget
    return defaultTargetForNode(selectedNodeId ?? prev.selectedNodeId)
}

function withSelection(
    prev: AppState,
    root: AppState['root'],
    selectedNodeId?: string | null,
    selectedTarget?: SelectionTarget | null,
): AppState {
    const nextSelectedNodeId = selectedNodeId ?? prev.selectedNodeId
    const nextTarget = resolveSelectedTarget(prev, nextSelectedNodeId, selectedTarget)

    return {
        ...prev,
        root,
        selectedNodeId: nextSelectedNodeId,
        selectedTarget: nextTarget,
    }
}

function traversalChildren(node: NsdNode): NsdNode[] {
    if (node.type === 'sequence') return node.children
    if (node.type === 'if') return [node.falseBranch, node.trueBranch]
    if (node.type === 'case') return node.branches
    if (node.type === 'loop') return [node.body]
    return []
}

function containsNode(root: SequenceNode, nodeId: string): boolean {
    const stack: NsdNode[] = [root]

    while (stack.length > 0) {
        const current = stack.pop()
        if (!current) break

        if (current.id === nodeId) return true

        const children = traversalChildren(current)
        for (let i = children.length - 1; i >= 0; i -= 1) {
            stack.push(children[i])
        }
    }

    return false
}

function isTargetStillValid(root: SequenceNode, target: SelectionTarget | null): boolean {
    if (!target) return true
    return containsNode(root, target.nodeId)
}

function clampScale(value: number): number {
    const v = Number.isFinite(value) ? value : 1
    const clamped = Math.max(0.5, Math.min(2, v))
    return Math.round(clamped * 10) / 10
}

export function useAppState() {
    const initial = useMemo(() => createInitialState(), [])
    const [history, setHistory] = useState<HistoryState>({
        past: [],
        present: initial,
        future: [],
    })

    const state = history.present
    const canUndo = history.past.length > 0
    const canRedo = history.future.length > 0

    function reset() {
        setHistory((prev) => commitHistory(prev, createInitialState()))
    }

    function replaceState(next: AppState) {
        setHistory((prev) => commitHistory(prev, next))
    }

    function undo() {
        setHistory((prev) => {
            const previous = prev.past.at(-1)
            if (!previous) return prev

            const nextPast = prev.past.slice(0, -1)
            const nextFuture = [prev.present, ...prev.future]

            return {
                past: nextPast,
                present: previous,
                future: nextFuture,
            }
        })
    }

    function redo() {
        setHistory((prev) => {
            const next = prev.future.at(0)
            if (!next) return prev

            const nextFuture = prev.future.slice(1)
            const nextPast = [...prev.past, prev.present]
            const trimmedPast = nextPast.length > HISTORY_LIMIT ? nextPast.slice(nextPast.length - HISTORY_LIMIT) : nextPast

            return {
                past: trimmedPast,
                present: next,
                future: nextFuture,
            }
        })
    }

    function updateScale(nextScale: number) {
        setHistory((prev) => {
            const present = prev.present
            const normalized = clampScale(nextScale)
            if (present.scale === normalized) return prev
            return commitHistory(prev, { ...present, scale: normalized })
        })
    }

    function addProcessAfterEnd() {
        setHistory((prev) => {
            const present = prev.present
            const result = appendProcessAtEnd(present.root)
            if (!result.changed) return prev
            return commitHistory(prev, withSelection(present, result.root, result.selectedNodeId))
        })
    }

    function addIfAfterEnd() {
        setHistory((prev) => {
            const present = prev.present
            const result = appendIfAtEnd(present.root)
            if (!result.changed) return prev
            return commitHistory(prev, withSelection(present, result.root, result.selectedNodeId))
        })
    }

    function addCaseAfterEnd() {
        setHistory((prev) => {
            const present = prev.present
            const result = appendCaseAtEnd(present.root)
            if (!result.changed) return prev
            return commitHistory(prev, withSelection(present, result.root, result.selectedNodeId))
        })
    }

    function addWhileAfterEnd() {
        setHistory((prev) => {
            const present = prev.present
            const result = appendWhileAtEnd(present.root)
            if (!result.changed) return prev
            return commitHistory(prev, withSelection(present, result.root, result.selectedNodeId))
        })
    }

    function addDoWhileAfterEnd() {
        setHistory((prev) => {
            const present = prev.present
            const result = appendDoWhileAtEnd(present.root)
            if (!result.changed) return prev
            return commitHistory(prev, withSelection(present, result.root, result.selectedNodeId))
        })
    }

    function addProcessAfter(nodeId: string) {
        setHistory((prev) => {
            const present = prev.present
            const result = insertProcessAfter(present.root, nodeId)
            if (!result.changed) return prev
            return commitHistory(prev, withSelection(present, result.root, result.selectedNodeId))
        })
    }

    function addIfAfter(nodeId: string) {
        setHistory((prev) => {
            const present = prev.present
            const result = insertIfAfter(present.root, nodeId)
            if (!result.changed) return prev
            return commitHistory(prev, withSelection(present, result.root, result.selectedNodeId))
        })
    }

    function addCaseAfter(nodeId: string) {
        setHistory((prev) => {
            const present = prev.present
            const result = insertCaseAfter(present.root, nodeId)
            if (!result.changed) return prev
            return commitHistory(prev, withSelection(present, result.root, result.selectedNodeId))
        })
    }

    function addWhileAfter(nodeId: string) {
        setHistory((prev) => {
            const present = prev.present
            const result = insertWhileAfter(present.root, nodeId)
            if (!result.changed) return prev
            return commitHistory(prev, withSelection(present, result.root, result.selectedNodeId))
        })
    }

    function addDoWhileAfter(nodeId: string) {
        setHistory((prev) => {
            const present = prev.present
            const result = insertDoWhileAfter(present.root, nodeId)
            if (!result.changed) return prev
            return commitHistory(prev, withSelection(present, result.root, result.selectedNodeId))
        })
    }

    function addProcessToIfBranchEnd(nodeId: string, branch: 'true' | 'false') {
        setHistory((prev) => {
            const present = prev.present
            const result = appendProcessToIfBranchEnd(present.root, nodeId, branch)
            if (!result.changed) return prev
            return commitHistory(prev, withSelection(present, result.root, result.selectedNodeId))
        })
    }

    function addIfToIfBranchEnd(nodeId: string, branch: 'true' | 'false') {
        setHistory((prev) => {
            const present = prev.present
            const result = appendIfToIfBranchEnd(present.root, nodeId, branch)
            if (!result.changed) return prev
            return commitHistory(prev, withSelection(present, result.root, result.selectedNodeId))
        })
    }

    function addCaseToIfBranchEnd(nodeId: string, branch: 'true' | 'false') {
        setHistory((prev) => {
            const present = prev.present
            const result = appendCaseToIfBranchEnd(present.root, nodeId, branch)
            if (!result.changed) return prev
            return commitHistory(prev, withSelection(present, result.root, result.selectedNodeId))
        })
    }

    function addWhileToIfBranchEnd(nodeId: string, branch: 'true' | 'false') {
        setHistory((prev) => {
            const present = prev.present
            const result = appendWhileToIfBranchEnd(present.root, nodeId, branch)
            if (!result.changed) return prev
            return commitHistory(prev, withSelection(present, result.root, result.selectedNodeId))
        })
    }

    function addDoWhileToIfBranchEnd(nodeId: string, branch: 'true' | 'false') {
        setHistory((prev) => {
            const present = prev.present
            const result = appendDoWhileToIfBranchEnd(present.root, nodeId, branch)
            if (!result.changed) return prev
            return commitHistory(prev, withSelection(present, result.root, result.selectedNodeId))
        })
    }

    function prependProcessInIfBranch(nodeId: string, branch: 'true' | 'false') {
        setHistory((prev) => {
            const present = prev.present
            const result = prependProcessToIfBranch(present.root, nodeId, branch)
            if (!result.changed) return prev
            return commitHistory(prev, withSelection(present, result.root, result.selectedNodeId))
        })
    }

    function prependIfInIfBranch(nodeId: string, branch: 'true' | 'false') {
        setHistory((prev) => {
            const present = prev.present
            const result = prependIfToIfBranch(present.root, nodeId, branch)
            if (!result.changed) return prev
            return commitHistory(prev, withSelection(present, result.root, result.selectedNodeId))
        })
    }

    function prependCaseInIfBranch(nodeId: string, branch: 'true' | 'false') {
        setHistory((prev) => {
            const present = prev.present
            const result = prependCaseToIfBranch(present.root, nodeId, branch)
            if (!result.changed) return prev
            return commitHistory(prev, withSelection(present, result.root, result.selectedNodeId))
        })
    }

    function prependWhileInIfBranch(nodeId: string, branch: 'true' | 'false') {
        setHistory((prev) => {
            const present = prev.present
            const result = prependWhileToIfBranch(present.root, nodeId, branch)
            if (!result.changed) return prev
            return commitHistory(prev, withSelection(present, result.root, result.selectedNodeId))
        })
    }

    function prependDoWhileInIfBranch(nodeId: string, branch: 'true' | 'false') {
        setHistory((prev) => {
            const present = prev.present
            const result = prependDoWhileToIfBranch(present.root, nodeId, branch)
            if (!result.changed) return prev
            return commitHistory(prev, withSelection(present, result.root, result.selectedNodeId))
        })
    }

    function addProcessToCaseBranchEnd(nodeId: string, branchIndex: number) {
        setHistory((prev) => {
            const present = prev.present
            const result = appendProcessToCaseBranchEnd(present.root, nodeId, branchIndex)
            if (!result.changed) return prev
            return commitHistory(prev, withSelection(present, result.root, result.selectedNodeId))
        })
    }

    function addIfToCaseBranchEnd(nodeId: string, branchIndex: number) {
        setHistory((prev) => {
            const present = prev.present
            const result = appendIfToCaseBranchEnd(present.root, nodeId, branchIndex)
            if (!result.changed) return prev
            return commitHistory(prev, withSelection(present, result.root, result.selectedNodeId))
        })
    }

    function addCaseToCaseBranchEnd(nodeId: string, branchIndex: number) {
        setHistory((prev) => {
            const present = prev.present
            const result = appendCaseToCaseBranchEnd(present.root, nodeId, branchIndex)
            if (!result.changed) return prev
            return commitHistory(prev, withSelection(present, result.root, result.selectedNodeId))
        })
    }

    function addWhileToCaseBranchEnd(nodeId: string, branchIndex: number) {
        setHistory((prev) => {
            const present = prev.present
            const result = appendWhileToCaseBranchEnd(present.root, nodeId, branchIndex)
            if (!result.changed) return prev
            return commitHistory(prev, withSelection(present, result.root, result.selectedNodeId))
        })
    }

    function addDoWhileToCaseBranchEnd(nodeId: string, branchIndex: number) {
        setHistory((prev) => {
            const present = prev.present
            const result = appendDoWhileToCaseBranchEnd(present.root, nodeId, branchIndex)
            if (!result.changed) return prev
            return commitHistory(prev, withSelection(present, result.root, result.selectedNodeId))
        })
    }

    function prependProcessInCaseBranch(nodeId: string, branchIndex: number) {
        setHistory((prev) => {
            const present = prev.present
            const result = prependProcessToCaseBranch(present.root, nodeId, branchIndex)
            if (!result.changed) return prev
            return commitHistory(prev, withSelection(present, result.root, result.selectedNodeId))
        })
    }

    function prependIfInCaseBranch(nodeId: string, branchIndex: number) {
        setHistory((prev) => {
            const present = prev.present
            const result = prependIfToCaseBranch(present.root, nodeId, branchIndex)
            if (!result.changed) return prev
            return commitHistory(prev, withSelection(present, result.root, result.selectedNodeId))
        })
    }

    function prependCaseInCaseBranch(nodeId: string, branchIndex: number) {
        setHistory((prev) => {
            const present = prev.present
            const result = prependCaseToCaseBranch(present.root, nodeId, branchIndex)
            if (!result.changed) return prev
            return commitHistory(prev, withSelection(present, result.root, result.selectedNodeId))
        })
    }

    function prependWhileInCaseBranch(nodeId: string, branchIndex: number) {
        setHistory((prev) => {
            const present = prev.present
            const result = prependWhileToCaseBranch(present.root, nodeId, branchIndex)
            if (!result.changed) return prev
            return commitHistory(prev, withSelection(present, result.root, result.selectedNodeId))
        })
    }

    function prependDoWhileInCaseBranch(nodeId: string, branchIndex: number) {
        setHistory((prev) => {
            const present = prev.present
            const result = prependDoWhileToCaseBranch(present.root, nodeId, branchIndex)
            if (!result.changed) return prev
            return commitHistory(prev, withSelection(present, result.root, result.selectedNodeId))
        })
    }

    function prependProcessInLoopBody(nodeId: string) {
        setHistory((prev) => {
            const present = prev.present
            const result = prependProcessToLoopBody(present.root, nodeId)
            if (!result.changed) return prev
            return commitHistory(prev, withSelection(present, result.root, result.selectedNodeId))
        })
    }

    function prependIfInLoopBody(nodeId: string) {
        setHistory((prev) => {
            const present = prev.present
            const result = prependIfToLoopBody(present.root, nodeId)
            if (!result.changed) return prev
            return commitHistory(prev, withSelection(present, result.root, result.selectedNodeId))
        })
    }

    function prependCaseInLoopBody(nodeId: string) {
        setHistory((prev) => {
            const present = prev.present
            const result = prependCaseToLoopBody(present.root, nodeId)
            if (!result.changed) return prev
            return commitHistory(prev, withSelection(present, result.root, result.selectedNodeId))
        })
    }

    function prependWhileInLoopBody(nodeId: string) {
        setHistory((prev) => {
            const present = prev.present
            const result = prependWhileToLoopBody(present.root, nodeId)
            if (!result.changed) return prev
            return commitHistory(prev, withSelection(present, result.root, result.selectedNodeId))
        })
    }

    function prependDoWhileInLoopBody(nodeId: string) {
        setHistory((prev) => {
            const present = prev.present
            const result = prependDoWhileToLoopBody(present.root, nodeId)
            if (!result.changed) return prev
            return commitHistory(prev, withSelection(present, result.root, result.selectedNodeId))
        })
    }

    function addCaseBranch(nodeId: string) {
        setHistory((prev) => {
            const present = prev.present
            const result = addCaseBranchInRoot(present.root, nodeId)
            if (!result.changed) return prev
            return commitHistory(prev, withSelection(present, result.root, result.selectedNodeId, result.selectedTarget))
        })
    }

    function deleteCaseBranch(nodeId: string, branchIndex: number) {
        setHistory((prev) => {
            const present = prev.present
            const result = deleteCaseBranchInRoot(present.root, nodeId, branchIndex)
            if (!result.changed) return prev
            return commitHistory(prev, withSelection(present, result.root, result.selectedNodeId, result.selectedTarget))
        })
    }

    function moveProcessUp(nodeId: string) {
        setHistory((prev) => {
            const present = prev.present
            const result = moveNodeUp(present.root, nodeId)
            if (!result.changed) return prev
            return commitHistory(prev, withSelection(present, result.root, result.selectedNodeId))
        })
    }

    function moveProcessDown(nodeId: string) {
        setHistory((prev) => {
            const present = prev.present
            const result = moveNodeDown(present.root, nodeId)
            if (!result.changed) return prev
            return commitHistory(prev, withSelection(present, result.root, result.selectedNodeId))
        })
    }

    function moveByDrag(req: DragMoveRequest) {
        setHistory((prev) => {
            const present = prev.present
            const result = applyDragMoveInRoot(present.root, req)
            if (!result.changed) return prev
            return commitHistory(prev, withSelection(present, result.root, result.selectedNodeId, result.selectedTarget))
        })
    }

    function deleteProcess(nodeId: string) {
        setHistory((prev) => {
            const present = prev.present
            const result = deleteNode(present.root, nodeId, present.selectedNodeId)
            if (!result.changed) return prev

            const deletingSelected = present.selectedNodeId === nodeId
            let nextSelectedNodeId = result.selectedNodeId ?? present.selectedNodeId
            let nextSelectedTarget = present.selectedTarget

            const selectedNodeValid = nextSelectedNodeId === null ? true : containsNode(result.root, nextSelectedNodeId)

            if (!selectedNodeValid) {
                nextSelectedNodeId = null
                nextSelectedTarget = null
            } else if (deletingSelected) {
                nextSelectedTarget = defaultTargetForNode(nextSelectedNodeId ?? null)
            } else if (!isTargetStillValid(result.root, nextSelectedTarget)) {
                nextSelectedTarget = defaultTargetForNode(nextSelectedNodeId ?? null)
            }

            return commitHistory(prev, {
                ...present,
                root: result.root,
                selectedNodeId: nextSelectedNodeId ?? null,
                selectedTarget: nextSelectedTarget,
            })
        })
    }

    function updateProcessText(nodeId: string, text: string) {
        setHistory((prev) => {
            const present = prev.present
            const result = updateProcessTextInRoot(present.root, nodeId, text)
            if (!result.changed) return prev

            return commitHistory(prev, {
                ...present,
                root: result.root,
                selectedNodeId: result.selectedNodeId ?? present.selectedNodeId,
            })
        })
    }

    function updateIfConditionText(nodeId: string, conditionText: string) {
        setHistory((prev) => {
            const present = prev.present
            const result = updateIfConditionTextInRoot(present.root, nodeId, conditionText)
            if (!result.changed) return prev

            return commitHistory(prev, {
                ...present,
                root: result.root,
                selectedNodeId: result.selectedNodeId ?? present.selectedNodeId,
            })
        })
    }

    function updateCaseConditionText(nodeId: string, conditionText: string) {
        setHistory((prev) => {
            const present = prev.present
            const result = updateCaseConditionTextInRoot(present.root, nodeId, conditionText)
            if (!result.changed) return prev

            return commitHistory(prev, {
                ...present,
                root: result.root,
                selectedNodeId: result.selectedNodeId ?? present.selectedNodeId,
            })
        })
    }

    function updateLoopConditionText(nodeId: string, conditionText: string) {
        setHistory((prev) => {
            const present = prev.present
            const result = updateLoopConditionTextInRoot(present.root, nodeId, conditionText)
            if (!result.changed) return prev

            return commitHistory(prev, {
                ...present,
                root: result.root,
                selectedNodeId: result.selectedNodeId ?? present.selectedNodeId,
            })
        })
    }

    function updateCaseBranchLabel(nodeId: string, branchIndex: number, label: string) {
        setHistory((prev) => {
            const present = prev.present
            const result = updateCaseBranchLabelInRoot(present.root, nodeId, branchIndex, label)
            if (!result.changed) return prev
            return commitHistory(prev, withSelection(present, result.root, result.selectedNodeId, result.selectedTarget))
        })
    }

    function updateIfBoolLabelMode(nodeId: string, mode: BoolLabelMode) {
        setHistory((prev) => {
            const present = prev.present
            const result = updateIfBoolLabelModeInRoot(present.root, nodeId, mode)
            if (!result.changed) return prev

            return commitHistory(prev, {
                ...present,
                root: result.root,
                selectedNodeId: result.selectedNodeId ?? present.selectedNodeId,
            })
        })
    }

    function selectNode(nodeId: string | null) {
        setHistory((prev) => ({
            ...prev,
            present: {
                ...prev.present,
                selectedNodeId: nodeId,
                selectedTarget: defaultTargetForNode(nodeId),
            },
        }))
    }

    function selectTarget(target: SelectionTarget | null) {
        setHistory((prev) => ({
            ...prev,
            present: {
                ...prev.present,
                selectedTarget: target,
                selectedNodeId: target ? target.nodeId : null,
            },
        }))
    }

    return {
        state,
        canUndo,
        canRedo,
        undo,
        redo,
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
    }
}