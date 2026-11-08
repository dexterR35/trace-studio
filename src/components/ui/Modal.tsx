import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export function Modal({ titleId, descriptionId, className = '', close, busy = false, children }: { titleId: string; descriptionId?: string; className?: string; close: () => void; busy?: boolean; children: ReactNode }) {
  const dialog = useRef<HTMLElement>(null), actions = useRef({ close, busy })
  actions.current = { close, busy }
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const surfaces = [...document.querySelectorAll<HTMLElement>('[data-modal-inert]')], old = surfaces.map(e => e.inert)
    surfaces.forEach(e => { e.inert = true })
    const focusable = () => [...dialog.current!.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]')].filter(e => e.offsetParent !== null)
    ;(dialog.current?.querySelector<HTMLElement>('[data-cancel]') ?? focusable()[0] ?? dialog.current)?.focus()
    function key(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); if (!actions.current.busy) actions.current.close(); return }
      if (e.key !== 'Tab') return
      const items = focusable(), first = items[0], last = items.at(-1)
      if (!items.length) { e.preventDefault(); dialog.current?.focus() }
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus() }
    }
    document.addEventListener('keydown', key, true)
    return () => { document.removeEventListener('keydown', key, true); surfaces.forEach((e, i) => { e.inert = old[i] }); if (previous?.isConnected) previous.focus() }
  }, [])
  return createPortal(<div className="modal-backdrop" onPointerDown={e => { if (e.target === e.currentTarget && !busy) close() }} onDragOver={e => { e.preventDefault(); e.stopPropagation() }} onDrop={e => { e.preventDefault(); e.stopPropagation() }}><section ref={dialog} tabIndex={-1} className={`dialog ${className}`} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId}>{children}</section></div>, document.body)
}
