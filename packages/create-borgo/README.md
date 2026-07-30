# create-borgo

Scaffolds a new [borgo](https://github.com/LuigiDavideMicca/borgo) app: file-based React pages server-rendered by Bun, API routes written in Go.

```bash
bunx create-borgo my-app
cd my-app
bun install
go mod tidy
bun run dev
```

Requires Bun >= 1.3 and Go >= 1.25. The scaffold ships pages, a Go `api/` package with `//borgo:route` handlers, pregenerated api types (so the typed client works before the first dev run), a multi-stage Dockerfile and a compose file — see the [repository README](https://github.com/LuigiDavideMicca/borgo) for the full picture.

---

Built by [Luigi Micca](https://luigimicca.com).
