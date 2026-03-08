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
        onInsertProcessAtSelection,
        onInsertIfAtSelection,
        onInsertCaseAtSelection,
        onInsertWhileAtSelection,
        onInsertDoWhileAtSelection,
        onDeleteSelected,
        onAddCaseBranch,
        onMoveByDrag,
        onToolbarInsertProcess,
        onToolbarInsertIf,
        onToolbarInsertCase,
        onToolbarInsertWhile,
        onToolbarInsertDoWhile,
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
                    onInsertProcess={onToolbarInsertProcess}
                    onInsertIf={onToolbarInsertIf}
                    onInsertCase={onToolbarInsertCase}
                    onInsertWhile={onToolbarInsertWhile}
                    onInsertDoWhile={onToolbarInsertDoWhile}
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
                    1. 添加步骤 / IF / CASE / WHILE / DO-WHILE（工具栏与悬浮 + 都按当前选中语义插入；无选中时追加到根末尾）
                    <br />
                    2. 单击可选中：步骤、IF 整体 / 标签 / 空分支容器、CASE 整体 / 分支标签 / 空分支容器、LOOP 整体 / 空洞
                    <br />
                    3. 双击可编辑：步骤文本、IF 条件、CASE 条件、CASE 分支标签、LOOP 条件
                    <br />
                    4. 双击 IF 的 T/F 可切换为 Y/N；再次双击可切回；切换后仍保持选中当前标签
                    <br />
                    5. 删除：Delete 或悬浮 ×；IF 标签=删整个 IF；CASE 分支标签=删当前分支（仅剩 2 个分支时删整个 CASE）；空容器与 LOOP 空洞不可删
                    <br />
                    6. CASE 增加分支：选中条件框时末尾追加；选中分支标签时插入到当前右侧；新增后自动选中新分支
                    <br />
                    7. 拖拽：普通节点可在同一 owner 范围内插入式重排；IF 左右结果列仅可通过 T/F 或 Y/N 标签节点拖拽交换；CASE 分支结果列仅可通过分支标签节点拖拽横向重排；拖拽后自动修正选中
                    <br />
                    8. 快捷键：Undo=Ctrl+Z，Redo=Ctrl+Shift+Z / Ctrl+Y，Delete=删除当前选中
                    <br />
                    9. Enter：对当前可编辑目标进入编辑；Tab：当 CASE 条件框或分支标签被选中时增加分支
                    <br />
                    10. 导出 PNG/SVG、导出 JSON/TXT、导入 JSON/TXT（导入后恢复 root / style / scale）
                    <br />
                    11. 左侧滑块可调盒图大小倍率 0.5 ~ 2.0；画布居中显示，并为悬浮菜单预留安全边距
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
                        onInsertProcessAtSelection={onInsertProcessAtSelection}
                        onInsertIfAtSelection={onInsertIfAtSelection}
                        onInsertCaseAtSelection={onInsertCaseAtSelection}
                        onInsertWhileAtSelection={onInsertWhileAtSelection}
                        onInsertDoWhileAtSelection={onInsertDoWhileAtSelection}
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