package main

import (
	"os"

	"github.com/LuigiDavideMicca/borgo"

	_ "{{name}}/api"
)

func main() {
	// this app has login, so it signs session cookies. a development-only
	// fallback keeps `bun run dev` working out of the box; in production set
	// a real one (openssl rand -base64 48) and never commit it
	if os.Getenv("SESSION_SECRET") == "" {
		os.Setenv("SESSION_SECRET", "{{name}}-development-secret-change-me-in-production")
	}
	borgo.Serve()
}
