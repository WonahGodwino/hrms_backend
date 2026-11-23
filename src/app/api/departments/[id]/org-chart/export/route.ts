// src/app/api/departments/[id]/org-chart/export/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { getDepartmentWithAccess } from '@/app/lib/departments/department-utils'
import { generateOrgChartHTML, type OrgChartNode, type OrgChartEdge, type OrgChartData } from '@/app/lib/departments/org-chart-export-helpers'







// Helper function to build org chart data
async function buildOrgChartData(departmentId: string, _companyId: string): Promise<OrgChartData> {
  const department = await prisma.department.findUnique({
    where: { id: departmentId },
    include: {
      head: {
        include: {
          directReports: {
            include: {
              directReports: {
                include: {
                  directReports: {
                    include: {
                      directReports: true
                    }
                  }
                }
              }
            }
          }
        }
      },
      company: { select: { companyName: true } }
    }
  })

  if (!department) {
    throw new Error('Department not found')
  }

  const nodes: OrgChartNode[] = []
  const edges: OrgChartEdge[] = []
  let maxLevel = 0

  function calculateLevel(staff: any, currentLevel: number = 0): number {
    let maxChildLevel = currentLevel
    if (staff.directReports && staff.directReports.length > 0) {
      staff.directReports.forEach((report: any) => {
        const childLevel = calculateLevel(report, currentLevel + 1)
        maxChildLevel = Math.max(maxChildLevel, childLevel)
      })
    }
    return maxChildLevel
  }

  function processStaff(staff: any, parentId: string | null, level: number = 0) {
    maxLevel = Math.max(maxLevel, level)
    
    nodes.push({
      id: staff.id,
      name: `${staff.firstName} ${staff.lastName}`,
      role: staff.position || staff.jobTitle || 'Staff Member',
      email: staff.email || '',
      status: staff.isActive ? 'Active' : 'Inactive'
    })

    if (parentId) {
      edges.push({ source: parentId, target: staff.id })
    }

    if (staff.directReports && staff.directReports.length > 0) {
      staff.directReports.forEach((report: any) => {
        processStaff(report, staff.id, level + 1)
      })
    }
  }

  if (department.head) {
    processStaff(department.head, null)
    maxLevel = calculateLevel(department.head)
  }
  return {
    nodes,
    edges,
    departmentName: department.name,
    companyName: department.company?.companyName || 'Company',
    generatedAt: new Date().toISOString(),
    metadata: {
      totalEmployees: nodes.length,
      levels: maxLevel + 1,
      headOfDepartment: department.head ? `${department.head.firstName} ${department.head.lastName}` : 'Not Assigned'
    }
  }
}







// Cache control headers
const CACHE_CONTROL = {
  html: 'private, max-age=0, no-cache',
  pdf: 'private, max-age=0, no-cache'
}

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const origin = request.headers.get('origin')
  const startTime = Date.now()

  try {
    // Authentication
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    const user = requireRole(token, ['HR', 'SUPER_ADMIN', 'ADMIN', 'MANAGER'])
    
    // Get department with access check
    const department = await getDepartmentWithAccess(user, params.id)
    
    // Parse query parameters
    const { searchParams } = new URL(request.url)
    const format = searchParams.get('format')?.toLowerCase() || 'html'
    
    // Validate format
    if (!['html', 'pdf'].includes(format)) {
      return withCors(
        ApiResponse.error('Invalid format. Supported formats: html, pdf', 400),
        origin
      )
    }
    
    // Build organization chart data
    const orgChartData = await buildOrgChartData(params.id, department.companyId)
    
    // Handle empty data
    if (orgChartData.nodes.length === 0) {
      return withCors(
        ApiResponse.error('No employees found in this department', 404),
        origin
      )
    }
    
    // Generate HTML
    const html = generateOrgChartHTML(orgChartData)
    const filename = `org-chart-${department.name.replace(/[^a-z0-9]/gi, '_')}-${Date.now()}`
    
    // For HTML format, return directly
    if (format === 'html') {
      return new Response(html, {
        status: 200,
        headers: {
          'Content-Type': 'text/html',
          'Content-Disposition': `attachment; filename="${filename}.html"`,
          'Cache-Control': CACHE_CONTROL.html,
          'X-Generation-Time': `${Date.now() - startTime}ms`
        }
      })
    }
    
    // For PDF format, return the same HTML with print instructions
    // Users can use browser's print-to-PDF feature
    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html',
        'Content-Disposition': `inline; filename="${filename}.html"`,
        'Cache-Control': CACHE_CONTROL.pdf,
        'X-Generation-Time': `${Date.now() - startTime}ms`,
        'X-PDF-Tip': 'Use browser print (Ctrl+P) to save as PDF'
      }
    })
    
  } catch (error) {
    console.error('Export Error:', error)
    return withCors(handleApiError(error), origin)
  }
}