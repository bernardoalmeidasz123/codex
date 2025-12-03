import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

import { ADMIN_EMAIL, JWT_SECRET, PORT, UPLOAD_DIR, PIX_KEY } from "./config.js";
import { getDb } from "./db.js";
import { requireAuth, requireAdmin } from "./middleware/auth.js";
import { sendEmail } from "./mailer.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadPath = path.join(__dirname, "..", UPLOAD_DIR);
if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true });
}

const upload = multer({ dest: uploadPath });

const app = express();
app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(uploadPath));

function signUser(user) {
  return jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: "7d" });
}

app.get("/health", (_req, res) => res.json({ status: "ok" }));

// Auth
app.post("/api/auth/register", async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ message: "Dados incompletos" });
  const db = await getDb();
  const existing = await db.get("SELECT id FROM users WHERE email = ?", [email]);
  if (existing) return res.status(400).json({ message: "E-mail já registrado" });
  const hash = await bcrypt.hash(password, 10);
  const role = email === ADMIN_EMAIL ? "admin" : "user";
  const result = await db.run("INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)", [
    name,
    email,
    hash,
    role,
  ]);
  const user = { id: result.lastID, name, email };
  return res.json({ token: signUser(user), user });
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  const db = await getDb();
  const user = await db.get("SELECT * FROM users WHERE email = ?", [email]);
  if (!user) return res.status(400).json({ message: "Credenciais inválidas" });
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(400).json({ message: "Credenciais inválidas" });
  const token = signUser(user);
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

app.get("/api/auth/me", requireAuth, async (req, res) => {
  const db = await getDb();
  const user = await db.get("SELECT id, name, email, role FROM users WHERE id = ?", [req.user.id]);
  res.json({ user });
});

// Courses
app.get("/api/courses", requireAuth, async (req, res) => {
  const db = await getDb();
  const courses = await db.all("SELECT * FROM courses");
  const unlocked = await db.all("SELECT course_id FROM user_courses WHERE user_id = ?", [req.user.id]);
  const unlockedIds = new Set(unlocked.map((u) => u.course_id));

  const mapped = courses.map((c) => {
    const isAdmin = req.user.email === ADMIN_EMAIL;
    const isUnlocked = c.is_free || isAdmin || unlockedIds.has(c.id);
    return { ...c, is_unlocked: isUnlocked };
  });
  res.json({ courses: mapped });
});

app.get("/api/courses/:id", requireAuth, async (req, res) => {
  const db = await getDb();
  const course = await db.get("SELECT * FROM courses WHERE id = ?", [req.params.id]);
  if (!course) return res.status(404).json({ message: "Curso não encontrado" });
  res.json({ course });
});

app.get("/api/courses/:id/exercises", requireAuth, async (req, res) => {
  const db = await getDb();
  const course = await db.get("SELECT * FROM courses WHERE id = ?", [req.params.id]);
  if (!course) return res.status(404).json({ message: "Curso não encontrado" });

  const isAdmin = req.user.email === ADMIN_EMAIL;
  const hasAccess =
    isAdmin || course.is_free || (await db.get("SELECT id FROM user_courses WHERE user_id = ? AND course_id = ?", [req.user.id, course.id]));
  if (!hasAccess) return res.status(403).json({ message: "Curso bloqueado" });

  const exercises = await db.all("SELECT * FROM exercises WHERE course_id = ? ORDER BY [order] ASC", [course.id]);
  const progressRows = await db.all("SELECT exercise_id FROM exercise_progress WHERE user_id = ? AND completed = 1", [req.user.id]);
  const completedSet = new Set(progressRows.map((p) => p.exercise_id));
  res.json({
    exercises: exercises.map((e) => ({ ...e, completed: completedSet.has(e.id) })),
    course,
  });
});

// Progress
app.post("/api/exercises/:id/complete", requireAuth, async (req, res) => {
  const db = await getDb();
  const exercise = await db.get("SELECT * FROM exercises WHERE id = ?", [req.params.id]);
  if (!exercise) return res.status(404).json({ message: "Exercício não encontrado" });

  const course = await db.get("SELECT * FROM courses WHERE id = ?", [exercise.course_id]);
  const isAdmin = req.user.email === ADMIN_EMAIL;
  const hasAccess =
    isAdmin ||
    course.is_free ||
    (await db.get("SELECT id FROM user_courses WHERE user_id = ? AND course_id = ?", [req.user.id, course.id]));
  if (!hasAccess) return res.status(403).json({ message: "Curso bloqueado" });

  await db.run(
    "INSERT INTO exercise_progress (user_id, exercise_id, completed, completed_at) VALUES (?, ?, 1, CURRENT_TIMESTAMP) ON CONFLICT(user_id, exercise_id) DO UPDATE SET completed=1, completed_at=CURRENT_TIMESTAMP",
    [req.user.id, exercise.id]
  );
  res.json({ message: "Exercício marcado como concluído" });
});

app.get("/api/progress/:courseId", requireAuth, async (req, res) => {
  const db = await getDb();
  const rows = await db.all(
    "SELECT exercise_id FROM exercise_progress WHERE user_id = ? AND exercise_id IN (SELECT id FROM exercises WHERE course_id = ?) AND completed = 1",
    [req.user.id, req.params.courseId]
  );
  res.json({ completed: rows.map((r) => r.exercise_id) });
});

// Purchases
app.post("/api/purchases", requireAuth, upload.single("attachment"), async (req, res) => {
  const { courseId } = req.body;
  if (!courseId) return res.status(400).json({ message: "Curso é obrigatório" });
  const db = await getDb();
  const course = await db.get("SELECT * FROM courses WHERE id = ?", [courseId]);
  if (!course) return res.status(404).json({ message: "Curso não encontrado" });
  if (course.is_free) return res.status(400).json({ message: "Curso gratuito não requer compra" });

  const attachmentPath = req.file ? req.file.filename : null;
  const result = await db.run(
    "INSERT INTO purchases (user_id, course_id, status, attachment_path) VALUES (?, ?, 'PENDING', ?)",
    [req.user.id, courseId, attachmentPath]
  );

  const user = await db.get("SELECT name, email FROM users WHERE id = ?", [req.user.id]);
  await sendEmail({
    to: ADMIN_EMAIL,
    subject: "Novo comprovante de pagamento - Code34",
    html: `
      <p>Nome: ${user.name}</p>
      <p>Email: ${user.email}</p>
      <p>Curso: ${course.name}</p>
      <p>Data: ${new Date().toISOString()}</p>
      <p>ID da compra: ${result.lastID}</p>
      <p>PIX enviado para: ${PIX_KEY}</p>
    `,
    attachments: attachmentPath
      ? [
          {
            filename: path.basename(attachmentPath),
            path: path.join(uploadPath, attachmentPath),
          },
        ]
      : [],
  });

  res.json({ message: "Comprovante enviado. Aguarde aprovação manual.", purchase_id: result.lastID });
});

// Admin approvals
app.get("/api/admin/purchases", requireAuth, requireAdmin, async (req, res) => {
  const { status = "PENDING" } = req.query;
  const db = await getDb();
  const rows = await db.all(
    `SELECT p.*, u.name as user_name, u.email as user_email, c.name as course_name
     FROM purchases p
     JOIN users u ON u.id = p.user_id
     JOIN courses c ON c.id = p.course_id
     WHERE p.status = ?
     ORDER BY p.created_at DESC`,
    [status]
  );
  res.json({ purchases: rows });
});

app.post("/api/admin/purchases/:id/approve", requireAuth, requireAdmin, async (req, res) => {
  const db = await getDb();
  const purchase = await db.get(
    `SELECT p.*, u.email as user_email, u.name as user_name, c.name as course_name
     FROM purchases p
     JOIN users u ON u.id = p.user_id
     JOIN courses c ON c.id = p.course_id
     WHERE p.id = ?`,
    [req.params.id]
  );
  if (!purchase) return res.status(404).json({ message: "Compra não encontrada" });
  await db.run("UPDATE purchases SET status = 'APPROVED' WHERE id = ?", [purchase.id]);
  await db.run(
    "INSERT OR IGNORE INTO user_courses (user_id, course_id, unlocked_at) VALUES (?, ?, CURRENT_TIMESTAMP)",
    [purchase.user_id, purchase.course_id]
  );
  await sendEmail({
    to: purchase.user_email,
    subject: "Seu curso foi liberado - Code34",
    html: `<p>Olá ${purchase.user_name},</p><p>Seu pagamento foi confirmado e o curso ${purchase.course_name} foi liberado.</p>`,
  });
  res.json({ message: "Compra aprovada e curso liberado" });
});

app.post("/api/admin/purchases/:id/reject", requireAuth, requireAdmin, async (req, res) => {
  const db = await getDb();
  const purchase = await db.get(
    `SELECT p.*, u.email as user_email, u.name as user_name
     FROM purchases p
     JOIN users u ON u.id = p.user_id
     WHERE p.id = ?`,
    [req.params.id]
  );
  if (!purchase) return res.status(404).json({ message: "Compra não encontrada" });
  await db.run("UPDATE purchases SET status = 'REJECTED' WHERE id = ?", [purchase.id]);
  res.json({ message: "Compra rejeitada" });
});

// Serve attachment details for admin
app.get("/api/admin/purchases/:id/attachment", requireAuth, requireAdmin, async (req, res) => {
  const db = await getDb();
  const purchase = await db.get("SELECT * FROM purchases WHERE id = ?", [req.params.id]);
  if (!purchase || !purchase.attachment_path) return res.status(404).json({ message: "Comprovante não encontrado" });
  const filePath = path.join(uploadPath, purchase.attachment_path);
  if (!fs.existsSync(filePath)) return res.status(404).json({ message: "Arquivo ausente" });
  res.sendFile(filePath);
});

// Users list (admin)
app.get("/api/admin/users", requireAuth, requireAdmin, async (_req, res) => {
  const db = await getDb();
  const rows = await db.all("SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC");
  res.json({ users: rows });
});

// Courses and exercises admin list
app.get("/api/admin/courses", requireAuth, requireAdmin, async (_req, res) => {
  const db = await getDb();
  const courses = await db.all("SELECT * FROM courses");
  const exercises = await db.all("SELECT * FROM exercises");
  res.json({ courses, exercises });
});

app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});
