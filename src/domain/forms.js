// Institutional forms and their signing order. The system never fills in or
// signs a form: each signatory downloads the latest copy (or the blank form),
// signs it outside the system — all e-signatures on the PDF or all wet
// signatures on paper, one way per form — and uploads the signed copy (Figma
// E-00/E-01). Some lines are recorded in the system instead of signed on the
// copy (`lineMethod`): the Adviser and the panel members confirm the
// revisions on FM-AAC-SOC-2004, and the Panel Chair then uploads the copy
// carrying their signatures (M-16/M-17, F-04).
//
// Signatories carry an `order`: a line can be completed only once every line
// with a lower order is, which is how "Adviser first, then Panel Members" and
// the Approval Sheet sequence (Adviser → Panel → Program Chair/Coordinator →
// URO → Dean and Associate Dean) are enforced. Lines marked `viaGate` are
// completed by running the matching workflow gate, because for those offices
// the signature *is* the decision.

import { DOC_TYPES, DOC_STATUS, FORMS, GLOBAL_ROLES as G, PROJECT_ROLES as P } from './constants.js'
import { uroReturnOutstanding } from './returns.js'

/**
 * 'upload' — the signatory uploads the copy they signed outside the system;
 * 'confirm' — recorded in the system, no file (their signature reaches the
 * paper through a later upload, or the office's decision is the record).
 */
export function lineMethod(form, line) {
  if (form?.formType === FORMS.F2004.code && [P.ADVISER, P.PANEL_MEMBER].includes(line?.role)) return 'confirm'
  // The URO clears in the system (M-09); its line, if the flag gives it one, is the clearance.
  if (form?.formType === FORMS.APPROVAL.code && line?.role === G.URO) return 'confirm'
  return 'upload'
}

/** The signed copies uploaded so far, oldest first. */
export const copiesOf = (form) => [...(form?.copies ?? [])].sort((x, y) => x.n - y.n)

/** The copy the next signatory downloads and signs, or null (then: the blank form). */
export const latestCopy = (form) => copiesOf(form).at(-1) ?? null

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
  if (form.status === 'Void') return { ok: false, reason: 'This form was voided and reissued.' }
  if (line.viaGate) return { ok: false, reason: 'Signed by running the workflow step on the Overview tab.' }
  if (form.stage && form.stage !== b.project.currentStage) {
    return { ok: false, reason: 'This form can only be signed while the project is at its circulation stage.' }
  }
  if (lowestOpenOrder(form) !== line.order) {
    // FM-2004's last line is the Panel Chair's upload of the copy the members signed.
    if (form.formType === FORMS.F2004.code && line.role === P.PANEL_CHAIR) {
      const waiting = pendingBefore(form, line.role)
      return { ok: false, reason: `Upload the final copy once ${waiting.join(' and ')} ${waiting.length > 1 ? 'have' : 'has'} confirmed the revisions.` }
    }
    const waiting = pendingBefore(form, line.role)
    return { ok: false, reason: `Not your turn yet — waiting on ${waiting.join(', ')}.` }
  }
  // S5.7 / S8.3 — the Adviser verifies revisions made for THIS verdict: a revised
  // manuscript from an earlier defense does not count.
  if (form.formType === FORMS.F2004.code && line.role === 'Adviser') {
    const revised = b.documents
      .filter(d => d.docType === DOC_TYPES.REVISED_MANUSCRIPT && new Date(d.submittedAt) > new Date(form.createdAt))
      .sort((x, y) => y.versionNumber - x.versionNumber)[0]
    if (!revised) return { ok: false, reason: 'The group has not uploaded its revised manuscript for this verdict yet.' }
    if (revised.status !== DOC_STATUS.APPROVED) {
      return { ok: false, reason: 'Approve the revised manuscript before verifying compliance.' }
    }
  }
  // S9.3a (precondition S9.1–S9.2, inferred) — the Adviser signs the Approval
  // Sheet once both certificates are in.
  if (form.formType === FORMS.APPROVAL.code && line.role === 'Adviser') {
    const missing = [DOC_TYPES.EDITORS_CERTIFICATE, DOC_TYPES.PLAGIARISM_CERTIFICATE]
      .filter(t => !b.documents.some(d => d.docType === t))
    if (missing.length) return { ok: false, reason: `Waiting for the group to upload: ${missing.join(', ')}.` }
    // NEW-46 — after the URO returns the manuscript, the Adviser signs the
    // reissued sheet only once the group has replaced what was returned.
    const waiting = uroReturnOutstanding(b)
    if (waiting.length) return { ok: false, reason: `The URO returned it — waiting for the group’s new ${waiting.join(' and ')}.` }
  }
  return { ok: true, line, method: lineMethod(form, line) }
}
