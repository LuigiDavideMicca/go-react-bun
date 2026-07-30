package helpers

import (
	"net/http"

	"github.com/LuigiDavideMicca/borgo"
)

type Health struct {
	Status string `json:"status"`
	Detail string `json:"detail,omitempty"`
}

func WriteHealth(w http.ResponseWriter) {
	writeOK(w, Health{Status: "ok"})
}

func writeOK(w http.ResponseWriter, v Health) {
	borgo.JSON(w, http.StatusOK, v)
}

func Audit(name string) {}
