// src/app/api/auth/verify-otp/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/db';
import { withCors, handleCorsOptions } from '@/app/lib/cors';

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin');

  try {
    const body = await req.json();
    const { email, otp, companyId } = body; // Add optional companyId

    // Validate input
    if (!email || !email.trim()) {
      return withCors(
        NextResponse.json(
          {
            success: false,
            message: 'Email is required'
          },
          { status: 400 }
        ),
        origin
      );
    }

    if (!otp || !otp.trim()) {
      return withCors(
        NextResponse.json(
          {
            success: false,
            message: 'OTP is required'
          },
          { status: 400 }
        ),
        origin
      );
    }

    // Normalize email
    const normalizedEmail = email.toLowerCase().trim();
    const normalizedOtp = otp.trim();

    // Step 1: Find matching OTP records
    let otpRecord;
    let matchingCompanies = [];

    if (companyId) {
      // If companyId is provided, find specific OTP record
      otpRecord = await prisma.passwordReset.findUnique({
        where: {
          email_companyId: {
            email: normalizedEmail,
            companyId: companyId
          }
        }
      });

      if (otpRecord) {
        // Get company info
        const staff = await prisma.staffRecord.findFirst({
          where: {
            email: normalizedEmail,
            companyId: companyId,
            isActive: true
          },
          select: {
            company: {
              select: {
                id: true,
                companyName: true
              }
            }
          }
        });

        if (staff) {
          matchingCompanies.push({
            companyId: staff.company.id,
            companyName: staff.company.companyName
          });
        }
      }
    } else {
      // If no companyId provided, find all active OTPs for this email
      const otpRecords = await prisma.passwordReset.findMany({
        where: {
          email: normalizedEmail,
          isUsed: false,
          otpExpiresAt: { gt: new Date() }
        },
        orderBy: {
          updatedAt: 'desc'
        }
      });

      // Find which OTP matches
      for (const record of otpRecords) {
        if (record.otp === normalizedOtp) {
          otpRecord = record;
          
          // Get company info for this OTP
          const staff = await prisma.staffRecord.findFirst({
            where: {
              email: normalizedEmail,
              companyId: record.companyId,
              isActive: true
            },
            select: {
              company: {
                select: {
                  id: true,
                  companyName: true
                }
              }
            }
          });

          if (staff) {
            matchingCompanies.push({
              companyId: staff.company.id,
              companyName: staff.company.companyName
            });
          }
          break; // Stop after first match
        }
      }

      // If OTP matches multiple records (same OTP sent to multiple companies)
      if (otpRecord && otpRecords.filter(r => r.otp === normalizedOtp).length > 1) {
        // Get all companies with this OTP
        const allMatchingRecords = otpRecords.filter(r => r.otp === normalizedOtp);
        
        for (const record of allMatchingRecords) {
          const staff = await prisma.staffRecord.findFirst({
            where: {
              email: normalizedEmail,
              companyId: record.companyId,
              isActive: true
            },
            select: {
              company: {
                select: {
                  id: true,
                  companyName: true
                }
              }
            }
          });

          if (staff) {
            matchingCompanies.push({
              companyId: staff.company.id,
              companyName: staff.company.companyName
            });
          }
        }
      }
    }

    if (!otpRecord) {
      return withCors(
        NextResponse.json(
          {
            success: false,
            message: 'No valid OTP found for this email'
          },
          { status: 404 }
        ),
        origin
      );
    }

    // Step 2: Check if OTP has already been used
    if (otpRecord.isUsed) {
      return withCors(
        NextResponse.json(
          {
            success: false,
            message: 'This OTP has already been used. Please request a new one.'
          },
          { status: 400 }
        ),
        origin
      );
    }

    // Step 3: Check if OTP has expired
    const currentTime = new Date();
    const otpExpiryTime = new Date(otpRecord.otpExpiresAt);

    if (currentTime > otpExpiryTime) {
      // Mark as used to prevent reuse
      await prisma.passwordReset.update({
        where: { id: otpRecord.id },
        data: { isUsed: true }
      });

      return withCors(
        NextResponse.json(
          {
            success: false,
            message: 'OTP has expired. Please request a new one.'
          },
          { status: 400 }
        ),
        origin
      );
    }

    // Step 4: Check if OTP matches
    if (otpRecord.otp !== normalizedOtp) {
      // Increment failed attempts
      const newAttempts = (otpRecord.attempts || 0) + 1;
      
      await prisma.passwordReset.update({
        where: { id: otpRecord.id },
        data: { 
          attempts: newAttempts,
          // Lock after 5 failed attempts
          ...(newAttempts >= 5 ? { isUsed: true } : {})
        }
      });

      const attemptsLeft = 5 - newAttempts;
      
      if (newAttempts >= 5) {
        return withCors(
          NextResponse.json(
            {
              success: false,
              message: 'Too many failed attempts. OTP has been invalidated. Please request a new one.'
            },
            { status: 429 }
          ),
          origin
        );
      }

      return withCors(
        NextResponse.json(
          {
            success: false,
            message: `Invalid OTP. ${attemptsLeft} attempt${attemptsLeft !== 1 ? 's' : ''} remaining.`
          },
          { status: 400 }
        ),
        origin
      );
    }

    // Step 5: Handle multiple companies with same OTP
    if (matchingCompanies.length > 1) {
      // Return success but with companies for selection
      return withCors(
        NextResponse.json({
          success: true,
          message: 'OTP verified. Please select which company account to reset.',
          data: {
            email: normalizedEmail,
            otpValid: true,
            requiresCompanySelection: true,
            companies: matchingCompanies
          }
        }),
        origin
      );
    }

    // Step 6: OTP is valid for single company - mark as used
    await prisma.passwordReset.update({
      where: { id: otpRecord.id },
      data: { 
        isUsed: true,
        updatedAt: new Date()
      }
    });

    // Generate a temporary token for password reset (valid for 15 minutes)
    const crypto = require('crypto');
    const resetToken = crypto.randomBytes(32).toString('hex');
    const tokenExpiresAt = new Date();
    tokenExpiresAt.setMinutes(tokenExpiresAt.getMinutes() + 15);

    // Store reset token (reuse otp field)
    await prisma.passwordReset.update({
      where: { id: otpRecord.id },
      data: {
        otp: resetToken,
        otpExpiresAt: tokenExpiresAt,
        isUsed: false, // Reset for the token usage
        attempts: 0, // Reset attempts
      }
    });

    // Get user info
    const user = await prisma.staffRecord.findFirst({
      where: {
        email: normalizedEmail,
        companyId: matchingCompanies[0]?.companyId || otpRecord.companyId,
        isActive: true
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        companyId: true,
        company: {
          select: {
            companyName: true
          }
        }
      }
    });

    return withCors(
      NextResponse.json({
        success: true,
        message: 'OTP verified successfully',
        data: {
          resetToken,
          expiresAt: tokenExpiresAt.toISOString(),
          email: normalizedEmail,
          companyId: user?.companyId || otpRecord.companyId,
          companyName: user?.company?.companyName,
          user: user ? {
            id: user.id,
            name: `${user.firstName} ${user.lastName}`
          } : null
        }
      }),
      origin
    );

  } catch (error: any) {
    console.error('Verify OTP error:', error);
    
    // Handle specific Prisma errors
    if (error.code === 'P2025') {
      return withCors(
        NextResponse.json(
          {
            success: false,
            message: 'OTP record not found'
          },
          { status: 404 }
        ),
        origin
      );
    }

    return withCors(
      NextResponse.json(
        {
          success: false,
          message: 'An error occurred while verifying OTP',
          ...(process.env.NODE_ENV === 'development' && { error: error.message })
        },
        { status: 500 }
      ),
      origin
    );
  }
}