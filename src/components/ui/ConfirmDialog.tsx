import { useId, useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { Modal } from './Modal'
import { Button } from './Button'

export function ConfirmDialog({ title, description, confirmLabel, note, destructive = false, confirm, close }: { title: string; description: string; confirmLabel: string; note?: string; destructive?: boolean; confirm: () => void | Promise<void>; close: () => void }) {
  const id = useId(), [busy, setBusy] = useState(false), [error, setError] = useState('')
  async function apply() { setBusy(true); setError(''); try { await confirm(); close() } catch(e) { setError((e as Error).message); setBusy(false) } }
  return <Modal className="confirm-dialog" titleId={id} descriptionId={`${id}-description`} close={close} busy={busy}><div className="modal-top"><span className="modal-icon"><AlertTriangle size={20}/></span><button className="icon-button" disabled={busy} aria-label="Close confirmation" onClick={close}><X size={18}/></button></div><h2 id={id}>{title}</h2><p className="modal-description" id={`${id}-description`}>{description}</p>{note && <p className="dialog-note">{note}</p>}{error && <p className="export-error" role="alert">{error}</p>}<div className="dialog-actions"><Button data-cancel disabled={busy} onClick={close}>Cancel</Button><Button variant={destructive ? 'danger' : 'primary'} disabled={busy} onClick={apply}>{busy ? 'Please wait…' : confirmLabel}</Button></div></Modal>
}
