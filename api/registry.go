package api

import (
	"encoding/json"
	"net/http"
)

// Every file in this package is an API route: it declares its handlers and
// models in init(), and main mounts whatever ended up in the registry.
var (
	Routes = map[string]http.HandlerFunc{}
	Models []any
)

func handle(pattern string, h http.HandlerFunc) {
	Routes[pattern] = h
}

func model(m any) {
	Models = append(Models, m)
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}
