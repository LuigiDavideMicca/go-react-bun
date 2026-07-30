package api

import (
	"net/http"

	"github.com/LuigiDavideMicca/borgo"
)

// borgo:route GET /api/loose

func Loose(w http.ResponseWriter, r *http.Request) {
	borgo.JSON(w, http.StatusOK, "ok")
}
