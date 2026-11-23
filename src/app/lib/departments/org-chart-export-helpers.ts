// Helpers for app/api/departments/[id]/org-chart/export/route.ts (CODE-004: moved out of the route file).


// Types
export interface OrgChartNode {
  id: string
  name: string
  role: string
  email: string
  status: string
}

export interface OrgChartEdge {
  source: string
  target: string
}

export interface OrgChartData {
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

// Generate HTML for the org chart (same for both HTML and PDF)
export function generateOrgChartHTML(data: OrgChartData): string {
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

export function renderTree(data: OrgChartData): string {
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

export function escapeHtml(str: string): string {
  if (!str) return ''
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
