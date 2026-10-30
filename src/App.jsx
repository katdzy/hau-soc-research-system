import { Suspense, lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useApp } from './state/AppContext.jsx'
import Shell from './components/Shell.jsx'
import SignIn from './pages/SignIn.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Projects from './pages/Projects.jsx'
import ProjectWorkspace from './pages/ProjectWorkspace.jsx'
import Records from './pages/Records.jsx'
import BlankForms from './pages/BlankForms.jsx'
import Reports from './pages/Reports.jsx'
import { AccountsPage, CaacPage, SettingsPage } from './pages/Admin.jsx'
import Audit from './pages/Audit.jsx'
import { WorkspaceProvider } from './components/Workspace.jsx'
import {
  Advisees, WeeklyLogs, Versions, Completed, Panels, Rosters, Defended, Scheduling,
  Routing, AdviserApprovals, Approvals, School, Completions, Clearance, Cleared,
} from './pages/WorkViews.jsx'

// R9: dev tools exist only in dev builds; this import is dropped from production.
const DevTools = import.meta.env.DEV ? lazy(() => import('./dev/DevTools.jsx')) : null

export default function App() {
  const { me, ready, snap } = useApp()

  if (!ready) {
    return <div className="page"><p className="muted">Loading workspace…</p></div>
  }

  const isSeeding = (snap.users ?? []).length === 0

  if (!me) return <SignIn seeding={isSeeding} />

  return (
    <Routes>
      <Route element={<WorkspaceProvider><Shell /></WorkspaceProvider>}>
        <Route index element={<Dashboard />} />
        <Route path="projects" element={<Projects />} />
        <Route path="projects/:id" element={<ProjectWorkspace />} />
        {/* Notifications are email only; an old link lands on the worklist. */}
        <Route path="notifications" element={<Navigate to="/" replace />} />
        <Route path="records" element={<Records />} />
        <Route path="forms" element={<BlankForms />} />
        <Route path="reports" element={<Reports />} />
        <Route path="admin" element={<Navigate to="/admin/accounts" replace />} />
        <Route path="admin/accounts" element={<AccountsPage />} />
        <Route path="admin/caac" element={<CaacPage />} />
        <Route path="admin/settings" element={<SettingsPage />} />
        <Route path="audit" element={<Audit />} />
        {/* Each "Acting as" context's rail (domain/workspaces.js). */}
        <Route path="advisees" element={<Advisees />} />
        <Route path="weekly-logs" element={<WeeklyLogs />} />
        <Route path="versions" element={<Versions />} />
        <Route path="completed" element={<Completed />} />
        <Route path="panels" element={<Panels />} />
        <Route path="rosters" element={<Rosters />} />
        <Route path="defended" element={<Defended />} />
        <Route path="scheduling" element={<Scheduling />} />
        <Route path="routing" element={<Routing />} />
        <Route path="adviser-approvals" element={<AdviserApprovals />} />
        <Route path="approvals" element={<Approvals />} />
        <Route path="school" element={<School />} />
        <Route path="completions" element={<Completions />} />
        <Route path="clearance" element={<Clearance />} />
        <Route path="cleared" element={<Cleared />} />
        {DevTools && (
          <Route path="dev" element={<Suspense fallback={<div className="page"><p className="muted">Loading…</p></div>}><DevTools /></Suspense>} />
        )}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
