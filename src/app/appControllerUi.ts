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
 * 维护画布与容器尺寸；提供显式的视角回正与「定位到指定节点」入口，
 * 不再在尺寸变化时自动居中——避免新增/删除/编辑触发布局后视角被强制拉回。
 */
export function useCanvasViewport(svgRef?: RefObject<SVGSVGElement | null>) {
    const canvasWrapRef = useRef<HTMLDivElement>(null)

    const [canvasSize, setCanvasSize] = useState<Readonly<{ width: number; height: number }>>(INITIAL_VIEWPORT_SIZE)
    const [wrapSize, setWrapSize] = useState<Readonly<{ width: number; height: number }>>(INITIAL_VIEWPORT_SIZE)

    const onCanvasSizeChange = useCallback((next: Readonly<{ width: number; height: number }>) => {
        setCanvasSize((prev) => (prev.width === next.width && prev.height === next.height ? prev : next))
    }, [])

    useEffect(() => {
        const el = canvasWrapRef.current
        if (!el) return

        // 视口占位层位于容器 padding 之内，必须按内容盒（扣除 padding）测量，
        // 否则占位层恒大于可视区，滚动条会常驻。
        const measure = () => {
            const cs = globalThis.getComputedStyle(el)
            const padX = (Number.parseFloat(cs.paddingLeft) || 0) + (Number.parseFloat(cs.paddingRight) || 0)
            const padY = (Number.parseFloat(cs.paddingTop) || 0) + (Number.parseFloat(cs.paddingBottom) || 0)
            setWrapSize({
                width: Math.max(0, Math.floor(el.clientWidth - padX)),
                height: Math.max(0, Math.floor(el.clientHeight - padY)),
            })
        }

        const ro = new ResizeObserver(measure)
        ro.observe(el)
        measure()

        return () => {
            ro.disconnect()
        }
    }, [])

    const viewportWidth = Math.max(wrapSize.width, canvasSize.width)
    const viewportHeight = Math.max(wrapSize.height, canvasSize.height)

    const recenterViewport = useCallback(() => {
        const el = canvasWrapRef.current
        if (!el) return

        const tryCenter = () => {
            const cw = Math.max(0, Math.floor(el.clientWidth))
            const ch = Math.max(0, Math.floor(el.clientHeight))
            if (cw <= 0 || ch <= 0) return false

            const vw = Math.max(cw, el.scrollWidth)
            const vh = Math.max(ch, el.scrollHeight)
            el.scrollLeft = Math.max(0, Math.floor((vw - cw) / 2))
            el.scrollTop = Math.max(0, Math.floor((vh - ch) / 2))
            return true
        }

        // 立即尝试一次；若布局尚未就绪，再等一帧重试。
        if (!tryCenter()) {
            requestAnimationFrame(() => {
                tryCenter()
            })
        }
    }, [])

    const centerViewportOnNode = useCallback((nodeId: string | null) => {
        if (!nodeId) return
        const wrap = canvasWrapRef.current
        const svg = svgRef?.current
        if (!wrap || !svg) return

        const run = () => {
            const el = svg.querySelector<SVGGElement>(`[data-drag-node-id="${nodeId}"]`)
            if (!el) return false

            const rect = el.getBoundingClientRect()
            const wrapRect = wrap.getBoundingClientRect()
            const cx = rect.left + rect.width / 2 - wrapRect.left + wrap.scrollLeft
            const cy = rect.top + rect.height / 2 - wrapRect.top + wrap.scrollTop

            wrap.scrollLeft = Math.max(0, Math.floor(cx - wrap.clientWidth / 2))
            wrap.scrollTop = Math.max(0, Math.floor(cy - wrap.clientHeight / 2))
            return true
        }

        if (!run()) {
            requestAnimationFrame(() => {
                run()
            })
        }
    }, [svgRef])

    // 首次画布尺寸就绪时，做一次默认居中（之后再不自动回正）。
    const hasInitialCenteredRef = useRef(false)
    useEffect(() => {
        if (hasInitialCenteredRef.current) return
        if (wrapSize.width <= 0 || wrapSize.height <= 0) return
        if (canvasSize.width <= 1 || canvasSize.height <= 1) return
        hasInitialCenteredRef.current = true
        recenterViewport()
    }, [canvasSize.height, canvasSize.width, recenterViewport, wrapSize.height, wrapSize.width])

    return {
        canvasWrapRef,
        viewportWidth,
        viewportHeight,
        onCanvasSizeChange,
        recenterViewport,
        centerViewportOnNode,
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