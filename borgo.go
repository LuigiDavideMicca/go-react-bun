// Package borgo is the go side of the borgo framework: a route registry and
// a server bootstrap. API files register their handlers in init() via Handle,
// and main calls Serve. The core imposes no database and no dependencies.
package borgo

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"regexp"
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

// Serve mounts every registered route and listens on API_PORT (default 3501).
func Serve() {
	mux := http.NewServeMux()
	for pattern, handler := range routes {
		mux.HandleFunc(pattern, handler)
	}

	port := os.Getenv("API_PORT")
	if port == "" {
		port = "3501"
	}

	log.Println("borgo api listening on :" + port)
	log.Fatal(http.ListenAndServe(":"+port, mux))
}
