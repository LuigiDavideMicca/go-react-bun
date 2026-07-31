package api

import (
	"net/http"

	"github.com/LuigiDavideMicca/borgo"
	"github.com/LuigiDavideMicca/borgo/cmd/borgogen/testdata/app/helpers"
)

//borgo:route GET /api/health
func HealthCheck(w http.ResponseWriter, r *http.Request) {
	helpers.Audit("health")
	helpers.WriteHealth(w)
}

type FullHealth struct {
	helpers.Health
	Uptime int `json:"uptime"`
}

//borgo:route GET /api/health/full
func FullHealthCheck(w http.ResponseWriter, r *http.Request) {
	borgo.JSON(w, http.StatusOK, FullHealth{Uptime: 1})
}
