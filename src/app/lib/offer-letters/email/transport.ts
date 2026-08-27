// src/app/lib/offer-letters/email/transport.ts
//
// SMTP transport for the Offer Letter module's email delivery — real
// submission through each company's own Hostinger mailbox
// (OfferLetterMailConfig, resolved via mailConfig.ts), deliberately
// independent of backend/src/app/lib/mailgun.ts. Mailgun relays through its
// own infrastructure, so it can never populate a company's own Sent folder;
// only genuine SMTP auth against the mailbox itself does.
import nodemailer, { Transporter } from 'nodemailer'

import { getOfferLetterMailConfig } from './mailConfig'

// One transporter per company — a single shared transporter would mean one
// company's SMTP credentials leaking onto another company's connection pool.
const transportsByCompany = new Map<string, Transporter>()

export function invalidateOfferLetterSmtpTransport(companyId: string) {
  transportsByCompany.delete(companyId)
}

export async function getOfferLetterSmtpTransport(companyId: string): Promise<Transporter> {
  const cached = transportsByCompany.get(companyId)
  if (cached) return cached

  const config = await getOfferLetterMailConfig(companyId)
  const transport = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    auth: { user: config.smtpUser, pass: config.smtpPassword },
  })

  transportsByCompany.set(companyId, transport)
  return transport
}

export async function getOfferLetterSenderIdentity(companyId: string): Promise<{ email: string; name: string }> {
  const config = await getOfferLetterMailConfig(companyId)
  return { email: config.smtpUser, name: config.fromName }
}
