// src/app/recruitment/job-template.tsx
'use client'

import { useState } from 'react'

export default function JobTemplateDownload() {
  const [isLoading, setIsLoading] = useState(false)
  const [message, setMessage] = useState('')

  const handleDownload = async () => {
    setIsLoading(true)
    setMessage('')

    try {
      const response = await fetch('/api/jobs/template', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('hrms_token')}`,
        },
      })

      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'job_advertisement_template.xlsx'
        a.click()
        setMessage('Template downloaded successfully.')
      } else {
        setMessage('Failed to download template.')
      }
    } catch (error) {
      setMessage('Error downloading template.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div>
      <h1>Download Job Advertisement Template</h1>
      <button onClick={handleDownload} disabled={isLoading}>
        {isLoading ? 'Downloading...' : 'Download Template'}
      </button>
      {message && <p>{message}</p>}
    </div>
  )
}
