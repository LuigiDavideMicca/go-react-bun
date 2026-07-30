package api

import (
	"net/http"
	"time"

	"github.com/LuigiDavideMicca/borgo"
)

var events = borgo.NewSSEHub()

//borgo:route GET /api/events
func Events(w http.ResponseWriter, r *http.Request) {
	events.ServeHTTP(w, r)
}

// a heartbeat from go: every second, every connected browser gets a tick
func init() {
	start := time.Now()
	go func() {
		for range time.Tick(time.Second) {
			events.Publish("tick", time.Since(start).Truncate(time.Second).String())
		}
	}()
}
