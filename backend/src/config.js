import dotenv from "dotenv";

dotenv.config();

export const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "bernardoalmeida01031981@gmail.com";
export const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
export const PORT = process.env.PORT || 4000;
export const UPLOAD_DIR = process.env.UPLOAD_DIR || "uploads";

export const PIX_KEY = process.env.PIX_KEY || "sua-chave-pix-aqui";

export const MAIL_CONFIG = {
  host: process.env.SMTP_HOST || "",
  port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587,
  auth: process.env.SMTP_USER
    ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || "" }
    : null,
  from: process.env.EMAIL_FROM || "Code34 <no-reply@code34.com>",
};

export const DB_FILE = process.env.DB_FILE || "data.db";
