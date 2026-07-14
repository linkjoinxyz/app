import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAuth } from './context/AuthContext.jsx'
import { ToastProvider } from './context/ToastContext.jsx'
import { useDarkMode } from './hooks/useDarkMode.js'

import { apiGet, apiPost } from './api/client.js'

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }) }, [pathname])
  return null
}
import Home from './pages/Home.jsx'
import NewHomepage from './pages/NewHomepage.jsx'
import Login from './pages/Login.jsx'
import Signup from './pages/Signup.jsx'
import Links from './pages/Links.jsx'
import Bookmarks from './pages/Bookmarks.jsx'
import Pricing from './pages/Pricing.jsx'
import Privacy from './pages/Privacy.jsx'
import Terms from './pages/Terms.jsx'
import ForgotPassword from './pages/ForgotPassword.jsx'
import ResetPassword from './pages/ResetPassword.jsx'
import AddLink from './pages/AddLink.jsx'
import ConfirmEmail from './pages/ConfirmEmail.jsx'
import Contact from './pages/Contact.jsx'
import AuthPage2 from './pages/AuthPage2.jsx'
import PreMeet from './pages/PreMeet.jsx'
import ClassLinkRedirect from './pages/ClassLinkRedirect.jsx'
import DPA from './pages/DPA.jsx'
import PrivacySchools from './pages/PrivacySchools.jsx'
import Subprocessors from './pages/Subprocessors.jsx'
import BreachPolicy from './pages/BreachPolicy.jsx'
import AdminDashboard from './pages/AdminDashboard.jsx'
import PlatformAdmin from './pages/PlatformAdmin.jsx'
import CreateOrg from './pages/CreateOrg.jsx'
import OrgDetail from './pages/OrgDetail.jsx'
import JoinInvite from './pages/JoinInvite.jsx'
import Settings from './pages/Settings.jsx'
import School from './pages/School.jsx'
import SchoolAttendance from './pages/SchoolAttendance.jsx'
import NewAttendance from './pages/NewAttendance.jsx'
import SchoolDashboards from './pages/SchoolDashboards.jsx'
import Demo from './pages/Demo.jsx'
import StudentProfile from './pages/StudentProfile.jsx'
import History from './pages/History.jsx'
import ParentPortal from './pages/ParentPortal.jsx'
import Notes from './pages/Notes.jsx'
import AdminOnboarding from './pages/AdminOnboarding.jsx'
import { Analytics } from '@vercel/analytics/react'
import IncidentBanner from './components/IncidentBanner.jsx'
import Status from './pages/Status.jsx'
import ApiDocs from './pages/ApiDocs.jsx'
import SLA from './pages/SLA.jsx'

const TEACHER_ROLES = new Set(['teacher', 'school_admin', 'district_admin'])

function IvToast() {
  const { role } = useAuth()
  const navigate = useNavigate()
  const [count, setCount] = useState(null)

  useEffect(() => {
    if (!TEACHER_ROLES.has(role)) return
    apiGet('/interventions?mine=true&unseen=true').then(ivs => {
      if (Array.isArray(ivs) && ivs.length > 0) setCount(ivs.length)
    }).catch(() => {})
  }, [role])

  if (!count) return null

  function dismiss() {
    setCount(null)
    apiPost('/interventions/acknowledge-mine', {}).catch(() => {})
  }

  return (
    <div className="iv-toast">
      <div className="iv-toast-body">
        You have {count} new intervention assignment{count !== 1 ? 's' : ''}.
      </div>
      <div className="iv-toast-actions">
        <button className="iv-toast-view" onClick={() => { navigate('/admin'); dismiss() }}>View</button>
        <button className="iv-toast-dismiss" onClick={dismiss}>&#x2715;</button>
      </div>
    </div>
  )
}

function PrivateRoute({ children }) {
  const { token, isOrgAdmin, onboardingDone } = useAuth()
  const location = useLocation()
  if (!token) return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`} replace />
  if (isOrgAdmin && !onboardingDone) return <Navigate to="/onboarding" replace />
  return <>{children}<IvToast /></>
}

function OnboardingRoute({ children }) {
  const { token } = useAuth()
  if (!token) return <Navigate to="/login" replace />
  return children
}

function TeacherRoute({ children }) {
  const { token, role } = useAuth()
  if (!token) return <Navigate to="/login?redirect=/admin" replace />
  if (!TEACHER_ROLES.has(role)) return <Navigate to="/meetings" replace />
  return children
}

function PlatformAdminRoute({ children }) {
  const { token, isAdmin } = useAuth()
  if (!token) return <Navigate to="/login" replace />
  if (!isAdmin) return <Navigate to="/meetings" replace />
  return children
}

function AppInner() {
  useDarkMode()
  return <IncidentBanner />
}

export default function App() {
  return (
    <ToastProvider>
      <AppInner />
      <ScrollToTop />
      <Routes>
      <Route path="/" element={<NewHomepage />} />
      <Route path="/old-homepage" element={<Home />} />
      <Route path="/login" element={<AuthPage2 defaultTab="login" />} />
      <Route path="/signup" element={<AuthPage2 defaultTab="signup" />} />
      <Route path="/pricing" element={<Pricing />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/tos" element={<Terms />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/meetings" element={<PrivateRoute><Links /></PrivateRoute>} />
      <Route path="/links" element={<Navigate to="/meetings" replace />} />
      <Route path="/bookmarks" element={<PrivateRoute><Bookmarks /></PrivateRoute>} />
      <Route path="/notes" element={<PrivateRoute><Notes /></PrivateRoute>} />
      <Route path="/addlink" element={<PrivateRoute><AddLink /></PrivateRoute>} />
      <Route path="/confirm" element={<ConfirmEmail />} />
      <Route path="/premeet" element={<PreMeet />} />
      <Route path="/c/:slug" element={<PrivateRoute><ClassLinkRedirect /></PrivateRoute>} />
      <Route path="/contact" element={<Contact />} />
      <Route path="/status" element={<Status />} />
      <Route path="/api-docs" element={<ApiDocs />} />
      <Route path="/sla" element={<SLA />} />
      <Route path="/dpa" element={<DPA />} />
      <Route path="/privacy-schools" element={<PrivacySchools />} />
      <Route path="/subprocessors" element={<Subprocessors />} />
      <Route path="/breach-policy" element={<BreachPolicy />} />
      <Route path="/schools" element={<School />} />
      <Route path="/schools/attendance" element={<NewAttendance />} />
      <Route path="/attendance" element={<Navigate to="/schools/attendance" replace />} />
      <Route path="/schools/new-attendance" element={<Navigate to="/schools/attendance" replace />} />
      <Route path="/schools/dashboards" element={<SchoolDashboards />} />
      <Route path="/demo" element={<Demo />} />
      <Route path="/admin/*" element={<TeacherRoute><AdminDashboard /></TeacherRoute>} />
      <Route path="/platform" element={<PlatformAdminRoute><PlatformAdmin /></PlatformAdminRoute>} />
      <Route path="/platform/orgs/new" element={<PlatformAdminRoute><CreateOrg /></PlatformAdminRoute>} />
      <Route path="/platform/orgs/:orgId" element={<PlatformAdminRoute><OrgDetail /></PlatformAdminRoute>} />
      <Route path="/join/:token" element={<JoinInvite />} />
      <Route path="/settings" element={<PrivateRoute><Settings /></PrivateRoute>} />
      <Route path="/history" element={<PrivateRoute><History /></PrivateRoute>} />
      <Route path="/profile" element={<PrivateRoute><StudentProfile /></PrivateRoute>} />
      <Route path="/parent" element={<PrivateRoute><ParentPortal /></PrivateRoute>} />
      <Route path="/onboarding" element={<OnboardingRoute><AdminOnboarding /></OnboardingRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
      <Analytics />
    </ToastProvider>
  )
}
