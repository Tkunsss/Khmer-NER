# Khmer NER VPS Deployment Guide

This guide covers a fresh deployment on Ubuntu 24.04 and routine updates to an
existing deployment. It describes the self-hosted stack in this repository:

- Nginx serves the built React frontend and proxies `/api` to Express.
- Express runs as a systemd service bound to `127.0.0.1:3000`.
- MySQL stores users, assignments, annotations, and document text.
- HTTPS is provided by Let's Encrypt.

The commands below assume the Linux account is `ubuntu`, the project directory
is `/home/ubuntu/khmer-ner`, and the site directory is `/var/www/khmer-ner`.
If using different values, update `deploy/khmer-ner.service` and
`deploy/nginx/khmer-ner.conf` to match before installing them.

## Before starting

Have the following ready:

- An Ubuntu 24.04 VPS with a public IP and SSH access.
- A domain name (or DuckDNS hostname) with its DNS A record pointing to the VPS.
- The repository URL and the branch/commit approved for deployment.
- A way to generate and store unique database, JWT, and administrator
  passwords. Never commit secrets or send them in chat.

Use the API backend in `backend/` for this VPS setup. The Cloudflare Worker
deployment is a separate option and is not installed by these steps.

## A. Fresh installation

### 1. Connect and install system packages

From your computer, connect with SSH:

```powershell
ssh ubuntu@YOUR_SERVER_IP
```

In the SSH session:

```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y git nginx mysql-server certbot python3-certbot-nginx ufw
```

Install Node.js 18 or newer using the official Node.js instructions for Ubuntu.
The systemd service expects Node at `/usr/bin/node`; verify the installed
version and location:

```bash
node --version
command -v node
npm --version
```

If `command -v node` does not return `/usr/bin/node`, update
`ExecStart` in `deploy/khmer-ner.service` to the actual absolute path.

Allow only SSH and web traffic through the firewall. Keep MySQL private:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

Do not open port 3306 to the internet.

### 2. Create the database and application account

Open the MySQL console:

```bash
sudo mysql
```

Run the following SQL, replacing the password with a unique generated value.
Use a password that is easy to enter safely in SQL and the environment file;
do not reuse a personal or production password:

```sql
CREATE DATABASE khmer_ner CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'khmer_ner_app'@'localhost' IDENTIFIED BY 'REPLACE_WITH_DB_PASSWORD';
GRANT ALL PRIVILEGES ON khmer_ner.* TO 'khmer_ner_app'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

### 3. Clone the approved project version and build the frontend

Set `DEPLOY_BRANCH` to the branch approved by the project owner. Do not deploy
an unreviewed branch. If the repository is private, configure authorized Git
access on the VPS first; never put a personal access token in the clone URL.

```bash
DEPLOY_BRANCH=main
sudo -u ubuntu git clone --branch "$DEPLOY_BRANCH" --single-branch https://github.com/Tkunsss/Khmer-NER.git /home/ubuntu/khmer-ner
cd /home/ubuntu/khmer-ner
npm ci --prefix backend
npm ci --prefix frontend
npm run build --prefix frontend
```

Check that the build created `frontend/dist/index.html` before continuing.

### 4. Configure the API secrets

Create a root-owned environment file:

```bash
sudo install -o root -g ubuntu -m 640 /dev/null /etc/khmer-ner.env
sudo nano /etc/khmer-ner.env
```

Add these settings with the real database password and fresh secrets:

```ini
MYSQL_HOST=localhost
MYSQL_USER=khmer_ner_app
MYSQL_PASSWORD=REPLACE_WITH_DB_PASSWORD
MYSQL_DATABASE=khmer_ner
JWT_SECRET=REPLACE_WITH_A_LONG_RANDOM_SECRET
ADMIN_USER=admin
ADMIN_PASSWORD=REPLACE_WITH_A_UNIQUE_INITIAL_ADMIN_PASSWORD
```

`JWT_SECRET` should be long and unpredictable. Keep this file private and
verify its permissions without displaying its contents:

```bash
sudo chown root:ubuntu /etc/khmer-ner.env
sudo chmod 640 /etc/khmer-ner.env
sudo stat -c '%a %U:%G %n' /etc/khmer-ner.env
```

### 5. Install and start the API service

```bash
sudo cp /home/ubuntu/khmer-ner/deploy/khmer-ner.service /etc/systemd/system/khmer-ner.service
sudo systemctl daemon-reload
sudo systemctl enable --now khmer-ner
sudo systemctl status khmer-ner --no-pager
curl -fsS http://127.0.0.1:3000/health
```

On its first successful start, the API creates the required MySQL tables,
default labels, and initial admin account. Once you have confirmed the service
started and the account exists, remove the initial administrator password from
the environment file and restart the API:

```bash
sudo nano /etc/khmer-ner.env
sudo systemctl restart khmer-ner
```

Sign in with the initial admin account and change its password in the app.
Keep the database password and JWT secret in the environment file.

### 6. Obtain HTTPS and configure Nginx

First ensure the DNS A record points to this VPS and ports 80 and 443 are
reachable. Create a temporary HTTP-only Nginx site, replacing `YOUR_DOMAIN`
with the actual hostname:

```bash
sudo mkdir -p /var/www/html
sudo tee /etc/nginx/sites-available/khmer-ner-bootstrap >/dev/null <<'EOF'
server {
    listen 80;
    server_name YOUR_DOMAIN;
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }
    location / {
        return 200 "ready";
        add_header Content-Type text/plain;
    }
}
EOF
sudo ln -s /etc/nginx/sites-available/khmer-ner-bootstrap /etc/nginx/sites-enabled/khmer-ner-bootstrap
sudo nginx -t
sudo systemctl reload nginx
sudo certbot certonly --webroot -w /var/www/html -d YOUR_DOMAIN
```

Follow Certbot's prompts and provide a valid email address. Do not install the
repository's HTTPS Nginx config until the certificate files exist.

Install the project's Nginx config and change its hostname and certificate
paths if they differ from the example:

```bash
sudo cp /home/ubuntu/khmer-ner/deploy/nginx/khmer-ner.conf /etc/nginx/sites-available/khmer-ner
sudo nano /etc/nginx/sites-available/khmer-ner
```

Replace `khmer-ner-app.duckdns.org` with the deployed hostname everywhere in
that file. Enable the site and copy the frontend:

```bash
sudo mkdir -p /var/www/khmer-ner
sudo cp -a /home/ubuntu/khmer-ner/frontend/dist/. /var/www/khmer-ner/
sudo chmod -R a+rX /var/www/khmer-ner
sudo ln -s /etc/nginx/sites-available/khmer-ner /etc/nginx/sites-enabled/khmer-ner
sudo unlink /etc/nginx/sites-enabled/khmer-ner-bootstrap
```

If the default site is enabled and conflicts with this hostname, disable it:

```bash
sudo rm /etc/nginx/sites-enabled/default
```

Test and reload Nginx:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

Verify the app and API:

```bash
curl -I https://YOUR_DOMAIN/
curl -fsS https://YOUR_DOMAIN/health
sudo systemctl status khmer-ner --no-pager
```

The homepage should return HTTP 200 and `/health` should return `ok`. Then
sign in, create or verify users, and test a document, annotation, and saved row
progress.

## B. Backing up and restoring

A VPS provider snapshot is the quickest way to recover the whole machine.
Create a snapshot in the provider control panel before risky server changes.
Also keep an application backup somewhere other than the VPS; a backup left
only on the server will be lost if its disk is deleted.

The application backup below contains database records and text, project files,
the live frontend, environment secrets, TLS private keys, and service
configuration. Treat it as highly sensitive. Restrict access, encrypt it, and
store the encryption passphrase separately.

### 1. Create an encrypted backup on the VPS

Run these commands in the Ubuntu SSH session:

```bash
set -euo pipefail
BACKUP_DIR="$HOME/khmer-ner-backups"
STAMP=$(date +%Y%m%d_%H%M%S)
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

sudo mysqldump --single-transaction --routines --triggers --events --databases khmer_ner \
  | gzip > "$BACKUP_DIR/database-$STAMP.sql.gz"

sudo tar -czpf "$BACKUP_DIR/server-files-$STAMP.tar.gz" \
  /home/ubuntu/khmer-ner \
  /var/www/khmer-ner \
  /etc/khmer-ner.env \
  /etc/systemd/system/khmer-ner.service \
  /etc/nginx/sites-available/khmer-ner \
  /etc/nginx/sites-enabled/khmer-ner \
  /etc/letsencrypt

sudo chown ubuntu:ubuntu "$BACKUP_DIR/database-$STAMP.sql.gz" "$BACKUP_DIR/server-files-$STAMP.tar.gz"
chmod 600 "$BACKUP_DIR/database-$STAMP.sql.gz" "$BACKUP_DIR/server-files-$STAMP.tar.gz"
gzip -t "$BACKUP_DIR/database-$STAMP.sql.gz"
tar -tzf "$BACKUP_DIR/server-files-$STAMP.tar.gz" > /dev/null

tar -czf "$BACKUP_DIR/khmer-ner-backup-$STAMP.tar.gz" \
  -C "$BACKUP_DIR" \
  "database-$STAMP.sql.gz" \
  "server-files-$STAMP.tar.gz"
tar -tzf "$BACKUP_DIR/khmer-ner-backup-$STAMP.tar.gz" > /dev/null

gpg --symmetric --cipher-algo AES256 \
  --output "$BACKUP_DIR/khmer-ner-backup-$STAMP.tar.gz.gpg" \
  "$BACKUP_DIR/khmer-ner-backup-$STAMP.tar.gz"

gpg --decrypt "$BACKUP_DIR/khmer-ner-backup-$STAMP.tar.gz.gpg" > /dev/null
ls -lh "$BACKUP_DIR/khmer-ner-backup-$STAMP.tar.gz.gpg"
```

GPG asks for an encryption passphrase; do not put it in a command or send it
with the backup. If `gpg` is not installed, install it with
`sudo apt install gnupg` and repeat the encryption and verification commands.
Only proceed if the backup commands finish successfully and the final encrypted
file is non-empty.

### 2. Copy the backup off the VPS

From Windows PowerShell, replace the filename with the exact one shown by
`ls -lh` and save it somewhere private:

```powershell
scp "ubuntu@YOUR_SERVER_IP:~/khmer-ner-backups/khmer-ner-backup-TIMESTAMP.tar.gz.gpg" "$env:USERPROFILE\Documents\"
```

Keep the passphrase separate from the backup file. Do not upload the backup to
a public repository or share it in chat. After confirming the file is safely
stored off-server, remove temporary plaintext archives from the VPS:

```bash
rm "$BACKUP_DIR/khmer-ner-backup-$STAMP.tar.gz"
rm "$BACKUP_DIR/database-$STAMP.sql.gz" "$BACKUP_DIR/server-files-$STAMP.tar.gz"
```

Keep the encrypted backup on the VPS only if needed; it is still best to have
another copy off-server. Retain multiple dated backups rather than replacing
the only known-good copy.

### 3. Restore from an application backup

Restore onto a clean/recovered VPS with the same required packages installed.
From Windows PowerShell, copy the encrypted backup from your private backup
location to the VPS:

```powershell
scp "$env:USERPROFILE\Documents\khmer-ner-backup-TIMESTAMP.tar.gz.gpg" "ubuntu@YOUR_SERVER_IP:~/"
```

In the Ubuntu SSH session, decrypt it (GPG will ask for the passphrase) and
unpack the bundle:

```bash
gpg --output khmer-ner-backup.tar.gz --decrypt khmer-ner-backup-TIMESTAMP.tar.gz.gpg
mkdir khmer-ner-restore
tar -xzf khmer-ner-backup.tar.gz -C khmer-ner-restore
```

Stop the API before restoring its files or database:

```bash
sudo systemctl stop khmer-ner
```

Restore the server files and database dump. The MySQL app user and grants must
exist before restarting the API; create them as in the fresh-install steps if
this is a new VPS.

```bash
sudo tar -xzpf khmer-ner-restore/server-files-TIMESTAMP.tar.gz -C /
gzip -dc khmer-ner-restore/database-TIMESTAMP.sql.gz | sudo mysql
sudo chown root:ubuntu /etc/khmer-ner.env
sudo chmod 640 /etc/khmer-ner.env
sudo chmod -R a+rX /var/www/khmer-ner
sudo systemctl daemon-reload
sudo nginx -t
sudo systemctl start khmer-ner
sudo systemctl reload nginx
```

Use the actual timestamped filenames extracted into `khmer-ner-restore`.
Verify the API health check and HTTPS homepage, then test login, document
access, annotations, and saved progress. If restoring onto a new server, issue
a new TLS certificate for its configured hostname before enabling the
repository's HTTPS Nginx config.

## C. Updating an existing VPS deployment

Run these commands from the VPS account that owns `/home/ubuntu/khmer-ner`.
Coordinate a maintenance window if users may be annotating during the update.

### 1. Check the current deployment and back up data

```bash
cd /home/ubuntu/khmer-ner
git status --short
git branch --show-current
```

Stop if there are uncommitted changes or if the checked-out branch is not the
one approved for release. Do not overwrite another teammate's server changes.

Create a database backup before pulling code:

```bash
sudo mysqldump --single-transaction khmer_ner | gzip > "$HOME/khmer_ner_$(date +%Y%m%d_%H%M%S).sql.gz"
```

Check that the backup exists and is non-empty:

```bash
ls -lh "$HOME"/khmer_ner_*.sql.gz
```

Keep the backup private and copy it to a separate secure location before
removing it from the VPS. Do not paste it into chat or commit it.

### 2. Fetch and install the approved version

Set `DEPLOY_BRANCH` to the approved branch:

```bash
DEPLOY_BRANCH=main
cd /home/ubuntu/khmer-ner
git fetch origin
if git show-ref --verify --quiet "refs/heads/$DEPLOY_BRANCH"; then
    git switch "$DEPLOY_BRANCH"
else
    git switch --track "origin/$DEPLOY_BRANCH"
fi
git pull --ff-only origin "$DEPLOY_BRANCH"
npm ci --prefix backend
npm ci --prefix frontend
npm run build --prefix frontend
```

The `--ff-only` option prevents Git from creating an unexpected merge commit.
If the pull fails or reports a conflict, stop and resolve it with the project
maintainer rather than forcing the update.

### 3. Deploy the build and restart services

```bash
sudo cp -a /home/ubuntu/khmer-ner/frontend/dist/. /var/www/khmer-ner/
sudo chmod -R a+rX /var/www/khmer-ner
sudo nginx -t
sudo systemctl reload nginx
sudo systemctl restart khmer-ner
```

Review service status and health:

```bash
sudo systemctl status khmer-ner --no-pager
curl -fsS http://127.0.0.1:3000/health
curl -I https://YOUR_DOMAIN/
sudo journalctl -u khmer-ner --since "10 minutes ago" --no-pager
```

Test login, document loading, annotation save, and row-progress restore in a
browser. If the service fails, inspect the journal and restore the previous
application version with the maintainer's help. Do not blindly restore the
database backup: a code rollback and database rollback are separate decisions,
and restoring the database can discard newer annotations.

## Troubleshooting

- **Homepage returns 403:** `sudo chmod -R a+rX /var/www/khmer-ner`, then check
  `sudo namei -l /var/www/khmer-ner/index.html` and the Nginx error log.
- **API is unavailable:** check `sudo systemctl status khmer-ner --no-pager`,
  `sudo journalctl -u khmer-ner --since "10 minutes ago" --no-pager`, and
  `curl -fsS http://127.0.0.1:3000/health`.
- **Nginx configuration fails:** run `sudo nginx -t` and verify the hostname's
  Let's Encrypt certificate paths exist.
- **Never share secrets in diagnostic output.** Do not run `cat
  /etc/khmer-ner.env` when collecting logs.
