package api

import (
	"net/http"

	"github.com/LuigiDavideMicca/borgo"
)

type Pong struct {
	OK bool `json:"ok"`
}

//borgo:route GET /api/ping
func Ping(w http.ResponseWriter, r *http.Request) {
	borgo.JSON(w, http.StatusOK, Pong{OK: true})
}
