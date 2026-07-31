package api

import (
	"net/http"

	bg "github.com/LuigiDavideMicca/borgo"
)

// The app happens to declare its own borgo, which the generated mounting must
// not collide with.
type borgo struct{ N int }

var _ = borgo{}

type OK struct {
	OK bool `json:"ok"`
}

//borgo:route GET /api/ping
func Ping(w http.ResponseWriter, r *http.Request) {
	bg.JSON(w, http.StatusOK, OK{true})
}
