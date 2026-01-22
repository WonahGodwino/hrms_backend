// src/app/api/auth/forgot-password/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/db';
import { sendEmail } from '@/app/lib/mailgun';
import { generateOtp } from '@/app/lib/otp'; // Keep this import
import { withCors, handleCorsOptions } from '@/app/lib/cors';

// REMOVE THIS ENTIRE FUNCTION - it's duplicated
// function generateOtp() {
//   return Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit OTP
// }

export async function OPTIONS(request: NextRequest) {
  return handleCorsOptions(request);
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin');

  try {
    const body = await req.json();
    const { email } = body;

    // Validate input
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return withCors(
        NextResponse.json(
          {
            success: false,
            message: 'Valid email address is required'
          },
          { status: 400 }
        ),
        origin
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check if user exists
    const staff = await prisma.staffRecord.findUnique({
      where: { email: normalizedEmail },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        isActive: true,
      },
    });

    // Security: Don't reveal if user exists
    if (!staff) {
      console.log(`Password reset requested for non-existent email: ${normalizedEmail}`);
      return withCors(
        NextResponse.json({
          success: true,
          message: 'If this email exists in our system, you will receive a password reset OTP shortly.'
        }),
        origin
      );
    }

    // Check if user is active
    if (!staff.isActive) {
      return withCors(
        NextResponse.json(
          {
            success: false,
            message: 'Account is not active. Please contact your administrator.'
          },
          { status: 403 }
        ),
        origin
      );
    }

    // Check for recent OTP attempts
    const recentReset = await prisma.passwordReset.findUnique({
      where: { email: normalizedEmail },
    });

    if (recentReset) {
      const lastAttempt = recentReset.updatedAt;
      const timeSinceLastAttempt = Date.now() - lastAttempt.getTime();
      const oneMinute = 60 * 1000;

      if (timeSinceLastAttempt < oneMinute) {
        return withCors(
          NextResponse.json(
            {
              success: false,
              message: 'Please wait at least 1 minute before requesting another OTP'
            },
            { status: 429 }
          ),
          origin
        );
      }

      // Check if OTP is already used
      if (recentReset.isUsed) {
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
    }

    // Generate OTP using the IMPORTED function
    const otp = generateOtp(); // This uses the imported function
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10);

    // Save OTP to database
    await prisma.passwordReset.upsert({
      where: { email: normalizedEmail },
      update: {
        otp,
        otpExpiresAt: expiresAt,
        attempts: 0,
        isUsed: false,
        updatedAt: new Date(),
      },
      create: {
        email: normalizedEmail,
        otp,
        otpExpiresAt: expiresAt,
        attempts: 0,
        isUsed: false,
      },
    });

    // Send email with OTP
    const emailResult = await sendEmail({
      to: normalizedEmail,
      subject: 'Password Reset OTP - HRMS',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Password Reset OTP</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: #4f46e5; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
            <h1>Password Reset Request</h1>
          </div>
          <div style="background-color: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; border: 1px solid #e5e7eb;">
            <p>Hello <strong>${staff.firstName} ${staff.lastName}</strong>,</p>
            <p>You have requested to reset your password for the HRMS platform.</p>
            <p>Use the OTP (One-Time Password) below to verify your identity:</p>
            
            <div style="background-color: white; border: 2px dashed #4f46e5; padding: 20px; text-align: center; margin: 25px 0; border-radius: 6px;">
              <div style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #4f46e5; font-family: monospace;">
                ${otp}
              </div>
              <p style="color: #6b7280; margin-top: 10px; font-size: 14px;">
                This OTP will expire in 10 minutes
              </p>
            </div>
            
            <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px; margin: 20px 0; border-radius: 4px;">
              <p><strong>⚠️ Security Notice:</strong></p>
              <ul style="margin: 10px 0; padding-left: 20px;">
                <li>Do not share this OTP with anyone</li>
                <li>Our team will never ask for your OTP</li>
                <li>This OTP is valid for one-time use only</li>
              </ul>
            </div>
            
            <p>If you didn't request this password reset, please ignore this email or contact your system administrator immediately.</p>
            
            <p>Best regards,<br>
            <strong>HRMS Support Team</strong></p>
          </div>
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 12px; text-align: center;">
            <p>This is an automated message. Please do not reply to this email.</p>
            <p>© ${new Date().getFullYear()} HRMS. All rights reserved.</p>
          </div>
        </body>
        </html>
      `,
      text: `
Password Reset Request - HRMS

Hello ${staff.firstName} ${staff.lastName},

You have requested to reset your password for the HRMS platform.

Your OTP (One-Time Password) is: ${otp}

This OTP will expire in 10 minutes.

⚠️ Security Notice:
- Do not share this OTP with anyone
- Our team will never ask for your OTP
- This OTP is valid for one-time use only

If you didn't request this password reset, please ignore this email or contact your system administrator immediately.

Best regards,
HRMS Support Team

This is an automated message. Please do not reply to this email.
© ${new Date().getFullYear()} HRMS. All rights reserved.
      `,
    });

    if (emailResult.success) {
      console.log(`OTP sent to ${normalizedEmail} at ${new Date().toISOString()}`);

      return withCors(
        NextResponse.json({
          success: true,
          message: 'Password reset OTP sent successfully. Please check your email.',
          data: {
            email: normalizedEmail,
            expiresIn: '10 minutes',
            // For development/testing only
            ...(process.env.NODE_ENV === 'development' && { otp })
          }
        }),
        origin
      );
    } else {
      console.error('Failed to send OTP email:', emailResult.error);
      
      // Clean up if email failed
      await prisma.passwordReset.delete({
        where: { email: normalizedEmail }
      }).catch(() => {
        // Ignore cleanup errors
      });

      return withCors(
        NextResponse.json(
          {
            success: false,
            message: 'Failed to send OTP email. Please try again later.'
          },
          { status: 500 }
        ),
        origin
      );
    }
  } catch (error: any) {
    console.error('Forgot password error:', error);

    // Handle specific Prisma errors
    if (error.code === 'P2002') {
      return withCors(
        NextResponse.json(
          {
            success: false,
            message: 'A password reset request is already in progress for this email.'
          },
          { status: 409 }
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