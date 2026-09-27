import { Link } from 'react-router-dom'
import { useApp } from '../state/AppContext.jsx'
import { markNotificationRead } from '../services/actions.js'
import { Section, Empty, Badge, fmtDateTime } from '../components/ui.jsx'

export default function Notifications() {
  const { snap, me } = useApp()
  const rows = (snap.notifications ?? [])
    .filter(n => n.userId === me.id)
    .sort((a, b) => new Date(b.at) - new Date(a.at))
  const unread = rows.filter(n => !n.read)

  return (
    <div className="page">
      <header className="page-head">
        <div className="label">Notifications</div>
        <h1>Workflow notifications</h1>
        <p className="lede">
          Each of these is also an email, sent through Resend by the same event that updated the
          workflow record. There is no chat module — communication follows the workflow.
        </p>
      </header>

      <Section
        title={`${unread.length} unread`}
        aside={unread.length > 0
          ? <button className="quiet small" onClick={() => unread.forEach(n => markNotificationRead(n.id))}>
              Mark all read
            </button>
          : null}
      >
        {rows.length === 0 && <Empty>No notifications yet.</Empty>}
        {rows.map(n => (
          <div className={`entry${n.read ? ' is-read' : ''}`} key={n.id}>
            <div className="entry-head">
              <strong style={{ fontSize: 13 }}>{n.title}</strong>
              <span className="inline">
                <Badge tone={n.read ? 'neutral' : 'accent'}>{n.type}</Badge>
                <span className="faint small">{fmtDateTime(n.at)}</span>
              </span>
            </div>
            <p className="small muted" style={{ margin: '4px 0 0' }}>{n.body}</p>
            <div className="actions" style={{ marginTop: 8 }}>
              {n.projectId && <Link className="small" to={`/projects/${n.projectId}`}>Open project</Link>}
              {!n.read && <button className="quiet small" onClick={() => markNotificationRead(n.id)}>Mark read</button>}
            </div>
          </div>
        ))}
      </Section>
    </div>
  )
}
