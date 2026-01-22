// src/app/lib/mailgun.ts
import fetch from "node-fetch";

interface EmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

interface MailgunResponse {
  success: boolean;
  message?: string;
  id?: string;
  error?: any;
}

export async function sendEmail({ to, subject, text, html }: EmailOptions): Promise<MailgunResponse> {
  try {
    // Validate environment variables
    if (!process.env.MAILGUN_API_KEY || !process.env.MAILGUN_DOMAIN || !process.env.FROM_EMAIL) {
      console.error('Mailgun configuration missing');
      return {
        success: false,
        message: 'Email service configuration error',
        error: 'Missing Mailgun environment variables'
      };
    }

    // Validate email
    if (!to || !to.includes('@')) {
      return {
        success: false,
        message: 'Invalid recipient email address',
        error: 'Invalid email format'
      };
    }

    // Prepare form data
    const formData = new URLSearchParams();
    formData.append('from', process.env.FROM_EMAIL);
    formData.append('to', to);
    formData.append('subject', subject);
    formData.append('text', text);
    
    if (html) {
      formData.append('html', html);
    }

    // Optional: Add tracking (uncomment if needed)
    // formData.append('o:tracking', 'yes');
    // formData.append('o:tracking-clicks', 'yes');
    // formData.append('o:tracking-opens', 'yes');

    const response = await fetch(
      `https://api.mailgun.net/v3/${process.env.MAILGUN_DOMAIN}/messages`,
      {
        method: "POST",
        headers: {
          "Authorization": `Basic ${Buffer.from(`api:${process.env.MAILGUN_API_KEY}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formData,
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error('Mailgun API error:', data);
      return {
        success: false,
        message: data.message || 'Failed to send email',
        error: data
      };
    }

    if (data.message === "Queued. Thank you." || data.id) {
      console.log(`Email sent successfully to ${to}. Message ID: ${data.id}`);
      return {
        success: true,
        message: 'Email sent successfully',
        id: data.id
      };
    }

    return {
      success: false,
      message: data.message || 'Unknown error from Mailgun',
      error: data
    };

  } catch (error: any) {
    console.error('Error sending email:', error);
    return {
      success: false,
      message: 'Failed to send email',
      error: error.message
    };
  }
}

// Optional: Function to send email using SMTP (alternative)
export async function sendEmailSMTP({ to, subject, text, html }: EmailOptions): Promise<MailgunResponse> {
  try {
    // This is if you want to use SMTP directly instead of API
    // But the API method above is recommended
    
    const nodemailer = require('nodemailer');
    
    const transporter = nodemailer.createTransport({
      host: process.env.MAILGUN_SMTP_HOST || 'smtp.mailgun.org',
      port: parseInt(process.env.MAILGUN_SMTP_PORT || '587'),
      secure: false, // true for 465, false for other ports
      auth: {
        user: process.env.MAILGUN_SMTP_USER,
        pass: process.env.MAILGUN_SMTP_PASS,
      },
    });

    const mailOptions = {
      from: process.env.FROM_EMAIL,
      to,
      subject,
      text,
      html,
    };

    const info = await transporter.sendMail(mailOptions);
    
    return {
      success: true,
      message: 'Email sent via SMTP',
      id: info.messageId
    };

  } catch (error: any) {
    console.error('SMTP email error:', error);
    return {
      success: false,
      message: 'Failed to send email via SMTP',
      error: error.message
    };
  }
}

// Function to verify Mailgun configuration
export async function verifyMailgunConfig(): Promise<{ valid: boolean; message: string }> {
  try {
    if (!process.env.MAILGUN_API_KEY) {
      return { valid: false, message: 'MAILGUN_API_KEY is missing' };
    }
    if (!process.env.MAILGUN_DOMAIN) {
      return { valid: false, message: 'MAILGUN_DOMAIN is missing' };
    }
    if (!process.env.FROM_EMAIL) {
      return { valid: false, message: 'FROM_EMAIL is missing' };
    }

    // Test API connection by fetching domains
    const response = await fetch(`https://api.mailgun.net/v3/domains/${process.env.MAILGUN_DOMAIN}`, {
      headers: {
        "Authorization": `Basic ${Buffer.from(`api:${process.env.MAILGUN_API_KEY}`).toString("base64")}`,
      },
    });

    if (response.ok) {
      return { valid: true, message: 'Mailgun configuration is valid' };
    } else {
      const error = await response.json();
      return { valid: false, message: `Mailgun domain error: ${error.message}` };
    }
  } catch (error: any) {
    return { valid: false, message: `Mailgun verification failed: ${error.message}` };
  }
}