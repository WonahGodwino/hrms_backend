// src/app/api/admin/assign-company/route.ts
// use to assign company to admin and HR by SUPER_ADMIN
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, formatError } from '@/app/lib/utils'
import { withCors } from '@/app/lib/cors'

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get('origin')
  return withCors(new NextResponse(null, { status: 200 }), origin)
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(
        ApiResponse.error('Authorization header missing', 401),
        origin
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const user = requireRole(token, ['SUPER_ADMIN']) // Only SUPER_ADMIN can assign companies

    const body = await request.json()
    const { userId, companyId, role = 'HR' } = body

    if (!userId || !companyId) {
      return withCors(
        ApiResponse.error('User ID and Company ID are required', 400),
        origin
      )
    }

    // Validate role
    if (!['HR', 'ADMIN'].includes(role)) {
      return withCors(
        ApiResponse.error('Role must be either HR or ADMIN', 400),
        origin
      )
    }

    // Verify user exists
    const userExists = await prisma.staffRecord.findUnique({
      where: { id: userId }
    })

    if (!userExists) {
      return withCors(
        ApiResponse.error('User not found', 404),
        origin
      )
    }

    // Verify company exists
    const companyExists = await prisma.company.findUnique({
      where: { id: companyId }
    })

    if (!companyExists) {
      return withCors(
        ApiResponse.error('Company not found', 404),
        origin
      )
    }

    // Check if user is already assigned to any company as HR
    if (role === 'HR') {
      const existingHRAssignments = await prisma.userCompany.findMany({
        where: {
          userId: userId,
          role: 'HR'
        }
      })

      if (existingHRAssignments.length > 0) {
        // Check if trying to assign to same company
        const isSameCompany = existingHRAssignments.some(
          assignment => assignment.companyId === companyId
        )

        if (isSameCompany) {
          return withCors(
            ApiResponse.error('User is already assigned as HR to this company', 400),
            origin
          )
        }

        // Check if trying to assign to a different company
        const otherCompanyAssignments = existingHRAssignments.filter(
          assignment => assignment.companyId !== companyId
        )

        if (otherCompanyAssignments.length > 0) {
          return withCors(
            ApiResponse.error('HR users cannot be assigned to more than one company', 400),
            origin
          )
        }
      }
    }

    // For ADMIN role, check if they're already assigned to the same company with same role
    if (role === 'ADMIN') {
      const existingAdminAssignment = await prisma.userCompany.findUnique({
        where: {
          userId_companyId: {
            userId,
            companyId
          }
        }
      })

      if (existingAdminAssignment && existingAdminAssignment.role === 'ADMIN') {
        return withCors(
          ApiResponse.error('User is already assigned as ADMIN to this company', 400),
          origin
        )
      }
    }

    // Assign company to user
    const userCompany = await prisma.userCompany.upsert({
      where: {
        userId_companyId: {
          userId,
          companyId
        }
      },
      update: {
        role,
        updatedAt: new Date()
      },
      create: {
        userId,
        companyId,
        role,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    })

    return withCors(
      ApiResponse.success(userCompany, 'Company assigned successfully'),
      origin
    )

  } catch (error) {
    const message = formatError(error)
    console.error('Error assigning company:', error)
    return withCors(ApiResponse.error(message, 500), origin)
  }
}

export async function DELETE(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(
        ApiResponse.error('Authorization header missing', 401),
        origin
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const user = requireRole(token, ['SUPER_ADMIN'])

    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const companyId = searchParams.get('companyId')

    if (!userId || !companyId) {
      return withCors(
        ApiResponse.error('User ID and Company ID are required', 400),
        origin
      )
    }

    // Verify the assignment exists before deletion
    const existingAssignment = await prisma.userCompany.findUnique({
      where: {
        userId_companyId: {
          userId,
          companyId
        }
      }
    })

    if (!existingAssignment) {
      return withCors(
        ApiResponse.error('Company assignment not found', 404),
        origin
      )
    }

    await prisma.userCompany.delete({
      where: {
        userId_companyId: {
          userId,
          companyId
        }
      }
    })

    return withCors(
      ApiResponse.success(null, 'Company assignment removed successfully'),
      origin
    )

  } catch (error) {
    const message = formatError(error)
    console.error('Error removing company assignment:', error)
    return withCors(ApiResponse.error(message, 500), origin)
  }
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(
        ApiResponse.error('Authorization header missing', 401),
        origin
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const user = requireRole(token, ['SUPER_ADMIN', 'ADMIN'])

    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const companyId = searchParams.get('companyId')

    // If both userId and companyId are provided, get specific assignment
    if (userId && companyId) {
      const assignment = await prisma.userCompany.findUnique({
        where: {
          userId_companyId: {
            userId,
            companyId
          }
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true
            }
          },
          company: {
            select: {
              id: true,
              companyName: true, // Changed from "name" to "companyName"
              email: true
            }
          }
        }
      })

      if (!assignment) {
        return withCors(
          ApiResponse.error('Company assignment not found', 404),
          origin
        )
      }

      return withCors(
        ApiResponse.success(assignment, 'Assignment retrieved successfully'),
        origin
      )
    }

    // If only userId is provided, get all companies for that user
    if (userId) {
      const userAssignments = await prisma.userCompany.findMany({
        where: { userId },
        include: {
          company: {
            select: {
              id: true,
              companyName: true, // Changed from "name" to "companyName"
              email: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      })

      return withCors(
        ApiResponse.success(userAssignments, 'User assignments retrieved successfully'),
        origin
      )
    }

    // If only companyId is provided, get all users for that company
    if (companyId) {
      const companyAssignments = await prisma.userCompany.findMany({
        where: { companyId },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      })

      return withCors(
        ApiResponse.success(companyAssignments, 'Company assignments retrieved successfully'),
        origin
      )
    }

    // If no specific parameters, get all assignments (only for SUPER_ADMIN)
    if (user.role !== 'SUPER_ADMIN') {
      return withCors(
        ApiResponse.error('Only SUPER_ADMIN can view all assignments', 403),
        origin
      )
    }

    const allAssignments = await prisma.userCompany.findMany({
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true
          }
        },
        company: {
          select: {
            id: true,
            companyName: true, // Changed from "name" to "companyName"
            email: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    return withCors(
      ApiResponse.success(allAssignments, 'All assignments retrieved successfully'),
      origin
    )

  } catch (error) {
    const message = formatError(error)
    console.error('Error retrieving company assignments:', error)
    return withCors(ApiResponse.error(message, 500), origin)
  }
}// src/app/api/admin/assign-company/route.ts
// use to assign company to admin and HR by SUPER_ADMIN
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { requireRole } from '@/app/lib/auth'
import { ApiResponse, formatError } from '@/app/lib/utils'
import { withCors } from '@/app/lib/cors'

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get('origin')
  return withCors(new NextResponse(null, { status: 200 }), origin)
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(
        ApiResponse.error('Authorization header missing', 401),
        origin
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const user = requireRole(token, ['SUPER_ADMIN']) // Only SUPER_ADMIN can assign companies

    const body = await request.json()
    const { userId, companyId, role = 'HR' } = body

    if (!userId || !companyId) {
      return withCors(
        ApiResponse.error('User ID and Company ID are required', 400),
        origin
      )
    }

    // Validate role
    if (!['HR', 'ADMIN'].includes(role)) {
      return withCors(
        ApiResponse.error('Role must be either HR or ADMIN', 400),
        origin
      )
    }

    // Verify user exists
    const userExists = await prisma.staffRecord.findUnique({
      where: { id: userId }
    })

    if (!userExists) {
      return withCors(
        ApiResponse.error('User not found', 404),
        origin
      )
    }

    // Verify company exists
    const companyExists = await prisma.company.findUnique({
      where: { id: companyId }
    })

    if (!companyExists) {
      return withCors(
        ApiResponse.error('Company not found', 404),
        origin
      )
    }

    // Check if user is already assigned to any company as HR
    if (role === 'HR') {
      const existingHRAssignments = await prisma.userCompany.findMany({
        where: {
          userId: userId,
          role: 'HR'
        }
      })

      if (existingHRAssignments.length > 0) {
        // Check if trying to assign to same company
        const isSameCompany = existingHRAssignments.some(
          assignment => assignment.companyId === companyId
        )

        if (isSameCompany) {
          return withCors(
            ApiResponse.error('User is already assigned as HR to this company', 400),
            origin
          )
        }

        // Check if trying to assign to a different company
        const otherCompanyAssignments = existingHRAssignments.filter(
          assignment => assignment.companyId !== companyId
        )

        if (otherCompanyAssignments.length > 0) {
          return withCors(
            ApiResponse.error('HR users cannot be assigned to more than one company', 400),
            origin
          )
        }
      }
    }

    // For ADMIN role, check if they're already assigned to the same company with same role
    if (role === 'ADMIN') {
      const existingAdminAssignment = await prisma.userCompany.findUnique({
        where: {
          userId_companyId: {
            userId,
            companyId
          }
        }
      })

      if (existingAdminAssignment && existingAdminAssignment.role === 'ADMIN') {
        return withCors(
          ApiResponse.error('User is already assigned as ADMIN to this company', 400),
          origin
        )
      }
    }

    // Assign company to user
    const userCompany = await prisma.userCompany.upsert({
      where: {
        userId_companyId: {
          userId,
          companyId
        }
      },
      update: {
        role,
        updatedAt: new Date()
      },
      create: {
        userId,
        companyId,
        role,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    })

    return withCors(
      ApiResponse.success(userCompany, 'Company assigned successfully'),
      origin
    )

  } catch (error) {
    const message = formatError(error)
    console.error('Error assigning company:', error)
    return withCors(ApiResponse.error(message, 500), origin)
  }
}

export async function DELETE(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(
        ApiResponse.error('Authorization header missing', 401),
        origin
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const user = requireRole(token, ['SUPER_ADMIN'])

    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const companyId = searchParams.get('companyId')

    if (!userId || !companyId) {
      return withCors(
        ApiResponse.error('User ID and Company ID are required', 400),
        origin
      )
    }

    // Verify the assignment exists before deletion
    const existingAssignment = await prisma.userCompany.findUnique({
      where: {
        userId_companyId: {
          userId,
          companyId
        }
      }
    })

    if (!existingAssignment) {
      return withCors(
        ApiResponse.error('Company assignment not found', 404),
        origin
      )
    }

    await prisma.userCompany.delete({
      where: {
        userId_companyId: {
          userId,
          companyId
        }
      }
    })

    return withCors(
      ApiResponse.success(null, 'Company assignment removed successfully'),
      origin
    )

  } catch (error) {
    const message = formatError(error)
    console.error('Error removing company assignment:', error)
    return withCors(ApiResponse.error(message, 500), origin)
  }
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')

  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return withCors(
        ApiResponse.error('Authorization header missing', 401),
        origin
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const user = requireRole(token, ['SUPER_ADMIN', 'ADMIN'])

    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const companyId = searchParams.get('companyId')

    // If both userId and companyId are provided, get specific assignment
    if (userId && companyId) {
      const assignment = await prisma.userCompany.findUnique({
        where: {
          userId_companyId: {
            userId,
            companyId
          }
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true
            }
          },
          company: {
            select: {
              id: true,
              companyName: true, // Changed from "name" to "companyName"
              email: true
            }
          }
        }
      })

      if (!assignment) {
        return withCors(
          ApiResponse.error('Company assignment not found', 404),
          origin
        )
      }

      return withCors(
        ApiResponse.success(assignment, 'Assignment retrieved successfully'),
        origin
      )
    }

    // If only userId is provided, get all companies for that user
    if (userId) {
      const userAssignments = await prisma.userCompany.findMany({
        where: { userId },
        include: {
          company: {
            select: {
              id: true,
              companyName: true, // Changed from "name" to "companyName"
              email: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      })

      return withCors(
        ApiResponse.success(userAssignments, 'User assignments retrieved successfully'),
        origin
      )
    }

    // If only companyId is provided, get all users for that company
    if (companyId) {
      const companyAssignments = await prisma.userCompany.findMany({
        where: { companyId },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      })

      return withCors(
        ApiResponse.success(companyAssignments, 'Company assignments retrieved successfully'),
        origin
      )
    }

    // If no specific parameters, get all assignments (only for SUPER_ADMIN)
    if (user.role !== 'SUPER_ADMIN') {
      return withCors(
        ApiResponse.error('Only SUPER_ADMIN can view all assignments', 403),
        origin
      )
    }

    const allAssignments = await prisma.userCompany.findMany({
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true
          }
        },
        company: {
          select: {
            id: true,
            companyName: true, // Changed from "name" to "companyName"
            email: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    return withCors(
      ApiResponse.success(allAssignments, 'All assignments retrieved successfully'),
      origin
    )

  } catch (error) {
    const message = formatError(error)
    console.error('Error retrieving company assignments:', error)
    return withCors(ApiResponse.error(message, 500), origin)
  }
}