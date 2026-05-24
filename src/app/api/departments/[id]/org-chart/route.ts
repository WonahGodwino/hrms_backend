// src/app/api/departments/[id]/org-chart/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { getDepartmentWithAccess } from '@/app/lib/departments/department-utils'

async function buildOrgChart(departmentId: string, companyId: string) {
  const department = await prisma.department.findFirst({
    where: { id: departmentId, companyId },
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
      }
    }
  })

  if (!department || !department.head) {
    return { nodes: [], edges: [] }
  }

  const nodes: any[] = []
  const edges: any[] = []

  function processStaff(staff: any, parentId: string | null, level: number = 0, xOffset: number = 0) {
    const nodeId = staff.id
    const initials = `${staff.firstName?.[0] || ''}${staff.lastName?.[0] || ''}`.toUpperCase()
    
    let colorTheme = 'default'
    if (level === 0) colorTheme = 'emerald'
    else if (level === 1) colorTheme = 'purple'
    else if (level === 2) colorTheme = 'amber'

    nodes.push({
      id: nodeId,
      type: 'orgNode',
      position: { x: xOffset * 250, y: level * 150 },
      data: {
        name: `${staff.firstName} ${staff.lastName}`,
        role: staff.position || 'Staff',
        avatarSrc: staff.avatarUrl || null,
        initials,
        colorTheme,
        isHighlight: level === 0,
        email: staff.email,
        status: staff.isActive ? 'Active' : 'Inactive'
      }
    })

    if (parentId) {
      edges.push({
        id: `e${parentId}-${nodeId}`,
        source: parentId,
        target: nodeId,
        animated: false
      })
    }

    if (staff.directReports && staff.directReports.length > 0) {
      const childCount = staff.directReports.length
      const startX = xOffset - (childCount - 1) * 0.5
      staff.directReports.forEach((report: any, index: number) => {
        processStaff(report, nodeId, level + 1, startX + index)
      })
    }
  }

  processStaff(department.head, null, 0, 0)
  
  return { nodes, edges }
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const origin = request.headers.get('origin')
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(ApiResponse.error('Authorization header missing', 401), origin)
    }

    const token = authHeader.replace('Bearer ', '')
    const user = requireRole(token, ['HR', 'SUPER_ADMIN', 'ADMIN', 'MANAGER'])
    
    const department = await getDepartmentWithAccess(user, params.id)
    
    const orgChartData = await buildOrgChart(params.id, department.companyId)
    
    return withCors(ApiResponse.success(orgChartData), origin)
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}