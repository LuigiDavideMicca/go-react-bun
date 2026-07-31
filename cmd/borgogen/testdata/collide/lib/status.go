package lib

import (
	"net/http"

	"github.com/LuigiDavideMicca/borgo"
)

type Status struct {
	Ready bool `json:"ready"`
}

func WriteStatus(w http.ResponseWriter) {
	borgo.JSON(w, http.StatusOK, Status{Ready: true})
}
