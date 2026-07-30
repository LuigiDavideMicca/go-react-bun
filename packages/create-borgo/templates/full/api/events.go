package api

import (
	"net/http"

	"github.com/LuigiDavideMicca/borgo"
)

var events = borgo.NewSSEHub()

//borgo:route GET /api/events
func Events(w http.ResponseWriter, r *http.Request) {
	events.ServeHTTP(w, r)
}
