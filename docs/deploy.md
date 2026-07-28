# Deploying borgo

A borgo app in production is two processes: the Go API binary and the Bun front server. `borgo start` runs both and exits if either dies, so one supervisor — Docker, systemd, compose — supervises the pair.

## Docker, one container (recommended)

Every scaffolded app ships a multi-stage `Dockerfile` and a `docker-compose.yml`:

```bash
docker compose up -d
```

The builder image compiles the Go binary (static, `CGO_ENABLED=0`) and the client assets; the runtime image is `oven/bun:slim` with the app sources the SSR server needs, production `node_modules`, and `dist/`. The compose file mounts a named volume at `/data` — point `DB_PATH` (or your own database path) there so SQLite survives redeploys.

Set real values before going live:

```yaml
environment:
  SESSION_SECRET: <long random string>   # required if you use sessions
  DB_PATH: /data/app.db
```

## Docker, two services

Prefer separate containers? Run the API alone and the front server with `--front-only`, pointing `API_URL` at the api service:

```yaml
services:
  api:
    build: .
    command: ["./dist/api"]
    environment:
      API_PORT: "3501"
    volumes:
      - data:/data
    restart: unless-stopped

  front:
    build: .
    command: ["bun", "x", "borgo", "start", "--front-only"]
    environment:
      API_URL: http://api:3501
    ports:
      - "3000:3000"
    depends_on:
      - api
    restart: unless-stopped

volumes:
  data:
```

`borgo.Push` needs the reverse direction across containers: set `FRONT_URL=http://front:3000` on the api service and the same `BORGO_PUSH_KEY` on both.

## Reverse proxy

Only the front server needs to be reachable — it proxies `/api/*` to Go and speaks WebSockets natively. Caddy gives you TLS in four lines:

```caddy
example.com {
    encode gzip
    reverse_proxy localhost:3000
}
```

nginx needs the upgrade headers for WebSockets and SSE left unbuffered:

```nginx
server {
    listen 443 ssl;
    server_name example.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_buffering off;
        proxy_read_timeout 1h;
    }
}
```

Behind https, set `SESSION_SECURE=1` so session cookies carry the `Secure` attribute. Responses marked with `borgo.Cache` carry ordinary `Cache-Control` headers — enable proxy caching (`proxy_cache` in nginx, `cache` in Caddy plugins) if you want the proxy to serve them.

## systemd, no Docker

Build on the server (`bun install && bun run build`), then:

```ini
[Unit]
Description=my borgo app
After=network.target

[Service]
WorkingDirectory=/srv/my-app
ExecStart=/usr/local/bin/bun run start
Environment=NODE_ENV=production
Environment=SESSION_SECRET=change-me
Restart=on-failure
User=www-data

[Install]
WantedBy=multi-user.target
```

`borgo start` exits when the Go process dies, and `Restart=on-failure` brings both back.

## Environment reference

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `3000` | front server port |
| `API_PORT` | `3501` | go api port |
| `API_URL` | `http://localhost:$API_PORT` | where the front server reaches the api (split deployments) |
| `FRONT_URL` | `http://localhost:$PORT` | where `borgo.Push` reaches the front server |
| `BORGO_PUSH_KEY` | unset | shared secret for `borgo.Push` across hosts (loopback needs none) |
| `SESSION_SECRET` | unset | HMAC key for signed-cookie sessions (required to use them) |
| `SESSION_SECURE` | unset | `1` adds `Secure` to the session cookie |
| `NO_COLOR` | unset | disable ANSI colors in logs |
