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

interface MailgunApiResponse {
  message?: string;
  id?: string;
  [key: string]: any; // Allow other properties
}

// Type guard function to check if response is MailgunApiResponse
function isMailgunApiResponse(data: any): data is MailgunApiResponse {
  return typeof data === 'object' && data !== null && 
    (typeof data.message === 'string' || typeof data.id === 'string' || 
     'message' in data || 'id' in data);
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

    // Handle the unknown type safely
    const data = await response.json();
    
    // Type assertion with type guard
    if (!isMailgunApiResponse(data)) {
      console.error('Invalid Mailgun API response:', data);
      return {
        success: false,
        message: 'Invalid response from email service',
        error: data
      };
    }

    const typedData: MailgunApiResponse = data;

    if (!response.ok) {
      console.error('Mailgun API error:', typedData);
      return {
        success: false,
        message: typedData.message || 'Failed to send email',
        error: typedData
      };
    }

    if (typedData.message === "Queued. Thank you." || typedData.id) {
      console.log(`Email sent successfully to ${to}. Message ID: ${typedData.id}`);
      return {
        success: true,
        message: 'Email sent successfully',
        id: typedData.id
      };
    }

    return {
      success: false,
      message: typedData.message || 'Unknown error from Mailgun',
      error: typedData
    };

  } catch (error: unknown) {
    console.error('Error sending email:', error);
    
    let errorMessage = 'Failed to send email';
    let errorDetails: any = error;
    
    if (error instanceof Error) {
      errorMessage = error.message;
      errorDetails = {
        name: error.name,
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      };
    } else if (typeof error === 'string') {
      errorMessage = error;
      errorDetails = error;
    }

    return {
      success: false,
      message: errorMessage,
      error: errorDetails
    };
  }
}

// Alternative: Function to send email using SMTP
export async function sendEmailSMTP({ to, subject, text, html }: EmailOptions): Promise<MailgunResponse> {
  try {
    const nodemailer = require('nodemailer');
    
    const transporter = nodemailer.createTransport({
      host: process.env.MAILGUN_SMTP_HOST || 'smtp.mailgun.org',
      port: parseInt(process.env.MAILGUN_SMTP_PORT || '587'),
      secure: false,
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

  } catch (error: unknown) {
    console.error('SMTP email error:', error);
    
    let errorMessage = 'Failed to send email via SMTP';
    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (typeof error === 'string') {
      errorMessage = error;
    }

    return {
      success: false,
      message: errorMessage,
      error: error
    };
  }
}

// Function to verify Mailgun configuration
export async function verifyMailgunConfig(): Promise<{ valid: boolean; message: string; details?: any }> {
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

    // Test API connection
    const response = await fetch(`https://api.mailgun.net/v3/domains/${process.env.MAILGUN_DOMAIN}`, {
      headers: {
        "Authorization": `Basic ${Buffer.from(`api:${process.env.MAILGUN_API_KEY}`).toString("base64")}`,
      },
    });

    const data = await response.json();
    
    // Type assertion for verification function
    if (!isMailgunApiResponse(data)) {
      return { 
        valid: false, 
        message: 'Invalid response from Mailgun API',
        details: data
      };
    }

    const typedData: MailgunApiResponse = data;

    if (response.ok) {
      return { 
        valid: true, 
        message: 'Mailgun configuration is valid',
        details: {
          domain: process.env.MAILGUN_DOMAIN,
          hasApiKey: !!process.env.MAILGUN_API_KEY,
          fromEmail: process.env.FROM_EMAIL
        }
      };
    } else {
      return { 
        valid: false, 
        message: `Mailgun domain error: ${typedData.message || 'Unknown error'}`,
        details: typedData
      };
    }
  } catch (error: unknown) {
    let errorMessage = 'Mailgun verification failed';
    if (error instanceof Error) {
      errorMessage = `Mailgun verification failed: ${error.message}`;
    } else if (typeof error === 'string') {
      errorMessage = `Mailgun verification failed: ${error}`;
    }
    
    return { 
      valid: false, 
      message: errorMessage,
      details: error
    };
  }
}