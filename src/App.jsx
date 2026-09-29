import { Suspense, lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useApp } from './state/AppContext.jsx'
import Shell from './components/Shell.jsx'
import SignIn from './pages/SignIn.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Projects from './pages/Projects.jsx'
import ProjectWorkspace from './pages/ProjectWorkspace.jsx'
import Records from './pages/Records.jsx'
import Reports from './pages/Reports.jsx'
import { AccountsPage, CaacPage, SettingsPage } from './pages/Admin.jsx'
import Audit from './pages/Audit.jsx'

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
      <Route element={<Shell />}>
        <Route index element={<Dashboard />} />
        <Route path="projects" element={<Projects />} />
        <Route path="projects/:id" element={<ProjectWorkspace />} />
        {/* Notifications are email only; an old link lands on the worklist. */}
        <Route path="notifications" element={<Navigate to="/" replace />} />
        <Route path="records" element={<Records />} />
        <Route path="reports" element={<Reports />} />
        <Route path="admin" element={<Navigate to="/admin/accounts" replace />} />
        <Route path="admin/accounts" element={<AccountsPage />} />
        <Route path="admin/caac" element={<CaacPage />} />
        <Route path="admin/settings" element={<SettingsPage />} />
        <Route path="audit" element={<Audit />} />
        {DevTools && (
          <Route path="dev" element={<Suspense fallback={<div className="page"><p className="muted">Loading…</p></div>}><DevTools /></Suspense>} />
        )}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
