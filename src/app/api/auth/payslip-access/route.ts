// src/app/api/auth/payslip-access/route.ts - FINAL PRODUCTION VERSION
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { verify } from 'jsonwebtoken'

// CORS headers helper
function addCorsHeaders(response: NextResponse) {
  response.headers.set('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || 'https://app.isurfglobal.com')
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  response.headers.set('Access-Control-Allow-Credentials', 'true')
  return response
}

// OPTIONS handler for CORS preflight
export async function OPTIONS() {
  return addCorsHeaders(new NextResponse(null, { status: 204 }))
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const token = searchParams.get('token')

    if (!token) {
      const errorUrl = new URL('/auth/error', process.env.NEXT_PUBLIC_FRONTEND_URL || 'https://app.isurfglobal.com')
      errorUrl.searchParams.set('message', 'Invalid access link')
      return addCorsHeaders(NextResponse.redirect(errorUrl))
    }

    const jwtSecret = process.env.JWT_SECRET
    if (!jwtSecret) {
      throw new Error('JWT_SECRET not configured')
    }

    const decoded = verify(token, jwtSecret) as any

    if (decoded.purpose !== 'payslip_access') {
      const errorUrl = new URL('/auth/error', process.env.NEXT_PUBLIC_FRONTEND_URL || 'https://app.isurfglobal.com')
      errorUrl.searchParams.set('message', 'Invalid access token')
      return addCorsHeaders(NextResponse.redirect(errorUrl))
    }

    if (!decoded.sub || !decoded.email || !decoded.staffId || !decoded.companyId) {
      const errorUrl = new URL('/auth/error', process.env.NEXT_PUBLIC_FRONTEND_URL || 'https://app.isurfglobal.com')
      errorUrl.searchParams.set('message', 'Invalid token data. Missing required fields.')
      return addCorsHeaders(NextResponse.redirect(errorUrl))
    }

    const staffRecordId = decoded.sub
    const staffEmail = decoded.email
    const staffId = decoded.staffId
    const companyId = decoded.companyId
    const isRegistered = decoded.isRegistered || false
    const tokenPayslipId = decoded.payslipId

    console.log(`🔐 Payslip access attempt:`, {
      staffRecordId,
      staffEmail,
      staffId,
      companyId,
      isRegistered,
      tokenPayslipId,
      hasPayslipId: !!tokenPayslipId
    })

    const frontendUrl = process.env.NEXT_PUBLIC_FRONTEND_URL || 'https://app.isurfglobal.com'

    // Find staff record using compound unique constraint
    let staff = await prisma.staffRecord.findUnique({
      where: {
        email_companyId: {
          email: staffEmail,
          companyId: companyId
        }
      },
      include: {
        company: {
          select: {
            id: true,
            companyName: true
          }
        }
      }
    })

    if (!staff) {
      console.error(`❌ Staff record not found for email: ${staffEmail}, companyId: ${companyId}`)
      
      if (staffRecordId) {
        const staffById = await prisma.staffRecord.findUnique({
          where: { id: staffRecordId },
          include: {
            company: {
              select: {
                id: true,
                companyName: true
              }
            }
          }
        })
        
        if (staffById) {
          console.log(`⚠️ Found staff by ID instead of email+company: ${staffById.email}, company: ${staffById.companyId}`)
          staff = staffById
        } else {
          const errorUrl = new URL('/auth/error', frontendUrl)
          errorUrl.searchParams.set('message', 'Staff record not found. Please contact your HR department.')
          return addCorsHeaders(NextResponse.redirect(errorUrl))
        }
      } else {
        const errorUrl = new URL('/auth/error', frontendUrl)
        errorUrl.searchParams.set('message', 'Staff record not found. Please contact your HR department.')
        return addCorsHeaders(NextResponse.redirect(errorUrl))
      }
    }

    if (staff.staffId !== staffId) {
      console.error(`❌ Staff ID mismatch: expected ${staffId}, got ${staff.staffId}`)
      const errorUrl = new URL('/auth/error', frontendUrl)
      errorUrl.searchParams.set('message', 'Staff ID verification failed')
      return addCorsHeaders(NextResponse.redirect(errorUrl))
    }

    if (staff.id !== staffRecordId) {
      console.error(`❌ Staff record ID mismatch: token ${staffRecordId}, record ${staff.id}`)
      const errorUrl = new URL('/auth/error', frontendUrl)
      errorUrl.searchParams.set('message', 'Staff record verification failed')
      return addCorsHeaders(NextResponse.redirect(errorUrl))
    }

    // Registered user flow
    if (isRegistered && staff.isRegistered) {
      console.log(`✅ Registered user accessing: ${staff.email}`)
      
      if (tokenPayslipId) {
        const payslip = await prisma.payslip.findUnique({
          where: { id: tokenPayslipId },
          include: {
            staffRecord: {
              select: { id: true }
            }
          }
        })

        if (payslip && payslip.staffRecord.id === staff.id) {
          console.log(`📄 Redirecting to specific payslip: ${tokenPayslipId}`)
          const loginUrl = new URL('/login', frontendUrl)
          loginUrl.searchParams.set('email', staff.email)
          loginUrl.searchParams.set('redirect', `/profile/payslips/${tokenPayslipId}`)
          return addCorsHeaders(NextResponse.redirect(loginUrl))
        }
      }

      const loginUrl = new URL('/login', frontendUrl)
      loginUrl.searchParams.set('email', staff.email)
      loginUrl.searchParams.set('message', 'Please login to access your payslips')
      return addCorsHeaders(NextResponse.redirect(loginUrl))
    }

    // Unregistered user flow
    console.log(`📝 Unregistered user accessing: ${staff.email}`)
    
    let targetPayslipId = tokenPayslipId
    let payslipVerified = false
    let idCorrected = false

    if (tokenPayslipId) {
      // Try by exact ID first
      let payslip = await prisma.payslip.findUnique({
        where: { id: tokenPayslipId },
        include: {
          staffRecord: {
            select: { id: true }
          }
        }
      })

      if (payslip && payslip.staffRecord.id === staff.id) {
        console.log(`✅ Payslip verified by exact ID: ${tokenPayslipId}`)
        payslipVerified = true
        targetPayslipId = payslip.id
      } else {
        console.log(`⚠️ Payslip ID ${tokenPayslipId} not found or mismatch, trying fallback`)
        
        // Find any payslip for this staff through the staffRecord relation
        const staffPayslip = await prisma.payslip.findFirst({
          where: {
            staffRecordId: staff.id,
            companyId: staff.companyId
          },
          orderBy: [
            { year: 'desc' },
            { month: 'desc' }
          ],
          include: {
            staffRecord: {
              select: { id: true }
            }
          }
        })

        if (staffPayslip) {
          console.log(`✅ Found alternative payslip: ${staffPayslip.id} (${staffPayslip.month} ${staffPayslip.year})`)
          targetPayslipId = staffPayslip.id
          payslipVerified = true
          idCorrected = true
        }
      }

      if (!payslipVerified) {
        console.error(`❌ No payslip found for staff: ${staff.staffId}`)
        const errorUrl = new URL('/auth/error', frontendUrl)
        errorUrl.searchParams.set('message', 'No payslip found for your account')
        errorUrl.searchParams.set('details', 'Please contact HR to ensure a payslip has been generated.')
        return addCorsHeaders(NextResponse.redirect(errorUrl))
      }
    } else {
      // No payslipId in token - try to find any payslip for this staff
      const anyPayslip = await prisma.payslip.findFirst({
        where: {
          staffRecordId: staff.id,
          companyId: staff.companyId
        },
        orderBy: [
          { year: 'desc' },
          { month: 'desc' }
        ]
      })

      if (anyPayslip) {
        console.log(`✅ Found payslip for staff: ${anyPayslip.id}`)
        targetPayslipId = anyPayslip.id
        payslipVerified = true
      } else {
        console.log(`⚠️ No payslip found, proceeding with registration only`)
      }
    }

    // Redirect to registration
    const registrationUrl = new URL('/complete-registration', frontendUrl)
    
    registrationUrl.searchParams.set('email', staff.email)
    registrationUrl.searchParams.set('staffId', staff.staffId)
    registrationUrl.searchParams.set('companyId', staff.companyId)
    registrationUrl.searchParams.set('token', token)
    
    if (targetPayslipId) {
      registrationUrl.searchParams.set('payslipId', targetPayslipId)
    }
    
    if (idCorrected) {
      registrationUrl.searchParams.set('idCorrected', 'true')
      if (tokenPayslipId) {
        registrationUrl.searchParams.set('originalPayslipId', tokenPayslipId)
      }
    }
    
    if (!payslipVerified) {
      registrationUrl.searchParams.set('noPayslip', 'true')
    }

    console.log(`🔗 Redirecting to registration: ${registrationUrl.toString()}`)
    return addCorsHeaders(NextResponse.redirect(registrationUrl))

  } catch (error: any) {
    console.error('❌ Payslip access token verification failed:', error)
    
    let errorMessage = 'Authentication failed'
    
    if (error.name === 'TokenExpiredError') {
      errorMessage = 'Link has expired. Please request a new one.'
    } else if (error.name === 'JsonWebTokenError') {
      errorMessage = 'Invalid or tampered access link'
    }
    
    const frontendUrl = process.env.NEXT_PUBLIC_FRONTEND_URL || 'https://app.isurfglobal.com'
    const errorUrl = new URL('/auth/error', frontendUrl)
    errorUrl.searchParams.set('message', errorMessage)
    return addCorsHeaders(NextResponse.redirect(errorUrl))
  }
}

export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json()

    if (!token) {
      return NextResponse.json(
        { error: 'Token is required' },
        { status: 400 }
      )
    }

    const jwtSecret = process.env.JWT_SECRET
    if (!jwtSecret) {
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      )
    }

    const decoded = verify(token, jwtSecret) as any

    if (decoded.purpose !== 'payslip_access') {
      return NextResponse.json(
        { error: 'Invalid token purpose' },
        { status: 400 }
      )
    }

    let staffExists = false
    let staff = null
    try {
      staff = await prisma.staffRecord.findUnique({
        where: {
          email_companyId: {
            email: decoded.email,
            companyId: decoded.companyId
          }
        },
        select: {
          id: true,
          isRegistered: true,
          payslips: {
            select: { id: true },
            take: 1,
            orderBy: [
              { year: 'desc' },
              { month: 'desc' }
            ]
          }
        }
      })
      staffExists = !!staff
    } catch (dbError) {
      console.error('Database check failed:', dbError)
    }

    const response = NextResponse.json({
      valid: true,
      email: decoded.email,
      staffId: decoded.staffId,
      companyId: decoded.companyId,
      isRegistered: decoded.isRegistered || false,
      hasPayslipId: !!decoded.payslipId,
      staffExists,
      staffIsRegistered: staff?.isRegistered || false,
      hasAnyPayslip: staff && staff.payslips.length > 0,
      expiresAt: new Date(decoded.exp * 1000).toISOString()
    })

    return addCorsHeaders(response)
  } catch (error: any) {
    console.error('Token verification failed:', error)
    
    let errorMessage = 'Token verification failed'
    let status = 400
    
    if (error.name === 'TokenExpiredError') {
      errorMessage = 'Token has expired'
    } else if (error.name === 'JsonWebTokenError') {
      errorMessage = 'Invalid token'
    } else {
      status = 500
    }
    
    const response = NextResponse.json(
      { error: errorMessage },
      { status }
    )
    
    return addCorsHeaders(response)
  }
}