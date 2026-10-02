type PickerAcceptType = Readonly<{
    description?: string
    accept: Record<string, string[]>
}>

type SavePickerOptions = Readonly<{
    suggestedName?: string
    types?: readonly PickerAcceptType[]
    excludeAcceptAllOption?: boolean
}>

type OpenPickerOptions = Readonly<{
    multiple?: boolean
    types?: readonly PickerAcceptType[]
    excludeAcceptAllOption?: boolean
}>

type PickerWritable = Readonly<{
    write: (data: Blob | string) => Promise<void>
    close: () => Promise<void>
}>

type PickerSaveHandle = Readonly<{
    name?: string
    createWritable: () => Promise<PickerWritable>
}>

type PickerOpenHandle = Readonly<{
    getFile: () => Promise<File>
}>

type PickerApi = Readonly<{
    showSaveFilePicker?: (options?: SavePickerOptions) => Promise<PickerSaveHandle>
    showOpenFilePicker?: (options?: OpenPickerOptions) => Promise<PickerOpenHandle[]>
}>

export type SaveDiagramImageResult = Readonly<{
    saved: boolean
    kind: 'png' | 'svg' | null
    fileName: string | null
}>

export type SaveProjectFileResult = Readonly<{
    saved: boolean
    kind: 'json' | 'txt' | null
    fileName: string | null
}>

export type OpenProjectTextResult = Readonly<{
    supported: boolean
    opened: boolean
    text: string
    fileName: string | null
}>

const IMAGE_SAVE_TYPES: readonly PickerAcceptType[] = [
    {
        description: 'PNG 图片',
        accept: {
            'image/png': ['.png'],
        },
    },
    {
        description: 'SVG 矢量图',
        accept: {
            'image/svg+xml': ['.svg'],
        },
    },
]

const PROJECT_FILE_TYPES: readonly PickerAcceptType[] = [
    {
        description: 'JSON 工程文件',
        accept: {
            'application/json': ['.json'],
        },
    },
    {
        description: 'TXT 文本文件',
        accept: {
            'text/plain': ['.txt'],
        },
    },
]

const IMAGE_EXPORT_MARGIN = 100

function getPickerApi(): PickerApi {
    return globalThis as unknown as PickerApi
}

function isAbortError(error: unknown): boolean {
    if (error instanceof DOMException) {
        return error.name === 'AbortError'
    }

    if (typeof error !== 'object' || error === null) {
        return false
    }

    const maybeError = error as { name?: unknown }
    return maybeError.name === 'AbortError'
}

function ensureSvgNamespaces(svgText: string): string {
    let next = svgText

    if (!next.includes('xmlns="http://www.w3.org/2000/svg"')) {
        next = next.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"')
    }

    if (!next.includes('xmlns:xlink="http://www.w3.org/1999/xlink"')) {
        next = next.replace('<svg', '<svg xmlns:xlink="http://www.w3.org/1999/xlink"')
    }

    return next
}

function revokeLater(url: string) {
    globalThis.setTimeout(() => {
        URL.revokeObjectURL(url)
    }, 0)
}

function triggerBlobDownload(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob)

    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.click()

    revokeLater(url)
}

function getLowerExt(fileName: string | null | undefined): string {
    if (!fileName) return ''

    const index = fileName.lastIndexOf('.')
    if (index < 0) return ''

    return fileName.slice(index).toLowerCase()
}

function detectImageKind(fileName: string | null | undefined): 'png' | 'svg' {
    return getLowerExt(fileName) === '.svg' ? 'svg' : 'png'
}

function detectProjectKind(fileName: string | null | undefined): 'json' | 'txt' {
    return getLowerExt(fileName) === '.txt' ? 'txt' : 'json'
}

function buildCleanExportSvg(svgEl: SVGSVGElement): SVGSVGElement {
    const clone = svgEl.cloneNode(true) as SVGSVGElement
    const content = svgEl.querySelector<SVGGElement>('[data-export-content="1"]')

    clone.querySelectorAll('[data-export-exclude="1"], [stroke-dasharray]').forEach((element) => {
        element.remove()
    })
    clone.querySelectorAll('[data-export-content]').forEach((element) => {
        element.removeAttribute('data-export-content')
    })
    clone.removeAttribute('class')
    clone.removeAttribute('style')

    if (!content) return clone

    const box = content.getBBox()
    const matrix = content.getCTM()
    if (!matrix) return clone

    const points = [
        { x: box.x, y: box.y },
        { x: box.x + box.width, y: box.y },
        { x: box.x, y: box.y + box.height },
        { x: box.x + box.width, y: box.y + box.height },
    ].map(({ x, y }) => ({
        x: matrix.a * x + matrix.c * y + matrix.e,
        y: matrix.b * x + matrix.d * y + matrix.f,
    }))

    const minX = Math.min(...points.map((point) => point.x)) - IMAGE_EXPORT_MARGIN
    const minY = Math.min(...points.map((point) => point.y)) - IMAGE_EXPORT_MARGIN
    const maxX = Math.max(...points.map((point) => point.x)) + IMAGE_EXPORT_MARGIN
    const maxY = Math.max(...points.map((point) => point.y)) + IMAGE_EXPORT_MARGIN
    const width = Math.max(1, maxX - minX)
    const height = Math.max(1, maxY - minY)

    clone.setAttribute('width', String(Math.ceil(width)))
    clone.setAttribute('height', String(Math.ceil(height)))
    clone.setAttribute('viewBox', `${minX} ${minY} ${width} ${height}`)

    return clone
}

async function writeBlobToHandle(handle: PickerSaveHandle, blob: Blob) {
    const writable = await handle.createWritable()
    await writable.write(blob)
    await writable.close()
}

function serializeSvg(svgEl: SVGSVGElement): string {
    const serializer = new XMLSerializer()
    const source = serializer.serializeToString(svgEl)
    return ensureSvgNamespaces(source)
}

function buildSvgBlob(svgEl: SVGSVGElement): Blob {
    const svgText = serializeSvg(svgEl)
    return new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' })
}

function getSvgViewportSize(svgEl: SVGSVGElement): Readonly<{ width: number; height: number }> {
    const vb = svgEl.viewBox?.baseVal
    if (vb && Number.isFinite(vb.width) && Number.isFinite(vb.height) && vb.width > 0 && vb.height > 0) {
        return { width: vb.width, height: vb.height }
    }

    const wAttr = Number(svgEl.getAttribute('width'))
    const hAttr = Number(svgEl.getAttribute('height'))
    if (Number.isFinite(wAttr) && Number.isFinite(hAttr) && wAttr > 0 && hAttr > 0) {
        return { width: wAttr, height: hAttr }
    }

    return {
        width: Math.max(1, Math.floor(svgEl.clientWidth)),
        height: Math.max(1, Math.floor(svgEl.clientHeight)),
    }
}

async function canvasToBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob> {
    const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((result) => resolve(result), type)
    })

    if (!blob) {
        throw new Error('Failed to convert canvas to blob')
    }

    return blob
}

async function buildPngBlob(svgEl: SVGSVGElement, exportScale = 2): Promise<Blob> {
    const svgBlob = buildSvgBlob(svgEl)
    const svgUrl = URL.createObjectURL(svgBlob)

    try {
        const img = new Image()
        img.decoding = 'async'
        img.src = svgUrl

        await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve()
            img.onerror = () => reject(new Error('Failed to load SVG as image'))
        })

        const { width, height } = getSvgViewportSize(svgEl)
        const scale = Number.isFinite(exportScale) ? exportScale : 2
        const safeScale = Math.max(0.1, scale)

        const canvas = document.createElement('canvas')
        canvas.width = Math.ceil(width * safeScale)
        canvas.height = Math.ceil(height * safeScale)

        const ctx = canvas.getContext('2d')
        if (!ctx) {
            throw new Error('Canvas 2D context not available')
        }

        ctx.fillStyle = '#fff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)

        ctx.setTransform(safeScale, 0, 0, safeScale, 0, 0)
        ctx.drawImage(img, 0, 0)

        return await canvasToBlob(canvas, 'image/png')
    } finally {
        revokeLater(svgUrl)
    }
}

export async function saveDiagramImage(svgEl: SVGSVGElement, exportScale = 2): Promise<SaveDiagramImageResult> {
    const pickerApi = getPickerApi()

    if (pickerApi.showSaveFilePicker) {
        try {
            const handle = await pickerApi.showSaveFilePicker({
                suggestedName: 'nsd-box.png',
                types: IMAGE_SAVE_TYPES,
            })

            const kind = detectImageKind(handle.name ?? 'nsd-box.png')
            const exportSvg = buildCleanExportSvg(svgEl)
            const blob = kind === 'svg' ? buildSvgBlob(exportSvg) : await buildPngBlob(exportSvg, exportScale)

            await writeBlobToHandle(handle, blob)

            return {
                saved: true,
                kind,
                fileName: handle.name ?? (kind === 'svg' ? 'nsd-box.svg' : 'nsd-box.png'),
            }
        } catch (error) {
            if (isAbortError(error)) {
                return { saved: false, kind: null, fileName: null }
            }

            throw error
        }
    }

    const blob = await buildPngBlob(buildCleanExportSvg(svgEl), exportScale)
    triggerBlobDownload(blob, 'nsd-box.png')

    return {
        saved: true,
        kind: 'png',
        fileName: 'nsd-box.png',
    }
}

export async function saveProjectFile(data: unknown): Promise<SaveProjectFileResult> {
    const pickerApi = getPickerApi()
    const text = JSON.stringify(data, null, 2)

    if (pickerApi.showSaveFilePicker) {
        try {
            const handle = await pickerApi.showSaveFilePicker({
                suggestedName: 'nsd-project.json',
                types: PROJECT_FILE_TYPES,
            })

            const kind = detectProjectKind(handle.name ?? 'nsd-project.json')
            const mime = kind === 'txt' ? 'text/plain;charset=utf-8' : 'application/json;charset=utf-8'
            const blob = new Blob([text], { type: mime })

            await writeBlobToHandle(handle, blob)

            return {
                saved: true,
                kind,
                fileName: handle.name ?? (kind === 'txt' ? 'nsd-project.txt' : 'nsd-project.json'),
            }
        } catch (error) {
            if (isAbortError(error)) {
                return { saved: false, kind: null, fileName: null }
            }

            throw error
        }
    }

    const fallbackBlob = new Blob([text], { type: 'application/json;charset=utf-8' })
    triggerBlobDownload(fallbackBlob, 'nsd-project.json')

    return {
        saved: true,
        kind: 'json',
        fileName: 'nsd-project.json',
    }
}

export async function openProjectTextWithPicker(): Promise<OpenProjectTextResult> {
    const pickerApi = getPickerApi()

    if (!pickerApi.showOpenFilePicker) {
        return {
            supported: false,
            opened: false,
            text: '',
            fileName: null,
        }
    }

    try {
        const handles = await pickerApi.showOpenFilePicker({
            multiple: false,
            types: PROJECT_FILE_TYPES,
        })

        const handle = handles[0]
        if (!handle) {
            return {
                supported: true,
                opened: false,
                text: '',
                fileName: null,
            }
        }

        const file = await handle.getFile()
        const text = await file.text()

        return {
            supported: true,
            opened: true,
            text,
            fileName: file.name,
        }
    } catch (error) {
        if (isAbortError(error)) {
            return {
                supported: true,
                opened: false,
                text: '',
                fileName: null,
            }
        }

        throw error
    }
}