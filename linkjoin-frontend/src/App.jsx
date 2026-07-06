import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuth } from './context/AuthContext.jsx'

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
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
import DPA from './pages/DPA.jsx'
import PrivacySchools from './pages/PrivacySchools.jsx'
import Subprocessors from './pages/Subprocessors.jsx'
import BreachPolicy from './pages/BreachPolicy.jsx'
import AdminDashboard from './pages/AdminDashboard.jsx'
import Settings from './pages/Settings.jsx'
import School from './pages/School.jsx'
import SchoolAttendance from './pages/SchoolAttendance.jsx'
import NewAttendance from './pages/NewAttendance.jsx'
import SchoolDashboards from './pages/SchoolDashboards.jsx'
import StudentProfile from './pages/StudentProfile.jsx'
import History from './pages/History.jsx'

const TEACHER_ROLES = new Set(['teacher', 'school_admin', 'district_admin'])

function PrivateRoute({ children }) {
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

export default function App() {
  return (
    <>
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
      <Route path="/addlink" element={<PrivateRoute><AddLink /></PrivateRoute>} />
      <Route path="/confirm" element={<ConfirmEmail />} />
      <Route path="/premeet" element={<PreMeet />} />
      <Route path="/contact" element={<Contact />} />
      <Route path="/dpa" element={<DPA />} />
      <Route path="/privacy-schools" element={<PrivacySchools />} />
      <Route path="/subprocessors" element={<Subprocessors />} />
      <Route path="/breach-policy" element={<BreachPolicy />} />
      <Route path="/schools" element={<School />} />
      <Route path="/schools/attendance" element={<NewAttendance />} />
      <Route path="/attendance" element={<Navigate to="/schools/attendance" replace />} />
      <Route path="/schools/new-attendance" element={<Navigate to="/schools/attendance" replace />} />
      <Route path="/schools/dashboards" element={<SchoolDashboards />} />
      <Route path="/admin" element={<TeacherRoute><AdminDashboard /></TeacherRoute>} />
      <Route path="/settings" element={<PrivateRoute><Settings /></PrivateRoute>} />
      <Route path="/history" element={<PrivateRoute><History /></PrivateRoute>} />
      <Route path="/profile" element={<PrivateRoute><StudentProfile /></PrivateRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  )
}
