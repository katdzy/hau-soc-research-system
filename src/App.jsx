import { Routes, Route, Navigate } from 'react-router-dom'
import { useApp } from './state/AppContext.jsx'
import { GLOBAL_ROLES as G, PROJECT_ROLES as P } from './domain/constants.js'
import Shell from './components/Shell.jsx'
import { Restricted } from './components/ui.jsx'
import SignIn from './pages/SignIn.jsx'
import Worklist from './pages/Dashboard.jsx'
import Projects from './pages/Projects.jsx'
import ProjectWorkspace from './pages/ProjectWorkspace.jsx'
import Records from './pages/Records.jsx'
import Reports from './pages/Reports.jsx'
import Accounts from './pages/admin/Accounts.jsx'
import Caac from './pages/admin/Caac.jsx'
import Audit from './pages/Audit.jsx'
import EmailLog from './pages/EmailLog.jsx'
import StudentDashboard from './pages/student/StudentDashboard.jsx'
import MyProject from './pages/student/MyProject.jsx'
import Submit from './pages/student/Submit.jsx'
import VersionHistory from './pages/student/VersionHistory.jsx'
import Feedback from './pages/student/Feedback.jsx'
import StudentLogs from './pages/student/StudentLogs.jsx'
import StudentDefense from './pages/student/StudentDefense.jsx'
import FinalRequirements from './pages/student/FinalRequirements.jsx'
import ReviewWorkspace from './pages/faculty/ReviewWorkspace.jsx'
import { AdviserDashboard, MyAdvisees, ReviewQueue, LogSignoff } from './pages/faculty/AdviserPages.jsx'
import { MyAnnotations, RevisionSignoffs, GateListPage } from './pages/faculty/SharedPages.jsx'
import {
  PanelDashboard, AssignedPanels, Manuscripts, DefensePack, EvaluationForm, VerdictRecording,
} from './pages/faculty/PanelPages.jsx'
import { CoordinatorDashboard, AdviserAssignment, PanelAssignment } from './pages/coordinator/CoordinatorPages.jsx'

// One route table; what a path shows depends on the "acting as" context —
// /logs is the student's logger for a student and the sign-off queue for an
// Adviser. A path with no page for the current context says so.

const PANEL = [P.PANEL_MEMBER, P.PANEL_CHAIR]

function ByContext({ pages }) {
  const { actingAs } = useApp()
  const Page = pages[actingAs]
  return Page ? <Page /> : <Restricted>This page is not part of your current context. Switch context from “Acting as” at the top.</Restricted>
}

const forRoles = (roles, Page) => Object.fromEntries(roles.map(r => [r, Page]))

const DefenseClearance = () => (
  <GateListPage title="Defense clearance" capabilities={['finaldefense.recommend']}
    lede="Submit the Capstone Recommendation Form (FM-AAC-SOC-2005) when a group’s weekly logs and final manuscript are ready."
    empty="No advisee group is in Implementation." />
)
const DefenseEndorsement = () => (
  <GateListPage title="Defense endorsement" capabilities={['finaldefense.endorse']}
    lede="After the Adviser’s recommendation, endorse the group for final defense scheduling. Instructor 2, assigned by the System Administrator, then publishes the schedule."
    empty="No Adviser recommendation is waiting." />
)
const ClearanceRouting = () => (
  <GateListPage title="Clearance routing" capabilities={['clearance.endorse']}
    lede="Once the Adviser and panel have signed the Approval Sheet and both certificates are in, endorse and sign it to route the project to the URO."
    empty="No project is waiting for your endorsement." />
)

export default function App() {
  const { me, ready, snap } = useApp()

  if (!ready || (snap.users ?? []).length === 0) {
    return <div className="page"><p className="muted">Loading workspace…</p></div>
  }
  if (!me) return <SignIn />

  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<ByContext pages={{
          [G.STUDENT]: StudentDashboard,
          [P.ADVISER]: AdviserDashboard,
          ...forRoles(PANEL, PanelDashboard),
          [G.COORDINATOR]: CoordinatorDashboard,
          [G.ADMIN]: Accounts,
          ...forRoles([P.INSTRUCTOR_1, P.INSTRUCTOR_2, G.DEAN, G.ASSOCIATE_DEAN, G.URO], Worklist),
        }} />} />

        {/* Student */}
        <Route path="project" element={<ByContext pages={{ [G.STUDENT]: MyProject }} />} />
        <Route path="submit" element={<ByContext pages={{ [G.STUDENT]: Submit }} />} />
        <Route path="versions" element={<ByContext pages={{ [G.STUDENT]: VersionHistory }} />} />
        <Route path="feedback" element={<ByContext pages={{ [G.STUDENT]: Feedback }} />} />
        <Route path="defense" element={<ByContext pages={{ [G.STUDENT]: StudentDefense }} />} />
        <Route path="final" element={<ByContext pages={{ [G.STUDENT]: FinalRequirements }} />} />
        <Route path="logs" element={<ByContext pages={{ [G.STUDENT]: StudentLogs, [P.ADVISER]: LogSignoff }} />} />

        {/* Adviser and panel */}
        <Route path="advisees" element={<ByContext pages={{ [P.ADVISER]: MyAdvisees }} />} />
        <Route path="queue" element={<ByContext pages={{ [P.ADVISER]: ReviewQueue }} />} />
        <Route path="annotations" element={<ByContext pages={forRoles([P.ADVISER, ...PANEL], MyAnnotations)} />} />
        <Route path="revisions" element={<ByContext pages={forRoles([P.ADVISER, ...PANEL], RevisionSignoffs)} />} />
        <Route path="panels" element={<ByContext pages={forRoles(PANEL, AssignedPanels)} />} />
        <Route path="manuscripts" element={<ByContext pages={forRoles(PANEL, Manuscripts)} />} />
        <Route path="summaries" element={<ByContext pages={forRoles(PANEL, DefensePack)} />} />
        <Route path="evaluation" element={<ByContext pages={forRoles(PANEL, EvaluationForm)} />} />
        <Route path="verdict" element={<ByContext pages={{ [P.PANEL_CHAIR]: VerdictRecording }} />} />
        <Route path="review/:docId" element={<ReviewWorkspace />} />

        {/* Coordinator */}
        <Route path="clearance" element={<ByContext pages={{ [P.ADVISER]: DefenseClearance, [G.COORDINATOR]: ClearanceRouting }} />} />
        <Route path="adviser-assignment" element={<ByContext pages={{ [G.COORDINATOR]: AdviserAssignment }} />} />
        <Route path="panel-assignment" element={<ByContext pages={{ [G.COORDINATOR]: PanelAssignment }} />} />
        <Route path="endorsement" element={<ByContext pages={{ [G.COORDINATOR]: DefenseEndorsement }} />} />

        {/* Shared */}
        <Route path="projects" element={<Projects />} />
        <Route path="projects/:id" element={<ProjectWorkspace />} />
        <Route path="records" element={<Records />} />
        <Route path="reports" element={<Reports />} />
        <Route path="caac" element={<Caac />} />
        <Route path="audit" element={<Audit />} />
        <Route path="emails" element={<EmailLog />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
