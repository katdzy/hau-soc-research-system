import { CAPABILITIES, caacTag } from '../domain/caac.js'
import { stageLabel } from '../domain/stages.js'
import { GLOBAL_ROLES as G } from '../domain/constants.js'

/**
 * Makes the access decision readable. For every role the user holds, it lists
 * what that role grants on THIS project at THIS stage, and what the same role
 * would grant under a different context. The second list is the point: under
 * RBAC it could not exist, because a role's permissions never change.
 */
export default function CaacInspector({ ctx, project }) {
  const roles = [
    ...ctx.globalRoles.map(role => ({ role, dimension: 'Global Role' })),
    ...ctx.projectRoles.map(role => ({ role, dimension: 'Project-Based Role' })),
  ]
  const byRole = roles
    .map(r => ({
      ...r,
      on: ctx.active.filter(a => a.role === r.role),
      off: ctx.dormant.filter(d => d.role === r.role),
    }))
    .filter(r => r.on.length || r.off.length)
  const coordinator = ctx.globalRoles.includes(G.COORDINATOR)

  return (
    <section className="panel inspector" aria-labelledby="caac-h">
      <h2 id="caac-h" className="inspector-title">CAAC Inspector</h2>
      <p className="faint small m-0 mt-half mb-2">
        Why you can — or cannot — act on this project right now.
      </p>

      <dl className="kv kv-tight">
        <dt>Stage</dt><dd>{stageLabel(project.currentStage)}</dd>
        <dt>Group member</dt><dd>{ctx.isMember ? 'Yes' : 'No'}</dd>
        {coordinator && (
          <>
            <dt>Program scope</dt>
            <dd>{(ctx.user.programScope ?? []).includes(project.program) ? 'Inside your programs' : 'Outside your programs'}</dd>
          </>
        )}
      </dl>

      {byRole.length === 0 && (
        <p className="small muted mt-2">
          You hold no role that applies to this project.
        </p>
      )}

      {byRole.map(r => (
        <div className="role-block" key={r.role}>
          <div className="role-head">
            <span className="tag">{caacTag(r.role)}</span>
            <span className="faint small">{r.dimension}</span>
          </div>
          {r.on.map(g => (
            <div className="grant on" key={g.cap}>
              <div className="cap"><span className="mark" aria-hidden="true" />{g.cap}</div>
              <div className="via">{CAPABILITIES[g.cap]} — {g.condition}</div>
            </div>
          ))}
          {r.off.length > 0 && (
            <details className="dormant">
              <summary className="small muted">
                {r.off.length} more under a different context
              </summary>
              {r.off.map(d => (
                <div className="grant off" key={d.cap}>
                  <div className="cap"><span className="mark" aria-hidden="true" />{d.cap}</div>
                  <div className="via">Needs: {d.unmet.join('; ')}</div>
                </div>
              ))}
            </details>
          )}
        </div>
      ))}
    </section>
  )
}
