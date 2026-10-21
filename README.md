# Khmer NER Annotator (React + Express + MySQL)

Deploy: **Aiven MySQL** (database) > **Render** (API) > **Vercel** (React site).

1. **Aiven**: create a MySQL service and copy its **Service URI**. The
   service must be running and allow connections from your API host.
2. **GitHub**: push this whole folder to a new repo.
3. **Render**: New > Blueprint > pick the repo (reads `render.yaml`). Set
   `DATABASE_URL` to the Aiven Service URI and `ADMIN_PASSWORD` (at least 8
   characters). The backend uses the bundled Aiven CA certificate to verify
   the database server certificate. If Aiven rotates its CA, update
   `backend/aiven-ca.pem` or set `MYSQL_CA` to the replacement PEM certificate.
   Deploy, copy the URL, and check `/health` returns `ok`.
4. Edit `frontend/vercel.json`: replace `YOUR-SERVICE.onrender.com` with your Render host. Commit and push.
5. **Vercel**: Add New > Project > pick the repo. Root Directory = `frontend` (Vite is detected automatically). Deploy.

The browser only talks to your Vercel domain; Vercel forwards `/api` to Render, so login cookies are same-site and no CORS is needed.

### Local setup

1. Copy `backend/.env.example` to `backend/.env`.
2. Set `DATABASE_URL` to the Aiven MySQL Service URI. If you build the URI
   yourself, URL-encode special characters in the username or password.
3. Set `JWT_SECRET` to a long random value and `ADMIN_PASSWORD` to a strong
   password. The bundled Aiven CA certificate is used for server certificate
   verification by default.
4. Run `npm install` and `npm start` from `backend`, then run `npm install` and
   `npm run dev` from `frontend`.

The backend creates the required MySQL tables on startup and seeds the initial
admin account and labels if the database is empty. Existing PostgreSQL data is
not migrated automatically. Keep `backend/.env` private; do not commit database
credentials.

No backend: run `npm install` and `npm run demo` from `frontend` (data stays in
your browser; demo login is admin / admin123).
