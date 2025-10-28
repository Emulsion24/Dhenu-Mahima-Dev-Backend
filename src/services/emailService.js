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