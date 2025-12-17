// src/app/api/auth/payslip-access/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { verify } from 'jsonwebtoken'
import { sign } from 'jsonwebtoken'

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

    // Validate token structure
    if (decoded.purpose !== 'payslip_access') {
      return NextResponse.redirect(new URL('/auth/error?message=Invalid access token', request.url))
    }

    if (!decoded.sub || !decoded.email || !decoded.payslipId) {
      return NextResponse.redirect(new URL('/auth/error?message=Invalid token data', request.url))
    }

    const staffRecordId = decoded.sub
    const staffEmail = decoded.email
    const payslipId = decoded.payslipId

    // Verify the payslip exists and belongs to this staff member
    const payslip = await prisma.payslip.findUnique({
      where: { id: payslipId },
      include: {
        staffRecord: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            isRegistered: true,
          }
        }
      }
    })

    if (!payslip) {
      return NextResponse.redirect(new URL('/auth/error?message=Payslip not found', request.url))
    }

    // Verify ownership
    if (payslip.staffRecord.id !== staffRecordId) {
      return NextResponse.redirect(new URL('/auth/error?message=Unauthorized access', request.url))
    }

    // Verify email matches (extra security layer)
    if (payslip.staffRecord.email !== staffEmail) {
      return NextResponse.redirect(new URL('/auth/error?message=Email verification failed', request.url))
    }

    // Create a session based on user registration status
    if (payslip.staffRecord.isRegistered) {
      // For registered users: Create auth session
      const sessionToken = sign(
        {
          userId: staffRecordId,
          email: staffEmail,
          name: payslip.staffRecord.firstName,
          role: 'STAFF',
          payslipId: payslipId,
          exp: Math.floor(Date.now() / 1000) + (60 * 60), // 1 hour session
        },
        jwtSecret
      )
      
      // Set as HTTP-only cookie
      const response = NextResponse.redirect(new URL(`/profile/payslips/${payslipId}`, request.url))
      response.cookies.set('auth_token', sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60, // 1 hour
        path: '/',
      })
      
      return response
    } else {
      // For unregistered users: Redirect to registration with pre-filled email
      const registrationUrl = new URL('/complete-registration', request.url)
      registrationUrl.searchParams.set('email', staffEmail)
      registrationUrl.searchParams.set('token', token) // Use same token for verification
      
      return NextResponse.redirect(registrationUrl)
    }

  } catch (error: any) {
    console.error('Payslip access token verification failed:', error)
    
    if (error.name === 'TokenExpiredError') {
      return NextResponse.redirect(new URL('/auth/error?message=Link has expired. Please request a new one.', request.url))
    }
    
    if (error.name === 'JsonWebTokenError') {
      return NextResponse.redirect(new URL('/auth/error?message=Invalid or tampered access link', request.url))
    }
    
    return NextResponse.redirect(new URL('/auth/error?message=Authentication failed', request.url))
  }
}