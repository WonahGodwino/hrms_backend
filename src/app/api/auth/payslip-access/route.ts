// src/app/api/auth/payslip-access/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { verify } from 'jsonwebtoken'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const token = searchParams.get('token')

    if (!token) {
      return NextResponse.redirect(new URL('/auth/error?message=Invalid access link', request.url))
    }

    // Verify JWT token
    const jwtSecret = process.env.JWT_SECRET
    if (!jwtSecret) {
      throw new Error('JWT_SECRET not configured')
    }

    const decoded = verify(token, jwtSecret) as any

    // Validate token structure - updated for new format
    if (decoded.purpose !== 'payslip_access') {
      return NextResponse.redirect(new URL('/auth/error?message=Invalid access token', request.url))
    }

    // Check for required fields in new token format
    if (!decoded.sub || !decoded.email || !decoded.staffId || !decoded.companyId) {
      return NextResponse.redirect(new URL('/auth/error?message=Invalid token data. Missing required fields.', request.url))
    }

    const staffRecordId = decoded.sub
    const staffEmail = decoded.email
    const staffId = decoded.staffId
    const companyId = decoded.companyId // Get companyId from token
    const isRegistered = decoded.isRegistered || false
    const payslipId = decoded.payslipId // This is optional in new format

    console.log(`🔐 Payslip access attempt:`, {
      staffRecordId,
      staffEmail,
      staffId,
      companyId,
      isRegistered,
      payslipId,
      hasPayslipId: !!payslipId
    })

    // Get app URL from environment
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    // Find staff record using compound unique constraint (email + companyId)
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
      
      // Try alternative lookup by ID
      if (staffRecordId) {
        const staffById = await prisma.staffRecord.findUnique({
          where: { id: staffRecordId },
          include: {
            company: {
              select: {
                id: true, // ADDED: Include id to match the first query's type
                companyName: true
              }
            }
          }
        })
        
        if (staffById) {
          console.log(`⚠️ Found staff by ID instead of email+company: ${staffById.email}, company: ${staffById.companyId}`)
          staff = staffById // Assign to the main staff variable
        } else {
          return NextResponse.redirect(new URL('/auth/error?message=Staff record not found. Please contact your HR department.', request.url))
        }
      } else {
        return NextResponse.redirect(new URL('/auth/error?message=Staff record not found. Please contact your HR department.', request.url))
      }
    }

    // Verify staff ID matches
    if (staff.staffId !== staffId) {
      console.error(`❌ Staff ID mismatch: expected ${staffId}, got ${staff.staffId}`)
      return NextResponse.redirect(new URL('/auth/error?message=Staff ID verification failed', request.url))
    }

    // Verify staff record ID matches token
    if (staff.id !== staffRecordId) {
      console.error(`❌ Staff record ID mismatch: token ${staffRecordId}, record ${staff.id}`)
      return NextResponse.redirect(new URL('/auth/error?message=Staff record verification failed', request.url))
    }

    // Handle based on registration status
    if (isRegistered) {
      // For registered users: Check if they're actually registered
      if (!staff.isRegistered) {
        console.warn(`⚠️ Token says registered but staff record shows unregistered: ${staff.email}`)
        // Fall through to unregistered flow
      } else {
        console.log(`✅ Registered user accessing: ${staff.email}`)
        
        // If payslipId is provided, verify it belongs to this staff
        if (payslipId) {
          const payslip = await prisma.payslip.findUnique({
            where: { id: payslipId },
            include: {
              staffRecord: {
                select: { id: true }
              }
            }
          })

          if (payslip && payslip.staffRecord.id === staff.id) {
            // Redirect to specific payslip
            console.log(`📄 Redirecting to specific payslip: ${payslipId}`)
            const loginUrl = new URL(`${appUrl}/login`, request.url)
            loginUrl.searchParams.set('email', staff.email)
            loginUrl.searchParams.set('redirect', `/profile/payslips/${payslipId}`)
            return NextResponse.redirect(loginUrl)
          }
        }

        // Generic login redirect for registered users
        const loginUrl = new URL(`${appUrl}/login`, request.url)
        loginUrl.searchParams.set('email', staff.email)
        loginUrl.searchParams.set('message', 'Please login to access your payslips')
        return NextResponse.redirect(loginUrl)
      }
    }

    // For unregistered users (or fallback from above)
    console.log(`📝 Unregistered user accessing: ${staff.email}`)
    
    if (payslipId) {
      // Verify the payslip exists and belongs to this staff member
      const payslip = await prisma.payslip.findUnique({
        where: { id: payslipId },
        include: {
          staffRecord: {
            select: { id: true }
          }
        }
      })

      if (!payslip) {
        console.error(`❌ Payslip not found: ${payslipId}`)
        return NextResponse.redirect(new URL('/auth/error?message=Payslip not found', request.url))
      }

      // Verify ownership
      if (payslip.staffRecord.id !== staff.id) {
        console.error(`❌ Payslip ownership mismatch: ${payslipId} belongs to ${payslip.staffRecord.id}, not ${staff.id}`)
        return NextResponse.redirect(new URL('/auth/error?message=Unauthorized access to payslip', request.url))
      }

      console.log(`✅ Verified payslip ownership: ${payslipId} belongs to ${staff.email}`)
    }

    // Redirect to complete registration
    const registrationUrl = new URL(`${appUrl}/complete-registration`, request.url)
    registrationUrl.searchParams.set('email', staff.email)
    registrationUrl.searchParams.set('staffId', staff.staffId)
    registrationUrl.searchParams.set('companyId', staff.companyId)
    registrationUrl.searchParams.set('token', token)
    
    if (payslipId) {
      registrationUrl.searchParams.set('payslipId', payslipId)
    }
    
    console.log(`🔗 Redirecting to registration: ${registrationUrl.toString()}`)
    return NextResponse.redirect(registrationUrl)

  } catch (error: any) {
    console.error('❌ Payslip access token verification failed:', error)
    
    let errorMessage = 'Authentication failed'
    
    if (error.name === 'TokenExpiredError') {
      errorMessage = 'Link has expired. Please request a new one.'
    } else if (error.name === 'JsonWebTokenError') {
      errorMessage = 'Invalid or tampered access link'
    }
    
    // Redirect to error page with message
    const errorUrl = new URL('/auth/error', request.url)
    errorUrl.searchParams.set('message', errorMessage)
    return NextResponse.redirect(errorUrl)
  }
}

// Optional: Add a POST endpoint for token verification without redirect
export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json()

    if (!token) {
      return NextResponse.json(
        { error: 'Token is required' },
        { status: 400 }
      )
    }

    // Verify JWT token
    const jwtSecret = process.env.JWT_SECRET
    if (!jwtSecret) {
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      )
    }

    const decoded = verify(token, jwtSecret) as any

    // Validate token structure
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