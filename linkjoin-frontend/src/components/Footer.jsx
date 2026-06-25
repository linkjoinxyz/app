import { Link } from 'react-router-dom'

export default function Footer() {
  return (
    <footer>
      <div className="column-container">
        <div className="footer-column">
          <p className="title">Contact</p>
          <a href="mailto:seth@linkjoin.xyz">seth@linkjoin.xyz</a>
          <p style={{ margin: 0 }}>(925) 360-3457</p>
        </div>
        <div className="footer-column">
          <p className="title">Pages</p>
          <Link to="/login">Login</Link>
          <Link to="/signup">Signup</Link>
          <Link to="/pricing">Pricing</Link>
          <Link to="/meetings">Meetings</Link>
          <Link to="/bookmarks">Bookmarks</Link>
          <Link to="/privacy">Privacy Policy</Link>
        </div>
      </div>
      <div className="copyright">
        <hr />
        <p>© Copyright {new Date().getFullYear()} LinkJoin. All rights reserved.</p>
      </div>
    </footer>
  )
}
