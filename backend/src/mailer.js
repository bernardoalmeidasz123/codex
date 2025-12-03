import nodemailer from "nodemailer";
import { MAIL_CONFIG } from "./config.js";

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (!MAIL_CONFIG.host || !MAIL_CONFIG.auth) {
    console.warn("[mail] SMTP not fully configured, emails will be logged to console.");
    return null;
  }
  transporter = nodemailer.createTransport({
    host: MAIL_CONFIG.host,
    port: MAIL_CONFIG.port,
    secure: MAIL_CONFIG.port === 465,
    auth: MAIL_CONFIG.auth,
  });
  return transporter;
}

export async function sendEmail({ to, subject, html, attachments = [] }) {
  const tx = getTransporter();
  if (!tx) {
    console.log("[mail:mock]", { to, subject, html, attachments });
    return;
  }
  await tx.sendMail({
    from: MAIL_CONFIG.from,
    to,
    subject,
    html,
    attachments,
  });
}
