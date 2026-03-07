// FILE: src/App.tsx
import { Toolbar } from './components/Toolbar'
import { CanvasView } from './components/CanvasView'
import { FloatingTextEditor } from './components/FloatingTextEditor'
import { useAppController } from './app/appController'

export default function App() {
    const {
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
        onMoveByDrag,
        onToolbarAddProcess,
        onToolbarAddIf,
        onToolbarAddCase,
        onToolbarAddWhile,
        onToolbarAddDoWhile,
        onToolbarAddCaseBranch,
        onEditorConfirm,
        closeEditor,
    } = useAppController()

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
                    8. IF 标签区可选中（Delete=删整个 IF）；CASE 分支标签可选中（Delete=删当前分支及其内容；增加分支=在当前右侧插入）；空容器选中不可删除
                    <br />
                    9. 撤销/重做：Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y
                    <br />
                    10. 删除：Delete（空洞/空容器选中时无效）
                    <br />
                    11. CASE 增加分支：选中条件框时末尾追加；选中分支标签时在当前右侧插入；新增后自动选中新分支
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
                        onMoveProcessUp={onMoveProcessUp}
                        onMoveProcessDown={onMoveProcessDown}
                        onDeleteProcess={onDeleteProcess}
                        onDeleteSelected={onDeleteSelected}
                        onAddCaseBranch={onAddCaseBranch}
                        onMoveByDrag={onMoveByDrag}
                    />
                </div>

                <FloatingTextEditor visible={editingNodeId !== null} value={editingText} title={editorTitle} onConfirm={onEditorConfirm} onCancel={closeEditor} />
            </div>
        </div>
    )
}