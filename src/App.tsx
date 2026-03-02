// FILE: src/App.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CasePartKey, IfPartKey, NsdNode, SelectionTarget, SequenceNode } from './app/types'
import { useAppState } from './app/state'
import { Toolbar } from './components/Toolbar'
import { CanvasView } from './components/CanvasView'
import { PropertyPanel } from './components/PropertyPanel'
import { FloatingTextEditor } from './components/FloatingTextEditor'
import { downloadPng, downloadSvg } from './utils/download'
import { installKeyboardShortcuts } from './features/keyboard'

type EditingKind = 'process' | 'ifCondition' | 'caseCondition' | 'loopCondition' | 'caseBranchLabel'

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

function canDeleteByTarget(target: SelectionTarget | null): boolean {
    if (!target) return false
    if (target.kind === 'node') return true

    if (target.kind === 'ifPart') {
        return target.part !== 'trueContainer' && target.part !== 'falseContainer'
    }

    if (target.kind === 'casePart') {
        return target.part !== 'branchContainer'
    }

    return false
}

export default function App() {
    const {
        state,
        reset,
        updateStyle,

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

    const selectedNode = useMemo(
        () => findNodeById(state.root, state.selectedNodeId),
        [state.root, state.selectedNodeId],
    )

    const canAddCaseBranch = selectedNode?.type === 'case'
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

    function onExportSvg() {
        if (!svgRef.current) return
        downloadSvg(svgRef.current, 'nsd-box.svg')
    }

    async function onExportPng() {
        if (!svgRef.current) return
        await downloadPng(svgRef.current, 'nsd-box.png', 2)
    }

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
        addProcessAfter(nodeId)
    }

    function onInsertIfAfter(nodeId: string) {
        addIfAfter(nodeId)
    }

    function onInsertCaseAfter(nodeId: string) {
        addCaseAfter(nodeId)
    }

    function onInsertWhileAfter(nodeId: string) {
        addWhileAfter(nodeId)
    }

    function onInsertDoWhileAfter(nodeId: string) {
        addDoWhileAfter(nodeId)
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

    const deleteSelectedCaseBranch = useCallback(
        (node: Extract<NsdNode, { type: 'case' }>, branchIndex: number) => {
            if (node.branches.length > 2) {
                closeEditor()
                deleteCaseBranch(node.id, branchIndex)
                return
            }

            // 分支数 <= 2：删除分支会级联删除整个 CASE（无需提示，可撤销）
            closeEditor()
            deleteProcess(node.id)
        },
        [closeEditor, deleteCaseBranch, deleteProcess],
    )

    const deleteSelectedNode = useCallback(
        (node: NsdNode) => {
            // 有 Undo/Redo：不弹任何确认/提示
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

    function onToolbarAddCaseBranch() {
        if (!canAddCaseBranch) return
        addCaseBranch(selectedNode.id)
    }

    function onToolbarUndo() {
        if (!canUndo) return
        closeEditor()
        undo()
    }

    function onToolbarRedo() {
        if (!canRedo) return
        closeEditor()
        redo()
    }

    useEffect(() => {
        return installKeyboardShortcuts({
            onUndo: () => {
                if (!canUndo) return
                closeEditor()
                undo()
            },
            onRedo: () => {
                if (!canRedo) return
                closeEditor()
                redo()
            },
            onDelete: () => {
                onDeleteSelected()
            },
            isEditing: () => editingNodeId !== null,
        })
    }, [canRedo, canUndo, closeEditor, editingNodeId, onDeleteSelected, redo, undo])

    return (
        <div className="app">
            <div className="header">
                <Toolbar
                    canUndo={canUndo}
                    canRedo={canRedo}
                    onUndo={onToolbarUndo}
                    onRedo={onToolbarRedo}
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
                    onExportSvg={onExportSvg}
                    onExportPng={onExportPng}
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
                    6. 导出 SVG / PNG
                    <br />
                    7. 选中节点时显示“+”插入菜单（可插入步骤/IF/CASE/WHILE/DO-WHILE）
                    <br />
                    8. 选中步骤后：上移 / 下移 / 删除
                    <br />
                    9. IF 标签区可选中；CASE 分支标签可选中（Delete=删分支）；空容器选中不可删除
                    <br />
                    10. 撤销/重做：Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y
                    <br />
                    11. 删除：Delete（空洞/空容器选中时无效）
                </div>
            </div>

            <div className="canvasWrap">
                <CanvasView
                    state={state}
                    svgRef={svgRef}
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
                />

                <FloatingTextEditor
                    visible={editingNodeId !== null}
                    value={editingText}
                    title={editorTitle}
                    onConfirm={onEditorConfirm}
                    onCancel={closeEditor}
                />
            </div>

            <div className="panel">
                <PropertyPanel
                    style={state.style}
                    selectedNode={selectedNode}
                    onChange={updateStyle}
                    onChangeIfBoolLabelMode={(mode) => {
                        const n = selectedNode
                        if (n?.type !== 'if') return
                        updateIfBoolLabelMode(n.id, mode)
                    }}
                />
            </div>
        </div>
    )
}