// src/app/page.tsx
'use client'

import { useMemo, useState } from 'react'
import { apiDocs } from './lib/apiDocs'

export default function Home() {
  // Group endpoints by group for nicer display
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

  // Try-It state
  const [selectedId, setSelectedId] = useState(apiDocs[0]?.id ?? '')
  const selectedApi = apiDocs.find((a) => a.id === selectedId) ?? apiDocs[0]

  const [pathOverride, setPathOverride] = useState(selectedApi?.path ?? '')
  const [token, setToken] = useState('')
  const [requestBody, setRequestBody] = useState(
    selectedApi?.method === 'POST' ? '{\n  "example": "value"\n}' : ''
  )
  const [responseText, setResponseText] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // keep pathOverride in sync when endpoint changes
  const handleSelectChange = (id: string) => {
    const api = apiDocs.find((a) => a.id === id)
    setSelectedId(id)
    if (api) {
      setPathOverride(api.path)
      if (api.method === 'POST') {
        // light generic starter body
        setRequestBody('{ "example": "value" }')
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
      const url = pathOverride || selectedApi.path
      const headers: Record<string, string> = {}

      if (selectedApi.method === 'POST') {
        headers['Content-Type'] = 'application/json'
      }

      if (token.trim()) {
        headers['Authorization'] = `Bearer ${token.trim()}`
      }

      const options: RequestInit = {
        method: selectedApi.method,
        headers,
      }

      if (selectedApi.method === 'POST' && requestBody.trim().length > 0) {
        options.body = requestBody
      }

      const res = await fetch(url, options)
      const contentType = res.headers.get('content-type') || ''

      if (contentType.includes('application/json')) {
        const json = await res.json()
        setResponseText(JSON.stringify(json, null, 2))
      } else {
        const text = await res.text()
        setResponseText(text)
      }

      if (!res.ok) {
        setError(`HTTP ${res.status} – ${res.statusText}`)
      }
    } catch (err: any) {
      setError(err?.message || 'Request failed')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div style={{ padding: '2rem', fontFamily: 'Arial, sans-serif' }}>
      <h1>🚀 HRMS Backend System</h1>
      <p>
        Your HR Management System backend is running. APIs are company-aware and use
        <code> companyId</code> from the JWT for scoping.
      </p>

      {/* API LIST (STATIC VIEW – DRIVEN BY apiDocs) */}
      <div
        style={{
          marginTop: '2rem',
          padding: '1rem',
          backgroundColor: '#f5f5f5',
          borderRadius: '8px',
        }}
      >
        <h2>📋 Available API Endpoints (from apiDocs.ts)</h2>

        {groups.map(([groupName, endpoints]) => (
          <div
            key={groupName}
            style={{
              marginTop: '1.5rem',
              padding: '1rem',
              backgroundColor:
                groupName === 'Auth'
                  ? '#f0f4ff'
                  : groupName === 'Staff'
                  ? '#e8f4ff'
                  : groupName === 'Payroll'
                  ? '#fff7e6'
                  : '#e8f5e8',
              borderRadius: '8px',
            }}
          >
            <h3>{groupName} APIs</h3>
            <ul>
              {endpoints.map((api) => (
                <li key={api.id} style={{ marginBottom: '0.75rem' }}>
                  <div>
                    <strong>{api.method}</strong>{' '}
                    <code>{api.path}</code> – {api.title}
                  </div>
                  <div style={{ fontSize: '0.9rem', marginLeft: '1rem' }}>
                    <div>{api.description}</div>
                    {api.auth && (
                      <div>
                        <span style={{ fontWeight: 600 }}>Auth:</span>{' '}
                        {api.auth}
                      </div>
                    )}
                    {api.input && (
                      <div>
                        <span style={{ fontWeight: 600 }}>Input:</span>{' '}
                        {api.input}
                      </div>
                    )}
                    {api.output && (
                      <div>
                        <span style={{ fontWeight: 600 }}>Output:</span>{' '}
                        {api.output}
                      </div>
                    )}
                  </div>
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
          backgroundColor: '#1e293b',
          color: 'white',
          borderRadius: '8px',
        }}
      >
        <h2>🧪 Try It – Test an API</h2>
        <p style={{ fontSize: '0.9rem', opacity: 0.9 }}>
          Pick an endpoint, enter a token (if needed), edit the path or body,
          and send a live request. On localhost this hits{' '}
          <code>http://localhost:3000</code>. On Render it uses whatever host
          this page is deployed on (e.g. <code>https://hrms-backend.onrender.com</code>).
        </p>

        {/* Endpoint selector */}
        <div style={{ marginTop: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.25rem' }}>
            Endpoint
          </label>
          <select
            value={selectedId}
            onChange={(e) => handleSelectChange(e.target.value)}
            style={{
              width: '100%',
              padding: '0.5rem',
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

        {/* Method & path */}
        <div
          style={{
            display: 'flex',
            gap: '0.5rem',
            marginTop: '1rem',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ minWidth: '90px' }}>
            <label style={{ display: 'block', marginBottom: '0.25rem' }}>
              Method
            </label>
            <input
              value={selectedApi?.method || ''}
              readOnly
              style={{
                width: '100%',
                padding: '0.5rem',
                borderRadius: '4px',
                backgroundColor: '#0f172a',
                color: 'white',
                border: '1px solid #475569',
              }}
            />
          </div>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <label style={{ display: 'block', marginBottom: '0.25rem' }}>
              Path (edit for [id] etc.)
            </label>
            <input
              value={pathOverride}
              onChange={(e) => setPathOverride(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem',
                borderRadius: '4px',
                border: '1px solid #475569',
                backgroundColor: '#0f172a',
                color: 'white',
              }}
            />
          </div>
        </div>

        {/* Token */}
        <div style={{ marginTop: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.25rem' }}>
            Authorization Token (optional)
          </label>
          <input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Paste JWT token here (without 'Bearer ')"
            style={{
              width: '100%',
              padding: '0.5rem',
              borderRadius: '4px',
              border: '1px solid #475569',
              backgroundColor: '#0f172a',
              color: 'white',
            }}
          />
          <div
            style={{
              fontSize: '0.8rem',
              opacity: 0.7,
              marginTop: '0.25rem',
            }}
          >
            If provided, request will send:{' '}
            <code>Authorization: Bearer &lt;token&gt;</code>
          </div>
        </div>

        {/* Body for POST */}
        {selectedApi?.method === 'POST' && (
          <div style={{ marginTop: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.25rem' }}>
              Request Body (JSON)
            </label>
            <textarea
              value={requestBody}
              onChange={(e) => setRequestBody(e.target.value)}
              rows={8}
              style={{
                width: '100%',
                padding: '0.5rem',
                borderRadius: '4px',
                border: '1px solid #475569',
                backgroundColor: '#0f172a',
                color: 'white',
                fontFamily: 'monospace',
              }}
            />
            <div
              style={{
                fontSize: '0.8rem',
                opacity: 0.7,
                marginTop: '0.25rem',
              }}
            >
              This is sent as raw JSON. Make sure it’s valid JSON for your
              endpoint.
            </div>
          </div>
        )}

        {/* Send button */}
        <div style={{ marginTop: '1rem' }}>
          <button
            onClick={handleSend}
            disabled={isLoading}
            style={{
              padding: '0.5rem 1.25rem',
              borderRadius: '999px',
              border: 'none',
              backgroundColor: isLoading ? '#64748b' : '#22c55e',
              color: 'black',
              fontWeight: 600,
              cursor: isLoading ? 'default' : 'pointer',
            }}
          >
            {isLoading ? 'Sending...' : 'Send Request'}
          </button>
        </div>

        {/* Error */}
        {error && (
          <div
            style={{
              marginTop: '0.75rem',
              padding: '0.5rem',
              borderRadius: '4px',
              backgroundColor: '#7f1d1d',
              color: '#fee2e2',
              fontSize: '0.85rem',
            }}
          >
            {error}
          </div>
        )}

        {/* Response */}
        <div style={{ marginTop: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.25rem' }}>
            Response
          </label>
          <pre
            style={{
              backgroundColor: '#0f172a',
              color: '#e5e7eb',
              padding: '0.75rem',
              borderRadius: '4px',
              minHeight: '120px',
              maxHeight: '400px',
              overflow: 'auto',
              fontSize: '0.85rem',
            }}
          >
            {responseText || '// Send a request to see the response here'}
          </pre>
        </div>
      </div>

      {/* STATUS + CURL HELP */}
      <div
        style={{
          marginTop: '2rem',
          padding: '1rem',
          backgroundColor: '#e8f5e8',
          borderRadius: '8px',
        }}
      >
        <h2>✅ System Status: Running</h2>
        <p>
          All core API endpoints are available, multi-company aware, and ready
          to use.
        </p>
        <p>
          Use this page, Postman, Thunder Client, or curl to test locally or on
          Render.
        </p>
      </div>

      <div style={{ marginTop: '2rem' }}>
        <h3>🔧 Quick Test Commands</h3>
        <pre
          style={{
            backgroundColor: '#2d2d2d',
            color: 'white',
            padding: '1rem',
            borderRadius: '4px',
            overflowX: 'auto',
          }}
        >
{`# ============================
# AUTH LOGIN (LOCALHOST)
# ============================
curl -X POST http://localhost:3000/api/auth/login \\
  -H "Content-Type: application/json" \\
  -d '{"email": "admin@company.com", "password": "admin123"}'

# ============================
# AUTH LOGIN (RENDER)
# ============================
curl -X POST https://hrms-backend.onrender.com/api/auth/login \\
  -H "Content-Type: application/json" \\
  -d '{"email": "admin@company.com", "password": "admin123"}'


# ============================
# PAYROLL UPLOAD (LOCALHOST)
# ============================
curl -X POST http://localhost:3000/api/payroll/upload \\
  -H "Authorization: Bearer <HR_OR_ADMIN_TOKEN>" \\
  -F "file=@PAYROLL_FILE.xlsx" \\
  -F "sendEmails=true"

# ============================
# PAYROLL UPLOAD (RENDER)
# ============================
curl -X POST https://hrms-backend.onrender.com/api/payroll/upload \\
  -H "Authorization: Bearer <HR_OR_ADMIN_TOKEN>" \\
  -F "file=@PAYROLL_FILE.xlsx" \\
  -F "sendEmails=true"`}
        </pre>
      </div>
    </div>
  )
}
