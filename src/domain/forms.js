// Digital forms and their signing order. Signatories carry an `order`: a line
// can be signed only once every line with a lower order has been signed, which
// is how "Adviser first, then Panel Members" and the Approval Sheet sequence
// (Adviser → Panel → Program Chair/Coordinator → URO → Dean and Associate Dean)
// are enforced. Lines marked `viaGate` are signed by running the matching
// workflow gate, because for those offices the signature *is* the decision.

import { DOC_TYPES, DOC_STATUS, FORMS } from './constants.js'

export const formOf = (b, formType) =>
  (b?.forms ?? [])
    .filter(f => f.formType === formType)
    .sort((x, y) => new Date(y.createdAt) - new Date(x.createdAt))[0] ?? null

const lowestOpenOrder = (form) => {
  const open = form.signatories.filter(s => !s.signedAt).map(s => s.order)
  return open.length ? Math.min(...open) : null
}

/** Roles that still have to sign before `role`'s line becomes signable. */
export function pendingBefore(form, role) {
  if (!form) return ['(form not issued)']
  const line = form.signatories.find(s => s.role === role)
  if (!line) return []
  return form.signatories.filter(s => s.order < line.order && !s.signedAt).map(s => s.role)
}

/**
 * Can `me` sign `form` from the Forms tab right now? The answer depends on
 * context, not role: being a listed signatory, whose turn it is, the stage the
 * project is in, and — for the Adviser on FM-AAC-SOC-2004 — whether the
 * revised manuscript has actually been approved.
 */
export function canSign(form, me, b) {
  const line = form.signatories.find(s => s.userId === me.id && !s.signedAt)
  if (!line) return { ok: false }
  if (line.viaGate) return { ok: false, reason: 'Signed by running the workflow step on the Overview tab.' }
  if (form.stage && form.stage !== b.project.currentStage) {
    return { ok: false, reason: 'This form can only be signed while the project is at its circulation stage.' }
  }
  if (lowestOpenOrder(form) !== line.order) {
    const waiting = pendingBefore(form, line.role)
    return { ok: false, reason: `Not your turn yet — waiting on ${waiting.join(', ')}.` }
  }
  if (form.formType === FORMS.F2004.code && line.role === 'Adviser') {
    const revised = b.documents
      .filter(d => d.docType === DOC_TYPES.REVISED_MANUSCRIPT)
      .sort((x, y) => y.versionNumber - x.versionNumber)[0]
    if (revised?.status !== DOC_STATUS.APPROVED) {
      return { ok: false, reason: 'Approve the revised manuscript before verifying compliance.' }
    }
  }
  return { ok: true, line }
}
