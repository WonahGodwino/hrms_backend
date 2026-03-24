// src/app/api/auth/verify-staff/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/app/lib/db'
import { handleCorsOptions, withCors } from '@/app/lib/cors'

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request)
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get('origin')
  
  try {
    const { searchParams } = new URL(request.url)
    const email = searchParams.get('email')
    const staffId = searchParams.get('staffId')
    const companyId = searchParams.get('companyId')
    
    if (!email || !staffId || !companyId) {
      return withCors(
        NextResponse.json(
          { success: false, error: 'Missing required parameters' },
          { status: 400 }
        ),
        origin
      )
    }
    
    const staff = await prisma.staffRecord.findUnique({
      where: {
        email_companyId: {
          email: email.toLowerCase().trim(),
          companyId: companyId,
        },
      },
      select: {
        id: true,
        email: true,
        staffId: true,
        firstName: true,
        lastName: true,
        companyId: true,
        isRegistered: true,
        isActive: true,
        company: {
          select: {
            companyName: true
          }
        }
      },
    })
    
    if (!staff) {
      return withCors(
        NextResponse.json(
          { success: false, error: 'Staff not found' },
          { status: 404 }
        ),
        origin
      )
    }
    
    if (staff.staffId !== staffId) {
      return withCors(
        NextResponse.json(
          { success: false, error: 'Staff ID mismatch' },
          { status: 400 }
        ),
        origin
      )
    }
    
    if (staff.isRegistered) {
      return withCors(
        NextResponse.json({
          success: false,
          error: 'Already registered. Please login instead.',
          redirectTo: `/login?email=${encodeURIComponent(staff.email)}`
        }),
        origin
      )
    }
    
    if (!staff.isActive) {
      return withCors(
        NextResponse.json(
          { success: false, error: 'Account is deactivated' },
          { status: 403 }
        ),
        origin
      )
    }
    
    return withCors(
      NextResponse.json({
        success: true,
        staff: {
          email: staff.email,
          staffId: staff.staffId,
          firstName: staff.firstName,
          lastName: staff.lastName,
          companyId: staff.companyId,
          companyName: staff.company?.companyName || 'Company'
        }
      }),
      origin
    )
    
  } catch (error) {
    console.error('Staff verification error:', error)
    return withCors(
      NextResponse.json(
        { success: false, error: 'Verification failed' },
        { status: 500 }
      ),
      origin
    )
  }
}