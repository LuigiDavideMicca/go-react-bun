//go:build plan9

package api

import (
	"net/http"

	"github.com/LuigiDavideMicca/borgo"
)

//borgo:route GET /api/plan9
func Plan9Only(w http.ResponseWriter, r *http.Request) {
	borgo.JSON(w, http.StatusOK, OK{})
}
