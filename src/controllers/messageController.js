import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
// Configure email transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 465,
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  tls: { rejectUnauthorized: false },
});

export const sendMessage = async (req, res) => {
  try {
    const { name, email, mobile, message } = req.body;

    // Validate required fields
    if (!name || !email || !mobile || !message) {
      return res.status(400).json({ 
        error: 'All fields are required' 
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ 
        error: 'Invalid email format' 
      });
    }

    // Validate mobile number (Indian format)
    const mobileRegex = /^[6-9]\d{9}$/;
    if (!mobileRegex.test(mobile.replace(/\s/g, ''))) {
      return res.status(400).json({ 
        error: 'Invalid mobile number' 
      });
    }

    // Email to admin - SET REPLY-TO as user's email
    const adminMailOptions = {
      from: process.env.EMAIL_FROM, // Show sender name
      to: process.env.ADMIN_EMAIL,
      replyTo: email, // ✅ KEY: Admin can reply directly to user
      subject: `New Contact Form: ${name} - ${mobile}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #fbbf24 0%, #f97316 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; }
            .field { margin-bottom: 20px; }
            .label { font-weight: bold; color: #f97316; margin-bottom: 5px; }
            .value { background: white; padding: 10px; border-radius: 5px; border-left: 3px solid #fbbf24; }
            .message-highlight { background: white; padding: 20px; border-radius: 10px; border: 2px solid #fbbf24; margin: 20px 0; font-size: 15px; }
            .reply-note { background: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b; }
            .footer { background: #374151; color: white; padding: 20px; text-align: center; border-radius: 0 0 10px 10px; font-size: 12px; }
            .action-buttons { text-align: center; margin: 20px 0; }
            .button { display: inline-block; background: linear-gradient(135deg, #fbbf24 0%, #f97316 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 25px; margin: 0 10px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🙏 नया संदेश प्राप्त हुआ</h1>
              <p>New Message from Contact Form</p>
            </div>
            <div class="content">
              <div class="reply-note">
                <strong>💡 Quick Tip:</strong> Click "Reply" button in your email to respond directly to <strong>${name}</strong> at <strong>${email}</strong>
              </div>

              <div class="field">
                <div class="label">👤 Name:</div>
                <div class="value">${name}</div>
              </div>
              <div class="field">
                <div class="label">📧 Email:</div>
                <div class="value"><a href="mailto:${email}" style="color: #f97316;">${email}</a></div>
              </div>
              <div class="field">
                <div class="label">📱 Mobile:</div>
                <div class="value"><a href="tel:+91${mobile}" style="color: #f97316;">+91 ${mobile}</a></div>
              </div>
              <div class="field">
                <div class="label">💬 Message:</div>
                <div class="message-highlight">${message.replace(/\n/g, '<br>')}</div>
              </div>
              <div class="field">
                <div class="label">🕐 Received at:</div>
                <div class="value">${new Date().toLocaleString('en-IN', { 
                  timeZone: 'Asia/Kolkata',
                  dateStyle: 'full',
                  timeStyle: 'long'
                })}</div>
              </div>

              <div class="action-buttons">
                <a href="mailto:${email}?subject=Re: Your message to Shree Gopal Parivar Sang&body=Dear ${name},%0D%0A%0D%0AThank you for contacting us.%0D%0A%0D%0A" class="button">
                  📧 Reply via Email
                </a>
                <a href="tel:+91${mobile}" class="button">
                  📱 Call ${name}
                </a>
              </div>
            </div>
            <div class="footer">
              <p>This email was sent from your website contact form</p>
              <p>© ${new Date().getFullYear()} Shree Gopal Parivar Sang. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      // Plain text fallback
      text: `
New Contact Form Submission

Name: ${name}
Email: ${email}
Mobile: +91 ${mobile}
Message: ${message}

Received at: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}

Reply to this email to respond directly to ${name}.
      `,
    };

    // Confirmation email to user - SET REPLY-TO as admin email
    const userMailOptions = {
      from: process.env.EMAIL_FROM,
      to: email,
      replyTo: process.env.ADMIN_EMAIL , // ✅ User can reply to admin
      subject: 'Thank you for contacting us! 🙏',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #fbbf24 0%, #f97316 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; }
            .message-box { background: white; padding: 20px; border-radius: 10px; margin: 20px 0; border-left: 4px solid #fbbf24; }
            .button { display: inline-block; background: linear-gradient(135deg, #fbbf24 0%, #f97316 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 25px; margin: 20px 0; }
            .footer { background: #374151; color: white; padding: 20px; text-align: center; border-radius: 0 0 10px 10px; font-size: 12px; }
            .highlight-box { background: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🙏 धन्यवाद ${name}!</h1>
              <p>Thank You for Reaching Out</p>
            </div>
            <div class="content">
              <p>Dear ${name},</p>
              <p>Thank you for contacting us. We have received your message and will get back to you within 24 hours.</p>
              
              <div class="message-box">
                <h3 style="color: #f97316; margin-top: 0;">Your Message:</h3>
                <p style="color: #6b7280;">${message.replace(/\n/g, '<br>')}</p>
              </div>

              <div class="highlight-box">
                <strong>💬 Need to add more details?</strong><br>
                Simply reply to this email and we'll receive your message directly!
              </div>

              <p>Our team is reviewing your inquiry and will respond to you at <strong>${email}</strong> or call you at <strong>+91 ${mobile}</strong>.</p>
              
              <p>If you have any urgent concerns, please feel free to contact us:</p>
              <p style="text-align: center;">
                <strong style="font-size: 18px; color: #f97316;">📞 +91 9414174880</strong><br>
                <strong style="font-size: 18px; color: #f97316;">📧 shreegopalparivarsang@gmail.com</strong>
              </p>

              <center>
                <a href="mailto:${process.env.ADMIN_EMAIL || 'shreegopalparivarsang@gmail.com'}?subject=Re: My inquiry&body=Dear Team,%0D%0A%0D%0AI would like to add:%0D%0A%0D%0A" class="button">Reply to this Email</a>
              </center>
            </div>
            <div class="footer">
              <p><strong>Shree Gopal Parivar Sang</strong></p>
              <p>📧 shreegopalparivarsang@gmail.com | 📱 +91 9414174880</p>
              <p>© ${new Date().getFullYear()} All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      // Plain text fallback
      text: `
Dear ${name},

Thank you for contacting us. We have received your message and will get back to you within 24 hours.

Your Message:
${message}

Our team will respond to you at ${email} or call you at +91 ${mobile}.

If you have any urgent concerns, please contact us:
📞 +91 9414174880
📧 shreegopalparivarsang@gmail.com

You can reply to this email directly if you need to add any details.

Best regards,
Shree Gopal Parivar Sang
      `,
    };

    // Send both emails
    await transporter.sendMail(adminMailOptions);
    await transporter.sendMail(userMailOptions);

    console.log(`Message sent successfully - From: ${name} (${email})`);

    res.status(200).json({ 
      message: 'Message sent successfully! Check your email for confirmation.',
      success: true 
    });

  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ 
      error: 'Failed to send message. Please try again later.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};


