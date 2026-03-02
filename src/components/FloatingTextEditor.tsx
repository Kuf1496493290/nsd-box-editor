// FILE: src/components/FloatingTextEditor.tsx
import { useEffect, useRef } from 'react'
import type { KeyboardEvent, SyntheticEvent } from 'react'

type FloatingTextEditorProps = Readonly<{
    visible: boolean
    value: string
    title?: string
    onConfirm: (value: string) => void
    onCancel: () => void
}>

export function FloatingTextEditor(props: FloatingTextEditorProps) {
    const { visible, value, title = '编辑文本', onConfirm, onCancel } = props

    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        if (!visible) return

        const timer = globalThis.setTimeout(() => {
            inputRef.current?.focus()
            inputRef.current?.select()
        }, 0)

        return () => {
            globalThis.clearTimeout(timer)
        }
    }, [visible, value])

    function handleConfirm() {
        const next = inputRef.current?.value ?? ''
        const text = next.trim()
        onConfirm(text.length > 0 ? text : ' ')
    }

    function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
        if (event.key === 'Enter') {
            event.preventDefault()
            handleConfirm()
            return
        }

        if (event.key === 'Escape') {
            event.preventDefault()
            onCancel()
        }
    }

    function handleDialogCancel(event: SyntheticEvent<HTMLDialogElement>) {
        event.preventDefault()
        onCancel()
    }

    if (!visible) return null

    return (
        <dialog
            open
            className="floatingEditor"
            aria-label={title}
            onCancel={handleDialogCancel}
        >
            <div className="floatingEditor__panel">
                <div className="floatingEditor__title">{title}</div>

                <input
                    ref={inputRef}
                    key={`${visible ? 'open' : 'closed'}-${value}`}
                    className="floatingEditor__input"
                    type="text"
                    defaultValue={value}
                    onKeyDown={handleKeyDown}
                    placeholder="请输入文本"
                />

                <div className="floatingEditor__actions">
                    <button type="button" className="button" onClick={onCancel}>
                        取消
                    </button>
                    <button type="button" className="button" onClick={handleConfirm}>
                        确定
                    </button>
                </div>
            </div>
        </dialog>
    )
}