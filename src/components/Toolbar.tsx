import type { MouseEvent, ReactNode } from 'react'

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

function blurOnMouseDown(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault()
}

function ToolbarButton(props: Readonly<{
    onClick: () => void
    disabled?: boolean
    children: ReactNode
}>) {
    return (
        <button
            type="button"
            className="button"
            disabled={props.disabled}
            onMouseDown={blurOnMouseDown}
            onClick={props.onClick}
        >
            {props.children}
        </button>
    )
}

export function Toolbar(props: ToolbarProps) {
    return (
        <>
            <div className="title">NSD 盒图编辑器</div>

            <ToolbarButton onClick={props.onUndo} disabled={!props.canUndo}>
                撤销
            </ToolbarButton>
            <ToolbarButton onClick={props.onRedo} disabled={!props.canRedo}>
                重做
            </ToolbarButton>

            <ToolbarButton onClick={props.onInsertProcess}>
                添加步骤
            </ToolbarButton>
            <ToolbarButton onClick={props.onInsertIf}>
                添加 IF
            </ToolbarButton>
            <ToolbarButton onClick={props.onInsertCase}>
                添加 CASE
            </ToolbarButton>
            <ToolbarButton onClick={props.onAddCaseBranch} disabled={!props.canAddCaseBranch}>
                增加分支
            </ToolbarButton>
            <ToolbarButton onClick={props.onInsertWhile}>
                添加 WHILE
            </ToolbarButton>
            <ToolbarButton onClick={props.onInsertDoWhile}>
                添加 DO-WHILE
            </ToolbarButton>

            <ToolbarButton onClick={props.onDeleteSelected} disabled={!props.canDeleteSelected}>
                删除选中
            </ToolbarButton>

            <ToolbarButton onClick={props.onInitialize}>
                初始化
            </ToolbarButton>

            <ToolbarButton onClick={props.onExportImage}>
                导出 PNG/SVG
            </ToolbarButton>
            <ToolbarButton onClick={props.onExportProject}>
                导出 JSON/TXT
            </ToolbarButton>
            <ToolbarButton onClick={props.onImportProject}>
                导入 JSON/TXT
            </ToolbarButton>
        </>
    )
}
