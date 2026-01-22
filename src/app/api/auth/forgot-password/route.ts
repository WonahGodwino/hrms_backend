// src/app/api/auth/forgot-password/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/db';
import { sendEmail } from '@/app/lib/mailgun';
import { generateOtp } from '@/app/lib/otp';
import { withCors, handleCorsOptions } from '@/app/lib/cors';

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

    // Find ALL staff records with this email across companies
    const staffRecords = await prisma.staffRecord.findMany({
      where: { 
        email: normalizedEmail,
        isActive: true 
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        isActive: true,
        companyId: true,
        company: {
          select: {
            companyName: true
          }
        }
      },
    });

    // Security: Don't reveal if user exists
    if (staffRecords.length === 0) {
      console.log(`Password reset requested for non-existent email: ${normalizedEmail}`);
      return withCors(
        NextResponse.json({
          success: true,
          message: 'If this email exists in our system, you will receive a password reset OTP shortly.'
        }),
        origin
      );
    }

    // Generate OTP for each company account
    const otp = generateOtp(); // Same OTP for all accounts (simpler for user)
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10);

    // Prepare email sending and OTP saving for each account
    const emailPromises = staffRecords.map(async (staff) => {
      // Check for recent OTP attempts for this email+company
      const recentReset = await prisma.passwordReset.findUnique({
        where: { 
          email_companyId: {
            email: normalizedEmail,
            companyId: staff.companyId
          }
        },
      });

      // Prevent too frequent requests
      if (recentReset) {
        const timeSinceLastAttempt = Date.now() - recentReset.updatedAt.getTime();
        const oneMinute = 60 * 1000;

        if (timeSinceLastAttempt < oneMinute) {
          throw new Error(`Please wait before requesting another OTP for ${staff.company.companyName}`);
        }
      }

      // Save OTP for this company
      await prisma.passwordReset.upsert({
        where: { 
          email_companyId: {
            email: normalizedEmail,
            companyId: staff.companyId
          }
        },
        update: {
          otp,
          otpExpiresAt: expiresAt,
          attempts: 0,
          isUsed: false,
          updatedAt: new Date(),
        },
        create: {
          email: normalizedEmail,
          companyId: staff.companyId,
          otp,
          otpExpiresAt: expiresAt,
          attempts: 0,
          isUsed: false,
        },
      });

      // Send email
      return sendEmail({
        to: normalizedEmail,
        subject: `Password Reset OTP - ${staff.company.companyName}`,
        html: generateOtpEmailHtml(staff, otp, staff.company.companyName),
        text: generateOtpEmailText(staff, otp, staff.company.companyName),
      });
    });

    // Execute all promises
    const emailResults = await Promise.allSettled(emailPromises);

    // Check if any emails failed
    const failedEmails = emailResults.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected'
    );

    if (failedEmails.length > 0) {
      console.error('Some OTP emails failed to send:', failedEmails);
      
      // Clean up OTP records if emails failed
      await Promise.all(
        staffRecords.map(staff => 
          prisma.passwordReset.delete({
            where: {
              email_companyId: {
                email: normalizedEmail,
                companyId: staff.companyId
              }
            }
          }).catch(() => { /* Ignore cleanup errors */ })
        )
      );

      // If all emails failed
      if (failedEmails.length === emailPromises.length) {
        return withCors(
          NextResponse.json(
            {
              success: false,
              message: 'Failed to send OTP emails. Please try again later.'
            },
            { status: 500 }
          ),
          origin
        );
      }
    }

    console.log(`OTP sent to ${normalizedEmail} for ${staffRecords.length} account(s) at ${new Date().toISOString()}`);

    return withCors(
      NextResponse.json({
        success: true,
        message: staffRecords.length === 1 
          ? 'Password reset OTP sent successfully. Please check your email.'
          : `Password reset OTP sent for ${staffRecords.length} account(s). Please check your email.`,
        data: {
          email: normalizedEmail,
          expiresIn: '10 minutes',
          // For development/testing only
          ...(process.env.NODE_ENV === 'development' && { 
            otp,
            companies: staffRecords.map(s => s.company.companyName)
          })
        }
      }),
      origin
    );

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

// Helper function to generate email HTML
function generateOtpEmailHtml(staff: any, otp: string, companyName: string) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Password Reset OTP</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background-color: #4f46e5; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
        <h1>Password Reset Request - ${companyName}</h1>
      </div>
      <div style="background-color: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; border: 1px solid #e5e7eb;">
        <p>Hello <strong>${staff.firstName} ${staff.lastName}</strong>,</p>
        <p>You have requested to reset your password for the ${companyName} HRMS account.</p>
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
            <li>This OTP is specific to your ${companyName} account</li>
          </ul>
        </div>
        
        <p>If you didn't request this password reset, please ignore this email or contact your system administrator immediately.</p>
        
        <p>Best regards,<br>
        <strong>${companyName} HRMS Team</strong></p>
      </div>
      <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 12px; text-align: center;">
        <p>This is an automated message. Please do not reply to this email.</p>
        <p>© ${new Date().getFullYear()} ${companyName}. All rights reserved.</p>
      </div>
    </body>
    </html>
  `;
}

// Helper function to generate email text
function generateOtpEmailText(staff: any, otp: string, companyName: string) {
  return `
Password Reset Request - ${companyName}

Hello ${staff.firstName} ${staff.lastName},

You have requested to reset your password for the ${companyName} HRMS account.

Your OTP (One-Time Password) is: ${otp}

This OTP will expire in 10 minutes.

⚠️ Security Notice:
- Do not share this OTP with anyone
- Our team will never ask for your OTP
- This OTP is valid for one-time use only
- This OTP is specific to your ${companyName} account

If you didn't request this password reset, please ignore this email or contact your system administrator immediately.

Best regards,
${companyName} HRMS Team

This is an automated message. Please do not reply to this email.
© ${new Date().getFullYear()} ${companyName}. All rights reserved.
  `;
}