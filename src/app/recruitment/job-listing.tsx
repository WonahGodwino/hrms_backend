// src/app/recruitment/job-upload.tsx
'use client'

import { useState } from 'react'

export default function JobUpload() {
  const [file, setFile] = useState<File | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [message, setMessage] = useState('')

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) setFile(file)
  }

  const handleUpload = async () => {
    if (!file) {
      setMessage('Please select a file to upload.')
      return
    }

    setIsLoading(true)
    setMessage('')

    const formData = new FormData()
    formData.append('file', file)

    try {
      const response = await fetch('/api/jobs/upload', {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()
      if (data.success) {
        setMessage('Jobs uploaded successfully.')
      } else {
        setMessage(data.message)
      }
    } catch (error) {
      setMessage('Error uploading file.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div>
      <h1>Upload Job Postings</h1>
      <input type="file" accept=".xlsx, .xls, .csv" onChange={handleFileChange} />
      <button onClick={handleUpload} disabled={isLoading}>
        {isLoading ? 'Uploading...' : 'Upload Jobs'}
      </button>
      {message && <p>{message}</p>}
    </div>
  )
}
