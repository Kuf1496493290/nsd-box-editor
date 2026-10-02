export type KeyboardShortcuts = Readonly<{
    onUndo: () => void
    onRedo: () => void

    onDelete: () => boolean
    onEnter: () => boolean
    onTab: () => boolean

    isEditing: () => boolean
    isDragActive: () => boolean
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

function isButtonElement(el: Element | null): boolean {
    return !!el && el.tagName.toLowerCase() === 'button'
}

function isUndoKey(event: KeyboardEvent, key: string): boolean {
    return isPrimaryMod(event) && !event.shiftKey && (key === 'z' || key === 'Z')
}

function isRedoKey(event: KeyboardEvent, key: string): boolean {
    const redoByShiftZ = isPrimaryMod(event) && event.shiftKey && (key === 'z' || key === 'Z')
    const redoByCtrlY = event.ctrlKey && !event.shiftKey && (key === 'y' || key === 'Y')
    return redoByShiftZ || redoByCtrlY
}

function handleUndoRedo(event: KeyboardEvent, shortcuts: KeyboardShortcuts): boolean {
    const key = event.key

    if (isUndoKey(event, key)) {
        if (shouldIgnoreByActiveElement()) return true
        event.preventDefault()
        shortcuts.onUndo()
        return true
    }

    if (isRedoKey(event, key)) {
        if (shouldIgnoreByActiveElement()) return true
        event.preventDefault()
        shortcuts.onRedo()
        return true
    }

    return false
}

function handleActionKey(
    event: KeyboardEvent,
    handler: () => boolean,
): void {
    if (event.repeat) return
    if (shouldIgnoreByActiveElement()) return

    const handled = handler()
    if (handled || isButtonElement(document.activeElement)) {
        event.preventDefault()
        if (isButtonElement(document.activeElement)) {
            (document.activeElement as HTMLElement).blur()
        }
    }
}

/**
 * 安装全局键盘快捷键，并返回卸载函数。
 * 会在编辑态或拖拽态下自动忽略业务动作键。
 */
export function installKeyboardShortcuts(shortcuts: KeyboardShortcuts): () => void {
    function handleKeyDown(event: KeyboardEvent) {
        if (shortcuts.isDragActive()) return
        if (shortcuts.isEditing()) return

        if (handleUndoRedo(event, shortcuts)) return

        switch (event.key) {
            case 'Enter':
                handleActionKey(event, shortcuts.onEnter)
                return
            case 'Tab':
                handleActionKey(event, shortcuts.onTab)
                return
            case 'Delete':
                handleActionKey(event, shortcuts.onDelete)
                return
            default:
                return
        }
    }

    // 捕获阶段拦截，避免焦点仍在工具栏按钮时 Enter 先触发原生 click。
    globalThis.addEventListener('keydown', handleKeyDown, true)

    return () => {
        globalThis.removeEventListener('keydown', handleKeyDown, true)
    }
}