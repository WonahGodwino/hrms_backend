// src/app/api/auth/verify-otp/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/db';
import { withCors, handleCorsOptions } from '@/app/lib/cors';
import { MAX_RESET_ATTEMPTS, RESET_TOKEN_TTL_MINUTES, createResetToken, otpMatches } from '@/app/lib/password-reset/tokens';
import { phedAccountRateLimit, phedRateLimit } from '@/app/lib/phed/rate-limit';
import { publicErrorMessage } from '@/app/lib/errors/public-error';
import { readJsonBodyOrEmpty } from '@/app/lib/validation/request-body'
import { verifyOtpBodySchema } from '@/app/lib/validation/auth-schemas';
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
    const body = await readJsonBodyOrEmpty(req, verifyOtpBodySchema);
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
    // SEC-010: per-account limit, so rotating IP addresses does not help.
    const accountLimited = phedAccountRateLimit(req, 'auth', normalizedEmail);
    if (accountLimited) return withCors(accountLimited, origin);

    const normalizedOtp = otp.trim();

    // Step 1: Find the active reset records this OTP could belong to.
    // Every lookup path counts failed attempts (SEC-004); OTPs are stored
    // as digests and compared in constant time.
    const candidates = await prisma.passwordReset.findMany({
      where: {
        email: normalizedEmail,
        isUsed: false,
        otpExpiresAt: { gt: new Date() },
        ...(companyId ? { companyId } : {}),
      },
      orderBy: {
        updatedAt: 'desc'
      }
    });

    if (candidates.length === 0) {
      return withCors(
        NextResponse.json(
          {
            success: false,
            message: 'Invalid or expired OTP. Please request a new one.'
          },
          { status: 400 }
        ),
        origin
      );
    }

    const matches = candidates.filter(record => otpMatches(record.otp, normalizedOtp));

    if (matches.length === 0) {
      // Count the failed attempt against every record that could have matched
      // and invalidate any that reach the limit.
      const attemptsAfter = candidates.map(record => (record.attempts || 0) + 1);
      await Promise.all(
        candidates.map((record, i) =>
          prisma.passwordReset.update({
            where: { id: record.id },
            data: {
              attempts: attemptsAfter[i],
              ...(attemptsAfter[i] >= MAX_RESET_ATTEMPTS ? { isUsed: true } : {})
            }
          })
        )
      );

      const attemptsLeft = Math.max(0, MAX_RESET_ATTEMPTS - Math.max(...attemptsAfter));

      if (attemptsLeft === 0) {
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

    const matchingCompanies: { companyId: string; companyName: string }[] = [];

    for (const record of matches) {
      const staff = await forCompany(record.companyId).staffRecord.findFirst({
        where: {
          email: normalizedEmail,
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

    // The record whose company has an active staff account, so the token is
    // issued for the same company the response reports.
    const otpRecord =
      matches.find(record => record.companyId === matchingCompanies[0]?.companyId) ?? matches[0];

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

    // Step 6: OTP is valid for a single company - exchange it for a
    // short-lived reset token. Only the token's digest is stored, which also
    // invalidates the OTP.
    const { token: resetToken, stored: storedResetToken } = createResetToken();
    const tokenExpiresAt = new Date();
    tokenExpiresAt.setMinutes(tokenExpiresAt.getMinutes() + RESET_TOKEN_TTL_MINUTES);

    await prisma.passwordReset.update({
      where: { id: otpRecord.id },
      data: {
        otp: storedResetToken,
        otpExpiresAt: tokenExpiresAt,
        isUsed: false,
        attempts: 0,
      }
    });

    // Get user info
    const user = await forCompany(matchingCompanies[0]?.companyId || otpRecord.companyId).staffRecord.findFirst({
      where: {
        email: normalizedEmail,
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
          ...(process.env.NODE_ENV === 'development' && { error: publicErrorMessage(error) })
        },
        { status: 500 }
      ),
      origin
    );
  }
}