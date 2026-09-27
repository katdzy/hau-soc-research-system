// What each signed-in user owes the system right now. Gate actions come from
// the stage machine; the softer tasks (unsigned logs, returned drafts, forms at
// your turn) come from the same project bundle. Nothing here checks a role
// name — every row is the result of CAAC resolution for this user, on this
// project, at this stage.

import { bundle } from './core.js'
import { resolveContext, can, projectAccess, allowedDocTypes } from '../domain/caac.js'
import { stageByKey } from '../domain/stages.js'
import { canSign } from '../domain/forms.js'
import { DOC_STATUS, REVIEWABLE_TYPES } from '../domain/constants.js'

function pendingTasks(b, ctx, me) {
  const tasks = []

  if (can(ctx, 'weeklylog.sign')) {
    const waiting = b.weeklyLogs.filter(l => l.status === 'Submitted')
    if (waiting.length) tasks.push({ label: `${waiting.length} weekly log(s) awaiting your review`, tab: 'logs' })
  }
  if (can(ctx, 'milestone.confirm') && !b.project.milestonesConfirmedAt) {
    tasks.push({ label: 'Capstone 2 milestones not yet confirmed', tab: 'logs' })
  }
  if (can(ctx, 'review.decide')) {
    const relevant = new Set(allowedDocTypes(b.project.currentStage).filter(t => REVIEWABLE_TYPES.includes(t)))
    const waiting = b.documents.filter(d => d.status === DOC_STATUS.SUBMITTED && relevant.has(d.docType))
    if (waiting.length) tasks.push({ label: `${waiting.length} submission(s) awaiting your decision`, tab: 'documents' })
  }
  if (ctx.isMember) {
    const returned = b.documents.filter(d => d.status === DOC_STATUS.FOR_REVISION)
    if (returned.length) tasks.push({ label: `${returned.length} submission(s) returned for revision`, tab: 'documents' })
    const returnedLogs = b.weeklyLogs.filter(l => l.status === 'Returned')
    if (returnedLogs.length && can(ctx, 'weeklylog.submit')) {
      tasks.push({ label: `Week ${returnedLogs.at(-1).weekNo} log was returned — resubmit it`, tab: 'logs' })
    }
    if (b.project.revisionDeadline) {
      const left = Math.ceil((new Date(b.project.revisionDeadline) - Date.now()) / 864e5)
      tasks.push({
        label: left < 0 ? `Revisions overdue by ${Math.abs(left)} day(s)` : `Revisions due in ${left} day(s)`,
        tab: 'defense', urgent: left <= 2,
      })
    }
  }
  const toSign = b.forms.filter(f => canSign(f, me, b).ok)
  if (toSign.length) tasks.push({ label: `${toSign.map(f => f.formType).join(', ')} awaiting your signature`, tab: 'forms' })

  if (can(ctx, 'annotation.private') && b.project.currentStage.endsWith('DEFENSE')) {
    if (!b.annotations.some(a => a.authorId === me.id)) {
      tasks.push({ label: 'No pre-defense notes recorded yet', tab: 'documents' })
    }
  }
  return tasks
}

export function worklist(snap, me) {
  if (!me) return []
  return (snap.projects ?? [])
    .map(p => {
      const b = bundle(snap, p.id)
      const access = projectAccess(me, b)
      if (!access.visible) return null
      const ctx = resolveContext(me, b)
      const stage = stageByKey(p.currentStage)
      const gates = (stage?.gates ?? [])
        .filter(g => can(ctx, g.capability))
        .map(g => ({ gate: g, blocker: g.requires(b, me) }))
      const tasks = pendingTasks(b, ctx, me)
      return { project: p, bundle: b, ctx, access, gates, tasks, stage }
    })
    .filter(Boolean)
    .sort((a, b2) => {
      const score = (r) => (r.gates.some(g => !g.blocker) ? 0 : r.tasks.length ? 1 : r.gates.length ? 2 : 3)
      return score(a) - score(b2)
    })
}

export const isActionable = (r) => r.gates.length > 0 || r.tasks.length > 0
export const actionableCount = (rows) => rows.filter(isActionable).length
