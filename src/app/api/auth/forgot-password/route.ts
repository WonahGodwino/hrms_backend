// src/app/api/auth/forgot-password.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/db';
import { sendEmail } from '@/app/lib/mailgun'; // Mailgun helper
import { generateOtp } from '@/app/lib/otp'; // OTP generator
import { withCors } from '@/app/lib/cors';

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit OTP
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin');

  try {
    const body = await req.json();
    const { email } = body;

    // Step 1: Validate if email exists in the database
    const staff = await prisma.staffRecord.findUnique({
      where: { email },
      select: { id: true, email: true },
    });

    if (!staff) {
      return NextResponse.json({ success: false, message: 'Email not found' }, { status: 404 });
    }

    // Step 2: Generate OTP and expiration time (10 minutes validity)
    const otp = generateOtp();
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10); // OTP expires in 10 minutes

    // Step 3: Save OTP to the database
    await prisma.passwordReset.upsert({
      where: { email },
      update: { otp, otpExpiresAt: expiresAt },
      create: { email, otp, otpExpiresAt: expiresAt },
    });

    // Step 4: Send OTP email using Mailgun
    const result = await sendEmail({
      to: email,
      subject: 'Password Reset OTP',
      text: `Your OTP is: ${otp}. It expires in 10 minutes.`,
    });

    if (result.success) {
      return NextResponse.json({ success: true, message: 'OTP sent successfully' });
    } else {
      return NextResponse.json({ success: false, message: 'Failed to send OTP' }, { status: 500 });
    }
  } catch (error) {
    console.error(error);
    return NextResponse.json({ success: false, message: 'Internal error' }, { status: 500 });
  }
}
