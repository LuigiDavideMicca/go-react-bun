package api

import (
	"net/http"

	"github.com/LuigiDavideMicca/borgo"
)

type OK struct {
	OK bool `json:"ok"`
}

//borgo:route GET /api/ok
func Ping(w http.ResponseWriter, r *http.Request) {
	borgo.PushT("bad/topic", "e", OK{})
	borgo.JSON(w, http.StatusOK, OK{})
}
