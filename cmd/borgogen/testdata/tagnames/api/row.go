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

// json.Marshal(Dashes{}) writes {"-":0,"keep":0}: only a tag that is exactly
// "-" excludes a field, and `json:"-,"` is the documented way to name one "-".
type Dashes struct {
	Named   int `json:"-,"`
	Dropped int `json:"-"`
	Keep    int `json:"keep"`
}

//borgo:route GET /api/dashes
func GetDashes(w http.ResponseWriter, r *http.Request) {
	borgo.JSON(w, http.StatusOK, Dashes{})
}

// A tag name encoding/json cannot use is no name at all to it: the field
// marshals under its Go name, and an embedded struct with one is flattened
// like an untagged one. json.Marshal(Invalid{}) writes
// {"Apos":"","Emoji":"","a b":"","inner":0}.
type Flat struct {
	Inner int `json:"inner"`
}

type Invalid struct {
	Apos  string `json:"who's"`
	Emoji string `json:"ok✅"`
	Space string `json:"a b"`
	Flat  `json:"br♥ken"`
}

//borgo:route GET /api/invalid
func GetInvalid(w http.ResponseWriter, r *http.Request) {
	borgo.JSON(w, http.StatusOK, Invalid{})
}
