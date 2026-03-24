// components/CompanyAssignmentPanel.tsx
'use client'

import { useState, useEffect } from 'react'

interface Staff {
  id: string
  staffId: string
  email: string
  firstName: string
  lastName: string
  fullName: string
  department: string
  position: string
  role: string
  company: {
    id: string
    companyName: string
  } | null
  displayLabel: string
}

interface Company {
  id: string
  companyName: string
  email: string
  phone?: string
  displayLabel: string
}

interface Assignment {
  id: string
  userId: string
  companyId: string
  role: string
  createdAt: string
  user?: {
    firstName: string
    lastName: string
    email: string
    fullName?: string
  }
  company?: {
    companyName: string
  }
}

export function CompanyAssignmentPanel() {
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [staff, setStaff] = useState<Staff[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [selectedUser, setSelectedUser] = useState('')
  const [selectedCompany, setSelectedCompany] = useState('')
  const [selectedRole, setSelectedRole] = useState('HR')
  const [loading, setLoading] = useState({
    assignments: false,
    staff: false,
    companies: false,
    assigning: false,
    removing: false
  })
  const [error, setError] = useState('')

  // Fetch all initial data
  useEffect(() => {
    fetchAssignments()
    fetchStaff()
    fetchCompanies()
  }, [])

  const fetchAssignments = async () => {
    setLoading(prev => ({ ...prev, assignments: true }))
    setError('')
    try {
      const token = localStorage.getItem('token')
      if (!token) {
        setError('No authentication token found')
        return
      }

      const response = await fetch('/api/admin/company-assignments', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      const result = await response.json()
      
      if (result.success) {
        setAssignments(result.data.assignments || [])
      } else {
        setError(result.message || 'Failed to fetch assignments')
      }
    } catch (error) {
      console.error('Error fetching assignments:', error)
      setError('Failed to load assignments')
    } finally {
      setLoading(prev => ({ ...prev, assignments: false }))
    }
  }

  const fetchStaff = async () => {
    setLoading(prev => ({ ...prev, staff: true }))
    setError('')
    try {
      const token = localStorage.getItem('token')
      if (!token) {
        setError('No authentication token found')
        return
      }

      const response = await fetch('/api/admin/staff', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      const result = await response.json()
      
      if (result.success) {
        setStaff(result.data || [])
      } else {
        setError(result.message || 'Failed to fetch staff')
      }
    } catch (error) {
      console.error('Error fetching staff:', error)
      setError('Failed to load staff list')
    } finally {
      setLoading(prev => ({ ...prev, staff: false }))
    }
  }

  const fetchCompanies = async () => {
    setLoading(prev => ({ ...prev, companies: true }))
    setError('')
    try {
      const token = localStorage.getItem('token')
      if (!token) {
        setError('No authentication token found')
        return
      }

      const response = await fetch('api/companies/accessible', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      const result = await response.json()
      
      if (result.success) {
        setCompanies(result.data || [])
      } else {
        setError(result.message || 'Failed to fetch companies')
      }
    } catch (error) {
      console.error('Error fetching companies:', error)
      setError('Failed to load company list')
    } finally {
      setLoading(prev => ({ ...prev, companies: false }))
    }
  }

  const assignCompany = async () => {
    if (!selectedUser || !selectedCompany) {
      setError('Please select both a user and a company')
      return
    }

    setLoading(prev => ({ ...prev, assigning: true }))
    setError('')
    try {
      const token = localStorage.getItem('token')
      if (!token) {
        setError('No authentication token found')
        return
      }

      const response = await fetch('/api/admin/assign-company', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId: selectedUser,
          companyId: selectedCompany,
          role: selectedRole
        })
      })

      const result = await response.json()
      
      if (result.success) {
        // Reset form
        setSelectedUser('')
        setSelectedCompany('')
        setSelectedRole('HR')
        
        // Refresh assignments list
        fetchAssignments()
        
        // Show success message
        alert('Company assigned successfully!')
      } else {
        setError(result.message || 'Failed to assign company')
      }
    } catch (error) {
      console.error('Error assigning company:', error)
      setError('Failed to assign company. Please try again.')
    } finally {
      setLoading(prev => ({ ...prev, assigning: false }))
    }
  }

  const removeAssignment = async (userId: string, companyId: string) => {
    if (!confirm('Are you sure you want to remove this assignment?')) {
      return
    }

    setLoading(prev => ({ ...prev, removing: true }))
    setError('')
    try {
      const token = localStorage.getItem('token')
      if (!token) {
        setError('No authentication token found')
        return
      }

      const response = await fetch(
        `/api/admin/assign-company?userId=${userId}&companyId=${companyId}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      )

      const result = await response.json()
      
      if (result.success) {
        // Refresh assignments list
        fetchAssignments()
        
        // Show success message
        alert('Assignment removed successfully!')
      } else {
        setError(result.message || 'Failed to remove assignment')
      }
    } catch (error) {
      console.error('Error removing assignment:', error)
      setError('Failed to remove assignment. Please try again.')
    } finally {
      setLoading(prev => ({ ...prev, removing: false }))
    }
  }

  // Get user name for display
  const getUserDisplayName = (userId: string) => {
    const user = staff.find(u => u.id === userId)
    return user ? `${user.firstName} ${user.lastName}` : `User ID: ${userId}`
  }

  // Get company name for display
  const getCompanyDisplayName = (companyId: string) => {
    const company = companies.find(c => c.id === companyId)
    return company ? company.companyName : `Company ID: ${companyId}`
  }

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-6">Company Assignment Management</h2>
      
      {/* Error Display */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-700">{error}</p>
        </div>
      )}
      
      {/* Assignment Form */}
      <div className="bg-white p-6 rounded-lg shadow mb-6">
        <h3 className="text-lg font-semibold mb-4">Assign Company to User</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium mb-2">Select User</label>
            <select 
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              className="w-full p-2 border rounded"
              disabled={loading.staff || loading.assigning}
            >
              <option value="">Choose a user</option>
              {staff.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.fullName} ({person.email}) - {person.role}
                </option>
              ))}
            </select>
            {loading.staff && (
              <p className="mt-1 text-sm text-gray-500">Loading users...</p>
            )}
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2">Select Company</label>
            <select 
              value={selectedCompany}
              onChange={(e) => setSelectedCompany(e.target.value)}
              className="w-full p-2 border rounded"
              disabled={loading.companies || loading.assigning}
            >
              <option value="">Choose a company</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.companyName}
                </option>
              ))}
            </select>
            {loading.companies && (
              <p className="mt-1 text-sm text-gray-500">Loading companies...</p>
            )}
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2">Select Role</label>
            <select 
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              className="w-full p-2 border rounded"
              disabled={loading.assigning}
            >
              <option value="HR">HR Manager</option>
              <option value="ADMIN">Administrator</option>
              <option value="SUPER_ADMIN">Super Administrator</option>
              {/* Add other roles as needed */}
            </select>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <button
            onClick={assignCompany}
            disabled={!selectedUser || !selectedCompany || loading.assigning}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {loading.assigning ? 'Assigning...' : 'Assign Company'}
          </button>
          
          <button
            onClick={() => {
              setSelectedUser('')
              setSelectedCompany('')
              setSelectedRole('HR')
            }}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
          >
            Clear Selection
          </button>
        </div>
      </div>
      
      {/* Current Assignments List */}
      <div className="bg-white p-6 rounded-lg shadow">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">Current Assignments</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchAssignments}
              disabled={loading.assignments}
              className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded disabled:opacity-50"
            >
              {loading.assignments ? 'Refreshing...' : 'Refresh'}
            </button>
            <span className="text-sm text-gray-500">
              {assignments.length} assignment(s)
            </span>
          </div>
        </div>
        
        {loading.assignments ? (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-2 text-gray-600">Loading assignments...</p>
          </div>
        ) : assignments.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p>No assignments found. Assign a company to a user to get started.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-100">
                  <th className="p-3 text-left">User</th>
                  <th className="p-3 text-left">Company</th>
                  <th className="p-3 text-left">Role</th>
                  <th className="p-3 text-left">Assigned On</th>
                  <th className="p-3 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {assignments.map((assignment) => {
                  const userName = assignment.user 
                    ? `${assignment.user.firstName} ${assignment.user.lastName}`
                    : getUserDisplayName(assignment.userId)
                  
                  const companyName = assignment.company?.companyName 
                    || getCompanyDisplayName(assignment.companyId)
                  
                  return (
                    <tr key={assignment.id} className="border-b hover:bg-gray-50">
                      <td className="p-3">
                        <div className="font-medium">{userName}</div>
                        {assignment.user?.email && (
                          <div className="text-sm text-gray-500">{assignment.user.email}</div>
                        )}
                      </td>
                      <td className="p-3">{companyName}</td>
                      <td className="p-3">
                        <span className={`px-2 py-1 rounded-full text-xs ${
                          assignment.role === 'ADMIN' ? 'bg-purple-100 text-purple-800' :
                          assignment.role === 'HR' ? 'bg-green-100 text-green-800' :
                          'bg-blue-100 text-blue-800'
                        }`}>
                          {assignment.role}
                        </span>
                      </td>
                      <td className="p-3">
                        {new Date(assignment.createdAt).toLocaleDateString()}
                        <div className="text-xs text-gray-500">
                          {new Date(assignment.createdAt).toLocaleTimeString()}
                        </div>
                      </td>
                      <td className="p-3">
                        <button
                          onClick={() => removeAssignment(assignment.userId, assignment.companyId)}
                          disabled={loading.removing}
                          className="px-3 py-1 text-sm text-red-600 hover:text-red-800 hover:bg-red-50 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Remove assignment"
                        >
                          {loading.removing ? 'Removing...' : 'Remove'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      
      {/* Debug Info this is for our own debugging it will be remove when everything work well */}
      {process.env.NODE_ENV === 'development' && (
        <div className="mt-8 p-4 bg-gray-50 rounded-lg">
          <h4 className="text-sm font-semibold mb-2">Debug Info</h4>
          <div className="text-xs text-gray-600 space-y-1">
            <div>Staff loaded: {staff.length}</div>
            <div>Companies loaded: {companies.length}</div>
            <div>Assignments loaded: {assignments.length}</div>
            <div>Selected user: {selectedUser || 'none'}</div>
            <div>Selected company: {selectedCompany || 'none'}</div>
            <div>Selected role: {selectedRole}</div>
          </div>
        </div>
      )}
    </div>
  )
}