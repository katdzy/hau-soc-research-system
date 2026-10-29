import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useApp } from '../state/AppContext.jsx'
import { useWorkspace } from '../components/Workspace.jsx'
import { Section, firstName } from '../components/ui.jsx'
import { accountType } from '../domain/constants.js'
import { DeskHead } from './dashboards/parts.jsx'
import StudentDesk from './dashboards/StudentDesk.jsx'
import {
  AdviserDesk, PanelDesk, Instructor1Desk, Instructor2Desk, CoordinatorDesk, DeanDesk, UroDesk, AdminDesk,
} from './dashboards/Desks.jsx'

// The first screen after login (Figma 01 · Dashboards): one dashboard per
// "Acting as" context. Switching context in the top bar switches the desk.

export default function Dashboard() {
  const { me } = useApp()
  const { current, inContext } = useWorkspace()
  const location = useLocation()
  const navigate = useNavigate()
  // A one-time notice from the workspace (see ProjectWorkspace). It belongs to
  // the user it was written for and is cleared from history once read, so a
  // reload or a persona switch does not show it again.
  const [flash] = useState(() => location.state?.notice ? { userId: location.state.forUserId, text: location.state.notice } : null)
  const notice = flash?.userId === me.id ? flash.text : null
  useEffect(() => {
    if (location.state?.notice) navigate(location.pathname, { replace: true, state: null })
  }, [location, navigate])

  const props = { rows: inContext, notice }

  switch (current?.key) {
    case 'student':
      return (
        <div className="page">
          <DeskHead notice={notice} sub={<>Good day, {firstName(me.name)}. {owesLine(inContext)}</>} />
          {inContext.map(r => <StudentDesk key={r.project.id} r={r} />)}
          <p className="faint small measure">
            Approvals, returned work, schedules, verdicts and deadlines are emailed to {me.email}.
          </p>
        </div>
      )
    case 'adviser': return <AdviserDesk {...props} />
    case 'panel-chair': return <PanelDesk {...props} chair />
    case 'panel-member': return <PanelDesk {...props} />
    case 'instructor-1': return <Instructor1Desk {...props} />
    case 'instructor-2': return <Instructor2Desk {...props} />
    case 'coordinator': return <CoordinatorDesk {...props} />
    case 'dean': case 'associate-dean': return <DeanDesk {...props} role={current.role} />
    case 'uro': return <UroDesk {...props} />
    case 'admin': return <AdminDesk {...props} />
    default: return <NoContext />
  }
}

const owesLine = (rows) => {
  const n = rows.reduce((k, r) => k + r.tasks.length, 0)
  return n ? `Your group has ${n} thing${n > 1 ? 's' : ''} to do.` : 'Nothing is waiting on your group right now.'
}

/** An account that holds no role yet: an ungrouped student (T14), or faculty with no assignment. */
function NoContext() {
  const { me } = useApp()
  const student = accountType(me.email) === 'Student'
  return (
    <div className="page">
      <DeskHead sub={`Good day, ${firstName(me.name)}. ${student ? 'You are not in a project group yet.' : 'You hold no role on a project yet.'}`} />
      <Section title="What happens next">
        <p className="measure m-0">
          {student
            ? <>Students don’t form their own groups. The Instructor 1 of your section
              {me.block ? ` (${me.block})` : ''} creates the groups and adds you to one. Your group’s
              workspace, stage, adviser and deadlines appear here once they do, and you’ll get an
              email at {me.email}.</>
            : <>Your account is active. Advising, panel and instructor roles are given per project by the
              Program Chair/Coordinator or an Instructor 1; each one appears here, and under “Acting as”,
              once it is assigned. You’ll get an email at {me.email}.</>}
        </p>
      </Section>
    </div>
  )
}
