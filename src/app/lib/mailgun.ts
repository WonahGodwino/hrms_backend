// src/app/lib/mailgun.ts
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

