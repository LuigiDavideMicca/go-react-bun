package api

import (
	"net/http"

	"github.com/LuigiDavideMicca/borgo"
)

// Both names shadow the generics this generator writes.
type Record struct {
	M map[string]int `json:"m"`
}

type Array struct {
	L []int `json:"l"`
}

//borgo:route GET /api/rec
func GetRec(w http.ResponseWriter, r *http.Request) {
	borgo.JSON(w, http.StatusOK, Record{})
}

//borgo:route GET /api/arr
func GetArr(w http.ResponseWriter, r *http.Request) {
	borgo.JSON(w, http.StatusOK, Array{})
}
