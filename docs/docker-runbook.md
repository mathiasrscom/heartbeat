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
IMAGE_NAME=<dockerhub-user>/heartbeat
IMAGE_TAG=pi
POSTGRES_DB=heartbeat
POSTGRES_USER=heartbeat
POSTGRES_PASSWORD=strong-password-here
OLLAMA_BASE_URL=http://<PI-IP>:11434
```

Notes:

- `IMAGE_NAME` and `IMAGE_TAG` tell Docker which prebuilt app image to pull.
- `OLLAMA_BASE_URL` should point to the Pi host if Ollama is running there.

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

Check with:

```bash
docker compose -f docker-compose.production.yml ps
```
