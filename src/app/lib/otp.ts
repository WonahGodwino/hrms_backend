// src/app/lib/otp.ts
import { randomInt } from 'crypto';

/** 6-digit OTP from a cryptographically secure generator. */
export function generateOtp() {
  return randomInt(100000, 1000000).toString();
}
