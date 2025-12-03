import jwt from "jsonwebtoken";
import { JWT_SECRET, ADMIN_EMAIL } from "../config.js";

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: "Token ausente" });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Token inválido" });
  }
}

export function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ message: "Não autenticado" });
  if (req.user.email !== ADMIN_EMAIL) return res.status(403).json({ message: "Acesso restrito ao administrador" });
  next();
}
