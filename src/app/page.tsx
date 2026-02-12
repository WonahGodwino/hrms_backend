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
  const [isDownloadingFile, setIsDownloadingFile] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loginSuccess, setLoginSuccess] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [formDataFields, setFormDataFields] = useState<{ key: string; value: string }[]>([
    { key: 'sendEmails', value: 'true' }
  ])
  const [pathParams, setPathParams] = useState<{ [key: string]: string }>({})

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
      // Extract path parameters from the path template
      const paramMatches = selectedApi.path.match(/\[([^\]]+)\]/g) || []
      const params: { [key: string]: string } = {}
      paramMatches.forEach(match => {
        const paramName = match.slice(1, -1) // Remove [ and ]
        params[paramName] = ''
      })
      setPathParams(params)
      
      // Replace path parameters with actual values
      let resolvedPath = selectedApi.path
      Object.entries(params).forEach(([key, value]) => {
        if (value) {
          resolvedPath = resolvedPath.replace(`[${key}]`, value)
        }
      })
      setPathOverride(resolvedPath)
      
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

  // Update path when path params change
  useEffect(() => {
    if (selectedApi) {
      let resolvedPath = selectedApi.path
      Object.entries(pathParams).forEach(([key, value]) => {
        if (value) {
          resolvedPath = resolvedPath.replace(`[${key}]`, value)
        }
      })
      setPathOverride(resolvedPath)
    }
  }, [pathParams, selectedApi])

  const handleSelectChange = (id: string) => {
    const api = apiDocs.find((a) => a.id === id)
    if (api) setSelectedId(id)
  }

  const handlePathParamChange = (paramName: string, value: string) => {
    setPathParams(prev => ({
      ...prev,
      [paramName]: value
    }))
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

  const handleDownloadFile = async () => {
    if (!selectedApi || !token) {
      setError('Please set an authorization token first')
      return
    }

    try {
      setIsDownloadingFile(true)
      setResponseText('')
      setError(null)

      const headers: Record<string, string> = {
        'Authorization': `Bearer ${token.trim()}`
      }

      const url = pathOverride
      const res = await fetch(url, {
        method: selectedApi.method,
        headers
      })

      if (!res.ok) {
        // Try to parse as JSON error
        const contentType = res.headers.get('content-type') || ''
        if (contentType.includes('application/json')) {
          const json = await res.json()
          throw new Error(json.message || `HTTP ${res.status} – ${res.statusText}`)
        } else {
          throw new Error(`HTTP ${res.status} – ${res.statusText}`)
        }
      }

      // Handle file download
      const contentType = res.headers.get('content-type') || ''
      const blob = await res.blob()
      const url_blob = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url_blob
      
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
            filename = decodeURIComponent(filenameStarMatch[1])
          }
        }
      } else {
        // Use endpoint-specific default names
        if (selectedApi?.id === 'payroll-template') {
          filename = 'payroll-template.xlsx'
        } else if (selectedApi?.id === 'staff-template') {
          filename = 'staff-template.xlsx'
        } else if (selectedApi?.id === 'payslip-download') {
          filename = 'payslip.pdf'
        } else if (selectedApi?.id === 'payroll-download-failed') {
          filename = 'failed-payroll-records.xlsx'
        }
      }
      
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url_blob)

      setResponseText(`✅ File downloaded successfully: ${filename}\n📁 Content-Type: ${contentType}\n📊 Size: ${(blob.size / 1024).toFixed(2)} KB`)
      setError(null)

    } catch (err: any) {
      setError(err?.message || 'Failed to download file')
      setResponseText('')
    } finally {
      setIsDownloadingFile(false)
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

      if (token.trim()) {
        headers['Authorization'] = `Bearer ${token.trim()}`
      }

      // Handle file download endpoints
      if (selectedApi.contentType === 'file') {
        const res = await fetch(url, {
          method: selectedApi.method,
          headers
        })

        if (!res.ok) {
          const contentType = res.headers.get('content-type') || ''
          if (contentType.includes('application/json')) {
            const json = await res.json()
            throw new Error(json.message || `HTTP ${res.status} – ${res.statusText}`)
          } else {
            throw new Error(`HTTP ${res.status} – ${res.statusText}`)
          }
        }

        // Handle file download
        const contentType = res.headers.get('content-type') || ''
        const blob = await res.blob()
        const url_blob = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url_blob
        
        // Extract filename
        const contentDisposition = res.headers.get('content-disposition')
        let filename = 'download'
        if (contentDisposition) {
          const filenameMatch = contentDisposition.match(/filename="(.+)"/)
          if (filenameMatch) {
            filename = filenameMatch[1]
          }
        }
        
        a.download = filename
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        window.URL.revokeObjectURL(url_blob)
        
        setResponseText(`✅ File downloaded: ${filename}\n📁 Content-Type: ${contentType}\n📊 Size: ${(blob.size / 1024).toFixed(2)} KB`)
        setIsLoading(false)
        return
      }

      // Check if this is a file upload endpoint
      const isFileUpload = selectedApi.contentType === 'form-data'
      
      if (isFileUpload) {
        // Handle file upload (multipart/form-data)
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
      else if (selectedApi.method === 'POST' || selectedApi.method === 'PUT') {
        // Handle JSON POST/PUT requests
        headers['Content-Type'] = 'application/json'
        
        const res = await fetch(url, {
          method: selectedApi.method,
          headers,
          body: requestBody.trim() ? requestBody : undefined
        })

        await handleResponse(res)
      }
      else {
        // Handle GET and DELETE requests
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
      contentType.includes('application/octet-stream') ||
      contentType.includes('text/csv') ||
      contentType.includes('application/vnd.ms-excel')
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
            filename = decodeURIComponent(filenameStarMatch[1])
          }
        }
      } else {
        // Use endpoint-specific default names
        if (selectedApi?.id === 'payroll-template') {
          filename = 'payroll-template.xlsx'
        } else if (selectedApi?.id === 'staff-template') {
          filename = 'staff-template.xlsx'
        } else if (selectedApi?.id === 'payslip-download') {
          filename = 'payslip.pdf'
        } else if (selectedApi?.id === 'payroll-download-failed') {
          filename = 'failed-payroll-records.xlsx'
        }
      }
      
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
      
      setResponseText(`✅ File downloaded: ${filename}\n📁 Content-Type: ${contentType}\n📊 Size: ${(blob.size / 1024).toFixed(2)} KB`)
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
    setLoginSuccess(false)
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
          using your JWT – all from inside the app. Supports JSON, file uploads, and file downloads.
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
          {token ? '✅ JWT token loaded' : '❌ No token stored'}
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
            🎉 Login successful – token saved
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
                      : api.method === 'PUT'
                      ? '#8b5cf6'
                      : '#ef4444'

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
                        opacity: api.deprecated ? 0.6 : 1,
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
                        {api.deprecated ? '⚠️ DEPRECATED - ' : ''}{api.title}
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
                          📤 Upload
                        </span>
                      )}
                      {api.contentType === 'file' && (
                        <span
                          style={{
                            position: 'absolute',
                            top: '0.5rem',
                            right: '0.5rem',
                            fontSize: '0.6rem',
                            padding: '0.1rem 0.3rem',
                            borderRadius: '999px',
                            backgroundColor: '#8b5cf622',
                            color: '#a78bfa',
                            border: '1px solid #8b5cf655',
                          }}
                        >
                          📥 Download
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
                ...(selectedApi.deprecated ? {
                  border: '1px solid #f9731655',
                  background: 'linear-gradient(to right, #020617, #0f172a)'
                } : {})
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
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <span
                      style={{
                        fontSize: '0.8rem',
                        padding: '0.15rem 0.55rem',
                        borderRadius: '999px',
                        background:
                          selectedApi.method === 'GET'
                            ? '#22c55e33'
                            : selectedApi.method === 'POST'
                            ? '#f9731633'
                            : selectedApi.method === 'PUT'
                            ? '#8b5cf633'
                            : '#ef444433',
                        border:
                          selectedApi.method === 'GET'
                            ? '1px solid #22c55e55'
                            : selectedApi.method === 'POST'
                            ? '1px solid #f9731655'
                            : selectedApi.method === 'PUT'
                            ? '1px solid #8b5cf655'
                            : '1px solid #ef444455',
                        color:
                          selectedApi.method === 'GET'
                            ? '#22c55e'
                            : selectedApi.method === 'POST'
                            ? '#f97316'
                            : selectedApi.method === 'PUT'
                            ? '#8b5cf6'
                            : '#ef4444',
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
                      {selectedApi.group}
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
                    
                    {selectedApi.contentType === 'file' && (
                      <span
                        style={{
                          fontSize: '0.7rem',
                          padding: '0.1rem 0.45rem',
                          borderRadius: '999px',
                          backgroundColor: '#8b5cf633',
                          border: '1px solid #8b5cf655',
                          color: '#a78bfa',
                        }}
                      >
                        File Download
                      </span>
                    )}

                    {selectedApi.deprecated && (
                      <span
                        style={{
                          fontSize: '0.7rem',
                          padding: '0.1rem 0.45rem',
                          borderRadius: '999px',
                          backgroundColor: '#f9731633',
                          border: '1px solid #f9731655',
                          color: '#f97316',
                        }}
                      >
                        ⚠️ DEPRECATED
                      </span>
                    )}
                  </div>

                  <h2 style={{ marginTop: '0.6rem', fontSize: '1.1rem' }}>
                    {selectedApi.title}
                  </h2>
                  
                  {selectedApi.deprecated && selectedApi.alternative && (
                    <div style={{
                      marginTop: '0.5rem',
                      padding: '0.5rem',
                      backgroundColor: '#f9731633',
                      borderRadius: '0.4rem',
                      border: '1px solid #f9731655',
                      fontSize: '0.85rem',
                      color: '#f97316'
                    }}>
                      ⚠️ This endpoint is deprecated. Please use{' '}
                      <code style={{ background: '#020617', padding: '0.1rem 0.3rem', borderRadius: '0.2rem' }}>
                        {selectedApi.alternative}
                      </code>
                      {' '}instead.
                    </div>
                  )}
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
                    {api.deprecated ? ' (DEPRECATED)' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Path Parameters */}
            {Object.keys(pathParams).length > 0 && (
              <div style={{ marginTop: '0.75rem' }}>
                <label style={{ fontSize: '0.8rem', opacity: 0.8 }}>
                  Path Parameters
                </label>
                {Object.entries(pathParams).map(([key, value]) => (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                    <code style={{ fontSize: '0.8rem', padding: '0.2rem 0.5rem', backgroundColor: '#0f172a', borderRadius: '0.4rem' }}>
                      {key}
                    </code>
                    <input
                      value={value}
                      onChange={(e) => handlePathParamChange(key, e.target.value)}
                      placeholder={`Enter ${key}`}
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
                  </div>
                ))}
              </div>
            )}

            {/* Path */}
            <div style={{ marginTop: '0.75rem' }}>
              <label style={{ fontSize: '0.8rem', opacity: 0.8 }}>Resolved Path</label>
              <input
                value={pathOverride}
                onChange={(e) => setPathOverride(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  marginTop: '0.25rem',
                  borderRadius: '0.4rem',
                  backgroundColor: '#0f172a',
                  color: 'white',
                  border: '1px solid #38bdf8',
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

            {/* File download endpoints */}
            {selectedApi?.contentType === 'file' && (
              <div style={{ marginTop: '0.75rem' }}>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <button
                    onClick={handleDownloadFile}
                    disabled={isDownloadingFile || !token}
                    style={{
                      padding: '0.6rem 1.4rem',
                      borderRadius: '999px',
                      backgroundColor: isDownloadingFile || !token ? '#4b5563' : '#8b5cf6',
                      border: 'none',
                      fontWeight: 700,
                      cursor: isDownloadingFile || !token ? 'not-allowed' : 'pointer',
                      color: '#020617',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                    }}
                  >
                    <span>{isDownloadingFile ? '⬇️ Downloading...' : '⬇️ Download File'}</span>
                  </button>
                </div>
              </div>
            )}

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
                    accept=".xlsx,.xls,.csv"
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
                      📄 Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(2)} KB)
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

            {/* JSON body for POST/PUT endpoints */}
            {selectedApi?.method !== 'GET' && 
             selectedApi?.method !== 'DELETE' && 
             selectedApi?.contentType !== 'form-data' && 
             selectedApi?.contentType !== 'file' && (
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
              {selectedApi?.contentType !== 'file' && (
                <button
                  onClick={handleSend}
                  disabled={isLoading}
                  style={{
                    padding: '0.6rem 1.4rem',
                    borderRadius: '999px',
                    backgroundColor: isLoading ? '#4b5563' : 
                                   selectedApi?.method === 'GET' ? '#22c55e' :
                                   selectedApi?.method === 'POST' ? '#f97316' :
                                   selectedApi?.method === 'PUT' ? '#8b5cf6' : '#ef4444',
                    border: 'none',
                    fontWeight: 700,
                    cursor: isLoading ? 'not-allowed' : 'pointer',
                    color: '#020617',
                  }}
                >
                  {isLoading ? '⏳ Sending...' : `🚀 ${selectedApi?.method} Request`}
                </button>
              )}

              {loginSuccess && (
                <button
                  onClick={() => {
                    const me = apiDocs.find((e) =>
                      e.path.includes('/api/auth/me')
                    )
                    if (me) {
                      setSelectedId(me.id)
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
                  👤 View /auth/me ➜
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
                  border: '1px solid #ef4444',
                }}
              >
                ❌ {error}
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
                  backgroundColor: '#0f172a',
                  padding: '0.75rem',
                  borderRadius: '0.4rem',
                  minHeight: '130px',
                  maxHeight: '320px',
                  overflow: 'auto',
                  whiteSpace: 'pre-wrap',
                  border: '1px solid #1f2937',
                  fontSize: '0.85rem',
                  color: responseText.includes('✅') ? '#22c55e' : responseText.includes('❌') ? '#ef4444' : '#e5e7eb',
                }}
              >
                {responseText || '// Response will appear here'}
              </pre>
            </div>
          </section>

          {/* SAMPLE USAGE GUIDE */}
          {(selectedApi?.id === 'staff-upload' || 
            selectedApi?.id === 'payroll-upload' || 
            selectedApi?.contentType === 'form-data') && (
            <section
              style={{
                background: '#020617',
                borderRadius: '0.75rem',
                border: '1px solid #1e293b',
                padding: '1rem',
              }}
            >
              <h3 style={{ fontSize: '0.9rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span>📋 How to test this upload:</span>
              </h3>
              <ol style={{ fontSize: '0.85rem', opacity: 0.8, paddingLeft: '1rem', margin: 0 }}>
                <li>First, get a JWT token by logging in using <code>/api/auth/login</code></li>
                <li>Download the template using the <strong>Download File</strong> button (if available)</li>
                <li>Fill the template with your data</li>
                <li>Click "Choose File" to select your filled template</li>
                <li>Adjust any additional form fields if needed (e.g., sendEmails)</li>
                <li>Click "POST Request" to upload and process</li>
                <li>Check the response for processing results and any errors</li>
              </ol>
            </section>
          )}

          {/* FILE DOWNLOAD GUIDE */}
          {selectedApi?.contentType === 'file' && (
            <section
              style={{
                background: '#020617',
                borderRadius: '0.75rem',
                border: '1px solid #1e293b',
                padding: '1rem',
              }}
            >
              <h3 style={{ fontSize: '0.9rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span>📥 File Download Instructions:</span>
              </h3>
              <ol style={{ fontSize: '0.85rem', opacity: 0.8, paddingLeft: '1rem', margin: 0 }}>
                <li>Ensure you have a valid JWT token</li>
                <li>Fill in any required path parameters</li>
                <li>Click the <strong>Download File</strong> button</li>
                <li>The file will be downloaded automatically</li>
                <li>Check your browser's download folder</li>
              </ol>
              {selectedApi.id === 'payroll-download-failed' && (
                <p style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: '#f97316', background: '#f9731633', padding: '0.5rem', borderRadius: '0.4rem' }}>
                  ⚠️ Note: You need a valid PayrollUpload ID from a previous upload that had failed records.
                </p>
              )}
            </section>
          )}

          {/* DEPRECATED ENDPOINT WARNING */}
          {selectedApi?.deprecated && (
            <section
              style={{
                background: '#f9731633',
                borderRadius: '0.75rem',
                border: '1px solid #f9731655',
                padding: '1rem',
              }}
            >
              <h3 style={{ fontSize: '0.9rem', marginBottom: '0.5rem', color: '#f97316' }}>
                ⚠️ Deprecated Endpoint
              </h3>
              <p style={{ fontSize: '0.85rem', opacity: 0.9 }}>
                This endpoint is deprecated and will be removed in a future version.
                {selectedApi.alternative && (
                  <> Please use <code style={{ background: '#020617', padding: '0.1rem 0.3rem', borderRadius: '0.2rem' }}>{selectedApi.alternative}</code> instead.</>
                )}
              </p>
            </section>
          )}
        </main>
      </div>
    </div>
  )
}