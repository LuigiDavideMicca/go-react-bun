// Package borgo is the go side of the borgo framework: a route registry and
// a server bootstrap. API files register their handlers in init() via Handle,
// and main calls Serve. The core imposes no database and no dependencies.
package borgo

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
)

var routes = map[string]http.HandlerFunc{}

// Handle registers a handler under a net/http method pattern,
// e.g. "GET /api/tasks" or "GET /api/tasks/{id}".
func Handle(pattern string, h http.HandlerFunc) {
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
