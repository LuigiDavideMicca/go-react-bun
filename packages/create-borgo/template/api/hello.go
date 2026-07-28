package api

import (
	"net/http"

	"github.com/LuigiDavideMicca/borgo"
)

type Greeting struct {
	Message string `json:"message"`
}

func init() {
	borgo.Handle("GET /api/hello", hello)
	borgo.Handle("GET /api/hello/{name}", helloName)
}

func hello(w http.ResponseWriter, r *http.Request) {
	borgo.JSON(w, http.StatusOK, Greeting{Message: "hello from go"})
}

func helloName(w http.ResponseWriter, r *http.Request) {
	borgo.JSON(w, http.StatusOK, Greeting{Message: "hello, " + r.PathValue("name")})
}
