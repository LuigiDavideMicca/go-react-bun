package api

import (
	"net/http"

	"github.com/LuigiDavideMicca/borgo/cmd/borgogen/testdata/app/helpers"
)

//borgo:route GET /api/health
func HealthCheck(w http.ResponseWriter, r *http.Request) {
	helpers.Audit("health")
	helpers.WriteHealth(w)
}
