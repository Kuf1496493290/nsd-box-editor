type ToolbarProps = Readonly<{
    canUndo: boolean
    canRedo: boolean
    onUndo: () => void
    onRedo: () => void

    onInsertProcess: () => void
    onInsertIf: () => void
    onInsertCase: () => void
    onInsertWhile: () => void
    onInsertDoWhile: () => void

    canAddCaseBranch: boolean
    onAddCaseBranch: () => void

    canDeleteSelected: boolean
    onDeleteSelected: () => void

    onInitialize: () => void

    onExportImage: () => void
    onExportProject: () => void
    onImportProject: () => void
}>

export function Toolbar(props: ToolbarProps) {
    return (
        <>
            <div className="title">NSD 盒图编辑器</div>

            <button className="button" onClick={props.onUndo} disabled={!props.canUndo}>
                撤销
            </button>
            <button className="button" onClick={props.onRedo} disabled={!props.canRedo}>
                重做
            </button>

            <button className="button" onClick={props.onInsertProcess}>
                添加步骤
            </button>
            <button className="button" onClick={props.onInsertIf}>
                添加 IF
            </button>
            <button className="button" onClick={props.onInsertCase}>
                添加 CASE
            </button>
            <button className="button" onClick={props.onAddCaseBranch} disabled={!props.canAddCaseBranch}>
                增加分支
            </button>
            <button className="button" onClick={props.onInsertWhile}>
                添加 WHILE
            </button>
            <button className="button" onClick={props.onInsertDoWhile}>
                添加 DO-WHILE
            </button>

            <button className="button" onClick={props.onDeleteSelected} disabled={!props.canDeleteSelected}>
                删除选中
            </button>

            <button className="button" onClick={props.onInitialize}>
                初始化
            </button>

            <button className="button" onClick={props.onExportImage}>
                导出 PNG/SVG
            </button>
            <button className="button" onClick={props.onExportProject}>
                导出 JSON/TXT
            </button>
            <button className="button" onClick={props.onImportProject}>
                导入 JSON/TXT
            </button>
        </>
    )
}
