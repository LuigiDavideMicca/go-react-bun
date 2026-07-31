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

// ,string quotes every one of these on the wire:
// {"b":"true","i":"1","f":"2.5","st":"\"x\"","p":"5"}
type Quoted struct {
	B  bool    `json:"b,string"`
	I  int     `json:"i,string"`
	F  float64 `json:"f,string"`
	St string  `json:"st,string"`
	P  *int    `json:"p,string"`
}

//borgo:route GET /api/rows
func Rows(w http.ResponseWriter, r *http.Request) {
	borgo.JSON(w, http.StatusOK, Row{})
}

//borgo:route GET /api/quoted
func Quotes(w http.ResponseWriter, r *http.Request) {
	borgo.JSON(w, http.StatusOK, Quoted{})
}
