# Deploying the backend

Production is **https://algoritm.techinfo.uz**, served by nginx on a Timeweb VPS
that already runs eight other sites.

That shapes every decision here. The box has no Docker, around 600MB of free
RAM, and its own mongod and nginx that other projects depend on. So the API is
deployed the way everything else on it already is: a systemd unit running nvm's
node, behind the nginx that is already there, against the mongod that is
already there. Nothing on this box gets replaced to make room for it.

| | |
| --- | --- |
| Host | `qollanma-server` (94.241.173.19) |
| Port | `7779` — 4100 is taken by another app |
| Code | `/opt/ai-english-pet` |
| Secrets | `/etc/ai-english-pet.env`, mode 600 |
| Service | `pet-api.service` |
| Logs | `/var/log/pet-api.log` |
| Database | `ai_english_pet` on the VPS's existing mongod |

## First deploy

### 1. The database user

mongod has authentication on, so the API needs its own user. Run this **on the
server** — it prompts for the mongo admin password, generates a password for the
app, and writes the connection string straight into the env file without ever
printing it:

```bash
sudo ./deploy/pet-mongo-setup.sh
```

The user it creates is scoped to `readWrite` on `ai_english_pet` alone. It can
neither see nor touch the other databases on the box.

### 2. Secrets

```bash
sudo cp .env.prod.example /etc/ai-english-pet.env
sudo chmod 600 /etc/ai-english-pet.env
sudo nano /etc/ai-english-pet.env
```

`JWT_SECRET` and `ENCRYPTION_KEY` each want `openssl rand -hex 32`. The API
refuses to start if either is missing or too short, which is deliberate — a
missing secret should be a crash at boot, not a 500 three weeks later.

Note that systemd does not strip trailing comments from an EnvironmentFile.
`KEY=value # note` puts ` # note` inside the value.

### 3. The service

```bash
sudo cp deploy/pet-api.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now pet-api
sudo systemctl status pet-api
```

### 4. nginx

The site and its certificate already existed — nginx was proxying
`algoritm.techinfo.uz` to a port with nothing behind it. The config in this repo
keeps certbot's certificate lines exactly as certbot wrote them and replaces the
proxy block with one the SSE stream survives.

```bash
sudo cp deploy/nginx/algoritm.techinfo.uz.conf \
        /etc/nginx/sites-available/algoritm.techinfo.uz
sudo nginx -t && sudo systemctl reload nginx
```

`nginx -t` before every reload. Seven other sites share this nginx, and a reload
with a broken config takes all of them down, not just this one.

## Shipping a new version

From your own machine:

```bash
./deploy/release.sh
```

It builds here, ships the compiled tree with rsync, restarts the service and
checks `/api/v1/health`. The build runs locally on purpose: the server has
roughly 600MB free and tsc is the heaviest thing in this project.

`pnpm deploy` bakes `@pet/shared` into `node_modules` as compiled JS, so the
server needs neither pnpm nor the workspace — only node. Nothing in the
production dependency set is native, so a tree built on macOS runs unchanged on
Linux.

## Checking it

```bash
curl https://algoritm.techinfo.uz/api/v1/health
# {"ok":true,"devAuth":false,"ts":"..."}
```

`"devAuth":false` is the line to read. Passwordless dev sign-in is disabled
whenever `NODE_ENV=production`; if it ever says `true` here, the service is not
running with the environment you think it is.

```bash
ssh qollanma-server 'systemctl status pet-api; tail -50 /var/log/pet-api.log'
```

### If the chat streams nothing

The tutor replies over SSE. If a reply arrives all at once at the end, or the
pet just sits there, the proxy is buffering — check that `proxy_buffering off`,
`gzip off` and the empty `Connection ""` header survived in the deployed nginx
config. The application is almost never the problem here.

## Pointing the extension at production

The extension is built against one API host, and that host goes into both the
fetch calls and the manifest's `host_permissions`.

```bash
cd apps/extension
echo 'VITE_API_BASE=https://algoritm.techinfo.uz/api/v1' > .env
pnpm build

grep -o '"host_permissions":\[[^]]*\]' .output/chrome-mv3/manifest.json
# "host_permissions":["https://algoritm.techinfo.uz/*"]
```

If that still says `localhost`, the build did not see your `.env`, and the
service worker will fail every request with a permissions error that looks
nothing like a permissions error.

## Sign-in in production

Dev auth does not exist in production, so `GOOGLE_CLIENT_ID` and
`GOOGLE_CLIENT_SECRET` must be set or nobody can sign in at all. Create an OAuth
client in Google Cloud Console and add `https://<extension-id>.chromiumapp.org/`
as an authorised redirect URI. The extension ID is stable once the extension is
published to the Web Store.

## Backups

```bash
ssh qollanma-server 'mongodump --uri "$MONGODB_URI" --archive' > backup-$(date +%F).archive
```

Restore with `mongorestore --archive < backup-2026-08-27.archive`.

## Known issue on this box, not caused by this project

mongod listens on `0.0.0.0:27017` and ufw is inactive, so the database port is
reachable from the internet. Authentication is on, so this is not an open door,
but it is a lock with no wall around it. Binding mongod to `127.0.0.1` would fix
it — every app on this box connects over localhost — but it restarts a database
several other projects depend on, so it is a decision for whoever owns them,
not a side effect of deploying this.

## What is deliberately not here

No CI deploy, no zero-downtime rollout, no metrics. For one VPS serving an
extension that has not launched, those cost more attention than they return.
