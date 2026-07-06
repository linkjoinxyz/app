import { useNavigate, useSearchParams } from 'react-router-dom'
import HeaderModern from '../components/HeaderModern.jsx'
import HistoryPanel from '../components/HistoryPanel.jsx'
import '../styles/settings.css'

export default function History() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const linkId = searchParams.get('link_id') || null
  const linkName = searchParams.get('link_name') || null
  const title = linkName ? `${linkName} · History` : 'Meeting Open Log'

  return (
    <div className="settings-root">
      <HeaderModern page="history" />
      <div className="history-page">
        <div className="history-page-header">
          <div className="history-page-title-group">
            <button className="history-back-btn" onClick={() => navigate(-1)}>← Back</button>
            <h1 className="history-page-title">{title}</h1>
          </div>
        </div>
        <HistoryPanel linkId={linkId} linkName={linkName} />
      </div>
    </div>
  )
}
