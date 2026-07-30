# Deploying borgo

A borgo app in production is two processes: the Go API binary and the Bun front server. `borgo start` runs both and exits if either dies, so one supervisor — Docker, systemd, compose — supervises the pair.

## Docker, one container (recommended)

Every scaffolded app ships a multi-stage `Dockerfile` and a `docker-compose.yml` (missing one? `borgo deploy init compose` writes it):

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

Only the front server needs to be reachable — it proxies `/api/*` to Go and speaks WebSockets natively. Compression is built-in — static assets are precompressed to `.gz`/`.br` at build time, dynamic responses are gzipped on the fly — so the proxy should not compress again (no `encode` directive in Caddy, `gzip off` is nginx's default). `borgo deploy init caddy` (or `nginx`) writes these configs into your project, templated with your app's name and port. Caddy gives you TLS in three lines:

```caddy
example.com {
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

Behind https, set `SESSION_SECURE=1` so session cookies carry the `Secure` attribute. Responses marked with `borgo.Cache` carry ordinary `Cache-Control` headers — see [Caching](#caching) below.

## Static export

`borgo export` prerenders every statically exportable page into `dist/site/`: plain HTML next to the built assets, precompressed siblings included. Pages without a loader export as-is; a page with a loader opts in with `export const prerender = true` (its loader runs once, at export time, against a temporary api process). Dynamic routes list their param sets:

```tsx
export const prerender = true;
export const prerenderPaths = async ({ api }: PrerenderContext) =>
  (await api("GET /api/tasks")).tasks.map((task) => ({ id: task.ID }));
```

Pages with `hydrate = false` export with zero JavaScript; hydrated pages carry their chunks and hydrate against the exported props (client-side navigation falls back to plain page loads — there is no server to ask for props). Everything else is skipped, with the reason printed.

Any static file server can host the result — for nginx the one-liner is `try_files`:

```nginx
server {
    listen 80;
    root /srv/my-app/dist/site;
    location / { try_files $uri $uri/index.html =404; }
}
```

An exported site is pages only: actions, SSE and WebSocket topics need the running borgo servers (`borgo start`).

## Caching

`borgo.Cache(w, 5*time.Minute)` sets `Cache-Control: public, max-age=300` (optional second argument adds `stale-while-revalidate`); `borgo.NoCache(w)` sets `no-store` for anything personalized. A reverse proxy in front turns these headers into actual caching — enable `proxy_cache` in nginx or `cache` in Caddy plugins if you want the proxy to serve them.

## systemd, no Docker

Build on the server (`bun install && bun run build`), then drop in a unit — `borgo deploy init systemd` generates this file as `borgo.service` with your app's name and ports:

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

## Health and metrics

Point the load balancer or uptime monitor at the front server's `/healthz` — it returns `{status, uptime, api}`, probing the Go server's own `/healthz` (mounted by `borgo.Serve`) with a short timeout. Set `METRICS=1` and the front server also serves `/metrics` in Prometheus text format: request counts and a duration histogram by route pattern and status, plus process uptime.

## Environment reference

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `3000` | front server port |
| `API_PORT` | `3501` | go api port |
| `API_URL` | `http://localhost:$API_PORT` | where the front server reaches the api (split deployments) |
| `FRONT_URL` | `http://localhost:$PORT` | where `borgo.Push` reaches the front server |
| `BORGO_PUSH_KEY` | unset | shared secret for `borgo.Push` across hosts (loopback needs none) |
| `SESSION_SECRET` | unset | HMAC key for signed-cookie sessions (required to use them) |
| `SESSION_SECURE` | unset | `1` adds `Secure` to the session and csrf cookies |
| `BORGO_CSRF` | unset | `0` disables csrf checks on form actions, `1` forces them in dev |
| `METRICS` | unset | `1` exposes `/metrics` (Prometheus text) on the front server |
| `NO_COLOR` | unset | disable ANSI colors in logs |
