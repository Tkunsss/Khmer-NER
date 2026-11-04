# Khmer NER Annotator

React + Vite frontend, Node.js + Express backend, and MySQL database hosted on
Aiven. The existing Render backend remains available; Cloudflare Workers is an
additional backend deployment that can be enabled by pointing the Cloudflare
Pages Function at the Worker.

## Cloudflare Pages + Workers deployment

The Worker uses the existing MySQL tables through Cloudflare Hyperdrive. It
does not create, seed, or alter database tables. Do not deploy it against an
uninitialized database; provisioning a new database requires a separate,
approved schema setup. The Worker does not change `backend/server.js`,
`render.yaml`, or the existing Render deployment.

### 1. Create a Hyperdrive configuration

1. From `backend`, authenticate Wrangler and upload the existing Aiven CA
   certificate. Confirm it is the current CA for this Aiven service/project.
   The command requires Wrangler 4.9.0 or newer; the checked-in PEM contains
   one CA certificate, not a multi-certificate bundle:

   ```powershell
   npx wrangler login
   npx wrangler cert upload certificate-authority --ca-cert .\aiven-ca.pem --name khmer-ner-aiven-ca
   ```

   Keep the returned certificate ID for the dashboard configuration. If Aiven
   rotates its CA, upload the replacement certificate and update Hyperdrive.
2. In the Cloudflare dashboard, open **Workers & Pages** > **Hyperdrive** >
   **Create configuration**, select **MySQL**, and enter the Aiven host, port,
   database name, and database username/password from the Aiven service
   details. Enter credentials only in the Cloudflare dashboard; do not put
   them in source control or command-line arguments.
3. Configure server certificate verification with the uploaded Aiven CA.
   Choose **Verify full** (`VERIFY_IDENTITY`) if the Aiven hostname matches a
   name in the server certificate; otherwise use **Verify CA** (`VERIFY_CA`).
   Keep TLS and certificate verification enabled. Hyperdrive's **Required**
   (`REQUIRED`) mode also enforces TLS, but validates certificates against
   WebPKI; use it only if the Aiven server certificate chains to a WebPKI
   trusted CA. Configure Aiven networking to allow the Hyperdrive connection
   without broadly exposing the database.
4. Create the configuration. Its ID is already set in
   `backend/wrangler.toml` as the `HYPERDRIVE` binding. If you recreate the
   configuration, replace that ID with the new one.

The Worker configuration enables persisted observability logs and requires
Wrangler 4.134.0 or later. Deploy the Worker with `npx wrangler deploy` after
changing this setting; logs are not available retroactively. Error logs include
only error codes, not raw database error objects.

The Worker uses the Hyperdrive binding properties and `mysql2`'s documented
Workers compatibility option (`disableEval: true`). No database URI or
credential is stored in the repository. Hyperdrive handles TLS to Aiven; the
Worker's `mysql2` connection uses the Hyperdrive-provided host, username,
password, database, and port.

See Cloudflare's [Hyperdrive TLS certificate and mode
documentation](https://developers.cloudflare.com/hyperdrive/configuration/tls-ssl-certificates-for-hyperdrive/)
for certificate upload and verification details.

### Database connectivity check

The public `GET /health` endpoint checks only that the Worker is responding.
For a read-only Hyperdrive connection check, `GET /health/db` requires the
separate `HEALTH_CHECK_TOKEN` secret. The endpoint runs `SELECT 1`, returns
only `{"status":"ok"}` or a generic service-unavailable error, and does not
read or change application data. It logs only an error code on failure.

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

At the `JWT_SECRET` prompt, enter the same secret used by the current Render
backend if existing login sessions should remain valid. Otherwise, use a new
long, random secret; users will need to sign in again. Never put this value in
`wrangler.toml`, source control, or a command argument.

The deployed Worker URL is shown by `wrangler deploy`, for example
`https://khmer-ner-api.<your-account-subdomain>.workers.dev`. Check
`https://<worker-host>/health` returns `ok`. The Worker needs no
`ADMIN_PASSWORD`: it authenticates against the existing users table and does
not seed or modify accounts.

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

From `backend`, configure the local Hyperdrive binding to use a development
database, not the live database, then start Wrangler:

```powershell
$env:CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE = "mysql://<user>:<password>@<host>:3306/<database>?sslMode=REQUIRED"
npx wrangler dev
```

The connection string is only an environment variable for the current
PowerShell session; do not save credentials in a tracked file. In another
terminal, run `npm install` and `npm run dev` from `frontend`. Vite proxies
`/api` to the local Worker on port 8787. For Pages/Worker deployment testing,
use a non-production database whenever testing operations that write data.
`npx wrangler dev --remote` uses the deployed Hyperdrive configuration and
executes requests against that remote database.

For the in-browser demo without a backend, run `npm install` and `npm run demo`
from `frontend` (demo data stays in the browser; demo login is `admin` /
`admin123`).

### 5. Verify before cutover

Use a staging Pages environment and a non-production database for tests that
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
6. If Hyperdrive is misconfigured in a staging environment, verify database
   endpoints return the generic `500` JSON error and inspect Worker logs for
   the underlying failure. Never expose database or JWT secrets in logs or
   test output.
7. Check the browser Network panel for `/api` requests to the Pages origin;
   the browser should not call the Worker host directly.

The repository does not currently define an automated backend test suite, and
the production Worker is not deployed by these instructions.

## API and migration notes

The Worker retains the existing `/health` endpoint and the `/api` routes for
login/logout/current user/password, users, labels, documents and assignments,
annotations, and JSON/chunked imports. Chunked imports are assembled inside
MySQL so large uploads do not need to be copied through the Worker runtime.
JWTs remain HS256 tokens in the `sid` cookie. The Worker stores new passwords
as PBKDF2-HMAC-SHA-256 hashes and upgrades a legacy bcrypt hash after a
successful login. The Express server continues using `bcryptjs`. The Worker
re-reads the current user role from MySQL on authenticated requests, as the
existing backend does.

Compatibility review of the locked backend packages:

- `mysql2` 3.24.6 is compatible with Hyperdrive ([Cloudflare documents
  3.13.0+ support](https://developers.cloudflare.com/hyperdrive/examples/connect-to-mysql/));
  the Worker sets `disableEval: true`.
- `bcryptjs` 2.4.3 remains installed for the Express server and for legacy
  Worker hash compatibility during login and password changes.
- Express, `cookie-parser`, `express-rate-limit`, Helmet, `jsonwebtoken`, and
  `dotenv` stay in the package for the untouched Render entry point. The
  Worker does not use them: request handling uses the Workers Fetch API,
  cookies and security headers are handled directly, and JWT HMAC uses
  WebCrypto.
- No dependencies were upgraded.

The API and failed-login throttles use in-memory counters, matching the
existing server's in-process limiter design. Worker isolate state can be
restarted or split across isolates, so configure Cloudflare's edge rate
limiting as additional protection before public cutover if global enforcement
is required.

The existing Render backend and `render.yaml` remain unchanged. The Vercel
rewrite in `frontend/vercel.json` also remains unchanged; Cloudflare Pages
uses its own Pages Function for `/api`.

## Existing Render deployment

The Render backend is still configured by `render.yaml` and starts with
`npm start` in `backend`. Its existing secrets and Aiven connection settings
are managed independently; deploying the Worker does not deploy or disable
Render.

To configure the existing Render service, set `DATABASE_URL` to the Aiven
MySQL Service URI, `ADMIN_PASSWORD` to a strong password, and `JWT_SECRET` to a
long random secret in the Render dashboard. The Node/Express process continues
to use `backend/aiven-ca.pem` for TLS verification by default; `MYSQL_CA` can
override it. The existing Render startup handles its own table setup and
initial admin/label seeding. These startup actions are not used by the Worker.

The existing Vercel deployment remains supported: use `frontend` as the root
directory, and keep `frontend/vercel.json` pointed at the existing Render API.
Cloudflare Pages instead uses the Pages Function and `BACKEND_URL` instructions
above.

For the original Node backend locally, run `npm install` and `npm start` from
`backend` after configuring its `.env` from `.env.example`. The Vite proxy now
targets the local Worker on port 8787; to use the local Express backend instead,
temporarily set the `/api` proxy target in `frontend/vite.config.js` to
`http://localhost:3000`.

## Features

Admins can delete any document; annotators can permanently delete documents
assigned to them. Deleting a document also deletes its annotations.

Admins can assign whole documents or specific newline-delimited row ranges to
annotator accounts. Row-range assignments let annotators highlight only rows
assigned to them; the API enforces the same row-level access. Admins can view
each annotator's assigned, completed, and annotated-document totals.
Annotators can view their own assigned, completed, remaining, and entity
totals in My progress, and can annotate using any available label. Only admins
can create or manage user accounts.

Import accepts text-based files and text typed or pasted into the import box.
Files larger than 4 MB upload in small chunks, so 100 MB text files do not
need to fit in a single API request. Export downloads the available documents
and annotations as a JSON file. After a file import finishes, the file picker
resets so the same file can be selected again.
