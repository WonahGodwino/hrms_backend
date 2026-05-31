// src/app/api/departments/[id]/org-chart/export/route.ts
import { NextRequest } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, handleApiError } from '@/app/lib/utils'
import { handleCorsOptions, withCors } from '@/app/lib/cors'
import { getDepartmentWithAccess } from '@/app/lib/departments/department-utils'
import puppeteer from 'puppeteer'

// Types
interface OrgChartNode {
  id: string
  name: string
  role: string
  email: string
  status: string
}

interface OrgChartEdge {
  source: string
  target: string
}

interface OrgChartData {
  nodes: OrgChartNode[]
  edges: OrgChartEdge[]
  departmentName: string
  companyName: string
  generatedAt: string
  metadata: {
    totalEmployees: number
    levels: number
    headOfDepartment: string
  }
}

// Helper function to build org chart data
async function buildOrgChartData(departmentId: string, companyId: string): Promise<OrgChartData> {
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
      company: true
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

// Generate HTML for the org chart (same for both HTML and PDF)
function generateOrgChartHTML(data: OrgChartData): string {
  return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Organization Chart - ${escapeHtml(data.departmentName)}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
            padding: 20px;
            background: white;
            min-height: 100vh;
        }
        
        .print-tip {
            background: #fef3c7;
            border-left: 4px solid #f59e0b;
            padding: 12px 20px;
            margin-bottom: 20px;
            border-radius: 8px;
            max-width: 600px;
            margin: 0 auto 20px auto;
            text-align: center;
        }
        
        .print-tip kbd {
            background: #1f2937;
            color: white;
            padding: 2px 6px;
            border-radius: 4px;
            font-family: monospace;
            margin: 0 2px;
        }
        
        .container {
            max-width: 1400px;
            margin: 0 auto;
            background: white;
            border-radius: 16px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.1);
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
        
        .company-name {
            font-size: 16px;
            opacity: 0.9;
            margin-bottom: 8px;
        }
        
        .metadata {
            display: flex;
            justify-content: center;
            gap: 30px;
            margin-top: 20px;
            font-size: 14px;
            flex-wrap: wrap;
        }
        
        .metadata-item {
            text-align: center;
        }
        
        .metadata-label {
            font-size: 12px;
            opacity: 0.8;
            margin-bottom: 4px;
        }
        
        .metadata-value {
            font-weight: 600;
        }
        
        .generated-date {
            font-size: 12px;
            opacity: 0.7;
            margin-top: 15px;
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
            padding-top: 25px;
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
            padding: 25px 10px 0 10px;
        }
        
        .tree li::before, .tree li::after {
            content: '';
            position: absolute;
            top: 0;
            right: 50%;
            border-top: 2px solid #cbd5e1;
            width: 50%;
            height: 25px;
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
        .tree li:first-child::before, .tree li:last-child::after { border: 0 none; }
        .tree li:last-child::before { border-right: 2px solid #cbd5e1; border-radius: 0 5px 0 0; }
        .tree li:first-child::after { border-radius: 5px 0 0 0; }
        .tree ul ul::before {
            content: '';
            position: absolute;
            top: 0;
            left: 50%;
            border-left: 2px solid #cbd5e1;
            width: 0;
            height: 25px;
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
        
        .node-status {
            display: inline-block;
            font-size: 10px;
            padding: 2px 6px;
            border-radius: 10px;
            margin-top: 6px;
            font-weight: 600;
        }
        
        .status-active { background: #dcfce7; color: #166534; }
        .status-inactive { background: #fee2e2; color: #991b1b; }
        
        .level-0 .node { background: linear-gradient(135deg, #10b981 0%, #059669 100%); border-color: #059669; }
        .level-0 .node-name, .level-0 .node-role, .level-0 .node-email,
        .level-0 .node-status { color: white; }
        .level-0 .status-active { background: rgba(255,255,255,0.2); color: white; }
        
        .level-1 .node { background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); border-color: #7c3aed; }
        .level-1 .node-name, .level-1 .node-role, .level-1 .node-email { color: white; }
        
        .level-2 .node { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); border-color: #d97706; }
        .level-2 .node-name, .level-2 .node-role, .level-2 .node-email { color: white; }
        
        @media print {
            body {
                background: white;
                padding: 0;
                margin: 0;
            }
            
            .print-tip { display: none; }
            .container { box-shadow: none; border-radius: 0; }
            .node { break-inside: avoid; page-break-inside: avoid; }
            .tree li::before, .tree li::after { border-top-width: 1px; }
            .header { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .node { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
    </style>
</head>
<body>
    <div class="print-tip">
        💡 <strong>Tip:</strong> To save as PDF, press <kbd>Ctrl+P</kbd> (Windows) or <kbd>Cmd+P</kbd> (Mac) 
        and choose "Save as PDF"
    </div>
    <div class="container">
        <div class="header">
            <h1 class="department-title">${escapeHtml(data.departmentName)}</h1>
            <div class="company-name">${escapeHtml(data.companyName)}</div>
            <div class="metadata">
                <div class="metadata-item">
                    <div class="metadata-label">Total Employees</div>
                    <div class="metadata-value">${data.metadata.totalEmployees}</div>
                </div>
                <div class="metadata-item">
                    <div class="metadata-label">Hierarchy Levels</div>
                    <div class="metadata-value">${data.metadata.levels}</div>
                </div>
                <div class="metadata-item">
                    <div class="metadata-label">Department Head</div>
                    <div class="metadata-value">${escapeHtml(data.metadata.headOfDepartment)}</div>
                </div>
            </div>
            <div class="generated-date">Generated on ${new Date(data.generatedAt).toLocaleString()}</div>
        </div>
        <div class="org-chart">
            ${renderTree(data)}
        </div>
    </div>
</body>
</html>`
}

function renderTree(data: OrgChartData): string {
  const nodeMap = new Map(data.nodes.map(n => [n.id, n]))
  const childrenMap = new Map<string, OrgChartNode[]>()
  
  data.edges.forEach(edge => {
    if (!childrenMap.has(edge.source)) {
      childrenMap.set(edge.source, [])
    }
    const targetNode = nodeMap.get(edge.target)
    if (targetNode) {
      childrenMap.get(edge.source)!.push(targetNode)
    }
  })
  
  const roots = data.nodes.filter(node => 
    !data.edges.some(edge => edge.target === node.id)
  )
  
  function renderNode(node: OrgChartNode, level: number = 0): string {
    const children = childrenMap.get(node.id) || []
    const levelClass = `level-${Math.min(level, 2)}`
    const statusClass = node.status === 'Active' ? 'status-active' : 'status-inactive'
    
    return `
      <li class="${levelClass}">
        <div class="node">
          <div class="node-name">${escapeHtml(node.name)}</div>
          <div class="node-role">${escapeHtml(node.role)}</div>
          ${node.email ? `<div class="node-email">${escapeHtml(node.email)}</div>` : ''}
          <div class="node-status ${statusClass}">${node.status}</div>
        </div>
        ${children.length > 0 ? `<ul>${children.map(child => renderNode(child, level + 1)).join('')}</ul>` : ''}
      </li>
    `
  }
  
  return `<ul class="tree">${roots.map(root => renderNode(root, 0)).join('')}</ul>`
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

// Cache control headers
const CACHE_CONTROL = {
  html: 'private, max-age=0, no-cache',
  pdf: 'private, max-age=0, no-cache'
}

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
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