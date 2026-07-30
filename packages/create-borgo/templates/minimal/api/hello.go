package api

import (
	"net/http"

	"github.com/LuigiDavideMicca/borgo"
)

type Greeting struct {
	Message string `json:"message"`
}

//borgo:route GET /api/hello
func Hello(w http.ResponseWriter, r *http.Request) {
	borgo.JSON(w, http.StatusOK, Greeting{Message: "hello from go"})
}
