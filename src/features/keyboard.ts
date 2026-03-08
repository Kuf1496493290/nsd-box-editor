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

function isBodyOrHtml(el: Element | null): boolean {
    if (!el) return true
    return el === document.body || el === document.documentElement
}

/**
 * 焦点安全：
 * - 当焦点不在 body/html（例如 button/toolbar 等）时，不触发 Enter/Tab/Delete
 * - 若焦点在 input/textarea/select/contenteditable 上，也不触发 Enter/Tab/Delete（避免干扰文本编辑）
 */
function shouldIgnoreActionKeysByFocus(): boolean {
    const active = document.activeElement
    if (!active) return false

    if (isEditableElement(active)) return true
    return !isBodyOrHtml(active)
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
    if (shouldIgnoreActionKeysByFocus()) return

    const handled = handler()
    if (handled) {
        event.preventDefault()
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

    globalThis.addEventListener('keydown', handleKeyDown)

    return () => {
        globalThis.removeEventListener('keydown', handleKeyDown)
    }
}