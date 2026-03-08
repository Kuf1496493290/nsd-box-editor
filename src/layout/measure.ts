import type { StyleConfig } from '../app/types'

let canvas: HTMLCanvasElement | null = null

function getCtx(): CanvasRenderingContext2D {
    canvas ??= document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D context not available')
    return ctx
}

export function measureTextWidth(text: string, style: StyleConfig): number {
    const ctx = getCtx()
    ctx.font = `${style.fontSize}px ${style.fontFamily}`
    const metrics = ctx.measureText(text || '')
    return metrics.width
}