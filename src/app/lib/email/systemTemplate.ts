// The branded HTML wrapper the system's own transactional emails render into:
// a company-name header, the message body, an optional call-to-action button,
// and a standard "automated message" footer. Mirrors the card look already
// used by the leave and payroll notification emails (lib/email.ts) so every
// system email reads as one consistent product instead of a one-off layout.
export interface SystemEmailParams {
  companyName: string
  subject: string
  /** Pre-built HTML for the message body (paragraphs, lists, etc). */
  bodyHtml: string
  actionUrl?: string
  actionText?: string
  /** Replaces the default "contact your HR department" footer line. */
  footerNote?: string
}

// Render-time safety net: a one-off grep sweep catches today's em dashes but
// not tomorrow's, so every system email is sanitized here regardless of what
// the caller's strings contain. " — " (prose usage) becomes ", "; a bare "—"
// (e.g. a plain-text divider) becomes "-".
function stripEmDashes(s: string): string {
  return s.replace(/\s*—\s*/g, ', ').replace(/—/g, '-')
}

export function renderSystemEmailHtml(params: SystemEmailParams): string {
  const { companyName, subject, bodyHtml, actionUrl, actionText, footerNote } = params
  return stripEmDashes(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${subject}</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f4f4f4; }
        .container { background-color: #ffffff; border-radius: 8px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #2c5530; padding-bottom: 20px; }
        .company-name { font-size: 24px; font-weight: bold; color: #2c5530; margin-bottom: 10px; }
        .subject { font-size: 18px; color: #666; }
        .content { margin-bottom: 30px; }
        .button { display: inline-block; padding: 12px 30px; background-color: #2c5530; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; text-align: center; margin: 20px 0; }
        .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #dee2e6; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="company-name">${companyName}</div>
          <div class="subject">${subject}</div>
        </div>
        <div class="content">
          ${bodyHtml}
          ${actionUrl && actionText ? `<div style="text-align: center;"><a href="${actionUrl}" class="button">${actionText}</a></div>` : ''}
        </div>
        <div class="footer">
          <p>This is an automated message from ${companyName}. Please do not reply to this email.</p>
          <p>${footerNote || 'If you have any questions, please contact your HR department.'}</p>
        </div>
      </div>
    </body>
    </html>
  `)
}

/** Plain-text counterpart: a short intro, an optional link line, then the same sign-off. */
export function renderSystemEmailText(params: {
  companyName: string
  bodyText: string
  actionUrl?: string
}): string {
  const { companyName, bodyText, actionUrl } = params
  return stripEmDashes(`${bodyText}${actionUrl ? `\n\n${actionUrl}` : ''}\n\nBest regards,\n${companyName}\n\nThis is an automated message from ${companyName}. Please do not reply to this email.`)
}
