// src/app/recruitment/selection.tsx

'use client'

import { useState, useEffect } from 'react'

export default function JobSelection({ jobId }: { jobId: string }) {
  const [applicants, setApplicants] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    async function fetchRankedApplicants() {
      setLoading(true)

      const response = await fetch('/api/recruitment/selection', {
        method: 'POST',
        body: JSON.stringify({ jobId }),
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const data = await response.json()
      if (data.success) {
        setApplicants(data.data)
      } else {
        console.error('Failed to fetch applicants', data.message)
      }

      setLoading(false)
    }

    fetchRankedApplicants()
  }, [jobId])

  return (
    <div>
      <h2>Ranked Applicants</h2>
      {loading ? (
        <p>Loading...</p>
      ) : (
        <ul>
          {applicants.map((applicant) => (
            <li key={applicant.id}>
              {applicant.firstName} {applicant.lastName} – Matches: {applicant.matchCount}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
