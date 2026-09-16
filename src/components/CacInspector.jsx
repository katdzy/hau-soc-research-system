import { useState } from 'react'
import { CAPABILITIES, cacTag } from '../domain/cac.js'

/**
 * Makes the access decision auditable by eye: which dimension granted each
 * capability, and which project role carried it. This is the demonstration
 * surface for CAC — without it, "contextual" access looks identical to RBAC.
 */
export default function CacInspector({ ctx, access, project }) {
  const [open, setOpen] = useState(true)
  const grants = [...ctx.grants.entries()]
  const global = grants.filter(([, v]) => v.dimension === 'Global Role')
  const scoped = grants.filter(([, v]) => v.dimension === 'Project Role')

  return (
    <aside className="inspector">
      <div className="panel">
        <div className="section-head" style={{ marginBottom: 12 }}>
          <h2 style={{ fontSize: 14 }}>CAC Inspector</h2>
          <button className="quiet small" onClick={() => setOpen(o => !o)}>
            {open ? 'Hide' : 'Show'}
          </button>
        </div>

        <dl className="kv" style={{ gridTemplateColumns: '92px minmax(0,1fr)' }}>
          <dt>Global role</dt>
          <dd><span className="tag">{cacTag(ctx.globalRole)}</span></dd>
          <dt>Project roles</dt>
          <dd>
            {ctx.projectRoles.length
              ? <span className="inline" style={{ gap: 4 }}>
                  {ctx.projectRoles.map(r => <span key={r} className="tag">{cacTag(r)}</span>)}
                </span>
              : <span className="faint">none on this project</span>}
          </dd>
          <dt>Visibility</dt>
          <dd className="small">
            {access.level === 'work' ? 'Full workspace' : access.level === 'observe' ? 'Observation only' : 'No access'}
            <div className="faint" style={{ fontSize: 11.5 }}>{access.reason}</div>
          </dd>
        </dl>

        {open && (
          <>
            <div className="divider" />
            <div className="label" style={{ marginBottom: 6 }}>
              Granted institution-wide ({global.length})
            </div>
            {global.length === 0 && <p className="faint small">No institution-wide capability. All authority on this project is contextual.</p>}
            {global.map(([cap, via]) => (
              <div className="grant" key={cap}>
                <div className="cap">{cap}</div>
                <div className="via">{CAPABILITIES[cap]}</div>
                <div className="via">via {via.role}</div>
              </div>
            ))}

            <div className="label" style={{ margin: '16px 0 6px' }}>
              Granted by this project ({scoped.length})
            </div>
            {scoped.length === 0 && <p className="faint small">No project-based grants here.</p>}
            {scoped.map(([cap, via]) => (
              <div className="grant" key={cap}>
                <div className="cap">{cap}</div>
                <div className="via">{CAPABILITIES[cap]}</div>
                <div className="via">via {via.role} on “{project.title}”</div>
              </div>
            ))}
          </>
        )}
      </div>
    </aside>
  )
}
