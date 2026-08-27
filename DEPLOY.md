# Deploying the backend

The target is a single VPS: Mongo and the API in Docker, nginx on the host in
front of them terminating TLS for **algoritm.techinfo.uz**.

Neither container is exposed. Mongo publishes no port at all, and the API binds
to `127.0.0.1:4100`, so nginx on the same machine is the only thing that can
reach it.

## Before you start

- A VPS with Docker and the Compose plugin (`docker compose version` must work),
  plus nginx and certbot.
- DNS: an A record for `algoritm.techinfo.uz` pointing at the VPS. (Already done.)
- Ports 80 and 443 open. Port 27017 must stay closed.

```bash
sudo apt update && sudo apt install -y nginx certbot python3-certbot-nginx
```

## 1. Start the stack

```bash
git clone https://github.com/azamjonbro/MyPet.git
cd MyPet

cp .env.prod.example .env.prod
```

Fill in `.env.prod`. Four values are required and the stack will not start
without them:

```bash
openssl rand -hex 24   # MONGO_PASSWORD
openssl rand -hex 32   # JWT_SECRET
openssl rand -hex 32   # ENCRYPTION_KEY
```

`API_DOMAIN` is already set to `algoritm.techinfo.uz`. Then:

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build
```

The first build takes a few minutes — it installs the workspace, compiles
`@pet/shared` and the backend, then uses `pnpm deploy` to assemble a production
tree with no dev dependencies in it.

Check it locally before involving nginx at all:

```bash
curl http://127.0.0.1:4100/api/v1/health
# {"ok":true,"devAuth":false,"ts":"..."}
```

`"devAuth":false` is the line to read. Passwordless dev sign-in is disabled
whenever `NODE_ENV=production`; if this ever says `true`, the container was
started wrong.

## 2. Get the certificate

The nginx config in this repo references certificate files, so nginx will refuse
to start if you enable it before the certificate exists. Bootstrap over plain
HTTP first:

```bash
sudo mkdir -p /var/www/certbot

sudo tee /etc/nginx/sites-available/pet-bootstrap.conf >/dev/null <<'EOF'
server {
    listen 80;
    server_name algoritm.techinfo.uz;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 404; }
}
EOF

sudo ln -sf /etc/nginx/sites-available/pet-bootstrap.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

sudo certbot certonly --webroot -w /var/www/certbot -d algoritm.techinfo.uz
```

## 3. Enable the real config

```bash
sudo rm /etc/nginx/sites-enabled/pet-bootstrap.conf

sudo cp deploy/nginx/algoritm.techinfo.uz.conf /etc/nginx/sites-available/
sudo ln -sf /etc/nginx/sites-available/algoritm.techinfo.uz.conf \
            /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

If Ubuntu's stock `default` site is still enabled it may answer for this
hostname first — `sudo rm /etc/nginx/sites-enabled/default` if so.

```bash
curl https://algoritm.techinfo.uz/api/v1/health
```

Certbot installs its own renewal timer. Confirm it with
`sudo certbot renew --dry-run`.

### If the chat streams nothing

The tutor replies over SSE. If a reply arrives all at once at the end, or not at
all, the proxy is buffering — check that `proxy_buffering off`, `gzip off` and
the empty `Connection ""` header survived in the deployed config. The app is
almost never the problem here.

## 4. Point the extension at it

The extension is built against one API host, and that host is written into both
the fetch calls and the manifest's `host_permissions`. On your own machine:

```bash
cd apps/extension
echo 'VITE_API_BASE=https://algoritm.techinfo.uz/api/v1' > .env
pnpm build
```

Confirm the manifest agrees before shipping it:

```bash
grep -o '"host_permissions":\[[^]]*\]' .output/chrome-mv3/manifest.json
# "host_permissions":["https://algoritm.techinfo.uz/*"]
```

If that still says `localhost`, the build did not see your `.env` and the
service worker will fail every request with a permissions error.

## Sign-in in production

Dev auth does not exist in production, so `GOOGLE_CLIENT_ID` and
`GOOGLE_CLIENT_SECRET` must be set or nobody can sign in. Create an OAuth client
in Google Cloud Console and add the extension's redirect URL
(`https://<extension-id>.chromiumapp.org/`) as an authorised redirect URI — the
extension ID is stable once the extension is published to the Web Store.

## Updating

```bash
git pull
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build
```

Compose replaces the `api` container and leaves Mongo alone. nginx is untouched.
There is a short gap while the new container starts.

```bash
docker compose -f docker-compose.prod.yml logs -f api
docker compose -f docker-compose.prod.yml ps      # both should be healthy
```

## Backups

The database lives in the `mongo-data` volume, which survives
`docker compose down`. It does **not** survive `down -v` — that flag deletes the
volume and every account with it.

```bash
docker compose -f docker-compose.prod.yml exec mongo \
  mongodump --username "$MONGO_USER" --password "$MONGO_PASSWORD" \
  --authenticationDatabase admin --archive > backup-$(date +%F).archive
```

Restore with `mongorestore --archive < backup-2026-08-27.archive`.

## What is deliberately not here

No CI deploy, no zero-downtime rollout, no log shipping, no metrics. For one VPS
serving an extension that is not launched yet, those cost more attention than
they return. Add them when the traffic justifies it.
