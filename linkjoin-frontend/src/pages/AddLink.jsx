import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { linksApi } from '../api/links.js'

export default function AddLink() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [status, setStatus] = useState('loading')

  useEffect(() => {
    const id = params.get('id')
    if (!id) { navigate('/meetings'); return }

    linksApi.addLink(id)
      .then(() => {
        setStatus('success')
        setTimeout(() => navigate('/meetings'), 1200)
      })
      .catch(e => {
        if (e.status === 409) { navigate('/meetings'); return }
        setStatus('error')
      })
  }, [])

  return (
    <div style={{
      display: 'flex', justifyContent: 'center', alignItems: 'center',
      height: '100vh', flexDirection: 'column', gap: 20,
      color: 'white', background: 'var(--dark)',
    }}>
      {status === 'loading' && <div style={{ fontSize: 18 }}>Adding link to your account...</div>}
      {status === 'success' && <div style={{ fontSize: 18 }}>Link added! Redirecting...</div>}
      {status === 'error' && (
        <>
          <div style={{ fontSize: 18 }}>This link could not be found or has already been used.</div>
          <a href="/meetings" style={{ color: 'var(--lightblue)', fontSize: 16 }}>Go to Meetings</a>
        </>
      )}
    </div>
  )
}
