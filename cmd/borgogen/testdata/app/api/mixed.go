package api

import (
	"net/http"

	"github.com/LuigiDavideMicca/borgo"
)

//borgo:route GET /api/mixed
func MixedResponse(w http.ResponseWriter, r *http.Request) {
	if r.URL.Query().Get("full") == "1" {
		borgo.JSON(w, http.StatusOK, Widget{})
		return
	}
	borgo.JSON(w, http.StatusAccepted, Deleted{OK: false})
}
