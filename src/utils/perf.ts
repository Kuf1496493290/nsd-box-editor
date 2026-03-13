type PerfMeta = Readonly<Record<string, unknown>>

type PerfSample = {
    count: number
    totalMs: number
    maxMs: number
}

const SLOW_MS = 16
const SUMMARY_EVERY = 20
const stats = new Map<string, PerfSample>()

function readPerfFlag(): boolean {
    const g = globalThis as typeof globalThis & { __NSD_PERF__?: unknown }
    return g.__NSD_PERF__ === true
}

export function perfEnabled(): boolean {
    return readPerfFlag() || import.meta.env.DEV
}

export function perfNow(): number {
    return performance.now()
}

function fmt(ms: number): string {
    return ms.toFixed(2)
}

function nextSample(label: string): PerfSample {
    const sample = stats.get(label)
    if (sample) return sample

    const created: PerfSample = { count: 0, totalMs: 0, maxMs: 0 }
    stats.set(label, created)
    return created
}

export function perfLogDuration(label: string, startMs: number, meta?: PerfMeta): number {
    if (!perfEnabled()) return 0

    const duration = perfNow() - startMs
    const sample = nextSample(label)

    sample.count += 1
    sample.totalMs += duration
    sample.maxMs = Math.max(sample.maxMs, duration)

    if (duration >= SLOW_MS) {
        if (meta) {
            console.info(`[perf] ${label} ${fmt(duration)}ms`, meta)
        } else {
            console.info(`[perf] ${label} ${fmt(duration)}ms`)
        }
    }

    if (sample.count % SUMMARY_EVERY === 0) {
        const avg = sample.totalMs / sample.count
        console.info(`[perf:avg] ${label} n=${sample.count} avg=${fmt(avg)}ms max=${fmt(sample.maxMs)}ms`)
    }

    return duration
}

export function perfSpan<T>(label: string, run: () => T, meta?: PerfMeta): T {
    if (!perfEnabled()) return run()

    const start = perfNow()
    try {
        return run()
    } finally {
        perfLogDuration(label, start, meta)
    }
}