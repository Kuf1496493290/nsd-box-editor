import type { AppState, BoolLabelMode, LoopKind, NsdNode, SequenceNode, StyleConfig } from '../app/types'
import { DEFAULT_STYLE } from '../app/constants'

type ProjectFile = Readonly<{
    root: unknown
    style: unknown
    scale?: unknown
}>

export type ProjectParseResult =
    | Readonly<{ ok: true; root: SequenceNode; style: StyleConfig; scale: number }>
    | Readonly<{ ok: false; message: string }>

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeText(value: unknown): string {
    const text = typeof value === 'string' ? value : ''
    const trimmed = text.trim()
    return trimmed.length > 0 ? trimmed : ' '
}

function generateId(prefix: string): string {
    const g = globalThis as unknown as { crypto?: { randomUUID?: () => string } }
    const uuid = g.crypto?.randomUUID?.()
    if (uuid) return `${prefix}_${uuid}`
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

function makeEmptySequence(): SequenceNode {
    return { id: generateId('seq'), type: 'sequence', children: [] }
}

function normalizeBoolLabelMode(value: unknown): BoolLabelMode {
    return value === 'YN' ? 'YN' : 'TF'
}

function normalizeLoopKind(value: unknown): LoopKind {
    return value === 'doWhile' ? 'doWhile' : 'while'
}

function normalizeSequence(raw: unknown): SequenceNode | null {
    if (!isPlainObject(raw)) return null
    if (raw.type !== 'sequence') return null

    const id = typeof raw.id === 'string' && raw.id.trim().length > 0 ? raw.id : generateId('seq')
    const childrenRaw = Array.isArray(raw.children) ? raw.children : []
    const children: NsdNode[] = []

    for (const c of childrenRaw) {
        const n = normalizeNode(c)
        if (n) children.push(n)
    }

    return { id, type: 'sequence', children }
}

function normalizeProcess(raw: Record<string, unknown>): Extract<NsdNode, { type: 'process' }> | null {
    const id = typeof raw.id === 'string' && raw.id.trim().length > 0 ? raw.id : generateId('process')
    return {
        id,
        type: 'process',
        text: normalizeText(raw.text),
    }
}

function normalizeIf(raw: Record<string, unknown>): Extract<NsdNode, { type: 'if' }> | null {
    const id = typeof raw.id === 'string' && raw.id.trim().length > 0 ? raw.id : generateId('if')

    const trueBranch = normalizeSequence(raw.trueBranch) ?? makeEmptySequence()
    const falseBranch = normalizeSequence(raw.falseBranch) ?? makeEmptySequence()

    return {
        id,
        type: 'if',
        conditionText: normalizeText(raw.conditionText),
        boolLabelMode: normalizeBoolLabelMode(raw.boolLabelMode),
        trueBranch,
        falseBranch,
    }
}

function normalizeCase(raw: Record<string, unknown>): Extract<NsdNode, { type: 'case' }> | null {
    const id = typeof raw.id === 'string' && raw.id.trim().length > 0 ? raw.id : generateId('case')

    const branchesRaw = Array.isArray(raw.branches) ? raw.branches : []
    const branches: SequenceNode[] = []

    for (const b of branchesRaw) {
        const seq = normalizeSequence(b)
        if (seq) branches.push(seq)
    }

    while (branches.length < 2) {
        branches.push(makeEmptySequence())
    }

    const labelRaw = Array.isArray(raw.branchLabels) ? raw.branchLabels : []
    const branchLabels: string[] = []

    for (let i = 0; i < branches.length; i += 1) {
        const v = labelRaw[i]
        const t = typeof v === 'string' ? v : ''
        branchLabels.push(t.trim().length > 0 ? t : String(i + 1))
    }

    return {
        id,
        type: 'case',
        conditionText: normalizeText(raw.conditionText),
        branches,
        branchLabels,
    }
}

function normalizeLoop(raw: Record<string, unknown>): Extract<NsdNode, { type: 'loop' }> | null {
    const id = typeof raw.id === 'string' && raw.id.trim().length > 0 ? raw.id : generateId('loop')
    const body = normalizeSequence(raw.body) ?? makeEmptySequence()

    return {
        id,
        type: 'loop',
        loopKind: normalizeLoopKind(raw.loopKind),
        conditionText: normalizeText(raw.conditionText),
        body,
    }
}

function normalizeNode(raw: unknown): NsdNode | null {
    if (!isPlainObject(raw)) return null
    const t = raw.type

    if (t === 'sequence') return normalizeSequence(raw)
    if (t === 'process') return normalizeProcess(raw)
    if (t === 'if') return normalizeIf(raw)
    if (t === 'case') return normalizeCase(raw)
    if (t === 'loop') return normalizeLoop(raw)

    return null
}

function clampNumber(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return min
    return Math.max(min, Math.min(max, value))
}

function clampInt(value: number, min: number, max: number): number {
    return Math.round(clampNumber(value, min, max))
}

function normalizeScale(raw: unknown): number {
    const v = typeof raw === 'number' ? raw : 1
    const clamped = clampNumber(v, 0.5, 2)
    return Math.round(clamped * 10) / 10
}

function normalizeStyle(raw: unknown): StyleConfig {
    const base: StyleConfig = { ...DEFAULT_STYLE }
    if (!isPlainObject(raw)) return base

    const next: StyleConfig = { ...base }
    const r = raw

    const fontFamily = r.fontFamily
    if (typeof fontFamily === 'string' && fontFamily.trim().length > 0) {
        next.fontFamily = fontFamily
    }

    const fontSize = r.fontSize
    if (typeof fontSize === 'number') next.fontSize = clampInt(fontSize, 8, 48)

    const lineWidth = r.lineWidth
    if (typeof lineWidth === 'number') next.lineWidth = clampInt(lineWidth, 1, 10)

    const paddingProcessY = r.paddingProcessY
    if (typeof paddingProcessY === 'number') next.paddingProcessY = clampInt(paddingProcessY, 0, 80)

    const paddingProcessX = r.paddingProcessX
    if (typeof paddingProcessX === 'number') next.paddingProcessX = clampInt(paddingProcessX, 0, 80)

    const paddingHeader = r.paddingHeader
    if (typeof paddingHeader === 'number') next.paddingHeader = clampInt(paddingHeader, 0, 80)

    const paddingBranchLabel = r.paddingBranchLabel
    if (typeof paddingBranchLabel === 'number') next.paddingBranchLabel = clampInt(paddingBranchLabel, 0, 80)

    const minBlockWidth = r.minBlockWidth
    if (typeof minBlockWidth === 'number') next.minBlockWidth = clampInt(minBlockWidth, 48, 4000)

    return next
}

/**
 * 将当前应用状态序列化为工程文件对象。
 */
export function buildProjectFile(state: AppState): ProjectFile {
    return {
        root: state.root,
        style: state.style,
        scale: state.scale,
    }
}

/**
 * 解析并规范化工程 JSON；失败时返回可直接展示的错误信息。
 */
export function parseProjectJsonDetailed(text: string): ProjectParseResult {
    let data: unknown
    try {
        data = JSON.parse(text)
    } catch {
        return { ok: false, message: '导入失败：不是合法的 JSON 文件。' }
    }

    if (!isPlainObject(data)) return { ok: false, message: '导入失败：JSON 根对象格式不正确。' }

    const root = normalizeSequence(data.root)
    if (!root) return { ok: false, message: '导入失败：root 不是合法的 sequence 结构。' }

    const style = normalizeStyle(data.style)
    const scale = normalizeScale(data.scale)

    return { ok: true, root, style, scale }
}