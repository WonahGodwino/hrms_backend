// src/app/lib/services/grade-level.service.ts
import { prisma } from '@/app/lib/db'
import { GradeStatus } from '@prisma/client'

export interface GradeLevelFilters {
  search?: string
  status?: string
  page?: number
  limit?: number
}

export class GradeLevelService {
  private companyId: string
  private userId: string
  private userRole: string

  constructor(companyId: string, userId: string, userRole: string) {
    this.companyId = companyId
    this.userId = userId
    this.userRole = userRole
  }

  private validateAccess() {
    if (!['SUPER_ADMIN', 'HR', 'ADMIN'].includes(this.userRole)) {
      throw new Error('Access denied. Only HR and Admin can manage grade levels.')
    }
  }

  async getAllGrades(filters: GradeLevelFilters) {
    const { search, status, page = 1, limit = 10 } = filters
    const skip = (page - 1) * limit

    const where: any = { companyId: this.companyId }
    
    if (status && status !== 'all') {
      where.status = status
    }
    
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { rank: isNaN(Number(search)) ? undefined : Number(search) }
      ]
    }

    const [grades, total] = await Promise.all([
      prisma.gradeLevel.findMany({
        where,
        include: {
          steps: {
            orderBy: { stepNumber: 'asc' }
          },
          designations: {
            select: {
              id: true,
              title: true,
              code: true,
              staffCount: true
            }
          }
        },
        orderBy: { rank: 'asc' },
        skip,
        take: limit
      }),
      prisma.gradeLevel.count({ where })
    ])

    const data = grades.map(grade => ({
      id: grade.id,
      name: grade.name,
      rank: grade.rank,
      steps: grade.totalSteps,
      staffCount: grade.designations.reduce((sum, d) => sum + d.staffCount, 0),
      status: grade.status,
      basePay: grade.basePay,
      basePayFrequency: grade.basePayFrequency
    }))

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    }
  }

  async getGradeById(id: string) {
    const grade = await prisma.gradeLevel.findFirst({
      where: {
        id,
        companyId: this.companyId
      },
      include: {
        steps: {
          orderBy: { stepNumber: 'asc' }
        },
        benefits: true,
        designations: {
          select: {
            id: true,
            title: true,
            code: true,
            staffCount: true
          }
        }
      }
    })
    
    if (!grade) {
      throw new Error('Grade level not found or access denied')
    }
    
    return grade
  }

  async createGrade(data: { name: string; rank: number; summary?: string }) {
    this.validateAccess()
    
    // Check for duplicate rank within company
    const existingRank = await prisma.gradeLevel.findFirst({
      where: {
        companyId: this.companyId,
        rank: data.rank
      }
    })
    
    if (existingRank) {
      throw new Error(`Rank ${data.rank} is already in use in this company`)
    }
    
    // Check for duplicate name within company
    const existingName = await prisma.gradeLevel.findFirst({
      where: {
        companyId: this.companyId,
        name: data.name
      }
    })
    
    if (existingName) {
      throw new Error(`Grade level name "${data.name}" already exists in this company`)
    }
    
    return prisma.gradeLevel.create({
      data: {
        name: data.name,
        rank: data.rank,
        summary: data.summary,
        companyId: this.companyId,
        totalSteps: 1,
        createdBy: this.userId,
        steps: {
          create: {
            stepNumber: 1,
            incrementPercent: 0
          }
        }
      },
      include: {
        steps: true
      }
    })
  }

  async updateGrade(id: string, data: any) {
    this.validateAccess()
    
    const grade = await this.getGradeById(id)
    
    // Check rank uniqueness if updating
    if (data.rank && data.rank !== grade.rank) {
      const existingRank = await prisma.gradeLevel.findFirst({
        where: {
          companyId: this.companyId,
          rank: data.rank,
          id: { not: id }
        }
      })
      if (existingRank) {
        throw new Error(`Rank ${data.rank} is already in use in this company`)
      }
    }
    
    // Check name uniqueness if updating
    if (data.name && data.name !== grade.name) {
      const existingName = await prisma.gradeLevel.findFirst({
        where: {
          companyId: this.companyId,
          name: data.name,
          id: { not: id }
        }
      })
      if (existingName) {
        throw new Error(`Grade level name "${data.name}" already exists in this company`)
      }
    }
    
    // Update benefits if provided
    let benefitUpdate = {}
    if (data.benefits) {
      benefitUpdate = {
        benefits: {
          set: data.benefits.map((benefitId: string) => ({ id: benefitId }))
        }
      }
    }
    
    const { benefits, ...updateData } = data
    
    return prisma.gradeLevel.update({
      where: { id },
      data: {
        ...updateData,
        ...benefitUpdate,
        updatedBy: this.userId
      },
      include: {
        steps: true,
        benefits: true
      }
    })
  }

  async updateStepsConfiguration(id: string, data: any) {
    this.validateAccess()
    
    await this.getGradeById(id)
    
    // Validate step configuration
    if (data.stepConfiguration.length !== data.totalSteps) {
      throw new Error(`Step configuration must have exactly ${data.totalSteps} steps`)
    }
    
    // Update in transaction
    return prisma.$transaction(async (tx) => {
      await tx.gradeStep.deleteMany({
        where: { gradeLevelId: id }
      })
      
      await tx.gradeLevel.update({
        where: { id },
        data: {
          totalSteps: data.totalSteps,
          autoProgression: data.autoProgression,
          progressionTimeline: data.progressionTimeline,
          requirePerfRating: data.requirePerfRating,
          updatedBy: this.userId
        }
      })
      
      const steps = await Promise.all(
        data.stepConfiguration.map((step: any) =>
          tx.gradeStep.create({
            data: {
              gradeLevelId: id,
              stepNumber: step.step,
              incrementPercent: step.incrementPercent,
              calculatedPay: step.calculatedPay
            }
          })
        )
      )
      
      return {
        id,
        totalSteps: data.totalSteps,
        autoProgression: data.autoProgression,
        progressionTimeline: data.progressionTimeline,
        requirePerfRating: data.requirePerfRating,
        steps
      }
    })
  }

  async deactivateGrade(id: string, transferTo?: string) {
    this.validateAccess()
    
    const grade = await this.getGradeById(id)
    
    if (grade.status === 'Inactive') {
      throw new Error('Grade level is already inactive')
    }
    
    // Check if grade has dependencies
    const hasDependencies = grade.designations.length > 0
    
    if (hasDependencies && !transferTo) {
      throw new Error('This grade level has active designations. Please provide a transfer target grade level.')
    }
    
    if (transferTo) {
      const targetGrade = await prisma.gradeLevel.findFirst({
        where: {
          id: transferTo,
          companyId: this.companyId
        }
      })
      
      if (!targetGrade) {
        throw new Error('Target grade level not found')
      }
      
      if (targetGrade.status === 'Inactive') {
        throw new Error('Target grade level is inactive')
      }
      
      // Transfer designations to target grade
      await prisma.designation.updateMany({
        where: { gradeLevelId: id },
        data: { gradeLevelId: transferTo }
      })
    }
    
    return prisma.gradeLevel.update({
      where: { id },
      data: { status: 'Inactive' }
    })
  }

  async activateGrade(id: string) {
    this.validateAccess()
    
    const grade = await this.getGradeById(id)
    
    if (grade.status === 'Active') {
      throw new Error('Grade level is already active')
    }
    
    return prisma.gradeLevel.update({
      where: { id },
      data: { status: 'Active' }
    })
  }

  async getUtilization(id: string) {
    const grade = await this.getGradeById(id)
    
    const totalStaffAssigned = grade.designations.reduce(
      (sum, des) => sum + des.staffCount,
      0
    )
    
    return {
      totalStaffAssigned,
      mappedDesignations: grade.designations.map(des => ({
        id: des.id,
        title: des.title,
        code: des.code,
        staffCount: des.staffCount
      }))
    }
  }

  async getStats() {
    const [totalActiveGrades, allGrades] = await Promise.all([
      prisma.gradeLevel.count({
        where: {
          companyId: this.companyId,
          status: 'Active'
        }
      }),
      prisma.gradeLevel.findMany({
        where: { companyId: this.companyId },
        include: {
          designations: {
            select: { staffCount: true }
          }
        }
      })
    ])
    
    const totalStaffMapped = allGrades.reduce(
      (sum, grade) => sum + grade.designations.reduce(
        (desSum, des) => desSum + des.staffCount,
        0
      ),
      0
    )
    
    const unmappedGrades = allGrades.filter(
      grade => grade.designations.length === 0
    ).length
    
    return {
      totalActiveGrades,
      totalStaffMapped,
      unmappedGrades
    }
  }
}