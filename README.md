# Khmer NER Annotator

React + Vite frontend with a Cloudflare Worker API. Cloudflare D1 stores
application records and R2 stores document text, keeping large files out of
D1's 2 MB per-row limit. Render/Aiven and Vercel configurations remain in the
repository as legacy deployments; they are not part of the D1/R2 deployment.

## Self-hosted Ubuntu VPS deployment

The Express API can also run on an Ubuntu VPS with a local MySQL database.
This keeps the frontend, API, and application records on the VPS; the Cloudflare
Worker and D1/R2 deployment remains a separate option. The VPS configuration
uses Nginx for the built frontend and HTTPS, and keeps the API bound to
localhost. It expects the repository at `/home/ubuntu/khmer-ner`, the `ubuntu`
system account, and a valid Let's Encrypt certificate for
`khmer-ner-app.duckdns.org`. Adjust `deploy/nginx/khmer-ner.conf` and
`deploy/khmer-ner.service` if those values differ.

For a complete teammate guide covering a clean Ubuntu VPS installation,
backups and recovery, and future code updates, see
[deploy/TEAMMATE-DEPLOYMENT.md](./deploy/TEAMMATE-DEPLOYMENT.md).

1. Install the backend and frontend dependencies and build the frontend:

   ```bash
   cd /home/ubuntu/khmer-ner
   npm ci --prefix backend
   npm ci --prefix frontend
   npm run build --prefix frontend
   ```

2. Create `/etc/khmer-ner.env` as root with these settings. Put the existing
   MySQL app user's password in `MYSQL_PASSWORD`; generate fresh, unique values
   for `JWT_SECRET` and `ADMIN_PASSWORD` (at least 12 characters). Do not commit
   this file or paste its contents into chat.

   ```ini
   MYSQL_HOST=localhost
   MYSQL_USER=khmer_ner_app
   MYSQL_PASSWORD=replace-with-your-mysql-password
   MYSQL_DATABASE=khmer_ner
   JWT_SECRET=replace-with-a-long-random-secret
   ADMIN_USER=admin
   ADMIN_PASSWORD=replace-with-a-unique-admin-password
   ```

   Restrict the file to root and the service account:

   ```bash
   sudo chown root:ubuntu /etc/khmer-ner.env
   sudo chmod 640 /etc/khmer-ner.env
   ```

3. Install and start the API service. On its first start, it creates the MySQL
   tables, default labels, and the admin account. Once the service is running,
   remove the `ADMIN_PASSWORD` line from `/etc/khmer-ner.env` and restart the
   service; the account remains in MySQL.

   ```bash
   sudo cp deploy/khmer-ner.service /etc/systemd/system/khmer-ner.service
   sudo systemctl daemon-reload
   sudo systemctl enable --now khmer-ner
   sudo systemctl status khmer-ner --no-pager
   ```

4. Configure Nginx to serve the frontend and proxy `/api/` to the local API:

   ```bash
   sudo mkdir -p /var/www/khmer-ner
   sudo cp -a frontend/dist/. /var/www/khmer-ner/
   sudo cp deploy/nginx/khmer-ner.conf /etc/nginx/sites-available/khmer-ner
   sudo ln -s /etc/nginx/sites-available/khmer-ner /etc/nginx/sites-enabled/khmer-ner
   sudo unlink /etc/nginx/sites-enabled/default
   sudo nginx -t
   sudo systemctl reload nginx
   ```

5. Verify `https://khmer-ner-app.duckdns.org/health` returns `ok`, then open
   the site and sign in with the admin account created above. Keep MySQL
   restricted to localhost; do not open port 3306 in the firewall.

The MySQL backend stores document text in MySQL, unlike the Cloudflare
deployment where R2 stores document bodies.
The API automatically creates an `annotation_progress` table and stores each
user's latest row for each document. Navigation saves progress and reopening a
document restores the latest saved row, if it is still within the user's
assignment. The progress dashboard uses that saved row to show reached assigned
rows out of the total assigned rows and their percentage.

## Cloudflare Pages + Workers deployment

The Worker uses D1 for users, labels, document metadata, assignments, and
annotations. Full document text is stored in R2; each D1 document row stores an
R2 object key, byte count, and row count. The schema is in
`backend/migrations/0001_initial.sql`.

1. From `backend`, log in to Cloudflare and create the D1 database and R2
   bucket:

   ```powershell
   npx wrangler login
   npx wrangler d1 create khmer-ner
   npx wrangler r2 bucket create khmer-ner-documents
   ```

2. Copy the `database_id` returned by `wrangler d1 create` into
   `backend/wrangler.toml`, replacing `REPLACE_WITH_D1_DATABASE_ID`.
3. Apply the schema to the new D1 database:

   ```powershell
   npx wrangler d1 migrations apply khmer-ner --remote
   ```

   This also applies `0002_annotation_progress.sql`, which stores each user's
   latest row for each document.

4. If you are moving the existing Aiven data, first create a backup and put
   the old app into maintenance mode so the export is consistent. From
   `backend`, provide `DATABASE_URL` from a secure local environment (do not
   put it in source control or a command-history entry), then run:

   ```powershell
   node .\migrate-mysql-to-cloudflare.mjs .\cloudflare-migration
   .\cloudflare-migration\apply-migration.ps1
   ```

   The export directory contains document text and account data. Keep it
   private and remove it after verifying the migration and retaining a
   separate backup. The generated script uploads document objects to R2 and
   imports metadata, users, labels, assignments, and annotations into D1.
   Run it only once against the newly-created, empty D1 database. Keep the
   existing backend available until the new deployment and migrated data
   have been verified.
5. Deploy the Worker with `npx wrangler deploy`, then configure Cloudflare
   Pages to proxy `/api/*` to it as described below.

The Worker configuration enables persisted observability logs. Error logs
include only error codes, not raw database or object-storage errors.

Large imports are combined from temporary R2 chunk objects into the final
document object using a stream, rather than assembling the whole file in Worker
memory. R2's
`khmer-ner-documents` bucket must be kept in the same Cloudflare account as
the Worker. Configure an R2 lifecycle rule to expire objects under the
`imports/` prefix after one day; these are temporary upload chunks. Do not
expire objects under `docs/`, which contain saved documents.

See Cloudflare's [D1 limits](https://developers.cloudflare.com/d1/platform/limits/)
and [R2 Workers API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/)
documentation for storage limits and binding behavior.

### Database connectivity check

The public `GET /health` endpoint checks only that the Worker is responding.
For a read-only D1 check, `GET /health/db` requires the separate
`HEALTH_CHECK_TOKEN` secret. The endpoint runs `SELECT 1`, returns only
`{"status":"ok"}` or a generic service-unavailable error, and does not read or
change application data. It logs only an error code on failure.

Generate a random token locally and keep it in a password manager:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

From `backend`, store the token as a Worker secret when prompted:

```powershell
npx wrangler secret put HEALTH_CHECK_TOKEN
```

After manually deploying the Worker, test the endpoint in PowerShell. The
token prompt is masked:

```powershell
$secureToken = Read-Host "Health-check token" -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
try {
  $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  $headers = @{ Authorization = ("Bear" + "er " + $token) }
  Invoke-RestMethod `
    -Uri "https://khmer-ner-api.sotikunchhayny.workers.dev/health/db" `
    -Headers $headers
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  Remove-Variable headers -ErrorAction SilentlyContinue
  Remove-Variable token -ErrorAction SilentlyContinue
}
```

An unauthorized request intentionally returns `404`. A successful request
returns `status: ok`; a database connection/query failure returns HTTP `503`
without exposing connection details.

### 2. Configure and deploy the Worker

Install Node.js and npm if they are not already installed. From the repository
root, run:

```powershell
cd backend
npx wrangler login
npx wrangler secret put JWT_SECRET
npx wrangler deploy
```

At the `JWT_SECRET` prompt, use the same secret as the old backend if existing
login sessions should remain valid. Otherwise, choose a new long, random
secret; users will need to sign in again. Never put this value in
`wrangler.toml`, source control, or a command argument.

The deployed Worker URL is shown by `wrangler deploy`, for example
`https://khmer-ner-api.<your-account-subdomain>.workers.dev`. Check
`https://<worker-host>/health` returns `ok`. The Worker needs no
`ADMIN_PASSWORD`: it authenticates against the existing users table and does
not seed or modify accounts. Migrate users before cutover so existing accounts
and password hashes remain available.

### 3. Point Cloudflare Pages to the Worker

In the Cloudflare dashboard:

1. Open **Workers & Pages** and select the existing Pages project.
2. Under **Settings** > **Builds & deployments**, set the root directory to
   `frontend`, build command to `npm run build`, and output directory to `dist`.
3. Under **Settings** > **Environment variables**, add `BACKEND_URL` with this
   Worker origin for each Pages environment you intend to use:
   `https://khmer-ner-api.sotikunchhayny.workers.dev`. Do not add a trailing
   slash or `/api`.
4. Redeploy Pages so the existing Pages Function at
   `frontend/functions/api/[[path]].js` can proxy `/api/*` to the Worker.

The browser continues to call `/api` on the Pages origin. This same-origin
proxy preserves the HttpOnly, Secure, SameSite=Strict login cookie and avoids
cross-origin cookie/CORS requirements. Do not change the frontend to call the
Worker URL directly. `ALLOWED_ORIGIN` is optional and is only for explicitly
configured cross-origin preflight requests; it is not needed for the Pages
proxy.

The existing Vercel rewrite in `frontend/vercel.json` continues to point to
Render and is independent of Cloudflare Pages. Do not change it to configure
Cloudflare Pages; Pages uses its Function and the `BACKEND_URL` setting above.

### 4. Local development

From `backend`, apply the schema to Wrangler's local D1 database and start the
Worker:

```powershell
npx wrangler d1 migrations apply khmer-ner --local
npx wrangler dev
```

Wrangler uses local D1 and R2 emulation for development. In another terminal,
run `npm install` and `npm run dev` from `frontend`; Vite proxies `/api` to the
local Worker on port 8787. Avoid `npx wrangler dev --remote` for routine
development because it writes to the remote D1 database and R2 bucket.

For the in-browser demo without a backend, run `npm install` and `npm run demo`
from `frontend` (demo data stays in the browser; demo login is `admin` /
`admin123`).

### 5. Verify before cutover

Use a staging Pages environment and non-production D1/R2 resources for tests that
write records. Do not run mutation tests against production data unless those
changes are explicitly approved.

1. Request `GET /health` on the Worker and confirm status `200` with body
   `ok`.
2. Through the Pages URL, request `GET /api/me` without a session and confirm
   status `401` with `{"error":"Please sign in again."}`.
3. Sign in through the Pages frontend with a test account. Confirm the login
   succeeds, the browser stores an HttpOnly, Secure, SameSite=Strict `sid`
   cookie for the Pages site, and `/api/me` returns the correct user and role.
4. Sign out and confirm the cookie is cleared and a subsequent `/api/me`
   returns `401`.
5. With test accounts, verify admin-only access (`GET /api/users` succeeds
   for an admin and returns `403` for an annotator), row assignment visibility,
   document/annotation operations, both import paths, and password change.
   Verify invalid input returns `400`, duplicate users return `409`, missing
   sessions return `401`, and oversized JSON returns `413`.
6. If either binding is missing in staging, verify application endpoints
   return the generic `500` JSON error and inspect Worker logs for the
   underlying failure. Never expose data or JWT secrets in logs or test output.
7. Check the browser Network panel for `/api` requests to the Pages origin;
   the browser should not call the Worker host directly.

The repository does not currently define an automated backend test suite, and
the production Worker is not deployed by these instructions.

## API and migration notes

The Worker retains the existing `/health` endpoint and the `/api` routes for
login/logout/current user/password, users, labels, documents and assignments,
annotations, and JSON/chunked imports. Chunked text is temporarily stored in
R2 and streamed into a permanent R2 document object; D1 stores the associated
metadata and annotations. This avoids D1's 2 MB per-row text limit and avoids
assembling the entire file in Worker memory.
JWTs remain HS256 tokens in the `sid` cookie. The Worker stores new and changed
passwords as PBKDF2-HMAC-SHA-256 hashes and continues to verify existing bcrypt
hashes at login. Legacy hashes are upgraded when the user changes their
password, rather than during login. The Worker re-reads the current user role
from D1 on authenticated requests.

The Node/Express Render backend remains in the repository as a legacy MySQL
deployment and is not compatible with the new D1/R2 data model. Deploy the
frontend and API through Cloudflare Pages and Workers for this configuration.
The Vercel rewrite still targets the legacy Render service and must not be used
for this D1/R2 deployment.

- `bcryptjs` 2.4.3 remains installed for the Express server and for legacy
  Worker hash compatibility during login and password changes.
- Express, `cookie-parser`, `express-rate-limit`, Helmet, `jsonwebtoken`, and
  `dotenv` stay in the package for the untouched Render entry point. The
  Worker does not use them: request handling uses the Workers Fetch API,
  cookies and security headers are handled directly, and JWT HMAC uses
  WebCrypto.
- The Worker uses the native D1 and R2 bindings; no database driver is used.

The API and failed-login throttles use in-memory counters, matching the
existing server's in-process limiter design. Worker isolate state can be
restarted or split across isolates, so configure Cloudflare's edge rate
limiting as additional protection before public cutover if global enforcement
is required.

The Worker `GET /api/docs` endpoint returns document metadata and annotation
counts without loading document bodies or annotation records. The authenticated
`GET /api/docs/:id` endpoint returns one document's text and visible
annotations; the frontend loads details when a document is opened and loads
all details only when preparing an export. For row-restricted documents,
`annCount` is `null` in the list because an accurate visible count requires
examining annotation offsets against document rows; details return only
annotations in the user's assigned rows.

The existing Render backend, `render.yaml`, and Vercel rewrite remain as
legacy files, but will not see D1/R2 data. Do not switch production traffic to
them after the D1/R2 cutover.

## Legacy deployments

`backend/server.js`, `render.yaml`, and `frontend/vercel.json` still describe
the previous MySQL/Aiven and Render/Vercel setup. They are retained for
reference but do not use the D1/R2 schema. Do not deploy or direct production
traffic to those configurations after migrating to D1/R2. Local development
uses the Worker through Wrangler and the Vite proxy described above.

## Features

Admins can delete any document; annotators can permanently delete documents
assigned to them. Deleting a document also deletes its annotations.

Admins can assign whole documents or specific newline-delimited row ranges to
annotator accounts. Row-range assignments let annotators highlight only rows
assigned to them; the API enforces the same row-level access. Admins can view
each annotator's assigned, completed, and annotated-document totals, plus
reached assigned rows as a percentage of all assigned rows.
Annotators can view their own assigned, completed, remaining, and entity
totals and row-based completion percentage in My progress, and can annotate
using any available label. Only admins can create or manage user accounts.

Import accepts text-based files and text typed or pasted into the import box.
Files larger than 4 MB upload in small chunks, so 100 MB text files do not
need to fit in a single API request. Export downloads the available documents
and annotations as a JSON file. After a file import finishes, the file picker
resets so the same file can be selected again.
