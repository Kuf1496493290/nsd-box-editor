export function downloadSvg(svgEl: SVGSVGElement, filename = 'nsd.svg') {
    const serializer = new XMLSerializer()
    const source = serializer.serializeToString(svgEl)

    const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)

    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()

    URL.revokeObjectURL(url)
}

export async function downloadPng(svgEl: SVGSVGElement, filename = 'nsd.png', scale = 2) {
    const serializer = new XMLSerializer()
    const svgText = serializer.serializeToString(svgEl)

    const svgBlob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' })
    const svgUrl = URL.createObjectURL(svgBlob)

    const img = new Image()
    img.decoding = 'async'
    img.src = svgUrl

    await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error('Failed to load SVG as image'))
    })

    const bbox = svgEl.getBBox()
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(bbox.width * scale)
    canvas.height = Math.ceil(bbox.height * scale)

    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D context not available')

    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    ctx.setTransform(scale, 0, 0, scale, -bbox.x * scale, -bbox.y * scale)
    ctx.drawImage(img, 0, 0)

    URL.revokeObjectURL(svgUrl)

    const pngUrl = canvas.toDataURL('image/png')
    const a = document.createElement('a')
    a.href = pngUrl
    a.download = filename
    a.click()
}