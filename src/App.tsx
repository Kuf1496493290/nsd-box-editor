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
        onHeightRelaxChange,
        onWidthRelaxChange,
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
                <div className="field">
                    <div className="label">盒图大小倍率</div>
                    <div className="sliderRow">
                        <input type="range" min={0.5} max={2} step={0.1} value={state.scale} onChange={onScaleChange} />
                        <div className="value">{state.scale.toFixed(1)}</div>
                    </div>
                </div>

                <div className="field" style={{ marginTop: 8 }}>
                    <div className="label">纵向松弛</div>
                    <div className="sliderRow">
                        <input type="range" min={0} max={1} step={0.1} value={state.style.heightRelax} onChange={onHeightRelaxChange} />
                        <div className="value">{state.style.heightRelax.toFixed(1)}</div>
                    </div>
                </div>

                <div className="field" style={{ marginTop: 8 }}>
                    <div className="label">横向松弛</div>
                    <div className="sliderRow">
                        <input type="range" min={0} max={1} step={0.1} value={state.style.widthRelax} onChange={onWidthRelaxChange} />
                        <div className="value">{state.style.widthRelax.toFixed(1)}</div>
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
