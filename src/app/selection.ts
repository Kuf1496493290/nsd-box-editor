// FILE: src/app/selection.ts
import type { SelectionTarget } from './types'

export function canDeleteByTarget(target: SelectionTarget | null): boolean {
    if (!target) return false
    if (target.kind === 'node') return true

    if (target.kind === 'ifPart') {
        return target.part !== 'trueContainer' && target.part !== 'falseContainer'
    }

    if (target.kind === 'casePart') {
        return target.part !== 'branchContainer'
    }

    return false
}