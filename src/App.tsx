// FILE: src/App.tsx
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import type { CasePartKey, DragMoveRequest, IfPartKey, NsdNode, SelectionTarget, SequenceNode } from './app/types'
import { canDeleteByTarget } from './app/selection'
import { useAppState } from './app/state'
import { Toolbar } from './components/Toolbar'
import { CanvasView } from './components/CanvasView'
import { FloatingTextEditor } from './components/FloatingTextEditor'
import { openProjectTextWithPicker, saveDiagramImage, saveProjectFile } from './utils/download'
import { installKeyboardShortcuts } from './features/keyboard'
import { buildProjectFile, parseProjectJsonDetailed } from './utils/projectJson'

type EditingKind = 'process' | 'ifCondition' | 'caseCondition' | 'loopCondition' | 'caseBranchLabel'

type InsertOps = Readonly<{
    insertAfter: (nodeId: string) => void

    prependToIfBranch: (ifNodeId: string, branch: 'true' | 'false') => void
    appendToIfBranchEnd: (ifNodeId: string, branch: 'true' | 'false') => void

    prependToCaseBranch: (caseNodeId: string, branchIndex: number) => void
    appendToCaseBranchEnd: (caseNodeId: string, branchIndex: number) => void

    prependToLoopBody: (loopNodeId: string) => void
}>

type ImportNotice = Readonly<{ kind: 'info' | 'error'; text: string }>

function pushSequenceChildren(stack: NsdNode[], node: Extract<NsdNode, { type: 'sequence' }>) {
    for (let i = node.children.length - 1; i >= 0; i -= 1) {
        stack.push(node.children[i])
    }
}

function pushIfBranches(stack: NsdNode[], node: Extract<NsdNode, { type: 'if' }>) {
    stack.push(node.falseBranch, node.trueBranch)
}

function pushCaseBranches(stack: NsdNode[], node: Extract<NsdNode, { type: 'case' }>) {
    for (let i = node.branches.length - 1; i >= 0; i -= 1) {
        stack.push(node.branches[i])
    }
}

function pushLoopBody(stack: NsdNode[], node: Extract<NsdNode, { type: 'loop' }>) {
    stack.push(node.body)
}

function findNodeById(root: SequenceNode, nodeId: string | null): NsdNode | null {
    if (!nodeId) return null

    const stack: NsdNode[] = [root]
    while (stack.length > 0) {
        const current = stack.pop()
        if (!current) break

        if (current.id === nodeId) return current

        if (current.type === 'sequence') {
            pushSequenceChildren(stack, current)
            continue
        }

        if (current.type === 'if') {
            pushIfBranches(stack, current)
            continue
        }

        if (current.type === 'case') {
            pushCaseBranches(stack, current)
            continue
        }

        if (current.type === 'loop') {
            pushLoopBody(stack, current)
        }
    }

    return null
}

function insertByTarget(anchorNodeId: string, target: SelectionTarget | null, ops: InsertOps) {
    if (target?.nodeId !== anchorNodeId) {
        ops.insertAfter(anchorNodeId)
        return
    }

    if (target?.kind === 'loopPart') {
        ops.prependToLoopBody(anchorNodeId)
        return
    }

    if (target?.kind === 'node') {
        ops.insertAfter(anchorNodeId)
        return
    }

    if (target?.kind === 'ifPart') {
        if (target.part === 'trueLabel') {
            ops.prependToIfBranch(anchorNodeId, 'true')
            return
        }

        if (target.part === 'falseLabel') {
            ops.prependToIfBranch(anchorNodeId, 'false')
            return
        }

        if (target.part === 'trueContainer') {
            ops.appendToIfBranchEnd(anchorNodeId, 'true')
            return
        }

        if (target.part === 'falseContainer') {
            ops.appendToIfBranchEnd(anchorNodeId, 'false')
            return
        }

        ops.insertAfter(anchorNodeId)
        return
    }

    if (target.part === 'header') {
        ops.insertAfter(anchorNodeId)
        return
    }

    if (target.part === 'branchLabel') {
        ops.prependToCaseBranch(anchorNodeId, target.branchIndex)
        return
    }

    ops.appendToCaseBranchEnd(anchorNodeId, target.branchIndex)
}

type EnterEditRequest =
    | Readonly<{ kind: 'caseBranchLabel'; nodeId: string; branchIndex: number; text: string }>
    | Readonly<{ kind: Exclude<EditingKind, 'caseBranchLabel'>; nodeId: string; text: string }>

function isCaseBranchLabelTarget(
    target: SelectionTarget,
): target is Readonly<{ kind: 'casePart'; nodeId: string; part: 'branchLabel'; branchIndex: number }> {
    return target.kind === 'casePart' && target.part === 'branchLabel'
}

function isIfConditionTarget(target: SelectionTarget): boolean {
    return target.kind === 'node' || (target.kind === 'ifPart' && target.part === 'header')
}

function isCaseConditionTarget(target: SelectionTarget): boolean {
    return target.kind === 'node' || (target.kind === 'casePart' && target.part === 'header')
}

/**
 * Enter 编辑目标拾取（降低 Cognitive Complexity 以满足 Sonar 规则）
 */
function pickEnterEditRequest(node: NsdNode, target: SelectionTarget): EnterEditRequest | null {
    if (isCaseBranchLabelTarget(target)) {
        if (node.type !== 'case') return null

        const labels =
            node.branchLabels.length === node.branches.length
                ? node.branchLabels
                : node.branches.map((_, i) => node.branchLabels[i] ?? String(i + 1))

        const text = labels[target.branchIndex] ?? String(target.branchIndex + 1)
        return { kind: 'caseBranchLabel', nodeId: node.id, branchIndex: target.branchIndex, text }
    }

    switch (node.type) {
        case 'process':
            return target.kind === 'node' ? { kind: 'process', nodeId: node.id, text: node.text } : null

        case 'if':
            return isIfConditionTarget(target) ? { kind: 'ifCondition', nodeId: node.id, text: node.conditionText } : null

        case 'case':
            return isCaseConditionTarget(target) ? { kind: 'caseCondition', nodeId: node.id, text: node.conditionText } : null

        case 'loop':
            return target.kind === 'node' ? { kind: 'loopCondition', nodeId: node.id, text: node.conditionText } : null

        default:
            return null
    }
}

export default function App() {
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
    const canvasWrapRef = useRef<HTMLDivElement>(null)

    const [canvasSize, setCanvasSize] = useState<Readonly<{ width: number; height: number }>>({ width: 1, height: 1 })
    const [wrapSize, setWrapSize] = useState<Readonly<{ width: number; height: number }>>({ width: 1, height: 1 })

    const [importNotice, setImportNotice] = useState<ImportNotice | null>(null)
    const importNoticeTimerRef = useRef<number | null>(null)

    const [dragActive, setDragActive] = useState(false)

    const showImportNotice = useCallback((notice: ImportNotice, timeoutMs = 2000) => {
        setImportNotice(notice)

        if (importNoticeTimerRef.current !== null) {
            globalThis.clearTimeout(importNoticeTimerRef.current)
            importNoticeTimerRef.current = null
        }

        importNoticeTimerRef.current = globalThis.setTimeout(() => {
            setImportNotice(null)
            importNoticeTimerRef.current = null
        }, Math.max(800, Math.floor(timeoutMs)))
    }, [])

    useEffect(() => {
        return () => {
            if (importNoticeTimerRef.current !== null) {
                globalThis.clearTimeout(importNoticeTimerRef.current)
                importNoticeTimerRef.current = null
            }
        }
    }, [])

    const onCanvasSizeChange = useCallback((next: Readonly<{ width: number; height: number }>) => {
        setCanvasSize((prev) => (prev.width === next.width && prev.height === next.height ? prev : next))
    }, [])

    useEffect(() => {
        const el = canvasWrapRef.current
        if (!el) return

        const ro = new ResizeObserver(() => {
            setWrapSize({
                width: Math.max(0, Math.floor(el.clientWidth)),
                height: Math.max(0, Math.floor(el.clientHeight)),
            })
        })

        ro.observe(el)
        setWrapSize({
            width: Math.max(0, Math.floor(el.clientWidth)),
            height: Math.max(0, Math.floor(el.clientHeight)),
        })

        return () => {
            ro.disconnect()
        }
    }, [])

    const viewportWidth = Math.max(wrapSize.width, canvasSize.width)
    const viewportHeight = Math.max(wrapSize.height, canvasSize.height)

    useEffect(() => {
        const el = canvasWrapRef.current
        if (!el) return
        if (wrapSize.width <= 0 || wrapSize.height <= 0) return

        const id = requestAnimationFrame(() => {
            const cw = Math.max(0, Math.floor(el.clientWidth))
            const ch = Math.max(0, Math.floor(el.clientHeight))
            if (cw <= 0 || ch <= 0) return

            const vw = Math.max(cw, viewportWidth)
            const vh = Math.max(ch, viewportHeight)

            el.scrollLeft = Math.max(0, Math.floor((vw - cw) / 2))
            el.scrollTop = Math.max(0, Math.floor((vh - ch) / 2))
        })

        return () => cancelAnimationFrame(id)
    }, [viewportHeight, viewportWidth, wrapSize.height, wrapSize.width])

    const selectedNode = useMemo(() => findNodeById(state.root, state.selectedNodeId), [state.root, state.selectedNodeId])

    // 关键：仅当 CASE header（条件框）选中时可“增加分支”
    const canAddCaseBranch =
        state.selectedTarget?.kind === 'casePart' && state.selectedTarget.part === 'header'

    const canDeleteSelected = useMemo(() => canDeleteByTarget(state.selectedTarget), [state.selectedTarget])

    const [editingNodeId, setEditingNodeId] = useState<string | null>(null)
    const [editingText, setEditingText] = useState('')
    const [editingKind, setEditingKind] = useState<EditingKind>('process')
    const [editingBranchIndex, setEditingBranchIndex] = useState<number | null>(null)
    const [editorTitle, setEditorTitle] = useState('编辑步骤内容')

    const closeEditor = useCallback(() => {
        setEditingNodeId(null)
        setEditingText('')
        setEditingBranchIndex(null)
    }, [])

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

    const performAddCaseBranch = useCallback(
        (caseId: string) => {
            closeEditor()
            addCaseBranch(caseId)
        },
        [addCaseBranch, closeEditor],
    )

    const importProjectInputRef = useRef<HTMLInputElement>(null)

    const onExportImage = useCallback(async () => {
        if (!svgRef.current) return

        try {
            const result = await saveDiagramImage(svgRef.current, 2)
            if (!result.saved) return

            const kindLabel = result.kind === 'svg' ? 'SVG' : 'PNG'
            const fileName = result.fileName ?? (result.kind === 'svg' ? 'nsd-box.svg' : 'nsd-box.png')

            showImportNotice({ kind: 'info', text: `已导出${kindLabel}：${fileName}` }, 1600)
        } catch {
            showImportNotice({ kind: 'error', text: '导出失败：无法写入图片文件。' }, 2600)
        }
    }, [showImportNotice])

    const onExportProject = useCallback(async () => {
        try {
            const result = await saveProjectFile(buildProjectFile(state))
            if (!result.saved) return

            const kindLabel = result.kind === 'txt' ? 'TXT' : 'JSON'
            const fileName = result.fileName ?? (result.kind === 'txt' ? 'nsd-project.txt' : 'nsd-project.json')

            showImportNotice({ kind: 'info', text: `已导出${kindLabel}：${fileName}` }, 1600)
        } catch {
            showImportNotice({ kind: 'error', text: '导出失败：无法写入工程文件。' }, 2600)
        }
    }, [showImportNotice, state])

    const applyImportedProjectText = useCallback(
        (text: string, fileName: string | null) => {
            const result = parseProjectJsonDetailed(text)
            if (!result.ok) {
                showImportNotice({ kind: 'error', text: result.message }, 3000)
                return
            }

            closeEditor()

            const first = result.root.children[0]
            const selectedNodeId = first ? first.id : null
            const selectedTarget = selectedNodeId ? ({ kind: 'node', nodeId: selectedNodeId } as const) : null

            replaceState({
                style: result.style,
                root: result.root,
                scale: result.scale,
                selectedNodeId,
                selectedTarget,
            })

            showImportNotice(
                { kind: 'info', text: fileName ? `导入成功：${fileName}` : '导入成功。' },
                1600,
            )
        },
        [closeEditor, replaceState, showImportNotice],
    )

    const onImportProject = useCallback(async () => {
        try {
            const result = await openProjectTextWithPicker()

            if (!result.supported) {
                importProjectInputRef.current?.click()
                return
            }

            if (!result.opened) return
            applyImportedProjectText(result.text, result.fileName)
        } catch {
            showImportNotice({ kind: 'error', text: '导入失败：无法读取文件内容。' }, 2600)
        }
    }, [applyImportedProjectText, showImportNotice])

    const onImportProjectChange = useCallback(
        async (event: ChangeEvent<HTMLInputElement>) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (!file) return

            let text = ''
            try {
                text = await file.text()
            } catch {
                showImportNotice({ kind: 'error', text: '导入失败：无法读取文件内容。' }, 2600)
                return
            }

            applyImportedProjectText(text, file.name)
        },
        [applyImportedProjectText, showImportNotice],
    )

    const onMoveByDragLocal = useCallback(
        (req: DragMoveRequest) => {
            closeEditor()
            moveByDrag(req)
        },
        [closeEditor, moveByDrag],
    )

    const openEditor = useCallback((nodeId: string, kind: Exclude<EditingKind, 'caseBranchLabel'>, text: string) => {
        setEditingNodeId(nodeId)
        setEditingKind(kind)
        setEditingText(text)
        setEditingBranchIndex(null)

        if (kind === 'process') {
            setEditorTitle('编辑步骤内容')
            return
        }

        if (kind === 'ifCondition') {
            setEditorTitle('编辑 IF 条件')
            return
        }

        if (kind === 'loopCondition') {
            setEditorTitle('编辑 LOOP 条件')
            return
        }

        setEditorTitle('编辑 CASE 条件')
    }, [])

    const openCaseBranchLabelEditor = useCallback((caseId: string, branchIndex: number, text: string) => {
        setEditingNodeId(caseId)
        setEditingKind('caseBranchLabel')
        setEditingText(text)
        setEditingBranchIndex(branchIndex)
        setEditorTitle('编辑 CASE 分支标签')
    }, [])

    const onInitialize = useCallback(() => {
        closeEditor()
        reset()
    }, [closeEditor, reset])

    function onProcessSelect(nodeId: string) {
        selectNode(nodeId)
        closeEditor()
    }

    function onProcessDoubleClick(nodeId: string) {
        selectNode(nodeId)

        const node = findNodeById(state.root, nodeId)
        if (node?.type !== 'process') return

        openEditor(nodeId, 'process', node.text)
    }

    function onIfHeaderSelect(nodeId: string) {
        selectTarget({ kind: 'ifPart', nodeId, part: 'header' })
        closeEditor()
    }

    function onIfHeaderDoubleClick(nodeId: string) {
        selectTarget({ kind: 'ifPart', nodeId, part: 'header' })

        const node = findNodeById(state.root, nodeId)
        if (node?.type !== 'if') return

        openEditor(nodeId, 'ifCondition', node.conditionText)
    }

    function onIfLabelDoubleClick(nodeId: string, part: 'trueLabel' | 'falseLabel') {
        selectTarget({ kind: 'ifPart', nodeId, part })
        closeEditor()

        const node = findNodeById(state.root, nodeId)
        if (node?.type !== 'if') return

        const nextMode = node.boolLabelMode === 'TF' ? 'YN' : 'TF'
        updateIfBoolLabelMode(nodeId, nextMode)
    }

    function onIfPartSelect(nodeId: string, part: IfPartKey) {
        selectTarget({ kind: 'ifPart', nodeId, part })
        closeEditor()
    }

    function onCaseHeaderSelect(nodeId: string) {
        selectTarget({ kind: 'casePart', nodeId, part: 'header' })
        closeEditor()
    }

    function onCaseHeaderDoubleClick(nodeId: string) {
        selectTarget({ kind: 'casePart', nodeId, part: 'header' })

        const node = findNodeById(state.root, nodeId)
        if (node?.type !== 'case') return

        openEditor(nodeId, 'caseCondition', node.conditionText)
    }

    function onCasePartSelect(nodeId: string, part: CasePartKey, branchIndex?: number) {
        if (part === 'header') {
            selectTarget({ kind: 'casePart', nodeId, part: 'header' })
            closeEditor()
            return
        }

        if (typeof branchIndex !== 'number') return

        selectTarget({ kind: 'casePart', nodeId, part, branchIndex })
        closeEditor()
    }

    const onCaseBranchLabelDoubleClick = useCallback(
        (nodeId: string, branchIndex: number) => {
            selectTarget({ kind: 'casePart', nodeId, part: 'branchLabel', branchIndex })

            const node = findNodeById(state.root, nodeId)
            if (node?.type !== 'case') return

            const labels =
                node.branchLabels.length === node.branches.length
                    ? node.branchLabels
                    : node.branches.map((_, i) => node.branchLabels[i] ?? String(i + 1))

            const text = labels[branchIndex] ?? String(branchIndex + 1)
            openCaseBranchLabelEditor(nodeId, branchIndex, text)
        },
        [openCaseBranchLabelEditor, selectTarget, state.root],
    )

    function onLoopSelect(nodeId: string) {
        selectNode(nodeId)
        closeEditor()
    }

    function onLoopHoleSelect(nodeId: string) {
        selectTarget({ kind: 'loopPart', nodeId, part: 'hole' })
        closeEditor()
    }

    function onLoopConditionDoubleClick(nodeId: string) {
        selectNode(nodeId)

        const node = findNodeById(state.root, nodeId)
        if (node?.type !== 'loop') return

        openEditor(nodeId, 'loopCondition', node.conditionText)
    }

    function onEditorConfirm(nextText: string) {
        if (!editingNodeId) return

        if (editingKind === 'process') {
            updateProcessText(editingNodeId, nextText)
            closeEditor()
            return
        }

        if (editingKind === 'ifCondition') {
            updateIfConditionText(editingNodeId, nextText)
            closeEditor()
            return
        }

        if (editingKind === 'caseCondition') {
            updateCaseConditionText(editingNodeId, nextText)
            closeEditor()
            return
        }

        if (editingKind === 'loopCondition') {
            updateLoopConditionText(editingNodeId, nextText)
            closeEditor()
            return
        }

        if (editingBranchIndex === null) return
        updateCaseBranchLabel(editingNodeId, editingBranchIndex, nextText)
        closeEditor()
    }

    function onCanvasBlankClick() {
        selectTarget(null)
        closeEditor()
    }

    function onInsertProcessAfter(nodeId: string) {
        insertByTarget(nodeId, state.selectedTarget, {
            insertAfter: addProcessAfter,
            prependToIfBranch: prependProcessInIfBranch,
            appendToIfBranchEnd: addProcessToIfBranchEnd,
            prependToCaseBranch: prependProcessInCaseBranch,
            appendToCaseBranchEnd: addProcessToCaseBranchEnd,
            prependToLoopBody: prependProcessInLoopBody,
        })
    }

    function onInsertIfAfter(nodeId: string) {
        insertByTarget(nodeId, state.selectedTarget, {
            insertAfter: addIfAfter,
            prependToIfBranch: prependIfInIfBranch,
            appendToIfBranchEnd: addIfToIfBranchEnd,
            prependToCaseBranch: prependIfInCaseBranch,
            appendToCaseBranchEnd: addIfToCaseBranchEnd,
            prependToLoopBody: prependIfInLoopBody,
        })
    }

    function onInsertCaseAfter(nodeId: string) {
        insertByTarget(nodeId, state.selectedTarget, {
            insertAfter: addCaseAfter,
            prependToIfBranch: prependCaseInIfBranch,
            appendToIfBranchEnd: addCaseToIfBranchEnd,
            prependToCaseBranch: prependCaseInCaseBranch,
            appendToCaseBranchEnd: addCaseToCaseBranchEnd,
            prependToLoopBody: prependCaseInLoopBody,
        })
    }

    function onInsertWhileAfter(nodeId: string) {
        insertByTarget(nodeId, state.selectedTarget, {
            insertAfter: addWhileAfter,
            prependToIfBranch: prependWhileInIfBranch,
            appendToIfBranchEnd: addWhileToIfBranchEnd,
            prependToCaseBranch: prependWhileInCaseBranch,
            appendToCaseBranchEnd: addWhileToCaseBranchEnd,
            prependToLoopBody: prependWhileInLoopBody,
        })
    }

    function onInsertDoWhileAfter(nodeId: string) {
        insertByTarget(nodeId, state.selectedTarget, {
            insertAfter: addDoWhileAfter,
            prependToIfBranch: prependDoWhileInIfBranch,
            appendToIfBranchEnd: addDoWhileToIfBranchEnd,
            prependToCaseBranch: prependDoWhileInCaseBranch,
            appendToCaseBranchEnd: addDoWhileToCaseBranchEnd,
            prependToLoopBody: prependDoWhileInLoopBody,
        })
    }

    function onMoveProcessUpLocal(nodeId: string) {
        closeEditor()
        moveProcessUp(nodeId)
    }

    function onMoveProcessDownLocal(nodeId: string) {
        closeEditor()
        moveProcessDown(nodeId)
    }

    function onDeleteProcessLocal(nodeId: string) {
        closeEditor()
        deleteProcess(nodeId)
    }

    const onAddCaseBranchLocal = useCallback(
        (caseId: string) => {
            performAddCaseBranch(caseId)
        },
        [performAddCaseBranch],
    )

    const deleteSelectedCaseBranch = useCallback(
        (node: Extract<NsdNode, { type: 'case' }>, branchIndex: number) => {
            if (node.branches.length > 2) {
                closeEditor()
                deleteCaseBranch(node.id, branchIndex)
                return
            }

            closeEditor()
            deleteProcess(node.id)
        },
        [closeEditor, deleteCaseBranch, deleteProcess],
    )

    const deleteSelectedNode = useCallback(
        (node: NsdNode) => {
            closeEditor()
            deleteProcess(node.id)
        },
        [closeEditor, deleteProcess],
    )

    const onDeleteSelected = useCallback(() => {
        if (!canDeleteSelected) return

        const target = state.selectedTarget
        const node = selectedNode
        if (!node || !target) return

        if (target.kind === 'loopPart') return

        if (target.kind === 'casePart' && target.part !== 'header') {
            if (node.type !== 'case') return
            deleteSelectedCaseBranch(node, target.branchIndex)
            return
        }

        deleteSelectedNode(node)
    }, [canDeleteSelected, deleteSelectedCaseBranch, deleteSelectedNode, selectedNode, state.selectedTarget])

    function onToolbarAddProcess() {
        const target = state.selectedTarget

        if (!target) {
            addProcessAfterEnd()
            return
        }

        if (target.kind === 'loopPart') {
            prependProcessInLoopBody(target.nodeId)
            return
        }

        if (target.kind === 'node') {
            addProcessAfter(target.nodeId)
            return
        }

        if (target.kind === 'ifPart') {
            if (target.part === 'trueLabel') {
                prependProcessInIfBranch(target.nodeId, 'true')
                return
            }

            if (target.part === 'falseLabel') {
                prependProcessInIfBranch(target.nodeId, 'false')
                return
            }

            if (target.part === 'trueContainer') {
                addProcessToIfBranchEnd(target.nodeId, 'true')
                return
            }

            if (target.part === 'falseContainer') {
                addProcessToIfBranchEnd(target.nodeId, 'false')
                return
            }

            addProcessAfter(target.nodeId)
            return
        }

        if (target.part === 'branchLabel') {
            prependProcessInCaseBranch(target.nodeId, target.branchIndex)
            return
        }

        if (target.part === 'branchContainer') {
            addProcessToCaseBranchEnd(target.nodeId, target.branchIndex)
            return
        }

        addProcessAfter(target.nodeId)
    }

    function onToolbarAddIf() {
        const target = state.selectedTarget

        if (!target) {
            addIfAfterEnd()
            return
        }

        if (target.kind === 'loopPart') {
            prependIfInLoopBody(target.nodeId)
            return
        }

        if (target.kind === 'node') {
            addIfAfter(target.nodeId)
            return
        }

        if (target.kind === 'ifPart') {
            if (target.part === 'trueLabel') {
                prependIfInIfBranch(target.nodeId, 'true')
                return
            }

            if (target.part === 'falseLabel') {
                prependIfInIfBranch(target.nodeId, 'false')
                return
            }

            if (target.part === 'trueContainer') {
                addIfToIfBranchEnd(target.nodeId, 'true')
                return
            }

            if (target.part === 'falseContainer') {
                addIfToIfBranchEnd(target.nodeId, 'false')
                return
            }

            addIfAfter(target.nodeId)
            return
        }

        if (target.part === 'branchLabel') {
            prependIfInCaseBranch(target.nodeId, target.branchIndex)
            return
        }

        if (target.part === 'branchContainer') {
            addIfToCaseBranchEnd(target.nodeId, target.branchIndex)
            return
        }

        addIfAfter(target.nodeId)
    }

    function onToolbarAddCase() {
        const target = state.selectedTarget

        if (!target) {
            addCaseAfterEnd()
            return
        }

        if (target.kind === 'loopPart') {
            prependCaseInLoopBody(target.nodeId)
            return
        }

        if (target.kind === 'node') {
            addCaseAfter(target.nodeId)
            return
        }

        if (target.kind === 'ifPart') {
            if (target.part === 'trueLabel') {
                prependCaseInIfBranch(target.nodeId, 'true')
                return
            }

            if (target.part === 'falseLabel') {
                prependCaseInIfBranch(target.nodeId, 'false')
                return
            }

            if (target.part === 'trueContainer') {
                addCaseToIfBranchEnd(target.nodeId, 'true')
                return
            }

            if (target.part === 'falseContainer') {
                addCaseToIfBranchEnd(target.nodeId, 'false')
                return
            }

            addCaseAfter(target.nodeId)
            return
        }

        if (target.part === 'branchLabel') {
            prependCaseInCaseBranch(target.nodeId, target.branchIndex)
            return
        }

        if (target.part === 'branchContainer') {
            addCaseToCaseBranchEnd(target.nodeId, target.branchIndex)
            return
        }

        addCaseAfter(target.nodeId)
    }

    function onToolbarAddWhile() {
        const target = state.selectedTarget

        if (!target) {
            addWhileAfterEnd()
            return
        }

        if (target.kind === 'loopPart') {
            prependWhileInLoopBody(target.nodeId)
            return
        }

        if (target.kind === 'node') {
            addWhileAfter(target.nodeId)
            return
        }

        if (target.kind === 'ifPart') {
            if (target.part === 'trueLabel') {
                prependWhileInIfBranch(target.nodeId, 'true')
                return
            }

            if (target.part === 'falseLabel') {
                prependWhileInIfBranch(target.nodeId, 'false')
                return
            }

            if (target.part === 'trueContainer') {
                addWhileToIfBranchEnd(target.nodeId, 'true')
                return
            }

            if (target.part === 'falseContainer') {
                addWhileToIfBranchEnd(target.nodeId, 'false')
                return
            }

            addWhileAfter(target.nodeId)
            return
        }

        if (target.part === 'branchLabel') {
            prependWhileInCaseBranch(target.nodeId, target.branchIndex)
            return
        }

        if (target.part === 'branchContainer') {
            addWhileToCaseBranchEnd(target.nodeId, target.branchIndex)
            return
        }

        addWhileAfter(target.nodeId)
    }

    function onToolbarAddDoWhile() {
        const target = state.selectedTarget

        if (!target) {
            addDoWhileAfterEnd()
            return
        }

        if (target.kind === 'loopPart') {
            prependDoWhileInLoopBody(target.nodeId)
            return
        }

        if (target.kind === 'node') {
            addDoWhileAfter(target.nodeId)
            return
        }

        if (target.kind === 'ifPart') {
            if (target.part === 'trueLabel') {
                prependDoWhileInIfBranch(target.nodeId, 'true')
                return
            }

            if (target.part === 'falseLabel') {
                prependDoWhileInIfBranch(target.nodeId, 'false')
                return
            }

            if (target.part === 'trueContainer') {
                addDoWhileToIfBranchEnd(target.nodeId, 'true')
                return
            }

            if (target.part === 'falseContainer') {
                addDoWhileToIfBranchEnd(target.nodeId, 'false')
                return
            }

            addDoWhileAfter(target.nodeId)
            return
        }

        if (target.part === 'branchLabel') {
            prependDoWhileInCaseBranch(target.nodeId, target.branchIndex)
            return
        }

        if (target.part === 'branchContainer') {
            addDoWhileToCaseBranchEnd(target.nodeId, target.branchIndex)
            return
        }

        addDoWhileAfter(target.nodeId)
    }

    // 关键：Toolbar “增加分支”也只认 CASE header 选中
    const onToolbarAddCaseBranch = useCallback(() => {
        const t = state.selectedTarget
        if (t?.kind !== 'casePart') return
        if (t.part !== 'header') return
        performAddCaseBranch(t.nodeId)
    }, [performAddCaseBranch, state.selectedTarget])

    const onKeyboardEnter = useCallback((): boolean => {
        const target = state.selectedTarget
        if (!target) return false

        const node = findNodeById(state.root, target.nodeId)
        if (!node) return false

        const req = pickEnterEditRequest(node, target)
        if (!req) return false

        if (req.kind === 'caseBranchLabel') {
            openCaseBranchLabelEditor(req.nodeId, req.branchIndex, req.text)
            return true
        }

        openEditor(req.nodeId, req.kind, req.text)
        return true
    }, [openCaseBranchLabelEditor, openEditor, state.root, state.selectedTarget])

    // 关键：Tab 仅在 CASE 条件框（header）选中时生效
    const onKeyboardTab = useCallback((): boolean => {
        const target = state.selectedTarget
        if (!target) return false

        if (target.kind !== 'casePart') return false
        if (target.part !== 'header') return false

        const node = findNodeById(state.root, target.nodeId)
        if (node?.type !== 'case') return false

        performAddCaseBranch(node.id)
        return true
    }, [performAddCaseBranch, state.root, state.selectedTarget])

    const onKeyboardDelete = useCallback((): boolean => {
        if (!canDeleteSelected) return false
        onDeleteSelected()
        return true
    }, [canDeleteSelected, onDeleteSelected])

    useEffect(() => {
        return installKeyboardShortcuts({
            onUndo: performUndo,
            onRedo: performRedo,
            onDelete: onKeyboardDelete,
            onEnter: onKeyboardEnter,
            onTab: onKeyboardTab,
            isEditing: () => editingNodeId !== null,
            isDragActive: () => dragActive,
        })
    }, [dragActive, editingNodeId, onKeyboardDelete, onKeyboardEnter, onKeyboardTab, performRedo, performUndo])

    const onScaleChange = useCallback(
        (event: ChangeEvent<HTMLInputElement>) => {
            const raw = Number(event.target.value)
            updateScale(raw)
        },
        [updateScale],
    )

    return (
        <div className="app">
            <div className="header">
                <Toolbar
                    canUndo={canUndo}
                    canRedo={canRedo}
                    onUndo={performUndo}
                    onRedo={performRedo}
                    onAddProcess={onToolbarAddProcess}
                    onAddIf={onToolbarAddIf}
                    onAddCase={onToolbarAddCase}
                    onAddWhile={onToolbarAddWhile}
                    onAddDoWhile={onToolbarAddDoWhile}
                    canAddCaseBranch={canAddCaseBranch}
                    onAddCaseBranch={onToolbarAddCaseBranch}
                    canDeleteSelected={canDeleteSelected}
                    onDeleteSelected={onDeleteSelected}
                    onInitialize={onInitialize}
                    onExportImage={onExportImage}
                    onExportProject={onExportProject}
                    onImportProject={onImportProject}
                />

                {importNotice ? (
                    <div className={importNotice.kind === 'error' ? 'importNotice importNotice--error' : 'importNotice'}>
                        {importNotice.text}
                    </div>
                ) : null}

                <input
                    ref={importProjectInputRef}
                    type="file"
                    accept=".json,.txt,application/json,text/plain"
                    style={{ display: 'none' }}
                    onChange={onImportProjectChange}
                />
            </div>

            <div className="sidebar">
                <div className="hint">
                    当前已支持：
                    <br />
                    1. 添加步骤 / IF / CASE / WHILE / DO-WHILE（工具栏按选中语义插入；无选中时末尾追加）
                    <br />
                    2. 单击选中节点（步骤 / IF / CASE / LOOP）
                    <br />
                    3. 双击步骤编辑文字；双击 LOOP 条件编辑文字
                    <br />
                    4. 双击 IF/CASE 头部编辑条件；双击 CASE 分支标签编辑分支标签；双击 IF 的 T/F 切换为 Y/N
                    <br />
                    5. LOOP：点击 L 本体=同级操作；点击 L 内部空洞=块内操作（空洞选中不可删除）
                    <br />
                    6. 导出 PNG/SVG、导出 JSON/TXT、导入 JSON/TXT（JSON/TXT 均为工程文件内容）
                    <br />
                    7. 选中节点时显示悬浮按钮：+（插入菜单） / ×（删除）
                    <br />
                    8. IF 标签区可选中；CASE 分支标签可选中（Delete=删分支）；空容器选中不可删除
                    <br />
                    9. 撤销/重做：Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y
                    <br />
                    10. 删除：Delete（空洞/空容器选中时无效）
                </div>

                <div className="field" style={{ marginTop: 12 }}>
                    <div className="label">盒图大小倍率</div>
                    <div className="sliderRow">
                        <input type="range" min={0.5} max={2} step={0.1} value={state.scale} onChange={onScaleChange} />
                        <div className="value">{state.scale.toFixed(1)}</div>
                    </div>
                </div>
            </div>

            <div className="canvasWrap" ref={canvasWrapRef}>
                <div
                    className="canvasViewport"
                    style={{
                        position: 'relative',
                        width: viewportWidth,
                        height: viewportHeight,
                    }}
                >
                    <CanvasView
                        state={state}
                        svgRef={svgRef}
                        onCanvasSize={onCanvasSizeChange}
                        onDragStateChange={setDragActive}
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
                        onCanvasBlankClick={onCanvasBlankClick}
                        onInsertProcessAfter={onInsertProcessAfter}
                        onInsertIfAfter={onInsertIfAfter}
                        onInsertCaseAfter={onInsertCaseAfter}
                        onInsertWhileAfter={onInsertWhileAfter}
                        onInsertDoWhileAfter={onInsertDoWhileAfter}
                        onMoveProcessUp={onMoveProcessUpLocal}
                        onMoveProcessDown={onMoveProcessDownLocal}
                        onDeleteProcess={onDeleteProcessLocal}
                        onDeleteSelected={onDeleteSelected}
                        onAddCaseBranch={onAddCaseBranchLocal}
                        onMoveByDrag={onMoveByDragLocal}
                    />
                </div>

                <FloatingTextEditor visible={editingNodeId !== null} value={editingText} title={editorTitle} onConfirm={onEditorConfirm} onCancel={closeEditor} />
            </div>
        </div>
    )
}