// Pluggable SMS provider for phone verification. Routes only ever call
// getSmsProvider().send(); to switch provider set SMS_PROVIDER and add a class
// implementing SmsProvider below.
//
//   SMS_PROVIDER=termii   needs TERMII_API_KEY (+ optional TERMII_SENDER_ID)
//   SMS_PROVIDER=console  logs the message (default outside production)
export interface SmsResult {
  ok: boolean
  error?: string
}

export interface SmsProvider {
  readonly name: string
  send(to: string, message: string): Promise<SmsResult>
}

class ConsoleSmsProvider implements SmsProvider {
  readonly name = 'console'
  async send(to: string, message: string): Promise<SmsResult> {
    console.log(`[SMS:console] to=${to} message="${message}"`)
    return { ok: true }
  }
}

// Termii (https://termii.com) generic send endpoint.
class TermiiSmsProvider implements SmsProvider {
  readonly name = 'termii'
  async send(to: string, message: string): Promise<SmsResult> {
    const apiKey = process.env.TERMII_API_KEY
    if (!apiKey) return { ok: false, error: 'TERMII_API_KEY is not set' }
    try {
      const res = await fetch(process.env.TERMII_BASE_URL || 'https://api.ng.termii.com/api/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: apiKey,
          to: to.replace(/^\+/, ''),
          from: process.env.TERMII_SENDER_ID || '247HR',
          sms: message,
          type: 'plain',
          channel: process.env.TERMII_CHANNEL || 'generic',
        }),
      })
      if (!res.ok) return { ok: false, error: `Termii responded ${res.status}` }
      return { ok: true }
    } catch (err: any) {
      return { ok: false, error: err?.message || 'SMS request failed' }
    }
  }
}

export function getSmsProvider(): SmsProvider {
  const name = (process.env.SMS_PROVIDER || (process.env.NODE_ENV === 'production' ? '' : 'console')).toLowerCase()
  if (name === 'termii') return new TermiiSmsProvider()
  if (name === 'console') return new ConsoleSmsProvider()
  // Production with no provider configured must fail loudly, never pretend to send.
  return {
    name: 'unconfigured',
    send: async () => ({ ok: false, error: 'No SMS provider configured (set SMS_PROVIDER)' }),
  }
}
