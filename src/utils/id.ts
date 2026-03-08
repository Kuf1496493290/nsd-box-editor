// 全局自增序列键，跨模块共享同一 ID 计数器。
const GLOBAL_KEY = '__nsd_box_editor_id_seq__'

function getGlobalStore(): Record<string, unknown> {
    return globalThis as unknown as Record<string, unknown>
}

function readSeq(): number {
    const store = getGlobalStore()
    const value = store[GLOBAL_KEY]

    if (typeof value === 'number' && Number.isFinite(value)) {
        return value
    }

    store[GLOBAL_KEY] = 1
    return 1
}

function writeSeq(value: number): void {
    const store = getGlobalStore()
    store[GLOBAL_KEY] = value
}

/**
 * 生成带前缀的递增 ID。
 */
export function nextId(prefix: string): string {
    const current = readSeq() + 1
    writeSeq(current)
    return `${prefix}${current}`
}