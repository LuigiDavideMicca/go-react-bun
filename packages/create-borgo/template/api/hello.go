package api

import (
	"net/http"

	"github.com/LuigiDavideMicca/borgo"
)

func init() {
	borgo.Handle("GET /api/hello", hello)
	borgo.Handle("GET /api/hello/{name}", helloName)
}

func hello(w http.ResponseWriter, r *http.Request) {
	borgo.WriteJSON(w, http.StatusOK, map[string]string{"message": "hello from go"})
}

func helloName(w http.ResponseWriter, r *http.Request) {
	borgo.WriteJSON(w, http.StatusOK, map[string]string{"message": "hello, " + r.PathValue("name")})
}
