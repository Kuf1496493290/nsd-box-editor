export type KeyboardShortcuts = Readonly<{
    onUndo: () => void
    onRedo: () => void
    onDelete: () => void
    isEditing: () => boolean
}>

function isEditableElement(el: Element | null): boolean {
    if (!el) return false

    const tag = el.tagName.toLowerCase()
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return true

    return (el as HTMLElement).isContentEditable
}

function shouldIgnoreByActiveElement(): boolean {
    const active = document.activeElement
    if (!active) return false
    return isEditableElement(active)
}

function isPrimaryMod(event: KeyboardEvent): boolean {
    return event.ctrlKey || event.metaKey
}

export function installKeyboardShortcuts(shortcuts: KeyboardShortcuts): () => void {
    function handleKeyDown(event: KeyboardEvent) {
        if (shortcuts.isEditing()) return
        if (shouldIgnoreByActiveElement()) return

        const key = event.key

        if (isPrimaryMod(event) && !event.shiftKey && (key === 'z' || key === 'Z')) {
            event.preventDefault()
            shortcuts.onUndo()
            return
        }

        const isRedoByShiftZ = isPrimaryMod(event) && event.shiftKey && (key === 'z' || key === 'Z')
        const isRedoByCtrlY = event.ctrlKey && !event.shiftKey && (key === 'y' || key === 'Y')
        if (isRedoByShiftZ || isRedoByCtrlY) {
            event.preventDefault()
            shortcuts.onRedo()
            return
        }

        if (key === 'Delete') {
            event.preventDefault()
            shortcuts.onDelete()
        }
    }

    globalThis.addEventListener('keydown', handleKeyDown)

    return () => {
        globalThis.removeEventListener('keydown', handleKeyDown)
    }
}