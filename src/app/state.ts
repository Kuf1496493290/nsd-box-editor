// FILE: src/app/state.ts
import { useMemo, useState } from 'react'
import type { AppState, SelectionTarget } from './types'
import { createInitialState } from './constants'
import { clampScale, commitHistory, defaultTargetForNode, HISTORY_LIMIT, normalizeSelection, type HistoryState } from './stateCommon'
import { createTreeActions } from './stateActions'

export function useAppState() {
    const initial = useMemo(() => normalizeSelection(createInitialState()), [])
    const [history, setHistory] = useState<HistoryState>({
        past: [],
        present: initial,
        future: [],
    })

    const treeActions = useMemo(() => createTreeActions(setHistory), [])

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
                present: normalizeSelection(previous),
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
                present: normalizeSelection(next),
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

    function selectNodeWithDefaultTarget(nodeId: string | null) {
        setHistory((prev) => {
            const present = prev.present
            const target = defaultTargetForNode(present.root, nodeId)
            return {
                ...prev,
                present: normalizeSelection({
                    ...present,
                    selectedNodeId: target ? target.nodeId : null,
                    selectedTarget: target,
                }),
            }
        })
    }

    function selectTarget(target: SelectionTarget | null) {
        setHistory((prev) => {
            const present = prev.present

            if (!target) {
                return {
                    ...prev,
                    present: {
                        ...present,
                        selectedTarget: null,
                        selectedNodeId: null,
                    },
                }
            }

            const normalizedTarget = target.kind === 'node' ? defaultTargetForNode(present.root, target.nodeId) : target

            return {
                ...prev,
                present: normalizeSelection({
                    ...present,
                    selectedTarget: normalizedTarget,
                    selectedNodeId: normalizedTarget ? normalizedTarget.nodeId : null,
                }),
            }
        })
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
        ...treeActions,
        selectNodeWithDefaultTarget,
        selectTarget,
    }
}