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
    const { email, otp } = body;

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

    // Step 1: Retrieve OTP from DB
    const record = await prisma.passwordReset.findUnique({
      where: { email: normalizedEmail }
    });

    if (!record) {
      return withCors(
        NextResponse.json(
          {
            success: false,
            message: 'No password reset request found for this email'
          },
          { status: 404 }
        ),
        origin
      );
    }

    // Step 2: Check if OTP has already been used
    if (record.isUsed) {
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
    const otpExpiryTime = new Date(record.otpExpiresAt);

    if (currentTime > otpExpiryTime) {
      // Mark as used to prevent reuse
      await prisma.passwordReset.update({
        where: { email: normalizedEmail },
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
    if (record.otp !== otp.trim()) {
      // Increment failed attempts
      const newAttempts = (record.attempts || 0) + 1;
      
      await prisma.passwordReset.update({
        where: { email: normalizedEmail },
        data: { 
          attempts: newAttempts,
          // Lock after 3 failed attempts
          ...(newAttempts >= 3 ? { isUsed: true } : {})
        }
      });

      const attemptsLeft = 3 - newAttempts;
      
      if (newAttempts >= 3) {
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

    // Step 5: OTP is valid - mark as used
    await prisma.passwordReset.update({
      where: { email: normalizedEmail },
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

    // Store reset token in the same record
    await prisma.passwordReset.update({
      where: { email: normalizedEmail },
      data: {
        otp: resetToken, // Reuse otp field for reset token
        otpExpiresAt: tokenExpiresAt,
        isUsed: false, // Reset for the token usage
        attempts: 0, // Reset attempts
      }
    });

    // Get user info for response
    const user = await prisma.staffRecord.findUnique({
      where: { email: normalizedEmail },
      select: {
        id: true,
        firstName: true,
        lastName: true,
      }
    });

    return withCors(
      NextResponse.json({
        success: true,
        message: 'OTP verified successfully',
        data: {
          resetToken,
          expiresAt: tokenExpiresAt.toISOString(),
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