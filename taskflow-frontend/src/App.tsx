import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom'
import { ThemeProvider } from './context/ThemeContext'
import AppShell from './components/AppShell'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import VerifyEmailPage from './pages/VerifyEmailPage'
import BoardPage from './pages/BoardPage'
import AcceptInvitePage from './pages/AcceptInvitePage'
import MembersPage from './pages/MembersPage'
import UserPreferencesPage from './pages/UserPreferencesPage'
import MyWorkPage from './pages/MyWorkPage'
import DashboardPage from './pages/DashboardPage'
import ProjectAuditLogPage from './pages/ProjectAuditLogPage'
import ProjectSettingsPage from './pages/ProjectSettingsPage'
import InstanceAdminPage from './pages/InstanceAdminPage'
import IssuesPage from './pages/IssuesPage'
import ExportImportPage from './pages/ExportImportPage'
import PublicSharePage from './pages/PublicSharePage'
import HelpPage from './pages/HelpPage'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
})

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('access_token')
  if (!token) return <Navigate to="/login" replace />
  return <>{children}</>
}

// '/' is the only route that forks on auth: signed-out visitors get the
// marketing landing page, frameless like the auth pages; everything else falls
// through to the shell routes below. Uses the same auth signal as RequireAuth
// (presence of the stored access token) so an expired-but-present token still
// renders the app — and refreshes or bounces there — instead of flashing
// marketing at a logged-in user.
function LandingGate() {
  const { pathname } = useLocation()
  if (pathname === '/' && !localStorage.getItem('access_token')) return <LandingPage />
  return <Outlet />
}

export default function App() {
  return (
    <ThemeProvider>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          {/* Frameless (no app shell): auth flows, public pages, redirect stubs */}
          <Route path="/about" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/share/:token" element={<PublicSharePage />} />
          <Route path="/invites/:token" element={<AcceptInvitePage />} />
          <Route
            path="/projects/:workspaceId/members"
            element={
              <RequireAuth>
                <MembersPage />
              </RequireAuth>
            }
          />

          {/* LandingGate: signed-out '/' → frameless landing page; everything else passes through */}
          <Route element={<LandingGate />}>
          <Route element={<AppShell />}>
            <Route
              path="/projects/:workspaceId"
              element={
                <RequireAuth>
                  <BoardPage />
                </RequireAuth>
              }
            />
            <Route
              path="/"
              element={
                <RequireAuth>
                  <BoardPage />
                </RequireAuth>
              }
            />
            <Route
              path="/projects/:workspaceId/issues"
              element={
                <RequireAuth>
                  <IssuesPage />
                </RequireAuth>
              }
            />
            <Route
              path="/projects/:workspaceId/export"
              element={
                <RequireAuth>
                  <ExportImportPage />
                </RequireAuth>
              }
            />
            <Route
              path="/projects/:workspaceId/audit-log"
              element={
                <RequireAuth>
                  <ProjectAuditLogPage />
                </RequireAuth>
              }
            />
            <Route
              path="/projects/:workspaceId/settings"
              element={
                <RequireAuth>
                  <ProjectSettingsPage />
                </RequireAuth>
              }
            />
            <Route
              path="/preferences"
              element={
                <RequireAuth>
                  <UserPreferencesPage />
                </RequireAuth>
              }
            />
            <Route
              path="/my-work"
              element={
                <RequireAuth>
                  <MyWorkPage />
                </RequireAuth>
              }
            />
            <Route
              path="/dashboard"
              element={
                <RequireAuth>
                  <DashboardPage />
                </RequireAuth>
              }
            />
            <Route
              path="/admin"
              element={
                <RequireAuth>
                  <InstanceAdminPage />
                </RequireAuth>
              }
            />
            <Route path="/help" element={<HelpPage />} />
          </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
    </ThemeProvider>
  )
}
