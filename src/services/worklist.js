// What each signed-in user actually owes the system right now. Gate actions
// come from the stage machine; the softer tasks (unsigned logs, returned
// drafts, circulating signatures) come from the same project bundle, so the
// dashboard never hard-codes a role.

import { bundle } from './core.js'
import { resolveContext, can, projectAccess, allowedDocTypes } from '../domain/cac.js'
import { stageByKey } from '../domain/stages.js'
import { DOC_STATUS, REVIEWABLE_TYPES } from '../domain/constants.js'

function pendingTasks(b, ctx, me) {
  const tasks = []
  const roles = ctx.projectRoles

  if (can(ctx, 'weeklylog.sign')) {
    const unsigned = b.weeklyLogs.filter(l => l.status === 'Submitted')
    if (unsigned.length) tasks.push({ label: `${unsigned.length} weekly log(s) awaiting your signature`, tab: 'logs' })
  }
  if (can(ctx, 'review.decide')) {
    // Only submissions the current stage is actually about — a plagiarism
    // certificate sitting at URO clearance is not Instructor 1's review queue.
    const relevant = new Set(allowedDocTypes(b.project.currentStage).filter(t => REVIEWABLE_TYPES.includes(t)))
    const awaiting = b.documents.filter(d => d.status === DOC_STATUS.SUBMITTED && relevant.has(d.docType))
    if (awaiting.length) tasks.push({ label: `${awaiting.length} submission(s) awaiting review`, tab: 'documents' })
  }
  if (ctx.isMember) {
    const returned = b.documents.filter(d => d.status === DOC_STATUS.FOR_REVISION)
    if (returned.length) tasks.push({ label: `${returned.length} submission(s) returned for revision`, tab: 'documents' })
    if (b.project.revisionDeadline) {
      const left = Math.ceil((new Date(b.project.revisionDeadline) - Date.now()) / 864e5)
      if (left <= 7) {
        tasks.push({
          label: left < 0 ? `Revisions overdue by ${Math.abs(left)} day(s)` : `Revisions due in ${left} day(s)`,
          tab: 'defense', urgent: true,
        })
      }
    }
  }
  if (can(ctx, 'form.sign')) {
    const waiting = b.forms.filter(f =>
      f.status !== 'Completed' && f.signatories?.some(s => s.userId === me.id && !s.signedAt))
    if (waiting.length) tasks.push({ label: `${waiting.length} form(s) awaiting your signature`, tab: 'forms' })
  }
  if ((roles.includes('Panel Chair') || roles.includes('Panel Member')) && b.project.currentStage.endsWith('DEFENSE')) {
    const mine = b.annotations.filter(a => a.authorId === me.id)
    if (!mine.length) tasks.push({ label: 'No pre-defense annotations recorded yet', tab: 'documents' })
  }
  return tasks
}

export function worklist(snap, me) {
  if (!me) return []
  return (snap.projects ?? [])
    .map(p => {
      const b = bundle(snap, p.id)
      const access = projectAccess(me, b)
      if (access.level === 'none') return null
      const ctx = resolveContext(me, b)
      const stage = stageByKey(p.currentStage)
      const gates = (stage?.gates ?? [])
        .filter(g => can(ctx, g.capability))
        .map(g => ({ gate: g, blocker: g.requires(b) }))
      const tasks = access.level === 'work' ? pendingTasks(b, ctx, me) : []
      return { project: p, bundle: b, ctx, access, gates, tasks, stage }
    })
    .filter(Boolean)
    .sort((a, b2) => {
      const score = (r) => (r.gates.some(g => !g.blocker) ? 0 : r.tasks.length ? 1 : r.access.level === 'work' ? 2 : 3)
      return score(a) - score(b2)
    })
}

export const actionableCount = (rows) =>
  rows.filter(r => r.gates.some(g => !g.blocker) || r.tasks.length).length
