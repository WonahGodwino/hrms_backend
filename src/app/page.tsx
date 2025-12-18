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
    selectedApi?.method === 'POST' && selectedApi?.contentType === 'json'
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
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [formDataFields, setFormDataFields] = useState<{ key: string; value: string }[]>([
    { key: 'sendEmails', value: 'true' }
  ])

  // Load token on mount
  useEffect(() => {
    const saved = localStorage.getItem('hrms_token')
    if (saved) setToken(saved)
  }, [])

  // Save token when it changes
  useEffect(() => {
    if (token) localStorage.setItem('hrms_token', token)
  }, [token])

  // Reset form when API changes
  useEffect(() => {
    if (selectedApi) {
      setPathOverride(selectedApi.path)
      setSelectedFile(null)
      
      if (selectedApi.method === 'POST' && selectedApi.contentType === 'json') {
        setRequestBody(
          selectedApi.sample
            ? JSON.stringify(selectedApi.sample, null, 2)
            : selectedApi.input
            ? `// Expected input:\n// ${selectedApi.input}\n\n{ }`
            : '{ }'
        )
      } else {
        setRequestBody('')
      }

      // Reset form data fields for upload endpoints
      if (selectedApi.contentType === 'form-data') {
        if (selectedApi.id === 'payroll-upload') {
          setFormDataFields([
            { key: 'sendEmails', value: 'true' }
          ])
        } else {
          setFormDataFields([])
        }
      }

      setResponseText('')
      setError(null)
      setLoginSuccess(false)
    }
  }, [selectedApi])

  const handleSelectChange = (id: string) => {
    const api = apiDocs.find((a) => a.id === id)
    if (api) setSelectedId(id)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null
    setSelectedFile(file)
  }

  const addFormDataField = () => {
    setFormDataFields([...formDataFields, { key: '', value: '' }])
  }

  const removeFormDataField = (index: number) => {
    const newFields = [...formDataFields]
    newFields.splice(index, 1)
    setFormDataFields(newFields)
  }

  const updateFormDataField = (index: number, field: 'key' | 'value', value: string) => {
    const newFields = [...formDataFields]
    newFields[index][field] = value
    setFormDataFields(newFields)
  }

  const handleSend = async () => {
    if (!selectedApi) return
    setIsLoading(true)
    setResponseText('')
    setError(null)

    try {
      const url = pathOverride
      const headers: Record<string, string> = {}

      if (token.trim()) {
        headers['Authorization'] = `Bearer ${token.trim()}`
      }

      // Handle file upload (multipart/form-data)
      if (selectedApi.contentType === 'form-data') {
        const formData = new FormData()
        
        // Add file if selected
        if (selectedFile) {
          formData.append('file', selectedFile)
        }
        
        // Add additional form fields
        formDataFields.forEach(field => {
          if (field.key && field.value) {
            formData.append(field.key, field.value)
          }
        })

        const res = await fetch(url, {
          method: selectedApi.method,
          headers,
          body: formData
        })

        await handleResponse(res)
      } 
      // Handle JSON requests
      else if (selectedApi.method === 'POST' && selectedApi.contentType !== 'form-data') {
        headers['Content-Type'] = 'application/json'
        
        const res = await fetch(url, {
          method: selectedApi.method,
          headers,
          body: requestBody.trim() ? requestBody : undefined
        })

        await handleResponse(res)
      }
      // Handle GET requests
      else {
        const res = await fetch(url, {
          method: selectedApi.method,
          headers
        })

        await handleResponse(res)
      }
    } catch (err: any) {
      setError(err?.message || 'Request failed')
    } finally {
      setIsLoading(false)
    }
  }

  const handleResponse = async (res: Response) => {
    const contentType = res.headers.get('content-type') || ''
    
    // Handle JSON responses
    if (contentType.includes('application/json')) {
      const json = await res.json()
      setResponseText(JSON.stringify(json, null, 2))
      
      // Auto-save token on successful login
      if (
        selectedApi?.path.includes('/api/auth/login') &&
        res.ok &&
        json?.data?.token
      ) {
        setToken(json.data.token)
        setLoginSuccess(true)
      }
    } 
    // Handle file downloads (Excel, PDF, etc.)
    else if (
      contentType.includes('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') ||
      contentType.includes('application/pdf') ||
      contentType.includes('application/octet-stream')
    ) {
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      
      // Extract filename from Content-Disposition header or use default
      const contentDisposition = res.headers.get('content-disposition')
      let filename = 'download'
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="(.+)"/)
        if (filenameMatch) {
          filename = filenameMatch[1]
        } else {
          const filenameStarMatch = contentDisposition.match(/filename\*=.+'(.+)'/)
          if (filenameStarMatch) {
            filename = filenameStarMatch[1]
          }
        }
      } else {
        // Use endpoint-specific default names
        if (selectedApi?.id === 'payroll-template') {
          filename = 'payroll-template.xlsx'
        } else if (selectedApi?.id === 'payslip-download') {
          filename = 'payslip.pdf'
        }
      }
      
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
      
      setResponseText(`File downloaded: ${filename}\nContent-Type: ${contentType}\nSize: ${(blob.size / 1024).toFixed(2)} KB`)
    }
    // Handle text responses
    else {
      const text = await res.text()
      setResponseText(text)
    }

    if (!res.ok) {
      setError(`HTTP ${res.status} – ${res.statusText}`)
    }
  }

  const handleClearToken = () => {
    setToken('')
    localStorage.removeItem('hrms_token')
  }

  const handleDownloadSampleFile = () => {
    if (selectedApi?.id === 'payroll-upload') {
      // Create a simple sample payroll Excel file using SheetJS
      // For now, we'll just provide a download link to an empty template
      const blob = new Blob([
        `Staff ID,Name,Month,Year,Gross Pay,Basic Salary,Housing,Transport,Payee,Pension,Net Salary
EMP001,John Doe,January,2024,500000,350000,75000,30000,45000,50000,405000
EMP002,Jane Smith,January,2024,450000,315000,67500,27000,40500,45000,364500
EMP003,Bob Johnson,January,2024,400000,280000,60000,24000,36000,40000,324000`
      ], { type: 'text/csv' })
      
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'payroll-sample.csv'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
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
          using your JWT – all from inside the app. Supports both JSON and file uploads.
        </p>
      </header>

      {/* TOKEN STATUS */}
      <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
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

        {token && (
          <button
            onClick={handleClearToken}
            style={{
              padding: '0.35rem 0.75rem',
              borderRadius: '999px',
              fontSize: '0.85rem',
              fontWeight: 600,
              backgroundColor: '#ef444433',
              border: '1px solid #ef444455',
              color: '#fca5a5',
              cursor: 'pointer',
            }}
          >
            Clear Token
          </button>
        )}

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
            Login successful – token saved
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
                      : api.method === 'POST'
                      ? '#f97316'
                      : '#8b5cf6'

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
                        position: 'relative',
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
                      {api.contentType === 'form-data' && (
                        <span
                          style={{
                            position: 'absolute',
                            top: '0.5rem',
                            right: '0.5rem',
                            fontSize: '0.6rem',
                            padding: '0.1rem 0.3rem',
                            borderRadius: '999px',
                            backgroundColor: '#3b82f622',
                            color: '#60a5fa',
                            border: '1px solid #3b82f655',
                          }}
                        >
                          File Upload
                        </span>
                      )}
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

                    {selectedApi.contentType === 'form-data' && (
                      <span
                        style={{
                          fontSize: '0.7rem',
                          padding: '0.1rem 0.45rem',
                          borderRadius: '999px',
                          backgroundColor: '#3b82f633',
                          border: '1px solid #3b82f655',
                          color: '#60a5fa',
                        }}
                      >
                        multipart/form-data
                      </span>
                    )}
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

            {/* Endpoint selector */}
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label style={{ fontSize: '0.8rem', opacity: 0.8 }}>
                  Authorization Token
                </label>
                {token && (
                  <button
                    onClick={handleClearToken}
                    style={{
                      fontSize: '0.7rem',
                      padding: '0.2rem 0.5rem',
                      borderRadius: '999px',
                      backgroundColor: '#ef444433',
                      border: '1px solid #ef444455',
                      color: '#fca5a5',
                      cursor: 'pointer',
                    }}
                  >
                    Clear
                  </button>
                )}
              </div>
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

            {/* File upload for form-data endpoints */}
            {selectedApi?.contentType === 'form-data' && (
              <div style={{ marginTop: '0.75rem' }}>
                <label style={{ fontSize: '0.8rem', opacity: 0.8 }}>
                  Upload File
                </label>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <input
                    type="file"
                    onChange={handleFileChange}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      marginTop: '0.25rem',
                      borderRadius: '0.4rem',
                      backgroundColor: '#020617',
                      color: 'white',
                      border: '1px solid #1f2937',
                    }}
                  />
                  {selectedApi.id === 'payroll-upload' && (
                    <button
                      onClick={handleDownloadSampleFile}
                      style={{
                        padding: '0.5rem 1rem',
                        borderRadius: '0.4rem',
                        backgroundColor: '#3b82f6',
                        border: 'none',
                        color: 'white',
                        cursor: 'pointer',
                        fontSize: '0.8rem',
                      }}
                    >
                      Get Sample CSV
                    </button>
                  )}
                </div>
                {selectedFile && (
                  <div style={{
                    marginTop: '0.5rem',
                    padding: '0.5rem',
                    backgroundColor: '#0f172a',
                    borderRadius: '0.4rem',
                    border: '1px solid #1f2937',
                  }}>
                    <span style={{ fontSize: '0.8rem' }}>
                      Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(2)} KB)
                    </span>
                  </div>
                )}
                
                {/* Additional form fields */}
                <div style={{ marginTop: '0.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={{ fontSize: '0.8rem', opacity: 0.8 }}>
                      Additional Form Fields
                    </label>
                    <button
                      onClick={addFormDataField}
                      style={{
                        padding: '0.25rem 0.5rem',
                        fontSize: '0.7rem',
                        borderRadius: '0.4rem',
                        backgroundColor: '#10b981',
                        border: 'none',
                        color: 'white',
                        cursor: 'pointer',
                      }}
                    >
                      + Add Field
                    </button>
                  </div>
                  
                  {formDataFields.map((field, index) => (
                    <div key={index} style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                      <input
                        value={field.key}
                        onChange={(e) => updateFormDataField(index, 'key', e.target.value)}
                        placeholder="Field name"
                        style={{
                          flex: 1,
                          padding: '0.5rem',
                          borderRadius: '0.4rem',
                          backgroundColor: '#020617',
                          color: 'white',
                          border: '1px solid #1f2937',
                          fontFamily: 'monospace',
                          fontSize: '0.85rem',
                        }}
                      />
                      <input
                        value={field.value}
                        onChange={(e) => updateFormDataField(index, 'value', e.target.value)}
                        placeholder="Value"
                        style={{
                          flex: 2,
                          padding: '0.5rem',
                          borderRadius: '0.4rem',
                          backgroundColor: '#020617',
                          color: 'white',
                          border: '1px solid #1f2937',
                          fontFamily: 'monospace',
                          fontSize: '0.85rem',
                        }}
                      />
                      <button
                        onClick={() => removeFormDataField(index)}
                        style={{
                          padding: '0.5rem',
                          borderRadius: '0.4rem',
                          backgroundColor: '#ef444433',
                          border: '1px solid #ef444455',
                          color: '#fca5a5',
                          cursor: 'pointer',
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* JSON body for POST endpoints */}
            {selectedApi?.method === 'POST' && selectedApi?.contentType !== 'form-data' && (
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
            <div style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
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

              {selectedApi?.id === 'payroll-upload' && !selectedFile && (
                <button
                  onClick={handleDownloadSampleFile}
                  style={{
                    padding: '0.6rem 1.4rem',
                    borderRadius: '999px',
                    backgroundColor: '#8b5cf6',
                    border: 'none',
                    fontWeight: 700,
                    cursor: 'pointer',
                    color: '#020617',
                  }}
                >
                  Download Sample CSV
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

          {/* SAMPLE USAGE GUIDE */}
          {(selectedApi?.id === 'staff-upload' || selectedApi?.id === 'payroll-upload') && (
            <section
              style={{
                background: '#020617',
                borderRadius: '0.75rem',
                border: '1px solid #1e293b',
                padding: '1rem',
              }}
            >
              <h3 style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                How to test this upload:
              </h3>
              <ol style={{ fontSize: '0.85rem', opacity: 0.8, paddingLeft: '1rem', margin: 0 }}>
                <li>First, get a JWT token by logging in using /api/auth/login</li>
                <li>Select or prepare an Excel/CSV file with the correct format</li>
                <li>Click "Choose File" to select your file</li>
                <li>Adjust any additional form fields if needed</li>
                <li>Click "Send Request" to upload and process</li>
                <li>Check the response for processing results and any errors</li>
              </ol>
            </section>
          )}
        </main>
      </div>
    </div>
  )
}