// FILE: src/components/Toolbar.tsx
type ToolbarProps = Readonly<{
    canUndo: boolean
    canRedo: boolean
    onUndo: () => void
    onRedo: () => void

    onAddProcess: () => void
    onAddIf: () => void
    onAddCase: () => void
    onAddWhile: () => void
    onAddDoWhile: () => void

    canAddCaseBranch: boolean
    onAddCaseBranch: () => void

    canDeleteSelected: boolean
    onDeleteSelected: () => void

    onInitialize: () => void
    onExportSvg: () => void
    onExportPng: () => void
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

            <button className="button" onClick={props.onAddProcess}>
                添加步骤
            </button>
            <button className="button" onClick={props.onAddIf}>
                添加 IF
            </button>
            <button className="button" onClick={props.onAddCase}>
                添加 CASE
            </button>
            <button className="button" onClick={props.onAddWhile}>
                添加 WHILE
            </button>
            <button className="button" onClick={props.onAddDoWhile}>
                添加 DO-WHILE
            </button>

            <button className="button" onClick={props.onAddCaseBranch} disabled={!props.canAddCaseBranch}>
                增加分支
            </button>

            <button className="button" onClick={props.onDeleteSelected} disabled={!props.canDeleteSelected}>
                删除选中
            </button>

            <button className="button" onClick={props.onInitialize}>
                初始化
            </button>

            <button className="button" onClick={props.onExportSvg}>
                导出 SVG
            </button>
            <button className="button" onClick={props.onExportPng}>
                导出 PNG
            </button>
        </>
    )
}