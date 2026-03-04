// FILE: src/utils/download.ts
function ensureSvgNamespaces(svgText: string): string {
    if (!svgText.includes('xmlns="http://www.w3.org/2000/svg"')) {
        svgText = svgText.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"')
    }
    if (!svgText.includes('xmlns:xlink="http://www.w3.org/1999/xlink"')) {
        svgText = svgText.replace('<svg', '<svg xmlns:xlink="http://www.w3.org/1999/xlink"')
    }
    return svgText
}

function revokeLater(url: string) {
    globalThis.setTimeout(() => {
        URL.revokeObjectURL(url)
    }, 0)
}

export function downloadSvg(svgEl: SVGSVGElement, filename = 'nsd.svg') {
    const serializer = new XMLSerializer()
    let source = serializer.serializeToString(svgEl)
    source = ensureSvgNamespaces(source)

    const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)

    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()

    revokeLater(url)
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

    return { width: Math.max(1, Math.floor(svgEl.clientWidth)), height: Math.max(1, Math.floor(svgEl.clientHeight)) }
}

export async function downloadPng(svgEl: SVGSVGElement, filename = 'nsd.png', exportScale = 2) {
    const serializer = new XMLSerializer()
    let svgText = serializer.serializeToString(svgEl)
    svgText = ensureSvgNamespaces(svgText)

    const svgBlob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' })
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
        if (!ctx) throw new Error('Canvas 2D context not available')

        ctx.fillStyle = '#fff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)

        ctx.setTransform(safeScale, 0, 0, safeScale, 0, 0)
        ctx.drawImage(img, 0, 0)

        const pngUrl = canvas.toDataURL('image/png')
        const a = document.createElement('a')
        a.href = pngUrl
        a.download = filename
        a.click()
    } finally {
        revokeLater(svgUrl)
    }
}

export function downloadJson(data: unknown, filename = 'nsd-project.json') {
    const text = JSON.stringify(data, null, 2)
    const blob = new Blob([text], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)

    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()

    revokeLater(url)
}