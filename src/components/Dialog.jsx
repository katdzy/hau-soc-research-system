import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'

/**
 * A modal over the page (Figma M-01 – M-25): title and subtitle, an optional
 * step bar ("Step 1 · Review" — "Step 2 · Confirm"), the body, and a footer
 * with "Step n of m" on the left and the actions on the right. A native
 * <dialog>, so focus moves in and comes back, Escape closes it and the page
 * behind stays inert. Rendered only while open; `onClose` fires on Escape,
 * the ✕, or a click on the backdrop.
 */
export default function Dialog({ title, sub, steps, step = 0, footer, onClose, children, wide = false, labelledBy }) {
  const ref = useRef(null)
  const titleId = useId()

  useEffect(() => {
    const d = ref.current
    if (d && !d.open) d.showModal?.()
    // Start on the first field or action inside the body, not on ✕.
    d?.querySelector('.dialog-body input, .dialog-body textarea, .dialog-body select, .dialog-foot .primary')?.focus()
  }, [])

  return createPortal(
    <dialog
      ref={ref} className={`dialog${wide ? ' is-wide' : ''}`} aria-labelledby={labelledBy ?? titleId}
      onCancel={(e) => { e.preventDefault(); onClose?.() }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.() }}
    >
      <header className="dialog-head">
        <div className="dialog-titles">
          <h2 id={titleId}>{title}</h2>
          {sub && <p className="dialog-sub">{sub}</p>}
        </div>
        <button type="button" className="quiet dialog-x" onClick={onClose} aria-label="Close">
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
            <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
        {steps?.length > 1 && (
          <ol className="dialog-steps" aria-label="Steps">
            {steps.map((label, i) => {
              const state = i < step ? 'done' : i === step ? 'now' : 'later'
              return (
                <li key={label} className={`is-${state}`} aria-current={i === step ? 'step' : undefined}>
                  <span className="dialog-step-mark" aria-hidden="true">
                    {state === 'done'
                      ? <svg viewBox="0 0 12 12" width="11" height="11"><path d="M2.5 6.2 5 8.6l4.5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      : i + 1}
                  </span>
                  <span><span className="dialog-step-n">Step {i + 1} · </span>{label}</span>
                </li>
              )
            })}
          </ol>
        )}
      </header>
      <div className="dialog-body">{children}</div>
      {footer && (
        <footer className="dialog-foot">
          {steps?.length > 1 && <span className="small faint">Step {step + 1} of {steps.length}</span>}
          <div className="dialog-actions">{footer}</div>
        </footer>
      )}
    </dialog>,
    document.body,
  )
}
