// src/app/api/departments/[id]/org-chart/export/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { getDepartmentWithAccess } from '@/app/lib/departments/department-utils'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

async function buildOrgChartData(departmentId: string, companyId: string) {
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

  function processStaff(staff: any, parentId: string | null) {
    nodes.push({
      id: staff.id,
      name: `${staff.firstName} ${staff.lastName}`,
      role: staff.position || 'Staff',
      email: staff.email,
      status: staff.isActive ? 'Active' : 'Inactive'
    })

    if (parentId) {
      edges.push({ source: parentId, target: staff.id })
    }

    if (staff.directReports && staff.directReports.length > 0) {
      staff.directReports.forEach((report: any) => {
        processStaff(report, staff.id)
      })
    }
  }

  processStaff(department.head, null)
  
  return { nodes, edges, departmentName: department.name }
}

function generateOrgChartHTML(data: any, departmentName: string): string {
  return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Org Chart - ${escapeHtml(departmentName)}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
            padding: 40px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
        }
        .container {
            max-width: 1400px;
            margin: 0 auto;
            background: white;
            border-radius: 16px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            overflow: hidden;
        }
        .header {
            background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
            color: white;
            padding: 32px;
            text-align: center;
        }
        .department-title {
            font-size: 28px;
            font-weight: 700;
            margin-bottom: 8px;
        }
        .generated-date {
            font-size: 14px;
            opacity: 0.8;
        }
        .org-chart {
            padding: 40px;
            overflow-x: auto;
        }
        .tree {
            position: relative;
            display: inline-block;
            min-width: 100%;
        }
        .tree ul {
            padding-top: 20px;
            position: relative;
            display: flex;
            justify-content: center;
            flex-wrap: wrap;
        }
        .tree li {
            float: left;
            text-align: center;
            list-style-type: none;
            position: relative;
            padding: 20px 10px 0 10px;
        }
        .tree li::before, .tree li::after {
            content: '';
            position: absolute;
            top: 0;
            right: 50%;
            border-top: 2px solid #cbd5e1;
            width: 50%;
            height: 20px;
        }
        .tree li::after {
            left: 50%;
            right: auto;
            border-left: 2px solid #cbd5e1;
        }
        .tree li:only-child::after, .tree li:only-child::before {
            display: none;
        }
        .tree li:only-child { padding-top: 0; }
        .tree li:first-child::before, .tree li:last-child::after {
            border: 0 none;
        }
        .tree li:last-child::before {
            border-right: 2px solid #cbd5e1;
            border-radius: 0 5px 0 0;
        }
        .tree li:first-child::after {
            border-radius: 5px 0 0 0;
        }
        .tree ul ul::before {
            content: '';
            position: absolute;
            top: 0;
            left: 50%;
            border-left: 2px solid #cbd5e1;
            width: 0;
            height: 20px;
        }
        .node {
            background: white;
            border: 2px solid #e2e8f0;
            border-radius: 12px;
            padding: 16px 24px;
            margin: 8px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            min-width: 220px;
            transition: all 0.3s ease;
        }
        .node:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 12px rgba(0,0,0,0.15);
        }
        .node-name {
            font-weight: 700;
            font-size: 16px;
            color: #1e293b;
            margin-bottom: 4px;
        }
        .node-role {
            font-size: 13px;
            color: #64748b;
            margin-top: 4px;
            font-weight: 500;
        }
        .node-email {
            font-size: 11px;
            color: #94a3b8;
            margin-top: 6px;
            word-break: break-all;
        }
        .level-0 .node {
            background: linear-gradient(135deg, #10b981 0%, #059669 100%);
            border-color: #059669;
        }
        .level-0 .node-name, .level-0 .node-role, .level-0 .node-email { color: white; }
        .level-1 .node { background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); border-color: #7c3aed; }
        .level-1 .node-name, .level-1 .node-role, .level-1 .node-email { color: white; }
        .level-2 .node { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); border-color: #d97706; }
        .level-2 .node-name, .level-2 .node-role, .level-2 .node-email { color: white; }
        @media print {
            body {
                background: white;
                padding: 20px;
            }
            .container {
                box-shadow: none;
            }
            .node {
                break-inside: avoid;
                page-break-inside: avoid;
            }
            .tree li::before, .tree li::after {
                border-top-width: 1px;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1 class="department-title">${escapeHtml(departmentName)}</h1>
            <p class="generated-date">Organization Chart - Generated on ${new Date().toLocaleDateString()}</p>
        </div>
        <div class="org-chart">
            ${renderTree(data)}
        </div>
    </div>
</body>
</html>`
}

function renderTree(data: any): string {
  const nodeMap = new Map(data.nodes.map((n: any) => [n.id, n]))
  const childrenMap = new Map<string, any[]>()
  
  data.edges.forEach((edge: any) => {
    if (!childrenMap.has(edge.source)) {
      childrenMap.set(edge.source, [])
    }
    childrenMap.get(edge.source)!.push(nodeMap.get(edge.target))
  })
  
  const roots = data.nodes.filter((node: any) => 
    !data.edges.some((edge: any) => edge.target === node.id)
  )
  
  function renderNode(node: any, level: number = 0): string {
    const children = childrenMap.get(node.id) || []
    const levelClass = `level-${Math.min(level, 2)}`
    return `
      <li class="${levelClass}">
        <div class="node">
          <div class="node-name">${escapeHtml(node.name)}</div>
          <div class="node-role">${escapeHtml(node.role)}</div>
          <div class="node-email">${escapeHtml(node.email)}</div>
        </div>
        ${children.length > 0 ? `<ul>${children.map((child: any) => renderNode(child, level + 1)).join('')}</ul>` : ''}
      </li>
    `
  }
  
  return `<ul class="tree">${roots.map((root: any) => renderNode(root, 0)).join('')}</ul>`
}

function escapeHtml(str: string): string {
  if (!str) return ''
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
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
    
    const { searchParams } = new URL(request.url)
    const format = searchParams.get('format') || 'html'
    
    const orgChartData = await buildOrgChartData(params.id, department.companyId)
    
    if (format === 'html') {
      const html = generateOrgChartHTML(orgChartData, department.name)
      return new Response(html, {
        headers: {
          'Content-Type': 'text/html',
          'Content-Disposition': `attachment; filename="org-chart-${department.name.replace(/[^a-z0-9]/gi, '_')}-${Date.now()}.html"`
        }
      })
    }
    
    // Default to HTML
    const html = generateOrgChartHTML(orgChartData, department.name)
    return new Response(html, {
      headers: {
        'Content-Type': 'text/html',
        'Content-Disposition': `attachment; filename="org-chart-${department.name.replace(/[^a-z0-9]/gi, '_')}-${Date.now()}.html"`
      }
    })
  } catch (error) {
    return withCors(handleApiError(error), origin)
  }
}