Code34 — PIX manual + exercícios + painel admin
================================================

Stack
- Backend: Node.js + Express + SQLite + JWT + Multer + Nodemailer
- Frontend: React (via CDN/ESM) em `frontend/index.html`

Como rodar
1) Backend
   - `cd backend`
   - `cp .env.example .env` e preencha chaves (PIX_KEY, SMTP_*, JWT_SECRET)
   - `npm install`
   - `npm start` (sobe em http://localhost:4000)

2) Frontend
   - Sirva `frontend/index.html` com um servidor estático (ex: `npx serve frontend` ou abrir o arquivo e permitir CORS/local).
   - O frontend chama a API em `http://localhost:4000` (ajuste API_URL dentro do script se mudar a porta/host).

Fluxo de pagamento manual
- Usuário envia comprovante via `/api/purchases` (upload).
- Admin (e-mail `bernardoalmeida01031981@gmail.com`) acessa painel, visualiza pendentes, aprova/rejeita.
- Ao aprovar: status passa a APPROVED, curso libera em `user_courses` e e-mail de liberação é enviado.

Rotas principais (backend)
- Auth: `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`
- Cursos: `GET /api/courses`, `GET /api/courses/:id`, `GET /api/courses/:id/exercises`
- Progresso: `POST /api/exercises/:id/complete`, `GET /api/progress/:courseId`
- Pagamentos: `POST /api/purchases` (upload multipart field `attachment`, body `courseId`)
- Admin: `GET /api/admin/purchases?status=...`, `POST /api/admin/purchases/:id/approve`, `POST /api/admin/purchases/:id/reject`, `GET /api/admin/purchases/:id/attachment`, `GET /api/admin/users`, `GET /api/admin/courses`

Tabelas (SQLite)
- users, courses, exercises, exercise_progress, purchases, user_courses
- Seeds: 12 cursos (inclui módulo grátis) + 34 exercícios cada (408 total).

Regras de acesso
- Admin (e-mail configurado) vê tudo desbloqueado, não vê compra, e acessa painel.
- Demais usuários precisam de aprovação manual para liberar curso pago; módulo de lógica é grátis.

Envio de e-mail
- Configurar SMTP em `.env`. Se ausente, o backend apenas loga no console.
