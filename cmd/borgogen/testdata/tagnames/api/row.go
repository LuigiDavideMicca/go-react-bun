package api

import (
	"net/http"

	"github.com/LuigiDavideMicca/borgo"
)

type Row struct {
	UserName string `json:"user-name"`
	Dotted   string `json:"a.b"`
	Digit    string `json:"1st"`
	Accented string `json:"città"`
	Plain    string `json:"plain_$1"`
}

//borgo:route GET /api/rows
func Rows(w http.ResponseWriter, r *http.Request) {
	borgo.JSON(w, http.StatusOK, Row{})
}
