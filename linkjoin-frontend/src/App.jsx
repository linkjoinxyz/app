import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext.jsx'
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

function PrivateRoute({ children }) {
  const { token } = useAuth()
  if (!token) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  return (
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
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
