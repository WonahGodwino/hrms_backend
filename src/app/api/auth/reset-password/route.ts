// src/app/api/auth/reset-password/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/db';
import { hashPassword, comparePassword } from '@/app/lib/auth';
import { withCors, handleCorsOptions } from '@/app/lib/cors';
import { MAX_RESET_ATTEMPTS, resetTokenMatches } from '@/app/lib/password-reset/tokens';
import { phedAccountRateLimit, phedRateLimit } from '@/app/lib/phed/rate-limit';
import { publicErrorMessage } from '@/app/lib/errors/public-error';
import { readJsonBodyOrEmpty } from '@/app/lib/validation/request-body'
import { resetPasswordBodySchema } from '@/app/lib/validation/auth-schemas';
import { forCompany } from '@/app/lib/data/tenant';

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin');
  // SEC-010: per-IP limit (the proxy-added address, not the client-supplied one).
  const ipLimited = phedRateLimit(req, 'auth');
  if (ipLimited) return withCors(ipLimited, origin);

  try {
    // API-002: fields are type-checked; a malformed body falls into the checks below.
    const body = await readJsonBodyOrEmpty(req, resetPasswordBodySchema);
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

    // SEC-010: per-account limit, so rotating IP addresses does not help.

    const accountLimited = phedAccountRateLimit(req, 'auth', normalizedEmail);

    if (accountLimited) return withCors(accountLimited, origin);

    const normalizedToken = resetToken.trim();

    // Step 4: Find the active reset record and require the reset token that
    // verify-otp issued for it (SEC-001). A raw OTP is never accepted here.
    const candidates = await prisma.passwordReset.findMany({
      where: {
        email: normalizedEmail,
        isUsed: false,
        otpExpiresAt: { gt: new Date() },
        ...(companyId ? { companyId } : {}),
      }
    });

    const resetRecord = candidates.find(record => resetTokenMatches(record.otp, normalizedToken));

    if (!resetRecord) {
      // Count the failed attempt and invalidate records that reach the limit.
      await Promise.all(
        candidates.map(record => {
          const attempts = (record.attempts || 0) + 1;
          return prisma.passwordReset.update({
            where: { id: record.id },
            data: {
              attempts,
              ...(attempts >= MAX_RESET_ATTEMPTS ? { isUsed: true } : {})
            }
          });
        })
      );

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

    // Step 6: Find the staff member
    const staff = await forCompany(resetRecord.companyId).staffRecord.findFirst({
      where: {
        email: normalizedEmail,
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

    // Steps 9-11 run in one transaction (DB-002): the password never changes
    // without the reset code being spent, so a code cannot be reused.
    await prisma.$transaction([
      // Step 9: Update password in the DB using composite key
      prisma.staffRecord.update({
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
      }),

      // Step 10: Mark reset token as used
      prisma.passwordReset.update({
        where: { id: resetRecord.id },
        data: {
          isUsed: true,
          updatedAt: new Date()
        }
      }),

      // Step 11: Clean up any other unused reset tokens for this email in this company
      forCompany(resetRecord.companyId).passwordReset.updateMany({
        where: {
          email: normalizedEmail,
          id: { not: resetRecord.id },
          isUsed: false
        },
        data: {
          isUsed: true
        }
      }),
    ]);

    // Step 12: Get user info for response
    const updatedUser = await forCompany(resetRecord.companyId).staffRecord.findFirst({
      where: {
        email: normalizedEmail
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
          ...(process.env.NODE_ENV === 'development' && { error: publicErrorMessage(error) })
        },
        { status: 500 }
      ),
      origin
    );
  }
}