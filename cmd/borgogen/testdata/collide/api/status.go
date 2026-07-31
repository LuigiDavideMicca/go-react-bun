package api

import (
	"net/http"

	"github.com/LuigiDavideMicca/borgo"
	"github.com/LuigiDavideMicca/borgo/cmd/borgogen/testdata/collide/lib"
)

type Status struct {
	OK bool `json:"ok"`
}

//borgo:route GET /api/local
func Local(w http.ResponseWriter, r *http.Request) {
	borgo.JSON(w, http.StatusOK, Status{OK: true})
}

//borgo:route GET /api/remote
func Remote(w http.ResponseWriter, r *http.Request) {
	lib.WriteStatus(w)
}
