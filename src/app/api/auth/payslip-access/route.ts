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
    if (!decoded.sub || !decoded.email || !decoded.staffId) {
      return NextResponse.redirect(new URL('/auth/error?message=Invalid token data', request.url))
    }

    const staffRecordId = decoded.sub
    const staffEmail = decoded.email
    const staffId = decoded.staffId
    const isRegistered = decoded.isRegistered || false
    const payslipId = decoded.payslipId // This is optional in new format

    console.log(`🔐 Payslip access attempt:`, {
      staffRecordId,
      staffEmail,
      staffId,
      isRegistered,
      payslipId,
      hasPayslipId: !!payslipId
    })

    // Get app URL from environment
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    // Find staff record by email and company ID
    const staffRecord = await prisma.staffRecord.findUnique({
      where: {
        email: staffEmail,
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

    if (!staffRecord) {
      console.error(`❌ Staff record not found for email: ${staffEmail}`)
      return NextResponse.redirect(new URL('/auth/error?message=Staff record not found', request.url))
    }

    // Verify staff ID matches
    if (staffRecord.staffId !== staffId) {
      console.error(`❌ Staff ID mismatch: expected ${staffId}, got ${staffRecord.staffId}`)
      return NextResponse.redirect(new URL('/auth/error?message=Staff ID verification failed', request.url))
    }

    // Verify staff record ID matches token
    if (staffRecord.id !== staffRecordId) {
      console.error(`❌ Staff record ID mismatch: token ${staffRecordId}, record ${staffRecord.id}`)
      return NextResponse.redirect(new URL('/auth/error?message=Staff record verification failed', request.url))
    }

    // Handle based on registration status
    if (isRegistered) {
      // For registered users: Check if they're actually registered
      if (!staffRecord.isRegistered) {
        console.warn(`⚠️ Token says registered but staff record shows unregistered: ${staffEmail}`)
        // Fall through to unregistered flow
      } else {
        console.log(`✅ Registered user accessing: ${staffEmail}`)
        
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

          if (payslip && payslip.staffRecord.id === staffRecordId) {
            // Redirect to specific payslip
            console.log(`📄 Redirecting to specific payslip: ${payslipId}`)
            const loginUrl = new URL(`${appUrl}/login`, request.url)
            loginUrl.searchParams.set('email', staffEmail)
            loginUrl.searchParams.set('redirect', `/profile/payslips/${payslipId}`)
            return NextResponse.redirect(loginUrl)
          }
        }

        // Generic login redirect for registered users
        const loginUrl = new URL(`${appUrl}/login`, request.url)
        loginUrl.searchParams.set('email', staffEmail)
        loginUrl.searchParams.set('message', 'Please login to access your payslips')
        return NextResponse.redirect(loginUrl)
      }
    }

    // For unregistered users (or fallback from above)
    console.log(`📝 Unregistered user accessing: ${staffEmail}`)
    
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
      if (payslip.staffRecord.id !== staffRecordId) {
        console.error(`❌ Payslip ownership mismatch: ${payslipId} belongs to ${payslip.staffRecord.id}, not ${staffRecordId}`)
        return NextResponse.redirect(new URL('/auth/error?message=Unauthorized access to payslip', request.url))
      }

      console.log(`✅ Verified payslip ownership: ${payslipId} belongs to ${staffEmail}`)
    }

    // Redirect to complete registration
    const registrationUrl = new URL(`${appUrl}/complete-registration`, request.url)
    registrationUrl.searchParams.set('email', staffEmail)
    registrationUrl.searchParams.set('staffId', staffId)
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