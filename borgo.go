// Package borgo is the go side of the borgo framework: a route registry and
// a server bootstrap. API files register their handlers in init() via Handle,
// and main calls Serve. The core imposes no database and no dependencies.
package borgo

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"regexp"
	"sort"
	"strings"
	"time"
)

var (
	routes    = map[string]http.HandlerFunc{}
	patternRe = regexp.MustCompile(`^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS) /\S*$`)
)

// Handle registers a handler under a net/http method pattern,
// e.g. "GET /api/tasks" or "GET /api/tasks/{id}".
func Handle(pattern string, h http.HandlerFunc) {
	if !patternRe.MatchString(pattern) {
		panic(`borgo.Handle: pattern must be "METHOD /path", e.g. "GET /api/tasks" or "GET /api/tasks/{id}"; got "` + pattern + `"`)
	}
	if _, dup := routes[pattern]; dup {
		panic(`borgo.Handle: pattern "` + pattern + `" registered twice; each route file must use a unique method + path`)
	}
	if h == nil {
		panic(`borgo.Handle: nil handler for pattern "` + pattern + `"`)
	}
	routes[pattern] = h
}

// WriteJSON writes v as a JSON response with the given status code.
func WriteJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

// JSON writes v as a JSON response with the given status code. Unlike
// WriteJSON its type parameter is visible to static analysis: borgogen reads
// T from every JSON call in a handler to type the route for TypeScript.
func JSON[T any](w http.ResponseWriter, status int, v T) {
	WriteJSON(w, status, v)
}

// bindLimit caps request bodies decoded by Bind at 1 MB, so a handler that
// expects a small JSON payload cannot be fed gigabytes.
const bindLimit = 1 << 20

// Bind decodes the request body as JSON into T, reading at most 1 MB - use
// BindMax for routes that legitimately take more. Its type parameter is
// visible to static analysis: borgogen reads T to type the route's request
// body for the TypeScript api client. On error, respond with BindError to
// get the right status (413 for an oversized body).
func Bind[T any](r *http.Request) (T, error) {
	return BindMax[T](r, bindLimit)
}

// BindMax is Bind with an explicit body size limit in bytes; limit <= 0
// disables the cap.
func BindMax[T any](r *http.Request, limit int64) (T, error) {
	var v T
	body := r.Body
	if limit > 0 {
		body = http.MaxBytesReader(nil, r.Body, limit)
	}
	err := json.NewDecoder(body).Decode(&v)
	return v, err
}

// BindError answers a Bind error: 413 when the body exceeded the limit,
// 400 for anything else, as JSON.
func BindError(w http.ResponseWriter, err error) {
	status := http.StatusBadRequest
	var tooLarge *http.MaxBytesError
	if errors.As(err, &tooLarge) {
		status = http.StatusRequestEntityTooLarge
	}
	WriteJSON(w, status, map[string]string{"error": err.Error()})
}

var startTime = time.Now()

// healthz answers the api's own liveness probe; the front server's /healthz
// aggregates it into the app-level view.
func healthz(w http.ResponseWriter, r *http.Request) {
	WriteJSON(w, http.StatusOK, map[string]any{
		"status": "ok",
		"uptime": time.Since(startTime).Seconds(),
	})
}

// envDuration reads a timeout override, e.g. BORGO_READ_HEADER_TIMEOUT=10s;
// "0" disables the timeout.
func envDuration(name string, def time.Duration) time.Duration {
	v := os.Getenv(name)
	if v == "" {
		return def
	}
	d, err := time.ParseDuration(v)
	if err != nil || d < 0 {
		panic(`borgo: ` + name + `: invalid duration "` + v + `" (want e.g. "5s"; "0" disables)`)
	}
	return d
}

// newServer configures the http server borgo.Serve runs. ReadHeaderTimeout
// caps slow-header (slowloris) clients; IdleTimeout reclaims kept-alive
// connections. Read and write timeouts stay 0 by design: they are wall-clock
// deadlines on the whole request, which would kill SSE streams and any
// long-lived response - body abuse is capped by Bind's 1 MB reader instead,
// and borgo.SSE clears the deadlines on its own connection in case an app
// sets BORGO_READ_TIMEOUT / BORGO_WRITE_TIMEOUT anyway.
func newServer(port string, handler http.Handler) *http.Server {
	return &http.Server{
		Addr:              ":" + port,
		Handler:           handler,
		ReadHeaderTimeout: envDuration("BORGO_READ_HEADER_TIMEOUT", 5*time.Second),
		ReadTimeout:       envDuration("BORGO_READ_TIMEOUT", 0),
		WriteTimeout:      envDuration("BORGO_WRITE_TIMEOUT", 0),
		IdleTimeout:       envDuration("BORGO_IDLE_TIMEOUT", 2*time.Minute),
	}
}

// Serve mounts every registered route and listens on API_PORT (default 3501).
// It also answers GET /healthz, unless a registered route claims it.
func Serve() {
	mux := http.NewServeMux()
	patterns := make([]string, 0, len(routes))
	for pattern, handler := range routes {
		mux.HandleFunc(pattern, handler)
		patterns = append(patterns, pattern)
	}
	if _, taken := routes["GET /healthz"]; !taken {
		mux.HandleFunc("GET /healthz", healthz)
	}
	sort.Slice(patterns, func(i, j int) bool {
		a, b := strings.SplitN(patterns[i], " ", 2), strings.SplitN(patterns[j], " ", 2)
		if a[1] != b[1] {
			return a[1] < b[1]
		}
		return a[0] < b[0]
	})

	port := os.Getenv("API_PORT")
	if port == "" {
		port = "3501"
	}

	printStartup(patterns, port)
	log.Fatal(newServer(port, gzipMiddleware(mux)).ListenAndServe())
}

func colorEnabled() bool {
	if os.Getenv("NO_COLOR") != "" {
		return false
	}
	fi, err := os.Stdout.Stat()
	return err == nil && fi.Mode()&os.ModeCharDevice != 0
}

func printStartup(patterns []string, port string) {
	var dim, sage, terra, reset string
	if colorEnabled() {
		dim, sage, terra, reset = "\x1b[2m", "\x1b[38;5;108m", "\x1b[38;5;173m", "\x1b[0m"
	}
	home, ok, dot := "⌂", "✓", "·"
	if !consoleUnicode() {
		home, ok, dot = "^", "+", "-"
	}
	if os.Getenv("BORGO_RELOAD") != "" {
		fmt.Printf("  %s%s%s api restarted on :%s\n", sage, ok, reset, port)
		return
	}
	fmt.Printf("\n  %s%s%s api %s%s :%s%s\n", terra, home, reset, dim, dot, port, reset)
	for _, p := range patterns {
		parts := strings.SplitN(p, " ", 2)
		fmt.Printf("  %s%-7s%s %s\n", sage, parts[0], reset, parts[1])
	}
}
