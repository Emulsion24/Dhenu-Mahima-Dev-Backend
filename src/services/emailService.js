import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 465,
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  tls: { rejectUnauthorized: false },
});



export async function sendOtpEmail(to, otp) {
  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject: 'Your OTP Code',
    html: `<h3>Your OTP is: ${otp}</h3><p>Valid for 5 minutes.</p>`,
  });
}

export async function sendResetPasswordEmail(to, link) {
  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject: 'Reset Password',
    html: `<p>Click below to reset password:</p><a href="${link}">${link}</a>`,
  });
}
export const sendDonationThankYouEmail = async ({ name, email, amount, transactionId }) => {
  if (!email) return; // skip if no email provided

  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to: email,
    subject: `🙏 Thank You for Your Donation to Dhenu Mahima`,
    html: `
      <div style="font-family: Arial, sans-serif; color: #333;">
        <h2>🌸 Thank You, ${name || "Devotee"}!</h2>
        <p>We have received your generous donation of <strong>₹${amount}</strong>.</p>
        <p>Your contribution helps us continue our service towards <strong>Gau Seva</strong> and spiritual welfare.</p>
        <p><strong>Transaction ID:</strong> ${transactionId}</p>
        <p>We will contact you soon if any details are needed.</p>

        <br/>
        <p>With Gratitude,</p>
        <p><strong>Dhenu Mahima Team</strong></p>
      </div>
    `,
    text: `
Thank you, ${name || "Devotee"}!

We have received your generous donation of ₹${amount}.
Transaction ID: ${transactionId}

Your contribution helps us continue our service towards Gau Seva.

With gratitude,
Dhenu Mahima Team
    `,
  };



  await transporter.sendMail(mailOptions);
};


export const sendMembershipThankYouEmail = async ({
  name,
  email,
  amount,
  transactionId,
  membershipType,
}) => {
  if (!email) return;

  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to: email,
    subject: `🙏 Thank You for Joining Dhenu Mahima Membership`,
    html: `
      <div style="background-color: #f7f4ec; padding: 20px; font-family: 'Segoe UI', Arial, sans-serif; color: #333;">
        <div style="max-width: 600px; margin: auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.1);">
          
          <div style="background-color: #fff8e1; padding: 20px 30px; text-align: center;">
            <h1 style="color: #795548; font-size: 24px; margin: 0;">🌸 Thank You, ${name || "Devotee"}! 🌸</h1>
            <p style="color: #8d6e63; font-size: 16px; margin-top: 5px;">Your support strengthens our service to Gau Mata and humanity.</p>
          </div>

          <div style="padding: 25px 30px; line-height: 1.6;">
            <p style="font-size: 16px;">We are delighted to confirm your <strong>${membershipType || "Membership"}</strong> with Dhenu Mahima.</p>
            <p>Your generous contribution of <strong style="color: #2e7d32;">₹${amount}</strong> has been received successfully.</p>
            
            <table style="margin: 15px 0; border-collapse: collapse; width: 100%;">
              <tr>
                <td style="padding: 8px; border: 1px solid #ddd;">Transaction ID</td>
                <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">${transactionId}</td>
              </tr>
              ${
                membershipType
                  ? `<tr>
                      <td style="padding: 8px; border: 1px solid #ddd;">Membership Type</td>
                      <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">${membershipType}</td>
                    </tr>`
                  : ""
              }
            </table>

            <p>We will reach out soon if any further details are needed.</p>

            <div style="margin-top: 20px; text-align: center;">
              <a href="https://dhenumahima.com" target="_blank" style="display: inline-block; background: #8bc34a; color: white; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-weight: 600;">Visit Our Website</a>
            </div>
          </div>

          <div style="background-color: #f1f8e9; padding: 15px 30px; text-align: center; font-size: 14px; color: #666;">
            <p style="margin: 0;">With Gratitude,</p>
            <p style="margin: 4px 0;"><strong>Dhenu Mahima Team</strong></p>
            <p style="margin: 4px 0;">🙏 Gau Seva is true spiritual service 🙏</p>
          </div>

        </div>
      </div>
    `,
    text: `
Thank you, ${name || "Devotee"}!

We have received your generous contribution of ₹${amount}.
Transaction ID: ${transactionId}
Membership Type: ${membershipType || "General"}

Your support strengthens our service to Gau Mata and humanity.

With gratitude,
Dhenu Mahima Team
    `,
  };

  await transporter.sendMail(mailOptions);
};
