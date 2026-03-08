import { useCallback, useEffect, useRef, useState, type ChangeEvent, type RefObject } from 'react'
import { openProjectTextWithPicker, saveDiagramImage, saveProjectFile } from '../utils/download'
import { buildProjectFile, parseProjectJsonDetailed } from '../utils/projectJson'
import type { AppState } from './types'
import type { EditingKind } from './appControllerHelpers'

// 导入提示默认自动隐藏时长。
const DEFAULT_NOTICE_TIMEOUT_MS = 2000
// 导入提示最小自动隐藏时长。
const MIN_NOTICE_TIMEOUT_MS = 800
// 常规导入导出成功提示时长。
const DEFAULT_SUCCESS_NOTICE_TIMEOUT_MS = 1600
// I/O 失败错误提示时长。
const DEFAULT_ERROR_NOTICE_TIMEOUT_MS = 2600
// 解析/校验失败错误提示时长。
const IMPORT_PARSE_ERROR_TIMEOUT_MS = 3000
// PNG 导出缩放倍数。
const IMAGE_EXPORT_SCALE = 2
// 首次布局前的初始视口占位尺寸。
const INITIAL_VIEWPORT_SIZE = { width: 1, height: 1 } as const

export type ImportNotice = Readonly<{ kind: 'info' | 'error'; text: string }>

/**
 * 管理导入导出提示，并自动在超时后清除。
 */
export function useImportNotice() {
    const [importNotice, setImportNotice] = useState<ImportNotice | null>(null)
    const importNoticeTimerRef = useRef<number | null>(null)

    const showImportNotice = useCallback((notice: ImportNotice, timeoutMs = DEFAULT_NOTICE_TIMEOUT_MS) => {
        setImportNotice(notice)

        if (importNoticeTimerRef.current !== null) {
            globalThis.clearTimeout(importNoticeTimerRef.current)
            importNoticeTimerRef.current = null
        }

        importNoticeTimerRef.current = globalThis.setTimeout(() => {
            setImportNotice(null)
            importNoticeTimerRef.current = null
        }, Math.max(MIN_NOTICE_TIMEOUT_MS, Math.floor(timeoutMs)))
    }, [])

    useEffect(() => {
        return () => {
            if (importNoticeTimerRef.current !== null) {
                globalThis.clearTimeout(importNoticeTimerRef.current)
                importNoticeTimerRef.current = null
            }
        }
    }, [])

    return {
        importNotice,
        showImportNotice,
    }
}

/**
 * 维护画布与容器尺寸，并在尺寸变化时保持视口居中。
 */
export function useCanvasViewport() {
    const canvasWrapRef = useRef<HTMLDivElement>(null)

    const [canvasSize, setCanvasSize] = useState<Readonly<{ width: number; height: number }>>(INITIAL_VIEWPORT_SIZE)
    const [wrapSize, setWrapSize] = useState<Readonly<{ width: number; height: number }>>(INITIAL_VIEWPORT_SIZE)

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

    return {
        canvasWrapRef,
        viewportWidth,
        viewportHeight,
        onCanvasSizeChange,
    }
}

/**
 * 维护文本编辑器状态，并提供统一的打开/关闭入口。
 */
export function useTextEditorState() {
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

    return {
        editingNodeId,
        editingText,
        editingKind,
        editingBranchIndex,
        editorTitle,
        closeEditor,
        openEditor,
        openCaseBranchLabelEditor,
    }
}

/**
 * 封装工程与图片的导入导出流程，并统一反馈提示文案。
 */
export function useProjectIo(params: Readonly<{
    state: AppState
    svgRef: RefObject<SVGSVGElement | null>
    closeEditor: () => void
    replaceState: (next: AppState) => void
    showImportNotice: (notice: ImportNotice, timeoutMs?: number) => void
}>) {
    const { state, svgRef, closeEditor, replaceState, showImportNotice } = params

    const importProjectInputRef = useRef<HTMLInputElement>(null)

    const onExportImage = useCallback(async () => {
        if (!svgRef.current) return

        try {
            const result = await saveDiagramImage(svgRef.current, IMAGE_EXPORT_SCALE)
            if (!result.saved) return

            const kindLabel = result.kind === 'svg' ? 'SVG' : 'PNG'
            const fileName = result.fileName ?? (result.kind === 'svg' ? 'nsd-box.svg' : 'nsd-box.png')
            showImportNotice({ kind: 'info', text: `已导出${kindLabel}：${fileName}` }, DEFAULT_SUCCESS_NOTICE_TIMEOUT_MS)
        } catch {
            showImportNotice({ kind: 'error', text: '导出失败：无法写入图片文件。' }, DEFAULT_ERROR_NOTICE_TIMEOUT_MS)
        }
    }, [showImportNotice, svgRef])

    const onExportProject = useCallback(async () => {
        try {
            const result = await saveProjectFile(buildProjectFile(state))
            if (!result.saved) return

            const kindLabel = result.kind === 'txt' ? 'TXT' : 'JSON'
            const fileName = result.fileName ?? (result.kind === 'txt' ? 'nsd-project.txt' : 'nsd-project.json')
            showImportNotice({ kind: 'info', text: `已导出${kindLabel}：${fileName}` }, DEFAULT_SUCCESS_NOTICE_TIMEOUT_MS)
        } catch {
            showImportNotice({ kind: 'error', text: '导出失败：无法写入工程文件。' }, DEFAULT_ERROR_NOTICE_TIMEOUT_MS)
        }
    }, [showImportNotice, state])

    const applyImportedProjectText = useCallback((text: string, fileName: string | null) => {
        const result = parseProjectJsonDetailed(text)
        if (!result.ok) {
            showImportNotice({ kind: 'error', text: result.message }, IMPORT_PARSE_ERROR_TIMEOUT_MS)
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
            DEFAULT_SUCCESS_NOTICE_TIMEOUT_MS,
        )
    }, [closeEditor, replaceState, showImportNotice])

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
            showImportNotice({ kind: 'error', text: '导入失败：无法读取文件内容。' }, DEFAULT_ERROR_NOTICE_TIMEOUT_MS)
        }
    }, [applyImportedProjectText, showImportNotice])

    const onImportProjectChange = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]
        event.target.value = ''
        if (!file) return

        let text = ''
        try {
            text = await file.text()
        } catch {
            showImportNotice({ kind: 'error', text: '导入失败：无法读取文件内容。' }, DEFAULT_ERROR_NOTICE_TIMEOUT_MS)
            return
        }

        applyImportedProjectText(text, file.name)
    }, [applyImportedProjectText, showImportNotice])

    return {
        importProjectInputRef,
        onExportImage,
        onExportProject,
        onImportProject,
        onImportProjectChange,
    }
}