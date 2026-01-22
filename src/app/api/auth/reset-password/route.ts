// src/app/api/auth/reset-password.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/db';
import { hashPassword } from '@/app/lib/auth'; // helper function for hashing passwords
import { withCors } from '@/app/lib/cors';

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin');

  try {
    const body = await req.json();
    const { email, newPassword, confirmPassword } = body;

    // Step 1: Validate password match
    if (newPassword !== confirmPassword) {
      return NextResponse.json({ success: false, message: 'Passwords do not match' }, { status: 400 });
    }

    // Step 2: Hash the new password
    const hashedPassword = await hashPassword(newPassword);

    // Step 3: Update password in the DB
    await prisma.staffRecord.update({
      where: { email },
      data: { password: hashedPassword },
    });

    // Step 4: Delete OTP record to prevent reuse
    await prisma.passwordReset.delete({ where: { email } });

    return NextResponse.json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ success: false, message: 'Internal error' }, { status: 500 });
  }
}
