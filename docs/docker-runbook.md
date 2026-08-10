# Docker Runbook

This document explains how to start the full Heartbeat app with Docker on a Raspberry Pi.

It covers:

- pulling the prebuilt app image
- starting the full stack
- initializing the database
- checking logs and status
- stopping and restarting the app

## Files Required On The Pi

Run these commands from the project folder that contains:

- `docker-compose.production.yml`
- `.env`
- `docker/postgres/init/01-enable-extensions.sql`

Example folder:

```bash
~/Documents/GitHub/heartbeat
```

## First-Time Setup

If Docker is not installed yet:

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker
```

If Docker still requires `sudo`, either keep using `sudo docker ...` or log out and back in once.

## Environment File

Create `.env` in the project folder:

```bash
cp .env.example .env
```

Set the values you need:

```bash
IMAGE_NAME=ghcr.io/<owner>/<repo>
IMAGE_TAG=latest
DOCKER_CONFIG_PATH=/home/support/.docker
POSTGRES_DB=heartbeat
POSTGRES_USER=heartbeat
POSTGRES_PASSWORD=strong-password-here
OLLAMA_BASE_URL=http://<PI-IP>:11434
```

Notes:

- `IMAGE_NAME` and `IMAGE_TAG` tell Docker which prebuilt app image to pull.
- `DOCKER_CONFIG_PATH` must point to the Pi user's `.docker` directory so
  Watchtower can authenticate to GHCR. Change `/home/support` if the Pi uses a
  different account.
- `OLLAMA_BASE_URL` should point to the Pi host if Ollama is running there.
- If you use Codex CLI in Docker, run `codex login` inside the worker container so the worker and CLI share the same runtime.

## Start The Full App

From the project folder:

```bash
docker compose -f docker-compose.production.yml pull
docker compose -f docker-compose.production.yml up -d
```

If your user does not have Docker permissions yet:

```bash
sudo docker compose -f docker-compose.production.yml pull
sudo docker compose -f docker-compose.production.yml up -d
```

## Initialize The Database

Run this once after first startup, and again if the schema changes:

```bash
docker compose -f docker-compose.production.yml exec web pnpm db:push
```

With `sudo` if needed:

```bash
sudo docker compose -f docker-compose.production.yml exec web pnpm db:push
```

## Check Status

See running containers:

```bash
docker compose -f docker-compose.production.yml ps
```

View app logs:

```bash
docker compose -f docker-compose.production.yml logs -f web
```

View worker logs:

```bash
docker compose -f docker-compose.production.yml logs -f worker
```

If Docker requires `sudo`, add it to the front of the commands above.

## Stop, Start, Restart

Stop the stack:

```bash
docker compose -f docker-compose.production.yml down
```

Start it again:

```bash
docker compose -f docker-compose.production.yml up -d
```

Restart only the web app:

```bash
docker compose -f docker-compose.production.yml restart web
```

## Update To A New Image

When you push a new image from Docker Desktop:

```bash
docker compose -f docker-compose.production.yml pull
docker compose -f docker-compose.production.yml up -d
```

If the update includes database changes:

```bash
docker compose -f docker-compose.production.yml exec web pnpm db:push
```

## Automatic Updates From GitHub

This repo now includes [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml).
On every push to `main` it:

1. builds the Docker image for `linux/arm64`
2. publishes `latest` and a commit-specific tag to GitHub Container Registry
   (`ghcr.io`)
3. leaves deployment to Watchtower on the Pi

Watchtower checks GHCR every five minutes. When `latest` changes, it pulls the
new image, restarts the labelled `web` and `worker` services, and removes the
old image. PostgreSQL and Redis are not replaced.

The wallboard performs a production-only full-page reload every ten minutes,
unless Settings is open. This ensures an unattended Chromium kiosk loads the
new frontend bundle after Watchtower replaces the web container. Data still
refreshes more frequently through the normal wallboard refresh cycle.

The expected maximum rollout time is therefore about 15 minutes: up to five
minutes for Watchtower plus up to ten minutes for the kiosk reload.

### One-Time Pi Setup

Log into GHCR once on the Pi so `docker compose pull` can read private images:

```bash
docker login ghcr.io
```

Use a GitHub personal access token with package read access when prompted.

Set the image in `.env` on the Pi to your GitHub Container Registry path:

```bash
IMAGE_NAME=ghcr.io/<owner>/<repo>
IMAGE_TAG=latest
DOCKER_CONFIG_PATH=/home/<pi-user>/.docker
```

Example:

```bash
IMAGE_NAME=ghcr.io/mathiasrscom/heartbeat
IMAGE_TAG=latest
```

Make sure the Pi is using the current production Compose file, then start the
complete stack once so Watchtower is running:

```bash
git pull origin main
docker compose -f docker-compose.production.yml up -d
docker compose -f docker-compose.production.yml ps
```

Healthy output includes `heartbeat-watchtower`. After this one-time setup, any
push to `main` publishes and rolls out automatically.

Database migrations are not currently automatic. If a release changes the
schema, run:

```bash
docker compose -f docker-compose.production.yml exec web pnpm db:push
```

## Sync Freshness Guarantees

The worker runs immediately after startup and then waits for the configured
sync interval (five minutes by default). Incremental Intercom searches replay a
five-minute overlap, so updates near a sync boundary are safe to process more
than once. Database upserts keep that replay idempotent.

`last_sync_at` means the last fully successful sync. A partial failure records
the error but does not advance that timestamp, so the wallboard becomes stale
after the configured threshold instead of presenting partial data as fresh.
Contacts are searched independently from cases, ensuring contact-level NPS
changes arrive even when the customer's case has not changed.

NPS history starts with a one-time baseline of every synced Intercom contact.
That baseline is not counted as a dated response because Intercom's Contacts
API exposes only the latest mutable score, not the original survey date. After
the baseline, each changed score is appended to `nps_responses` using the
contact's Intercom `updated_at` time; a late comment amends the latest response
instead of creating a duplicate. Pulse period filters read this append-only
table, so the history survives later contact syncs and restarts.

The new history tables must exist before starting a release that contains this
capture logic:

```bash
docker compose -f docker-compose.production.yml exec web pnpm db:push
docker compose -f docker-compose.production.yml restart web worker
```

After `pnpm db:push`, the schema enforces one row per `(source, external_id)`
for cases, contacts, and teammates. Historical rows remain available for trend
reporting; hard-deleted Intercom records are not currently removed
automatically.

## Common Problems

### Wrong compose filename

Use:

```bash
docker-compose.production.yml
```

Not:

```bash
docker.compose.production.yml
```

### Docker permission denied

If you see:

```bash
permission denied while trying to connect to the docker API socket
```

run with `sudo`, or add your user to the `docker` group:

```bash
sudo usermod -aG docker $USER
newgrp docker
```

### Memory limit warning

If you see:

```bash
Your kernel does not support memory limit capabilities or the cgroup is not mounted.
```

that is a warning, not a startup failure. The app can still run. It means Docker cannot enforce the memory limits declared in the compose file on that Pi/kernel setup.

### Confirm everything is running

Healthy output should show these containers:

- `heartbeat-postgres`
- `heartbeat-redis`
- `heartbeat-web`
- `heartbeat-worker`
- `heartbeat-watchtower`

Check with:

```bash
docker compose -f docker-compose.production.yml ps
```
