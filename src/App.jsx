import { Routes, Route, Navigate } from 'react-router-dom'
import { useApp } from './state/AppContext.jsx'
import Shell from './components/Shell.jsx'
import SignIn from './pages/SignIn.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Projects from './pages/Projects.jsx'
import ProjectWorkspace from './pages/ProjectWorkspace.jsx'
import Notifications from './pages/Notifications.jsx'
import Records from './pages/Records.jsx'
import Reports from './pages/Reports.jsx'
import Admin from './pages/Admin.jsx'
import Audit from './pages/Audit.jsx'

export default function App() {
  const { me, ready, snap } = useApp()

  if (!ready || (snap.users ?? []).length === 0) {
    return <div className="page"><p className="muted">Loading workspace…</p></div>
  }
  if (!me) return <SignIn />

  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Dashboard />} />
        <Route path="projects" element={<Projects />} />
        <Route path="projects/:id" element={<ProjectWorkspace />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="records" element={<Records />} />
        <Route path="reports" element={<Reports />} />
        <Route path="admin" element={<Admin />} />
        <Route path="audit" element={<Audit />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
