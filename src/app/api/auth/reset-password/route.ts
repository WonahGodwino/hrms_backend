// src/app/api/auth/reset-password/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/db';
import { hashPassword, comparePassword } from '@/app/lib/auth';
import { withCors, handleCorsOptions } from '@/app/lib/cors';

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin');

  try {
    const body = await req.json();
    const { 
      email, 
      otp: resetToken, // Using resetToken from verify-otp endpoint
      newPassword, 
      confirmPassword, 
      companyId 
    } = body;

    // Step 1: Validate required fields
    if (!email || !resetToken || !newPassword || !confirmPassword) {
      return withCors(
        NextResponse.json(
          {
            success: false,
            message: 'Email, OTP/reset token, new password, and confirmation are required'
          },
          { status: 400 }
        ),
        origin
      );
    }

    // Step 2: Validate password match
    if (newPassword !== confirmPassword) {
      return withCors(
        NextResponse.json(
          {
            success: false,
            message: 'Passwords do not match'
          },
          { status: 400 }
        ),
        origin
      );
    }

    // Step 3: Validate password strength
    if (newPassword.length < 8) {
      return withCors(
        NextResponse.json(
          {
            success: false,
            message: 'Password must be at least 8 characters long'
          },
          { status: 400 }
        ),
        origin
      );
    }

    const normalizedEmail = email.toLowerCase().trim();
    const normalizedToken = resetToken.trim();

    // Declare resetRecord variable
    let resetRecord;

    // Step 4: Find the reset token record
    if (companyId) {
      // If companyId is provided, look for specific record
      resetRecord = await prisma.passwordReset.findUnique({
        where: {
          email_companyId: {
            email: normalizedEmail,
            companyId: companyId
          }
        }
      });
    } else {
      // If no companyId, find any matching reset token for this email
      const records = await prisma.passwordReset.findMany({
        where: {
          email: normalizedEmail,
          isUsed: false,
          otpExpiresAt: { gt: new Date() }
        }
      });

      // Find the record with matching token
      resetRecord = records.find(record => record.otp === normalizedToken);
    }

    if (!resetRecord) {
      return withCors(
        NextResponse.json(
          {
            success: false,
            message: 'Invalid or expired reset token. Please start the password reset process again.'
          },
          { status: 400 }
        ),
        origin
      );
    }

    // Step 5: Validate reset token
    if (resetRecord.isUsed) {
      return withCors(
        NextResponse.json(
          {
            success: false,
            message: 'This reset token has already been used'
          },
          { status: 400 }
        ),
        origin
      );
    }

    // Check if token is expired
    const currentTime = new Date();
    const tokenExpiryTime = new Date(resetRecord.otpExpiresAt);

    if (currentTime > tokenExpiryTime) {
      await prisma.passwordReset.update({
        where: { id: resetRecord.id },
        data: { isUsed: true }
      });

      return withCors(
        NextResponse.json(
          {
            success: false,
            message: 'Reset token has expired. Please request a new one.'
          },
          { status: 400 }
        ),
        origin
      );
    }

    // Step 6: Find the staff member
    const staff = await prisma.staffRecord.findFirst({
      where: {
        email: normalizedEmail,
        companyId: resetRecord.companyId, // Use companyId from reset record
        isActive: true
      }
    });

    if (!staff) {
      return withCors(
        NextResponse.json(
          {
            success: false,
            message: 'Staff member not found or inactive'
          },
          { status: 400 }
        ),
        origin
      );
    }

    // Step 7: Check if new password is same as old password (optional)
    if (staff.password) {
      const isSamePassword = await comparePassword(newPassword, staff.password);
      if (isSamePassword) {
        return withCors(
          NextResponse.json(
            {
              success: false,
              message: 'New password cannot be the same as the old password'
            },
            { status: 400 }
          ),
          origin
        );
      }
    }

    // Step 8: Hash the new password
    const hashedPassword = await hashPassword(newPassword);

    // Step 9: Update password in the DB using composite key
    await prisma.staffRecord.update({
      where: {
        email_companyId: {
          email: normalizedEmail,
          companyId: resetRecord.companyId
        }
      },
      data: { 
        password: hashedPassword,
        isRegistered: true // Mark as registered if this is first-time setup
      },
    });

    // Step 10: Mark reset token as used
    await prisma.passwordReset.update({
      where: { id: resetRecord.id },
      data: {
        isUsed: true,
        updatedAt: new Date()
      }
    });

    // Step 11: Clean up any other unused reset tokens for this email in this company
    await prisma.passwordReset.updateMany({
      where: {
        email: normalizedEmail,
        companyId: resetRecord.companyId,
        id: { not: resetRecord.id },
        isUsed: false
      },
      data: {
        isUsed: true
      }
    });

    // Step 12: Get user info for response
    const updatedUser = await prisma.staffRecord.findFirst({
      where: {
        email: normalizedEmail,
        companyId: resetRecord.companyId
      },
      select: {
        firstName: true,
        lastName: true,
        email: true,
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
        message: 'Password updated successfully',
        data: {
          user: updatedUser ? {
            name: `${updatedUser.firstName} ${updatedUser.lastName}`,
            email: updatedUser.email,
            companyName: updatedUser.company?.companyName
          } : null
        }
      }),
      origin
    );

  } catch (error: any) {
    console.error('Reset password error:', error);

    // Handle specific Prisma errors
    if (error.code === 'P2025') {
      return withCors(
        NextResponse.json(
          {
            success: false,
            message: 'Record not found. Please verify your information and try again.'
          },
          { status: 404 }
        ),
        origin
      );
    }

    if (error.code === 'P2002') {
      return withCors(
        NextResponse.json(
          {
            success: false,
            message: 'Database constraint error. Please contact support.'
          },
          { status: 400 }
        ),
        origin
      );
    }

    return withCors(
      NextResponse.json(
        {
          success: false,
          message: 'An unexpected error occurred. Please try again later.',
          ...(process.env.NODE_ENV === 'development' && { error: error.message })
        },
        { status: 500 }
      ),
      origin
    );
  }
}