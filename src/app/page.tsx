// src/app/page.tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import { apiDocs, type ApiDoc } from './lib/apiDocs'

export default function Home() {
  // Group endpoints by category
  const groups = useMemo(
    () =>
      Array.from(
        apiDocs.reduce((map, doc) => {
          if (!map.has(doc.group)) map.set(doc.group, [] as ApiDoc[])
          map.get(doc.group)!.push(doc)
          return map
        }, new Map<string, ApiDoc[]>())
      ),
    []
  )

  const [selectedId, setSelectedId] = useState(apiDocs[0]?.id ?? '')
  const selectedApi: ApiDoc | undefined =
    apiDocs.find((a) => a.id === selectedId) ?? apiDocs[0]

  const [pathOverride, setPathOverride] = useState(selectedApi?.path ?? '')
  const [token, setToken] = useState('')
  const [requestBody, setRequestBody] = useState(
    selectedApi?.method === 'POST'
      ? selectedApi?.sample
        ? JSON.stringify(selectedApi.sample, null, 2)
        : selectedApi?.input
        ? `// Expected input:\n// ${selectedApi.input}\n\n{ }`
        : '{ }'
      : ''
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
        setRequestBody(
          api.sample
            ? JSON.stringify(api.sample, null, 2)
            : api.input
            ? `// Expected input:\n// ${api.input}\n\n{ }`
            : '{ }'
        )
      } else {
        setRequestBody('')
      }

      setResponseText('')
      setError(null)
      setLoginSuccess(false)
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

      // If login succeeded, auto-store token and suggest /auth/me
      if (
        selectedApi.path.includes('/api/auth/login') &&
        res.ok &&
        json?.data?.token
      ) {
        setToken(json.data.token)
        setLoginSuccess(true)

        const meEndpoint = apiDocs.find((e) =>
          e.path.includes('/api/auth/me')
        )
        if (meEndpoint) {
          setSelectedId(meEndpoint.id)
          setPathOverride(meEndpoint.path)
        }
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
    <div
      style={{
        minHeight: '100vh',
        background: '#020617',
        color: '#e5e7eb',
        padding: '1.5rem',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      {/* HEADER */}
      <header style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.9rem', marginBottom: '0.25rem' }}>
          HRMS Backend API Console
        </h1>
        <p style={{ opacity: 0.8, maxWidth: '640px' }}>
          Browse your backend endpoints, see what they expect, and fire real requests
          using your JWT – all from inside the app.
        </p>
      </header>

      {/* TOKEN STATUS */}
      <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <span
          style={{
            padding: '0.35rem 0.75rem',
            borderRadius: '999px',
            fontSize: '0.85rem',
            fontWeight: 600,
            backgroundColor: token ? '#22c55e33' : '#7f1d1d',
            color: token ? '#22c55e' : '#fee2e2',
            border: token ? '1px solid #22c55e55' : '1px solid #fecaca55',
          }}
        >
          {token ? 'JWT token loaded' : 'No token stored'}
        </span>

        {loginSuccess && (
          <span
            style={{
              padding: '0.35rem 0.75rem',
              borderRadius: '999px',
              fontSize: '0.85rem',
              fontWeight: 600,
              backgroundColor: '#0f766e',
              border: '1px solid #14b8a6',
              color: '#ccfbf1',
            }}
          >
            Login successful – token saved from /auth/login
          </span>
        )}
      </div>

      {/* MAIN LAYOUT */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(260px, 360px) minmax(0, 1fr)',
          gap: '1.5rem',
        }}
      >
        {/* LEFT: ENDPOINT LIST */}
        <aside
          style={{
            background: '#020617',
            borderRadius: '0.75rem',
            border: '1px solid #1e293b',
            padding: '1rem',
            maxHeight: 'calc(100vh - 160px)',
            overflow: 'auto',
          }}
        >
          <h2 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>
            API Endpoints
          </h2>
          <p style={{ fontSize: '0.85rem', opacity: 0.7, marginBottom: '0.75rem' }}>
            Click an endpoint to view details and send a test request.
          </p>

          {groups.map(([groupName, endpoints]) => (
            <section key={groupName} style={{ marginTop: '1rem' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  marginBottom: '0.35rem',
                }}
              >
                <span
                  style={{
                    fontSize: '0.9rem',
                    fontWeight: 600,
                  }}
                >
                  {groupName}
                </span>
                {groupName !== 'Auth' && (
                  <span
                    style={{
                      fontSize: '0.7rem',
                      padding: '0.15rem 0.45rem',
                      borderRadius: '999px',
                      backgroundColor: '#0f172a',
                      border: '1px solid #1f2937',
                      opacity: 0.9,
                    }}
                  >
                    Protected
                  </span>
                )}
              </div>

              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {endpoints.map((api) => {
                  const isSelected = api.id === selectedId
                  const methodColor =
                    api.method === 'GET'
                      ? '#22c55e'
                      : '#f97316'

                  return (
                    <li
                      key={api.id}
                      onClick={() => handleSelectChange(api.id)}
                      style={{
                        marginBottom: '0.4rem',
                        cursor: 'pointer',
                        borderRadius: '0.5rem',
                        padding: '0.5rem 0.55rem',
                        backgroundColor: isSelected ? '#0f172a' : 'transparent',
                        border: isSelected
                          ? '1px solid #38bdf8'
                          : '1px solid transparent',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.15rem',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                        }}
                      >
                        <span
                          style={{
                            fontSize: '0.7rem',
                            padding: '0.1rem 0.45rem',
                            borderRadius: '999px',
                            backgroundColor: methodColor + '22',
                            color: methodColor,
                            border: `1px solid ${methodColor}55`,
                            fontWeight: 600,
                          }}
                        >
                          {api.method}
                        </span>
                        <code
                          style={{
                            fontSize: '0.75rem',
                            background: '#020617',
                            padding: '0.1rem 0.35rem',
                            borderRadius: '0.25rem',
                            border: '1px solid #111827',
                          }}
                        >
                          {api.path}
                        </code>
                      </div>
                      <span
                        style={{
                          fontSize: '0.78rem',
                          opacity: 0.8,
                        }}
                      >
                        {api.title}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </aside>

        {/* RIGHT: DETAILS + TRY IT */}
        <main
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
          }}
        >
          {/* ENDPOINT DETAILS */}
          {selectedApi && (
            <section
              style={{
                background: '#020617',
                borderRadius: '0.75rem',
                border: '1px solid #1e293b',
                padding: '1rem',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: '1rem',
                  marginBottom: '0.75rem',
                }}
              >
                <div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <span
                      style={{
                        fontSize: '0.8rem',
                        padding: '0.15rem 0.55rem',
                        borderRadius: '999px',
                        background:
                          selectedApi.method === 'GET'
                            ? '#22c55e33'
                            : '#f9731633',
                        border:
                          selectedApi.method === 'GET'
                            ? '1px solid #22c55e55'
                            : '1px solid #f9731655',
                        color:
                          selectedApi.method === 'GET' ? '#22c55e' : '#f97316',
                        fontWeight: 600,
                      }}
                    >
                      {selectedApi.method}
                    </span>

                    <code
                      style={{
                        fontSize: '0.8rem',
                        padding: '0.1rem 0.45rem',
                        borderRadius: '999px',
                        backgroundColor: '#020617',
                        border: '1px solid #1f2937',
                      }}
                    >
                      {selectedApi.path}
                    </code>

                    <span
                      style={{
                        fontSize: '0.75rem',
                        padding: '0.1rem 0.45rem',
                        borderRadius: '999px',
                        backgroundColor: '#0f172a',
                        border: '1px solid #1f2937',
                        opacity: 0.9,
                      }}
                    >
                      Group: {selectedApi.group}
                    </span>
                  </div>

                  <h2 style={{ marginTop: '0.6rem', fontSize: '1.1rem' }}>
                    {selectedApi.title}
                  </h2>
                </div>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1.4fr)',
                  gap: '1rem',
                }}
              >
                {/* Description & Auth */}
                <div>
                  <h3
                    style={{
                      fontSize: '0.9rem',
                      marginBottom: '0.25rem',
                    }}
                  >
                    Description
                  </h3>
                  <p
                    style={{
                      fontSize: '0.85rem',
                      opacity: 0.85,
                    }}
                  >
                    {selectedApi.description}
                  </p>

                  {selectedApi.auth && (
                    <div style={{ marginTop: '0.6rem' }}>
                      <h3
                        style={{
                          fontSize: '0.9rem',
                          marginBottom: '0.25rem',
                        }}
                      >
                        Auth
                      </h3>
                      <code
                        style={{
                          fontSize: '0.75rem',
                          display: 'block',
                          padding: '0.5rem',
                          borderRadius: '0.4rem',
                          backgroundColor: '#020617',
                          border: '1px solid #1f2937',
                          whiteSpace: 'pre-wrap',
                        }}
                      >
                        {selectedApi.auth}
                      </code>
                    </div>
                  )}
                </div>

                {/* Input / Output quick docs */}
                <div>
                  {selectedApi.input && (
                    <div style={{ marginBottom: '0.75rem' }}>
                      <h3
                        style={{
                          fontSize: '0.9rem',
                          marginBottom: '0.25rem',
                        }}
                      >
                        Expected Input
                      </h3>
                      <pre
                        style={{
                          fontSize: '0.75rem',
                          padding: '0.5rem',
                          borderRadius: '0.4rem',
                          backgroundColor: '#020617',
                          border: '1px solid #1f2937',
                          whiteSpace: 'pre-wrap',
                          maxHeight: '150px',
                          overflow: 'auto',
                        }}
                      >
                        {selectedApi.input}
                      </pre>
                    </div>
                  )}

                  {selectedApi.output && (
                    <div>
                      <h3
                        style={{
                          fontSize: '0.9rem',
                          marginBottom: '0.25rem',
                        }}
                      >
                        Output Shape
                      </h3>
                      <pre
                        style={{
                          fontSize: '0.75rem',
                          padding: '0.5rem',
                          borderRadius: '0.4rem',
                          backgroundColor: '#020617',
                          border: '1px solid #1f2937',
                          whiteSpace: 'pre-wrap',
                          maxHeight: '150px',
                          overflow: 'auto',
                        }}
                      >
                        {selectedApi.output}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* TRY IT PANEL */}
          <section
            style={{
              background: '#020617',
              borderRadius: '0.75rem',
              border: '1px solid #1e293b',
              padding: '1rem',
            }}
          >
            <h2 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>
              Try this endpoint
            </h2>

            {/* Endpoint selector (still useful here) */}
            <div style={{ marginTop: '0.5rem' }}>
              <label style={{ fontSize: '0.8rem', opacity: 0.8 }}>
                Endpoint
              </label>
              <select
                value={selectedId}
                onChange={(e) => handleSelectChange(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  marginTop: '0.25rem',
                  borderRadius: '0.4rem',
                  backgroundColor: '#020617',
                  color: '#e5e7eb',
                  border: '1px solid #1f2937',
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
            <div style={{ marginTop: '0.75rem' }}>
              <label style={{ fontSize: '0.8rem', opacity: 0.8 }}>Path</label>
              <input
                value={pathOverride}
                onChange={(e) => setPathOverride(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  marginTop: '0.25rem',
                  borderRadius: '0.4rem',
                  backgroundColor: '#020617',
                  color: 'white',
                  border: '1px solid #1f2937',
                  fontFamily: 'monospace',
                }}
              />
            </div>

            {/* Token */}
            <div style={{ marginTop: '0.75rem' }}>
              <label style={{ fontSize: '0.8rem', opacity: 0.8 }}>
                Authorization Token
              </label>
              <input
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Paste JWT (no 'Bearer')"
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  marginTop: '0.25rem',
                  borderRadius: '0.4rem',
                  backgroundColor: '#020617',
                  color: 'white',
                  border: '1px solid #1f2937',
                  fontFamily: 'monospace',
                }}
              />
            </div>

            {/* POST body */}
            {selectedApi?.method === 'POST' && (
              <div style={{ marginTop: '0.75rem' }}>
                <label style={{ fontSize: '0.8rem', opacity: 0.8 }}>
                  Request Body (JSON)
                </label>
                <textarea
                  value={requestBody}
                  onChange={(e) => setRequestBody(e.target.value)}
                  rows={8}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    marginTop: '0.25rem',
                    borderRadius: '0.4rem',
                    backgroundColor: '#020617',
                    color: 'white',
                    border: '1px solid #1f2937',
                    fontFamily: 'monospace',
                    fontSize: '0.85rem',
                  }}
                />
              </div>
            )}

            {/* Buttons */}
            <div style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem' }}>
              <button
                onClick={handleSend}
                disabled={isLoading}
                style={{
                  padding: '0.6rem 1.4rem',
                  borderRadius: '999px',
                  backgroundColor: isLoading ? '#4b5563' : '#22c55e',
                  border: 'none',
                  fontWeight: 700,
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  color: '#020617',
                }}
              >
                {isLoading ? 'Sending…' : 'Send Request'}
              </button>

              {loginSuccess && (
                <button
                  onClick={() => {
                    const me = apiDocs.find((e) =>
                      e.path.includes('/api/auth/me')
                    )
                    if (me) {
                      setSelectedId(me.id)
                      setPathOverride(me.path)
                    }
                  }}
                  style={{
                    padding: '0.6rem 1.4rem',
                    borderRadius: '999px',
                    backgroundColor: '#38bdf8',
                    border: 'none',
                    fontWeight: 700,
                    cursor: 'pointer',
                    color: '#020617',
                  }}
                >
                  View /auth/me ➜
                </button>
              )}
            </div>

            {/* Error */}
            {error && (
              <div
                style={{
                  marginTop: '0.9rem',
                  padding: '0.6rem',
                  borderRadius: '0.4rem',
                  backgroundColor: '#7f1d1d',
                  color: '#fee2e2',
                  fontSize: '0.85rem',
                }}
              >
                {error}
              </div>
            )}

            {/* Response */}
            <div style={{ marginTop: '0.9rem' }}>
              <label style={{ fontSize: '0.8rem', opacity: 0.8 }}>
                Response
              </label>
              <pre
                style={{
                  marginTop: '0.25rem',
                  backgroundColor: '#020617',
                  padding: '0.75rem',
                  borderRadius: '0.4rem',
                  minHeight: '130px',
                  maxHeight: '320px',
                  overflow: 'auto',
                  whiteSpace: 'pre-wrap',
                  border: '1px solid #1f2937',
                  fontSize: '0.85rem',
                }}
              >
                {responseText || '// Response will appear here'}
              </pre>
            </div>
          </section>
        </main>
      </div>
    </div>
  )
}
