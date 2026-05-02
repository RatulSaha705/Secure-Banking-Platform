'use strict';

/**
 * server/src/services/emailService.js
 *
 * Sends OTP emails from the bank email address.
 */

const nodemailer = require('nodemailer');

const isEmailConfigured = () => {
  return Boolean(
    process.env.SMTP_HOST &&
    process.env.SMTP_PORT &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS
  );
};

const getTransporter = () => {
  if (!isEmailConfigured()) {
    const error = new Error(
      'SMTP email is not configured. Add SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASS to server/.env'
    );
    error.statusCode = 500;
    throw error;
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || 'false') === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
};

const getFromAddress = () => {
  const name = process.env.BANK_EMAIL_FROM_NAME || 'Secure Banking Platform';
  const address = process.env.BANK_EMAIL_FROM_ADDRESS || process.env.SMTP_USER;

  return `"${name}" <${address}>`;
};

const buildOtpEmail = ({ otp, purpose, expiresInMinutes }) => {
  const purposeText =
    purpose === 'REGISTRATION'
      ? 'complete your Secure Banking Platform registration'
      : 'verify your Secure Banking Platform login';

  const subject =
    purpose === 'REGISTRATION'
      ? 'Verify your Secure Banking registration'
      : 'Your Secure Banking login OTP';

  const text = [
    `Your OTP is: ${otp}`,
    '',
    `Use this code to ${purposeText}.`,
    `This code expires in ${expiresInMinutes} minutes.`,
    '',
    'If you did not request this code, please ignore this email.',
    '',
    'Secure Banking Platform',
  ].join('\n');

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5;">
      <h2>Secure Banking Platform</h2>
      <p>Use this OTP to ${purposeText}.</p>
      <p style="font-size: 28px; font-weight: bold; letter-spacing: 4px;">${otp}</p>
      <p>This code expires in <strong>${expiresInMinutes} minutes</strong>.</p>
      <p>If you did not request this code, please ignore this email.</p>
    </div>
  `;

  return { subject, text, html };
};

const sendOtpEmail = async ({ to, otp, purpose, expiresInMinutes }) => {
  if (!to) {
    const error = new Error('OTP email recipient is required');
    error.statusCode = 400;
    throw error;
  }

  const email = buildOtpEmail({ otp, purpose, expiresInMinutes });

  // Temporary development mode:
  // Keeps 2FA active but stops sending real email.
  if (process.env.DISABLE_OTP_EMAIL === 'true') {
    console.log('[OTP EMAIL DISABLED]');
    console.log(`[OTP EMAIL DISABLED] To: ${to}`);
    console.log(`[OTP EMAIL DISABLED] Purpose: ${purpose}`);
    console.log(`[OTP EMAIL DISABLED] Subject: ${email.subject}`);
    console.log(`[OTP EMAIL DISABLED] OTP: ${otp}`);
    console.log(`[OTP EMAIL DISABLED] Expires in: ${expiresInMinutes} minutes`);

    return {
      sent: false,
      disabled: true,
      devOtp: otp,
    };
  }

  if (!isEmailConfigured()) {
    if (process.env.EMAIL_ALLOW_CONSOLE_FALLBACK === 'true') {
      console.log('[EMAIL FALLBACK] SMTP not configured.');
      console.log(`[EMAIL FALLBACK] To: ${to}`);
      console.log(`[EMAIL FALLBACK] Subject: ${email.subject}`);
      console.log(`[EMAIL FALLBACK] OTP: ${otp}`);

      return {
        sent: false,
        fallback: true,
        devOtp: otp,
      };
    }

    return getTransporter();
  }

  const transporter = getTransporter();

  const info = await transporter.sendMail({
    from: getFromAddress(),
    to,
    subject: email.subject,
    text: email.text,
    html: email.html,
  });

  return {
    sent: true,
    messageId: info.messageId,
  };
};
module.exports = {
  isEmailConfigured,
  sendOtpEmail,
};