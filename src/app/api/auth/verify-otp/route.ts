// src/app/api/auth/verify-otp.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/db';
import { withCors } from '@/app/lib/cors';

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin');

  try {
    const body = await req.json();
    const { email, otp } = body;

    // Step 1: Retrieve OTP from DB
    const record = await prisma.passwordReset.findUnique({ where: { email } });

    if (!record) {
      return NextResponse.json({ success: false, message: 'Invalid OTP request' }, { status: 404 });
    }

    // Step 2: Check if OTP matches and is not expired
    if (record.otp !== otp) {
      return NextResponse.json({ success: false, message: 'Invalid OTP' }, { status: 400 });
    }

    if (new Date(record.otpExpiresAt) < new Date()) {
      return NextResponse.json({ success: false, message: 'OTP has expired' }, { status: 400 });
    }

    // Step 3: OTP is valid
    return NextResponse.json({ success: true, message: 'OTP verified' });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ success: false, message: 'Internal error' }, { status: 500 });
  }
}
