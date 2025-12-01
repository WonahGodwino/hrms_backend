// src/app/page.tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import { apiDocs } from './lib/apiDocs'

export default function Home() {
  // Group endpoints by category
  const groups = useMemo(
    () =>
      Array.from(
        apiDocs.reduce((map, doc) => {
          if (!map.has(doc.group)) map.set(doc.group, [])
          map.get(doc.group)!.push(doc)
          return map
        }, new Map<string, typeof apiDocs>())
      ),
    []
  )

  const [selectedId, setSelectedId] = useState(apiDocs[0]?.id ?? '')
  const selectedApi = apiDocs.find((a) => a.id === selectedId) ?? apiDocs[0]

  // Helper to derive default request body, allowing optional `sample` on docs
  const getDefaultBody = (api: (typeof apiDocs)[number] | undefined) => {
    if (!api || api.method !== 'POST') return ''
    const maybeSample = (api as any).sample
    return maybeSample
      ? JSON.stringify(maybeSample, null, 2)
      : '{ "example": "value" }'
  }

  const [pathOverride, setPathOverride] = useState(selectedApi?.path ?? '')
  const [token, setToken] = useState('')
  const [requestBody, setRequestBody] = useState<string>(() =>
    getDefaultBody(selectedApi)
  )
  const [responseText, setResponseText] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loginSuccess, setLoginSuccess] = useState(false)

  // Load token on mount
  useEffect(() => {
    const saved = localStorage.getItem('hrms_token')
    if (saved) setToken(saved)
  }, [])

  // Save token when it changes
  useEffect(() => {
    if (token) localStorage.setItem('hrms_token', token)
  }, [token])

  const handleSelectChange = (id: string) => {
    const api = apiDocs.find((a) => a.id === id)
    setSelectedId(id)
    if (api) {
      setPathOverride(api.path)

      if (api.method === 'POST') {
        setRequestBody(getDefaultBody(api))
      } else {
        setRequestBody('')
      }

      setResponseText('')
      setError(null)
    }
  }

  const handleSend = async () => {
    if (!selectedApi) return
    setIsLoading(true)
    setResponseText('')
    setError(null)

    try {
      const url = pathOverride
      const headers: Record<string, string> = {}

      if (selectedApi.method === 'POST')
        headers['Content-Type'] = 'application/json'
      if (token.trim()) headers['Authorization'] = `Bearer ${token.trim()}`

      const options: RequestInit = { method: selectedApi.method, headers }
      if (selectedApi.method === 'POST' && requestBody.trim()) {
        options.body = requestBody
      }

      const res = await fetch(url, options)
      const contentType = res.headers.get('content-type') || ''

      let json: any = null
      if (contentType.includes('application/json')) {
        json = await res.json()
        setResponseText(JSON.stringify(json, null, 2))
      } else {
        const text = await res.text()
        setResponseText(text)
      }

      // If login succeeded
      if (selectedApi.path.includes('/api/auth/login') && res.ok && json?.data?.token) {
        setToken(json.data.token)
        setLoginSuccess(true)

        // Automatically switch to /me
        const meEndpoint = apiDocs.find((e) => e.path.includes('/api/auth/me'))
        if (meEndpoint) {
          setSelectedId(meEndpoint.id)
          setPathOverride(meEndpoint.path)
        }
      }

      if (!res.ok) setError(`HTTP ${res.status} – ${res.statusText}`)
    } catch (err: any) {
      setError(err?.message || 'Request failed')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div style={{ padding: '2rem', fontFamily: 'Arial, sans-serif' }}>
      <h1 style={{ fontSize: '2rem', marginBottom: '0.25rem' }}>
        🚀 HRMS Backend API Tester
      </h1>

      <p style={{ marginBottom: '1.5rem', opacity: 0.8 }}>
        Test API endpoints directly from your backend dashboard.
      </p>

      {/* TOKEN BADGE */}
      <div style={{ marginBottom: '1rem' }}>
        {token ? (
          <span
            style={{
              padding: '6px 12px',
              backgroundColor: '#22c55e',
              color: 'black',
              borderRadius: '6px',
              fontWeight: 600,
            }}
          >
            Token Loaded ✓
          </span>
        ) : (
          <span
            style={{
              padding: '6px 12px',
              backgroundColor: '#b91c1c',
              color: 'white',
              borderRadius: '6px',
              fontWeight: 600,
            }}
          >
            No Token
          </span>
        )}
      </div>

      {/* GROUPED ENDPOINTS */}
      <div
        style={{
          marginTop: '1rem',
          padding: '1rem',
          backgroundColor: '#f8f8f8',
          borderRadius: '8px',
        }}
      >
        <h2>📋 API Endpoints</h2>

        {groups.map(([groupName, endpoints]) => (
          <div
            key={groupName}
            style={{
              marginTop: '1rem',
              padding: '1rem',
              borderRadius: '8px',
              backgroundColor:
                groupName === 'Auth'
                  ? '#eef2ff'
                  : groupName === 'Payroll'
                  ? '#fff7e6'
                  : '#ecfdf5',
            }}
          >
            <h3>
              {groupName}{' '}
              {groupName !== 'Auth' && (
                <span style={{ fontSize: '0.85rem', opacity: 0.6 }}>
                  (Protected)
                </span>
              )}
            </h3>

            <ul style={{ marginTop: '0.5rem' }}>
              {endpoints.map((api) => (
                <li
                  key={api.id}
                  style={{
                    marginBottom: '0.75rem',
                    cursor: 'pointer',
                  }}
                  onClick={() => handleSelectChange(api.id)}
                >
                  <strong>{api.method}</strong>{' '}
                  <code style={{ background: '#eee', padding: '2px 4px' }}>
                    {api.path}
                  </code>{' '}
                  – {api.title}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* TRY-IT PANEL */}
      <div
        style={{
          marginTop: '2rem',
          padding: '1rem',
          backgroundColor: '#0f172a',
          color: 'white',
          borderRadius: '8px',
        }}
      >
        <h2>🧪 Try It</h2>

        {/* Endpoint */}
        <div style={{ marginTop: '1rem' }}>
          <label>Endpoint</label>

          <select
            value={selectedId}
            onChange={(e) => handleSelectChange(e.target.value)}
            style={{
              width: '100%',
              padding: '0.5rem',
              marginTop: '4px',
              borderRadius: '4px',
            }}
          >
            {apiDocs.map((api) => (
              <option key={api.id} value={api.id}>
                [{api.group}] {api.method} {api.path} – {api.title}
              </option>
            ))}
          </select>
        </div>

        {/* Path */}
        <div style={{ marginTop: '1rem' }}>
          <label>Path</label>
          <input
            value={pathOverride}
            onChange={(e) => setPathOverride(e.target.value)}
            style={{
              width: '100%',
              padding: '0.5rem',
              borderRadius: '4px',
              backgroundColor: '#1e293b',
              color: 'white',
            }}
          />
        </div>

        {/* Token */}
        <div style={{ marginTop: '1rem' }}>
          <label>Authorization Token</label>
          <input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Paste JWT (no 'Bearer')"
            style={{
              width: '100%',
              padding: '0.5rem',
              borderRadius: '4px',
              backgroundColor: '#1e293b',
              color: 'white',
            }}
          />
        </div>

        {/* POST body */}
        {selectedApi.method === 'POST' && (
          <div style={{ marginTop: '1rem' }}>
            <label>Request Body (JSON)</label>
            <textarea
              value={requestBody}
              onChange={(e) => setRequestBody(e.target.value)}
              rows={8}
              style={{
                width: '100%',
                padding: '0.5rem',
                borderRadius: '4px',
                backgroundColor: '#1e293b',
                color: 'white',
                fontFamily: 'monospace',
              }}
            />
          </div>
        )}

        {/* Buttons */}
        <button
          onClick={handleSend}
          disabled={isLoading}
          style={{
            marginTop: '1.25rem',
            padding: '0.6rem 1.4rem',
            borderRadius: '999px',
            backgroundColor: isLoading ? '#64748b' : '#22c55e',
            border: 'none',
            fontWeight: 700,
            cursor: isLoading ? 'not-allowed' : 'pointer',
          }}
        >
          {isLoading ? 'Sending…' : 'Send Request'}
        </button>

        {/* View /me after login */}
        {loginSuccess && (
          <button
            onClick={() => {
              const me = apiDocs.find((e) => e.path.includes('/api/auth/me'))
              if (me) {
                setSelectedId(me.id)
                setPathOverride(me.path)
              }
            }}
            style={{
              marginLeft: '1rem',
              padding: '0.6rem 1.4rem',
              borderRadius: '999px',
              backgroundColor: '#38bdf8',
              border: 'none',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            View /auth/me ➜
          </button>
        )}

        {/* Error */}
        {error && (
          <div
            style={{
              marginTop: '1rem',
              padding: '0.5rem',
              backgroundColor: '#7f1d1d',
              color: '#fee2e2',
              borderRadius: '4px',
            }}
          >
            {error}
          </div>
        )}

        {/* Response */}
        <div style={{ marginTop: '1rem' }}>
          <label>Response</label>
          <pre
            style={{
              marginTop: '4px',
              backgroundColor: '#1e293b',
              padding: '0.75rem',
              borderRadius: '4px',
              minHeight: '130px',
              maxHeight: '400px',
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
              color: '#e5e7eb',
            }}
          >
            {responseText || '// Response will appear here'}
          </pre>
        </div>
      </div>
    </div>
  )
}
