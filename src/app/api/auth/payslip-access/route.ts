// src/app/api/auth/payslip-access/route.ts - ONLY REMOVED PAYSLIP CHECK
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { verify } from 'jsonwebtoken'

const FRONTEND_URL = process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_FRONTEND_URL || 'https://247hr.co.uk'

// CORS headers helper
function addCorsHeaders(response: NextResponse) {
  response.headers.set('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || FRONTEND_URL)
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
      const errorUrl = new URL('/auth/error', FRONTEND_URL)
      errorUrl.searchParams.set('message', 'Invalid access link')
      return addCorsHeaders(NextResponse.redirect(errorUrl))
    }

    const jwtSecret = process.env.JWT_SECRET
    if (!jwtSecret) {
      throw new Error('JWT_SECRET not configured')
    }

    const decoded = verify(token, jwtSecret) as any

    if (decoded.purpose !== 'payslip_access') {
      const errorUrl = new URL('/auth/error', FRONTEND_URL)
      errorUrl.searchParams.set('message', 'Invalid access token')
      return addCorsHeaders(NextResponse.redirect(errorUrl))
    }

    if (!decoded.sub || !decoded.email || !decoded.staffId || !decoded.companyId) {
      const errorUrl = new URL('/auth/error', FRONTEND_URL)
      errorUrl.searchParams.set('message', 'Invalid token data. Missing required fields.')
      return addCorsHeaders(NextResponse.redirect(errorUrl))
    }

    const staffRecordId = decoded.sub
    const staffEmail = decoded.email
    const staffId = decoded.staffId
    const companyId = decoded.companyId
    const isRegistered = decoded.isRegistered || false
    const payslipId = decoded.payslipId

    console.log(`🔐 Payslip access attempt:`, {
      staffRecordId,
      staffEmail,
      staffId,
      companyId,
      isRegistered,
      payslipId,
      hasPayslipId: !!payslipId
    })

    const frontendUrl = FRONTEND_URL

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

    // Verify staff ID matches
    if (staff.staffId !== staffId) {
      console.error(`❌ Staff ID mismatch: expected ${staffId}, got ${staff.staffId}`)
      const errorUrl = new URL('/auth/error', frontendUrl)
      errorUrl.searchParams.set('message', 'Staff ID verification failed')
      return addCorsHeaders(NextResponse.redirect(errorUrl))
    }

    // Verify staff record ID matches token
    if (staff.id !== staffRecordId) {
      console.error(`❌ Staff record ID mismatch: token ${staffRecordId}, record ${staff.id}`)
      const errorUrl = new URL('/auth/error', frontendUrl)
      errorUrl.searchParams.set('message', 'Staff record verification failed')
      return addCorsHeaders(NextResponse.redirect(errorUrl))
    }

    // Handle based on registration status from token
    if (isRegistered) {
      // For registered users: Check if they're actually registered
      if (!staff.isRegistered) {
        console.warn(`⚠️ Token says registered but staff record shows unregistered: ${staff.email}`)
        // Fall through to unregistered flow
      } else {
        console.log(`✅ Registered user accessing: ${staff.email}`)
        
        // If payslipId is provided, add it to redirect (no verification)
        if (payslipId) {
          console.log(`📄 Redirecting with payslip reference: ${payslipId}`)
          const loginUrl = new URL('/login', frontendUrl)
          loginUrl.searchParams.set('email', staff.email)
          loginUrl.searchParams.set('redirect', `/profile/payslips/${payslipId}`)
          return addCorsHeaders(NextResponse.redirect(loginUrl))
        }

        // Generic login redirect for registered users
        const loginUrl = new URL('/login', frontendUrl)
        loginUrl.searchParams.set('email', staff.email)
        loginUrl.searchParams.set('message', 'Please login to access your payslips')
        return addCorsHeaders(NextResponse.redirect(loginUrl))
      }
    }

    // For unregistered users (or fallback from above)
    console.log(`📝 Unregistered user accessing: ${staff.email}`)
    
    // Redirect to complete registration on FRONTEND
    const registrationUrl = new URL('/complete-registration', frontendUrl)
    registrationUrl.searchParams.set('email', staff.email)
    registrationUrl.searchParams.set('staffId', staff.staffId)
    registrationUrl.searchParams.set('companyId', staff.companyId)
    registrationUrl.searchParams.set('token', token)
    
    if (payslipId) {
      registrationUrl.searchParams.set('payslipId', payslipId)
    }
    
    console.log(`🔗 Redirecting to registration on frontend: ${registrationUrl.toString()}`)
    return addCorsHeaders(NextResponse.redirect(registrationUrl))

  } catch (error: any) {
    console.error('❌ Payslip access token verification failed:', error)
    
    let errorMessage = 'Authentication failed'
    
    if (error.name === 'TokenExpiredError') {
      errorMessage = 'Link has expired. Please request a new one.'
    } else if (error.name === 'JsonWebTokenError') {
      errorMessage = 'Invalid or tampered access link'
    }
    
    const frontendUrl = FRONTEND_URL
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

    // Return token info (without sensitive data)
    return NextResponse.json({
      valid: true,
      email: decoded.email,
      staffId: decoded.staffId,
      companyId: decoded.companyId,
      isRegistered: decoded.isRegistered || false,
      hasPayslipId: !!decoded.payslipId,
      expiresAt: new Date(decoded.exp * 1000).toISOString()
    })
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
    
    return NextResponse.json(
      { error: errorMessage },
      { status }
    )
  }
}