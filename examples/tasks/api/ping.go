package api

import (
	"net/http"

	"github.com/LuigiDavideMicca/borgo"
)

type Ping struct {
	Pong string `json:"pong"`
}

//borgo:route GET /api/ping
func PingHandler(w http.ResponseWriter, r *http.Request) {
	borgo.JSON(w, http.StatusOK, Ping{Pong: "v3"})
}
